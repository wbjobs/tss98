import { useState, useRef, useCallback, useEffect } from 'react';

const FFT_SIZE = 256;
const SILENCE_DURATION = 800;
const ENERGY_THRESHOLD = 0.015;
const SAMPLE_RATE = 16000;

export interface UseAudioCaptureReturn {
  isListening: boolean;
  audioLevel: number;
  waveformData: Uint8Array;
  startListening: () => void;
  stopListening: () => void;
  error: string | null;
  permissionState: PermissionState | 'unknown';
}

export function useAudioCapture(
  onSpeechEnd: (audioData: Float32Array) => void
): UseAudioCaptureReturn {
  const [isListening, setIsListening] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [waveformData, setWaveformData] = useState<Uint8Array>(
    () => new Uint8Array(128)
  );
  const [error, setError] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<PermissionState | 'unknown'>('unknown');

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const audioChunksRef = useRef<Float32Array[]>([]);
  const isSpeechActiveRef = useRef(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasSpeechStartedRef = useRef(false);
  const isListeningRef = useRef(false);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current !== null) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const flushAudioChunks = useCallback(() => {
    if (audioChunksRef.current.length === 0) return;

    let totalLength = 0;
    for (const chunk of audioChunksRef.current) {
      totalLength += chunk.length;
    }

    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of audioChunksRef.current) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    audioChunksRef.current = [];
    onSpeechEnd(merged);
  }, [onSpeechEnd]);

  const computeEnergyFromFloat = (data: Float32Array): number => {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i] * data[i];
    }
    return Math.sqrt(sum / data.length);
  };

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

  const startListening = useCallback(async () => {
    try {
      setError(null);

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
        },
      });

      streamRef.current = stream;
      const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;

      source.connect(analyser);

      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      scriptProcessorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const chunk = new Float32Array(inputData);
        const energy = computeEnergyFromFloat(chunk);

        if (energy > ENERGY_THRESHOLD) {
          isSpeechActiveRef.current = true;
          hasSpeechStartedRef.current = true;
          audioChunksRef.current.push(chunk);
          clearSilenceTimer();
        } else if (isSpeechActiveRef.current) {
          audioChunksRef.current.push(chunk);
          clearSilenceTimer();

          silenceTimerRef.current = setTimeout(() => {
            isSpeechActiveRef.current = false;
            hasSpeechStartedRef.current = false;
            flushAudioChunks();
          }, SILENCE_DURATION);
        }
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
  }, [clearSilenceTimer, flushAudioChunks, updateAudioLevel]);

  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    clearSilenceTimer();

    if (hasSpeechStartedRef.current && audioChunksRef.current.length > 0) {
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

    audioChunksRef.current = [];
    isSpeechActiveRef.current = false;
    hasSpeechStartedRef.current = false;

    setIsListening(false);
    setAudioLevel(0);
    setWaveformData(new Uint8Array(128));
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
    startListening,
    stopListening,
    error,
    permissionState,
  };
}
