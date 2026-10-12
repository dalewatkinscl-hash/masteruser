/**
 * Force a reload when a new hosting deploy is live.
 * Compares the build id baked into this bundle against /version.json (no-cache).
 */

const POLL_MS = 60_000;
const STORAGE_KEY = 'cl_deploy_refresh';
const SNOOZE_KEY = 'cl_deploy_refresh_snooze_until';
const DAY_MS = 24 * 60 * 60 * 1000;

function currentBuildId() {
  try {
    return String(import.meta.env.VITE_APP_BUILD_ID || '').trim();
  } catch {
    return '';
  }
}

/** Pause deploy auto-reload until `untilMs` (epoch ms). Default: 24 hours from now. */
export function snoozeDeployRefresh(ms = DAY_MS) {
  try {
    const until = Date.now() + Math.max(0, Number(ms) || DAY_MS);
    localStorage.setItem(SNOOZE_KEY, String(until));
    return until;
  } catch {
    return 0;
  }
}

export function isDeployRefreshSnoozed() {
  try {
    const until = Number(localStorage.getItem(SNOOZE_KEY) || 0);
    return Number.isFinite(until) && until > Date.now();
  } catch {
    return false;
  }
}

async function fetchRemoteBuildId() {
  const response = await fetch(`/version.json?_=${Date.now()}`, {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (!response.ok) return null;
  const payload = await response.json();
  return String(payload?.buildId || '').trim() || null;
}

function reloadForDeploy(remoteId) {
  try {
    const prev = sessionStorage.getItem(STORAGE_KEY);
    if (prev === remoteId) return; // already tried this deploy once this tab
    sessionStorage.setItem(STORAGE_KEY, remoteId);
  } catch {
    /* ignore */
  }
  window.location.reload();
}

export async function checkDeployRefresh() {
  const local = currentBuildId();
  if (!local || import.meta.env.DEV) return false;
  if (isDeployRefreshSnoozed()) return false;
  try {
    const remote = await fetchRemoteBuildId();
    if (!remote || remote === local) return false;
    reloadForDeploy(remote);
    return true;
  } catch {
    return false;
  }
}

/** Start polling + check when the tab becomes visible again. */
export function startDeployRefreshWatcher() {
  if (import.meta.env.DEV) return () => {};
  if (!currentBuildId()) return () => {};

  // One-shot snooze so this deploy doesn't yank open tabs for a day
  try {
    if (!localStorage.getItem('cl_deploy_snooze_once_20261009')) {
      localStorage.setItem('cl_deploy_snooze_once_20261009', '1');
      snoozeDeployRefresh(DAY_MS);
    }
  } catch {
    /* ignore */
  }

  const run = () => {
    checkDeployRefresh().catch(() => {});
  };

  run();
  const intervalId = window.setInterval(run, POLL_MS);
  const onVisible = () => {
    if (document.visibilityState === 'visible') run();
  };
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    window.clearInterval(intervalId);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
