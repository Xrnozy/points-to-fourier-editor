import { advanceAnimation, getState } from './state.js';

export function startAnimationLoop(onFrame) {
  let last = performance.now();
  function tick(now) {
    const dt = now - last;
    last = now;
    if (getState().animation.playing) {
      advanceAnimation(dt);
      onFrame?.();
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
