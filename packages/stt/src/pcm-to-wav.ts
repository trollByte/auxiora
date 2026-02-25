/**
 * Wraps raw PCM audio data with a WAV header (44 bytes).
 * Assumes 16-bit mono PCM.
 */
export function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcm.length;
  const headerSize = 44;

  const header = Buffer.alloc(headerSize);

  // RIFF header
  header.write('RIFF', 0);
  header.writeUInt32LE(dataSize + headerSize - 8, 4);
  header.write('WAVE', 8);

  // fmt subchunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);            // subchunk1 size (PCM = 16)
  header.writeUInt16LE(1, 20);             // audio format (PCM = 1)
  header.writeUInt16LE(numChannels, 22);   // number of channels
  header.writeUInt32LE(sampleRate, 24);    // sample rate
  header.writeUInt32LE(byteRate, 28);      // byte rate
  header.writeUInt16LE(blockAlign, 32);    // block align
  header.writeUInt16LE(bitsPerSample, 34); // bits per sample

  // data subchunk
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcm]);
}
