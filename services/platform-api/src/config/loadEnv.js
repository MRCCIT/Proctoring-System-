import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Loads .env from the nearest ancestor directory that contains one, so the
 * monorepo root .env works regardless of which workspace runs the script.
 * Honors DOTENV_PATH if explicitly set.
 */
export function loadEnv() {
  if (process.env.DOTENV_PATH) {
    dotenv.config({ path: process.env.DOTENV_PATH });
    return process.env.DOTENV_PATH;
  }
  const candidates = [
    process.cwd(),
    path.resolve(here, '..', '..'),
    path.resolve(here, '..', '..', '..'),
    path.resolve(here, '..', '..', '..', '..'),
  ];
  for (const dir of candidates) {
    const p = path.join(dir, '.env');
    if (fs.existsSync(p)) {
      dotenv.config({ path: p });
      return p;
    }
  }
  dotenv.config();
  return null;
}

loadEnv();
