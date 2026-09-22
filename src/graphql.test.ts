import { describe, test, expect } from 'bun:test';
import 'reflect-metadata';
import { graphql } from 'graphql';
import { Resolver, Query, Mutation } from './decorators/resolver.decorators';
import { Args, Context } from './decorators/param.decorators';
import { SchemaBuilder } from './schema/schema-builder';

@Resolver()
class HelloResolver {
  @Query(() => String)
  hello(): string {
    return 'Hello Orbit!';
  }

  @Query(() => String, { name: 'greet' })
  greet(@Args('name') name: string, @Context() ctx: any): string {
    return `Hello, ${name}! (from ${ctx.user})`;
  }
}

@Resolver()
class MutationResolver {
  @Mutation(() => Boolean)
  ping(): boolean {
    return true;
  }

  @Mutation(() => String)
  createItem(@Args('title') title: string): string {
    return `created:${title}`;
  }
}

function makeSchema() {
  const builder = new SchemaBuilder();
  builder.addResolver(new HelloResolver());
  builder.addResolver(new MutationResolver());
  return builder.build();
}

describe('GraphQL SchemaBuilder', () => {
  test('builds a schema with Query and Mutation root types', () => {
    const schema = makeSchema();
    expect(schema.getQueryType()?.name).toBe('Query');
    expect(schema.getMutationType()?.name).toBe('Mutation');
  });

  test('executes a simple query against a resolver', async () => {
    const schema = makeSchema();
    const result = await graphql({ schema, source: '{ hello }', contextValue: {} });
    expect(result.errors).toBeUndefined();
    expect(result.data?.hello).toBe('Hello Orbit!');
  });

  test('passes @Args values to the resolver method', async () => {
    const schema = makeSchema();
    const result = await graphql({
      schema,
      source: '{ greet(name: "orbit") }',
      contextValue: { requestId: 1 },
    });
    expect(result.errors).toBeUndefined();
    expect(result.data?.greet).toBe('Hello, orbit! (from undefined)');
  });

  test('executes mutations', async () => {
    const schema = makeSchema();
    const result = await graphql({
      schema,
      source: 'mutation { createItem(title: "abc") }',
      contextValue: {},
    });
    expect(result.data?.createItem).toBe('created:abc');
  });

  test('@Context injects execution context', async () => {
    const schema = makeSchema();
    const result = await graphql({
      schema,
      source: '{ greet(name: "x") }',
      contextValue: { user: 'kevin' },
    });
    expect(result.data?.greet).toContain('from kevin');
  });
});
