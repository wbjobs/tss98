import type { InferenceResult } from './mockInference';

export interface QueuedCommand {
  id: string;
  audioData: Float32Array;
  sourceSampleRate: number;
  timestamp: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: InferenceResult;
  error?: string;
}

type InferenceCallback = (audioData: Float32Array, sampleRate: number) => Promise<InferenceResult>;

export class CommandQueue {
  private static instance: CommandQueue | null = null;
  private queue: QueuedCommand[] = [];
  private isProcessing: boolean = false;
  private maxQueueSize: number = 10;
  private inferenceCallback: InferenceCallback | null = null;

  onCommandProcessed: ((cmd: QueuedCommand) => void) | null = null;
  onQueueEmpty: (() => void) | null = null;

  private constructor() {}

  static getInstance(): CommandQueue {
    if (!CommandQueue.instance) {
      CommandQueue.instance = new CommandQueue();
    }
    return CommandQueue.instance;
  }

  setInferenceCallback(callback: InferenceCallback): void {
    this.inferenceCallback = callback;
  }

  enqueue(audioData: Float32Array, sampleRate: number): string {
    const id = crypto.randomUUID();
    const command: QueuedCommand = {
      id,
      audioData,
      sourceSampleRate: sampleRate,
      timestamp: Date.now(),
      status: 'pending',
    };

    this.queue.push(command);
    this.trimQueue();

    if (!this.isProcessing) {
      this.processNext();
    }

    return id;
  }

  cancel(id: string): boolean {
    const index = this.queue.findIndex((cmd) => cmd.id === id && cmd.status === 'pending');
    if (index !== -1) {
      this.queue.splice(index, 1);
      return true;
    }
    return false;
  }

  clear(): void {
    this.queue = this.queue.filter((cmd) => cmd.status === 'processing');
  }

  getQueue(): QueuedCommand[] {
    return [...this.queue];
  }

  size(): number {
    return this.queue.length;
  }

  private trimQueue(): void {
    while (this.queue.length > this.maxQueueSize) {
      const pendingIndex = this.queue.findIndex((cmd) => cmd.status === 'pending');
      if (pendingIndex !== -1) {
        this.queue.splice(pendingIndex, 1);
      } else {
        break;
      }
    }
  }

  private async processNext(): Promise<void> {
    if (this.isProcessing) return;

    const pendingIndex = this.queue.findIndex((cmd) => cmd.status === 'pending');
    if (pendingIndex === -1) {
      if (this.onQueueEmpty) {
        this.onQueueEmpty();
      }
      return;
    }

    this.isProcessing = true;
    const command = this.queue[pendingIndex];
    command.status = 'processing';

    try {
      if (!this.inferenceCallback) {
        throw new Error('Inference callback not set');
      }

      const result = await this.inferenceCallback(command.audioData, command.sourceSampleRate);
      command.status = 'completed';
      command.result = result;
    } catch (error) {
      command.status = 'failed';
      command.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.isProcessing = false;

      if (this.onCommandProcessed) {
        this.onCommandProcessed(command);
      }

      this.queue = this.queue.filter((cmd) => cmd.id !== command.id);

      this.processNext();
    }
  }
}
