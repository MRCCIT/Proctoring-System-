/**
 * Shared PDFKit helpers for ProctorShield integrity / exam reports.
 * Clean, print-friendly layout — strong typography, one accent, no clutter.
 */

export const COLORS = {
  ink: '#0f172a',
  muted: '#64748b',
  line: '#e2e8f0',
  soft: '#f8fafc',
  white: '#ffffff',
  accent: '#0f172a',
  danger: '#b91c1c',
  warn: '#c2410c',
  ok: '#15803d',
  brand: '#1e3a5f',
};

export function hexToRgb(hex, fallback = COLORS.brand) {
  const h = String(hex || fallback).replace('#', '');
  if (h.length !== 6) return hexToRgb(fallback);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function formatWhen(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(iso);
  }
}

export function formatDuration(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n < 0) return '—';
  const m = Math.floor(n / 60);
  const s = Math.floor(n % 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m ${s}s`;
  }
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

export function formatOffset(seconds) {
  if (seconds == null || !Number.isFinite(Number(seconds))) return '—';
  const n = Math.max(0, Math.floor(Number(seconds)));
  const m = Math.floor(n / 60);
  const s = n % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Draw branded header band + document title. Returns y after header.
 */
export function drawCoverHeader(doc, opts) {
  const {
    orgName = 'Organization',
    title,
    subtitle,
    accent = COLORS.brand,
    generatedAt = new Date().toISOString(),
  } = opts;
  const rgb = hexToRgb(accent);
  const pageW = doc.page.width;
  const left = doc.page.margins.left;
  const right = doc.page.margins.right;
  const contentW = pageW - left - right;

  doc.save();
  doc.rect(0, 0, pageW, 92).fill(rgb);
  doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(11);
  doc.text(String(orgName).toUpperCase(), left, 22, { width: contentW, characterSpacing: 1.2 });
  doc.font('Helvetica-Bold').fontSize(20).text(title, left, 42, { width: contentW });
  if (subtitle) {
    doc.font('Helvetica').fontSize(10).fillColor('#cbd5e1').text(subtitle, left, 68, { width: contentW });
  }
  doc.restore();

  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8.5);
  doc.text(`Generated ${formatWhen(generatedAt)}  ·  ProctorShield integrity export`, left, 104, {
    width: contentW,
    align: 'right',
  });

  return 122;
}

export function drawSectionTitle(doc, y, label) {
  const left = doc.page.margins.left;
  const contentW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(12).text(label, left, y);
  const after = doc.y + 4;
  doc
    .moveTo(left, after)
    .lineTo(left + contentW, after)
    .strokeColor(COLORS.line)
    .lineWidth(1)
    .stroke();
  return after + 10;
}

/**
 * KPI cards in a row. items: [{ label, value, tone?: 'danger'|'warn'|'ok' }]
 */
export function drawKpiRow(doc, y, items, cols = 3) {
  const left = doc.page.margins.left;
  const contentW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const gap = 8;
  const cardW = (contentW - gap * (cols - 1)) / cols;
  const cardH = 48;
  let x = left;
  let rowY = y;
  let i = 0;

  for (const item of items) {
    if (i > 0 && i % cols === 0) {
      rowY += cardH + gap;
      x = left;
    }
    doc.roundedRect(x, rowY, cardW, cardH, 6).fillAndStroke(COLORS.soft, COLORS.line);
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8).text(String(item.label).toUpperCase(), x + 10, rowY + 10, {
      width: cardW - 20,
    });
    const tone =
      item.tone === 'danger' ? COLORS.danger : item.tone === 'warn' ? COLORS.warn : item.tone === 'ok' ? COLORS.ok : COLORS.ink;
    doc.fillColor(tone).font('Helvetica-Bold').fontSize(16).text(String(item.value ?? '—'), x + 10, rowY + 24, {
      width: cardW - 20,
    });
    x += cardW + gap;
    i += 1;
  }
  const rows = Math.ceil(items.length / cols);
  return rowY + rows * (cardH + gap);
}

export function drawKeyValueGrid(doc, y, pairs, cols = 2) {
  const left = doc.page.margins.left;
  const contentW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colW = contentW / cols;
  let row = 0;
  let maxY = y;

  pairs.forEach((p, idx) => {
    const col = idx % cols;
    if (col === 0 && idx > 0) row += 1;
    const x = left + col * colW;
    const yy = y + row * 28;
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8).text(String(p.label).toUpperCase(), x, yy);
    doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(10).text(String(p.value ?? '—'), x, yy + 11, {
      width: colW - 12,
    });
    maxY = Math.max(maxY, yy + 26);
  });
  return maxY + 6;
}

export function drawTable(doc, y, headers, rows, colWeights) {
  const left = doc.page.margins.left;
  const contentW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const weights = colWeights || headers.map(() => 1);
  const sum = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => (w / sum) * contentW);
  const rowH = 18;
  const headerH = 20;
  const bottom = doc.page.height - doc.page.margins.bottom;

  const ensureSpace = (need) => {
    if (y + need > bottom) {
      doc.addPage();
      y = doc.page.margins.top;
      // redraw header on new page
      drawHeaderBar();
      y += headerH;
    }
  };

  const drawHeaderBar = () => {
    doc.rect(left, y, contentW, headerH).fill(COLORS.brand);
    let x = left;
    headers.forEach((h, i) => {
      doc
        .fillColor(COLORS.white)
        .font('Helvetica-Bold')
        .fontSize(8)
        .text(h, x + 4, y + 6, { width: widths[i] - 8, ellipsis: true, lineBreak: false });
      x += widths[i];
    });
  };

  ensureSpace(headerH + rowH);
  drawHeaderBar();
  y += headerH;

  rows.forEach((cells, ri) => {
    ensureSpace(rowH);
    if (ri % 2 === 0) {
      doc.rect(left, y, contentW, rowH).fill(COLORS.soft);
    }
    let x = left;
    cells.forEach((c, i) => {
      // lineBreak:false — otherwise PDFKit auto page-breaks mid-table and leaves blank pages.
      doc
        .fillColor(COLORS.ink)
        .font('Helvetica')
        .fontSize(8)
        .text(String(c ?? '—'), x + 4, y + 5, {
          width: widths[i] - 8,
          height: rowH - 4,
          ellipsis: true,
          lineBreak: false,
        });
      x += widths[i];
    });
    y += rowH;
  });

  return y + 8;
}

export function drawFooter(doc, text) {
  const range = doc.bufferedPageRange();
  const pageCount = range.count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(range.start + i);
    const left = doc.page.margins.left;
    const contentW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const y = doc.page.height - 40;

    // Writing in the bottom margin triggers PDFKit auto page-break → blank trailing pages.
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    doc
      .moveTo(left, y)
      .lineTo(left + contentW, y)
      .strokeColor(COLORS.line)
      .lineWidth(0.5)
      .stroke();
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8);
    doc.text(text || 'ProctorShield · Confidential', left, y + 6, {
      width: contentW / 2,
      align: 'left',
      lineBreak: false,
    });
    doc.text(`Page ${i + 1} of ${pageCount}`, left + contentW / 2, y + 6, {
      width: contentW / 2,
      align: 'right',
      lineBreak: false,
    });

    doc.page.margins.bottom = savedBottom;
  }
}

export function drawDisclaimer(doc, y, text) {
  const left = doc.page.margins.left;
  const contentW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const bottom = doc.page.height - doc.page.margins.bottom;
  const boxH = 54;
  if (y + boxH > bottom) {
    doc.addPage();
    y = doc.page.margins.top;
  }
  doc.roundedRect(left, y, contentW, boxH, 6).fillAndStroke('#fffbeb', '#fde68a');
  doc
    .fillColor('#92400e')
    .font('Helvetica-Bold')
    .fontSize(8)
    .text('DISCLAIMER', left + 10, y + 8, { lineBreak: false });
  doc
    .fillColor('#78350f')
    .font('Helvetica')
    .fontSize(8)
    .text(text, left + 10, y + 20, { width: contentW - 20, height: 28, align: 'left' });
  return y + boxH + 8;
}
