import { AudioClassifier, FilesetResolver } from "@mediapipe/tasks-audio";

export default async function runSpeechDetector(
  onChange: (speaking: boolean) => void
) {
  const fileset = await FilesetResolver.forAudioTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio@0.10.0/wasm"
  );
  const classifier = await AudioClassifier.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite",
    },
  });

  /* microphone */
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const ctx = new AudioContext({ sampleRate: 16000 });
  const source = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);

  let last = 0;
  proc.onaudioprocess = (e) => {
    const now = performance.now();
    if (now - last < 500) return; // throttle
    last = now;

    const data = e.inputBuffer.getChannelData(0);
    const results = classifier.classify(data, 16000);
    const best = results[0]?.classifications[0]?.categories[0];
    onChange(best?.categoryName === "Speech" && best.score > 0.5);
  };

  source.connect(proc);
  proc.connect(ctx.destination);

  return () => {
    proc.disconnect();
    source.disconnect();
    ctx.close();
    stream.getTracks().forEach((t) => t.stop());
  };
}
