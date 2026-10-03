export function parseFourierCode(text) {
  const nameMatch = text.match(/"([^"]+)"\s*=>/);
  const name = nameMatch ? nameMatch[1] : 'shape';

  const coefficients = [];
  const re = /(-?\d+)\s*=>\s*\{a:\s*([-\d.eE+]+),\s*p:\s*([-\d.eE+]+)\}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    coefficients.push({
      frequency: parseInt(m[1], 10),
      amplitude: parseFloat(m[2]),
      phase: parseFloat(m[3]),
    });
  }

  if (coefficients.length === 0) return null;
  return { name, coefficients };
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
