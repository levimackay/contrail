// The slice of bun:sqlite that Contrail uses. Bun ships its own types; this keeps the Node build free of them.
declare module 'bun:sqlite' {
  export class Database {
    constructor(path: string, options?: { create?: boolean });
    exec(sql: string): void;
    query(sql: string): {
      run(...params: unknown[]): { changes: number };
      all(...params: unknown[]): unknown[];
      get(...params: unknown[]): unknown;
    };
    close(): void;
  }
}
