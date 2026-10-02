import { useAddSource } from '../components/SourcesPanel/useAddSource';
import { rssProbeObservers } from './probes';

export function SubscriptionDraftProbe() {
  const draft = useAddSource();
  rssProbeObservers.draft(draft);
  return <output>{draft.feedTitle}</output>;
}
