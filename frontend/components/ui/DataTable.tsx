"use client";

import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  type ExpandedState,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ChevronDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Fragment, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/format";

/**
 * Analytical table. Column `meta` options:
 *   align: "right"          numeric alignment
 *   pin: true               sticky on the left while scrolling horizontally
 *   filter: "select"        adds a value filter for categorical columns to the toolbar
 *   label: string           name used by the filter control
 * Large tables pass `virtual` (rows are windowed) instead of paginating.
 */
export function DataTable<T>({
  data,
  columns,
  pageSize = 25,
  searchable,
  dense = true,
  onRowClick,
  initialSort,
  className,
  virtual,
  height = 520,
  renderExpanded,
  toolbar,
  minWidth = 640,
  rowClassName,
}: {
  data: T[];
  columns: ColumnDef<T, any>[];
  pageSize?: number;
  searchable?: boolean;
  dense?: boolean;
  onRowClick?: (row: T) => void;
  initialSort?: SortingState;
  className?: string;
  virtual?: boolean;
  height?: number | string;
  renderExpanded?: (row: T) => React.ReactNode;
  toolbar?: React.ReactNode;
  minWidth?: number;
  rowClassName?: (row: T) => string | undefined;
}) {
  const [sorting, setSorting] = useState<SortingState>(initialSort ?? []);
  const [filter, setFilter] = useState("");
  const [colFilters, setColFilters] = useState<ColumnFiltersState>([]);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const pinned = useMemo(() => columns.filter((c: any) => c.meta?.pin).map((c: any) => (c.id ?? c.accessorKey) as string), [columns]);

  const cols = useMemo<ColumnDef<T, any>[]>(() => {
    if (!renderExpanded) return columns;
    return [
      {
        id: "__expand",
        header: "",
        enableSorting: false,
        size: 28,
        meta: { pin: true },
        cell: ({ row }) => (
          <button
            aria-label={row.getIsExpanded() ? "Collapse row" : "Expand row"}
            onClick={(e) => {
              e.stopPropagation();
              row.toggleExpanded();
            }}
            className="-ml-1 p-0.5 text-subtle hover:text-fg"
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !row.getIsExpanded() && "-rotate-90")} />
          </button>
        ),
      },
      ...columns,
    ];
  }, [columns, renderExpanded]);

  const table = useReactTable({
    data,
    columns: cols,
    state: { sorting, globalFilter: filter, columnFilters: colFilters, expanded, columnPinning: { left: renderExpanded ? ["__expand", ...pinned] : pinned } },
    onSortingChange: setSorting,
    onGlobalFilterChange: setFilter,
    onColumnFiltersChange: setColFilters,
    onExpandedChange: setExpanded,
    getRowCanExpand: () => !!renderExpanded,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getExpandedRowModel: getExpandedRowModel(),
    ...(virtual ? {} : { getPaginationRowModel: getPaginationRowModel() }),
    initialState: { pagination: { pageSize } },
  });

  const rows = table.getRowModel().rows;
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowH = dense ? 32 : 40;
  const virt = useVirtualizer({ count: virtual ? rows.length : 0, getScrollElement: () => scrollRef.current, estimateSize: () => rowH, overscan: 12 });
  const items = virtual ? virt.getVirtualItems() : [];
  const padTop = virtual && items.length ? items[0].start : 0;
  const padBottom = virtual && items.length ? virt.getTotalSize() - items[items.length - 1].end : 0;
  const shown = virtual ? items.map((i) => rows[i.index]) : rows;
  const filterCols = table.getAllLeafColumns().filter((c) => (c.columnDef.meta as any)?.filter === "select");
  const pages = table.getPageCount();
  const nCols = table.getVisibleLeafColumns().length;

  const pinStyle = (col: Column<T, unknown>, head = false): React.CSSProperties | undefined =>
    col.getIsPinned() ? { position: "sticky", left: col.getStart("left"), zIndex: head ? 3 : 1 } : undefined;

  return (
    <div className={cn("w-full min-w-0", className)}>
      {(searchable || filterCols.length > 0 || toolbar) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-hair px-3 py-1.5">
          {searchable && (
            <label className="flex min-w-[160px] flex-1 items-center gap-2">
              <Search className="h-3.5 w-3.5 text-subtle" aria-hidden />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search rows"
                aria-label="Search rows"
                className="h-7 w-full bg-transparent text-sm text-fg placeholder:text-subtle focus:outline-none"
              />
            </label>
          )}
          {filterCols.map((c) => {
            const values = Array.from(c.getFacetedUniqueValues().keys()).filter((v) => v != null && v !== "").sort();
            const label = (c.columnDef.meta as any)?.label ?? c.id;
            return (
              <select
                key={c.id}
                aria-label={`Filter by ${label}`}
                value={(c.getFilterValue() as string) ?? ""}
                onChange={(e) => c.setFilterValue(e.target.value || undefined)}
                className="h-7 rounded border border-hair bg-surface px-1.5 text-xs text-fg-2"
              >
                <option value="">All {label}</option>
                {values.slice(0, 200).map((v) => (
                  <option key={String(v)} value={String(v)}>
                    {String(v)}
                  </option>
                ))}
              </select>
            );
          })}
          {toolbar}
          <span className="num ml-auto text-2xs text-subtle">{table.getFilteredRowModel().rows.length.toLocaleString()} rows</span>
        </div>
      )}
      <div ref={scrollRef} className="overflow-auto" style={virtual ? { maxHeight: height } : undefined}>
        <table className="dt w-full border-separate border-spacing-0" style={{ minWidth }}>
          <thead className={cn(virtual && "sticky top-0 z-[2]")}>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const sort = h.column.getIsSorted();
                  const right = (h.column.columnDef.meta as any)?.align === "right";
                  return (
                    <th
                      key={h.id}
                      style={pinStyle(h.column, true)}
                      aria-sort={sort === "asc" ? "ascending" : sort === "desc" ? "descending" : undefined}
                      className={cn(right && "text-right", h.column.getIsPinned() && "border-r border-hair")}
                    >
                      {h.column.getCanSort() ? (
                        <button onClick={h.column.getToggleSortingHandler()} className={cn("inline-flex items-center gap-1 uppercase hover:text-fg", sort && "text-fg", right && "flex-row-reverse")}>
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {sort === "asc" ? <ArrowUp className="h-3 w-3" /> : sort === "desc" ? <ArrowDown className="h-3 w-3" /> : null}
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {padTop > 0 && (
              <tr aria-hidden>
                <td colSpan={nCols} style={{ height: padTop, padding: 0, border: 0 }} />
              </tr>
            )}
            {shown.map((r) => (
              <Fragment key={r.id}>
                <tr onClick={onRowClick ? () => onRowClick(r.original) : undefined} className={cn(onRowClick && "cursor-pointer", rowClassName?.(r.original))}>
                  {r.getVisibleCells().map((c) => (
                    <td
                      key={c.id}
                      style={pinStyle(c.column)}
                      className={cn(
                        "text-fg-2",
                        !dense && "h-10",
                        (c.column.columnDef.meta as any)?.align === "right" && "num text-right",
                        c.column.getIsPinned() && "border-r border-hair bg-surface",
                      )}
                    >
                      {flexRender(c.column.columnDef.cell, c.getContext())}
                    </td>
                  ))}
                </tr>
                {r.getIsExpanded() && renderExpanded && (
                  <tr>
                    <td colSpan={nCols} className="!h-auto bg-raised/60 !p-0">
                      {renderExpanded(r.original)}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {padBottom > 0 && (
              <tr aria-hidden>
                <td colSpan={nCols} style={{ height: padBottom, padding: 0, border: 0 }} />
              </tr>
            )}
            {rows.length === 0 && (
              <tr>
                <td colSpan={nCols} className="!h-20 text-center text-xs text-subtle">
                  No rows match
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!virtual && pages > 1 && (
        <div className="flex items-center justify-between px-3 py-1.5 text-2xs text-subtle">
          <span className="num">
            {(table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1).toLocaleString()}–
            {Math.min((table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize, table.getFilteredRowModel().rows.length).toLocaleString()} of{" "}
            {table.getFilteredRowModel().rows.length.toLocaleString()}
          </span>
          <div className="flex items-center gap-1">
            <button aria-label="Previous page" className="p-1 hover:text-fg disabled:opacity-30" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="num">
              {table.getState().pagination.pageIndex + 1}/{pages}
            </span>
            <button aria-label="Next page" className="p-1 hover:text-fg disabled:opacity-30" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
