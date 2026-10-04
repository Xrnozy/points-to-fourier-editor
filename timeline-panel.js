import {
  getState,
  goToFrame,
  addAnimationFrame,
  duplicateAnimationFrame,
  deleteAnimationFrame,
  moveAnimationFrame,
  setAnimationPlaying,
  setPlayhead,
  setAnimationFps,
  setOnionSkin,
} from './state.js';

export function initTimelinePanel(container) {
  container.innerHTML = `
    <div class="timeline-pane">
      <div class="timeline-toolbar">
        <div class="timeline-transport">
          <button type="button" id="anim-to-start" title="First frame">⏮</button>
          <button type="button" id="anim-play" title="Play / Pause">▶</button>
          <button type="button" id="anim-to-end" title="Last frame">⏭</button>
        </div>
        <div class="timeline-frame-actions">
          <button type="button" id="anim-add-frame">+ Keyframe</button>
          <button type="button" id="anim-dup-frame">Duplicate</button>
          <button type="button" id="anim-del-frame" class="danger">Delete</button>
        </div>
        <div class="timeline-settings">
          <label class="timeline-fps">
            FPS
            <input type="range" id="anim-fps" min="1" max="30" value="8">
            <span id="anim-fps-value">8</span>
          </label>
          <label class="timeline-onion-toggle">
            <input type="checkbox" id="anim-onion" checked>
            Onion skin
          </label>
          <label class="timeline-onion-range">
            ±
            <input type="range" id="anim-onion-range" min="1" max="3" value="1">
            <span id="anim-onion-value">1</span>
          </label>
        </div>
        <div class="timeline-readout" id="anim-readout">Frame 1 / 1</div>
      </div>
      <div class="timeline-track-wrap">
        <input type="range" id="anim-scrub" class="timeline-scrub" min="0" max="0" step="0.01" value="0">
        <div class="timeline-frames" id="timeline-frames"></div>
        <p class="timeline-hint">Each keyframe has its own layers · Click K1/K2 to switch · Scrub/play to morph</p>
      </div>
    </div>
  `;

  const playBtn = container.querySelector('#anim-play');
  const toStartBtn = container.querySelector('#anim-to-start');
  const toEndBtn = container.querySelector('#anim-to-end');
  const addBtn = container.querySelector('#anim-add-frame');
  const dupBtn = container.querySelector('#anim-dup-frame');
  const delBtn = container.querySelector('#anim-del-frame');
  const fpsSlider = container.querySelector('#anim-fps');
  const fpsValue = container.querySelector('#anim-fps-value');
  const onionCheck = container.querySelector('#anim-onion');
  const onionRange = container.querySelector('#anim-onion-range');
  const onionValue = container.querySelector('#anim-onion-value');
  const scrub = container.querySelector('#anim-scrub');
  const framesEl = container.querySelector('#timeline-frames');
  const readout = container.querySelector('#anim-readout');

  let dragFrameIndex = null;
  let suppressClick = false;

  playBtn.addEventListener('click', () => {
    const { animation } = getState();
    setAnimationPlaying(!animation.playing);
  });

  toStartBtn.addEventListener('click', () => {
    setAnimationPlaying(false);
    goToFrame(0);
  });

  toEndBtn.addEventListener('click', () => {
    const { animation } = getState();
    setAnimationPlaying(false);
    goToFrame(animation.frames.length - 1);
  });

  addBtn.addEventListener('click', () => addAnimationFrame());
  dupBtn.addEventListener('click', () => duplicateAnimationFrame());
  delBtn.addEventListener('click', () => deleteAnimationFrame());

  fpsSlider.addEventListener('input', () => {
    const fps = parseInt(fpsSlider.value, 10);
    fpsValue.textContent = fps;
    setAnimationFps(fps);
  });

  onionCheck.addEventListener('change', () => {
    setOnionSkin({ enabled: onionCheck.checked, span: parseInt(onionRange.value, 10) });
  });

  onionRange.addEventListener('input', () => {
    onionValue.textContent = onionRange.value;
    setOnionSkin({ enabled: onionCheck.checked, span: parseInt(onionRange.value, 10) });
  });

  scrub.addEventListener('input', () => {
    setPlayhead(parseFloat(scrub.value), { previewOnly: true });
  });

  scrub.addEventListener('change', () => {
    const idx = Math.round(parseFloat(scrub.value));
    goToFrame(idx);
  });

  framesEl.addEventListener('click', (e) => {
    if (suppressClick) return;
    const cell = e.target.closest('.timeline-frame');
    if (!cell) return;
    setAnimationPlaying(false);
    goToFrame(parseInt(cell.dataset.index, 10));
  });

  framesEl.addEventListener('dragstart', (e) => {
    const cell = e.target.closest('.timeline-frame');
    if (!cell) return;
    dragFrameIndex = parseInt(cell.dataset.index, 10);
    cell.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(dragFrameIndex));
  });

  framesEl.addEventListener('dragend', (e) => {
    const cell = e.target.closest('.timeline-frame');
    if (cell) cell.classList.remove('dragging');
    dragFrameIndex = null;
    framesEl.querySelectorAll('.timeline-frame.drop-target').forEach((el) => {
      el.classList.remove('drop-target');
    });
  });

  framesEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const cell = e.target.closest('.timeline-frame');
    framesEl.querySelectorAll('.timeline-frame.drop-target').forEach((el) => {
      el.classList.remove('drop-target');
    });
    if (cell) cell.classList.add('drop-target');
  });

  framesEl.addEventListener('dragleave', (e) => {
    const cell = e.target.closest('.timeline-frame');
    if (cell) cell.classList.remove('drop-target');
  });

  framesEl.addEventListener('drop', (e) => {
    e.preventDefault();
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
    const cell = e.target.closest('.timeline-frame');
    if (!cell || dragFrameIndex === null) return;
    const toIndex = parseInt(cell.dataset.index, 10);
    setAnimationPlaying(false);
    moveAnimationFrame(dragFrameIndex, toIndex);
    cell.classList.remove('drop-target');
  });

  function sync() {
    const { animation } = getState();
    const { frames, currentIndex, playhead, playing, fps, onion } = animation;
    const max = Math.max(0, frames.length - 1);

    playBtn.textContent = playing ? '⏸' : '▶';
    delBtn.disabled = frames.length <= 1;
    fpsSlider.value = fps;
    fpsValue.textContent = fps;
    onionCheck.checked = onion.enabled;
    onionRange.value = onion.span;
    onionValue.textContent = onion.span;

    scrub.min = 0;
    scrub.max = String(max);
    scrub.step = max > 0 ? String(1 / 60) : '1';
    scrub.value = playhead;

    const playIdx = Math.floor(playhead);
    const sub = playhead - playIdx;
    const currentFrame = frames[currentIndex];
    const tweenFrom = frames[playIdx];
    const tweenTo = frames[Math.min(playIdx + 1, frames.length - 1)];
    const label = (frame, i) => frame?.name ?? `K${i + 1}`;

    readout.textContent = frames.length < 2
      ? `${label(currentFrame, currentIndex)} · ${frames.length} key`
      : `${label(tweenFrom, playIdx)}→${label(tweenTo, Math.min(playIdx + 1, frames.length - 1))} (${Math.round(sub * 100)}%) · ${frames.length} keys`;

    framesEl.innerHTML = frames
      .map((frame, i) => {
        const active = i === currentIndex;
        const inTween = playing && (i === playIdx || i === playIdx + 1);
        const name = label(frame, i);
        return `
          <button type="button" class="timeline-frame${active ? ' active' : ''}${inTween ? ' tween' : ''}" data-index="${i}" draggable="true" title="${name} · drag to reorder">
            <span class="timeline-frame-num">${name}</span>
          </button>
        `;
      })
      .join('');
  }

  sync();
  return { sync };
}
