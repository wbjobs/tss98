export interface VADOptions {
  sampleRate: number;
  frameSize: number;
  energyThreshold?: number;
  zcrThreshold?: number;
  spectralFlatnessThreshold?: number;
  noiseEstimationFrames?: number;
  hangoverFrames?: number;
}

export interface VADResult {
  isSpeech: boolean;
  energy: number;
  zcr: number;
  spectralFlatness: number;
  cleanedFrame: Float32Array;
}

export class EnhancedVAD {
  private sampleRate: number;
  private frameSize: number;
  private energyThreshold: number;
  private zcrThreshold: number;
  private spectralFlatnessThreshold: number;
  private noiseEstimationFrames: number;
  private hangoverFrames: number;

  private noiseProfile: Float32Array;
  private noiseEstimationCount: number;
  private hangoverCount: number;
  private prevIsSpeech: boolean;
  private fftSize: number;

  constructor(options: VADOptions) {
    this.sampleRate = options.sampleRate;
    this.frameSize = options.frameSize;
    this.energyThreshold = options.energyThreshold ?? 0.02;
    this.zcrThreshold = options.zcrThreshold ?? 0.15;
    this.spectralFlatnessThreshold = options.spectralFlatnessThreshold ?? 0.6;
    this.noiseEstimationFrames = options.noiseEstimationFrames ?? 10;
    this.hangoverFrames = options.hangoverFrames ?? 8;

    this.fftSize = 1;
    while (this.fftSize < this.frameSize) {
      this.fftSize <<= 1;
    }

    this.noiseProfile = new Float32Array(this.fftSize / 2 + 1);
    this.noiseEstimationCount = 0;
    this.hangoverCount = 0;
    this.prevIsSpeech = false;
  }

  processFrame(frame: Float32Array): VADResult {
    const energy = this.computeEnergy(frame);
    const zcr = this.computeZCR(frame);
    const spectrum = this.computeSpectrum(frame);
    const spectralFlatness = this.computeSpectralFlatness(spectrum);

    const isSpeechRaw =
      energy > this.energyThreshold &&
      zcr < this.zcrThreshold &&
      spectralFlatness < this.spectralFlatnessThreshold;

    let isSpeech = isSpeechRaw;

    if (isSpeechRaw) {
      this.hangoverCount = this.hangoverFrames;
      isSpeech = true;
    } else if (this.hangoverCount > 0) {
      this.hangoverCount--;
      isSpeech = true;
    } else {
      isSpeech = false;
    }

    this.prevIsSpeech = isSpeech;

    if (this.noiseEstimationCount < this.noiseEstimationFrames) {
      this.updateNoiseProfile(frame);
    }

    const cleanedFrame = this.spectralSubtraction(frame);

    return {
      isSpeech,
      energy,
      zcr,
      spectralFlatness,
      cleanedFrame,
    };
  }

  updateNoiseProfile(noiseFrame: Float32Array): void {
    const spectrum = this.computeSpectrum(noiseFrame);
    const alpha = this.noiseEstimationCount === 0 ? 1 : 0.9;

    for (let i = 0; i < this.noiseProfile.length; i++) {
      this.noiseProfile[i] =
        alpha * this.noiseProfile[i] + (1 - alpha) * spectrum[i];
    }

    this.noiseEstimationCount++;
  }

  reset(): void {
    this.noiseProfile.fill(0);
    this.noiseEstimationCount = 0;
    this.hangoverCount = 0;
    this.prevIsSpeech = false;
  }

  private computeEnergy(frame: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < frame.length; i++) {
      sum += frame[i] * frame[i];
    }
    return Math.sqrt(sum / frame.length);
  }

  private computeZCR(frame: Float32Array): number {
    let crossings = 0;
    for (let i = 1; i < frame.length; i++) {
      if (
        (frame[i] >= 0 && frame[i - 1] < 0) ||
        (frame[i] < 0 && frame[i - 1] >= 0)
      ) {
        crossings++;
      }
    }
    return crossings / (frame.length - 1);
  }

  private computeSpectrum(frame: Float32Array): Float32Array {
    const n = this.fftSize;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);

    for (let i = 0; i < frame.length; i++) {
      const window = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (frame.length - 1));
      real[i] = frame[i] * window;
    }

    this.fft(real, imag);

    const spectrum = new Float32Array(n / 2 + 1);
    for (let i = 0; i <= n / 2; i++) {
      spectrum[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
    }

    return spectrum;
  }

  private fft(real: Float32Array, imag: Float32Array): void {
    const n = real.length;
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
  }

  private computeSpectralFlatness(spectrum: Float32Array): number {
    let logSum = 0;
    let arithSum = 0;
    const n = spectrum.length;

    for (let i = 0; i < n; i++) {
      const val = Math.max(spectrum[i], 1e-10);
      logSum += Math.log(val);
      arithSum += val;
    }

    const geomMean = Math.exp(logSum / n);
    const arithMean = arithSum / n;

    if (arithMean < 1e-10) return 0;

    return geomMean / arithMean;
  }

  private spectralSubtraction(
    frame: Float32Array
  ): Float32Array {
    const n = this.fftSize;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);

    for (let i = 0; i < frame.length; i++) {
      const window = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (frame.length - 1));
      real[i] = frame[i] * window;
    }

    this.fft(real, imag);

    const alpha = 2.5;
    const beta = 0.01;

    for (let i = 0; i <= n / 2; i++) {
      const magnitude = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
      const phase = magnitude > 0 ? Math.atan2(imag[i], real[i]) : 0;

      let newMagnitude = magnitude - alpha * this.noiseProfile[i];
      const floor = beta * this.noiseProfile[i];

      if (newMagnitude < floor) {
        newMagnitude = floor;
      }

      real[i] = newMagnitude * Math.cos(phase);
      imag[i] = newMagnitude * Math.sin(phase);

      if (i > 0 && i < n / 2) {
        real[n - i] = real[i];
        imag[n - i] = -imag[i];
      }
    }

    this.ifft(real, imag);

    const output = new Float32Array(frame.length);
    for (let i = 0; i < frame.length; i++) {
      output[i] = real[i] / n;
    }

    return output;
  }

  private ifft(real: Float32Array, imag: Float32Array): void {
    const n = real.length;

    for (let i = 1; i < n; i++) {
      imag[i] = -imag[i];
    }

    this.fft(real, imag);

    for (let i = 1; i < n; i++) {
      imag[i] = -imag[i];
    }
  }
}
