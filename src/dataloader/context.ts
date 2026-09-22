import 'reflect-metadata';
import { DataLoader } from './dataloader';

export const DATALOADER_METADATA = 'graphql:dataloader';

export interface DataLoaderFactory<K = any, V = any> {
  (): DataLoader<K, V>;
}

export function Loader(loaderName: string): ParameterDecorator {
  return (target, propertyKey, parameterIndex) => {
    const existingLoaders: Map<number, string> = 
      Reflect.getMetadata(DATALOADER_METADATA, target, propertyKey!) || new Map();
    existingLoaders.set(parameterIndex, loaderName);
    Reflect.defineMetadata(DATALOADER_METADATA, existingLoaders, target, propertyKey!);
  };
}

export class DataLoaderContext {
  private loaders: Map<string, DataLoader<any, any>> = new Map();
  private factories: Map<string, DataLoaderFactory> = new Map();

  registerLoader(name: string, factory: DataLoaderFactory): void {
    this.factories.set(name, factory);
  }

  getLoader<K, V>(name: string): DataLoader<K, V> {
    if (!this.loaders.has(name)) {
      const factory = this.factories.get(name);
      if (!factory) {
        throw new Error(`DataLoader "${name}" not registered`);
      }
      this.loaders.set(name, factory());
    }
    return this.loaders.get(name)!;
  }

  clearAll(): void {
    for (const loader of this.loaders.values()) {
      loader.clearAll();
    }
    this.loaders.clear();
  }
}

export function createDataLoaderContext(): DataLoaderContext {
  return new DataLoaderContext();
}
