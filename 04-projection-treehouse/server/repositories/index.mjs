import { LocalRepository } from './local-repository.mjs';
import { FeishuRepository } from './feishu-repository.mjs';

export async function createRepository(config) {
  const repository = config.repository === 'feishu'
    ? new FeishuRepository(config.feishu)
    : new LocalRepository(config.dataDir);
  await repository.init();
  return repository;
}
