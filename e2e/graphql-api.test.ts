/**
 * LIVE INTEGRATION — GraphQL API over HTTP
 * Wires: orbit-graphql (SchemaBuilder, @Resolver/@Query/@Mutation) + orbit-core
 * Serves GraphQL over the real Orbit HTTP server, runs real queries + mutations.
 */
import { describe, test, expect, afterAll } from 'bun:test';
import 'reflect-metadata';
import { graphql } from 'graphql';
import {
  OrbitFactory, Module, Controller, Post, Injectable,
} from '@galaxy-stack/orbit-core';
import { Body } from '@galaxy-stack/orbit-common';
import {
  Resolver, Query, Mutation, Args,
} from '@galaxy-stack/orbit-graphql';
import { SchemaBuilder } from '@galaxy-stack/orbit-graphql';

interface Book { id: string; title: string; author: string }

@Injectable()
class BooksResolver {
  private books: Book[] = [
    { id: '1', title: 'The Orbit Way', author: 'Hieu' },
    { id: '2', title: 'Bun Deep Dive', author: 'Someone' },
  ];

  @Query(() => [String])
  bookTitles(): string[] {
    return this.books.map((b) => b.title);
  }

  @Query(() => String, { name: 'bookById' })
  findBookById(@Args('id') id: string): string | null {
    return this.books.find((b) => b.id === id)?.title ?? null;
  }

  @Mutation(() => String, { name: 'addBook' })
  addBook(@Args('title') title: string, @Args('author') author: string): string {
    const id = String(this.books.length + 1);
    this.books.push({ id, title, author });
    return id;
  }
}

@Injectable()
class GraphQLGatewayService {
  private schema: any;

  constructor() {
    const builder = new SchemaBuilder();
    builder.addResolver(new BooksResolver());
    this.schema = builder.build();
  }

  async execute(query: string, variables?: Record<string, any>) {
    return graphql({ schema: this.schema, source: query, variableValues: variables });
  }
}

@Controller('/graphql')
class GraphQLController {
  constructor(private readonly gateway: GraphQLGatewayService) {}

  @Post()
  async query(@Body() body: { query: string; variables?: Record<string, any> }) {
    const result = await this.gateway.execute(body.query, body.variables);
    return { data: result.data ?? null, errors: result.errors ?? null };
  }
}

@Module({
  controllers: [GraphQLController],
  providers: [GraphQLGatewayService, BooksResolver],
})
class AppModule {}

describe('LIVE — GraphQL API over HTTP', () => {
  let app: any;
  let base: string;

  afterAll(async () => {
    await app?.close();
  });

  test('boots the HTTP server with the GraphQL gateway', async () => {
    app = await OrbitFactory.create(AppModule as any, { logger: false } as any);
    await app.listen(0);
    base = `http://127.0.0.1:${app.port}/graphql`;
  }, 20000);

  test('query returns book titles through the real HTTP endpoint', async () => {
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '{ bookTitles }' }),
    });
    const body = await res.json();
    expect(body.errors).toBeNull();
    expect(body.data.bookTitles).toEqual(['The Orbit Way', 'Bun Deep Dive']);
  });

  test('mutation adds a book, then the query reflects it', async () => {
    const addRes = await fetch(base, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: 'mutation($t: String!, $a: String!) { addBook(title: $t, author: $a) }',
        variables: { t: 'Federation in Practice', a: 'Orbit Team' },
      }),
    });
    const added = await addRes.json();
    expect(added.errors).toBeNull();
    const newId = added.data.addBook;

    const findRes = await fetch(base, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: `{ bookById(id: "${newId}") }` }),
    });
    const found = await findRes.json();
    expect(found.data.bookById).toBe('Federation in Practice');
  });

  test('invalid query returns structured errors, not a 500', async () => {
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '{ nope }' }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0].message).toContain('Cannot query field');
  });

  test('args with variables resolve per-method', async () => {
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '{ bookById(id: "1") }' }),
    });
    const body = await res.json();
    expect(body.data.bookById).toBe('The Orbit Way');
  });
});
