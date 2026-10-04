import { buildExportText, buildHighlightedHtml } from './export.js';
import { getState, getExportCoefficientSets, importFourier } from './state.js';
import { initTimelinePanel } from './timeline-panel.js';

export function initCodePanel(container, { onSyncControls }) {
  container.innerHTML = `
    <div class="code-panel-tabs">
      <div class="code-tab-list" role="tablist">
        <button type="button" class="code-tab active" data-tab="output" role="tab" aria-selected="true">Output</button>
        <button type="button" class="code-tab" data-tab="import" role="tab" aria-selected="false">Import</button>
        <button type="button" class="code-tab" data-tab="timeline" role="tab" aria-selected="false">Timeline</button>
      </div>
      <div class="code-tab-toolbar" id="output-toolbar">
        <span class="copy-feedback" id="copy-feedback">Copied</span>
        <button class="primary" id="copy-btn">Copy code</button>
      </div>
      <div class="code-tab-toolbar hidden" id="import-toolbar">
        <span class="import-feedback" id="import-feedback"></span>
        <button class="primary" id="import-btn">Import shape</button>
      </div>
      <div class="code-tab-toolbar hidden" id="timeline-toolbar">
        <span class="timeline-toolbar-hint">Fourier morph between keyframes</span>
      </div>
    </div>
    <div class="code-panel-body">
      <div class="code-tab-pane active" data-pane="output">
        <div class="code-output" id="code-output"></div>
      </div>
      <div class="code-tab-pane" data-pane="import">
        <div class="import-pane">
          <p class="import-hint">Paste a Fourier dictionary exported from this editor or Unity.</p>
          <textarea id="import-input" class="import-input" placeholder='"shape" => [&#10;    [&#10;         0 => {a: 10, p: 0},&#10;    ]&#10;],' spellcheck="false"></textarea>
        </div>
      </div>
      <div class="code-tab-pane" data-pane="timeline">
        <div id="timeline-mount"></div>
      </div>
    </div>
  `;

  const tabs = container.querySelectorAll('.code-tab');
  const panes = container.querySelectorAll('.code-tab-pane');
  const outputToolbar = container.querySelector('#output-toolbar');
  const importToolbar = container.querySelector('#import-toolbar');
  const timelineToolbar = container.querySelector('#timeline-toolbar');
  const output = container.querySelector('#code-output');
  const copyBtn = container.querySelector('#copy-btn');
  const feedback = container.querySelector('#copy-feedback');
  const importInput = container.querySelector('#import-input');
  const importBtn = container.querySelector('#import-btn');
  const importFeedback = container.querySelector('#import-feedback');
  const timeline = initTimelinePanel(container.querySelector('#timeline-mount'));

  function setTab(name) {
    tabs.forEach((tab) => {
      const active = tab.dataset.tab === name;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    panes.forEach((pane) => {
      pane.classList.toggle('active', pane.dataset.pane === name);
    });
    outputToolbar.classList.toggle('hidden', name !== 'output');
    importToolbar.classList.toggle('hidden', name !== 'import');
    timelineToolbar.classList.toggle('hidden', name !== 'timeline');
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => setTab(tab.dataset.tab));
  });

  function update() {
    const { shapeName } = getState();
    output.innerHTML = buildHighlightedHtml(shapeName, getExportCoefficientSets());
    timeline.sync();
  }

  copyBtn.addEventListener('click', async () => {
    const { shapeName } = getState();
    const text = buildExportText(shapeName, getExportCoefficientSets());
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
      setTab('output');
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
  return { update, syncTimeline: () => timeline.sync() };
}
