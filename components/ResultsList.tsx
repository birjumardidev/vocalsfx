"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Download, ExternalLink, Pause, Play } from "lucide-react";
import type { SoundEffect } from "@/lib/types";

function createDemoPreview(sound: SoundEffect) {
  const sampleRate = 22050;
  const duration = Math.min(Math.max(sound.duration, 0.6), 2.5);
  const frameCount = Math.floor(sampleRate * duration);
  const samples = new Int16Array(frameCount);
  const isWhoosh = sound.tags.some((tag) => /whoosh|sweep|air/i.test(tag));
  const isBass = sound.tags.some((tag) => /bass|drop|boom/i.test(tag));

  for (let index = 0; index < frameCount; index += 1) {
    const time = index / sampleRate;
    const progress = time / duration;
    const envelope = isWhoosh
      ? Math.sin(Math.PI * progress) * 0.32
      : Math.exp(-time * (isBass ? 3.2 : 10)) * 0.72;
    const tone = isBass
      ? Math.sin(2 * Math.PI * (90 - progress * 45) * time) * 0.75
      : Math.sin(2 * Math.PI * 72 * time) * Math.exp(-time * 7) * 0.35;
    const noise = Math.random() * 2 - 1;
    const sample = isWhoosh ? noise : noise * 0.68 + tone;
    samples[index] = Math.max(-1, Math.min(1, sample * envelope)) * 32767;
  }

  const buffer = new ArrayBuffer(44 + samples.byteLength);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + samples.byteLength, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, samples.byteLength, true);
  new Int16Array(buffer, 44).set(samples);
  return new Blob([buffer], { type: "audio/wav" });
}

function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
}

function MiniWaveform({
  seed,
  progress,
  onSeek,
  name,
}: {
  seed: number;
  progress: number;
  onSeek: (progress: number) => void;
  name: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    canvas.width = 360;
    canvas.height = 50;
    context.clearRect(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < 56; index += 1) {
      const height = 6 + Math.abs(Math.sin((index + seed) * 1.13) * 18) + Math.abs(Math.cos((index + seed) * 0.39) * 8);
      context.fillStyle = index / 56 < progress ? "#00f2fe" : "#59647a";
      context.fillRect(index * 6.3, (canvas.height - height) / 2, 2.5, height);
    }
  }, [progress, seed]);

  return (
    <button
      className="mini-waveform"
      type="button"
      title={`Seek ${name} preview`}
      aria-label={`Seek ${name} preview`}
      onClick={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        onSeek(Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)));
      }}
    >
      <canvas ref={canvasRef} aria-hidden="true" />
    </button>
  );
}

export default function ResultsList({ results }: { results: SoundEffect[] }) {
  const [activeId, setActiveId] = useState<string | number | null>(null);
  const [copiedId, setCopiedId] = useState<string | number | null>(null);
  const [copyFailedId, setCopyFailedId] = useState<string | number | null>(null);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => () => {
    audioRef.current?.pause();
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  function togglePlayback(sound: SoundEffect) {
    if (activeId === sound.id) {
      audioRef.current?.pause();
      setActiveId(null);
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    const source = sound.preview_url ?? URL.createObjectURL(createDemoPreview(sound));
    if (!sound.preview_url) objectUrlRef.current = source;
    const audio = new Audio(source);
    audioRef.current = audio;
    setProgress(0);
    audio.onended = () => {
      if (objectUrlRef.current === source) {
        URL.revokeObjectURL(source);
        objectUrlRef.current = null;
      }
      setActiveId(null);
      setProgress(0);
    };
    audio.onerror = () => {
      if (objectUrlRef.current === source) {
        URL.revokeObjectURL(source);
        objectUrlRef.current = null;
      }
      setActiveId(null);
      setProgress(0);
    };
    audio.ontimeupdate = () => {
      if (audio.duration) setProgress(audio.currentTime / audio.duration);
    };
    void audio.play().then(() => setActiveId(sound.id)).catch(() => {
      if (objectUrlRef.current === source) {
        URL.revokeObjectURL(source);
        objectUrlRef.current = null;
      }
      setActiveId(null);
    });
  }

  function seekPreview(soundId: string | number, fraction: number) {
    if (activeId !== soundId || !audioRef.current?.duration) return;
    audioRef.current.currentTime = fraction * audioRef.current.duration;
    setProgress(fraction);
  }

  function downloadPreview(sound: SoundEffect) {
    if (sound.download_url) return;
    const url = URL.createObjectURL(createDemoPreview(sound));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${sound.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-demo.wav`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copyLink(sound: SoundEffect) {
    try {
      await navigator.clipboard.writeText(sound.source_url);
      setCopiedId(sound.id);
      setCopyFailedId(null);
      window.setTimeout(() => setCopiedId(null), 1600);
    } catch (error) {
      console.error("Could not copy sound link.", error);
      setCopyFailedId(sound.id);
      window.setTimeout(() => setCopyFailedId(null), 2200);
    }
  }

  return (
    <div className="results-list">
      {results.map((sound, index) => {
        const tag = sound.tags[0] ?? "sound";
        const active = activeId === sound.id;
        const isDemo = String(sound.id).startsWith("demo-");
        return (
          <article className="sound-card" key={sound.id}>
            <button
              className="play-button"
              onClick={() => togglePlayback(sound)}
              aria-label={active ? `Pause ${sound.name}` : `Play ${sound.name}`}
              title={isDemo ? "Play synthetic demo preview" : "Play preview"}
            >
              {active ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
            </button>
            <div className="sound-main">
              <div className="sound-name-row">
                <h3>{sound.name}</h3>
                <span className="source-label">{isDemo ? "DEMO" : "FREESOUND"}</span>
                {sound.match_score !== undefined && <span className="score">· {sound.match_score}% MATCH</span>}
              </div>
              <div className="sound-detail-row">
                <MiniWaveform
                  seed={index + sound.name.length}
                  progress={active ? progress : 0}
                  name={sound.name}
                  onSeek={(fraction) => seekPreview(sound.id, fraction)}
                />
                <div className="sound-tags">
                  <span className={`category-tag tone-${index % 3}`}>{tag.toUpperCase()}</span>
                  {sound.tags.slice(1, 3).map((item) => <span className="quiet-tag" key={item}>{item}</span>)}
                </div>
              </div>
            </div>
            <div className="sound-meta">
              <span className="duration">{formatDuration(sound.duration)}</span>
              <span className={`license ${isDemo ? "demo-license" : ""}`}>{sound.license}</span>
            </div>
            <div className="sound-actions">
              <button onClick={() => void copyLink(sound)} aria-label="Copy source link">
                {copiedId === sound.id ? <Check size={12} /> : <Copy size={12} />}
                {copiedId === sound.id ? "COPIED" : copyFailedId === sound.id ? "COPY FAILED" : "COPY LINK"}
              </button>
              {sound.download_url ? (
                <a href={sound.download_url} download target="_blank" rel="noreferrer" aria-label="Download preview">
                  <Download size={12} /> DOWNLOAD
                </a>
              ) : isDemo ? (
                <button onClick={() => downloadPreview(sound)} aria-label="Download synthetic preview">
                  <Download size={12} /> DOWNLOAD WAV
                </button>
              ) : (
                <span className="disabled-action"><Download size={12} /> DOWNLOAD</span>
              )}
              <a className="source-action" href={sound.source_url} target="_blank" rel="noreferrer" aria-label="View on Freesound">
                <ExternalLink size={13} />
              </a>
            </div>
          </article>
        );
      })}
    </div>
  );
}
