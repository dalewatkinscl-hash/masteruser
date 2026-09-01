/**
 * One-off: download popular reaction meme GIFs and seed kudos_gifs + Storage.
 * Uses the logged-in Firebase CLI access token.
 *
 * Run: node scripts/seedKudosMemes.js
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const PROJECT_ID = 'master-user-management';
const BUCKET = 'master-user-management.firebasestorage.app';
const MAX_BYTES = 2 * 1024 * 1024;

// Popular reaction memes — Giphy downsized GIFs (under 2MB when possible).
const MEMES = [
  { name: 'clapping', url: 'https://media.giphy.com/media/l0M4xfI3GTSY9OqKQ/200.gif' },
  { name: 'applause', url: 'https://media.giphy.com/media/kyLYXonQYYfrRmXadN/200.gif' },
  { name: 'wow', url: 'https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/200.gif' },
  { name: 'excited-cant-wait', url: 'https://media.giphy.com/media/5GoVLqeAOo6PK/giphy-downsized.gif' },
  { name: 'celebration', url: 'https://media.giphy.com/media/g9582DNuQppxC/200w.gif' },
  { name: 'deal-with-it', url: 'https://media.giphy.com/media/l0MYt5jPR19BpL7aU/200.gif' },
  { name: 'mic-drop', url: 'https://media.giphy.com/media/3o7TKF1fSIs1R19B8k/200.gif' },
  { name: 'happy-dance', url: 'https://media.giphy.com/media/l0M9DgbQqzU3mT8nK/200.gif' },
];

function loadFirebaseAccessToken() {
  const configPath = path.join(process.env.USERPROFILE || process.env.HOME, '.config', 'configstore', 'firebase-tools.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const token = config.tokens?.access_token;
  if (!token) throw new Error('No Firebase CLI access token. Run firebase login.');
  return token;
}

function fetchBuffer(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) {
      reject(new Error(`Too many redirects for ${url}`));
      return;
    }
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'CountryLion-KudosSeed/1.0',
        Accept: 'image/gif,*/*',
      },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = new URL(res.headers.location, url).toString();
        res.resume();
        fetchBuffer(next, redirects + 1).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const chunks = [];
      let total = 0;
      res.on('data', (chunk) => {
        total += chunk.length;
        if (total > MAX_BYTES * 2) {
          req.destroy();
          reject(new Error(`File too large from ${url}`));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
  });
}

function lookLikeGif(buf) {
  return buf.length >= 6 && buf.slice(0, 6).toString('ascii').startsWith('GIF8');
}

async function refreshAccessTokenIfNeeded(token) {
  // Probe Storage API; if 401, refresh via Google OAuth refresh_token.
  return token;
}

async function getFreshAccessToken() {
  return loadFirebaseAccessToken();
}

async function uploadGif(accessToken, { name, buffer }) {
  const downloadToken = crypto.randomUUID();
  const objectPath = `kudos/library/${name}-${crypto.randomBytes(3).toString('hex')}.gif`;
  const metadata = {
    name: objectPath,
    contentType: 'image/gif',
    metadata: {
      firebaseStorageDownloadTokens: downloadToken,
      seeded: 'meme-pack-v1',
      fileName: `${name}.gif`,
    },
  };

  const boundary = `boundary_${crypto.randomBytes(8).toString('hex')}`;
  const metaPart = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    'utf8',
  );
  const fileHeader = Buffer.from(
    `--${boundary}\r\nContent-Type: image/gif\r\n\r\n`,
    'utf8',
  );
  const closing = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  const body = Buffer.concat([metaPart, fileHeader, buffer, closing]);

  const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(BUCKET)}/o?uploadType=multipart`;
  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'Content-Length': String(body.length),
    },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Upload failed for ${name}: ${res.status} ${JSON.stringify(json)}`);
  }

  const gifUrl = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(objectPath)}?alt=media&token=${downloadToken}`;
  return { objectPath, gifUrl, downloadToken };
}

async function addLibraryDoc(accessToken, { name, gifUrl, objectPath }) {
  const docId = `meme_${name.replace(/[^a-z0-9_-]/gi, '_').slice(0, 40)}`;
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/kudos_gifs?documentId=${encodeURIComponent(docId)}`;
  const now = new Date().toISOString();
  const body = {
    fields: {
      url: { stringValue: gifUrl },
      storagePath: { stringValue: objectPath },
      fileName: { stringValue: `${name}.gif` },
      uploadedByUid: { stringValue: 'system-seed' },
      uploadedByName: { stringValue: 'Kudos Library' },
      createdAt: { timestampValue: now },
      seeded: { booleanValue: true },
    },
  };

  // Upsert: PATCH with updateMask if exists, else POST create.
  const createRes = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (createRes.ok) return { id: docId, created: true };

  const createJson = await createRes.json().catch(() => ({}));
  if (createRes.status === 409 || /already exists/i.test(JSON.stringify(createJson))) {
    const patchUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/kudos_gifs/${encodeURIComponent(docId)}?updateMask.fieldPaths=url&updateMask.fieldPaths=storagePath&updateMask.fieldPaths=fileName&updateMask.fieldPaths=uploadedByUid&updateMask.fieldPaths=uploadedByName&updateMask.fieldPaths=createdAt&updateMask.fieldPaths=seeded`;
    const patchRes = await fetch(patchUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!patchRes.ok) {
      const patchJson = await patchRes.json().catch(() => ({}));
      throw new Error(`Firestore update failed for ${name}: ${patchRes.status} ${JSON.stringify(patchJson)}`);
    }
    return { id: docId, created: false };
  }

  throw new Error(`Firestore create failed for ${name}: ${createRes.status} ${JSON.stringify(createJson)}`);
}

async function main() {
  const accessToken = await getFreshAccessToken();
  console.log(`Seeding up to ${MEMES.length} meme GIFs into ${BUCKET}…`);

  const seen = new Set();
  let ok = 0;
  let skipped = 0;

  for (const meme of MEMES) {
    if (seen.has(meme.name)) continue;
    seen.add(meme.name);
    process.stdout.write(`- ${meme.name}… `);
    try {
      const buffer = await fetchBuffer(meme.url);
      if (!lookLikeGif(buffer)) {
        console.log('skip (not a GIF)');
        skipped += 1;
        continue;
      }
      if (buffer.length > MAX_BYTES) {
        console.log(`skip (too large ${(buffer.length / 1024).toFixed(0)}KB)`);
        skipped += 1;
        continue;
      }
      const uploaded = await uploadGif(accessToken, { name: meme.name, buffer });
      await addLibraryDoc(accessToken, {
        name: meme.name,
        gifUrl: uploaded.gifUrl,
        objectPath: uploaded.objectPath,
      });
      console.log(`ok (${(buffer.length / 1024).toFixed(0)}KB)`);
      ok += 1;
      if (ok >= 20) break;
    } catch (error) {
      console.log(`fail (${error.message})`);
      skipped += 1;
    }
  }

  console.log(`\nDone. Uploaded ${ok}, skipped/failed ${skipped}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
