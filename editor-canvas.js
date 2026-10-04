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
  fitTransform,
  toCanvas,
  fromCanvas,
  translatePoints,
  distSq,
} from './geometry.js';
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
  setActiveContourIndex,
  setSelectionMode,
  updatePoint,
  updatePoints,
  setContourPoints,
  flushRecompute,
  addDrawPoint,
  closeActiveContour,
  saveCheckpoint,
} from './state.js';

const POINT_HIT_RADIUS = 16;
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

  function getTransformPoints() {
    const { editorTool } = getState();
    const contours = getDisplayContours();
    if (editorTool === 'draw') {
      const closed = contours.flatMap((c) => (c.closed && c.points.length >= 3 ? c.points : []));
      return closed.length > 0 ? closed : [];
    }
    return getAllBoundsPoints();
  }

  function computeTransform() {
    return fitTransform(getBounds(getTransformPoints()), viewW, viewH);
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
    const colors = CONTOUR_COLORS[ci % CONTOUR_COLORS.length];
    const isActive = ci === activeContourIndex;
    const layerSelected = isActive && selectionMode === 'layer';

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
      const pointSelected = isActive && selectionMode === 'point' && selectedIndices.includes(i);
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

    ctx.clearRect(0, 0, viewW, viewH);
    ctx.fillStyle = '#13151a';
    ctx.fillRect(0, 0, viewW, viewH);

    if (contours.length < 1 || viewW < 1 || viewH < 1) return;

    transform = getActiveTransform();

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

    if (editorTool === 'draw' && getActiveContour().points.length === 0) {
      ctx.fillStyle = 'rgba(139, 145, 156, 0.5)';
      ctx.font = '13px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Click to place points · Click first point to close', viewW / 2, viewH / 2);
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

  function tryCloseDraw(sx, sy, t) {
    const points = getActivePoints();
    if (points.length < 3) return false;
    const first = toCanvas(points[0].x, points[0].y, t);
    if (distSq(sx, sy, first.cx, first.cy) <= CLOSE_RADIUS * CLOSE_RADIUS) {
      closeActiveContour();
      return true;
    }
    return false;
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (activePointerId !== null) return;
    syncSize();
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    activePointerId = e.pointerId;

    const { activeContourIndex, selectionMode, editorTool } = getState();
    const contours = getDisplayContours();
    const { sx, sy, world } = getPointerPos(e);
    const t = computeTransform();

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

    if (selectionMode === 'layer' && editorTool === 'edit') {
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

    const hit = hitTestContoursScreen(contours, sx, sy, t, POINT_HIT_RADIUS);
    if (hit) {
      if (hit.contourIndex !== activeContourIndex) {
        setActiveContourIndex(hit.contourIndex);
      }

      if (selectionMode === 'layer' && !e.shiftKey) {
        startPointDrag(hit.contourIndex, [hit.pointIndex], world, t);
        canvas.style.cursor = 'grabbing';
        return;
      }

      if (e.shiftKey) {
        selectPoint(hit.pointIndex, { additive: true });
        canvas.releasePointerCapture(e.pointerId);
        activePointerId = null;
        draw();
        return;
      }

      if (!getState().selectedIndices.includes(hit.pointIndex)) {
        selectPoint(hit.pointIndex);
      }
      startPointDrag(hit.contourIndex, [...getState().selectedIndices], world, t);
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
        selectPoint(seg.index + 1);
        return;
      }
    }

    const activeDisplay = contours[activeContourIndex];
    if (
      selectionMode === 'layer'
      && activeDisplay
      && pointInBounds(world.x, world.y, getBounds(activeDisplay.points), 4)
    ) {
      startLayerDrag(activeContourIndex, world, t);
      canvas.style.cursor = 'grabbing';
      return;
    }

    const fillHit = hitTestContoursFill(contours, world.x, world.y);
    if (fillHit >= 0) {
      if (fillHit !== activeContourIndex) setActiveContourIndex(fillHit);
      setSelectionMode('layer');
      startLayerDrag(fillHit, world, t);
      canvas.style.cursor = 'grabbing';
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
    if (editorTool === 'draw') {
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

  const ro = new ResizeObserver(() => syncSize());
  ro.observe(canvasWrap);
  syncSize();

  return { draw, resize: syncSize };
}
