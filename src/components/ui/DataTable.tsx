import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';

export interface ColumnDef<T> {
  key: string;
  header: string;
  align?: 'left' | 'right' | 'center';
  render: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  keyField: (row: T) => string | number;
  searchPlaceholder?: string;
  searchFilter?: (row: T, query: string) => boolean;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  pageSize?: number;
  toolbarExtra?: React.ReactNode;
  onRowClick?: (row: T) => void;
}

export function DataTable<T>({
  data,
  columns,
  keyField,
  searchPlaceholder = 'Search records...',
  searchFilter,
  loading = false,
  emptyTitle = 'No records found',
  emptyDescription = 'Add a new record or adjust your search filter.',
  emptyAction,
  pageSize = 10,
  toolbarExtra,
  onRowClick,
}: DataTableProps<T>) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !searchFilter) return data;
    return data.filter((row) => searchFilter(row, q));
  }, [data, query, searchFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {(searchFilter || toolbarExtra) && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 bg-[#FAFBFD]">
          {searchFilter ? (
            <div className="relative max-w-xs w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder={searchPlaceholder}
                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#376FA6]/25 focus:border-[#376FA6]"
              />
            </div>
          ) : (
            <div />
          )}
          {toolbarExtra && <div className="flex items-center gap-2 flex-wrap">{toolbarExtra}</div>}
        </div>
      )}

      {loading ? (
        <div className="p-4 space-y-2.5">
          {[...Array(5)].map((_, idx) => (
            <div key={idx} className="h-10 bg-slate-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : pageRows.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <p className="text-sm font-semibold text-slate-800">{emptyTitle}</p>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">{emptyDescription}</p>
          {emptyAction && <div className="mt-4">{emptyAction}</div>}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-[#F1F4F8]/70">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`px-4 py-2.5 text-xs font-semibold text-[#243B64] whitespace-nowrap ${
                      col.align === 'right'
                        ? 'text-right'
                        : col.align === 'center'
                        ? 'text-center'
                        : 'text-left'
                    }`}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {pageRows.map((row) => (
                <tr
                  key={keyField(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`transition-colors ${
                    onRowClick ? 'cursor-pointer hover:bg-[#EAF3FA]/50' : 'hover:bg-slate-50/70'
                  }`}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-2.5 text-slate-700 align-middle ${
                        col.align === 'right'
                          ? 'text-right tabular-nums'
                          : col.align === 'center'
                          ? 'text-center'
                          : 'text-left'
                      }`}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-[#FAFBFD] text-xs text-slate-600 tabular-nums">
          <span>
            Showing {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filtered.length)} of{' '}
            {filtered.length} entries
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 font-medium">
              Page {safePage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
              aria-label="Next page"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
