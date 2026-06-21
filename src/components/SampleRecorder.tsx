import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Play, Trash2, Check, Clock, X, Loader2 } from 'lucide-react';
import { useSampleStore } from '@/stores/sampleStore';
import { InferenceWorkerManager } from '@/utils/workerManager';
import type { TrainingSample } from '@/utils/fewShotClassifier';

interface SampleRecorderProps {
  commandId: string;
  label: string;
  requiredSamples?: number;
  onComplete?: () => void;
  onClose?: () => void;
}

const SAMPLE_RATE = 16000;
const MAX_DURATION = 2.0;
const FRAME_SIZE = 512;

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds - Math.floor(seconds)) * 100);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

function WaveformMini({ embedding }: { embedding: Float32Array | number[] }) {
  const bars = 20;
  const len = embedding.length;
  const step = Math.max(1, Math.floor(len / bars));
  let max = 1e-6;
  for (let i = 0; i < len; i += step) {
    const v = Math.abs(embedding[i] as number);
    if (v > max) max = v;
  }
  return (
    <div className="flex items-end gap-0.5 h-8">
      {Array.from({ length: bars }, (_, i) => {
        const idx = i * step;
        const v = Math.abs((embedding[idx] as number) || 0);
        const h = Math.max(2, (v / max) * 100);
        return (
          <div
            key={i}
            className="w-1 bg-[#00FFC8] rounded-full"
            style={{ height: `${h}%`, opacity: 0.4 + (i % 3) * 0.2 }}
          />
        );
      })}
    </div>
  );
}

export default function SampleRecorder({
  commandId,
  label,
  requiredSamples = 3,
  onComplete,
  onClose,
}: SampleRecorderProps) {
  const {
    samples,
    isRecording,
    recordingProgress,
    recordingDuration,
    error,
    startRecording,
    stopRecording,
    addSample,
    removeSample,
    setSamples,
    setRecordingProgress,
    setRecordingDuration,
    setError,
  } = useSampleStore();

  const [syncing, setSyncing] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const startTimeRef = useRef<number>(0);
  const animFrameRef = useRef<number>(0);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRecordingRef = useRef(false);
  const playAudioCtxRef = useRef<AudioContext | null>(null);
  const workerReadyRef = useRef(false);

  const syncSamplesFromWorker = useCallback(async () => {
    try {
      setSyncing(true);
      const worker = InferenceWorkerManager.getInstance();
      if (!workerReadyRef.current) {
        await worker.init();
        workerReadyRef.current = true;
      }
      const { samples: workerSamples } = await worker.getSamplesAndPrototypes();
      setSamples(workerSamples);
    } catch (e) {
      console.warn('Failed to sync samples from worker:', e);
    } finally {
      setSyncing(false);
    }
  }, [setSamples]);

  useEffect(() => {
    syncSamplesFromWorker();
  }, [syncSamplesFromWorker]);

  const commandSamples = samples.filter((s) => s.commandId === commandId);
  const sampleCount = commandSamples.length;

  const cleanupRecording = useCallback(() => {
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

  const finalizeRecording = useCallback(async () => {
    if (!isRecordingRef.current) return;
    cleanupRecording();
    stopRecording();

    if (chunksRef.current.length === 0) return;

    let totalLen = 0;
    for (const c of chunksRef.current) totalLen += c.length;
    const merged = new Float32Array(totalLen);
    let off = 0;
    for (const c of chunksRef.current) {
      merged.set(c, off);
      off += c.length;
    }

    const duration = merged.length / SAMPLE_RATE;
    if (duration < 0.2) {
      setError('录音时间太短，请重新录制');
      chunksRef.current = [];
      return;
    }

    try {
      const worker = InferenceWorkerManager.getInstance();
      if (!workerReadyRef.current) {
        await worker.init();
        workerReadyRef.current = true;
      }
      const addedSample: TrainingSample = await worker.addSample({
        commandId,
        label,
        audioData: merged,
        sampleRate: SAMPLE_RATE,
      });
      addSample(addedSample);
    } catch (e) {
      setError('特征提取失败，请重试');
    }

    chunksRef.current = [];
  }, [addSample, cleanupRecording, commandId, label, setError, stopRecording]);

  const handleStartRecording = useCallback(async () => {
    if (isRecording) return;
    setError(null);
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

      startRecording(commandId, label);
      isRecordingRef.current = true;
      startTimeRef.current = performance.now();

      stopTimerRef.current = setTimeout(() => {
        void finalizeRecording();
      }, MAX_DURATION * 1000);

      const tick = () => {
        if (!isRecordingRef.current) return;
        const elapsed = (performance.now() - startTimeRef.current) / 1000;
        const progress = Math.min(elapsed / MAX_DURATION, 1);
        setRecordingProgress(progress);
        setRecordingDuration(elapsed);
        animFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (err) {
      const msg =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? '麦克风权限被拒绝'
          : '无法启动录音，请检查麦克风';
      setError(msg);
      cleanupRecording();
      stopRecording();
    }
  }, [
    isRecording,
    commandId,
    label,
    startRecording,
    stopRecording,
    setError,
    setRecordingProgress,
    setRecordingDuration,
    cleanupRecording,
    finalizeRecording,
  ]);

  const handleStopRecording = useCallback(() => {
    if (!isRecording) return;
    void finalizeRecording();
  }, [isRecording, finalizeRecording]);

  const playSample = useCallback(async (sample: TrainingSample) => {
    if (playingId) {
      setPlayingId(null);
      if (playAudioCtxRef.current) {
        playAudioCtxRef.current.close();
        playAudioCtxRef.current = null;
      }
      return;
    }
    try {
      setPlayingId(sample.id);
      const ctx = new AudioContext({ sampleRate: sample.sampleRate });
      playAudioCtxRef.current = ctx;
      const buffer = ctx.createBuffer(1, sample.audioData.length, sample.sampleRate);
      buffer.copyToChannel(sample.audioData, 0);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      src.onended = () => {
        setPlayingId(null);
        if (playAudioCtxRef.current === ctx) {
          ctx.close();
          playAudioCtxRef.current = null;
        }
      };
      src.start();
    } catch {
      setPlayingId(null);
    }
  }, [playingId]);

  const handleDeleteSample = useCallback(async (sampleId: string) => {
    try {
      const worker = InferenceWorkerManager.getInstance();
      if (!workerReadyRef.current) {
        await worker.init();
        workerReadyRef.current = true;
      }
      await worker.removeSample(sampleId);
      removeSample(sampleId);
    } catch (e) {
      setError('删除样本失败');
    }
  }, [removeSample, setError]);

  const handleComplete = useCallback(() => {
    if (sampleCount >= requiredSamples) {
      onComplete?.();
    }
  }, [sampleCount, requiredSamples, onComplete]);

  useEffect(() => {
    return () => {
      cleanupRecording();
      if (audioContextRef.current) {
        void audioContextRef.current.close();
        audioContextRef.current = null;
      }
      if (playAudioCtxRef.current) {
        void playAudioCtxRef.current.close();
        playAudioCtxRef.current = null;
      }
    };
  }, [cleanupRecording]);

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-medium text-[#E6EDF3]">录制训练样本 - {label}</h3>
          <p className="text-xs text-[#8B949E] mt-0.5">
            请清晰朗读指令 {label}，录制 {requiredSamples}~5 条样本
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-[#21262D] text-[#8B949E] hover:text-[#E6EDF3] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex flex-col items-center mb-5">
        <div className="flex items-center gap-3 mb-4 h-6">
          {syncing && (
            <div className="flex items-center gap-1.5 text-xs text-[#00FFC8]">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              同步中...
            </div>
          )}
          {isRecording && (
            <>
              <span className="w-2.5 h-2.5 rounded-full bg-[#F85149] animate-pulse" />
              <span className="text-sm font-mono text-[#F85149]">
                {formatTime(recordingDuration)}
              </span>
            </>
          )}
          {!isRecording && !syncing && (
            <div className="flex items-center gap-1.5 text-xs text-[#8B949E]">
              <Clock className="w-3.5 h-3.5" />
              最长 2 秒
            </div>
          )}
        </div>

        <button
          onClick={isRecording ? handleStopRecording : handleStartRecording}
          className={`
            w-20 h-20 rounded-full flex items-center justify-center
            transition-all duration-300 outline-none mb-4
            ${
              isRecording
                ? 'mic-pulse bg-[#F85149]/10 border-2 border-[#F85149] shadow-[0_0_30px_rgba(248,81,73,0.3)]'
                : 'bg-[#161B22] border-2 border-[#00FFC8] hover:bg-[#00FFC8]/5 cursor-pointer'
            }
          `}
        >
          <Mic
            size={32}
            className={isRecording ? 'text-[#F85149]' : 'text-[#00FFC8]'}
          />
        </button>

        <div className="w-full max-w-xs">
          <div className="h-1.5 bg-[#30363D] rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-75 ${
                isRecording ? 'bg-[#F85149]' : 'bg-[#00FFC8]/50'
              }`}
              style={{ width: `${recordingProgress * 100}%` }}
            />
          </div>
          {error && (
            <p className="text-xs text-[#F85149] mt-2 text-center">{error}</p>
          )}
        </div>
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-[#8B949E]">样本列表</span>
          <span className={`text-xs font-medium ${sampleCount >= requiredSamples ? 'text-[#3FB950]' : 'text-[#8B949E]'}`}>
            已录制 {sampleCount}/{requiredSamples} 条
          </span>
        </div>

        {commandSamples.length === 0 ? (
          <div className="text-center py-8 text-xs text-[#484F58]">
            暂无样本，点击上方麦克风开始录制
          </div>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {commandSamples.map((s, idx) => (
              <div
                key={s.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-[#0D1117] border border-[#30363D]"
              >
                <div className="text-xs font-mono text-[#8B949E] w-14 shrink-0">
                  样本 #{idx + 1}
                </div>
                <div className="flex-1 flex items-center gap-2 min-w-0">
                  <WaveformMini embedding={s.embedding} />
                </div>
                <span className="text-[10px] text-[#484F58] font-mono shrink-0">
                  {formatTimestamp(s.timestamp)}
                </span>
                <button
                  onClick={() => playSample(s)}
                  className={`p-1.5 rounded-md transition-colors shrink-0 ${
                    playingId === s.id
                      ? 'bg-[#00FFC8]/20 text-[#00FFC8]'
                      : 'hover:bg-[#21262D] text-[#8B949E] hover:text-[#00FFC8]'
                  }`}
                >
                  <Play className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDeleteSample(s.id)}
                  className="p-1.5 rounded-md hover:bg-[#21262D] text-[#8B949E] hover:text-[#F85149] transition-colors shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={handleComplete}
        disabled={sampleCount < requiredSamples}
        className={`
          w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-md
          text-sm font-medium transition-colors
          ${
            sampleCount >= requiredSamples
              ? 'text-[#0D1117] bg-[#00FFC8] hover:bg-[#00CC9F]'
              : 'text-[#484F58] bg-[#21262D] cursor-not-allowed'
          }
        `}
      >
        <Check className="w-4 h-4" />
        完成训练
      </button>
    </div>
  );
}
