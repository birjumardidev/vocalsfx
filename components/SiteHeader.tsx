import Link from "next/link";
import { AudioLines } from "lucide-react";

type SiteSection = "studio" | "how-it-works" | "library";

export default function SiteHeader({ active }: { active: SiteSection }) {
  return (
    <header className="topbar">
      <Link className="brand" href="/" aria-label="VocalsFX home">
        <span className="brand-mark"><AudioLines size={17} strokeWidth={2.2} /></span>
        <span className="brand-name">VOCALS<span>FX</span></span>
      </Link>
      <nav className="main-nav" aria-label="Main navigation">
        <Link href="/" aria-current={active === "studio" ? "page" : undefined}>Studio</Link>
        <Link href="/how-it-works" aria-current={active === "how-it-works" ? "page" : undefined}>How it works</Link>
        <Link href="/library" aria-current={active === "library" ? "page" : undefined}>Sound library</Link>
      </nav>
    </header>
  );
}
