import {
  getState,
  setHarmonics,
  setShapeName,
  resetShape,
  deleteSelectedPoint,
  setSelectionMode,
} from './state.js';

export function initControls(container) {
  container.innerHTML = `
    <div class="control-section">
      <p class="control-section-title">Identity</p>
      <div class="control-group">
        <label for="shape-name">Shape name</label>
        <input type="text" id="shape-name" value="shape" placeholder="duck, cat, heart...">
      </div>
      <div class="control-group">
        <label for="harmonics-slider">Harmonics / Fourier terms</label>
        <div class="slider-row">
          <input type="range" id="harmonics-slider" min="1" max="32" value="8">
          <span class="slider-value" id="harmonics-value">8</span>
        </div>
      </div>
    </div>

    <div class="control-section">
      <p class="control-section-title">Edit</p>
      <div class="btn-row">
        <button id="layer-mode-btn">Layer move</button>
        <button id="point-mode-btn">Point edit</button>
      </div>
      <div class="btn-row">
        <button id="reset-btn">Reset circle</button>
        <button id="delete-btn" class="danger">Delete point</button>
      </div>
    </div>
  `;

  const shapeNameInput = container.querySelector('#shape-name');
  const harmonicsSlider = container.querySelector('#harmonics-slider');
  const harmonicsValue = container.querySelector('#harmonics-value');
  const layerModeBtn = container.querySelector('#layer-mode-btn');
  const pointModeBtn = container.querySelector('#point-mode-btn');
  const resetBtn = container.querySelector('#reset-btn');
  const deleteBtn = container.querySelector('#delete-btn');

  shapeNameInput.addEventListener('input', () => setShapeName(shapeNameInput.value));

  harmonicsSlider.addEventListener('input', () => {
    const n = parseInt(harmonicsSlider.value, 10);
    harmonicsValue.textContent = n;
    setHarmonics(n);
  });

  layerModeBtn.addEventListener('click', () => setSelectionMode('layer'));
  pointModeBtn.addEventListener('click', () => setSelectionMode('point'));
  resetBtn.addEventListener('click', () => {
    resetShape();
    shapeNameInput.value = getState().shapeName;
  });
  deleteBtn.addEventListener('click', () => deleteSelectedPoint());

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      deleteSelectedPoint();
    }
  });

  function sync() {
    const { harmonics, shapeName, selectionMode } = getState();
    shapeNameInput.value = shapeName;
    harmonicsSlider.value = harmonics;
    harmonicsValue.textContent = harmonics;
    layerModeBtn.classList.toggle('active', selectionMode === 'layer');
    pointModeBtn.classList.toggle('active', selectionMode === 'point');
  }

  sync();
  return { sync };
}
