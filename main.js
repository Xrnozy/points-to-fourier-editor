import { subscribe } from './state.js';
import { initEditorCanvas } from './editor-canvas.js';
import { initEpicycleCanvas } from './epicycle-canvas.js';
import { initCodePanel } from './code-panel.js';
import { initControls } from './controls.js';
import { initLayersPanel } from './layers-panel.js';
import { initLetterPanel } from './letter-panel.js';
import { initLetterGuideFont } from './letter-guide.js';
import { startAnimationLoop } from './animation-player.js';

const editorCanvas = document.getElementById('editor-canvas');
const epicycleCanvas = document.getElementById('epicycle-canvas');
const layersPanel = document.getElementById('layers-panel');
const letterPanel = document.getElementById('letter-panel');
const controlsPanel = document.getElementById('controls-panel');
const codePanel = document.getElementById('code-panel');

const editor = initEditorCanvas(editorCanvas);
const epicycle = initEpicycleCanvas(epicycleCanvas);
const layers = initLayersPanel(layersPanel);
const letter = initLetterPanel(letterPanel);
const controls = initControls(controlsPanel);
const code = initCodePanel(codePanel, {
  onSyncControls: () => {
    controls.sync();
    layers.sync();
    letter.sync();
    code.syncTimeline();
  },
});

function redraw() {
  editor.draw();
  epicycle.draw();
  code.update();
  controls.sync();
  layers.sync();
  letter.sync();
}

initLetterGuideFont().then(() => redraw());

subscribe(redraw);

startAnimationLoop(() => {
  editor.draw();
  epicycle.draw();
  code.syncTimeline();
});
