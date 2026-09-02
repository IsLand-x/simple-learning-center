import { chmod, readFile, rm } from 'node:fs/promises';
import { SOURCE_SECRETS_FILE } from './config.mjs';
import { statusError } from './errors.mjs';
import { verifyBilibiliCookie } from './bilibiliFeeds.mjs';
import { atomicWrite } from './storage.mjs';

const FORMAT_VERSION = 1;
const MAX_COOKIE_LENGTH = 48 * 1024;

function emptyStatus() {
  return { configured: false, verificationStatus: 'unconfigured' };
}

function publicStatus(entry) {
  if (!entry?.cookie) return emptyStatus();
  return {
    configured: true,
    verificationStatus: entry.verificationStatus || 'unverified',
    updatedAt: entry.updatedAt,
    lastVerifiedAt: entry.lastVerifiedAt,
    accountLabel: entry.accountLabel,
    message: entry.message,
  };
}

function normalizeCookie(value) {
  if (typeof value !== 'string') throw statusError(400, '请输入 B站 Cookie');
  const cookie = value.trim();
  if (!cookie) throw statusError(400, '请输入 B站 Cookie');
  if (cookie.length > MAX_COOKIE_LENGTH) throw statusError(413, 'B站 Cookie 过长');
  if (/\r|\n/.test(cookie)) throw statusError(400, 'B站 Cookie 不能包含换行符');
  const parts = cookie.split(';').map((part) => part.trim()).filter(Boolean);
  if (!parts.length || parts.some((part) => !/^[^=;\s]+=[^;]*$/.test(part))) {
    throw statusError(400, 'B站 Cookie 格式不正确，应为 name=value; name2=value2');
  }
  return parts.join('; ');
}

async function readSecrets(path) {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'));
    return parsed && typeof parsed === 'object'
      ? { formatVersion: FORMAT_VERSION, bilibili: parsed.bilibili }
      : { formatVersion: FORMAT_VERSION };
  } catch (error) {
    if (error?.code === 'ENOENT') return { formatVersion: FORMAT_VERSION };
    throw error;
  }
}

async function writeSecrets(path, secrets) {
  await atomicWrite(path, `${JSON.stringify(secrets, null, 2)}\n`);
  await chmod(path, 0o600);
}

export function createSourceSecretsService({
  path = SOURCE_SECRETS_FILE,
  verifyCookie = verifyBilibiliCookie,
  now = Date.now,
} = {}) {
  let operation = Promise.resolve();
  const queued = (task) => {
    const next = operation.catch(() => undefined).then(task);
    operation = next.then(() => undefined, () => undefined);
    return next;
  };

  const verifyStored = async () => queued(async () => {
    const secrets = await readSecrets(path);
    const entry = secrets.bilibili;
    if (!entry?.cookie) return emptyStatus();
    try {
      const result = await verifyCookie(entry.cookie);
      secrets.bilibili = {
        ...entry,
        verificationStatus: 'valid',
        lastVerifiedAt: result.verifiedAt || now(),
        accountLabel: result.accountLabel || undefined,
        message: undefined,
      };
      await writeSecrets(path, secrets);
      return publicStatus(secrets.bilibili);
    } catch (error) {
      const invalid = error?.sourceCode === 'BILIBILI_COOKIE_INVALID';
      secrets.bilibili = {
        ...entry,
        verificationStatus: invalid ? 'invalid' : 'unverified',
        ...(invalid ? { lastVerifiedAt: now() } : {}),
        message: error instanceof Error ? error.message : 'B站 Cookie 验证失败',
      };
      await writeSecrets(path, secrets);
      if (!invalid) throw error;
      return publicStatus(secrets.bilibili);
    }
  });

  return {
    async getBilibiliCookie() {
      await operation.catch(() => undefined);
      return (await readSecrets(path)).bilibili?.cookie || '';
    },
    async getBilibiliStatus() {
      await operation.catch(() => undefined);
      return publicStatus((await readSecrets(path)).bilibili);
    },
    async setBilibiliCookie(value) {
      const cookie = normalizeCookie(value);
      await queued(async () => {
        const secrets = await readSecrets(path);
        secrets.bilibili = { cookie, verificationStatus: 'unverified', updatedAt: now() };
        await writeSecrets(path, secrets);
      });
      return verifyStored();
    },
    verifyBilibiliCookie: verifyStored,
    async deleteBilibiliCookie() {
      return queued(async () => {
        const secrets = await readSecrets(path);
        delete secrets.bilibili;
        await rm(path, { force: true });
        return emptyStatus();
      });
    },
  };
}

export const sourceSecretsService = createSourceSecretsService();
