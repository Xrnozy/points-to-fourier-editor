import {
  getState,
  getOrderedGroups,
  setActiveContourIndex,
  setSelectionMode,
  moveContourOrder,
  addMergedLayer,
  addSeparateLayer,
  splitActiveLayerToSeparate,
  joinActiveLayerToMerged,
  removeActiveContour,
} from './state.js';

function layerLabel(contour, indexInGroup, groupType) {
  if (!contour.closed) return 'Drawing…';
  if (groupType === 'separate') return 'Part';
  return indexInGroup === 0 ? 'Outer' : `Inner ${indexInGroup}`;
}

export function initLayersPanel(container) {
  container.innerHTML = `
    <div class="layers-panel">
      <div class="layers-head">
        <p class="control-section-title">Layers</p>
      </div>
      <div class="layers-actions">
        <button id="add-merged-btn">+ Merge</button>
        <button id="add-separate-btn">+ Separate</button>
        <button id="remove-layer-btn" class="danger" title="Remove layer">Remove</button>
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

  addMergedBtn.addEventListener('click', () => addMergedLayer());
  addSeparateBtn.addEventListener('click', () => addSeparateLayer());
  removeBtn.addEventListener('click', () => removeActiveContour());
  splitBtn.addEventListener('click', () => splitActiveLayerToSeparate());
  joinBtn.addEventListener('click', () => joinActiveLayerToMerged());

  groupsEl.addEventListener('click', (e) => {
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
    const orderedGroups = getOrderedGroups();
    removeBtn.disabled = contours.length <= 1;

    const activeContour = contours[activeContourIndex];
    const activeGroup = orderedGroups.find((g) => g.id === activeContour?.groupId);
    const mergedSiblings = activeContour
      ? contours.filter((c) => c.groupId === activeContour.groupId).length
      : 0;

    splitBtn.disabled = !activeContour || activeGroup?.type !== 'merged' || mergedSiblings <= 1;
    joinBtn.disabled = !activeContour || activeGroup?.type !== 'separate';

    let fourierIndex = 0;
    groupsEl.innerHTML = orderedGroups
      .map((group) => {
        fourierIndex += 1;
        const groupContours = contours
          .map((contour, index) => ({ contour, index }))
          .filter(({ contour }) => contour.groupId === group.id);
        const groupTitle = group.type === 'merged'
          ? `Merged · Fourier ${fourierIndex}`
          : `Separate · Fourier ${fourierIndex}`;
        const groupHint = group.type === 'merged'
          ? 'Stitched path'
          : 'Own export block';

        const items = groupContours
          .map(({ contour, index }, indexInGroup) => {
            const isActive = index === activeContourIndex;
            const isLayerSel = isActive && selectionMode === 'layer';
            const label = layerLabel(contour, indexInGroup, group.type);
            return `
              <li class="layer-item${isActive ? ' active' : ''}${isLayerSel ? ' layer-selected' : ''}" data-index="${index}">
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
              <span class="layer-group-title">${groupTitle}</span>
              <span class="layer-group-hint">${groupHint}</span>
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
