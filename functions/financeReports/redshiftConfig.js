'use strict';

/** Parse host that may include `:port`; prefer explicit REDSHIFT_PORT when set. */
function parseHostAndPort(hostRaw, portRaw) {
  const trimmed = String(hostRaw || '').trim();
  const match = trimmed.match(/^(.*):(\d+)$/);
  if (match) {
    const embeddedPort = Number(match[2]);
    const explicit = portRaw?.trim() ? Number(portRaw) : NaN;
    return {
      host: match[1],
      port: Number.isFinite(explicit) && explicit > 0 ? explicit : embeddedPort,
    };
  }
  const port = portRaw?.trim() ? Number(portRaw) : 5439;
  return {
    host: trimmed,
    port: Number.isFinite(port) && port > 0 ? port : 5439,
  };
}

function readRedshiftConfigFromEnv(env = process.env) {
  const hostRaw = env.REDSHIFT_HOST?.trim();
  const database = env.REDSHIFT_DATABASE?.trim();
  const user = env.REDSHIFT_USER?.trim();
  const password = env.REDSHIFT_PASSWORD?.trim();
  const customer = env.REDSHIFT_CUSTOMER?.trim() || 'Country Lion';

  if (!hostRaw || !database || !user || !password) {
    return null;
  }

  const { host, port } = parseHostAndPort(hostRaw, env.REDSHIFT_PORT);
  const schema = env.REDSHIFT_SCHEMA?.trim() || undefined;

  return { host, port, database, customer, user, password, schema };
}

module.exports = {
  parseHostAndPort,
  readRedshiftConfigFromEnv,
};
