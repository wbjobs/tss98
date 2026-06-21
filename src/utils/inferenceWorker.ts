export interface InferenceDistribution {
  label: string;
  probability: number;
}

export interface InferenceResult {
  label: string;
  confidence: number;
  distribution: InferenceDistribution[];
  inferenceTime: number;
}

const COMMAND_LABELS = [
  "打开设置",
  "截图",
  "下一首",
  "上一首",
  "播放暂停",
  "增大音量",
  "减小音量",
  "打开浏览器",
];

function workerPreemphasis(
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

function workerNormalize(
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

function workerTrimSilence(
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

function workerResample(
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

function workerPrepareForInference(
  audioData: Float32Array,
  sourceSampleRate: number,
  targetSampleRate: number = 16000,
  maxDuration: number = 2.0
): { features: Float32Array; duration: number } {
  const { trimmed } = workerTrimSilence(audioData, 0.01, 256);

  const resampled = workerResample(trimmed, sourceSampleRate, targetSampleRate);

  const maxSamples = Math.floor(targetSampleRate * maxDuration);
  let processed = resampled;
  if (processed.length > maxSamples) {
    processed = processed.slice(0, maxSamples);
  }

  const preemphasized = workerPreemphasis(processed, 0.97);
  const normalized = workerNormalize(preemphasized, 0.1);

  const duration = normalized.length / targetSampleRate;

  const features = new Float32Array(normalized.length);
  for (let i = 0; i < normalized.length; i++) {
    features[i] = normalized[i];
  }

  return { features, duration };
}

function workerComputeEnergy(audioData: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < audioData.length; i++) {
    sum += audioData[i] * audioData[i];
  }
  return Math.sqrt(sum / audioData.length);
}

function workerComputeZeroCrossingRate(audioData: Float32Array): number {
  let crossings = 0;
  for (let i = 1; i < audioData.length; i++) {
    if (
      (audioData[i] >= 0 && audioData[i - 1] < 0) ||
      (audioData[i] < 0 && audioData[i - 1] >= 0)
    ) {
      crossings++;
    }
  }
  return crossings / (audioData.length - 1);
}

function workerMockInference(audioData: Float32Array): InferenceResult {
  const startTime = performance.now();

  const energy = workerComputeEnergy(audioData);
  const zcr = workerComputeZeroCrossingRate(audioData);

  const inferenceTime = 30 + Math.random() * 50;

  const ENERGY_THRESHOLD = 0.015;

  if (energy < ENERGY_THRESHOLD) {
    const distribution = COMMAND_LABELS.map((label) => ({
      label,
      probability: Math.random() * 0.08,
    }));
    distribution.push({ label: "未识别", probability: 0.5 + Math.random() * 0.3 });

    const total = distribution.reduce((s, d) => s + d.probability, 0);
    distribution.forEach((d) => (d.probability = d.probability / total));

    return {
      label: "未识别",
      confidence: 0.05 + Math.random() * 0.3,
      distribution,
      inferenceTime,
    };
  }

  const seed = energy * 1000 + zcr * 100 + Math.random() * 3;
  const labelIndex = Math.floor(seed) % COMMAND_LABELS.length;
  const selectedLabel = COMMAND_LABELS[labelIndex];

  const confidence = 0.4 + Math.random() * 0.55;

  const distribution: InferenceDistribution[] = [];
  const remaining = 1 - confidence;

  distribution.push({ label: selectedLabel, probability: confidence });

  const otherLabels = COMMAND_LABELS.filter((_, i) => i !== labelIndex);
  const rawWeights = otherLabels.map(() => Math.random());
  const totalWeight = rawWeights.reduce((a, b) => a + b, 0);

  for (let i = 0; i < otherLabels.length; i++) {
    distribution.push({
      label: otherLabels[i],
      probability: (rawWeights[i] / totalWeight) * remaining,
    });
  }

  distribution.sort((a, b) => b.probability - a.probability);

  const elapsed = performance.now() - startTime;
  const simulatedTime = Math.max(inferenceTime, elapsed);

  return {
    label: selectedLabel,
    confidence,
    distribution,
    inferenceTime: simulatedTime,
  };
}

const ctx: Worker = self as unknown as Worker;

ctx.onmessage = (event: MessageEvent) => {
  const data = event.data;

  if (data.type === 'init') {
    setTimeout(() => {
      ctx.postMessage({
        type: 'ready',
        modelVersion: '1.0.0'
      });
    }, 100);
    return;
  }

  if (data.type === 'infer') {
    try {
      const { audioData, sourceSampleRate, requestId } = data;

      const { features } = workerPrepareForInference(audioData, sourceSampleRate);

      const result = workerMockInference(features);

      ctx.postMessage({
        type: 'result',
        result,
        requestId
      });
    } catch (error) {
      ctx.postMessage({
        type: 'error',
        error: error instanceof Error ? error.message : String(error),
        requestId: data.requestId
      });
    }
    return;
  }
};

export {};
