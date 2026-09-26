import { createContext, useContext } from 'react';
import type { WorkspaceContextValue } from './workspaceTypes';
export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);
export function useWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('RSS workspace must be mounted inside RssPage');
  return value;
}
