import { getNotebookWritingBounds, LETTER_HEIGHT } from './letter-strokes.js';

const FONT_STACK = '"Playwrite US Trad", "Segoe Script", "Brush Script MT", cursive';
let fontReady = false;
let fontInitPromise = null;

export function initLetterGuideFont() {
  if (fontInitPromise) return fontInitPromise;
  fontInitPromise = document.fonts
    .load(`400 ${LETTER_HEIGHT}px ${FONT_STACK}`)
    .then(() => {
      fontReady = true;
      return true;
    })
    .catch(() => {
      fontReady = true;
      return false;
    });
  return fontInitPromise;
}

export function isLetterGuideFontReady() {
  return fontReady;
}

/** Faint letter template on the notebook (drawn under user strokes). */
export function drawLetterGhost(ctx, letter, transform, toCanvas, { darkBackground = false } = {}) {
  if (!letter) return;

  const bounds = getNotebookWritingBounds();
  const centerX = (bounds.left + bounds.right) / 2;
  const heightWorld = bounds.capHeight - bounds.descender;
  const fontPx = Math.max(16, heightWorld * transform.scale * 0.9);
  const baseline = toCanvas(centerX, bounds.baseline, transform);

  ctx.save();
  ctx.font = `400 ${fontPx}px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = darkBackground ? 'rgba(147, 197, 253, 0.1)' : 'rgba(37, 99, 235, 0.16)';
  ctx.strokeStyle = darkBackground ? 'rgba(147, 197, 253, 0.38)' : 'rgba(29, 78, 216, 0.42)';
  ctx.lineWidth = Math.max(1.2, 2.2 / transform.scale);
  ctx.fillText(letter, baseline.cx, baseline.cy);
  ctx.strokeText(letter, baseline.cx, baseline.cy);
  ctx.restore();
}
