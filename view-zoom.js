import { fromCanvas, getBounds, fitTransform } from './geometry.js';

const MIN_SCALE = 0.02;
const MAX_SCALE = 500;
const ZOOM_FACTOR = 1.12;

export function attachCanvasZoom(canvas, { getFitPoints, getViewSize, onZoom }) {
  let scale = 1;
  let worldCenter = { x: 0, y: 0 };
  let hasFitted = false;

  function getTransform() {
    const { w, h } = getViewSize();
    return {
      scale,
      offsetX: w / 2 - worldCenter.x * scale,
      offsetY: h / 2 + worldCenter.y * scale,
    };
  }

  function fitToContent() {
    const { w, h } = getViewSize();
    if (w < 1 || h < 1) return;
    const points = getFitPoints();
    const bounds = getBounds(points.length ? points : [{ x: 0, y: 0 }]);
    const fit = fitTransform(bounds, w, h);
    scale = fit.scale;
    worldCenter = {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2,
    };
    hasFitted = true;
    onZoom();
  }

  function ensureFitted() {
    if (!hasFitted) fitToContent();
  }

  let panPointerId = null;
  let panStart = null;

  function canvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { sx: e.clientX - rect.left, sy: e.clientY - rect.top };
  }

  function endPan(e) {
    if (panPointerId === null || e.pointerId !== panPointerId) return;
    canvas.releasePointerCapture(e.pointerId);
    panPointerId = null;
    panStart = null;
    canvas.style.cursor = '';
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 1) return;
    e.preventDefault();
    ensureFitted();
    canvas.setPointerCapture(e.pointerId);
    panPointerId = e.pointerId;
    const { sx, sy } = canvasPos(e);
    panStart = { sx, sy, worldCenter: { x: worldCenter.x, y: worldCenter.y } };
    canvas.style.cursor = 'grabbing';
  });

  canvas.addEventListener('pointermove', (e) => {
    if (panPointerId === null || e.pointerId !== panPointerId || !panStart) return;
    const { sx, sy } = canvasPos(e);
    const dx = sx - panStart.sx;
    const dy = sy - panStart.sy;
    worldCenter = {
      x: panStart.worldCenter.x - dx / scale,
      y: panStart.worldCenter.y + dy / scale,
    };
    onZoom();
  });

  canvas.addEventListener('pointerup', endPan);
  canvas.addEventListener('pointercancel', endPan);
  canvas.addEventListener('auxclick', (e) => {
    if (e.button === 1) e.preventDefault();
  });

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      ensureFitted();
      const { w, h } = getViewSize();
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const world = fromCanvas(sx, sy, getTransform());
      const factor = e.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor));
      worldCenter = {
        x: world.x - (sx - w / 2) / newScale,
        y: world.y + (sy - h / 2) / newScale,
      };
      scale = newScale;
      onZoom();
    },
    { passive: false }
  );

  return { getTransform, fitToContent, ensureFitted };
}

export function addFitViewButton(canvas, onFit) {
  const head = canvas.closest('.panel')?.querySelector('.panel-head');
  if (!head || head.querySelector('.fit-view-btn')) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'fit-view-btn';
  btn.textContent = 'Fit';
  btn.title = 'Fit to screen (scroll zoom, middle-drag pan)';
  btn.addEventListener('click', onFit);
  head.appendChild(btn);
}
