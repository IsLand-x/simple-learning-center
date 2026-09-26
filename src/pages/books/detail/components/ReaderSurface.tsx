import { forwardRef } from 'react';
import { FoliateEpubReader } from './FoliateEpubReader';
import { DemoReader } from './DemoReader';
import type { ReaderSurfaceHandle, ReaderSurfaceProps } from '../store/model/readerSurfaceTypes';
export type {
  ReaderLocationUpdate,
  ReaderSurfaceHandle,
  ReaderSurfaceProps,
} from '../store/model/readerSurfaceTypes';

export const ReaderSurface = forwardRef<ReaderSurfaceHandle, ReaderSurfaceProps>(
  function ReaderSurface(props, ref) {
    if (props.book.kind === 'demo') {
      return <DemoReader {...props} controllerRef={ref} />;
    }
    return <FoliateEpubReader {...props} controllerRef={ref} />;
  },
);
