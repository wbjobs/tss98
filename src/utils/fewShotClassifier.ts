import {
  extractEmbedding as extractEmbeddingFn,
  cosineSimilarity,
  l2Normalize,
} from './featureExtractor';

export { extractEmbeddingFn as extractEmbedding };

export interface TrainingSample {
  id: string;
  commandId: string;
  label: string;
  audioData: Float32Array;
  sampleRate: number;
  embedding: Float32Array;
  timestamp: number;
  duration?: number;
}

export interface ClassPrototype {
  commandId: string;
  label: string;
  prototype: Float32Array;
  sampleCount: number;
  samples: string[];
}

export interface FewShotResult {
  label: string;
  commandId: string | null;
  confidence: number;
  distance: number;
  distribution: { label: string; probability: number; commandId?: string }[];
  isNewCommand: boolean;
}

export interface ClassifyResult {
  commandId: string | null;
  label: string | null;
  confidence: number;
  similarities: { commandId: string; label: string; similarity: number }[];
}

interface ClassifierOptions {
  similarityThreshold?: number;
  minSamplesPerClass?: number;
  temperature?: number;
}

export class FewShotClassifier {
  private static instance: FewShotClassifier | null = null;
  private prototypes: Map<string, ClassPrototype> = new Map();
  private samples: Map<string, TrainingSample> = new Map();
  private embeddingsCache: Map<string, Float32Array> = new Map();
  private similarityThreshold: number;
  private minSamplesPerClass: number;
  private temperature: number;

  static getInstance(): FewShotClassifier {
    if (!FewShotClassifier.instance) {
      FewShotClassifier.instance = new FewShotClassifier();
    }
    return FewShotClassifier.instance;
  }

  constructor(options: ClassifierOptions = {}) {
    this.similarityThreshold = options.similarityThreshold ?? 0.6;
    this.minSamplesPerClass = options.minSamplesPerClass ?? 3;
    this.temperature = options.temperature ?? 0.1;
  }

  extractEmbedding(audioData: Float32Array, sampleRate: number): Float32Array {
    const cacheKey = this.hashAudioData(audioData, sampleRate);
    if (this.embeddingsCache.has(cacheKey)) {
      return this.embeddingsCache.get(cacheKey)!;
    }
    const embedding = extractEmbeddingFn(audioData, sampleRate);
    this.embeddingsCache.set(cacheKey, embedding);
    return embedding;
  }

  addSample(sample: Partial<TrainingSample> & {
    commandId: string;
    label: string;
    audioData?: Float32Array;
    sampleRate?: number;
    embedding?: Float32Array;
  }): TrainingSample {
    const id = sample.id ?? this.generateId();
    let embedding = sample.embedding;
    if (!embedding && sample.audioData && sample.sampleRate) {
      embedding = this.extractEmbedding(sample.audioData, sample.sampleRate);
    }
    if (!embedding) {
      throw new Error('Either embedding or both audioData and sampleRate must be provided');
    }

    const trainingSample: TrainingSample = {
      id,
      commandId: sample.commandId,
      label: sample.label,
      audioData: sample.audioData ?? new Float32Array(0),
      sampleRate: sample.sampleRate ?? 16000,
      embedding,
      timestamp: sample.timestamp ?? Date.now(),
      duration: sample.duration,
    };

    this.samples.set(id, trainingSample);
    this.updatePrototype(sample.commandId);

    return trainingSample;
  }

  removeSample(sampleId: string): boolean {
    const sample = this.samples.get(sampleId);
    if (!sample) {
      return false;
    }
    this.samples.delete(sampleId);
    this.updatePrototype(sample.commandId);
    return true;
  }

  removeClass(commandId: string): boolean {
    if (!this.prototypes.has(commandId)) {
      return false;
    }
    const sampleIdsToRemove: string[] = [];
    this.samples.forEach((sample) => {
      if (sample.commandId === commandId) {
        sampleIdsToRemove.push(sample.id);
      }
    });
    sampleIdsToRemove.forEach((id) => this.samples.delete(id));
    this.prototypes.delete(commandId);
    return true;
  }

  getPrototype(commandId: string): ClassPrototype | undefined {
    return this.prototypes.get(commandId);
  }

  hasPrototype(commandId: string): boolean {
    return this.prototypes.has(commandId);
  }

  getAllPrototypes(): ClassPrototype[] {
    return Array.from(this.prototypes.values());
  }

  classify(audioData: Float32Array, sampleRate: number): FewShotResult;
  classify(audioData: Float32Array, sampleRate: number, threshold: number): ClassifyResult;
  classify(audioData: Float32Array, sampleRate: number, threshold?: number): FewShotResult | ClassifyResult {
    const embedding = this.extractEmbedding(audioData, sampleRate);
    const prototypes = this.getAllPrototypes();
    const effectiveThreshold = threshold ?? this.similarityThreshold;

    if (prototypes.length === 0) {
      if (threshold !== undefined) {
        return {
          commandId: null,
          label: null,
          confidence: 0,
          similarities: [],
        };
      }
      return {
        label: '未识别',
        commandId: null,
        confidence: 0,
        distance: 0,
        distribution: [],
        isNewCommand: true,
      };
    }

    const similarities = prototypes.map((proto) => ({
      prototype: proto,
      similarity: cosineSimilarity(embedding, proto.prototype),
    }));

    if (threshold !== undefined) {
      const sortedSims = [...similarities].sort((a, b) => b.similarity - a.similarity);
      const topSim = sortedSims[0];
      const simsList = sortedSims.map((s) => ({
        commandId: s.prototype.commandId,
        label: s.prototype.label,
        similarity: s.similarity,
      }));

      if (topSim.similarity >= effectiveThreshold) {
        return {
          commandId: topSim.prototype.commandId,
          label: topSim.prototype.label,
          confidence: topSim.similarity,
          similarities: simsList,
        };
      }
      return {
        commandId: null,
        label: null,
        confidence: topSim.similarity,
        similarities: simsList,
      };
    }

    const logits = similarities.map((s) => s.similarity / this.temperature);
    const maxLogit = Math.max(...logits);
    const expLogits = logits.map((l) => Math.exp(l - maxLogit));
    const sumExp = expLogits.reduce((a, b) => a + b, 0);
    const probabilities = expLogits.map((e) => e / sumExp);

    const distribution = similarities
      .map((s, i) => ({
        label: s.prototype.label,
        commandId: s.prototype.commandId,
        probability: probabilities[i],
      }))
      .sort((a, b) => b.probability - a.probability);

    const topSimilarity = distribution[0];
    const topSimilarityValue = similarities.find(
      (s) => s.prototype.commandId === topSimilarity.commandId
    )?.similarity ?? 0;

    if (topSimilarityValue >= effectiveThreshold) {
      return {
        label: topSimilarity.label,
        commandId: topSimilarity.commandId ?? null,
        confidence: topSimilarity.probability,
        distance: 1 - topSimilarityValue,
        distribution,
        isNewCommand: false,
      };
    }

    return {
      label: '未识别',
      commandId: null,
      confidence: topSimilarity.probability,
      distance: 1 - topSimilarityValue,
      distribution,
      isNewCommand: true,
    };
  }

  getSampleCount(commandId: string): number {
    let count = 0;
    this.samples.forEach((sample) => {
      if (sample.commandId === commandId) {
        count++;
      }
    });
    return count;
  }

  getAllSamples(): TrainingSample[] {
    return Array.from(this.samples.values());
  }

  getSamplesForClass(commandId: string): TrainingSample[] {
    const result: TrainingSample[] = [];
    this.samples.forEach((sample) => {
      if (sample.commandId === commandId) {
        result.push(sample);
      }
    });
    return result;
  }

  isReady(commandId: string): boolean {
    return this.getSampleCount(commandId) >= this.minSamplesPerClass;
  }

  clear(): void {
    this.prototypes.clear();
    this.samples.clear();
    this.embeddingsCache.clear();
  }

  private updatePrototype(commandId: string): void {
    const classSamples = this.getSamplesForClass(commandId);
    if (classSamples.length === 0) {
      this.prototypes.delete(commandId);
      return;
    }

    const dim = classSamples[0].embedding.length;
    const meanVec = new Float32Array(dim);

    for (const sample of classSamples) {
      for (let i = 0; i < dim; i++) {
        meanVec[i] += sample.embedding[i];
      }
    }

    for (let i = 0; i < dim; i++) {
      meanVec[i] /= classSamples.length;
    }

    const prototype = l2Normalize(meanVec);

    this.prototypes.set(commandId, {
      commandId,
      label: classSamples[0].label,
      prototype,
      sampleCount: classSamples.length,
      samples: classSamples.map((s) => s.id),
    });
  }

  private generateId(): string {
    return 'sample_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  private hashAudioData(audioData: Float32Array, sampleRate: number): string {
    let hash = sampleRate.toString();
    const step = Math.max(1, Math.floor(audioData.length / 64));
    for (let i = 0; i < audioData.length; i += step) {
      hash += '_' + Math.round(audioData[i] * 1000);
    }
    return hash;
  }
}
