const DEFAULT_POINT_COUNT = 32;
const DEFAULT_RADIUS = 120;
const RESAMPLE_COUNT = 512;
const DEG = Math.PI / 180;

function mat3Multiply(a, b) {
  const out = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r][c] = a[r][0] * b[0][c] + a[r][1] * b[1][c] + a[r][2] * b[2][c];
    }
  }
  return out;
}

function rotationMatrixXYZ(rotDeg) {
  const ax = rotDeg.x * DEG;
  const ay = rotDeg.y * DEG;
  const az = rotDeg.z * DEG;
  const cx = Math.cos(ax);
  const sx = Math.sin(ax);
  const cy = Math.cos(ay);
  const sy = Math.sin(ay);
  const cz = Math.cos(az);
  const sz = Math.sin(az);
  const Rx = [[1, 0, 0], [0, cx, -sx], [0, sx, cx]];
  const Ry = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]];
  const Rz = [[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]];
  return mat3Multiply(Rz, mat3Multiply(Ry, Rx));
}

export function rotateDisplayPoint(p, rotDeg) {
  const m = rotationMatrixXYZ(rotDeg);
  const x = p.x;
  const y = p.y;
  return {
    x: m[0][0] * x + m[0][1] * y,
    y: m[1][0] * x + m[1][1] * y,
  };
}

export function displayToBasePoint(p, rotDeg) {
  const m = rotationMatrixXYZ(rotDeg);
  const m00 = m[0][0];
  const m01 = m[0][1];
  const m10 = m[1][0];
  const m11 = m[1][1];
  const det = m00 * m11 - m01 * m10;
  if (Math.abs(det) < 1e-9) return { x: p.x, y: p.y };
  return {
    x: (m11 * p.x - m01 * p.y) / det,
    y: (-m10 * p.x + m00 * p.y) / det,
  };
}

export function rotateContourPoints(points, rotDeg) {
  return points.map((p) => rotateDisplayPoint(p, rotDeg));
}

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

export function hitTestSegmentScreen(points, sx, sy, transform, threshold = 12, pointExclusion = 8, closed = true) {
  if (points.length < 2) return null;
  const t2 = threshold * threshold;
  let best = null;
  const segCount = closed ? points.length : points.length - 1;
  for (let i = 0; i < segCount; i++) {
    const j = closed ? (i + 1) % points.length : i + 1;
    const a = toCanvas(points[i].x, points[i].y, transform);
    const b = toCanvas(points[j].x, points[j].y, transform);
    const proj = projectOntoSegment(sx, sy, a.cx, a.cy, b.cx, b.cy);
    if (distSq(sx, sy, proj.x, proj.y) > t2) continue;
    const segLen = Math.hypot(b.cx - a.cx, b.cy - a.cy);
    const ex = Math.min(pointExclusion, segLen * 0.3);
    const ex2 = ex * ex;
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

export function boundsCenter(bounds) {
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };
}

export function getRotateHandle(bounds, offset = 32) {
  const cx = (bounds.minX + bounds.maxX) / 2;
  return { x: cx, y: bounds.maxY + offset };
}

export function boundsHandles(bounds) {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return {
    nw: { x: bounds.minX, y: bounds.maxY },
    ne: { x: bounds.maxX, y: bounds.maxY },
    se: { x: bounds.maxX, y: bounds.minY },
    sw: { x: bounds.minX, y: bounds.minY },
    n: { x: cx, y: bounds.maxY },
    s: { x: cx, y: bounds.minY },
    e: { x: bounds.maxX, y: cy },
    w: { x: bounds.minX, y: cy },
  };
}

export function rotatePointsAround(points, center, angleRad) {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return points.map((p) => {
    const dx = p.x - center.x;
    const dy = p.y - center.y;
    return {
      x: center.x + dx * cos - dy * sin,
      y: center.y + dx * sin + dy * cos,
    };
  });
}

const OPPOSITE_HANDLE = {
  nw: 'se',
  ne: 'sw',
  se: 'nw',
  sw: 'ne',
  n: 's',
  s: 'n',
  e: 'w',
  w: 'e',
};

export function getScaleAnchor(handle, bounds) {
  const handles = boundsHandles(bounds);
  return handles[OPPOSITE_HANDLE[handle]];
}

export function scalePointsFromAnchor(points, anchor, scaleX, scaleY) {
  const sx = scaleX;
  const sy = scaleY;
  return points.map((p) => ({
    x: anchor.x + (p.x - anchor.x) * sx,
    y: anchor.y + (p.y - anchor.y) * sy,
  }));
}

export function computeScaleFromHandle(handle, anchor, startHandle, world, { uniform = true } = {}) {
  const ox = startHandle.x - anchor.x;
  const oy = startHandle.y - anchor.y;
  const nx = world.x - anchor.x;
  const ny = world.y - anchor.y;
  const minScale = 0.05;

  const isCorner = handle === 'nw' || handle === 'ne' || handle === 'se' || handle === 'sw';
  if (isCorner) {
    const startDist = Math.hypot(ox, oy);
    const newDist = Math.hypot(nx, ny);
    const scale = startDist > 1e-6 ? Math.max(minScale, newDist / startDist) : 1;
    if (uniform) return { scaleX: scale, scaleY: scale };
    const scaleX = Math.abs(ox) > 1e-6 ? Math.max(minScale, nx / ox) : 1;
    const scaleY = Math.abs(oy) > 1e-6 ? Math.max(minScale, ny / oy) : 1;
    return { scaleX, scaleY };
  }

  if (handle === 'e' || handle === 'w') {
    const scaleX = Math.abs(ox) > 1e-6 ? Math.max(minScale, nx / ox) : 1;
    return { scaleX, scaleY: 1 };
  }

  const scaleY = Math.abs(oy) > 1e-6 ? Math.max(minScale, ny / oy) : 1;
  return { scaleX: 1, scaleY };
}

export function hitTestLayerHandle(sx, sy, points, transform, radius = 11) {
  if (points.length < 1) return null;
  const bounds = getBounds(points);
  const r2 = radius * radius;
  const rotate = getRotateHandle(bounds);
  const rotatePt = toCanvas(rotate.x, rotate.y, transform);
  if (distSq(sx, sy, rotatePt.cx, rotatePt.cy) <= r2) return 'rotate';

  const handles = boundsHandles(bounds);
  for (const [id, pt] of Object.entries(handles)) {
    const p = toCanvas(pt.x, pt.y, transform);
    if (distSq(sx, sy, p.cx, p.cy) <= r2) return id;
  }
  return null;
}

export function pointInBounds(x, y, bounds, pad = 0) {
  return (
    x >= bounds.minX - pad
    && x <= bounds.maxX + pad
    && y >= bounds.minY - pad
    && y <= bounds.maxY + pad
  );
}

export function insertPoint(points, index, point) {
  const next = points.slice();
  next.splice(index + 1, 0, point);
  return next;
}

export function closeOpenStrokeForFourier(points) {
  if (points.length < 2) return points;
  const bounds = getBounds(points);
  const pad = Math.max(12, (bounds.maxY - bounds.minY) * 0.08);
  const bridgeY = bounds.minY - pad;
  const start = points[0];
  const end = points[points.length - 1];
  return [
    ...points,
    { x: end.x, y: bridgeY },
    { x: start.x, y: bridgeY },
    { x: start.x, y: start.y },
  ];
}

export function arcLengthResample(points, sampleCount = RESAMPLE_COUNT, closed = true) {
  if (points.length < 2) return points.map((p) => ({ x: p.x, y: p.y }));

  const n = points.length;
  const segCount = closed ? n : n - 1;
  const segLens = [];
  let total = 0;
  for (let i = 0; i < segCount; i++) {
    const a = points[i];
    const b = points[closed ? (i + 1) % n : i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    segLens.push(len);
    total += len;
  }

  if (total === 0) return Array.from({ length: sampleCount }, () => ({ x: points[0].x, y: points[0].y }));

  const result = [];
  for (let s = 0; s < sampleCount; s++) {
    const target = (s / sampleCount) * total;
    let acc = 0;
    for (let i = 0; i < segCount; i++) {
      if (acc + segLens[i] >= target || i === segCount - 1) {
        const segT = segLens[i] > 0 ? (target - acc) / segLens[i] : 0;
        const a = points[i];
        const b = points[closed ? (i + 1) % n : i + 1];
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
  if (!points.length) {
    const pad = 120;
    return { minX: -pad, maxX: pad, minY: -pad, maxY: pad, w: pad * 2, h: pad * 2 };
  }
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
