/**
 * Deep probe: absence tagging + employee person resolution.
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
  const absenceListId = 'aec34590-5500-4c37-a38c-fe8f7176c383';

  const cols = await g(`/sites/${encodeURIComponent(siteId)}/lists/${listId}/columns?$top=200`);
  const choiceCols = (cols.body.value || [])
    .filter((c) => c.choice)
    .map((c) => ({ name: c.name, displayName: c.displayName, choices: c.choice.choices }));

  const filters = [
    "fields/AbsenceReason ne null",
    "fields/Disciplinary_x0020_or_x0020_Meet eq 'Absence'",
    "fields/Disciplinary_x0020_or_x0020_Meet eq 'Record of Absence'",
    "fields/Disciplinary_x002f_Meeting_x0020 eq 'Record of Absence'",
    "fields/Reason_x0020_for_x0020_Disciplin eq 'Absence'",
    "fields/Title eq 'Record of Absence'",
  ];
  const filterResults = {};
  for (const filter of filters) {
    const r = await g(
      `/sites/${encodeURIComponent(siteId)}/lists/${listId}/items?$expand=fields&$top=5&$filter=${encodeURIComponent(filter)}`,
      prefer,
    );
    filterResults[filter] = {
      status: r.status,
      count: (r.body.value || []).length,
      error: r.body.error && r.body.error.message,
      sample: (r.body.value || []).slice(0, 2).map((item) => {
        const fields = { ...(item.fields || {}) };
        delete fields['@odata.etag'];
        return { id: item.id, fields };
      }),
    };
  }

  const one = await g(`/sites/${encodeURIComponent(siteId)}/lists/${listId}/items/3?$expand=fields`);
  const empLookup = one.body.fields && one.body.fields.Employee_x0020_Name_x003f_LookupId;

  const userInfo = await g(
    `/sites/${encodeURIComponent(siteId)}/lists?$filter=${encodeURIComponent("displayName eq 'User Information List'")}`,
  );
  let resolvedEmployee = null;
  if (empLookup && userInfo.status === 200 && userInfo.body.value && userInfo.body.value[0]) {
    const uList = userInfo.body.value[0].id;
    const u = await g(
      `/sites/${encodeURIComponent(siteId)}/lists/${uList}/items/${empLookup}?$expand=fields`,
    );
    if (u.status === 200) {
      const f = u.body.fields || {};
      resolvedEmployee = {
        lookupId: empLookup,
        name: f.Title,
        email: f.EMail || f.Email || f.UserName || null,
        sip: f.SipAddress || null,
      };
    } else {
      resolvedEmployee = {
        lookupId: empLookup,
        status: u.status,
        error: u.body.error && u.body.error.message,
      };
    }
  }

  let next = `/sites/${encodeURIComponent(siteId)}/lists/${listId}/items?$expand=fields&$top=200`;
  const typeSet = {};
  const outcomeSet = {};
  const reasonSet = {};
  const absenceReasonSet = {};
  let scanned = 0;
  let withAbsenceReason = 0;
  let withLoyalty = 0;
  const loyaltySamples = [];
  for (let i = 0; i < 8 && next; i += 1) {
    const pagePath = next.startsWith('http')
      ? next.replace('https://graph.microsoft.com/v1.0', '')
      : next;
    const page = await g(pagePath);
    if (page.status !== 200) break;
    for (const item of page.body.value || []) {
      scanned += 1;
      const f = item.fields || {};
      if (f.Disciplinary_x0020_or_x0020_Meet) {
        typeSet[f.Disciplinary_x0020_or_x0020_Meet] = (typeSet[f.Disciplinary_x0020_or_x0020_Meet] || 0) + 1;
      }
      if (f.Disciplinary_x002f_Meeting_x0020) {
        outcomeSet[f.Disciplinary_x002f_Meeting_x0020] = (outcomeSet[f.Disciplinary_x002f_Meeting_x0020] || 0) + 1;
      }
      if (f.Reason_x0020_for_x0020_Disciplin) {
        reasonSet[f.Reason_x0020_for_x0020_Disciplin] = (reasonSet[f.Reason_x0020_for_x0020_Disciplin] || 0) + 1;
      }
      if (f.AbsenceReason) {
        absenceReasonSet[f.AbsenceReason] = (absenceReasonSet[f.AbsenceReason] || 0) + 1;
        withAbsenceReason += 1;
      }
      const loyalty = Number(f.Is_x0020_a_x0020_loyalty_x0020_b) || 0;
      if (loyalty > 0) {
        withLoyalty += 1;
        if (loyaltySamples.length < 5) {
          loyaltySamples.push({
            id: item.id,
            date: f.Date_x0020_of_x0020_Disciplinary,
            loyalty,
            type: f.Disciplinary_x0020_or_x0020_Meet,
            outcome: f.Disciplinary_x002f_Meeting_x0020,
            reason: f.Reason_x0020_for_x0020_Disciplin,
            absenceReason: f.AbsenceReason || null,
            title: f.Title || null,
            employeeLookupId: f.Employee_x0020_Name_x003f_LookupId || null,
          });
        }
      }
    }
    next = page.body['@odata.nextLink'] || null;
  }

  const absCols = await g(`/sites/${encodeURIComponent(siteId)}/lists/${absenceListId}/columns?$top=100`);
  const absItems = await g(
    `/sites/${encodeURIComponent(siteId)}/lists/${absenceListId}/items?$expand=fields&$top=5&$orderby=createdDateTime desc`,
  );
  const absInteresting = (absCols.body.value || [])
    .filter((c) => !c.readOnly)
    .map((c) => ({
      name: c.name,
      displayName: c.displayName,
      type: c.choice ? 'choice'
        : c.dateTime ? 'date'
          : c.personOrGroup ? 'person'
            : c.currency ? 'currency'
              : c.number ? 'number'
                : 'other',
      choices: c.choice && c.choice.choices,
    }));

  const report = {
    choiceCols,
    filterResults,
    resolvedEmployee,
    scan: {
      scanned,
      withAbsenceReason,
      withLoyalty,
      typeSet,
      outcomeSet,
      reasonSet,
      absenceReasonSet,
      loyaltySamples,
    },
    absenceReportLog: {
      columns: absInteresting,
      itemsStatus: absItems.status,
      itemCount: (absItems.body.value || []).length,
      samples: (absItems.body.value || []).slice(0, 3).map((item) => {
        const fields = { ...(item.fields || {}) };
        delete fields['@odata.etag'];
        return { id: item.id, created: item.createdDateTime, fields };
      }),
    },
  };

  fs.writeFileSync(path.join(__dirname, 'probe-dpl-deep.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
