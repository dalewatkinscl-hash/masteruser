'use strict';

const { Client } = require('pg');
const { readRedshiftConfigFromEnv } = require('./redshiftConfig');

const CONNECT_TIMEOUT_MS = 8_000;
const QUERY_TIMEOUT_MS = 15_000;

function createClient(config) {
  return new Client({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    query_timeout: QUERY_TIMEOUT_MS,
  });
}

function sanitizeError(message) {
  return String(message || '')
    .replace(/password\s*=\s*\S+/gi, 'password=***')
    .replace(/:[^:@/]+@/g, ':***@')
    .slice(0, 240);
}

async function withRedshift(fn) {
  const config = readRedshiftConfigFromEnv();
  if (!config) {
    return { ok: false, reason: 'Redshift env is incomplete or empty' };
  }

  const client = createClient(config);
  try {
    await client.connect();
    const value = await fn(client, config);
    return { ok: true, value, config };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown connection error';
    return { ok: false, reason: sanitizeError(message) };
  } finally {
    try {
      await client.end();
    } catch {
      /* ignore */
    }
  }
}

module.exports = {
  withRedshift,
};
