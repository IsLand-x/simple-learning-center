import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';

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
child.on('exit', async (code) => {
  process.exitCode = code ?? 1;
  if (code === 0) {
    try {
      await bundle({
        entryPoint: fileURLToPath(
          new URL('../server-dist/modules/ai/chapterVideos/composition/index.js', import.meta.url),
        ),
        outDir: fileURLToPath(new URL('../server-dist/video', import.meta.url)),
        onProgress: () => undefined,
      });
    } catch (error) {
      console.error(error);
      process.exitCode = 1;
    }
  }
});
