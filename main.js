import { subscribe } from './state.js';
import { initEditorCanvas } from './editor-canvas.js';
import { initEpicycleCanvas } from './epicycle-canvas.js';
import { initCodePanel } from './code-panel.js';
import { initControls } from './controls.js';
import { initLayersPanel } from './layers-panel.js';

const editorCanvas = document.getElementById('editor-canvas');
const epicycleCanvas = document.getElementById('epicycle-canvas');
const layersPanel = document.getElementById('layers-panel');
const controlsPanel = document.getElementById('controls-panel');
const codePanel = document.getElementById('code-panel');

const editor = initEditorCanvas(editorCanvas);
const epicycle = initEpicycleCanvas(epicycleCanvas);
const layers = initLayersPanel(layersPanel);
const controls = initControls(controlsPanel);
const code = initCodePanel(codePanel, {
  onSyncControls: () => {
    controls.sync();
    layers.sync();
  },
});

subscribe(() => {
  editor.draw();
  epicycle.draw();
  code.update();
  controls.sync();
  layers.sync();
});
