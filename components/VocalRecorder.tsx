"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AudioLines, Mic, RotateCcw } from "lucide-react";

const MAX_RECORDING_MS = 10_000;
const END_SILENCE_MS = 1_000;

type VocalRecorderProps = {
  id?: string;
  onRecorded: (blob: Blob) => Promise<void>;
  onRecordingStateChange: (phase: "recording" | "preparing" | "error", message?: string) => void;
  onReset: () => void;
  busy: boolean;
  activityStatus: string;
  caption: string;
  workflowError: string;
};

type RecorderPhase = "ready" | "recording" | "processing" | "error";

function drawWaveform(ctx: CanvasRenderingContext2D, samples?: Uint8Array, level = 0) {
  const width = ctx.canvas.width;
  const center = ctx.canvas.height / 2;
  const pointCount = 128;
  const amplitudes = Array.from({ length: pointCount }, (_, index) => {
    if (!samples) {
      const position = index / (pointCount - 1);
      const envelope = Math.pow(Math.sin(Math.PI * position), 0.65);
      const detail = 0.25 + Math.abs(
        Math.sin(index * 0.19) * 0.45 + Math.sin(index * 0.47) * 0.3,
      );
      return 2 + envelope * detail * 21;
    }

    const start = Math.floor(index * samples.length / pointCount);
    const end = Math.max(start + 1, Math.floor((index + 1) * samples.length / pointCount));
    let peak = 0;
    for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
      peak = Math.max(peak, Math.abs(samples[sampleIndex] - 128) / 128);
    }
    return Math.min(29, Math.max(2, peak * Math.min(200, 8 / Math.max(level, 0.04))));
  });

  ctx.clearRect(0, 0, width, ctx.canvas.height);
  ctx.beginPath();
  amplitudes.forEach((amplitude, index) => {
    const x = (index / (pointCount - 1)) * width;
    const y = center - amplitude;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  for (let index = amplitudes.length - 1; index >= 0; index -= 1) {
    const x = (index / (pointCount - 1)) * width;
    ctx.lineTo(x, center + amplitudes[index]);
  }
  ctx.closePath();
  ctx.strokeStyle = "#A4B9DD";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.shadowColor = "rgba(164, 185, 221, .55)";
  ctx.shadowBlur = 7;
  ctx.stroke();
  ctx.shadowBlur = 0;
}

export default function VocalRecorder({
  id,
  onRecorded,
  onRecordingStateChange,
  onReset,
  busy,
  activityStatus,
  caption,
  workflowError,
}: VocalRecorderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const animationRef = useRef<number>(0);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingRef = useRef(false);
  const discardRecordingRef = useRef(false);
  const sawSoundRef = useRef(false);
  const quietSinceRef = useRef<number | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const [phase, setPhase] = useState<RecorderPhase>("ready");
  const [error, setError] = useState("");

  const stopRecording = useCallback(() => {
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  const drawIdle = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    drawWaveform(ctx);
  }, []);

  const cleanup = useCallback(() => {
    cancelAnimationFrame(animationRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (contextRef.current && contextRef.current.state !== "closed") {
      void contextRef.current.close();
    }
    contextRef.current = null;
  }, []);

  const startRecording = useCallback(async () => {
    setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone recording is not supported in this browser.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const context = new AudioContext();
      contextRef.current = context;
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      context.createMediaStreamSource(stream).connect(analyser);
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      discardRecordingRef.current = false;
      sawSoundRef.current = false;
      quietSinceRef.current = null;
      recordingRef.current = true;
      setPhase("recording");
      onRecordingStateChange("recording");
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        recordingRef.current = false;
        cleanup();
        if (discardRecordingRef.current) {
          discardRecordingRef.current = false;
          setPhase("ready");
          return;
        }
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (!blob.size) {
          setPhase("error");
          setError("No audio was captured. Please try recording again.");
          onRecordingStateChange("error", "No audio was captured. Please try recording again.");
          return;
        }
        setPhase("processing");
        onRecordingStateChange("preparing");
        void onRecorded(blob).finally(() => setPhase("ready"));
      };
      recorder.start();

      const canvas = canvasRef.current;
      const canvasContext = canvas?.getContext("2d");
      const samples = new Uint8Array(analyser.fftSize);
      const render = () => {
        if (!recordingRef.current) return;
        analyser.getByteTimeDomainData(samples);
        let energy = 0;
        for (const sample of samples) {
          const value = (sample - 128) / 128;
          energy += value * value;
        }
        const level = Math.sqrt(energy / samples.length);
        if (level > 0.035) {
          sawSoundRef.current = true;
          quietSinceRef.current = null;
        } else if (sawSoundRef.current) {
          quietSinceRef.current ??= performance.now();
          if (performance.now() - quietSinceRef.current > END_SILENCE_MS) {
            stopRecording();
            return;
          }
        }

        if (canvas && canvasContext) {
          drawWaveform(canvasContext, samples, level);
        }
        animationRef.current = requestAnimationFrame(render);
      };
      render();
      stopTimerRef.current = setTimeout(stopRecording, MAX_RECORDING_MS);
    } catch (cause) {
      cleanup();
      recordingRef.current = false;
      setPhase("error");
      const message = cause instanceof Error ? cause.message : "Could not access the microphone.";
      onRecordingStateChange("error", message);
      setError(message);
    }
  }, [cleanup, onRecorded, onRecordingStateChange, stopRecording]);

  useEffect(() => {
    drawIdle();
    return () => {
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
      cleanup();
    };
  }, [cleanup, drawIdle]);

  const isRecording = phase === "recording";
  const statusText = isRecording
    ? "RECORDING · STOPS AFTER SILENCE · 10 SEC MAX"
    : busy || phase === "processing"
      ? activityStatus
      : phase === "error"
        ? "RECORDING ERROR"
        : activityStatus;

  return (
    <section id={id} className={`recorder-panel ${isRecording ? "is-recording" : ""}`} aria-label="Vocal recording">
      <div className="recorder-heading">
        <div>
          <span>YOUR SOUND, YOUR SEARCH</span>
          <small>UP TO 10 SECONDS · AUDIO IS SENT FOR DESCRIPTION</small>
        </div>
        <span className="recorder-live-label"><i className={isRecording ? "pulse-dot" : ""} />{isRecording ? "RECORDING" : busy ? "PROCESSING" : "READY"}</span>
      </div>
      <div className="recorder-stage">
        <div className="orbit orbit-one" />
        <div className="orbit orbit-two" />
        <div className="orbit orbit-three" />
        <button
          className={`record-button ${isRecording ? "recording" : ""}`}
          onClick={isRecording ? stopRecording : startRecording}
          disabled={busy || phase === "processing"}
          aria-label={isRecording ? "Stop recording" : "Start recording"}
        >
          <span className="record-button-core">
            {isRecording ? <span className="stop-square" /> : <Mic size={24} strokeWidth={1.8} />}
          </span>
        </button>
        <span className="record-hint">
          {isRecording ? "TAP TO FINISH" : busy ? "PLEASE WAIT" : "TAP TO RECORD"}
        </span>
      </div>
      <div className={`visualizer${isRecording ? " is-live" : ""}`}>
        <canvas ref={canvasRef} width={760} height={70} aria-label="Live audio waveform" />
      </div>
      {caption && (
        <div className="caption-card" aria-live="polite">
          <div className="caption-terminal-header">
            <span className="caption-eyebrow"><AudioLines size={12} /> OUTPUT / SEARCH PHRASE</span>
            <span className="caption-category">[ INPUT: VOCAL ]</span>
          </div>
          <p className="caption-output">{caption}</p>
        </div>
      )}
      {workflowError && <p className="workflow-error" role="alert">{workflowError}</p>}
      <div className="recorder-footer">
        <span className={`recorder-status${phase === "error" || workflowError ? " error-status" : ""}`} role={busy ? "status" : undefined}>
          <i className={isRecording || busy ? "pulse-dot" : ""} /> {statusText}
        </span>
        <span className="recorder-technical">
          <span>48 KHZ</span>
          <span>MONO</span>
          <span>10 SEC MAX</span>
        </span>
        <button className="reset-button" onClick={() => {
          discardRecordingRef.current = true;
          stopRecording();
          setPhase("ready");
          setError("");
          onReset();
        }}>
          <RotateCcw size={12} /> RESET
        </button>
      </div>
    </section>
  );
}
