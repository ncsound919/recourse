/**
 * Minimal promise-chain mutex.
 *
 * Serializes async critical sections so two concurrent callers cannot both
 * read-modify-write the same durable state (learner ledger, dream state, …).
 * Sections run in arrival order; a rejected section does not poison the chain
 * and does not block later sections.
 */
export class AsyncMutex {
  private tail: Promise<unknown> = Promise.resolve();

  /** Run `fn` after every previously queued section has settled. */
  runExclusive<T>(fn: () => Promise<T> | T): Promise<T> {
    const run = this.tail.then(fn, fn);
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}
