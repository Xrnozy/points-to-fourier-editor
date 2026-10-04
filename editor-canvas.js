import {
  hitTestPointScreen,
  hitTestSegmentScreen,
  hitTestContoursScreen,
  hitTestContoursFill,
  hitTestLayerHandle,
  insertPoint,
  getBounds,
  boundsHandles,
  boundsCenter,
  getRotateHandle,
  getScaleAnchor,
  scalePointsFromAnchor,
  computeScaleFromHandle,
  rotatePointsAround,
  pointInBounds,
  toCanvas,
  fromCanvas,
  translatePoints,
  distSq,
} from './geometry.js';
import { attachCanvasZoom, addFitViewButton } from './view-zoom.js';
import {
  getState,
  getActiveContour,
  getActivePoints,
  getDisplayContours,
  getAllBoundsPoints,
  getOnionSkinLayers,
  isPointSelected,
  setActiveContourPoints,
  selectPoint,
  selectPoints,
  clearPointSelection,
  setActiveContourIndex,
  setSelectionMode,
  isMultiSelectMode,
  updatePoint,
  updatePoints,
  setContourPoints,
  flushRecompute,
  addDrawPoint,
  closeActiveContour,
  saveCheckpoint,
  erasePointAt,
  hasLetterProject,
  isLetterNotebookView,
  consumeNotebookFitRequest,
  getLetterWorkshop,
} from './state.js';
import {
  getNotebookWritingBounds,
  getNotebookFitPoints,
  NOTEBOOK_LINE_SPACING,
  NOTEBOOK_MARGIN_X,
} from './letter-strokes.js';
import { drawLetterGhost } from './letter-guide.js';

const POINT_HIT_RADIUS = 16;
const ERASER_RADIUS = 20;
const DRAG_THRESHOLD_SQ = 6 * 6;
const SEGMENT_HIT_RADIUS = 12;
const CLOSE_RADIUS = 14;
const HANDLE_DRAW_SIZE = 5;
const HANDLE_HIT_RADIUS = 11;

const HANDLE_CURSORS = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  rotate: 'grab',
};

const CONTOUR_COLORS = [
  { fill: 'rgba(107, 144, 128, 0.14)', stroke: '#6b9080', point: '#c8d9d0' },
  { fill: 'rgba(212, 168, 140, 0.12)', stroke: '#d4a88c', point: '#e8d4c4' },
  { fill: 'rgba(158, 179, 168, 0.12)', stroke: '#9eb3a8', point: '#c5d4cc' },
  { fill: 'rgba(196, 122, 106, 0.12)', stroke: '#c47a6a', point: '#e0b8ae' },
];

export function initEditorCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  let transform = null;
  let dragTransform = null;
  let dragging = false;
  let dragMode = null;
  let dragIndices = [];
  let dragContourIndex = -1;
  let dragStartWorld = null;
  let dragOriginPoints = null;
  let dragScaleHandle = null;
  let dragScaleAnchor = null;
  let dragScaleHandleStart = null;
  let dragRotateCenter = null;
  let dragRotateStartAngle = null;
  let activePointerId = null;
  let hoverWorld = null;
  let pendingPick = null;
  let eraserStroke = false;
  let marquee = null;
  let viewW = 0;
  let viewH = 0;

  const canvasWrap = canvas.parentElement;

  function syncSize() {
    const rect = canvasWrap.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    if (w === viewW && h === viewH && canvas.width === w * (window.devicePixelRatio || 1)) return;

    viewW = w;
    viewH = h;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    viewZoom.ensureFitted();
    draw();
  }

  function getTransformPoints() {
    const contours = getDisplayContours();
    const strokePts = contours.flatMap((c) => c.points);
    if (hasLetterProject()) {
      const guidePts = getNotebookFitPoints();
      return strokePts.length > 0 ? [...strokePts, ...guidePts] : guidePts;
    }
    const { editorTool } = getState();
    if (editorTool === 'draw') {
      const closed = contours.flatMap((c) => (c.closed && c.points.length >= 3 ? c.points : []));
      return closed.length > 0 ? closed : [];
    }
    return getAllBoundsPoints();
  }

  const viewZoom = attachCanvasZoom(canvas, {
    getFitPoints: getTransformPoints,
    getViewSize: () => ({ w: viewW, h: viewH }),
    onZoom: draw,
  });
  addFitViewButton(canvas, () => viewZoom.fitToContent());

  function computeTransform() {
    return viewZoom.getTransform();
  }

  function getActiveTransform() {
    if (dragging && dragTransform) return dragTransform;
    return computeTransform();
  }

  function getPointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const t = getActiveTransform();
    return { sx, sy, world: fromCanvas(sx, sy, t) };
  }

  function drawContour(contour, ci, activeContourIndex, selectedIndices, selectionMode) {
    const { points, closed } = contour;
    const notebookView = isLetterNotebookView();
    const isLetterStroke = notebookView && contour.letterStroke;
    const colors = isLetterStroke
      ? {
        fill: 'rgba(37, 99, 235, 0.06)',
        stroke: ci === activeContourIndex ? '#1d4ed8' : 'rgba(37, 99, 235, 0.55)',
        point: ci === activeContourIndex ? '#2563eb' : 'rgba(37, 99, 235, 0.7)',
      }
      : CONTOUR_COLORS[ci % CONTOUR_COLORS.length];
    const isActive = ci === activeContourIndex;
    const layerSelected = isActive && selectionMode === 'layer' && !notebookView;

    if (points.length >= 1) {
      ctx.beginPath();
      const first = toCanvas(points[0].x, points[0].y, transform);
      ctx.moveTo(first.cx, first.cy);
      for (let i = 1; i < points.length; i++) {
        const p = toCanvas(points[i].x, points[i].y, transform);
        ctx.lineTo(p.cx, p.cy);
      }
      if (closed && points.length >= 3) ctx.closePath();

      if (closed && points.length >= 3) {
        ctx.fillStyle = colors.fill;
        ctx.fill();
      }

      ctx.strokeStyle = layerSelected ? '#d4a88c' : isActive ? colors.stroke : 'rgba(139, 145, 156, 0.45)';
      ctx.lineWidth = layerSelected ? 2 : isActive ? 1.5 : 1;
      ctx.setLineDash(isActive && !closed ? [6, 4] : isActive ? [] : [4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      if (isActive && !closed && hoverWorld && getState().editorTool === 'draw') {
        const last = toCanvas(points[points.length - 1].x, points[points.length - 1].y, transform);
        const hover = toCanvas(hoverWorld.x, hoverWorld.y, transform);
        ctx.beginPath();
        ctx.moveTo(last.cx, last.cy);
        ctx.lineTo(hover.cx, hover.cy);
        ctx.strokeStyle = 'rgba(212, 168, 140, 0.5)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    if (layerSelected && points.length >= 1) {
      drawLayerTransformBox(points);
    }

    for (let i = 0; i < points.length; i++) {
      const p = toCanvas(points[i].x, points[i].y, transform);
      const pointSelected = isActive
        && (selectionMode === 'point' || selectionMode === 'multiselect')
        && selectedIndices.includes(i);
      const showPoint = isActive && (layerSelected || pointSelected || !closed);

      if (!showPoint && !isActive) {
        ctx.beginPath();
        ctx.arc(p.cx, p.cy, 4, 0, Math.PI * 2);
        ctx.fillStyle = colors.point;
        ctx.fill();
        continue;
      }

      const isFirst = i === 0 && !closed && points.length >= 3;
      ctx.beginPath();
      ctx.arc(p.cx, p.cy, pointSelected ? 8 : isFirst ? 9 : layerSelected ? 5 : 6, 0, Math.PI * 2);
      ctx.fillStyle = pointSelected ? '#d4a88c' : isFirst ? '#6b9080' : layerSelected ? '#e8d4c4' : colors.point;
      ctx.fill();
      ctx.strokeStyle = '#13151a';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      if (pointSelected) {
        ctx.beginPath();
        ctx.arc(p.cx, p.cy, POINT_HIT_RADIUS, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(212, 168, 140, 0.4)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  function drawLayerTransformBox(points) {
    const bounds = getBounds(points);
    const tl = toCanvas(bounds.minX, bounds.maxY, transform);
    const br = toCanvas(bounds.maxX, bounds.minY, transform);
    ctx.strokeStyle = '#d4a88c';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.strokeRect(tl.cx, tl.cy, br.cx - tl.cx, br.cy - tl.cy);

    for (const pt of Object.values(boundsHandles(bounds))) {
      const p = toCanvas(pt.x, pt.y, transform);
      const half = HANDLE_DRAW_SIZE;
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#d4a88c';
      ctx.lineWidth = 1.5;
      ctx.fillRect(p.cx - half, p.cy - half, half * 2, half * 2);
      ctx.strokeRect(p.cx - half, p.cy - half, half * 2, half * 2);
    }

    const top = boundsHandles(bounds).n;
    const rotate = getRotateHandle(bounds);
    const topC = toCanvas(top.x, top.y, transform);
    const rotateC = toCanvas(rotate.x, rotate.y, transform);
    ctx.beginPath();
    ctx.moveTo(topC.cx, topC.cy);
    ctx.lineTo(rotateC.cx, rotateC.cy);
    ctx.strokeStyle = 'rgba(212, 168, 140, 0.7)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(rotateC.cx, rotateC.cy, HANDLE_DRAW_SIZE + 1, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#6b9080';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function draw() {
    const { activeContourIndex, selectedIndices, selectionMode, editorTool } = getState();
    const contours = getDisplayContours();

    const notebookView = isLetterNotebookView();

    ctx.clearRect(0, 0, viewW, viewH);
    ctx.fillStyle = notebookView ? '#f3efe4' : '#13151a';
    ctx.fillRect(0, 0, viewW, viewH);

    if (contours.length < 1 || viewW < 1 || viewH < 1) return;

    transform = getActiveTransform();

    if (notebookView) {
      if (consumeNotebookFitRequest()) viewZoom.fitToContent();
      drawNotebookPaper();
    }

    for (const onion of getOnionSkinLayers()) {
      if (onion.points.length < 2) continue;
      ctx.beginPath();
      const fp = toCanvas(onion.points[0].x, onion.points[0].y, transform);
      ctx.moveTo(fp.cx, fp.cy);
      for (let i = 1; i < onion.points.length; i++) {
        const p = toCanvas(onion.points[i].x, onion.points[i].y, transform);
        ctx.lineTo(p.cx, p.cy);
      }
      ctx.closePath();
      ctx.strokeStyle = onion.color;
      ctx.globalAlpha = onion.alpha;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    for (let ci = 0; ci < contours.length; ci++) {
      drawContour(contours[ci], ci, activeContourIndex, selectedIndices, selectionMode);
    }

    if (marquee) {
      const x = Math.min(marquee.startSx, marquee.sx);
      const y = Math.min(marquee.startSy, marquee.sy);
      const w = Math.abs(marquee.sx - marquee.startSx);
      const h = Math.abs(marquee.sy - marquee.startSy);
      ctx.fillStyle = 'rgba(212, 168, 140, 0.14)';
      ctx.strokeStyle = '#d4a88c';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    }

    if (editorTool === 'draw' && getActiveContour().points.length === 0) {
      ctx.font = '13px Outfit, sans-serif';
      ctx.textAlign = 'center';
      if (notebookView) {
        ctx.fillStyle = 'rgba(30, 64, 175, 0.55)';
        ctx.fillText('Click on the notebook to draw', viewW / 2, viewH - 28);
      } else {
        ctx.fillStyle = 'rgba(139, 145, 156, 0.5)';
        ctx.fillText('Click to place points · Click first point to close', viewW / 2, viewH / 2);
      }
    }
  }

  function startLayerDrag(contourIndex, world, t) {
    saveCheckpoint();
    const contours = getDisplayContours();
    dragging = true;
    dragMode = 'layer';
    dragContourIndex = contourIndex;
    dragIndices = [];
    dragStartWorld = { x: world.x, y: world.y };
    dragOriginPoints = contours[contourIndex].points.map((p) => ({ ...p }));
    dragTransform = t;
    transform = t;
    return true;
  }

  function startRotateDrag(contourIndex, world, t) {
    saveCheckpoint();
    const contours = getDisplayContours();
    const points = contours[contourIndex].points;
    const bounds = getBounds(points);
    dragRotateCenter = boundsCenter(bounds);
    dragging = true;
    dragMode = 'rotate';
    dragContourIndex = contourIndex;
    dragOriginPoints = points.map((p) => ({ ...p }));
    dragRotateStartAngle = Math.atan2(world.y - dragRotateCenter.y, world.x - dragRotateCenter.x);
    dragTransform = t;
    transform = t;
  }

  function startScaleDrag(contourIndex, handle, t) {
    saveCheckpoint();
    const contours = getDisplayContours();
    const points = contours[contourIndex].points;
    const bounds = getBounds(points);
    const handles = boundsHandles(bounds);
    dragging = true;
    dragMode = 'scale';
    dragContourIndex = contourIndex;
    dragScaleHandle = handle;
    dragScaleAnchor = getScaleAnchor(handle, bounds);
    dragScaleHandleStart = { ...handles[handle] };
    dragOriginPoints = points.map((p) => ({ ...p }));
    dragTransform = t;
    transform = t;
  }

  function startPointDrag(contourIndex, indices, world, t) {
    saveCheckpoint();
    const contours = getDisplayContours();
    dragging = true;
    dragMode = 'points';
    dragContourIndex = contourIndex;
    dragIndices = indices;
    dragStartWorld = { x: world.x, y: world.y };
    dragOriginPoints = contours[contourIndex].points.map((p) => ({ ...p }));
    dragTransform = t;
    transform = t;
  }

  function visibleWorldBounds(t) {
    const corners = [
      fromCanvas(0, 0, t),
      fromCanvas(viewW, 0, t),
      fromCanvas(0, viewH, t),
      fromCanvas(viewW, viewH, t),
    ];
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of corners) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return { minX, maxX, minY, maxY };
  }

  function drawWorldHLine(y, x1, x2, style, width = 1, dash = null) {
    const a = toCanvas(x1, y, transform);
    const b = toCanvas(x2, y, transform);
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.setLineDash(dash ?? []);
    ctx.beginPath();
    ctx.moveTo(a.cx, a.cy);
    ctx.lineTo(b.cx, b.cy);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawWorldVLine(x, y1, y2, style, width = 1) {
    const a = toCanvas(x, y1, transform);
    const b = toCanvas(x, y2, transform);
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(a.cx, a.cy);
    ctx.lineTo(b.cx, b.cy);
    ctx.stroke();
  }

  function drawNotebookPaper() {
    const visible = visibleWorldBounds(transform);
    const pad = NOTEBOOK_LINE_SPACING * 2;
    const minX = visible.minX - pad;
    const maxX = visible.maxX + pad;
    const minY = visible.minY - pad;
    const maxY = visible.maxY + pad;

    const paperTL = toCanvas(minX, maxY, transform);
    const paperBR = toCanvas(maxX, minY, transform);
    ctx.fillStyle = '#f3efe4';
    ctx.fillRect(paperTL.cx, paperTL.cy, paperBR.cx - paperTL.cx, paperBR.cy - paperTL.cy);

    drawWorldVLine(
      NOTEBOOK_MARGIN_X,
      minY,
      maxY,
      'rgba(220, 38, 38, 0.55)',
      Math.max(1, 1.5 / transform.scale)
    );

    const spacing = NOTEBOOK_LINE_SPACING;
    const firstLine = Math.floor(minY / spacing) * spacing;
    const lineWidth = Math.max(0.75, 1 / transform.scale);
    for (let y = firstLine; y <= maxY; y += spacing) {
      drawWorldHLine(y, minX, maxX, 'rgba(59, 130, 246, 0.38)', lineWidth);
    }

    const ws = getLetterWorkshop();
    if (ws?.showLetterGuide !== false) {
      drawLetterGhost(ctx, ws.letter, transform, toCanvas);
    }

    const bounds = getNotebookWritingBounds();
    const guideLeft = bounds.left;
    const guideRight = bounds.right;
    const dash = [8 / transform.scale, 6 / transform.scale];
    const guideWidth = Math.max(1.5, 2 / transform.scale);
    const zoneWidth = Math.max(1, 1.5 / transform.scale);

    drawWorldVLine(guideLeft, bounds.descender, bounds.capHeight, 'rgba(37, 99, 235, 0.45)', zoneWidth);
    drawWorldVLine(guideRight, bounds.descender, bounds.capHeight, 'rgba(37, 99, 235, 0.45)', zoneWidth);

    drawWorldHLine(bounds.baseline, guideLeft, guideRight, 'rgba(29, 78, 216, 0.75)', guideWidth, dash);
    drawWorldHLine(bounds.xHeight, guideLeft, guideRight, 'rgba(37, 99, 235, 0.55)', guideWidth, dash);
    drawWorldHLine(bounds.capHeight, guideLeft, guideRight, 'rgba(37, 99, 235, 0.5)', guideWidth, dash);
    drawWorldHLine(bounds.descender, guideLeft, guideRight, 'rgba(37, 99, 235, 0.5)', guideWidth, dash);
  }

  function tryCloseDraw(sx, sy, t) {
    if (hasLetterProject()) return false;
    const points = getActivePoints();
    if (points.length < 3) return false;
    const first = toCanvas(points[0].x, points[0].y, t);
    if (distSq(sx, sy, first.cx, first.cy) <= CLOSE_RADIUS * CLOSE_RADIUS) {
      closeActiveContour();
      return true;
    }
    return false;
  }

  function isEmptyCanvasHit(sx, sy, world, t) {
    const contours = getDisplayContours();
    if (hitTestContoursScreen(contours, sx, sy, t, POINT_HIT_RADIUS)) return false;
    if (hitTestContoursFill(contours, world.x, world.y) >= 0) return false;
    const { activeContourIndex } = getState();
    const activeDisplay = contours[activeContourIndex];
    if (activeDisplay?.points.length >= 2) {
      const seg = hitTestSegmentScreen(
        activeDisplay.points,
        sx,
        sy,
        t,
        SEGMENT_HIT_RADIUS,
        POINT_HIT_RADIUS,
        activeDisplay.closed
      );
      if (seg) return false;
    }
    return true;
  }

  function handlePointHit(contourIndex, pointIndex, e, sx, sy, world, t) {
    if (contourIndex !== getState().activeContourIndex) {
      setActiveContourIndex(contourIndex);
    }

    if (isMultiSelectMode()) {
      const wasSelected = getState().selectedIndices.includes(pointIndex);
      const additive = e.ctrlKey || e.metaKey;
      if (additive) {
        if (!wasSelected) selectPoint(pointIndex, { additive: true });
      } else if (!wasSelected) {
        selectPoint(pointIndex, { additive: false });
      }
      pendingPick = {
        contourIndex,
        pointIndex,
        world,
        t,
        startSx: sx,
        startSy: sy,
        toggleOff: additive && wasSelected,
      };
      return;
    }

    if (e.shiftKey) {
      selectPoint(pointIndex, { additive: true });
      canvas.releasePointerCapture(e.pointerId);
      activePointerId = null;
      draw();
      return;
    }

    pendingPick = { contourIndex, pointIndex, world, t, startSx: sx, startSy: sy };
  }

  function tryEraseAt(sx, sy, t) {
    const { activeContourIndex } = getState();
    const contours = getDisplayContours();
    const points = contours[activeContourIndex]?.points;
    if (!points) return;
    const index = hitTestPointScreen(points, sx, sy, t, ERASER_RADIUS);
    if (index < 0) return;
    erasePointAt(index, { skipCheckpoint: true });
  }

  function indicesInMarquee(contourIndex, t) {
    const contours = getDisplayContours();
    const points = contours[contourIndex]?.points ?? [];
    const x1 = Math.min(marquee.startSx, marquee.sx);
    const x2 = Math.max(marquee.startSx, marquee.sx);
    const y1 = Math.min(marquee.startSy, marquee.sy);
    const y2 = Math.max(marquee.startSy, marquee.sy);
    const indices = [];
    for (let i = 0; i < points.length; i++) {
      const p = toCanvas(points[i].x, points[i].y, t);
      if (p.cx >= x1 && p.cx <= x2 && p.cy >= y1 && p.cy <= y2) indices.push(i);
    }
    return indices;
  }

  function finishMarquee(t) {
    if (!marquee) return;
    const { activeContourIndex } = getState();
    const w = Math.abs(marquee.sx - marquee.startSx);
    const h = Math.abs(marquee.sy - marquee.startSy);
    if (w >= 4 || h >= 4) {
      selectPoints(indicesInMarquee(activeContourIndex, t), { additive: marquee.additive });
    } else if (!marquee.additive) {
      clearPointSelection();
      if (!isMultiSelectMode()) setSelectionMode('point');
    }
    marquee = null;
  }

  function resolvePendingPickDrag() {
    if (!pendingPick) return;
    const { contourIndex, pointIndex, world, t, startSx, startSy } = pendingPick;
    const { selectionMode, selectedIndices } = getState();
    let indices;
    if (selectionMode === 'layer') {
      indices = [pointIndex];
    } else if (selectionMode === 'multiselect') {
      indices = [...getState().selectedIndices];
      if (!indices.includes(pointIndex)) indices.push(pointIndex);
    } else if (selectedIndices.includes(pointIndex)) {
      indices = [...selectedIndices];
    } else {
      selectPoint(pointIndex);
      indices = [pointIndex];
    }
    startPointDrag(contourIndex, indices, world, t);
    pendingPick = null;
    canvas.style.cursor = 'grabbing';
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (activePointerId !== null) return;
    syncSize();
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    activePointerId = e.pointerId;

    const { activeContourIndex, selectionMode, editorTool } = getState();
    const contours = getDisplayContours();
    const { sx, sy, world } = getPointerPos(e);
    const t = computeTransform();

    if (editorTool === 'eraser') {
      saveCheckpoint();
      eraserStroke = true;
      tryEraseAt(sx, sy, t);
      canvas.style.cursor = 'crosshair';
      return;
    }

    if (editorTool === 'draw') {
      if (tryCloseDraw(sx, sy, t)) {
        canvas.releasePointerCapture(e.pointerId);
        activePointerId = null;
        draw();
        return;
      }
      addDrawPoint(world.x, world.y);
      canvas.releasePointerCapture(e.pointerId);
      activePointerId = null;
      draw();
      return;
    }

    if (selectionMode === 'layer' && editorTool === 'edit' && !isMultiSelectMode()) {
      const activePoints = contours[activeContourIndex]?.points ?? [];
      const handle = hitTestLayerHandle(sx, sy, activePoints, t, HANDLE_HIT_RADIUS);
      if (handle) {
        if (handle === 'rotate') {
          startRotateDrag(activeContourIndex, world, t);
        } else {
          startScaleDrag(activeContourIndex, handle, t);
        }
        canvas.style.cursor = HANDLE_CURSORS[handle];
        return;
      }
    }

    const activeDisplay = contours[activeContourIndex];
    if (editorTool === 'edit' && activeDisplay) {
      const activePoint = hitTestPointScreen(activeDisplay.points, sx, sy, t, POINT_HIT_RADIUS);
      if (activePoint >= 0) {
        handlePointHit(activeContourIndex, activePoint, e, sx, sy, world, t);
        return;
      }
    }

    if (editorTool === 'edit' && activeDisplay?.points.length >= 2 && !isMultiSelectMode()) {
      const seg = hitTestSegmentScreen(
        activeDisplay.points,
        sx,
        sy,
        t,
        SEGMENT_HIT_RADIUS,
        POINT_HIT_RADIUS,
        activeDisplay.closed
      );
      if (seg) {
        canvas.releasePointerCapture(e.pointerId);
        activePointerId = null;
        setActiveContourPoints(insertPoint(activeDisplay.points, seg.index, seg.point));
        if (selectionMode === 'point') selectPoint(seg.index + 1);
        draw();
        return;
      }
    }

    const hit = hitTestContoursScreen(contours, sx, sy, t, POINT_HIT_RADIUS);
    if (hit && (!isMultiSelectMode() || hit.contourIndex === activeContourIndex)) {
      handlePointHit(hit.contourIndex, hit.pointIndex, e, sx, sy, world, t);
      return;
    }

    if (
      selectionMode === 'layer'
      && !isMultiSelectMode()
      && activeDisplay
      && pointInBounds(world.x, world.y, getBounds(activeDisplay.points), 4)
    ) {
      startLayerDrag(activeContourIndex, world, t);
      canvas.style.cursor = 'grabbing';
      return;
    }

    const fillHit = hitTestContoursFill(contours, world.x, world.y);
    if (fillHit >= 0 && !isMultiSelectMode()) {
      if (fillHit !== activeContourIndex) setActiveContourIndex(fillHit);
      setSelectionMode('layer');
      startLayerDrag(fillHit, world, t);
      canvas.style.cursor = 'grabbing';
      return;
    }

    if (editorTool === 'edit' && (selectionMode === 'point' || isMultiSelectMode())) {
      if (!isMultiSelectMode()) setSelectionMode('point');
      marquee = {
        startSx: sx,
        startSy: sy,
        sx,
        sy,
        additive: isMultiSelectMode() && (e.ctrlKey || e.metaKey),
      };
      return;
    }

    canvas.releasePointerCapture(e.pointerId);
    activePointerId = null;
    setSelectionMode('layer');
  });

  canvas.addEventListener('pointermove', (e) => {
    const { editorTool } = getState();
    const contours = getDisplayContours();
    const { sx, sy, world } = getPointerPos(e);

    if (editorTool === 'draw' && !dragging) {
      hoverWorld = world;
      draw();
    }

    if (e.pointerId !== activePointerId && activePointerId !== null) return;

    if (editorTool === 'eraser' && eraserStroke) {
      tryEraseAt(sx, sy, computeTransform());
      draw();
      return;
    }

    if (pendingPick && !dragging) {
      if (distSq(sx, sy, pendingPick.startSx, pendingPick.startSy) > DRAG_THRESHOLD_SQ) {
        resolvePendingPickDrag();
      }
    }

    if (marquee) {
      marquee.sx = sx;
      marquee.sy = sy;
      draw();
      return;
    }

    if (dragging && dragMode === 'layer' && dragOriginPoints) {
      const dx = world.x - dragStartWorld.x;
      const dy = world.y - dragStartWorld.y;
      setContourPoints(dragContourIndex, translatePoints(dragOriginPoints, dx, dy));
      draw();
      return;
    }

    if (dragging && dragMode === 'rotate' && dragOriginPoints && dragRotateCenter) {
      const angle = Math.atan2(world.y - dragRotateCenter.y, world.x - dragRotateCenter.x);
      const delta = angle - dragRotateStartAngle;
      setContourPoints(
        dragContourIndex,
        rotatePointsAround(dragOriginPoints, dragRotateCenter, delta)
      );
      draw();
      return;
    }

    if (dragging && dragMode === 'scale' && dragOriginPoints && dragScaleHandle) {
      const { scaleX, scaleY } = computeScaleFromHandle(
        dragScaleHandle,
        dragScaleAnchor,
        dragScaleHandleStart,
        world,
        { uniform: !e.shiftKey }
      );
      setContourPoints(
        dragContourIndex,
        scalePointsFromAnchor(dragOriginPoints, dragScaleAnchor, scaleX, scaleY)
      );
      draw();
      return;
    }

    if (dragging && dragMode === 'points' && dragOriginPoints) {
      const dx = world.x - dragStartWorld.x;
      const dy = world.y - dragStartWorld.y;
      const newPoints = dragIndices.map((i) => ({
        x: dragOriginPoints[i].x + dx,
        y: dragOriginPoints[i].y + dy,
      }));
      updatePoints(dragIndices, newPoints);
      draw();
      return;
    }

    const { activeContourIndex, selectionMode } = getState();
    const t = computeTransform();
    if (editorTool === 'draw' || editorTool === 'eraser') {
      canvas.style.cursor = editorTool === 'eraser' ? 'cell' : 'crosshair';
    } else if (isMultiSelectMode()) {
      canvas.style.cursor = 'crosshair';
    } else if (selectionMode === 'layer') {
      const activePoints = contours[activeContourIndex]?.points ?? [];
      const handle = hitTestLayerHandle(sx, sy, activePoints, t, HANDLE_HIT_RADIUS);
      if (handle) {
        canvas.style.cursor = HANDLE_CURSORS[handle] || 'grab';
      } else if (hitTestContoursScreen(contours, sx, sy, t, POINT_HIT_RADIUS)) {
        canvas.style.cursor = 'grab';
      } else if (pointInBounds(world.x, world.y, getBounds(activePoints), 4)) {
        canvas.style.cursor = 'move';
      } else if (hitTestContoursFill(contours, world.x, world.y) >= 0) {
        canvas.style.cursor = 'grab';
      } else {
        canvas.style.cursor = 'crosshair';
      }
    } else if (hitTestContoursScreen(contours, sx, sy, t, POINT_HIT_RADIUS)) {
      canvas.style.cursor = 'grab';
    } else if (hitTestContoursFill(contours, world.x, world.y) >= 0) {
      canvas.style.cursor = 'grab';
    } else if (hitTestSegmentScreen(getActivePoints(), sx, sy, t, SEGMENT_HIT_RADIUS)) {
      canvas.style.cursor = 'pointer';
    } else {
      canvas.style.cursor = 'crosshair';
    }
  });

  function endPointer(e) {
    if (e.pointerId !== activePointerId) return;
    if (marquee) {
      finishMarquee(computeTransform());
    }
    if (pendingPick && !dragging) {
      if (pendingPick.toggleOff) {
        selectPoint(pendingPick.pointIndex, { additive: true });
      } else if (!isMultiSelectMode()) {
        selectPoint(pendingPick.pointIndex);
      }
      pendingPick = null;
    }
    eraserStroke = false;
    canvas.releasePointerCapture(e.pointerId);
    activePointerId = null;
    dragging = false;
    dragMode = null;
    dragIndices = [];
    dragContourIndex = -1;
    dragStartWorld = null;
    dragOriginPoints = null;
    dragScaleHandle = null;
    dragScaleAnchor = null;
    dragScaleHandleStart = null;
    dragRotateCenter = null;
    dragRotateStartAngle = null;
    dragTransform = null;
    flushRecompute();
    canvas.style.cursor = getState().editorTool === 'draw' ? 'crosshair' : 'crosshair';
    draw();
  }

  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  canvas.addEventListener('dblclick', (e) => {
    if (e.button !== 0) return;
    syncSize();
    const { sx, sy, world } = getPointerPos(e);
    const t = computeTransform();
    const { selectionMode, editorTool } = getState();
    if (editorTool !== 'edit' || selectionMode !== 'layer') return;
    if (!isEmptyCanvasHit(sx, sy, world, t)) return;
    setSelectionMode('point');
    draw();
  });

  const ro = new ResizeObserver(() => syncSize());
  ro.observe(canvasWrap);
  syncSize();

  return { draw, resize: syncSize };
}
