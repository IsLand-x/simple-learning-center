import { Innertube } from 'youtubei.js';
import {
  EnvHttpProxyAgent,
  ProxyAgent,
  Socks5ProxyAgent,
} from 'undici';
import {
  YOUTUBE_ENV_PROXY_CONFIGURED,
  YOUTUBE_PROXY,
} from './config.mjs';
import { statusError } from './errors.mjs';

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const MAX_CAPTION_BYTES = 16 * 1024 * 1024;
const METADATA_CLIENTS = ['MWEB', 'WEB', 'ANDROID'];
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtube-nocookie.com',
]);

let innertubePromise;
let youtubeDispatcher;
let youtubeDispatcherInitialized = false;

function cleanText(value, maxLength = 20_000) {
  return String(value ?? '')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength);
}

function getYouTubeDispatcher() {
  if (youtubeDispatcherInitialized) return youtubeDispatcher;
  youtubeDispatcherInitialized = true;
  if (YOUTUBE_PROXY) {
    const proxyUrl = new URL(YOUTUBE_PROXY);
    youtubeDispatcher = proxyUrl.protocol === 'socks5:'
      ? new Socks5ProxyAgent(proxyUrl)
      : new ProxyAgent(proxyUrl.toString());
  } else if (YOUTUBE_ENV_PROXY_CONFIGURED) {
    youtubeDispatcher = new EnvHttpProxyAgent();
  }
  return youtubeDispatcher;
}

function youtubeFetch(input, init = {}) {
  const dispatcher = getYouTubeDispatcher();
  return globalThis.fetch(input, dispatcher ? { ...init, dispatcher } : init);
}

function errorChain(error) {
  const chain = [];
  const seen = new Set();
  let current = error;
  while (current && typeof current === 'object' && !seen.has(current) && chain.length < 8) {
    chain.push(current);
    seen.add(current);
    current = current.cause;
  }
  return chain;
}

function transportErrorCode(error) {
  return errorChain(error)
    .map((entry) => typeof entry.code === 'string' ? entry.code : '')
    .find(Boolean) || '';
}

function youtubeTransportError(error) {
  if (Number.isInteger(error?.status)) return null;
  const chain = errorChain(error);
  const code = transportErrorCode(error);
  const message = chain
    .map((entry) => entry instanceof Error ? entry.message : '')
    .filter(Boolean)
    .join(' ');
  const timedOut = code === 'UND_ERR_CONNECT_TIMEOUT'
    || code === 'UND_ERR_HEADERS_TIMEOUT'
    || code === 'ETIMEDOUT'
    || chain.some((entry) => entry?.name === 'TimeoutError')
    || /timed?\s*out|timeout/i.test(message);
  const isTransportFailure = timedOut
    || code.startsWith('UND_ERR_')
    || ['ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH', 'ENOTFOUND'].includes(code)
    || /fetch failed|network|socket|connect/i.test(message);
  if (!isTransportFailure) return null;
  return statusError(
    timedOut ? 504 : 502,
    timedOut
      ? '服务端连接 YouTube 超时。浏览器中的 VPN 不一定会被 Node 服务继承，请配置 LEARNING_CENTER_YOUTUBE_PROXY'
      : '服务端无法连接 YouTube，请检查服务器网络或代理配置',
    { expose: true },
  );
}

function playabilityError(info) {
  const status = cleanText(info?.playability_status?.status, 80).toUpperCase();
  const reason = cleanText(info?.playability_status?.reason, 300);
  if (status === 'LOGIN_REQUIRED') {
    return statusError(422, '该视频需要登录 YouTube 后才能读取', { expose: true });
  }
  if (/does not exist|removed by (?:the )?uploader/i.test(reason)) {
    return statusError(404, `该 YouTube 视频已不存在或被删除${reason ? `：${reason}` : ''}`);
  }
  if (status || reason) {
    return statusError(
      422,
      `YouTube 当前不允许服务器读取该视频${reason ? `：${reason}` : ''}`,
      { expose: true },
    );
  }
  return statusError(
    502,
    'YouTube 返回的视频信息不完整，请稍后重试',
    { expose: true },
  );
}

export function parseYouTubeVideoId(input) {
  if (typeof input !== 'string' || !input.trim() || input.length > 2_048) {
    throw statusError(400, '请输入有效的 YouTube 视频链接');
  }
  const candidate = input.trim();
  if (VIDEO_ID_PATTERN.test(candidate)) return candidate;

  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw statusError(400, '请输入完整的 YouTube 视频链接');
  }
  const hostname = url.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(hostname)) throw statusError(400, '目前只支持 YouTube 视频链接');

  let videoId = '';
  if (hostname === 'youtu.be') {
    videoId = url.pathname.split('/').filter(Boolean)[0] ?? '';
  } else if (url.pathname === '/watch') {
    videoId = url.searchParams.get('v') ?? '';
  } else {
    const segments = url.pathname.split('/').filter(Boolean);
    if (['shorts', 'embed', 'live'].includes(segments[0])) videoId = segments[1] ?? '';
  }
  if (!VIDEO_ID_PATTERN.test(videoId)) throw statusError(400, '无法从链接中识别 YouTube 视频 ID');
  return videoId;
}

export function parseTimedTextJson(payload) {
  const events = Array.isArray(payload?.events) ? payload.events : [];
  return events.flatMap((event) => {
    const text = cleanText(
      (Array.isArray(event?.segs) ? event.segs : [])
        .map((segment) => typeof segment?.utf8 === 'string' ? segment.utf8 : '')
        .join(''),
      8_000,
    );
    const startMilliseconds = Number(event?.tStartMs);
    const durationMilliseconds = Number(event?.dDurationMs);
    if (!text || !Number.isFinite(startMilliseconds)) return [];
    return [{
      startSeconds: Math.max(0, startMilliseconds / 1_000),
      durationSeconds: Number.isFinite(durationMilliseconds)
        ? Math.max(0, durationMilliseconds / 1_000)
        : 0,
      text,
    }];
  });
}

async function readLimitedText(response, limit = MAX_CAPTION_BYTES) {
  if (!response.ok) throw statusError(502, `YouTube 字幕请求失败（${response.status}）`);
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > limit) {
    throw statusError(413, 'YouTube 字幕内容过大');
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw statusError(413, 'YouTube 字幕内容过大');
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function captionRequestUrl(baseUrl, translatedLanguage) {
  const url = new URL(baseUrl);
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || !(hostname === 'youtube.com' || hostname.endsWith('.youtube.com'))) {
    throw statusError(502, 'YouTube 返回了不受信任的字幕地址');
  }
  url.searchParams.set('fmt', 'json3');
  if (translatedLanguage) url.searchParams.set('tlang', translatedLanguage);
  return url;
}

async function fetchCaptionTrack(track, translatedLanguage, fetchImpl) {
  const response = await fetchImpl(captionRequestUrl(track.base_url, translatedLanguage), {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'LearningCenter/1.0',
    },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await readLimitedText(response);
  try {
    return parseTimedTextJson(JSON.parse(raw));
  } catch {
    throw statusError(502, '无法解析 YouTube 字幕');
  }
}

function chooseCaptionTrack(tracks) {
  return tracks.find((track) => /^en(?:-|$)/i.test(track.language_code) && track.kind !== 'asr')
    ?? tracks.find((track) => /^en(?:-|$)/i.test(track.language_code))
    ?? tracks.find((track) => track.kind !== 'asr')
    ?? tracks[0];
}

function getInnertube() {
  if (!innertubePromise) {
    innertubePromise = Innertube.create({
      lang: 'en',
      location: 'US',
      retrieve_player: false,
      generate_session_locally: true,
      fetch: youtubeFetch,
    }).catch((error) => {
      innertubePromise = undefined;
      throw error;
    });
  }
  return innertubePromise;
}

export async function fetchYouTubeVideo(input, {
  fetchImpl = youtubeFetch,
  getClient = getInnertube,
} = {}) {
  const videoId = parseYouTubeVideoId(input);
  let info;
  try {
    const youtube = await getClient();
    let lastIncompleteInfo;
    for (const client of METADATA_CLIENTS) {
      try {
        const candidate = await youtube.getBasicInfo(videoId, { client });
        if (cleanText(candidate?.basic_info?.title, 500)) {
          info = candidate;
          break;
        }
        lastIncompleteInfo = candidate;
        console.warn('YouTube metadata response was incomplete', {
          client,
          playabilityStatus: cleanText(candidate?.playability_status?.status, 80),
        });
      } catch (error) {
        const transportFailure = youtubeTransportError(error);
        if (transportFailure) throw transportFailure;
        console.warn('YouTube metadata client failed', {
          client,
          code: transportErrorCode(error),
          error: error instanceof Error ? error.name : typeof error,
        });
      }
    }
    if (!info) throw playabilityError(lastIncompleteInfo);
  } catch (error) {
    if (Number.isInteger(error?.status)) throw error;
    const transportFailure = youtubeTransportError(error);
    if (transportFailure) throw transportFailure;
    console.warn('YouTube metadata request failed', {
      code: transportErrorCode(error),
      error: error instanceof Error ? error.name : typeof error,
    });
    throw statusError(502, '暂时无法读取 YouTube 视频，请稍后重试', { expose: true });
  }

  const title = cleanText(info?.basic_info?.title, 500);
  if (!title) throw playabilityError(info);
  const channel = info.basic_info.channel;
  const tracks = Array.isArray(info.captions?.caption_tracks) ? info.captions.caption_tracks : [];
  const track = chooseCaptionTrack(tracks);
  const trackIsEnglish = Boolean(track && /^en(?:-|$)/i.test(track.language_code));
  const translateOriginalToEnglish = Boolean(track && !trackIsEnglish && track.is_translatable);
  let originalCues = [];
  let chineseCues = [];
  let captionError = '';

  if (track) {
    try {
      originalCues = await fetchCaptionTrack(track, translateOriginalToEnglish ? 'en' : undefined, fetchImpl);
      if (/^zh(?:-|$)/i.test(track.language_code)) {
        chineseCues = translateOriginalToEnglish
          ? await fetchCaptionTrack(track, undefined, fetchImpl)
          : originalCues;
      } else if (track.is_translatable) {
        chineseCues = await fetchCaptionTrack(track, 'zh-Hans', fetchImpl);
      }
    } catch (error) {
      const transportFailure = youtubeTransportError(error);
      captionError = transportFailure?.message
        || (error instanceof Error ? error.message : '字幕读取失败');
    }
  } else {
    captionError = '该视频没有可用字幕';
  }

  return {
    youtubeVideoId: videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title,
    channelId: cleanText(channel?.id || info.basic_info.channel_id, 200),
    channelTitle: cleanText(channel?.name || info.basic_info.author, 300) || '未知频道',
    description: cleanText(info.basic_info.short_description, 20_000),
    durationSeconds: Math.max(0, Number(info.basic_info.duration) || 0),
    captions: {
      originalLanguage: translateOriginalToEnglish ? 'en' : track?.language_code || '',
      originalLanguageLabel: translateOriginalToEnglish
        ? 'English（YouTube 自动翻译）'
        : track?.name?.toString?.() || track?.language_code || '',
      original: originalCues,
      chinese: chineseCues,
      ...(captionError ? { error: captionError } : {}),
    },
  };
}
