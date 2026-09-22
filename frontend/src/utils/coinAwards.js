/**
 * Global coin-award notifications.
 * API responses may include `coinsAwarded: [{ amount, reason }, ...]`.
 * A fetch hook auto-dispatches those onto the toaster.
 */

export const COIN_AWARD_EVENT = 'cl-coins-awarded';

export const COIN_REASON_LABELS = {
  next_of_kin: 'Next of kin completed',
  phone_number: 'Phone number added',
  home_address: 'Home address added',
  personal_email: 'Personal email added',
  fun_attempt: 'Fun game played',
  fun_win: 'Fun game won',
  podium: 'Podium finish',
  streak_5: '5-day streak trophy',
  kudos_send: 'Kudos sent',
  kudos_receive: 'Kudos received',
  poll_vote: 'Poll vote',
  suggestion: 'Suggestion submitted',
  daily_login: 'Daily login',
  training_assessment: 'Training assessment',
};

/** Ways to earn coins — used by the wallet “Earn more” panel. */
export const COIN_EARN_ACTIONS = [
  {
    id: 'next_of_kin',
    label: 'Fill in next of kin',
    detail: 'Name and phone · one-time +10',
    amount: 10,
    profileTab: 'profile',
    section: 'next-of-kin',
  },
  {
    id: 'home_address',
    label: 'Add your home address',
    detail: 'Line 1 and postcode · one-time +10',
    amount: 10,
    profileTab: 'profile',
    section: 'address',
  },
  {
    id: 'phone_number',
    label: 'Add your phone number',
    detail: 'On your profile · one-time +5',
    amount: 5,
    profileTab: 'profile',
    section: 'contact',
  },
  {
    id: 'personal_email',
    label: 'Add personal email',
    detail: 'On your profile · one-time +5',
    amount: 5,
    profileTab: 'profile',
    section: 'contact',
  },
  {
    id: 'fun_attempt',
    label: 'Play a daily Fun game',
    detail: '+3 per game · capped to today’s games',
    amount: 3,
    profileTab: 'fun',
  },
  {
    id: 'podium',
    label: 'Finish top 3 on a Fun game',
    detail: '+25 at midnight · final podium only',
    amount: 25,
    profileTab: 'fun',
  },
  {
    id: 'streak_5',
    label: 'Unlock a 5-day win streak',
    detail: 'Weekday wins on the same game',
    amount: 25,
    profileTab: 'fun',
  },
  {
    id: 'poll_vote',
    label: 'Vote on a poll',
    detail: '+3 · once per day',
    amount: 3,
    profileTab: 'polls',
  },
  {
    id: 'suggestion',
    label: 'Submit a suggestion',
    detail: '+10 · once per week',
    amount: 10,
    profileTab: 'suggestions',
  },
  {
    id: 'kudos_send',
    label: 'Send kudos',
    detail: 'Managers · +5 once per day',
    amount: 5,
    profileTab: 'kudos',
    requiresKudos: true,
  },
  {
    id: 'daily_login',
    label: 'Visit the portal each day',
    detail: 'First login of the day',
    amount: 2,
    profileTab: 'profile',
  },
];

export function visibleCoinEarnActions({ canIssueKudos = false } = {}) {
  return COIN_EARN_ACTIONS.filter((row) => {
    if (row.requiresKudos && !canIssueKudos) return false;
    return true;
  });
}

export function coinReasonLabel(reason) {
  if (!reason) return 'Reward earned';
  return COIN_REASON_LABELS[reason] || String(reason).replace(/_/g, ' ');
}

export function notifyCoinAwards(awards) {
  const list = (Array.isArray(awards) ? awards : [])
    .filter((row) => row && Number(row.amount) > 0)
    .map((row) => ({
      amount: Math.floor(Number(row.amount)),
      reason: String(row.reason || 'reward'),
    }));
  if (!list.length || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(COIN_AWARD_EVENT, { detail: { awards: list } }));
}

/** Install once — watches /api JSON responses for coinsAwarded. */
export function installCoinAwardFetchHook() {
  if (typeof window === 'undefined' || window.__clCoinFetchHooked) return;
  window.__clCoinFetchHooked = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    try {
      const request = args[0];
      const url = typeof request === 'string'
        ? request
        : (request && typeof request.url === 'string' ? request.url : '');
      if (url.includes('/api/') && response.ok) {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          response.clone().json().then((payload) => {
            if (Array.isArray(payload?.coinsAwarded) && payload.coinsAwarded.length) {
              notifyCoinAwards(payload.coinsAwarded);
            }
          }).catch(() => {});
        }
      }
    } catch {
      // ignore hook errors
    }
    return response;
  };
}
