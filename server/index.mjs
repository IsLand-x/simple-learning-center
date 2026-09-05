import { serve } from '@hono/node-server';
import { createApp } from './app.mjs';
import { createBookTrashScheduler } from './bookTrash.mjs';
import {
  DATA_DIRECTORY,
  HOST,
  MODE,
  PASSWORD,
  PORT,
  RSS_REFRESH_INTERVAL_MS,
  YOUTUBE_PROXY_CONFIGURED,
  validateServerConfig,
} from './config.mjs';
import { createRssScheduler } from './rssScheduler.mjs';
import { createRssDigestScheduler } from './rssDigestScheduler.mjs';
import { createAiJobManager } from './aiJobs.mjs';
import { initializeDataDirectories } from './storage.mjs';

validateServerConfig();
await initializeDataDirectories();
const rssScheduler = createRssScheduler();
const bookTrashScheduler = createBookTrashScheduler();
const aiJobManager = createAiJobManager();
const rssDigestScheduler = createRssDigestScheduler({ startDigest: (input) => aiJobManager.startDigest(input) });

const server = serve({
  fetch: createApp({ aiJobManager }).fetch,
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
  rssDigestScheduler.start();
  bookTrashScheduler.start();
  console.log(`RSS 服务端刷新周期：${Math.round(RSS_REFRESH_INTERVAL_MS / 60_000)} 分钟（错峰执行）`);
  console.log(`YouTube 服务端请求：${YOUTUBE_PROXY_CONFIGURED ? '使用已配置代理' : '直接连接（不会自动继承浏览器代理）'}`);
});

function shutdown() {
  rssScheduler.stop();
  rssDigestScheduler.stop();
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
