import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Only remove this repository's generated output; never a runtime data directory.
await rm(new URL('../server-dist/', import.meta.url), { recursive: true, force: true });
const compiler = new URL('../node_modules/typescript/bin/tsc', import.meta.url);
const child = spawn(process.execPath, [fileURLToPath(compiler), '-p', 'tsconfig.server.json'], {
  cwd: new URL('..', import.meta.url),
  stdio: 'inherit',
});
child.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
