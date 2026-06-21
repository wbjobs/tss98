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

function computeEnergy(audioData: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < audioData.length; i++) {
    sum += audioData[i] * audioData[i];
  }
  return Math.sqrt(sum / audioData.length);
}

function computeZeroCrossingRate(audioData: Float32Array): number {
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

export function mockInference(audioData: Float32Array): InferenceResult {
  const startTime = performance.now();

  const energy = computeEnergy(audioData);
  const zcr = computeZeroCrossingRate(audioData);

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
  let remaining = 1 - confidence;

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
