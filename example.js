import { watch } from './src/index.js';

const watcher = watch(['./routes'], {
  ignoreInitial: true,
  autoFallback: true, // default: true
  fallbackTimeout: 2000, // wait 2s for native events before switching
  pollInterval: 500 // polling interval after fallback
});

watcher.on('ready', () => {
  console.log('Watcher ready');
});

watcher.on('fallback', ({ dir, reason }) => {
  console.log(`[fallback] ${reason} for ${dir}. Switched to polling.`);
});

watcher.on('add', (path) => {
  console.log('[add]', path);
});

watcher.on('change', (path) => {
  console.log('[change]', path);
});

watcher.on('unlink', (path) => {
  console.log('[unlink]', path);
});

watcher.on('error', (err) => {
  console.error('[error]', err);
});

// Optional: close after 30s
setTimeout(() => {
  watcher.close();
  console.log('Watcher closed');
}, 30000);