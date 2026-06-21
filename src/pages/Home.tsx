import { useEffect, useCallback, useState, useRef } from "react";
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
import { dispatchAction } from "@/utils/actionDispatcher";
import { InferenceWorkerManager } from "@/utils/workerManager";
import { CommandQueue } from "@/utils/commandQueue";
import type { QueuedCommand } from "@/utils/commandQueue";
import type { InferenceResult } from "@/utils/mockInference";
import { Loader2, AlertTriangle, Clock, CheckCircle2 } from "lucide-react";

export default function Home() {
  const isListening = useVoiceStore((s) => s.isListening);
  const isModelLoaded = useVoiceStore((s) => s.isModelLoaded);
  const currentResult = useVoiceStore((s) => s.currentResult);
  const currentConfidence = useVoiceStore((s) => s.currentConfidence);
  const probabilityDistribution = useVoiceStore((s) => s.probabilityDistribution);
  const isUnrecognized = useVoiceStore((s) => s.isUnrecognized);
  const audioLevel = useVoiceStore((s) => s.audioLevel);
  const actions = useVoiceStore((s) => s.actions);
  const commandQueue = useVoiceStore((s) => s.commandQueue);
  const isProcessingQueue = useVoiceStore((s) => s.isProcessingQueue);
  const inferenceLatency = useVoiceStore((s) => s.inferenceLatency);
  const confidenceThreshold = useCommandStore((s) => s.confidenceThreshold);

  const [latestAction, setLatestAction] = useState<typeof actions[0] | null>(null);
  const [workerError, setWorkerError] = useState<string | null>(null);
  const [isWorkerReady, setIsWorkerReady] = useState(false);
  const workerInitRef = useRef(false);

  const processInference = useCallback(
    async (audioData: Float32Array, sampleRate: number): Promise<InferenceResult> => {
      const worker = InferenceWorkerManager.getInstance();
      const result = await worker.infer(audioData, sampleRate);
      return result;
    },
    []
  );

  const handleCommandProcessed = useCallback(
    (cmd: QueuedCommand) => {
      const store = useVoiceStore.getState();
      const threshold = useCommandStore.getState().confidenceThreshold;

      store.updateQueue(CommandQueue.getInstance().getQueue());

      if (cmd.status === "completed" && cmd.result) {
        store.setProcessingQueue(false);
        store.setInferenceLatency(Math.round(cmd.result.inferenceTime));

        if (cmd.result.confidence >= threshold && cmd.result.label !== "未识别") {
          store.setRecognitionResult(cmd.result.label, cmd.result.confidence, cmd.result.distribution);
          const dispatchResult = dispatchAction(cmd.result.label);
          store.addAction({
            id: crypto.randomUUID(),
            command: cmd.result.label,
            action: dispatchResult.action,
            success: dispatchResult.success,
            timestamp: Date.now(),
          });
          useLogStore.getState().addLog({
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            audioDuration: cmd.audioData.length / cmd.sourceSampleRate,
            result: cmd.result.label,
            confidence: cmd.result.confidence,
            action: dispatchResult.action,
            inferenceTime: cmd.result.inferenceTime,
            modelVersion: "v1.2.0",
          });
        } else {
          store.setUnrecognized();
          useLogStore.getState().addLog({
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            audioDuration: cmd.audioData.length / cmd.sourceSampleRate,
            result: "",
            confidence: cmd.result.confidence,
            action: null,
            inferenceTime: cmd.result.inferenceTime,
            modelVersion: "v1.2.0",
          });
        }
      } else if (cmd.status === "failed") {
        store.setProcessingQueue(false);
        setWorkerError(cmd.error || "推理失败");
        setTimeout(() => setWorkerError(null), 3000);
      }
    },
    []
  );

  const handleQueueEmpty = useCallback(() => {
    useVoiceStore.getState().setProcessingQueue(false);
    useVoiceStore.getState().updateQueue([]);
  }, []);

  const onSpeechEnd = useCallback(
    (audioData: Float32Array, sampleRate: number) => {
      const queue = CommandQueue.getInstance();
      const id = queue.enqueue(audioData, sampleRate);
      useVoiceStore.getState().enqueueCommand(audioData, sampleRate);
      useVoiceStore.getState().updateQueue(queue.getQueue());
      return id;
    },
    []
  );

  const {
    audioLevel: hookAudioLevel,
    waveformData: hookWaveform,
    vadState,
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
    if (workerInitRef.current) return;
    workerInitRef.current = true;

    const initWorker = async () => {
      try {
        const worker = InferenceWorkerManager.getInstance();
        await worker.init();
        setIsWorkerReady(true);

        const queue = CommandQueue.getInstance();
        queue.setInferenceCallback(processInference);
        queue.onCommandProcessed = handleCommandProcessed;
        queue.onQueueEmpty = handleQueueEmpty;

        const timer = setTimeout(() => {
          useVoiceStore.getState().setModelLoaded(true);
          useVoiceStore.getState().setModelVersion("v1.2.0");
        }, 1500);

        return () => clearTimeout(timer);
      } catch (err) {
        setWorkerError(err instanceof Error ? err.message : "Worker 初始化失败");
        console.error("Worker init failed:", err);
      }
    };

    initWorker();

    return () => {
      InferenceWorkerManager.getInstance().terminate();
    };
  }, [processInference, handleCommandProcessed, handleQueueEmpty]);

  useEffect(() => {
    if (actions.length > 0) {
      setLatestAction(actions[actions.length - 1]);
      const timer = setTimeout(() => setLatestAction(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [actions]);

  const vadStateText = {
    idle: "就绪",
    noise: "检测到噪音",
    speech: "检测到语音",
  };

  const vadStateColor = {
    idle: "text-[#8B949E]",
    noise: "text-[#D29922]",
    speech: "text-[#00FFC8]",
  };

  const statusText = isListening
    ? vadStateText[vadState]
    : !isModelLoaded || !isWorkerReady
    ? "模型加载中..."
    : "点击开始";

  const pendingCount = commandQueue.filter((c) => c.status === "pending").length;
  const processingCount = commandQueue.filter((c) => c.status === "processing").length;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0D1117" }}>
      {workerError && (
        <div className="bg-[#FF4757]/20 border-b border-[#FF4757] px-4 py-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-[#FF4757]" />
          <span className="text-sm text-[#FF4757]">{workerError}</span>
        </div>
      )}

      <main className="flex-1 grid grid-cols-1 md:grid-cols-[3fr_4fr_3fr] gap-4 p-4 pb-2">
        <section className="glass-card p-6 flex flex-col items-center gap-4">
          <div className="flex-1 flex items-center justify-center py-4">
            <MicButton />
          </div>

          {(pendingCount > 0 || processingCount > 0) && (
            <div className="w-full glass-card p-3">
              <div className="flex items-center justify-between text-xs text-[#8B949E] mb-2">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  指令队列
                </span>
                <span>
                  待处理 {pendingCount} · 处理中 {processingCount}
                </span>
              </div>
              <div className="flex gap-1">
                {commandQueue.slice(0, 8).map((cmd, i) => (
                  <div
                    key={cmd.id}
                    className={`flex-1 h-1.5 rounded-full ${
                      cmd.status === "processing"
                        ? "bg-[#00FFC8] animate-pulse"
                        : cmd.status === "completed"
                        ? "bg-[#3FB950]"
                        : cmd.status === "failed"
                        ? "bg-[#FF4757]"
                        : "bg-[#30363D]"
                    }`}
                    title={`${cmd.status} - ${new Date(cmd.timestamp).toLocaleTimeString()}`}
                  />
                ))}
                {commandQueue.length > 8 && (
                  <span className="text-[10px] text-[#8B949E] ml-1">+{commandQueue.length - 8}</span>
                )}
              </div>
            </div>
          )}

          <div className="flex items-start gap-3 w-full">
            <div className="flex-1 min-w-0">
              <WaveformVisualizer />
            </div>
            <VolumeMeter />
          </div>

          <div className="flex items-center gap-3 w-full justify-center">
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${vadStateColor[vadState]} bg-[#21262D]`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  vadState === "speech"
                    ? "bg-[#00FFC8] animate-pulse"
                    : vadState === "noise"
                    ? "bg-[#D29922]"
                    : "bg-[#484F58]"
                }`}
              />
              {vadStateText[vadState]}
            </div>
            {isProcessingQueue && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-[#00FFC8] bg-[#00FFC8]/10">
                <Loader2 className="w-3 h-3 animate-spin" />
                推理中... {inferenceLatency > 0 ? `${inferenceLatency}ms` : ""}
              </div>
            )}
          </div>

          <p
            className={`text-sm font-medium transition-colors ${
              isListening && vadState === "speech"
                ? "text-[#00FFC8] glow-text"
                : !isModelLoaded || !isWorkerReady
                ? "text-[#D29922]"
                : "text-[#8B949E]"
            }`}
          >
            {statusText}
          </p>
          <p className="text-xs text-[#8B949E] font-mono">
            音频电平 {Math.round(audioLevel * 100)}%
          </p>
          {captureError && <p className="text-xs text-[#FF4757]">{captureError}</p>}
        </section>

        <section className="glass-card p-6 flex flex-col items-center gap-6">
          <div className="flex-1 flex items-center justify-center w-full min-h-[120px]">
            {currentResult && !isUnrecognized ? (
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <CheckCircle2 className="w-6 h-6 text-[#3FB950]" />
                  <span className="text-sm text-[#3FB950]">识别成功</span>
                </div>
                <h1 className="text-5xl font-bold text-[#00FFC8] glow-text tracking-wider">
                  {currentResult}
                </h1>
              </div>
            ) : isUnrecognized ? (
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <AlertTriangle className="w-6 h-6 text-[#FF4757]" />
                  <span className="text-sm text-[#FF4757]">未识别</span>
                </div>
                <h1 className="text-5xl font-bold text-[#FF4757] animate-pulse">未识别</h1>
              </div>
            ) : (
              <h1 className="text-2xl text-[#484F58]">等待语音输入...</h1>
            )}
          </div>

          <ConfidenceGauge confidence={currentConfidence} threshold={confidenceThreshold} />

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
                <span className="text-sm font-semibold text-[#00FFC8]">当前操作</span>
              </div>
              <p className="text-lg font-bold text-[#E6EDF3]">{latestAction.command}</p>
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
