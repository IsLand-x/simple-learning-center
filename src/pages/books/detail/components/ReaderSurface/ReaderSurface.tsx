import { forwardRef } from 'react';
import { DemoReader } from './demo/DemoReader';
import { FoliateEpubReader } from './foliate/FoliateEpubReader';
import type { ReaderSurfaceHandle, ReaderSurfaceProps } from './type';

export const ReaderSurface = forwardRef<ReaderSurfaceHandle, ReaderSurfaceProps>(
  function ReaderSurface(props, ref) {
    if (props.book.kind === 'demo') {
      return <DemoReader {...props} controllerRef={ref} />;
    }
    return <FoliateEpubReader {...props} controllerRef={ref} />;
  },
);
