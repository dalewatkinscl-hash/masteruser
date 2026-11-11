'use strict';

/**
 * Fetch the few bonus_absence_deductions that the loyalty>0 SharePoint pass
 * skipped (often £0 now) and still amend their dates if Graph has the item.
 */

const fs = require('fs');
const path = require('path');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(__dirname, '..', '.env'));

const admin = require('firebase-admin');

const LIST_ID = '13465763-fd01-4ada-9a99-f4bf74d18387';
const DATE_FIELD = 'Date_x0020_of_x0020_Disciplinary';
const LOYALTY_FIELD = 'Is_x0020_a_x0020_loyalty_x0020_b';
const MISSING_IDS = ['1180', '1191', '1203', '1204', '1205', '1206'];

admin.initializeApp({ projectId: 'master-user-management' });
const db = admin.firestore();

function toIsoDateFromSharePoint(value) {
  if (!value) return '';
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(parsed);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) return '';
  return `${year}-${month}-${day}`;
}

async function getToken() {
  const response = await fetch(
    `https://login.microsoftonline.com/${process.env.MS_GRAPH_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.MS_GRAPH_CLIENT_ID,
        client_secret: process.env.MS_GRAPH_CLIENT_SECRET,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || data.error || 'token failed');
  return data.access_token;
}

async function getSiteId(token) {
  const response = await fetch(
    'https://graph.microsoft.com/v1.0/sites/countrylion.sharepoint.com:/sites/HR',
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(data));
  return data.id;
}

(async () => {
  const token = await getToken();
  const siteId = await getSiteId(token);
  let amended = 0;

  for (const itemId of MISSING_IDS) {
    const docId = `sp_${itemId}`;
    const doc = await db.collection('bonus_absence_deductions').doc(docId).get();
    if (!doc.exists) {
      console.log(`${docId}: not in Firestore`);
      continue;
    }
    const current = doc.data() || {};
    const currentDate = String(current.eventDate || current.absenceDate || '').slice(0, 10);

    const response = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(siteId)}/lists/${LIST_ID}/items/${itemId}?$expand=fields`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (response.status === 404) {
      console.log(`${docId}: SharePoint item deleted (kept ${currentDate})`);
      continue;
    }
    const payload = await response.json();
    if (!response.ok) {
      console.log(`${docId}: Graph error`, payload.error?.message || response.status);
      continue;
    }

    const fields = payload.fields || {};
    const correctDate = toIsoDateFromSharePoint(fields[DATE_FIELD]);
    const loyalty = fields[LOYALTY_FIELD];
    if (!correctDate) {
      console.log(`${docId}: no date on SharePoint`);
      continue;
    }
    if (correctDate === currentDate) {
      console.log(`${docId}: already correct ${currentDate} (loyalty=${loyalty})`);
      continue;
    }

    await doc.ref.set({
      eventDate: correctDate,
      absenceDate: correctDate,
      dateRepairedAt: new Date().toISOString(),
      dateRepairedFrom: currentDate,
      updatedAt: new Date().toISOString(),
      updatedByUid: 'repairMissingBonusSpDates',
    }, { merge: true });
    amended += 1;
    console.log(`${docId}: ${currentDate} → ${correctDate} (loyalty=${loyalty}, ${current.sharePointName || ''})`);
  }

  console.log(`Amended ${amended}`);
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
