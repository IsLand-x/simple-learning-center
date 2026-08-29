import {
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { atomicWrite } from './storage.mjs';

const scrypt = promisify(scryptCallback);
const AUTH_FORMAT_VERSION = 1;
const SESSION_LIFETIME_SECONDS = 30 * 24 * 60 * 60;

export const SESSION_COOKIE_NAME = 'learning_center_session';

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

async function hashPassword(password, salt = randomBytes(16).toString('base64url')) {
  const hash = await scrypt(password, salt, 64);
  return { salt, hash: Buffer.from(hash).toString('base64url') };
}

function validateStoredCredentials(value) {
  if (
    !value
    || value.formatVersion !== AUTH_FORMAT_VERSION
    || typeof value.username !== 'string'
    || typeof value.password?.salt !== 'string'
    || typeof value.password?.hash !== 'string'
    || typeof value.sessionSecret !== 'string'
    || typeof value.revision !== 'string'
  ) {
    throw new Error('认证配置文件格式不正确');
  }
  return value;
}

async function createCredentials(username, password, previous) {
  return {
    formatVersion: AUTH_FORMAT_VERSION,
    username,
    password: await hashPassword(password),
    sessionSecret: previous?.sessionSecret || randomBytes(32).toString('base64url'),
    revision: randomBytes(16).toString('base64url'),
    updatedAt: new Date().toISOString(),
  };
}

function createSessionToken(credentials) {
  const payload = Buffer.from(JSON.stringify({
    expiresAt: Math.floor(Date.now() / 1000) + SESSION_LIFETIME_SECONDS,
    revision: credentials.revision,
  })).toString('base64url');
  const signature = createHmac('sha256', credentials.sessionSecret)
    .update(payload)
    .digest('base64url');
  return `${payload}.${signature}`;
}

function verifySessionToken(token, credentials) {
  if (typeof token !== 'string') return false;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return false;
  const expectedSignature = createHmac('sha256', credentials.sessionSecret)
    .update(payload)
    .digest('base64url');
  if (!safeEqual(signature, expectedSignature)) return false;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return session.revision === credentials.revision
      && Number.isInteger(session.expiresAt)
      && session.expiresAt > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function createAuthService({ authFile, defaultUsername, defaultPassword }) {
  let credentialsPromise;
  let updateQueue = Promise.resolve();

  async function loadCredentials() {
    try {
      return validateStoredCredentials(JSON.parse(await readFile(authFile, 'utf8')));
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      const credentials = await createCredentials(defaultUsername, defaultPassword);
      await atomicWrite(authFile, `${JSON.stringify(credentials, null, 2)}\n`);
      return credentials;
    }
  }

  function getCredentials() {
    credentialsPromise ??= loadCredentials();
    return credentialsPromise;
  }

  async function verifyCredentials(username, password) {
    const credentials = await getCredentials();
    const submitted = await hashPassword(password, credentials.password.salt);
    return safeEqual(username, credentials.username)
      && safeEqual(submitted.hash, credentials.password.hash);
  }

  return {
    async getConfiguredUsername() {
      try {
        return validateStoredCredentials(JSON.parse(await readFile(authFile, 'utf8'))).username;
      } catch (error) {
        if (error?.code === 'ENOENT') return defaultUsername;
        throw error;
      }
    },
    async getUsername() {
      return (await getCredentials()).username;
    },
    async login(username, password) {
      if (!await verifyCredentials(username, password)) return null;
      return createSessionToken(await getCredentials());
    },
    async verifySession(token) {
      return verifySessionToken(token, await getCredentials());
    },
    updatePassword(password) {
      const operation = updateQueue.catch(() => undefined).then(async () => {
        const current = await getCredentials();
        const next = await createCredentials(current.username, password, current);
        await atomicWrite(authFile, `${JSON.stringify(next, null, 2)}\n`);
        credentialsPromise = Promise.resolve(next);
        return {
          username: next.username,
          token: createSessionToken(next),
        };
      });
      updateQueue = operation.then(() => undefined, () => undefined);
      return operation;
    },
  };
}

export const sessionCookieOptions = {
  httpOnly: true,
  maxAge: SESSION_LIFETIME_SECONDS,
  path: '/',
  sameSite: 'Strict',
  secure: true,
};
