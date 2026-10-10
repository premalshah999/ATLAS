/** Single-consumer async queue used to expose runtime events as an AsyncIterable. */
export class EventQueue<T> implements AsyncIterable<T> {
  private items: T[] = [];
  private waiting: ((r: IteratorResult<T>) => void) | null = null;
  private closed = false;

  push(item: T) {
    if (this.closed) return;
    if (this.waiting) { const w = this.waiting; this.waiting = null; w({ value: item, done: false }); } else this.items.push(item);
  }
  close() {
    this.closed = true;
    if (this.waiting) { const w = this.waiting; this.waiting = null; w({ value: undefined as never, done: true }); }
  }
  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this.items.length) return Promise.resolve({ value: this.items.shift()!, done: false });
        if (this.closed) return Promise.resolve({ value: undefined as never, done: true });
        return new Promise((r) => { this.waiting = r; });
      },
    };
  }
}
