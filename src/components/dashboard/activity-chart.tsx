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
              <stop offset="0%" stopColor="#32E875" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#32E875" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="hsl(80 12% 89%)"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            tick={{ fill: "hsl(90 6% 52%)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "hsl(90 6% 52%)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ stroke: "hsl(80 12% 82%)", strokeWidth: 1 }}
            contentStyle={{
              backgroundColor: "#FFFFFF",
              border: "1px solid hsl(80 12% 88%)",
              borderRadius: "8px",
              fontSize: "12px",
              boxShadow: "0 8px 24px -8px rgb(11 13 12 / 0.18)",
            }}
            labelStyle={{ color: "hsl(150 8% 5%)", fontWeight: 500 }}
          />
          <Area
            type="monotone"
            dataKey="recebidas"
            name="Recebidas"
            stroke="hsl(90 6% 62%)"
            strokeWidth={1.5}
            fill="transparent"
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0 }}
          />
          <Area
            type="monotone"
            dataKey="respondidas"
            name="Respondidas"
            stroke="#1FAE5C"
            strokeWidth={2}
            fill="url(#gradRespondidas)"
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
