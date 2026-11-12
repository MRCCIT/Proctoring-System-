'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button } from './primitives';

export const DEFAULT_PAGE_SIZE = 10;
export const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

export function useClientPagination<T>(items: T[], initialPageSize: number = DEFAULT_PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  useEffect(() => {
    setPage(1);
  }, [items, pageSize]);

  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(page, pageCount);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize;
  const end = Math.min(start + pageSize, total);
  const pageItems = useMemo(() => items.slice(start, end), [items, start, end]);

  return {
    page: safePage,
    pageSize,
    setPageSize: (n: number) => {
      setPageSize(n);
      setPage(1);
    },
    setPage,
    pageCount,
    total,
    start,
    end,
    pageItems,
    hasPrev: safePage > 1,
    hasNext: safePage < pageCount,
    prev: () => setPage((p) => Math.max(1, p - 1)),
    next: () => setPage((p) => Math.min(pageCount, p + 1)),
  };
}

export function TablePagination(props: {
  page: number;
  pageSize: number;
  total: number;
  pageCount?: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: readonly number[];
  /** For cursor/load-more lists instead of numbered pages */
  mode?: 'pages' | 'chunk';
  hasMore?: boolean;
  onLoadMore?: () => void;
  loadingMore?: boolean;
  label?: ReactNode;
}) {
  const {
    page,
    pageSize,
    total,
    onPageChange,
    onPageSizeChange,
    pageSizeOptions = PAGE_SIZE_OPTIONS,
    mode = 'pages',
    hasMore,
    onLoadMore,
    loadingMore,
    label,
  } = props;

  const pageCount = props.pageCount ?? Math.max(1, Math.ceil(total / pageSize) || 1);
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  const shownStart = total === 0 ? 0 : mode === 'chunk' ? 1 : start;
  const shownEnd = total === 0 ? 0 : mode === 'chunk' ? total : end;

  return (
    <div className="ps-pagination" role="navigation" aria-label="Table pagination">
      <div className="ps-pagination-meta">
        {label ??
          (total === 0 ? 'No results' : `Showing ${shownStart}–${shownEnd} of ${total.toLocaleString()}`)}
      </div>
      <div className="ps-pagination-controls">
        {onPageSizeChange && (
          <label className="ps-pagination-size">
            <span>Rows per page</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              aria-label="Rows per page"
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
        {mode === 'pages' ? (
          <>
            <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
              Previous
            </Button>
            <span className="ps-pagination-page">
              Page {page} / {pageCount}
            </span>
            <Button
              size="sm"
              variant="secondary"
              disabled={page >= pageCount}
              onClick={() => onPageChange(page + 1)}
            >
              Next
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            disabled={!hasMore || loadingMore}
            loading={loadingMore}
            onClick={onLoadMore}
          >
            Load more
          </Button>
        )}
      </div>
    </div>
  );
}
