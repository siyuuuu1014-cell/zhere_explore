import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.dirname(fileURLToPath(import.meta.url));

export function loadProjectEnvironment({
  envPath = path.resolve(serverDir, '..', '.env'),
  loadEnvFile = process.loadEnvFile,
} = {}) {
  try {
    loadEnvFile(envPath);
    return { loaded: true, envPath };
  } catch (error) {
    if (error?.code === 'ENOENT') return { loaded: false, envPath };
    throw error;
  }
}

