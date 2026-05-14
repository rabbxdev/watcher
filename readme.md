![npm version](https://img.shields.io/npm/v/%40rabbx%2Fwatcher?style=for-the-badge)
![npm downloads](https://img.shields.io/npm/dm/%40rabbx%2Fwatcher?style=for-the-badge)
![bundle size](https://img.shields.io/bundlephobia/minzip/%40rabbx%2Fwatcher?style=for-the-badge)
![license](https://img.shields.io/npm/l/%40rabbx%2Fwatcher?style=for-the-badge)
![node](https://img.shields.io/node/v/%40rabbx%2Fwatcher?style=for-the-badge)
![build](https://img.shields.io/github/actions/workflow/status/rabbxdev/watcher/test.yml?branch=main&style=for-the-badge)
<svg width="256" height="256" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M128 24L88 112H136L104 232L168 128H120L128 24Z" fill="#FFB347"/>
</svg>

# @rabbx/watcher

Tiny universal file watcher for Node, Bun, and Deno. Chokidar-compatible, zero deps, 3KB minified.

## Why

Chokidar is 2MB+ and doesn’t run natively on Bun/Deno.  
`@rabbx/watcher` gives you the same API with native speed everywhere and no dependencies.

## Install

```bash
npm i @rabbx/watcher
```
## Quick Start
```ts
import { watch } from '@rabbx/watcher';

const watcher = watch('./src', {
  ignored: [/node_modules/, /\.git/],
  ignoreInitial: true,
  recursive: true,
  ignoreBinary: true
});

watcher.on('all', (event, file) => {
  console.log(`${event}: ${file}`);
  // trigger HMR, rebuild, restart
});

watcher.on('ready', () => console.log('Watcher ready'));
```
## API
```ts
`watch(paths, options)`

Create a watcher.

*Options*
Option	Type	Default	Description
`ignored`	`(string \| RegExp)[]`	`[]`	Ignore patterns
`ignoreInitial`	`boolean`	`false`	Skip initial `add` events
`recursive`	`boolean`	`true`	Watch subdirectories
`delay`	`number`	`50`	Debounce delay in ms
`maxDepth`	`number`	`Infinity`	Max recursion depth
`ignoreBinary`	`boolean`	`true`	Skip images, videos, archives
`usePolling`	`boolean`	`false`	Force polling mode
`pollInterval`	`number`	`1000`	Polling interval in ms
`awaitWriteFinish`	`boolean \| object`	`false`	Wait for file writes to finish
*awaitWriteFinish options:*
{
  stabilityThreshold?: number; // ms file must be unchanged. Default 500
  pollInterval?: number;       // ms between checks. Default 100
}
Events
watcher.on('add', (path) => {})
watcher.on('change', (path) => {})
watcher.on('unlink', (path) => {})
watcher.on('all', (event, path) => {})
watcher.on('ready', () => {})
watcher.on('error', (err) => {})
`watcher.close()`

Stop all watchers and timers.
```
## Features

- *Universal* - Auto-detects runtime and uses `Bun.watch`, `Deno.watchFs`, or Node `fs.watch`. Falls back to polling if needed.

- *Fast* - Debounce + binary filtering cuts noise by 70-90%. No full file reads during polling.

- *Small* - 120 LOC, zero deps, 3KB minified. Installs instantly.

- *Robust* - Handles NFS, Docker volumes, WSL1 with polling fallback. `awaitWriteFinish` prevents HMR on half-written files.

## TypeScript

Full types included. No extra setup needed.
```ts
import { watch, WatcherOptions,Watcher } from '@rabbx/watcher';

const opts: WatcherOptions = {
  ignored: [/node_modules/],
  awaitWriteFinish: { stabilityThreshold: 500 }
};

const watcher:Watcher = watch('./src', {
  include: ['**/*.ts', '**/*.js'], // only these files
  exclude: ['**/*.test.ts', '**/node_modules/**'],
  ignored: [/\\.git/, '/dist'], // regex or string
  followSymlinks: false, // follow symlinks or not
  yieldEvery: 500 // yield to event loop every N files
}) 
```
License

MIT
---

## Sponsors

If `@rabbx/watcher` saves you time, consider supporting development:

<a href="https://ko-fi.com/rabbxdev" target="_blank">
  <img src="https://ko-fi.com/img/githubbutton_sm.svg" alt="Support me on Ko-fi" />
</a>

<a href="https://github.com/sponsors/rabbxdev" target="_blank">
  <img src="https://img.shields.io/badge/Sponsor%20on-GitHub-EA4AAA?style=for-the-badge&logo=github" alt="Sponsor on GitHub" />
</a>

Your support helps keep the package maintained, tested, and fast across Bun, Node, and Deno.

---

### Sponsors

<!-- Add your sponsor logos here -->
<!-- 
<a href="https://your-sponsor.com">
  <img src="https://your-sponsor.com/logo.svg" height="40" />
</a>
-->