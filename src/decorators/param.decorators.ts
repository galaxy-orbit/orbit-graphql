import 'reflect-metadata';

export const ARGS_METADATA = 'graphql:args';
export const CONTEXT_METADATA = 'graphql:context';
export const ROOT_METADATA = 'graphql:root';
export const PARENT_METADATA = 'graphql:parent';
export const INFO_METADATA = 'graphql:info';

export interface ArgsOptions {
  name?: string;
  type?: () => any;
  nullable?: boolean;
  defaultValue?: any;
  description?: string;
}

export interface ParamMetadata {
  index: number;
  type: 'args' | 'context' | 'root' | 'parent' | 'info';
  options?: ArgsOptions | string;
}

function createParamDecorator(type: ParamMetadata['type']) {
  return (options?: ArgsOptions | string): ParameterDecorator => {
    return (target, propertyKey, parameterIndex) => {
      const metadataKey = `graphql:params:${String(propertyKey)}`;
      const existingParams: ParamMetadata[] = 
        Reflect.getMetadata(metadataKey, target.constructor) || [];

      existingParams.push({
        index: parameterIndex,
        type,
        options,
      });

      Reflect.defineMetadata(metadataKey, existingParams, target.constructor);
    };
  };
}

export function Args(): ParameterDecorator;
export function Args(name: string): ParameterDecorator;
export function Args(options: ArgsOptions): ParameterDecorator;
export function Args(name: string, options: ArgsOptions): ParameterDecorator;
export function Args(
  nameOrOptions?: string | ArgsOptions,
  maybeOptions?: ArgsOptions
): ParameterDecorator {
  return (target, propertyKey, parameterIndex) => {
    const metadataKey = `graphql:params:${String(propertyKey)}`;
    const existingParams: ParamMetadata[] = 
      Reflect.getMetadata(metadataKey, target.constructor) || [];

    let options: ArgsOptions = {};
    if (typeof nameOrOptions === 'string') {
      options = { name: nameOrOptions, ...(maybeOptions || {}) };
    } else if (nameOrOptions) {
      options = nameOrOptions;
    }

    existingParams.push({
      index: parameterIndex,
      type: 'args',
      options,
    });

    Reflect.defineMetadata(metadataKey, existingParams, target.constructor);
  };
}

export const Context = createParamDecorator('context');
export const Root = createParamDecorator('root');
export const Parent = createParamDecorator('parent');
export const Info = createParamDecorator('info');

export function getParamsMetadata(target: any, methodName: string): ParamMetadata[] {
  return Reflect.getMetadata(`graphql:params:${methodName}`, target) || [];
}
