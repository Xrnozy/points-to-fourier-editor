import {
  getState,
  setActiveContourIndex,
  setSelectionMode,
  moveContourOrder,
  addInnerShape,
  removeActiveContour,
} from './state.js';

export function initLayersPanel(container) {
  container.innerHTML = `
    <div class="layers-panel">
      <div class="layers-head">
        <p class="control-section-title">Layers</p>
        <div class="layers-actions">
          <button id="add-layer-btn" title="Add inner shape">+</button>
          <button id="remove-layer-btn" class="danger" title="Remove layer">−</button>
        </div>
      </div>
      <ul class="layer-list" id="layer-list"></ul>
    </div>
  `;

  const list = container.querySelector('#layer-list');
  const addBtn = container.querySelector('#add-layer-btn');
  const removeBtn = container.querySelector('#remove-layer-btn');

  addBtn.addEventListener('click', () => addInnerShape());
  removeBtn.addEventListener('click', () => removeActiveContour());

  list.addEventListener('click', (e) => {
    const item = e.target.closest('.layer-item');
    if (!item) return;

    const index = parseInt(item.dataset.index, 10);
    if (e.target.closest('.layer-up')) {
      if (index > 0) moveContourOrder(index, index - 1);
      return;
    }
    if (e.target.closest('.layer-down')) {
      const { contours } = getState();
      if (index < contours.length - 1) moveContourOrder(index, index + 1);
      return;
    }
    setActiveContourIndex(index);
    setSelectionMode('layer');
  });

  function sync() {
    const { contours, activeContourIndex, selectionMode } = getState();
    removeBtn.disabled = contours.length <= 1;

    list.innerHTML = contours
      .map((_, i) => {
        const isActive = i === activeContourIndex;
        const isLayerSel = isActive && selectionMode === 'layer';
        const label = i === 0 ? 'Outer' : `Inner ${i}`;
        return `
          <li class="layer-item${isActive ? ' active' : ''}${isLayerSel ? ' layer-selected' : ''}" data-index="${i}">
            <button type="button" class="layer-select">
              <span class="layer-swatch" style="--layer-color: var(--layer-${i % 4})"></span>
              <span class="layer-name">${label}</span>
            </button>
            <div class="layer-order">
              <button type="button" class="layer-up" ${i === 0 ? 'disabled' : ''}>↑</button>
              <button type="button" class="layer-down" ${i === contours.length - 1 ? 'disabled' : ''}>↓</button>
            </div>
          </li>
        `;
      })
      .join('');
  }

  sync();
  return { sync };
}
