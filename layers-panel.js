import {
  getState,
  getOrderedGroups,
  isMultiSelectMode,
  selectLayer,
  setSelectionMode,
  moveContourOrder,
  addMergedLayer,
  addSeparateLayer,
  splitActiveLayerToSeparate,
  joinActiveLayerToMerged,
  removeActiveContour,
  setGroupHarmonics,
  saveCheckpoint,
} from './state.js';

const MAX_HARMONICS = 32;

function layerLabel(contour, indexInGroup, groupType, layerCount) {
  if (!contour.closed) return 'Drawing…';
  if (groupType === 'separate' && layerCount === 1) return 'Part';
  return indexInGroup === 0 ? 'Outer' : `Inner ${indexInGroup}`;
}

export function initLayersPanel(container) {
  container.innerHTML = `
    <div class="layers-panel">
      <div class="layers-head">
        <p class="control-section-title">Layers</p>
        <p class="layers-hint">Shift+click to multi-select</p>
      </div>
      <div class="layers-actions">
        <button id="add-merged-btn" title="Add stitched layer to the selected Fourier group">+ Merge</button>
        <button id="add-separate-btn" title="New separate Fourier block">+ Separate</button>
        <button id="remove-layer-btn" class="danger" title="Remove layer (clears points if only one layer)">Remove</button>
      </div>
      <div class="layer-groups" id="layer-groups"></div>
      <div class="layer-group-actions btn-row">
        <button id="split-layer-btn">Split out</button>
        <button id="join-layer-btn">Join merge</button>
      </div>
    </div>
  `;

  const groupsEl = container.querySelector('#layer-groups');
  const addMergedBtn = container.querySelector('#add-merged-btn');
  const addSeparateBtn = container.querySelector('#add-separate-btn');
  const removeBtn = container.querySelector('#remove-layer-btn');
  const splitBtn = container.querySelector('#split-layer-btn');
  const joinBtn = container.querySelector('#join-layer-btn');
  let harmonicsDrag = false;

  addMergedBtn.addEventListener('click', () => addMergedLayer());
  addSeparateBtn.addEventListener('click', () => addSeparateLayer());
  removeBtn.addEventListener('click', () => removeActiveContour());
  splitBtn.addEventListener('click', () => splitActiveLayerToSeparate());
  joinBtn.addEventListener('click', () => joinActiveLayerToMerged());

  function endHarmonicsDrag() {
    if (!harmonicsDrag) return;
    harmonicsDrag = false;
    sync();
  }

  groupsEl.addEventListener(
    'pointerdown',
    (e) => {
      const slider = e.target.closest('[data-group-harmonics]');
      if (!slider) return;
      e.stopPropagation();
      saveCheckpoint();
      harmonicsDrag = true;
    },
    true
  );

  groupsEl.addEventListener('input', (e) => {
    const slider = e.target.closest('[data-group-harmonics]');
    if (!slider) return;
    e.stopPropagation();
    const groupId = parseInt(slider.dataset.groupId, 10);
    const value = parseInt(slider.value, 10);
    setGroupHarmonics(groupId, value);
    const valueEl = slider.parentElement.querySelector('.layer-group-harmonics-value');
    if (valueEl) valueEl.textContent = value;
  });

  groupsEl.addEventListener(
    'wheel',
    (e) => {
      if (e.target.closest('[data-group-harmonics]')) e.stopPropagation();
    },
    { passive: true }
  );

  document.addEventListener('pointerup', endHarmonicsDrag);
  document.addEventListener('pointercancel', endHarmonicsDrag);

  groupsEl.addEventListener('click', (e) => {
    if (e.target.closest('.layer-group-harmonics')) return;
    if (isMultiSelectMode()) return;

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
    selectLayer(index, { additive: e.shiftKey });
    setSelectionMode('layer');
  });

  function sync() {
    if (harmonicsDrag) return;

    const { contours, activeContourIndex, selectedLayerIndices } = getState();
    const orderedGroups = getOrderedGroups();
    removeBtn.disabled = contours.length <= 1;

    const activeContour = contours[activeContourIndex];
    const activeGroup = orderedGroups.find((g) => g.id === activeContour?.groupId);
    const mergedSiblings = activeContour
      ? contours.filter((c) => c.groupId === activeContour.groupId).length
      : 0;

    splitBtn.disabled = !activeContour || mergedSiblings <= 1;
    joinBtn.disabled = !activeContour || activeGroup?.type !== 'separate' || mergedSiblings > 1;

    let fourierIndex = 0;
    groupsEl.innerHTML = orderedGroups
      .map((group) => {
        fourierIndex += 1;
        const harmonics = group.harmonics ?? 8;
        const groupContours = contours
          .map((contour, index) => ({ contour, index }))
          .filter(({ contour }) => contour.groupId === group.id);
        const groupTitle = group.type === 'merged'
          ? `Merged · Fourier ${fourierIndex}`
          : `Separate · Fourier ${fourierIndex}`;
        const layerCount = groupContours.length;
        const groupHint = group.type === 'merged'
          ? 'Stitched path'
          : layerCount > 1
            ? 'Stitched · own Fourier block'
            : 'Own export block';

        const items = groupContours
          .map(({ contour, index }, indexInGroup) => {
            const isActive = index === activeContourIndex;
            const isSelected = selectedLayerIndices.includes(index);
            const label = layerLabel(contour, indexInGroup, group.type, layerCount);
            return `
              <li class="layer-item${isActive ? ' active' : ''}${isSelected ? ' layer-multi-selected' : ''}" data-index="${index}">
                <button type="button" class="layer-select">
                  <span class="layer-swatch" style="--layer-color: var(--layer-${index % 4})"></span>
                  <span class="layer-name">${label}</span>
                </button>
                <div class="layer-order">
                  <button type="button" class="layer-up" ${index === 0 ? 'disabled' : ''}>↑</button>
                  <button type="button" class="layer-down" ${index === contours.length - 1 ? 'disabled' : ''}>↓</button>
                </div>
              </li>
            `;
          })
          .join('');

        return `
          <section class="layer-group${group.type === 'separate' ? ' layer-group-separate' : ''}">
            <div class="layer-group-head">
              <div class="layer-group-title-row">
                <span class="layer-group-title">${groupTitle}</span>
                <span class="layer-group-hint">${groupHint}</span>
              </div>
              <div class="layer-group-harmonics" title="Harmonics for this Fourier block">
                <span class="layer-group-harmonics-label">H</span>
                <input
                  type="range"
                  data-group-harmonics
                  data-group-id="${group.id}"
                  min="1"
                  max="${MAX_HARMONICS}"
                  value="${harmonics}"
                >
                <span class="layer-group-harmonics-value">${harmonics}</span>
              </div>
            </div>
            <ul class="layer-list">${items}</ul>
          </section>
        `;
      })
      .join('');
  }

  sync();
  return { sync };
}
