export function preemphasis(
  signal: Float32Array,
  alpha: number = 0.97
): Float32Array {
  const output = new Float32Array(signal.length);
  output[0] = signal[0];
  for (let i = 1; i < signal.length; i++) {
    output[i] = signal[i] - alpha * signal[i - 1];
  }
  return output;
}

export function normalize(
  signal: Float32Array,
  targetRMS: number = 0.1
): Float32Array {
  let sum = 0;
  for (let i = 0; i < signal.length; i++) {
    sum += signal[i] * signal[i];
  }
  const currentRMS = Math.sqrt(sum / signal.length);
  if (currentRMS < 1e-10) {
    return signal;
  }
  const scale = targetRMS / currentRMS;
  const output = new Float32Array(signal.length);
  for (let i = 0; i < signal.length; i++) {
    output[i] = signal[i] * scale;
  }
  return output;
}

export function trimSilence(
  signal: Float32Array,
  threshold: number = 0.01,
  frameSize: number = 256
): { trimmed: Float32Array; startIndex: number; endIndex: number } {
  const n = signal.length;
  let startIndex = 0;
  let endIndex = n;

  for (let i = 0; i < n; i += frameSize) {
    const frameEnd = Math.min(i + frameSize, n);
    let energy = 0;
    for (let j = i; j < frameEnd; j++) {
      energy += signal[j] * signal[j];
    }
    energy = Math.sqrt(energy / (frameEnd - i));
    if (energy > threshold) {
      startIndex = i;
      break;
    }
  }

  for (let i = n - frameSize; i >= 0; i -= frameSize) {
    const frameEnd = Math.min(i + frameSize, n);
    let energy = 0;
    for (let j = i; j < frameEnd; j++) {
      energy += signal[j] * signal[j];
    }
    energy = Math.sqrt(energy / (frameEnd - i));
    if (energy > threshold) {
      endIndex = frameEnd;
      break;
    }
  }

  if (startIndex >= endIndex) {
    return { trimmed: signal, startIndex: 0, endIndex: n };
  }

  const trimmed = signal.slice(startIndex, endIndex);
  return { trimmed, startIndex, endIndex };
}

export function resample(
  signal: Float32Array,
  sourceRate: number,
  targetRate: number
): Float32Array {
  if (sourceRate === targetRate) {
    return signal;
  }
  const ratio = targetRate / sourceRate;
  const newLength = Math.floor(signal.length * ratio);
  const output = new Float32Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const position = i / ratio;
    const index = Math.floor(position);
    const frac = position - index;

    if (index >= signal.length - 1) {
      output[i] = signal[signal.length - 1];
    } else {
      output[i] = signal[index] * (1 - frac) + signal[index + 1] * frac;
    }
  }

  return output;
}

function dct(input: number[]): number[] {
  const n = input.length;
  const output = new Array(n).fill(0);
  for (let k = 0; k < n; k++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += input[i] * Math.cos((Math.PI * k * (2 * i + 1)) / (2 * n));
    }
    output[k] = sum * 2;
  }
  return output;
}

function melFilterBank(
  nFilters: number,
  nFFT: number,
  sampleRate: number
): number[][] {
  const melMin = 0;
  const melMax = 2595 * Math.log10(1 + sampleRate / 2 / 700);
  const melPoints = new Array(nFilters + 2);
  const freqPoints = new Array(nFilters + 2);

  for (let i = 0; i < nFilters + 2; i++) {
    melPoints[i] = melMin + (melMax - melMin) * (i / (nFilters + 1));
    freqPoints[i] = 700 * (Math.pow(10, melPoints[i] / 2595) - 1);
  }

  const fftBins = freqPoints.map((f) => Math.floor((nFFT / 2 + 1) * (f / sampleRate)));
  const filters: number[][] = [];

  for (let i = 1; i <= nFilters; i++) {
    const filter = new Array(nFFT / 2 + 1).fill(0);
    const left = fftBins[i - 1];
    const mid = fftBins[i];
    const right = fftBins[i + 1];

    for (let j = left; j < mid; j++) {
      filter[j] = (j - left) / (mid - left);
    }
    for (let j = mid; j < right; j++) {
      filter[j] = (right - j) / (right - mid);
    }
    filters.push(filter);
  }

  return filters;
}

export function computeMFCC(
  signal: Float32Array,
  sampleRate: number,
  nMFCC: number = 13,
  nFFT: number = 512,
  hopLength: number = 256
): number[][] {
  const nFilters = 26;
  const filters = melFilterBank(nFilters, nFFT, sampleRate);
  const mfcc: number[][] = [];
  const window = new Array(nFFT);

  for (let i = 0; i < nFFT; i++) {
    window[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (nFFT - 1));
  }

  for (let start = 0; start + nFFT <= signal.length; start += hopLength) {
    const frame = new Float32Array(nFFT);
    for (let i = 0; i < nFFT; i++) {
      frame[i] = signal[start + i] * window[i];
    }

    const real = new Float32Array(nFFT);
    const imag = new Float32Array(nFFT);
    for (let i = 0; i < nFFT; i++) {
      real[i] = frame[i];
    }

    const n = nFFT;
    const bits = Math.log2(n);

    for (let i = 1; i < n; i++) {
      let j = 0;
      for (let k = 0; k < bits; k++) {
        j |= ((i >> k) & 1) << (bits - 1 - k);
      }
      if (j > i) {
        [real[i], real[j]] = [real[j], real[i]];
        [imag[i], imag[j]] = [imag[j], imag[i]];
      }
    }

    for (let size = 2; size <= n; size <<= 1) {
      const halfSize = size / 2;
      const angleStep = (2 * Math.PI) / size;

      for (let i = 0; i < n; i += size) {
        for (let j = 0; j < halfSize; j++) {
          const angle = -j * angleStep;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);

          const tr = real[i + j + halfSize] * cos - imag[i + j + halfSize] * sin;
          const ti = real[i + j + halfSize] * sin + imag[i + j + halfSize] * cos;

          real[i + j + halfSize] = real[i + j] - tr;
          imag[i + j + halfSize] = imag[i + j] - ti;
          real[i + j] += tr;
          imag[i + j] += ti;
        }
      }
    }

    const spectrum = new Array(nFFT / 2 + 1);
    for (let i = 0; i <= nFFT / 2; i++) {
      spectrum[i] = real[i] * real[i] + imag[i] * imag[i];
    }

    const filterBank = new Array(nFilters).fill(0);
    for (let f = 0; f < nFilters; f++) {
      let sum = 0;
      for (let i = 0; i < nFFT / 2 + 1; i++) {
        sum += spectrum[i] * filters[f][i];
      }
      filterBank[f] = Math.log(Math.max(sum, 1e-10));
    }

    const dctCoeffs = dct(filterBank);
    mfcc.push(dctCoeffs.slice(0, nMFCC));
  }

  return mfcc;
}

export function prepareForInference(
  audioData: Float32Array,
  sourceSampleRate: number,
  targetSampleRate: number = 16000,
  maxDuration: number = 2.0
): { features: Float32Array; duration: number } {
  const { trimmed } = trimSilence(audioData, 0.01, 256);

  const resampled = resample(trimmed, sourceSampleRate, targetSampleRate);

  const maxSamples = Math.floor(targetSampleRate * maxDuration);
  let processed = resampled;
  if (processed.length > maxSamples) {
    processed = processed.slice(0, maxSamples);
  }

  const preemphasized = preemphasis(processed, 0.97);
  const normalized = normalize(preemphasized, 0.1);

  const duration = normalized.length / targetSampleRate;

  const features = new Float32Array(normalized.length);
  for (let i = 0; i < normalized.length; i++) {
    features[i] = normalized[i];
  }

  return { features, duration };
}
