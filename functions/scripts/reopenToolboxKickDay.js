'use strict';

/**
 * Re-open today's finished Toolbox rounds for another 3 goes, keeping best
 * distance (leaderboard) intact.
 *
 * Usage: node functions/scripts/reopenToolboxKickDay.js [YYYY-MM-DD]
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const PROJECT = 'master-user-management';
const CONF = path.join(process.env.USERPROFILE || process.env.HOME, '.config', 'configstore', 'firebase-tools.json');

function londonDayKey(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function request(method, urlPath, body, token) {
  const data = body == null ? null : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'firestore.googleapis.com',
      path: urlPath,
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(data
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
          : {}),
      },
    }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        let parsed = buf;
        try { parsed = buf ? JSON.parse(buf) : null; } catch { /* keep */ }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function refreshAccessToken(conf) {
  if (conf.tokens && conf.tokens.access_token
    && conf.tokens.expires_at && conf.tokens.expires_at > Date.now() + 60_000) {
    return conf.tokens.access_token;
  }
  const refreshToken = conf.tokens && conf.tokens.refresh_token;
  if (!refreshToken) throw new Error('No refresh_token in firebase-tools.json');
  let clientId = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
  let clientSecret = '';
  try {
    const api = require(require('path').join(
      process.env.APPDATA || '',
      'npm/node_modules/firebase-tools/lib/api.js',
    ));
    const id = typeof api.clientId === 'function' ? api.clientId() : api.clientId;
    const secret = typeof api.clientSecret === 'function' ? api.clientSecret() : api.clientSecret;
    if (id) clientId = id;
    if (secret) clientSecret = secret;
  } catch {
    // fall through
  }
  if (!clientSecret) throw new Error('Could not load firebase-tools client secret');
  const form = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  }).toString();
  const res = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(form),
      },
    }, (r) => {
      let buf = '';
      r.on('data', (c) => { buf += c; });
      r.on('end', () => {
        try { resolve({ status: r.statusCode, body: JSON.parse(buf) }); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(form);
    req.end();
  });
  if (res.status !== 200 || !res.body.access_token) {
    throw new Error(`Token refresh failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.access_token;
}

function field(v) {
  if (!v) return undefined;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(field);
  if ('mapValue' in v) {
    const out = {};
    for (const [k, child] of Object.entries((v.mapValue && v.mapValue.fields) || {})) {
      out[k] = field(child);
    }
    return out;
  }
  return null;
}

function isFullyDone(fields) {
  const status = field(fields.status);
  const roundComplete = fields.roundComplete && 'booleanValue' in fields.roundComplete
    ? fields.roundComplete.booleanValue
    : undefined;
  const bonusReason = field(fields.bonusReopenReason);
  // Also re-fix anyone left mid-reopen as in_progress from the earlier pass.
  if (status === 'in_progress' && bonusReason === 'toolbox-2.0-extra-goes') return true;
  if (status !== 'won') return false;
  if (roundComplete === false) return false;
  return true;
}

async function main() {
  const dayKey = String(process.argv[2] || londonDayKey()).trim();
  const conf = JSON.parse(fs.readFileSync(CONF, 'utf8'));
  let token = await refreshAccessToken(conf);

  const parent = `projects/${PROJECT}/databases/(default)/documents`;
  const query = {
    structuredQuery: {
      from: [{ collectionId: 'toolbox_kick_games' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'dayKey' },
          op: 'EQUAL',
          value: { stringValue: dayKey },
        },
      },
      limit: 400,
    },
  };

  const res = await request('POST', `/v1/${parent}:runQuery`, query, token);
  if (res.status !== 200) {
    console.error(JSON.stringify({ ok: false, status: res.status, body: res.body }, null, 2));
    process.exit(1);
  }

  const rows = Array.isArray(res.body) ? res.body.filter((r) => r && r.document) : [];
  let reopened = 0;
  let skippedOpen = 0;
  let failed = 0;
  const names = [];

  for (const row of rows) {
    const name = row.document.name;
    const fields = row.document.fields || {};
    const fullName = field(fields.fullName) || field(fields.email) || name.split('/').pop();
    const distanceM = field(fields.distanceM) || 0;
    const attempts = field(fields.attempts) || [];

    if (!isFullyDone(fields)) {
      skippedOpen += 1;
      continue;
    }

    // Keep best distance on the day board (status won) while unlocking more goes
    // via roundComplete:false. Leaderboard filters status===won.
    const patch = {
      fields: {
        status: { stringValue: 'won' },
        roundComplete: { booleanValue: false },
        attempts: { arrayValue: { values: [] } },
        forfeited: { booleanValue: false },
        forfeitReason: { nullValue: null },
        bonusReopenAt: { timestampValue: new Date().toISOString() },
        bonusReopenReason: { stringValue: 'toolbox-2.0-extra-goes' },
        updatedAt: { timestampValue: new Date().toISOString() },
      },
    };

    const mask = [
      'status',
      'roundComplete',
      'attempts',
      'forfeited',
      'forfeitReason',
      'bonusReopenAt',
      'bonusReopenReason',
      'updatedAt',
    ].map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');

    const patchRes = await request('PATCH', `/v1/${name}?${mask}`, patch, token);
    if (patchRes.status === 200) {
      reopened += 1;
      names.push(`${fullName} (kept ${distanceM}m, had ${attempts.length} attempts)`);
    } else {
      failed += 1;
      console.error('patch fail', fullName, patchRes.status, patchRes.body);
    }
  }

  console.log(JSON.stringify({
    ok: failed === 0,
    dayKey,
    scanned: rows.length,
    reopened,
    skippedAlreadyOpen: skippedOpen,
    failed,
    players: names,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
