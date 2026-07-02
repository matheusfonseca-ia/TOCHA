"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface ActivityPoint {
  label: string;
  recebidas: number;
  respondidas: number;
}

export function ActivityChart({ data }: { data: ActivityPoint[] }) {
  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <defs>
            <linearGradient id="gradRecebidas" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="gradRespondidas" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#d946ef" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#d946ef" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="hsl(266 30% 17%)"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            tick={{ fill: "hsl(264 16% 66%)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "hsl(264 16% 66%)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(268 42% 9%)",
              border: "1px solid hsl(266 30% 17%)",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            labelStyle={{ color: "hsl(270 25% 96%)" }}
          />
          <Area
            type="monotone"
            dataKey="recebidas"
            name="Recebidas"
            stroke="#8B5CF6"
            strokeWidth={2}
            fill="url(#gradRecebidas)"
          />
          <Area
            type="monotone"
            dataKey="respondidas"
            name="Respondidas"
            stroke="#d946ef"
            strokeWidth={2}
            fill="url(#gradRespondidas)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
