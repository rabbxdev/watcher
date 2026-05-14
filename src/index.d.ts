export type WatchEvent = 'add' | 'change' | 'unlink' | 'all' | 'ready' | 'error' | 'fallback';

export type PathCallback = (path: string, event?: WatchEvent) => void;
export type AllCallback = (event: WatchEvent, path: string) => void;
export type ErrorCallback = (err: unknown) => void;
export type FallbackCallback = (info: { dir: string; reason: string }) => void;

export interface AwaitWriteFinishOptions {
  /**
   * Amount of time in milliseconds for a file size to remain constant before emitting its event.
   * @default 500
   */
  stabilityThreshold?: number;
  
  /**
   * File size polling interval in milliseconds.
   * @default 100
   */
  pollInterval?: number;
}

export interface WatchOptions {
  /**
   * Paths to ignore. Can be strings, matched with `includes`, or RegExps.
   */
  ignored?: (string | RegExp)[];

  /**
   * Glob patterns to include. Only matching files will be watched.
   * Supports **, *, ?, {a,b}
   * @example ['**/*.ts', 'src/*.{js,json}']
   */
  include?: string[];

  /**
   * Glob patterns to exclude.
   * Supports **, *, ?, {a,b}
   * @example ['**/node_modules/**', '**/*.test.ts']
   */
  exclude?: string[];

  /**
   * If true, don't emit the initial 'add' events for files in watched directories.
   * @default false
   */
  ignoreInitial?: boolean;

  /**
   * If true, watch directories recursively.
   * @default true
   */
  recursive?: boolean;

  /**
   * Debounce delay in ms for emitting events.
   * @default 50
   */
  delay?: number;

  /**
   * Maximum directory depth.
   * @default Infinity
   */
  maxDepth?: number;

  /**
   * Ignore common binary file extensions.
   * @default true
   */
  ignoreBinary?: boolean;

  /**
   * Follow symbolic links.
   * @default false
   */
  followSymlinks?: boolean;

  /**
   * Yield to the event loop every N files during initial scan to avoid blocking.
   * @default 500
   */
  yieldEvery?: number;

  /**
   * Force polling instead of using native fs.watch.
   * @default false
   */
  usePolling?: boolean;

  /**
   * Polling interval in ms when usePolling is true or fallback occurs.
   * @default 1000
   */
  pollInterval?: number;

  /**
   * Wait for files to stop changing before emitting events.
   */
  awaitWriteFinish?: boolean | AwaitWriteFinishOptions;

  /**
   * Automatically fallback to polling if no native events fire within fallbackTimeout.
   * @default true
   */
  autoFallback?: boolean;

  /**
   * Time in ms to wait for native events before falling back to polling.
   * @default 2000
   */
  fallbackTimeout?: number;
}

export declare class Watcher {
  constructor(paths: string | string[], opts?: WatchOptions);

  /**
   * Add a listener for a specific event.
   */
  on(event: 'add' | 'change' | 'unlink', callback: PathCallback): this;
  on(event: 'all', callback: AllCallback): this;
  on(event: 'ready', callback: () => void): this;
  on(event: 'error', callback: ErrorCallback): this;
  on(event: 'fallback', callback: FallbackCallback): this;

  /**
   * Emit an event manually. Used internally.
   */
  emit(event: WatchEvent, ...args: any[]): void;

  /**
   * Close all watchers and timers.
   */
  close(): Promise<void>;
}

/**
 * Create a new file watcher.
 */
export declare function watch(paths: string | string[], opts?: WatchOptions): Watcher;