import { create } from "zustand";

export interface Command {
  id: string;
  label: string;
  keywords: string[];
  action: string;
  actionType: "system" | "app" | "custom";
  icon: string;
  enabled: boolean;
}

interface CommandState {
  commands: Command[];
  confidenceThreshold: number;

  addCommand: (cmd: Command) => void;
  updateCommand: (id: string, updates: Partial<Command>) => void;
  deleteCommand: (id: string) => void;
  toggleCommand: (id: string) => void;
  setConfidenceThreshold: (threshold: number) => void;
}

const defaultCommands: Command[] = [
  {
    id: "cmd-1",
    label: "打开设置",
    keywords: ["设置", "打开设置", "系统设置"],
    action: "open_settings",
    actionType: "system",
    icon: "Settings",
    enabled: true,
  },
  {
    id: "cmd-2",
    label: "截图",
    keywords: ["截图", "截屏", "屏幕截图"],
    action: "take_screenshot",
    actionType: "system",
    icon: "Camera",
    enabled: true,
  },
  {
    id: "cmd-3",
    label: "下一首",
    keywords: ["下一首", "下一曲", "跳过"],
    action: "media_next",
    actionType: "app",
    icon: "SkipForward",
    enabled: true,
  },
  {
    id: "cmd-4",
    label: "上一首",
    keywords: ["上一首", "上一曲", "后退"],
    action: "media_previous",
    actionType: "app",
    icon: "SkipBack",
    enabled: true,
  },
  {
    id: "cmd-5",
    label: "播放/暂停",
    keywords: ["播放", "暂停", "播放暂停"],
    action: "media_play_pause",
    actionType: "app",
    icon: "Play",
    enabled: true,
  },
  {
    id: "cmd-6",
    label: "增大音量",
    keywords: ["增大音量", "调大音量", "声音大点"],
    action: "volume_up",
    actionType: "system",
    icon: "Volume2",
    enabled: true,
  },
  {
    id: "cmd-7",
    label: "减小音量",
    keywords: ["减小音量", "调小音量", "声音小点"],
    action: "volume_down",
    actionType: "system",
    icon: "Volume1",
    enabled: true,
  },
  {
    id: "cmd-8",
    label: "打开浏览器",
    keywords: ["打开浏览器", "浏览器", "打开网页"],
    action: "open_browser",
    actionType: "app",
    icon: "Globe",
    enabled: true,
  },
];

export const useCommandStore = create<CommandState>((set) => ({
  commands: defaultCommands,
  confidenceThreshold: 0.7,

  addCommand: (cmd) =>
    set((state) => ({ commands: [...state.commands, cmd] })),

  updateCommand: (id, updates) =>
    set((state) => ({
      commands: state.commands.map((cmd) =>
        cmd.id === id ? { ...cmd, ...updates } : cmd
      ),
    })),

  deleteCommand: (id) =>
    set((state) => ({
      commands: state.commands.filter((cmd) => cmd.id !== id),
    })),

  toggleCommand: (id) =>
    set((state) => ({
      commands: state.commands.map((cmd) =>
        cmd.id === id ? { ...cmd, enabled: !cmd.enabled } : cmd
      ),
    })),

  setConfidenceThreshold: (threshold) =>
    set({ confidenceThreshold: threshold }),
}));
