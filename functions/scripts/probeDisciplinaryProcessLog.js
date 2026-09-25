/**
 * One-off probe: can the Graph app read Disciplinary Process Log?
 * Run: node functions/scripts/probeDisciplinaryProcessLog.js
 */
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
const envText = fs.readFileSync(envPath, 'utf8');
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (!m) continue;
  env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
}

const tenantId = env.MS_GRAPH_TENANT_ID;
const clientId = env.MS_GRAPH_CLIENT_ID;
const clientSecret = env.MS_GRAPH_CLIENT_SECRET;

function redactEmail(value) {
  const text = String(value || '');
  return text.replace(
    /([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
    (_, local, domain) => `${local.slice(0, 2)}***@${domain}`,
  );
}

function redactFields(fields) {
  const out = {};
  for (const [key, value] of Object.entries(fields || {})) {
    if (key.startsWith('@') || key === 'id') continue;
    if (value && typeof value === 'object') {
      out[key] = JSON.parse(redactEmail(JSON.stringify(value)));
    } else {
      out[key] = typeof value === 'string' ? redactEmail(value) : value;
    }
  }
  return out;
}

async function graph(token, method, urlPath, headers = {}) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...headers,
    },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

async function main() {
  if (!tenantId || !clientId || !clientSecret) {
    console.log(JSON.stringify({ ok: false, error: 'Missing MS_GRAPH_* in functions/.env' }, null, 2));
    process.exit(1);
  }

  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    },
  );
  const tokenData = await tokenRes.json();
  if (!tokenRes.ok) {
    console.log(JSON.stringify({ ok: false, stage: 'token', status: tokenRes.status, error: tokenData }, null, 2));
    process.exit(1);
  }

  const payload = JSON.parse(Buffer.from(tokenData.access_token.split('.')[1], 'base64').toString());
  const roles = payload.roles || [];
  const token = tokenData.access_token;

  const site = await graph(token, 'GET', '/sites/countrylion.sharepoint.com:/sites/HR');
  if (site.status !== 200) {
    console.log(JSON.stringify({ ok: false, stage: 'site', roles, status: site.status, error: site.body }, null, 2));
    process.exit(1);
  }
  const siteId = site.body.id;

  const lists = await graph(token, 'GET', `/sites/${encodeURIComponent(siteId)}/lists?$top=200`);
  if (lists.status !== 200) {
    console.log(JSON.stringify({
      ok: false,
      stage: 'lists',
      roles,
      status: lists.status,
      error: lists.body,
    }, null, 2));
    process.exit(1);
  }

  const allLists = lists.body.value || [];
  const matchingLists = allLists
    .filter((l) => /disciplin|absence|process.?log/i.test(`${l.displayName} ${l.name}`))
    .map((l) => ({
      id: l.id,
      name: l.name,
      displayName: l.displayName,
      webUrl: l.webUrl,
    }));

  const byName = await graph(
    token,
    'GET',
    `/sites/${encodeURIComponent(siteId)}/lists/${encodeURIComponent('Disciplinary Process Log')}`,
  );

  const preferred = allLists.find((l) => l.name === 'Disciplinary Process Log'
    || l.displayName === 'Disciplinary Process Log');
  const list = preferred || (byName.status === 200 ? byName.body : null);

  const report = {
    ok: Boolean(list),
    roles,
    siteOk: true,
    listCount: allLists.length,
    matchingLists,
    byNameStatus: byName.status,
    resolvedList: list
      ? { id: list.id, name: list.name, displayName: list.displayName, webUrl: list.webUrl }
      : null,
  };

  if (!list) {
    report.sampleListNames = allLists.slice(0, 40).map((l) => ({
      name: l.name,
      displayName: l.displayName,
    }));
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  }

  const cols = await graph(
    token,
    'GET',
    `/sites/${encodeURIComponent(siteId)}/lists/${encodeURIComponent(list.id)}/columns?$top=200`,
  );
  report.columnsStatus = cols.status;
  if (cols.status === 200) {
    report.columns = (cols.body.value || []).map((c) => ({
      name: c.name,
      displayName: c.displayName,
      readOnly: Boolean(c.readOnly),
      type: c.text ? 'text'
        : c.choice ? 'choice'
          : c.dateTime ? 'dateTime'
            : c.number ? 'number'
              : c.personOrGroup ? 'personOrGroup'
                : c.lookup ? 'lookup'
                  : c.boolean ? 'boolean'
                    : c.currency ? 'currency'
                      : 'other',
    }));
  } else {
    report.columnsError = cols.body;
  }

  const items = await graph(
    token,
    'GET',
    `/sites/${encodeURIComponent(siteId)}/lists/${encodeURIComponent(list.id)}/items?$expand=fields&$top=25&$orderby=createdDateTime desc`,
  );
  report.itemsStatus = items.status;
  if (items.status !== 200) {
    report.itemsError = items.body;
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  }

  const sample = (items.body.value || []).map((item) => ({
    id: item.id,
    created: item.createdDateTime,
    fields: redactFields(item.fields),
  }));
  report.sampleItemCount = sample.length;
  report.sampleItems = sample.slice(0, 5);
  report.fieldKeysUnion = [...new Set(sample.flatMap((s) => Object.keys(s.fields)))].sort();

  const preferHeader = { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' };
  const filterPath = `/sites/${encodeURIComponent(siteId)}/lists/${encodeURIComponent(list.id)}`
    + `/items?$expand=fields&$top=25&$filter=fields/Title eq 'Record of Absence'`;
  const filtered = await graph(token, 'GET', filterPath, preferHeader);
  report.absenceFilterStatus = filtered.status;
  if (filtered.status === 200) {
    report.absenceSampleCount = (filtered.body.value || []).length;
    report.absenceSamples = (filtered.body.value || []).slice(0, 8).map((item) => ({
      id: item.id,
      created: item.createdDateTime,
      fields: redactFields(item.fields),
    }));
  } else {
    report.absenceFilterError = filtered.body;
  }

  // Pull a larger page and classify Titles / Disciplinary choice locally
  const page = await graph(
    token,
    'GET',
    `/sites/${encodeURIComponent(siteId)}/lists/${encodeURIComponent(list.id)}/items?$expand=fields&$top=100&$orderby=createdDateTime desc`,
  );
  report.pageStatus = page.status;
  if (page.status === 200) {
    const pageItems = page.body.value || [];
    const titleCounts = {};
    const meetingCounts = {};
    const loyaltyKeys = new Set();
    for (const item of pageItems) {
      const f = item.fields || {};
      const title = f.Title || f.LinkTitle || '';
      if (title) titleCounts[title] = (titleCounts[title] || 0) + 1;
      for (const [k, v] of Object.entries(f)) {
        if (/loyalty|deduct|absence|employee|staff|name|date|meeting|disciplin/i.test(k)) {
          loyaltyKeys.add(`${k}=${typeof v}`);
        }
      }
      const meeting = f.Disciplinary_x002f_Meeting_x0020
        || f.Disciplinary_x002f_Meeting
        || f['Disciplinary/Meeting']
        || '';
      if (meeting) meetingCounts[String(meeting)] = (meetingCounts[String(meeting)] || 0) + 1;
    }
    report.pageItemCount = pageItems.length;
    report.titleCountsInPage = titleCounts;
    report.meetingTypeCountsInPage = meetingCounts;
    report.interestingFieldTypes = [...loyaltyKeys].sort();
    const absenceLike = pageItems.filter((item) => {
      const title = String(item.fields?.Title || item.fields?.LinkTitle || '');
      return /absence/i.test(title);
    });
    report.absenceLikeInPage = absenceLike.length;
    report.absenceLikeSamples = absenceLike.slice(0, 5).map((item) => ({
      id: item.id,
      created: item.createdDateTime,
      fields: redactFields(item.fields),
    }));
  }

  // Also scan recent items for Title / Disciplinary choice values
  const titles = {};
  const meetingTypes = {};
  for (const item of sample) {
    const title = item.fields.Title || item.fields.LinkTitle || '';
    if (title) titles[title] = (titles[title] || 0) + 1;
    const meeting = item.fields.Disciplinary_x002f_Meeting_x0020
      || item.fields['Disciplinary/Meeting']
      || item.fields.Disciplinary_x002f_Meeting
      || '';
    if (meeting) meetingTypes[meeting] = (meetingTypes[meeting] || 0) + 1;
  }
  report.titleCountsInSample = titles;
  report.meetingTypeCountsInSample = meetingTypes;

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
