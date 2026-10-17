import type { View as FoliateView } from 'foliate-js/view.js';
import type { HighlightItem } from '../../../../../../../contracts/reading';

export function loadedAnnotations(
  view: FoliateView,
  sectionIndex: number,
  highlights: HighlightItem[],
) {
  // Terms use their saved selection CFI, just like other annotations. Matching
  // chapter text would also mark unrelated occurrences and longer compound words.
  return highlights.filter((item) => view.resolveNavigation(item.cfi)?.index === sectionIndex);
}
