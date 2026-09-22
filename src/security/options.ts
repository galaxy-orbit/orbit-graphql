export interface GraphQLSecurityOptions {
  /** Maximum selection depth allowed. Default: 10 */
  maxDepth?: number;
  /** Maximum cumulative query complexity. Default: 1000 */
  maxComplexity?: number;
  /** Field-specific complexity costs. */
  fieldCosts?: Record<string, number>;
  /** Field-specific list fan-out factors. */
  listFactors?: Record<string, number>;
  /** Maximum number of aliases per query. Default: 30 */
  maxAliases?: number;
  /** Block __schema/__type queries. Defaults to !introspection. */
  disableIntrospection?: boolean;
}

export const DEFAULT_GRAPHQL_SECURITY: Required<
  Omit<GraphQLSecurityOptions, 'fieldCosts' | 'listFactors' | 'disableIntrospection'>
> = {
  maxDepth: 10,
  maxComplexity: 1000,
  maxAliases: 30,
};
