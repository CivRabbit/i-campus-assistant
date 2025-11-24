import * as PIXI from 'pixi.js';
import { Application } from 'pixi.js';
import { Live2DModel, MotionPreloadStrategy } from 'pixi-live2d-display/cubism4';
import { Ticker, TickerPlugin } from '@pixi/ticker';

window.PIXI = PIXI;
PIXI.extensions.add(TickerPlugin);
Live2DModel.registerTicker(Ticker);

const speechBubble = document.getElementById('speech-bubble');
const avatarWrapper = document.getElementById('avatar-wrapper');
const stopBtn = document.getElementById('stop-btn');
const canvas = document.getElementById('live2d');

let isRecording = false, mediaRecorder, audioChunks = [];
let live2dModel, isSpeaking = false;
let expressions = {};

const app = new PIXI.Application({
  view: canvas,
  backgroundAlpha: 0,
  width: window.innerWidth,
  height: window.innerHeight,
});

function fitModelToScreen(model) {
  model.anchor.set(0.5);
  model.x = app.screen.width / 2;
  model.y = app.screen.height / 2;
  const scale = Math.min(
    app.screen.width * 0.7 / model.width,
    app.screen.height * 0.7 / model.height
  );
  model.scale.set(scale);
}

function playMotion(group) {
  if (!live2dModel) return;
  if (
    live2dModel.internalModel &&
    live2dModel.internalModel.motionManager &&
    live2dModel.internalModel.motionManager.definitions &&
    live2dModel.internalModel.motionManager.definitions[group]
  ) {
    live2dModel.motion(group);
  } else if (group !== 'Idle') {
    live2dModel.motion('Idle');
  }
}

function setExpression(name) {
  if (live2dModel && expressions[name]) {
    live2dModel.expression(expressions[name]);
  }
}
function clearExpression() {
  // Fallback, resets to neutral/idle expression
  if (live2dModel && expressions['Idle']) {
    live2dModel.expression(expressions['Idle']);
  }
}

Live2DModel.from('live2d/Cha_RobotStyleA/Cha_RobotStyleA/Cha_RobotStyleA.model3.json', {
  idleMotionGroup: 'Idle',
  motionPreload: MotionPreloadStrategy.IDLE
}).then(async model => {
  live2dModel = model;
  window.model = model;
  window.live2dModel = model;
  window.expressions = expressions;
  fitModelToScreen(model);
  // Debug: Log all available parameters
  // const coreModel = model.internalModel.coreModel;
  // const paramCount = coreModel.getParameterCount();
  // const paramIds = [];
  // for (let i = 0; i < paramCount; i++) {
  //   paramIds.push(coreModel.getParameterId(i));
  // }
  // console.log("Available Live2D Parameters:", paramIds);

  app.stage.addChild(model);

  // Correct expression loading (for pixi-live2d-display v0.4+)
  const exprDefs = model.internalModel.settings.json.Expressions || [];
  for (let exp of exprDefs) {
    try {
      const expObj = await model.loadExpression(`live2d/Cha_RobotStyleA/Cha_RobotStyleA/${exp.File}`);
      expressions[exp.Name] = expObj;
    } catch (e) {
      console.warn('Failed to load expression:', exp.Name, e);
    }
  }

  window.live2dExpressions = expressions; // for debugging in console

  window.addEventListener('resize', () => {
    app.renderer.resize(window.innerWidth, window.innerHeight);
    fitModelToScreen(model);
  });

  // Breathing animation and Eye Tracking
  PIXI.Ticker.shared.add(() => {
    if (!live2dModel) return;
    const core = live2dModel.internalModel.coreModel;

    // Breathing
    const t = (Date.now() / 1000) * Math.PI;
    const breath = (Math.sin(t) + 1) / 2;
    core.setParameterValueById('ParamBreath', breath);

    // Eye Tracking
    // Calculate look direction (-1 to 1)
    const rect = canvas.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const lookX = Math.max(-1, Math.min(1, (mouseX - centerX) / (rect.width / 2)));
    const lookY = Math.max(-1, Math.min(1, (mouseY - centerY) / (rect.height / 2)));

    // Set all potential eye ball parameters to ensure tracking works
    core.setParameterValueById('ParamEyeBallX', lookX);
    core.setParameterValueById('ParamEyeBallY', lookY);
    core.setParameterValueById('ParamEyeBallLX', lookX);
    core.setParameterValueById('ParamEyeBallLY', lookY);
    core.setParameterValueById('ParamEyeBallRX', lookX);
    core.setParameterValueById('ParamEyeBallRY', lookY);
  });

  // Start idle animation
  playMotion('Idle');
});

// Dragging logic
let dragging = false, offset = {};
avatarWrapper.addEventListener('mousedown', e => {
  dragging = true;
  offset.x = e.clientX - avatarWrapper.offsetLeft;
  offset.y = e.clientY - avatarWrapper.offsetTop;
  avatarWrapper.style.cursor = 'grabbing';
});
let mouseX = 0, mouseY = 0;
document.addEventListener('mousemove', e => {
  mouseX = e.clientX;
  mouseY = e.clientY;
  if (dragging) {
    avatarWrapper.style.left = `${e.clientX - offset.x}px`;
    avatarWrapper.style.top = `${e.clientY - offset.y}px`;
  }
});
document.addEventListener('mouseup', () => {
  dragging = false;
  avatarWrapper.style.cursor = 'grab';
});

// Wake word triggers recording
// Wake word triggers recording
window.electronAPI.onWakeWord(() => {
  showInterface();
  if (!isRecording) startRecording();
});

async function askAssistant(prompt) {
  playMotion('Thinking');
  setThinkingExpression(true);
  speechBubble.textContent = 'Thinking...';
  const answer = await window.api.askGPT(prompt);
  speechBubble.textContent = answer;
  playMotion('Happy');
  await speakText(answer);
  setThinkingExpression(false);
  playMotion('Idle');
}

function setMouthOpen(state) {
  if (!live2dModel) return;
  const core = live2dModel.internalModel.coreModel;
  core.setParameterValueById('ParamMouthOpenY', state ? 1 : 0);
}

function setThinkingExpression(on) {
  if (live2dModel) {
    live2dModel.internalModel.coreModel.setParameterValueById('Param3', on ? 1 : 0);
  }
}

function setLoadingExpression(on) {
  if (live2dModel) {
    live2dModel.internalModel.coreModel.setParameterValueById('Param4', on ? 1 : 0);
  }
}

// ElevenLabs TTS + mouth sync
async function speakText(text) {
  const voiceId = "1hlpeD1ydbI2ow0Tt3EW";
  try {
    const arrayBuffer = await window.api.elevenLabsTTS(text, voiceId);
    const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);

    // Mouth movement via audio volume (lip sync)
    let ac, src, analyser, arr, rafId;

    audio.onplay = () => {
      ac = new AudioContext();
      src = ac.createMediaElementSource(audio);
      analyser = ac.createAnalyser();
      analyser.fftSize = 1024;
      arr = new Uint8Array(analyser.fftSize);

      src.connect(analyser);
      analyser.connect(ac.destination);

      let lastMouth = 0;
      function animateMouth() {
        if (!live2dModel) return;
        analyser.getByteTimeDomainData(arr);
        const rms = Math.sqrt(arr.reduce((s, v) => {
          const n = (v - 128) / 128;
          return s + n * n;
        }, 0) / arr.length);
        const mouthOpen = Math.max(0, Math.min(1, (rms * 1.8 + lastMouth * 3) / 4));
        live2dModel.internalModel.coreModel.setParameterValueById('ParamMouthOpenY', mouthOpen);
        lastMouth = mouthOpen;
        rafId = requestAnimationFrame(animateMouth);
      }
      animateMouth();
    };

    audio.onended = () => {
      if (ac) ac.close();
      if (rafId) cancelAnimationFrame(rafId);
      if (live2dModel) {
        live2dModel.internalModel.coreModel.setParameterValueById('ParamMouthOpenY', 0);
      }
    };

    audio.play();
  } catch (err) {
    console.error('❌ ElevenLabs TTS error:', err);
    speechBubble.textContent = "Speech error.";
  }
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
    mediaRecorder.onstop = async () => {
      const blob = new Blob(audioChunks, { type: 'audio/wav' });
      const file = new File([blob], 'rec.wav', { type: 'audio/wav' });
      const form = new FormData();
      form.append('audio', file);

      speechBubble.textContent = 'Transcribing...';
      try {
        const res = await fetch('http://localhost:5005/transcribe', { method: 'POST', body: form });
        const data = await res.json();
        if (data.text) {
          if (data.text.toLowerCase().includes('go to sleep')) {
            hideInterface();
            speechBubble.textContent = '';
            return;
          }
          await askAssistant(data.text);
        } else speechBubble.textContent = data.error || 'Transcription failed.';
      } catch (err) {
        console.error('❌ Transcription error:', err);
        speechBubble.textContent = 'Error communicating with Whisper server.';
      }
    };
    mediaRecorder.start();
    isRecording = true;
    setLoadingExpression(true);
    speechBubble.textContent = 'Listening…';
    if (stopBtn) stopBtn.style.display = 'block';

    const ac = new AudioContext();
    const src = ac.createMediaStreamSource(stream);
    const analyzer = ac.createAnalyser();
    analyzer.fftSize = 2048;
    const arr = new Uint8Array(analyzer.fftSize);
    src.connect(analyzer);

    let silenceStart = null;
    const TH = 0.6, MAX = 1500;

    function detect() {
      analyzer.getByteTimeDomainData(arr);
      const rms = Math.sqrt(arr.reduce((s, v) => {
        const n = (v - 128) / 128;
        return s + n * n;
      }, 0) / arr.length);
      const vol = rms * 100;

      if (vol < TH) {
        silenceStart = silenceStart || Date.now();
        if (Date.now() - silenceStart > MAX) {
          ac.close();
          stopRecording();
          return;
        }
      } else silenceStart = null;

      if (isRecording) requestAnimationFrame(detect);
    }

    detect();
  } catch (err) {
    console.error('Mic access error:', err);
    speechBubble.textContent = 'Microphone error.';
  }
}

function stopRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    isRecording = false;
    clearExpression();
    setLoadingExpression(false);
    if (stopBtn) stopBtn.style.display = 'none';
  }
}

if (stopBtn) {
  stopBtn.addEventListener('click', () => {
    stopRecording();
    speechBubble.textContent = 'Listening stopped.';
  });
}

function hideInterface() {
  canvas.style.display = 'none';
  avatarWrapper.style.display = 'none';
}

function showInterface() {
  canvas.style.display = 'block';
  avatarWrapper.style.display = 'flex';
}
