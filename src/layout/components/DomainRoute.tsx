import type { ReactNode } from 'react';
import type { StateDomain } from '../../api/state/type';
import { LoadingRoute } from './LoadingRoute';
import { StateDomainGate } from './StateDomainGate';
export function DomainRoute({
  children,
  domains,
}: {
  children: ReactNode;
  domains: readonly StateDomain[];
}) {
  return (
    <LoadingRoute>
      <StateDomainGate domains={domains}>{children}</StateDomainGate>
    </LoadingRoute>
  );
}
