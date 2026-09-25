'use strict';

/**
 * Restore toolbox_kick_games for a dayKey from a Firestore stale read
 * (within the past hour without PITR).
 *
 * Usage: node functions/scripts/restoreToolboxKickDay.js [YYYY-MM-DD] [readTime ISO]
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
  const refreshToken = conf.tokens && conf.tokens.refresh_token;
  if (!refreshToken) throw new Error('No refresh_token in firebase-tools.json');
  const clientId = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
  const clientSecret = 'FAKESECRET_u3v4w5x6y7z8a9b0c1d2';
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

function firestoreValueToJs(v) {
  if (v == null) return null;
  if ('nullValue' in v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('mapValue' in v) {
    const out = {};
    const fields = (v.mapValue && v.mapValue.fields) || {};
    for (const [k, child] of Object.entries(fields)) out[k] = firestoreValueToJs(child);
    return out;
  }
  if ('arrayValue' in v) {
    const vals = (v.arrayValue && v.arrayValue.values) || [];
    return vals.map(firestoreValueToJs);
  }
  return null;
}

function jsToFirestoreValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'string') {
    // restore timestamp strings as timestamps when they look like ISO with Z
    if (/^\d{4}-\d{2}-\d{2}T/.test(val) && val.includes('Z')) {
      return { timestampValue: val };
    }
    return { stringValue: val };
  }
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(jsToFirestoreValue) } };
  }
  if (typeof val === 'object') {
    const fields = {};
    for (const [k, child] of Object.entries(val)) {
      fields[k] = jsToFirestoreValue(child);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

async function main() {
  const dayKey = String(process.argv[2] || londonDayKey()).trim();
  // Default: ~15 minutes before now, whole-second ISO (within 1h window)
  const defaultRead = new Date(Date.now() - 15 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const readTime = String(process.argv[3] || defaultRead).trim();

  const conf = JSON.parse(fs.readFileSync(CONF, 'utf8'));
  let token = conf.tokens && conf.tokens.access_token;
  if (!token || (conf.tokens.expires_at && conf.tokens.expires_at < Date.now() + 60_000)) {
    token = await refreshAccessToken(conf);
  }

  const parent = `projects/${PROJECT}/databases/(default)/documents`;

  const queryBody = {
    structuredQuery: {
      from: [{ collectionId: 'toolbox_kick_games' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'dayKey' },
          op: 'EQUAL',
          value: { stringValue: dayKey },
        },
      },
      limit: 300,
    },
    readTime,
  };

  let res = await request('POST', `/v1/${parent}:runQuery`, queryBody, token);
  if (res.status === 401 || res.status === 403) {
    token = await refreshAccessToken(conf);
    res = await request('POST', `/v1/${parent}:runQuery`, queryBody, token);
  }
  if (res.status !== 200) {
    console.error(JSON.stringify({ ok: false, step: 'staleQuery', status: res.status, readTime, body: res.body }, null, 2));
    process.exit(1);
  }

  const rows = Array.isArray(res.body) ? res.body.filter((r) => r && r.document) : [];
  console.log(JSON.stringify({ step: 'staleQuery', readTime, dayKey, found: rows.length }, null, 2));

  let restored = 0;
  let skippedExisting = 0;
  let failed = 0;

  for (const row of rows) {
    const name = row.document.name;
    const fields = row.document.fields || {};
    const docId = name.split('/').pop();

    // Skip if a live doc already exists (someone replayed after wipe)
    const live = await request('GET', `/v1/${name}`, null, token);
    if (live.status === 200 && live.body && live.body.fields) {
      skippedExisting += 1;
      continue;
    }

    const jsFields = {};
    for (const [k, v] of Object.entries(fields)) {
      jsFields[k] = firestoreValueToJs(v);
    }

    // Prefer writing original field encoding back to avoid timestamp/type drift.
    const patch = await request('PATCH', `/v1/${name}`, { fields }, token);
    if (patch.status === 200) {
      restored += 1;
      console.log(`restored ${docId} distance=${jsFields.bestDistance ?? jsFields.distance ?? '?'}`);
    } else {
      failed += 1;
      console.error('restore fail', docId, patch.status, patch.body);
    }
  }

  console.log(JSON.stringify({
    ok: failed === 0,
    dayKey,
    readTime,
    found: rows.length,
    restored,
    skippedExisting,
    failed,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
