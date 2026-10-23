import type { ReaderPreferences } from '../../../contracts/reading';
import type { LearningState, LearningStoreSet } from '../learningState';

const READER_STYLE_KEYS = new Set<keyof ReaderPreferences>([
  'fontSize',
  'lineHeight',
  'theme',
  'fontFamily',
  'customStyle',
  'paragraphStyle',
]);

const READER_LAYOUT_KEYS = new Set<keyof ReaderPreferences>([
  'tocWidth',
  'panelWidth',
  'tocCollapsed',
]);

type PreferenceActions = Pick<
  LearningState,
  | 'addOpenAIConfig'
  | 'updateOpenAIConfig'
  | 'deleteOpenAIConfig'
  | 'setWebSearchConfig'
  | 'setAiPreferences'
  | 'setNavCollapsed'
  | 'setThemeMode'
  | 'setReaderPreferences'
>;

function changedPreferenceKeys<Preferences extends object>(
  current: Preferences,
  changes: Partial<Preferences>,
) {
  return (Object.keys(changes) as Array<keyof Preferences>).filter(
    (key) =>
      !Object.is(current[key], changes[key]) &&
      JSON.stringify(current[key]) !== JSON.stringify(changes[key]),
  );
}

export function createPreferenceActions(set: LearningStoreSet): PreferenceActions {
  return {
    addOpenAIConfig: (config) =>
      set((state) => ({
        openAIConfigs: [config, ...state.openAIConfigs.filter((item) => item.id !== config.id)],
      })),
    updateOpenAIConfig: (configId, changes) =>
      set((state) => ({
        openAIConfigs: state.openAIConfigs.map((config) =>
          config.id === configId ? { ...config, ...changes, updatedAt: Date.now() } : config,
        ),
      })),
    deleteOpenAIConfig: (configId) =>
      set((state) => {
        const provider = `api:${configId}` as const;
        return {
          openAIConfigs: state.openAIConfigs.filter((config) => config.id !== configId),
          aiPreferences:
            state.aiPreferences.provider === provider
              ? { ...state.aiPreferences, provider: null, model: '' }
              : state.aiPreferences,
        };
      }),
    setWebSearchConfig: (changes) =>
      set((state) =>
        changedPreferenceKeys(state.webSearchConfig, changes).length
          ? { webSearchConfig: { ...state.webSearchConfig, ...changes } }
          : state,
      ),
    setAiPreferences: (changes) =>
      set((state) =>
        changedPreferenceKeys(state.aiPreferences, changes).length
          ? { aiPreferences: { ...state.aiPreferences, ...changes } }
          : state,
      ),
    setNavCollapsed: (navCollapsed) => set({ navCollapsed }),
    setThemeMode: (themeMode) => set({ themeMode }),
    setReaderPreferences: (changes) =>
      set((state) => {
        const changedKeys = changedPreferenceKeys(state.readerPreferences, changes);
        if (!changedKeys.length) return state;
        const updatedAt = Date.now();
        const styleChanged = changedKeys.some((key) => READER_STYLE_KEYS.has(key));
        const layoutChanged = changedKeys.some((key) => READER_LAYOUT_KEYS.has(key));
        return {
          readerPreferences: { ...state.readerPreferences, ...changes },
          readerPreferencesUpdatedAt: updatedAt,
          readerStyleUpdatedAt: styleChanged ? updatedAt : state.readerStyleUpdatedAt,
          readerLayoutUpdatedAt: layoutChanged ? updatedAt : state.readerLayoutUpdatedAt,
        };
      }),
  };
}
