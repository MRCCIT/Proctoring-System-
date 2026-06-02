import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'core/index': 'src/core/index.ts',
    'exam-window/index': 'src/exam-window/index.ts',
    'admin-panel/index': 'src/admin-panel/index.ts',
    'lockdown/index': 'src/lockdown/index.ts',
    'media/index': 'src/media/index.ts',
    'ai-client/index': 'src/ai-client/index.ts',
    'events/index': 'src/events/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom', 'next/link'],
  target: 'es2020',
});
