/**
 * Device-code download using OUR Entra app (MS_GRAPH_CLIENT_ID) — NOT Azure CLI.
 * Requires the app to allow public client flows + appropriate delegated permissions.
 *
 * Prefer downloadPoliciesAttachments.ps1 (PnP Interactive) or app-only after
 * SharePoint Application Sites.Read.All is granted.
 */
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { execFileSync } = require('child_process');

const SITE_HOST = 'countrylion.sharepoint.com';
const SITE_PATH = '/sites/Compliance';
const LIST_NAME = 'Policies';
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

async function deviceCodeLogin({ tenantId, clientId, clientSecret, scope }) {
  const startRes = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/devicecode`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, scope }),
    },
  );
  const start = await startRes.json();
  if (!start.device_code) {
    throw new Error(`Device code start failed: ${JSON.stringify(start)}`);
  }

  console.log('\n========================================');
  console.log(start.message);
  console.log('========================================\n');

  try {
    execFileSync('powershell.exe', ['-NoProfile', '-Command', `Set-Clipboard -Value '${String(start.user_code).replace(/'/g, "''")}'; Start-Process 'https://login.microsoft.com/device'`], { stdio: 'ignore' });
  } catch {
    // non-fatal
  }

  const intervalMs = (start.interval || 5) * 1000;
  const expiresAt = Date.now() + (start.expires_in || 900) * 1000;

  while (Date.now() < expiresAt) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const params = {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: clientId,
      device_code: start.device_code,
    };
    // Confidential client: include secret (AADSTS7000218 without it when public client flows are off).
    if (clientSecret) params.client_secret = clientSecret;

    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params),
      },
    );
    const body = await tokenRes.json();
    if (body.access_token) return body.access_token;
    if (body.error === 'authorization_pending' || body.error === 'slow_down') {
      if (body.error === 'slow_down') await new Promise((r) => setTimeout(r, intervalMs));
      continue;
    }
    throw new Error(`Device code token failed: ${JSON.stringify(body)}`);
  }
  throw new Error('Device code expired before login completed.');
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
    throw new Error(`SharePoint REST ${res.status} ${apiPath}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function downloadToFile(url, token, destPath) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
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

async function main() {
  const env = loadEnvFile(path.resolve(__dirname, '../.env'));
  const tenantId = process.env.MS_GRAPH_TENANT_ID || env.MS_GRAPH_TENANT_ID;
  const clientId = process.env.MS_GRAPH_CLIENT_ID || env.MS_GRAPH_CLIENT_ID;
  const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET || env.MS_GRAPH_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Missing MS_GRAPH_TENANT_ID / MS_GRAPH_CLIENT_ID / MS_GRAPH_CLIENT_SECRET');
  }

  // Our app only — never Azure CLI. SharePoint delegated scope for list attachments.
  const scope = `https://${SITE_HOST}/AllSites.Read offline_access openid profile`;
  console.log(`Starting device login with our app ${clientId}...`);
  const token = await deviceCodeLogin({ tenantId, clientId, clientSecret, scope });
  console.log('Authenticated. Fetching list attachments...');

  if (fs.existsSync(WORK_DIR)) fs.rmSync(WORK_DIR, { recursive: true, force: true });
  fs.mkdirSync(WORK_DIR, { recursive: true });

  let downloaded = 0;
  let itemsWithAttachments = 0;
  let itemsUrl = `/lists/getbytitle('${LIST_NAME}')/items?$select=Id,Title,Attachments&$expand=AttachmentFiles&$top=100`;

  while (itemsUrl) {
    const page = await spoGet(token, itemsUrl);
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
        await downloadToFile(`https://${SITE_HOST}${file.ServerRelativeUrl}`, token, dest);
        downloaded += 1;
        console.log(`  ${item.Id}/${fileName} ok`);
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

  console.log(`Downloaded ${downloaded} from ${itemsWithAttachments} items.`);
  if (!downloaded) throw new Error('No attachments found.');
  zipDirectory(WORK_DIR, OUT_ZIP);
  fs.rmSync(WORK_DIR, { recursive: true, force: true });
  const stat = fs.statSync(OUT_ZIP);
  console.log(`Done: ${OUT_ZIP} (${(stat.size / (1024 * 1024)).toFixed(2)} MB)`);
}

main().catch((err) => {
  const msg = String(err.message || err);
  console.error(msg);
  if (msg.includes('AADSTS7000218') || msg.includes('invalid_client')) {
    console.error(`
This app is a confidential client without "Allow public client flows".
Device code cannot finish until that is enabled in Entra ID, OR use the
unattended path instead:

  Entra ID → App registrations → ba91a7b7-77ca-4d50-ae50-7cfae35c5539
  → API permissions → Add → SharePoint → Application → Sites.Read.All
  → Grant admin consent
  → node functions/scripts/downloadPoliciesAttachments.js
`);
  }
  process.exit(1);
});
