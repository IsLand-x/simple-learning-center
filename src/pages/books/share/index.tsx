import { DoubanBookSection } from './components/DoubanBookSection';
import { useEffect, useState, lazy, Suspense } from 'react';
import { Button, Empty, Spin, Toast, Typography } from '@douyinfe/semi-ui';
import { bookSharesApi } from '../../../api/book-shares';
import type { SharedBook } from '../../../api/book-shares/type';

const Preview = lazy(() =>
  import('./components/SharedBookPreview').then((module) => ({
    default: module.SharedBookPreview,
  })),
);

export function BookSharePage({ token }: { token: string }) {
  const [book, setBook] = useState<SharedBook | null>(null);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(window.location.hash === '#preview');
  const [coverFailed, setCoverFailed] = useState(false);
  useEffect(() => {
    let disposed = false;
    void bookSharesApi
      .get(token)
      .then((result) => {
        if (!disposed) setBook(result);
      })
      .catch((failure: unknown) => {
        if (!disposed) setError(failure instanceof Error ? failure.message : '分享加载失败');
      });
    const update = () => setPreview(window.location.hash === '#preview');
    window.addEventListener('hashchange', update);
    window.addEventListener('popstate', update);
    return () => {
      disposed = true;
      window.removeEventListener('hashchange', update);
      window.removeEventListener('popstate', update);
    };
  }, [token]);
  if (error)
    return (
      <div role="alert" className="flex h-dvh items-center justify-center p-6">
        <Empty title="无法打开分享" description={error} />
      </div>
    );
  if (!book)
    return (
      <div className="flex h-dvh items-center justify-center">
        <Spin tip="正在加载分享" />
      </div>
    );
  if (preview)
    return (
      <Suspense fallback={<Spin tip="正在加载阅读器" />}>
        <Preview
          token={token}
          onClose={() => {
            if (window.history.state?.bookSharePreview) window.history.back();
            else {
              window.history.replaceState(null, '', window.location.pathname);
              setPreview(false);
            }
          }}
        />
      </Suspense>
    );
  return (
    <main className="book-share-page h-dvh overflow-auto [background:var(--semi-color-bg-0)] [color:var(--semi-color-text-0)] [padding:24px_28px] mobile:[padding:20px_16px_calc(20px+env(safe-area-inset-bottom))]">
      <div className="mx-auto flex max-w-lg flex-col items-center gap-5 py-8">
        <Typography.Text type="secondary">朋友送给你了这本书，快来看看吧</Typography.Text>
        <div className="flex aspect-[3/4] w-44 items-center justify-center overflow-hidden [border-radius:4px_8px_8px_4px] [background:var(--semi-color-bg-1)]">
          {coverFailed ? (
            <Typography.Text type="tertiary">暂无封面</Typography.Text>
          ) : (
            <img
              className="h-full w-full object-cover"
              src={bookSharesApi.coverUrl(token)}
              alt={`${book.title}封面`}
              onError={() => setCoverFailed(true)}
            />
          )}
        </div>
        <Typography.Title heading={4} className="max-w-full break-words text-center">
          {book.title}
        </Typography.Title>
        <Typography.Text type="secondary" className="max-w-full break-words">
          {book.author}
        </Typography.Text>
        <div className="flex flex-wrap justify-center gap-3">
          <Button
            theme="solid"
            onClick={() => {
              window.history.pushState({ bookSharePreview: true }, '', '#preview');
              setPreview(true);
            }}
          >
            预览书籍
          </Button>
          <Button onClick={() => window.location.assign(bookSharesApi.epubUrl(token))}>
            下载 EPUB
          </Button>
          <Button
            theme="borderless"
            onClick={() => {
              void navigator.clipboard
                .writeText(window.location.href.split('#')[0])
                .then(() => Toast.success('分享链接已复制'))
                .catch(() => Toast.error('复制失败，请复制浏览器地址'));
            }}
          >
            复制链接
          </Button>
        </div>
        <Typography.Text type="tertiary">无需登录即可阅读和下载</Typography.Text>
        <DoubanBookSection token={token} title={book.title} />
      </div>
    </main>
  );
}
