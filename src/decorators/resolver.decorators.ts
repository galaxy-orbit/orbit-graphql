import 'reflect-metadata';

export const RESOLVER_METADATA = 'graphql:resolver';
export const QUERY_METADATA = 'graphql:query';
export const MUTATION_METADATA = 'graphql:mutation';
export const SUBSCRIPTION_METADATA = 'graphql:subscription';
export const RESOLVE_FIELD_METADATA = 'graphql:resolveField';
export const RESOLVER_NAME_METADATA = 'graphql:resolverName';

export interface ResolverOptions {
  isAbstract?: boolean;
}

export interface QueryOptions {
  name?: string;
  description?: string;
  nullable?: boolean;
  deprecationReason?: string;
  complexity?: number;
}

export interface MutationOptions extends QueryOptions {}

export interface SubscriptionOptions extends QueryOptions {
  filter?: (payload: any, variables: any, context: any) => boolean | Promise<boolean>;
  resolve?: (payload: any, args: any, context: any, info: any) => any;
}

export interface ResolveFieldOptions {
  name?: string;
  description?: string;
  nullable?: boolean;
  complexity?: number;
}

export interface ResolverMethodMetadata {
  methodName: string;
  typeFn?: () => any;
  options: QueryOptions | MutationOptions | SubscriptionOptions | ResolveFieldOptions;
}

export function Resolver(): ClassDecorator;
export function Resolver(typeFunc: () => any): ClassDecorator;
export function Resolver(options: ResolverOptions): ClassDecorator;
export function Resolver(typeFunc: () => any, options: ResolverOptions): ClassDecorator;
export function Resolver(
  typeFuncOrOptions?: (() => any) | ResolverOptions,
  maybeOptions?: ResolverOptions
): ClassDecorator {
  return (target) => {
    const [typeFunc, options] = typeof typeFuncOrOptions === 'function'
      ? [typeFuncOrOptions, maybeOptions || {}]
      : [undefined, typeFuncOrOptions || {}];

    Reflect.defineMetadata(RESOLVER_METADATA, {
      typeFunc,
      ...options,
    }, target);
  };
}

export function Query(): MethodDecorator;
export function Query(options: QueryOptions): MethodDecorator;
export function Query(typeFn: () => any, options?: QueryOptions): MethodDecorator;
export function Query(
  typeOrOptions?: (() => any) | QueryOptions,
  maybeOptions?: QueryOptions
): MethodDecorator {
  return (target, propertyKey, descriptor) => {
    const [typeFn, options] = typeof typeOrOptions === 'function'
      ? [typeOrOptions, maybeOptions || {}]
      : [undefined, typeOrOptions || {}];

    const existingQueries: ResolverMethodMetadata[] = 
      Reflect.getMetadata(QUERY_METADATA, target.constructor) || [];

    existingQueries.push({
      methodName: propertyKey as string,
      typeFn,
      options: {
        name: options.name || (propertyKey as string),
        ...options,
      },
    });

    Reflect.defineMetadata(QUERY_METADATA, existingQueries, target.constructor);
  };
}

export function Mutation(): MethodDecorator;
export function Mutation(options: MutationOptions): MethodDecorator;
export function Mutation(typeFn: () => any, options?: MutationOptions): MethodDecorator;
export function Mutation(
  typeOrOptions?: (() => any) | MutationOptions,
  maybeOptions?: MutationOptions
): MethodDecorator {
  return (target, propertyKey, descriptor) => {
    const [typeFn, options] = typeof typeOrOptions === 'function'
      ? [typeOrOptions, maybeOptions || {}]
      : [undefined, typeOrOptions || {}];

    const existingMutations: ResolverMethodMetadata[] = 
      Reflect.getMetadata(MUTATION_METADATA, target.constructor) || [];

    existingMutations.push({
      methodName: propertyKey as string,
      typeFn,
      options: {
        name: options.name || (propertyKey as string),
        ...options,
      },
    });

    Reflect.defineMetadata(MUTATION_METADATA, existingMutations, target.constructor);
  };
}

export function Subscription(): MethodDecorator;
export function Subscription(options: SubscriptionOptions): MethodDecorator;
export function Subscription(typeFn: () => any, options?: SubscriptionOptions): MethodDecorator;
export function Subscription(
  typeOrOptions?: (() => any) | SubscriptionOptions,
  maybeOptions?: SubscriptionOptions
): MethodDecorator {
  return (target, propertyKey, descriptor) => {
    const [typeFn, options] = typeof typeOrOptions === 'function'
      ? [typeOrOptions, maybeOptions || {}]
      : [undefined, typeOrOptions || {}];

    const existingSubscriptions: ResolverMethodMetadata[] = 
      Reflect.getMetadata(SUBSCRIPTION_METADATA, target.constructor) || [];

    existingSubscriptions.push({
      methodName: propertyKey as string,
      typeFn,
      options: {
        name: options.name || (propertyKey as string),
        ...options,
      },
    });

    Reflect.defineMetadata(SUBSCRIPTION_METADATA, existingSubscriptions, target.constructor);
  };
}

export function ResolveField(): MethodDecorator;
export function ResolveField(name: string): MethodDecorator;
export function ResolveField(options: ResolveFieldOptions): MethodDecorator;
export function ResolveField(typeFn: () => any, options?: ResolveFieldOptions): MethodDecorator;
export function ResolveField(
  nameOrTypeOrOptions?: string | (() => any) | ResolveFieldOptions,
  maybeOptions?: ResolveFieldOptions
): MethodDecorator {
  return (target, propertyKey, descriptor) => {
    let typeFn: (() => any) | undefined;
    let options: ResolveFieldOptions = {};
    let fieldName = propertyKey as string;

    if (typeof nameOrTypeOrOptions === 'string') {
      fieldName = nameOrTypeOrOptions;
      options = maybeOptions || {};
    } else if (typeof nameOrTypeOrOptions === 'function') {
      typeFn = nameOrTypeOrOptions;
      options = maybeOptions || {};
    } else if (nameOrTypeOrOptions) {
      options = nameOrTypeOrOptions;
    }

    const existingFields: ResolverMethodMetadata[] = 
      Reflect.getMetadata(RESOLVE_FIELD_METADATA, target.constructor) || [];

    existingFields.push({
      methodName: propertyKey as string,
      typeFn,
      options: {
        name: options.name || fieldName,
        ...options,
      },
    });

    Reflect.defineMetadata(RESOLVE_FIELD_METADATA, existingFields, target.constructor);
  };
}
