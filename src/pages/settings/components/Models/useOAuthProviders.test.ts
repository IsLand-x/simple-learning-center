import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOAuthProviders } from './useOAuthProviders';

const mocks = vi.hoisted(() => ({ getState: vi.fn(), getProviders: vi.fn() }));
vi.mock('../../../../store/useLearningStore', () => ({
  useLearningStore: { getState: mocks.getState },
}));
vi.mock('../../../../api/settings', () => ({
  settingsApi: { getOAuthProviders: mocks.getProviders },
}));

let root: Root | undefined;
let container: HTMLDivElement | undefined;
let providers: ReturnType<typeof useOAuthProviders>['providers'];
function Probe() {
  providers = useOAuthProviders().providers;
  return null;
}
async function mount() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(createElement(Probe)));
}
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
});
beforeEach(() => vi.clearAllMocks());

describe('OAuth model catalog synchronization', () => {
  function fixture(model = 'gpt-6-astra', connected = true) {
    const config = {
      id: 'oauth-openai-codex',
      oauthProvider: 'openai-codex',
      models: ['gpt-6-astra'],
    };
    const store = {
      openAIConfigs: [config],
      aiPreferences: { provider: `api:${config.id}`, model },
      updateOpenAIConfig: vi.fn(),
      setAiPreferences: vi.fn(),
      addOpenAIConfig: vi.fn(),
    };
    mocks.getState.mockReturnValue(store);
    mocks.getProviders.mockResolvedValue([
      { id: 'openai-codex', connected, models: ['gpt-6-astra', 'gpt-6.1-sol'], login: null },
    ]);
    return store;
  }

  it('updates an existing account without adding a duplicate or changing a valid selection', async () => {
    const store = fixture();
    await mount();
    expect(store.updateOpenAIConfig).toHaveBeenCalledWith('oauth-openai-codex', {
      models: ['gpt-6-astra', 'gpt-6.1-sol'],
    });
    expect(store.addOpenAIConfig).not.toHaveBeenCalled();
    expect(store.setAiPreferences).not.toHaveBeenCalled();
  });

  it('recovers an obsolete selection using the current model', async () => {
    const store = fixture('gpt-5.4');
    await mount();
    expect(store.setAiPreferences).toHaveBeenCalledWith({ model: 'gpt-6.1-sol' });
  });

  it('preserves a disconnected account configuration', async () => {
    const store = fixture('gpt-5.4', false);
    await mount();
    expect(providers).toHaveLength(1);
    expect(store.updateOpenAIConfig).not.toHaveBeenCalled();
    expect(store.setAiPreferences).not.toHaveBeenCalled();
  });
});
