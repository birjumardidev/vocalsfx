# VocalsFX

VocalsFX records a short vocal imitation, sends it to Gemini for an audio caption, and searches Freesound using that caption. Freesound's search is text-based, so the results are caption-guided library matches, not direct audio-vector comparisons against every Freesound recording.

## Run locally

```powershell
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Microphone access requires localhost or HTTPS. Recordings are converted to WAV in the browser and sent to the app server for Gemini captioning. The caption appears in the interface before Freesound search starts, and the progress panel shows each step through completion.

## API keys

Copy `.env.example` to `.env.local` and set:

- `GEMINI_API_KEY` to a key from Google AI Studio.
- `FREESOUND_API_KEY` to a Freesound API key.

Both keys stay on the server and are not sent to the browser. Gemini receives the audio recording to generate its caption. Without either key, the app shows clearly labeled demo entries with synthetic preview audio.

## Checks

```powershell
npm run build
```
