import {
  type ValidationContext,
  type ASTVisitor,
  type FieldNode,
  type FragmentDefinitionNode,
  type OperationDefinitionNode,
  type SelectionNode,
  GraphQLError,
  Kind,
} from 'graphql';

/**
 * Rejects queries that nest selections deeper than maxDepth.
 * Protects against deeply-nested query attacks that exhaust the resolver stack.
 */
export function depthLimit(maxDepth: number) {
  return (context: ValidationContext): ASTVisitor => {
    const definedFragments = new Map<string, FragmentDefinitionNode>();
    for (const def of context.getDocument().definitions) {
      if (def.kind === Kind.FRAGMENT_DEFINITION) {
        definedFragments.set(def.name.value, def);
      }
    }

    const fragmentDepths = new Map<string, number>();
    const visiting = new Set<string>();

    const measureSelections = (
      selections: readonly SelectionNode[],
      depth: number
    ): number => {
      let deepest = depth;
      for (const node of selections) {
        if (node.kind === Kind.FIELD) {
          const field = node as FieldNode;
          if (field.name.value === '__typename') continue;
          deepest = Math.max(deepest, measureSelections(field.selectionSet?.selections ?? [], depth + 1));
        } else if (node.kind === Kind.INLINE_FRAGMENT) {
          deepest = Math.max(deepest, measureSelections(node.selectionSet.selections, depth));
        } else if (node.kind === Kind.FRAGMENT_SPREAD) {
          const name = node.name.value;
          if (visiting.has(name)) continue;
          const frag = definedFragments.get(name);
          if (!frag) continue;
          const cached = fragmentDepths.get(name);
          const fragDepth = cached !== undefined
            ? cached
            : (() => {
                visiting.add(name);
                const d = measureSelections(frag.selectionSet.selections, depth);
                visiting.delete(name);
                fragmentDepths.set(name, d);
                return d;
              })();
          deepest = Math.max(deepest, fragDepth);
        }
      }
      return deepest;
    };

    return {
      OperationDefinition(node: OperationDefinitionNode) {
        const depth = measureSelections(node.selectionSet.selections, 0);
        if (depth > maxDepth) {
          context.reportError(
            new GraphQLError(
              `Query exceeds maximum depth of ${maxDepth} (got ${depth}).`,
              { nodes: node }
            )
          );
        }
      },
    };
  };
}

/**
 * Rejects queries whose cumulative complexity exceeds maxComplexity.
 * Complexity = sum of field costs across the query. List fields multiply
 * the cost of their child selections by their factor (default 10) to model
 * N+1 fan-out.
 */
export interface ComplexityOptions {
  maxComplexity: number;
  defaultFieldCost?: number;
  defaultListFactor?: number;
  fieldCosts?: Record<string, number>;
  listFactors?: Record<string, number>;
}

export function complexityLimit(options: ComplexityOptions) {
  const {
    maxComplexity,
    defaultFieldCost = 1,
    defaultListFactor = 10,
    fieldCosts = {},
    listFactors = {},
  } = options;

  return (context: ValidationContext): ASTVisitor => {
    const definedFragments = new Map<string, FragmentDefinitionNode>();
    for (const def of context.getDocument().definitions) {
      if (def.kind === Kind.FRAGMENT_DEFINITION) {
        definedFragments.set(def.name.value, def);
      }
    }

    const fragmentCosts = new Map<string, number>();
    const visiting = new Set<string>();

    const measureSelections = (
      selections: readonly SelectionNode[],
      multiplier: number
    ): number => {
      let total = 0;
      for (const node of selections) {
        if (node.kind === Kind.FIELD) {
          const field = node as FieldNode;
          if (field.name.value === '__typename') continue;
          const cost = fieldCosts[field.name.value] ?? defaultFieldCost;
          const isList = Boolean(field.selectionSet) &&
            (listFactors[field.name.value] ?? defaultListFactor);
          const factor = field.selectionSet
            ? (listFactors[field.name.value] ?? defaultListFactor)
            : 1;
          void isList;
          const childCost = field.selectionSet
            ? measureSelections(field.selectionSet.selections, multiplier * factor)
            : 0;
          total += cost * multiplier + childCost;
        } else if (node.kind === Kind.INLINE_FRAGMENT) {
          total += measureSelections(node.selectionSet.selections, multiplier);
        } else if (node.kind === Kind.FRAGMENT_SPREAD) {
          const name = node.name.value;
          if (visiting.has(name)) continue;
          const frag = definedFragments.get(name);
          if (!frag) continue;
          const cached = fragmentCosts.get(name);
          const fragCost = cached !== undefined
            ? cached
            : (() => {
                visiting.add(name);
                const c = measureSelections(frag.selectionSet.selections, multiplier);
                visiting.delete(name);
                fragmentCosts.set(name, c);
                return c;
              })();
          total += fragCost;
        }
      }
      return total;
    };

    return {
      OperationDefinition(node: OperationDefinitionNode) {
        const complexity = measureSelections(node.selectionSet.selections, 1);
        if (complexity > maxComplexity) {
          context.reportError(
            new GraphQLError(
              `Query complexity ${complexity} exceeds maximum of ${maxComplexity}.`,
              { nodes: node }
            )
          );
        }
      },
    };
  };
}

/**
 * Rejects queries using more than maxAliases aliases on the same root field,
 * mitigating alias-based resource exhaustion.
 */
export function aliasLimit(maxAliases: number) {
  return (context: ValidationContext): ASTVisitor => {
    let aliasCount = 0;
    return {
      Field(node: FieldNode) {
        if (node.alias) {
          aliasCount++;
          if (aliasCount > maxAliases) {
            context.reportError(
              new GraphQLError(
                `Query exceeds maximum of ${maxAliases} aliases.`,
                { nodes: node }
              )
            );
          }
        }
      },
    };
  };
}

/**
 * Rejects any query referencing __schema or __type meta-fields.
 * Enable when introspection is disabled in production.
 */
export function blockIntrospection() {
  return (context: ValidationContext): ASTVisitor => {
    return {
      Field(node: FieldNode) {
        if (node.name.value === '__schema' || node.name.value === '__type') {
          context.reportError(
            new GraphQLError('GraphQL introspection is disabled.', { nodes: node })
          );
        }
      },
    };
  };
}
