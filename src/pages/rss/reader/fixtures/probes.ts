import type { NavigateFunction } from 'react-router-dom';
import type { useAddSource } from '../components/SourcesPanel/useAddSource';
import type { WorkspaceContextValue } from '../store/workspaceTypes';

export const rssProbeObservers: {
  workspace: (value: WorkspaceContextValue, navigate: NavigateFunction, route: string) => void;
  draft: (value: ReturnType<typeof useAddSource>) => void;
} = {
  workspace: () => undefined,
  draft: () => undefined,
};
