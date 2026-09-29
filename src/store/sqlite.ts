import { ContrailError } from '../errors.ts';

export type SqlValue = string | number | bigint | null;

/** One small interface over node:sqlite and bun:sqlite, so the CLI runs under either runtime. */
export interface Db {
  exec(sql: string): void;
  /** Runs a statement and returns the number of rows it changed. */
  run(sql: string, ...params: SqlValue[]): number;
  all<T>(sql: string, ...params: SqlValue[]): T[];
  get<T>(sql: string, ...params: SqlValue[]): T | undefined;
  close(): void;
}

export async function openDb(path: string): Promise<Db> {
  if ((process.versions as Record<string, string | undefined>).bun) return openBun(path);

  let sqlite: typeof import('node:sqlite');
  try {
    sqlite = await import('node:sqlite');
  } catch {
    throw new ContrailError('Contrail needs Node 22.13+ or Bun to answer queries. Recording still works.');
  }
  const db = new sqlite.DatabaseSync(path);
  return {
    exec: sql => db.exec(sql),
    run: (sql, ...params) => Number(db.prepare(sql).run(...params).changes),
    all: <T,>(sql: string, ...params: SqlValue[]) => db.prepare(sql).all(...params) as T[],
    get: <T,>(sql: string, ...params: SqlValue[]) => db.prepare(sql).get(...params) as T | undefined,
    close: () => db.close(),
  };
}

async function openBun(path: string): Promise<Db> {
  const { Database } = await import('bun:sqlite');
  const db = new Database(path, { create: true });
  return {
    exec: sql => db.exec(sql),
    run: (sql, ...params) => db.query(sql).run(...params).changes,
    all: <T,>(sql: string, ...params: SqlValue[]) => db.query(sql).all(...params) as T[],
    get: <T,>(sql: string, ...params: SqlValue[]) => (db.query(sql).get(...params) ?? undefined) as T | undefined,
    close: () => db.close(),
  };
}
