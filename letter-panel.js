import {
  getLetterWorkshop,
  hasLetterProject,
  isLetterNotebookView,
  createLetter,
  toggleLetterNotebookView,
  startLetterDraw,
  startLetterPointEdit,
  nextLetterStroke,
  finishLetterWorkshop,
  toggleLetterGuide,
  getState,
} from './state.js';
import { getLetterStrokePlan } from './letter-strokes.js';
import { initLetterGuideFont } from './letter-guide.js';

export function initLetterPanel(container) {
  container.innerHTML = `
    <div class="letter-panel">
      <p class="control-section-title">Letter</p>
      <p class="letter-panel-hint">Draw strokes on notebook lines or toggle to normal editor. Progress is kept.</p>
      <div class="letter-create-row">
        <input type="text" id="letter-char-input" maxlength="1" value="a" aria-label="Letter" class="letter-char-input">
        <button type="button" id="create-letter-btn" class="letter-primary-btn">Create letter</button>
      </div>
      <div class="letter-stroke-count-row">
        <label for="stroke-count-input">Strokes</label>
        <input type="number" id="stroke-count-input" min="1" max="6" value="1">
        <span id="stroke-count-auto" class="stroke-count-auto">suggested</span>
      </div>
      <div id="letter-workshop-ui" class="letter-workshop-ui" hidden>
        <div class="letter-workshop-head">
          <span id="letter-workshop-title" class="letter-workshop-title">Letter a</span>
        </div>
        <p id="letter-workshop-hint" class="letter-workshop-hint"></p>
        <div class="btn-row">
          <button type="button" id="draw-stroke-btn" class="letter-primary-btn">Draw</button>
          <button type="button" id="edit-stroke-btn">Edit points</button>
        </div>
        <div class="btn-row">
          <button type="button" id="next-stroke-btn">Next stroke</button>
          <button type="button" id="finish-letter-btn">End letter</button>
        </div>
        <label class="letter-guide-toggle">
          <input type="checkbox" id="show-letter-guide-checkbox" checked>
          Show letter guide in notebook
        </label>
      </div>
    </div>
  `;

  const letterInput = container.querySelector('#letter-char-input');
  const strokeCountInput = container.querySelector('#stroke-count-input');
  const strokeCountAuto = container.querySelector('#stroke-count-auto');
  const createBtn = container.querySelector('#create-letter-btn');
  const workshopUi = container.querySelector('#letter-workshop-ui');
  const titleEl = container.querySelector('#letter-workshop-title');
  const hintEl = container.querySelector('#letter-workshop-hint');
  const drawBtn = container.querySelector('#draw-stroke-btn');
  const editBtn = container.querySelector('#edit-stroke-btn');
  const nextStrokeBtn = container.querySelector('#next-stroke-btn');
  const finishBtn = container.querySelector('#finish-letter-btn');
  const guideCheckbox = container.querySelector('#show-letter-guide-checkbox');

  initLetterGuideFont().then(() => sync());

  function syncStrokeCountDefault() {
    const ch = letterInput.value.trim();
    if (!ch) return;
    const plan = getLetterStrokePlan(ch);
    strokeCountInput.value = String(plan.strokeCount);
    strokeCountAuto.textContent = `suggested ${plan.strokeCount}`;
  }

  letterInput.addEventListener('input', syncStrokeCountDefault);
  syncStrokeCountDefault();

  createBtn.addEventListener('click', () => {
    if (hasLetterProject()) {
      toggleLetterNotebookView();
      sync();
      return;
    }
    const char = letterInput.value.trim() || 'a';
    const strokes = parseInt(strokeCountInput.value, 10) || 1;
    if (!createLetter(char, strokes)) {
      letterInput.focus();
      return;
    }
    sync();
  });

  letterInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') createBtn.click();
  });

  drawBtn.addEventListener('click', () => startLetterDraw());
  editBtn.addEventListener('click', () => startLetterPointEdit());
  nextStrokeBtn.addEventListener('click', () => nextLetterStroke());
  finishBtn.addEventListener('click', () => finishLetterWorkshop());

  guideCheckbox.addEventListener('change', () => {
    const ws = getLetterWorkshop();
    if (!ws) return;
    if (ws.showLetterGuide !== guideCheckbox.checked) toggleLetterGuide();
  });

  function sync() {
    const project = hasLetterProject();
    const ws = getLetterWorkshop();
    const notebook = isLetterNotebookView();
    workshopUi.hidden = !project;

    createBtn.classList.toggle('active', notebook);
    createBtn.textContent = project
      ? (notebook ? 'Notebook on' : 'Notebook off')
      : 'Create letter';

    if (!project) {
      createBtn.disabled = false;
      letterInput.disabled = false;
      strokeCountInput.disabled = false;
      syncStrokeCountDefault();
      return;
    }

    letterInput.disabled = true;
    strokeCountInput.disabled = true;
    letterInput.value = ws.letter;

    const { contours, activeContourIndex, editorTool } = getState();
    const points = contours[activeContourIndex]?.points?.length ?? 0;
    const strokeNum = ws.strokeIndex + 1;

    titleEl.textContent = notebook ? `Notebook · “${ws.letter}”` : `Letter “${ws.letter}” · normal view`;
    hintEl.textContent = ws.hint ?? 'Trace the faint letter guide, then edit points to fix it.';
    guideCheckbox.checked = ws.showLetterGuide !== false;
    drawBtn.classList.toggle('active', editorTool === 'draw');
    editBtn.classList.toggle('active', editorTool === 'edit');

    nextStrokeBtn.disabled = strokeNum >= ws.totalStrokes || points < 1;
    finishBtn.disabled = false;
  }

  sync();
  return { sync };
}
