import { serve } from '@hono/node-server';
import { createApp } from './app.mjs';
import {
  DATA_DIRECTORY,
  HOST,
  MODE,
  PORT,
  validateServerConfig,
} from './config.mjs';
import { initializeDataDirectories } from './storage.mjs';

validateServerConfig();
await initializeDataDirectories();

const server = serve({
  fetch: createApp().fetch,
  hostname: HOST,
  port: PORT,
}, () => {
  const address = HOST === '0.0.0.0' ? '服务器地址' : `http://${HOST}:${PORT}`;
  console.log(`学习中心已启动：${address}`);
  console.log(`运行模式：${MODE === 'remote' ? '远程访问（需要认证）' : '仅本机访问'}`);
  console.log(`数据目录：${DATA_DIRECTORY}`);
});

function shutdown() {
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exit(1);
    }
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
