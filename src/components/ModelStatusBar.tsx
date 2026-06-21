import { useVoiceStore } from '@/stores/voiceStore';

export default function ModelStatusBar() {
  const modelVersion = useVoiceStore((s) => s.modelVersion);
  const inferenceLatency = useVoiceStore((s) => s.inferenceLatency);
  const isModelLoaded = useVoiceStore((s) => s.isModelLoaded);

  return (
    <div
      className="h-8 flex items-center justify-between px-4 text-xs shrink-0"
      style={{ background: '#161B22' }}
    >
      <div className="flex items-center gap-2 text-[#8B949E]">
        <span>VoiceCmd</span>
        <span className="text-[#484F58]">|</span>
        <span className="text-[#E6EDF3]">{modelVersion || 'v0.0.0'}</span>
      </div>

      <div className="flex items-center gap-2 text-[#8B949E]">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00FFC8] opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00FFC8]" />
        </span>
        <span>
          推理延迟 <span className="text-[#00FFC8]">{inferenceLatency}</span> ms
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <span
          className={`w-2 h-2 rounded-full ${
            isModelLoaded ? 'bg-[#3FB950]' : 'bg-[#FF4757]'
          }`}
        />
        <span className="text-[#8B949E]">
          {isModelLoaded ? '已连接' : '未连接'}
        </span>
      </div>
    </div>
  );
}
