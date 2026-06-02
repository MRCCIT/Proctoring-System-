import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const appDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(appDir, '.env.local') });
dotenv.config({ path: path.join(appDir, '../../.env') });

const apiBase =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.PUBLIC_API_BASE_URL ||
  `http://localhost:${process.env.PORT || '3001'}`;

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@proctorshield/sdk'],
  env: {
    NEXT_PUBLIC_API_URL: apiBase.replace(/\/$/, ''),
  },
};
export default nextConfig;