import { buildExportText, buildHighlightedHtml } from './export.js';
import { getState, importFourier } from './state.js';

export function initCodePanel(container, { onSyncControls }) {
  container.innerHTML = `
    <div class="code-panel-toolbar">
      <h2>Fourier output</h2>
      <div class="toolbar-actions">
        <span class="copy-feedback" id="copy-feedback">Copied</span>
        <button class="primary" id="copy-btn">Copy Fourier code</button>
      </div>
    </div>
    <div class="code-panel-body">
      <div class="code-output" id="code-output"></div>
      <div class="import-panel">
        <label for="import-input">Import Fourier</label>
        <textarea id="import-input" class="import-input" placeholder="Paste exported coefficient dictionary here..." rows="6"></textarea>
        <button id="import-btn" class="full-width">Restore shape from Fourier</button>
        <span class="import-feedback" id="import-feedback"></span>
      </div>
    </div>
  `;

  const output = container.querySelector('#code-output');
  const copyBtn = container.querySelector('#copy-btn');
  const feedback = container.querySelector('#copy-feedback');
  const importInput = container.querySelector('#import-input');
  const importBtn = container.querySelector('#import-btn');
  const importFeedback = container.querySelector('#import-feedback');

  function update() {
    const { shapeName, activeCoefficients } = getState();
    output.innerHTML = buildHighlightedHtml(shapeName, activeCoefficients);
  }

  copyBtn.addEventListener('click', async () => {
    const { shapeName, activeCoefficients } = getState();
    const text = buildExportText(shapeName, activeCoefficients);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    feedback.classList.add('visible');
    setTimeout(() => feedback.classList.remove('visible'), 2000);
  });

  importBtn.addEventListener('click', () => {
    const text = importInput.value.trim();
    if (!text) {
      importFeedback.textContent = 'Paste code first';
      importFeedback.className = 'import-feedback error visible';
      return;
    }
    const ok = importFourier(text);
    if (ok) {
      importFeedback.textContent = 'Shape restored';
      importFeedback.className = 'import-feedback visible';
      importInput.value = '';
      onSyncControls?.();
    } else {
      importFeedback.textContent = 'Parse failed';
      importFeedback.className = 'import-feedback error visible';
    }
    setTimeout(() => {
      importFeedback.textContent = '';
      importFeedback.className = 'import-feedback';
    }, 3000);
  });

  update();
  return { update };
}
