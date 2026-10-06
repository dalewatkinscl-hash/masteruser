/**
 * Server-to-server client for the Vehicles portal (vehicles-cl).
 * Uses VEHICLES_PORTAL_URL + VEHICLES_PROVISION_SECRET (same pattern as tyre portal).
 */

const DEFAULT_VEHICLES_PORTAL_URL = 'https://vehicles.countrylion.co.uk';

function vehiclesConfig() {
  const baseUrl = String(process.env.VEHICLES_PORTAL_URL || DEFAULT_VEHICLES_PORTAL_URL)
    .trim()
    .replace(/\/+$/, '');
  const secret = String(process.env.VEHICLES_PROVISION_SECRET || '').trim();
  return { baseUrl, secret };
}

function assertConfigured() {
  const { baseUrl, secret } = vehiclesConfig();
  if (!baseUrl || !secret) {
    const err = new Error('Vehicles portal integration is not configured.');
    err.status = 500;
    throw err;
  }
  return { baseUrl, secret };
}

async function vehiclesRequest(path, { method = 'GET', body, actorUid } = {}) {
  const { baseUrl, secret } = assertConfigured();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    const headers = {
      Accept: 'application/json',
      'x-provision-secret': secret,
    };
    if (actorUid) headers['x-actor-uid'] = String(actorUid);
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const response = await fetch(`${baseUrl}/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const err = new Error(
        payload?.error?.message || payload?.error || `Vehicles portal request failed (${response.status}).`,
      );
      err.status = response.status;
      err.payload = payload;
      throw err;
    }
    return payload;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function listFleetVehicles() {
  const payload = await vehiclesRequest('/fleet-vehicles');
  return Array.isArray(payload?.vehicles) ? payload.vehicles : [];
}

async function createVehicleAccident(data = {}, actorUid = '') {
  const payload = await vehiclesRequest('/accidents', {
    method: 'POST',
    body: data,
    actorUid,
  });
  return payload?.accident || null;
}

async function updateVehicleAccident(accidentId, data = {}, actorUid = '') {
  const id = String(accidentId || '').trim();
  if (!id) {
    const err = new Error('Accident id is required.');
    err.status = 400;
    throw err;
  }
  const payload = await vehiclesRequest(`/accidents/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: data,
    actorUid,
  });
  return payload?.accident || null;
}

async function getVehicleAccident(accidentId) {
  const id = String(accidentId || '').trim();
  if (!id) return null;
  const payload = await vehiclesRequest(`/accidents/${encodeURIComponent(id)}`);
  return payload?.accident || null;
}

module.exports = {
  vehiclesConfig,
  listFleetVehicles,
  createVehicleAccident,
  updateVehicleAccident,
  getVehicleAccident,
};
