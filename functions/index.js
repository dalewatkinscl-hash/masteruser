const admin = require('firebase-admin');
const cors = require('cors');
const crypto = require('crypto');
const { defineSecret, defineString } = require('firebase-functions/params');
const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { runHrMilestoneAlerts } = require('./hrMilestoneAlerts');
const {
  isSharePointConfigured,
  listDisciplinaryDocuments,
  resolveEmployeeSharePointPaths,
  suggestEmployeeFolders,
  uploadDisciplinaryDocument,
  validateEmployeeFolder,
  deleteDriveItem,
} = require('./sharepoint');
const {
  buildContactEmailFields,
  buildEmployeeProfileResponse,
  canEditAllEmployeeFields,
  canIssueKudos,
  canManagePortalAccess,
  canViewAllEmployeeProfiles,
  employeeNameSimilarity,
  hasPortalAccount,
  mapHrSpreadsheetRow,
  mergeEmployeeProfiles,
  mergeEmployeeProfilesFillGaps,
  normalizeBusinessCommsEmail,
  normalizeThemePreference,
  pickNonEmptyString,
  pickSelfEditablePatch,
  resolveBusinessContactEmail,
} = require('./employeeProfile');
const { createPeopleCasesApi } = require('./peopleCasesApi');
const { canManageCases } = require('./peopleCases');
const {
  getLondonDayKey,
  getQuestionForDay,
  resolveBankQuestion,
  publicQuestion,
} = require('./trivia');
const {
  listBadgeTypes,
  isValidBadgeType,
  normalizeMessage,
  normalizeRecipientUids,
  decodeGifPayload,
  serializeKudos,
  loadKudosForRecipient,
  loadKudosSentBy,
  loadKudosHistoryForRecipient,
  countKudosSentToday,
  loadKudosGifLibrary,
  findKudosGifByUrl,
  saveKudosGifToLibrary,
  MAX_MESSAGE_LENGTH,
  MAX_KUDOS_PER_DAY,
  MAX_KUDOS_RECIPIENTS_PER_SEND,
} = require('./kudos');
const {
  getLondonDayKey: getWordleDayKey,
  getAnswerForDay,
  isValidGuess,
  evaluateGuess,
  normalizeWord,
  MAX_GUESSES,
} = require('./wordle');
const {
  getLondonDayKey: getNonogramDayKey,
  getPuzzleForDay,
  resolveDailyPuzzle,
  listPuzzleCatalog,
  listStoredCatalog,
  createStoredPuzzle,
  deleteStoredPuzzle,
  scheduleStoredPuzzle,
  publicPuzzle,
  normalizeMarks,
  flattenMarks,
  isSolved,
  findWrongFills,
  serializeNonogramGame,
  formatDuration,
  SIZE: NONOGRAM_SIZE,
  MAX_LIVES: NONOGRAM_MAX_LIVES,
  MIN_SIZE: NONOGRAM_MIN_SIZE,
  MAX_SIZE: NONOGRAM_MAX_SIZE,
  PIXEL_PALETTE: NONOGRAM_PIXEL_PALETTE,
} = require('./nonogram');
const {
  getLondonDayKey: getSokobanDayKey,
  getPuzzleForDay: getSokobanPuzzleForDay,
  listUpcomingPuzzles: listUpcomingSokobanPuzzles,
  publicPuzzle: publicSokobanPuzzle,
  puzzleEngine,
  applyMove: applySokobanMove,
  replayMoves: replaySokobanMoves,
  normalizeDirection: normalizeSokobanDirection,
  isSolved: isSokobanSolved,
  serializeSokobanGame,
  createInitialGame: createInitialSokobanGame,
} = require('./sokoban');
const {
  getLondonDayKey: getBoggleDayKey,
  publicPuzzle: publicBogglePuzzle,
  evaluateWords: evaluateBoggleWords,
  serializeBoggleGame,
  ensureWordSet: ensureBoggleWordSet,
  getDictionaryUrl: getBoggleDictionaryUrl,
  ROUND_SECONDS: BOGGLE_ROUND_SECONDS,
} = require('./boggle');
const {
  getLondonDayKey: getConnectionsDayKey,
  getPuzzleForDay: getConnectionsPuzzleForDay,
  publicPuzzle: publicConnectionsPuzzle,
  evaluateGuesses: evaluateConnectionsGuesses,
  serializeConnectionsGame,
  MAX_MISTAKES: CONNECTIONS_MAX_MISTAKES,
  DIFFICULTIES: CONNECTIONS_DIFFICULTIES,
} = require('./connections');
const {
  getEncloseDayKey,
  resolveEnclosePuzzle,
  publicEnclosePuzzle,
  evaluateEncloseSubmission,
  serializeEncloseGame,
  ENCLOSE_LIVE_FROM,
} = require('./enclose');
const {
  getLondonDayKey: getLetterboxDayKey,
  getPuzzleForDay: getLetterboxPuzzleForDay,
  publicPuzzle: publicLetterboxPuzzle,
  evaluateChain: evaluateLetterboxChain,
  serializeLetterboxGame,
  compareLetterboxRows,
  resultLabel: letterboxResultLabel,
  LETTERBOX_LIVE_FROM,
} = require('./letterbox');
const {
  getLondonDayKey: getPipesDayKey,
  getPuzzleForDay: getPipesPuzzleForDay,
  publicPuzzle: publicPipesPuzzle,
  evaluateRotations: evaluatePipesRotations,
  serializePipesGame,
  comparePipesRows,
  pipesResultLabel,
  PIPES_LIVE_FROM,
} = require('./pipes');
const {
  getLondonDayKey: getToolboxKickDayKey,
  serializeToolboxKickGame,
  compareToolboxKickRows,
  toolboxKickResultLabel,
  clampDistance: clampToolboxKickDistance,
  normalizeMode: normalizeToolboxKickMode,
  TOOLBOX_KICK_LIVE_FROM,
} = require('./toolboxKick');
const {
  recordFunStreakWin,
  recordFunStreakFail,
  loadFunStreaks,
  serializeAchievements,
} = require('./funStreaks');
const {
  getFunRotationForDay,
  assertFunGamePlayable,
  FUN_GAME_ROSTER,
  ROTATION_START_DAY_KEY,
} = require('./funRotation');
const {
  listFunContent,
  saveFunContent,
  deleteFunContent,
  validateTriviaPayload,
  validateConnectionsPayload,
  validateSokobanPayload,
  findPublishedForDay,
  triviaFromContent,
  connectionsFromContent,
  sokobanFromContent,
} = require('./funContent');
const {
  syncDayMedals,
  loadUserMedals,
  backfillAllMedals,
  collectDayKeysFromCollection,
} = require('./funMedals');
const { assignJointRanks, ordinal } = require('./funLeaderboard');
const {
  aggregatePollResults,
  canManagePolls,
  displayAnswer,
  normalizeAnswerKey,
} = require('./polls');
const {
  COLLECTION: EMERGENCY_PHONE_COLLECTION,
  EMERGENCY_PHONE_NUMBER,
  EMERGENCY_PHONE_TEL,
  parseDateKey,
  findCurrentShift,
  weeksSinceLastCover,
  serializeShift,
  canManageEmergencyPhone,
  formatDateLabel,
} = require('./emergencyPhone');

admin.initializeApp({
  storageBucket: process.env.GCLOUD_STORAGE_BUCKET || 'master-user-management.firebasestorage.app',
});

const db = admin.firestore();
const auth = admin.auth();

const gmailUser = defineSecret('GMAIL_USER');
const gmailPass = defineSecret('GMAIL_PASS');
const hrNotificationEmail = defineString('HR_NOTIFICATION_EMAIL', {
  default: 'hradmin@countrylion.co.uk',
});

const SESSION_COOKIE_NAME = '__session';
const SESSION_EXPIRES_IN_MS = 5 * 24 * 60 * 60 * 1000;
const MASTER_ADMIN_ROLE = 'admin';
const ALLOWED_ORIGINS = [
  /^https:\/\/([a-z0-9-]+\.)?countrylion\.co\.uk$/,
  /^https:\/\/master-user-management\.web\.app$/,
  /^https:\/\/master-user-management\.firebaseapp\.com$/,
  'http://localhost:5173',
];

const corsMiddleware = cors({
  origin: ALLOWED_ORIGINS,
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
});

// Wraps an async onRequest handler with CORS and global error catching.
function withCors(handler) {
  return (req, res) => {
    corsMiddleware(req, res, (corsErr) => {
      if (corsErr) {
        res.status(500).json({ error: 'CORS error.' });
        return;
      }

      if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
      }

      handler(req, res).catch((error) => {
        console.error('Unhandled function error', error);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Internal server error.' });
        }
      });
    });
  };
}

function getCookieValue(cookieHeader, cookieName) {
  if (!cookieHeader) return null;

  const matches = cookieHeader
    .split(';')
    .map((p) => p.trim())
    .filter((p) => p.startsWith(`${cookieName}=`))
    .map((p) => decodeURIComponent(p.slice(cookieName.length + 1)).trim())
    .filter((v) => v.length > 0)
    .sort((a, b) => b.length - a.length);

  return matches.length > 0 ? matches[0] : null;
}

function getCookieValues(cookieHeader, cookieName) {
  if (!cookieHeader) return [];

  const values = cookieHeader
    .split(';')
    .map((p) => p.trim())
    .filter((p) => p.startsWith(`${cookieName}=`))
    .map((p) => decodeURIComponent(p.slice(cookieName.length + 1)).trim())
    .filter((v) => v.length > 0);

  return [...new Set(values)];
}

async function verifyAnySessionCookie(cookieHeader) {
  const candidates = getCookieValues(cookieHeader, SESSION_COOKIE_NAME);
  if (candidates.length === 0) return null;

  for (const candidate of candidates) {
    try {
      const decodedClaims = await auth.verifySessionCookie(candidate, true);
      return { decodedClaims, sessionCookie: candidate };
    } catch {
      // Try next candidate in case duplicate cookies contain stale tokens.
    }
  }

  return null;
}

function setSharedSessionCookie(res, sessionCookie) {
  const baseOptions = {
    httpOnly: true,
    maxAge: SESSION_EXPIRES_IN_MS,
    sameSite: 'none',
    secure: true,
    path: '/',
  };

  // Cross-subdomain cookie used by all portals.
  res.cookie(SESSION_COOKIE_NAME, sessionCookie, {
    ...baseOptions,
    domain: '.countrylion.co.uk',
  });

  // Host-only mirror prevents stale host cookies from diverging on employee portal.
  res.cookie(SESSION_COOKIE_NAME, sessionCookie, baseOptions);
}

function clearSharedSessionCookie(res) {
  const baseOptions = {
    httpOnly: true,
    maxAge: 0,
    sameSite: 'none',
    secure: true,
    path: '/',
  };

  res.cookie(SESSION_COOKIE_NAME, '', {
    ...baseOptions,
    domain: '.countrylion.co.uk',
  });

  res.cookie(SESSION_COOKIE_NAME, '', baseOptions);
}

async function getUserProfile(uid) {
  const snapshot = await db.collection('users').doc(uid).get();
  return snapshot.exists ? { uid, ...snapshot.data() } : null;
}

function normalizeContactEmail(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim().toLowerCase();
}

function slugEmailPart(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function buildCountryLionEmailBase(fullName) {
  const parts = String(fullName || '')
    .trim()
    .split(/\s+/)
    .map(slugEmailPart)
    .filter(Boolean);

  if (!parts.length) return '';
  if (parts.length === 1) return parts[0];
  return `${parts[0]}${parts[parts.length - 1]}`;
}

async function isEmailTakenByAnotherUser(email, excludeUid = '') {
  const normalizedEmail = normalizeContactEmail(email);
  if (!normalizedEmail) return false;

  try {
    const authUser = await auth.getUserByEmail(normalizedEmail);
    if (authUser && authUser.uid !== excludeUid) return true;
  } catch (error) {
    const code = error?.code || error?.errorInfo?.code || '';
    if (code && code !== 'auth/user-not-found') {
      throw error;
    }
  }

  const snapshot = await db.collection('users').where('email', '==', normalizedEmail).limit(5).get();
  return snapshot.docs.some((doc) => doc.id !== excludeUid);
}

async function generateCountryLionEmailForName(fullName, excludeUid = '') {
  const base = buildCountryLionEmailBase(fullName);
  if (!base) return '';

  for (let suffix = 0; suffix < 1000; suffix += 1) {
    const local = suffix === 0 ? base : `${base}${suffix}`;
    const candidate = `${local}@countrylion.co.uk`;
    // eslint-disable-next-line no-await-in-loop
    const taken = await isEmailTakenByAnotherUser(candidate, excludeUid);
    if (!taken) return candidate;
  }

  throw new Error('Unable to generate a unique @countrylion.co.uk email for this employee.');
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function applyBusinessContactEmailFields(profile = {}, overrides = {}) {
  const merged = { ...profile, ...overrides };
  return buildContactEmailFields(merged);
}

function isAuthorizedPortalProvisionRequest(req) {
  const headerSecret = req.headers['x-provision-secret'];
  if (!headerSecret) return false;

  const secrets = [
    process.env.ASSESSMENT_PROVISION_SECRET,
    process.env.MENTOR_PROVISION_SECRET,
    process.env.CPC_PROVISION_SECRET,
    process.env.COMPLIANCE_PROVISION_SECRET,
  ].filter(Boolean);

  return secrets.includes(headerSecret);
}

function canLookupBusinessContactEmail(caller, portal) {
  if (!caller || caller.isActive === false) return false;
  if (caller.portalsAccess?.master_admin === MASTER_ADMIN_ROLE) return true;
  if (canEditAllEmployeeFields(caller, getEffectivePortalRole)) return true;
  if (!portal) return false;

  const role = getEffectivePortalRole(caller, portal);
  return role === 'admin' || role === 'manager';
}

async function resolveUserProfileForContactLookup({ uid, email }) {
  if (uid) {
    const profile = await getUserProfile(String(uid).trim());
    if (profile) return profile;
  }

  const normalizedEmail = normalizeContactEmail(email);
  if (!normalizedEmail) return null;

  const snapshot = await db.collection('users').where('email', '==', normalizedEmail).limit(1).get();
  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  return { uid: doc.id, ...doc.data() };
}

// Verifies the __session cookie and returns the admin profile, or null if invalid.
async function getVerifiedAdminFromRequest(req) {
  const verified = await verifyAnySessionCookie(req.headers.cookie);
  if (!verified) return null;

  try {
    const profile = await getUserProfile(verified.decodedClaims.uid);
    if (!profile || !profile.isActive) return null;
    if (profile.portalsAccess?.master_admin !== MASTER_ADMIN_ROLE) return null;
    return profile;
  } catch {
    return null;
  }
}

function sanitizePortalsAccess(portalsAccess) {
  if (!portalsAccess || typeof portalsAccess !== 'object' || Array.isArray(portalsAccess)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(portalsAccess).filter(
      ([, role]) => typeof role === 'string' && role.trim().length > 0,
    ),
  );
}

function sanitizePortalMappings(portalMappings) {
  if (!portalMappings || typeof portalMappings !== 'object' || Array.isArray(portalMappings)) {
    return {};
  }

  const sanitized = {};

  for (const [portalKey, mapping] of Object.entries(portalMappings)) {
    if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) continue;

    const profileId =
      typeof mapping.profileId === 'string' && mapping.profileId.trim().length > 0
        ? mapping.profileId.trim()
        : '';

    const entry = {};
    if (profileId) entry.profileId = profileId;
    if (portalKey === 'cpc_app' && typeof mapping.qualifiesAsDriver === 'boolean') {
      entry.qualifiesAsDriver = mapping.qualifiesAsDriver;
    }

    if (Object.keys(entry).length > 0) {
      sanitized[portalKey] = entry;
    }
  }

  return sanitized;
}

function mergePortalsAccessFillGaps(preferred = {}, fallback = {}) {
  return {
    ...sanitizePortalsAccess(fallback),
    ...sanitizePortalsAccess(preferred),
  };
}

function mergePortalMappingsFillGaps(preferred = {}, fallback = {}) {
  const merged = { ...sanitizePortalMappings(fallback) };
  const primary = sanitizePortalMappings(preferred);

  for (const [portalKey, mapping] of Object.entries(primary)) {
    const existing = merged[portalKey] || {};
    const next = { ...existing };

    if (mapping.profileId) {
      next.profileId = mapping.profileId;
    } else if (!next.profileId && existing.profileId) {
      next.profileId = existing.profileId;
    }

    if (portalKey === 'cpc_app' && typeof mapping.qualifiesAsDriver === 'boolean') {
      next.qualifiesAsDriver = mapping.qualifiesAsDriver;
    } else if (
      portalKey === 'cpc_app'
      && next.qualifiesAsDriver === undefined
      && typeof existing.qualifiesAsDriver === 'boolean'
    ) {
      next.qualifiesAsDriver = existing.qualifiesAsDriver;
    }

    merged[portalKey] = next;
  }

  return sanitizePortalMappings(merged);
}

const DISCIPLINARY_STAGES = new Set([
  'intake',
  'investigation',
  'hearing_invite',
  'hearing',
  'outcome',
  'appeal',
  'closure',
]);

const DISCIPLINARY_CASE_TYPES = new Set([
  'attendance',
  'conduct',
  'performance',
  'policy',
  'other',
]);

const DISCIPLINARY_DOCUMENT_TYPES = new Set([
  'evidence',
  'letter',
  'minutes',
  'warning',
  'outcome',
  'invite',
  'suspension_letter',
  'training_outline',
  'pip_plan',
  'file_note_signed',
  'other',
]);

const MAX_DISCIPLINARY_UPLOAD_BYTES = 10 * 1024 * 1024;

function getSharePointConfig() {
  return {
    tenantId: process.env.MS_GRAPH_TENANT_ID || '',
    clientId: process.env.MS_GRAPH_CLIENT_ID || '',
    clientSecret: process.env.MS_GRAPH_CLIENT_SECRET || '',
  };
}

function toTrimmedString(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function sanitizeDisciplinaryCaseInput(input = {}) {
  const caseType = toTrimmedString(input.caseType).toLowerCase();
  const initialStage = toTrimmedString(input.stage).toLowerCase();
  return {
    employeeUid: toTrimmedString(input.employeeUid),
    caseType: DISCIPLINARY_CASE_TYPES.has(caseType) ? caseType : 'other',
    title: toTrimmedString(input.title),
    summary: toTrimmedString(input.summary),
    severity: toTrimmedString(input.severity).toLowerCase() || 'low',
    managerUid: toTrimmedString(input.managerUid),
    stage: DISCIPLINARY_STAGES.has(initialStage) ? initialStage : 'intake',
    dueAt: toTrimmedString(input.dueAt),
    sourceIncidentId: toTrimmedString(input.sourceIncidentId),
  };
}

function sanitizeAttendanceIncidentInput(input = {}) {
  return {
    employeeUid: toTrimmedString(input.employeeUid),
    incidentType: toTrimmedString(input.incidentType).toLowerCase() || 'late',
    incidentAt: toTrimmedString(input.incidentAt),
    minutesLate: Number.isFinite(Number(input.minutesLate)) ? Number(input.minutesLate) : 0,
    reason: toTrimmedString(input.reason),
    notes: toTrimmedString(input.notes),
  };
}

async function appendDisciplinaryEvent(caseId, eventType, payload, actor) {
  await db.collection('disciplinary_case_events').add({
    caseId,
    eventType,
    payload: payload || {},
    actorUid: actor?.uid || '',
    actorRole: actor?.portalsAccess?.master_admin === MASTER_ADMIN_ROLE ? 'admin' : 'user',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

function buildDuplicateSuggestion(employeeA, employeeB) {
  const score = employeeNameSimilarity(employeeA.fullName, employeeB.fullName);
  const aHasPortal = hasPortalAccount(employeeA);
  const bHasPortal = hasPortalAccount(employeeB);

  let suggestedPrimaryUid = employeeA.uid;
  let reason = 'Alphabetical default';

  if (aHasPortal && !bHasPortal) {
    suggestedPrimaryUid = employeeA.uid;
    reason = 'Has portal login';
  } else if (!aHasPortal && bHasPortal) {
    suggestedPrimaryUid = employeeB.uid;
    reason = 'Has portal login';
  } else if (aHasPortal && bHasPortal) {
    reason = 'Both have portal logins — review carefully';
  }

  return {
    score,
    reason,
    suggestedPrimaryUid,
    employees: [
      buildEmployeeProfileResponse(employeeA),
      buildEmployeeProfileResponse(employeeB),
    ],
  };
}

/**
 * Whether a CPC portal user should appear in driver compliance / delegate lists.
 * Drivers always qualify; trainers/admins only when explicitly flagged in UM.
 * @param {object} user Firestore user profile
 * @return {boolean}
 */
function getCpcQualifiesAsDriver(user) {
  const role = getEffectivePortalRole(user, 'cpc_app');
  if (!role) return false;
  if (role === 'driver') return true;
  if (role === 'trainer' || role === 'admin') {
    return user?.portalMappings?.cpc_app?.qualifiesAsDriver === true;
  }
  return false;
}

function getEffectivePortalRole(profile, portal) {
  const explicitRole = profile?.portalsAccess?.[portal];
  if (typeof explicitRole === 'string' && explicitRole.trim().length > 0) {
    return explicitRole.trim();
  }

  // Master admins implicitly get HR, CPC, and Cases admin access.
  if (portal === 'hr_app' && profile?.portalsAccess?.master_admin === MASTER_ADMIN_ROLE) {
    return 'admin';
  }
  if (portal === 'cpc_app' && profile?.portalsAccess?.master_admin === MASTER_ADMIN_ROLE) {
    return 'admin';
  }
  if (portal === 'cases_app' && profile?.portalsAccess?.master_admin === MASTER_ADMIN_ROLE) {
    return 'admin';
  }

  return '';
}

function buildEffectiveProfile(profile) {
  if (!profile || typeof profile !== 'object') return profile;

  const nextPortalsAccess = {
    ...(profile.portalsAccess || {}),
  };

  if (!nextPortalsAccess.hr_app && profile?.portalsAccess?.master_admin === MASTER_ADMIN_ROLE) {
    nextPortalsAccess.hr_app = 'admin';
  }
  if (!nextPortalsAccess.cases_app && profile?.portalsAccess?.master_admin === MASTER_ADMIN_ROLE) {
    nextPortalsAccess.cases_app = 'admin';
  }
  if (!nextPortalsAccess.cpc_app && profile?.portalsAccess?.master_admin === MASTER_ADMIN_ROLE) {
    nextPortalsAccess.cpc_app = 'admin';
  }

  return {
    ...profile,
    portalsAccess: nextPortalsAccess,
    canIssueKudos: canIssueKudos({ ...profile, portalsAccess: nextPortalsAccess }, getEffectivePortalRole),
  };
}

// Calls the mentor portal's /api/provisionUser endpoint to create or update a user
// profile in the mentor Firestore. Non-blocking — errors are logged but do not fail the caller.
async function provisionMentorUser({ uid, email, fullName, role }) {
  const mentorUrl = process.env.MENTOR_PORTAL_URL;
  const secret = process.env.MENTOR_PROVISION_SECRET;

  if (!mentorUrl || !secret) {
    console.warn('provisionMentorUser: MENTOR_PORTAL_URL or MENTOR_PROVISION_SECRET not configured, skipping.');
    return;
  }

  try {
    const response = await fetch(`${mentorUrl}/api/provisionUser`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-provision-secret': secret,
      },
      body: JSON.stringify({ uid, email, fullName, role }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error(`provisionMentorUser: mentor responded ${response.status} — ${body}`);
    }
  } catch (err) {
    console.error('provisionMentorUser: request failed —', err.message);
  }
}

// Calls the assessment portal's /api/provisionUser endpoint to create or update a user
// profile in the assessment Firestore. Non-blocking - errors are logged but do not fail the caller.
async function provisionAssessmentUser({ uid, email, fullName, role, profileId = '', contactEmail = '' }) {
  const assessmentUrl = process.env.ASSESSMENT_PORTAL_URL;
  const secret = process.env.ASSESSMENT_PROVISION_SECRET;

  if (!assessmentUrl || !secret) {
    console.warn('provisionAssessmentUser: ASSESSMENT_PORTAL_URL or ASSESSMENT_PROVISION_SECRET not configured, skipping.');
    return;
  }

  try {
    const response = await fetch(`${assessmentUrl}/api/provisionUser`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-provision-secret': secret,
      },
      body: JSON.stringify({ uid, email, fullName, role, profileId, contactEmail }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error(`provisionAssessmentUser: assessment responded ${response.status} - ${body}`);
    }
  } catch (err) {
    console.error('provisionAssessmentUser: request failed -', err.message);
  }
}

// Calls the CPC portal's /api/provisionUser endpoint to create or update a driver profile.
// Non-blocking — errors are logged but do not fail the caller.
async function provisionCpcUser({ uid, email, fullName, role, portalMappings = {}, previousUid = '' }) {
  const cpcUrl = process.env.CPC_PORTAL_URL;
  const secret = process.env.CPC_PROVISION_SECRET;

  if (!cpcUrl || !secret) {
    console.warn('provisionCpcUser: CPC_PORTAL_URL or CPC_PROVISION_SECRET not configured, skipping.');
    return;
  }

  const qualifiesAsDriver = getCpcQualifiesAsDriver({
    portalsAccess: { cpc_app: role },
    portalMappings,
  });

  try {
    const response = await fetch(`${cpcUrl}/api/provisionUser`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-provision-secret': secret,
      },
      body: JSON.stringify({
        uid,
        email,
        fullName,
        role,
        qualifiesAsDriver,
        portalMappings,
        previousUid,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error(`provisionCpcUser: CPC portal responded ${response.status} - ${body}`);
    }
  } catch (err) {
    console.error('provisionCpcUser: request failed -', err.message);
  }
}

// Calls the Weekend Availability / compliance portal provision endpoint.
// Creates or links a local users/{initials} profile. Non-blocking.
async function provisionComplianceUser({ uid, email, fullName, role, profileId = '' }) {
  const complianceUrl = process.env.COMPLIANCE_PORTAL_URL;
  const secret = process.env.COMPLIANCE_PROVISION_SECRET;

  if (!complianceUrl || !secret) {
    console.warn(
      'provisionComplianceUser: COMPLIANCE_PORTAL_URL or COMPLIANCE_PROVISION_SECRET not configured, skipping.',
    );
    return null;
  }

  try {
    const response = await fetch(`${complianceUrl}/api/provisionUser`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-provision-secret': secret,
      },
      body: JSON.stringify({ uid, email, fullName, role, profileId }),
    });

    const bodyText = await response.text().catch(() => '');
    let payload = null;
    try {
      payload = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      console.error(`provisionComplianceUser: compliance responded ${response.status} - ${bodyText}`);
      return null;
    }

    const initials =
      typeof payload?.initials === 'string' && payload.initials.trim()
        ? payload.initials.trim().toUpperCase()
        : '';

    // Only write back profileId when we still need one, or when the portal
    // confirmed the same mapped initials. Never overwrite a deliberate mapping
    // with a different auto-generated initials value.
    if (initials) {
      try {
        const userRef = db.collection('users').doc(uid);
        const snap = await userRef.get();
        const existingMappings =
          snap.exists && snap.data()?.portalMappings && typeof snap.data().portalMappings === 'object'
            ? snap.data().portalMappings
            : {};
        const existingProfileId =
          typeof existingMappings.compliance_app?.profileId === 'string'
            ? existingMappings.compliance_app.profileId.trim().toUpperCase()
            : '';
        const providedProfileId =
          typeof profileId === 'string' && profileId.trim() ? profileId.trim().toUpperCase() : '';

        const shouldWrite =
          !existingProfileId ||
          existingProfileId === initials ||
          (providedProfileId && providedProfileId === initials);

        if (shouldWrite) {
          await userRef.set(
            {
              portalMappings: {
                ...existingMappings,
                compliance_app: {
                  ...(existingMappings.compliance_app || {}),
                  profileId: initials,
                },
              },
            },
            { merge: true },
          );
        } else {
          console.warn(
            `provisionComplianceUser: keeping existing mapping ${existingProfileId}, ignoring returned ${initials}`,
          );
        }
      } catch (mapErr) {
        console.error('provisionComplianceUser: failed to write portalMappings -', mapErr.message);
      }
    }

    return payload;
  } catch (err) {
    console.error('provisionComplianceUser: request failed -', err.message);
    return null;
  }
}

async function provisionTrainingUser({ uid, email, fullName, role }) {
  const trainingUrl = process.env.TRAINING_PORTAL_URL;
  const secret = process.env.TRAINING_PROVISION_SECRET;

  if (!trainingUrl || !secret) {
    console.warn('provisionTrainingUser: TRAINING_PORTAL_URL or TRAINING_PROVISION_SECRET not configured, skipping.');
    return;
  }

  try {
    const response = await fetch(`${trainingUrl}/api/provisionUser`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-provision-secret': secret,
      },
      body: JSON.stringify({ uid, email, fullName, role }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error(`provisionTrainingUser: training responded ${response.status} — ${body}`);
    }
  } catch (err) {
    console.error('provisionTrainingUser: request failed —', err.message);
  }
}

async function provisionHolidaysUser({ uid, email, fullName, role, profile }) {
  const holidaysUrl = process.env.HOLIDAYS_PORTAL_URL;
  const secret = process.env.HOLIDAYS_PROVISION_SECRET;

  if (!holidaysUrl || !secret) {
    console.warn('provisionHolidaysUser: HOLIDAYS_PORTAL_URL or HOLIDAYS_PROVISION_SECRET not configured, skipping.');
    return;
  }

  const employeeProfile = profile?.employeeProfile || {};

  try {
    const response = await fetch(`${holidaysUrl}/api/provisionUser`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-provision-secret': secret,
      },
      body: JSON.stringify({
        uid,
        email,
        fullName,
        role,
        portalsAccess: profile?.portalsAccess || {},
        employeeProfile: {
          department: employeeProfile.department || '',
          jobRole: employeeProfile.jobRole || '',
          managerUid: employeeProfile.managerUid || '',
          managerName: employeeProfile.managerName || '',
          managerEmail: employeeProfile.managerEmail || '',
          isDriver: employeeProfile.isDriver === true,
          canDrive: employeeProfile.canDrive === true,
          startDate: employeeProfile.startDate || employeeProfile.hireDate || '',
          contractType: employeeProfile.contractType || '',
          hoursPerWeek: Number(employeeProfile.hoursPerWeek || 0),
          fte: Number(employeeProfile.fte || 0),
          termTimeWeeks: Number(employeeProfile.termTimeWeeks || 0),
          holidaySchemeId: employeeProfile.holidaySchemeId || '',
          loyaltyDays: Number(employeeProfile.loyaltyDays || 0),
          carryOverDays: Number(employeeProfile.carryOverDays || 0),
          bankInLieuBalance: Number(employeeProfile.bankInLieuBalance || 0),
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error(`provisionHolidaysUser: holidays responded ${response.status} - ${body}`);
    }
  } catch (err) {
    console.error('provisionHolidaysUser: request failed -', err.message);
  }
}

// POST { idToken } → sets __session cookie
exports.loginWithCookie = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const idToken = req.body?.idToken;

    if (!idToken || typeof idToken !== 'string') {
      res.status(400).json({ error: 'idToken is required.' });
      return;
    }

    const decodedToken = await auth.verifyIdToken(idToken, true);
    const profile = await getUserProfile(decodedToken.uid);

    if (!profile) {
      res.status(403).json({ error: 'User profile not found.' });
      return;
    }

    if (!profile.isActive) {
      res.status(403).json({ error: 'User account is inactive.' });
      return;
    }

    if (profile.portalsAccess?.master_admin !== MASTER_ADMIN_ROLE) {
      res.status(403).json({ error: 'Master admin access is required.' });
      return;
    }

    const sessionCookie = await auth.createSessionCookie(idToken, {
      expiresIn: SESSION_EXPIRES_IN_MS,
    });

    setSharedSessionCookie(res, sessionCookie);

    res.status(200).json({ status: 'ok' });
  }),
);

// POST { idToken } → sets __session cookie for any active portal user
exports.loginPortalUser = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const idToken = req.body?.idToken;

    if (!idToken || typeof idToken !== 'string') {
      res.status(400).json({ error: 'idToken is required.' });
      return;
    }

    const decodedToken = await auth.verifyIdToken(idToken, true);
    const profile = await getUserProfile(decodedToken.uid);

    if (!profile) {
      res.status(403).json({ error: 'User profile not found.' });
      return;
    }

    if (!profile.isActive) {
      res.status(403).json({ error: 'User account is inactive.' });
      return;
    }

    const sessionCookie = await auth.createSessionCookie(idToken, {
      expiresIn: SESSION_EXPIRES_IN_MS,
    });

    setSharedSessionCookie(res, sessionCookie);

    // Return effective access (including implicit HR for master admins) for redirect logic.
    res.status(200).json({ status: 'ok', user: buildEffectiveProfile(profile) });
  }),
);

// POST → clears the __session cookie for cross-subdomain logout
exports.logoutPortalUser = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    clearSharedSessionCookie(res);

    res.status(200).json({ status: 'ok' });
  }),
);

// GET → returns current admin profile if session cookie is valid
exports.verifySession = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const adminProfile = await getVerifiedAdminFromRequest(req);

    if (!adminProfile) {
      res.status(401).json({ error: 'Not authenticated.' });
      return;
    }

    const verified = await verifyAnySessionCookie(req.headers.cookie);
    if (verified?.sessionCookie) {
      setSharedSessionCookie(res, verified.sessionCookie);
    }

    res.status(200).json({ user: buildEffectiveProfile(adminProfile) });
  }),
);

// POST { email, password, fullName, isActive?, portalsAccess?, portalMappings? } → creates Firebase Auth user + Firestore profile
exports.adminCreateUser = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const caller = await getVerifiedAdminFromRequest(req);

    if (!caller) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const {
      email,
      password,
      fullName,
      isActive = true,
      portalsAccess = {},
      portalMappings = {},
      businessCommsEmail,
    } = req.body || {};

    if (!email || !password || !fullName) {
      res.status(400).json({ error: 'email, password, and fullName are required.' });
      return;
    }

    const contactFields = applyBusinessContactEmailFields({
      email,
      businessCommsEmail: normalizeBusinessCommsEmail(businessCommsEmail),
    });

    try {
      const userRecord = await auth.createUser({
        email,
        password,
        displayName: fullName,
        disabled: !isActive,
      });

      const sanitizedPortalsAccess = sanitizePortalsAccess(portalsAccess);

      const sanitizedPortalMappings = sanitizePortalMappings(portalMappings);

      await db.collection('users').doc(userRecord.uid).set({
        email,
        fullName,
        isActive: Boolean(isActive),
        portalsAccess: sanitizedPortalsAccess,
        portalMappings: sanitizedPortalMappings,
        businessCommsEmail: contactFields.businessCommsEmail,
        contactEmail: contactFields.contactEmail,
      });

      await provisionPortalUsers(
        userRecord.uid,
        sanitizedPortalsAccess,
        {
          email,
          fullName,
          businessCommsEmail: contactFields.businessCommsEmail,
          contactEmail: contactFields.contactEmail,
        },
        sanitizedPortalMappings,
      );

      res.status(201).json({ uid: userRecord.uid, message: 'User created successfully.' });
    } catch (error) {
      const code = error?.code || error?.errorInfo?.code || '';

      if (code === 'auth/email-already-exists') {
        res.status(409).json({ error: 'A user with this email already exists.' });
        return;
      }

      if (code === 'auth/invalid-password') {
        res.status(400).json({ error: 'Password must be at least 6 characters.' });
        return;
      }

      if (code === 'auth/invalid-email') {
        res.status(400).json({ error: 'The email address is invalid.' });
        return;
      }

      console.error('adminCreateUser failed', error);
      res.status(500).json({ error: 'Failed to create user.' });
    }
  }),
);

// POST { uid, password?, portalsAccess?, portalMappings?, isActive? }
// Creates a Firebase Auth login for an existing HR-only employee record and migrates their profile.
exports.adminEnablePortalLogin = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const caller = await getVerifiedAdminFromRequest(req);
    if (!caller) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const {
      uid,
      password = 'socket',
      isActive,
      portalsAccess = {},
      portalMappings = {},
    } = req.body || {};

    if (!uid || typeof uid !== 'string') {
      res.status(400).json({ error: 'uid is required.' });
      return;
    }

    if (typeof password !== 'string' || password.length < 6) {
      res.status(400).json({ error: 'password must be at least 6 characters.' });
      return;
    }

    try {
      const existing = await getUserProfile(uid);
      if (!existing) {
        res.status(404).json({ error: 'Employee record not found.' });
        return;
      }

      if (existing.hasPortalAccount !== false) {
        res.status(400).json({ error: 'This employee already has a portal login.' });
        return;
      }

      const email = normalizeContactEmail(existing.email);
      if (!email || !isValidEmail(email)) {
        res.status(400).json({
          error: 'A valid work email is required before creating a portal login.',
        });
        return;
      }

      const active = typeof isActive === 'boolean' ? isActive : existing.isActive !== false;
      const sanitizedPortalsAccess = sanitizePortalsAccess(portalsAccess);
      const sanitizedPortalMappings = sanitizePortalMappings(portalMappings);

      let targetUid = uid;
      let createdAuth = false;
      const previousUid = uid;

      try {
        const authUser = await auth.getUserByEmail(email);
        targetUid = authUser.uid;

        if (targetUid !== uid) {
          const authProfile = await getUserProfile(targetUid);
          if (authProfile && authProfile.hasPortalAccount !== false) {
            res.status(409).json({
              error: 'A portal account with this work email already exists.',
            });
            return;
          }

          const mergedPortalsAccess = mergePortalsAccessFillGaps(
            sanitizedPortalsAccess,
            mergePortalsAccessFillGaps(existing.portalsAccess || {}, authProfile?.portalsAccess || {}),
          );
          const mergedPortalMappings = mergePortalMappingsFillGaps(
            sanitizedPortalMappings,
            mergePortalMappingsFillGaps(existing.portalMappings || {}, authProfile?.portalMappings || {}),
          );

          const mergedProfile = {
            ...authProfile,
            ...existing,
            email,
            fullName: existing.fullName || authProfile?.fullName || '',
            employeeProfile: mergeEmployeeProfiles(
              authProfile?.employeeProfile,
              existing.employeeProfile,
            ),
            hasPortalAccount: true,
            isActive: active,
            portalsAccess: mergedPortalsAccess,
            portalMappings: mergedPortalMappings,
            employeeProfileUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          };
          const contactFields = buildContactEmailFields(mergedProfile);
          mergedProfile.businessCommsEmail = contactFields.businessCommsEmail;
          mergedProfile.contactEmail = contactFields.contactEmail;

          await db.collection('users').doc(targetUid).set(mergedProfile, { merge: true });
          await db.collection('users').doc(uid).delete();
          await auth.updateUser(targetUid, {
            password,
            displayName: existing.fullName || undefined,
            disabled: !active,
          });
        } else {
          await auth.updateUser(targetUid, {
            password,
            displayName: existing.fullName || undefined,
            disabled: !active,
          });
        }
      } catch (authErr) {
        if (authErr?.code !== 'auth/user-not-found') {
          throw authErr;
        }

        const userRecord = await auth.createUser({
          email,
          password,
          displayName: existing.fullName || '',
          disabled: !active,
        });

        targetUid = userRecord.uid;
        createdAuth = true;

        const mergedPortalsAccess = mergePortalsAccessFillGaps(
          sanitizedPortalsAccess,
          existing.portalsAccess || {},
        );
        const mergedPortalMappings = mergePortalMappingsFillGaps(
          sanitizedPortalMappings,
          existing.portalMappings || {},
        );

        const migratedProfile = {
          email,
          fullName: existing.fullName || '',
          isActive: active,
          hasPortalAccount: true,
          portalsAccess: mergedPortalsAccess,
          portalMappings: mergedPortalMappings,
          employeeProfile: existing.employeeProfile || {},
          employeeProfileUpdatedAt: existing.employeeProfileUpdatedAt || null,
          hrDataImportedAt: existing.hrDataImportedAt || null,
        };
        const contactFields = buildContactEmailFields({
          ...existing,
          ...migratedProfile,
        });
        migratedProfile.businessCommsEmail = contactFields.businessCommsEmail;
        migratedProfile.contactEmail = contactFields.contactEmail;

        await db.collection('users').doc(targetUid).set(migratedProfile);
        if (targetUid !== uid) {
          await db.collection('users').doc(uid).delete();
        }
      }

      if (!createdAuth && targetUid === uid) {
        const mergedPortalsAccess = mergePortalsAccessFillGaps(
          sanitizedPortalsAccess,
          existing.portalsAccess || {},
        );
        const mergedPortalMappings = mergePortalMappingsFillGaps(
          sanitizedPortalMappings,
          existing.portalMappings || {},
        );

        await db.collection('users').doc(targetUid).set(
          {
            hasPortalAccount: true,
            isActive: active,
            portalsAccess: mergedPortalsAccess,
            portalMappings: mergedPortalMappings,
          },
          { merge: true },
        );
      }

      const updatedProfile = await getUserProfile(targetUid);
      const provisionProfile = {
        ...updatedProfile,
        previousUid: previousUid !== targetUid ? previousUid : '',
      };
      await provisionPortalUsers(
        targetUid,
        updatedProfile.portalsAccess || sanitizedPortalsAccess,
        provisionProfile,
        updatedProfile.portalMappings || sanitizedPortalMappings,
      );

      res.status(200).json({
        uid: targetUid,
        previousUid: uid !== targetUid ? uid : undefined,
        message: 'Portal login created successfully.',
      });
    } catch (error) {
      const code = error?.code || error?.errorInfo?.code || '';
      if (code === 'auth/email-already-exists') {
        res.status(409).json({ error: 'A portal account with this work email already exists.' });
        return;
      }
      if (code === 'auth/invalid-password') {
        res.status(400).json({ error: 'Password must be at least 6 characters.' });
        return;
      }
      console.error('adminEnablePortalLogin failed', error);
      res.status(500).json({ error: 'Failed to create portal login.' });
    }
  }),
);

// POST { uid, email?, fullName?, isActive?, portalsAccess?, portalMappings? } → updates Firebase Auth + Firestore profile
exports.adminUpdateUser = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const caller = await getVerifiedAdminFromRequest(req);

    if (!caller) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const {
      uid,
      email,
      fullName,
      isActive,
      portalsAccess = {},
      portalMappings = {},
      businessCommsEmail,
    } = req.body || {};

    if (!uid) {
      res.status(400).json({ error: 'uid is required.' });
      return;
    }

    const existingProfile = await getUserProfile(uid);
    if (!existingProfile) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const authUpdate = {};
    if (typeof email === 'string' && email.trim()) authUpdate.email = email.trim();
    if (typeof fullName === 'string' && fullName.trim()) authUpdate.displayName = fullName.trim();
    if (typeof isActive === 'boolean') authUpdate.disabled = !isActive;

    if (Object.keys(authUpdate).length > 0) {
      await auth.updateUser(uid, authUpdate);
    }

    const sanitizedPortalsAccess = sanitizePortalsAccess(portalsAccess);

    const sanitizedPortalMappings = sanitizePortalMappings(portalMappings);

    const firestoreUpdate = {
      uid,
      portalsAccess: sanitizedPortalsAccess,
      portalMappings: sanitizedPortalMappings,
    };
    if (typeof email === 'string' && email.trim()) firestoreUpdate.email = email.trim();
    if (typeof fullName === 'string' && fullName.trim()) firestoreUpdate.fullName = fullName.trim();
    if (typeof isActive === 'boolean') firestoreUpdate.isActive = isActive;
    if (businessCommsEmail !== undefined) {
      firestoreUpdate.businessCommsEmail = normalizeBusinessCommsEmail(businessCommsEmail);
    }

    const contactFields = applyBusinessContactEmailFields(existingProfile, firestoreUpdate);
    if (
      contactFields.businessCommsEmail === 'personal'
      && !contactFields.personalEmail
    ) {
      res.status(400).json({
        error: 'Add a personal email before selecting personal email for business communications.',
      });
      return;
    }
    firestoreUpdate.businessCommsEmail = contactFields.businessCommsEmail;
    firestoreUpdate.contactEmail = contactFields.contactEmail;

    await db.collection('users').doc(uid).set(firestoreUpdate, { merge: true });

    const updatedProfile = await getUserProfile(uid);
    await provisionPortalUsers(uid, sanitizedPortalsAccess, updatedProfile, sanitizedPortalMappings);

    res.status(200).json({ uid, message: 'User updated successfully.' });
  }),
);

/**
 * Provisions downstream portal users after portalsAccess changes.
 * @param {string} uid User id
 * @param {object} portalsAccess Sanitized portal roles
 * @param {object} profile Existing user profile
 * @param {object} portalMappings Sanitized portal mappings
 * @return {Promise<void>}
 */
async function provisionPortalUsers(uid, portalsAccess, profile, portalMappings) {
  const mentoringRole = portalsAccess.mentoring_app;
  if (mentoringRole) {
    await provisionMentorUser({
      uid,
      email: profile?.email || '',
      fullName: profile?.fullName || '',
      role: mentoringRole,
    });
  }

  const assessmentRole = portalsAccess.assessment_app;
  if (assessmentRole) {
    await provisionAssessmentUser({
      uid,
      email: profile?.email || '',
      fullName: profile?.fullName || '',
      role: assessmentRole,
      profileId: portalMappings.assessment_app?.profileId || '',
      contactEmail: resolveBusinessContactEmail(profile),
    });
  }

  const cpcRole = portalsAccess.cpc_app;
  if (cpcRole) {
    await provisionCpcUser({
      uid,
      email: profile?.email || '',
      fullName: profile?.fullName || '',
      role: cpcRole,
      portalMappings,
      previousUid: profile?.previousUid || '',
    });
  }

  const complianceRole = portalsAccess.compliance_app;
  if (complianceRole) {
    await provisionComplianceUser({
      uid,
      email: profile?.email || '',
      fullName: profile?.fullName || '',
      role: complianceRole,
      profileId: portalMappings?.compliance_app?.profileId || '',
    });
  }

  const trainingRole = portalsAccess.training_app;
  if (trainingRole) {
    await provisionTrainingUser({
      uid,
      email: profile?.email || '',
      fullName: profile?.fullName || '',
      role: trainingRole,
    });
  }

  // Every employee gets a holidays profile record, even without portal access yet.
  await provisionHolidaysUser({
    uid,
    email: profile?.email || '',
    fullName: profile?.fullName || '',
    role: portalsAccess.holidays_app || '',
    profile,
  });
}

// POST { updates: [{ uid, portalsAccess }] } → bulk portal role updates (admin only)
exports.adminBulkUpdatePortals = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const caller = await getVerifiedAdminFromRequest(req);
    if (!caller) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const updates = Array.isArray(req.body?.updates) ? req.body.updates : [];
    if (updates.length === 0) {
      res.status(400).json({ error: 'updates array is required.' });
      return;
    }
    if (updates.length > 200) {
      res.status(400).json({ error: 'Too many updates in one request (max 200).' });
      return;
    }

    let updatedCount = 0;
    const errors = [];

    for (const item of updates) {
      const uid = typeof item?.uid === 'string' ? item.uid.trim() : '';
      if (!uid) {
        errors.push({ uid: '', error: 'uid is required.' });
        continue;
      }

      try {
        const existing = await getUserProfile(uid);
        if (!existing) {
          errors.push({ uid, error: 'User not found.' });
          continue;
        }

        const sanitizedPortalsAccess = sanitizePortalsAccess(item.portalsAccess || {});
        let portalMappings = sanitizePortalMappings(existing.portalMappings || {});

        if (item.portalMappings && typeof item.portalMappings === 'object') {
          const incomingMappings = item.portalMappings;
          portalMappings = mergePortalMappingsFillGaps(
            sanitizePortalMappings(incomingMappings),
            portalMappings,
          );

          // Allow bulk matrix to clear Weekend Availability initials explicitly.
          if (Object.prototype.hasOwnProperty.call(incomingMappings, 'compliance_app')) {
            const profileId = incomingMappings.compliance_app?.profileId;
            if (typeof profileId !== 'string' || !profileId.trim()) {
              const { compliance_app: _removed, ...restMappings } = portalMappings;
              portalMappings = restMappings;
            }
          }
        }

        if (sanitizedPortalsAccess.cpc_app === 'driver') {
          portalMappings = mergePortalMappingsFillGaps(
            { cpc_app: { qualifiesAsDriver: true } },
            portalMappings,
          );
        }

        await db.collection('users').doc(uid).set(
          {
            portalsAccess: sanitizedPortalsAccess,
            portalMappings,
          },
          { merge: true },
        );

        const updatedProfile = await getUserProfile(uid);
        await provisionPortalUsers(uid, sanitizedPortalsAccess, updatedProfile, portalMappings);
        updatedCount += 1;
      } catch (err) {
        console.error('adminBulkUpdatePortals row failed', uid, err);
        errors.push({ uid, error: 'Update failed.' });
      }
    }

    res.status(200).json({
      updatedCount,
      errors,
      message: `Updated ${updatedCount} user(s).`,
    });
  }),
);

// GET /api/getBusinessContactEmail?uid=...&email=...&portal=assessment_app
// Returns the live business contact email from the employee database.
// Auth: portal admin/manager session, HR/manager access, master admin, or portal provision secret.
exports.getBusinessContactEmail = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const portal = typeof req.query.portal === 'string' ? req.query.portal.trim() : '';
    const uid = typeof req.query.uid === 'string' ? req.query.uid.trim() : '';
    const email = typeof req.query.email === 'string' ? req.query.email.trim() : '';

    if (!uid && !email) {
      res.status(400).json({ error: 'uid or email query parameter is required.' });
      return;
    }

    const hasProvisionSecret = isAuthorizedPortalProvisionRequest(req);
    let caller = null;

    if (!hasProvisionSecret) {
      const verified = await verifyAnySessionCookie(req.headers.cookie);
      if (!verified) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }

      caller = await getUserProfile(verified.decodedClaims.uid);
      if (!canLookupBusinessContactEmail(caller, portal)) {
        res.status(403).json({ error: 'You do not have permission to look up business contact emails.' });
        return;
      }

      if (verified.sessionCookie) {
        setSharedSessionCookie(res, verified.sessionCookie);
      }
    }

    try {
      const profile = await resolveUserProfileForContactLookup({ uid, email });
      if (!profile) {
        res.status(404).json({ error: 'Employee not found.' });
        return;
      }

      const contactFields = buildContactEmailFields(profile);
      const employeeProfile = mergeEmployeeProfiles(profile.employeeProfile || {});

      res.status(200).json({
        uid: profile.uid,
        email: profile.email || '',
        personalEmail: employeeProfile.personalEmail || '',
        businessCommsEmail: contactFields.businessCommsEmail,
        contactEmail: contactFields.contactEmail,
      });
    } catch (error) {
      console.error('getBusinessContactEmail failed', error);
      res.status(500).json({ error: 'Failed to resolve business contact email.' });
    }
  }),
);

// GET /api/verifyPortalSession?portal=mentoring_app
// Returns the user profile if the session cookie is valid and the user has access to the requested portal.
// Used by sub-apps (e.g. mentor portal) to validate the shared SSO cookie without requiring master_admin role.
exports.verifyPortalSession = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const portal = req.query.portal;
    if (!portal || typeof portal !== 'string') {
      res.status(400).json({ error: 'portal query parameter is required.' });
      return;
    }

    const verified = await verifyAnySessionCookie(req.headers.cookie);
    if (!verified) {
      res.status(401).json({ error: 'Not authenticated.' });
      return;
    }

    try {
      const profile = await getUserProfile(verified.decodedClaims.uid);

      if (!profile || !profile.isActive) {
        res.status(401).json({ error: 'Not authenticated.' });
        return;
      }

      const role = getEffectivePortalRole(profile, portal);
      if (!role) {
        res.status(403).json({ error: `Access to ${portal} is not granted.` });
        return;
      }

      setSharedSessionCookie(res, verified.sessionCookie);
      res.status(200).json({ user: buildEffectiveProfile(profile), role });
    } catch {
      res.status(401).json({ error: 'Not authenticated.' });
    }
  }),
);

/**
 * Lists active users who have CPC portal access.
 * Always uses the Firestore document id as uid (never a stale uid field on the doc).
 * @return {Promise<object[]>}
 */
async function listActiveCpcPortalUsers() {
  const snapshot = await db.collection('users').get();
  return snapshot.docs
    .map((doc) => {
      const data = doc.data() || {};
      return { ...data, uid: doc.id };
    })
    .filter((user) => user.isActive !== false && getEffectivePortalRole(user, 'cpc_app'))
    .map((user) => {
      const role = getEffectivePortalRole(user, 'cpc_app');
      return {
        uid: user.uid,
        email: user.email || '',
        fullName: user.fullName || '',
        role,
        qualifiesAsDriver: getCpcQualifiesAsDriver(user),
        portalMappings: user.portalMappings || {},
      };
    })
    .sort((a, b) => (a.fullName || a.email).localeCompare(b.fullName || b.email));
}

// GET — service-to-service employee list for Holidays portal profile sync.
exports.getUsersForHolidaysSync = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const secret = process.env.HOLIDAYS_PROVISION_SECRET;
    if (!secret || req.headers['x-provision-secret'] !== secret) {
      res.status(401).json({ error: 'Invalid or missing provision secret.' });
      return;
    }

    try {
      const snap = await db.collection('users').get();
      const users = snap.docs
        .map((doc) => {
          const data = doc.data() || {};
          const employeeProfile = data.employeeProfile || {};
          return {
            uid: doc.id,
            email: data.email || '',
            fullName: data.fullName || '',
            isActive: data.isActive !== false,
            portalsAccess: data.portalsAccess || {},
            employeeProfile: {
              department: employeeProfile.department || '',
              jobRole: employeeProfile.jobRole || '',
              managerUid: employeeProfile.managerUid || '',
              managerName: employeeProfile.managerName || '',
              managerEmail: employeeProfile.managerEmail || '',
              isDriver: employeeProfile.isDriver === true,
              canDrive: employeeProfile.canDrive === true,
              startDate: employeeProfile.startDate || employeeProfile.hireDate || '',
              contractType: employeeProfile.contractType || '',
              hoursPerWeek: Number(employeeProfile.hoursPerWeek || 0),
              fte: Number(employeeProfile.fte || 0),
              termTimeWeeks: Number(employeeProfile.termTimeWeeks || 0),
              holidaySchemeId: employeeProfile.holidaySchemeId || '',
              loyaltyDays: Number(employeeProfile.loyaltyDays || 0),
              carryOverDays: Number(employeeProfile.carryOverDays || 0),
              bankInLieuBalance: Number(employeeProfile.bankInLieuBalance || 0),
            },
          };
        })
        .filter((user) => user.isActive !== false && (user.fullName || user.email))
        .sort((a, b) =>
          String(a.fullName || a.email).localeCompare(String(b.fullName || b.email), 'en', {
            sensitivity: 'base',
          }),
        );

      res.status(200).json({ users });
    } catch (err) {
      console.error('getUsersForHolidaysSync failed', err);
      res.status(500).json({ error: 'Failed to list users for holidays sync.' });
    }
  }),
);

// GET — service-to-service employee list for Training Matrix import matching.
exports.getUsersForTrainingSync = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const secret = process.env.TRAINING_PROVISION_SECRET;
    if (!secret || req.headers['x-provision-secret'] !== secret) {
      res.status(401).json({ error: 'Invalid or missing provision secret.' });
      return;
    }

    try {
      const snap = await db.collection('users').get();
      const users = snap.docs
        .map((doc) => {
          const data = doc.data() || {};
          return {
            uid: doc.id,
            email: data.email || '',
            fullName: data.fullName || '',
            isActive: data.isActive !== false,
            trainingRole: getEffectivePortalRole({ ...data, uid: doc.id }, 'training_app') || '',
          };
        })
        .filter((user) => user.isActive && user.fullName)
        .sort((a, b) => a.fullName.localeCompare(b.fullName));

      res.status(200).json({ users });
    } catch (err) {
      console.error('getUsersForTrainingSync failed', err);
      res.status(500).json({ error: 'Failed to list users for training sync.' });
    }
  }),
);

// GET — service-to-service CPC driver sync (CPC portal Cloud Function).
exports.getCpcPortalUsersForSync = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const secret = process.env.CPC_PROVISION_SECRET;
    if (!secret || req.headers['x-provision-secret'] !== secret) {
      res.status(401).json({ error: 'Invalid or missing provision secret.' });
      return;
    }

    try {
      const users = await listActiveCpcPortalUsers();
      res.status(200).json({ users });
    } catch (err) {
      console.error('getCpcPortalUsersForSync failed', err);
      res.status(500).json({ error: 'Failed to fetch CPC portal users.' });
    }
  }),
);

// GET /api/getPortalUsers?portal=routes_app
// Returns active users who have access to the requested portal.
// Caller must have manager or admin access for that same portal.
exports.getPortalUsers = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const portal = req.query.portal;
    if (!portal || typeof portal !== 'string') {
      res.status(400).json({ error: 'portal query parameter is required.' });
      return;
    }

    const verified = await verifyAnySessionCookie(req.headers.cookie);
    if (!verified) {
      res.status(401).json({ error: 'Not authenticated.' });
      return;
    }

    try {
      const caller = await getUserProfile(verified.decodedClaims.uid);

      if (!caller || caller.isActive === false) {
        res.status(401).json({ error: 'Not authenticated.' });
        return;
      }

      const callerRole = getEffectivePortalRole(caller, portal);
      const allowedCallerRoles =
        portal === 'cpc_app' ? ['trainer', 'admin'] : ['manager', 'admin'];
      if (!callerRole || !allowedCallerRoles.includes(callerRole)) {
        res.status(403).json({ error: 'Insufficient portal access.' });
        return;
      }

      if (portal === 'cpc_app') {
        const users = await listActiveCpcPortalUsers();
        res.status(200).json({ users });
        return;
      }

      const snapshot = await db.collection('users').get();
      const users = snapshot.docs
        .map((doc) => {
          const data = doc.data() || {};
          return { ...data, uid: doc.id };
        })
        .filter((user) => user.isActive !== false && getEffectivePortalRole(user, portal))
        .map((user) => {
          const role = getEffectivePortalRole(user, portal);
          const row = {
            uid: user.uid,
            email: user.email || '',
            fullName: user.fullName || '',
            role,
          };
          return row;
        })
        .sort((a, b) => (a.fullName || a.email).localeCompare(b.fullName || b.email));

      res.status(200).json({ users });
    } catch (err) {
      console.error('getPortalUsers failed', err);
      res.status(500).json({ error: 'Failed to fetch portal users.' });
    }
  }),
);

// GET → returns array of all users from Firestore collection
exports.getUsers = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const caller = await getVerifiedAdminFromRequest(req);

    if (!caller) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const snapshot = await db.collection('users').get();
      const users = snapshot.docs.map((doc) => ({
        uid: doc.id,
        ...doc.data(),
      }));

      res.status(200).json({ users });
    } catch (err) {
      console.error('getUsers failed', err);
      res.status(500).json({ error: 'Failed to fetch users.' });
    }
  }),
);

// GET /api/getUser/:uid → returns a single user by UID
// Note: This is called as /api/getUser/USER_UID due to the rewrite routing.
// We parse the path to extract the UID.
exports.getUser = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const caller = await getVerifiedAdminFromRequest(req);

    if (!caller) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    // Extract UID from path: /api/getUser/UID_VALUE
    const uid = req.path.split('/').pop();

    if (!uid || uid.length === 0) {
      res.status(400).json({ error: 'UID is required.' });
      return;
    }

    try {
      const userProfile = await getUserProfile(uid);

      if (!userProfile) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      res.status(200).json({ user: { uid, ...userProfile } });
    } catch (err) {
      console.error('getUser failed', err);
      res.status(500).json({ error: 'Failed to fetch user.' });
    }
  }),
);

// GET -> proxies assessment profiles via server-side fetch so UM UI can use same-origin API
exports.getMentorProfiles = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const caller = await getVerifiedAdminFromRequest(req);
    if (!caller) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const mentorUrl = process.env.MENTOR_PORTAL_URL;
    const secret = process.env.MENTOR_PROVISION_SECRET;

    if (!mentorUrl || !secret) {
      res.status(500).json({ error: 'Mentor integration is not configured.' });
      return;
    }

    try {
      const upstream = await fetch(`${mentorUrl}/api/mentor-profiles`, {
        method: 'GET',
        headers: {
          'x-provision-secret': secret,
        },
      });

      const payload = await upstream.json().catch(() => ({}));

      if (!upstream.ok) {
        res.status(upstream.status).json({
          error:
            payload?.error?.message ||
            payload?.error ||
            'Failed to load mentor profiles from mentor portal.',
        });
        return;
      }

      res.status(200).json({ profiles: Array.isArray(payload?.profiles) ? payload.profiles : [] });
    } catch (error) {
      console.error('getMentorProfiles failed', error);
      res.status(502).json({ error: 'Mentor portal is unreachable right now.' });
    }
  }),
);

// GET -> proxies assessment profiles via server-side fetch so UM UI can use same-origin API
exports.getAssessmentProfiles = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const caller = await getVerifiedAdminFromRequest(req);
    if (!caller) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const assessmentUrl = process.env.ASSESSMENT_PORTAL_URL;
    const secret = process.env.ASSESSMENT_PROVISION_SECRET;

    if (!assessmentUrl || !secret) {
      res.status(500).json({ error: 'Assessment integration is not configured.' });
      return;
    }

    try {
      const upstream = await fetch(`${assessmentUrl}/api/assessment-profiles`, {
        method: 'GET',
        headers: {
          'x-provision-secret': secret,
        },
      });

      const payload = await upstream.json().catch(() => ({}));

      if (!upstream.ok) {
        res.status(upstream.status).json({
          error:
            payload?.error?.message ||
            payload?.error ||
            'Failed to load assessment profiles from assessment portal.',
        });
        return;
      }

      res.status(200).json({ profiles: Array.isArray(payload?.profiles) ? payload.profiles : [] });
    } catch (error) {
      console.error('getAssessmentProfiles failed', error);
      res.status(502).json({ error: 'Assessment portal is unreachable right now.' });
    }
  }),
);

exports.getTyreProfiles = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    const startedAt = Date.now();

    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const verified = await verifyAnySessionCookie(req.headers.cookie);
    if (!verified) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const tyreUrl = process.env.TYRE_PORTAL_URL;
    const secret = process.env.TYRE_PROVISION_SECRET;

    if (!tyreUrl || !secret) {
      res.status(500).json({ error: 'Tyre integration is not configured.' });
      return;
    }

    console.log('getTyreProfiles start', {
      hasCookie: Boolean(req.headers.cookie),
      tyreUrl,
    });

    let timeoutId;
    try {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 10000);
      const upstream = await fetch(`${tyreUrl}/api/tyre-profiles`, {
        method: 'GET',
        headers: {
          'x-provision-secret': secret,
        },
        signal: controller.signal,
      });

      console.log('getTyreProfiles upstream response', {
        status: upstream.status,
        elapsedMs: Date.now() - startedAt,
      });

      const payload = await upstream.json().catch(() => ({}));

      if (!upstream.ok) {
        res.status(upstream.status).json({
          error:
            payload?.error?.message ||
            payload?.error ||
            'Failed to load tyre profiles from tyre portal.',
        });
        return;
      }

      const profiles = Array.isArray(payload?.profiles) ? payload.profiles : [];
      console.log('getTyreProfiles success', {
        count: profiles.length,
        elapsedMs: Date.now() - startedAt,
      });
      res.status(200).json({ profiles });
    } catch (error) {
      console.error('getTyreProfiles failed', error);
      res.status(502).json({ error: 'Tyre portal is unreachable right now.' });
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }),
);

// Map portal keys to their app metadata.
const PORTAL_APP_MAP = {
  mentoring_app: {
    label: 'Mentor Portal',
    shortCode: 'MT',
    href: 'https://mentor.countrylion.co.uk',
  },
  assessment_app: {
    label: 'Assessment Portal',
    shortCode: 'AS',
    href: 'https://assessments.countrylion.co.uk',
  },
  routes_app: {
    label: 'Routes Portal',
    shortCode: 'RT',
    href: 'https://routes.countrylion.co.uk',
  },
  hr_app: {
    label: 'Headcount',
    shortCode: 'HC',
    href: 'https://headcount.countrylion.co.uk',
  },
  cpc_app: {
    label: 'CPC Portal',
    shortCode: 'CP',
    href: 'https://cpc.countrylion.co.uk',
  },
  tyre_app: {
    label: 'Tyre Tracker',
    shortCode: 'TT',
    href: 'https://tyres.countrylion.co.uk',
  },
  contracts_app: {
    label: 'Contracts Portal',
    shortCode: 'CT',
    href: 'https://contracts.countrylion.co.uk',
  },
  cleaning_app: {
    label: 'Vehicle Cleaning',
    shortCode: 'VC',
    href: 'https://cleaning.countrylion.co.uk',
  },
  compliance_app: {
    label: 'Weekend Availability',
    shortCode: 'WA',
    href: 'https://compliance.countrylion.co.uk',
  },
  attendance_app: {
    label: 'Attendance',
    shortCode: 'AT',
    href: 'https://attendance.countrylion.co.uk',
  },
  training_app: {
    label: 'Training',
    shortCode: 'TR',
    href: 'https://training.countrylion.co.uk',
  },
  holidays_app: {
    label: 'Holidays',
    shortCode: 'HD',
    href: 'https://holidays.countrylion.co.uk',
  },
  events_app: {
    label: 'Events Transport',
    shortCode: 'EV',
    href: 'https://events.countrylion.co.uk',
  },
  master_admin: {
    label: 'Admin Portal',
    shortCode: 'AD',
    href: 'https://employee.countrylion.co.uk/dashboard',
  },
};

// GET → returns the list of apps the current session user has access to.
// Used by sub-apps to render the shared top navigation menu.
exports.getMenuItems = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const verified = await verifyAnySessionCookie(req.headers.cookie);
    if (!verified) {
      res.status(401).json({ error: 'Not authenticated.' });
      return;
    }

    try {
      const profile = await getUserProfile(verified.decodedClaims.uid);

      if (!profile || !profile.isActive) {
        res.status(401).json({ error: 'Not authenticated.' });
        return;
      }

      const effectiveProfile = buildEffectiveProfile(profile);

      const items = Object.entries(effectiveProfile.portalsAccess || {})
        .filter(([, role]) => typeof role === 'string' && role.trim().length > 0)
        .map(([key]) => PORTAL_APP_MAP[key])
        .filter(Boolean);

      res.status(200).json({ items });
    } catch {
      res.status(401).json({ error: 'Not authenticated.' });
    }
  }),
);

// POST { newPassword } → updates password for the currently authenticated session user
exports.changeMyPassword = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const newPassword = req.body?.newPassword;

    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      res.status(400).json({ error: 'newPassword must be at least 6 characters.' });
      return;
    }

    const verified = await verifyAnySessionCookie(req.headers.cookie);
    if (!verified) {
      res.status(401).json({ error: 'Not authenticated.' });
      return;
    }

    try {
      const profile = await getUserProfile(verified.decodedClaims.uid);

      if (!profile || !profile.isActive) {
        res.status(401).json({ error: 'Not authenticated.' });
        return;
      }

      await auth.updateUser(verified.decodedClaims.uid, { password: newPassword });
      res.status(200).json({ status: 'ok' });
    } catch (error) {
      const code = error?.code || error?.errorInfo?.code || '';
      if (code === 'auth/invalid-password') {
        res.status(400).json({ error: 'Password must be at least 6 characters.' });
        return;
      }
      console.error('changeMyPassword failed', error);
      res.status(500).json({ error: 'Failed to update password.' });
    }
  }),
);

function generateTemporaryPassword(length = 12) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(length);
  let password = '';
  for (let i = 0; i < length; i += 1) {
    password += alphabet[bytes[i] % alphabet.length];
  }
  return password;
}

// POST — master admin resets an employee's portal password.
exports.adminResetPassword = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const caller = await getVerifiedAdminFromRequest(req);
    if (!caller) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const uid = typeof req.body?.uid === 'string' ? req.body.uid.trim() : '';
    const requestedPassword =
      typeof req.body?.password === 'string' ? req.body.password.trim() : '';

    if (!uid) {
      res.status(400).json({ error: 'uid is required.' });
      return;
    }

    const temporaryPassword = requestedPassword || generateTemporaryPassword();
    if (temporaryPassword.length < 6) {
      res.status(400).json({ error: 'password must be at least 6 characters.' });
      return;
    }

    try {
      const existing = await getUserProfile(uid);
      if (!existing) {
        res.status(404).json({ error: 'Employee record not found.' });
        return;
      }

      if (existing.hasPortalAccount === false) {
        res.status(400).json({
          error: 'This employee does not have a portal login yet. Enable portal login first.',
        });
        return;
      }

      await auth.getUser(uid);
      await auth.updateUser(uid, { password: temporaryPassword });
      await db.collection('users').doc(uid).set(
        {
          passwordResetAt: admin.firestore.FieldValue.serverTimestamp(),
          passwordResetByUid: caller.uid,
          passwordResetByName: caller.fullName || caller.email || '',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      res.status(200).json({
        status: 'ok',
        uid,
        email: existing.email || '',
        temporaryPassword,
        message: 'Password reset successfully. Share the temporary password securely with the employee.',
      });
    } catch (error) {
      const code = error?.code || error?.errorInfo?.code || '';
      if (code === 'auth/user-not-found') {
        res.status(404).json({
          error: 'No Firebase login exists for this employee. Enable portal login first.',
        });
        return;
      }
      if (code === 'auth/invalid-password') {
        res.status(400).json({ error: 'Password must be at least 6 characters.' });
        return;
      }
      console.error('adminResetPassword failed', error);
      res.status(500).json({ error: 'Failed to reset password.' });
    }
  }),
);

async function getVerifiedSessionUser(req) {
  const verified = await verifyAnySessionCookie(req.headers.cookie);
  if (!verified) return null;

  try {
    const profile = await getUserProfile(verified.decodedClaims.uid);
    if (!profile || !profile.isActive) return null;
    return { profile: buildEffectiveProfile(profile), verified };
  } catch {
    return null;
  }
}

// GET → employee directory summaries for HR managers/admins and master admins.
exports.getEmployeeProfiles = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    if (
      !canViewAllEmployeeProfiles(session.profile, getEffectivePortalRole)
      && !canManageCases(session.profile, getEffectivePortalRole)
    ) {
      res.status(403).json({ error: 'Insufficient access to view employee profiles.' });
      return;
    }

    try {
      const snapshot = await db.collection('users').get();
      const employees = snapshot.docs
        .map((doc) => buildEmployeeProfileResponse({ uid: doc.id, ...doc.data() }))
        .sort((a, b) => (a.fullName || a.email).localeCompare(b.fullName || b.email));

      if (session.verified?.sessionCookie) {
        setSharedSessionCookie(res, session.verified.sessionCookie);
      }

      res.status(200).json({ employees });
    } catch (error) {
      console.error('getEmployeeProfiles failed', error);
      res.status(500).json({ error: 'Failed to fetch employee profiles.' });
    }
  }),
);

// GET /api/getEmployeeProfile/:uid → own profile or any profile for HR managers/admins.
exports.getEmployeeProfile = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const targetUid = req.path.split('/').pop();
    if (!targetUid) {
      res.status(400).json({ error: 'UID is required.' });
      return;
    }

    const canViewAll = canViewAllEmployeeProfiles(session.profile, getEffectivePortalRole);
    if (!canViewAll && targetUid !== session.profile.uid) {
      res.status(403).json({ error: 'You can only view your own employee profile.' });
      return;
    }

    try {
      const userProfile = await getUserProfile(targetUid);
      if (!userProfile) {
        res.status(404).json({ error: 'Employee profile not found.' });
        return;
      }

      if (session.verified?.sessionCookie) {
        setSharedSessionCookie(res, session.verified.sessionCookie);
      }

      const dayKey = getLondonDayKey();
      const [kudosToday, kudosHistory] = await Promise.all([
        loadKudosForRecipient(db, targetUid, dayKey),
        loadKudosHistoryForRecipient(db, targetUid, { limit: 40 }),
      ]);

      res.status(200).json({
        profile: buildEmployeeProfileResponse(userProfile),
        kudosToday,
        kudosHistory,
        permissions: {
          canEditAll: canEditAllEmployeeFields(session.profile, getEffectivePortalRole),
          canEditSelfService: targetUid === session.profile.uid || canEditAllEmployeeFields(session.profile, getEffectivePortalRole),
          canManagePortalAccess: canManagePortalAccess(session.profile),
          canIssueKudos: canIssueKudos(session.profile, getEffectivePortalRole),
          isOwnProfile: targetUid === session.profile.uid,
        },
      });
    } catch (error) {
      console.error('getEmployeeProfile failed', error);
      res.status(500).json({ error: 'Failed to fetch employee profile.' });
    }
  }),
);

// POST { uid?, employeeProfile?, businessCommsEmail?, fullName?, themePreference?, themeEnforced? }
// → role-aware employee profile updates.
exports.updateEmployeeProfile = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const {
      uid,
      employeeProfile = {},
      businessCommsEmail,
      fullName,
      themePreference,
      themeEnforced,
    } = req.body || {};
    const targetUid = typeof uid === 'string' && uid.trim() ? uid.trim() : session.profile.uid;
    const canEditAll = canEditAllEmployeeFields(session.profile, getEffectivePortalRole);
    const isOwnProfile = targetUid === session.profile.uid;

    if (!isOwnProfile && !canEditAll) {
      res.status(403).json({ error: 'You can only update your own employee profile.' });
      return;
    }

    try {
      const existing = await getUserProfile(targetUid);
      if (!existing) {
        res.status(404).json({ error: 'Employee profile not found.' });
        return;
      }

      const firestoreUpdate = {
        employeeProfileUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (canEditAll) {
        firestoreUpdate.employeeProfile = mergeEmployeeProfiles(
          existing.employeeProfile,
          employeeProfile,
        );
        if (themePreference !== undefined) {
          firestoreUpdate.themePreference = normalizeThemePreference(themePreference);
        }
        if (themeEnforced !== undefined) {
          firestoreUpdate.themeEnforced = themeEnforced === true;
        }
        if (fullName !== undefined) {
          const nextName = String(fullName || '').trim();
          if (!nextName) {
            res.status(400).json({ error: 'Employee name cannot be empty.' });
            return;
          }
          firestoreUpdate.fullName = nextName;
          firestoreUpdate.email = await generateCountryLionEmailForName(nextName, targetUid);
        }
      } else {
        const selfPatch = pickSelfEditablePatch(employeeProfile);
        firestoreUpdate.employeeProfile = mergeEmployeeProfiles(
          existing.employeeProfile,
          selfPatch,
        );
        // Users may save their own theme choice; they cannot change enforcement.
        if (isOwnProfile && themePreference !== undefined) {
          if (existing.themeEnforced === true) {
            res.status(403).json({ error: 'Your portal theme is enforced by HR.' });
            return;
          }
          firestoreUpdate.themePreference = normalizeThemePreference(themePreference);
        }
      }

      const requestedComms =
        businessCommsEmail !== undefined
          ? normalizeBusinessCommsEmail(businessCommsEmail)
          : undefined;
      if (requestedComms !== undefined) {
        firestoreUpdate.businessCommsEmail = requestedComms;
      }

      const mergedProfile = {
        ...existing,
        ...firestoreUpdate,
        employeeProfile: firestoreUpdate.employeeProfile || existing.employeeProfile,
      };

      if (mergedProfile.employeeProfile?.personalEmail) {
        const normalizedPersonalEmail = normalizeContactEmail(mergedProfile.employeeProfile.personalEmail);
        if (normalizedPersonalEmail && !isValidEmail(normalizedPersonalEmail)) {
          res.status(400).json({ error: 'The personal email address is invalid.' });
          return;
        }
      }

      const contactFields = buildContactEmailFields(mergedProfile);
      // Explicit UI choice always wins over inference.
      if (requestedComms !== undefined) {
        contactFields.businessCommsEmail = requestedComms;
        contactFields.contactEmail =
          requestedComms === 'personal' && contactFields.personalEmail
            ? contactFields.personalEmail
            : contactFields.workEmail || normalizeContactEmail(existing.email);
      }
      if (
        contactFields.businessCommsEmail === 'personal'
        && !contactFields.personalEmail
      ) {
        res.status(400).json({
          error: 'Add a personal email before selecting personal email for business communications.',
        });
        return;
      }

      firestoreUpdate.businessCommsEmail = contactFields.businessCommsEmail;
      firestoreUpdate.contactEmail = contactFields.contactEmail;

      if (
        canEditAll
        && (firestoreUpdate.fullName || firestoreUpdate.email)
        && (
          firestoreUpdate.fullName !== existing.fullName
          || firestoreUpdate.email !== normalizeContactEmail(existing.email)
        )
      ) {
        try {
          const authPatch = {};
          if (firestoreUpdate.fullName) authPatch.displayName = firestoreUpdate.fullName;
          if (firestoreUpdate.email) authPatch.email = firestoreUpdate.email;
          await auth.updateUser(targetUid, authPatch);
        } catch (authError) {
          console.error('updateEmployeeProfile auth rename failed', targetUid, authError);
        }
      }

      await db.collection('users').doc(targetUid).set(firestoreUpdate, { merge: true });

      const updatedProfile = await getUserProfile(targetUid);
      const portalsAccess = sanitizePortalsAccess(updatedProfile.portalsAccess || {});
      const portalMappings = sanitizePortalMappings(updatedProfile.portalMappings || {});
      await provisionPortalUsers(targetUid, portalsAccess, updatedProfile, portalMappings);

      if (session.verified?.sessionCookie) {
        setSharedSessionCookie(res, session.verified.sessionCookie);
      }

      res.status(200).json({
        profile: buildEmployeeProfileResponse({ uid: targetUid, ...updatedProfile }),
        message: 'Employee profile updated successfully.',
      });
    } catch (error) {
      console.error('updateEmployeeProfile failed', error);
      res.status(500).json({ error: 'Failed to update employee profile.' });
    }
  }),
);

function isAuthorizedHrImport(req) {
  const importSecret = process.env.HR_IMPORT_SECRET;
  const headerSecret = req.headers['x-hr-import-secret'];
  return Boolean(importSecret && headerSecret && headerSecret === importSecret);
}

/**
 * Imports HR spreadsheet rows into Firestore user profiles.
 * @param {Array<object>} rows Raw spreadsheet rows
 * @return {Promise<object>} Import summary
 */
async function importHrRows(rows) {
  const snapshot = await db.collection('users').get();
  const usersByEmail = new Map();

  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    const email = normalizeContactEmail(data.email);
    if (email) usersByEmail.set(email, { uid: doc.id, ...data });
  });

  let matched = 0;
  let created = 0;
  const skipped = [];

  for (const rawRow of rows) {
    const mapped = mapHrSpreadsheetRow(rawRow);
    if (!mapped.email && !mapped.fullName) continue;

    const existing = mapped.email ? usersByEmail.get(mapped.email) : null;
    const employeeProfile = mergeEmployeeProfiles({}, {
      drivingStaff: mapped.drivingStaff,
      computerUser: mapped.computerUser,
      department: mapped.department,
      managerName: mapped.managerName,
      contractType: mapped.contractType,
      jobRole: mapped.jobRole,
      phoneNumber: mapped.phoneNumber,
      personalEmail: mapped.personalEmail,
      computerAsset: mapped.computerAsset,
      dateOfBirth: mapped.dateOfBirth,
      startDate: mapped.startDate,
      lastAtFaultAccidentDate: mapped.lastAtFaultAccidentDate,
      lastAppraisalDate: mapped.lastAppraisalDate,
    });

    if (existing) {
      const mergedForContact = {
        ...existing,
        email: existing.email || mapped.email,
        employeeProfile: mergeEmployeeProfiles(existing.employeeProfile, employeeProfile),
        businessCommsEmail: mapped.personalEmail ? 'personal' : existing.businessCommsEmail,
      };
      const contactFields = buildContactEmailFields(mergedForContact);

      await db.collection('users').doc(existing.uid).set(
        {
          fullName: mapped.fullName || existing.fullName || '',
          isActive: mapped.isActive,
          businessCommsEmail: contactFields.businessCommsEmail,
          contactEmail: contactFields.contactEmail,
          employeeProfile: mergedForContact.employeeProfile,
          employeeProfileUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          hrDataImportedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      matched += 1;
      continue;
    }

    if (!mapped.email) {
      skipped.push({ fullName: mapped.fullName, reason: 'missing work email' });
      continue;
    }

    const contactFields = buildContactEmailFields({
      email: mapped.email,
      businessCommsEmail: mapped.personalEmail ? 'personal' : 'work',
      employeeProfile,
    });

    const docRef = await db.collection('users').add({
      email: mapped.email,
      fullName: mapped.fullName,
      isActive: mapped.isActive,
      businessCommsEmail: contactFields.businessCommsEmail,
      contactEmail: contactFields.contactEmail,
      employeeProfile,
      hasPortalAccount: false,
      portalsAccess: {},
      portalMappings: {},
      employeeProfileUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      hrDataImportedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    usersByEmail.set(mapped.email, { uid: docRef.id, email: mapped.email });
    created += 1;
  }

  return {
    matched,
    created,
    skipped,
    total: matched + created,
    message: `Imported HR data for ${matched + created} employee profile(s).`,
  };
}

// POST { rows: [...] } → bulk import HR spreadsheet rows (master admin or import secret).
exports.adminImportHrData = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const caller = await getVerifiedAdminFromRequest(req);
    if (!caller && !isAuthorizedHrImport(req)) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
    if (!rows || rows.length === 0) {
      res.status(400).json({ error: 'rows array is required.' });
      return;
    }

    try {
      const result = await importHrRows(rows);
      res.status(200).json(result);
    } catch (error) {
      console.error('adminImportHrData failed', error);
      res.status(500).json({ error: 'Failed to import HR data.' });
    }
  }),
);

// GET → likely duplicate employee pairs based on similar names (master admin only).
exports.getEmployeeDuplicateSuggestions = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const caller = await getVerifiedAdminFromRequest(req);
    if (!caller) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const snapshot = await db.collection('users').get();
      const employees = snapshot.docs.map((doc) => ({ uid: doc.id, ...doc.data() }));
      const pairs = [];

      for (let i = 0; i < employees.length; i += 1) {
        for (let j = i + 1; j < employees.length; j += 1) {
          const suggestion = buildDuplicateSuggestion(employees[i], employees[j]);
          if (suggestion.score >= 0.72) {
            pairs.push(suggestion);
          }
        }
      }

      pairs.sort((a, b) => b.score - a.score);

      res.status(200).json({
        pairs,
        count: pairs.length,
      });
    } catch (error) {
      console.error('getEmployeeDuplicateSuggestions failed', error);
      res.status(500).json({ error: 'Failed to load duplicate suggestions.' });
    }
  }),
);

// POST { primaryUid, secondaryUid, preferredFullName? } → merge two employee records (master admin only).
exports.adminMergeEmployees = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const caller = await getVerifiedAdminFromRequest(req);
    if (!caller) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const {
      primaryUid,
      secondaryUid,
      preferredFullName,
    } = req.body || {};

    const keepUid = typeof primaryUid === 'string' ? primaryUid.trim() : '';
    const removeUid = typeof secondaryUid === 'string' ? secondaryUid.trim() : '';

    if (!keepUid || !removeUid) {
      res.status(400).json({ error: 'primaryUid and secondaryUid are required.' });
      return;
    }

    if (keepUid === removeUid) {
      res.status(400).json({ error: 'Choose two different employee records to merge.' });
      return;
    }

    try {
      const primary = await getUserProfile(keepUid);
      const secondary = await getUserProfile(removeUid);

      if (!primary || !secondary) {
        res.status(404).json({ error: 'One or both employee records were not found.' });
        return;
      }

      const primaryHasPortal = hasPortalAccount(primary);
      const secondaryHasPortal = hasPortalAccount(secondary);
      const primaryEmail = normalizeContactEmail(primary.email);
      const secondaryEmail = normalizeContactEmail(secondary.email);
      const sameWorkEmail = primaryEmail && secondaryEmail && primaryEmail === secondaryEmail;

      if (primaryHasPortal && secondaryHasPortal && !sameWorkEmail) {
        res.status(409).json({
          error: 'Both employees have separate portal logins. Disable or reconcile one account before merging.',
        });
        return;
      }

      if (!primaryHasPortal && secondaryHasPortal) {
        res.status(400).json({
          error: 'The selected duplicate has the portal login. Open that employee instead and merge this HR-only record into them.',
          suggestPrimaryUid: removeUid,
          suggestSecondaryUid: keepUid,
        });
        return;
      }

      const mergedProfile = {
        fullName: pickNonEmptyString(
          typeof preferredFullName === 'string' ? preferredFullName : '',
          pickNonEmptyString(primary.fullName, secondary.fullName),
        ),
        email: pickNonEmptyString(primary.email, secondary.email),
        businessCommsEmail: pickNonEmptyString(primary.businessCommsEmail, secondary.businessCommsEmail) || 'work',
        isActive: primary.isActive !== false || secondary.isActive !== false,
        hasPortalAccount: primaryHasPortal || secondaryHasPortal,
        employeeProfile: mergeEmployeeProfilesFillGaps(
          primary.employeeProfile,
          secondary.employeeProfile,
        ),
        portalsAccess: mergePortalsAccessFillGaps(primary.portalsAccess, secondary.portalsAccess),
        portalMappings: mergePortalMappingsFillGaps(primary.portalMappings, secondary.portalMappings),
        employeeProfileUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        hrDataImportedAt: primary.hrDataImportedAt || secondary.hrDataImportedAt || null,
        mergedEmployeeUids: admin.firestore.FieldValue.arrayUnion(removeUid),
      };

      const contactFields = buildContactEmailFields({
        ...primary,
        ...mergedProfile,
      });
      mergedProfile.businessCommsEmail = contactFields.businessCommsEmail;
      mergedProfile.contactEmail = contactFields.contactEmail;

      await db.collection('users').doc(keepUid).set(mergedProfile, { merge: true });

      if (removeUid !== keepUid) {
        await db.collection('users').doc(removeUid).delete();
      }

      if (primaryHasPortal && mergedProfile.fullName) {
        try {
          await auth.updateUser(keepUid, { displayName: mergedProfile.fullName });
        } catch (authError) {
          if (authError?.code !== 'auth/user-not-found') {
            throw authError;
          }
        }
      }

      const updatedProfile = await getUserProfile(keepUid);
      await provisionPortalUsers(
        keepUid,
        updatedProfile.portalsAccess || {},
        updatedProfile,
        updatedProfile.portalMappings || {},
      );

      res.status(200).json({
        uid: keepUid,
        removedUid: removeUid,
        message: `Merged duplicate into ${mergedProfile.fullName || 'employee record'}.`,
        profile: buildEmployeeProfileResponse(updatedProfile),
      });
    } catch (error) {
      console.error('adminMergeEmployees failed', error);
      res.status(500).json({ error: 'Failed to merge employee records.' });
    }
  }),
);

// Daily check for special birthdays and work anniversaries within 30 days → email HR.
exports.checkHrMilestoneAlerts = onSchedule(
  {
    schedule: '0 7 * * *',
    timeZone: 'Europe/London',
    region: 'europe-west2',
    secrets: [gmailUser, gmailPass],
  },
  async () => {
    const result = await runHrMilestoneAlerts(db, admin, {
      gmailUser: gmailUser.value(),
      gmailPass: gmailPass.value(),
      hrEmail: hrNotificationEmail.value(),
    });
    console.log('checkHrMilestoneAlerts completed', result);
  },
);

// Daily: clear expired disciplinary warnings so history only shows live ones.
exports.clearExpiredPeopleCaseWarnings = onSchedule(
  {
    schedule: '15 6 * * *',
    timeZone: 'Europe/London',
    region: 'europe-west2',
  },
  async () => {
    const today = new Date().toISOString().slice(0, 10);
    const snap = await db.collection('disciplinary_cases')
      .where('warningExpiresAt', '<=', today)
      .limit(200)
      .get();
    let cleared = 0;
    for (const doc of snap.docs) {
      const data = doc.data();
      if (data.warningClearedAt) continue;
      await doc.ref.update({
        warningClearedAt: admin.firestore.FieldValue.serverTimestamp(),
        warningClearedReason: 'expired_scheduler',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await appendDisciplinaryEvent(doc.id, 'warning_expired_cleared', { via: 'scheduler' }, { uid: 'system' });
      cleared += 1;
    }
    console.log('clearExpiredPeopleCaseWarnings completed', { cleared });
  },
);

// POST → manually run HR milestone alert emails (master admin only).
exports.adminRunHrMilestoneAlerts = onRequest(
  {
    region: 'europe-west2',
    secrets: [gmailUser, gmailPass],
  },
  withCors(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const caller = await getVerifiedAdminFromRequest(req);
    if (!caller) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const force = req.body?.force === true;
      const result = await runHrMilestoneAlerts(db, admin, {
        gmailUser: gmailUser.value(),
        gmailPass: gmailPass.value(),
        hrEmail: hrNotificationEmail.value(),
        force,
      });
      res.status(200).json({
        ...result,
        message: result.skipped
          ? 'Alert job skipped because Gmail credentials are not configured.'
          : result.sent === 0
            ? 'No milestone alerts are due within the next 30 days.'
            : `Sent ${result.sent} HR milestone alert email(s) from ${result.fromEmail} to ${result.recipient}.`,
      });
    } catch (error) {
      console.error('adminRunHrMilestoneAlerts failed', error);
      res.status(500).json({ error: 'Failed to run HR milestone alerts.' });
    }
  }),
);

// GET → disciplinary case summaries for HR managers/admins and master admins.
exports.getDisciplinaryCases = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    if (
      !canViewAllEmployeeProfiles(session.profile, getEffectivePortalRole)
      && !canManageCases(session.profile, getEffectivePortalRole)
    ) {
      res.status(403).json({ error: 'Insufficient access.' });
      return;
    }

    try {
      const employeeUid = toTrimmedString(req.query?.employeeUid);
      let snapshot;

      if (employeeUid) {
        snapshot = await db.collection('disciplinary_cases')
          .where('employeeUid', '==', employeeUid)
          .get();
      } else {
        snapshot = await db.collection('disciplinary_cases')
          .orderBy('createdAt', 'desc')
          .limit(300)
          .get();
      }

      const cases = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .sort((left, right) => {
          const leftTime = left.createdAt?._seconds || 0;
          const rightTime = right.createdAt?._seconds || 0;
          return rightTime - leftTime;
        });

      res.status(200).json({ cases });
    } catch (error) {
      console.error('getDisciplinaryCases failed', error);
      res.status(500).json({ error: 'Failed to load disciplinary cases.' });
    }
  }),
);

// GET /api/getDisciplinaryCase/:id → full case + timeline.
exports.getDisciplinaryCase = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    if (
      !canViewAllEmployeeProfiles(session.profile, getEffectivePortalRole)
      && !canManageCases(session.profile, getEffectivePortalRole)
    ) {
      res.status(403).json({ error: 'Insufficient access.' });
      return;
    }

    const caseId = toTrimmedString(req.path.split('/').pop());
    if (!caseId) {
      res.status(400).json({ error: 'Case id is required.' });
      return;
    }

    try {
      const caseSnap = await db.collection('disciplinary_cases').doc(caseId).get();
      if (!caseSnap.exists) {
        res.status(404).json({ error: 'Case not found.' });
        return;
      }

      const eventsSnap = await db.collection('disciplinary_case_events')
        .where('caseId', '==', caseId)
        .get();

      const documentsSnap = await db.collection('disciplinary_documents')
        .where('caseId', '==', caseId)
        .get();

      const documents = documentsSnap.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .sort((left, right) => {
          const leftTime = left.createdAt?._seconds || 0;
          const rightTime = right.createdAt?._seconds || 0;
          return rightTime - leftTime;
        });

      const events = eventsSnap.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .sort((left, right) => {
          const leftTime = left.createdAt?._seconds || 0;
          const rightTime = right.createdAt?._seconds || 0;
          return leftTime - rightTime;
        });

      res.status(200).json({
        case: { id: caseSnap.id, ...caseSnap.data() },
        events,
        documents,
        sharePointConfigured: isSharePointConfigured(getSharePointConfig()),
      });
    } catch (error) {
      console.error('getDisciplinaryCase failed', error);
      res.status(500).json({ error: 'Failed to load case.' });
    }
  }),
);

// POST → create a new disciplinary case.
exports.createDisciplinaryCase = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    if (
      !canViewAllEmployeeProfiles(session.profile, getEffectivePortalRole)
      && !canManageCases(session.profile, getEffectivePortalRole)
    ) {
      res.status(403).json({ error: 'Insufficient access.' });
      return;
    }

    const input = sanitizeDisciplinaryCaseInput(req.body || {});
    if (!input.employeeUid) {
      res.status(400).json({ error: 'employeeUid is required.' });
      return;
    }

    try {
      const employee = await getUserProfile(input.employeeUid);
      if (!employee) {
        res.status(404).json({ error: 'Employee not found.' });
        return;
      }

      const managerUid = input.managerUid || employee.managerUid || session.profile.uid;
      const managerProfile = managerUid ? await getUserProfile(managerUid) : null;
      const now = admin.firestore.FieldValue.serverTimestamp();
      const caseDoc = await db.collection('disciplinary_cases').add({
        employeeUid: input.employeeUid,
        employeeNameSnapshot: employee.fullName || employee.email || '',
        departmentSnapshot: employee.employeeProfile?.department || '',
        managerUid,
        ownerManagerUid: managerUid,
        managerNameSnapshot: managerProfile?.fullName || '',
        processFamily: 'disciplinary',
        caseType: input.caseType,
        title: input.title || `${input.caseType[0].toUpperCase()}${input.caseType.slice(1)} case`,
        summary: input.summary,
        severity: input.severity,
        status: 'open',
        stage: input.stage,
        origin: input.sourceIncidentId ? 'attendance_auto' : 'manual',
        sourceIncidentId: input.sourceIncidentId || '',
        dueAt: input.dueAt || '',
        openedAt: now,
        closedAt: null,
        createdByUid: session.profile.uid,
        updatedByUid: session.profile.uid,
        createdAt: now,
        updatedAt: now,
      });

      await appendDisciplinaryEvent(caseDoc.id, 'case_created', {
        caseType: input.caseType,
        stage: input.stage,
        sourceIncidentId: input.sourceIncidentId || '',
      }, session.profile);

      res.status(200).json({ id: caseDoc.id, message: 'Disciplinary case created.' });
    } catch (error) {
      console.error('createDisciplinaryCase failed', error);
      res.status(500).json({ error: 'Failed to create case.' });
    }
  }),
);

// POST → record a lateness/attendance incident.
exports.createAttendanceIncident = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    if (!canViewAllEmployeeProfiles(session.profile, getEffectivePortalRole)) {
      res.status(403).json({ error: 'Insufficient access.' });
      return;
    }

    const input = sanitizeAttendanceIncidentInput(req.body || {});
    if (!input.employeeUid || !input.incidentAt) {
      res.status(400).json({ error: 'employeeUid and incidentAt are required.' });
      return;
    }

    try {
      const employee = await getUserProfile(input.employeeUid);
      if (!employee) {
        res.status(404).json({ error: 'Employee not found.' });
        return;
      }

      const now = admin.firestore.FieldValue.serverTimestamp();
      const incidentDoc = await db.collection('attendance_incidents').add({
        employeeUid: input.employeeUid,
        employeeNameSnapshot: employee.fullName || employee.email || '',
        incidentType: input.incidentType,
        incidentAt: input.incidentAt,
        minutesLate: input.minutesLate,
        reason: input.reason,
        notes: input.notes,
        managerDecision: 'pending',
        decisionByUid: '',
        decisionAt: null,
        recordedByUid: session.profile.uid,
        linkedCaseId: '',
        createdAt: now,
        updatedAt: now,
      });

      res.status(200).json({ id: incidentDoc.id, message: 'Attendance incident logged.' });
    } catch (error) {
      console.error('createAttendanceIncident failed', error);
      res.status(500).json({ error: 'Failed to log incident.' });
    }
  }),
);

// POST → manager confirms or dismisses attendance incident; confirm can auto-open case.
exports.reviewAttendanceIncident = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    if (!canViewAllEmployeeProfiles(session.profile, getEffectivePortalRole)) {
      res.status(403).json({ error: 'Insufficient access.' });
      return;
    }

    const incidentId = toTrimmedString(req.body?.incidentId);
    const decision = toTrimmedString(req.body?.decision).toLowerCase();
    const comments = toTrimmedString(req.body?.comments);
    if (!incidentId || !['confirmed', 'dismissed'].includes(decision)) {
      res.status(400).json({ error: 'incidentId and valid decision are required.' });
      return;
    }

    try {
      const incidentRef = db.collection('attendance_incidents').doc(incidentId);
      const incidentSnap = await incidentRef.get();
      if (!incidentSnap.exists) {
        res.status(404).json({ error: 'Incident not found.' });
        return;
      }

      const incident = incidentSnap.data();
      let linkedCaseId = incident.linkedCaseId || '';

      await incidentRef.set({
        managerDecision: decision,
        managerComments: comments,
        decisionByUid: session.profile.uid,
        decisionAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      if (decision === 'confirmed' && !linkedCaseId) {
        const employee = await getUserProfile(incident.employeeUid);
        if (employee) {
          const now = admin.firestore.FieldValue.serverTimestamp();
          const caseDoc = await db.collection('disciplinary_cases').add({
            employeeUid: incident.employeeUid,
            employeeNameSnapshot: employee.fullName || employee.email || '',
            departmentSnapshot: employee.employeeProfile?.department || '',
            managerUid: session.profile.uid,
            managerNameSnapshot: session.profile.fullName || '',
            caseType: 'attendance',
            title: `Attendance review: ${employee.fullName || employee.email || 'Employee'}`,
            summary: incident.reason || '',
            severity: 'low',
            status: 'open',
            stage: 'intake',
            origin: 'attendance_auto',
            sourceIncidentId: incidentId,
            dueAt: '',
            openedAt: now,
            closedAt: null,
            createdByUid: session.profile.uid,
            updatedByUid: session.profile.uid,
            createdAt: now,
            updatedAt: now,
          });
          linkedCaseId = caseDoc.id;
          await incidentRef.set({ linkedCaseId }, { merge: true });
          await appendDisciplinaryEvent(linkedCaseId, 'case_created_from_attendance', {
            incidentId,
            decision,
          }, session.profile);
        }
      }

      res.status(200).json({
        incidentId,
        decision,
        linkedCaseId: linkedCaseId || null,
        message: 'Attendance incident reviewed.',
      });
    } catch (error) {
      console.error('reviewAttendanceIncident failed', error);
      res.status(500).json({ error: 'Failed to review incident.' });
    }
  }),
);

// POST → upload a disciplinary document to SharePoint and record metadata in Firestore.
exports.uploadDisciplinaryDocument = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    if (
      !canViewAllEmployeeProfiles(session.profile, getEffectivePortalRole)
      && !canManageCases(session.profile, getEffectivePortalRole)
    ) {
      res.status(403).json({ error: 'Insufficient access.' });
      return;
    }

    const sharePointConfig = getSharePointConfig();
    if (!isSharePointConfigured(sharePointConfig)) {
      res.status(503).json({ error: 'SharePoint integration is not configured yet.' });
      return;
    }

    const caseId = toTrimmedString(req.body?.caseId);
    const fileName = toTrimmedString(req.body?.fileName);
    const contentBase64 = toTrimmedString(req.body?.contentBase64);
    const mimeType = toTrimmedString(req.body?.mimeType) || 'application/octet-stream';
    const documentTypeRaw = toTrimmedString(req.body?.documentType).toLowerCase();
    const documentType = DISCIPLINARY_DOCUMENT_TYPES.has(documentTypeRaw) ? documentTypeRaw : 'other';
    const templateId = toTrimmedString(req.body?.templateId);
    const stageKey = toTrimmedString(req.body?.stageKey);
    const source = toTrimmedString(req.body?.source) || (templateId ? 'template_upload' : 'upload');
    const relatedDocumentId = toTrimmedString(req.body?.relatedDocumentId);

    if (!caseId || !fileName || !contentBase64) {
      res.status(400).json({ error: 'caseId, fileName, and contentBase64 are required.' });
      return;
    }

    let fileBuffer;
    try {
      fileBuffer = Buffer.from(contentBase64, 'base64');
    } catch {
      res.status(400).json({ error: 'contentBase64 must be valid base64.' });
      return;
    }

    if (!fileBuffer.length) {
      res.status(400).json({ error: 'Uploaded file is empty.' });
      return;
    }

    if (fileBuffer.length > MAX_DISCIPLINARY_UPLOAD_BYTES) {
      res.status(400).json({ error: 'Uploaded file exceeds the 10 MB limit.' });
      return;
    }

    try {
      const caseSnap = await db.collection('disciplinary_cases').doc(caseId).get();
      if (!caseSnap.exists) {
        res.status(404).json({ error: 'Case not found.' });
        return;
      }

      const caseData = caseSnap.data();
      const employee = await getUserProfile(caseData.employeeUid);
      if (!employee) {
        res.status(404).json({ error: 'Employee not found for this case.' });
        return;
      }

      const { buildCaseSharePointFolderName } = require('./caseDocumentTemplates');
      const caseFolderName = buildCaseSharePointFolderName(caseData, caseId);

      const replaceOriginal = Boolean(
        relatedDocumentId
        && (source === 'signed_file_note' || documentType === 'file_note_signed'),
      );
      let originalDocSnap = null;
      if (replaceOriginal) {
        originalDocSnap = await db.collection('disciplinary_documents').doc(relatedDocumentId).get();
        if (!originalDocSnap.exists) {
          res.status(404).json({ error: 'Original file note document not found.' });
          return;
        }
        const originalData = originalDocSnap.data();
        if (originalData.caseId !== caseId) {
          res.status(400).json({ error: 'Document does not belong to this case.' });
          return;
        }
      }

      const uploadResult = await uploadDisciplinaryDocument(sharePointConfig, {
        fullName: employee.fullName || caseData.employeeNameSnapshot || '',
        isActive: employee.isActive !== false,
        sharePointFolderName: employee.sharePointFolderName || '',
        employeeRoot: employee.sharePointEmployeeRoot || '',
        caseFolderName,
        fileName,
        fileBuffer,
        mimeType,
      });

      const now = admin.firestore.FieldValue.serverTimestamp();
      let documentId = '';
      let responseMessage = 'Document uploaded to SharePoint.';

      if (replaceOriginal && originalDocSnap) {
        const originalData = originalDocSnap.data();
        const oldItemId = originalData.sharePointItemId || '';
        if (
          oldItemId
          && oldItemId !== uploadResult.sharePointItemId
          && originalData.storageProvider === 'sharepoint'
        ) {
          try {
            await deleteDriveItem(sharePointConfig, oldItemId);
          } catch (deleteError) {
            console.error('Failed to delete original unsigned file note from SharePoint', deleteError);
          }
        }

        await originalDocSnap.ref.update({
          documentType: 'file_note_for_improvement',
          templateId: originalData.templateId || 'file_note_for_improvement',
          stageKey: stageKey || originalData.stageKey || caseData.stage || '',
          fileName: uploadResult.fileName,
          fileFormat: uploadResult.fileName.split('.').pop()?.toLowerCase() || '',
          mimeType,
          storageProvider: 'sharepoint',
          sharePointItemId: uploadResult.sharePointItemId,
          sharePointWebUrl: uploadResult.sharePointWebUrl,
          sharePointDriveId: uploadResult.sharePointDriveId,
          sharePointFolderPath: uploadResult.folderPath,
          uploadedByUid: session.profile.uid,
          source: 'signed_file_note',
          signedCopy: true,
          signedAt: now,
          signedUploadedByUid: session.profile.uid,
          employeeSignStatus: 'signed',
          employeeSignature: originalData.employeeSignature || {
            signedByUid: caseData.employeeUid || '',
            signedByName: caseData.employeeNameSnapshot || 'Employee',
            signedAt: new Date().toISOString(),
            signedAtLabel: new Date().toLocaleString('en-GB'),
            method: 'wet_scan_upload',
          },
          // Keep printable blank wording for reprints; signed scan is now the SharePoint file.
          updatedAt: now,
        });

        documentId = originalDocSnap.id;
        await db.collection('disciplinary_cases').doc(caseId).update({
          fileNoteDocumentId: documentId,
          fileNoteSignedDocumentId: documentId,
          fileNoteSignedAt: now,
          fileNoteEmployeeSignStatus: 'signed',
          fileNoteEmployeeSignedAt: new Date().toISOString(),
          status: 'closed',
          updatedAt: now,
        });
        responseMessage = 'Signed file note uploaded and replaced the original unsigned document.';
      } else {
        const documentRef = await db.collection('disciplinary_documents').add({
          caseId,
          employeeUid: caseData.employeeUid,
          documentType,
          templateId: templateId || '',
          stageKey: stageKey || caseData.stage || '',
          fileName: uploadResult.fileName,
          fileFormat: uploadResult.fileName.split('.').pop()?.toLowerCase() || '',
          mimeType,
          storageProvider: 'sharepoint',
          sharePointItemId: uploadResult.sharePointItemId,
          sharePointWebUrl: uploadResult.sharePointWebUrl,
          sharePointDriveId: uploadResult.sharePointDriveId,
          sharePointFolderPath: uploadResult.folderPath,
          uploadedByUid: session.profile.uid,
          source,
          relatedDocumentId: relatedDocumentId || '',
          createdAt: now,
        });
        documentId = documentRef.id;

        if (documentType === 'file_note_signed' || relatedDocumentId) {
          await db.collection('disciplinary_cases').doc(caseId).update({
            fileNoteSignedDocumentId: documentId,
            fileNoteSignedAt: now,
            updatedAt: now,
          });
        }
      }

      await appendDisciplinaryEvent(caseId, replaceOriginal ? 'file_note_signed_uploaded' : 'document_uploaded', {
        documentId,
        fileName: uploadResult.fileName,
        documentType: replaceOriginal ? 'file_note_for_improvement' : documentType,
        templateId: templateId || '',
        sharePointWebUrl: uploadResult.sharePointWebUrl,
        sharePointFolderPath: uploadResult.folderPath,
        replacedOriginal: replaceOriginal,
      }, session.profile);

      res.status(200).json({
        id: documentId,
        fileName: uploadResult.fileName,
        sharePointWebUrl: uploadResult.sharePointWebUrl,
        sharePointFolderPath: uploadResult.folderPath,
        templateId: templateId || '',
        replacedOriginal: replaceOriginal,
        message: responseMessage,
      });
    } catch (error) {
      console.error('uploadDisciplinaryDocument failed', error);
      res.status(500).json({ error: error.message || 'Failed to upload document to SharePoint.' });
    }
  }),
);

const peopleCasesApi = createPeopleCasesApi({
  admin,
  db,
  onRequest,
  withCors,
  getVerifiedSessionUser,
  getUserProfile,
  getEffectivePortalRole,
  uploadDisciplinaryDocument,
  isSharePointConfigured,
  getSharePointConfig,
});

exports.getPeopleCaseMeta = peopleCasesApi.getPeopleCaseMeta;
exports.getPeopleCases = peopleCasesApi.getPeopleCases;
exports.getPeopleCase = peopleCasesApi.getPeopleCase;
exports.createPeopleCase = peopleCasesApi.createPeopleCase;
exports.updatePeopleCase = peopleCasesApi.updatePeopleCase;
exports.createCaseMinutes = peopleCasesApi.createCaseMinutes;
exports.respondCaseMinutes = peopleCasesApi.respondCaseMinutes;
exports.createCaseReview = peopleCasesApi.createCaseReview;
exports.completeCaseReview = peopleCasesApi.completeCaseReview;
exports.getEmployeeCaseActions = peopleCasesApi.getEmployeeCaseActions;
exports.signFileNoteDocument = peopleCasesApi.signFileNoteDocument;
exports.createBumpCardPrompt = peopleCasesApi.createBumpCardPrompt;
exports.submitBumpCard = peopleCasesApi.submitBumpCard;
exports.exportPeopleCase = peopleCasesApi.exportPeopleCase;
exports.clearExpiredWarnings = peopleCasesApi.clearExpiredWarnings;
exports.deletePeopleCase = peopleCasesApi.deletePeopleCase;
exports.downloadCaseDocumentTemplate = peopleCasesApi.downloadCaseDocumentTemplate;

// GET → verify SharePoint connectivity and return the resolved folder path for an employee.
exports.getSharePointDisciplinaryPath = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    if (
      !canViewAllEmployeeProfiles(session.profile, getEffectivePortalRole)
      && !canManageCases(session.profile, getEffectivePortalRole)
    ) {
      res.status(403).json({ error: 'Insufficient access.' });
      return;
    }

    const sharePointConfig = getSharePointConfig();
    if (!isSharePointConfigured(sharePointConfig)) {
      res.status(503).json({
        configured: false,
        error: 'SharePoint integration is not configured yet.',
      });
      return;
    }

    const employeeUid = toTrimmedString(req.query?.employeeUid);
    if (!employeeUid) {
      res.status(400).json({ error: 'employeeUid is required.' });
      return;
    }

    try {
      const employee = await getUserProfile(employeeUid);
      if (!employee) {
        res.status(404).json({ error: 'Employee not found.' });
        return;
      }

      const paths = resolveEmployeeSharePointPaths(employee);

      res.status(200).json({
        configured: true,
        site: 'https://countrylion.sharepoint.com/sites/HR',
        library: 'Employee Files',
        folderPath: paths.disciplinaryFolderPath,
        employeeFolderPath: paths.employeeFolderPath,
        folderName: paths.folderName,
        employeeRoot: paths.employeeRoot,
        isConfirmed: paths.isConfirmed,
        usesMappedFolder: paths.usesMappedFolder,
        employeeName: employee.fullName || '',
        isActive: employee.isActive !== false,
      });
    } catch (error) {
      console.error('getSharePointDisciplinaryPath failed', error);
      res.status(500).json({ error: error.message || 'Failed to resolve SharePoint path.' });
    }
  }),
);

// GET → list historical disciplinary documents from SharePoint for an employee.
exports.getEmployeeSharePointDocuments = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    if (!canViewAllEmployeeProfiles(session.profile, getEffectivePortalRole)) {
      res.status(403).json({ error: 'Insufficient access.' });
      return;
    }

    const sharePointConfig = getSharePointConfig();
    if (!isSharePointConfigured(sharePointConfig)) {
      res.status(503).json({
        configured: false,
        error: 'SharePoint integration is not configured yet.',
      });
      return;
    }

    const employeeUid = toTrimmedString(req.query?.employeeUid);
    if (!employeeUid) {
      res.status(400).json({ error: 'employeeUid is required.' });
      return;
    }

    try {
      const employee = await getUserProfile(employeeUid);
      if (!employee) {
        res.status(404).json({ error: 'Employee not found.' });
        return;
      }

      const result = await listDisciplinaryDocuments(sharePointConfig, employee);

      res.status(200).json({
        configured: true,
        employeeName: employee.fullName || '',
        folderName: result.folderName,
        employeeRoot: result.employeeRoot,
        employeeFolderPath: result.employeeFolderPath,
        disciplinaryFolderPath: result.disciplinaryFolderPath,
        disciplinaryFolderName: result.disciplinaryFolderName || '',
        employeeFolderExists: Boolean(result.employeeFolderExists),
        disciplinaryFolderExists: Boolean(result.disciplinaryFolderExists),
        subfolders: result.subfolders || [],
        folderExists: result.folderExists,
        isConfirmed: result.isConfirmed,
        usesMappedFolder: result.usesMappedFolder,
        documents: result.documents,
      });
    } catch (error) {
      console.error('getEmployeeSharePointDocuments failed', error);
      res.status(500).json({ error: error.message || 'Failed to load SharePoint documents.' });
    }
  }),
);

// GET → suggest SharePoint employee folders that may match this profile name.
exports.getSharePointFolderSuggestions = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    if (!canViewAllEmployeeProfiles(session.profile, getEffectivePortalRole)) {
      res.status(403).json({ error: 'Insufficient access.' });
      return;
    }

    const sharePointConfig = getSharePointConfig();
    if (!isSharePointConfigured(sharePointConfig)) {
      res.status(503).json({
        configured: false,
        error: 'SharePoint integration is not configured yet.',
      });
      return;
    }

    const employeeUid = toTrimmedString(req.query?.employeeUid);
    if (!employeeUid) {
      res.status(400).json({ error: 'employeeUid is required.' });
      return;
    }

    try {
      const employee = await getUserProfile(employeeUid);
      if (!employee) {
        res.status(404).json({ error: 'Employee not found.' });
        return;
      }

      const paths = resolveEmployeeSharePointPaths(employee);
      const suggestions = await suggestEmployeeFolders(sharePointConfig, {
        fullName: employee.fullName || '',
        isActive: employee.isActive !== false,
      });

      res.status(200).json({
        employeeName: employee.fullName || '',
        currentFolderName: paths.folderName,
        currentEmployeeRoot: paths.employeeRoot,
        isConfirmed: paths.isConfirmed,
        usesMappedFolder: paths.usesMappedFolder,
        suggestions,
      });
    } catch (error) {
      console.error('getSharePointFolderSuggestions failed', error);
      res.status(500).json({ error: error.message || 'Failed to load SharePoint folder suggestions.' });
    }
  }),
);

// POST → confirm which SharePoint employee folder belongs to this profile.
exports.confirmSharePointFolderMapping = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    if (!canViewAllEmployeeProfiles(session.profile, getEffectivePortalRole)) {
      res.status(403).json({ error: 'Insufficient access.' });
      return;
    }

    const sharePointConfig = getSharePointConfig();
    if (!isSharePointConfigured(sharePointConfig)) {
      res.status(503).json({ error: 'SharePoint integration is not configured yet.' });
      return;
    }

    const employeeUid = toTrimmedString(req.body?.employeeUid);
    const folderName = toTrimmedString(req.body?.folderName);
    const employeeRoot = toTrimmedString(req.body?.employeeRoot);

    if (!employeeUid || !folderName || !employeeRoot) {
      res.status(400).json({ error: 'employeeUid, folderName, and employeeRoot are required.' });
      return;
    }

    if (!['Current Employees', 'Previous Employees'].includes(employeeRoot)) {
      res.status(400).json({ error: 'employeeRoot must be Current Employees or Previous Employees.' });
      return;
    }

    try {
      const employee = await getUserProfile(employeeUid);
      if (!employee) {
        res.status(404).json({ error: 'Employee not found.' });
        return;
      }

      const validated = await validateEmployeeFolder(sharePointConfig, {
        folderName,
        employeeRoot,
      });

      const now = admin.firestore.FieldValue.serverTimestamp();
      await db.collection('users').doc(employeeUid).set({
        sharePointFolderName: validated.folderName,
        sharePointEmployeeRoot: validated.employeeRoot,
        sharePointFolderConfirmedAt: now,
        sharePointFolderConfirmedByUid: session.profile.uid,
        updatedAt: now,
      }, { merge: true });

      const documents = await listDisciplinaryDocuments(sharePointConfig, {
        ...employee,
        sharePointFolderName: validated.folderName,
        sharePointEmployeeRoot: validated.employeeRoot,
        sharePointFolderConfirmedAt: new Date(),
      });

      res.status(200).json({
        message: 'SharePoint folder mapping saved.',
        folderName: validated.folderName,
        employeeRoot: validated.employeeRoot,
        disciplinaryFolderPath: validated.disciplinaryFolderPath,
        folderExists: documents.folderExists,
        documents: documents.documents,
      });
    } catch (error) {
      console.error('confirmSharePointFolderMapping failed', error);
      res.status(500).json({ error: error.message || 'Failed to save SharePoint folder mapping.' });
    }
  }),
);

/**
 * Resolve a playable day for Fun games.
 * Past days are practice-only (no leaderboard / streak writes).
 * Admins may optionally preview a limited window of future days (also practice-only).
 */
const FUN_DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const FUN_ARCHIVE_MAX_DAYS = 366;
const FUN_FUTURE_PREVIEW_MAX_DAYS = 60;

function resolvePlayableDayKey(requested, todayKey = getLondonDayKey(), options = {}) {
  const allowFuturePreview = Boolean(options.allowFuturePreview);
  const maxFutureDays = Number.isFinite(options.maxFutureDays)
    ? options.maxFutureDays
    : FUN_FUTURE_PREVIEW_MAX_DAYS;
  const sandbox = Boolean(options.sandbox);
  const raw = String(requested || '').trim();
  if (!raw || raw === todayKey) {
    return { dayKey: todayKey, practice: sandbox, todayKey, preview: false, sandbox };
  }
  if (!FUN_DAY_KEY_RE.test(raw)) {
    throw Object.assign(new Error('Invalid dayKey. Use YYYY-MM-DD.'), { status: 400 });
  }

  const todayMs = Date.parse(`${todayKey}T12:00:00Z`);
  const requestedMs = Date.parse(`${raw}T12:00:00Z`);
  if (!Number.isFinite(todayMs) || !Number.isFinite(requestedMs)) {
    throw Object.assign(new Error('Invalid dayKey.'), { status: 400 });
  }

  if (raw > todayKey) {
    if (!allowFuturePreview && !sandbox) {
      throw Object.assign(new Error('Cannot play future days.'), { status: 400 });
    }
    const futureDays = Math.round((requestedMs - todayMs) / 86400000);
    if (futureDays > maxFutureDays) {
      throw Object.assign(new Error(`Future preview is limited to ${maxFutureDays} days.`), { status: 400 });
    }
    return { dayKey: raw, practice: true, todayKey, preview: true, sandbox };
  }

  const diffDays = Math.round((todayMs - requestedMs) / 86400000);
  if (diffDays > FUN_ARCHIVE_MAX_DAYS) {
    throw Object.assign(new Error('That day is too far back to play.'), { status: 400 });
  }
  return { dayKey: raw, practice: true, todayKey, preview: false, sandbox };
}

function parseSandboxFlag(req) {
  const raw = req.query?.sandbox
    ?? req.body?.sandbox
    ?? req.query?.adminSandbox
    ?? req.body?.adminSandbox;
  return raw === true || raw === '1' || raw === 'true';
}

/**
 * Enforce weekday rotation for competitive play.
 * Sandbox / practice / admin preview skip the gate.
 * Soft GETs return a closed payload for weekends and sit-outs instead of throwing.
 */
function enforceFunGameAccess(gameKey, { dayKey, practice, sandbox }, { softWeekend = false } = {}) {
  if (sandbox || practice) {
    return { closed: false, rotation: getFunRotationForDay(dayKey) };
  }
  try {
    const result = assertFunGamePlayable(gameKey, dayKey, { adminBypass: false });
    return { closed: false, rotation: result.rotation };
  } catch (error) {
    if (
      softWeekend
      && (error.code === 'fun_weekend' || error.code === 'fun_rotation')
    ) {
      return { closed: true, rotation: error.rotation || getFunRotationForDay(dayKey), error };
    }
    throw error;
  }
}

function funAccessClosedPayload(dayKey, access) {
  const rotation = access.rotation || getFunRotationForDay(dayKey);
  const weekend = access.error?.code === 'fun_weekend' || rotation.closed;
  const sittingOut = access.error?.code === 'fun_rotation';
  return {
    dayKey,
    practice: true,
    weekend,
    sittingOut,
    rotation,
    message:
      access.error?.message
      || rotation.message
      || (weekend ? 'Fun games come back Monday.' : 'This game isn’t in today’s Fun rotation.'),
    puzzle: null,
    game: null,
    leaderboard: [],
  };
}

async function resolveTriviaQuestion(dayKey) {
  const custom = await findPublishedForDay(db, 'trivia', dayKey);
  if (custom) return triviaFromContent(custom, dayKey);
  return resolveBankQuestion(db, dayKey, admin.firestore.FieldValue);
}

async function resolveConnectionsPuzzle(dayKey) {
  const custom = await findPublishedForDay(db, 'connections', dayKey);
  if (custom) return connectionsFromContent(custom, dayKey, CONNECTIONS_DIFFICULTIES);
  return getConnectionsPuzzleForDay(dayKey);
}

async function resolveSokobanPuzzle(dayKey) {
  const custom = await findPublishedForDay(db, 'sokoban', dayKey);
  if (custom) return sokobanFromContent(custom, dayKey);
  return getSokobanPuzzleForDay(dayKey);
}

async function buildTriviaLeaderboard(dayKey) {
  const snap = await db
    .collection('trivia_answers')
    .where('dayKey', '==', dayKey)
    .limit(200)
    .get();

  const rows = snap.docs.map((doc) => {
    const data = doc.data() || {};
    return {
      uid: data.uid || doc.id,
      fullName: data.fullName || 'Colleague',
      correct: Boolean(data.correct),
      answeredAt: data.answeredAt?.toDate?.()?.toISOString?.() || null,
    };
  });

  const wins = rows.filter((row) => row.correct);
  const fails = rows.filter((row) => !row.correct);

  wins.sort((a, b) => {
    const aTime = a.answeredAt ? new Date(a.answeredAt).getTime() : Number.MAX_SAFE_INTEGER;
    const bTime = b.answeredAt ? new Date(b.answeredAt).getTime() : Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  });
  fails.sort((a, b) => {
    const aTime = a.answeredAt ? new Date(a.answeredAt).getTime() : Number.MAX_SAFE_INTEGER;
    const bTime = b.answeredAt ? new Date(b.answeredAt).getTime() : Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  });

  // Joint when answered in the same second.
  assignJointRanks(wins, (a, b) => {
    const aSec = a.answeredAt ? Math.floor(new Date(a.answeredAt).getTime() / 1000) : -1;
    const bSec = b.answeredAt ? Math.floor(new Date(b.answeredAt).getTime() / 1000) : -2;
    return aSec === bSec;
  });
  fails.forEach((row) => {
    row.rank = null;
    row.joint = false;
    row.medal = null;
    row.failed = true;
    row.rankLabel = '💩';
  });

  return [...wins, ...fails].map((row) => ({
    rank: row.rank,
    joint: Boolean(row.joint),
    medal: row.medal || null,
    failed: Boolean(row.failed),
    rankLabel: row.rankLabel || (row.rank ? ordinal(row.rank) : '💩'),
    uid: row.uid,
    fullName: row.fullName,
    correct: row.correct,
    answeredAt: row.answeredAt,
    resultLabel: row.correct ? 'Correct' : '💩 Wrong',
  }));
}

// GET → today's trivia question, whether the user has answered, and today's leaderboard.
exports.getDailyTrivia = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const todayKey = getLondonDayKey();
      const sandbox = parseSandboxFlag(req);
      const isAdmin = canManagePortalAccess(session.profile);
      const { dayKey, practice } = resolvePlayableDayKey(req.query?.dayKey, todayKey, {
        sandbox: sandbox && isAdmin,
        allowFuturePreview: sandbox && isAdmin,
      });
      const access = enforceFunGameAccess('trivia', {
        dayKey,
        practice,
        sandbox: sandbox && isAdmin,
      }, { softWeekend: true });
      if (access.closed) {
        res.status(200).json({
          ...funAccessClosedPayload(dayKey, access),
          question: null,
          answered: false,
          myAnswer: null,
          achievements: serializeAchievements(
            await loadFunStreaks(db, session.profile.uid, {
              todayKey,
              fullName: session.profile.fullName || session.profile.email || '',
              email: session.profile.email || '',
              FieldValue: admin.firestore.FieldValue,
            }),
            todayKey,
          ),
        });
        return;
      }

      const question = await resolveTriviaQuestion(dayKey);
      const leaderboard = practice ? [] : await buildTriviaLeaderboard(dayKey);

      let answered = false;
      let myAnswer = null;
      if (!practice) {
        const answerId = `${dayKey}_${session.profile.uid}`;
        const answerSnap = await db.collection('trivia_answers').doc(answerId).get();
        myAnswer = answerSnap.exists ? answerSnap.data() : null;
        answered = Boolean(myAnswer);
      }

      const streaks = await loadFunStreaks(db, session.profile.uid, {
        todayKey,
        fullName: session.profile.fullName || session.profile.email || '',
        email: session.profile.email || '',
        FieldValue: admin.firestore.FieldValue,
      });
      res.status(200).json({
        dayKey,
        practice,
        weekend: false,
        rotation: access.rotation,
        question: publicQuestion(question),
        answered,
        myAnswer: answered
          ? {
              selectedIndex: myAnswer.selectedIndex,
              correct: Boolean(myAnswer.correct),
              answeredAt: myAnswer.answeredAt?.toDate?.()?.toISOString?.() || null,
            }
          : null,
        correctIndex: answered ? question.correctIndex : null,
        leaderboard: practice ? [] : leaderboard,
        totalCorrect: practice ? 0 : leaderboard.filter((r) => r.correct).length,
        totalFailed: practice ? 0 : leaderboard.filter((r) => !r.correct).length,
        achievements: serializeAchievements(streaks, todayKey),
      });
    } catch (error) {
      console.error('getDailyTrivia failed', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to load daily trivia.' });
    }
  }),
);

// POST { selectedIndex } → submit today's trivia answer (one attempt per day).
exports.submitTriviaAnswer = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const selectedIndex = Number(req.body?.selectedIndex);
    if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex > 3) {
      res.status(400).json({ error: 'selectedIndex must be 0–3.' });
      return;
    }

    try {
      const todayKey = getLondonDayKey();
      const sandbox = parseSandboxFlag(req) && canManagePortalAccess(session.profile);
      const { dayKey, practice } = resolvePlayableDayKey(req.body?.dayKey, todayKey, {
        sandbox,
        allowFuturePreview: sandbox,
      });
      enforceFunGameAccess('trivia', { dayKey, practice, sandbox });
      const question = await resolveTriviaQuestion(dayKey);

      // Past-day practice: grade only — never write leaderboard/streak data.
      if (practice) {
        const correct = selectedIndex === question.correctIndex;
        res.status(200).json({
          alreadyAnswered: false,
          dayKey,
          practice: true,
          question: publicQuestion(question),
          correctIndex: question.correctIndex,
          myAnswer: {
            selectedIndex,
            correct,
            answeredAt: new Date().toISOString(),
          },
          leaderboard: [],
          totalCorrect: 0,
          achievements: null,
        });
        return;
      }

      const answerId = `${dayKey}_${session.profile.uid}`;
      const answerRef = db.collection('trivia_answers').doc(answerId);
      const existing = await answerRef.get();

      if (existing.exists) {
        const data = existing.data() || {};
        const leaderboard = await buildTriviaLeaderboard(dayKey);
        res.status(200).json({
          alreadyAnswered: true,
          dayKey,
          practice: false,
          question: publicQuestion(question),
          correctIndex: question.correctIndex,
          myAnswer: {
            selectedIndex: data.selectedIndex,
            correct: Boolean(data.correct),
            answeredAt: data.answeredAt?.toDate?.()?.toISOString?.() || null,
          },
          leaderboard,
          totalCorrect: leaderboard.filter((r) => r.correct).length,
          totalFailed: leaderboard.filter((r) => !r.correct).length,
        });
        return;
      }

      const correct = selectedIndex === question.correctIndex;
      const answeredAt = admin.firestore.FieldValue.serverTimestamp();
      await answerRef.set({
        dayKey,
        questionId: question.questionId,
        uid: session.profile.uid,
        fullName: session.profile.fullName || session.profile.email || 'Colleague',
        email: session.profile.email || '',
        selectedIndex,
        correct,
        answeredAt,
        createdAt: answeredAt,
      });

      let achievements = null;
      if (correct) {
        await recordFunStreakWin(db, {
          uid: session.profile.uid,
          fullName: session.profile.fullName || session.profile.email || 'Colleague',
          email: session.profile.email || '',
          gameKey: 'trivia',
          dayKey,
          FieldValue: admin.firestore.FieldValue,
        });
      } else {
        await recordFunStreakFail(db, {
          uid: session.profile.uid,
          fullName: session.profile.fullName || session.profile.email || 'Colleague',
          email: session.profile.email || '',
          gameKey: 'trivia',
          dayKey,
          FieldValue: admin.firestore.FieldValue,
        });
      }
      {
        const streaks = await loadFunStreaks(db, session.profile.uid, {
          todayKey,
          fullName: session.profile.fullName || session.profile.email || '',
          email: session.profile.email || '',
          FieldValue: admin.firestore.FieldValue,
        });
        achievements = serializeAchievements(streaks, todayKey);
      }

      const leaderboard = await buildTriviaLeaderboard(dayKey);
      res.status(201).json({
        alreadyAnswered: false,
        dayKey,
        practice: false,
        question: publicQuestion(question),
        correctIndex: question.correctIndex,
        myAnswer: {
          selectedIndex,
          correct,
          answeredAt: new Date().toISOString(),
        },
        leaderboard,
        totalCorrect: leaderboard.filter((r) => r.correct).length,
        totalFailed: leaderboard.filter((r) => !r.correct).length,
        achievements,
      });
    } catch (error) {
      console.error('submitTriviaAnswer failed', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to submit trivia answer.' });
    }
  }),
);

const SUGGESTION_STATUSES = new Set(['new', 'reviewing', 'done']);
const SUGGESTION_CATEGORIES = new Set(['portal', 'workplace', 'training', 'other']);

function canModerateSuggestions(profile) {
  // Master admins and HR managers/admins can see the private inbox.
  return canManagePortalAccess(profile)
    || canViewAllEmployeeProfiles(profile, getEffectivePortalRole);
}

function serializeSuggestion(doc) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    title: data.title || '',
    body: data.body || '',
    category: data.category || 'other',
    status: data.status || 'new',
    adminNote: data.adminNote || '',
    authorUid: data.authorUid || '',
    authorName: data.authorName || 'Colleague',
    authorEmail: data.authorEmail || '',
    createdAt: data.createdAt?.toDate?.()?.toISOString?.() || null,
    updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() || null,
    statusUpdatedByName: data.statusUpdatedByName || '',
  };
}

// GET → suggestion inbox (admins / managers). Non-moderators get an empty private response.
exports.getSuggestions = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const canModerate = canModerateSuggestions(session.profile);
      if (!canModerate) {
        res.status(200).json({
          suggestions: [],
          canModerate: false,
          newCount: 0,
        });
        return;
      }

      const snap = await db.collection('suggestions').orderBy('createdAt', 'desc').limit(150).get();
      const suggestions = snap.docs.map(serializeSuggestion);
      const newCount = suggestions.filter((item) => item.status === 'new').length;
      res.status(200).json({
        suggestions,
        canModerate: true,
        newCount,
      });
    } catch (error) {
      console.error('getSuggestions failed', error);
      res.status(500).json({ error: 'Failed to load suggestions.' });
    }
  }),
);

// GET → lightweight badge for Suggestions tab (admins / managers).
exports.getSuggestionBadge = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const canModerate = canModerateSuggestions(session.profile);
      if (!canModerate) {
        res.status(200).json({ canModerate: false, newCount: 0, latestId: null });
        return;
      }

      const snap = await db.collection('suggestions')
        .where('status', '==', 'new')
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get();

      res.status(200).json({
        canModerate: true,
        newCount: snap.size,
        latestId: snap.empty ? null : snap.docs[0].id,
        latestTitle: snap.empty ? null : (snap.docs[0].data()?.title || 'New suggestion'),
      });
    } catch (error) {
      // Fallback if composite index is missing: count without orderBy.
      try {
        const canModerate = canModerateSuggestions(session.profile);
        if (!canModerate) {
          res.status(200).json({ canModerate: false, newCount: 0, latestId: null });
          return;
        }
        const snap = await db.collection('suggestions').where('status', '==', 'new').limit(50).get();
        res.status(200).json({
          canModerate: true,
          newCount: snap.size,
          latestId: snap.empty ? null : snap.docs[0].id,
          latestTitle: snap.empty ? null : (snap.docs[0].data()?.title || 'New suggestion'),
        });
      } catch (fallbackError) {
        console.error('getSuggestionBadge failed', error, fallbackError);
        res.status(500).json({ error: 'Failed to load suggestion badge.' });
      }
    }
  }),
);

// POST { title, body, category } → create a suggestion.
exports.createSuggestion = onRequest(
  {
    region: 'europe-west2',
    secrets: [gmailUser, gmailPass],
  },
  withCors(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const title = String(req.body?.title || '').trim();
    const body = String(req.body?.body || '').trim();
    const category = String(req.body?.category || 'other').trim();

    if (title.length < 3 || title.length > 120) {
      res.status(400).json({ error: 'Title must be 3–120 characters.' });
      return;
    }
    if (body.length < 5 || body.length > 1000) {
      res.status(400).json({ error: 'Details must be 5–1000 characters.' });
      return;
    }
    if (!SUGGESTION_CATEGORIES.has(category)) {
      res.status(400).json({ error: 'Invalid category.' });
      return;
    }

    try {
      const now = admin.firestore.FieldValue.serverTimestamp();
      const authorName = session.profile.fullName || session.profile.email || 'Colleague';
      const authorEmail = session.profile.email || '';
      const ref = await db.collection('suggestions').add({
        title,
        body,
        category,
        status: 'new',
        adminNote: '',
        authorUid: session.profile.uid,
        authorName,
        authorEmail,
        createdAt: now,
        updatedAt: now,
        statusUpdatedByUid: '',
        statusUpdatedByName: '',
      });
      const snap = await ref.get();

      // Best-effort email alert — never fail the submission if mail breaks.
      try {
        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: gmailUser.value(),
            pass: gmailPass.value(),
          },
        });
        const portalUrl = 'https://employee.countrylion.co.uk/dashboard/profile';
        await transporter.sendMail({
          from: `"Country Lion Portal" <${gmailUser.value()}>`,
          to: hrNotificationEmail.value(),
          subject: `New suggestion: ${title}`,
          text: [
            'A new suggestion was submitted in the Employee Portal.',
            '',
            `From: ${authorName}${authorEmail ? ` (${authorEmail})` : ''}`,
            `Category: ${category}`,
            `Title: ${title}`,
            '',
            body,
            '',
            `Open Suggestions: ${portalUrl}`,
          ].join('\n'),
          html: `
            <p>A new suggestion was submitted in the Employee Portal.</p>
            <p><strong>From:</strong> ${authorName}${authorEmail ? ` (${authorEmail})` : ''}<br/>
            <strong>Category:</strong> ${category}<br/>
            <strong>Title:</strong> ${title}</p>
            <p>${String(body).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>')}</p>
            <p><a href="${portalUrl}">Open Suggestions in Employee Portal</a></p>
          `,
        });
      } catch (mailError) {
        console.warn('createSuggestion email alert failed', mailError?.message || mailError);
      }

      res.status(201).json({ suggestion: serializeSuggestion(snap) });
    } catch (error) {
      console.error('createSuggestion failed', error);
      res.status(500).json({ error: 'Failed to create suggestion.' });
    }
  }),
);

// GET → lightweight colleague list for kudos recipient picker (active users only).
exports.listColleagueDirectory = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    if (!canIssueKudos(session.profile, getEffectivePortalRole)) {
      res.status(403).json({ error: 'Only managers and admins can browse colleagues for kudos.' });
      return;
    }

    try {
      const snapshot = await db.collection('users').get();
      const colleagues = snapshot.docs
        .map((doc) => {
          const data = doc.data() || {};
          if (data.isActive === false) return null;
          if (doc.id === session.profile.uid) return null;
          const fullName = String(data.fullName || '').trim();
          if (!fullName) return null;
          return {
            uid: doc.id,
            fullName,
            department: data.employeeProfile?.department || data.department || '',
            jobRole: data.employeeProfile?.jobRole || data.jobRole || '',
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.fullName.localeCompare(b.fullName));

      res.status(200).json({ colleagues });
    } catch (error) {
      console.error('listColleagueDirectory failed', error);
      res.status(500).json({ error: 'Failed to load colleagues.' });
    }
  }),
);

// GET → my kudos received/sent today + badge catalogue.
exports.getMyKudos = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const dayKey = getLondonDayKey();
      const issuer = canIssueKudos(session.profile, getEffectivePortalRole);
      const [received, sent, history, gifs] = await Promise.all([
        loadKudosForRecipient(db, session.profile.uid, dayKey),
        issuer ? loadKudosSentBy(db, session.profile.uid, dayKey) : Promise.resolve([]),
        loadKudosHistoryForRecipient(db, session.profile.uid, { limit: 40 }),
        issuer ? loadKudosGifLibrary(db, { limit: 60 }) : Promise.resolve([]),
      ]);
      res.status(200).json({
        dayKey,
        canIssue: issuer,
        badges: listBadgeTypes(),
        received,
        sent,
        history,
        gifs,
        remainingToday: issuer ? Math.max(0, MAX_KUDOS_PER_DAY - sent.length) : 0,
      });
    } catch (error) {
      console.error('getMyKudos failed', error);
      res.status(500).json({ error: 'Failed to load kudos.' });
    }
  }),
);

// POST { toUid | toUids, badgeType, message, gifBase64?, gifMimeType?, gifUrl? }
// → send kudos to one or more colleagues (visible on recipient profiles today).
// gifUrl reuses a GIF already in the shared manager library (kudos_gifs).
exports.sendKudos = onRequest(
  {
    region: 'europe-west2',
    memory: '512MiB',
    timeoutSeconds: 60,
  },
  withCors(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    if (!canIssueKudos(session.profile, getEffectivePortalRole)) {
      res.status(403).json({ error: 'Only managers and admins can issue kudos.' });
      return;
    }

    const toUids = normalizeRecipientUids(req.body || {});
    const badgeType = String(req.body?.badgeType || '').trim();
    const message = normalizeMessage(req.body?.message);
    const reusedGifUrl = String(req.body?.gifUrl || '').trim();

    if (!toUids.length) {
      res.status(400).json({ error: 'Please choose at least one colleague.' });
      return;
    }
    if (toUids.length > MAX_KUDOS_RECIPIENTS_PER_SEND) {
      res.status(400).json({
        error: `You can send to at most ${MAX_KUDOS_RECIPIENTS_PER_SEND} colleagues at once.`,
      });
      return;
    }
    if (toUids.includes(session.profile.uid)) {
      res.status(400).json({ error: 'You cannot send kudos to yourself.' });
      return;
    }
    if (!isValidBadgeType(badgeType)) {
      res.status(400).json({ error: 'Please choose a valid badge.' });
      return;
    }
    if (message.length < 3 || message.length > MAX_MESSAGE_LENGTH) {
      res.status(400).json({ error: `Message must be 3–${MAX_MESSAGE_LENGTH} characters.` });
      return;
    }

    let gifPayload = null;
    try {
      if (req.body?.gifBase64 || req.body?.contentBase64) {
        gifPayload = decodeGifPayload(
          req.body.gifBase64 || req.body.contentBase64,
          req.body.gifMimeType || req.body.mimeType || 'image/gif',
        );
      }
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message || 'Invalid GIF.' });
      return;
    }

    if (gifPayload && reusedGifUrl) {
      res.status(400).json({ error: 'Choose either a new GIF upload or a library GIF, not both.' });
      return;
    }

    try {
      const dayKey = getLondonDayKey();
      const sentToday = await countKudosSentToday(db, session.profile.uid, dayKey);
      const remaining = Math.max(0, MAX_KUDOS_PER_DAY - sentToday);
      if (toUids.length > remaining) {
        res.status(429).json({
          error: remaining <= 0
            ? `You can send up to ${MAX_KUDOS_PER_DAY} kudos per day.`
            : `You only have ${remaining} kudos left today, but selected ${toUids.length}.`,
        });
        return;
      }

      const recipients = [];
      for (const toUid of toUids) {
        const recipient = await getUserProfile(toUid);
        if (!recipient || recipient.isActive === false) {
          res.status(404).json({ error: 'One or more selected colleagues were not found.' });
          return;
        }
        recipients.push({
          toUid,
          toName: recipient.fullName || recipient.email || 'Colleague',
        });
      }

      const fromName = session.profile.fullName || session.profile.email || 'Colleague';
      let gifUrl = null;

      if (reusedGifUrl) {
        const libraryGif = await findKudosGifByUrl(db, reusedGifUrl);
        if (!libraryGif?.url) {
          res.status(400).json({ error: 'That GIF is not in the shared library. Upload it again or pick another.' });
          return;
        }
        gifUrl = libraryGif.url;
      } else if (gifPayload) {
        const bucket = admin.storage().bucket();
        const token = crypto.randomUUID();
        const objectPath = `kudos/${dayKey}/${session.profile.uid}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.gif`;
        const file = bucket.file(objectPath);
        await file.save(gifPayload.buffer, {
          resumable: false,
          metadata: {
            contentType: gifPayload.mimeType,
            metadata: {
              firebaseStorageDownloadTokens: token,
              fromUid: session.profile.uid,
              dayKey,
            },
          },
        });
        gifUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
        await saveKudosGifToLibrary(db, {
          url: gifUrl,
          storagePath: objectPath,
          fileName: 'kudos.gif',
          uploadedByUid: session.profile.uid,
          uploadedByName: fromName,
          FieldValue: admin.firestore.FieldValue,
        });
      }

      const now = admin.firestore.FieldValue.serverTimestamp();
      const batch = db.batch();
      const refs = recipients.map(() => db.collection('kudos').doc());
      refs.forEach((ref, index) => {
        const recipient = recipients[index];
        batch.set(ref, {
          fromUid: session.profile.uid,
          fromName,
          toUid: recipient.toUid,
          toName: recipient.toName,
          badgeType,
          message,
          gifUrl: gifUrl || null,
          dayKey,
          createdAt: now,
        });
      });
      await batch.commit();

      const snaps = await Promise.all(refs.map((ref) => ref.get()));
      const kudosList = snaps.map(serializeKudos);
      res.status(201).json({
        kudos: kudosList.length === 1 ? kudosList[0] : kudosList,
        sent: kudosList,
        remainingToday: Math.max(0, MAX_KUDOS_PER_DAY - sentToday - kudosList.length),
      });
    } catch (error) {
      console.error('sendKudos failed', error);
      const messageText = String(error?.message || '');
      if (/bucket|storage/i.test(messageText)) {
        res.status(500).json({
          error: 'GIF storage is not available right now. Try again without a GIF, or ask an admin to enable Firebase Storage.',
        });
        return;
      }
      res.status(500).json({ error: 'Failed to send kudos.' });
    }
  }),
);

// POST { id, status, adminNote? } → HR/admin status updates.
exports.updateSuggestionStatus = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    if (!canModerateSuggestions(session.profile)) {
      res.status(403).json({ error: 'Insufficient access to update suggestions.' });
      return;
    }

    const id = String(req.body?.id || '').trim();
    const status = String(req.body?.status || '').trim();
    const adminNote = typeof req.body?.adminNote === 'string'
      ? req.body.adminNote.trim().slice(0, 500)
      : undefined;

    if (!id) {
      res.status(400).json({ error: 'id is required.' });
      return;
    }
    if (!SUGGESTION_STATUSES.has(status)) {
      res.status(400).json({ error: 'status must be new, reviewing, or done.' });
      return;
    }

    try {
      const ref = db.collection('suggestions').doc(id);
      const existing = await ref.get();
      if (!existing.exists) {
        res.status(404).json({ error: 'Suggestion not found.' });
        return;
      }

      const patch = {
        status,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        statusUpdatedByUid: session.profile.uid,
        statusUpdatedByName: session.profile.fullName || session.profile.email || 'Admin',
      };
      if (adminNote !== undefined) patch.adminNote = adminNote;

      await ref.update(patch);
      const snap = await ref.get();
      res.status(200).json({ suggestion: serializeSuggestion(snap) });
    } catch (error) {
      console.error('updateSuggestionStatus failed', error);
      res.status(500).json({ error: 'Failed to update suggestion.' });
    }
  }),
);

function encodeWordleEvaluation(evaluation) {
  return Array.isArray(evaluation) ? evaluation.join(',') : String(evaluation || '');
}

function countLeaderboardRows(rows, status) {
  return (rows || []).filter((row) => row.status === status).length;
}

const SOKOBAN_ASSIST_CAP_START_DAY = '2026-07-31';
const SOKOBAN_MAX_ASSISTS = 5;

/** From this day onward, resets and undos are each capped (same limit). */
function getSokobanAssistLimit(dayKey) {
  return String(dayKey || '') >= SOKOBAN_ASSIST_CAP_START_DAY ? SOKOBAN_MAX_ASSISTS : null;
}

function decodeWordleEvaluation(value) {
  if (Array.isArray(value)) {
    // Legacy / in-memory array form
    if (value.length && typeof value[0] === 'string' && !value[0].includes(',')) {
      return value;
    }
  }
  return String(value || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function serializeWordleGame(data = {}, { includeAnswer = false, answer = '' } = {}) {
  const status = data.status || 'in_progress';
  const finished = status === 'won' || status === 'lost';
  const evaluations = Array.isArray(data.evaluations)
    ? data.evaluations.map(decodeWordleEvaluation)
    : [];
  return {
    dayKey: data.dayKey || '',
    guesses: Array.isArray(data.guesses) ? data.guesses : [],
    evaluations,
    status,
    maxGuesses: MAX_GUESSES,
    guessCount: Array.isArray(data.guesses) ? data.guesses.length : 0,
    answer: includeAnswer && finished ? answer || data.answer || null : null,
    completedAt: data.completedAt?.toDate?.()?.toISOString?.() || null,
  };
}

async function buildWordleLeaderboard(dayKey) {
  const snap = await db
    .collection('wordle_games')
    .where('dayKey', '==', dayKey)
    .limit(200)
    .get();

  const rows = snap.docs.map((doc) => {
    const data = doc.data() || {};
    return {
      uid: data.uid || doc.id,
      fullName: data.fullName || 'Colleague',
      status: data.status || 'in_progress',
      guessCount: Array.isArray(data.guesses) ? data.guesses.length : data.guessCount || 6,
      completedAt: data.completedAt?.toDate?.()?.toISOString?.() || null,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() || null,
    };
  }).filter((row) => row.status === 'won' || row.status === 'lost');

  const wins = rows.filter((row) => row.status === 'won');
  const fails = rows.filter((row) => row.status === 'lost');

  wins.sort((a, b) => {
    if (a.guessCount !== b.guessCount) return a.guessCount - b.guessCount;
    const aTime = a.completedAt
      ? new Date(a.completedAt).getTime()
      : (a.updatedAt ? new Date(a.updatedAt).getTime() : Number.MAX_SAFE_INTEGER);
    const bTime = b.completedAt
      ? new Date(b.completedAt).getTime()
      : (b.updatedAt ? new Date(b.updatedAt).getTime() : Number.MAX_SAFE_INTEGER);
    return aTime - bTime;
  });
  fails.sort((a, b) => {
    const aTime = a.completedAt
      ? new Date(a.completedAt).getTime()
      : (a.updatedAt ? new Date(a.updatedAt).getTime() : Number.MAX_SAFE_INTEGER);
    const bTime = b.completedAt
      ? new Date(b.completedAt).getTime()
      : (b.updatedAt ? new Date(b.updatedAt).getTime() : Number.MAX_SAFE_INTEGER);
    return aTime - bTime;
  });

  assignJointRanks(wins, (a, b) => a.guessCount === b.guessCount);
  fails.forEach((row) => {
    row.rank = null;
    row.joint = false;
    row.medal = null;
    row.failed = true;
    row.rankLabel = '💩';
  });

  return [...wins, ...fails].map((row) => ({
    rank: row.rank,
    joint: Boolean(row.joint),
    medal: row.medal || null,
    failed: Boolean(row.failed),
    rankLabel: row.rankLabel || (row.rank ? ordinal(row.rank) : '💩'),
    uid: row.uid,
    fullName: row.fullName,
    status: row.status,
    guessCount: row.guessCount,
    completedAt: row.completedAt,
    resultLabel: row.status === 'won' ? `${row.guessCount}/6` : '💩 Failed',
  }));
}

// GET → today's Wordle state + solvers leaderboard.
exports.getDailyWordle = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const todayKey = getWordleDayKey();
      const sandbox = parseSandboxFlag(req) && canManagePortalAccess(session.profile);
      const { dayKey, practice } = resolvePlayableDayKey(req.query?.dayKey, todayKey, {
        sandbox,
        allowFuturePreview: sandbox,
      });
      const access = enforceFunGameAccess('wordle', { dayKey, practice, sandbox }, { softWeekend: true });
      if (access.closed) {
        res.status(200).json({
          ...funAccessClosedPayload(dayKey, access),
          totalSolved: 0,
          totalFailed: 0,
        });
        return;
      }
      const answer = getAnswerForDay(dayKey);
      const leaderboard = practice ? [] : await buildWordleLeaderboard(dayKey);

      let data = {
        dayKey,
        guesses: [],
        evaluations: [],
        status: 'in_progress',
      };

      if (!practice) {
        const gameId = `${dayKey}_${session.profile.uid}`;
        const snap = await db.collection('wordle_games').doc(gameId).get();
        if (snap.exists) data = snap.data();
      }

      res.status(200).json({
        practice,
        weekend: false,
        rotation: access.rotation,
        game: serializeWordleGame(data, { includeAnswer: true, answer }),
        leaderboard,
        totalSolved: countLeaderboardRows(leaderboard, 'won'),
        totalFailed: countLeaderboardRows(leaderboard, 'lost'),
      });
    } catch (error) {
      console.error('getDailyWordle failed', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to load daily Wordle.' });
    }
  }),
);

// POST { guess } → submit a Wordle guess for today.
exports.submitWordleGuess = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const guess = normalizeWord(req.body?.guess);
    if (!isValidGuess(guess)) {
      res.status(400).json({ error: 'Not in word list.' });
      return;
    }

    try {
      const todayKey = getWordleDayKey();
      const sandbox = parseSandboxFlag(req) && canManagePortalAccess(session.profile);
      const { dayKey, practice } = resolvePlayableDayKey(req.body?.dayKey, todayKey, {
        sandbox,
        allowFuturePreview: sandbox,
      });
      enforceFunGameAccess('wordle', { dayKey, practice, sandbox });
      const answer = getAnswerForDay(dayKey);

      // Practice: client holds board state via priorGuesses — no Firestore writes.
      if (practice) {
        const priorGuesses = Array.isArray(req.body?.priorGuesses)
          ? req.body.priorGuesses.map(normalizeWord).filter((word) => word.length === 5)
          : [];
        if (priorGuesses.includes(guess)) {
          res.status(400).json({ error: 'Already guessed that word.' });
          return;
        }
        if (priorGuesses.length >= MAX_GUESSES) {
          res.status(400).json({ error: 'No guesses remaining.' });
          return;
        }
        const guesses = [...priorGuesses, guess];
        const evaluations = guesses.map((word) => encodeWordleEvaluation(evaluateGuess(word, answer)));
        const won = guess === answer;
        const lost = !won && guesses.length >= MAX_GUESSES;
        const status = won ? 'won' : lost ? 'lost' : 'in_progress';
        const next = {
          dayKey,
          guesses,
          evaluations,
          status,
          guessCount: guesses.length,
          answer: won || lost ? answer : '',
        };
        res.status(200).json({
          alreadyFinished: false,
          practice: true,
          game: serializeWordleGame(next, { includeAnswer: true, answer }),
          leaderboard: [],
          totalSolved: 0,
          achievements: null,
        });
        return;
      }

      const gameId = `${dayKey}_${session.profile.uid}`;
      const ref = db.collection('wordle_games').doc(gameId);
      const existing = await ref.get();
      const current = existing.exists
        ? existing.data()
        : {
            dayKey,
            uid: session.profile.uid,
            fullName: session.profile.fullName || session.profile.email || 'Colleague',
            guesses: [],
            evaluations: [],
            status: 'in_progress',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          };

      if (current.status === 'won' || current.status === 'lost') {
        const leaderboard = await buildWordleLeaderboard(dayKey);
        res.status(200).json({
          alreadyFinished: true,
          practice: false,
          game: serializeWordleGame(current, { includeAnswer: true, answer }),
          leaderboard,
          totalSolved: countLeaderboardRows(leaderboard, 'won'),
          totalFailed: countLeaderboardRows(leaderboard, 'lost'),
        });
        return;
      }

      const guesses = Array.isArray(current.guesses) ? [...current.guesses] : [];
      if (guesses.includes(guess)) {
        res.status(400).json({ error: 'Already guessed that word.' });
        return;
      }
      if (guesses.length >= MAX_GUESSES) {
        res.status(400).json({ error: 'No guesses remaining.' });
        return;
      }

      const evaluation = evaluateGuess(guess, answer);
      guesses.push(guess);
      const previousEvaluations = Array.isArray(current.evaluations)
        ? current.evaluations.map(encodeWordleEvaluation)
        : [];
      const evaluations = [...previousEvaluations, encodeWordleEvaluation(evaluation)];
      const won = guess === answer;
      const lost = !won && guesses.length >= MAX_GUESSES;
      const status = won ? 'won' : lost ? 'lost' : 'in_progress';

      const next = {
        dayKey,
        uid: session.profile.uid,
        fullName: session.profile.fullName || session.profile.email || 'Colleague',
        email: session.profile.email || '',
        guesses,
        evaluations,
        status,
        guessCount: guesses.length,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (!existing.exists) {
        next.createdAt = admin.firestore.FieldValue.serverTimestamp();
      }
      if (won || lost) {
        next.completedAt = admin.firestore.FieldValue.serverTimestamp();
        next.answer = answer;
      }

      await ref.set(next, { merge: true });
      let achievements = null;
      if (won) {
        await recordFunStreakWin(db, {
          uid: session.profile.uid,
          fullName: session.profile.fullName || session.profile.email || 'Colleague',
          email: session.profile.email || '',
          gameKey: 'wordle',
          dayKey,
          FieldValue: admin.firestore.FieldValue,
        });
        const streaks = await loadFunStreaks(db, session.profile.uid, {
          todayKey,
          fullName: session.profile.fullName || session.profile.email || '',
          email: session.profile.email || '',
          FieldValue: admin.firestore.FieldValue,
        });
        achievements = serializeAchievements(streaks, todayKey);
      } else if (lost) {
        await recordFunStreakFail(db, {
          uid: session.profile.uid,
          fullName: session.profile.fullName || session.profile.email || 'Colleague',
          email: session.profile.email || '',
          gameKey: 'wordle',
          dayKey,
          FieldValue: admin.firestore.FieldValue,
        });
        const streaks = await loadFunStreaks(db, session.profile.uid, {
          todayKey,
          fullName: session.profile.fullName || session.profile.email || '',
          email: session.profile.email || '',
          FieldValue: admin.firestore.FieldValue,
        });
        achievements = serializeAchievements(streaks, todayKey);
      }
      const leaderboard = await buildWordleLeaderboard(dayKey);
      res.status(200).json({
        alreadyFinished: false,
        practice: false,
        game: serializeWordleGame(next, { includeAnswer: true, answer }),
        leaderboard,
        totalSolved: countLeaderboardRows(leaderboard, 'won'),
        totalFailed: countLeaderboardRows(leaderboard, 'lost'),
        achievements,
      });
    } catch (error) {
      console.error('submitWordleGuess failed', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to submit guess.' });
    }
  }),
);

async function buildSokobanLeaderboard(dayKey) {
  const snap = await db
    .collection('sokoban_games')
    .where('dayKey', '==', dayKey)
    .limit(200)
    .get();

  const rows = snap.docs.map((doc) => {
    const data = doc.data() || {};
    return {
      uid: data.uid || doc.id,
      fullName: data.fullName || 'Colleague',
      status: data.status || 'in_progress',
      moveCount: Number.isFinite(data.moveCount)
        ? data.moveCount
        : (Array.isArray(data.moves) ? data.moves.length : Number.MAX_SAFE_INTEGER),
      completedAt: data.completedAt?.toDate?.()?.toISOString?.() || null,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() || null,
    };
  }).filter((row) => row.status === 'won');

  rows.sort((a, b) => {
    if (a.moveCount !== b.moveCount) return a.moveCount - b.moveCount;
    const aTime = a.completedAt
      ? new Date(a.completedAt).getTime()
      : (a.updatedAt ? new Date(a.updatedAt).getTime() : Number.MAX_SAFE_INTEGER);
    const bTime = b.completedAt
      ? new Date(b.completedAt).getTime()
      : (b.updatedAt ? new Date(b.updatedAt).getTime() : Number.MAX_SAFE_INTEGER);
    return aTime - bTime;
  });

  assignJointRanks(rows, (a, b) => a.moveCount === b.moveCount);

  return rows.map((row) => ({
    rank: row.rank,
    joint: Boolean(row.joint),
    medal: row.medal || null,
    failed: false,
    rankLabel: row.rankLabel || ordinal(row.rank),
    uid: row.uid,
    fullName: row.fullName,
    status: row.status,
    moveCount: row.moveCount,
    completedAt: row.completedAt,
    resultLabel: `${row.moveCount} move${row.moveCount === 1 ? '' : 's'}`,
  }));
}

function applySokobanAction(puzzle, priorMoves, action, direction) {
  const engine = puzzleEngine(puzzle);
  const normalizedAction = String(action || 'move').trim().toLowerCase();

  if (normalizedAction === 'reset') {
    const initial = createInitialSokobanGame(puzzle, puzzle.dayKey);
    return { game: initial, alreadyFinished: false };
  }

  if (normalizedAction === 'sync') {
    const moves = Array.isArray(priorMoves)
      ? priorMoves.map(normalizeSokobanDirection).filter(Boolean)
      : [];
    const { state, moves: applied } = replaySokobanMoves(engine, moves);
    // Reject if client sent moves that break mid-sequence.
    if (applied.length !== moves.length) {
      const err = new Error('Move sequence is invalid for this puzzle.');
      err.status = 400;
      throw err;
    }
    const won = isSokobanSolved(state, engine.targets);
    return {
      game: {
        dayKey: puzzle.dayKey,
        puzzleId: puzzle.puzzleId,
        title: puzzle.title,
        difficulty: puzzle.difficulty,
        player: state.player,
        boxes: state.boxes,
        moves: applied,
        moveCount: applied.length,
        status: won ? 'won' : 'in_progress',
      },
      alreadyFinished: false,
    };
  }

  let moves = Array.isArray(priorMoves)
    ? priorMoves.map(normalizeSokobanDirection).filter(Boolean)
    : [];

  if (normalizedAction === 'undo') {
    if (!moves.length) {
      const err = new Error('Nothing to undo.');
      err.status = 400;
      throw err;
    }
    moves = moves.slice(0, -1);
  } else {
    const dir = normalizeSokobanDirection(direction);
    if (!dir) {
      const err = new Error('Move with up, down, left, or right.');
      err.status = 400;
      throw err;
    }
    const replayed = replaySokobanMoves(engine, moves);
    const result = applySokobanMove(engine, replayed.state, dir);
    if (!result.ok) {
      return {
        game: {
          dayKey: puzzle.dayKey,
          puzzleId: puzzle.puzzleId,
          title: puzzle.title,
          difficulty: puzzle.difficulty,
          player: replayed.state.player,
          boxes: replayed.state.boxes,
          moves: replayed.moves,
          moveCount: replayed.moves.length,
          status: isSokobanSolved(replayed.state, engine.targets) ? 'won' : 'in_progress',
        },
        alreadyFinished: false,
        blocked: true,
      };
    }
    moves = [...replayed.moves, dir];
  }

  const { state } = replaySokobanMoves(engine, moves);
  const won = isSokobanSolved(state, engine.targets);
  return {
    game: {
      dayKey: puzzle.dayKey,
      puzzleId: puzzle.puzzleId,
      title: puzzle.title,
      difficulty: puzzle.difficulty,
      player: state.player,
      boxes: state.boxes,
      moves,
      moveCount: moves.length,
      status: won ? 'won' : 'in_progress',
    },
    alreadyFinished: false,
  };
}

// GET → today's Sokoban state + solvers leaderboard.
exports.getDailySokoban = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const todayKey = getSokobanDayKey();
      const isAdmin = canManagePortalAccess(session.profile);
      const sandbox = parseSandboxFlag(req) && isAdmin;
      const { dayKey, practice, preview } = resolvePlayableDayKey(req.query?.dayKey, todayKey, {
        allowFuturePreview: isAdmin,
        sandbox,
      });
      const access = enforceFunGameAccess('sokoban', { dayKey, practice, sandbox }, { softWeekend: true });
      if (access.closed) {
        res.status(200).json(funAccessClosedPayload(dayKey, access));
        return;
      }
      const puzzle = await resolveSokobanPuzzle(dayKey);
      const leaderboard = practice ? [] : await buildSokobanLeaderboard(dayKey);
      const maxAssists = getSokobanAssistLimit(dayKey);

      let data = createInitialSokobanGame(puzzle, dayKey);
      data.maxResets = maxAssists;
      data.maxUndos = maxAssists;

      if (!practice) {
        const gameId = `${dayKey}_${session.profile.uid}`;
        const snap = await db.collection('sokoban_games').doc(gameId).get();
        if (snap.exists) {
          const saved = snap.data() || {};
          // Drop progress if the daily puzzle rotated to a different level.
          if (!saved.puzzleId || saved.puzzleId === puzzle.puzzleId) {
            data = {
              ...saved,
              resetCount: Number.isFinite(saved.resetCount) ? saved.resetCount : 0,
              undoCount: Number.isFinite(saved.undoCount) ? saved.undoCount : 0,
              maxResets: maxAssists,
              maxUndos: maxAssists,
            };
          }
        }
      }

      res.status(200).json({
        practice,
        preview: Boolean(preview),
        canPreviewFuture: isAdmin,
        puzzle: publicSokobanPuzzle(puzzle),
        game: serializeSokobanGame(data, { puzzle }),
        leaderboard,
        totalSolved: leaderboard.length,
      });
    } catch (error) {
      console.error('getDailySokoban failed', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to load daily Sokoban.' });
    }
  }),
);

// GET → admin preview of upcoming Sokoban puzzles.
exports.getSokobanPreview = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!canManagePortalAccess(session.profile)) {
      res.status(403).json({ error: 'Master admin access is required.' });
      return;
    }

    try {
      const todayKey = getSokobanDayKey();
      const days = Math.max(1, Math.min(60, Number(req.query?.days) || 21));
      const schedule = listUpcomingSokobanPuzzles(todayKey, days);
      res.status(200).json({
        todayKey,
        days,
        schedule,
      });
    } catch (error) {
      console.error('getSokobanPreview failed', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to load Sokoban preview.' });
    }
  }),
);

// POST { action:'sync', moves } → validate client play and save progress / win.
exports.submitSokobanMove = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const todayKey = getSokobanDayKey();
      const isAdmin = canManagePortalAccess(session.profile);
      const sandbox = parseSandboxFlag(req) && isAdmin;
      const { dayKey, practice } = resolvePlayableDayKey(req.body?.dayKey, todayKey, {
        allowFuturePreview: isAdmin,
        sandbox,
      });
      enforceFunGameAccess('sokoban', { dayKey, practice, sandbox });
      const puzzle = await resolveSokobanPuzzle(dayKey);
      const action = String(req.body?.action || 'sync').trim().toLowerCase();
      const direction = req.body?.direction;
      const clientMoves = Array.isArray(req.body?.moves)
        ? req.body.moves
        : (Array.isArray(req.body?.priorMoves) ? req.body.priorMoves : null);

      if (practice) {
        const priorMoves = clientMoves || [];
        const applied = action === 'sync'
          ? applySokobanAction(puzzle, priorMoves, 'sync')
          : applySokobanAction(puzzle, priorMoves, action, direction);
        res.status(200).json({
          alreadyFinished: false,
          practice: true,
          puzzle: publicSokobanPuzzle(puzzle),
          game: serializeSokobanGame(applied.game, { puzzle }),
          leaderboard: [],
          totalSolved: 0,
          achievements: null,
        });
        return;
      }

      const gameId = `${dayKey}_${session.profile.uid}`;
      const ref = db.collection('sokoban_games').doc(gameId);
      const existing = await ref.get();
      const current = existing.exists
        ? existing.data()
        : {
            ...createInitialSokobanGame(puzzle, dayKey),
            uid: session.profile.uid,
            fullName: session.profile.fullName || session.profile.email || 'Colleague',
            email: session.profile.email || '',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          };

      if (current.status === 'won') {
        const leaderboard = await buildSokobanLeaderboard(dayKey);
        res.status(200).json({
          alreadyFinished: true,
          practice: false,
          puzzle: publicSokobanPuzzle(puzzle),
          game: serializeSokobanGame(current, { puzzle }),
          leaderboard,
          totalSolved: leaderboard.length,
        });
        return;
      }

      const applied = action === 'sync'
        ? applySokobanAction(puzzle, clientMoves || current.moves || [], 'sync')
        : applySokobanAction(puzzle, current.moves || [], action, direction);

      const maxAssists = getSokobanAssistLimit(dayKey);
      const currentResetCount = Number.isFinite(current.resetCount) ? current.resetCount : 0;
      const currentUndoCount = Number.isFinite(current.undoCount) ? current.undoCount : 0;

      if (action === 'reset') {
        if (Number.isFinite(maxAssists) && currentResetCount >= maxAssists) {
          const leaderboard = await buildSokobanLeaderboard(dayKey);
          res.status(200).json({
            alreadyFinished: false,
            practice: false,
            blocked: true,
            message: `Reset limit reached (${maxAssists}/${maxAssists}).`,
            puzzle: publicSokobanPuzzle(puzzle),
            game: serializeSokobanGame({
              ...current,
              maxResets: maxAssists,
              maxUndos: maxAssists,
            }, { puzzle }),
            leaderboard,
            totalSolved: leaderboard.length,
          });
          return;
        }

        const initial = createInitialSokobanGame(puzzle, dayKey);
        const next = {
          ...current,
          player: initial.player,
          boxes: initial.boxes,
          moves: [],
          // Each reset starts a fresh attempt — move count goes back to zero.
          moveCount: 0,
          status: 'in_progress',
          uid: session.profile.uid,
          fullName: session.profile.fullName || session.profile.email || current.fullName || 'Colleague',
          email: session.profile.email || current.email || '',
          resetCount: currentResetCount + 1,
          undoCount: currentUndoCount,
          maxResets: maxAssists,
          maxUndos: maxAssists,
          completedAt: null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        if (!existing.exists) {
          next.createdAt = admin.firestore.FieldValue.serverTimestamp();
        }

        await ref.set(next, { merge: true });

        const leaderboard = await buildSokobanLeaderboard(dayKey);
        res.status(200).json({
          alreadyFinished: false,
          practice: false,
          message: Number.isFinite(maxAssists)
            ? `Board reset (${next.resetCount}/${maxAssists}) — move count restarted.`
            : 'Board reset — move count restarted.',
          puzzle: publicSokobanPuzzle(puzzle),
          game: serializeSokobanGame(next, { puzzle }),
          leaderboard,
          totalSolved: leaderboard.length,
        });
        return;
      }

      if (action === 'undo') {
        if (!(Array.isArray(current.moves) && current.moves.length)) {
          res.status(400).json({ error: 'Nothing to undo.' });
          return;
        }
        if (Number.isFinite(maxAssists) && currentUndoCount >= maxAssists) {
          const leaderboard = await buildSokobanLeaderboard(dayKey);
          res.status(200).json({
            alreadyFinished: false,
            practice: false,
            blocked: true,
            message: `Undo limit reached (${maxAssists}/${maxAssists}).`,
            puzzle: publicSokobanPuzzle(puzzle),
            game: serializeSokobanGame({
              ...current,
              maxResets: maxAssists,
              maxUndos: maxAssists,
            }, { puzzle }),
            leaderboard,
            totalSolved: leaderboard.length,
          });
          return;
        }

        const undoApplied = applySokobanAction(puzzle, current.moves || [], 'undo');
        const next = {
          ...current,
          ...undoApplied.game,
          moveCount: Array.isArray(undoApplied.game.moves) ? undoApplied.game.moves.length : 0,
          uid: session.profile.uid,
          fullName: session.profile.fullName || session.profile.email || current.fullName || 'Colleague',
          email: session.profile.email || current.email || '',
          resetCount: currentResetCount,
          undoCount: currentUndoCount + 1,
          maxResets: maxAssists,
          maxUndos: maxAssists,
          completedAt: null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        if (!existing.exists) {
          next.createdAt = admin.firestore.FieldValue.serverTimestamp();
        }

        await ref.set(next, { merge: true });

        const leaderboard = await buildSokobanLeaderboard(dayKey);
        res.status(200).json({
          alreadyFinished: false,
          practice: false,
          message: Number.isFinite(maxAssists)
            ? `Undid one move (${next.undoCount}/${maxAssists}).`
            : 'Undid one move.',
          puzzle: publicSokobanPuzzle(puzzle),
          game: serializeSokobanGame(next, { puzzle }),
          leaderboard,
          totalSolved: leaderboard.length,
        });
        return;
      }

      if (applied.blocked) {
        const leaderboard = await buildSokobanLeaderboard(dayKey);
        res.status(200).json({
          alreadyFinished: false,
          practice: false,
          blocked: true,
          puzzle: publicSokobanPuzzle(puzzle),
          game: serializeSokobanGame({
            ...current,
            maxResets: maxAssists,
            maxUndos: maxAssists,
          }, { puzzle }),
          leaderboard,
          totalSolved: leaderboard.length,
        });
        return;
      }

      const nextMoveCount = Array.isArray(applied.game.moves) ? applied.game.moves.length : 0;

      const next = {
        ...current,
        ...applied.game,
        moveCount: nextMoveCount,
        uid: session.profile.uid,
        fullName: session.profile.fullName || session.profile.email || current.fullName || 'Colleague',
        email: session.profile.email || current.email || '',
        resetCount: currentResetCount,
        undoCount: currentUndoCount,
        maxResets: maxAssists,
        maxUndos: maxAssists,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (applied.game.status === 'won') {
        next.completedAt = admin.firestore.FieldValue.serverTimestamp();
      }

      await ref.set(next, { merge: true });

      let achievements = null;
      if (applied.game.status === 'won') {
        await recordFunStreakWin(db, {
          uid: session.profile.uid,
          fullName: session.profile.fullName || session.profile.email || '',
          email: session.profile.email || '',
          gameKey: 'sokoban',
          dayKey,
          FieldValue: admin.firestore.FieldValue,
        });
        const streaks = await loadFunStreaks(db, session.profile.uid, {
          todayKey,
          fullName: session.profile.fullName || session.profile.email || '',
          email: session.profile.email || '',
          FieldValue: admin.firestore.FieldValue,
        });
        achievements = serializeAchievements(streaks, todayKey);
      }

      const leaderboard = await buildSokobanLeaderboard(dayKey);
      res.status(200).json({
        alreadyFinished: false,
        practice: false,
        puzzle: publicSokobanPuzzle(puzzle),
        game: serializeSokobanGame({ ...next, completedAt: applied.game.status === 'won' ? new Date().toISOString() : null }, { puzzle }),
        leaderboard,
        totalSolved: leaderboard.length,
        achievements,
      });
    } catch (error) {
      console.error('submitSokobanMove failed', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to submit Sokoban move.' });
    }
  }),
);

async function buildNonogramLeaderboard(dayKey) {
  const snap = await db
    .collection('nonogram_games')
    .where('dayKey', '==', dayKey)
    .limit(200)
    .get();

  const rows = snap.docs.map((doc) => {
    const data = doc.data() || {};
    return {
      uid: data.uid || doc.id,
      fullName: data.fullName || 'Colleague',
      status: data.status || 'in_progress',
      durationMs: Number.isFinite(data.durationMs) ? data.durationMs : Number.MAX_SAFE_INTEGER,
      completedAt: data.completedAt?.toDate?.()?.toISOString?.() || null,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() || null,
    };
  }).filter((row) => row.status === 'won' || row.status === 'lost');

  const wins = rows.filter((row) => row.status === 'won');
  const fails = rows.filter((row) => row.status === 'lost');

  wins.sort((a, b) => {
    if (a.durationMs !== b.durationMs) return a.durationMs - b.durationMs;
    const aTime = a.completedAt
      ? new Date(a.completedAt).getTime()
      : (a.updatedAt ? new Date(a.updatedAt).getTime() : Number.MAX_SAFE_INTEGER);
    const bTime = b.completedAt
      ? new Date(b.completedAt).getTime()
      : (b.updatedAt ? new Date(b.updatedAt).getTime() : Number.MAX_SAFE_INTEGER);
    return aTime - bTime;
  });
  fails.sort((a, b) => {
    const aTime = a.completedAt
      ? new Date(a.completedAt).getTime()
      : (a.updatedAt ? new Date(a.updatedAt).getTime() : Number.MAX_SAFE_INTEGER);
    const bTime = b.completedAt
      ? new Date(b.completedAt).getTime()
      : (b.updatedAt ? new Date(b.updatedAt).getTime() : Number.MAX_SAFE_INTEGER);
    return aTime - bTime;
  });

  assignJointRanks(wins, (a, b) => a.durationMs === b.durationMs);
  fails.forEach((row) => {
    row.rank = null;
    row.joint = false;
    row.medal = null;
    row.failed = true;
    row.rankLabel = '💩';
  });

  return [...wins, ...fails].map((row) => ({
    rank: row.rank,
    joint: Boolean(row.joint),
    medal: row.medal || null,
    failed: Boolean(row.failed),
    rankLabel: row.rankLabel || (row.rank ? ordinal(row.rank) : '💩'),
    uid: row.uid,
    fullName: row.fullName,
    status: row.status,
    durationMs: row.durationMs,
    durationLabel: row.status === 'won' ? formatDuration(row.durationMs) : '💩 Failed',
    completedAt: row.completedAt,
    resultLabel: row.status === 'won' ? formatDuration(row.durationMs) : '💩 Failed',
  }));
}

// GET → today's Nonogram puzzle + saved marks + solvers leaderboard.
exports.getDailyNonogram = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const todayKey = getNonogramDayKey();
      const requestedPuzzleId = String(req.query?.puzzleId || '').trim();
      const sandbox = parseSandboxFlag(req) && canManagePortalAccess(session.profile);
      const resolved = resolvePlayableDayKey(req.query?.dayKey, todayKey, {
        sandbox,
        allowFuturePreview: sandbox,
      });
      const practice = resolved.practice || Boolean(requestedPuzzleId);
      const dayKey = resolved.dayKey;
      const access = enforceFunGameAccess('nonogram', { dayKey, practice, sandbox }, { softWeekend: true });
      if (access.closed) {
        res.status(200).json(funAccessClosedPayload(dayKey, access));
        return;
      }
      const puzzle = await resolveDailyPuzzle(db, dayKey, {
        puzzleId: requestedPuzzleId || undefined,
        practice,
      });
      const leaderboard = practice ? [] : await buildNonogramLeaderboard(dayKey);

      let data = {
        dayKey,
        size: puzzle.size,
        marks: normalizeMarks(null, puzzle.size),
        status: 'in_progress',
        maxLives: NONOGRAM_MAX_LIVES,
        livesRemaining: NONOGRAM_MAX_LIVES,
        mistakes: 0,
      };

      if (!practice) {
        const gameId = `${dayKey}_${session.profile.uid}`;
        const snap = await db.collection('nonogram_games').doc(gameId).get();
        if (snap.exists) data = snap.data();
      }

      res.status(200).json({
        practice,
        puzzle: publicPuzzle(puzzle),
        // Used client-side for instant wrong-fill detection while playing.
        solution: puzzle.solution,
        game: serializeNonogramGame(data, {
          includeSolution: true,
          solution: puzzle.solution,
        }),
        leaderboard,
        totalSolved: countLeaderboardRows(leaderboard, 'won'),
        totalFailed: countLeaderboardRows(leaderboard, 'lost'),
      });
    } catch (error) {
      console.error('getDailyNonogram failed', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to load daily Nonogram.' });
    }
  }),
);

// GET → admin-only view of curated nonogram puzzles.
exports.getNonogramCatalog = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!canManagePortalAccess(session.profile)) {
      res.status(403).json({ error: 'Master admin access is required.' });
      return;
    }

    try {
      const puzzles = await listStoredCatalog(db, {
        includeValidation: true,
        includeSolution: true,
      });
      res.status(200).json({
        puzzles,
        palette: NONOGRAM_PIXEL_PALETTE,
        sizeRange: { min: NONOGRAM_MIN_SIZE, max: NONOGRAM_MAX_SIZE },
      });
    } catch (error) {
      console.error('getNonogramCatalog failed', error);
      res.status(500).json({ error: 'Failed to load Nonogram catalog.' });
    }
  }),
);

// POST { title, size, colorGrid, scheduledFor? } → create curated pixel-art puzzle.
exports.createNonogramPuzzle = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!canManagePortalAccess(session.profile)) {
      res.status(403).json({ error: 'Master admin access is required.' });
      return;
    }

    try {
      const puzzle = await createStoredPuzzle(db, {
        title: req.body?.title,
        subject: req.body?.subject,
        difficulty: req.body?.difficulty,
        colorGrid: req.body?.colorGrid,
        scheduledFor: req.body?.scheduledFor,
      }, session.profile);
      res.status(201).json({ puzzle });
    } catch (error) {
      console.error('createNonogramPuzzle failed', error);
      res.status(error.status || 500).json({
        error: error.message || 'Failed to create puzzle.',
        validation: error.validation || null,
      });
    }
  }),
);

// POST { puzzleId } → soft-delete a curated puzzle.
exports.deleteNonogramPuzzle = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!canManagePortalAccess(session.profile)) {
      res.status(403).json({ error: 'Master admin access is required.' });
      return;
    }

    try {
      const result = await deleteStoredPuzzle(db, req.body?.puzzleId);
      res.status(200).json(result);
    } catch (error) {
      console.error('deleteNonogramPuzzle failed', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to delete puzzle.' });
    }
  }),
);

// POST { puzzleId, scheduledFor } → schedule / clear schedule for a puzzle.
exports.scheduleNonogramPuzzle = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!canManagePortalAccess(session.profile)) {
      res.status(403).json({ error: 'Master admin access is required.' });
      return;
    }

    try {
      const puzzle = await scheduleStoredPuzzle(db, req.body?.puzzleId, req.body?.scheduledFor);
      res.status(200).json({ puzzle });
    } catch (error) {
      console.error('scheduleNonogramPuzzle failed', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to schedule puzzle.' });
    }
  }),
);

// POST { marks } → save progress / complete today's Nonogram.
exports.submitNonogramState = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const todayKey = getNonogramDayKey();
      const requestedPuzzleId = String(req.body?.puzzleId || '').trim();
      const sandbox = parseSandboxFlag(req) && canManagePortalAccess(session.profile);
      const resolved = resolvePlayableDayKey(req.body?.dayKey, todayKey, {
        sandbox,
        allowFuturePreview: sandbox,
      });
      const practice = resolved.practice || Boolean(requestedPuzzleId);
      const dayKey = resolved.dayKey;
      enforceFunGameAccess('nonogram', { dayKey, practice, sandbox });

      // Past-day practice never syncs to the competitive leaderboard / streaks.
      if (practice) {
        res.status(200).json({
          alreadyFinished: false,
          practice: true,
          correct: false,
          countedMistake: false,
          wrongCells: [],
          message: 'Practice play — not saved to the leaderboard.',
          leaderboard: [],
          totalSolved: 0,
          achievements: null,
        });
        return;
      }

      const puzzle = await resolveDailyPuzzle(db, dayKey, {
        puzzleId: requestedPuzzleId || undefined,
        practice,
      });
      const marksGrid = normalizeMarks(req.body?.marks, puzzle.size || NONOGRAM_SIZE);
      // Never persist incorrect fills — clear them server-side as a safety net.
      const wrongCells = findWrongFills(marksGrid, puzzle.solution);
      for (const cell of wrongCells) {
        marksGrid[cell.row][cell.col] = 0;
      }
      const marksFlat = flattenMarks(marksGrid, puzzle.size || NONOGRAM_SIZE);
      const gameId = `${dayKey}_${session.profile.uid}`;
      const ref = db.collection('nonogram_games').doc(gameId);
      const existing = await ref.get();
      const current = existing.exists ? existing.data() : null;

      if (current?.status === 'won' || current?.status === 'lost') {
        const leaderboard = await buildNonogramLeaderboard(dayKey);
        res.status(200).json({
          alreadyFinished: true,
          correct: current.status === 'won',
          wrongCells: [],
          solution: puzzle.solution,
          puzzle: publicPuzzle(puzzle),
          game: serializeNonogramGame(current, {
            includeSolution: true,
            solution: puzzle.solution,
          }),
          leaderboard,
          totalSolved: countLeaderboardRows(leaderboard, 'won'),
          totalFailed: countLeaderboardRows(leaderboard, 'lost'),
        });
        return;
      }

      const maxLives = current?.maxLives || NONOGRAM_MAX_LIVES;
      let mistakes = Number.isFinite(current?.mistakes) ? current.mistakes : 0;
      let livesRemaining = Number.isFinite(current?.livesRemaining)
        ? current.livesRemaining
        : Math.max(0, maxLives - mistakes);

      // Count an explicit wrong-fill click (live detection from the client).
      const mistake = req.body?.mistake;
      const mistakeRow = Number(mistake?.row);
      const mistakeCol = Number(mistake?.col);
      let countedMistake = false;
      if (
        Number.isInteger(mistakeRow)
        && Number.isInteger(mistakeCol)
        && mistakeRow >= 0
        && mistakeCol >= 0
        && mistakeRow < puzzle.size
        && mistakeCol < puzzle.size
        && puzzle.solution[mistakeRow][mistakeCol] !== 1
      ) {
        mistakes += 1;
        livesRemaining = Math.max(0, maxLives - mistakes);
        countedMistake = true;
        wrongCells.push({ row: mistakeRow, col: mistakeCol });
      }

      const won = isSolved(marksGrid, puzzle.solution);
      const lost = !won && livesRemaining <= 0;
      const nowTs = admin.firestore.Timestamp.now();
      const startedAt = current?.startedAt || nowTs;
      const status = won ? 'won' : lost ? 'lost' : 'in_progress';
      const next = {
        dayKey,
        size: puzzle.size,
        uid: session.profile.uid,
        fullName: session.profile.fullName || session.profile.email || 'Colleague',
        email: session.profile.email || '',
        marks: marksFlat,
        maxLives,
        livesRemaining,
        mistakes,
        status,
        startedAt,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (!existing.exists) {
        next.createdAt = admin.firestore.FieldValue.serverTimestamp();
      }

      if (won || lost) {
        const clientDuration = Number(req.body?.durationMs);
        const startedMs = startedAt?.toMillis?.()
          || startedAt?.toDate?.()?.getTime?.()
          || (typeof startedAt === 'string' ? new Date(startedAt).getTime() : Date.now());
        next.completedAt = nowTs;
        next.durationMs = Number.isFinite(clientDuration) && clientDuration >= 0
          ? clientDuration
          : Math.max(0, Date.now() - startedMs);
      }

      await ref.set(next, { merge: true });
      let achievements = null;
      if (won) {
        await recordFunStreakWin(db, {
          uid: session.profile.uid,
          fullName: session.profile.fullName || session.profile.email || 'Colleague',
          email: session.profile.email || '',
          gameKey: 'nonogram',
          dayKey,
          FieldValue: admin.firestore.FieldValue,
        });
        const streaks = await loadFunStreaks(db, session.profile.uid, {
          todayKey,
          fullName: session.profile.fullName || session.profile.email || '',
          email: session.profile.email || '',
          FieldValue: admin.firestore.FieldValue,
        });
        achievements = serializeAchievements(streaks, todayKey);
      } else if (lost) {
        await recordFunStreakFail(db, {
          uid: session.profile.uid,
          fullName: session.profile.fullName || session.profile.email || 'Colleague',
          email: session.profile.email || '',
          gameKey: 'nonogram',
          dayKey,
          FieldValue: admin.firestore.FieldValue,
        });
        const streaks = await loadFunStreaks(db, session.profile.uid, {
          todayKey,
          fullName: session.profile.fullName || session.profile.email || '',
          email: session.profile.email || '',
          FieldValue: admin.firestore.FieldValue,
        });
        achievements = serializeAchievements(streaks, todayKey);
      }
      const saved = (await ref.get()).data() || next;
      const leaderboard = await buildNonogramLeaderboard(dayKey);

      res.status(200).json({
        alreadyFinished: false,
        correct: won,
        countedMistake,
        wrongCells,
        solution: puzzle.solution,
        message: won
          ? 'Solved — well done.'
          : lost
            ? 'Out of lives — better luck tomorrow.'
            : countedMistake
              ? `Wrong fill — ${livesRemaining} ${livesRemaining === 1 ? 'life' : 'lives'} left.`
              : 'Progress saved.',
        puzzle: publicPuzzle(puzzle),
        game: serializeNonogramGame(saved, {
          includeSolution: true,
          solution: puzzle.solution,
        }),
        leaderboard,
        totalSolved: countLeaderboardRows(leaderboard, 'won'),
        totalFailed: countLeaderboardRows(leaderboard, 'lost'),
        achievements,
      });
    } catch (error) {
      console.error('submitNonogramState failed', error);
      res.status(error.status || 500).json({
        error: error.message || 'Failed to save Nonogram.',
        code: error.code || undefined,
      });
    }
  }),
);

async function buildBoggleLeaderboard(dayKey) {
  const snap = await db.collection('boggle_games').where('dayKey', '==', dayKey).limit(200).get();
  const rows = snap.docs.map((doc) => {
    const data = doc.data() || {};
    return {
      uid: data.uid || doc.id,
      fullName: data.fullName || 'Colleague',
      status: data.status || 'in_progress',
      score: Number.isFinite(data.score) ? data.score : 0,
      wordCount: Number.isFinite(data.wordCount) ? data.wordCount : 0,
      completedAt: data.completedAt?.toDate?.()?.toISOString?.() || null,
    };
  }).filter((row) => row.status === 'won' || row.status === 'lost');

  rows.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.wordCount !== a.wordCount) return b.wordCount - a.wordCount;
    const aTime = a.completedAt ? new Date(a.completedAt).getTime() : Number.MAX_SAFE_INTEGER;
    const bTime = b.completedAt ? new Date(b.completedAt).getTime() : Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  });

  assignJointRanks(rows, (a, b) => a.score === b.score && a.wordCount === b.wordCount);
  return rows.map((row) => ({
    rank: row.rank,
    joint: Boolean(row.joint),
    medal: row.medal || null,
    failed: row.status === 'lost',
    rankLabel: row.status === 'lost' && row.score <= 0
      ? '💩'
      : (row.rankLabel || (row.rank ? ordinal(row.rank) : '—')),
    uid: row.uid,
    fullName: row.fullName,
    status: row.status,
    score: row.score,
    wordCount: row.wordCount,
    completedAt: row.completedAt,
    resultLabel: `${row.score} pts · ${row.wordCount} words`,
  }));
}

async function buildConnectionsLeaderboard(dayKey) {
  const snap = await db.collection('connections_games').where('dayKey', '==', dayKey).limit(200).get();
  const rows = snap.docs.map((doc) => {
    const data = doc.data() || {};
    return {
      uid: data.uid || doc.id,
      fullName: data.fullName || 'Colleague',
      status: data.status || 'in_progress',
      mistakes: Number.isFinite(data.mistakes) ? data.mistakes : CONNECTIONS_MAX_MISTAKES,
      durationMs: Number.isFinite(data.durationMs) ? data.durationMs : Number.MAX_SAFE_INTEGER,
      completedAt: data.completedAt?.toDate?.()?.toISOString?.() || null,
    };
  }).filter((row) => row.status === 'won' || row.status === 'lost');

  const wins = rows.filter((row) => row.status === 'won');
  const fails = rows.filter((row) => row.status === 'lost');
  wins.sort((a, b) => {
    if (a.mistakes !== b.mistakes) return a.mistakes - b.mistakes;
    if (a.durationMs !== b.durationMs) return a.durationMs - b.durationMs;
    const aTime = a.completedAt ? new Date(a.completedAt).getTime() : Number.MAX_SAFE_INTEGER;
    const bTime = b.completedAt ? new Date(b.completedAt).getTime() : Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  });
  fails.sort((a, b) => {
    if (a.durationMs !== b.durationMs) return a.durationMs - b.durationMs;
    const aTime = a.completedAt ? new Date(a.completedAt).getTime() : Number.MAX_SAFE_INTEGER;
    const bTime = b.completedAt ? new Date(b.completedAt).getTime() : Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  });

  assignJointRanks(wins, (a, b) => a.mistakes === b.mistakes && a.durationMs === b.durationMs);
  fails.forEach((row) => {
    row.rank = null;
    row.joint = false;
    row.medal = null;
    row.failed = true;
    row.rankLabel = '💩';
  });

  return [...wins, ...fails].map((row) => {
    const hasDuration = Number.isFinite(row.durationMs) && row.durationMs < Number.MAX_SAFE_INTEGER;
    const durationLabel = hasDuration ? formatDuration(row.durationMs) : null;
    return {
      rank: row.rank,
      joint: Boolean(row.joint),
      medal: row.medal || null,
      failed: Boolean(row.failed),
      rankLabel: row.rankLabel || (row.rank ? ordinal(row.rank) : '💩'),
      uid: row.uid,
      fullName: row.fullName,
      status: row.status,
      mistakes: row.mistakes,
      durationMs: hasDuration ? row.durationMs : null,
      durationLabel,
      completedAt: row.completedAt,
      resultLabel: row.status === 'won'
        ? `${row.mistakes} mistake${row.mistakes === 1 ? '' : 's'}${durationLabel ? ` · ${durationLabel}` : ''}`
        : '💩 Failed',
    };
  });
}

// GET → daily Boggle board + saved result (play is local until submit).
exports.getDailyBoggle = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const todayKey = getBoggleDayKey();
      const sandbox = parseSandboxFlag(req) && canManagePortalAccess(session.profile);
      const { dayKey, practice } = resolvePlayableDayKey(req.query?.dayKey, todayKey, {
        sandbox,
        allowFuturePreview: sandbox,
      });
      const access = enforceFunGameAccess('boggle', { dayKey, practice, sandbox }, { softWeekend: true });
      if (access.closed) {
        res.status(200).json({
          ...funAccessClosedPayload(dayKey, access),
          totalPlayed: 0,
        });
        return;
      }
      const puzzle = publicBogglePuzzle(dayKey);
      const leaderboard = practice ? [] : await buildBoggleLeaderboard(dayKey);

      let game = {
        dayKey,
        status: 'in_progress',
        score: 0,
        wordCount: 0,
        words: [],
      };

      if (!practice) {
        const snap = await db.collection('boggle_games').doc(`${dayKey}_${session.profile.uid}`).get();
        if (snap.exists) game = serializeBoggleGame(snap.data() || {});
      }

      res.status(200).json({
        practice,
        weekend: false,
        rotation: access.rotation,
        puzzle,
        dictionaryUrl: '/api/getBoggleDictionary',
        dictionaryVersion: puzzle.dictionaryVersion || 'v2',
        game,
        leaderboard,
        totalPlayed: leaderboard.length,
      });
    } catch (error) {
      console.error('getDailyBoggle failed', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to load Boggle.' });
    }
  }),
);

// GET → Boggle word list (same-origin; avoids Storage CORS blocking the browser).
exports.getBoggleDictionary = onRequest(
  {
    region: 'europe-west2',
    memory: '1GiB',
    timeoutSeconds: 60,
  },
  withCors(async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const fs = require('fs');
      const path = require('path');
      const localPath = path.join(__dirname, 'data', 'funDictionary-v2.txt');
      let text = '';
      if (fs.existsSync(localPath)) {
        text = fs.readFileSync(localPath, 'utf8');
      } else {
        const bucket = admin.storage().bucket();
        const [buf] = await bucket.file('boggle/dictionary-v2.txt').download();
        text = buf.toString('utf8');
      }
      res.set('Cache-Control', 'private, max-age=86400');
      res.set('Content-Type', 'text/plain; charset=utf-8');
      res.set('X-Dictionary-Version', 'v2');
      res.status(200).send(text);
    } catch (error) {
      console.error('getBoggleDictionary failed', error);
      res.status(500).json({ error: 'Failed to load dictionary.' });
    }
  }),
);

// POST { words, durationMs?, dayKey? } → one write; server re-scores locally computed words.
exports.submitBoggleResult = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const todayKey = getBoggleDayKey();
      const sandbox = parseSandboxFlag(req) && canManagePortalAccess(session.profile);
      const { dayKey, practice } = resolvePlayableDayKey(req.body?.dayKey, todayKey, {
        sandbox,
        allowFuturePreview: sandbox,
      });
      enforceFunGameAccess('boggle', { dayKey, practice, sandbox });
      const puzzle = publicBogglePuzzle(dayKey);
      const bucket = admin.storage().bucket();
      // Warm/cache dictionary once per instance; validates submit against Storage-backed set.
      await ensureBoggleWordSet(bucket);
      const evaluated = await evaluateBoggleWords(puzzle.board, req.body?.words || [], { bucket });
      const durationMs = Number.isFinite(Number(req.body?.durationMs))
        ? Math.max(0, Math.min(BOGGLE_ROUND_SECONDS * 1000, Math.floor(Number(req.body.durationMs))))
        : null;
      const status = evaluated.score > 0 ? 'won' : 'lost';

      if (practice) {
        res.status(200).json({
          practice: true,
          game: {
            dayKey,
            status,
            score: evaluated.score,
            wordCount: evaluated.wordCount,
            words: evaluated.accepted,
            durationMs,
            completedAt: new Date().toISOString(),
          },
          leaderboard: [],
          totalPlayed: 0,
        });
        return;
      }

      const gameId = `${dayKey}_${session.profile.uid}`;
      const ref = db.collection('boggle_games').doc(gameId);
      const existing = await ref.get();
      if (existing.exists) {
        const prev = serializeBoggleGame(existing.data() || {});
        if (prev.status === 'won' || prev.status === 'lost') {
          const leaderboard = await buildBoggleLeaderboard(dayKey);
          res.status(200).json({
            practice: false,
            game: prev,
            leaderboard,
            totalPlayed: leaderboard.length,
          });
          return;
        }
      }

      const payload = {
        uid: session.profile.uid,
        fullName: session.profile.fullName || session.profile.email || 'Colleague',
        email: session.profile.email || '',
        dayKey,
        status,
        score: evaluated.score,
        wordCount: evaluated.wordCount,
        words: evaluated.accepted,
        durationMs,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      await ref.set(payload, { merge: true });

      let achievements = [];
      if (status === 'won') {
        const streaks = await recordFunStreakWin(db, {
          uid: session.profile.uid,
          fullName: payload.fullName,
          email: payload.email,
          gameKey: 'boggle',
          dayKey,
          FieldValue: admin.firestore.FieldValue,
        });
        const all = await loadFunStreaks(db, session.profile.uid, {
          todayKey: dayKey,
          fullName: payload.fullName,
          email: payload.email,
          FieldValue: admin.firestore.FieldValue,
        });
        achievements = serializeAchievements({ ...all, boggle: streaks }, dayKey);
      } else if (status === 'lost') {
        const streaks = await recordFunStreakFail(db, {
          uid: session.profile.uid,
          fullName: payload.fullName,
          email: payload.email,
          gameKey: 'boggle',
          dayKey,
          FieldValue: admin.firestore.FieldValue,
        });
        const all = await loadFunStreaks(db, session.profile.uid, {
          todayKey: dayKey,
          fullName: payload.fullName,
          email: payload.email,
          FieldValue: admin.firestore.FieldValue,
        });
        achievements = serializeAchievements({ ...all, boggle: streaks }, dayKey);
      }

      const snap = await ref.get();
      const leaderboard = await buildBoggleLeaderboard(dayKey);
      await syncDayMedals(db, {
        gameKey: 'boggle',
        dayKey,
        leaderboardRows: leaderboard,
        FieldValue: admin.firestore.FieldValue,
      });
      res.status(200).json({
        practice: false,
        game: serializeBoggleGame(snap.data() || {}),
        leaderboard,
        totalPlayed: leaderboard.length,
        achievements,
      });
    } catch (error) {
      console.error('submitBoggleResult failed', error);
      res.status(500).json({ error: 'Failed to submit Boggle.' });
    }
  }),
);

// GET → daily Connections words + group hashes (titles included; word→group mapping is not).
exports.getDailyConnections = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const todayKey = getConnectionsDayKey();
      const sandbox = parseSandboxFlag(req) && canManagePortalAccess(session.profile);
      const { dayKey, practice } = resolvePlayableDayKey(req.query?.dayKey, todayKey, {
        sandbox,
        allowFuturePreview: sandbox,
      });
      const access = enforceFunGameAccess('connections', { dayKey, practice, sandbox }, { softWeekend: true });
      if (access.closed) {
        res.status(200).json({
          ...funAccessClosedPayload(dayKey, access),
          totalPlayed: 0,
        });
        return;
      }
      const puzzle = await resolveConnectionsPuzzle(dayKey);
      const leaderboard = practice ? [] : await buildConnectionsLeaderboard(dayKey);

      let gameData = { dayKey, status: 'in_progress', mistakes: 0, solved: [] };
      if (!practice) {
        const snap = await db.collection('connections_games').doc(`${dayKey}_${session.profile.uid}`).get();
        if (snap.exists) gameData = snap.data() || gameData;
      }

      const finished = gameData.status === 'won' || gameData.status === 'lost';
      res.status(200).json({
        practice,
        weekend: false,
        rotation: access.rotation,
        puzzle: publicConnectionsPuzzle(puzzle, { reveal: finished }),
        game: serializeConnectionsGame(gameData, puzzle),
        leaderboard,
        totalPlayed: leaderboard.length,
      });
    } catch (error) {
      console.error('getDailyConnections failed', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to load Connections.' });
    }
  }),
);

// POST { guesses, startedAt?, durationMs?, dayKey? } → one write after local play finishes.
exports.submitConnectionsResult = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const todayKey = getConnectionsDayKey();
      const sandbox = parseSandboxFlag(req) && canManagePortalAccess(session.profile);
      const { dayKey, practice } = resolvePlayableDayKey(req.body?.dayKey, todayKey, {
        sandbox,
        allowFuturePreview: sandbox,
      });
      enforceFunGameAccess('connections', { dayKey, practice, sandbox });
      const puzzle = await resolveConnectionsPuzzle(dayKey);
      const evaluated = evaluateConnectionsGuesses(puzzle, req.body?.guesses || []);

      if (evaluated.status === 'in_progress') {
        res.status(400).json({ error: 'Finish the puzzle (solve all groups or use all mistakes) before submitting.' });
        return;
      }

      const clientDuration = Number(req.body?.durationMs);
      const clientStartedAt = typeof req.body?.startedAt === 'string' ? req.body.startedAt : null;
      const durationMs = Number.isFinite(clientDuration) && clientDuration >= 0
        ? Math.floor(clientDuration)
        : null;

      if (practice) {
        res.status(200).json({
          practice: true,
          game: serializeConnectionsGame({
            dayKey,
            status: evaluated.status,
            mistakes: evaluated.mistakes,
            solved: evaluated.solved,
            startedAt: clientStartedAt,
            durationMs,
            completedAt: new Date().toISOString(),
          }, puzzle),
          leaderboard: [],
          totalPlayed: 0,
        });
        return;
      }

      const gameId = `${dayKey}_${session.profile.uid}`;
      const ref = db.collection('connections_games').doc(gameId);
      const existing = await ref.get();
      if (existing.exists) {
        const prev = existing.data() || {};
        if (prev.status === 'won' || prev.status === 'lost') {
          const leaderboard = await buildConnectionsLeaderboard(dayKey);
          res.status(200).json({
            practice: false,
            game: serializeConnectionsGame(prev, puzzle),
            leaderboard,
            totalPlayed: leaderboard.length,
          });
          return;
        }
      }

      const payload = {
        uid: session.profile.uid,
        fullName: session.profile.fullName || session.profile.email || 'Colleague',
        email: session.profile.email || '',
        dayKey,
        puzzleId: puzzle.id,
        status: evaluated.status,
        mistakes: evaluated.mistakes,
        solved: evaluated.solved,
        startedAt: clientStartedAt || null,
        durationMs,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      await ref.set(payload, { merge: true });

      let achievements = [];
      if (evaluated.status === 'won') {
        const streaks = await recordFunStreakWin(db, {
          uid: session.profile.uid,
          fullName: payload.fullName,
          email: payload.email,
          gameKey: 'connections',
          dayKey,
          FieldValue: admin.firestore.FieldValue,
        });
        const all = await loadFunStreaks(db, session.profile.uid, {
          todayKey: dayKey,
          fullName: payload.fullName,
          email: payload.email,
          FieldValue: admin.firestore.FieldValue,
        });
        achievements = serializeAchievements({ ...all, connections: streaks }, dayKey);
      } else if (evaluated.status === 'lost') {
        const streaks = await recordFunStreakFail(db, {
          uid: session.profile.uid,
          fullName: payload.fullName,
          email: payload.email,
          gameKey: 'connections',
          dayKey,
          FieldValue: admin.firestore.FieldValue,
        });
        const all = await loadFunStreaks(db, session.profile.uid, {
          todayKey: dayKey,
          fullName: payload.fullName,
          email: payload.email,
          FieldValue: admin.firestore.FieldValue,
        });
        achievements = serializeAchievements({ ...all, connections: streaks }, dayKey);
      }

      const snap = await ref.get();
      const leaderboard = await buildConnectionsLeaderboard(dayKey);
      await syncDayMedals(db, {
        gameKey: 'connections',
        dayKey,
        leaderboardRows: leaderboard,
        FieldValue: admin.firestore.FieldValue,
      });
      res.status(200).json({
        practice: false,
        game: serializeConnectionsGame(snap.data() || {}, puzzle),
        leaderboard,
        totalPlayed: leaderboard.length,
        achievements,
      });
    } catch (error) {
      console.error('submitConnectionsResult failed', error);
      res.status(500).json({ error: 'Failed to submit Connections.' });
    }
  }),
);

// GET → daily Enclose puzzle + saved result / leaderboard.
exports.getDailyEnclose = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const todayKey = getEncloseDayKey();
      if (todayKey < ENCLOSE_LIVE_FROM && !(parseSandboxFlag(req) && canManagePortalAccess(session.profile))) {
        res.status(403).json({
          error: `Enclose goes live ${ENCLOSE_LIVE_FROM}. Today is practice-only (seed levels on the Fun tab).`,
          encloseLiveFrom: ENCLOSE_LIVE_FROM,
        });
        return;
      }
      const sandbox = parseSandboxFlag(req) && canManagePortalAccess(session.profile);
      const { dayKey, practice } = resolvePlayableDayKey(req.query?.dayKey, todayKey, {
        sandbox,
        allowFuturePreview: sandbox,
      });
      const access = enforceFunGameAccess('enclose', { dayKey, practice, sandbox }, { softWeekend: true });
      if (access.closed) {
        res.status(200).json({
          ...funAccessClosedPayload(dayKey, access),
          totalPlayed: 0,
        });
        return;
      }
      const puzzle = await resolveEnclosePuzzle(dayKey);
      const leaderboard = practice ? [] : await buildEncloseLeaderboard(dayKey);

      let gameData = { dayKey, status: 'in_progress', score: 0, walls: [] };
      if (!practice) {
        const snap = await db.collection('enclose_games').doc(`${dayKey}_${session.profile.uid}`).get();
        if (snap.exists) gameData = snap.data() || gameData;
      }

      res.status(200).json({
        practice,
        weekend: false,
        rotation: access.rotation,
        puzzle: publicEnclosePuzzle(puzzle),
        game: serializeEncloseGame(gameData),
        leaderboard,
        totalPlayed: leaderboard.length,
      });
    } catch (error) {
      console.error('getDailyEnclose failed', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to load Enclose.' });
    }
  }),
);

// POST { walls, startedAt?, durationMs?, dayKey? } → one write after enclose submit.
exports.submitEncloseResult = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const todayKey = getEncloseDayKey();
      if (todayKey < ENCLOSE_LIVE_FROM && !(parseSandboxFlag(req) && canManagePortalAccess(session.profile))) {
        res.status(403).json({
          error: `Enclose goes live ${ENCLOSE_LIVE_FROM}. Practice scores are not submitted.`,
          encloseLiveFrom: ENCLOSE_LIVE_FROM,
        });
        return;
      }
      const sandbox = parseSandboxFlag(req) && canManagePortalAccess(session.profile);
      const { dayKey, practice } = resolvePlayableDayKey(req.body?.dayKey, todayKey, {
        sandbox,
        allowFuturePreview: sandbox,
      });
      enforceFunGameAccess('enclose', { dayKey, practice, sandbox });
      const puzzle = await resolveEnclosePuzzle(dayKey);
      const evaluated = evaluateEncloseSubmission(puzzle, req.body?.walls || []);

      const clientDuration = Number(req.body?.durationMs);
      const clientStartedAt = typeof req.body?.startedAt === 'string' ? req.body.startedAt : null;
      const durationMs = Number.isFinite(clientDuration) && clientDuration >= 0
        ? Math.floor(clientDuration)
        : null;

      if (practice) {
        res.status(200).json({
          practice: true,
          game: serializeEncloseGame({
            dayKey,
            status: evaluated.status,
            score: evaluated.score,
            escaped: evaluated.escaped,
            walls: evaluated.walls,
            breakdown: evaluated.breakdown,
            startedAt: clientStartedAt,
            durationMs,
            completedAt: new Date().toISOString(),
          }),
          leaderboard: [],
          totalPlayed: 0,
        });
        return;
      }

      const gameId = `${dayKey}_${session.profile.uid}`;
      const ref = db.collection('enclose_games').doc(gameId);
      const existing = await ref.get();
      if (existing.exists) {
        const prev = existing.data() || {};
        if (prev.status === 'won' || prev.status === 'lost') {
          const leaderboard = await buildEncloseLeaderboard(dayKey);
          res.status(200).json({
            practice: false,
            game: serializeEncloseGame(prev),
            leaderboard,
            totalPlayed: leaderboard.length,
          });
          return;
        }
      }

      const payload = {
        uid: session.profile.uid,
        fullName: session.profile.fullName || session.profile.email || 'Colleague',
        email: session.profile.email || '',
        dayKey,
        puzzleId: puzzle.id,
        status: evaluated.status,
        score: evaluated.score,
        escaped: evaluated.escaped,
        walls: evaluated.walls,
        breakdown: evaluated.breakdown,
        startedAt: clientStartedAt || null,
        durationMs,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      await ref.set(payload, { merge: true });

      let achievements = [];
      if (evaluated.status === 'won') {
        const streaks = await recordFunStreakWin(db, {
          uid: session.profile.uid,
          fullName: payload.fullName,
          email: payload.email,
          gameKey: 'enclose',
          dayKey,
          FieldValue: admin.firestore.FieldValue,
        });
        const all = await loadFunStreaks(db, session.profile.uid, {
          todayKey: dayKey,
          fullName: payload.fullName,
          email: payload.email,
          FieldValue: admin.firestore.FieldValue,
        });
        achievements = serializeAchievements({ ...all, enclose: streaks }, dayKey);
      } else if (evaluated.status === 'lost') {
        const streaks = await recordFunStreakFail(db, {
          uid: session.profile.uid,
          fullName: payload.fullName,
          email: payload.email,
          gameKey: 'enclose',
          dayKey,
          FieldValue: admin.firestore.FieldValue,
        });
        const all = await loadFunStreaks(db, session.profile.uid, {
          todayKey: dayKey,
          fullName: payload.fullName,
          email: payload.email,
          FieldValue: admin.firestore.FieldValue,
        });
        achievements = serializeAchievements({ ...all, enclose: streaks }, dayKey);
      }

      const snap = await ref.get();
      const leaderboard = await buildEncloseLeaderboard(dayKey);
      await syncDayMedals(db, {
        gameKey: 'enclose',
        dayKey,
        leaderboardRows: leaderboard,
        FieldValue: admin.firestore.FieldValue,
      });
      res.status(200).json({
        practice: false,
        game: serializeEncloseGame(snap.data() || {}),
        leaderboard,
        totalPlayed: leaderboard.length,
        achievements,
      });
    } catch (error) {
      console.error('submitEncloseResult failed', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to submit Enclose.' });
    }
  }),
);

// GET → daily Letter Box puzzle + saved result / leaderboard.
exports.getDailyLetterbox = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const todayKey = getLetterboxDayKey();
      const sandbox = parseSandboxFlag(req) && canManagePortalAccess(session.profile);
      if (todayKey < LETTERBOX_LIVE_FROM && !sandbox) {
        res.status(403).json({
          error: `Letter Box goes live ${LETTERBOX_LIVE_FROM}. Practice is available on the Fun tab and Fun Admin Dev tab.`,
          letterboxLiveFrom: LETTERBOX_LIVE_FROM,
        });
        return;
      }
      const { dayKey, practice } = resolvePlayableDayKey(req.query?.dayKey, todayKey, {
        sandbox,
        allowFuturePreview: sandbox,
      });
      const access = enforceFunGameAccess('letterbox', { dayKey, practice, sandbox }, { softWeekend: true });
      if (access.closed) {
        res.status(200).json({
          ...funAccessClosedPayload(dayKey, access),
          totalSolved: 0,
        });
        return;
      }

      const puzzle = getLetterboxPuzzleForDay(dayKey);
      const leaderboard = practice ? [] : await buildLetterboxLeaderboard(dayKey);

      let gameData = {
        dayKey,
        status: 'in_progress',
        words: [],
        wordCount: 0,
        letterCount: 0,
        par: puzzle.par,
      };
      if (!practice) {
        const snap = await db.collection('letterbox_games').doc(`${dayKey}_${session.profile.uid}`).get();
        if (snap.exists) gameData = snap.data() || gameData;
      }

      const won = gameData.status === 'won';
      res.status(200).json({
        practice,
        weekend: false,
        rotation: access.rotation,
        letterboxLiveFrom: LETTERBOX_LIVE_FROM,
        puzzle: publicLetterboxPuzzle(puzzle, { reveal: won }),
        game: serializeLetterboxGame(gameData, { includeSolution: won, puzzle }),
        leaderboard,
        totalSolved: leaderboard.length,
      });
    } catch (error) {
      console.error('getDailyLetterbox failed', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to load Letter Box.' });
    }
  }),
);

// POST { words, startedAt?, durationMs?, dayKey?, sandbox? } → submit Letter Box chain (win on full cover).
exports.submitLetterboxResult = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const todayKey = getLetterboxDayKey();
      const sandbox = parseSandboxFlag(req) && canManagePortalAccess(session.profile);
      if (todayKey < LETTERBOX_LIVE_FROM && !sandbox) {
        res.status(403).json({
          error: `Letter Box goes live ${LETTERBOX_LIVE_FROM}. Practice scores are not submitted.`,
          letterboxLiveFrom: LETTERBOX_LIVE_FROM,
        });
        return;
      }
      const { dayKey, practice } = resolvePlayableDayKey(req.body?.dayKey, todayKey, {
        sandbox,
        allowFuturePreview: sandbox,
      });
      enforceFunGameAccess('letterbox', { dayKey, practice, sandbox });

      const puzzle = getLetterboxPuzzleForDay(dayKey);
      const bucket = admin.storage().bucket();
      const evaluated = await evaluateLetterboxChain(puzzle, req.body?.words || [], { bucket });

      if (evaluated.status === 'invalid') {
        res.status(400).json({
          error: evaluated.reason === 'dictionary'
            ? 'That word is not in the dictionary.'
            : evaluated.reason === 'sides'
              ? 'Consecutive letters cannot share a side.'
              : evaluated.reason === 'chain'
                ? 'Each word must start with the previous word’s last letter.'
                : 'Invalid word chain.',
          reason: evaluated.reason,
        });
        return;
      }

      if (!evaluated.solved) {
        res.status(400).json({
          error: 'Use every letter on the square at least once to solve.',
          game: serializeLetterboxGame({
            dayKey,
            status: 'in_progress',
            words: evaluated.words,
            wordCount: evaluated.wordCount,
            letterCount: evaluated.letterCount,
            usedLetters: evaluated.usedLetters,
            par: puzzle.par,
          }),
        });
        return;
      }

      const clientDuration = Number(req.body?.durationMs);
      const clientStartedAt = typeof req.body?.startedAt === 'string' ? req.body.startedAt : null;
      const durationMs = Number.isFinite(clientDuration) && clientDuration >= 0
        ? Math.floor(clientDuration)
        : null;

      if (practice || sandbox) {
        res.status(200).json({
          practice: true,
          sandbox: Boolean(sandbox),
          game: serializeLetterboxGame({
            dayKey,
            status: 'won',
            words: evaluated.words,
            wordCount: evaluated.wordCount,
            letterCount: evaluated.letterCount,
            usedLetters: evaluated.usedLetters,
            par: puzzle.par,
            startedAt: clientStartedAt,
            durationMs,
            completedAt: new Date().toISOString(),
          }, { includeSolution: true, puzzle }),
          puzzle: publicLetterboxPuzzle(puzzle, { reveal: true }),
          leaderboard: [],
          totalSolved: 0,
        });
        return;
      }

      const gameId = `${dayKey}_${session.profile.uid}`;
      const ref = db.collection('letterbox_games').doc(gameId);
      const existing = await ref.get();
      if (existing.exists && existing.data()?.status === 'won') {
        const leaderboard = await buildLetterboxLeaderboard(dayKey);
        res.status(200).json({
          practice: false,
          game: serializeLetterboxGame(existing.data() || {}, { includeSolution: true, puzzle }),
          puzzle: publicLetterboxPuzzle(puzzle, { reveal: true }),
          leaderboard,
          totalSolved: leaderboard.length,
        });
        return;
      }

      const payload = {
        uid: session.profile.uid,
        fullName: session.profile.fullName || session.profile.email || 'Colleague',
        email: session.profile.email || '',
        dayKey,
        puzzleId: puzzle.id,
        status: 'won',
        words: evaluated.words,
        wordCount: evaluated.wordCount,
        letterCount: evaluated.letterCount,
        usedLetters: evaluated.usedLetters,
        par: puzzle.par,
        atOrUnderPar: Boolean(evaluated.atOrUnderPar),
        startedAt: clientStartedAt || null,
        durationMs,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      await ref.set(payload, { merge: true });

      const streaks = await recordFunStreakWin(db, {
        uid: session.profile.uid,
        fullName: payload.fullName,
        email: payload.email,
        gameKey: 'letterbox',
        dayKey,
        FieldValue: admin.firestore.FieldValue,
      });
      const all = await loadFunStreaks(db, session.profile.uid, {
        todayKey: dayKey,
        fullName: payload.fullName,
        email: payload.email,
        FieldValue: admin.firestore.FieldValue,
      });
      const achievements = serializeAchievements({ ...all, letterbox: streaks }, dayKey);

      const snap = await ref.get();
      const leaderboard = await buildLetterboxLeaderboard(dayKey);
      await syncDayMedals(db, {
        gameKey: 'letterbox',
        dayKey,
        leaderboardRows: leaderboard,
        FieldValue: admin.firestore.FieldValue,
      });

      res.status(200).json({
        practice: false,
        game: serializeLetterboxGame(snap.data() || {}, { includeSolution: true, puzzle }),
        puzzle: publicLetterboxPuzzle(puzzle, { reveal: true }),
        leaderboard,
        totalSolved: leaderboard.length,
        achievements,
      });
    } catch (error) {
      console.error('submitLetterboxResult failed', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to submit Letter Box.' });
    }
  }),
);

// GET → daily Pipes puzzle + saved result / leaderboard.
exports.getDailyPipes = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const todayKey = getPipesDayKey();
      const sandbox = parseSandboxFlag(req) && canManagePortalAccess(session.profile);
      if (todayKey < PIPES_LIVE_FROM && !sandbox) {
        res.status(403).json({
          error: `Pipes goes live ${PIPES_LIVE_FROM}.`,
          pipesLiveFrom: PIPES_LIVE_FROM,
        });
        return;
      }
      const { dayKey, practice } = resolvePlayableDayKey(req.query?.dayKey, todayKey, {
        sandbox,
        allowFuturePreview: sandbox,
      });
      const access = enforceFunGameAccess('pipes', { dayKey, practice, sandbox }, { softWeekend: true });
      if (access.closed) {
        res.status(200).json({
          ...funAccessClosedPayload(dayKey, access),
          totalSolved: 0,
        });
        return;
      }

      const puzzle = getPipesPuzzleForDay(dayKey);
      const leaderboard = practice ? [] : await buildPipesLeaderboard(dayKey);

      let gameData = {
        dayKey,
        status: 'in_progress',
        moves: 0,
      };
      if (!practice) {
        const snap = await db.collection('pipes_games').doc(`${dayKey}_${session.profile.uid}`).get();
        if (snap.exists) gameData = snap.data() || gameData;
      }

      const won = gameData.status === 'won';
      res.status(200).json({
        practice,
        weekend: false,
        rotation: access.rotation,
        pipesLiveFrom: PIPES_LIVE_FROM,
        puzzle: publicPipesPuzzle(puzzle),
        game: serializePipesGame(gameData, { includeRotations: won }),
        leaderboard,
        totalSolved: leaderboard.length,
      });
    } catch (error) {
      console.error('getDailyPipes failed', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to load Pipes.' });
    }
  }),
);

// POST { rotations, moves?, startedAt?, durationMs?, dayKey?, sandbox? } → win when every tile is filled.
exports.submitPipesResult = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const todayKey = getPipesDayKey();
      const sandbox = parseSandboxFlag(req) && canManagePortalAccess(session.profile);
      if (todayKey < PIPES_LIVE_FROM && !sandbox) {
        res.status(403).json({
          error: `Pipes goes live ${PIPES_LIVE_FROM}. Practice scores are not submitted.`,
          pipesLiveFrom: PIPES_LIVE_FROM,
        });
        return;
      }
      const { dayKey, practice } = resolvePlayableDayKey(req.body?.dayKey, todayKey, {
        sandbox,
        allowFuturePreview: sandbox,
      });
      enforceFunGameAccess('pipes', { dayKey, practice, sandbox });

      const puzzle = getPipesPuzzleForDay(dayKey);
      const evaluated = evaluatePipesRotations(puzzle, req.body?.rotations || []);
      if (!evaluated.solved) {
        res.status(400).json({
          error: 'Fill every tile with water — rotate until the whole board is one connected network.',
          filledTiles: evaluated.filledTiles,
          totalTiles: evaluated.totalTiles,
        });
        return;
      }

      const clientDuration = Number(req.body?.durationMs);
      const clientStartedAt = typeof req.body?.startedAt === 'string' ? req.body.startedAt : null;
      const durationMs = Number.isFinite(clientDuration) && clientDuration >= 0
        ? Math.floor(clientDuration)
        : null;
      const moves = Math.max(0, Math.floor(Number(req.body?.moves) || 0));

      if (practice || sandbox) {
        res.status(200).json({
          practice: true,
          sandbox: Boolean(sandbox),
          game: serializePipesGame({
            dayKey,
            status: 'won',
            moves,
            rotations: evaluated.rotations,
            startedAt: clientStartedAt,
            durationMs,
            completedAt: new Date().toISOString(),
          }, { includeRotations: true }),
          puzzle: publicPipesPuzzle(puzzle),
          leaderboard: [],
          totalSolved: 0,
        });
        return;
      }

      const gameId = `${dayKey}_${session.profile.uid}`;
      const ref = db.collection('pipes_games').doc(gameId);
      const existing = await ref.get();
      if (existing.exists && existing.data()?.status === 'won') {
        const leaderboard = await buildPipesLeaderboard(dayKey);
        res.status(200).json({
          practice: false,
          game: serializePipesGame(existing.data() || {}, { includeRotations: true }),
          puzzle: publicPipesPuzzle(puzzle),
          leaderboard,
          totalSolved: leaderboard.length,
        });
        return;
      }

      const payload = {
        uid: session.profile.uid,
        fullName: session.profile.fullName || session.profile.email || 'Colleague',
        email: session.profile.email || '',
        dayKey,
        puzzleId: puzzle.id,
        status: 'won',
        moves,
        rotations: evaluated.rotations,
        startedAt: clientStartedAt || null,
        durationMs,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      await ref.set(payload, { merge: true });

      const streaks = await recordFunStreakWin(db, {
        uid: session.profile.uid,
        fullName: payload.fullName,
        email: payload.email,
        gameKey: 'pipes',
        dayKey,
        FieldValue: admin.firestore.FieldValue,
      });
      const all = await loadFunStreaks(db, session.profile.uid, {
        todayKey: dayKey,
        fullName: payload.fullName,
        email: payload.email,
        FieldValue: admin.firestore.FieldValue,
      });
      const achievements = serializeAchievements({ ...all, pipes: streaks }, dayKey);

      const snap = await ref.get();
      const leaderboard = await buildPipesLeaderboard(dayKey);
      await syncDayMedals(db, {
        gameKey: 'pipes',
        dayKey,
        leaderboardRows: leaderboard,
        FieldValue: admin.firestore.FieldValue,
      });

      res.status(200).json({
        practice: false,
        game: serializePipesGame(snap.data() || {}, { includeRotations: true }),
        puzzle: publicPipesPuzzle(puzzle),
        leaderboard,
        totalSolved: leaderboard.length,
        achievements,
      });
    } catch (error) {
      console.error('submitPipesResult failed', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to submit Pipes.' });
    }
  }),
);

// GET → daily Toolbox Kick saved result / leaderboard (one round per day).
exports.getDailyToolboxKick = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const todayKey = getToolboxKickDayKey();
      const sandbox = parseSandboxFlag(req) && canManagePortalAccess(session.profile);
      if (todayKey < TOOLBOX_KICK_LIVE_FROM && !sandbox) {
        res.status(403).json({
          error: `Little Dicks Toolbox goes live ${TOOLBOX_KICK_LIVE_FROM}.`,
          toolboxKickLiveFrom: TOOLBOX_KICK_LIVE_FROM,
        });
        return;
      }
      const { dayKey, practice } = resolvePlayableDayKey(req.query?.dayKey, todayKey, {
        sandbox,
        allowFuturePreview: sandbox,
      });
      const access = enforceFunGameAccess('toolboxkick', { dayKey, practice, sandbox }, { softWeekend: true });
      if (access.closed) {
        res.status(200).json({
          ...funAccessClosedPayload(dayKey, access),
          totalSolved: 0,
        });
        return;
      }

      const leaderboard = practice ? [] : await buildToolboxKickLeaderboard(dayKey);
      let gameData = {
        dayKey,
        status: 'in_progress',
        distanceM: 0,
      };
      if (!practice) {
        const snap = await db.collection('toolbox_kick_games').doc(`${dayKey}_${session.profile.uid}`).get();
        if (snap.exists) gameData = snap.data() || gameData;
      }

      res.status(200).json({
        practice,
        weekend: false,
        rotation: access.rotation,
        toolboxKickLiveFrom: TOOLBOX_KICK_LIVE_FROM,
        game: serializeToolboxKickGame(gameData),
        leaderboard,
        totalSolved: leaderboard.length,
      });
    } catch (error) {
      console.error('getDailyToolboxKick failed', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to load Little Dicks Toolbox.' });
    }
  }),
);

// POST { mode, distanceM, attempts?, dayKey?, sandbox? } → one competitive round per day.
exports.submitToolboxKickResult = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const todayKey = getToolboxKickDayKey();
      const sandbox = parseSandboxFlag(req) && canManagePortalAccess(session.profile);
      if (todayKey < TOOLBOX_KICK_LIVE_FROM && !sandbox) {
        res.status(403).json({
          error: `Little Dicks Toolbox goes live ${TOOLBOX_KICK_LIVE_FROM}. Practice scores are not submitted.`,
          toolboxKickLiveFrom: TOOLBOX_KICK_LIVE_FROM,
        });
        return;
      }
      const { dayKey, practice } = resolvePlayableDayKey(req.body?.dayKey, todayKey, {
        sandbox,
        allowFuturePreview: sandbox,
      });
      enforceFunGameAccess('toolboxkick', { dayKey, practice, sandbox });

      const mode = normalizeToolboxKickMode(req.body?.mode);
      const distanceM = clampToolboxKickDistance(req.body?.distanceM);
      const attempts = Array.isArray(req.body?.attempts)
        ? req.body.attempts.map((n) => clampToolboxKickDistance(n)).slice(0, 3)
        : [distanceM];
      if (distanceM <= 0) {
        res.status(400).json({ error: 'Need a distance greater than zero.' });
        return;
      }

      if (practice || sandbox) {
        res.status(200).json({
          practice: true,
          sandbox: Boolean(sandbox),
          game: serializeToolboxKickGame({
            dayKey,
            status: 'won',
            mode,
            distanceM,
            attempts,
            completedAt: new Date().toISOString(),
          }),
          leaderboard: [],
          totalSolved: 0,
        });
        return;
      }

      const gameId = `${dayKey}_${session.profile.uid}`;
      const ref = db.collection('toolbox_kick_games').doc(gameId);
      const existing = await ref.get();
      if (existing.exists && existing.data()?.status === 'won') {
        const leaderboard = await buildToolboxKickLeaderboard(dayKey);
        res.status(200).json({
          practice: false,
          game: serializeToolboxKickGame(existing.data() || {}),
          leaderboard,
          totalSolved: leaderboard.length,
          alreadySubmitted: true,
        });
        return;
      }

      const payload = {
        uid: session.profile.uid,
        fullName: session.profile.fullName || session.profile.email || 'Colleague',
        email: session.profile.email || '',
        dayKey,
        status: 'won',
        mode,
        distanceM,
        attempts,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      await ref.set(payload, { merge: true });

      const streaks = await recordFunStreakWin(db, {
        uid: session.profile.uid,
        fullName: payload.fullName,
        email: payload.email,
        gameKey: 'toolboxkick',
        dayKey,
        FieldValue: admin.firestore.FieldValue,
      });
      const all = await loadFunStreaks(db, session.profile.uid, {
        todayKey: dayKey,
        fullName: payload.fullName,
        email: payload.email,
        FieldValue: admin.firestore.FieldValue,
      });
      const achievements = serializeAchievements({ ...all, toolboxkick: streaks }, dayKey);

      const snap = await ref.get();
      const leaderboard = await buildToolboxKickLeaderboard(dayKey);
      await syncDayMedals(db, {
        gameKey: 'toolboxkick',
        dayKey,
        leaderboardRows: leaderboard,
        FieldValue: admin.firestore.FieldValue,
      });

      res.status(200).json({
        practice: false,
        game: serializeToolboxKickGame(snap.data() || {}),
        leaderboard,
        totalSolved: leaderboard.length,
        achievements,
      });
    } catch (error) {
      console.error('submitToolboxKickResult failed', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to submit Little Dicks Toolbox.' });
    }
  }),
);

const FUN_GAME_COLLECTIONS = {
  trivia: 'trivia_answers',
  wordle: 'wordle_games',
  nonogram: 'nonogram_games',
  sokoban: 'sokoban_games',
  boggle: 'boggle_games',
  connections: 'connections_games',
  enclose: 'enclose_games',
  letterbox: 'letterbox_games',
  pipes: 'pipes_games',
  toolboxkick: 'toolbox_kick_games',
};

async function buildPipesLeaderboard(dayKey) {
  const snap = await db.collection('pipes_games').where('dayKey', '==', dayKey).limit(200).get();
  const rows = snap.docs.map((doc) => {
    const data = doc.data() || {};
    return {
      uid: data.uid || doc.id,
      fullName: data.fullName || 'Colleague',
      status: data.status || 'in_progress',
      moves: Number(data.moves) || 0,
      durationMs: Number.isFinite(data.durationMs) ? data.durationMs : Number.MAX_SAFE_INTEGER,
      completedAt: data.completedAt?.toDate?.()?.toISOString?.() || null,
    };
  }).filter((row) => row.status === 'won');

  rows.sort(comparePipesRows);
  assignJointRanks(rows, (a, b) => a.durationMs === b.durationMs && a.moves === b.moves);

  return rows.map((row) => {
    const hasDuration = Number.isFinite(row.durationMs) && row.durationMs < Number.MAX_SAFE_INTEGER;
    const durationLabel = hasDuration ? formatDuration(row.durationMs) : null;
    return {
      uid: row.uid,
      fullName: row.fullName,
      status: row.status,
      moves: row.moves,
      rank: row.rank,
      joint: row.joint,
      medal: row.medal,
      durationMs: hasDuration ? row.durationMs : null,
      durationLabel,
      completedAt: row.completedAt,
      resultLabel: pipesResultLabel(row, formatDuration),
    };
  });
}

async function buildToolboxKickLeaderboard(dayKey) {
  const snap = await db.collection('toolbox_kick_games').where('dayKey', '==', dayKey).limit(200).get();
  const rows = snap.docs.map((doc) => {
    const data = doc.data() || {};
    return {
      uid: data.uid || doc.id,
      fullName: data.fullName || 'Colleague',
      status: data.status || 'in_progress',
      mode: normalizeToolboxKickMode(data.mode),
      distanceM: Math.max(0, Math.floor(Number(data.distanceM) || 0)),
      completedAt: data.completedAt?.toDate?.()?.toISOString?.() || null,
    };
  }).filter((row) => row.status === 'won' && row.distanceM > 0);

  rows.sort(compareToolboxKickRows);
  assignJointRanks(rows, (a, b) => a.distanceM === b.distanceM);

  return rows.map((row) => ({
    uid: row.uid,
    fullName: row.fullName,
    status: row.status,
    mode: row.mode,
    distanceM: row.distanceM,
    rank: row.rank,
    joint: row.joint,
    medal: row.medal,
    completedAt: row.completedAt,
    resultLabel: toolboxKickResultLabel(row),
  }));
}

async function buildLetterboxLeaderboard(dayKey) {
  const snap = await db.collection('letterbox_games').where('dayKey', '==', dayKey).limit(200).get();
  const rows = snap.docs.map((doc) => {
    const data = doc.data() || {};
    return {
      uid: data.uid || doc.id,
      fullName: data.fullName || 'Colleague',
      status: data.status || 'in_progress',
      wordCount: Number(data.wordCount) || 0,
      letterCount: Number(data.letterCount) || 0,
      par: Number(data.par) || 0,
      durationMs: Number.isFinite(data.durationMs) ? data.durationMs : Number.MAX_SAFE_INTEGER,
      completedAt: data.completedAt?.toDate?.()?.toISOString?.() || null,
    };
  }).filter((row) => row.status === 'won');

  rows.sort(compareLetterboxRows);
  assignJointRanks(rows, (a, b) => (
    a.wordCount === b.wordCount
    && a.letterCount === b.letterCount
    && a.durationMs === b.durationMs
  ));

  return rows.map((row) => {
    const hasDuration = Number.isFinite(row.durationMs) && row.durationMs < Number.MAX_SAFE_INTEGER;
    const durationLabel = hasDuration ? formatDuration(row.durationMs) : null;
    return {
      uid: row.uid,
      fullName: row.fullName,
      status: row.status,
      wordCount: row.wordCount,
      letterCount: row.letterCount,
      par: row.par,
      rank: row.rank,
      joint: row.joint,
      medal: row.medal,
      durationMs: hasDuration ? row.durationMs : null,
      durationLabel,
      completedAt: row.completedAt,
      resultLabel: letterboxResultLabel(row),
    };
  });
}

async function buildEncloseLeaderboard(dayKey) {
  const snap = await db.collection('enclose_games').where('dayKey', '==', dayKey).limit(200).get();
  const rows = snap.docs.map((doc) => {
    const data = doc.data() || {};
    return {
      uid: data.uid || doc.id,
      fullName: data.fullName || 'Colleague',
      status: data.status || 'in_progress',
      score: Number(data.score) || 0,
      durationMs: Number.isFinite(data.durationMs) ? data.durationMs : Number.MAX_SAFE_INTEGER,
      completedAt: data.completedAt?.toDate?.()?.toISOString?.() || null,
    };
  }).filter((row) => row.status === 'won' || row.status === 'lost');

  const wins = rows.filter((row) => row.status === 'won');
  const fails = rows.filter((row) => row.status === 'lost');
  wins.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.durationMs !== b.durationMs) return a.durationMs - b.durationMs;
    const aTime = a.completedAt ? new Date(a.completedAt).getTime() : Number.MAX_SAFE_INTEGER;
    const bTime = b.completedAt ? new Date(b.completedAt).getTime() : Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  });
  fails.sort((a, b) => {
    if (a.durationMs !== b.durationMs) return a.durationMs - b.durationMs;
    const aTime = a.completedAt ? new Date(a.completedAt).getTime() : Number.MAX_SAFE_INTEGER;
    const bTime = b.completedAt ? new Date(b.completedAt).getTime() : Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  });

  assignJointRanks(wins, (a, b) => a.score === b.score && a.durationMs === b.durationMs);
  fails.forEach((row) => {
    row.rank = null;
    row.joint = false;
    row.medal = null;
    row.failed = true;
    row.rankLabel = '💩';
  });

  return [...wins, ...fails].map((row) => {
    const hasDuration = Number.isFinite(row.durationMs) && row.durationMs < Number.MAX_SAFE_INTEGER;
    const durationLabel = hasDuration ? formatDuration(row.durationMs) : null;
    return {
      rank: row.rank,
      joint: Boolean(row.joint),
      medal: row.medal || null,
      failed: Boolean(row.failed),
      rankLabel: row.rankLabel || (row.rank ? ordinal(row.rank) : '💩'),
      uid: row.uid,
      fullName: row.fullName,
      status: row.status,
      score: row.score,
      durationMs: hasDuration ? row.durationMs : null,
      durationLabel,
      completedAt: row.completedAt,
      resultLabel: row.status === 'won'
        ? `${row.score} pts${durationLabel ? ` · ${durationLabel}` : ''}`
        : '💩 Escaped',
    };
  });
}

async function buildLeaderboardForGame(gameKey, dayKey) {
  if (gameKey === 'trivia') return buildTriviaLeaderboard(dayKey);
  if (gameKey === 'wordle') return buildWordleLeaderboard(dayKey);
  if (gameKey === 'nonogram') return buildNonogramLeaderboard(dayKey);
  if (gameKey === 'sokoban') return buildSokobanLeaderboard(dayKey);
  if (gameKey === 'boggle') return buildBoggleLeaderboard(dayKey);
  if (gameKey === 'connections') return buildConnectionsLeaderboard(dayKey);
  if (gameKey === 'enclose') return buildEncloseLeaderboard(dayKey);
  if (gameKey === 'letterbox') return buildLetterboxLeaderboard(dayKey);
  if (gameKey === 'pipes') return buildPipesLeaderboard(dayKey);
  if (gameKey === 'toolboxkick') return buildToolboxKickLeaderboard(dayKey);
  return [];
}

// GET → Fun weekday rotation schedule for a day (and upcoming week preview).
exports.getFunRotation = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }
    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    try {
      const todayKey = getLondonDayKey();
      const dayKey = String(req.query?.dayKey || todayKey).trim() || todayKey;
      const rotation = getFunRotationForDay(dayKey);
      const upcoming = [];
      let cursor = dayKey;
      for (let i = 0; i < 14; i += 1) {
        upcoming.push(getFunRotationForDay(cursor));
        const [y, m, d] = cursor.split('-').map(Number);
        const date = new Date(Date.UTC(y, m - 1, d, 12));
        date.setUTCDate(date.getUTCDate() + 1);
        cursor = date.toISOString().slice(0, 10);
      }
      res.status(200).json({
        todayKey,
        rotationStart: ROTATION_START_DAY_KEY,
        games: FUN_GAME_ROSTER,
        rotation,
        upcoming,
        achievements: serializeAchievements(
          await loadFunStreaks(db, session.profile.uid, {
            todayKey,
            fullName: session.profile.fullName || session.profile.email || '',
            email: session.profile.email || '',
            FieldValue: admin.firestore.FieldValue,
          }),
          todayKey,
        ),
      });
    } catch (error) {
      console.error('getFunRotation failed', error);
      res.status(500).json({ error: error.message || 'Failed to load Fun rotation.' });
    }
  }),
);

// Alias used by hosting rewrite /api/getFunSchedule
exports.getFunSchedule = exports.getFunRotation;

// GET → list admin-authored fun_content rows.
exports.adminListFunContent = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }
    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!canManagePortalAccess(session.profile)) {
      res.status(403).json({ error: 'Admin access is required.' });
      return;
    }
    try {
      const type = String(req.query?.type || '').trim() || null;
      const items = await listFunContent(db, { type });
      res.status(200).json({ items });
    } catch (error) {
      console.error('adminListFunContent failed', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to list Fun content.' });
    }
  }),
);

// POST → create/update trivia, connections, or sokoban content in fun_content.
exports.adminSaveFunContent = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }
    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!canManagePortalAccess(session.profile)) {
      res.status(403).json({ error: 'Admin access is required.' });
      return;
    }
    try {
      const type = String(req.body?.type || '').trim();
      const id = req.body?.id ? String(req.body.id).trim() : null;
      let payload;
      if (type === 'trivia') payload = validateTriviaPayload(req.body);
      else if (type === 'connections') payload = validateConnectionsPayload(req.body);
      else if (type === 'sokoban') payload = validateSokobanPayload(req.body);
      else {
        res.status(400).json({ error: 'type must be trivia, connections, or sokoban.' });
        return;
      }
      if (payload.scheduledFor) {
        if (!FUN_DAY_KEY_RE.test(String(payload.scheduledFor))) {
          res.status(400).json({ error: 'scheduledFor must be YYYY-MM-DD.' });
          return;
        }
        // Scheduling implies publish so the daily resolver can pick it up.
        payload.status = 'published';
      }
      const item = await saveFunContent(db, {
        id,
        payload,
        uid: session.profile.uid,
        FieldValue: admin.firestore.FieldValue,
      });
      res.status(200).json({ id: item.id, item });
    } catch (error) {
      console.error('adminSaveFunContent failed', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to save Fun content.' });
    }
  }),
);

// POST { id } → delete fun_content row.
exports.adminDeleteFunContent = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }
    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!canManagePortalAccess(session.profile)) {
      res.status(403).json({ error: 'Admin access is required.' });
      return;
    }
    try {
      const result = await deleteFunContent(db, String(req.body?.id || '').trim());
      res.status(200).json(result);
    } catch (error) {
      console.error('adminDeleteFunContent failed', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to delete Fun content.' });
    }
  }),
);

// GET → preview a published/draft content item.
exports.previewFunContent = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }
    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!canManagePortalAccess(session.profile)) {
      res.status(403).json({ error: 'Admin access is required.' });
      return;
    }
    try {
      const id = String(req.query?.id || '').trim();
      if (!id) {
        res.status(400).json({ error: 'id is required.' });
        return;
      }
      const snap = await db.collection('fun_content').doc(id).get();
      if (!snap.exists) {
        res.status(404).json({ error: 'Content not found.' });
        return;
      }
      const data = snap.data() || {};
      const item = {
        id: snap.id,
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || null,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() || null,
      };
      let preview = null;
      if (item.type === 'trivia') {
        preview = {
          type: 'trivia',
          question: publicQuestion(triviaFromContent(item, item.scheduledFor || getLondonDayKey())),
          correctIndex: item.correctIndex,
        };
      } else if (item.type === 'connections') {
        const puzzle = connectionsFromContent(item, item.scheduledFor || getLondonDayKey(), CONNECTIONS_DIFFICULTIES);
        preview = {
          type: 'connections',
          puzzle: publicConnectionsPuzzle(puzzle, { reveal: true }),
        };
      }
      res.status(200).json({ item, preview });
    } catch (error) {
      console.error('previewFunContent failed', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to preview Fun content.' });
    }
  }),
);

// POST { gameKey, scope: 'me'|'day', dayKey? } → admin testing reset.
exports.listFunContent = exports.adminListFunContent;
exports.saveFunContent = exports.adminSaveFunContent;
exports.deleteFunContent = exports.adminDeleteFunContent;

exports.adminResetFunGame = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!canManagePortalAccess(session.profile)) {
      res.status(403).json({ error: 'Admin access is required.' });
      return;
    }

    try {
      const gameKey = String(req.body?.gameKey || '').trim();
      const scope = String(req.body?.scope || 'me').trim();
      const collectionName = FUN_GAME_COLLECTIONS[gameKey];
      if (!collectionName) {
        res.status(400).json({ error: 'Unknown gameKey.' });
        return;
      }

      const todayKey = getLondonDayKey();
      const dayKey = String(req.body?.dayKey || todayKey).trim() || todayKey;
      let deleted = 0;

      if (scope === 'day') {
        const snap = await db.collection(collectionName).where('dayKey', '==', dayKey).limit(200).get();
        const batch = db.batch();
        snap.docs.forEach((doc) => {
          batch.delete(doc.ref);
          deleted += 1;
        });
        if (deleted) await batch.commit();
      } else {
        // Prefer deterministic doc id used by most games; fall back to query.
        const directId = `${dayKey}_${session.profile.uid}`;
        const directRef = db.collection(collectionName).doc(directId);
        const directSnap = await directRef.get();
        if (directSnap.exists) {
          await directRef.delete();
          deleted = 1;
        } else {
          const snap = await db.collection(collectionName)
            .where('dayKey', '==', dayKey)
            .where('uid', '==', session.profile.uid)
            .limit(5)
            .get();
          const batch = db.batch();
          snap.docs.forEach((doc) => {
            batch.delete(doc.ref);
            deleted += 1;
          });
          if (deleted) await batch.commit();
        }
      }

      const leaderboard = await buildLeaderboardForGame(gameKey, dayKey);
      await syncDayMedals(db, {
        gameKey,
        dayKey,
        leaderboardRows: leaderboard,
        FieldValue: admin.firestore.FieldValue,
      });

      res.status(200).json({
        ok: true,
        gameKey,
        scope,
        dayKey,
        deleted,
        leaderboard,
        totalPlayed: leaderboard.length,
      });
    } catch (error) {
      console.error('adminResetFunGame failed', error);
      res.status(500).json({ error: 'Failed to reset fun game.' });
    }
  }),
);

// POST {} → admin: recompute historical medals from all Fun leaderboards.
exports.adminBackfillFunMedals = onRequest(
  {
    region: 'europe-west2',
    timeoutSeconds: 300,
    memory: '512MiB',
  },
  withCors(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!canManagePortalAccess(session.profile)) {
      res.status(403).json({ error: 'Admin access is required.' });
      return;
    }

    try {
      const builders = {
        trivia: (dayKey) => buildTriviaLeaderboard(dayKey),
        wordle: (dayKey) => buildWordleLeaderboard(dayKey),
        nonogram: (dayKey) => buildNonogramLeaderboard(dayKey),
        sokoban: (dayKey) => buildSokobanLeaderboard(dayKey),
        boggle: (dayKey) => buildBoggleLeaderboard(dayKey),
        connections: (dayKey) => buildConnectionsLeaderboard(dayKey),
        enclose: (dayKey) => buildEncloseLeaderboard(dayKey),
        letterbox: (dayKey) => buildLetterboxLeaderboard(dayKey),
        pipes: (dayKey) => buildPipesLeaderboard(dayKey),
        toolboxkick: (dayKey) => buildToolboxKickLeaderboard(dayKey),
      };
      const dayKeysByGame = {};
      await Promise.all(Object.entries(FUN_GAME_COLLECTIONS).map(async ([gameKey, collectionName]) => {
        dayKeysByGame[gameKey] = await collectDayKeysFromCollection(db, collectionName);
      }));

      const result = await backfillAllMedals(db, {
        dayKeysByGame,
        builders,
        FieldValue: admin.firestore.FieldValue,
      });

      res.status(200).json({ ok: true, ...result, dayKeysByGame });
    } catch (error) {
      console.error('adminBackfillFunMedals failed', error);
      res.status(500).json({ error: 'Failed to backfill medals.' });
    }
  }),
);

function serializePoll(doc, extras = {}) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    title: data.title || '',
    description: data.description || '',
    type: data.type || 'ab',
    optionA: data.optionA || 'Option A',
    optionB: data.optionB || 'Option B',
    resultsPublic: Boolean(data.resultsPublic),
    status: data.status || 'open',
    createdByUid: data.createdByUid || '',
    createdByName: data.createdByName || '',
    createdAt: data.createdAt?.toDate?.()?.toISOString?.() || null,
    closedAt: data.closedAt?.toDate?.()?.toISOString?.() || null,
    ...extras,
  };
}

async function loadPollVotes(pollId) {
  const snap = await db.collection('poll_votes').where('pollId', '==', pollId).limit(1000).get();
  return snap.docs.map((doc) => {
    const data = doc.data() || {};
    return {
      uid: data.uid || '',
      fullName: data.fullName || '',
      email: data.email || '',
      optionKey: data.optionKey || '',
      optionLabel: data.optionLabel || '',
    };
  });
}

// GET → open polls for employees (+ create permission for managers/admins).
exports.getPolls = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const canManage = canManagePolls(
        session.profile,
        canManagePortalAccess,
        canViewAllEmployeeProfiles,
        getEffectivePortalRole,
      );

      // Everyone gets open + recent closed polls so the Polls tab can show history.
      let docs = [];
      try {
        const allSnap = await db.collection('polls').orderBy('createdAt', 'desc').limit(80).get();
        docs = allSnap.docs;
      } catch (queryError) {
        console.warn('getPolls orderBy fallback', queryError?.message || queryError);
        const openSnap = await db.collection('polls').where('status', '==', 'open').limit(50).get();
        const closedSnap = await db.collection('polls').where('status', '==', 'closed').limit(50).get();
        docs = [...openSnap.docs, ...closedSnap.docs];
      }

      const polls = [];
      for (const doc of docs) {
        const data = doc.data() || {};
        const voteId = `${doc.id}_${session.profile.uid}`;
        const myVoteSnap = await db.collection('poll_votes').doc(voteId).get();
        const myVote = myVoteSnap.exists
          ? {
              optionKey: myVoteSnap.data().optionKey || '',
              optionLabel: myVoteSnap.data().optionLabel || '',
            }
          : null;

        const isClosed = (data.status || 'open') !== 'open';
        // Closed polls always show results; open polls respect public/voted/manager rules.
        const showResults = isClosed
          || canManage
          || Boolean(data.resultsPublic)
          || Boolean(myVote);
        let results = null;
        if (showResults) {
          const votes = await loadPollVotes(doc.id);
          results = aggregatePollResults(data, votes);
        }

        polls.push(serializePoll(doc, {
          myVote,
          results,
          canManage,
        }));
      }

      // Keep newest first
      polls.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

      res.status(200).json({
        polls,
        canManage,
      });
    } catch (error) {
      console.error('getPolls failed', error);
      res.status(500).json({ error: 'Failed to load polls.' });
    }
  }),
);

// POST → create poll (managers / admins).
exports.createPoll = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    if (!canManagePolls(
      session.profile,
      canManagePortalAccess,
      canViewAllEmployeeProfiles,
      getEffectivePortalRole,
    )) {
      res.status(403).json({ error: 'Only managers and admins can create polls.' });
      return;
    }

    const title = String(req.body?.title || '').trim();
    const description = String(req.body?.description || '').trim().slice(0, 500);
    const type = String(req.body?.type || '').trim();
    const resultsPublic = Boolean(req.body?.resultsPublic);
    const optionA = displayAnswer(req.body?.optionA || 'Option A') || 'Option A';
    const optionB = displayAnswer(req.body?.optionB || 'Option B') || 'Option B';

    if (title.length < 3 || title.length > 120) {
      res.status(400).json({ error: 'Title must be 3–120 characters.' });
      return;
    }
    if (!['ab', 'text'].includes(type)) {
      res.status(400).json({ error: 'type must be ab or text.' });
      return;
    }

    try {
      const now = admin.firestore.FieldValue.serverTimestamp();
      const ref = await db.collection('polls').add({
        title,
        description,
        type,
        optionA: type === 'ab' ? optionA : '',
        optionB: type === 'ab' ? optionB : '',
        resultsPublic,
        status: 'open',
        createdByUid: session.profile.uid,
        createdByName: session.profile.fullName || session.profile.email || 'Manager',
        createdAt: now,
        updatedAt: now,
        closedAt: null,
      });
      const snap = await ref.get();
      res.status(201).json({
        poll: serializePoll(snap, {
          myVote: null,
          results: aggregatePollResults(snap.data(), []),
          canManage: true,
        }),
      });
    } catch (error) {
      console.error('createPoll failed', error);
      res.status(500).json({ error: 'Failed to create poll.' });
    }
  }),
);

// POST { pollId, optionKey?, optionLabel? } → cast / change vote.
exports.submitPollVote = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const pollId = String(req.body?.pollId || '').trim();
    if (!pollId) {
      res.status(400).json({ error: 'pollId is required.' });
      return;
    }

    try {
      const pollRef = db.collection('polls').doc(pollId);
      const pollSnap = await pollRef.get();
      if (!pollSnap.exists) {
        res.status(404).json({ error: 'Poll not found.' });
        return;
      }

      const poll = pollSnap.data() || {};
      if (poll.status !== 'open') {
        res.status(400).json({ error: 'This poll is closed.' });
        return;
      }

      let optionKey = '';
      let optionLabel = '';

      if (poll.type === 'ab') {
        optionKey = String(req.body?.optionKey || '').trim().toLowerCase();
        if (optionKey !== 'a' && optionKey !== 'b') {
          res.status(400).json({ error: 'optionKey must be a or b.' });
          return;
        }
        optionLabel = optionKey === 'a' ? (poll.optionA || 'A') : (poll.optionB || 'B');
      } else {
        const incomingLabel = displayAnswer(req.body?.optionLabel || req.body?.answer || '');
        const incomingKey = normalizeAnswerKey(req.body?.optionKey || incomingLabel);
        if (!incomingKey || incomingLabel.length < 1) {
          res.status(400).json({ error: 'Enter an answer or pick an existing one.' });
          return;
        }
        optionKey = incomingKey;
        optionLabel = incomingLabel || incomingKey;
      }

      const voteId = `${pollId}_${session.profile.uid}`;
      const now = admin.firestore.FieldValue.serverTimestamp();
      await db.collection('poll_votes').doc(voteId).set({
        pollId,
        uid: session.profile.uid,
        fullName: session.profile.fullName || session.profile.email || 'Colleague',
        email: session.profile.email || '',
        optionKey,
        optionLabel,
        updatedAt: now,
        createdAt: now,
      }, { merge: true });

      const canManage = canManagePolls(
        session.profile,
        canManagePortalAccess,
        canViewAllEmployeeProfiles,
        getEffectivePortalRole,
      );
      const votes = await loadPollVotes(pollId);
      const results = (canManage || poll.resultsPublic)
        ? aggregatePollResults(poll, votes)
        : aggregatePollResults(poll, votes); // voter can see results after voting

      res.status(200).json({
        poll: serializePoll(pollSnap, {
          myVote: { optionKey, optionLabel },
          results,
          canManage,
        }),
      });
    } catch (error) {
      console.error('submitPollVote failed', error);
      res.status(500).json({ error: 'Failed to submit vote.' });
    }
  }),
);

// POST { pollId } → close poll.
exports.closePoll = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    if (!canManagePolls(
      session.profile,
      canManagePortalAccess,
      canViewAllEmployeeProfiles,
      getEffectivePortalRole,
    )) {
      res.status(403).json({ error: 'Only managers and admins can close polls.' });
      return;
    }

    const pollId = String(req.body?.pollId || '').trim();
    if (!pollId) {
      res.status(400).json({ error: 'pollId is required.' });
      return;
    }

    try {
      const ref = db.collection('polls').doc(pollId);
      const snap = await ref.get();
      if (!snap.exists) {
        res.status(404).json({ error: 'Poll not found.' });
        return;
      }

      await ref.update({
        status: 'closed',
        closedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      const updated = await ref.get();
      const votes = await loadPollVotes(pollId);
      res.status(200).json({
        poll: serializePoll(updated, {
          results: aggregatePollResults(updated.data(), votes),
          canManage: true,
        }),
      });
    } catch (error) {
      console.error('closePoll failed', error);
      res.status(500).json({ error: 'Failed to close poll.' });
    }
  }),
);

// GET → My Profile widgets (public polls + trivia/wordle/nonogram leaderboards).
exports.getProfileWidgets = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const dayKey = getLondonDayKey();

      const [pollSnap, triviaLeaderboard, wordleLeaderboard, nonogramLeaderboard, sokobanLeaderboard, boggleLeaderboard, connectionsLeaderboard, letterboxLeaderboard] = await Promise.all([
        db.collection('polls')
          .where('resultsPublic', '==', true)
          .where('status', '==', 'open')
          .limit(20)
          .get()
          .catch(async () => db.collection('polls').where('resultsPublic', '==', true).limit(20).get()),
        buildTriviaLeaderboard(dayKey),
        buildWordleLeaderboard(dayKey),
        buildNonogramLeaderboard(dayKey),
        buildSokobanLeaderboard(dayKey),
        buildBoggleLeaderboard(dayKey),
        buildConnectionsLeaderboard(dayKey),
        dayKey >= LETTERBOX_LIVE_FROM ? buildLetterboxLeaderboard(dayKey) : Promise.resolve([]),
      ]);

      const publicPolls = [];
      for (const doc of pollSnap.docs) {
        const data = doc.data() || {};
        if (data.status && data.status !== 'open') continue;
        const votes = await loadPollVotes(doc.id);
        const voteId = `${doc.id}_${session.profile.uid}`;
        const myVoteSnap = await db.collection('poll_votes').doc(voteId).get();
        const myVote = myVoteSnap.exists
          ? {
              optionKey: myVoteSnap.data().optionKey || '',
              optionLabel: myVoteSnap.data().optionLabel || '',
            }
          : null;
        publicPolls.push(serializePoll(doc, {
          myVote,
          results: aggregatePollResults(data, votes),
        }));
      }
      publicPolls.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

      const triviaQuestion = await resolveTriviaQuestion(dayKey);
      const streaks = await loadFunStreaks(db, session.profile.uid, {
        todayKey: dayKey,
        fullName: session.profile.fullName || session.profile.email || '',
        email: session.profile.email || '',
        FieldValue: admin.firestore.FieldValue,
      });
      const achievements = serializeAchievements(streaks, dayKey);
      const medals = await loadUserMedals(db, session.profile.uid);

      res.status(200).json({
        dayKey,
        rotation: getFunRotationForDay(dayKey),
        trivia: {
          prompt: triviaQuestion.prompt,
          leaderboard: triviaLeaderboard.slice(0, 8),
          totalCorrect: triviaLeaderboard.filter((r) => r.correct).length,
          totalFailed: triviaLeaderboard.filter((r) => !r.correct).length,
        },
        wordle: {
          leaderboard: wordleLeaderboard.slice(0, 8),
          totalSolved: countLeaderboardRows(wordleLeaderboard, 'won'),
          totalFailed: countLeaderboardRows(wordleLeaderboard, 'lost'),
        },
        polls: publicPolls.slice(0, 1),
        nonogram: {
          leaderboard: nonogramLeaderboard.slice(0, 8),
          totalSolved: countLeaderboardRows(nonogramLeaderboard, 'won'),
          totalFailed: countLeaderboardRows(nonogramLeaderboard, 'lost'),
        },
        sokoban: {
          leaderboard: sokobanLeaderboard.slice(0, 8),
          totalSolved: sokobanLeaderboard.length,
        },
        boggle: {
          leaderboard: boggleLeaderboard.slice(0, 8),
          totalPlayed: boggleLeaderboard.length,
        },
        connections: {
          leaderboard: connectionsLeaderboard.slice(0, 8),
          totalSolved: countLeaderboardRows(connectionsLeaderboard, 'won'),
          totalFailed: countLeaderboardRows(connectionsLeaderboard, 'lost'),
        },
        letterbox: {
          leaderboard: letterboxLeaderboard.slice(0, 8),
          totalSolved: letterboxLeaderboard.length,
        },
        achievements,
        medals,
        kudos: {
          received: await loadKudosForRecipient(db, session.profile.uid, dayKey),
        },
      });
    } catch (error) {
      console.error('getProfileWidgets failed', error);
      res.status(500).json({ error: 'Failed to load profile widgets.' });
    }
  }),
);

// GET → who is on emergency phone now (+ calendar shifts for managers).
exports.getEmergencyPhone = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const canManage = canManageEmergencyPhone(
        session.profile,
        canManagePortalAccess,
        canViewAllEmployeeProfiles,
        getEffectivePortalRole,
      );

      const now = new Date();
      const shiftsSnap = await db.collection(EMERGENCY_PHONE_COLLECTION).get();
      const shifts = shiftsSnap.docs
        .map((doc) => serializeShift(doc))
        .filter((row) => row.uid && parseDateKey(row.startDate) && parseDateKey(row.endDate))
        .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));

      const current = findCurrentShift(shifts, now);

      const payload = {
        canManage,
        phoneNumber: EMERGENCY_PHONE_NUMBER,
        phoneTel: EMERGENCY_PHONE_TEL,
        current,
      };

      if (!canManage) {
        res.status(200).json(payload);
        return;
      }

      const usersSnap = await db.collection('users').get();
      const coverPeople = [];
      usersSnap.forEach((doc) => {
        const data = doc.data() || {};
        if (data.isActive === false) return;
        const profile = data.employeeProfile || {};
        if (!profile.emergencyPhoneCover) return;
        const stats = weeksSinceLastCover(doc.id, shifts, now);
        coverPeople.push({
          uid: doc.id,
          fullName: data.fullName || data.email || doc.id,
          email: data.email || '',
          jobRole: profile.jobRole || '',
          department: profile.department || '',
          weeksSinceLast: stats.weeksSinceLast,
          lastEndDate: stats.lastEndDate,
          lastEndLabel: stats.lastEndDate ? formatDateLabel(stats.lastEndDate) : null,
          onCoverNow: stats.onCoverNow,
        });
      });

      coverPeople.sort((a, b) => {
        if (a.onCoverNow !== b.onCoverNow) return a.onCoverNow ? -1 : 1;
        const aw = a.weeksSinceLast;
        const bw = b.weeksSinceLast;
        if (aw === null && bw === null) return a.fullName.localeCompare(b.fullName);
        if (aw === null) return -1;
        if (bw === null) return 1;
        if (bw !== aw) return bw - aw;
        return a.fullName.localeCompare(b.fullName);
      });

      payload.shifts = shifts;
      payload.coverPeople = coverPeople;
      res.status(200).json(payload);
    } catch (error) {
      console.error('getEmergencyPhone failed', error);
      res.status(500).json({ error: 'Failed to load emergency phone rota.' });
    }
  }),
);

// POST { uid, startDate, endDate, notes? } → create a date-range call shift.
exports.createEmergencyPhoneShift = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const canManage = canManageEmergencyPhone(
      session.profile,
      canManagePortalAccess,
      canViewAllEmployeeProfiles,
      getEffectivePortalRole,
    );
    if (!canManage) {
      res.status(403).json({ error: 'Managers and admins only.' });
      return;
    }

    const { uid, startDate, endDate, notes = '' } = req.body || {};
    const start = parseDateKey(startDate);
    const end = parseDateKey(endDate);
    if (!start || !end) {
      res.status(400).json({ error: 'startDate and endDate must be YYYY-MM-DD.' });
      return;
    }
    if (end.key < start.key) {
      res.status(400).json({ error: 'endDate must be on or after startDate.' });
      return;
    }
    if (typeof uid !== 'string' || !uid.trim()) {
      res.status(400).json({ error: 'uid is required.' });
      return;
    }

    try {
      const userSnap = await db.collection('users').doc(uid.trim()).get();
      if (!userSnap.exists) {
        res.status(404).json({ error: 'Employee not found.' });
        return;
      }
      const userData = userSnap.data() || {};
      if (userData.isActive === false) {
        res.status(400).json({ error: 'Employee is inactive.' });
        return;
      }
      if (!userData.employeeProfile?.emergencyPhoneCover) {
        res.status(400).json({
          error: 'Employee is not marked for emergency phone cover. Enable it on their employee record first.',
        });
        return;
      }

      const assignedAt = new Date().toISOString();
      const record = {
        uid: uid.trim(),
        fullName: userData.fullName || userData.email || uid.trim(),
        email: userData.email || '',
        startDate: start.key,
        endDate: end.key,
        assignedBy: session.profile.uid,
        assignedByName: session.profile.fullName || session.profile.email || '',
        assignedAt,
        notes: String(notes || '').trim().slice(0, 300),
      };

      const ref = await db.collection(EMERGENCY_PHONE_COLLECTION).add(record);

      res.status(200).json({
        ok: true,
        shift: serializeShift({ id: ref.id, data: () => record }),
      });
    } catch (error) {
      console.error('createEmergencyPhoneShift failed', error);
      res.status(500).json({ error: 'Failed to create emergency phone shift.' });
    }
  }),
);

// POST { id } → delete a call shift (managers/admins).
exports.deleteEmergencyPhoneShift = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const session = await getVerifiedSessionUser(req);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const canManage = canManageEmergencyPhone(
      session.profile,
      canManagePortalAccess,
      canViewAllEmployeeProfiles,
      getEffectivePortalRole,
    );
    if (!canManage) {
      res.status(403).json({ error: 'Managers and admins only.' });
      return;
    }

    const id = typeof req.body?.id === 'string' ? req.body.id.trim() : '';
    if (!id) {
      res.status(400).json({ error: 'id is required.' });
      return;
    }

    try {
      await db.collection(EMERGENCY_PHONE_COLLECTION).doc(id).delete();
      res.status(200).json({ ok: true, id });
    } catch (error) {
      console.error('deleteEmergencyPhoneShift failed', error);
      res.status(500).json({ error: 'Failed to delete emergency phone shift.' });
    }
  }),
);

// GET → verifies the __session cookie for any active portal user (not admin-only).
// Used by the logout page and portal-agnostic session checks.
exports.verifyUserSession = onRequest(
  { region: 'europe-west2' },
  withCors(async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const verified = await verifyAnySessionCookie(req.headers.cookie);
    if (!verified) {
      res.status(401).json({ error: 'Not authenticated.' });
      return;
    }

    try {
      const profile = await getUserProfile(verified.decodedClaims.uid);

      if (!profile || !profile.isActive) {
        res.status(401).json({ error: 'Not authenticated.' });
        return;
      }

      setSharedSessionCookie(res, verified.sessionCookie);

      res.status(200).json({ user: buildEffectiveProfile(profile) });
    } catch {
      res.status(401).json({ error: 'Not authenticated.' });
    }
  }),
);