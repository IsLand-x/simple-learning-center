import { useEffect, useRef, useState, type CSSProperties, type Ref } from 'react';
import { IconComment } from '@douyinfe/semi-icons';
import { Empty, Spin, Typography } from '@douyinfe/semi-ui';
import type { View as FoliateView } from 'foliate-js/view.js';
import { MobileSelectionHandles } from '../features/reader/foliate/MobileSelectionHandles';
import type {
  MobileSelectionController,
  MobileSelectionHandlesState,
  MobileSelectionPointerDrag,
} from '../features/reader/foliate/runtimeTypes';
import { useFoliateAnnotationSync } from '../features/reader/foliate/useFoliateAnnotationSync';
import { useFoliateReaderController } from '../features/reader/foliate/useFoliateReaderController';
import {
  useFoliateReaderLifecycle,
  type FoliateReaderStatus,
} from '../features/reader/foliate/useFoliateReaderLifecycle';
import { useFoliatePresentationSync } from '../features/reader/foliate/useFoliatePresentationSync';
import { getReaderTextureStyle, resolveReaderStyle } from '../lib/readerThemes';
import type { ReaderSurfaceHandle, ReaderSurfaceProps } from './ReaderSurface';

const { Text } = Typography;

export function FoliateEpubReader({
  book,
  compactLayout,
  preferences,
  highlights,
  onLocationChange,
  onSelection,
  onHighlightClick,
  onContentInteraction,
  onCenterTap,
  controllerRef,
}: ReaderSurfaceProps & { controllerRef: Ref<ReaderSurfaceHandle> }) {
  const readerStyle = resolveReaderStyle(preferences);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<FoliateView | null>(null);
  const navigationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const commentIconTemplateRef = useRef<HTMLSpanElement>(null);
  const appliedAnnotationsRef = useRef<Map<string, string>>(new Map());
  const highlightsRef = useRef(highlights);
  const compactLayoutRef = useRef(compactLayout);
  const preferencesRef = useRef(preferences);
  const onLocationRef = useRef(onLocationChange);
  const onSelectionRef = useRef(onSelection);
  const onHighlightClickRef = useRef(onHighlightClick);
  const onContentInteractionRef = useRef(onContentInteraction);
  const onCenterTapRef = useRef(onCenterTap);
  const touchPagingSelectionLockedRef = useRef(false);
  const hasCustomMobileSelectionRef = useRef(false);
  const clearMobileSelectionRef = useRef<() => void>(() => undefined);
  const mobileSelectionControllerRef = useRef<MobileSelectionController | null>(null);
  const mobileSelectionPointerDragRef = useRef<MobileSelectionPointerDrag | null>(null);
  const [status, setStatus] = useState<FoliateReaderStatus>('loading');
  const [errorMessage, setErrorMessage] = useState('请返回书架后重新导入这个 EPUB');
  const [mobileSelectionHandles, setMobileSelectionHandles] =
    useState<MobileSelectionHandlesState | null>(null);

  useEffect(() => {
    highlightsRef.current = highlights;
  }, [highlights]);
  useEffect(() => {
    compactLayoutRef.current = compactLayout;
  }, [compactLayout]);
  useEffect(() => {
    preferencesRef.current = preferences;
  }, [preferences]);
  useEffect(() => {
    onLocationRef.current = onLocationChange;
  }, [onLocationChange]);
  useEffect(() => {
    onSelectionRef.current = onSelection;
  }, [onSelection]);
  useEffect(() => {
    onHighlightClickRef.current = onHighlightClick;
  }, [onHighlightClick]);
  useEffect(() => {
    onContentInteractionRef.current = onContentInteraction;
  }, [onContentInteraction]);
  useEffect(() => {
    onCenterTapRef.current = onCenterTap;
  }, [onCenterTap]);

  useEffect(() => {
    const refreshMobileSelectionHandles = () => mobileSelectionControllerRef.current?.refresh();
    window.addEventListener('resize', refreshMobileSelectionHandles);
    return () => window.removeEventListener('resize', refreshMobileSelectionHandles);
  }, []);

  const syncVisibleAnnotations = useFoliateAnnotationSync({
    appliedAnnotationsRef,
    highlightsRef,
    preferencesRef,
  });

  const turnPage = useFoliateReaderController({
    controllerRef,
    viewRef,
    navigationQueueRef,
    clearMobileSelectionRef,
    touchPagingSelectionLockedRef,
    onSelectionRef,
    setErrorMessage,
  });

  useFoliateReaderLifecycle({
    book,
    surfaceRef,
    hostRef,
    viewRef,
    navigationQueueRef,
    commentIconTemplateRef,
    appliedAnnotationsRef,
    highlightsRef,
    compactLayoutRef,
    preferencesRef,
    onLocationRef,
    onSelectionRef,
    onHighlightClickRef,
    onContentInteractionRef,
    onCenterTapRef,
    touchPagingSelectionLockedRef,
    hasCustomMobileSelectionRef,
    clearMobileSelectionRef,
    mobileSelectionControllerRef,
    mobileSelectionPointerDragRef,
    setStatus,
    setErrorMessage,
    setMobileSelectionHandles,
    syncVisibleAnnotations,
    turnPage,
  });

  useFoliatePresentationSync({
    compactLayout,
    preferences,
    highlights,
    status,
    viewRef,
    preferencesRef,
    compactLayoutRef,
    appliedAnnotationsRef,
    mobileSelectionControllerRef,
    syncVisibleAnnotations,
  });

  const texture = getReaderTextureStyle(readerStyle.texture, readerStyle.isDark);
  const surfaceStyle = {
    '--reader-paper-color': readerStyle.paperColor,
    '--reader-color-scheme': readerStyle.isDark ? 'dark' : 'light',
    '--reader-highlight-color': readerStyle.highlightColor,
    '--reader-highlight-icon-color': readerStyle.textColor,
    '--reader-texture-image': texture.backgroundImage,
    '--reader-texture-size': texture.backgroundSize,
    '--reader-texture-position': texture.backgroundPosition,
    '--reader-texture-blend-mode': texture.backgroundBlendMode,
  } as CSSProperties;

  return (
    <div
      ref={surfaceRef}
      className="foliate-reader-wrap"
      style={surfaceStyle}
      onPointerDown={onContentInteraction}
    >
      <span
        ref={commentIconTemplateRef}
        className="reader-comment-icon-template"
        aria-hidden="true"
      >
        <IconComment size="large" />
      </span>
      {status === 'loading' && (
        <div className="reader-status">
          <Spin size="large" />
          <Text type="tertiary">正在打开 EPUB…</Text>
        </div>
      )}
      {status === 'error' && (
        <div className="reader-status">
          <Empty title="无法打开这本书" description={errorMessage} />
        </div>
      )}
      <div ref={hostRef} className="foliate-reader-host" />
      {mobileSelectionHandles && (
        <MobileSelectionHandles
          handles={mobileSelectionHandles}
          controllerRef={mobileSelectionControllerRef}
          pointerDragRef={mobileSelectionPointerDragRef}
        />
      )}
    </div>
  );
}
