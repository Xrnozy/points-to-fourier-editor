function sanitizeName(name) {
  const cleaned = name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+|_+$/g, '');
  return cleaned || 'shape';
}

function formatNum(n) {
  const rounded = Math.round(n * 100) / 100;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

function padFreq(freq) {
  const s = String(freq);
  return freq >= 0 ? ` ${s}` : s;
}

function formatCoefficientBlock(coefficients) {
  const sorted = [...coefficients].sort((a, b) => a.frequency - b.frequency);
  const lines = sorted.map(
    (c) => `        ${padFreq(c.frequency)} => {a: ${formatNum(c.amplitude)}, p: ${formatNum(c.phase)}},`
  );
  return ['    [', ...lines, '    ]'].join('\n');
}

function formatCoefficientBlockHtml(coefficients) {
  const sorted = [...coefficients].sort((a, b) => a.frequency - b.frequency);
  let html = `    <span class="tok-punct">[</span>\n`;
  for (const c of sorted) {
    const freq = padFreq(c.frequency);
    html += `        <span class="tok-key">${freq}</span> <span class="tok-punct">=&gt;</span> <span class="tok-punct">{</span><span class="tok-key">a</span><span class="tok-punct">:</span> <span class="tok-num">${formatNum(c.amplitude)}</span><span class="tok-punct">,</span> <span class="tok-key">p</span><span class="tok-punct">:</span> <span class="tok-num">${formatNum(c.phase)}</span><span class="tok-punct">},</span>\n`;
  }
  html += `    <span class="tok-punct">]</span>`;
  return html;
}

function normalizeSets(coefficientSets) {
  if (!coefficientSets || coefficientSets.length === 0) return [];
  if (typeof coefficientSets[0]?.frequency === 'number') return [coefficientSets];
  return coefficientSets;
}

export function buildExportText(shapeName, coefficientSets) {
  const name = sanitizeName(shapeName);
  const sets = normalizeSets(coefficientSets);
  const blocks = sets
    .filter((coeffs) => coeffs.length > 0)
    .map((coeffs) => formatCoefficientBlock(coeffs));

  if (blocks.length === 0) {
    return [
      `"${name}" => [`,
      '    [',
      '    ]',
      '],',
    ].join('\n');
  }

  return [
    `"${name}" => [`,
    blocks.join(',\n'),
    '],',
  ].join('\n');
}

export function buildHighlightedHtml(shapeName, coefficientSets) {
  const name = sanitizeName(shapeName);
  const sets = normalizeSets(coefficientSets);
  const blocks = sets.filter((coeffs) => coeffs.length > 0);

  let html = `<span class="tok-str">"${name}"</span> <span class="tok-punct">=&gt;</span> <span class="tok-punct">[</span>\n`;
  html += blocks.map((coeffs) => formatCoefficientBlockHtml(coeffs)).join(',\n');
  html += `\n<span class="tok-punct">],</span>`;
  return html;
}
