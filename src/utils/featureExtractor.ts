export function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + hz / 700);
}

export function melToHz(mel: number): number {
  return 700 * (Math.pow(10, mel / 2595) - 1);
}

export function createMelFilterBank(
  nFilters: number,
  nFFT: number,
  sampleRate: number,
  fMin: number = 0,
  fMax?: number
): number[][] {
  const actualFMax = fMax ?? sampleRate / 2;
  const melMin = hzToMel(fMin);
  const melMax = hzToMel(actualFMax);
  const melPoints = new Array(nFilters + 2);
  const freqPoints = new Array(nFilters + 2);

  for (let i = 0; i < nFilters + 2; i++) {
    melPoints[i] = melMin + (melMax - melMin) * (i / (nFilters + 1));
    freqPoints[i] = melToHz(melPoints[i]);
  }

  const nFFTBins = Math.floor(nFFT / 2) + 1;
  const fftBins = freqPoints.map((f) =>
    Math.floor((nFFTBins * f) / (sampleRate / 2))
  );

  const filters: number[][] = [];

  for (let i = 1; i <= nFilters; i++) {
    const filter = new Array(nFFTBins).fill(0);
    const left = fftBins[i - 1];
    const mid = fftBins[i];
    const right = fftBins[i + 1];

    for (let j = left; j < mid && j < nFFTBins; j++) {
      if (mid !== left) {
        filter[j] = (j - left) / (mid - left);
      }
    }
    for (let j = mid; j < right && j < nFFTBins; j++) {
      if (right !== mid) {
        filter[j] = (right - j) / (right - mid);
      }
    }
    filters.push(filter);
  }

  return filters;
}

export function applyDCT(spectrum: number[], nCoeffs: number): number[] {
  const n = spectrum.length;
  const output = new Array(nCoeffs).fill(0);
  const scale0 = 1 / Math.sqrt(2);

  for (let k = 0; k < nCoeffs; k++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += spectrum[i] * Math.cos((Math.PI * k * (2 * i + 1)) / (2 * n));
    }
    const ck = k === 0 ? scale0 : 1;
    output[k] = ck * Math.sqrt(2 / n) * sum;
  }

  return output;
}

function fft(
  real: Float32Array,
  imag: Float32Array,
  inverse: boolean = false
): void {
  const n = real.length;
  const bits = Math.floor(Math.log2(n));

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
    const angleStep = (inverse ? 2 : -2) * Math.PI / size;

    for (let i = 0; i < n; i += size) {
      for (let j = 0; j < halfSize; j++) {
        const angle = j * angleStep;
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

  if (inverse) {
    for (let i = 0; i < n; i++) {
      real[i] /= n;
      imag[i] /= n;
    }
  }
}

export function computeSTFT(
  signal: Float32Array,
  nFFT: number,
  hopLength: number,
  window?: Float32Array
): number[][] {
  const win = window ?? createHannWindow(nFFT);
  const nFFTBins = Math.floor(nFFT / 2) + 1;
  const spectrogram: number[][] = [];

  const paddedSignal = new Float32Array(signal.length < nFFT ? nFFT : signal.length);
  paddedSignal.set(signal);

  for (let start = 0; start + nFFT <= paddedSignal.length; start += hopLength) {
    const real = new Float32Array(nFFT);
    const imag = new Float32Array(nFFT);

    for (let i = 0; i < nFFT; i++) {
      real[i] = paddedSignal[start + i] * win[i];
    }

    fft(real, imag, false);

    const magnitudes = new Array(nFFTBins);
    for (let i = 0; i < nFFTBins; i++) {
      magnitudes[i] = real[i] * real[i] + imag[i] * imag[i];
    }

    spectrogram.push(magnitudes);
  }

  return spectrogram;
}

export function createHannWindow(size: number): Float32Array {
  const window = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return window;
}

function preemphasisLocal(
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

function normalizeLocal(
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

function trimSilenceLocal(
  signal: Float32Array,
  threshold: number = 0.01,
  frameSize: number = 256
): Float32Array {
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
    return signal;
  }

  return signal.slice(startIndex, endIndex);
}

function resampleLocal(
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

export function computeMFCC(
  audioData: Float32Array,
  sampleRate: number,
  nMFCC: number = 13,
  nFFT: number = 512,
  hopLength: number = 256,
  nFilters: number = 40,
  fMin: number = 0,
  fMax?: number
): number[][] {
  const filters = createMelFilterBank(nFilters, nFFT, sampleRate, fMin, fMax);
  const window = createHannWindow(nFFT);
  const spectrogram = computeSTFT(audioData, nFFT, hopLength, window);
  const mfcc: number[][] = [];

  for (let f = 0; f < spectrogram.length; f++) {
    const filterBank = new Array(nFilters).fill(0);
    for (let m = 0; m < nFilters; m++) {
      let sum = 0;
      for (let i = 0; i < spectrogram[f].length; i++) {
        sum += spectrogram[f][i] * filters[m][i];
      }
      filterBank[m] = Math.log(Math.max(sum, 1e-10));
    }

    const dctCoeffs = applyDCT(filterBank, nMFCC);
    mfcc.push(dctCoeffs);
  }

  return mfcc;
}

export function computeLogMelSpectrogram(
  audioData: Float32Array,
  sampleRate: number,
  nFFT: number = 512,
  hopLength: number = 256,
  nFilters: number = 40
): number[][] {
  const filters = createMelFilterBank(nFilters, nFFT, sampleRate);
  const window = createHannWindow(nFFT);
  const spectrogram = computeSTFT(audioData, nFFT, hopLength, window);
  const logMel: number[][] = [];

  for (let f = 0; f < spectrogram.length; f++) {
    const filterBank = new Array(nFilters).fill(0);
    for (let m = 0; m < nFilters; m++) {
      let sum = 0;
      for (let i = 0; i < spectrogram[f].length; i++) {
        sum += spectrogram[f][i] * filters[m][i];
      }
      filterBank[m] = Math.log(Math.max(sum, 1e-10));
    }
    logMel.push(filterBank);
  }

  return logMel;
}

export function flattenFeatures(features: number[][]): Float32Array {
  let totalLength = 0;
  for (let i = 0; i < features.length; i++) {
    totalLength += features[i].length;
  }
  const result = new Float32Array(totalLength);
  let offset = 0;
  for (let i = 0; i < features.length; i++) {
    result.set(features[i], offset);
    offset += features[i].length;
  }
  return result;
}

export function computeMeanFeature(features: number[][]): Float32Array {
  if (features.length === 0) {
    return new Float32Array(0);
  }
  const dim = features[0].length;
  const mean = new Float32Array(dim);

  for (let i = 0; i < features.length; i++) {
    for (let j = 0; j < dim; j++) {
      mean[j] += features[i][j];
    }
  }

  for (let j = 0; j < dim; j++) {
    mean[j] /= features.length;
  }

  return mean;
}

export function l2Normalize(vec: Float32Array): Float32Array {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) {
    norm += vec[i] * vec[i];
  }
  norm = Math.sqrt(norm);
  if (norm < 1e-10) {
    return new Float32Array(vec.length);
  }
  const result = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) {
    result[i] = vec[i] / norm;
  }
  return result;
}

export function cosineSimilarity(
  a: Float32Array,
  b: Float32Array
): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);
  if (normA < 1e-10 || normB < 1e-10) {
    return 0;
  }
  return dotProduct / (normA * normB);
}

export function euclideanDistance(
  a: Float32Array,
  b: Float32Array
): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

export function extractEmbedding(
  audioData: Float32Array,
  sampleRate: number
): Float32Array {
  const targetSampleRate = 16000;
  const trimmed = trimSilenceLocal(audioData, 0.01, 256);
  const resampled = resampleLocal(trimmed, sampleRate, targetSampleRate);
  const preemphasized = preemphasisLocal(resampled, 0.97);
  const normalized = normalizeLocal(preemphasized, 0.1);

  const mfcc = computeMFCC(
    normalized,
    targetSampleRate,
    20,
    512,
    256,
    40,
    0
  );

  const meanVec = computeMeanFeature(mfcc);
  const targetDim = 128;
  const result = new Float32Array(targetDim);

  if (meanVec.length >= targetDim) {
    result.set(meanVec.slice(0, targetDim));
  } else {
    result.set(meanVec);
    for (let i = meanVec.length; i < targetDim; i++) {
      result[i] = 0;
    }
  }

  return l2Normalize(result);
}
