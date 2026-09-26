import { Suspense, type ReactNode } from 'react';
import { Spin } from '@douyinfe/semi-ui';
export function LoadingRoute({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="route-loading [min-height:360px] [place-items:center] [align-content:center] [gap:16px] w-full [background:var(--semi-color-bg-0)]">
          <Spin size="large" />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}
