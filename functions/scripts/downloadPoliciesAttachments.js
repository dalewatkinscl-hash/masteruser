/**
 * Download all attachments from Compliance > Policies into policies.zip.
 *
 * Strategy:
 * 1) App-only SharePoint REST (needs SharePoint Application Sites.Read.All)
 * 2) App-only Graph listing + best-effort attachment paths
 *
 * Usage: node functions/scripts/downloadPoliciesAttachments.js
 */
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { execFileSync } = require('child_process');

const SITE_HOST = 'countrylion.sharepoint.com';
const SITE_PATH = '/sites/Compliance';
const LIST_NAME = 'Policies';
const LIST_ID = 'f194835e-cb35-4933-94bb-d6270e745395';
const OUT_ZIP = path.resolve(process.cwd(), 'policies.zip');
const WORK_DIR = path.resolve(process.cwd(), '.policies-download-tmp');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[trimmed.slice(0, eq).trim()] = value;
  }
  return out;
}

function sanitize(name) {
  return String(name || 'unnamed')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim() || 'unnamed';
}

async function getToken(env, scope) {
  const res = await fetch(
    `https://login.microsoftonline.com/${env.MS_GRAPH_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.MS_GRAPH_CLIENT_ID,
        client_secret: env.MS_GRAPH_CLIENT_SECRET,
        scope,
        grant_type: 'client_credentials',
      }),
    },
  );
  const body = await res.json();
  if (!body.access_token) {
    throw new Error(`Token failed for ${scope}: ${JSON.stringify(body)}`);
  }
  return body.access_token;
}

function decodeRoles(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    return payload.roles || [];
  } catch {
    return [];
  }
}

async function graph(token, urlPath) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${urlPath}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Graph ${res.status} ${urlPath}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function graphAll(token, urlPath) {
  const items = [];
  let next = urlPath;
  while (next) {
    const page = await graph(token, next);
    items.push(...(page.value || []));
    next = page['@odata.nextLink']
      ? page['@odata.nextLink'].replace('https://graph.microsoft.com/v1.0', '')
      : '';
  }
  return items;
}

async function spoGet(token, apiPath) {
  const url = apiPath.startsWith('http')
    ? apiPath
    : `https://${SITE_HOST}${SITE_PATH}/_api/web${apiPath}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json;odata=nometadata',
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`SharePoint REST ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function downloadToFile(url, token, destPath) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Download failed ${res.status}: ${text.slice(0, 300)}`);
  }
  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(destPath));
}

function zipDirectory(sourceDir, zipPath) {
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `Compress-Archive -Path '${sourceDir}\\*' -DestinationPath '${zipPath}' -Force`,
    ],
    { stdio: 'inherit' },
  );
}

async function downloadViaSharePointRest(spoToken) {
  if (fs.existsSync(WORK_DIR)) fs.rmSync(WORK_DIR, { recursive: true, force: true });
  fs.mkdirSync(WORK_DIR, { recursive: true });

  let downloaded = 0;
  let itemsWithAttachments = 0;
  let itemsUrl = `/lists/getbytitle('${LIST_NAME}')/items?$select=Id,Title,Attachments&$expand=AttachmentFiles&$top=100`;

  while (itemsUrl) {
    const page = await spoGet(spoToken, itemsUrl);
    for (const item of page.value || []) {
      const files = item.AttachmentFiles || [];
      if (!files.length) continue;
      itemsWithAttachments += 1;
      const itemTitle = sanitize(item.Title || `item-${item.Id}`);
      const itemDir = path.join(WORK_DIR, `${item.Id}_${itemTitle}`);
      fs.mkdirSync(itemDir, { recursive: true });

      for (const file of files) {
        const fileName = sanitize(file.FileName || 'attachment');
        const dest = path.join(itemDir, fileName);
        const fileUrl = `https://${SITE_HOST}${file.ServerRelativeUrl}`;
        process.stdout.write(`  ${item.Id}/${fileName}...`);
        await downloadToFile(fileUrl, spoToken, dest);
        downloaded += 1;
        console.log(' ok');
      }
    }

    const next = page['odata.nextLink'] || page['@odata.nextLink'];
    if (next) {
      const marker = '/_api/web';
      const idx = next.indexOf(marker);
      itemsUrl = idx >= 0 ? next.slice(idx + marker.length) : next;
    } else {
      itemsUrl = null;
    }
  }

  return { downloaded, itemsWithAttachments };
}

async function main() {
  const envFromFile = loadEnvFile(path.resolve(__dirname, '../.env'));
  const env = {
    MS_GRAPH_TENANT_ID: process.env.MS_GRAPH_TENANT_ID || envFromFile.MS_GRAPH_TENANT_ID,
    MS_GRAPH_CLIENT_ID: process.env.MS_GRAPH_CLIENT_ID || envFromFile.MS_GRAPH_CLIENT_ID,
    MS_GRAPH_CLIENT_SECRET: process.env.MS_GRAPH_CLIENT_SECRET || envFromFile.MS_GRAPH_CLIENT_SECRET,
  };
  if (!env.MS_GRAPH_TENANT_ID || !env.MS_GRAPH_CLIENT_ID || !env.MS_GRAPH_CLIENT_SECRET) {
    throw new Error('Missing MS_GRAPH_TENANT_ID / MS_GRAPH_CLIENT_ID / MS_GRAPH_CLIENT_SECRET');
  }

  console.log('Getting Graph token...');
  const graphToken = await getToken(env, 'https://graph.microsoft.com/.default');
  console.log('Graph roles:', decodeRoles(graphToken).join(', ') || '(none)');

  const site = await graph(graphToken, `/sites/${SITE_HOST}:${SITE_PATH}`);
  const items = await graphAll(
    graphToken,
    `/sites/${encodeURIComponent(site.id)}/lists/${LIST_ID}/items?$expand=fields&$top=100`,
  );
  const withAtt = items.filter((i) => i.fields && i.fields.Attachments);
  console.log(`Graph list items: ${items.length}, with Attachments=true: ${withAtt.length}`);

  console.log('Getting SharePoint app token...');
  const spoToken = await getToken(env, `https://${SITE_HOST}/.default`);
  const spoRoles = decodeRoles(spoToken);
  console.log('SharePoint roles:', spoRoles.join(', ') || '(none)');

  if (!spoRoles.length) {
    const err = new Error('NEED_SHAREPOINT_APP_PERMISSION');
    err.code = 'NEED_SHAREPOINT_APP_PERMISSION';
    throw err;
  }

  console.log('Downloading via SharePoint REST...');
  const { downloaded, itemsWithAttachments } = await downloadViaSharePointRest(spoToken);
  console.log(`Downloaded ${downloaded} attachment(s) from ${itemsWithAttachments} item(s).`);
  if (downloaded === 0) throw new Error('No attachments found to zip.');

  console.log(`Creating ${OUT_ZIP}...`);
  zipDirectory(WORK_DIR, OUT_ZIP);
  fs.rmSync(WORK_DIR, { recursive: true, force: true });
  const stat = fs.statSync(OUT_ZIP);
  console.log(`Done: ${OUT_ZIP} (${(stat.size / (1024 * 1024)).toFixed(2)} MB)`);
}

main().catch((err) => {
  if (err.code === 'NEED_SHAREPOINT_APP_PERMISSION' || /SharePoint REST 401/.test(err.message || '')) {
    console.error(`
BLOCKED: App ${process.env.MS_GRAPH_CLIENT_ID || 'ba91a7b7-77ca-4d50-ae50-7cfae35c5539'} can read the Policies list via Microsoft Graph (Sites.ReadWrite.All) but cannot download list attachments.

Azure portal fix (one-time, admin consent required):
1. Entra ID → App registrations → ba91a7b7-77ca-4d50-ae50-7cfae35c5539
2. API permissions → Add a permission → SharePoint → Application permissions → Sites.Read.All
3. Click Grant admin consent
4. Re-run: node functions/scripts/downloadPoliciesAttachments.js
`);
    process.exit(2);
  }
  console.error(err.message || err);
  process.exit(1);
});
