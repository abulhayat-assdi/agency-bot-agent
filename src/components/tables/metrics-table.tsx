import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function MetricsTable({
  columns,
  rows,
  emptyMessage = "No rows available."
}: {
  columns: string[];
  rows: Array<Array<ReactNode>>;
  emptyMessage?: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/80 dark:border-white/10">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-sm">
          <thead className="bg-muted/80 text-left text-xs uppercase tracking-[0.16em] text-muted-foreground dark:bg-white/5">
            <tr>
              {columns.map((column, index) => (
                <th key={column} className={cn("px-4 py-3 font-semibold", index === 0 && "sticky left-0 bg-muted dark:bg-slate-900/95")}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/80 dark:divide-white/10">
            {rows.length ? (
              rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="transition hover:bg-primary/[0.04] dark:hover:bg-white/[0.03]">
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className={cn("px-4 py-3 text-foreground", cellIndex === 0 && "sticky left-0 bg-card font-medium dark:bg-slate-950/95")}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
