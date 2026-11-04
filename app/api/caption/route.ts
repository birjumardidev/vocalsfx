import { NextResponse } from "next/server";

type CaptionRequest = {
  audio?: unknown;
};

type GeminiResponse = {
  promptFeedback?: {
    blockReason?: string;
  };
  candidates?: Array<{
    finishReason?: string;
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

const GEMINI_MODEL = "gemini-3.6-flash";
const MAX_AUDIO_BASE64_LENGTH = 900_000;
const CAPTION_PROMPT = [
  "Listen to the audio and identify the sound effect being imitated.",
  "Return one concrete Freesound search phrase of 2 to 6 words.",
  "Include the sound source or action and an audible quality when possible.",
  "Use one phrase, not alternatives; never end with a connector such as 'or', 'and', or 'with'.",
  "Describe the sound, not the recording. Do not transcribe speech.",
  "Return only the phrase: no introduction, label, quotes, markdown, or explanation.",
].join(" ");
const RETRY_PROMPT = [
  "Listen again and identify the specific sound source or action and its texture.",
  "Return only a useful 2 to 6 word sound-effects search phrase.",
  "Give one complete phrase, not a list of alternatives. Do not end with a connecting word.",
  "Do not say audio, recording, sound, or noise by themselves.",
  "No introduction, labels, quotes, markdown, or explanation.",
].join(" ");
const NON_DESCRIPTIVE_WORDS = new Set([
  "a", "an", "and", "audio", "clip", "description", "heard", "hear", "is", "it",
  "noise", "of", "recording", "sound", "the", "this",
]);
const TRAILING_CONNECTORS = new Set([
  "a", "an", "and", "as", "at", "by", "for", "from", "in", "into", "like",
  "of", "on", "or", "the", "to", "with",
]);

function cleanCaption(text: string) {
  const cleaned = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_`#>]/g, "")
    .replace(/^\s*(?:caption|description|sound(?: effects?)? phrase|search phrase)\s*:\s*/i, "")
    .replace(/^\s*(?:the|this)\s+(?:audio|recording)\b(?:\s+(?:is|contains|features|sounds like))?\s*[:,.-]?\s*/i, "")
    .replace(/^\s*(?:the|this)\s+sound\s+(?:is|sounds like)\s+/i, "")
    .replace(/^\s*(?:sound description|description|caption)\s*[:,.-]\s*/i, "")
    .replace(/["“”]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[,.;:!?-]+|[,.;:!?-]+$/g, "");
  const words = cleaned.split(/\s+/).filter(Boolean).slice(0, 6);
  while (words.length > 1 && TRAILING_CONNECTORS.has(words[words.length - 1].toLowerCase())) {
    words.pop();
  }
  return words.join(" ");
}

function isUsefulCaption(caption: string) {
  const informativeWords = caption
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => !NON_DESCRIPTIVE_WORDS.has(word.replace(/[^a-z0-9'-]/g, "")));
  return informativeWords.length >= 1;
}

async function generateCaption(audio: string, prompt: string, apiKey: string) {
  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: "audio/wav", data: audio } },
          ],
        }],
        generationConfig: { maxOutputTokens: 100 },
      }),
    },
  );
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Audio description is not configured. Check the server configuration." },
      { status: 503 },
    );
  }

  let audio: string;
  try {
    const body = (await request.json()) as CaptionRequest;
    if (typeof body.audio !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.audio)) {
      return NextResponse.json({ error: "A valid WAV audio recording is required." }, { status: 400 });
    }
    if (body.audio.length > MAX_AUDIO_BASE64_LENGTH) {
      return NextResponse.json(
        { error: "The recording is too large. Please record a shorter sound." },
        { status: 413 },
      );
    }
    audio = body.audio;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    let response = await generateCaption(audio, CAPTION_PROMPT, apiKey);

    if (!response.ok) {
      const status = response.status === 401 || response.status === 403 ? 503 : response.status;
      const error = status === 503
        ? "Audio description service rejected its credentials. Check the server configuration."
        : status === 429
          ? "Audio description is temporarily rate limiting requests. Please try again later."
          : `Audio description failed (${response.status}).`;
      return NextResponse.json({ error }, { status });
    }

    let data = (await response.json()) as GeminiResponse;
    let candidate = data.candidates?.[0];
    let generatedCaption = candidate?.content?.parts
      ?.map((part) => part.text ?? "")
      .join(" ")
      .trim();
    let caption = generatedCaption ? cleanCaption(generatedCaption) : "";

    if (
      !data.promptFeedback?.blockReason
      && candidate?.finishReason !== "SAFETY"
      && candidate?.finishReason !== "RECITATION"
      && candidate?.finishReason !== "PROHIBITED_CONTENT"
      && (!caption || !isUsefulCaption(caption))
    ) {
      response = await generateCaption(audio, RETRY_PROMPT, apiKey);
      if (!response.ok) {
        const status = response.status === 401 || response.status === 403 ? 503 : response.status;
        const error = status === 503
          ? "Audio description service rejected its credentials. Check the server configuration."
          : status === 429
            ? "Audio description is temporarily rate limiting requests. Please try again later."
            : `Audio description failed (${response.status}).`;
        return NextResponse.json({ error }, { status });
      }

      data = (await response.json()) as GeminiResponse;
      candidate = data.candidates?.[0];
      generatedCaption = candidate?.content?.parts
        ?.map((part) => part.text ?? "")
        .join(" ")
        .trim();
      caption = generatedCaption ? cleanCaption(generatedCaption) : "";
    }

    if (!caption || !isUsefulCaption(caption)) {
      const blockReason = data.promptFeedback?.blockReason;
      if (blockReason) {
        return NextResponse.json(
          { error: `This audio request was blocked (${blockReason}). Try recording a different, clear sound.` },
          { status: 422 },
        );
      }

      const finishReason = candidate?.finishReason;
      if (finishReason === "SAFETY" || finishReason === "RECITATION" || finishReason === "PROHIBITED_CONTENT") {
        return NextResponse.json(
          { error: `This audio could not be described (${finishReason}). Try recording a different sound.` },
          { status: 422 },
        );
      }

      return NextResponse.json(
        {
          error: finishReason
            ? `No sound description was returned (${finishReason}). Please try a clearer recording.`
            : "The recording did not produce a clear sound description. Try a clearer, more distinct vocal sound.",
        },
        { status: 422 },
      );
    }

    return NextResponse.json({ caption });
  } catch (error) {
    console.error("Audio description request failed.", error);
    return NextResponse.json({ error: "Could not generate a sound description. Please try again." }, { status: 502 });
  }
}
