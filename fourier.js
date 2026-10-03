import { arcLengthResample } from './geometry.js';

export function computeCoefficients(points, maxHarmonics) {
  const samples = arcLengthResample(points);
  const M = samples.length;
  const coeffs = [];

  for (let k = -maxHarmonics; k <= maxHarmonics; k++) {
    let re = 0;
    let im = 0;
    for (let j = 0; j < M; j++) {
      const angle = (-2 * Math.PI * k * j) / M;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      re += samples[j].x * cosA - samples[j].y * sinA;
      im += samples[j].x * sinA + samples[j].y * cosA;
    }
    re /= M;
    im /= M;
    const amplitude = Math.hypot(re, im);
    const phase = Math.atan2(im, re);
    coeffs.push({ frequency: k, amplitude, phase, re, im });
  }

  return coeffs;
}

export function sliceCoefficients(allCoeffs, harmonics) {
  return allCoeffs.filter((c) => c.frequency >= -harmonics && c.frequency <= harmonics);
}

export function evaluateAtTime(coeffs, t) {
  let x = 0;
  let y = 0;
  for (const c of coeffs) {
    const angle = c.frequency * t + c.phase;
    x += c.amplitude * Math.cos(angle);
    y += c.amplitude * Math.sin(angle);
  }
  return { x, y };
}

export function sampleReconstructed(coeffs, sampleCount = 256) {
  const pts = [];
  for (let i = 0; i < sampleCount; i++) {
    const t = (2 * Math.PI * i) / sampleCount;
    pts.push(evaluateAtTime(coeffs, t));
  }
  return pts;
}

export function coefficientsToPoints(coeffs, sampleCount = 48) {
  return sampleReconstructed(coeffs, sampleCount);
}

export function sortEpicycleOrder(coeffs) {
  return [...coeffs].sort((a, b) => {
    const fa = Math.abs(a.frequency);
    const fb = Math.abs(b.frequency);
    if (fa !== fb) return fa - fb;
    return a.frequency - b.frequency;
  });
}
