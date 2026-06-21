import { useEffect, useCallback, useState } from "react";
import MicButton from "@/components/MicButton";
import WaveformVisualizer from "@/components/WaveformVisualizer";
import VolumeMeter from "@/components/VolumeMeter";
import ConfidenceGauge from "@/components/ConfidenceGauge";
import ProbabilityBars from "@/components/ProbabilityBars";
import ActionHistory from "@/components/ActionHistory";
import ModelStatusBar from "@/components/ModelStatusBar";
import { useVoiceStore } from "@/stores/voiceStore";
import { useCommandStore } from "@/stores/commandStore";
import { useLogStore } from "@/stores/logStore";
import { useAudioCapture } from "@/hooks/useAudioCapture";
import { mockInference } from "@/utils/mockInference";
import { dispatchAction } from "@/utils/actionDispatcher";

export default function Home() {
  const isListening = useVoiceStore((s) => s.isListening);
  const isModelLoaded = useVoiceStore((s) => s.isModelLoaded);
  const currentResult = useVoiceStore((s) => s.currentResult);
  const currentConfidence = useVoiceStore((s) => s.currentConfidence);
  const probabilityDistribution = useVoiceStore((s) => s.probabilityDistribution);
  const isUnrecognized = useVoiceStore((s) => s.isUnrecognized);
  const audioLevel = useVoiceStore((s) => s.audioLevel);
  const actions = useVoiceStore((s) => s.actions);
  const confidenceThreshold = useCommandStore((s) => s.confidenceThreshold);
  const [latestAction, setLatestAction] = useState<typeof actions[0] | null>(null);

  const onSpeechEnd = useCallback((audioData: Float32Array) => {
    const result = mockInference(audioData);
    const store = useVoiceStore.getState();
    const threshold = useCommandStore.getState().confidenceThreshold;

    useVoiceStore.setState({ inferenceLatency: Math.round(result.inferenceTime) });

    if (result.confidence >= threshold && result.label !== "未识别") {
      store.setRecognitionResult(result.label, result.confidence, result.distribution);
      const dispatchResult = dispatchAction(result.label);
      store.addAction({
        id: crypto.randomUUID(),
        command: result.label,
        action: dispatchResult.action,
        success: dispatchResult.success,
        timestamp: Date.now(),
      });
      useLogStore.getState().addLog({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        audioDuration: audioData.length / 16000,
        result: result.label,
        confidence: result.confidence,
        action: dispatchResult.action,
        inferenceTime: result.inferenceTime,
        modelVersion: "v1.2.0",
      });
    } else {
      store.setUnrecognized();
      useLogStore.getState().addLog({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        audioDuration: audioData.length / 16000,
        result: "",
        confidence: result.confidence,
        action: null,
        inferenceTime: result.inferenceTime,
        modelVersion: "v1.2.0",
      });
    }
  }, []);

  const {
    audioLevel: hookAudioLevel,
    waveformData: hookWaveform,
    startListening: startCapture,
    stopListening: stopCapture,
    error: captureError,
  } = useAudioCapture(onSpeechEnd);

  useEffect(() => {
    if (isListening) {
      startCapture();
    } else {
      stopCapture();
    }
  }, [isListening, startCapture, stopCapture]);

  useEffect(() => {
    useVoiceStore.getState().setAudioLevel(hookAudioLevel);
  }, [hookAudioLevel]);

  useEffect(() => {
    const normalized = Array.from(hookWaveform).map((v) => (v - 128) / 128);
    useVoiceStore.getState().setWaveformData(normalized);
  }, [hookWaveform]);

  useEffect(() => {
    if (captureError && isListening) {
      useVoiceStore.getState().stopListening();
    }
  }, [captureError, isListening]);

  useEffect(() => {
    const timer = setTimeout(() => {
      useVoiceStore.getState().setModelLoaded(true);
      useVoiceStore.getState().setModelVersion("v1.2.0");
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (actions.length > 0) {
      setLatestAction(actions[actions.length - 1]);
      const timer = setTimeout(() => setLatestAction(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [actions]);

  const statusText = isListening
    ? "正在监听..."
    : !isModelLoaded
      ? "模型加载中..."
      : "点击开始";

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0D1117" }}>
      <main className="flex-1 grid grid-cols-1 md:grid-cols-[3fr_4fr_3fr] gap-4 p-4 pb-2">
        <section className="glass-card p-6 flex flex-col items-center gap-4">
          <div className="flex-1 flex items-center justify-center py-4">
            <MicButton />
          </div>
          <div className="flex items-start gap-3 w-full">
            <div className="flex-1 min-w-0">
              <WaveformVisualizer />
            </div>
            <VolumeMeter />
          </div>
          <p
            className={`text-sm font-medium transition-colors ${
              isListening
                ? "text-[#00FFC8] glow-text"
                : !isModelLoaded
                  ? "text-[#D29922]"
                  : "text-[#8B949E]"
            }`}
          >
            {statusText}
          </p>
          <p className="text-xs text-[#8B949E] font-mono">
            音频电平 {Math.round(audioLevel * 100)}%
          </p>
          {captureError && (
            <p className="text-xs text-[#FF4757]">{captureError}</p>
          )}
        </section>

        <section className="glass-card p-6 flex flex-col items-center gap-6">
          <div className="flex-1 flex items-center justify-center w-full min-h-[120px]">
            {currentResult && !isUnrecognized ? (
              <h1 className="text-5xl font-bold text-[#00FFC8] glow-text tracking-wider">
                {currentResult}
              </h1>
            ) : isUnrecognized ? (
              <h1 className="text-5xl font-bold text-[#FF4757] animate-pulse">
                未识别
              </h1>
            ) : (
              <h1 className="text-2xl text-[#484F58]">等待语音输入...</h1>
            )}
          </div>
          <ConfidenceGauge
            confidence={currentConfidence}
            threshold={confidenceThreshold}
          />
          <div className="w-full">
            <h3 className="text-sm text-[#8B949E] mb-3">概率分布</h3>
            <ProbabilityBars distribution={probabilityDistribution} />
          </div>
          {isUnrecognized && (
            <div className="text-center mt-2">
              <p className="text-sm text-[#FF4757]">未检测到有效指令，请重试</p>
              <p className="text-xs text-[#484F58] mt-1">请清晰说出指令后重试</p>
            </div>
          )}
        </section>

        <section className="glass-card p-6 flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-[#E6EDF3] border-b border-[#30363D] pb-2">
            操作反馈
          </h2>
          {latestAction && (
            <div className="glass-card p-4 glow-primary shrink-0">
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    latestAction.success ? "bg-[#3FB950]" : "bg-[#FF4757]"
                  }`}
                />
                <span className="text-sm font-semibold text-[#00FFC8]">
                  当前操作
                </span>
              </div>
              <p className="text-lg font-bold text-[#E6EDF3]">
                {latestAction.command}
              </p>
              <p className="text-sm text-[#8B949E]">{latestAction.action}</p>
            </div>
          )}
          <div className="flex-1 min-h-0">
            <ActionHistory />
          </div>
        </section>
      </main>

      <ModelStatusBar />
    </div>
  );
}
