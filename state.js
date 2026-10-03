import { createDefaultCircle, createInnerShape, stitchContours } from './geometry.js';
import { computeCoefficients, sliceCoefficients, coefficientsToPoints } from './fourier.js';
import { parseFourierCode, expandCoefficients } from './import.js';

const MAX_HARMONICS = 32;
const DEFAULT_HARMONICS = 8;

const state = {
  contours: [{ points: createDefaultCircle() }],
  activeContourIndex: 0,
  selectedIndex: -1,
  selectionMode: 'layer',
  harmonics: DEFAULT_HARMONICS,
  shapeName: 'shape',
  allCoefficients: [],
  activeCoefficients: [],
};

const listeners = new Set();
let recomputeRaf = null;

function getFourierPath() {
  return stitchContours(state.contours.map((c) => c.points));
}

function recompute() {
  state.allCoefficients = computeCoefficients(getFourierPath(), MAX_HARMONICS);
  state.activeCoefficients = sliceCoefficients(state.allCoefficients, state.harmonics);
}

function scheduleRecompute() {
  if (recomputeRaf) return;
  recomputeRaf = requestAnimationFrame(() => {
    recomputeRaf = null;
    recompute();
    notify();
  });
}

recompute();

export function getState() {
  return state;
}

export function getActivePoints() {
  return state.contours[state.activeContourIndex].points;
}

export function getAllBoundsPoints() {
  return state.contours.flatMap((c) => c.points);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) fn(state);
}

function cancelPendingRecompute() {
  if (recomputeRaf) {
    cancelAnimationFrame(recomputeRaf);
    recomputeRaf = null;
  }
}

export function setActiveContourPoints(points) {
  state.contours[state.activeContourIndex].points = points;
  cancelPendingRecompute();
  recompute();
  notify();
}

export function updatePoint(index, x, y) {
  state.contours[state.activeContourIndex].points[index] = { x, y };
  scheduleRecompute();
}

export function setContourPoints(contourIndex, points) {
  state.contours[contourIndex].points = points;
  scheduleRecompute();
}

export function flushRecompute() {
  if (!recomputeRaf) return;
  cancelPendingRecompute();
  recompute();
  notify();
}

export function setSelectedIndex(index) {
  state.selectedIndex = index;
  if (index >= 0) state.selectionMode = 'point';
  notify();
}

export function setSelectionMode(mode) {
  state.selectionMode = mode;
  if (mode === 'layer') state.selectedIndex = -1;
  notify();
}

export function setActiveContourIndex(index) {
  if (index < 0 || index >= state.contours.length) return;
  state.activeContourIndex = index;
  state.selectedIndex = -1;
  notify();
}

export function moveContourOrder(fromIndex, toIndex) {
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= state.contours.length || toIndex >= state.contours.length) return;
  const [item] = state.contours.splice(fromIndex, 1);
  state.contours.splice(toIndex, 0, item);
  state.activeContourIndex = toIndex;
  cancelPendingRecompute();
  recompute();
  notify();
}

export function setHarmonics(n) {
  state.harmonics = Math.max(1, Math.min(MAX_HARMONICS, n));
  state.activeCoefficients = sliceCoefficients(state.allCoefficients, state.harmonics);
  notify();
}

export function setShapeName(name) {
  state.shapeName = name;
  notify();
}

export function resetShape() {
  state.contours = [{ points: createDefaultCircle() }];
  state.activeContourIndex = 0;
  state.selectedIndex = -1;
  state.selectionMode = 'layer';
  cancelPendingRecompute();
  recompute();
  notify();
}

export function addInnerShape() {
  state.contours.push({ points: createInnerShape() });
  state.activeContourIndex = state.contours.length - 1;
  state.selectedIndex = -1;
  state.selectionMode = 'layer';
  cancelPendingRecompute();
  recompute();
  notify();
}

export function removeActiveContour() {
  if (state.contours.length <= 1) return;
  state.contours.splice(state.activeContourIndex, 1);
  state.activeContourIndex = Math.min(state.activeContourIndex, state.contours.length - 1);
  state.selectedIndex = -1;
  state.selectionMode = 'layer';
  cancelPendingRecompute();
  recompute();
  notify();
}

export function deleteSelectedPoint() {
  const points = getActivePoints();
  if (state.selectedIndex < 0 || points.length <= 3) return;
  state.contours[state.activeContourIndex].points = points.filter((_, i) => i !== state.selectedIndex);
  state.selectedIndex = -1;
  state.selectionMode = 'layer';
  cancelPendingRecompute();
  recompute();
  notify();
}

export function importFourier(text) {
  const parsed = parseFourierCode(text);
  if (!parsed) return false;

  const maxFreq = parsed.coefficients.reduce(
    (m, c) => Math.max(m, Math.abs(c.frequency)),
    1
  );

  state.shapeName = parsed.name;
  state.harmonics = Math.min(MAX_HARMONICS, maxFreq);
  state.allCoefficients = expandCoefficients(parsed.coefficients, MAX_HARMONICS);
  state.activeCoefficients = sliceCoefficients(state.allCoefficients, state.harmonics);
  state.contours = [{ points: coefficientsToPoints(parsed.coefficients, 48) }];
  state.activeContourIndex = 0;
  state.selectedIndex = -1;
  state.selectionMode = 'layer';
  notify();
  return true;
}
