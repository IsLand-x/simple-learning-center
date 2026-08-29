import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

const CAPTCHA_LIFETIME_MILLISECONDS = 5 * 60 * 1000;
const MAX_CHALLENGES = 1_000;
const DIGIT_SEGMENTS = {
  0: ['a', 'b', 'c', 'd', 'e', 'f'],
  1: ['b', 'c'],
  2: ['a', 'b', 'd', 'e', 'g'],
  3: ['a', 'b', 'c', 'd', 'g'],
  4: ['b', 'c', 'f', 'g'],
  5: ['a', 'c', 'd', 'f', 'g'],
  6: ['a', 'c', 'd', 'e', 'f', 'g'],
  7: ['a', 'b', 'c'],
  8: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
  9: ['a', 'b', 'c', 'd', 'f', 'g'],
};
const SEGMENT_RECTS = {
  a: [4, 0, 18, 4],
  b: [22, 4, 4, 18],
  c: [22, 26, 4, 18],
  d: [4, 44, 18, 4],
  e: [0, 26, 4, 18],
  f: [0, 4, 4, 18],
  g: [4, 22, 18, 4],
};
const COLORS = ['#2563eb', '#4f46e5', '#0f766e', '#9333ea'];

function hashAnswer(id, answer) {
  return createHash('sha256').update(`${id}:${answer}`).digest();
}

function safeEqual(left, right) {
  return left.length === right.length && timingSafeEqual(left, right);
}

function createDefaultCode() {
  return Array.from({ length: 4 }, () => String(randomInt(0, 10))).join('');
}

function renderDigit(digit, index) {
  const color = COLORS[randomInt(0, COLORS.length)];
  const offsetX = 17 + index * 35 + randomInt(-2, 3);
  const offsetY = 8 + randomInt(-2, 3);
  const rotation = randomInt(-9, 10);
  const segments = DIGIT_SEGMENTS[digit].map((segment) => {
    const [x, y, width, height] = SEGMENT_RECTS[segment];
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="2"/>`;
  }).join('');
  return `<g fill="${color}" transform="translate(${offsetX} ${offsetY}) rotate(${rotation} 13 24)">${segments}</g>`;
}

function createCaptchaImage(code) {
  const noiseLines = Array.from({ length: 5 }, () => (
    `<line x1="${randomInt(0, 158)}" y1="${randomInt(0, 64)}" x2="${randomInt(0, 158)}" y2="${randomInt(0, 64)}"/>`
  )).join('');
  const noiseDots = Array.from({ length: 18 }, () => (
    `<circle cx="${randomInt(2, 157)}" cy="${randomInt(2, 63)}" r="${randomInt(1, 3)}"/>`
  )).join('');
  const digits = [...code].map(renderDigit).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="158" height="64" viewBox="0 0 158 64"><rect width="158" height="64" rx="8" fill="#f4f5f7"/><g stroke="#94a3b8" stroke-width="1" opacity=".42">${noiseLines}</g><g fill="#94a3b8" opacity=".4">${noiseDots}</g>${digits}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

export function createCaptchaService({ codeFactory = createDefaultCode } = {}) {
  const challenges = new Map();

  function removeExpiredChallenges() {
    const now = Date.now();
    for (const [id, challenge] of challenges) {
      if (challenge.expiresAt <= now) challenges.delete(id);
    }
    while (challenges.size >= MAX_CHALLENGES) {
      challenges.delete(challenges.keys().next().value);
    }
  }

  return {
    create() {
      removeExpiredChallenges();
      const code = codeFactory();
      if (!/^\d{4}$/.test(code)) throw new Error('验证码生成器必须返回四位数字');
      const id = randomBytes(16).toString('base64url');
      challenges.set(id, {
        answerHash: hashAnswer(id, code),
        expiresAt: Date.now() + CAPTCHA_LIFETIME_MILLISECONDS,
      });
      return {
        id,
        image: createCaptchaImage(code),
      };
    },
    verify(id, answer) {
      if (typeof id !== 'string' || typeof answer !== 'string') return false;
      const challenge = challenges.get(id);
      if (!challenge) return false;
      challenges.delete(id);
      if (challenge.expiresAt <= Date.now()) return false;
      return safeEqual(challenge.answerHash, hashAnswer(id, answer.trim()));
    },
  };
}
