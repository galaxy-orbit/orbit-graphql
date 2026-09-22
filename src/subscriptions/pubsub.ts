export type SubscriptionHandler<T = any> = (payload: T) => void;

export interface PubSubEngine {
  publish(triggerName: string, payload: any): Promise<void>;
  subscribe(triggerName: string, handler: SubscriptionHandler): Promise<number>;
  unsubscribe(subscriptionId: number): void;
  asyncIterator<T>(triggers: string | string[]): AsyncIterator<T>;
}

export class PubSub implements PubSubEngine {
  private subscriptions: Map<number, { trigger: string; handler: SubscriptionHandler }> = new Map();
  private nextSubscriptionId = 0;
  private triggerSubscriptions: Map<string, Set<number>> = new Map();

  async publish(triggerName: string, payload: any): Promise<void> {
    const subscriptionIds = this.triggerSubscriptions.get(triggerName);
    if (!subscriptionIds) return;

    for (const id of subscriptionIds) {
      const subscription = this.subscriptions.get(id);
      if (subscription) {
        subscription.handler(payload);
      }
    }
  }

  async subscribe(triggerName: string, handler: SubscriptionHandler): Promise<number> {
    const id = this.nextSubscriptionId++;
    this.subscriptions.set(id, { trigger: triggerName, handler });

    if (!this.triggerSubscriptions.has(triggerName)) {
      this.triggerSubscriptions.set(triggerName, new Set());
    }
    this.triggerSubscriptions.get(triggerName)!.add(id);

    return id;
  }

  unsubscribe(subscriptionId: number): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (subscription) {
      const triggerSubs = this.triggerSubscriptions.get(subscription.trigger);
      if (triggerSubs) {
        triggerSubs.delete(subscriptionId);
        if (triggerSubs.size === 0) {
          this.triggerSubscriptions.delete(subscription.trigger);
        }
      }
      this.subscriptions.delete(subscriptionId);
    }
  }

  asyncIterator<T>(triggers: string | string[]): AsyncIterator<T> {
    const triggerArray = Array.isArray(triggers) ? triggers : [triggers];
    return new PubSubAsyncIterator<T>(this, triggerArray);
  }
}

class PubSubAsyncIterator<T> implements AsyncIterator<T> {
  private pubsub: PubSub;
  private triggers: string[];
  private subscriptionIds: number[] = [];
  private pullQueue: ((value: IteratorResult<T>) => void)[] = [];
  private pushQueue: T[] = [];
  private running = true;
  private initialized = false;

  constructor(pubsub: PubSub, triggers: string[]) {
    this.pubsub = pubsub;
    this.triggers = triggers;
  }

  private async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    for (const trigger of this.triggers) {
      const id = await this.pubsub.subscribe(trigger, (payload: T) => {
        this.pushValue(payload);
      });
      this.subscriptionIds.push(id);
    }
  }

  async next(): Promise<IteratorResult<T>> {
    await this.init();

    if (!this.running) {
      return { value: undefined as any, done: true };
    }

    if (this.pushQueue.length > 0) {
      return { value: this.pushQueue.shift()!, done: false };
    }

    return new Promise((resolve) => {
      this.pullQueue.push(resolve);
    });
  }

  async return(): Promise<IteratorResult<T>> {
    this.running = false;
    this.cleanup();
    return { value: undefined as any, done: true };
  }

  async throw(error: Error): Promise<IteratorResult<T>> {
    this.running = false;
    this.cleanup();
    throw error;
  }

  private pushValue(value: T): void {
    if (this.pullQueue.length > 0) {
      const resolve = this.pullQueue.shift()!;
      resolve({ value, done: false });
    } else {
      this.pushQueue.push(value);
    }
  }

  private cleanup(): void {
    for (const id of this.subscriptionIds) {
      this.pubsub.unsubscribe(id);
    }
    this.subscriptionIds = [];
    this.pullQueue = [];
    this.pushQueue = [];
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return this;
  }
}

export function withFilter<T, TContext = any>(
  asyncIteratorFn: (rootValue: any, args: any, context: TContext, info: any) => AsyncIterator<T>,
  filterFn: (payload: T, args: any, context: TContext, info: any) => boolean | Promise<boolean>
): (rootValue: any, args: any, context: TContext, info: any) => AsyncIterator<T> {
  return (rootValue, args, context, info) => {
    const asyncIterator = asyncIteratorFn(rootValue, args, context, info);

    const filteredIterator: AsyncIterableIterator<T> = {
      async next(): Promise<IteratorResult<T>> {
        while (true) {
          const result = await asyncIterator.next();
          if (result.done) {
            return result;
          }

          const shouldInclude = await filterFn(result.value, args, context, info);
          if (shouldInclude) {
            return result;
          }
        }
      },

      return(): Promise<IteratorResult<T>> {
        return asyncIterator.return?.() || Promise.resolve({ value: undefined as any, done: true });
      },

      throw(error: Error): Promise<IteratorResult<T>> {
        return asyncIterator.throw?.(error) || Promise.reject(error);
      },

      [Symbol.asyncIterator]() {
        return this;
      },
    };

    return filteredIterator;
  };
}
