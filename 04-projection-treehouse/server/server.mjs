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

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
