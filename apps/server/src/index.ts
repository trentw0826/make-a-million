import { createApp } from './app';
import { DEFAULT_CONFIG } from './config';
import { consoleLogger } from './log';

const app = createApp(DEFAULT_CONFIG, consoleLogger);

app.listen().catch((e) => {
  consoleLogger('error', 'failed to start', { error: String(e) });
  process.exit(1);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    consoleLogger('info', `${signal} received, shutting down`);
    app.close().then(() => process.exit(0));
  });
}
