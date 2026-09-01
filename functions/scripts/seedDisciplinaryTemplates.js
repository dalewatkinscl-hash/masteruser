/**
 * Seed People Cases document templates into:
 * Employee Files / HR Form Templates / Disciplinaries
 *
 * Usage:
 *   node scripts/seedDisciplinaryTemplates.js
 *   node scripts/seedDisciplinaryTemplates.js --replace
 */

const fs = require('fs');
const path = require('path');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(__dirname, '..', '.env'));

const {
  isSharePointConfigured,
  listTemplateLibraryFiles,
  findTemplateFile,
  TEMPLATES_FOLDER_NAME,
  uploadCaseTemplateMaster,
  deleteDriveItem,
} = require('../sharepoint');
const {
  CASE_DOCUMENT_TEMPLATES,
  buildTemplateFillContext,
  templateSeedFileName,
} = require('../caseDocumentTemplates');
const { buildTemplateDocxBuffer, DOCX_MIME_TYPE } = require('../caseDocumentDocx');

const LEGACY_TEMPLATE_ALIASES = [
  { fileName: 'Interview Record Template.docx', templateId: 'fact_finding_notes' },
];

async function buildSeedBuffer(template) {
  return buildTemplateDocxBuffer({
    template,
    fills: buildTemplateFillContext({
      caseData: {
        employeeNameSnapshot: '[Employee full name]',
        title: '[Case title]',
        summary: '[Brief summary of the concern / allegation]',
        hearingScheduledAt: '[Hearing date]',
        hearingScheduledTime: '[Hearing time]',
        hearingLocation: '[Location]',
        outcomePreset: '[Outcome]',
        suspensionFrom: '[Suspension start date]',
        suspensionReason: '[Suspension reason]',
        precautionarySuspension: true,
      },
    }),
  });
}

async function main() {
  const replaceMode = process.argv.includes('--replace');
  const config = {
    tenantId: process.env.MS_GRAPH_TENANT_ID || '',
    clientId: process.env.MS_GRAPH_CLIENT_ID || '',
    clientSecret: process.env.MS_GRAPH_CLIENT_SECRET || '',
  };

  if (!isSharePointConfigured(config)) {
    throw new Error('MS_GRAPH_* credentials missing in functions/.env');
  }

  console.log(`Templates folder: Employee Files/${TEMPLATES_FOLDER_NAME}`);
  console.log(replaceMode ? 'Mode: replace existing matched masters\n' : 'Mode: create missing only\n');

  let existing = await listTemplateLibraryFiles(config);
  console.log(`Existing files (${existing.length}):`);
  existing.forEach((file) => console.log(`  - ${file.name}`));

  const created = [];
  const replaced = [];
  const skipped = [];

  for (const template of CASE_DOCUMENT_TEMPLATES) {
    const match = findTemplateFile(existing, template);
    if (match && !replaceMode) {
      skipped.push({ id: template.id, fileName: match.name, reason: 'already exists' });
      continue;
    }

    const buffer = await buildSeedBuffer(template);
    const result = await uploadCaseTemplateMaster(config, template, buffer, {
      existingFiles: existing,
      seedFileName: templateSeedFileName(template),
      mimeType: DOCX_MIME_TYPE,
    });

    if (result.replaced) {
      replaced.push(result);
      console.log(`  ~ ${result.fileName} (${template.id})${result.deletedOldName ? ` — removed ${result.deletedOldName}` : ''}`);
    } else {
      created.push(result);
      console.log(`  + ${result.fileName} (${template.id})`);
    }

    existing = existing.filter((file) => file.name !== result.fileName && file.name !== result.deletedOldName);
    existing.push({ id: 'updated', name: result.fileName, webUrl: result.webUrl });
  }

  if (replaceMode) {
    for (const alias of LEGACY_TEMPLATE_ALIASES) {
      const template = CASE_DOCUMENT_TEMPLATES.find((item) => item.id === alias.templateId);
      const legacyFile = existing.find((file) => {
        const base = file.name.replace(/\.docx?$/i, '');
        const aliasBase = alias.fileName.replace(/\.docx?$/i, '');
        return base.toLowerCase() === aliasBase.toLowerCase();
      });
      if (!template || !legacyFile) continue;
      const buffer = await buildSeedBuffer(template);
      const result = await uploadCaseTemplateMaster(config, template, buffer, {
        existingFiles: existing,
        fileName: alias.fileName,
        mimeType: DOCX_MIME_TYPE,
      });
      replaced.push({ ...result, templateId: `${template.id} (legacy alias)` });
      console.log(`  ~ ${result.fileName} (legacy alias for ${template.id})${result.deletedOldName ? ` — removed ${result.deletedOldName}` : ''}`);
    }

    const refreshed = await listTemplateLibraryFiles(config);
    for (const file of refreshed) {
      if (!/\.doc$/i.test(file.name)) continue;
      const docxName = file.name.replace(/\.doc$/i, '.docx');
      if (refreshed.some((item) => item.name.toLowerCase() === docxName.toLowerCase())) {
        await deleteDriveItem(config, file.id);
        console.log(`  - removed old ${file.name} (${docxName} kept)`);
      }
    }
  }

  const matchedNames = new Set([...created, ...replaced].map((item) => item.fileName));
  const unmatched = (await listTemplateLibraryFiles(config))
    .filter((file) => !matchedNames.has(file.name));

  console.log(`\nCreated ${created.length} template(s).`);
  console.log(`Replaced ${replaced.length} template(s).`);
  if (!replaceMode) {
    console.log(`Left unchanged ${skipped.length} (already matched).`);
    skipped.forEach((item) => console.log(`  = ${item.fileName} (${item.id})`));
  }

  if (unmatched.length) {
    console.log(`\nUnmatched files still in folder (${unmatched.length}) — not modified:`);
    unmatched.forEach((file) => console.log(`  ? ${file.name}`));
  }

  console.log('\nDone. Open a template in desktop Word and click a checkbox to verify.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
