/**
 * Generates HTML + PDF from docs/ProctorShield-Production-Scaling-Guide.md
 * Usage: node scripts/generate-scaling-guide-doc.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const mdPath = path.join(root, 'docs', 'ProctorShield-Production-Scaling-Guide.md');
const htmlPath = path.join(root, 'docs', 'ProctorShield-Production-Scaling-Guide.html');
const pdfPath = path.join(root, 'docs', 'ProctorShield-Production-Scaling-Guide.pdf');

const md = fs.readFileSync(mdPath, 'utf8');

// Minimal markdown → HTML (tables, headers, code, lists, bold)
function mdToHtml(src) {
  let html = src
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
    `<pre class="code-block"><code>${code.trim()}</code></pre>`
  );

  // Tables
  html = html.replace(/(\|.+\|\n)+/g, (block) => {
    const rows = block.trim().split('\n').filter((r) => !r.match(/^\|[\s\-:|]+\|$/));
    if (!rows.length) return block;
    const body = rows
      .map((row, i) => {
        const cells = row.split('|').slice(1, -1).map((c) => c.trim());
        const tag = i === 0 ? 'th' : 'td';
        return `<tr>${cells.map((c) => `<${tag}>${c.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</${tag}>`).join('')}</tr>`;
      })
      .join('');
    return `<table>${body}</table>`;
  });

  // Headers
  html = html.replace(/^###### (.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^##### (.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr>');

  // Bold / inline code
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Unordered lists
  html = html.replace(/(^[\-\*] .+\n?)+/gm, (block) => {
    const items = block.trim().split('\n').map((l) => `<li>${l.replace(/^[\-\*] /, '')}</li>`);
    return `<ul>${items.join('')}</ul>`;
  });

  // Ordered lists (simple)
  html = html.replace(/(^\d+\. .+\n?)+/gm, (block) => {
    const items = block.trim().split('\n').map((l) => `<li>${l.replace(/^\d+\. /, '')}</li>`);
    return `<ol>${items.join('')}</ol>`;
  });

  // Paragraphs (lines not already tagged)
  html = html
    .split('\n\n')
    .map((chunk) => {
      const t = chunk.trim();
      if (!t) return '';
      if (/^<(h[1-6]|ul|ol|table|pre|hr)/.test(t)) return t;
      return `<p>${t.replace(/\n/g, '<br>')}</p>`;
    })
    .join('\n');

  return html;
}

const body = mdToHtml(md);

const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ProctorShield — Production Scaling & Infrastructure Guide</title>
  <style>
    :root {
      --text: #1a1a2e;
      --muted: #555;
      --accent: #2563eb;
      --border: #e2e8f0;
      --bg-code: #f1f5f9;
    }
    * { box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      line-height: 1.6;
      color: var(--text);
      max-width: 900px;
      margin: 0 auto;
      padding: 2rem 2.5rem;
      font-size: 11pt;
    }
    h1 { font-size: 1.75rem; color: var(--accent); border-bottom: 3px solid var(--accent); padding-bottom: 0.5rem; margin-top: 0; }
    h2 { font-size: 1.35rem; color: #1e40af; margin-top: 2rem; border-bottom: 1px solid var(--border); padding-bottom: 0.3rem; page-break-after: avoid; }
    h3 { font-size: 1.1rem; margin-top: 1.5rem; page-break-after: avoid; }
    h4 { font-size: 1rem; margin-top: 1rem; }
    p { margin: 0.6rem 0; }
    table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 9.5pt; page-break-inside: avoid; }
    th, td { border: 1px solid var(--border); padding: 0.45rem 0.6rem; text-align: left; vertical-align: top; }
    th { background: #eff6ff; font-weight: 600; }
    tr:nth-child(even) td { background: #f8fafc; }
    code { background: var(--bg-code); padding: 0.15rem 0.35rem; border-radius: 3px; font-size: 0.9em; }
    pre.code-block {
      background: #0f172a;
      color: #e2e8f0;
      padding: 1rem;
      border-radius: 6px;
      overflow-x: auto;
      font-size: 8.5pt;
      line-height: 1.45;
      page-break-inside: avoid;
    }
    pre.code-block code { background: none; color: inherit; padding: 0; }
    ul, ol { margin: 0.5rem 0; padding-left: 1.5rem; }
    li { margin: 0.25rem 0; }
    hr { border: none; border-top: 1px solid var(--border); margin: 2rem 0; }
    strong { color: #0f172a; }
    .print-hint {
      background: #fef3c7;
      border: 1px solid #f59e0b;
      padding: 0.75rem 1rem;
      border-radius: 6px;
      margin-bottom: 2rem;
      font-size: 10pt;
    }
    @media print {
      body { padding: 1rem; font-size: 10pt; }
      .print-hint { display: none; }
      h2 { page-break-before: auto; }
      a { color: inherit; text-decoration: none; }
    }
    @page { margin: 1.5cm; }
  </style>
</head>
<body>
  <div class="print-hint">
    <strong>Save as PDF:</strong> Press <kbd>Ctrl+P</kbd> (or Cmd+P on Mac) → choose <strong>Save as PDF</strong> → Save.
  </div>
  ${body}
  <hr>
  <p style="color: var(--muted); font-size: 9pt; text-align: center;">
    ProctorShield Production Scaling Guide v1.0 — June 2026 — Generated from repository documentation.
  </p>
</body>
</html>`;

fs.writeFileSync(htmlPath, fullHtml, 'utf8');
console.log('HTML written:', htmlPath);

// Try puppeteer PDF if available
try {
  const require = createRequire(import.meta.url);
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto(`file:///${htmlPath.replace(/\\/g, '/')}`, { waitUntil: 'networkidle0' });
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    margin: { top: '1.5cm', right: '1.5cm', bottom: '1.5cm', left: '1.5cm' },
    printBackground: true,
  });
  await browser.close();
  console.log('PDF written:', pdfPath);
} catch {
  console.log('PDF: puppeteer not installed — open the HTML file and use Print → Save as PDF.');
  console.log('  Or run: npx puppeteer browsers install chrome && npm install puppeteer && node scripts/generate-scaling-guide-doc.mjs');
}
