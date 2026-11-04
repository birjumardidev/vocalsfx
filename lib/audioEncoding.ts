const TARGET_SAMPLE_RATE = 16_000;

export async function audioBlobToWavBase64(blob: Blob) {
  const context = new AudioContext();

  try {
    const audio = await context.decodeAudioData(await blob.arrayBuffer());
    const outputLength = Math.ceil(audio.length * TARGET_SAMPLE_RATE / audio.sampleRate);
    const samples = new Float32Array(outputLength);
    const rateRatio = audio.sampleRate / TARGET_SAMPLE_RATE;

    for (let index = 0; index < outputLength; index += 1) {
      const sourcePosition = index * rateRatio;
      const left = Math.floor(sourcePosition);
      const right = Math.min(left + 1, audio.length - 1);
      const fraction = sourcePosition - left;
      let sample = 0;

      for (let channel = 0; channel < audio.numberOfChannels; channel += 1) {
        const channelSamples = audio.getChannelData(channel);
        sample += (channelSamples[left] * (1 - fraction) + channelSamples[right] * fraction)
          / audio.numberOfChannels;
      }

      samples[index] = sample;
    }

    let peak = 0;
    for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
    if (peak < 0.003) throw new Error("No clear sound was detected. Try speaking closer to the microphone.");

    const wav = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(wav);
    const write = (offset: number, value: string) => {
      for (let index = 0; index < value.length; index += 1) {
        view.setUint8(offset + index, value.charCodeAt(index));
      }
    };

    write(0, "RIFF");
    view.setUint32(4, wav.byteLength - 8, true);
    write(8, "WAVE");
    write(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, TARGET_SAMPLE_RATE, true);
    view.setUint32(28, TARGET_SAMPLE_RATE * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    write(36, "data");
    view.setUint32(40, samples.length * 2, true);

    for (let index = 0; index < samples.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, samples[index]));
      view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    }

    const bytes = new Uint8Array(wav);
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
  } finally {
    await context.close();
  }
}
