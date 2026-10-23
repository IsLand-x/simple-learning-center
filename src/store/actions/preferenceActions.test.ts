import { expect, it, vi } from 'vitest';
import { useLearningStore } from '../useLearningStore';
import { createPreferenceActions } from './preferenceActions';

function store() {
  let state = useLearningStore.getInitialState();
  const actions = createPreferenceActions((update) => {
    const next = typeof update === 'function' ? update(state) : update;
    if (next !== state) state = { ...state, ...next };
  });
  return { get: () => state, actions };
}

it('does not change timestamps or notify readers for identical preferences', () => {
  const { get, actions } = store();
  const initial = get();
  actions.setReaderPreferences({
    panelWidth: initial.readerPreferences.panelWidth,
    customStyle: { ...initial.readerPreferences.customStyle },
  });
  actions.setAiPreferences({ ...initial.aiPreferences, hiddenPromptTemplateIds: [] });
  actions.setWebSearchConfig({ ...initial.webSearchConfig });
  expect(get()).toBe(initial);
});

it('updates only the timestamp for preferences that actually changed', () => {
  const { get, actions } = store();
  const clock = vi.spyOn(Date, 'now').mockReturnValue(100);
  actions.setReaderPreferences({ fontSize: get().readerPreferences.fontSize + 1 });
  clock.mockReturnValue(200);
  actions.setReaderPreferences({
    fontSize: get().readerPreferences.fontSize,
    panelWidth: get().readerPreferences.panelWidth + 20,
  });
  expect(get().readerStyleUpdatedAt).toBe(100);
  expect(get().readerLayoutUpdatedAt).toBe(200);
  expect(get().readerPreferencesUpdatedAt).toBe(200);
  actions.setAiPreferences({ model: 'changed-model' });
  expect(get().aiPreferences.model).toBe('changed-model');
});
