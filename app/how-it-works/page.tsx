import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, AudioLines, Captions, Search, ShieldCheck } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "How it works | VocalsFX",
  description: "See how VocalsFX turns a recorded vocal cue into sound-effect search results.",
};

const steps = [
  {
    number: "01",
    icon: AudioLines,
    title: "Make a sound",
    description: "Record a short vocal cue with your microphone. Your recording is converted to audio in your browser.",
  },
  {
    number: "02",
    icon: Captions,
    title: "Get a concise caption",
    description: "An AI service describes the sound in a short phrase, such as “soft cat meow”.",
  },
  {
    number: "03",
    icon: Search,
    title: "Find sounds on Freesound",
    description: "VocalsFX searches Freesound with that caption and shows sound previews, tags, licenses, and source links.",
  },
];

export default function HowItWorksPage() {
  return (
    <main className="shell">
      <SiteHeader active="how-it-works" />

      <section className="content-hero">
        <div className="eyebrow"><AudioLines size={13} /> THE PROCESS</div>
        <h1>From a sound you make<br /><span>to a sound you can use.</span></h1>
        <p>VocalsFX turns a quick vocal imitation into a useful starting point for sound discovery.</p>
      </section>

      <section className="process-grid" aria-label="How VocalsFX works">
        {steps.map(({ number, icon: Icon, title, description }) => (
          <article className="process-card" key={number}>
            <div className="process-card-top">
              <span className="process-number">{number}</span>
              <span className="process-icon"><Icon size={18} /></span>
            </div>
            <h2>{title}</h2>
            <p>{description}</p>
          </article>
        ))}
      </section>

      <aside className="privacy-note">
        <ShieldCheck size={19} />
        <div>
          <h2>A note about your recording</h2>
          <p>Your audio is sent to an AI service to generate the caption. Freesound receives the caption as a text search—not your recording. API keys stay on the server.</p>
        </div>
      </aside>

      <section className="page-cta">
        <div>
          <span className="eyebrow">READY WHEN YOU ARE</span>
          <h2>Try it with your own sound.</h2>
        </div>
        <Link className="primary-link" href="/#studio">Open the studio <ArrowRight size={15} /></Link>
      </section>
    </main>
  );
}
