/** Runs async tasks strictly one after another, in call order. */
export class SerialTasks {
  #tail: Promise<void> = Promise.resolve();

  /** Queue a task; it starts after the previous one settles. The
   * returned promise settles with the task's result or error, so a
   * failed task rejects its caller without blocking later tasks. */
  add<T>(task: () => Promise<T>): Promise<T> {
    const started = this.#tail.then(task, task);
    this.#tail = started.then(
      () => {},
      () => {},
    );
    return started;
  }

  /** Resolves when every queued task has settled. */
  drain(): Promise<void> {
    return this.#tail;
  }
}
