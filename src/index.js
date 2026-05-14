const EVENTS = ['add', 'change', 'unlink'];
const BIN_EXT = new Set(['.png','.jpg','.jpeg','.gif','.webp','.mp4','.mov','.zip','.pdf','.exe','.dll','.so','.woff','.woff2','.ttf','.db','.wasm']);
const FALLBACK_TIMEOUT = 2000;

const normalizePath = (p) => {
  p = p.replace(/\\/g, '/').replace(/\/+/g, '/');
  const parts = [];
  for (const part of p.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (parts.length && parts[parts.length - 1]!== '..') parts.pop();
    } else {
      parts.push(part);
    }
  }
  const isAbs = p.startsWith('/');
  return (isAbs? '/' : '') + parts.join('/');
};

const joinPath = (a, b) => normalizePath(a + '/' + b);

const toAbsolute = (p) => {
  if (p.startsWith('/') || /^[A-Z]:[\\/]/.test(p)) return normalizePath(p);
  const cwd = typeof process!== 'undefined' && process.cwd? process.cwd()
           : typeof Deno!== 'undefined' && Deno.cwd? Deno.cwd()
           : '/';
  return normalizePath(cwd + '/' + p);
};

const isDir = (entry) => {
  if (!entry) return false;
  if (typeof entry.isDirectory === 'function') return entry.isDirectory();
  return!!entry.isDirectory;
};

const isSymlink = (entry, st) => {
  if (entry && typeof entry.isSymbolicLink === 'function') return entry.isSymbolicLink();
  return st? st.isSymbolicLink() : false;
};

const globToRegex = (glob) => {
  let regex = '^';
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*' && glob[i + 2] === '/') {
        regex += '(?:.*/)?';
        i += 3;
      } else {
        regex += '[^/]*';
        i++;
      }
    } else if (c === '?') {
      regex += '[^/]';
      i++;
    } else if (c === '{') {
      const end = glob.indexOf('}', i);
      if (end === -1) {
        regex += '\\{';
        i++;
      } else {
        const alts = glob.slice(i + 1, end).split(',');
        regex += `(?:${alts.join('|')})`;
        i = end + 1;
      }
    } else if ('.+^${}()|[\\]\\\\'.includes(c)) {
      regex += '\\' + c;
      i++;
    } else {
      regex += c;
      i++;
    }
  }
  regex += '$';
  return new RegExp(regex);
};

export class Watcher {
  constructor(paths, opts = {}) {
    this.paths = Array.isArray(paths)? paths : [paths];
    this.ignored = opts.ignored || [];
    this.include = opts.include || [];
    this.exclude = opts.exclude || [];
    this.ignoreInitial =!!opts.ignoreInitial;
    this.recursive = opts.recursive!== false;
    this.delay = opts.delay?? 50;
    this.maxDepth = opts.maxDepth?? Infinity;
    this.ignoreBinary = opts.ignoreBinary?? true;
    this.followSymlinks = opts.followSymlinks?? false;
    this.yieldEvery = opts.yieldEvery?? 500;

    this.usePolling = opts.usePolling?? false;
    this.pollInterval = opts.pollInterval?? 1000;

    this.awaitWrite =!!opts.awaitWriteFinish;
    this.awaitDelay = opts.awaitWriteFinish?.stabilityThreshold?? 500;
    this.awaitPoll = opts.awaitWriteFinish?.pollInterval?? 100;

    this.autoFallback = opts.autoFallback?? true;
    this.fallbackTimeout = opts.fallbackTimeout?? FALLBACK_TIMEOUT;

    this._includeRegex = this.include.map(globToRegex);
    this._excludeRegex = this.exclude.map(globToRegex);
    this._ignoredRegex = this.ignored.map(p => p instanceof RegExp? p : null).filter(Boolean);
    this._ignoredStr = this.ignored.filter(p => typeof p === 'string');

    this._listeners = Object.fromEntries(EVENTS.map(e => [e, new Set()]));
    this._watchers = new Map();
    this._pollTimers = new Map();
    this._snapshots = new Map();
    this._debounce = new Map();
    this._pending = new Map();
    this._polling = new Set();
    this._ready = false;
    this._runtime = this._detectRuntime();
    this._hasFiredEvent = new Set();
    this._fallbackTimers = new Map();
    this._keepAlive = null;

    this._init();
  }

  _detectRuntime() {
    if (typeof Bun!== 'undefined') return 'bun';
    if (typeof Deno!== 'undefined') return 'deno';
    return 'node';
  }

  _matchGlob(path) {
    if (this._includeRegex.length &&!this._includeRegex.some(r => r.test(path))) return false;
    if (this._excludeRegex.some(r => r.test(path))) return false;
    return true;
  }

  _ignore(path, isDir = false) {
    const absPath = toAbsolute(path);
    if (!this._matchGlob(absPath)) return true;
    if (this._ignoredRegex.some(r => r.test(absPath))) return true;
    if (this._ignoredStr.some(p => absPath.includes(p))) return true;
    if (this.ignoreBinary &&!isDir) {
      const idx = absPath.lastIndexOf('.');
      if (idx > 0) {
        const ext = absPath.slice(idx).toLowerCase();
        if (BIN_EXT.has(ext)) return true;
      }
    }
    return false;
  }

  _init() {
    for (const p of this.paths) this._watch(p, 0);
    Promise.resolve().then(() => {
      this._ready = true;
      this.emit('ready');
    });

    if (this._runtime === 'deno' && typeof Deno!== 'undefined') {
      this._keepAlive = new Promise(() => {});
    }
  }

  // FIX: moved _list above _watch so it’s defined before use
  async _list(dir, depth) {
    if (depth > this.maxDepth) return [];
    const files = [];
    try {
      const fs = await import('node:fs');
      const entries = this._runtime === 'deno'
  ? [...Deno.readDirSync(dir)]
        : fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const p = joinPath(dir, e.name);
        const isDirFlag = isDir(e);
        if (this._ignore(p, isDirFlag)) continue;
        if (isDirFlag && this.recursive) {
          const sub = await this._list(p, depth + 1);
          files.push(...sub);
        } else if (!isDirFlag) {
          files.push(toAbsolute(p));
        }
      }
    } catch (err) {
      this.emit('error', err);
    }
    return files;
  }

  async _watch(dir, depth) {
    const absDir = toAbsolute(dir);
    if (depth > this.maxDepth || this._watchers.has(absDir) || this._pollTimers.has(absDir) || this._ignore(absDir, true)) return;

    if (this.usePolling) return this._startPoll(absDir, depth);

    try {
      const fs = await import('node:fs');
      let watcher;

      if (this._runtime === 'bun') {
        watcher = fs.watch(absDir, { recursive: this.recursive }, (e, f) => f && this._handleEvent(absDir, joinPath(absDir, f)));
      } else if (this._runtime === 'deno') {
        const iter = Deno.watchFs(absDir, { recursive: this.recursive });

        (async () => {
          try {
            for await (const ev of iter) {
              for (const p of ev.paths) this._handleEvent(absDir, p);
            }
          } catch (err) {
            if (err.name!== 'BadResource') this.emit('error', err);
          }
        })();

        watcher = {
          close: () => {
            try { iter.return?.(); } catch { /* ignore */ }
          }
        };
      } else {
        watcher = fs.watch(absDir, { persistent: true }, (e, f) => f && this._handleEvent(absDir, joinPath(absDir, f)));
        if (this.recursive && depth < this.maxDepth) {
          for (const e of fs.readdirSync(absDir, { withFileTypes: true })) {
            if (isDir(e)) this._watch(joinPath(absDir, e.name), depth + 1);
          }
        }
      }

      this._watchers.set(absDir, watcher);

      if (this.autoFallback &&!this.usePolling) {
        const timer = setTimeout(() => {
          if (!this._hasFiredEvent.has(absDir)) {
            this.emit('fallback', { dir: absDir, reason: 'no events in 2s' });
            try { watcher.close?.(); } catch { /* ignore */ }
            this._watchers.delete(absDir);
            this._startPoll(absDir, depth);
          }
        }, this.fallbackTimeout);
        this._fallbackTimers.set(absDir, timer);
      }

      if (!this.ignoreInitial) {
        const files = await this._list(absDir, depth);
        files.forEach(f => this._emit('add', f));
      }
    } catch (err) {
      this.emit('error', err);
      this._startPoll(absDir, depth);
    }
  }

  _handleEvent(rootDir, path) {
    if (!this._hasFiredEvent.has(rootDir)) {
      this._hasFiredEvent.add(rootDir);
      const timer = this._fallbackTimers.get(rootDir);
      if (timer) clearTimeout(timer);
    }
    this._handle(path);
  }

  async _startPoll(dir, depth) {
    if (this._pollTimers.has(dir)) return;
    try {
      const snap = await this._snapshot(dir, depth);
      this._snapshots.set(dir, snap);
    } catch (err) {
      this.emit('error', err);
      return;
    }
    const t = setInterval(() => this._poll(dir, depth), this.pollInterval);
    this._pollTimers.set(dir, t);
  }

  async _snapshot(dir, depth) {
    const files = new Map();
    let counter = 0;
    const walk = async (d, dpt) => {
      if (dpt > this.maxDepth) return;
      try {
        const fs = await import('node:fs');
        const entries = this._runtime === 'deno'
     ? [...Deno.readDirSync(d)]
          : fs.readdirSync(d, { withFileTypes: true });

        for (const e of entries) {
          if (++counter % this.yieldEvery === 0) await Promise.resolve();

          const p = joinPath(d, e.name);
          const dir = isDir(e);
          const sym = isSymlink(e);

          if (sym &&!this.followSymlinks) continue;
          if (this._ignore(p, dir)) continue;

          if (dir && this.recursive) {
            await walk(p, dpt + 1);
          } else if (!dir) {
            const st = this._runtime === 'deno'? Deno.statSync(p) : fs.statSync(p);
            files.set(p, { m: st.mtimeMs, s: st.size });
          }
        }
      } catch (err) {
        this.emit('error', err);
      }
    };
    await walk(dir, depth);
    return files;
  }

  async _poll(dir, depth) {
    if (this._polling.has(dir)) return;
    this._polling.add(dir);

    try {
      const old = this._snapshots.get(dir) || new Map();
      const now = await this._snapshot(dir, depth);

      const deleted = new Set(old.keys());

      for (const [p, st] of now) {
        if (!old.has(p)) {
          this._handleFile('add', p);
        } else {
          const oldSt = old.get(p);
          if (oldSt && (oldSt.m!== st.m || oldSt.s!== st.s)) {
            this._handleFile('change', p);
          }
        }
        deleted.delete(p);
      }

      for (const p of deleted) {
        this._handleFile('unlink', p);
      }

      this._snapshots.set(dir, now);
    } catch (err) {
      this.emit('error', err);
    } finally {
      this._polling.delete(dir);
    }
  }

  async _handle(path) {
    const absPath = toAbsolute(path);
    if (this._ignore(absPath)) return;
    try {
      const fs = await import('node:fs');
      const st = this._runtime === 'deno'? Deno.statSync(absPath) : fs.statSync(absPath);
      this._handleFile('change', absPath, st);
    } catch {
      this._handleFile('unlink', absPath);
    }
  }

  _handleFile(event, path, stat) {
    if (!this.awaitWrite) return this._emit(event, path);
    if (event === 'unlink') {
      clearTimeout(this._pending.get(path)?.t);
      this._pending.delete(path);
      return this._emit(event, path);
    }

    clearTimeout(this._pending.get(path)?.t);

    const check = async () => {
      try {
        const fs = await import('node:fs');
        const s = this._runtime === 'deno'? Deno.statSync(path) : fs.statSync(path);
        const p = this._pending.get(path);
        if (p && p.m === s.mtimeMs && p.s === s.size) {
          this._pending.delete(path);
          this._emit(event, path);
        } else {
          this._pending.set(path, { m: s.mtimeMs, s: s.size, t: setTimeout(check, this.awaitPoll) });
        }
      } catch {
        clearTimeout(this._pending.get(path)?.t);
        this._pending.delete(path);
        this._emit('unlink', path);
      }
    };
    this._pending.set(path, { t: setTimeout(check, this.awaitDelay) });
  }

  _emit(event, path) {
    if (!this._ready && event!== 'add') return;
    const absPath = toAbsolute(path);
    const key = event + ':' + absPath;
    clearTimeout(this._debounce.get(key));
    this._debounce.set(key, setTimeout(() => {
      this._debounce.delete(key);
      for (const fn of this._listeners[event]?? []) fn(absPath, event);
      for (const fn of this._listeners['all']?? []) fn(event, absPath);
    }, this.delay));
  }

  emit(event,...args) {
    for (const fn of this._listeners[event] || []) fn(...args);
  }

  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = new Set();
    this._listeners[event].add(fn);
    return this;
  }

  async close() {
    await Promise.allSettled([
 ...Array.from(this._watchers.values()).map(w => {
        try { return w.close?.(); } catch { return Promise.resolve(); }
      }),
 ...Array.from(this._pollTimers.values()).map(t => clearInterval(t)),
 ...Array.from(this._fallbackTimers.values()).map(t => clearTimeout(t))
    ]);
    for (const p of this._pending.values()) clearTimeout(p.t);
    this._watchers.clear();
    this._pollTimers.clear();
    this._debounce.clear();
    this._pending.clear();
    this._snapshots.clear();
    this._fallbackTimers.clear();
    this._hasFiredEvent.clear();
    this._polling.clear();
    this._keepAlive = null;
  }
}

export function watch(paths, opts) {
  return new Watcher(paths, opts);
}