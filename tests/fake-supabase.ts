/**
 * Minimal chainable fake of the Supabase admin client for unit tests.
 *
 * Every query built with from()/select()/insert()/update()/eq()/... resolves
 * through the test-provided `resolve` function, which receives a plain
 * description of the chain and returns { data, error }. Builders are also
 * thenable, so `await admin.from("t").insert(rows)` works exactly like the
 * real supabase-js PostgrestQueryBuilder.
 */

export interface FakeChain {
  table: string;
  kind: "select" | "insert" | "update" | "delete" | "upsert";
  columns?: string;
  filters: Record<string, unknown>;
  inFilters: Record<string, unknown[]>;
  isFilters: Record<string, boolean>;
  payload?: unknown;
}

export type FakeResult = { data?: unknown; error?: { code?: string; message?: string } | null };

export type FakeResolver = (chain: FakeChain) => FakeResult | Promise<FakeResult>;

export function createFakeSupabaseAdmin(
  resolve: FakeResolver,
  options?: { authUser?: { id: string; email?: string } | null }
) {
  const resolveAsync: (chain: FakeChain) => Promise<FakeResult> = async (chain) => resolve(chain);

  const builder = (chain: FakeChain): unknown => ({
    select(columns: string) {
      return builder({ ...chain, kind: chain.kind === "insert" || chain.kind === "update" ? chain.kind : "select", columns });
    },
    insert(payload: unknown) {
      return builder({ ...chain, kind: "insert", payload });
    },
    update(payload: unknown) {
      return builder({ ...chain, kind: "update", payload });
    },
    eq(column: string, value: unknown) {
      return builder({ ...chain, filters: { ...chain.filters, [column]: value } });
    },
    is(column: string, value: unknown) {
      // PostgREST `.is(col, null)` — recorded as a boolean so tests can branch.
      return builder({ ...chain, isFilters: { ...chain.isFilters, [column]: value === null } });
    },
    not(column: string, _operator?: string, _value?: unknown) {
      return builder({ ...chain, filters: { ...chain.filters, [`__not_${column}`]: true } });
    },
    in(column: string, values: unknown[]) {
      return builder({ ...chain, inFilters: { ...chain.inFilters, [column]: values } });
    },
    order() {
      return builder(chain);
    },
    limit() {
      return builder(chain);
    },
    maybeSingle() {
      return resolveAsync(chain);
    },
    single() {
      return resolveAsync(chain);
    },
    then(onFulfilled?: (value: FakeResult) => unknown, onRejected?: (reason: unknown) => unknown) {
      return resolveAsync(chain).then(onFulfilled, onRejected);
    },
  });

  return {
    from(table: string) {
      return builder({ table, kind: "select", filters: {}, inFilters: {}, isFilters: {} });
    },
    auth: {
      admin: {
        /** Minimal stub of supabase-js admin auth — enough for getUserById lookups. */
        async getUserById(id: string) {
          if (options?.authUser && options.authUser.id === id) {
            return { data: { user: options.authUser }, error: null };
          }
          return { data: { user: null }, error: { message: "user not found" } };
        },
      },
    },
  };
}
