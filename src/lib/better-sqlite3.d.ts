/**
 * Ambient type declarations for the `better-sqlite3` native module.
 *
 * `better-sqlite3` ships no bundled typings and `@types/better-sqlite3` is
 * intentionally NOT installed in this repo, so we declare just the subset of
 * the API used by `src/lib/stateStore.ts` (and its tests). This keeps `tsc
 * --noEmit` green without pulling in the full DefinitelyTyped surface.
 */
declare module "better-sqlite3" {
  export interface Statement {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  }

  export interface Database {
    pragma(source: string, options?: { simple?: boolean }): unknown;
    prepare(source: string): Statement;
    exec(source: string): void;
    close(): void;
    transaction<F extends (...args: never[]) => unknown>(fn: F): F;
  }

  interface DatabaseConstructor {
    (filename: string | Buffer, options?: Record<string, unknown>): Database;
    new (filename: string | Buffer, options?: Record<string, unknown>): Database;
  }

  const Database: DatabaseConstructor;
  export default Database;
}
