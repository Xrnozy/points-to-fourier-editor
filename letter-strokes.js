/** Notebook layout + optional stroke hints (draw from scratch). */

export const LETTER_HEIGHT = 220;
export const NOTEBOOK_LINE_SPACING = 28;
export const NOTEBOOK_MARGIN_X = -140;

const STROKE_COUNTS = {
  a: 1, b: 2, c: 1, d: 2, e: 1, f: 2, g: 2, h: 2, i: 2, j: 2, k: 3, l: 1, m: 3,
  n: 2, o: 1, p: 2, q: 2, r: 2, s: 1, t: 2, u: 2, v: 1, w: 1, x: 2, y: 2, z: 1,
};

const STROKE_HINTS = {
  a: ['Oval on the line, then a downstroke on the right.'],
  b: ['Tall line up and down on the left.', 'Loop from the middle line around to the right.'],
  c: ['Curve from the right, around left, back toward the right — do not close the loop.'],
  d: ['Loop on the right like a.', 'Tall line up on the right side.'],
  e: ['Small loop starting left, across and back — like a sideways ribbon.'],
  f: ['Cross the top line, loop down past the baseline.', 'Small crossbar in the middle.'],
  g: ['Round shape like a.', 'Tail below the baseline curling left.'],
  h: ['Tall line up on the left.', 'Hump from the middle line to the right.'],
  i: ['Dot above the line.', 'Short line down from the top line.'],
  j: ['Dot above the line.', 'Line down with a loop below the baseline.'],
  k: ['Tall line on the left.', 'Diagonal from middle to lower right.', 'Diagonal from middle to upper right.'],
  l: ['One stroke up, then a small loop at the bottom right.'],
  m: ['Tall line on the left.', 'First hump to the right.', 'Second hump to the right.'],
  n: ['Tall line on the left.', 'One hump over to the right.'],
  o: ['Round oval sitting on the baseline.'],
  p: ['Line down below the baseline on the left.', 'Loop on the right like o.'],
  q: ['Round shape like o.', 'Line down below the baseline on the right.'],
  r: ['Tall line on the left.', 'Small bump from the middle line to the right.'],
  s: ['S-curve between the lines.'],
  t: ['Crossbar across the middle.', 'Line down with a curl below the baseline.'],
  u: ['Down, curve along the baseline, up on the right.'],
  v: ['Down to the baseline, up on the right — one continuous stroke.'],
  w: ['Down-up-down-up in one flowing stroke.'],
  x: ['First diagonal down.', 'Second diagonal crossing the first.'],
  y: ['Down to the baseline and up, then tail below the line.'],
  z: ['Zig across the top, slant down, loop along the bottom.'],
};

export function getLetterStrokePlan(letter, strokeCountOverride = null) {
  const key = letter.toLowerCase();
  const defaultCount = STROKE_COUNTS[key] ?? 1;
  const strokeCount = strokeCountOverride != null
    ? Math.max(1, Math.min(6, strokeCountOverride))
    : defaultCount;
  const hints = STROKE_HINTS[key] ?? [];
  return {
    strokeCount,
    getHint(index) {
      return hints[index] ?? `Draw stroke ${index + 1} for “${letter}” between the guidelines.`;
    },
  };
}

export function getNotebookWritingBounds() {
  const baseline = -LETTER_HEIGHT * 0.08;
  const top = baseline + LETTER_HEIGHT * 0.82;
  const bottom = baseline - LETTER_HEIGHT * 0.38;
  return {
    left: NOTEBOOK_MARGIN_X + 24,
    right: 120,
    baseline,
    xHeight: baseline + LETTER_HEIGHT * 0.42,
    capHeight: top,
    descender: bottom,
    marginX: NOTEBOOK_MARGIN_X,
    lineSpacing: NOTEBOOK_LINE_SPACING,
  };
}

/** Corner points for camera fit so guidelines stay in view. */
export function getNotebookFitPoints() {
  const b = getNotebookWritingBounds();
  return [
    { x: b.left, y: b.descender },
    { x: b.right, y: b.capHeight },
    { x: b.marginX, y: b.baseline },
    { x: (b.left + b.right) / 2, y: b.xHeight },
  ];
}
