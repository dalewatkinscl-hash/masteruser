/**
 * Sample Record of Absence rows: loyalty amounts + email match readiness.
 */
const fs = require('fs');
const path = require('path');

const env = {};
for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
}

async function main() {
  const tokenRes = await fetch(
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
  const { access_token: token } = await tokenRes.json();
  const prefer = { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' };

  async function g(urlPath, headers = {}) {
    const res = await fetch(`https://graph.microsoft.com/v1.0${urlPath}`, {
      headers: { Authorization: `Bearer ${token}`, ...headers },
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

  const site = await g('/sites/countrylion.sharepoint.com:/sites/HR');
  const siteId = site.body.id;
  const listId = '13465763-fd01-4ada-9a99-f4bf74d18387';

  const userInfo = await g(
    `/sites/${encodeURIComponent(siteId)}/lists?$filter=${encodeURIComponent("displayName eq 'User Information List'")}`,
  );
  const userListId = userInfo.body.value[0].id;

  const personCache = new Map();
  async function resolvePerson(lookupId) {
    if (!lookupId) return null;
    if (personCache.has(lookupId)) return personCache.get(lookupId);
    const u = await g(
      `/sites/${encodeURIComponent(siteId)}/lists/${userListId}/items/${lookupId}?$expand=fields`,
    );
    if (u.status !== 200) {
      const miss = { lookupId, error: u.body.error && u.body.error.message };
      personCache.set(lookupId, miss);
      return miss;
    }
    const f = u.body.fields || {};
    const person = {
      lookupId,
      name: f.Title || null,
      email: f.EMail || f.Email || f.UserName || null,
    };
    personCache.set(lookupId, person);
    return person;
  }

  const filter = "fields/Disciplinary_x0020_or_x0020_Meet eq 'Record of Absence'";
  let next = `/sites/${encodeURIComponent(siteId)}/lists/${listId}/items?$expand=fields&$top=50&$filter=${encodeURIComponent(filter)}`;
  const loyaltyAmounts = {};
  const samples = [];
  let scanned = 0;
  let withLoyalty = 0;
  let withZeroLoyalty = 0;
  let missingEmployee = 0;
  let missingDate = 0;

  while (next && scanned < 200) {
    const pagePath = next.startsWith('http')
      ? next.replace('https://graph.microsoft.com/v1.0', '')
      : next;
    const page = await g(pagePath, prefer);
    if (page.status !== 200) {
      console.log(JSON.stringify({ error: page.body }, null, 2));
      process.exit(1);
    }
    for (const item of page.body.value || []) {
      scanned += 1;
      const f = item.fields || {};
      const loyalty = Number(f.Is_x0020_a_x0020_loyalty_x0020_b);
      const loyaltyVal = Number.isFinite(loyalty) ? loyalty : null;
      if (loyaltyVal == null) {
        // skip
      } else if (loyaltyVal > 0) {
        withLoyalty += 1;
        loyaltyAmounts[loyaltyVal] = (loyaltyAmounts[loyaltyVal] || 0) + 1;
      } else {
        withZeroLoyalty += 1;
      }
      if (!f.Employee_x0020_Name_x003f_LookupId) missingEmployee += 1;
      if (!f.Date_x0020_of_x0020_Disciplinary) missingDate += 1;

      if (samples.length < 8) {
        const person = await resolvePerson(f.Employee_x0020_Name_x003f_LookupId);
        samples.push({
          id: item.id,
          date: f.Date_x0020_of_x0020_Disciplinary || null,
          loyalty: loyaltyVal,
          absenceReason: f.AbsenceReason || null,
          outcome: f.Disciplinary_x002f_Meeting_x0020 || null,
          employee: person,
        });
      }
    }
    next = page.body['@odata.nextLink'] || null;
  }

  console.log(JSON.stringify({
    scanned,
    withLoyalty,
    withZeroLoyalty,
    missingEmployee,
    missingDate,
    loyaltyAmountHistogram: loyaltyAmounts,
    samples,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
