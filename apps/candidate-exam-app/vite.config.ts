import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 3300 },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        ankitSdkPlug: path.resolve(__dirname, 'ankit-sdk-plug.html'),
        ankitIncReference: path.resolve(__dirname, 'ankit-inc-reference.html'),
      },
    },
  },
});
