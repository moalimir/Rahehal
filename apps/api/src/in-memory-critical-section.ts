export class InMemoryCriticalSection {
  private tail: Promise<void> = Promise.resolve();

  async run<Result>(work: () => Result | Promise<Result>): Promise<Result> {
    let release!: () => void;
    const predecessor = this.tail;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });

    await predecessor;
    try {
      return await work();
    } finally {
      release();
    }
  }
}
