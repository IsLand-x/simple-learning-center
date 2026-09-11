import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const serverRoot = resolve('server');

function collectModules(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectModules(path);
    return entry.isFile() && entry.name.endsWith('.mjs') ? [path] : [];
  });
}

for (const modulePath of collectModules(serverRoot).sort()) {
  const result = spawnSync(process.execPath, ['--check', modulePath], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
