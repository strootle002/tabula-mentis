export type SaveKind = "map" | "note" | "tagNote";

/** Serializes writes per domain and owns debounce lifecycle outside Zustand. */
export class SaveCoordinator {
  private timers: Partial<Record<SaveKind, ReturnType<typeof setTimeout>>> = {};
  private queues: Record<SaveKind, Promise<void>> = {
    map: Promise.resolve(),
    note: Promise.resolve(),
    tagNote: Promise.resolve(),
  };

  enqueue(kind: SaveKind, operation: () => Promise<void>): Promise<void> {
    const queued = this.queues[kind]
      .catch(() => undefined)
      .then(operation);
    this.queues[kind] = queued;
    return queued;
  }

  schedule(
    kind: SaveKind,
    operation: () => Promise<void>,
    onError: (error: unknown) => void,
    delayMs = 500,
  ): void {
    this.cancel(kind);
    this.timers[kind] = setTimeout(() => {
      delete this.timers[kind];
      void operation().catch(onError);
    }, delayMs);
  }

  cancel(kind: SaveKind): void {
    const timer = this.timers[kind];
    if (timer) clearTimeout(timer);
    delete this.timers[kind];
  }

  /** Wait until in-flight enqueued ops for this kind have finished. */
  async drain(kind: SaveKind): Promise<void> {
    await this.enqueue(kind, async () => {});
  }

  async flush(
    dirty: Partial<Record<SaveKind, boolean>>,
    save: Partial<Record<SaveKind, () => Promise<void>>>,
  ): Promise<void> {
    this.cancel("map");
    this.cancel("note");
    this.cancel("tagNote");
    if (dirty.map && save.map) await save.map();
    if (dirty.note && save.note) await save.note();
    if (dirty.tagNote && save.tagNote) await save.tagNote();
    await Promise.all([
      this.queues.map,
      this.queues.note,
      this.queues.tagNote,
    ]);
  }
}
