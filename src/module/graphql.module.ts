import 'reflect-metadata';
import { Module, type DynamicModule } from '@galaxy-stack/orbit-core';
import { GraphQLSchema, graphql, parse, validate, execute } from 'graphql';
import { SchemaBuilder } from '../schema/schema-builder';
import { RESOLVER_METADATA } from '../decorators/resolver.decorators';
import { DataLoaderContext, type DataLoaderFactory } from '../dataloader/context';
import { depthLimit, complexityLimit, aliasLimit, blockIntrospection, type GraphQLSecurityOptions } from '../security';
import { DEFAULT_GRAPHQL_SECURITY } from '../security/options';

export interface DataLoaderConfig {
  [name: string]: DataLoaderFactory;
}

export interface GraphQLModuleOptions {
  autoSchemaFile?: string | boolean;
  security?: GraphQLSecurityOptions;
  sortSchema?: boolean;
  playground?: boolean;
  introspection?: boolean;
  path?: string;
  context?: (ctx: { request: Request }) => any | Promise<any>;
  formatError?: (error: any) => any;
  resolvers?: any[];
  loaders?: DataLoaderConfig;
}

export interface GraphQLModuleAsyncOptions {
  imports?: any[];
  useFactory: (...args: any[]) => Promise<GraphQLModuleOptions> | GraphQLModuleOptions;
  inject?: any[];
}

const GRAPHQL_OPTIONS = Symbol('GRAPHQL_OPTIONS');
const GRAPHQL_SCHEMA = Symbol('GRAPHQL_SCHEMA');

export class GraphQLModule {
  private static schemaBuilder = new SchemaBuilder();

  static forRoot(options: GraphQLModuleOptions = {}): DynamicModule {
    const resolvers = options.resolvers || [];

    return {
      module: GraphQLModule,
      global: true,
      providers: [
        {
          provide: GRAPHQL_OPTIONS,
          useValue: {
            path: '/graphql',
            playground: true,
            introspection: true,
            ...options,
          },
        },
        {
          provide: GRAPHQL_SCHEMA,
          useFactory: () => {
            for (const resolver of resolvers) {
              const instance = new resolver();
              this.schemaBuilder.addResolver(instance);
            }
            return this.schemaBuilder.build();
          },
        },
        {
          provide: 'GraphQLHandler',
          useFactory: (schema: GraphQLSchema, opts: GraphQLModuleOptions) => {
            return new GraphQLHandler(schema, opts);
          },
          inject: [GRAPHQL_SCHEMA, GRAPHQL_OPTIONS],
        },
      ],
      exports: [GRAPHQL_SCHEMA, GRAPHQL_OPTIONS, 'GraphQLHandler'],
    };
  }

  static forRootAsync(options: GraphQLModuleAsyncOptions): DynamicModule {
    return {
      module: GraphQLModule,
      global: true,
      imports: options.imports || [],
      providers: [
        {
          provide: GRAPHQL_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject || [],
        },
        {
          provide: GRAPHQL_SCHEMA,
          useFactory: (opts: GraphQLModuleOptions) => {
            const resolvers = opts.resolvers || [];
            for (const resolver of resolvers) {
              const instance = new resolver();
              this.schemaBuilder.addResolver(instance);
            }
            return this.schemaBuilder.build();
          },
          inject: [GRAPHQL_OPTIONS],
        },
        {
          provide: 'GraphQLHandler',
          useFactory: (schema: GraphQLSchema, opts: GraphQLModuleOptions) => {
            return new GraphQLHandler(schema, opts);
          },
          inject: [GRAPHQL_SCHEMA, GRAPHQL_OPTIONS],
        },
      ],
      exports: [GRAPHQL_SCHEMA, GRAPHQL_OPTIONS, 'GraphQLHandler'],
    };
  }
}

export class GraphQLHandler {
  constructor(
    private readonly schema: GraphQLSchema,
    private readonly options: GraphQLModuleOptions
  ) {}

  private createLoaderContext(): DataLoaderContext {
    const ctx = new DataLoaderContext();
    const loaders = this.options.loaders || {};
    
    for (const [name, factory] of Object.entries(loaders)) {
      ctx.registerLoader(name, factory);
    }
    
    return ctx;
  }

  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = this.options.path || '/graphql';

    if (url.pathname !== path) {
      return new Response('Not Found', { status: 404 });
    }

    if (request.method === 'GET' && this.options.playground) {
      return this.servePlayground();
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    try {
      const body = await request.json() as { query: string; variables?: any; operationName?: string };
      const { query, variables, operationName } = body;

      const loaderContext = this.createLoaderContext();

      const userContext = this.options.context 
        ? await this.options.context({ request })
        : {};

      const context = {
        request,
        loaders: loaderContext,
        ...userContext,
      };

      const document = parse(query);
      const validationErrors = validate(
        this.schema,
        document,
        this.buildSecurityRules()
      );

      if (validationErrors.length > 0) {
        return new Response(
          JSON.stringify({
            errors: validationErrors.map(e => this.formatError(e)),
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      const result = await execute({
        schema: this.schema,
        document,
        contextValue: context,
        variableValues: variables,
        operationName,
      });

      if (result.errors) {
        result.errors = result.errors.map(e => this.formatError(e)) as any;
      }

      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error: any) {
      return new Response(
        JSON.stringify({
          errors: [this.formatError(error)],
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  }

  private buildSecurityRules(): any[] {
    const sec: GraphQLSecurityOptions = this.options.security || {};
    const introspection = this.options.introspection !== false;
    const disableIntrospection = sec.disableIntrospection ?? !introspection;
    const rules: any[] = [
      depthLimit(sec.maxDepth ?? DEFAULT_GRAPHQL_SECURITY.maxDepth),
      complexityLimit({
        maxComplexity: sec.maxComplexity ?? DEFAULT_GRAPHQL_SECURITY.maxComplexity,
        fieldCosts: sec.fieldCosts,
        listFactors: sec.listFactors,
      }),
      aliasLimit(sec.maxAliases ?? DEFAULT_GRAPHQL_SECURITY.maxAliases),
    ];
    if (disableIntrospection) {
      rules.push(blockIntrospection());
    }
    return rules;
  }

  private formatError(error: any): any {
    if (this.options.formatError) {
      return this.options.formatError(error);
    }
    return {
      message: error.message,
      locations: error.locations,
      path: error.path,
    };
  }

  private servePlayground(): Response {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>GraphQL Playground</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/graphiql@3/graphiql.min.css" />
</head>
<body style="margin: 0;">
  <div id="graphiql" style="height: 100vh;"></div>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script crossorigin src="https://cdn.jsdelivr.net/npm/graphiql@3/graphiql.min.js"></script>
  <script>
    const fetcher = GraphiQL.createFetcher({ url: '${this.options.path || '/graphql'}' });
    ReactDOM.createRoot(document.getElementById('graphiql')).render(
      React.createElement(GraphiQL, { fetcher })
    );
  </script>
</body>
</html>`;

    return new Response(html, {
      headers: { 'Content-Type': 'text/html' },
    });
  }
}
