import { Mic } from "lucide-react";
import { useVoiceStore } from "@/stores/voiceStore";

export default function MicButton() {
  const { isListening, isModelLoaded, startListening, stopListening } =
    useVoiceStore();

  const handleClick = () => {
    if (!isModelLoaded) return;
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={!isModelLoaded}
      className={`
        w-20 h-20 rounded-full flex items-center justify-center
        transition-all duration-300 outline-none
        ${
          !isModelLoaded
            ? "bg-[#161B22] border-2 border-[#30363D] cursor-not-allowed opacity-40"
            : isListening
            ? "mic-pulse bg-[#00FFC8]/10 border-2 border-[#00FFC8] shadow-[0_0_30px_rgba(0,255,200,0.3)]"
            : "bg-[#161B22] border-2 border-[#00FFC8] hover:bg-[#00FFC8]/5 cursor-pointer"
        }
      `}
    >
      <Mic
        size={32}
        className={`transition-colors duration-300 ${
          !isModelLoaded
            ? "text-[#484F58]"
            : isListening
            ? "text-[#00FFC8]"
            : "text-[#00FFC8]"
        }`}
      />
    </button>
  );
}
