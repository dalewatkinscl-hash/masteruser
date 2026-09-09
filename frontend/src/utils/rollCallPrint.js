import { groupEmployees, sortEmployees } from './employeeDirectory';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getPrintFontSize(count, includeSignature) {
  const rowBudget = includeSignature ? 28 : 38;
  if (count <= rowBudget) return 11;
  if (count <= 45) return 10;
  if (count <= 55) return 9;
  return 8;
}

function buildEmployeeRow(employee, includeSignature) {
  const name = escapeHtml(employee.fullName || employee.email || 'Unknown');
  const signatureCell = includeSignature
    ? '<td class="signature"></td>'
    : '';

  return `
      <tr>
        <td class="tick">&#9744;</td>
        <td class="name">${name}</td>
        ${signatureCell}
      </tr>
    `;
}

function buildGroupedRows(employees, groupBy, includeSignature, colSpan) {
  const groups = groupEmployees(
    sortEmployees(employees, 'name', 'asc'),
    groupBy,
  ).filter((group) => group.employees.length > 0);

  return groups.map((group) => {
    const header = `
      <tr class="group-header">
        <td colspan="${colSpan}">
          ${escapeHtml(group.label)}
          <span class="group-count">(${group.employees.length})</span>
        </td>
      </tr>
    `;
    const rows = group.employees
      .map((employee) => buildEmployeeRow(employee, includeSignature))
      .join('');
    return header + rows;
  }).join('');
}

export function buildRollCallHtml({ title, employees, includeSignature, groupBy = '' }) {
  const safeTitle = escapeHtml(title?.trim() || 'Roll call');
  const dateLabel = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const fontSize = getPrintFontSize(employees.length, includeSignature);
  const rowPadding = includeSignature ? '7px 0' : '5px 0';
  const colSpan = includeSignature ? 3 : 2;
  const useGroups = Boolean(groupBy);

  const rows = useGroups
    ? buildGroupedRows(employees, groupBy, includeSignature, colSpan)
    : sortEmployees(employees, 'name', 'asc')
      .map((employee) => buildEmployeeRow(employee, includeSignature))
      .join('');

  const signatureHeader = includeSignature
    ? '<th class="signature">Signature</th>'
    : '';

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${safeTitle}</title>
    <style>
      @page { size: A4 portrait; margin: 12mm; }
      * { box-sizing: border-box; }
      body {
        font-family: Arial, Helvetica, sans-serif;
        color: #111;
        margin: 0;
        padding: 0;
      }
      h1 {
        margin: 0 0 4px;
        font-size: 18pt;
        text-align: center;
      }
      .meta {
        text-align: center;
        font-size: 9pt;
        color: #444;
        margin-bottom: 14px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: ${fontSize}pt;
      }
      th, td {
        border-bottom: 1px solid #ccc;
        padding: ${rowPadding};
        vertical-align: middle;
      }
      th {
        text-align: left;
        font-size: ${Math.max(fontSize - 1, 8)}pt;
        color: #555;
        border-bottom: 2px solid #333;
      }
      .tick {
        width: 28px;
        text-align: center;
        font-size: ${fontSize + 2}pt;
      }
      .name {
        width: ${includeSignature ? '45%' : 'auto'};
      }
      .signature {
        width: 40%;
        min-height: 18px;
      }
      tr.group-header td {
        padding: ${includeSignature ? '16px 0 8px' : '14px 0 7px'};
        border-bottom: 2px solid #333;
        font-weight: 700;
        font-size: ${Math.min(fontSize + 4, 14)}pt;
        letter-spacing: 0.01em;
        color: #111;
        background: #f3f3f3;
      }
      tr.group-header:not(:first-child) td {
        padding-top: ${includeSignature ? '22px' : '20px'};
      }
      tr.group-header .group-count {
        font-weight: 400;
        font-size: ${Math.min(fontSize + 1, 11)}pt;
        color: #555;
        margin-left: 8px;
      }
      tr:last-child td {
        border-bottom: none;
      }
      .footer {
        margin-top: 12px;
        font-size: 8pt;
        color: #666;
        text-align: right;
      }
    </style>
  </head>
  <body>
    <h1>${safeTitle}</h1>
    <p class="meta">${dateLabel} · ${employees.length} employee${employees.length === 1 ? '' : 's'}</p>
    <table>
      <thead>
        <tr>
          <th class="tick"></th>
          <th class="name">Name</th>
          ${signatureHeader}
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
    <p class="footer">Country Lion · Employee roll call</p>
  </body>
</html>`;
}

function removePrintFrame(iframe) {
  window.setTimeout(() => {
    if (iframe.parentNode) {
      iframe.parentNode.removeChild(iframe);
    }
  }, 1000);
}

export function printRollCall({ title, employees, includeSignature, groupBy = '' }) {
  const html = buildRollCallHtml({ title, employees, includeSignature, groupBy });

  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('title', 'Roll call print');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';

    document.body.appendChild(iframe);

    const frameWindow = iframe.contentWindow;
    const frameDocument = frameWindow?.document;

    if (!frameWindow || !frameDocument) {
      removePrintFrame(iframe);
      reject(new Error('Could not prepare the print document.'));
      return;
    }

    const runPrint = () => {
      try {
        frameWindow.focus();
        frameWindow.print();
        resolve();
      } catch (error) {
        reject(error);
      } finally {
        removePrintFrame(iframe);
      }
    };

    frameDocument.open();
    frameDocument.write(html);
    frameDocument.close();

    // Give the iframe a moment to lay out before opening the print dialog.
    window.setTimeout(runPrint, 250);
  });
}
