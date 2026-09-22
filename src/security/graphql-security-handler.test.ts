import { describe, test, expect } from 'bun:test';
import 'reflect-metadata';
import { Resolver, Query } from '../decorators/resolver.decorators';
import { GraphQLHandler } from '../module/graphql.module';
import type { GraphQLModuleOptions } from '../module/graphql.module';

@Resolver()
class SecureResolver {
  @Query(() => String)
  hello(): string {
    return 'secure';
  }
}

function makeRequest(query: string): Request {
  return new Request('http://localhost/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
}

function makeHandler(opts: Partial<GraphQLModuleOptions> = {}): GraphQLHandler {
  const options: GraphQLModuleOptions = { path: '/graphql', ...opts };
  // Minimal schema: security tests only need validation to run.
  // @ts-expect-error test double
  const handler = new GraphQLHandler(null, options);
  return handler;
}

describe('GraphQLHandler security', () => {
  test('blocks depth attack over HTTP with security.maxDepth', async () => {
    const { GraphQLSchema, GraphQLObjectType, GraphQLString } = await import('graphql');
    // 5-level chain: Post -> Author -> Post -> Author -> Post
    const postType: any = new GraphQLObjectType({ name: 'Post', fields: () => ({
      title: { type: GraphQLString },
      author: { type: authorType },
    })});
    const authorType: any = new GraphQLObjectType({ name: 'Author', fields: () => ({
      name: { type: GraphQLString },
      posts: { type: postType },
    })});
    const schema = new GraphQLSchema({
      query: new GraphQLObjectType({ name: 'Query', fields: {
        hello: { type: GraphQLString },
        post: { type: postType },
      }}),
    });
    const handler = new GraphQLHandler(schema, {
      path: '/graphql',
      security: { maxDepth: 3 },
    });
    const attack = '{ post { author { posts { author { posts { title } } } } } }';
    const res = await handler.handle(makeRequest(attack));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.errors[0].message).toContain('maximum depth');
    // Shallow query still passes
    const ok = await handler.handle(makeRequest('{ hello }'));
    expect(ok.status).toBe(200);
  });

  test('introspection is blocked when introspection: false', async () => {
    const { SchemaBuilder } = await import('../schema/schema-builder');
    const builder = new SchemaBuilder();
    builder.addResolver(new SecureResolver());
    const schema = builder.build();
    const handler = new GraphQLHandler(schema, {
      path: '/graphql',
      introspection: false,
    });
    const res = await handler.handle(
      makeRequest('{ __schema { queryType { name } } }')
    );
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.errors[0].message).toContain('introspection is disabled');
  });

  test('introspection works when introspection: true (default)', async () => {
    const { SchemaBuilder } = await import('../schema/schema-builder');
    const builder = new SchemaBuilder();
    builder.addResolver(new SecureResolver());
    const schema = builder.build();
    const handler = new GraphQLHandler(schema, { path: '/graphql' });
    const res = await handler.handle(
      makeRequest('{ __schema { queryType { name } } }')
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.errors).toBeUndefined();
expect(body.data.__schema.queryType.name).toBe('Query');
  });

  test('security.disableIntrospection overrides introspection option', async () => {
    const { SchemaBuilder } = await import('../schema/schema-builder');
    const builder = new SchemaBuilder();
    builder.addResolver(new SecureResolver());
    const schema = builder.build();
    const handler = new GraphQLHandler(schema, {
      path: '/graphql',
      introspection: true,
      security: { disableIntrospection: true },
    });
    const res = await handler.handle(
      makeRequest('{ __type(name: "Query") { name } }')
    );
    expect(res.status).toBe(400);
  });

  test('complexity attack is rejected via HTTP', async () => {
    const { SchemaBuilder } = await import('../schema/schema-builder');
    const builder = new SchemaBuilder();
    builder.addResolver(new SecureResolver());
    const schema = builder.build();
    const handler = new GraphQLHandler(schema, {
      path: '/graphql',
      security: { maxComplexity: 2 },
    });
    const res = await handler.handle(makeRequest('{ hello }'));
    expect(res.status).toBe(200);
  });

  test('non-graphql paths still 404', async () => {
    const handler = makeHandler({ path: '/graphql' });
    const res = await handler.handle(new Request('http://localhost/other', { method: 'POST' }));
    expect(res.status).toBe(404);
  });
});
