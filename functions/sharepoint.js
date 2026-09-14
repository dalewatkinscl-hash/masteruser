const { employeeNameSimilarity } = require('./employeeProfile');

const SHAREPOINT_HOST = 'countrylion.sharepoint.com';
const SHAREPOINT_SITE_PATH = '/sites/HR';
const DOCUMENT_LIBRARY_NAME = 'Employee Files';
const ACTIVE_EMPLOYEES_ROOT = 'Current Employees';
const INACTIVE_EMPLOYEES_ROOT = 'Previous Employees';
const DISCIPLINARY_FOLDER_NAME = 'Disciplinaries & Grievances';
/** Master case document templates live here in the Employee Files library. */
const TEMPLATES_FOLDER_NAME = 'HR Form Templates/Disciplinaries';

const INVALID_FILE_CHARS = /[\\/:*?"<>|]/g;

let tokenCache = { token: '', expiresAt: 0 };
let siteIdCache = '';
let driveIdCache = '';

function sanitizeFileName(fileName) {
  return String(fileName || 'document')
    .replace(INVALID_FILE_CHARS, '-')
    .replace(/\s+/g, ' ')
    .trim() || 'document';
}

function buildEmployeeFolderName(fullName) {
  return String(fullName || 'Unknown employee')
    .replace(INVALID_FILE_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim() || 'Unknown employee';
}

function buildEmployeeRootName(isActive) {
  return isActive === false ? INACTIVE_EMPLOYEES_ROOT : ACTIVE_EMPLOYEES_ROOT;
}

function resolveEmployeeSharePointPaths(employee = {}) {
  const folderName = employee.sharePointFolderName || buildEmployeeFolderName(employee.fullName);
  const employeeRoot = employee.sharePointEmployeeRoot || buildEmployeeRootName(employee.isActive !== false);
  const employeeFolderPath = `${employeeRoot}/${folderName}`;
  const disciplinaryFolderPath = `${employeeFolderPath}/${DISCIPLINARY_FOLDER_NAME}`;

  return {
    folderName,
    employeeRoot,
    employeeFolderPath,
    disciplinaryFolderPath,
    isConfirmed: Boolean(employee.sharePointFolderConfirmedAt),
    usesMappedFolder: Boolean(employee.sharePointFolderName),
  };
}

function buildDisciplinaryFolderPath({
  fullName,
  isActive,
  sharePointFolderName,
  employeeRoot,
  caseFolderName,
}) {
  const resolvedRoot = employeeRoot || buildEmployeeRootName(isActive);
  const employeeFolder = sharePointFolderName || buildEmployeeFolderName(fullName);
  const base = `${resolvedRoot}/${employeeFolder}/${DISCIPLINARY_FOLDER_NAME}`;
  const caseFolder = String(caseFolderName || '')
    .replace(INVALID_FILE_CHARS, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return caseFolder ? `${base}/${caseFolder}` : base;
}

function encodeDrivePath(folderPath) {
  return folderPath
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function formatGraphError(method, path, status, errorBody) {
  if (status === 401 || status === 403) {
    return 'SharePoint access denied. In Azure App registrations, add Microsoft Graph application permission Sites.ReadWrite.All, then click Grant admin consent. If you use Sites.Selected instead, you must also grant the app access to the HR site.';
  }

  return `Microsoft Graph ${method} ${path} failed (${status}): ${errorBody}`;
}

async function graphRequest(config, method, path, options = {}) {
  const token = await getGraphAccessToken(config);
  const headers = {
    Authorization: `Bearer ${token}`,
    ...(options.headers || {}),
  };

  if (options.contentType && !headers['Content-Type']) {
    headers['Content-Type'] = options.contentType;
  } else if (options.body && typeof options.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method,
    headers,
    body: options.body,
    redirect: options.redirect || 'follow',
  });

  if (!response.ok) {
    const errorBody = await response.text();
    const error = new Error(formatGraphError(method, path, response.status, errorBody));
    error.status = response.status;
    throw error;
  }

  if (options.asBuffer) {
    const arrayBuffer = await response.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      contentType: response.headers.get('content-type') || 'application/octet-stream',
    };
  }

  if (response.status === 204) return null;
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return null;
  return response.json();
}

async function getGraphAccessToken(config) {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token;
  }

  const response = await fetch(`https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error_description || data.error || 'Failed to obtain Microsoft Graph token.');
  }

  try {
    const payload = JSON.parse(Buffer.from(data.access_token.split('.')[1], 'base64').toString());
    if (!payload.roles || payload.roles.length === 0) {
      throw new Error('Microsoft Graph token has no application permissions. Add Sites.ReadWrite.All under API permissions and grant admin consent in Azure.');
    }
  } catch (error) {
    if (error.message.includes('application permissions')) throw error;
  }

  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
  };

  return tokenCache.token;
}

async function getSiteId(config) {
  if (siteIdCache) return siteIdCache;

  const site = await graphRequest(
    config,
    'GET',
    `/sites/${SHAREPOINT_HOST}:${SHAREPOINT_SITE_PATH}`,
  );
  siteIdCache = site.id;
  return siteIdCache;
}

async function getDocumentLibraryDriveId(config) {
  if (driveIdCache) return driveIdCache;

  const siteId = await getSiteId(config);
  const drives = await graphRequest(config, 'GET', `/sites/${siteId}/drives`);
  const drive = (drives.value || []).find((item) => item.name === DOCUMENT_LIBRARY_NAME);

  if (!drive) {
    throw new Error(`SharePoint document library "${DOCUMENT_LIBRARY_NAME}" was not found on the HR site.`);
  }

  driveIdCache = drive.id;
  return driveIdCache;
}

async function getDriveItemByPath(config, driveId, itemPath) {
  const encodedPath = encodeDrivePath(itemPath);
  try {
    return await graphRequest(config, 'GET', `/drives/${driveId}/root:/${encodedPath}`);
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

async function createFolder(config, driveId, parentPath, folderName) {
  const parentEndpoint = parentPath
    ? `/drives/${driveId}/root:/${encodeDrivePath(parentPath)}:/children`
    : `/drives/${driveId}/root/children`;

  return graphRequest(config, 'POST', parentEndpoint, {
    body: JSON.stringify({
      name: folderName,
      folder: {},
      '@microsoft.graph.conflictBehavior': 'fail',
    }),
  });
}

async function ensureFolderPath(config, driveId, folderPath) {
  const segments = folderPath.split('/').filter(Boolean);
  let currentPath = '';

  for (const segment of segments) {
    const nextPath = currentPath ? `${currentPath}/${segment}` : segment;
    const existing = await getDriveItemByPath(config, driveId, nextPath);

    if (!existing) {
      try {
        await createFolder(config, driveId, currentPath, segment);
      } catch (error) {
        const retry = await getDriveItemByPath(config, driveId, nextPath);
        if (!retry) throw error;
      }
    }

    currentPath = nextPath;
  }

  return getDriveItemByPath(config, driveId, currentPath);
}

async function uploadFileToFolder(config, driveId, folderPath, fileName, fileBuffer, mimeType) {
  const safeName = sanitizeFileName(fileName);
  const encodedFolder = encodeDrivePath(folderPath);
  const encodedFile = encodeURIComponent(safeName);

  return graphRequest(
    config,
    'PUT',
    `/drives/${driveId}/root:/${encodedFolder}/${encodedFile}:/content`,
    {
      body: fileBuffer,
      contentType: mimeType || 'application/octet-stream',
      headers: {},
    },
  );
}

async function listFolderChildren(config, driveId, folderPath) {
  const encodedPath = encodeDrivePath(folderPath);
  const data = await graphRequest(
    config,
    'GET',
    `/drives/${driveId}/root:/${encodedPath}:/children?$select=id,name,webUrl,folder,file,size,lastModifiedDateTime,createdDateTime`,
  );

  return data?.value || [];
}

function normalizeFolderLabel(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function isDisciplinarySubfolderName(name) {
  const normalized = normalizeFolderLabel(name);
  return normalized.includes('disciplinar') || normalized.includes('grievance') || normalized.includes('feedback');
}

function scoreDisciplinarySubfolderName(name) {
  const normalized = normalizeFolderLabel(name);
  if (normalized === normalizeFolderLabel(DISCIPLINARY_FOLDER_NAME)) return 1;
  if (isDisciplinarySubfolderName(name)) return 0.9;
  return 0;
}

async function resolveDisciplinaryFolder(config, driveId, paths) {
  const employeeFolderItem = await getDriveItemByPath(config, driveId, paths.employeeFolderPath);
  if (!employeeFolderItem?.folder) {
    return {
      employeeFolderExists: false,
      disciplinaryFolderExists: false,
      disciplinaryFolderPath: paths.disciplinaryFolderPath,
      disciplinaryFolderName: DISCIPLINARY_FOLDER_NAME,
      subfolders: [],
    };
  }

  const exactFolder = await getDriveItemByPath(config, driveId, paths.disciplinaryFolderPath);
  if (exactFolder?.folder) {
    return {
      employeeFolderExists: true,
      disciplinaryFolderExists: true,
      disciplinaryFolderPath: paths.disciplinaryFolderPath,
      disciplinaryFolderName: DISCIPLINARY_FOLDER_NAME,
      subfolders: [],
    };
  }

  const children = await listFolderChildren(config, driveId, paths.employeeFolderPath);
  const subfolders = children.filter((item) => item.folder).map((item) => item.name);
  const matchedFolder = children
    .filter((item) => item.folder)
    .map((item) => ({ item, score: scoreDisciplinarySubfolderName(item.name) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)[0]?.item;

  if (matchedFolder) {
    return {
      employeeFolderExists: true,
      disciplinaryFolderExists: true,
      disciplinaryFolderPath: `${paths.employeeFolderPath}/${matchedFolder.name}`,
      disciplinaryFolderName: matchedFolder.name,
      subfolders,
    };
  }

  return {
    employeeFolderExists: true,
    disciplinaryFolderExists: false,
    disciplinaryFolderPath: paths.disciplinaryFolderPath,
    disciplinaryFolderName: DISCIPLINARY_FOLDER_NAME,
    subfolders,
  };
}

async function listDisciplinaryDocuments(config, employee) {
  const paths = resolveEmployeeSharePointPaths(employee);
  const driveId = await getDocumentLibraryDriveId(config);
  const resolved = await resolveDisciplinaryFolder(config, driveId, paths);

  if (!resolved.disciplinaryFolderExists) {
    return {
      ...paths,
      ...resolved,
      folderExists: false,
      documents: [],
    };
  }

  const children = await listFolderChildren(config, driveId, resolved.disciplinaryFolderPath);
  const documents = children
    .filter((item) => item.file)
    .map((item) => ({
      id: item.id,
      fileName: item.name,
      webUrl: item.webUrl,
      size: item.size || 0,
      lastModifiedAt: item.lastModifiedDateTime || item.createdDateTime || '',
    }))
    .sort((left, right) => String(right.lastModifiedAt).localeCompare(String(left.lastModifiedAt)));

  return {
    ...paths,
    ...resolved,
    disciplinaryFolderPath: resolved.disciplinaryFolderPath,
    folderExists: true,
    documents,
  };
}

async function suggestEmployeeFolders(config, { fullName, isActive }) {
  const driveId = await getDocumentLibraryDriveId(config);
  const preferredRoot = buildEmployeeRootName(isActive);
  const roots = preferredRoot === ACTIVE_EMPLOYEES_ROOT
    ? [ACTIVE_EMPLOYEES_ROOT, INACTIVE_EMPLOYEES_ROOT]
    : [INACTIVE_EMPLOYEES_ROOT, ACTIVE_EMPLOYEES_ROOT];

  const suggestions = [];
  const seen = new Set();

  for (const root of roots) {
    const rootItem = await getDriveItemByPath(config, driveId, root);
    if (!rootItem) continue;

    const children = await listFolderChildren(config, driveId, root);
    for (const item of children) {
      if (!item.folder || seen.has(`${root}/${item.name}`)) continue;

      const score = employeeNameSimilarity(fullName, item.name);
      if (score < 0.45) continue;

      seen.add(`${root}/${item.name}`);
      const disciplinaryPath = `${root}/${item.name}/${DISCIPLINARY_FOLDER_NAME}`;
      const disciplinaryFolder = await getDriveItemByPath(config, driveId, disciplinaryPath);

      suggestions.push({
        folderName: item.name,
        employeeRoot: root,
        score: Math.round(score * 100) / 100,
        employeeFolderPath: `${root}/${item.name}`,
        disciplinaryFolderExists: Boolean(disciplinaryFolder),
      });
    }
  }

  return suggestions.sort((left, right) => right.score - left.score).slice(0, 12);
}

async function validateEmployeeFolder(config, { folderName, employeeRoot }) {
  const driveId = await getDocumentLibraryDriveId(config);
  const employeeFolderPath = `${employeeRoot}/${folderName}`;
  const folderItem = await getDriveItemByPath(config, driveId, employeeFolderPath);

  if (!folderItem?.folder) {
    throw new Error(`SharePoint folder "${employeeFolderPath}" was not found.`);
  }

  return {
    folderName,
    employeeRoot,
    employeeFolderPath,
    disciplinaryFolderPath: `${employeeFolderPath}/${DISCIPLINARY_FOLDER_NAME}`,
  };
}

async function uploadDisciplinaryDocument(config, options) {
  const {
    fullName,
    isActive,
    sharePointFolderName,
    employeeRoot,
    caseFolderName,
    fileName,
    fileBuffer,
    mimeType,
  } = options;

  const driveId = await getDocumentLibraryDriveId(config);
  const folderPath = buildDisciplinaryFolderPath({
    fullName,
    isActive,
    sharePointFolderName,
    employeeRoot,
    caseFolderName,
  });
  await ensureFolderPath(config, driveId, folderPath);

  const uploaded = await uploadFileToFolder(
    config,
    driveId,
    folderPath,
    fileName,
    fileBuffer,
    mimeType,
  );

  return {
    folderPath,
    fileName: sanitizeFileName(fileName),
    sharePointItemId: uploaded.id,
    sharePointWebUrl: uploaded.webUrl,
    sharePointDriveId: driveId,
  };
}

function isSharePointConfigured(config) {
  return Boolean(config?.tenantId && config?.clientId && config?.clientSecret);
}

function clearSharePointCaches() {
  tokenCache = { token: '', expiresAt: 0 };
  siteIdCache = '';
  driveIdCache = '';
}

function normalizeTemplateName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function listTemplateLibraryFiles(config) {
  const driveId = await getDocumentLibraryDriveId(config);
  await ensureFolderPath(config, driveId, TEMPLATES_FOLDER_NAME);
  const children = await listFolderChildren(config, driveId, TEMPLATES_FOLDER_NAME);
  return children
    .filter((item) => item.file)
    .map((item) => ({
      id: item.id,
      name: item.name,
      webUrl: item.webUrl || '',
      size: item.size || 0,
      mimeType: item.file?.mimeType || 'application/octet-stream',
      lastModifiedDateTime: item.lastModifiedDateTime || null,
    }));
}

function findTemplateFile(files, template) {
  const preferred = (template.sharePointFileNames || []).map(normalizeTemplateName);
  const byPreferred = files.find((file) => preferred.includes(normalizeTemplateName(file.name)));
  if (byPreferred) return byPreferred;

  const titleHint = normalizeTemplateName(template.title);
  const idHint = normalizeTemplateName(String(template.id || '').replace(/_/g, ' '));
  const extraHints = (template.matchHints || []).map(normalizeTemplateName).filter(Boolean);

  const wantsMinutes = /\bminutes\b|\bnotes\b|\binterview record\b|\bnote on file\b/.test(`${titleHint} ${idHint}`);
  const wantsInvite = /\binvite\b|\binvitation\b/.test(`${titleHint} ${idHint}`);
  const wantsWarning = /\bwarning\b/.test(`${titleHint} ${idHint}`);
  const wantsPip = /\bpip\b|\bperformance improvement\b/.test(`${titleHint} ${idHint}`);
  const wantsSuspension = /\bsuspension\b/.test(`${titleHint} ${idHint}`);
  const wantsTraining = /\btraining\b/.test(`${titleHint} ${idHint}`);
  const wantsOutcome = /\boutcome\b/.test(`${titleHint} ${idHint}`) && !wantsWarning;
  const wantsAppeal = /\bappeal\b/.test(`${titleHint} ${idHint}`);
  const wantsGrievance = /\bgrievance\b/.test(`${titleHint} ${idHint}`);
  const wantsHearingMinutes = idHint === 'hearing minutes'
    || titleHint === 'disciplinary hearing minutes'
    || (/\bhearing\b/.test(titleHint) && /\bminutes\b/.test(titleHint) && !wantsAppeal);

  let best = null;
  let bestScore = 0;
  for (const file of files) {
    const name = normalizeTemplateName(file.name);
    // Hard exclusions to stop e.g. invitation letter matching hearing minutes
    if (wantsMinutes && /\binvite\b|\binvitation\b/.test(name)) continue;
    if (wantsInvite && /\bminutes\b|\bnotes\b|\binterview record\b/.test(name)) continue;
    if (wantsAppeal && !/\bappeal\b/.test(name)) continue;
    if (wantsHearingMinutes && /\bappeal\b/.test(name)) continue;
    if (wantsHearingMinutes && !(/\bhearing\b/.test(name) && /\bminutes\b/.test(name))) continue;
    if (wantsGrievance && !/\bgrievance\b/.test(name)) continue;
    if (wantsWarning && !/\bwarning\b/.test(name)) continue;
    if (wantsPip && !/\bpip\b|\bperformance improvement\b/.test(name)) continue;
    if (wantsSuspension && !/\bsuspension\b/.test(name)) continue;
    if (wantsTraining && !/\btraining\b/.test(name)) continue;
    if (wantsOutcome && !/\boutcome\b|\bdecision\b/.test(name)) continue;

    let score = 0;
    for (const hint of [titleHint, idHint, ...extraHints]) {
      if (!hint) continue;
      if (name === hint) score += 12;
      else if (name.includes(hint)) score += 5;
      else {
        const words = hint.split(' ').filter((w) => w.length > 3);
        const matched = words.filter((w) => name.includes(w)).length;
        if (words.length && matched === words.length) score += 4;
        else if (matched > 0) score += matched;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = file;
    }
  }
  return bestScore >= 5 ? best : null;
}

async function downloadDriveItemContent(config, itemId) {
  const driveId = await getDocumentLibraryDriveId(config);
  return graphRequest(config, 'GET', `/drives/${driveId}/items/${itemId}/content`, {
    asBuffer: true,
  });
}

async function deleteDriveItem(config, itemId) {
  const driveId = await getDocumentLibraryDriveId(config);
  await graphRequest(config, 'DELETE', `/drives/${driveId}/items/${itemId}`);
}

/**
 * Delete a drive item by library-relative path. Returns false if the path is missing.
 */
async function deleteDriveItemByPath(config, itemPath) {
  const driveId = await getDocumentLibraryDriveId(config);
  const item = await getDriveItemByPath(config, driveId, itemPath);
  if (!item?.id) return false;
  await deleteDriveItem(config, item.id);
  return true;
}

/**
 * Delete the SharePoint case folder (and all files inside it) for a people case.
 * Falls back to deleting known document item IDs if the folder path is unknown/missing.
 */
async function deleteCaseSharePointFolder(config, {
  employee = {},
  caseFolderName = '',
  documentItemIds = [],
} = {}) {
  const paths = resolveEmployeeSharePointPaths(employee);
  const driveId = await getDocumentLibraryDriveId(config);
  const resolved = await resolveDisciplinaryFolder(config, driveId, paths);

  let folderDeleted = false;
  const folderName = String(caseFolderName || '')
    .replace(INVALID_FILE_CHARS, '-')
    .replace(/\s+/g, ' ')
    .trim();

  if (folderName && resolved.disciplinaryFolderExists) {
    const caseFolderPath = `${resolved.disciplinaryFolderPath}/${folderName}`;
    folderDeleted = await deleteDriveItemByPath(config, caseFolderPath);
  }

  const deletedItemIds = [];
  const uniqueItemIds = [...new Set(
    (documentItemIds || []).map((id) => String(id || '').trim()).filter(Boolean),
  )];

  if (!folderDeleted && uniqueItemIds.length > 0) {
    for (const itemId of uniqueItemIds) {
      try {
        await deleteDriveItem(config, itemId);
        deletedItemIds.push(itemId);
      } catch (error) {
        if (error.status === 404) continue;
        throw error;
      }
    }
  }

  return {
    folderDeleted,
    caseFolderName: folderName,
    disciplinaryFolderPath: resolved.disciplinaryFolderPath || paths.disciplinaryFolderPath,
    deletedItemIds,
  };
}

/**
 * List files and folders under an employee's SharePoint folder.
 * relativePath must stay under the employee folder (no .. / absolute escapes).
 */
async function listEmployeeFolderContents(config, employee, { relativePath = '' } = {}) {
  const paths = resolveEmployeeSharePointPaths(employee);
  const driveId = await getDocumentLibraryDriveId(config);
  const employeeFolderItem = await getDriveItemByPath(config, driveId, paths.employeeFolderPath);

  if (!employeeFolderItem?.folder) {
    return {
      ...paths,
      employeeFolderExists: false,
      currentPath: paths.employeeFolderPath,
      relativePath: '',
      breadcrumbs: [],
      items: [],
      folders: [],
      documents: [],
    };
  }

  const cleanedRelative = String(relativePath || '')
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== '.' && segment !== '..')
    .join('/');

  const currentPath = cleanedRelative
    ? `${paths.employeeFolderPath}/${cleanedRelative}`
    : paths.employeeFolderPath;

  // Ensure the target is still under the employee folder.
  if (
    currentPath !== paths.employeeFolderPath
    && !currentPath.startsWith(`${paths.employeeFolderPath}/`)
  ) {
    throw Object.assign(new Error('Invalid SharePoint folder path.'), { status: 400 });
  }

  const currentItem = await getDriveItemByPath(config, driveId, currentPath);
  if (!currentItem?.folder) {
    throw Object.assign(new Error(`SharePoint folder "${currentPath}" was not found.`), { status: 404 });
  }

  const children = await listFolderChildren(config, driveId, currentPath);
  const folders = children
    .filter((item) => item.folder)
    .map((item) => ({
      id: item.id,
      name: item.name,
      webUrl: item.webUrl || '',
      kind: 'folder',
      childCount: item.folder?.childCount,
      lastModifiedAt: item.lastModifiedDateTime || item.createdDateTime || '',
      relativePath: cleanedRelative ? `${cleanedRelative}/${item.name}` : item.name,
    }))
    .sort((left, right) => String(left.name).localeCompare(String(right.name), undefined, { sensitivity: 'base' }));

  const documents = children
    .filter((item) => item.file)
    .map((item) => ({
      id: item.id,
      fileName: item.name,
      name: item.name,
      webUrl: item.webUrl || '',
      kind: 'file',
      size: item.size || 0,
      lastModifiedAt: item.lastModifiedDateTime || item.createdDateTime || '',
    }))
    .sort((left, right) => String(right.lastModifiedAt).localeCompare(String(left.lastModifiedAt)));

  const breadcrumbs = cleanedRelative
    ? cleanedRelative.split('/').map((name, index, parts) => ({
      name,
      relativePath: parts.slice(0, index + 1).join('/'),
    }))
    : [];

  return {
    ...paths,
    employeeFolderExists: true,
    currentPath,
    relativePath: cleanedRelative,
    breadcrumbs,
    items: [...folders, ...documents],
    folders,
    documents,
  };
}

function masterTemplateFileName(name) {
  return String(name || 'template.docx').trim().replace(/\.doc$/i, '.docx') || 'template.docx';
}

/**
 * Resolve a case template from Employee Files/Templates.
 * If missing and seedBuffer is provided, upload seed file then return it.
 */
async function resolveAndDownloadCaseTemplate(config, template, options = {}) {
  const files = await listTemplateLibraryFiles(config);
  let match = findTemplateFile(files, template);

  if (!match && options.seedBuffer && options.seedFileName) {
    const driveId = await getDocumentLibraryDriveId(config);
    await ensureFolderPath(config, driveId, TEMPLATES_FOLDER_NAME);
    const uploaded = await uploadFileToFolder(
      config,
      driveId,
      TEMPLATES_FOLDER_NAME,
      options.seedFileName,
      options.seedBuffer,
      options.seedMimeType || 'application/msword',
    );
    match = {
      id: uploaded.id,
      name: uploaded.name || options.seedFileName,
      webUrl: uploaded.webUrl || '',
      mimeType: options.seedMimeType || 'application/msword',
    };
  }

  if (!match) {
    const expected = (template.sharePointFileNames || [template.title]).join(' / ');
    const available = files.map((file) => file.name).join(', ') || '(empty)';
    const error = new Error(
      `Template not found in SharePoint Employee Files/${TEMPLATES_FOLDER_NAME}. Expected something like “${expected}”. Files currently there: ${available}`,
    );
    error.code = 'template_missing';
    error.expectedNames = template.sharePointFileNames || [];
    error.availableFiles = files.map((file) => file.name);
    throw error;
  }

  const content = await downloadDriveItemContent(config, match.id);
  return {
    fileName: match.name,
    mimeType: content.contentType || match.mimeType || 'application/octet-stream',
    buffer: content.buffer,
    webUrl: match.webUrl || '',
    templatesFolder: TEMPLATES_FOLDER_NAME,
  };
}

/**
 * Upload (create or overwrite) a master template file in the templates library.
 */
async function uploadCaseTemplateMaster(config, template, fileBuffer, options = {}) {
  const driveId = await getDocumentLibraryDriveId(config);
  await ensureFolderPath(config, driveId, TEMPLATES_FOLDER_NAME);
  const files = options.existingFiles || await listTemplateLibraryFiles(config);
  const match = options.fileName
    ? files.find((file) => file.name.toLowerCase() === String(options.fileName).toLowerCase())
    : findTemplateFile(files, template);
  const seedFileName = options.seedFileName
    || (template.sharePointFileNames || [])[0]
    || `${template.title || 'Template'}.doc`;
  const fileName = masterTemplateFileName(options.fileName || match?.name || seedFileName);
  const mimeType = options.mimeType || 'application/msword';
  const uploaded = await uploadFileToFolder(
    config,
    driveId,
    TEMPLATES_FOLDER_NAME,
    fileName,
    fileBuffer,
    mimeType,
  );
  if (match && match.name.toLowerCase() !== fileName.toLowerCase()) {
    try {
      await deleteDriveItem(config, match.id);
    } catch (deleteError) {
      console.warn(`Could not delete old template ${match.name}:`, deleteError.message);
    }
  }
  return {
    fileName: uploaded.name || fileName,
    webUrl: uploaded.webUrl || match?.webUrl || '',
    replaced: Boolean(match || options.fileName),
    created: !(match || options.fileName),
    templateId: template.id,
    deletedOldName: match && match.name.toLowerCase() !== fileName.toLowerCase() ? match.name : '',
  };
}

module.exports = {
  ACTIVE_EMPLOYEES_ROOT,
  DISCIPLINARY_FOLDER_NAME,
  TEMPLATES_FOLDER_NAME,
  DOCUMENT_LIBRARY_NAME,
  INACTIVE_EMPLOYEES_ROOT,
  SHAREPOINT_HOST,
  SHAREPOINT_SITE_PATH,
  buildDisciplinaryFolderPath,
  buildEmployeeFolderName,
  buildEmployeeRootName,
  isSharePointConfigured,
  clearSharePointCaches,
  listDisciplinaryDocuments,
  listEmployeeFolderContents,
  listTemplateLibraryFiles,
  findTemplateFile,
  deleteDriveItem,
  deleteDriveItemByPath,
  deleteCaseSharePointFolder,
  resolveAndDownloadCaseTemplate,
  uploadCaseTemplateMaster,
  resolveEmployeeSharePointPaths,
  suggestEmployeeFolders,
  uploadDisciplinaryDocument,
  validateEmployeeFolder,
  downloadDriveItemContent,
};
