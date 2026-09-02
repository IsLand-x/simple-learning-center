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

let innertubePromise;
let youtubeDispatcher;
let youtubeDispatcherInitialized = false;

function compactMessage(value, maxLength = 500) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
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

export function youtubeFetch(input, init = {}) {
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

export function transportErrorCode(error) {
  return errorChain(error)
    .map((entry) => typeof entry.code === 'string' ? entry.code : '')
    .find(Boolean) || '';
}

export function youtubeTransportError(error) {
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

export function getYouTubeClient() {
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

export function cleanYouTubeText(value, maxLength = 500) {
  return compactMessage(value, maxLength);
}
