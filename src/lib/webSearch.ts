import type { WebSearchConfig } from '../types';

interface JinaDocument {
  title?: string;
  url?: string;
  description?: string;
  content?: string;
  publishedTime?: string;
}

interface JinaResponse {
  code?: number;
  status?: number;
  message?: string;
  data?: JinaDocument | JinaDocument[];
}

function jinaHeaders(config: WebSearchConfig, tokenBudget: number) {
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${config.apiKey.trim()}`,
    'X-Token-Budget': String(tokenBudget),
  };
}

async function readJinaResponse(response: Response) {
  const body = await response.text();
  if (!response.ok) {
    let details = body.slice(0, 300);
    try {
      const payload = JSON.parse(body) as JinaResponse;
      details = payload.message || details;
    } catch {
      // Preserve the short text response when the service did not return JSON.
    }
    throw new Error(`联网服务请求失败（${response.status}）${details ? `：${details}` : ''}`);
  }
  try {
    return JSON.parse(body) as JinaResponse;
  } catch {
    return { data: { content: body } } satisfies JinaResponse;
  }
}

function requireApiKey(config: WebSearchConfig) {
  if (!config.apiKey.trim()) {
    throw new Error('尚未配置 Jina API Key，请先在设置页配置联网搜索');
  }
}

function cleanText(value: string | undefined, maxLength: number) {
  return (value ?? '').replace(/\n{3,}/g, '\n\n').trim().slice(0, maxLength);
}

export async function searchWeb(
  config: WebSearchConfig,
  query: string,
  maxResults = 5,
  signal?: AbortSignal,
) {
  requireApiKey(config);
  const cleanedQuery = query.trim();
  if (!cleanedQuery) throw new Error('联网搜索词不能为空');
  const response = await fetch(`https://s.jina.ai/?q=${encodeURIComponent(cleanedQuery)}`, {
    headers: jinaHeaders(config, 6_000),
    signal,
  });
  const payload = await readJinaResponse(response);
  const documents = Array.isArray(payload.data) ? payload.data : payload.data ? [payload.data] : [];
  return {
    query: cleanedQuery,
    results: documents.slice(0, Math.min(5, Math.max(1, maxResults))).map((document) => ({
      title: document.title || '未命名网页',
      url: document.url || '',
      publishedTime: document.publishedTime,
      description: cleanText(document.description, 500),
      content: cleanText(document.content, 2_000),
    })),
  };
}

export async function readWebPage(config: WebSearchConfig, targetUrl: string, signal?: AbortSignal) {
  requireApiKey(config);
  let url: URL;
  try {
    url = new URL(targetUrl);
  } catch {
    throw new Error('网页地址格式不正确');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('只支持读取 HTTP 或 HTTPS 网页');
  }
  const response = await fetch(`https://r.jina.ai/${url.href}`, {
    headers: jinaHeaders(config, 12_000),
    signal,
  });
  const payload = await readJinaResponse(response);
  const document = Array.isArray(payload.data) ? payload.data[0] : payload.data;
  if (!document) throw new Error('网页读取服务没有返回正文');
  return {
    title: document.title || url.hostname,
    url: document.url || url.href,
    publishedTime: document.publishedTime,
    content: cleanText(document.content, 18_000),
  };
}
