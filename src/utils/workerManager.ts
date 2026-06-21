import type { InferenceResult } from './mockInference';

interface PendingRequest {
  resolve: (result: InferenceResult) => void;
  reject: (error: Error) => void;
}

interface WorkerMessage {
  type: string;
  requestId?: string;
  result?: InferenceResult;
  error?: string;
}

export class InferenceWorkerManager {
  private static instance: InferenceWorkerManager | null = null;
  private worker: Worker | null = null;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private defaultTimeout: number = 2000;

  private constructor() {}

  static getInstance(): InferenceWorkerManager {
    if (!InferenceWorkerManager.instance) {
      InferenceWorkerManager.instance = new InferenceWorkerManager();
    }
    return InferenceWorkerManager.instance;
  }

  init(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.worker) {
        resolve();
        return;
      }

      this.worker = new Worker(new URL('./inferenceWorker.ts', import.meta.url), {
        type: 'module',
      });

      const handleReady = (e: MessageEvent<WorkerMessage>) => {
        if (e.data.type === 'ready') {
          this.worker?.removeEventListener('message', handleReady);
          this.worker?.addEventListener('message', this.handleMessage.bind(this));
          this.worker?.addEventListener('error', this.handleError.bind(this));
          resolve();
        }
      };

      this.worker.addEventListener('message', handleReady);
      this.worker.addEventListener('error', (err) => {
        this.worker = null;
        reject(err);
      });
    });
  }

  infer(
    audioData: Float32Array,
    sourceSampleRate: number,
    requestId?: string
  ): Promise<InferenceResult> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('Worker not initialized. Call init() first.'));
        return;
      }

      const id = requestId || crypto.randomUUID();

      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Inference request timed out after ${this.defaultTimeout}ms`));
      }, this.defaultTimeout);

      this.pendingRequests.set(id, {
        resolve: (result) => {
          clearTimeout(timeoutId);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
      });

      this.worker.postMessage({
        type: 'infer',
        requestId: id,
        audioData,
        sourceSampleRate,
      });
    });
  }

  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    this.pendingRequests.forEach((_, requestId) => {
      const pending = this.pendingRequests.get(requestId);
      if (pending) {
        pending.reject(new Error('Worker terminated'));
      }
    });
    this.pendingRequests.clear();
  }

  private handleMessage(e: MessageEvent<WorkerMessage>): void {
    const { type, requestId, result, error } = e.data;

    if (type === 'result' && requestId) {
      const pending = this.pendingRequests.get(requestId);
      if (pending) {
        this.pendingRequests.delete(requestId);
        if (error) {
          pending.reject(new Error(error));
        } else if (result) {
          pending.resolve(result);
        } else {
          pending.reject(new Error('No result or error received'));
        }
      }
    }
  }

  private handleError(error: ErrorEvent): void {
    console.error('Worker error:', error);
    this.pendingRequests.forEach((pending) => {
      pending.reject(new Error(error.message));
    });
    this.pendingRequests.clear();
  }
}
