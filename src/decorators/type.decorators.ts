import 'reflect-metadata';

export const OBJECT_TYPE_METADATA = 'graphql:objectType';
export const INPUT_TYPE_METADATA = 'graphql:inputType';
export const INTERFACE_TYPE_METADATA = 'graphql:interfaceType';
export const ARGS_TYPE_METADATA = 'graphql:argsType';
export const FIELD_METADATA = 'graphql:field';
export const ENUM_METADATA = 'graphql:enum';

export interface TypeOptions {
  name?: string;
  description?: string;
  isAbstract?: boolean;
}

export interface FieldOptions {
  name?: string;
  description?: string;
  nullable?: boolean;
  defaultValue?: any;
  deprecationReason?: string;
  complexity?: number;
}

export interface FieldMetadata extends FieldOptions {
  propertyKey: string;
  typeFn?: () => any;
  isArray?: boolean;
}

export function ObjectType(options?: TypeOptions): ClassDecorator;
export function ObjectType(name?: string, options?: TypeOptions): ClassDecorator;
export function ObjectType(
  nameOrOptions?: string | TypeOptions,
  maybeOptions?: TypeOptions
): ClassDecorator {
  const [name, options] = typeof nameOrOptions === 'string'
    ? [nameOrOptions, maybeOptions || {}]
    : [undefined, nameOrOptions || {}];

  return (target) => {
    Reflect.defineMetadata(OBJECT_TYPE_METADATA, {
      name: name || target.name,
      ...options,
    }, target);
  };
}

export function InputType(options?: TypeOptions): ClassDecorator;
export function InputType(name?: string, options?: TypeOptions): ClassDecorator;
export function InputType(
  nameOrOptions?: string | TypeOptions,
  maybeOptions?: TypeOptions
): ClassDecorator {
  const [name, options] = typeof nameOrOptions === 'string'
    ? [nameOrOptions, maybeOptions || {}]
    : [undefined, nameOrOptions || {}];

  return (target) => {
    Reflect.defineMetadata(INPUT_TYPE_METADATA, {
      name: name ? `${name}Input` : `${target.name}Input`,
      ...options,
    }, target);
  };
}

export function InterfaceType(options?: TypeOptions): ClassDecorator;
export function InterfaceType(name?: string, options?: TypeOptions): ClassDecorator;
export function InterfaceType(
  nameOrOptions?: string | TypeOptions,
  maybeOptions?: TypeOptions
): ClassDecorator {
  const [name, options] = typeof nameOrOptions === 'string'
    ? [nameOrOptions, maybeOptions || {}]
    : [undefined, nameOrOptions || {}];

  return (target) => {
    Reflect.defineMetadata(INTERFACE_TYPE_METADATA, {
      name: name || target.name,
      ...options,
    }, target);
  };
}

export function ArgsType(options?: TypeOptions): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(ARGS_TYPE_METADATA, {
      name: target.name,
      ...options,
    }, target);
  };
}

export function Field(): PropertyDecorator;
export function Field(options: FieldOptions): PropertyDecorator;
export function Field(typeFn: () => any, options?: FieldOptions): PropertyDecorator;
export function Field(
  typeOrOptions?: (() => any) | FieldOptions,
  maybeOptions?: FieldOptions
): PropertyDecorator {
  return (target, propertyKey) => {
    const [typeFn, options] = typeof typeOrOptions === 'function'
      ? [typeOrOptions, maybeOptions || {}]
      : [undefined, typeOrOptions || {}];

    const existingFields: FieldMetadata[] = 
      Reflect.getMetadata(FIELD_METADATA, target.constructor) || [];

    const designType = Reflect.getMetadata('design:type', target, propertyKey);
    const isArray = designType === Array;

    existingFields.push({
      propertyKey: propertyKey as string,
      typeFn,
      isArray,
      ...options,
    });

    Reflect.defineMetadata(FIELD_METADATA, existingFields, target.constructor);
  };
}

export function registerEnumType<T extends object>(
  enumType: T,
  options: { name: string; description?: string; valuesMap?: Record<keyof T, { description?: string; deprecationReason?: string }> }
): void {
  Reflect.defineMetadata(ENUM_METADATA, {
    enumType,
    ...options,
  }, enumType);
}
