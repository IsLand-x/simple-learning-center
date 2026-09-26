import { describe, expect, it, vi } from 'vitest';
import { folderFeedsDroppableId, folderIdFromFeedsDroppable } from './sourceDrag';
vi.mock('@douyinfe/semi-ui', () => ({ Toast: {} }));
describe('source drag ids', () => {
  it('round-trips folder droppable ids', () => {
    const droppableId = folderFeedsDroppableId('folder:1');
    expect(folderIdFromFeedsDroppable(droppableId)).toBe('folder:1');
    expect(folderIdFromFeedsDroppable('rss-feeds:unfiled')).toBeUndefined();
    expect(folderIdFromFeedsDroppable('unknown')).toBeNull();
  });
});
