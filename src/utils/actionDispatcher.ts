const ACTION_MAP: Record<string, string> = {
  "打开设置": "打开系统设置面板",
  "截图": "截取当前屏幕",
  "下一首": "切换到下一首曲目",
  "上一首": "切换到上一首曲目",
  "播放暂停": "切换播放/暂停状态",
  "增大音量": "增大系统音量",
  "减小音量": "减小系统音量",
  "打开浏览器": "打开默认浏览器",
};

export interface DispatchResult {
  action: string;
  success: boolean;
}

export function dispatchAction(commandLabel: string): DispatchResult {
  const action = ACTION_MAP[commandLabel];

  if (!action) {
    console.warn(`[VoiceCmd] 未知的命令: "${commandLabel}"，无法执行操作`);
    return { action: "未知命令", success: false };
  }

  console.log(`[VoiceCmd] 执行命令: "${commandLabel}" → ${action}`);
  return { action, success: true };
}
