import { useLocation, useNavigate } from 'react-router-dom';
import { useWorkspace } from '../store/WorkspaceContext';
import { rssProbeObservers } from './probes';

export function WorkspaceProbe() {
  const workspace = useWorkspace();
  const navigate = useNavigate();
  const { search } = useLocation();
  rssProbeObservers.workspace(workspace, navigate, search);
  return <output>{workspace.navigation.mobileLayout ? 'mobile' : 'desktop'}</output>;
}
