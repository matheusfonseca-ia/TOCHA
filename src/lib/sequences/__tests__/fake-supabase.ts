import { randomUUID } from "node:crypto";

/**
 * Fake em memória do client Supabase admin, para testes de integração de
 * `process.ts` e `runtime.ts` sem rede nem banco real.
 *
 * Cobre só a fatia da API do query builder que o código de produção usa:
 * select / eq / neq / in / lt / lte / gt / gte / is / order / limit /
 * maybeSingle / single / insert / upsert / update / delete, incluindo:
 *  - unique violation (código 23505) em `insert` (ex.: sequence_runs
 *    (sequence_id, ig_sender_id), processed_events (mid));
 *  - `upsert` com `onConflict` + `ignoreDuplicates` (rule_triggers,
 *    conversations);
 *  - embed simples de relação (`sequences(*)` a partir de `sequence_runs`),
 *    o suficiente para `select("*, sequences(*)")`.
 *
 * Não tenta ser um Postgres completo: filtros em coluna de relação
 * (`sequences.is_active`) são resolvidos, mas não há JOINs de verdade.
 */

export type Row = Record<string, any>;

export type TableName =
  | "ig_accounts"
  | "rules"
  | "sequences"
  | "sequence_runs"
  | "rule_triggers"
  | "conversations"
  | "interactions"
  | "processed_events"
  | "contacts";

export interface FakeError {
  message: string;
  code?: string;
}

export interface QueryResult<T = Row> {
  data: T[] | null;
  error: FakeError | null;
}

type FilterOp = "eq" | "neq" | "in" | "lt" | "lte" | "gt" | "gte" | "is";

interface Filter {
  column: string;
  op: FilterOp;
  value: any;
}

interface Relation {
  embedKey: string;
  fk: string;
  table: TableName;
  targetCol: string;
}

const RELATIONS: Partial<Record<TableName, Relation[]>> = {
  sequence_runs: [
    { embedKey: "sequences", fk: "sequence_id", table: "sequences", targetCol: "id" },
  ],
};

// Espelha as UNIQUE constraints reais que o código depende para detectar
// corrida/reentrada (ver migrations em supabase/migrations).
const UNIQUE_CONSTRAINTS: Partial<Record<TableName, string[][]>> = {
  processed_events: [["mid"]],
  sequence_runs: [["sequence_id", "ig_sender_id"]],
  rule_triggers: [["rule_id", "ig_sender_id"]],
  contacts: [["account_id", "ig_sender_id"]],
};

const PG_UNIQUE_VIOLATION = "23505";

function defaultsFor(table: TableName): Row {
  const now = new Date().toISOString();
  switch (table) {
    case "sequence_runs":
      return {
        current_node_id: null,
        next_run_at: null,
        steps_executed: 0,
        last_error: null,
        entry_rule_id: null,
        variables: {},
        started_at: now,
        updated_at: now,
      };
    case "rule_triggers":
      return { link_delivered_at: null, follow_gate_sent_at: null, created_at: now };
    case "conversations":
      return { ig_sender_username: null, created_at: now };
    case "contacts":
      return { ig_username: null, fields: {}, tags: [], created_at: now, updated_at: now };
    case "interactions":
    case "processed_events":
      return { created_at: now };
    default:
      return {};
  }
}

function hasUniqueConflict(table: TableName, item: Row, rows: Row[]): boolean {
  const constraints = UNIQUE_CONSTRAINTS[table] ?? [];
  return constraints.some((cols) => rows.some((r) => cols.every((c) => r[c] === item[c])));
}

function resolveValue(row: Row, column: string, table: TableName, db: FakeSupabase): any {
  if (column.includes(".")) {
    const [relKey, field] = column.split(".");
    const relation = (RELATIONS[table] ?? []).find((r) => r.embedKey === relKey);
    if (!relation) return undefined;
    const related = db.tables[relation.table].find(
      (r) => r[relation.targetCol] === row[relation.fk]
    );
    return related ? related[field] : undefined;
  }
  return row[column];
}

function matchesFilters(row: Row, filters: Filter[], table: TableName, db: FakeSupabase): boolean {
  return filters.every((f) => {
    const val = resolveValue(row, f.column, table, db);
    switch (f.op) {
      case "eq":
        return val === f.value;
      case "neq":
        return val !== f.value;
      case "in":
        return Array.isArray(f.value) && f.value.includes(val);
      case "lt":
        return val != null && val < f.value;
      case "lte":
        return val != null && val <= f.value;
      case "gt":
        return val != null && val > f.value;
      case "gte":
        return val != null && val >= f.value;
      case "is":
        return (val ?? null) === f.value;
      default:
        return true;
    }
  });
}

function applyOrder(rows: Row[], orderBy: { column: string; ascending: boolean }): Row[] {
  const sorted = [...rows].sort((a, b) => {
    const av = a[orderBy.column];
    const bv = b[orderBy.column];
    if (av === bv) return 0;
    return av < bv ? -1 : 1;
  });
  return orderBy.ascending ? sorted : sorted.reverse();
}

function project(row: Row, table: TableName, columns: string, db: FakeSupabase): Row {
  const copy: Row = { ...row };
  for (const rel of RELATIONS[table] ?? []) {
    if (columns.includes(rel.embedKey)) {
      const related = db.tables[rel.table].find((r) => r[rel.targetCol] === row[rel.fk]);
      copy[rel.embedKey] = related ? { ...related } : null;
    }
  }
  return copy;
}

class FakeQueryBuilder implements PromiseLike<QueryResult> {
  private op: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  private payload: Row | Row[] | null = null;
  private upsertOptions: { onConflict?: string; ignoreDuplicates?: boolean } = {};
  private filters: Filter[] = [];
  private orderBy: { column: string; ascending: boolean } | null = null;
  private limitN: number | null = null;
  private columns = "*";

  constructor(
    private readonly db: FakeSupabase,
    private readonly table: TableName
  ) {}

  select(columns = "*"): this {
    this.columns = columns;
    return this;
  }
  eq(column: string, value: any): this {
    this.filters.push({ column, op: "eq", value });
    return this;
  }
  neq(column: string, value: any): this {
    this.filters.push({ column, op: "neq", value });
    return this;
  }
  in(column: string, values: any[]): this {
    this.filters.push({ column, op: "in", value: values });
    return this;
  }
  lt(column: string, value: any): this {
    this.filters.push({ column, op: "lt", value });
    return this;
  }
  lte(column: string, value: any): this {
    this.filters.push({ column, op: "lte", value });
    return this;
  }
  gt(column: string, value: any): this {
    this.filters.push({ column, op: "gt", value });
    return this;
  }
  gte(column: string, value: any): this {
    this.filters.push({ column, op: "gte", value });
    return this;
  }
  is(column: string, value: any): this {
    this.filters.push({ column, op: "is", value });
    return this;
  }
  order(column: string, opts: { ascending?: boolean } = {}): this {
    this.orderBy = { column, ascending: opts.ascending ?? true };
    return this;
  }
  limit(n: number): this {
    this.limitN = n;
    return this;
  }

  insert(payload: Row | Row[]): this {
    this.op = "insert";
    this.payload = payload;
    return this;
  }
  upsert(
    payload: Row | Row[],
    options: { onConflict?: string; ignoreDuplicates?: boolean } = {}
  ): this {
    this.op = "upsert";
    this.payload = payload;
    this.upsertOptions = options;
    return this;
  }
  update(payload: Row): this {
    this.op = "update";
    this.payload = payload;
    return this;
  }
  delete(): this {
    this.op = "delete";
    return this;
  }

  /** Torna o builder "awaitable" — `await admin.from(t).insert(x)` funciona sem `.select()`. */
  then<TResult1 = QueryResult, TResult2 = never>(
    onFulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve()
      .then(() => this.exec())
      .then(onFulfilled ?? undefined, onRejected ?? undefined);
  }

  async maybeSingle<T = Row>(): Promise<{ data: T | null; error: FakeError | null }> {
    const res = this.exec();
    if (res.error) return { data: null, error: res.error };
    const rows = res.data ?? [];
    return { data: (rows[0] as T) ?? null, error: null };
  }

  async single<T = Row>(): Promise<{ data: T | null; error: FakeError | null }> {
    const res = await this.maybeSingle<T>();
    if (!res.data && !res.error) {
      return { data: null, error: { message: "Nenhuma linha encontrada", code: "PGRST116" } };
    }
    return res;
  }

  private exec(): QueryResult {
    const table = this.db.tables[this.table];

    switch (this.op) {
      case "select": {
        let rows = table.filter((r) => matchesFilters(r, this.filters, this.table, this.db));
        if (this.orderBy) rows = applyOrder(rows, this.orderBy);
        if (this.limitN != null) rows = rows.slice(0, this.limitN);
        return {
          data: rows.map((r) => project(r, this.table, this.columns, this.db)),
          error: null,
        };
      }

      case "insert": {
        const items = Array.isArray(this.payload) ? this.payload : this.payload ? [this.payload] : [];
        const inserted: Row[] = [];
        for (const item of items) {
          if (hasUniqueConflict(this.table, item, table)) {
            return {
              data: null,
              error: {
                message: `duplicate key value violates unique constraint (${this.table})`,
                code: PG_UNIQUE_VIOLATION,
              },
            };
          }
          const row: Row = { id: item.id ?? randomUUID(), ...defaultsFor(this.table), ...item };
          table.push(row);
          inserted.push(row);
        }
        return {
          data: inserted.map((r) => project(r, this.table, this.columns, this.db)),
          error: null,
        };
      }

      case "upsert": {
        const items = Array.isArray(this.payload) ? this.payload : this.payload ? [this.payload] : [];
        const conflictCols = (this.upsertOptions.onConflict ?? "")
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean);
        const results: Row[] = [];
        for (const item of items) {
          const existing = conflictCols.length
            ? table.find((r) => conflictCols.every((c) => r[c] === item[c]))
            : undefined;
          if (existing) {
            if (!this.upsertOptions.ignoreDuplicates) Object.assign(existing, item);
            results.push(existing);
          } else {
            const row: Row = { id: item.id ?? randomUUID(), ...defaultsFor(this.table), ...item };
            table.push(row);
            results.push(row);
          }
        }
        return {
          data: results.map((r) => project(r, this.table, this.columns, this.db)),
          error: null,
        };
      }

      case "update": {
        const matched = table.filter((r) => matchesFilters(r, this.filters, this.table, this.db));
        for (const row of matched) Object.assign(row, this.payload);
        return {
          data: matched.map((r) => project(r, this.table, this.columns, this.db)),
          error: null,
        };
      }

      case "delete": {
        const matched = table.filter((r) => matchesFilters(r, this.filters, this.table, this.db));
        for (const row of matched) {
          const idx = table.indexOf(row);
          if (idx >= 0) table.splice(idx, 1);
        }
        return { data: matched, error: null };
      }
    }
  }
}

export class FakeSupabase {
  readonly tables: Record<TableName, Row[]> = {
    ig_accounts: [],
    rules: [],
    sequences: [],
    sequence_runs: [],
    rule_triggers: [],
    conversations: [],
    interactions: [],
    processed_events: [],
    contacts: [],
  };

  from(table: TableName): FakeQueryBuilder {
    return new FakeQueryBuilder(this, table);
  }

  /** Passa a valer como `ReturnType<typeof createAdminClient>` nos testes (cast no chamador). */
  get client(): { from: (table: TableName) => FakeQueryBuilder } {
    return { from: (table: TableName) => this.from(table) };
  }
}

export function createFakeAdmin(): FakeSupabase {
  return new FakeSupabase();
}
