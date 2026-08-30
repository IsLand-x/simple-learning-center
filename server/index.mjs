import { serve } from '@hono/node-server';
import { createApp } from './app.mjs';
import {
  DATA_DIRECTORY,
  HOST,
  MODE,
  PASSWORD,
  PORT,
  RSS_REFRESH_INTERVAL_MS,
  validateServerConfig,
} from './config.mjs';
import { createRssScheduler } from './rssScheduler.mjs';
import { initializeDataDirectories } from './storage.mjs';

validateServerConfig();
await initializeDataDirectories();
const rssScheduler = createRssScheduler();

const server = serve({
  fetch: createApp().fetch,
  hostname: HOST,
  port: PORT,
}, () => {
  const address = HOST === '0.0.0.0' ? '服务器地址' : `http://${HOST}:${PORT}`;
  console.log(`学习中心已启动：${address}`);
  console.log(`运行模式：${MODE === 'remote' ? '远程访问（需要认证）' : '仅本机访问'}`);
  console.log(`数据目录：${DATA_DIRECTORY}`);
  if (MODE === 'remote' && PASSWORD === 'password') {
    console.warn('安全提示：当前使用默认登录密码，请登录后立即在设置页修改');
  }
  rssScheduler.start();
  console.log(`RSS 服务端刷新周期：${Math.round(RSS_REFRESH_INTERVAL_MS / 60_000)} 分钟（错峰执行）`);
});

function shutdown() {
  rssScheduler.stop();
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
