import {
  hitTestPointScreen,
  hitTestSegmentScreen,
  hitTestContoursScreen,
  hitTestContoursFill,
  insertPoint,
  getBounds,
  fitTransform,
  toCanvas,
  fromCanvas,
  translatePoints,
} from './geometry.js';
import {
  getState,
  getActivePoints,
  getAllBoundsPoints,
  setActiveContourPoints,
  setSelectedIndex,
  setActiveContourIndex,
  setSelectionMode,
  updatePoint,
  setContourPoints,
  flushRecompute,
} from './state.js';

const POINT_HIT_RADIUS = 16;
const SEGMENT_HIT_RADIUS = 12;

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
  let dragIndex = -1;
  let dragContourIndex = -1;
  let dragStartWorld = null;
  let dragOriginPoints = null;
  let activePointerId = null;
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
    draw();
  }

  function computeTransform() {
    return fitTransform(getBounds(getAllBoundsPoints()), viewW, viewH);
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

  function drawContour(points, ci, activeContourIndex, selectedIndex, selectionMode) {
    const colors = CONTOUR_COLORS[ci % CONTOUR_COLORS.length];
    const isActive = ci === activeContourIndex;
    const layerSelected = isActive && selectionMode === 'layer';

    ctx.beginPath();
    const first = toCanvas(points[0].x, points[0].y, transform);
    ctx.moveTo(first.cx, first.cy);
    for (let i = 1; i < points.length; i++) {
      const p = toCanvas(points[i].x, points[i].y, transform);
      ctx.lineTo(p.cx, p.cy);
    }
    ctx.closePath();
    ctx.fillStyle = colors.fill;
    ctx.fill();
    ctx.strokeStyle = layerSelected ? '#d4a88c' : isActive ? colors.stroke : 'rgba(139, 145, 156, 0.45)';
    ctx.lineWidth = layerSelected ? 2 : isActive ? 1.5 : 1;
    ctx.setLineDash(isActive ? [] : [4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    if (layerSelected) {
      const bounds = getBounds(points);
      const tl = toCanvas(bounds.minX, bounds.maxY, transform);
      const br = toCanvas(bounds.maxX, bounds.minY, transform);
      ctx.strokeStyle = 'rgba(212, 168, 140, 0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(tl.cx, tl.cy, br.cx - tl.cx, br.cy - tl.cy);
      ctx.setLineDash([]);
    }

    for (let i = 0; i < points.length; i++) {
      const p = toCanvas(points[i].x, points[i].y, transform);
      const pointSelected = isActive && selectionMode === 'point' && i === selectedIndex;
      const showPoint = isActive && (layerSelected || pointSelected);

      if (!showPoint && !isActive) {
        ctx.beginPath();
        ctx.arc(p.cx, p.cy, 4, 0, Math.PI * 2);
        ctx.fillStyle = colors.point;
        ctx.fill();
        continue;
      }

      ctx.beginPath();
      ctx.arc(p.cx, p.cy, pointSelected ? 8 : layerSelected ? 5 : 6, 0, Math.PI * 2);
      ctx.fillStyle = pointSelected ? '#d4a88c' : layerSelected ? '#e8d4c4' : colors.point;
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

  function draw() {
    const { contours, activeContourIndex, selectedIndex, selectionMode } = getState();

    ctx.clearRect(0, 0, viewW, viewH);
    ctx.fillStyle = '#13151a';
    ctx.fillRect(0, 0, viewW, viewH);

    if (contours.length < 1 || viewW < 1 || viewH < 1) return;

    transform = getActiveTransform();

    for (let ci = 0; ci < contours.length; ci++) {
      drawContour(contours[ci].points, ci, activeContourIndex, selectedIndex, selectionMode);
    }
  }

  function startLayerDrag(contourIndex, world) {
    const { contours } = getState();
    dragging = true;
    dragMode = 'layer';
    dragContourIndex = contourIndex;
    dragStartWorld = { x: world.x, y: world.y };
    dragOriginPoints = contours[contourIndex].points.map((p) => ({ ...p }));
    return true;
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (activePointerId !== null) return;
    syncSize();
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    activePointerId = e.pointerId;

    const { contours, activeContourIndex, selectionMode } = getState();
    const { sx, sy, world } = getPointerPos(e);
    const t = computeTransform();

    const hit = hitTestContoursScreen(contours, sx, sy, t, POINT_HIT_RADIUS);
    if (hit) {
      if (hit.contourIndex !== activeContourIndex) {
        setActiveContourIndex(hit.contourIndex);
      }
      dragging = true;
      dragMode = 'point';
      dragIndex = hit.pointIndex;
      dragContourIndex = hit.contourIndex;
      dragTransform = t;
      transform = t;
      setSelectedIndex(hit.pointIndex);
      canvas.style.cursor = 'grabbing';
      return;
    }

    const activePoints = getActivePoints();
    if (selectionMode === 'point') {
      const seg = hitTestSegmentScreen(activePoints, sx, sy, t, SEGMENT_HIT_RADIUS);
      if (seg) {
        canvas.releasePointerCapture(e.pointerId);
        activePointerId = null;
        setActiveContourPoints(insertPoint(activePoints, seg.index, seg.point));
        setSelectedIndex(seg.index + 1);
        return;
      }
    }

    const fillHit = hitTestContoursFill(contours, world.x, world.y);
    if (fillHit >= 0) {
      if (fillHit !== activeContourIndex) setActiveContourIndex(fillHit);
      setSelectionMode('layer');
      dragTransform = t;
      transform = t;
      startLayerDrag(fillHit, world);
      canvas.style.cursor = 'grabbing';
      return;
    }

    canvas.releasePointerCapture(e.pointerId);
    activePointerId = null;
    setSelectionMode('layer');
  });

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== activePointerId && activePointerId !== null) return;

    const { contours, activeContourIndex, selectionMode } = getState();
    const { sx, sy, world } = getPointerPos(e);

    if (dragging && dragMode === 'layer' && dragOriginPoints) {
      const dx = world.x - dragStartWorld.x;
      const dy = world.y - dragStartWorld.y;
      setContourPoints(dragContourIndex, translatePoints(dragOriginPoints, dx, dy));
      draw();
      return;
    }

    if (dragging && dragMode === 'point' && dragIndex >= 0) {
      updatePoint(dragIndex, world.x, world.y);
      draw();
      return;
    }

    const t = computeTransform();
    if (hitTestContoursScreen(contours, sx, sy, t, POINT_HIT_RADIUS)) {
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
    canvas.releasePointerCapture(e.pointerId);
    activePointerId = null;
    dragging = false;
    dragMode = null;
    dragIndex = -1;
    dragContourIndex = -1;
    dragStartWorld = null;
    dragOriginPoints = null;
    dragTransform = null;
    flushRecompute();
    canvas.style.cursor = 'crosshair';
    draw();
  }

  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  const ro = new ResizeObserver(() => syncSize());
  ro.observe(canvasWrap);
  syncSize();

  return { draw, resize: syncSize };
}
