import { config, assertProductionConfig } from './config.mjs';
import { createRepository } from './repositories/index.mjs';
import { createApp } from './app.mjs';

assertProductionConfig();
const repository = await createRepository(config);
const server = createApp({ repository, config });

server.listen(config.port, config.host, () => {
  console.log(`Zhere server running at http://${config.host}:${config.port}/04-projection-treehouse/`);
  console.log(`Repository: ${config.repository}`);
});

let shuttingDown = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}; finishing active requests.`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}

process.on('unhandledRejection', (error) => {
  console.error(JSON.stringify({ level: 'error', kind: 'unhandledRejection', error: error?.stack || String(error), at: new Date().toISOString() }));
});
