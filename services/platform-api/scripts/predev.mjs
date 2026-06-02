/**
 * Load repo .env and free the API listen port before `npm run dev`.
 * (Default free-port.mjs alone only targeted PORT=3000.)
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { freePort } from './free-port.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(repoRoot, 'services', 'platform-api', '.env') });

const port = process.env.PORT || '3001';
freePort(port);
