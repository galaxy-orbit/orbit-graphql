import { describe, test, expect } from 'bun:test';
import { parse, validate, buildSchema } from 'graphql';
import { depthLimit, complexityLimit, aliasLimit, blockIntrospection } from './validation-rules';

const schema = buildSchema(`
  type Post { id: ID! title: String author: Author }
  type Author { id: ID! name: String posts: [Post!]! }
  type Query {
    hello: String
    posts: [Post!]!
    author(id: ID!): Author
  }
`);

function runRules(query: string, rules: any[]) {
  const doc = parse(query);
  return validate(schema, doc, rules);
}

describe('depthLimit', () => {
  test('allows queries within depth limit', () => {
    const errors = runRules(
      '{ posts { title } }',
      [depthLimit(10)]
    );
    expect(errors).toHaveLength(0);
  });

  test('blocks queries exceeding depth limit', () => {
    const errors = runRules(
      '{ posts { author { posts { author { posts { title } } } } } }',
      [depthLimit(3)]
    );
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('maximum depth');
  });

  test('counts fragment spread depth', () => {
    const errors = runRules(
      `query { posts { ...PostFields } }
       fragment PostFields on Post { author { posts { ...PostFields } } }`,
      [depthLimit(2)]
    );
    expect(errors.length).toBe(1);
  });

  test('allows reasonable fragment reuse', () => {
    const errors = runRules(
      `query { posts { ...PostFields } }
       fragment PostFields on Post { title author { name } }`,
      [depthLimit(5)]
    );
    expect(errors).toHaveLength(0);
  });

  test('does not count __typename as a depth level', () => {
    const onlyMeta = runRules('{ __typename }', [depthLimit(1)]);
    expect(onlyMeta).toHaveLength(0);
    const errors = runRules(
      '{ __typename posts { title } }',
      [depthLimit(1)]
    );
    expect(errors.length).toBe(1);
  });
});

describe('complexityLimit', () => {
  test('allows simple queries', () => {
    const errors = runRules('{ hello }', [complexityLimit({ maxComplexity: 100 })]);
    expect(errors).toHaveLength(0);
  });

  test('blocks deep list fan-out', () => {
    const errors = runRules(
      '{ posts { author { posts { title } } } }',
      [complexityLimit({ maxComplexity: 50 })]
    );
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('complexity');
  });

  test('respects custom field costs', () => {
    const errors = runRules(
      '{ posts { title } }',
      [complexityLimit({ maxComplexity: 5, fieldCosts: { posts: 100 } })]
    );
    expect(errors.length).toBe(1);
  });
});

describe('aliasLimit', () => {
  test('allows normal aliasing', () => {
    const errors = runRules(
      '{ a: hello b: hello c: hello }',
      [aliasLimit(10)]
    );
    expect(errors).toHaveLength(0);
  });

  test('blocks alias bombing', () => {
    const errors = runRules(
      '{ ' + Array.from({ length: 50 }, (_, i) => `a${i}: hello`).join(' ') + ' }',
      [aliasLimit(30)]
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('aliases');
  });
});

describe('blockIntrospection', () => {
  test('blocks __schema queries', () => {
    const errors = runRules('{ __schema { queryType { name } } }', [blockIntrospection()]);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('introspection is disabled');
  });

  test('blocks __type queries', () => {
    const errors = runRules('{ __type(name: "Post") { name } }', [blockIntrospection()]);
    expect(errors.length).toBe(1);
  });

  test('allows normal queries', () => {
    const errors = runRules('{ posts { title } }', [blockIntrospection()]);
    expect(errors).toHaveLength(0);
  });
});
