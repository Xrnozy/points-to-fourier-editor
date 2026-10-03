import { fitTransform, toCanvas, getBounds } from './geometry.js';
import { sampleReconstructed } from './fourier.js';
import { getState, getAllBoundsPoints } from './state.js';

export function initEpicycleCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  let transform = null;
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

  function drawPath(points, { fill, stroke, lineWidth, dashed = false }) {
    if (points.length < 2) return;
    ctx.beginPath();
    const fp = toCanvas(points[0].x, points[0].y, transform);
    ctx.moveTo(fp.cx, fp.cy);
    for (let i = 1; i < points.length; i++) {
      const p = toCanvas(points[i].x, points[i].y, transform);
      ctx.lineTo(p.cx, p.cy);
    }
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      if (dashed) ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function draw() {
    const { contours, activeCoefficients } = getState();

    ctx.clearRect(0, 0, viewW, viewH);
    ctx.fillStyle = '#13151a';
    ctx.fillRect(0, 0, viewW, viewH);

    if (activeCoefficients.length === 0 || viewW < 1 || viewH < 1) return;

    const reconPts = sampleReconstructed(activeCoefficients, 256);
    transform = fitTransform(getBounds([...getAllBoundsPoints(), ...reconPts]), viewW, viewH);

    for (const contour of contours) {
      drawPath(contour.points, {
        stroke: 'rgba(139, 145, 156, 0.25)',
        lineWidth: 1,
        dashed: true,
      });
    }

    drawPath(reconPts, {
      fill: 'rgba(107, 144, 128, 0.18)',
      stroke: '#8fbf9f',
      lineWidth: 2.5,
    });
  }

  const ro = new ResizeObserver(() => syncSize());
  ro.observe(canvasWrap);
  syncSize();

  return { draw, resize: syncSize };
}
