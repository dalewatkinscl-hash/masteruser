/** Round length in seconds (3 minutes). */
export const ROUND_SECONDS = 180;

/** Max score when the guess is exact. */
export const MAX_SCORE = 5000;

/** Distance scale (km) for exponential score decay. */
export const SCORE_SCALE_KM = 2000;

export const MAPILLARY_TOKEN_STORAGE_KEY = 'fun_admin_mapillary_token';

/**
 * Seed puzzles for Fun Admin testing.
 * Prefer lat/lng so we resolve a live Mapillary image near the point (IDs go stale).
 */
export const GEOGUESSR_SEED_PUZZLES = [
  {
    id: 'uk-london-bridge',
    label: 'UK · London Bridge area',
    lat: 51.5079,
    lng: -0.0877,
  },
  {
    id: 'uk-manchester-piccadilly',
    label: 'UK · Manchester Piccadilly',
    lat: 53.4774,
    lng: -2.2309,
  },
  {
    id: 'uk-edinburgh-royal-mile',
    label: 'UK · Edinburgh Royal Mile',
    lat: 55.9502,
    lng: -3.1878,
  },
];

export function getMapillaryAccessToken() {
  try {
    const stored = (localStorage.getItem(MAPILLARY_TOKEN_STORAGE_KEY) || '').trim();
    if (stored) return stored;
  } catch {
    /* ignore */
  }
  return (import.meta.env.VITE_MAPILLARY_ACCESS_TOKEN || '').trim();
}

export function setMapillaryAccessToken(token) {
  const value = (token || '').trim();
  try {
    if (value) localStorage.setItem(MAPILLARY_TOKEN_STORAGE_KEY, value);
    else localStorage.removeItem(MAPILLARY_TOKEN_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return value;
}

export function clearMapillaryAccessToken() {
  try {
    localStorage.removeItem(MAPILLARY_TOKEN_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function haversineKm(aLat, aLng, bLat, bLng) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function scoreFromDistanceKm(distanceKm) {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return 0;
  const raw = MAX_SCORE * Math.exp(-distanceKm / SCORE_SCALE_KM);
  return Math.max(0, Math.min(MAX_SCORE, Math.round(raw)));
}

export function formatDistance(distanceKm) {
  if (!Number.isFinite(distanceKm)) return '—';
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m`;
  if (distanceKm < 100) return `${distanceKm.toFixed(1)} km`;
  return `${Math.round(distanceKm)} km`;
}

export function formatTimer(remainingSeconds) {
  const s = Math.max(0, Math.floor(remainingSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function coordsFromImagePayload(payload) {
  const coords =
    payload?.computed_geometry?.coordinates ||
    payload?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  return { lng: Number(coords[0]), lat: Number(coords[1]) };
}

function mapillaryErrorMessage(payload, fallback) {
  if (typeof payload?.error === 'string') return payload.error;
  return payload?.error?.message || fallback;
}

async function fetchImageById(imageId, accessToken) {
  const url = new URL(`https://graph.mapillary.com/${encodeURIComponent(imageId)}`);
  url.searchParams.set('access_token', accessToken);
  url.searchParams.set('fields', 'id,computed_geometry,geometry,is_pano');
  const response = await fetch(url.toString());
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(mapillaryErrorMessage(payload, 'Failed to load Mapillary image metadata.'));
  }
  const point = coordsFromImagePayload(payload);
  if (!point) throw new Error('Mapillary image has no geometry coordinates.');
  return {
    imageId: String(payload.id || imageId),
    lat: point.lat,
    lng: point.lng,
    isPano: Boolean(payload.is_pano),
  };
}

/**
 * Find a live Mapillary image near lat/lng (radius, then small bbox fallback).
 */
export async function findImageNear(lat, lng, accessToken) {
  if (!accessToken) {
    throw new Error('Add a Mapillary access token in Fun admin to look up images.');
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error('Latitude and longitude are required to find a nearby image.');
  }

  const fields = 'id,computed_geometry,geometry,is_pano';

  const radiusUrl = new URL('https://graph.mapillary.com/images');
  radiusUrl.searchParams.set('access_token', accessToken);
  radiusUrl.searchParams.set('fields', fields);
  radiusUrl.searchParams.set('lat', String(lat));
  radiusUrl.searchParams.set('lng', String(lng));
  radiusUrl.searchParams.set('radius', '50');
  radiusUrl.searchParams.set('limit', '5');

  let response = await fetch(radiusUrl.toString());
  let payload = await response.json().catch(() => ({}));
  let rows = Array.isArray(payload.data) ? payload.data : [];

  if (!response.ok || rows.length === 0) {
    // bbox must be < 0.01 deg² — use ~0.004° (~450m) square
    const d = 0.002;
    const bbox = `${lng - d},${lat - d},${lng + d},${lat + d}`;
    const bboxUrl = new URL('https://graph.mapillary.com/images');
    bboxUrl.searchParams.set('access_token', accessToken);
    bboxUrl.searchParams.set('fields', fields);
    bboxUrl.searchParams.set('bbox', bbox);
    bboxUrl.searchParams.set('limit', '10');
    response = await fetch(bboxUrl.toString());
    payload = await response.json().catch(() => ({}));
    rows = Array.isArray(payload.data) ? payload.data : [];
    if (!response.ok) {
      throw new Error(mapillaryErrorMessage(payload, 'Failed to search Mapillary images.'));
    }
  }

  if (!rows.length) {
    throw new Error('No Mapillary coverage near that point. Try another lat/lng or paste a valid image ID.');
  }

  // Prefer panoramas, then first result
  const preferred = rows.find((row) => row.is_pano) || rows[0];
  const point = coordsFromImagePayload(preferred);
  if (!point) throw new Error('Nearby Mapillary image has no geometry.');
  return {
    imageId: String(preferred.id),
    lat: point.lat,
    lng: point.lng,
    isPano: Boolean(preferred.is_pano),
  };
}

/**
 * Resolve a playable puzzle: valid imageId + truth lat/lng from Mapillary.
 */
export async function resolvePuzzleGeometry(puzzle, accessToken) {
  if (!accessToken) {
    throw new Error('Add a Mapillary access token in Fun admin to resolve image coordinates.');
  }

  const hasImageId = Boolean(puzzle?.imageId && String(puzzle.imageId).trim());
  const hasCoords = Number.isFinite(puzzle?.lat) && Number.isFinite(puzzle?.lng);

  if (!hasImageId && !hasCoords) {
    throw new Error('Puzzle needs a Mapillary image ID or lat/lng.');
  }

  if (hasImageId) {
    try {
      const found = await fetchImageById(String(puzzle.imageId).trim(), accessToken);
      return {
        ...puzzle,
        imageId: found.imageId,
        lat: found.lat,
        lng: found.lng,
      };
    } catch (err) {
      if (!hasCoords) throw err;
      // Stale ID + coords provided → fall back to nearby search
    }
  }

  const found = await findImageNear(Number(puzzle.lat), Number(puzzle.lng), accessToken);
  return {
    ...puzzle,
    imageId: found.imageId,
    lat: found.lat,
    lng: found.lng,
  };
}
