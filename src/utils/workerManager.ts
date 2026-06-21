import type { InferenceResult } from './mockInference';
import type { TrainingSample, ClassPrototype } from './fewShotClassifier';

interface WorkerResponse {
  type: string;
  requestId?: string;
  result?: InferenceResult;
  sample?: TrainingSample;
  samples?: TrainingSample[];
  prototypes?: ClassPrototype[];
  success?: boolean;
  error?: string;
}

type PendingResolver =
  | { kind: 'infer'; resolve: (r: InferenceResult) => void; reject: (e: Error) => void }
  | { kind: 'sample'; resolve: (s: TrainingSample) => void; reject: (e: Error) => void }
  | { kind: 'success'; resolve: (s: boolean) => void; reject: (e: Error) => void }
  | { kind: 'list'; resolve: (v: { samples: TrainingSample[]; prototypes: ClassPrototype[] }) => void; reject: (e: Error) => void };

export class InferenceWorkerManager {
  private static instance: InferenceWorkerManager | null = null;
  private worker: Worker | null = null;
  private pendingRequests: Map<string, PendingResolver> = new Map();
  private defaultTimeout: number = 5000;

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

      const handleReady = (e: MessageEvent<WorkerResponse>) => {
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
        kind: 'infer',
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

  addSample(params: {
    commandId: string;
    label: string;
    audioData: Float32Array;
    sampleRate: number;
  }): Promise<TrainingSample> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('Worker not initialized. Call init() first.'));
        return;
      }

      const id = crypto.randomUUID();

      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Add sample request timed out after ${this.defaultTimeout}ms`));
      }, this.defaultTimeout);

      this.pendingRequests.set(id, {
        kind: 'sample',
        resolve: (sample) => {
          clearTimeout(timeoutId);
          resolve(sample);
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
      });

      this.worker.postMessage({
        type: 'addSample',
        requestId: id,
        sample: params,
      });
    });
  }

  removeSample(sampleId: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('Worker not initialized. Call init() first.'));
        return;
      }

      const id = crypto.randomUUID();

      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Remove sample request timed out`));
      }, this.defaultTimeout);

      this.pendingRequests.set(id, {
        kind: 'success',
        resolve: (success) => {
          clearTimeout(timeoutId);
          resolve(success);
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
      });

      this.worker.postMessage({
        type: 'removeSample',
        requestId: id,
        sampleId,
      });
    });
  }

  removeClass(commandId: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('Worker not initialized. Call init() first.'));
        return;
      }

      const id = crypto.randomUUID();

      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Remove class request timed out`));
      }, this.defaultTimeout);

      this.pendingRequests.set(id, {
        kind: 'success',
        resolve: (success) => {
          clearTimeout(timeoutId);
          resolve(success);
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
      });

      this.worker.postMessage({
        type: 'removeClass',
        requestId: id,
        commandId,
      });
    });
  }

  getSamplesAndPrototypes(): Promise<{ samples: TrainingSample[]; prototypes: ClassPrototype[] }> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('Worker not initialized. Call init() first.'));
        return;
      }

      const id = crypto.randomUUID();

      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Get samples request timed out`));
      }, this.defaultTimeout);

      this.pendingRequests.set(id, {
        kind: 'list',
        resolve: (value) => {
          clearTimeout(timeoutId);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
      });

      this.worker.postMessage({
        type: 'getSamples',
        requestId: id,
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

  private handleMessage(e: MessageEvent<WorkerResponse>): void {
    const { type, requestId } = e.data;
    if (!requestId) return;

    const pending = this.pendingRequests.get(requestId);
    if (!pending) return;

    this.pendingRequests.delete(requestId);

    if (e.data.error) {
      pending.reject(new Error(e.data.error));
      return;
    }

    if (pending.kind === 'infer' && type === 'result' && e.data.result) {
      pending.resolve(e.data.result);
    } else if (pending.kind === 'sample' && type === 'sampleAdded' && e.data.sample) {
      pending.resolve(e.data.sample);
    } else if (pending.kind === 'success' && (type === 'sampleRemoved' || type === 'classRemoved')) {
      pending.resolve(e.data.success ?? true);
    } else if (pending.kind === 'list' && type === 'samplesList') {
      pending.resolve({
        samples: e.data.samples ?? [],
        prototypes: e.data.prototypes ?? [],
      });
    } else {
      pending.reject(new Error(`Unexpected response type: ${type}`));
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
