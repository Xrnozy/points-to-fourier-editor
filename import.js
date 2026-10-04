const COEFF_RE = /(-?\d+)\s*=>\s*\{\s*a\s*:\s*([-\d.eE+]+)\s*,\s*p\s*:\s*([-\d.eE+]+)\s*\}/gi;

function parseCoefficients(text) {
  const coefficients = [];
  const re = new RegExp(COEFF_RE.source, COEFF_RE.flags);
  let m;
  while ((m = re.exec(text)) !== null) {
    coefficients.push({
      frequency: parseInt(m[1], 10),
      amplitude: parseFloat(m[2]),
      phase: parseFloat(m[3]),
    });
  }
  return coefficients;
}

function splitCoefficientBlocks(text) {
  const blocks = [];
  const re = /\[\s*((?:-?\d+\s*=>\s*\{[^}]+\},?\s*)+)\]/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const coeffs = parseCoefficients(m[1]);
    if (coeffs.length > 0) blocks.push(coeffs);
  }
  return blocks;
}

export function parseFourierCode(text) {
  const nameMatch = text.match(/"([^"]+)"\s*=>/);
  const name = nameMatch ? nameMatch[1] : 'shape';

  const coefficientGroups = splitCoefficientBlocks(text);
  if (coefficientGroups.length === 0) {
    const coefficients = parseCoefficients(text);
    if (coefficients.length === 0) return null;
    return { name, coefficientGroups: [coefficients] };
  }

  return { name, coefficientGroups };
}

export function expandCoefficients(parsedCoeffs, maxHarmonics) {
  const map = new Map();
  for (const c of parsedCoeffs) map.set(c.frequency, c);

  const result = [];
  for (let k = -maxHarmonics; k <= maxHarmonics; k++) {
    const c = map.get(k);
    if (c) {
      result.push({
        frequency: k,
        amplitude: c.amplitude,
        phase: c.phase,
        re: c.amplitude * Math.cos(c.phase),
        im: c.amplitude * Math.sin(c.phase),
      });
    } else {
      result.push({ frequency: k, amplitude: 0, phase: 0, re: 0, im: 0 });
    }
  }
  return result;
}
