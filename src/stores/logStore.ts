import { create } from "zustand";

export interface LogEntry {
  id: string;
  timestamp: number;
  audioDuration: number;
  result: string;
  confidence: number;
  action: string | null;
  inferenceTime: number;
  modelVersion: string;
}

interface LogState {
  logs: LogEntry[];
  addLog: (entry: LogEntry) => void;
  clearLogs: () => void;
  getStats: () => {
    totalRecognitions: number;
    avgInferenceTime: number;
    successRate: number;
    unrecognizedRate: number;
    topCommands: { command: string; count: number }[];
  };
}

export const useLogStore = create<LogState>((set, get) => ({
  logs: [],

  addLog: (entry) =>
    set((state) => ({ logs: [...state.logs, entry] })),

  clearLogs: () => set({ logs: [] }),

  getStats: () => {
    const { logs } = get();
    const totalRecognitions = logs.length;

    if (totalRecognitions === 0) {
      return {
        totalRecognitions: 0,
        avgInferenceTime: 0,
        successRate: 0,
        unrecognizedRate: 0,
        topCommands: [],
      };
    }

    const avgInferenceTime =
      logs.reduce((sum, log) => sum + log.inferenceTime, 0) /
      totalRecognitions;

    const successCount = logs.filter((log) => log.action !== null).length;
    const unrecognizedCount = logs.filter((log) => log.result === "").length;

    const successRate = successCount / totalRecognitions;
    const unrecognizedRate = unrecognizedCount / totalRecognitions;

    const commandCounts: Record<string, number> = {};
    for (const log of logs) {
      if (log.result) {
        commandCounts[log.result] = (commandCounts[log.result] || 0) + 1;
      }
    }

    const topCommands = Object.entries(commandCounts)
      .map(([command, count]) => ({ command, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalRecognitions,
      avgInferenceTime,
      successRate,
      unrecognizedRate,
      topCommands,
    };
  },
}));
