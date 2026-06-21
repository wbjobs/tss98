import { useState, useRef, useCallback, useEffect } from 'react';
import { EnhancedVAD } from '@/utils/enhancedVad';
import { trimSilence } from '@/utils/audioPreprocessor';

const FFT_SIZE = 512;
const SILENCE_DURATION = 600;
const MIN_SPEECH_DURATION = 300;
const SAMPLE_RATE = 16000;
const FRAME_SIZE = 512;

export interface UseAudioCaptureReturn {
  isListening: boolean;
  audioLevel: number;
  waveformData: Uint8Array;
  cleanedWaveform: Float32Array;
  vadState: 'idle' | 'noise' | 'speech';
  speechFrames: number;
  startListening: () => void;
  stopListening: () => void;
  error: string | null;
  permissionState: PermissionState | 'unknown';
  stats: {
    noiseFrames: number;
    speechDetectedCount: number;
    avgEnergy: number;
  };
}

export function useAudioCapture(
  onSpeechEnd: (audioData: Float32Array, sampleRate: number) => void
): UseAudioCaptureReturn {
  const [isListening, setIsListening] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [waveformData, setWaveformData] = useState<Uint8Array>(
    () => new Uint8Array(128)
  );
  const [cleanedWaveform, setCleanedWaveform] = useState<Float32Array>(
    () => new Float32Array(128)
  );
  const [vadState, setVadState] = useState<'idle' | 'noise' | 'speech'>('idle');
  const [speechFrames, setSpeechFrames] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<PermissionState | 'unknown'>('unknown');
  const [stats, setStats] = useState({ noiseFrames: 0, speechDetectedCount: 0, avgEnergy: 0 });

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const audioChunksRef = useRef<Float32Array[]>([]);
  const cleanedChunksRef = useRef<Float32Array[]>([]);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isListeningRef = useRef(false);
  const vadRef = useRef<EnhancedVAD | null>(null);
  const speechFramesRef = useRef(0);
  const noiseFramesRef = useRef(0);
  const totalEnergyRef = useRef(0);
  const totalFramesRef = useRef(0);
  const speechStartTimeRef = useRef(0);
  const hasEnoughSpeechRef = useRef(false);
  const consecutiveSpeechRef = useRef(0);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current !== null) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const flushAudioChunks = useCallback(() => {
    if (cleanedChunksRef.current.length === 0) return;

    let totalLength = 0;
    for (const chunk of cleanedChunksRef.current) {
      totalLength += chunk.length;
    }

    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of cleanedChunksRef.current) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    const { trimmed } = trimSilence(merged, 0.015, FRAME_SIZE);

    if (trimmed.length > SAMPLE_RATE * 0.2) {
      onSpeechEnd(trimmed, SAMPLE_RATE);
      setStats((s) => ({ ...s, speechDetectedCount: s.speechDetectedCount + 1 }));
    }

    cleanedChunksRef.current = [];
    audioChunksRef.current = [];
    speechFramesRef.current = 0;
    hasEnoughSpeechRef.current = false;
    consecutiveSpeechRef.current = 0;
  }, [onSpeechEnd]);

  const updateAudioLevel = useCallback(() => {
    if (!analyserRef.current || !isListeningRef.current) return;

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);
    setWaveformData(new Uint8Array(dataArray));

    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      const normalized = (dataArray[i] - 128) / 128;
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / bufferLength);
    setAudioLevel(Math.min(rms * 3, 1));

    animFrameRef.current = requestAnimationFrame(updateAudioLevel);
  }, []);

  const processAudioFrame = useCallback((chunk: Float32Array) => {
    if (!vadRef.current) return;

    const result = vadRef.current.processFrame(chunk);

    const displayFrame = new Float32Array(128);
    const step = Math.floor(result.cleanedFrame.length / 128);
    for (let i = 0; i < 128; i++) {
      displayFrame[i] = result.cleanedFrame[i * step] || 0;
    }
    setCleanedWaveform(displayFrame);

    totalFramesRef.current++;
    totalEnergyRef.current += result.energy;
    setStats((s) => ({
      ...s,
      avgEnergy: totalEnergyRef.current / totalFramesRef.current,
    }));

    if (result.isSpeech) {
      noiseFramesRef.current = 0;
      consecutiveSpeechRef.current++;

      if (consecutiveSpeechRef.current >= 3 && !hasEnoughSpeechRef.current) {
        hasEnoughSpeechRef.current = true;
        speechStartTimeRef.current = Date.now();
        setVadState('speech');
      }

      if (hasEnoughSpeechRef.current) {
        speechFramesRef.current++;
        setSpeechFrames(speechFramesRef.current);
        cleanedChunksRef.current.push(result.cleanedFrame);
        audioChunksRef.current.push(chunk);
        clearSilenceTimer();
      }
    } else {
      noiseFramesRef.current++;
      setStats((s) => ({ ...s, noiseFrames: s.noiseFrames + 1 }));

      if (consecutiveSpeechRef.current > 0) {
        consecutiveSpeechRef.current = Math.max(0, consecutiveSpeechRef.current - 1);
      }

      if (hasEnoughSpeechRef.current) {
        cleanedChunksRef.current.push(result.cleanedFrame);
        audioChunksRef.current.push(chunk);

        const speechDuration = Date.now() - speechStartTimeRef.current;

        if (speechDuration >= MIN_SPEECH_DURATION) {
          clearSilenceTimer();
          silenceTimerRef.current = setTimeout(() => {
            if (isListeningRef.current) {
              setVadState('idle');
              flushAudioChunks();
            }
          }, SILENCE_DURATION);
        } else {
          clearSilenceTimer();
          silenceTimerRef.current = setTimeout(() => {
            cleanedChunksRef.current = [];
            audioChunksRef.current = [];
            hasEnoughSpeechRef.current = false;
            setVadState('idle');
          }, 400);
        }
      } else if (noiseFramesRef.current > 10) {
        setVadState('noise');
      }
    }
  }, [clearSilenceTimer, flushAudioChunks]);

  const estimateNoiseProfile = useCallback((stream: MediaStream, audioContext: AudioContext) => {
    return new Promise<void>((resolve) => {
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const processor = audioContext.createScriptProcessor(FRAME_SIZE, 1, 1);
      let framesCollected = 0;
      const maxFrames = 30;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const chunk = new Float32Array(inputData);

        if (vadRef.current && framesCollected < maxFrames) {
          vadRef.current.updateNoiseProfile(chunk);
          framesCollected++;
        }

        if (framesCollected >= maxFrames) {
          processor.disconnect();
          source.disconnect();
          analyser.disconnect();
          resolve();
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);
    });
  }, []);

  const startListening = useCallback(async () => {
    try {
      setError(null);
      setVadState('idle');
      setStats({ noiseFrames: 0, speechDetectedCount: 0, avgEnergy: 0 });
      speechFramesRef.current = 0;
      noiseFramesRef.current = 0;
      totalEnergyRef.current = 0;
      totalFramesRef.current = 0;
      cleanedChunksRef.current = [];
      audioChunksRef.current = [];

      vadRef.current = new EnhancedVAD({
        sampleRate: SAMPLE_RATE,
        frameSize: FRAME_SIZE,
        energyThreshold: 0.02,
        zcrThreshold: 0.15,
        spectralFlatnessThreshold: 0.6,
        noiseEstimationFrames: 30,
      });

      const permissionResult = await navigator.permissions.query({
        name: 'microphone' as PermissionName,
      });
      setPermissionState(permissionResult.state);

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
      const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
      audioContextRef.current = audioContext;

      await estimateNoiseProfile(stream, audioContext);

      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;

      source.connect(analyser);

      const processor = audioContext.createScriptProcessor(FRAME_SIZE, 1, 1);
      scriptProcessorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const chunk = new Float32Array(inputData);
        processAudioFrame(chunk);
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      isListeningRef.current = true;
      setIsListening(true);
      animFrameRef.current = requestAnimationFrame(updateAudioLevel);
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? '麦克风权限被拒绝'
          : err instanceof DOMException && err.name === 'NotFoundError'
            ? '未找到麦克风设备'
            : '无法启动音频捕获';
      setError(message);
      setPermissionState('denied');
      setIsListening(false);
      isListeningRef.current = false;
    }
  }, [estimateNoiseProfile, processAudioFrame, updateAudioLevel]);

  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    clearSilenceTimer();

    if (hasEnoughSpeechRef.current && cleanedChunksRef.current.length > 0) {
      flushAudioChunks();
    }

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }

    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current.onaudioprocess = null;
      scriptProcessorRef.current = null;
    }

    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }

    if (analyserRef.current) {
      analyserRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    cleanedChunksRef.current = [];
    audioChunksRef.current = [];
    vadRef.current = null;
    hasEnoughSpeechRef.current = false;
    consecutiveSpeechRef.current = 0;
    speechFramesRef.current = 0;

    setIsListening(false);
    setAudioLevel(0);
    setVadState('idle');
    setSpeechFrames(0);
    setWaveformData(new Uint8Array(128));
    setCleanedWaveform(new Float32Array(128));
  }, [clearSilenceTimer, flushAudioChunks]);

  useEffect(() => {
    return () => {
      if (isListeningRef.current) {
        if (animFrameRef.current) {
          cancelAnimationFrame(animFrameRef.current);
        }
        clearSilenceTimer();
        scriptProcessorRef.current?.disconnect();
        sourceRef.current?.disconnect();
        audioContextRef.current?.close();
        streamRef.current?.getTracks().forEach((track) => track.stop());
      }
    };
  }, [clearSilenceTimer]);

  return {
    isListening,
    audioLevel,
    waveformData,
    cleanedWaveform,
    vadState,
    speechFrames,
    startListening,
    stopListening,
    error,
    permissionState,
    stats,
  };
}
