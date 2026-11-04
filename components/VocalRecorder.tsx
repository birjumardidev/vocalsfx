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
};

type RecorderPhase = "ready" | "recording" | "processing" | "error";

export default function VocalRecorder({
  id,
  onRecorded,
  onRecordingStateChange,
  onReset,
  busy,
  activityStatus,
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
    const width = canvas.width;
    const center = width / 2;
    ctx.clearRect(0, 0, width, canvas.height);
    ctx.strokeStyle = "rgba(0, 242, 254, .55)";
    ctx.lineWidth = 2;
    for (let i = -42; i <= 42; i += 1) {
      const height = 3 + Math.abs(Math.sin(i * 0.71) * 11) + (i % 5 === 0 ? 6 : 0);
      const x = center + i * 4.1;
      ctx.beginPath();
      ctx.moveTo(x, 35 - height / 2);
      ctx.lineTo(x, 35 + height / 2);
      ctx.stroke();
    }
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
          canvasContext.clearRect(0, 0, canvas.width, canvas.height);
          canvasContext.lineWidth = 2;
          canvasContext.strokeStyle = "#00f2fe";
          for (let i = 0; i < 76; i += 1) {
            const value = Math.abs(samples[(i * 3) % samples.length] - 128) / 128;
            const height = 3 + value * 29;
            const x = 70 + i * ((canvas.width - 140) / 75);
            canvasContext.beginPath();
            canvasContext.moveTo(x, 35 - height / 2);
            canvasContext.lineTo(x, 35 + height / 2);
            canvasContext.stroke();
          }
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
        ? error.toUpperCase()
        : activityStatus;

  return (
    <section id={id} className={`recorder-panel ${isRecording ? "is-recording" : ""}`} aria-label="Vocal recording">
      <div className="recorder-heading">
        <div>
          <span>INPUT / VOCAL CUE</span>
          <small>UP TO 10 SECONDS · AUDIO IS SENT FOR DESCRIPTION</small>
        </div>
        <AudioLines size={17} className="cyan-icon" />
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
      <div className="visualizer"><canvas ref={canvasRef} width={760} height={70} aria-label="Live audio waveform" /></div>
      <div className="recorder-footer">
        <span className={phase === "error" ? "error-status" : ""}><i className={isRecording ? "pulse-dot" : ""} /> {statusText}</span>
        <span className="frequency-note">48 KHZ / MONO</span>
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
