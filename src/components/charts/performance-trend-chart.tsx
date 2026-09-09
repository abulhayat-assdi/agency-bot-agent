"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { TrendPoint } from "@/server/dashboard/mock-dashboard-data";

export function PerformanceTrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.16)" />
          <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 12 }} />
          <YAxis yAxisId="left" stroke="#38bdf8" tick={{ fontSize: 12 }} />
          <YAxis yAxisId="right" orientation="right" stroke="#a78bfa" tick={{ fontSize: 12 }} />
          <Tooltip
            contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "16px" }}
            labelStyle={{ color: "#e2e8f0" }}
          />
          <Bar yAxisId="left" dataKey="impressions" fill="#38bdf8" radius={[8, 8, 0, 0]} name="Impressions" />
          <Bar yAxisId="right" dataKey="clicks" fill="#a78bfa" radius={[8, 8, 0, 0]} name="Clicks" />
          <Bar yAxisId="right" dataKey="conversions" fill="#34d399" radius={[8, 8, 0, 0]} name="Conversions" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
