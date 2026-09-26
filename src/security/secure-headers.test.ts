import { describe, test, expect } from 'bun:test';
import 'reflect-metadata';
import { Resolver, Query } from '../decorators/resolver.decorators';
import { GraphQLHandler } from '../module/graphql.module';
import { SchemaBuilder } from '../schema/schema-builder';

@Resolver()
class HeaderResolver {
  @Query(() => String)
  hello(): string {
    return 'hi';
  }
}

function makeRequest(query: string): Request {
  return new Request('http://localhost/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
}

async function makeHandler(opts: any = {}) {
  const builder = new SchemaBuilder();
  builder.addResolver(new HeaderResolver());
  return new GraphQLHandler(builder.build(), { path: '/graphql', ...opts });
}

describe('GraphQLHandler secure headers (default on)', () => {
  test('applies secure headers to success responses', async () => {
    const handler = await makeHandler();
    const res = await handler.handle(makeRequest('{ hello }'));
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
    expect(res.headers.get('X-Powered-By')).toBeNull();
  });

  test('applies secure headers to error responses', async () => {
    const handler = await makeHandler({ introspection: false });
    const res = await handler.handle(makeRequest('{ __schema { queryType { name } } }'));
    expect(res.status).toBe(400);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  test('secureHeaders: false disables them', async () => {
    const handler = await makeHandler({ secureHeaders: false });
    const res = await handler.handle(makeRequest('{ hello }'));
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Content-Type-Options')).toBeNull();
  });
});
