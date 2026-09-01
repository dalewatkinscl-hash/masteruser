const { buildTemplateDocxBuffer } = require('../caseDocumentDocx');
const { CASE_DOCUMENT_TEMPLATES, buildTemplateFillContext } = require('../caseDocumentTemplates');
const { Document, Packer } = require('docx');
const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');

(async () => {
  const template = CASE_DOCUMENT_TEMPLATES.find((t) => t.id === 'fact_finding_notes');
  const fills = buildTemplateFillContext({
    caseData: { employeeNameSnapshot: 'Test Employee', title: 'Test Case' },
  });
  const buf = await buildTemplateDocxBuffer({ template, fills });
  const outPath = path.join(__dirname, '..', '_inspect.docx');
  fs.writeFileSync(outPath, buf);
  const zip = await JSZip.loadAsync(buf);
  const styles = await zip.file('word/styles.xml').async('string');
  const doc = await zip.file('word/document.xml').async('string');
  const themeFile = zip.file('word/theme/theme1.xml');
  const theme = themeFile ? await themeFile.async('string') : 'none';
  const themeColors = [...doc.matchAll(/<w:themeColor[^>]*>/g)].map((m) => m[0]);
  console.log('\n=== themeColor in document ===', themeColors.length ? themeColors.join('\n') : 'none');

  const clh = styles.match(/<w:style w:type="paragraph" w:styleId="CLHeading[12]">[\s\S]*?<\/w:style>/g);
  console.log('=== CLHeading styles ===');
  console.log(clh ? clh.join('\n\n') : 'NOT FOUND');
  console.log('\n=== Heading1 in styles? ===', /Heading1/.test(styles));
  const h1idx = styles.indexOf('Heading1');
  if (h1idx >= 0) console.log('Heading1 context:', styles.slice(Math.max(0, h1idx - 80), h1idx + 120));
  const styleIds = [...styles.matchAll(/w:styleId="([^"]+)"/g)].map((m) => m[1]);
  console.log('\n=== all styleIds ===', styleIds.filter((id) => /Head|Title|Normal|CL/.test(id)).join(', '));
  const leftover = styles.match(/<w:style w:type="paragraph" w:styleId="Heading[1-6]">[\s\S]*?<\/w:style>/g);
  console.log('\n=== leftover Heading1-6 blocks ===', leftover ? leftover.length : 0);
  const latent = styles.match(/<w:latentStyles[\s\S]*?<\/w:latentStyles>/);
  console.log('\n=== latentStyles (truncated) ===', latent ? latent[0].slice(0, 1200) : 'none');
  console.log('\n=== Normal style ===');
  const normal = styles.match(/<w:style w:type="paragraph" w:styleId="Normal">[\s\S]*?<\/w:style>/);
  console.log(normal ? normal[0] : 'NOT FOUND');

  const pStyles = [...doc.matchAll(/<w:pStyle w:val="([^"]+)"/g)].map((m) => m[1]);
  console.log('\n=== pStyle values ===', [...new Set(pStyles)].join(', '));

  const titleIdx = doc.indexOf('Fact-finding interview notes');
  console.log('\n=== title paragraph XML ===');
  console.log(titleIdx >= 0 ? doc.slice(Math.max(0, titleIdx - 450), titleIdx + 60) : 'title not found');

  const colors = [...doc.matchAll(/<w:color[^>]*>/g)].slice(0, 15).map((m) => m[0]);
  console.log('\n=== color tags (first 15) ===', colors.join('\n'));

  const fonts = [...doc.matchAll(/<w:rFonts[^>]*>/g)].slice(0, 10).map((m) => m[0]);
  console.log('\n=== rFonts tags (first 10) ===', fonts.join('\n'));

  if (theme !== 'none') {
    const accent = theme.match(/<a:accent1>[\s\S]*?<\/a:accent1>/);
    console.log('\n=== theme accent1 ===', accent ? accent[0] : 'none');
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
