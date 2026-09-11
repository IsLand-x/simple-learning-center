import type { DeletedHighlightTombstone, HighlightItem, ReaderPreferences } from '../../types';
import { defaultReaderPreferences } from '../defaults';

export type PersistedReaderState = {
  highlights?: HighlightItem[];
  deletedHighlightTombstones?: DeletedHighlightTombstone[];
  readerPreferences?: ReaderPreferences;
  readerPreferencesUpdatedAt?: number;
  readerStyleUpdatedAt?: number;
  readerLayoutUpdatedAt?: number;
};

function readerStateTimestamp(
  state: PersistedReaderState,
  key: 'readerStyleUpdatedAt' | 'readerLayoutUpdatedAt',
) {
  const timestamp = state[key];
  if (typeof timestamp === 'number' && Number.isFinite(timestamp)) return timestamp;
  return typeof state.readerPreferencesUpdatedAt === 'number' &&
    Number.isFinite(state.readerPreferencesUpdatedAt)
    ? state.readerPreferencesUpdatedAt
    : 0;
}

function highlightUpdatedAt(highlight: HighlightItem) {
  return highlight.updatedAt ?? highlight.commentUpdatedAt ?? highlight.createdAt;
}

export function mergeReaderHighlights(
  persisted: PersistedReaderState,
  current: PersistedReaderState,
) {
  const highlights = new Map<string, HighlightItem>();
  (current.highlights ?? []).forEach((highlight) => highlights.set(highlight.id, highlight));
  (persisted.highlights ?? []).forEach((highlight) => {
    const existing = highlights.get(highlight.id);
    if (!existing || highlightUpdatedAt(highlight) >= highlightUpdatedAt(existing)) {
      highlights.set(highlight.id, highlight);
    }
  });

  const tombstones = new Map<string, DeletedHighlightTombstone>();
  (current.deletedHighlightTombstones ?? []).forEach((tombstone) => {
    tombstones.set(tombstone.highlightId, tombstone);
  });
  (persisted.deletedHighlightTombstones ?? []).forEach((tombstone) => {
    const existing = tombstones.get(tombstone.highlightId);
    if (!existing || tombstone.deletedAt >= existing.deletedAt) {
      tombstones.set(tombstone.highlightId, tombstone);
    }
  });

  return {
    deletedHighlightTombstones: [...tombstones.values()],
    highlights: [...highlights.values()]
      .filter(
        (highlight) =>
          (tombstones.get(highlight.id)?.deletedAt ?? 0) < highlightUpdatedAt(highlight),
      )
      .map((highlight) => ({ ...highlight, updatedAt: highlightUpdatedAt(highlight) })),
  };
}

export function mergeReaderPreferences(
  persisted: PersistedReaderState,
  current: PersistedReaderState,
) {
  const persistedPreferences = persisted.readerPreferences ?? defaultReaderPreferences;
  const currentPreferences = current.readerPreferences ?? defaultReaderPreferences;
  const persistedStyleUpdatedAt = readerStateTimestamp(persisted, 'readerStyleUpdatedAt');
  const currentStyleUpdatedAt = readerStateTimestamp(current, 'readerStyleUpdatedAt');
  const persistedLayoutUpdatedAt = readerStateTimestamp(persisted, 'readerLayoutUpdatedAt');
  const currentLayoutUpdatedAt = readerStateTimestamp(current, 'readerLayoutUpdatedAt');
  const styleSource =
    persistedStyleUpdatedAt >= currentStyleUpdatedAt ? persistedPreferences : currentPreferences;
  const layoutSource =
    persistedLayoutUpdatedAt >= currentLayoutUpdatedAt ? persistedPreferences : currentPreferences;

  return {
    readerPreferences: {
      ...currentPreferences,
      ...persistedPreferences,
      fontSize: styleSource.fontSize,
      lineHeight: styleSource.lineHeight,
      theme: styleSource.theme,
      fontFamily: styleSource.fontFamily,
      customStyle: styleSource.customStyle,
      tocWidth: layoutSource.tocWidth,
      panelWidth: layoutSource.panelWidth,
      tocCollapsed: layoutSource.tocCollapsed,
    },
    readerStyleUpdatedAt: Math.max(persistedStyleUpdatedAt, currentStyleUpdatedAt),
    readerLayoutUpdatedAt: Math.max(persistedLayoutUpdatedAt, currentLayoutUpdatedAt),
    readerPreferencesUpdatedAt: Math.max(
      persistedStyleUpdatedAt,
      currentStyleUpdatedAt,
      persistedLayoutUpdatedAt,
      currentLayoutUpdatedAt,
    ),
  };
}
