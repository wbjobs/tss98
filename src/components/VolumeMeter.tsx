import { useVoiceStore } from "@/stores/voiceStore";

export default function VolumeMeter() {
  const audioLevel = useVoiceStore((s) => s.audioLevel);

  const clampedLevel = Math.max(0, Math.min(1, audioLevel));
  const fillPercent = clampedLevel * 100;

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="w-3 rounded-full overflow-hidden relative"
        style={{ height: "200px", backgroundColor: "#161B22" }}
      >
        <div
          className="absolute bottom-0 left-0 w-full rounded-full transition-all duration-150 ease-out"
          style={{
            height: `${fillPercent}%`,
            background: `linear-gradient(to top, #00FFC8, #FF4757)`,
          }}
        />
      </div>
      <span className="text-[10px] text-[#8B949E]">音量</span>
    </div>
  );
}
