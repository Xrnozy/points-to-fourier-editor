import { fitTransform, toCanvas, getBounds } from './geometry.js';
import { sampleReconstructed } from './fourier.js';
import { getAllBoundsPoints, getDisplayContours, getPreviewCoefficientSets } from './state.js';

const RECON_COLORS = [
  { fill: 'rgba(107, 144, 128, 0.18)', stroke: '#8fbf9f' },
  { fill: 'rgba(212, 168, 140, 0.16)', stroke: '#d4a88c' },
  { fill: 'rgba(158, 179, 168, 0.16)', stroke: '#9eb3a8' },
  { fill: 'rgba(196, 122, 106, 0.16)', stroke: '#c47a6a' },
];

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
    const coefficientSets = getPreviewCoefficientSets();
    const contours = getDisplayContours();

    ctx.clearRect(0, 0, viewW, viewH);
    ctx.fillStyle = '#13151a';
    ctx.fillRect(0, 0, viewW, viewH);

    if (coefficientSets.length === 0 || viewW < 1 || viewH < 1) return;

    const reconPaths = coefficientSets.map((coeffs) => sampleReconstructed(coeffs, 256));
    const allPts = [...getAllBoundsPoints(), ...reconPaths.flat()];
    transform = fitTransform(getBounds(allPts), viewW, viewH);

    for (const contour of contours) {
      if (contour.closed && contour.points.length >= 3) {
        drawPath(contour.points, {
          stroke: contour.groupType === 'separate'
            ? 'rgba(212, 168, 140, 0.35)'
            : 'rgba(139, 145, 156, 0.25)',
          lineWidth: 1,
          dashed: true,
        });
      }
    }

    reconPaths.forEach((reconPts, i) => {
      const colors = RECON_COLORS[i % RECON_COLORS.length];
      drawPath(reconPts, {
        fill: colors.fill,
        stroke: colors.stroke,
        lineWidth: 2.5,
      });
    });
  }

  const ro = new ResizeObserver(() => syncSize());
  ro.observe(canvasWrap);
  syncSize();

  return { draw, resize: syncSize };
}
