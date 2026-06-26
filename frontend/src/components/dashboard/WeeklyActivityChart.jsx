import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-3 py-1.5 rounded-lg text-xs font-medium shadow-lg">
      {label}: {payload[0].value} {payload[0].value === 1 ? 'activity' : 'activities'}
    </div>
  );
}

export default function WeeklyActivityChart({ data = [] }) {
  const total = data.reduce((sum, d) => sum + (d.count || 0), 0);
  const isEmpty = total === 0;

  return (
    <div className="glass-card rounded-3xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">This Week</h3>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {total} {total === 1 ? 'activity' : 'activities'}
        </span>
      </div>

      {isEmpty ? (
        <div className="flex items-center justify-center h-[200px]">
          <p className="text-sm text-slate-400 dark:text-slate-500">No activity this week yet</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} barCategoryGap="20%">
            <defs>
              <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#60a5fa" />
                <stop offset="100%" stopColor="#2563eb" />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="day"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: '#94a3b8' }}
            />
            <YAxis hide />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(148, 163, 184, 0.1)' }} />
            <Bar
              dataKey="count"
              fill="url(#barGradient)"
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
