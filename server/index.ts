import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { createBookTrashScheduler } from './modules/books/trash.js';
import { DATA_DIRECTORY, HOST, MODE, PASSWORD, PORT, validateServerConfig } from './config.js';
import { createAiJobManager } from './modules/ai/jobs/manager.js';
import { initializeDataDirectories } from './infrastructure/fs/files.js';

validateServerConfig();
await initializeDataDirectories();
import { migrateFromStateJson } from './db/migrateFromStateJson.js';
await migrateFromStateJson();
const bookTrashScheduler = createBookTrashScheduler();
const aiJobManager = createAiJobManager();

const server = serve(
  {
    fetch: createApp({ aiJobManager }).fetch,
    hostname: HOST,
    port: PORT,
  },
  () => {
    const address = HOST === '0.0.0.0' ? '服务器地址' : `http://${HOST}:${PORT}`;
    console.log(`学习中心已启动：${address}`);
    console.log(`运行模式：${MODE === 'remote' ? '远程访问（需要认证）' : '仅本机访问'}`);
    console.log(`数据目录：${DATA_DIRECTORY}`);
    if (MODE === 'remote' && PASSWORD === 'password') {
      console.warn('安全提示：当前使用默认登录密码，请登录后立即在设置页修改');
    }
    bookTrashScheduler.start();
  },
);

function shutdown() {
  bookTrashScheduler.stop();
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
