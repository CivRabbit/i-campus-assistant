import { Application, Sprite } from 'pixi.js';
import { Loader } from '@pixi/loaders';

const speechBubble = document.getElementById('speech-bubble');
const avatarWrapper = document.getElementById('avatar-wrapper');

let isRecording = false;
let mediaRecorder;
let audioChunks = [];
let characterOpen, characterClosed;
let isSpeaking = false;

// ✅ PIXI app init
const app = new Application({
  view: document.getElementById('live2d'),
  autoStart: true,
  backgroundAlpha: 0,
  width: window.innerWidth,
  height: window.innerHeight,
});
window.addEventListener('resize', () => {
  app.renderer.resize(window.innerWidth, window.innerHeight);
});

// ✅ Load textures
const loader = new Loader();
loader
  .add('Character.png')
  .add('Character_mouthShut.png')
  .load((loader, resources) => {
    characterOpen = new Sprite(resources['Character.png'].texture);
    characterClosed = new Sprite(resources['Character_mouthShut.png'].texture);

    [characterOpen, characterClosed].forEach(sprite => {
      sprite.anchor.set(0.5);
      sprite.x = app.screen.width / 2;
      sprite.y = app.screen.height / 2;
      sprite.scale.set(0.6);
    });

    app.stage.addChild(characterClosed);
  });

function setMouthOpen(open) {
  if (!characterOpen || !characterClosed) return;
  app.stage.removeChildren();
  app.stage.addChild(open ? characterOpen : characterClosed);
}

// ✅ Dragging logic
let isDragging = false;
let offset = { x: 0, y: 0 };

avatarWrapper.addEventListener('mousedown', (e) => {
  isDragging = true;
  offset.x = e.clientX - avatarWrapper.offsetLeft;
  offset.y = e.clientY - avatarWrapper.offsetTop;
  avatarWrapper.style.cursor = 'grabbing';
});

document.addEventListener('mousemove', (e) => {
  if (isDragging) {
    avatarWrapper.style.left = `${e.clientX - offset.x}px`;
    avatarWrapper.style.top = `${e.clientY - offset.y}px`;
  }
});

document.addEventListener('mouseup', () => {
  isDragging = false;
  avatarWrapper.style.cursor = 'grab';
});

// ✅ Wake word trigger
window.electronAPI.onWakeWord(() => {
  if (!isRecording) {
    console.log("✅ Wake word activated recording.");
    startRecording();
  }
});

// ✅ Ask assistant
async function askAssistant(prompt) {
  speechBubble.textContent = 'Thinking...';
  const answer = await window.api.askGPT(prompt);
  speechBubble.textContent = answer;
  await speakText(answer);
}

// ✅ ElevenLabs TTS with lip sync
async function speakText(text) {
  const voiceId = "EXAVITQu4vr4xnSDxMaL"; // Rachel
  const apiKey = "sk_1ad045161f64fb81b1f4fa728429f02e098b80e4e195b604"; // Replace with your actual key

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_monolingual_v1",
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.75
        }
      })
    });

    const audioData = await response.blob();
    const audioUrl = URL.createObjectURL(audioData);
    const audio = new Audio(audioUrl);

    isSpeaking = true;
    const flap = setInterval(() => {
      if (!isSpeaking) return;
      setMouthOpen(Math.random() > 0.5);
    }, 120);

    audio.onended = () => {
      clearInterval(flap);
      setMouthOpen(false);
      isSpeaking = false;
    };

    audio.play();
  } catch (err) {
    console.error("❌ ElevenLabs TTS error:", err);
    speechBubble.textContent = "Speech error.";
  }
}

// ✅ Mic recording with silence detection
async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];

    mediaRecorder.ondataavailable = e => audioChunks.push(e.data);

    mediaRecorder.onstop = async () => {
      const blob = new Blob(audioChunks, { type: 'audio/wav' });
      const file = new File([blob], 'recording.wav', { type: 'audio/wav' });

      const formData = new FormData();
      formData.append('audio', file);

      speechBubble.textContent = 'Transcribing...';

      try {
        const res = await fetch('http://localhost:5005/transcribe', {
          method: 'POST',
          body: formData
        });

        const data = await res.json();

        if (data.text) {
          await askAssistant(data.text);
        } else {
          speechBubble.textContent = data.error || 'Transcription failed.';
        }
      } catch (err) {
        console.error('❌ Transcription error:', err);
        speechBubble.textContent = 'Error communicating with Whisper server.';
      }
    };

    mediaRecorder.start();
    isRecording = true;
    speechBubble.textContent = 'Listening...';

    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    const dataArray = new Uint8Array(analyser.fftSize);
    source.connect(analyser);

    let silenceStart = null;
    const SILENCE_THRESHOLD = 60;
    const MAX_SILENCE_MS = 1500;

    function checkSilence() {
      analyser.getByteTimeDomainData(dataArray);

      const rms = Math.sqrt(dataArray.reduce((sum, val) => {
        const norm = (val - 128) / 128;
        return sum + norm * norm;
      }, 0) / dataArray.length);

      const volume = rms * 100;

      if (volume < SILENCE_THRESHOLD / 100) {
        if (silenceStart === null) {
          silenceStart = Date.now();
        } else if (Date.now() - silenceStart > MAX_SILENCE_MS) {
          audioContext.close();
          stopRecording();
          return;
        }
      } else {
        silenceStart = null;
      }

      if (isRecording) requestAnimationFrame(checkSilence);
    }

    checkSilence();
  } catch (err) {
    console.error('Mic access error:', err);
    speechBubble.textContent = 'Microphone error.';
  }
}

function stopRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    isRecording = false;
  }
}