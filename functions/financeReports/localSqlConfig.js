'use strict';

/**
 * Parse host and port for local SQL server.
 */
function parseHostAndPort(hostRaw, portRaw, defaultPort = 1433) {
  const trimmed = String(hostRaw || '').trim();
  const match = trimmed.match(/^(.*):(\d+)$/);
  if (match) {
    const embeddedPort = Number(match[2]);
    const explicit = portRaw != null && String(portRaw).trim() !== '' ? Number(portRaw) : NaN;
    return {
      host: match[1],
      port: Number.isFinite(explicit) && explicit > 0 ? explicit : embeddedPort,
    };
  }
  const port = portRaw != null && String(portRaw).trim() !== '' ? Number(portRaw) : defaultPort;
  return {
    host: trimmed,
    port: Number.isFinite(port) && port > 0 ? port : defaultPort,
  };
}

/**
 * Read local network SQL database configuration from environment.
 * Supports Microsoft SQL Server (MSSQL), MySQL, and PostgreSQL.
 */
function readLocalSqlConfigFromEnv(env = process.env) {
  const type = (env.LOCAL_SQL_TYPE || 'mssql').trim().toLowerCase();
  const hostRaw = env.LOCAL_SQL_HOST?.trim();
  const database = env.LOCAL_SQL_DATABASE?.trim();
  const user = env.LOCAL_SQL_USER?.trim();
  const password = env.LOCAL_SQL_PASSWORD?.trim();
  const instance = env.LOCAL_SQL_INSTANCE?.trim() || undefined;

  if (!hostRaw || !database || !user || !password) {
    return null;
  }

  const defaultPort = type === 'mysql' ? 3306 : type === 'postgres' ? 5432 : 1433;
  const { host, port } = parseHostAndPort(hostRaw, env.LOCAL_SQL_PORT, defaultPort);

  const encrypt = env.LOCAL_SQL_ENCRYPT === 'true';
  const trustServerCertificate = env.LOCAL_SQL_TRUST_SERVER_CERTIFICATE !== 'false';

  return {
    type,
    host,
    port,
    database,
    user,
    password,
    instance,
    encrypt,
    trustServerCertificate,
  };
}

module.exports = {
  parseHostAndPort,
  readLocalSqlConfigFromEnv,
};
