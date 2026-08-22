import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export function loadApiLocalEnv(metaUrl) {
  const scriptDirectory = path.dirname(fileURLToPath(metaUrl));
  const envPath = path.resolve(scriptDirectory, '../.env');
  try {
    process.loadEnvFile(envPath);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !('code' in error) ||
      error.code !== 'ENOENT'
    ) {
      throw error;
    }
  }
}
