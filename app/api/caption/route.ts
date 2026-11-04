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
    const response = await fetch(
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
              {
                text: "Describe the audible sound as a sound-effects search phrase under six words. Use specific sound and texture terms. Do not transcribe speech. Return only the phrase.",
              },
              { inline_data: { mime_type: "audio/wav", data: audio } },
            ],
          }],
          generationConfig: { maxOutputTokens: 100 },
        }),
      },
    );

    if (!response.ok) {
      const status = response.status === 401 || response.status === 403 ? 503 : response.status;
      const error = status === 503
        ? "Audio description service rejected its credentials. Check the server configuration."
        : status === 429
          ? "Audio description is temporarily rate limiting requests. Please try again later."
          : `Audio description failed (${response.status}).`;
      return NextResponse.json({ error }, { status });
    }

    const data = (await response.json()) as GeminiResponse;
    const candidate = data.candidates?.[0];
    const generatedCaption = candidate?.content?.parts
      ?.map((part) => part.text ?? "")
      .join(" ")
      .trim()
      .replace(/\s+/g, " ");
    const caption = generatedCaption?.split(" ").slice(0, 6).join(" ");

    if (!caption) {
      const blockReason = data.promptFeedback?.blockReason;
      if (blockReason) {
        return NextResponse.json(
          { error: `This audio request was blocked (${blockReason}). Try recording a different, clear sound.` },
          { status: 422 },
        );
      }

      const finishReason = candidate?.finishReason;
      if (finishReason === "MAX_TOKENS") {
        return NextResponse.json(
          { error: "The audio description could not be completed. Please try again." },
          { status: 502 },
        );
      }
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
            : "No sound description was returned. Check that the recording contains audible sound, then try again.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ caption });
  } catch (error) {
    console.error("Audio description request failed.", error);
    return NextResponse.json({ error: "Could not generate a sound description. Please try again." }, { status: 502 });
  }
}
