const DEFAULT_POINT_COUNT = 32;
const DEFAULT_RADIUS = 120;
const RESAMPLE_COUNT = 512;

export function createDefaultCircle(count = DEFAULT_POINT_COUNT, radius = DEFAULT_RADIUS) {
  const points = [];
  for (let i = 0; i < count; i++) {
    const angle = (2 * Math.PI * i) / count;
    points.push({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) });
  }
  return points;
}

export function createInnerShape(count = 12, radius = 45) {
  return createDefaultCircle(count, radius);
}

export function stitchContours(contourPointArrays) {
  const valid = contourPointArrays.filter((c) => c.length >= 3);
  if (valid.length === 0) return [];
  if (valid.length === 1) return [...valid[0]];

  const path = [...valid[0]];
  for (let i = 1; i < valid.length; i++) {
    const inner = valid[i];
    path.push({ ...inner[0] });
    for (let j = 1; j < inner.length; j++) path.push({ ...inner[j] });
    path.push({ ...inner[0] });
    path.push({ ...path[0] });
  }
  return path;
}

export function hitTestContoursScreen(contours, sx, sy, transform, radius = 14) {
  for (let ci = contours.length - 1; ci >= 0; ci--) {
    const hit = hitTestPointScreen(contours[ci].points, sx, sy, transform, radius);
    if (hit >= 0) return { contourIndex: ci, pointIndex: hit };
  }
  return null;
}

export function hitTestContoursFill(contours, x, y) {
  for (let ci = contours.length - 1; ci >= 0; ci--) {
    if (pointInPolygon(x, y, contours[ci].points)) return ci;
  }
  return -1;
}

export function distSq(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function hitTestPoint(points, mx, my, radius = 8) {
  const r2 = radius * radius;
  for (let i = points.length - 1; i >= 0; i--) {
    if (distSq(points[i].x, points[i].y, mx, my) <= r2) return i;
  }
  return -1;
}

export function hitTestPointScreen(points, sx, sy, transform, radius = 14) {
  const r2 = radius * radius;
  for (let i = points.length - 1; i >= 0; i--) {
    const p = toCanvas(points[i].x, points[i].y, transform);
    if (distSq(sx, sy, p.cx, p.cy) <= r2) return i;
  }
  return -1;
}

export function projectOntoSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { x: ax, y: ay, t: 0 };
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return { x: ax + t * dx, y: ay + t * dy, t };
}

export function hitTestSegment(points, mx, my, threshold = 6) {
  const t2 = threshold * threshold;
  let best = null;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const proj = projectOntoSegment(mx, my, a.x, a.y, b.x, b.y);
    if (distSq(mx, my, proj.x, proj.y) <= t2) {
      const d = distSq(mx, my, proj.x, proj.y);
      if (!best || d < best.d) best = { index: i, point: { x: proj.x, y: proj.y }, d };
    }
  }
  return best;
}

export function hitTestSegmentScreen(points, sx, sy, transform, threshold = 12, pointExclusion = 16) {
  const t2 = threshold * threshold;
  const ex2 = pointExclusion * pointExclusion;
  let best = null;
  for (let i = 0; i < points.length; i++) {
    const a = toCanvas(points[i].x, points[i].y, transform);
    const b = toCanvas(points[(i + 1) % points.length].x, points[(i + 1) % points.length].y, transform);
    const proj = projectOntoSegment(sx, sy, a.cx, a.cy, b.cx, b.cy);
    if (distSq(sx, sy, proj.x, proj.y) > t2) continue;
    if (distSq(sx, sy, a.cx, a.cy) <= ex2 || distSq(sx, sy, b.cx, b.cy) <= ex2) continue;
    const d = distSq(sx, sy, proj.x, proj.y);
    if (!best || d < best.d) {
      best = { index: i, point: fromCanvas(proj.x, proj.y, transform), d };
    }
  }
  return best;
}

export function boundsFromCoefficients(coeffs, pad = 30) {
  const maxR = coeffs.reduce((s, c) => s + c.amplitude, 0) || DEFAULT_RADIUS;
  const extent = maxR + pad;
  return { minX: -extent, maxX: extent, minY: -extent, maxY: extent, w: extent * 2, h: extent * 2 };
}

export function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x;
    const yi = points[i].y;
    const xj = points[j].x;
    const yj = points[j].y;
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function translatePoints(points, dx, dy) {
  return points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

export function insertPoint(points, index, point) {
  const next = points.slice();
  next.splice(index + 1, 0, point);
  return next;
}

export function arcLengthResample(points, sampleCount = RESAMPLE_COUNT) {
  if (points.length < 2) return points.map((p) => ({ x: p.x, y: p.y }));

  const n = points.length;
  const segLens = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    segLens.push(len);
    total += len;
  }

  if (total === 0) return Array.from({ length: sampleCount }, () => ({ x: points[0].x, y: points[0].y }));

  const result = [];
  for (let s = 0; s < sampleCount; s++) {
    const target = (s / sampleCount) * total;
    let acc = 0;
    for (let i = 0; i < n; i++) {
      if (acc + segLens[i] >= target || i === n - 1) {
        const segT = segLens[i] > 0 ? (target - acc) / segLens[i] : 0;
        const a = points[i];
        const b = points[(i + 1) % n];
        result.push({
          x: a.x + (b.x - a.x) * segT,
          y: a.y + (b.y - a.y) * segT,
        });
        break;
      }
      acc += segLens[i];
    }
  }
  return result;
}

export function getBounds(points) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const pad = 20;
  const w = maxX - minX || 1;
  const h = maxY - minY || 1;
  return { minX: minX - pad, maxX: maxX + pad, minY: minY - pad, maxY: maxY + pad, w, h };
}

export function fitTransform(bounds, canvasW, canvasH) {
  const scale = Math.min(canvasW / bounds.w, canvasH / bounds.h) * 0.9;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return {
    scale,
    offsetX: canvasW / 2 - cx * scale,
    offsetY: canvasH / 2 + cy * scale,
  };
}

export function toCanvas(x, y, t) {
  return { cx: x * t.scale + t.offsetX, cy: t.offsetY - y * t.scale };
}

export function fromCanvas(cx, cy, t) {
  return {
    x: (cx - t.offsetX) / t.scale,
    y: (t.offsetY - cy) / t.scale,
  };
}
