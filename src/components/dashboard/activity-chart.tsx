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
            <linearGradient id="gradRespondidas" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="hsl(266 30% 14%)"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            tick={{ fill: "hsl(264 16% 55%)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "hsl(264 16% 55%)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ stroke: "hsl(266 30% 24%)", strokeWidth: 1 }}
            contentStyle={{
              backgroundColor: "hsl(268 42% 9%)",
              border: "1px solid hsl(266 30% 18%)",
              borderRadius: "8px",
              fontSize: "12px",
              boxShadow: "0 8px 24px -8px rgb(0 0 0 / 0.6)",
            }}
            labelStyle={{ color: "hsl(270 25% 96%)", fontWeight: 500 }}
          />
          <Area
            type="monotone"
            dataKey="recebidas"
            name="Recebidas"
            stroke="hsl(264 16% 45%)"
            strokeWidth={1.5}
            fill="transparent"
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0 }}
          />
          <Area
            type="monotone"
            dataKey="respondidas"
            name="Respondidas"
            stroke="#8B5CF6"
            strokeWidth={1.75}
            fill="url(#gradRespondidas)"
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
