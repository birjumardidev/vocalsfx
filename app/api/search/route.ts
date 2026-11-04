import { NextResponse } from "next/server";
import type { SoundEffect } from "@/lib/types";

type FreesoundResult = {
  id: number;
  name: string;
  duration: number;
  tags?: string[];
  license?: string;
  previews?: { "preview-hq-mp3"?: string; "preview-lq-mp3"?: string };
  url?: string;
};

type FreesoundResponse = {
  results?: FreesoundResult[];
};

type SearchRequest = {
  query?: unknown;
};

const FREESOUND_REQUEST_INTERVAL_MS = 2000;
const RATE_LIMIT_FALLBACK_MS = 60_000;

let requestQueue: Promise<void> = Promise.resolve();
let lastRequestStartedAt = 0;
let blockedUntil = 0;

class FreesoundRateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("Freesound rate limit reached.");
  }
}

function getRetryAfterMs(value: string | null, now: number) {
  if (value) {
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;

    const retryAt = Date.parse(value);
    if (Number.isFinite(retryAt)) return Math.max(0, retryAt - now);
  }

  return RATE_LIMIT_FALLBACK_MS;
}

async function fetchFreesound(url: string, token: string) {
  let release!: () => void;
  const currentTurn = new Promise<void>((resolve) => {
    release = resolve;
  });
  const previousTurn = requestQueue;
  requestQueue = previousTurn.then(() => currentTurn);
  await previousTurn;

  try {
    const now = Date.now();
    if (blockedUntil > now) {
      throw new FreesoundRateLimitError(Math.ceil((blockedUntil - now) / 1000));
    }

    const delay = lastRequestStartedAt + FREESOUND_REQUEST_INTERVAL_MS - now;
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));

    const readyAt = Date.now();
    if (blockedUntil > readyAt) {
      throw new FreesoundRateLimitError(Math.ceil((blockedUntil - readyAt) / 1000));
    }

    lastRequestStartedAt = readyAt;
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Token ${token}`,
      },
      next: { revalidate: 300 },
    });

    if (response.status === 429) {
      const now = Date.now();
      const retryAfterMs = getRetryAfterMs(response.headers.get("Retry-After"), now);
      blockedUntil = Math.max(blockedUntil, now + retryAfterMs);
      throw new FreesoundRateLimitError(Math.max(1, Math.ceil(retryAfterMs / 1000)));
    }

    return response;
  } finally {
    release();
  }
}

function formatLicense(license?: string) {
  if (!license) return "Unknown";
  if (license.includes("/publicdomain/zero")) return "CC0";
  if (license.includes("/licenses/by-nc")) return "CC-BY-NC";
  if (license.includes("/licenses/by-sa")) return "CC-BY-SA";
  if (license.includes("/licenses/by/")) return "CC-BY";
  return "CC";
}

export async function POST(request: Request) {
  const freesoundToken = process.env.FREESOUND_API_KEY;
  if (!freesoundToken) {
    return NextResponse.json({ error: "Freesound API key is not configured." }, { status: 503 });
  }

  let searchQuery: string;
  try {
    const body = (await request.json()) as SearchRequest;
    if (typeof body.query !== "string" || !body.query.trim()) {
      return NextResponse.json({ error: "A search query is required." }, { status: 400 });
    }
    searchQuery = body.query.trim().slice(0, 100);
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    const results: SoundEffect[] = [];
    const seenIds = new Set<number>();
    const params = new URLSearchParams({
      query: searchQuery,
      fields: "id,name,duration,tags,license,previews,url",
      page_size: "10",
    });
    const response = await fetchFreesound(
      `https://freesound.org/apiv2/search/?${params}`,
      freesoundToken,
    );
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return NextResponse.json(
          {
            code: "FREESOUND_AUTH_REJECTED",
            error:
              "Freesound denied API access. Verify that .env.local contains the active Client secret/API key, then restart the Next.js server.",
          },
          { status: 502 },
        );
      }
      return NextResponse.json(
        { code: "FREESOUND_REQUEST_FAILED", error: `Freesound search failed (${response.status}).` },
        { status: response.status },
      );
    }

    const data = (await response.json()) as FreesoundResponse;
    for (const sound of data.results ?? []) {
      if (seenIds.has(sound.id)) continue;
      seenIds.add(sound.id);
      results.push({
        id: sound.id,
        name: sound.name,
        duration: sound.duration,
        preview_url: sound.previews?.["preview-hq-mp3"] ?? sound.previews?.["preview-lq-mp3"] ?? null,
        tags: sound.tags ?? [],
        license: formatLicense(sound.license),
        download_url: sound.previews?.["preview-hq-mp3"] ?? sound.previews?.["preview-lq-mp3"] ?? null,
        source_url: `https://freesound.org/sounds/${sound.id}/`,
      });
    }

    return NextResponse.json({ results, queries: [searchQuery] });
  } catch (error) {
    if (error instanceof FreesoundRateLimitError) {
      return NextResponse.json(
        {
          code: "FREESOUND_RATE_LIMITED",
          error: `Freesound is temporarily rate limiting searches. Please try again in ${error.retryAfterSeconds} seconds.`,
        },
        { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } },
      );
    }

    console.error("Freesound API request failed.", error);
    return NextResponse.json({ error: "Could not reach Freesound." }, { status: 502 });
  }
}
