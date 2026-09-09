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
    <div className="overflow-hidden rounded-2xl border border-white/10">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-sm">
          <thead className="bg-white/5 text-left text-xs uppercase tracking-[0.18em] text-slate-400">
            <tr>
              {columns.map((column, index) => (
                <th key={column} className={cn("px-4 py-3 font-semibold", index === 0 && "sticky left-0 bg-slate-900/95")}> 
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {rows.length ? (
              rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="transition hover:bg-white/[0.03]">
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className={cn("px-4 py-3 text-slate-200", cellIndex === 0 && "sticky left-0 bg-slate-950/95 font-medium text-white")}> 
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
