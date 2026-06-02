import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pythonDir = path.join(__dirname, '..', '..', '..', 'python');

const child = spawn(
  process.platform === 'win32' ? 'python' : 'python3',
  ['-m', 'uvicorn', 'run_ai_server:app', '--host', '127.0.0.1', '--port', process.env.AI_PORT || '5055'],
  {
    cwd: pythonDir,
    stdio: 'inherit',
    env: { ...process.env, PYTHONPATH: pythonDir },
  }
);

child.on('exit', (code) => process.exit(code ?? 0));
