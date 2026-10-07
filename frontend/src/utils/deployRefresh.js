/**
 * Force a reload when a new hosting deploy is live.
 * Compares the build id baked into this bundle against /version.json (no-cache).
 */

const POLL_MS = 60_000;
const STORAGE_KEY = 'cl_deploy_refresh';

function currentBuildId() {
  try {
    return String(import.meta.env.VITE_APP_BUILD_ID || '').trim();
  } catch {
    return '';
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
