"use client";

import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CostItem } from "@/lib/domain";
import { compactPkr } from "@/lib/domain";

const colors = ["#138b80", "#75b8ad", "#edbd73", "#a5b8cf", "#df8c81", "#a593c4"];
const currencyTooltip = (value: number | undefined) => value == null ? "—" : compactPkr(value);

export function MonthlyTrend({ costs, period = "6 months" }: { costs: CostItem[]; period?: string }) {
  const points = useMemo(() => {
    const count = period === "Year" ? 12 : 6;
    const today = new Date();
    return Array.from({ length: count }, (_, index) => {
      const offset = count - index - 1;
      const date = new Date(today.getFullYear(), today.getMonth() - offset, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const total = costs.reduce((sum, item) => {
        const itemDate = new Date(item.date);
        return itemDate.getFullYear() === date.getFullYear() && itemDate.getMonth() === date.getMonth() ? sum + item.amount : sum;
      }, 0);
      return { key, month: date.toLocaleDateString("en-PK", { month: "short" }), total };
    });
  }, [costs, period]);
  return <div className="chart-area"><ResponsiveContainer width="100%" height="100%"><AreaChart data={points} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
    <defs><linearGradient id="hardSpendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#138b80" stopOpacity={0.2} /><stop offset="95%" stopColor="#138b80" stopOpacity={0.01} /></linearGradient></defs>
    <CartesianGrid stroke="#edf1f1" strokeDasharray="3 5" vertical={false} />
    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#8b989d", fontSize: 9 }} dy={8} />
    <YAxis width={40} axisLine={false} tickLine={false} tick={{ fill: "#8b989d", fontSize: 8 }} tickFormatter={(value: number) => compactPkr(value)} />
    <Tooltip formatter={(value) => [currencyTooltip(Number(value)), "Healthcare spend"]} contentStyle={{ border: "1px solid #e8eeee", borderRadius: 12, fontSize: 10, boxShadow: "0 10px 30px rgba(15, 40, 45, .08)" }} />
    <Area type="monotone" dataKey="total" stroke="#138b80" strokeWidth={2.5} fill="url(#hardSpendFill)" activeDot={{ r: 4, fill: "#138b80", stroke: "white", strokeWidth: 2 }} />
  </AreaChart></ResponsiveContainer></div>;
}

export function CategoryDonut({ costs }: { costs: CostItem[] }) {
  const categories = useMemo(() => {
    const sums = costs.reduce<Record<string, number>>((acc, item) => { acc[item.category] = (acc[item.category] ?? 0) + item.amount; return acc; }, {});
    return Object.entries(sums).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [costs]);
  const chartData = categories.length ? categories : [{ name: "No expenses", value: 1 }];
  return <div className="donut-layout"><div className="donut-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={chartData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={73} paddingAngle={3} stroke="none">{chartData.map((entry, index) => <Cell key={entry.name} fill={categories.length ? colors[index % colors.length] : "#e8eeee"} />)}</Pie><Tooltip formatter={(value) => [currencyTooltip(Number(value)), "Spend"]} contentStyle={{ border: "1px solid #e8eeee", borderRadius: 12, fontSize: 10 }} /></PieChart></ResponsiveContainer><div className="donut-center"><div>{categories.length}</div><span>categories</span></div></div><div className="donut-legend">{categories.slice(0, 5).map((item, index) => <div className="donut-legend-item" key={item.name}><span className="legend-dot" style={{ background: colors[index % colors.length] }} /><span className="donut-legend-name">{item.name}</span><strong>{compactPkr(item.value)}</strong></div>)}{!categories.length && <div className="text-[9px] text-slate-400">No expense data yet.</div>}</div></div>;
}

export function ProviderBars({ costs }: { costs: CostItem[] }) {
  const providers = useMemo(() => {
    const sums = costs.reduce<Record<string, number>>((acc, item) => { acc[item.provider] = (acc[item.provider] ?? 0) + item.amount; return acc; }, {});
    return Object.entries(sums).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5);
  }, [costs]);
  const maximum = Math.max(1, ...providers.map((item) => item.value));
  return providers.length ? <div className="provider-bars">{providers.map((item, index) => <div className="provider-bar-item" key={item.name}><div className="provider-bar-label"><span>{item.name}</span><strong>{compactPkr(item.value)}</strong></div><div className="provider-track"><div className="provider-fill" style={{ width: `${Math.max(4, item.value / maximum * 100)}%`, background: colors[index % colors.length] }} /></div></div>)}</div> : <div className="p-4 text-[9px] text-slate-400">No linked-provider costs yet.</div>;
}
