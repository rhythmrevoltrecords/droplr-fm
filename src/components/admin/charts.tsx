"use client";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { platformMeta } from "@/lib/platforms";

const tooltipStyle = { background: "#111114", border: "1px solid #27272a", borderRadius: 10, fontSize: 12 };

export function DailyChart({ data }: { data: { date: string; views: number; clicks: number; presaves: number }[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} tick={{ fill: "#a1a1aa", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis tick={{ fill: "#a1a1aa", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="views" stroke="#a78bfa" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="clicks" stroke="#22d3ee" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="presaves" stroke="#f472b6" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PlatformBars({ data }: { data: { platform: string; clicks: number }[] }) {
  const rows = data.map((d) => ({ name: platformMeta(d.platform).name, clicks: d.clicks, fill: platformMeta(d.platform).color }));
  if (!rows.length) return <p className="py-10 text-center text-sm text-muted-foreground">No clicks yet.</p>;
  return (
    <div className="w-full" style={{ height: Math.max(160, rows.length * 34) }}>
      <ResponsiveContainer>
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis type="category" dataKey="name" width={110} tick={{ fill: "#d4d4d8", fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,.04)" }} />
          <Bar dataKey="clicks" radius={[0, 6, 6, 0]} fill="#8b5cf6" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
