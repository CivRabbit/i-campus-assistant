const fs = require('fs');
const path = require('path');
const { Porcupine } = require('@picovoice/porcupine-node');
const record = require('node-record-lpcm16');

let porcupine = null;
let mic = null;

function startWakeWordListener(accessKey, keywordPath, onWake) {
  try {
    // Initialize Porcupine with the custom keyword file
    porcupine = new Porcupine(
      accessKey,
      [path.resolve(keywordPath)],
      [0.7]
    );

    const frameLength = porcupine.frameLength;
    const sampleRate = porcupine.sampleRate;

    mic = record
      .record({
        sampleRate: sampleRate,
        threshold: 0,
        recordProgram: 'sox',
        verbose: false,
        channels: 1,
      })
      .stream();

      let audioBuffer = Buffer.alloc(0);

      mic.on('data', (data) => {
        audioBuffer = Buffer.concat([audioBuffer, data]);
      
        while (audioBuffer.length >= frameLength * 2) {
          const frameBuffer = audioBuffer.slice(0, frameLength * 2);
          audioBuffer = audioBuffer.slice(frameLength * 2);
      
          // Convert buffer to Int16Array
          const int16Array = new Int16Array(frameLength);
          for (let i = 0; i < frameLength; i++) {
            int16Array[i] = frameBuffer.readInt16LE(i * 2);
          }
      
          const keywordIndex = porcupine.process(int16Array);
          if (keywordIndex >= 0) {
            console.log("✅ Wake word detected!");
            onWake();
          }
        }
      });

    console.log("Wake word listener running...");
  } catch (err) {
    console.error("Wake word error:", err);
  }
}

function stopWakeWordListener() {
  if (mic) {
    mic.stop();
    mic = null;
  }
  if (porcupine) {
    porcupine.release();
    porcupine = null;
  }
}

module.exports = { startWakeWordListener, stopWakeWordListener };