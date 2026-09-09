const fs = require('fs');
const path = require('path');

let cachedHeaderDataUri = '';
let cachedFooterDataUri = '';

function loadDataUri(fileName) {
  const filePath = path.join(__dirname, 'assets', 'letterhead', fileName);
  const buffer = fs.readFileSync(filePath);
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

function getLetterheadImages() {
  if (!cachedHeaderDataUri) cachedHeaderDataUri = loadDataUri('header.png');
  if (!cachedFooterDataUri) cachedFooterDataUri = loadDataUri('footer.png');
  return {
    headerSrc: cachedHeaderDataUri,
    footerSrc: cachedFooterDataUri,
  };
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function letterheadCss() {
  return `
    @page { size: A4; margin: 0; }
    html, body {
      margin: 0;
      padding: 0;
      color: #111;
      background: #fff;
      font-family: "Century Gothic", Calibri, Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.55;
    }
    .lh-page {
      box-sizing: border-box;
      min-height: 297mm;
      display: flex;
      flex-direction: column;
    }
    .lh-header,
    .lh-footer {
      width: 100%;
      margin: 0;
      padding: 0;
      line-height: 0;
    }
    .lh-header img,
    .lh-footer img {
      width: 100%;
      height: auto;
      display: block;
    }
    .lh-body {
      box-sizing: border-box;
      flex: 1;
      padding: 8mm 18mm 10mm;
    }
    .lh-body .salutation {
      margin: 0 0 16px;
      font-size: 12pt;
    }
    .lh-body p { margin: 0 0 14px; }
    .lh-body ul { margin: 0 0 14px; padding-left: 20px; }
    .lh-body li { margin-bottom: 4px; }
    .lh-body h1 { font-size: 14pt; margin: 0 0 12px; }
    .lh-body h2 { font-size: 11pt; margin: 18px 0 8px; text-transform: uppercase; letter-spacing: 0.04em; }
    .date { margin: 0 0 18px; }
    .meeting-details {
      margin: 0 0 16px;
      padding: 12px 14px;
      border: 1px solid #ccc;
      background: #fafafa;
    }
    .meeting-details p { margin: 0 0 6px; }
    .meeting-details p:last-child { margin: 0; }
    .closing { margin-top: 28px; }
    .sig-block { margin-top: 8px; }
    .sig-name {
      font-family: "Brush Script MT", "Segoe Script", "Lucida Handwriting", Georgia, serif;
      font-size: 22pt;
      line-height: 1.2;
      margin: 10px 0 2px;
      color: #0b1220;
    }
    .sig-printed { margin: 0 0 2px; font-weight: 600; }
    .sig-role { margin: 0; color: #444; font-size: 10pt; }
    .meta { color: #444; font-size: 10pt; margin-bottom: 22px; }
    .body-text { margin: 16px 0; }
    .signatures { margin-top: 36px; display: table; width: 100%; border-collapse: collapse; }
    .signatures .row { display: table-row; }
    .signatures .cell { display: table-cell; width: 50%; vertical-align: top; padding-right: 24px; padding-top: 8px; }
    .sig-line { border-bottom: 1px solid #333; height: 28px; margin: 8px 0 4px; }
    .sig-label { font-size: 9pt; color: #444; }
    .digital-sig { border: 1px solid #1e3a5f; background: #f4f8fc; padding: 10px 12px; margin-top: 8px; border-radius: 4px; }
    .digital-sig .sig-name { font-family: "Brush Script MT", "Segoe Script", Georgia, serif; font-size: 18pt; margin: 0 0 4px; color: #0b1220; }
    .digital-sig .sig-meta { font-size: 9pt; color: #444; margin: 0 0 2px; }
  `;
}

function wrapWithLetterhead({
  title = 'Letter',
  bodyHtml = '',
  extraStyles = '',
  addresseeName = '',
}) {
  const { headerSrc, footerSrc } = getLetterheadImages();
  const name = String(addresseeName || '').trim() || 'Colleague';
  const greeting = `<p class="salutation">Dear ${escapeHtml(name)},</p>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    ${letterheadCss()}
    ${extraStyles}
  </style>
</head>
<body>
  <div class="lh-page">
    <header class="lh-header">
      <img src="${headerSrc}" alt="Country Lion (Northampton) Limited" />
    </header>
    <main class="lh-body">
      ${greeting}
      ${bodyHtml}
    </main>
    <footer class="lh-footer">
      <img src="${footerSrc}" alt="" />
    </footer>
  </div>
</body>
</html>`;
}

module.exports = {
  wrapWithLetterhead,
  getLetterheadImages,
};
