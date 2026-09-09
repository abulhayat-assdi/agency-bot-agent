"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { BreakdownResultRow } from "@/server/breakdowns";

export function BreakdownBarChart({ rows }: { rows: BreakdownResultRow[] }) {
  const data = rows.slice(0, 12).map((row) => ({
    label: row.label,
    spend: row.metrics.spend.value ?? 0,
    clicks: row.metrics.clicks.value ?? 0,
    conversions: row.metrics.conversions.value ?? 0
  }));

  return (
    <div className="h-96 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 80 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.16)" />
          <XAxis dataKey="label" angle={-35} textAnchor="end" interval={0} stroke="#94a3b8" tick={{ fontSize: 11 }} />
          <YAxis yAxisId="left" stroke="#38bdf8" tick={{ fontSize: 12 }} />
          <YAxis yAxisId="right" orientation="right" stroke="#34d399" tick={{ fontSize: 12 }} />
          <Tooltip
            contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "16px" }}
            labelStyle={{ color: "#e2e8f0" }}
          />
          <Bar yAxisId="left" dataKey="spend" fill="#38bdf8" radius={[8, 8, 0, 0]} name="Spend" />
          <Bar yAxisId="right" dataKey="clicks" fill="#a78bfa" radius={[8, 8, 0, 0]} name="Clicks" />
          <Bar yAxisId="right" dataKey="conversions" fill="#34d399" radius={[8, 8, 0, 0]} name="Conversions" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
