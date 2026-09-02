import { createHash } from 'node:crypto';
import { sourceError } from './rssSourceErrors.mjs';

const BILIBILI_API_ORIGIN = 'https://api.bilibili.com';
const BILIBILI_APP_ORIGIN = 'https://app.bilibili.com';
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;
const WBI_CACHE_TTL_MS = 6 * 60 * 60 * 1_000;
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
  37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
  22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];

const wbiKeyCache = new Map();

function compactText(value, maxLength = 20_000) {
  return String(value ?? '')
    .replace(/\u0000/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function escapeHtml(value) {
  return compactText(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function numericTimestamp(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return number > 10_000_000_000 ? number : number * 1_000;
}

function jsonErrorForStatus(status) {
  if (status === 412) {
    return sourceError(422, 'BILIBILI_RISK_CONTROL', 'B站触发了风控校验，请稍后重试或更新 Cookie');
  }
  if (status === 429) {
    return sourceError(429, 'UPSTREAM_RATE_LIMITED', 'B站请求过于频繁，请稍后重试');
  }
  if (status >= 500) {
    return sourceError(502, 'UPSTREAM_UNAVAILABLE', `B站服务暂时不可用（HTTP ${status}）`);
  }
  return sourceError(502, 'UPSTREAM_UNAVAILABLE', `B站接口返回了 HTTP ${status}`);
}

async function readLimitedJson(response) {
  if (!response.ok) throw jsonErrorForStatus(response.status);
  const declaredSize = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredSize) && declaredSize > MAX_RESPONSE_BYTES) {
    throw sourceError(413, 'UPSTREAM_UNAVAILABLE', 'B站接口响应过大');
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_RESPONSE_BYTES) {
    throw sourceError(413, 'UPSTREAM_UNAVAILABLE', 'B站接口响应过大');
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw sourceError(502, 'UPSTREAM_UNAVAILABLE', 'B站接口返回了无法解析的数据');
  }
}

async function requestBilibiliJson(url, {
  cookie = '',
  fetchImpl = fetch,
  referer = 'https://www.bilibili.com/',
} = {}) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers: {
        Accept: 'application/json',
        Referer: referer,
        'User-Agent': 'Mozilla/5.0 LearningCenter/1.0',
        ...(referer.startsWith('https://space.bilibili.com/') ? { Origin: 'https://space.bilibili.com' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error?.name === 'TimeoutError') {
      throw sourceError(504, 'UPSTREAM_TIMEOUT', '连接 B站超时，请稍后重试');
    }
    throw sourceError(502, 'UPSTREAM_UNAVAILABLE', '服务端无法连接 B站');
  }
  return readLimitedJson(response);
}

function assertBilibiliSuccess(payload, { authenticated = false } = {}) {
  const code = Number(payload?.code ?? 0);
  if (code === 0) return payload?.data;
  const message = compactText(payload?.message || payload?.msg, 300);
  if (code === -404) {
    throw sourceError(404, 'BILIBILI_UP_NOT_FOUND', '没有找到这个 B站 UP 主');
  }
  if (code === -101 || code === -6 || /未登录|登录失效|cookie/i.test(message)) {
    throw sourceError(422, authenticated ? 'BILIBILI_COOKIE_INVALID' : 'BILIBILI_COOKIE_REQUIRED', authenticated
      ? 'B站 Cookie 疑似已失效，请在设置中替换'
      : 'B站需要有效 Cookie 才能读取这个 UP 主，请先在设置中配置');
  }
  if (code === -352 || code === -412 || /风控|校验失败|risk/i.test(message)) {
    throw sourceError(422, 'BILIBILI_RISK_CONTROL', 'B站触发了风控校验，请稍后重试或更新 Cookie');
  }
  throw sourceError(502, 'UPSTREAM_UNAVAILABLE', `B站接口返回异常${message ? `：${message}` : `（${code}）`}`);
}

function imageHtml(url, alt) {
  if (!url) return '';
  const normalized = String(url).startsWith('//') ? `https:${url}` : String(url);
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
    return `<p><img src="${escapeHtml(parsed.href)}" alt="${escapeHtml(alt)}" /></p>`;
  } catch {
    return '';
  }
}

function normalizedBilibiliItem(item, fetchedAt, extraDescription = '') {
  const bvid = compactText(item?.bvid || (String(item?.param ?? '').startsWith('BV') ? item.param : ''), 32);
  const aid = compactText(item?.aid || (!bvid ? item?.param : ''), 32).replace(/^av/i, '');
  if (!bvid && !/^\d+$/.test(aid)) return null;
  const title = compactText(item?.title, 1_000) || '未命名视频';
  const author = compactText(item?.author || item?.owner?.name || item?.name, 500);
  const rawDescription = compactText(item?.description || item?.desc, 20_000);
  const reason = compactText(extraDescription || item?.rcmd_reason, 2_000);
  const contentText = [reason, rawDescription].filter(Boolean).join('\n\n');
  const imageUrl = compactText(item?.cover || item?.pic || item?.owner?.face, 4_000).replace(/^\/\//, 'https://');
  const link = bvid
    ? `https://www.bilibili.com/video/${bvid}`
    : `https://www.bilibili.com/video/av${aid}`;
  const publishedAt = numericTimestamp(item?.pubdate || item?.created || item?.ctime, 0);
  return {
    id: bvid ? `bilibili:${bvid}` : `bilibili:av${aid}`,
    title,
    link,
    author,
    publishedAt: publishedAt || fetchedAt,
    publishedAtIsFallback: !publishedAt || undefined,
    contentText,
    contentHtml: `${imageHtml(imageUrl, title)}${contentText ? `<p>${escapeHtml(contentText)}</p>` : ''}`,
    imageUrl: imageUrl || undefined,
    imageUrls: imageUrl ? [imageUrl] : [],
  };
}

export function parseBilibiliUpInput(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 2_048) {
    throw sourceError(400, 'BILIBILI_UP_NOT_FOUND', '请输入 B站 UP 主 UID 或空间地址');
  }
  const input = value.trim();
  if (/^\d{1,20}$/.test(input)) return input;
  let url;
  try {
    url = new URL(input);
  } catch {
    throw sourceError(400, 'BILIBILI_UP_NOT_FOUND', 'B站 UP 主地址格式不正确');
  }
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'space.bilibili.com' || url.username || url.password) {
    throw sourceError(400, 'BILIBILI_UP_NOT_FOUND', '目前只支持 B站 HTTPS 空间地址');
  }
  const uid = url.pathname.split('/').filter(Boolean)[0] || '';
  if (!/^\d{1,20}$/.test(uid)) {
    throw sourceError(400, 'BILIBILI_UP_NOT_FOUND', '无法从地址中识别 B站 UP 主 UID');
  }
  return uid;
}

export function createWbiQuery(params, imgKey, subKey, now = Date.now()) {
  const mixinKey = MIXIN_KEY_ENC_TAB
    .map((index) => `${imgKey}${subKey}`[index] || '')
    .join('')
    .slice(0, 32);
  const values = { ...params, wts: Math.floor(now / 1_000) };
  const query = Object.keys(values)
    .sort()
    .map((key) => {
      const value = String(values[key] ?? '').replace(/[!'()*]/g, '');
      return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    })
    .join('&');
  const wRid = createHash('md5').update(`${query}${mixinKey}`).digest('hex');
  return `${query}&w_rid=${wRid}`;
}

function wbiKeyFromUrl(value) {
  try {
    return new URL(value).pathname.split('/').at(-1)?.split('.')[0] || '';
  } catch {
    return '';
  }
}

async function getWbiKeys({ cookie = '', fetchImpl = fetch, now = Date.now, force = false } = {}) {
  const cacheKey = cookie ? 'authenticated' : 'anonymous';
  const cached = wbiKeyCache.get(cacheKey);
  if (!force && cached?.expiresAt > now()) return cached.value;
  const payload = await requestBilibiliJson(`${BILIBILI_API_ORIGIN}/x/web-interface/nav`, {
    cookie,
    fetchImpl,
  });
  const data = assertBilibiliSuccess(payload, { authenticated: Boolean(cookie) });
  const imgKey = wbiKeyFromUrl(data?.wbi_img?.img_url);
  const subKey = wbiKeyFromUrl(data?.wbi_img?.sub_url);
  if (!imgKey || !subKey) {
    throw sourceError(502, 'UPSTREAM_UNAVAILABLE', 'B站没有返回有效的 WBI 参数');
  }
  const value = { imgKey, subKey };
  wbiKeyCache.set(cacheKey, { value, expiresAt: now() + WBI_CACHE_TTL_MS });
  return value;
}

async function fetchBilibiliUpAttempt(uid, { cookie = '', fetchImpl = fetch, now = Date.now, forceKeys = false } = {}) {
  const { imgKey, subKey } = await getWbiKeys({ cookie, fetchImpl, now, force: forceKeys });
  const query = createWbiQuery({
    keyword: '',
    mid: uid,
    order: 'pubdate',
    order_avoided: true,
    platform: 'web',
    pn: 1,
    ps: 30,
    tid: 0,
    web_location: 1550101,
  }, imgKey, subKey, now());
  const payload = await requestBilibiliJson(`${BILIBILI_API_ORIGIN}/x/space/wbi/arc/search?${query}`, {
    cookie,
    fetchImpl,
    referer: `https://space.bilibili.com/${uid}/video`,
  });
  return assertBilibiliSuccess(payload, { authenticated: Boolean(cookie) });
}

function shouldRetryWithCookie(error) {
  return error?.sourceCode === 'BILIBILI_RISK_CONTROL'
    || error?.sourceCode === 'BILIBILI_COOKIE_REQUIRED'
    || error?.sourceCode === 'UPSTREAM_UNAVAILABLE';
}

export async function fetchBilibiliUp(uid, {
  fetchImpl = fetch,
  getCookie = async () => '',
  now = Date.now,
} = {}) {
  if (!/^\d{1,20}$/.test(String(uid ?? ''))) {
    throw sourceError(400, 'BILIBILI_UP_NOT_FOUND', 'B站 UP 主 UID 不正确');
  }
  let data;
  try {
    data = await fetchBilibiliUpAttempt(uid, { fetchImpl, now });
  } catch (error) {
    if (!shouldRetryWithCookie(error)) throw error;
    const cookie = await getCookie();
    if (!cookie) {
      throw sourceError(422, 'BILIBILI_COOKIE_REQUIRED', 'B站需要有效 Cookie 才能读取这个 UP 主，请先在设置中配置');
    }
    data = await fetchBilibiliUpAttempt(uid, { cookie, fetchImpl, now, forceKeys: true });
  }

  const fetchedAt = now();
  const videos = Array.isArray(data?.list?.vlist) ? data.list.vlist : [];
  const items = videos
    .slice(0, 30)
    .map((item) => normalizedBilibiliItem(item, fetchedAt))
    .filter(Boolean);
  const author = items.find((item) => item.author)?.author || compactText(videos[0]?.author, 500) || `UP 主 ${uid}`;
  return {
    title: author,
    description: `${author} 的最新投稿`,
    siteUrl: `https://space.bilibili.com/${uid}`,
    feedUrl: `https://space.bilibili.com/${uid}`,
    fetchedAt,
    items,
  };
}

export async function fetchBilibiliWeekly({ fetchImpl = fetch, now = Date.now } = {}) {
  const seriesPayload = await requestBilibiliJson(
    `${BILIBILI_APP_ORIGIN}/x/v2/show/popular/selected/series?type=weekly_selected`,
    { fetchImpl, referer: 'https://www.bilibili.com/h5/weekly-recommend' },
  );
  const series = assertBilibiliSuccess(seriesPayload);
  const current = Array.isArray(series) ? series[0] : null;
  const number = Number(current?.number);
  if (!Number.isInteger(number) || number <= 0) {
    throw sourceError(502, 'UPSTREAM_UNAVAILABLE', 'B站没有返回当前每周必看期次');
  }
  const issueName = compactText(current?.name || current?.subject || `第 ${number} 期`, 500);
  const listPayload = await requestBilibiliJson(
    `${BILIBILI_APP_ORIGIN}/x/v2/show/popular/selected?type=weekly_selected&number=${number}`,
    { fetchImpl, referer: `https://www.bilibili.com/h5/weekly-recommend?num=${number}` },
  );
  const listData = assertBilibiliSuccess(listPayload);
  const videos = Array.isArray(listData?.list) ? listData.list : [];
  const fetchedAt = now();
  const items = videos
    .slice(0, 100)
    .map((item) => normalizedBilibiliItem(item, fetchedAt, item?.rcmd_reason))
    .filter(Boolean);
  return {
    title: 'B站每周必看',
    description: `第 ${number} 期 · ${issueName}`,
    siteUrl: `https://www.bilibili.com/v/popular/weekly/?num=${number}`,
    feedUrl: 'https://www.bilibili.com/v/popular/weekly',
    fetchedAt,
    items,
  };
}

export async function verifyBilibiliCookie(cookie, { fetchImpl = fetch, now = Date.now } = {}) {
  const payload = await requestBilibiliJson(`${BILIBILI_API_ORIGIN}/x/web-interface/nav`, {
    cookie,
    fetchImpl,
  });
  const data = assertBilibiliSuccess(payload, { authenticated: true });
  if (!data?.isLogin) {
    throw sourceError(422, 'BILIBILI_COOKIE_INVALID', 'B站 Cookie 疑似已失效，请重新登录后替换');
  }
  return {
    accountLabel: compactText(data?.uname, 100),
    verifiedAt: now(),
  };
}

export function clearBilibiliWbiCache() {
  wbiKeyCache.clear();
}
