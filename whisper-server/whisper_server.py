from flask import Flask, request, jsonify
import whisper
import tempfile
import os

app = Flask(__name__)
model = whisper.load_model("base")

@app.route("/transcribe", methods=["POST"])
def transcribe_audio():
    if "audio" not in request.files:
        print("⚠️ No audio file received.")
        return jsonify({"error": "Missing audio file"}), 400

    try:
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_audio:
            request.files["audio"].save(temp_audio.name)
            print(f"🎧 Received audio file: {temp_audio.name}")

            # Transcribe using Whisper
            result = model.transcribe(temp_audio.name)
            os.unlink(temp_audio.name)

            print("✅ Transcription result:", result["text"])
            return jsonify({"text": result["text"]})

    except Exception as e:
        print("❌ Whisper error:", e)
        return jsonify({"error": str(e)}), 500

# ✅ This MUST be at the global indentation level, not inside the route!
if __name__ == "__main__":
    print("🔊 Starting Whisper server on http://localhost:5005")
    app.run(port=5005)