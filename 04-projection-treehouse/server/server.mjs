import { loadProjectEnvironment } from './environment.mjs';

// Keep every supported launch path consistent. Node does not read .env by
// default, so load it before importing config.mjs, whose values are evaluated
// at module initialization time.
const environment = loadProjectEnvironment();
const [
  { config, assertProductionConfig },
  { createRepository },
  { createApp },
  { createRecommendationSyncScheduler },
] = await Promise.all([
  import('./config.mjs'),
  import('./repositories/index.mjs'),
  import('./app.mjs'),
  import('./recommendation-sync-scheduler.mjs'),
]);

assertProductionConfig();
const repository = await createRepository(config);
const server = createApp({ repository, config });
const recommendationSync = createRecommendationSyncScheduler({ config });

server.listen(config.port, config.host, () => {
  console.log(`Zhere server running at http://${config.host}:${config.port}/04-projection-treehouse/`);
  console.log(`Repository: ${config.repository}`);
  console.log(`Environment: ${environment.loaded ? '.env loaded' : '.env not found; using process environment and defaults'}`);
  recommendationSync.start();
});

let shuttingDown = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}; finishing active requests.`);
    recommendationSync.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}

process.on('unhandledRejection', (error) => {
  console.error(JSON.stringify({ level: 'error', kind: 'unhandledRejection', error: error?.stack || String(error), at: new Date().toISOString() }));
});
