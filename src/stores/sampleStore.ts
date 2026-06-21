import { create } from 'zustand';
import type { TrainingSample } from '@/utils/fewShotClassifier';

export type { TrainingSample };

interface SampleState {
  samples: TrainingSample[];
  isRecording: boolean;
  recordingCommandId: string | null;
  recordingLabel: string | null;
  recordingProgress: number;
  recordingDuration: number;
  error: string | null;

  startRecording: (commandId: string, label: string) => void;
  stopRecording: () => void;
  addSample: (sample: TrainingSample) => void;
  removeSample: (sampleId: string) => void;
  removeClassSamples: (commandId: string) => void;
  setRecordingProgress: (progress: number) => void;
  setRecordingDuration: (duration: number) => void;
  setError: (error: string | null) => void;
  clearAll: () => void;

  setSamples: (samples: TrainingSample[]) => void;

  getSamplesForCommand: (commandId: string) => TrainingSample[];
  getSampleCountForCommand: (commandId: string) => number;
}

export const useSampleStore = create<SampleState>((set, get) => ({
  samples: [],
  isRecording: false,
  recordingCommandId: null,
  recordingLabel: null,
  recordingProgress: 0,
  recordingDuration: 0,
  error: null,

  startRecording: (commandId, label) =>
    set({
      isRecording: true,
      recordingCommandId: commandId,
      recordingLabel: label,
      recordingProgress: 0,
      recordingDuration: 0,
      error: null,
    }),

  stopRecording: () =>
    set({
      isRecording: false,
      recordingCommandId: null,
      recordingLabel: null,
      recordingProgress: 0,
      recordingDuration: 0,
    }),

  addSample: (sample) =>
    set((state) => ({
      samples: [...state.samples, sample],
    })),

  removeSample: (sampleId) =>
    set((state) => ({
      samples: state.samples.filter((s) => s.id !== sampleId),
    })),

  removeClassSamples: (commandId) =>
    set((state) => ({
      samples: state.samples.filter((s) => s.commandId !== commandId),
    })),

  setRecordingProgress: (progress) =>
    set({ recordingProgress: Math.max(0, Math.min(1, progress)) }),

  setRecordingDuration: (duration) =>
    set({ recordingDuration: Math.max(0, duration) }),

  setError: (error) => set({ error }),

  setSamples: (samples) => set({ samples }),

  clearAll: () =>
    set({
      samples: [],
      isRecording: false,
      recordingCommandId: null,
      recordingLabel: null,
      recordingProgress: 0,
      recordingDuration: 0,
      error: null,
    }),

  getSamplesForCommand: (commandId) =>
    get().samples.filter((s) => s.commandId === commandId),

  getSampleCountForCommand: (commandId) =>
    get().samples.filter((s) => s.commandId === commandId).length,
}));
