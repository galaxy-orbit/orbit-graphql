import 'reflect-metadata';
import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLInputObjectType,
  GraphQLString,
  GraphQLInt,
  GraphQLFloat,
  GraphQLBoolean,
  GraphQLID,
  GraphQLList,
  GraphQLNonNull,
  GraphQLFieldConfig,
  GraphQLInputFieldConfig,
  GraphQLEnumType,
  GraphQLInterfaceType,
  GraphQLType,
  GraphQLOutputType,
  GraphQLInputType,
} from 'graphql';
import {
  OBJECT_TYPE_METADATA,
  INPUT_TYPE_METADATA,
  FIELD_METADATA,
  type FieldMetadata,
} from '../decorators/type.decorators';
import {
  RESOLVER_METADATA,
  QUERY_METADATA,
  MUTATION_METADATA,
  SUBSCRIPTION_METADATA,
  RESOLVE_FIELD_METADATA,
  type ResolverMethodMetadata,
} from '../decorators/resolver.decorators';
import { getParamsMetadata } from '../decorators/param.decorators';
import { DATALOADER_METADATA, DataLoaderContext } from '../dataloader/context';

export class SchemaBuilder {
  private objectTypes: Map<any, GraphQLObjectType> = new Map();
  private inputTypes: Map<any, GraphQLInputObjectType> = new Map();
  private resolvers: any[] = [];

  addResolver(resolver: any): void {
    this.resolvers.push(resolver);
  }

  build(): GraphQLSchema {
    const queryFields: Record<string, GraphQLFieldConfig<any, any>> = {};
    const mutationFields: Record<string, GraphQLFieldConfig<any, any>> = {};
    const subscriptionFields: Record<string, GraphQLFieldConfig<any, any>> = {};

    for (const resolver of this.resolvers) {
      const resolverClass = resolver.constructor;

      const queries: ResolverMethodMetadata[] = 
        Reflect.getMetadata(QUERY_METADATA, resolverClass) || [];
      
      const mutations: ResolverMethodMetadata[] = 
        Reflect.getMetadata(MUTATION_METADATA, resolverClass) || [];

      const subscriptions: ResolverMethodMetadata[] = 
        Reflect.getMetadata(SUBSCRIPTION_METADATA, resolverClass) || [];

      for (const query of queries) {
        const fieldName = query.options.name || query.methodName;
        queryFields[fieldName] = this.buildFieldConfig(resolver, query);
      }

      for (const mutation of mutations) {
        const fieldName = mutation.options.name || mutation.methodName;
        mutationFields[fieldName] = this.buildFieldConfig(resolver, mutation);
      }

      for (const subscription of subscriptions) {
        const fieldName = subscription.options.name || subscription.methodName;
        subscriptionFields[fieldName] = this.buildSubscriptionConfig(resolver, subscription);
      }
    }

    const schemaConfig: any = {};

    if (Object.keys(queryFields).length > 0) {
      schemaConfig.query = new GraphQLObjectType({
        name: 'Query',
        fields: queryFields,
      });
    }

    if (Object.keys(mutationFields).length > 0) {
      schemaConfig.mutation = new GraphQLObjectType({
        name: 'Mutation',
        fields: mutationFields,
      });
    }

    if (Object.keys(subscriptionFields).length > 0) {
      schemaConfig.subscription = new GraphQLObjectType({
        name: 'Subscription',
        fields: subscriptionFields,
      });
    }

    return new GraphQLSchema(schemaConfig);
  }

  private buildFieldConfig(
    resolver: any,
    metadata: ResolverMethodMetadata
  ): GraphQLFieldConfig<any, any> {
    const returnType = this.getReturnType(metadata);

    return {
      type: returnType,
      description: metadata.options.description,
      deprecationReason: (metadata.options as any).deprecationReason,
      args: this.buildArgs(resolver.constructor, metadata.methodName),
      resolve: async (root, args, context, info) => {
        const params = this.resolveParams(resolver.constructor, metadata.methodName, {
          root,
          args,
          context,
          info,
        });
        return resolver[metadata.methodName](...params);
      },
    };
  }

  private buildSubscriptionConfig(
    resolver: any,
    metadata: ResolverMethodMetadata
  ): GraphQLFieldConfig<any, any> {
    const returnType = this.getReturnType(metadata);
    const options = metadata.options as any;

    return {
      type: returnType,
      description: metadata.options.description,
      args: this.buildArgs(resolver.constructor, metadata.methodName),
      subscribe: async (root, args, context, info) => {
        const params = this.resolveParams(resolver.constructor, metadata.methodName, {
          root,
          args,
          context,
          info,
        });
        return resolver[metadata.methodName](...params);
      },
      resolve: options.resolve || ((payload: any) => payload),
    };
  }

  private getReturnType(metadata: ResolverMethodMetadata): GraphQLOutputType {
    if (metadata.typeFn) {
      return this.convertToGraphQLType(metadata.typeFn()) as GraphQLOutputType;
    }
    return GraphQLString;
  }

  private buildArgs(
    resolverClass: any,
    methodName: string
  ): Record<string, any> {
    const paramsMetadata = getParamsMetadata(resolverClass, methodName);
    const args: Record<string, any> = {};

    for (const param of paramsMetadata) {
      if (param.type === 'args' && param.options) {
        const options = typeof param.options === 'string' 
          ? { name: param.options }
          : param.options;
        
        if (options.name) {
          args[options.name] = {
            type: options.type 
              ? this.convertToGraphQLInputType(options.type())
              : GraphQLString,
            description: options.description,
            defaultValue: options.defaultValue,
          };
        }
      }
    }

    return args;
  }

  private resolveParams(
    resolverClass: any,
    methodName: string,
    ctx: { root: any; args: any; context: any; info: any }
  ): any[] {
    const paramsMetadata = getParamsMetadata(resolverClass, methodName);
    const paramTypes = Reflect.getMetadata('design:paramtypes', resolverClass.prototype, methodName) || [];
    const params: any[] = new Array(paramTypes.length).fill(undefined);

    const loaderMetadata: Map<number, string> = 
      Reflect.getMetadata(DATALOADER_METADATA, resolverClass.prototype, methodName) || new Map();

    for (const param of paramsMetadata) {
      switch (param.type) {
        case 'args':
          if (param.options) {
            const name = typeof param.options === 'string' 
              ? param.options 
              : param.options.name;
            params[param.index] = name ? ctx.args[name] : ctx.args;
          } else {
            params[param.index] = ctx.args;
          }
          break;
        case 'context':
          if (typeof param.options === 'string') {
            params[param.index] = ctx.context[param.options];
          } else {
            params[param.index] = ctx.context;
          }
          break;
        case 'root':
        case 'parent':
          params[param.index] = ctx.root;
          break;
        case 'info':
          params[param.index] = ctx.info;
          break;
      }
    }

    for (const [index, loaderName] of loaderMetadata) {
      const loaderContext: DataLoaderContext | undefined = ctx.context?.loaders;
      if (loaderContext) {
        params[index] = loaderContext.getLoader(loaderName);
      }
    }

    return params;
  }

  private convertToGraphQLType(type: any): GraphQLType {
    if (type === String) return GraphQLString;
    if (type === Number) return GraphQLFloat;
    if (type === Boolean) return GraphQLBoolean;
    if (type === 'ID' || type?.name === 'ID') return GraphQLID;
    if (type === 'Int') return GraphQLInt;
    if (type === 'Float') return GraphQLFloat;

    if (Array.isArray(type)) {
      return new GraphQLList(this.convertToGraphQLType(type[0]));
    }

    if (this.objectTypes.has(type)) {
      return this.objectTypes.get(type)!;
    }

    const objectTypeMeta = Reflect.getMetadata(OBJECT_TYPE_METADATA, type);
    if (objectTypeMeta) {
      return this.buildObjectType(type);
    }

    return GraphQLString;
  }

  private convertToGraphQLInputType(type: any): GraphQLInputType {
    if (type === String) return GraphQLString;
    if (type === Number) return GraphQLFloat;
    if (type === Boolean) return GraphQLBoolean;
    if (type === 'ID' || type?.name === 'ID') return GraphQLID;
    if (type === 'Int') return GraphQLInt;
    if (type === 'Float') return GraphQLFloat;

    if (Array.isArray(type)) {
      return new GraphQLList(this.convertToGraphQLInputType(type[0]));
    }

    if (this.inputTypes.has(type)) {
      return this.inputTypes.get(type)!;
    }

    const inputTypeMeta = Reflect.getMetadata(INPUT_TYPE_METADATA, type);
    if (inputTypeMeta) {
      return this.buildInputType(type);
    }

    return GraphQLString;
  }

  private buildObjectType(type: any): GraphQLObjectType {
    if (this.objectTypes.has(type)) {
      return this.objectTypes.get(type)!;
    }

    const metadata = Reflect.getMetadata(OBJECT_TYPE_METADATA, type);
    const fields: FieldMetadata[] = Reflect.getMetadata(FIELD_METADATA, type) || [];

    const objectType = new GraphQLObjectType({
      name: metadata.name,
      description: metadata.description,
      fields: () => {
        const graphqlFields: Record<string, GraphQLFieldConfig<any, any>> = {};

        for (const field of fields) {
          const fieldType = field.typeFn 
            ? this.convertToGraphQLType(field.typeFn())
            : GraphQLString;

          graphqlFields[field.name || field.propertyKey] = {
            type: field.nullable ? fieldType : new GraphQLNonNull(fieldType) as any,
            description: field.description,
            deprecationReason: field.deprecationReason,
            resolve: (parent) => parent[field.propertyKey],
          };
        }

        return graphqlFields;
      },
    });

    this.objectTypes.set(type, objectType);
    return objectType;
  }

  private buildInputType(type: any): GraphQLInputObjectType {
    if (this.inputTypes.has(type)) {
      return this.inputTypes.get(type)!;
    }

    const metadata = Reflect.getMetadata(INPUT_TYPE_METADATA, type);
    const fields: FieldMetadata[] = Reflect.getMetadata(FIELD_METADATA, type) || [];

    const inputType = new GraphQLInputObjectType({
      name: metadata.name,
      description: metadata.description,
      fields: () => {
        const graphqlFields: Record<string, GraphQLInputFieldConfig> = {};

        for (const field of fields) {
          const fieldType = field.typeFn 
            ? this.convertToGraphQLInputType(field.typeFn())
            : GraphQLString;

          graphqlFields[field.name || field.propertyKey] = {
            type: field.nullable ? fieldType : new GraphQLNonNull(fieldType) as any,
            description: field.description,
            defaultValue: field.defaultValue,
          };
        }

        return graphqlFields;
      },
    });

    this.inputTypes.set(type, inputType);
    return inputType;
  }
}
