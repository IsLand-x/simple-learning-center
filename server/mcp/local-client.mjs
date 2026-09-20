// 独立运行的 MCP stdio 连接脚本，仅依赖 Node.js >=22.19。
import { createInterface } from 'node:readline';
import { open } from 'node:fs/promises';
import { basename, isAbsolute } from 'node:path';
import { Readable } from 'node:stream';

const endpoint = process.env.LEARNING_CENTER_MCP_URL;
const token = process.env.LEARNING_CENTER_MCP_TOKEN;
if (!endpoint || !token) {
  process.stderr.write('请配置 LEARNING_CENTER_MCP_URL 和 LEARNING_CENTER_MCP_TOKEN\n');
  process.exit(1);
}
const url = new URL(endpoint);
if (!['http:', 'https:'].includes(url.protocol)) throw new Error('MCP 地址必须使用 HTTP 或 HTTPS');
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/json, text/event-stream',
  'Content-Type': 'application/json',
};
const pending = new Map();
let protocolVersion;

async function upload(args, signal) {
  if (
    !args ||
    typeof args.file_path !== 'string' ||
    !isAbsolute(args.file_path) ||
    !/\.epub$/i.test(args.file_path) ||
    Object.keys(args).some((key) => key !== 'file_path')
  )
    throw new Error('file_path 必须是本机 EPUB 文件的绝对路径');
  const handle = await open(args.file_path, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > 100 * 1024 * 1024)
      throw new Error('请选择非空 EPUB 文件，大小不能超过 100 MiB');
    const target = new URL('./v1/books', url);
    target.searchParams.set('filename', basename(args.file_path));
    const response = await fetch(target, {
      method: 'POST',
      headers: {
        Authorization: headers.Authorization,
        'Content-Type': 'application/epub+zip',
        'Content-Length': String(stat.size),
      },
      body: Readable.toWeb(handle.createReadStream({ autoClose: false })),
      duplex: 'half',
      signal,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `上传失败（${response.status}）`);
    return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data };
  } finally {
    await handle.close();
  }
}

async function dispatch(message) {
  if (message.method === 'notifications/cancelled') {
    pending.get(message.params?.requestId)?.abort();
    return;
  }
  const controller = new AbortController();
  if (message.id !== undefined) pending.set(message.id, controller);
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(300000)]);
  try {
    if (message.method === 'tools/call' && message.params?.name === 'upload_book') {
      return {
        jsonrpc: '2.0',
        id: message.id,
        result: await upload(message.params.arguments, signal),
      };
    }
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...headers,
        ...(protocolVersion ? { 'MCP-Protocol-Version': protocolVersion } : {}),
      },
      body: JSON.stringify(message),
      signal,
    });
    if (response.status === 202 || response.status === 204) return;
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error?.message || data.error || `MCP 请求失败（${response.status}）`);
    if (message.method === 'initialize') protocolVersion = data.result?.protocolVersion;
    if (message.method === 'tools/list' && data.result?.tools) {
      data.result.tools = data.result.tools.map((tool) =>
        tool.name !== 'upload_book'
          ? tool
          : {
              ...tool,
              description:
                '从 AI 所在电脑导入 EPUB 文件。传入本机绝对路径，脚本会流式上传到学习中心；最大 100 MiB。请只上传用户指定的书籍。重复上传会创建副本。',
              inputSchema: {
                type: 'object',
                properties: {
                  file_path: { type: 'string', description: 'AI 所在电脑的 EPUB 文件绝对路径' },
                },
                required: ['file_path'],
                additionalProperties: false,
              },
            },
      );
    }
    return data;
  } catch (error) {
    if (message.id === undefined) return;
    const text =
      error.name === 'AbortError'
        ? '操作已取消；请查询书架确认上传结果'
        : error.name === 'TimeoutError'
          ? '请求超时；重试上传前请查询书架，避免重复导入'
          : '请求失败：' + error.message;
    return message.method === 'tools/call'
      ? {
          jsonrpc: '2.0',
          id: message.id,
          result: { isError: true, content: [{ type: 'text', text }] },
        }
      : { jsonrpc: '2.0', id: message.id ?? null, error: { code: -32603, message: text } };
  } finally {
    pending.delete(message.id);
  }
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on('line', (line) => {
  let message;
  try {
    message = JSON.parse(line);
    if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string')
      throw new Error('无效请求');
  } catch {
    process.stdout.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'JSON-RPC 请求格式不正确' },
      }) + '\n',
    );
    return;
  }
  void dispatch(message).then((response) => {
    if (response && message.id !== undefined) process.stdout.write(JSON.stringify(response) + '\n');
  });
});
input.on('close', () => {
  for (const controller of pending.values()) controller.abort();
});
