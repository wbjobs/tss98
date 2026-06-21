import { create } from "zustand";
import { CommandQueue } from "../utils/commandQueue";
import type { QueuedCommand } from "../utils/commandQueue";

export interface ActionHistoryItem {
  id: string;
  command: string;
  action: string;
  success: boolean;
  timestamp: number;
}

interface VoiceState {
  isListening: boolean;
  isModelLoaded: boolean;
  modelVersion: string;
  inferenceLatency: number;
  currentResult: string | null;
  currentConfidence: number;
  probabilityDistribution: { label: string; probability: number }[];
  isUnrecognized: boolean;
  audioLevel: number;
  waveformData: number[];
  actions: ActionHistoryItem[];
  commandQueue: QueuedCommand[];
  queuePosition: number;
  isProcessingQueue: boolean;

  startListening: () => void;
  stopListening: () => void;
  setModelLoaded: (loaded: boolean) => void;
  setModelVersion: (version: string) => void;
  setRecognitionResult: (
    result: string,
    confidence: number,
    distribution: { label: string; probability: number }[]
  ) => void;
  setUnrecognized: () => void;
  setAudioLevel: (level: number) => void;
  setWaveformData: (data: number[]) => void;
  addAction: (action: ActionHistoryItem) => void;
  resetResult: () => void;
  enqueueCommand: (audioData: Float32Array, sampleRate: number) => void;
  updateQueue: (queue: QueuedCommand[]) => void;
  setProcessingQueue: (processing: boolean) => void;
  setInferenceLatency: (latency: number) => void;
}

export const useVoiceStore = create<VoiceState>((set) => ({
  isListening: false,
  isModelLoaded: false,
  modelVersion: "",
  inferenceLatency: 0,
  currentResult: null,
  currentConfidence: 0,
  probabilityDistribution: [],
  isUnrecognized: false,
  audioLevel: 0,
  waveformData: [],
  actions: [],
  commandQueue: [],
  queuePosition: 0,
  isProcessingQueue: false,

  startListening: () =>
    set({ isListening: true, isUnrecognized: false, currentResult: null }),

  stopListening: () => set({ isListening: false, audioLevel: 0, waveformData: [] }),

  setModelLoaded: (loaded) => set({ isModelLoaded: loaded }),

  setModelVersion: (version) => set({ modelVersion: version }),

  setRecognitionResult: (result, confidence, distribution) =>
    set({
      currentResult: result,
      currentConfidence: confidence,
      probabilityDistribution: distribution,
      isUnrecognized: false,
    }),

  setUnrecognized: () =>
    set({
      currentResult: null,
      currentConfidence: 0,
      probabilityDistribution: [],
      isUnrecognized: true,
    }),

  setAudioLevel: (level) => set({ audioLevel: level }),

  setWaveformData: (data) => set({ waveformData: data }),

  addAction: (action) =>
    set((state) => ({ actions: [...state.actions, action] })),

  resetResult: () =>
    set({
      currentResult: null,
      currentConfidence: 0,
      probabilityDistribution: [],
      isUnrecognized: false,
    }),

  enqueueCommand: (audioData, sampleRate) => {
    CommandQueue.getInstance().enqueue(audioData, sampleRate);
  },

  updateQueue: (queue) => set({ commandQueue: queue }),

  setProcessingQueue: (processing) => set({ isProcessingQueue: processing }),

  setInferenceLatency: (latency) => set({ inferenceLatency: latency }),
}));
