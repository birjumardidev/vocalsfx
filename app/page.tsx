"use client";

import { useState } from "react";
import { Activity, ArrowDown, ArrowRight, Sparkles, Waves } from "lucide-react";
import VocalRecorder from "@/components/VocalRecorder";
import ResultsList from "@/components/ResultsList";
import SiteHeader from "@/components/SiteHeader";
import { demoResults } from "@/lib/demoResults";
import { audioBlobToWavBase64 } from "@/lib/audioEncoding";
import type { SoundEffect } from "@/lib/types";

type WorkflowPhase =
  | "idle"
  | "recording"
  | "preparing"
  | "captioning"
  | "searching"
  | "complete"
  | "error";

const workflowSteps = [
  { title: "Record", detail: "Capture sound" },
  { title: "Describe", detail: "Create a sound caption" },
  { title: "Search", detail: "Find Freesound matches" },
  { title: "Complete", detail: "Show results" },
];

export default function Home() {
  const [results, setResults] = useState<SoundEffect[]>(demoResults);
  const [caption, setCaption] = useState("");
  const [searching, setSearching] = useState(false);
  const [usingDemo, setUsingDemo] = useState(true);
  const [notice, setNotice] = useState("");
  const [workflowPhase, setWorkflowPhase] = useState<WorkflowPhase>("idle");
  const [workflowError, setWorkflowError] = useState("");

  async function searchWithRecording(blob: Blob) {
    setSearching(true);
    setNotice("");
    setCaption("");
    setWorkflowError("");
    setWorkflowPhase("preparing");
    setResults(demoResults);

    try {
      const audio = await audioBlobToWavBase64(blob);
      setWorkflowPhase("captioning");

      const captionResponse = await fetch("/api/caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio }),
      });
      const captionData = (await captionResponse.json()) as { caption?: string; error?: string };
      if (!captionResponse.ok || !captionData.caption) {
        throw new Error(captionData.error ?? `Sound description failed (${captionResponse.status}).`);
      }

      const soundCaption = captionData.caption;
      setCaption(soundCaption);
      setWorkflowPhase("searching");

      const searchResponse = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: soundCaption }),
      });
      const searchData = (await searchResponse.json()) as {
        results?: SoundEffect[];
        error?: string;
      };
      if (!searchResponse.ok) {
        throw new Error(searchData.error ?? `Freesound search failed (${searchResponse.status}).`);
      }

      const soundResults = searchData.results ?? [];
      if (soundResults.length > 0) {
        setResults(soundResults);
        setUsingDemo(false);
        setNotice("Sound described. Here are matching sounds from Freesound.");
      } else {
        setResults(demoResults);
        setUsingDemo(true);
        setNotice("Freesound returned no matches for this caption. Showing demo previews.");
      }
      setWorkflowPhase("complete");
    } catch (error) {
      setUsingDemo(true);
      const message = error instanceof Error ? error.message : "Could not analyze that recording. Try again.";
      setWorkflowError(message);
      setWorkflowPhase("error");
    } finally {
      setSearching(false);
    }
  }

  function reportRecordingState(phase: "recording" | "preparing" | "error", message?: string) {
    setWorkflowError("");
    setWorkflowPhase(phase);
    if (phase === "recording") {
      setCaption("");
      setNotice("");
      return;
    }
    if (phase === "error") {
      setWorkflowError(message ?? "Could not access the microphone. Check your browser permissions and try again.");
    }
  }

  function resetSearch() {
    setCaption("");
    setResults(demoResults);
    setUsingDemo(true);
    setNotice("");
    setWorkflowError("");
    setWorkflowPhase("idle");
  }

  const activeStep = workflowPhase === "recording"
    ? 0
    : workflowPhase === "preparing" || workflowPhase === "captioning"
      ? 1
      : workflowPhase === "searching"
        ? 2
        : workflowPhase === "complete"
          ? 3
          : workflowPhase === "error"
            ? caption ? 2 : 1
            : -1;
  const workflowStatus = {
    idle: "MICROPHONE READY",
    recording: "RECORDING · STOPS AFTER SILENCE · 10 SEC MAX",
    preparing: "PREPARING YOUR RECORDING...",
    captioning: "DESCRIBING YOUR SOUND...",
    searching: "SEARCHING FREESOUND...",
    complete: "SEARCH COMPLETE · READY TO RECORD AGAIN",
    error: "PROCESSING FAILED",
  }[workflowPhase];
  return (
    <main className="shell">
      <SiteHeader active="studio" />

      <section className="intro" aria-labelledby="main-title">
        <div className="intro-main">
          <div className="eyebrow"><Sparkles size={12} /> SOUND EFFECT DISCOVERY</div>
          <h1 id="main-title">Your voice,<br /><span>translated into sound.</span></h1>
          <p className="intro-copy">
            Make a sound, and let AI find the sound effects that feel just like it.
          </p>
          <a className="hero-link" href="#studio">Open the sound studio <ArrowDown size={14} /></a>
        </div>
        <aside className="hero-note" aria-label="How sound discovery works">
          <div className="hero-note-top"><span className="hero-note-icon"><Waves size={16} /></span><span>FROM VOICE TO SOUND</span></div>
          <p>One little vocal cue can unlock a whole world of sound.</p>
          <div className="hero-note-flow">
            <span>Make a sound</span><ArrowRight size={13} /><span>Find its match</span>
          </div>
          <div className="hero-wave" aria-hidden="true">
            {Array.from({ length: 31 }, (_, index) => (
              <i key={index} style={{ height: `${9 + Math.abs(Math.sin(index * 0.71) * 29)}px` }} />
            ))}
          </div>
        </aside>
      </section>

      <VocalRecorder
        id="studio"
        onRecorded={searchWithRecording}
        onRecordingStateChange={reportRecordingState}
        onReset={resetSearch}
        busy={searching}
        activityStatus={workflowStatus}
      />

      {workflowPhase !== "idle" && (
        <section
          id="workflow"
          className={`workflow-panel workflow-${workflowPhase}${workflowPhase === "error" ? " has-error" : ""}`}
          aria-label="Search progress"
        >
          <ol className="workflow-steps">
            {workflowSteps.map((step, index) => {
              const isComplete = workflowPhase === "complete" || index < activeStep;
              const isActive = index === activeStep && workflowPhase !== "complete";
              return (
                <li
                  className={`workflow-step${isComplete ? " is-complete" : ""}${isActive ? " is-active" : ""}`}
                  key={step.title}
                  aria-current={isActive ? "step" : undefined}
                >
                  <span className="workflow-step-number">{isComplete ? "✓" : index + 1}</span>
                  <span className="workflow-step-copy">
                    <strong>{step.title}</strong>
                    <small>{step.detail}</small>
                  </span>
                </li>
              );
            })}
          </ol>
          {searching && (
            <p className="workflow-status" role="status">
              <span className="loading-spinner" />
              {workflowStatus}
            </p>
          )}
          {caption && (
            <div className="caption-card" aria-live="polite">
              <span className="caption-eyebrow"><Sparkles size={12} /> SOUND DESCRIPTION</span>
              <p>{caption}</p>
            </div>
          )}
          {workflowPhase === "error" && workflowError && (
            <p className="workflow-error" role="alert">{workflowError}</p>
          )}
        </section>
      )}

      <section id="results" className="results-section" aria-labelledby="results-title">
        <div className="results-heading">
          <div>
            <div className="eyebrow results-eyebrow"><Activity size={12} /> MATCHED FREQUENCIES</div>
            <h2 id="results-title">Sounds with similar energy <span className="match-count">{results.length.toString().padStart(2, "0")}</span></h2>
          </div>
          <div className="sort-label">SORT: <strong>RELEVANCE <span>⌄</span></strong></div>
        </div>
        {notice && <p className="search-notice" role="status">{notice}</p>}
        <ResultsList results={results} />
      </section>

      <footer className="footer">
        <span><span className="footer-dot" /> POWERED BY FREESOUND API</span>
        <span>{usingDemo ? "DEMO MODE · CONNECT A KEY FOR LIVE MATCHES" : `SHOWING 1–${results.length} OF ${results.length} MATCHES`}</span>
      </footer>
    </main>
  );
}
