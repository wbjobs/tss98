import { useState, useRef, useCallback, useEffect } from 'react';
import { X, Brain, Mic, Check, ChevronRight, Loader2 } from 'lucide-react';
import { useSampleStore } from '@/stores/sampleStore';
import SampleRecorder from '@/components/SampleRecorder';
import { InferenceWorkerManager } from '@/utils/workerManager';
import type { InferenceResult } from '@/utils/mockInference';
import type { ClassPrototype } from '@/utils/fewShotClassifier';

interface CommandTrainerProps {
  isOpen: boolean;
  commandId: string | null;
  commandLabel: string | null;
  onClose: () => void;
  onTrained?: () => void;
}

const SAMPLE_RATE = 16000;
const MAX_DURATION = 2.0;
const FRAME_SIZE = 512;

export default function CommandTrainer({
  isOpen,
  commandId,
  commandLabel,
  onClose,
  onTrained,
}: CommandTrainerProps) {
  const { getSampleCountForCommand } = useSampleStore();
  const [isTestRecording, setIsTestRecording] = useState(false);
  const [testDuration, setTestDuration] = useState(0);
  const [testResult, setTestResult] = useState<InferenceResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [prototypes, setPrototypes] = useState<ClassPrototype[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const startTimeRef = useRef<number>(0);
  const animFrameRef = useRef<number>(0);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRecordingRef = useRef(false);
  const workerReadyRef = useRef(false);

  const sampleCount = commandId ? getSampleCountForCommand(commandId) : 0;
  const isTrained = sampleCount >= 3;
  const hasPrototype = commandId
    ? prototypes.some((p) => p.commandId === commandId && p.sampleCount >= 3)
    : false;

  const ensureWorker = useCallback(async () => {
    if (!workerReadyRef.current) {
      const worker = InferenceWorkerManager.getInstance();
      await worker.init();
      workerReadyRef.current = true;
    }
  }, []);

  const syncPrototypes = useCallback(async () => {
    try {
      setIsSyncing(true);
      await ensureWorker();
      const worker = InferenceWorkerManager.getInstance();
      const { prototypes: ps } = await worker.getSamplesAndPrototypes();
      setPrototypes(ps);
    } catch {
    } finally {
      setIsSyncing(false);
    }
  }, [ensureWorker]);

  useEffect(() => {
    if (isOpen) {
      void syncPrototypes();
    }
  }, [isOpen, syncPrototypes]);

  const cleanupTestRecording = useCallback(() => {
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    isRecordingRef.current = false;
  }, []);

  const finalizeTestRecording = useCallback(async () => {
    if (!isRecordingRef.current) return;
    cleanupTestRecording();
    setIsTestRecording(false);

    if (chunksRef.current.length === 0) return;

    let totalLen = 0;
    for (const c of chunksRef.current) totalLen += c.length;
    const merged = new Float32Array(totalLen);
    let off = 0;
    for (const c of chunksRef.current) {
      merged.set(c, off);
      off += c.length;
    }

    chunksRef.current = [];

    if (merged.length / SAMPLE_RATE < 0.2) return;

    setIsProcessing(true);
    try {
      await ensureWorker();
      const worker = InferenceWorkerManager.getInstance();
      const result = await worker.infer(merged, SAMPLE_RATE);
      setTestResult(result);
      void syncPrototypes();
    } catch {
      setTestResult(null);
    } finally {
      setIsProcessing(false);
    }
  }, [cleanupTestRecording, ensureWorker, syncPrototypes]);

  const startTestRecording = useCallback(async () => {
    if (isTestRecording || !isTrained) return;
    setTestResult(null);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;
      const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
      audioContextRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;

      const processor = ctx.createScriptProcessor(FRAME_SIZE, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (!isRecordingRef.current) return;
        const data = new Float32Array(e.inputBuffer.getChannelData(0));
        chunksRef.current.push(data);
      };

      source.connect(processor);
      processor.connect(ctx.destination);

      setIsTestRecording(true);
      isRecordingRef.current = true;
      startTimeRef.current = performance.now();

      stopTimerRef.current = setTimeout(() => {
        void finalizeTestRecording();
      }, MAX_DURATION * 1000);

      const tick = () => {
        if (!isRecordingRef.current) return;
        const elapsed = (performance.now() - startTimeRef.current) / 1000;
        setTestDuration(Math.min(elapsed, MAX_DURATION));
        animFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      cleanupTestRecording();
      setIsTestRecording(false);
    }
  }, [isTestRecording, isTrained, cleanupTestRecording, finalizeTestRecording]);

  const handleSave = useCallback(() => {
    if (isTrained && hasPrototype) {
      onTrained?.();
      onClose();
    }
  }, [isTrained, hasPrototype, onTrained, onClose]);

  useEffect(() => {
    return () => {
      cleanupTestRecording();
      if (audioContextRef.current) {
        void audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, [cleanupTestRecording]);

  useEffect(() => {
    if (!isOpen) {
      setTestResult(null);
      setTestDuration(0);
      setPrototypes([]);
    }
  }, [isOpen]);

  if (!isOpen || !commandId || !commandLabel) return null;

  const testDistribution = testResult?.distribution ?? [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="relative w-[440px] h-full bg-[#161B22] border-l border-[#30363D] flex flex-col animate-in slide-in-from-right duration-300">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#30363D] shrink-0">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-[#00FFC8]" />
            <h2 className="text-base font-medium text-[#E6EDF3]">训练指令</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-[#21262D] text-[#8B949E] hover:text-[#E6EDF3] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <div className="glass-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-medium text-[#E6EDF3]">{commandLabel}</span>
              {isTrained && (
                <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-[#3FB950]/20 text-[#3FB950] border border-[#3FB950]/30">
                  <Check className="w-3 h-3" />
                  已训练
                </span>
              )}
              {isSyncing && (
                <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-[#00FFC8]/20 text-[#00FFC8] border border-[#00FFC8]/30">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  同步中
                </span>
              )}
            </div>
            <div className="text-xs text-[#8B949E]">
              最少录制 3 条高质量样本，建议 5 条以获得更好效果
            </div>
          </div>

          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Mic className="w-3.5 h-3.5 text-[#00FFC8]" />
              <span className="text-xs font-medium text-[#E6EDF3]">录制样本</span>
            </div>
            <SampleRecorder
              commandId={commandId}
              label={commandLabel}
              requiredSamples={3}
              onComplete={() => void syncPrototypes()}
              onClose={undefined}
            />
          </div>

          <div className="glass-card p-4">
            <div className="flex items-center gap-1.5 mb-3">
              <Brain className="w-3.5 h-3.5 text-[#00FFC8]" />
              <span className="text-xs font-medium text-[#E6EDF3]">训练状态</span>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8B949E]">样本数量</span>
                <span className={`text-xs font-mono ${sampleCount >= 3 ? 'text-[#3FB950]' : 'text-[#8B949E]'}`}>
                  {sampleCount}/3
                </span>
              </div>

              <div className="h-1.5 bg-[#30363D] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#00FFC8] transition-all duration-300"
                  style={{ width: `${Math.min((sampleCount / 3) * 100, 100)}%` }}
                />
              </div>

              <div className="flex items-center gap-2 text-xs">
                {isProcessing ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-[#D29922] animate-pulse" />
                    <span className="text-[#D29922]">特征提取中...</span>
                  </>
                ) : hasPrototype ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-[#3FB950]" />
                    <span className="text-[#3FB950]">原型已更新（{prototypes.length} 个类别）</span>
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 rounded-full bg-[#484F58]" />
                    <span className="text-[#484F58]">等待样本录制</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="glass-card p-4">
            <div className="flex items-center gap-1.5 mb-3">
              <ChevronRight className="w-3.5 h-3.5 text-[#00FFC8]" />
              <span className="text-xs font-medium text-[#E6EDF3]">快速测试</span>
            </div>

            <div className="flex flex-col items-center mb-4">
              <button
                onClick={startTestRecording}
                disabled={!isTrained || isTestRecording || isProcessing}
                className={`
                  w-14 h-14 rounded-full flex items-center justify-center
                  transition-all duration-300 outline-none
                  ${
                    !isTrained
                      ? 'bg-[#161B22] border-2 border-[#30363D] cursor-not-allowed opacity-40'
                      : isTestRecording
                      ? 'mic-pulse bg-[#00FFC8]/10 border-2 border-[#00FFC8] shadow-[0_0_20px_rgba(0,255,200,0.3)]'
                      : 'bg-[#161B22] border-2 border-[#00FFC8] hover:bg-[#00FFC8]/5 cursor-pointer'
                  }
                `}
              >
                <Mic
                  size={20}
                  className={!isTrained ? 'text-[#484F58]' : 'text-[#00FFC8]'}
                />
              </button>
              <span className="text-[10px] text-[#8B949E] mt-2">
                {!isTrained ? '请先完成训练' : isTestRecording ? '正在录制...' : isProcessing ? '分析中...' : '点击测试识别'}
              </span>
            </div>

            {isTestRecording && (
              <div className="mb-3">
                <div className="h-1 bg-[#30363D] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#F85149] transition-all duration-75"
                    style={{ width: `${(testDuration / MAX_DURATION) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {isProcessing && (
              <div className="text-center text-xs text-[#D29922] py-2 flex items-center justify-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                正在分析...
              </div>
            )}

            {testResult && !isProcessing && (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-2.5 rounded-md bg-[#0D1117] border border-[#30363D]">
                  <span className="text-xs text-[#8B949E]">识别结果</span>
                  <span className={`text-xs font-medium ${
                    testResult.label && testResult.label !== '未识别'
                      ? 'text-[#3FB950]'
                      : 'text-[#F85149]'
                  }`}>
                    {testResult.label || '未识别'}
                    {testResult.confidence !== undefined && (
                      <span className="ml-1.5 text-[10px] opacity-70">
                        ({Math.round(testResult.confidence * 100)}%)
                      </span>
                    )}
                  </span>
                </div>

                {testDistribution.length > 0 ? (
                  <div className="space-y-1.5">
                    <div className="text-[10px] text-[#484F58] mb-1">概率分布（Top 5）</div>
                    {testDistribution.slice(0, 5).map((item, idx) => {
                      const pct = Math.max(0, Math.min(100, Math.round(item.probability * 100)));
                      const isTop = idx === 0;
                      return (
                        <div key={item.label} className="flex items-center gap-2">
                          <span className="text-[10px] w-16 truncate text-right text-[#8B949E]">
                            {item.label}
                          </span>
                          <div className="flex-1 h-3 bg-[#0D1117] rounded-sm overflow-hidden">
                            <div
                              className={`h-full transition-all duration-300 ${isTop ? 'bg-[#00FFC8]' : 'bg-[#30363D]'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className={`text-[10px] w-10 text-right font-mono ${isTop ? 'text-[#00FFC8]' : 'text-[#484F58]'}`}>
                            {pct}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center text-xs text-[#484F58] py-2">
                    暂无对比数据
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 px-5 py-4 border-t border-[#30363D] shrink-0">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-md text-sm text-[#8B949E] bg-[#21262D] hover:bg-[#30363D] transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!isTrained || !hasPrototype}
            className={`
              flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-md
              text-sm font-medium transition-colors
              ${
                isTrained && hasPrototype
                  ? 'text-[#0D1117] bg-[#00FFC8] hover:bg-[#00CC9F]'
                  : 'text-[#484F58] bg-[#21262D] cursor-not-allowed'
              }
            `}
          >
            <Check className="w-4 h-4" />
            保存并启用
          </button>
        </div>
      </div>
    </div>
  );
}
