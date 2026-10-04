import {
  createDefaultCircle,
  createInnerShape,
  stitchContours,
  rotateDisplayPoint,
  displayToBasePoint,
  closeOpenStrokeForFourier,
} from './geometry.js';
import { getLetterStrokePlan } from './letter-strokes.js';
import { initLetterGuideFont } from './letter-guide.js';
import {
  computeCoefficients,
  sliceCoefficients,
  coefficientsToPoints,
  lerpCoefficientSetList,
  sampleReconstructed,
} from './fourier.js';
import { parseFourierCode, expandCoefficients } from './import.js';

const MAX_HARMONICS = 32;
const DEFAULT_HARMONICS = 8;
const DEFAULT_MERGED_GROUP_ID = 0;

const state = {
  groups: [{ id: DEFAULT_MERGED_GROUP_ID, type: 'merged', harmonics: DEFAULT_HARMONICS }],
  contours: [{ points: createDefaultCircle(), closed: true, groupId: DEFAULT_MERGED_GROUP_ID }],
  activeContourIndex: 0,
  selectedLayerIndices: [0],
  selectedIndices: [],
  selectionMode: 'layer',
  editorTool: 'edit',
  shapeName: 'shape',
  rotation: { x: 0, y: 0, z: 0 },
  exportGroups: [],
  allCoefficients: [],
  activeCoefficients: [],
  animation: {
    frames: [],
    currentIndex: 0,
    playhead: 0,
    playing: false,
    fps: 8,
    loop: true,
    onion: { enabled: true, span: 1 },
    nextKeyframeId: 1,
  },
  letterWorkshop: null,
};

let nextGroupId = 1;

function getGroup(groupId) {
  return state.groups.find((g) => g.id === groupId);
}

function ensureGroupHarmonics(group) {
  if (group && group.harmonics == null) group.harmonics = DEFAULT_HARMONICS;
}

function harmonicsForGroup(groupId) {
  const group = getGroup(groupId);
  ensureGroupHarmonics(group);
  return group?.harmonics ?? DEFAULT_HARMONICS;
}

function getTargetGroupIdsForHarmonics() {
  const indices = state.selectedLayerIndices.length > 0
    ? state.selectedLayerIndices
    : [state.activeContourIndex];
  return [...new Set(indices.map((i) => state.contours[i]?.groupId).filter((id) => id != null))];
}

function refreshHarmonics() {
  for (const group of state.exportGroups) {
    group.activeCoefficients = sliceCoefficients(group.allCoefficients, harmonicsForGroup(group.groupId));
  }
  const first = state.exportGroups.find((g) => g.activeCoefficients.length > 0);
  state.activeCoefficients = first?.activeCoefficients ?? [];
  syncAnimationFrame();
  notify();
}

function nextGroupIdValue() {
  return nextGroupId++;
}

function ensureMergedGroup() {
  if (!state.groups.some((g) => g.type === 'merged')) {
    const id = nextGroupIdValue();
    state.groups.unshift({ id, type: 'merged', harmonics: DEFAULT_HARMONICS });
    return id;
  }
  return state.groups.find((g) => g.type === 'merged').id;
}

function pruneUnusedGroups() {
  const used = new Set(state.contours.map((c) => c.groupId));
  state.groups = state.groups.filter((g) => used.has(g.id));
  ensureMergedGroup();
}

export function getOrderedGroups() {
  const seen = new Set();
  const ordered = [];
  for (const contour of state.contours) {
    if (seen.has(contour.groupId)) continue;
    const group = getGroup(contour.groupId);
    if (!group) continue;
    seen.add(contour.groupId);
    ordered.push(group);
  }
  return ordered;
}

function getContoursInGroup(groupId) {
  return state.contours.filter((c) => c.groupId === groupId);
}

function getPathForGroup(groupId) {
  const group = getGroup(groupId);
  if (!group) return [];
  const closed = getContoursInGroup(groupId)
    .filter((c) => c.closed && c.points.length >= 3)
    .map((c) => toDisplayPoints(c.points));
  const letterStrokes = getContoursInGroup(groupId)
    .filter((c) => c.letterStroke && !c.closed && c.points.length >= 2)
    .map((c) => closeOpenStrokeForFourier(toDisplayPoints(c.points)));
  if (closed.length === 0 && letterStrokes.length === 0) return [];
  if (closed.length === 0) return letterStrokes[0] ?? [];
  if (letterStrokes.length === 0) return stitchContours(closed);
  return stitchContours([...closed, ...letterStrokes]);
}

const listeners = new Set();
let recomputeRaf = null;
const MAX_HISTORY = 60;
let undoStack = [];
let redoStack = [];

function cloneUndoableState() {
  return {
    groups: state.groups.map((g) => ({ ...g })),
    contours: state.contours.map((c) => ({
      closed: c.closed,
      groupId: c.groupId,
      letterStroke: !!c.letterStroke,
      points: c.points.map((p) => ({ x: p.x, y: p.y })),
    })),
    letterWorkshop: state.letterWorkshop ? { ...state.letterWorkshop } : null,
    activeContourIndex: state.activeContourIndex,
    selectedLayerIndices: [...state.selectedLayerIndices],
    selectionMode: state.selectionMode,
    editorTool: state.editorTool,
    selectedIndices: [...state.selectedIndices],
    rotation: { ...state.rotation },
  };
}

function applyUndoableState(snap) {
  if (!snap.groups) {
    snap.groups = [{ id: DEFAULT_MERGED_GROUP_ID, type: 'merged' }];
    for (const contour of snap.contours) contour.groupId = DEFAULT_MERGED_GROUP_ID;
  }
  state.groups = snap.groups.map((g) => ({ ...g }));
  state.contours = snap.contours.map((c) => ({
    closed: c.closed,
    groupId: c.groupId ?? DEFAULT_MERGED_GROUP_ID,
    letterStroke: !!c.letterStroke,
    points: c.points.map((p) => ({ x: p.x, y: p.y })),
  }));
  nextGroupId = Math.max(1, ...state.groups.map((g) => g.id), 0) + 1;
  state.letterWorkshop = snap.letterWorkshop ? { ...snap.letterWorkshop } : null;
  state.activeContourIndex = snap.activeContourIndex;
  state.selectedLayerIndices = snap.selectedLayerIndices?.length
    ? [...snap.selectedLayerIndices]
    : [snap.activeContourIndex];
  state.selectionMode = snap.selectionMode;
  state.editorTool = snap.editorTool;
  state.selectedIndices = [...snap.selectedIndices];
  state.rotation = { ...snap.rotation };
  for (const g of state.groups) ensureGroupHarmonics(g);
  cancelPendingRecompute();
  recompute();
  notify();
}

export function saveCheckpoint() {
  undoStack.push(cloneUndoableState());
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack = [];
}

export function undo() {
  if (undoStack.length === 0) return false;
  redoStack.push(cloneUndoableState());
  applyUndoableState(undoStack.pop());
  return true;
}

export function redo() {
  if (redoStack.length === 0) return false;
  undoStack.push(cloneUndoableState());
  applyUndoableState(redoStack.pop());
  return true;
}

export function canUndo() {
  return undoStack.length > 0;
}

export function canRedo() {
  return redoStack.length > 0;
}

function toDisplayPoint(p) {
  return rotateDisplayPoint(p, state.rotation);
}

function toBasePoint(p) {
  return displayToBasePoint(p, state.rotation);
}

function toDisplayPoints(points) {
  return points.map(toDisplayPoint);
}

function toBasePoints(points) {
  return points.map(toBasePoint);
}

function recompute() {
  const ordered = getOrderedGroups();
  state.exportGroups = ordered.map((group) => {
    const path = getPathForGroup(group.id);
    if (path.length < 3) {
      return { groupId: group.id, type: group.type, allCoefficients: [], activeCoefficients: [] };
    }
    const allCoefficients = computeCoefficients(path, MAX_HARMONICS);
    ensureGroupHarmonics(group);
    const activeCoefficients = sliceCoefficients(allCoefficients, group.harmonics);
    return { groupId: group.id, type: group.type, allCoefficients, activeCoefficients };
  });

  const first = state.exportGroups.find((g) => g.activeCoefficients.length > 0);
  state.allCoefficients = first?.allCoefficients ?? [];
  state.activeCoefficients = first?.activeCoefficients ?? [];
  syncAnimationFrame();
}

function createKeyframeMeta() {
  const id = state.animation.nextKeyframeId++;
  return { id, name: `K${id}` };
}

function captureFrameSnapshot(preserve) {
  const meta = preserve?.id != null && preserve?.name
    ? { id: preserve.id, name: preserve.name }
    : createKeyframeMeta();
  return {
    id: meta.id,
    name: meta.name,
    groups: state.groups.map((g) => ({ ...g })),
    contours: state.contours.map((c) => ({
      closed: c.closed,
      groupId: c.groupId,
      letterStroke: !!c.letterStroke,
      points: c.points.map((p) => ({ x: p.x, y: p.y })),
    })),
    letterWorkshop: state.letterWorkshop ? { ...state.letterWorkshop } : null,
    rotation: { ...state.rotation },
    exportGroups: state.exportGroups.map((g) => ({
      groupId: g.groupId,
      type: g.type,
      activeCoefficients: g.activeCoefficients.map((c) => ({
        frequency: c.frequency,
        amplitude: c.amplitude,
        phase: c.phase,
        re: c.re,
        im: c.im,
      })),
    })),
  };
}

function applyFrameSnapshot(snap) {
  state.groups = snap.groups.map((g) => ({ ...g }));
  state.contours = snap.contours.map((c) => ({
    closed: c.closed,
    groupId: c.groupId,
    letterStroke: !!c.letterStroke,
    points: c.points.map((p) => ({ x: p.x, y: p.y })),
  }));
  state.letterWorkshop = snap.letterWorkshop ? { ...snap.letterWorkshop } : null;
  state.rotation = { ...snap.rotation };
  if (snap.harmonics != null) {
    for (const g of state.groups) {
      if (g.harmonics == null) g.harmonics = snap.harmonics;
    }
  }
  for (const g of state.groups) ensureGroupHarmonics(g);
  state.selectedLayerIndices = [Math.min(
    state.activeContourIndex,
    Math.max(0, state.contours.length - 1)
  )];
  state.activeContourIndex = Math.min(
    state.activeContourIndex,
    Math.max(0, state.contours.length - 1)
  );
  state.selectedIndices = [];
  state.selectionMode = 'layer';
  nextGroupId = Math.max(1, ...state.groups.map((g) => g.id), 0) + 1;
  cancelPendingRecompute();
  recompute();
}

function syncAnimationFrame() {
  const anim = state.animation;
  if (!anim.frames.length) {
    anim.frames.push(captureFrameSnapshot());
    anim.currentIndex = 0;
    anim.playhead = 0;
    return;
  }
  const current = anim.frames[anim.currentIndex];
  anim.frames[anim.currentIndex] = captureFrameSnapshot(current);
}

function frameCoefficientSets(frame) {
  if (!frame) return [];
  return frame.exportGroups.map((g) => g.activeCoefficients).filter((c) => c.length > 0);
}

function isAnimationMorphing() {
  const anim = state.animation;
  return anim.playing || Math.abs(anim.playhead - anim.currentIndex) > 0.001;
}

export function getPreviewCoefficientSets() {
  const anim = state.animation;
  if (anim.frames.length < 2) return getExportCoefficientSets();

  if (!isAnimationMorphing()) {
    return frameCoefficientSets(anim.frames[anim.currentIndex]);
  }

  const head = Math.max(0, Math.min(anim.playhead, anim.frames.length - 1));
  const i = Math.floor(head);
  const j = Math.min(i + 1, anim.frames.length - 1);
  const t = i === j ? 0 : head - i;
  const setsA = frameCoefficientSets(anim.frames[i]);
  const setsB = frameCoefficientSets(anim.frames[j]);
  return lerpCoefficientSetList(setsA, setsB, t);
}

export function getOnionSkinLayers() {
  const anim = state.animation;
  if (!anim.onion.enabled || anim.frames.length < 2) return [];

  const layers = [];
  const morphing = isAnimationMorphing();
  const center = morphing ? Math.floor(anim.playhead) : anim.currentIndex;
  for (let d = -anim.onion.span; d <= anim.onion.span; d++) {
    if (d === 0) continue;
    if (!morphing && d > 0) continue;
    const idx = center + d;
    if (idx < 0 || idx >= anim.frames.length) continue;
    const alpha = d < 0 ? 0.22 : 0.18;
    const color = d < 0 ? 'rgba(158, 179, 168, 0.55)' : 'rgba(212, 168, 140, 0.55)';
    for (const coeffs of frameCoefficientSets(anim.frames[idx])) {
      layers.push({
        offset: d,
        alpha,
        color,
        points: sampleReconstructed(coeffs, 96),
      });
    }
  }
  return layers;
}

export function goToFrame(index) {
  if (index < 0 || index >= state.animation.frames.length) return;
  syncAnimationFrame();
  state.animation.playing = false;
  state.animation.currentIndex = index;
  state.animation.playhead = index;
  applyFrameSnapshot(state.animation.frames[index]);
  notify();
}

export function addAnimationFrame() {
  syncAnimationFrame();
  const snap = captureFrameSnapshot();
  const insertAt = state.animation.currentIndex + 1;
  state.animation.frames.splice(insertAt, 0, snap);
  goToFrame(insertAt);
}

export function duplicateAnimationFrame() {
  syncAnimationFrame();
  const snap = captureFrameSnapshot();
  const insertAt = state.animation.currentIndex + 1;
  state.animation.frames.splice(insertAt, 0, snap);
  goToFrame(insertAt);
}

export function deleteAnimationFrame() {
  if (state.animation.frames.length <= 1) return;
  state.animation.frames.splice(state.animation.currentIndex, 1);
  const idx = Math.min(state.animation.currentIndex, state.animation.frames.length - 1);
  state.animation.currentIndex = idx;
  state.animation.playhead = idx;
  applyFrameSnapshot(state.animation.frames[idx]);
  notify();
}

export function moveAnimationFrame(fromIndex, toIndex) {
  const anim = state.animation;
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= anim.frames.length || toIndex >= anim.frames.length) return;
  if (fromIndex === toIndex) return;
  syncAnimationFrame();
  const [frame] = anim.frames.splice(fromIndex, 1);
  anim.frames.splice(toIndex, 0, frame);
  let nextIndex = anim.currentIndex;
  if (anim.currentIndex === fromIndex) nextIndex = toIndex;
  else if (fromIndex < anim.currentIndex && toIndex >= anim.currentIndex) nextIndex -= 1;
  else if (fromIndex > anim.currentIndex && toIndex <= anim.currentIndex) nextIndex += 1;
  anim.currentIndex = nextIndex;
  anim.playhead = nextIndex;
  notify();
}

export function setAnimationPlaying(playing) {
  state.animation.playing = playing;
  if (playing) state.animation.playhead = state.animation.currentIndex;
  notify();
}

export function setPlayhead(value, { previewOnly = false } = {}) {
  const max = Math.max(0, state.animation.frames.length - 1);
  state.animation.playhead = Math.max(0, Math.min(value, max));
  if (!previewOnly) {
    state.animation.currentIndex = Math.round(state.animation.playhead);
  }
  notify();
}

export function setAnimationFps(fps) {
  state.animation.fps = Math.max(1, Math.min(30, fps));
  notify();
}

export function setOnionSkin({ enabled, span }) {
  if (enabled !== undefined) state.animation.onion.enabled = enabled;
  if (span !== undefined) state.animation.onion.span = Math.max(1, Math.min(3, span));
  notify();
}

export function advanceAnimation(dtMs) {
  const anim = state.animation;
  if (!anim.playing || anim.frames.length < 2) return;
  anim.playhead += (dtMs / 1000) * anim.fps;
  const max = anim.frames.length - 1;
  if (anim.playhead >= max) {
    if (anim.loop) anim.playhead = 0;
    else {
      anim.playhead = max;
      anim.playing = false;
    }
  }
  notify();
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

export function getActiveContour() {
  return state.contours[state.activeContourIndex];
}

export function getActivePoints() {
  return toDisplayPoints(state.contours[state.activeContourIndex].points);
}

export function getDisplayContours() {
  return state.contours.map((c) => ({
    closed: c.closed,
    groupId: c.groupId,
    groupType: getGroup(c.groupId)?.type ?? 'merged',
    points: toDisplayPoints(c.points),
  }));
}

export function getExportCoefficientSets() {
  return state.exportGroups.map((g) => g.activeCoefficients).filter((c) => c.length > 0);
}

export function isPointSelected(index) {
  return state.selectedIndices.includes(index);
}

export function getAllBoundsPoints() {
  const pts = state.contours.flatMap((c) => toDisplayPoints(c.points));
  if (pts.length > 0) return pts;
  return [{ x: 0, y: 0 }];
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
  saveCheckpoint();
  state.contours[state.activeContourIndex].points = toBasePoints(points);
  cancelPendingRecompute();
  recompute();
  notify();
}

export function updatePoint(index, x, y) {
  state.contours[state.activeContourIndex].points[index] = toBasePoint({ x, y });
  scheduleRecompute();
}

export function updatePoints(indices, points) {
  const contour = state.contours[state.activeContourIndex];
  for (let i = 0; i < indices.length; i++) {
    contour.points[indices[i]] = toBasePoint(points[i]);
  }
  scheduleRecompute();
}

export function setContourPoints(contourIndex, points) {
  state.contours[contourIndex].points = toBasePoints(points);
  scheduleRecompute();
}

export function flushRecompute() {
  if (!recomputeRaf) return;
  cancelPendingRecompute();
  recompute();
  notify();
}

export function isMultiSelectMode() {
  return state.selectionMode === 'multiselect';
}

export function toggleMultiSelectMode() {
  if (state.selectionMode === 'multiselect') {
    state.selectionMode = 'point';
  } else {
    state.editorTool = 'edit';
    state.selectionMode = 'multiselect';
  }
  notify();
}

export function selectPoint(index, { additive = false } = {}) {
  const keepMulti = state.selectionMode === 'multiselect';
  if (additive) {
    const i = state.selectedIndices.indexOf(index);
    if (i >= 0) state.selectedIndices.splice(i, 1);
    else state.selectedIndices.push(index);
  } else {
    state.selectedIndices = [index];
  }
  if (!keepMulti) state.selectionMode = 'point';
  notify();
}

export function selectPoints(indices, { additive = false } = {}) {
  const keepMulti = state.selectionMode === 'multiselect';
  const unique = [...new Set(indices)].filter((i) => i >= 0).sort((a, b) => a - b);
  if (additive) {
    const set = new Set(state.selectedIndices);
    for (const i of unique) {
      if (set.has(i)) set.delete(i);
      else set.add(i);
    }
    state.selectedIndices = [...set].sort((a, b) => a - b);
  } else {
    state.selectedIndices = unique;
  }
  if (!keepMulti) state.selectionMode = 'point';
  else state.selectionMode = 'multiselect';
  notify();
}

export function clearPointSelection() {
  state.selectedIndices = [];
  notify();
}

export function setSelectionMode(mode) {
  state.selectionMode = mode;
  if (mode === 'layer') state.selectedIndices = [];
  notify();
}

export function setEditorTool(tool) {
  if (tool === 'draw' && state.editorTool !== 'draw') saveCheckpoint();
  state.editorTool = tool;
  if (tool === 'draw') {
    state.selectionMode = 'point';
    state.selectedIndices = [];
    const contour = state.contours[state.activeContourIndex];
    if (!state.letterWorkshop) contour.points = [];
    contour.closed = false;
    if (state.letterWorkshop) contour.letterStroke = true;
    cancelPendingRecompute();
    recompute();
  }
  if (tool === 'eraser' || tool === 'draw') {
    if (state.selectionMode === 'multiselect') state.selectionMode = 'point';
  }
  if (tool === 'eraser') state.selectedIndices = [];
  notify();
}

export function addDrawPoint(x, y) {
  saveCheckpoint();
  const contour = state.contours[state.activeContourIndex];
  contour.points.push(toBasePoint({ x, y }));
  contour.closed = false;
  scheduleRecompute();
  notify();
}

export function closeActiveContour() {
  const contour = state.contours[state.activeContourIndex];
  if (contour.points.length < 3) return;
  saveCheckpoint();
  contour.closed = true;
  state.editorTool = 'edit';
  cancelPendingRecompute();
  recompute();
  notify();
}

export function setActiveContourIndex(index) {
  if (index < 0 || index >= state.contours.length) return;
  state.activeContourIndex = index;
  state.selectedLayerIndices = [index];
  state.selectedIndices = [];
  notify();
}

export function selectLayer(index, { additive = false } = {}) {
  if (index < 0 || index >= state.contours.length) return;
  if (additive) {
    const pos = state.selectedLayerIndices.indexOf(index);
    if (pos >= 0) state.selectedLayerIndices.splice(pos, 1);
    else state.selectedLayerIndices.push(index);
    if (state.selectedLayerIndices.length === 0) state.selectedLayerIndices = [index];
  } else {
    state.selectedLayerIndices = [index];
  }
  state.activeContourIndex = index;
  state.selectedIndices = [];
  state.selectionMode = 'layer';
  notify();
}

export function getHarmonicsUI() {
  const groupIds = getTargetGroupIdsForHarmonics();
  const values = groupIds.map((id) => harmonicsForGroup(id));
  const unique = [...new Set(values)];
  const layerCount = state.selectedLayerIndices.length > 0
    ? state.selectedLayerIndices.length
    : 1;
  return {
    value: unique[0] ?? DEFAULT_HARMONICS,
    mixed: unique.length > 1,
    groupCount: groupIds.length,
    layerCount,
  };
}

export function moveContourOrder(fromIndex, toIndex) {
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= state.contours.length || toIndex >= state.contours.length) return;
  saveCheckpoint();
  const [item] = state.contours.splice(fromIndex, 1);
  state.contours.splice(toIndex, 0, item);
  state.activeContourIndex = toIndex;
  cancelPendingRecompute();
  recompute();
  notify();
}

export function setHarmonics(n) {
  applyHarmonicsToGroups(getTargetGroupIdsForHarmonics(), n);
}

export function setGroupHarmonics(groupId, n) {
  applyHarmonicsToGroups([groupId], n);
}

function applyHarmonicsToGroups(groupIds, n) {
  const clamped = Math.max(1, Math.min(MAX_HARMONICS, n));
  for (const id of groupIds) {
    const group = getGroup(id);
    if (group) group.harmonics = clamped;
  }
  refreshHarmonics();
}

export function setShapeName(name) {
  state.shapeName = name;
  notify();
}

export function setRotation(rotation) {
  state.rotation = {
    x: rotation.x ?? 0,
    y: rotation.y ?? 0,
    z: rotation.z ?? 0,
  };
  cancelPendingRecompute();
  recompute();
  notify();
}

export function resetRotation() {
  setRotation({ x: 0, y: 0, z: 0 });
}

export function resetShape() {
  saveCheckpoint();
  nextGroupId = 1;
  state.groups = [{ id: DEFAULT_MERGED_GROUP_ID, type: 'merged', harmonics: DEFAULT_HARMONICS }];
  state.contours = [{ points: createDefaultCircle(), closed: true, groupId: DEFAULT_MERGED_GROUP_ID }];
  state.activeContourIndex = 0;
  state.selectedLayerIndices = [0];
  state.selectedIndices = [];
  state.selectionMode = 'layer';
  state.editorTool = 'edit';
  state.rotation = { x: 0, y: 0, z: 0 };
  state.letterWorkshop = null;
  state.animation.frames = [];
  state.animation.currentIndex = 0;
  state.animation.playhead = 0;
  state.animation.playing = false;
  state.animation.nextKeyframeId = 1;
  cancelPendingRecompute();
  recompute();
  notify();
}

function getTargetGroupId() {
  const active = state.contours[state.activeContourIndex];
  if (active) return active.groupId;
  return ensureMergedGroup();
}

export function addMergedLayer() {
  saveCheckpoint();
  const groupId = getTargetGroupId();
  state.contours.push({ points: createInnerShape(), closed: true, groupId });
  state.activeContourIndex = state.contours.length - 1;
  state.selectedLayerIndices = [state.activeContourIndex];
  state.selectedIndices = [];
  state.selectionMode = 'layer';
  state.editorTool = 'edit';
  cancelPendingRecompute();
  recompute();
  notify();
}

export function addSeparateLayer() {
  saveCheckpoint();
  const groupId = nextGroupIdValue();
  state.groups.push({
    id: groupId,
    type: 'separate',
    harmonics: harmonicsForGroup(getTargetGroupId()),
  });
  state.contours.push({ points: createInnerShape(), closed: true, groupId });
  state.activeContourIndex = state.contours.length - 1;
  state.selectedLayerIndices = [state.activeContourIndex];
  state.selectedIndices = [];
  state.selectionMode = 'layer';
  state.editorTool = 'edit';
  cancelPendingRecompute();
  recompute();
  notify();
}

export function addInnerShape() {
  addMergedLayer();
}

export function splitActiveLayerToSeparate() {
  const contour = state.contours[state.activeContourIndex];
  const group = getGroup(contour.groupId);
  if (!group) return;
  if (getContoursInGroup(contour.groupId).length <= 1) return;
  saveCheckpoint();
  const groupId = nextGroupIdValue();
  state.groups.push({ id: groupId, type: 'separate', harmonics: harmonicsForGroup(contour.groupId) });
  contour.groupId = groupId;
  cancelPendingRecompute();
  recompute();
  notify();
}

export function joinActiveLayerToMerged() {
  const contour = state.contours[state.activeContourIndex];
  const group = getGroup(contour.groupId);
  if (!group || group.type === 'merged') return;
  saveCheckpoint();
  const mergedGroupId = ensureMergedGroup();
  const oldGroupId = contour.groupId;
  contour.groupId = mergedGroupId;
  if (!getContoursInGroup(oldGroupId).length) {
    state.groups = state.groups.filter((g) => g.id !== oldGroupId);
  }
  cancelPendingRecompute();
  recompute();
  notify();
}

export function clearPointEditor() {
  saveCheckpoint();
  const contour = state.contours[state.activeContourIndex];
  contour.points = [];
  contour.closed = false;
  state.selectedIndices = [];
  if (state.editorTool !== 'eraser') state.selectionMode = 'layer';
  cancelPendingRecompute();
  recompute();
  notify();
}

export function removeActiveContour() {
  if (state.contours.length <= 1) {
    clearPointEditor();
    return;
  }
  saveCheckpoint();
  const removedIndex = state.activeContourIndex;
  const removedGroupId = state.contours[removedIndex].groupId;
  state.contours.splice(removedIndex, 1);
  if (!getContoursInGroup(removedGroupId).length) {
    state.groups = state.groups.filter((g) => g.id !== removedGroupId);
  }
  pruneUnusedGroups();
  state.activeContourIndex = Math.min(removedIndex, state.contours.length - 1);
  state.selectedLayerIndices = state.selectedLayerIndices
    .filter((i) => i !== removedIndex)
    .map((i) => (i > removedIndex ? i - 1 : i));
  if (state.selectedLayerIndices.length === 0) {
    state.selectedLayerIndices = [state.activeContourIndex];
  }
  state.selectedIndices = [];
  state.selectionMode = 'layer';
  state.editorTool = 'edit';
  cancelPendingRecompute();
  recompute();
  notify();
}

export function deleteSelectedPoints() {
  const contour = state.contours[state.activeContourIndex];
  if (state.selectedIndices.length === 0) return;
  saveCheckpoint();

  const removeSet = new Set(state.selectedIndices);
  contour.points = contour.points.filter((_, i) => !removeSet.has(i));
  if (contour.points.length === 0) contour.closed = false;
  state.selectedIndices = [];
  if (state.editorTool !== 'eraser') state.selectionMode = 'layer';
  cancelPendingRecompute();
  recompute();
  notify();
}

export function erasePointAt(index, { skipCheckpoint = false } = {}) {
  const contour = state.contours[state.activeContourIndex];
  if (index < 0 || index >= contour.points.length) return false;
  if (!skipCheckpoint) saveCheckpoint();
  contour.points.splice(index, 1);
  if (contour.points.length === 0) contour.closed = false;
  state.selectedIndices = state.selectedIndices
    .filter((i) => i !== index)
    .map((i) => (i > index ? i - 1 : i));
  scheduleRecompute();
  notify();
  return true;
}

export function importFourier(text) {
  const parsed = parseFourierCode(text);
  if (!parsed) return false;

  saveCheckpoint();
  state.shapeName = parsed.name;
  state.rotation = { x: 0, y: 0, z: 0 };

  if (parsed.coefficientGroups.length === 1) {
    const maxFreq = Math.max(...parsed.coefficientGroups[0].map((c) => Math.abs(c.frequency)), 1);
    nextGroupId = 1;
    state.groups = [{
      id: DEFAULT_MERGED_GROUP_ID,
      type: 'merged',
      harmonics: Math.min(MAX_HARMONICS, maxFreq),
    }];
    state.contours = [{
      points: coefficientsToPoints(parsed.coefficientGroups[0], 48),
      closed: true,
      groupId: DEFAULT_MERGED_GROUP_ID,
    }];
  } else {
    nextGroupId = parsed.coefficientGroups.length;
    state.groups = parsed.coefficientGroups.map((coeffs, i) => ({
      id: i,
      type: 'separate',
      harmonics: Math.min(
        MAX_HARMONICS,
        Math.max(...coeffs.map((c) => Math.abs(c.frequency)), 1)
      ),
    }));
    state.contours = parsed.coefficientGroups.map((coeffs, i) => ({
      points: coefficientsToPoints(coeffs, 48),
      closed: true,
      groupId: i,
    }));
  }

  state.activeContourIndex = 0;
  state.selectedLayerIndices = [0];
  state.selectedIndices = [];
  state.selectionMode = 'layer';
  state.editorTool = 'edit';
  state.animation.frames = [];
  state.animation.currentIndex = 0;
  state.animation.playhead = 0;
  state.animation.playing = false;
  state.animation.nextKeyframeId = 1;
  state.letterWorkshop = null;
  cancelPendingRecompute();
  recompute();
  notify();
  return true;
}

function makeLetterStrokeContour(groupId) {
  return { points: [], closed: false, letterStroke: true, groupId };
}

export function hasLetterProject() {
  return state.letterWorkshop != null;
}

export function isLetterNotebookView() {
  return !!state.letterWorkshop?.showNotebook;
}

/** @deprecated use hasLetterProject or isLetterNotebookView */
export function isLetterWorkshopActive() {
  return hasLetterProject();
}

export function getLetterWorkshop() {
  return state.letterWorkshop;
}

export function toggleLetterNotebookView() {
  if (!state.letterWorkshop) return false;
  state.letterWorkshop.showNotebook = !state.letterWorkshop.showNotebook;
  if (state.letterWorkshop.showNotebook) state.letterWorkshop.needsFit = true;
  notify();
  return true;
}

export function consumeNotebookFitRequest() {
  if (!state.letterWorkshop?.needsFit) return false;
  state.letterWorkshop.needsFit = false;
  return true;
}

export function toggleLetterGuide() {
  if (!state.letterWorkshop) return;
  state.letterWorkshop.showLetterGuide = !state.letterWorkshop.showLetterGuide;
  notify();
}

function beginLetterDrawMode({ clearPoints = false } = {}) {
  const contour = state.contours[state.activeContourIndex];
  if (clearPoints) contour.points = [];
  contour.closed = false;
  contour.letterStroke = true;
  state.editorTool = 'draw';
  state.selectionMode = 'point';
  state.selectedIndices = [];
}

export function createLetter(char, strokeCountOverride = null) {
  const letter = char?.trim();
  if (!letter || letter.length !== 1) return false;

  const plan = getLetterStrokePlan(letter, strokeCountOverride);

  saveCheckpoint();
  nextGroupId = 1;
  const groupId = nextGroupIdValue();
  state.groups = [{ id: groupId, type: 'separate', harmonics: 16 }];
  state.contours = [makeLetterStrokeContour(groupId)];
  state.activeContourIndex = 0;
  state.selectedLayerIndices = [0];
  state.selectedIndices = [];
  state.rotation = { x: 0, y: 0, z: 0 };
  state.shapeName = `letter_${letter}`;
  state.letterWorkshop = {
    letter,
    strokeIndex: 0,
    totalStrokes: plan.strokeCount,
    hint: plan.getHint(0),
    showNotebook: true,
    showLetterGuide: true,
    needsFit: true,
  };
  state.animation.frames = [];
  state.animation.currentIndex = 0;
  state.animation.playhead = 0;
  state.animation.playing = false;
  state.animation.nextKeyframeId = 1;
  beginLetterDrawMode();
  cancelPendingRecompute();
  recompute();
  notify();
  initLetterGuideFont().then(() => notify());
  return true;
}

export function startLetterDraw() {
  if (!state.letterWorkshop) return;
  saveCheckpoint();
  beginLetterDrawMode();
  notify();
}

export function startLetterPointEdit() {
  if (!state.letterWorkshop) return;
  state.editorTool = 'edit';
  state.selectionMode = 'point';
  notify();
}

export function nextLetterStroke() {
  const ws = state.letterWorkshop;
  if (!ws) return false;
  const contour = state.contours[state.activeContourIndex];
  if (contour.points.length < 2) return false;
  if (ws.strokeIndex + 1 >= ws.totalStrokes) return false;

  saveCheckpoint();
  contour.letterStroke = true;
  contour.closed = false;

  const groupId = nextGroupIdValue();
  state.groups.push({ id: groupId, type: 'separate', harmonics: 16 });
  state.contours.push(makeLetterStrokeContour(groupId));
  state.activeContourIndex = state.contours.length - 1;
  state.selectedLayerIndices = [state.activeContourIndex];
  state.selectedIndices = [];
  ws.strokeIndex += 1;
  ws.hint = getLetterStrokePlan(ws.letter, ws.totalStrokes).getHint(ws.strokeIndex);
  beginLetterDrawMode();
  cancelPendingRecompute();
  recompute();
  notify();
  return true;
}

export function finishLetterWorkshop() {
  if (!state.letterWorkshop) return;
  const contour = state.contours[state.activeContourIndex];
  if (contour.points.length < 2) return;
  saveCheckpoint();
  contour.letterStroke = true;
  contour.closed = false;
  state.letterWorkshop = null;
  state.editorTool = 'edit';
  state.selectionMode = 'layer';
  cancelPendingRecompute();
  recompute();
  notify();
}

export function cancelLetterWorkshop() {
  if (!state.letterWorkshop) return;
  state.letterWorkshop = null;
  state.editorTool = 'edit';
  notify();
}
