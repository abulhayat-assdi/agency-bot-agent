"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { TrendDashboardData } from "@/server/trends";

export function AccountTrendChart({ data }: { data: TrendDashboardData["dailyTrend"] }) {
  return (
    <div className="h-96 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 32 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.16)" />
          <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 12 }} />
          <YAxis yAxisId="left" stroke="#38bdf8" tick={{ fontSize: 12 }} />
          <YAxis yAxisId="right" orientation="right" stroke="#34d399" tick={{ fontSize: 12 }} />
          <Tooltip
            contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "16px" }}
            labelStyle={{ color: "#e2e8f0" }}
          />
          <Legend />
          <Line yAxisId="left" type="monotone" dataKey="spend" stroke="#38bdf8" strokeWidth={2} dot={false} name="Spend" />
          <Line yAxisId="right" type="monotone" dataKey="clicks" stroke="#a78bfa" strokeWidth={2} dot={false} name="Clicks" />
          <Line yAxisId="right" type="monotone" dataKey="conversions" stroke="#34d399" strokeWidth={2} dot={false} name="Conversions" />
          <Line yAxisId="right" type="monotone" dataKey="roas" stroke="#f59e0b" strokeWidth={2} dot={false} name="ROAS" connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
