import { AsyncLocalStorage } from 'async_hooks';

const lockContext = new AsyncLocalStorage<boolean>();

class ConfigMutex {
  private queue: Array<() => void> = [];
  private locked = false;

  async acquire(): Promise<() => void> {
    if (!this.locked) {
      this.locked = true;
      return this.createRelease();
    }

    return new Promise<() => void>((resolve) => {
      this.queue.push(() => resolve(this.createRelease()));
    });
  }

  private createRelease(): () => void {
    let released = false;

    return () => {
      if (released) {
        return;
      }

      released = true;
      const next = this.queue.shift();
      if (next) {
        next();
      } else {
        this.locked = false;
      }
    };
  }
}

const configMutex = new ConfigMutex();

export async function withConfigLock<T>(fn: () => Promise<T>): Promise<T> {
  if (lockContext.getStore()) {
    return fn();
  }

  const release = await configMutex.acquire();
  try {
    return await lockContext.run(true, fn);
  } finally {
    release();
  }
}
