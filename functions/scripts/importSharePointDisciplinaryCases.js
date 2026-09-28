'use strict';

/**
 * Import legacy Disciplinary / Meeting rows from SharePoint Disciplinary Process Log
 * into closed disciplinary_cases (last 12 months, active portal employees only).
 *
 * From repo root:
 *   node functions/scripts/importSharePointDisciplinaryCases.js --dry-run
 *   node functions/scripts/importSharePointDisciplinaryCases.js --apply
 *
 * Requires functions/.env Graph credentials.
 * Firestore auth: firebase-tools.json access token (CLI login).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const PROJECT_ID = 'master-user-management';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const DISCIPLINARY_PROCESS_LOG_LIST_ID = '13465763-fd01-4ada-9a99-f4bf74d18387';
const DATE_FIELD = 'Date_x0020_of_x0020_Disciplinary';
const TYPE_FIELD = 'Disciplinary_x0020_or_x0020_Meet';
const OUTCOME_FIELD = 'Disciplinary_x002f_Meeting_x0020';
const REASON_FIELD = 'Reason_x0020_for_x0020_Disciplin';
const EMPLOYEE_LOOKUP_FIELD = 'Employee_x0020_Name_x003f_LookupId';

const IMPORT_TYPES = new Set(['Disciplinary', 'Meeting']);
const EXCLUDED_EMAILS = new Set([
  'matthewheavens@countrylion.co.uk',
  'garethwilliams@countrylion.co.uk',
  'tarahiggins@countrylion.co.uk',
  'garymarks@countrylion.co.uk',
  'shanecarpenter@countrylion.co.uk',
  'pauljames@countrylion.co.uk',
  'mohsenshahi@countrylion.co.uk',
  'calinurr@countrylion.co.uk',
  'alicedunning@countrylion.co.uk',
]);
const EXCLUDED_NAMES = new Set([
  'matthew heavens',
  'gareth williams',
  'tara higgins',
  'gary marks',
  'shane carpenter',
  'paul james',
  'mohsen shahi',
  'cali nurr',
  'alice dunning',
]);

const OUTCOME_MAP = {
  'File Note': 'file_note_for_improvement',
  'Verbal Warning': 'verbal_warning',
  'Written Warning': 'written_warning',
  'Final Written Warning': 'final_written_warning',
  Dismissal: 'dismissal',
  'No Further Action': 'no_further_action',
};

const WARNING_MONTHS = {
  verbal_warning: 6,
  written_warning: 6,
  final_written_warning: 12,
};

const IMPORTER_UID = 'R42J0IYo6OR9QvVEXcyVYCpZ8EF3';
const IMPORTER_NAME = 'Dale Watkins';

function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env');
  const env = {};
  if (!fs.existsSync(envPath)) return env;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

function getFirebaseAccessToken() {
  const toolsPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  if (!fs.existsSync(toolsPath)) {
    throw new Error(`Missing firebase-tools login at ${toolsPath}`);
  }
  const cfg = JSON.parse(fs.readFileSync(toolsPath, 'utf8'));
  const token = cfg.tokens && cfg.tokens.access_token;
  if (!token) throw new Error('firebase-tools.json has no access_token — run firebase login');
  return token;
}

async function firestoreFetch(token, urlPath, options = {}) {
  const res = await fetch(`${FIRESTORE_BASE}${urlPath}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Firestore ${res.status} ${urlPath}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function listCollection(token, collectionId) {
  const docs = [];
  let pageToken = '';
  do {
    const qs = `?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const body = await firestoreFetch(token, `/${collectionId}${qs}`);
    for (const doc of body.documents || []) {
      docs.push({
        id: doc.name.split('/').pop(),
        fields: doc.fields || {},
      });
    }
    pageToken = body.nextPageToken || '';
  } while (pageToken);
  return docs;
}

function readString(fields, key) {
  const v = fields[key];
  if (!v) return '';
  if (v.stringValue != null) return String(v.stringValue);
  if (v.integerValue != null) return String(v.integerValue);
  if (v.booleanValue != null) return String(v.booleanValue);
  return '';
}

function readBool(fields, key, defaultValue = true) {
  const v = fields[key];
  if (!v || v.booleanValue === undefined) return defaultValue;
  return Boolean(v.booleanValue);
}

function readMapString(fields, mapKey, childKey) {
  const map = fields[mapKey] && fields[mapKey].mapValue && fields[mapKey].mapValue.fields;
  if (!map) return '';
  return readString(map, childKey);
}

function toFirestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return { integerValue: String(value) };
    return { doubleValue: value };
  }
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map((item) => toFirestoreValue(item)) } };
  }
  if (typeof value === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(value)) {
      fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

function toFirestoreDocument(data) {
  const fields = {};
  for (const [key, value] of Object.entries(data)) {
    fields[key] = toFirestoreValue(value);
  }
  return { fields };
}

async function createDocument(token, collectionId, data) {
  const body = await firestoreFetch(token, `/${collectionId}`, {
    method: 'POST',
    body: JSON.stringify(toFirestoreDocument(data)),
  });
  return body.name.split('/').pop();
}

async function patchDocument(token, collectionId, docId, data) {
  const fieldPaths = Object.keys(data);
  const qs = fieldPaths.map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');
  await firestoreFetch(token, `/${collectionId}/${docId}?${qs}`, {
    method: 'PATCH',
    body: JSON.stringify(toFirestoreDocument(data)),
  });
}

async function runQueryOriginSharepoint(token) {
  // Structured query for origin == sharepoint_import
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'disciplinary_cases' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'origin' },
              op: 'EQUAL',
              value: { stringValue: 'sharepoint_import' },
            },
          },
        },
      }),
    },
  );
  const rows = await res.json();
  if (!res.ok) throw new Error(`runQuery failed: ${JSON.stringify(rows)}`);
  const out = [];
  for (const row of rows) {
    if (!row.document) continue;
    out.push({
      id: row.document.name.split('/').pop(),
      fields: row.document.fields || {},
    });
  }
  return out;
}

function toIsoDate(value) {
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function addMonths(isoDate, months) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

function formatUkDate(isoDate) {
  if (!isoDate || isoDate.length < 10) return '';
  const [y, m, d] = isoDate.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function caseTypeForReason(reason) {
  const r = String(reason || '').toLowerCase();
  if (r === 'attendance' || r === 'lateness' || r === 'missed clocks') return 'attendance';
  if (r === 'driver behaviour' || r === 'conduct' || r === 'gross misconduct') return 'conduct';
  if (r === 'work performance') return 'performance';
  return 'other';
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function rowsToCsv(rows, columns) {
  const header = columns.join(',');
  const lines = rows.map((row) => columns.map((col) => csvEscape(row[col])).join(','));
  return `${header}\n${lines.join('\n')}\n`;
}

async function getGraphAccessToken(env) {
  const res = await fetch(
    `https://login.microsoftonline.com/${env.MS_GRAPH_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.MS_GRAPH_CLIENT_ID,
        client_secret: env.MS_GRAPH_CLIENT_SECRET,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    },
  );
  const body = await res.json();
  if (!body.access_token) {
    throw new Error(`Graph token failed: ${JSON.stringify(body)}`);
  }
  return body.access_token;
}

async function graph(token, urlPath) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${urlPath}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly',
    },
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Graph ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function listSharePointCandidates(token, cutoffIso) {
  const site = await graph(token, '/sites/countrylion.sharepoint.com:/sites/HR');
  const siteId = site.id;
  const uil = await graph(
    token,
    `/sites/${encodeURIComponent(siteId)}/lists?$filter=${encodeURIComponent("displayName eq 'User Information List'")}`,
  );
  const uListId = uil.value && uil.value[0] && uil.value[0].id;
  const personCache = new Map();

  async function resolvePerson(lookupId) {
    if (!lookupId || !uListId) return null;
    const key = String(lookupId);
    if (personCache.has(key)) return personCache.get(key);
    try {
      const item = await graph(
        token,
        `/sites/${encodeURIComponent(siteId)}/lists/${uListId}/items/${key}?$expand=fields`,
      );
      const f = item.fields || {};
      const person = {
        name: f.Title || null,
        email: String(f.EMail || f.Email || f.UserName || '')
          .toLowerCase()
          .trim() || null,
      };
      personCache.set(key, person);
      return person;
    } catch {
      personCache.set(key, null);
      return null;
    }
  }

  const rows = [];
  let next = `/sites/${encodeURIComponent(siteId)}/lists/${DISCIPLINARY_PROCESS_LOG_LIST_ID}/items?$expand=fields&$top=200`;
  let scanned = 0;

  while (next) {
    const page = await graph(token, next);
    for (const item of page.value || []) {
      scanned += 1;
      const fields = item.fields || {};
      const type = String(fields[TYPE_FIELD] || '').trim();
      if (!IMPORT_TYPES.has(type)) continue;
      const eventDate = toIsoDate(fields[DATE_FIELD]);
      if (!eventDate || eventDate < cutoffIso) continue;

      const lookupId = fields[EMPLOYEE_LOOKUP_FIELD] != null
        ? String(fields[EMPLOYEE_LOOKUP_FIELD])
        : '';
      const person = lookupId ? await resolvePerson(lookupId) : null;
      const notes = String(fields.Notes || '').trim();
      const outcome = String(fields[OUTCOME_FIELD] || '').trim();
      const reason = String(fields[REASON_FIELD] || '').trim();

      rows.push({
        sharePointItemId: String(item.id),
        eventDate,
        spType: type,
        spOutcome: outcome || '(blank)',
        spReason: reason || '(blank)',
        notes,
        employeeLookupId: lookupId,
        spName: (person && person.name) || '',
        spEmail: (person && person.email) || '',
        webUrl: item.webUrl || '',
      });
    }
    const link = page['@odata.nextLink'];
    next = link ? link.replace('https://graph.microsoft.com/v1.0', '') : '';
    if (scanned > 8000) break;
  }

  rows.sort((a, b) => b.eventDate.localeCompare(a.eventDate));
  return { rows, scanned };
}

function matchEmployee(row, usersByEmail, usersByUid, lookupMap, users) {
  if (row.employeeLookupId && lookupMap.has(row.employeeLookupId)) {
    const uid = lookupMap.get(row.employeeLookupId);
    const user = usersByUid.get(uid);
    if (user) return { method: 'lookup_map', user };
  }
  if (row.spEmail && usersByEmail.has(row.spEmail)) {
    return { method: 'email', user: usersByEmail.get(row.spEmail) };
  }
  if (row.spName) {
    const target = normalizeName(row.spName);
    const fuzzy = users.filter((u) => {
      const n = normalizeName(u.fullName);
      return n && (n === target || n.includes(target) || target.includes(n));
    });
    if (fuzzy.length === 1) return { method: 'name_fuzzy', user: fuzzy[0] };
    if (fuzzy.length > 1) {
      return { method: null, user: null, ambiguous: fuzzy };
    }
  }
  return { method: null, user: null };
}

function isExcludedPerson(row, user) {
  const email = String((user && user.email) || row.spEmail || '').toLowerCase().trim();
  const name = normalizeName((user && user.fullName) || row.spName || '');
  if (email && EXCLUDED_EMAILS.has(email)) return true;
  if (name && EXCLUDED_NAMES.has(name)) return true;
  return false;
}

function buildCasePayload(row, user) {
  const outcomePreset = OUTCOME_MAP[row.spOutcome] || '';
  const caseType = caseTypeForReason(row.spReason);
  const issue = row.spReason === '(blank)' ? row.spType : row.spReason;
  const employeeName = user.fullName || row.spName || 'Employee';
  const title = `${employeeName} - ${issue} - ${formatUkDate(row.eventDate)}`;
  const summaryParts = [
    `Legacy SharePoint ${row.spType}`,
    row.spOutcome && row.spOutcome !== '(blank)' ? `Outcome: ${row.spOutcome}` : '',
    row.notes || '',
  ].filter(Boolean);
  const warningMonths = WARNING_MONTHS[outcomePreset] || 0;
  const eventAt = new Date(`${row.eventDate}T12:00:00Z`);

  return {
    employeeUid: user.uid,
    employeeNameSnapshot: employeeName,
    departmentSnapshot: user.department || '',
    managerUid: IMPORTER_UID,
    ownerManagerUid: IMPORTER_UID,
    managerNameSnapshot: IMPORTER_NAME,
    processFamily: 'disciplinary',
    caseType,
    issue,
    title,
    summary: summaryParts.join('. '),
    status: 'closed',
    stage: 'closed',
    origin: 'sharepoint_import',
    sharePointItemId: row.sharePointItemId,
    sourceIncidentId: '',
    dueAt: '',
    slaDueAt: '',
    informalResolutionPath: 'proceed_formal',
    informalTried: true,
    informalNotes: 'Imported from SharePoint Disciplinary Process Log (legacy).',
    informalNotAppropriateReason: '',
    informalActionDetails: '',
    informalActionTakenAt: null,
    offPortalRaiseDate: '',
    offPortalRaiseNotes: '',
    eventDate: row.eventDate,
    processedOnSamsara: false,
    historyReviewedAt: eventAt,
    historyReviewedByUid: IMPORTER_UID,
    investigatorUid: IMPORTER_UID,
    hearingManagerUid: '',
    decisionMakerUid: IMPORTER_UID,
    appealOwnerUid: '',
    companionOffered: false,
    companionRequested: false,
    companionName: '',
    companionType: '',
    companionAttended: false,
    hearingPostponedTo: '',
    hearingScheduledAt: '',
    hearingScheduledTime: '',
    hearingLocation: '',
    hearingInviteNotes: '',
    hearingInviteIssuedAt: null,
    hearingInviteDocumentId: '',
    hearingInviteDeliveredInPerson: false,
    evidenceDocumentIds: [],
    precautionarySuspension: false,
    suspensionActive: false,
    suspensionFrom: '',
    suspensionTo: '',
    suspensionReason: '',
    dismissalPossible: outcomePreset === 'dismissal',
    publishedToEmployeeAt: null,
    publishedToEmployeeByUid: '',
    unpublishedFromEmployeeAt: null,
    unpublishedFromEmployeeByUid: '',
    outcomePreset,
    outcomeDetails: row.notes || `${row.spType}: ${row.spOutcome}`,
    outcomePackSteps: [],
    warningTitle: '',
    warningDurationMonths: warningMonths ? warningMonths : '',
    warningEffectiveAt: warningMonths ? row.eventDate : '',
    warningExpiresAt: warningMonths ? addMonths(row.eventDate, warningMonths) : '',
    appealWindowEndsAt: '',
    linkedDisciplinaryCaseId: '',
    linkedAccidentCaseId: '',
    trainingDecision: '',
    trainingOutline: '',
    closeNotes: `Imported from SharePoint item ${row.sharePointItemId}.`,
    closedByUid: IMPORTER_UID,
    closedByName: IMPORTER_NAME,
    openedAt: eventAt,
    closedAt: eventAt,
    appealedAt: null,
    createdByUid: IMPORTER_UID,
    createdByName: IMPORTER_NAME,
    updatedByUid: IMPORTER_UID,
    createdAt: eventAt,
    updatedAt: eventAt,
  };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const apply = args.has('--apply');
  if (apply && args.has('--dry-run')) {
    console.error('Use either --dry-run or --apply, not both.');
    process.exit(1);
  }

  const env = loadEnvFile();
  if (!env.MS_GRAPH_TENANT_ID || !env.MS_GRAPH_CLIENT_ID || !env.MS_GRAPH_CLIENT_SECRET) {
    throw new Error('Missing MS_GRAPH_* credentials in functions/.env');
  }

  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`Cutoff: ${cutoffIso}`);

  const graphToken = await getGraphAccessToken(env);
  const { rows, scanned } = await listSharePointCandidates(graphToken, cutoffIso);
  console.log(`SharePoint scanned=${scanned}, Disciplinary/Meeting in window=${rows.length}`);

  const fbToken = getFirebaseAccessToken();
  const userDocs = await listCollection(fbToken, 'users');
  const users = userDocs.map((doc) => ({
    uid: doc.id,
    email: readString(doc.fields, 'email').toLowerCase().trim(),
    fullName: readString(doc.fields, 'fullName'),
    isActive: readBool(doc.fields, 'isActive', true),
    department: readMapString(doc.fields, 'employeeProfile', 'department')
      || readString(doc.fields, 'department'),
  }));
  const usersByEmail = new Map();
  const usersByUid = new Map();
  for (const user of users) {
    usersByUid.set(user.uid, user);
    if (user.email) usersByEmail.set(user.email, user);
  }

  const lookupMap = new Map();
  try {
    const mapDocs = await listCollection(fbToken, 'bonus_sp_employee_map');
    for (const doc of mapDocs) {
      const lookup = readString(doc.fields, 'sharePointLookupId').trim();
      const uid = readString(doc.fields, 'employeeUid') || readString(doc.fields, 'uid');
      if (lookup && uid) lookupMap.set(lookup, uid);
    }
  } catch (error) {
    console.warn('bonus_sp_employee_map read skipped:', error.message);
  }

  const existingBySpId = new Map();
  try {
    const existing = await runQueryOriginSharepoint(fbToken);
    for (const doc of existing) {
      const spId = readString(doc.fields, 'sharePointItemId').trim();
      if (spId) existingBySpId.set(spId, doc.id);
    }
  } catch (error) {
    console.warn('Existing import query skipped:', error.message);
  }

  const importRows = [];
  const skipRows = [];

  for (const row of rows) {
    const match = matchEmployee(row, usersByEmail, usersByUid, lookupMap, users);
    if (isExcludedPerson(row, match.user)) {
      skipRows.push({
        ...row,
        action: 'skip',
        skipReason: 'excluded_person',
        portalUid: match.user ? match.user.uid : '',
        portalName: match.user ? match.user.fullName : '',
        portalActive: match.user ? match.user.isActive : '',
        matchMethod: match.method || '',
        outcomePreset: OUTCOME_MAP[row.spOutcome] || '',
        caseType: caseTypeForReason(row.spReason),
      });
      continue;
    }
    if (!match.user) {
      skipRows.push({
        ...row,
        action: 'skip',
        skipReason: match.ambiguous ? 'ambiguous_name' : 'unmatched',
        portalUid: '',
        portalName: '',
        portalActive: '',
        matchMethod: '',
        outcomePreset: OUTCOME_MAP[row.spOutcome] || '',
        caseType: caseTypeForReason(row.spReason),
      });
      continue;
    }
    if (!match.user.isActive) {
      skipRows.push({
        ...row,
        action: 'skip',
        skipReason: 'inactive',
        portalUid: match.user.uid,
        portalName: match.user.fullName,
        portalActive: false,
        matchMethod: match.method,
        outcomePreset: OUTCOME_MAP[row.spOutcome] || '',
        caseType: caseTypeForReason(row.spReason),
      });
      continue;
    }

    const already = existingBySpId.get(row.sharePointItemId);
    const payload = buildCasePayload(row, match.user);
    importRows.push({
      ...row,
      action: already ? 'already_imported' : 'import',
      skipReason: already ? `exists:${already}` : '',
      portalUid: match.user.uid,
      portalName: match.user.fullName,
      portalActive: true,
      matchMethod: match.method,
      outcomePreset: payload.outcomePreset,
      caseType: payload.caseType,
      title: payload.title,
      warningExpiresAt: payload.warningExpiresAt,
      existingCaseId: already || '',
      _payload: payload,
    });
  }

  const columns = [
    'action',
    'skipReason',
    'sharePointItemId',
    'eventDate',
    'spType',
    'spOutcome',
    'spReason',
    'spName',
    'spEmail',
    'portalUid',
    'portalName',
    'portalActive',
    'matchMethod',
    'outcomePreset',
    'caseType',
    'title',
    'warningExpiresAt',
    'existingCaseId',
  ];

  const outDir = path.join(__dirname, '..', 'tmp');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const csvPath = path.join(outDir, `sp-disciplinary-import-${stamp}.csv`);
  const allForCsv = [...importRows, ...skipRows].map((row) => {
    const copy = { ...row };
    delete copy._payload;
    delete copy.notes;
    delete copy.webUrl;
    return copy;
  });
  fs.writeFileSync(csvPath, rowsToCsv(allForCsv, columns));

  const toWrite = importRows.filter((r) => r.action === 'import');
  console.log(`CSV: ${csvPath}`);
  console.log(`Import: ${toWrite.length}`);
  console.log(`Already imported: ${importRows.filter((r) => r.action === 'already_imported').length}`);
  console.log(`Skip: ${skipRows.length}`);
  console.log('\nIMPORT LIST:');
  for (const row of toWrite) {
    console.log(
      `  ${row.eventDate} | ${row.spType} | ${row.spOutcome} | ${row.spReason} | ${row.portalName} | ${row.outcomePreset} | SP#${row.sharePointItemId}`,
    );
  }
  if (skipRows.length) {
    console.log('\nSKIP LIST:');
    for (const row of skipRows) {
      console.log(
        `  ${row.eventDate} | ${row.skipReason} | ${row.spType} | ${row.spOutcome} | ${row.spName || row.spEmail} | SP#${row.sharePointItemId}`,
      );
    }
  }

  if (!apply) {
    console.log('\nDry-run complete. Re-run with --apply to write cases.');
    return;
  }

  let created = 0;
  for (const row of toWrite) {
    const caseId = await createDocument(fbToken, 'disciplinary_cases', row._payload);
    const shortId = caseId.slice(0, 8);
    const folderName = `${row._payload.title} (${formatUkDate(row.eventDate).replace(/\//g, '-')}) (${shortId})`;
    await patchDocument(fbToken, 'disciplinary_cases', caseId, {
      sharePointCaseFolderName: folderName,
    });
    await createDocument(fbToken, 'disciplinary_case_events', {
      caseId,
      eventType: 'legacy_imported',
      payload: {
        sharePointItemId: row.sharePointItemId,
        spType: row.spType,
        spOutcome: row.spOutcome,
        spReason: row.spReason,
        eventDate: row.eventDate,
        matchMethod: row.matchMethod,
        outcomePreset: row.outcomePreset,
      },
      actorUid: IMPORTER_UID,
      actorName: IMPORTER_NAME,
      createdAt: new Date(),
    });
    created += 1;
    console.log(`Created ${caseId} <- SP#${row.sharePointItemId} (${row.portalName})`);
  }

  console.log(`\nApply complete. Created ${created} cases.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
