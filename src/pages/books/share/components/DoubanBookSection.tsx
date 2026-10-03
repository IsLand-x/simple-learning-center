import { useEffect, useState } from 'react';
import { Typography } from '@douyinfe/semi-ui';
import type { DoubanBookInfo } from '../../../../../contracts/books';
import { bookSharesApi } from '../../../../api/book-shares';

const linkClass =
  'inline-flex min-h-11 items-center [color:var(--semi-color-primary)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:[outline-color:var(--semi-color-focus-border)]';

export function DoubanBookSection({ token, title }: { token: string; title: string }) {
  const [info, setInfo] = useState<DoubanBookInfo | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void bookSharesApi
      .getDouban(token, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setInfo(result);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setInfo({
            status: 'unavailable',
            searchUrl: `https://search.douban.com/book/subject_search?search_text=${encodeURIComponent(title)}&cat=1001`,
          });
      });
    return () => controller.abort();
  }, [token, title]);

  return (
    <section
      aria-label="豆瓣书籍信息"
      className="w-full min-w-0 min-h-40 border-t [border-color:var(--semi-color-border)] pt-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Typography.Title heading={5}>豆瓣读书</Typography.Title>
        {info?.status === 'matched' && info.rating !== null && (
          <Typography.Text type="secondary">豆瓣评分 {info.rating.toFixed(1)}</Typography.Text>
        )}
      </div>
      {!info ? (
        <Typography.Text type="tertiary">正在查找豆瓣信息…</Typography.Text>
      ) : info.status === 'matched' ? (
        <>
          {info.description ? (
            <p className="my-3 whitespace-pre-wrap break-words text-sm leading-relaxed [color:var(--semi-color-text-1)]">
              {info.description}
              {info.description.length >= 320 ? '…' : ''}
            </p>
          ) : (
            <Typography.Text type="tertiary">豆瓣暂未提供内容简介</Typography.Text>
          )}
          {info.reviews.length > 0 && (
            <div className="mt-4 min-w-0">
              <Typography.Text strong>精选书评</Typography.Text>
              <ul className="mt-2 flex min-w-0 flex-col gap-1">
                {info.reviews.map((review) => (
                  <li key={review.url} className="min-w-0">
                    <a
                      className={`${linkClass} max-w-full break-words text-sm`}
                      href={review.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {review.title}
                    </a>
                    {review.author && (
                      <div className="text-xs [color:var(--semi-color-text-2)]">
                        {review.author}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-x-5 text-sm">
            <a className={linkClass} href={info.url} target="_blank" rel="noopener noreferrer">
              豆瓣详情与完整简介
            </a>
            <a
              className={linkClass}
              href={info.reviewsUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              查看全部书评
            </a>
          </div>
        </>
      ) : (
        <>
          <Typography.Text type="tertiary">
            {info.status === 'not_found'
              ? '暂无与书名、作者匹配的豆瓣信息'
              : '豆瓣信息暂时无法获取'}
          </Typography.Text>
          <div>
            <a
              className={`${linkClass} text-sm`}
              href={info.searchUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              去豆瓣搜索这本书
            </a>
          </div>
        </>
      )}
    </section>
  );
}
