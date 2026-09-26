import { describe, test, expect } from 'bun:test';
import 'reflect-metadata';
import { SchemaBuilder } from './schema-builder';
import { Resolver, Query } from '../decorators';
import { ObjectType, Field } from '../decorators/type.decorators';

@ObjectType()
class Post {
  @Field(() => String)
  title!: string;
}

@Resolver()
class PostResolver {
  @Query(() => [Post], { name: 'posts' })
  posts(): Post[] {
    return [];
  }
}

describe('SchemaBuilder.schemaGraph()', () => {
  test('returns query node + type node + edge for a composed schema', () => {
    const builder = new SchemaBuilder();
    builder.addResolver(new PostResolver());
    builder.build();
    const graph = builder.schemaGraph();

    const names = graph.nodes.map((n) => n.name);
    expect(names).toContain('Query');
    expect(names).toContain('Post');

    const queryNode = graph.nodes.find((n) => n.name === 'Query');
    expect(queryNode?.kind).toBe('query');

    const postEdge = graph.edges.find((e) => e.from === 'Query' && e.to === 'Post');
    expect(postEdge).toBeDefined();
    expect(postEdge?.via).toBe('posts');
  });
});
