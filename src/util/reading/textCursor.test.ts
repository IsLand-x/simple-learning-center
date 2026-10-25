import { describe, expect, it } from 'vitest';
import { createReaderTextSelectionCursor } from './textCursor';

describe('reader text selection cursor', () => {
  it('creates a contrasting theme-aware SVG cursor with a centered hotspot and text fallback', () => {
    const cursor = createReaderTextSelectionCursor({
      accentColor: '#456C91',
      paperColor: '#FAF9F6',
      textColor: '#252525',
    });
    const [, encodedSvg] = cursor.match(/^url\("data:image\/svg\+xml,(.*)"\) 16 16, text$/) ?? [];
    const svg = decodeURIComponent(encodedSvg ?? '');

    expect(svg).toContain('width="32" height="32"');
    expect(svg).not.toContain('stroke-opacity');
    expect(svg).toContain('stroke="#456C91"');
    expect(svg).toContain('stroke="#FAF9F6"');
    expect(svg).toContain('stroke="#252525"');
  });
});
