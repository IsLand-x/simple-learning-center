import { describe, expect, it } from 'vitest';
import { createReaderTextSelectionCursor } from './readerTextCursor';

describe('reader text selection cursor', () => {
  it('creates a restrained theme-aware SVG cursor with a centered hotspot and text fallback', () => {
    const cursor = createReaderTextSelectionCursor({
      accentColor: '#456C91',
      paperColor: '#FAF9F6',
      textColor: '#252525',
    });
    const [, encodedSvg] = cursor.match(/^url\("data:image\/svg\+xml,(.*)"\) 14 14, text$/) ?? [];
    const svg = decodeURIComponent(encodedSvg ?? '');

    expect(svg).toContain('width="28" height="28"');
    expect(svg).toContain('stroke-dasharray="7 9.5"');
    expect(svg).toContain('stroke="#456C91"');
    expect(svg).toContain('stroke="#FAF9F6"');
    expect(svg).toContain('stroke="#252525"');
  });
});
