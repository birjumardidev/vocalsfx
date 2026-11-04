import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, AudioLines, Bird, CircleDot, CloudRain, Footprints, Radio, Sparkles, Waves } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "Sound library | VocalsFX",
  description: "Browse Freesound sound-effect searches by category, or find a match from your voice.",
};

const categories = [
  { title: "Whooshes & sweeps", description: "Airy transitions, fast movement, and cinematic risers.", query: "whoosh sweep sound effect", icon: Waves, tone: "cyan" },
  { title: "Impacts & hits", description: "Punches, thuds, crashes, and sharp one-shot sounds.", query: "impact hit sound effect", icon: CircleDot, tone: "orange" },
  { title: "Nature & weather", description: "Rain, wind, thunder, water, and outdoor ambience.", query: "nature weather ambience sound", icon: CloudRain, tone: "blue" },
  { title: "Animals & creatures", description: "Calls, growls, chirps, and expressive creature sounds.", query: "animal creature sound effect", icon: Bird, tone: "violet" },
  { title: "Movement & footsteps", description: "Walking, running, rustles, and objects in motion.", query: "footsteps movement sound effect", icon: Footprints, tone: "green" },
  { title: "Electronic & sci-fi", description: "Beep, buzz, radio, laser, and futuristic textures.", query: "electronic sci fi sound effect", icon: Radio, tone: "pink" },
];

export default function LibraryPage() {
  return (
    <main className="shell">
      <SiteHeader active="library" />

      <section className="content-hero library-hero">
        <div className="eyebrow"><Sparkles size={13} /> EXPLORE BY FEEL</div>
        <h1>Find your next<br /><span>favorite sound.</span></h1>
        <p>Browse a sound family on Freesound, or let your voice guide the search.</p>
        <Link className="primary-link" href="/">Find a sound with your voice <ArrowUpRight size={15} /></Link>
      </section>

      <section className="library-section" aria-labelledby="library-title">
        <div className="library-heading">
          <div>
            <span className="eyebrow"><AudioLines size={13} /> SOUND FAMILIES</span>
            <h2 id="library-title">What are you looking for?</h2>
          </div>
          <p>Choose a category to open matching sounds on Freesound.</p>
        </div>
        <div className="category-grid">
          {categories.map(({ title, description, query, icon: Icon, tone }) => (
            <a
              className="category-card"
              href={`https://freesound.org/search/?q=${encodeURIComponent(query)}`}
              target="_blank"
              rel="noreferrer"
              key={title}
            >
              <span className={`category-icon tone-${tone}`}><Icon size={19} /></span>
              <span className="category-copy">
                <strong>{title}</strong>
                <small>{description}</small>
              </span>
              <ArrowUpRight className="category-arrow" size={16} />
            </a>
          ))}
        </div>
        <p className="library-note">These links open Freesound search results in a new tab. Sound availability, licensing, and downloads are managed by Freesound and each sound’s creator.</p>
      </section>
    </main>
  );
}
