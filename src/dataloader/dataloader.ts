export interface DataLoaderOptions<K, V> {
  batchFn: (keys: K[]) => Promise<(V | Error)[]>;
  cacheKeyFn?: (key: K) => string;
  cache?: boolean;
  maxBatchSize?: number;
  batchScheduleFn?: (callback: () => void) => void;
}

export class DataLoader<K, V> {
  private cache: Map<string, Promise<V>> = new Map();
  private batch: { key: K; resolve: (value: V) => void; reject: (error: Error) => void }[] = [];
  private batchScheduled = false;

  private readonly batchFn: (keys: K[]) => Promise<(V | Error)[]>;
  private readonly cacheKeyFn: (key: K) => string;
  private readonly cacheEnabled: boolean;
  private readonly maxBatchSize: number;
  private readonly batchScheduleFn: (callback: () => void) => void;

  constructor(options: DataLoaderOptions<K, V>) {
    this.batchFn = options.batchFn;
    this.cacheKeyFn = options.cacheKeyFn || ((key: K) => String(key));
    this.cacheEnabled = options.cache !== false;
    this.maxBatchSize = options.maxBatchSize || Infinity;
    this.batchScheduleFn = options.batchScheduleFn || ((cb) => queueMicrotask(cb));
  }

  async load(key: K): Promise<V> {
    const cacheKey = this.cacheKeyFn(key);

    if (this.cacheEnabled && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const promise = new Promise<V>((resolve, reject) => {
      this.batch.push({ key, resolve, reject });
      
      if (!this.batchScheduled) {
        this.batchScheduled = true;
        this.batchScheduleFn(() => this.dispatchBatch());
      }
    });

    if (this.cacheEnabled) {
      this.cache.set(cacheKey, promise);
    }

    return promise;
  }

  async loadMany(keys: K[]): Promise<(V | Error)[]> {
    return Promise.all(
      keys.map((key) =>
        this.load(key).catch((error) => error as Error)
      )
    );
  }

  clear(key: K): this {
    const cacheKey = this.cacheKeyFn(key);
    this.cache.delete(cacheKey);
    return this;
  }

  clearAll(): this {
    this.cache.clear();
    return this;
  }

  prime(key: K, value: V): this {
    const cacheKey = this.cacheKeyFn(key);
    if (!this.cache.has(cacheKey)) {
      this.cache.set(cacheKey, Promise.resolve(value));
    }
    return this;
  }

  private async dispatchBatch(): Promise<void> {
    const batch = this.batch;
    this.batch = [];
    this.batchScheduled = false;

    if (batch.length === 0) return;

    const keys = batch.map((item) => item.key);

    try {
      const batchSize = this.maxBatchSize;
      const chunks: K[][] = [];
      
      for (let i = 0; i < keys.length; i += batchSize) {
        chunks.push(keys.slice(i, i + batchSize));
      }

      let resultIndex = 0;
      for (const chunk of chunks) {
        const results = await this.batchFn(chunk);

        if (results.length !== chunk.length) {
          const error = new Error(
            `DataLoader batch function returned ${results.length} results for ${chunk.length} keys`
          );
          for (let i = 0; i < chunk.length; i++) {
            batch[resultIndex + i].reject(error);
          }
        } else {
          for (let i = 0; i < results.length; i++) {
            const result = results[i];
            if (result instanceof Error) {
              batch[resultIndex + i].reject(result);
            } else {
              batch[resultIndex + i].resolve(result);
            }
          }
        }
        resultIndex += chunk.length;
      }
    } catch (error) {
      for (const item of batch) {
        item.reject(error as Error);
      }
    }
  }
}

export function createDataLoader<K, V>(
  batchFn: (keys: K[]) => Promise<(V | Error)[]>,
  options?: Omit<DataLoaderOptions<K, V>, 'batchFn'>
): DataLoader<K, V> {
  return new DataLoader({ batchFn, ...options });
}
