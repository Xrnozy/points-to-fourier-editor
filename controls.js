import {
  getState,
  setHarmonics,
  setShapeName,
  setRotation,
  resetRotation,
  resetShape,
  deleteSelectedPoints,
  setSelectionMode,
  setEditorTool,
  saveCheckpoint,
  undo,
  redo,
  canUndo,
  canRedo,
} from './state.js';

export function initControls(container) {
  container.innerHTML = `
    <div class="control-section">
      <p class="control-section-title">Tools</p>
      <div class="btn-row">
        <button id="layer-mode-btn">Layer move</button>
        <button id="point-mode-btn">Point edit</button>
      </div>
      <div class="btn-row">
        <button id="eraser-mode-btn">Eraser</button>
        <button id="draw-mode-btn">Draw new</button>
      </div>
      <p class="tool-hint" id="draw-hint">Layer move: drag handles to scale · Shift for free scale</p>
    </div>

    <div class="control-section">
      <p class="control-section-title">Shape</p>
      <div class="control-group">
        <label for="shape-name">Name</label>
        <input type="text" id="shape-name" value="shape" placeholder="duck, cat, heart...">
      </div>
      <div class="control-group">
        <label for="harmonics-slider">Harmonics</label>
        <div class="slider-row">
          <input type="range" id="harmonics-slider" min="1" max="32" value="8">
          <span class="slider-value" id="harmonics-value">8</span>
        </div>
      </div>
    </div>

    <div class="control-section">
      <p class="control-section-title">Rotation</p>
      <div class="rotation-sliders">
        <div class="control-group">
          <label for="rotate-x">X</label>
          <div class="slider-row">
            <input type="range" id="rotate-x" min="-180" max="180" value="0" step="1">
            <span class="slider-value" id="rotate-x-value">0°</span>
          </div>
        </div>
        <div class="control-group">
          <label for="rotate-y">Y</label>
          <div class="slider-row">
            <input type="range" id="rotate-y" min="-180" max="180" value="0" step="1">
            <span class="slider-value" id="rotate-y-value">0°</span>
          </div>
        </div>
        <div class="control-group">
          <label for="rotate-z">Z</label>
          <div class="slider-row">
            <input type="range" id="rotate-z" min="-180" max="180" value="0" step="1">
            <span class="slider-value" id="rotate-z-value">0°</span>
          </div>
        </div>
      </div>
      <div class="btn-row">
        <button id="reset-rotation-btn" class="full-width">Reset rotation</button>
      </div>
    </div>

    <div class="control-section">
      <p class="control-section-title">Actions</p>
      <div class="btn-row">
        <button id="undo-btn">Undo</button>
        <button id="redo-btn">Redo</button>
      </div>
      <div class="btn-row">
        <button id="reset-btn">Reset circle</button>
        <button id="delete-btn" class="danger">Delete point</button>
      </div>
      <p class="tool-hint">Ctrl+Z · Ctrl+Y</p>
    </div>
  `;

  const shapeNameInput = container.querySelector('#shape-name');
  const harmonicsSlider = container.querySelector('#harmonics-slider');
  const harmonicsValue = container.querySelector('#harmonics-value');
  const layerModeBtn = container.querySelector('#layer-mode-btn');
  const pointModeBtn = container.querySelector('#point-mode-btn');
  const eraserModeBtn = container.querySelector('#eraser-mode-btn');
  const drawModeBtn = container.querySelector('#draw-mode-btn');
  const drawHint = container.querySelector('#draw-hint');
  const undoBtn = container.querySelector('#undo-btn');
  const redoBtn = container.querySelector('#redo-btn');
  const rotateX = container.querySelector('#rotate-x');
  const rotateY = container.querySelector('#rotate-y');
  const rotateZ = container.querySelector('#rotate-z');
  const rotateXValue = container.querySelector('#rotate-x-value');
  const rotateYValue = container.querySelector('#rotate-y-value');
  const rotateZValue = container.querySelector('#rotate-z-value');
  const resetRotationBtn = container.querySelector('#reset-rotation-btn');
  const resetBtn = container.querySelector('#reset-btn');
  const deleteBtn = container.querySelector('#delete-btn');

  function readRotation() {
    return {
      x: parseInt(rotateX.value, 10),
      y: parseInt(rotateY.value, 10),
      z: parseInt(rotateZ.value, 10),
    };
  }

  function bindRotationSlider(slider, valueEl) {
    slider.addEventListener('pointerdown', () => saveCheckpoint());
    slider.addEventListener('input', () => {
      valueEl.textContent = `${slider.value}°`;
      setRotation(readRotation());
    });
  }

  bindRotationSlider(rotateX, rotateXValue);
  bindRotationSlider(rotateY, rotateYValue);
  bindRotationSlider(rotateZ, rotateZValue);

  resetRotationBtn.addEventListener('click', () => {
    saveCheckpoint();
    resetRotation();
  });

  shapeNameInput.addEventListener('input', () => setShapeName(shapeNameInput.value));

  harmonicsSlider.addEventListener('input', () => {
    const n = parseInt(harmonicsSlider.value, 10);
    harmonicsValue.textContent = n;
    setHarmonics(n);
  });

  layerModeBtn.addEventListener('click', () => {
    setEditorTool('edit');
    setSelectionMode('layer');
  });
  pointModeBtn.addEventListener('click', () => {
    setEditorTool('edit');
    setSelectionMode('point');
  });
  eraserModeBtn.addEventListener('click', () => {
    setEditorTool('eraser');
  });
  drawModeBtn.addEventListener('click', () => {
    const { editorTool } = getState();
    setEditorTool(editorTool === 'draw' ? 'edit' : 'draw');
  });
  resetBtn.addEventListener('click', () => {
    resetShape();
    shapeNameInput.value = getState().shapeName;
  });
  deleteBtn.addEventListener('click', () => deleteSelectedPoints());
  undoBtn.addEventListener('click', () => undo());
  redoBtn.addEventListener('click', () => redo());

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
      return;
    }
    if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
      e.preventDefault();
      redo();
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      deleteSelectedPoints();
    }
  });

  function sync() {
    const { harmonics, shapeName, rotation, selectionMode, editorTool, selectedIndices } = getState();
    shapeNameInput.value = shapeName;
    harmonicsSlider.value = harmonics;
    harmonicsValue.textContent = harmonics;
    rotateX.value = rotation.x;
    rotateY.value = rotation.y;
    rotateZ.value = rotation.z;
    rotateXValue.textContent = `${rotation.x}°`;
    rotateYValue.textContent = `${rotation.y}°`;
    rotateZValue.textContent = `${rotation.z}°`;
    layerModeBtn.classList.toggle('active', editorTool === 'edit' && selectionMode === 'layer');
    pointModeBtn.classList.toggle('active', editorTool === 'edit' && selectionMode === 'point');
    eraserModeBtn.classList.toggle('active', editorTool === 'eraser');
    drawModeBtn.classList.toggle('active', editorTool === 'draw');
    drawModeBtn.textContent = editorTool === 'draw' ? 'Stop draw' : 'Draw new';
    drawHint.textContent = editorTool === 'draw'
      ? 'Click to place points · Click first point to close'
      : editorTool === 'eraser'
        ? 'Drag over points to erase · Needs at least 3 points left'
        : selectionMode === 'layer'
          ? 'Drag box to select points · Click/drag point to move · Scroll zoom · Middle-drag pan'
          : selectedIndices.length > 1
            ? `${selectedIndices.length} points selected · Drag box to add more · Shift+click toggles`
            : 'Drag box to multi-select · Click edge to add · Shift+click toggles point';
    deleteBtn.textContent = selectedIndices.length > 1 ? 'Delete points' : 'Delete point';
    undoBtn.disabled = !canUndo();
    redoBtn.disabled = !canRedo();
  }

  sync();
  return { sync };
}
