/**
 * One-off: fix fact-finding cases stuck on pending_employee after interview notes.
 * Uses Firebase CLI login tokens from ~/.config/configstore/firebase-tools.json.
 *
 * Usage (from repo root):
 *   node functions/scripts/fixFactFindingNotesStatus.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');

const PROJECT_ID = 'master-user-management';
const FIREBASE_CLI_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const FIREBASE_CLI_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

function requestJson(method, url, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request({
      method,
      hostname: parsed.hostname,
      path: `${parsed.pathname}${parsed.search}`,
      headers: {
        ...headers,
        ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}),
      },
    }, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = raw ? JSON.parse(raw) : null; } catch { json = { raw }; }
        if (res.statusCode >= 400) {
          reject(new Error(`${method} ${url} → ${res.statusCode}: ${raw.slice(0, 500)}`));
          return;
        }
        resolve(json);
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function loadFirebaseTokens() {
  const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  const raw = fs.readFileSync(configPath, 'utf8');
  const config = JSON.parse(raw);
  const tokens = config?.tokens || {};
  if (!tokens.refresh_token && !tokens.access_token) {
    throw new Error('No Firebase CLI tokens found. Run firebase login.');
  }
  return tokens;
}

async function getAccessToken(tokens) {
  const expiresAt = Number(tokens.expires_at || 0);
  if (tokens.access_token && expiresAt > Date.now() + 60_000) {
    return tokens.access_token;
  }
  if (!tokens.refresh_token) {
    throw new Error('Firebase CLI access token expired and no refresh token is available.');
  }
  const body = new URLSearchParams({
    client_id: FIREBASE_CLI_CLIENT_ID,
    client_secret: FIREBASE_CLI_CLIENT_SECRET,
    refresh_token: tokens.refresh_token,
    grant_type: 'refresh_token',
  }).toString();

  const token = await new Promise((resolve, reject) => {
    const req = https.request({
      method: 'POST',
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        const json = JSON.parse(raw || '{}');
        if (!json.access_token) {
          reject(new Error(`Token refresh failed: ${raw.slice(0, 300)}`));
          return;
        }
        resolve(json.access_token);
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
  return token;
}

function docFields(doc) {
  return doc?.fields || {};
}

function fieldString(fields, key) {
  return fields?.[key]?.stringValue || '';
}

function fieldTimestamp(fields, key) {
  return fields?.[key]?.timestampValue || null;
}

async function runStructuredQuery(accessToken, query) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
  const rows = await requestJson('POST', url, { Authorization: `Bearer ${accessToken}` }, JSON.stringify(query));
  return (rows || []).filter((row) => row.document).map((row) => row.document);
}

async function patchDocument(accessToken, docName, fields, updateMask) {
  const mask = updateMask.map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');
  const url = `https://firestore.googleapis.com/v1/${docName}?${mask}`;
  return requestJson('PATCH', url, { Authorization: `Bearer ${accessToken}` }, JSON.stringify({ fields }));
}

async function main() {
  const tokens = loadFirebaseTokens();
  const accessToken = await getAccessToken(tokens);

  const caseDocs = await runStructuredQuery(accessToken, {
    structuredQuery: {
      from: [{ collectionId: 'disciplinary_cases' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'status' },
          op: 'EQUAL',
          value: { stringValue: 'pending_employee' },
        },
      },
    },
  });

  const candidates = [];
  for (const doc of caseDocs) {
    const fields = docFields(doc);
    const family = fieldString(fields, 'processFamily') || 'disciplinary';
    const stage = fieldString(fields, 'stage').toLowerCase();
    const isFactFinding = family === 'disciplinary'
      && ['fact_finding', 'intake', 'investigation', 'minutes_signoff', ''].includes(stage);
    if (!isFactFinding) continue;
    if (fieldTimestamp(fields, 'hearingInviteIssuedAt')) continue;

    const caseId = doc.name.split('/').pop();
    const minutesDocs = await runStructuredQuery(accessToken, {
      structuredQuery: {
        from: [{ collectionId: 'case_minutes' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'caseId' },
            op: 'EQUAL',
            value: { stringValue: caseId },
          },
        },
        limit: 1,
      },
    });
    if (!minutesDocs.length) continue;

    const minutesFields = docFields(minutesDocs[0]);
    const issuedAt = fieldTimestamp(minutesFields, 'issuedAt') || new Date().toISOString();
    candidates.push({
      name: doc.name,
      id: caseId,
      employeeName: fieldString(fields, 'employeeName'),
      title: fieldString(fields, 'title'),
      stage: fieldString(fields, 'stage'),
      issuedAt,
    });
  }

  console.log(`Found ${candidates.length} fact-finding case(s) to fix:`);
  for (const item of candidates) {
    console.log(` - ${item.id} · ${item.employeeName || item.title || '(no name)'} · stage=${item.stage}`);
  }

  if (!candidates.length) return;

  const nowIso = new Date().toISOString();
  for (const item of candidates) {
    await patchDocument(accessToken, item.name, {
      status: { stringValue: 'open' },
      interviewNotesIssuedAt: { timestampValue: item.issuedAt },
      updatedAt: { timestampValue: nowIso },
    }, ['status', 'interviewNotesIssuedAt', 'updatedAt']);
    console.log(`Updated ${item.id}`);
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
