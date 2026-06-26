import { useState, useMemo } from 'react';

const LIGHT_COLORS = ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'];
const DARK_COLORS = ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'];

function getColor(count, isDark) {
  const palette = isDark ? DARK_COLORS : LIGHT_COLORS;
  if (count === 0) return palette[0];
  if (count <= 2) return palette[1];
  if (count <= 5) return palette[2];
  if (count <= 9) return palette[3];
  return palette[4];
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_LABELS = [
  { label: 'Mon', row: 1 },
  { label: 'Wed', row: 3 },
  { label: 'Fri', row: 5 },
];

function formatDate(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ActivityHeatmap({ data = [] }) {
  const [tooltip, setTooltip] = useState({ show: false, x: 0, y: 0, date: '', count: 0 });

  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

  const { grid, monthPositions, totalCount } = useMemo(() => {
    const dataMap = {};
    data.forEach(d => { dataMap[d.date] = d.count; });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Go back 52 weeks from the start of the current week
    const dayOfWeek = today.getDay(); // 0 = Sunday
    const endDate = new Date(today);
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - (52 * 7) - dayOfWeek);

    const cells = [];
    const months = {};
    let total = 0;
    const cursor = new Date(startDate);

    while (cursor <= endDate) {
      const dateStr = cursor.toISOString().split('T')[0];
      const col = Math.floor((cursor - startDate) / (1000 * 60 * 60 * 24 * 7));
      const row = cursor.getDay(); // 0=Sun, 1=Mon, ...
      const count = dataMap[dateStr] || 0;
      total += count;

      cells.push({ date: dateStr, count, col, row, displayDate: formatDate(cursor) });

      // Track month label positions
      if (cursor.getDate() <= 7 && cursor.getDay() === 0) {
        const monthIdx = cursor.getMonth();
        if (!months[`${monthIdx}-${cursor.getFullYear()}`]) {
          months[`${monthIdx}-${cursor.getFullYear()}`] = { label: MONTH_LABELS[monthIdx], col };
        }
      }

      cursor.setDate(cursor.getDate() + 1);
    }

    return { grid: cells, monthPositions: Object.values(months), totalCount: total };
  }, [data]);

  const cellSize = 11;
  const gap = 2;
  const step = cellSize + gap;
  const labelWidth = 32;
  const topPadding = 20;
  const cols = 53;
  const rows = 7;
  const svgWidth = labelWidth + cols * step;
  const svgHeight = topPadding + rows * step;

  const handleMouseEnter = (e, cell) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const container = e.currentTarget.closest('.heatmap-scroll');
    const containerRect = container ? container.getBoundingClientRect() : { left: 0, top: 0 };
    setTooltip({
      show: true,
      x: rect.left - containerRect.left + cellSize / 2,
      y: rect.top - containerRect.top - 8,
      date: cell.displayDate,
      count: cell.count,
    });
  };

  const handleMouseLeave = () => {
    setTooltip({ ...tooltip, show: false });
  };

  const isEmpty = data.length === 0;

  return (
    <div className="glass-card rounded-3xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Your Activity</h3>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {totalCount} total activities
        </span>
      </div>

      <div className="overflow-x-auto heatmap-scroll relative">
        {isEmpty && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <span className="text-sm text-slate-400 dark:text-slate-500 bg-white/80 dark:bg-slate-900/80 px-4 py-2 rounded-xl backdrop-blur">
              Start using tools to see your activity here
            </span>
          </div>
        )}

        <svg width={svgWidth} height={svgHeight} className="block">
          {/* Month labels */}
          {monthPositions.map((m, i) => (
            <text
              key={i}
              x={labelWidth + m.col * step}
              y={12}
              className="fill-slate-400 dark:fill-slate-500"
              fontSize={10}
            >
              {m.label}
            </text>
          ))}

          {/* Day labels */}
          {DAY_LABELS.map(({ label, row }) => (
            <text
              key={label}
              x={0}
              y={topPadding + row * step + cellSize - 1}
              className="fill-slate-400 dark:fill-slate-500"
              fontSize={10}
            >
              {label}
            </text>
          ))}

          {/* Cells */}
          {grid.map((cell, i) => (
            <rect
              key={i}
              x={labelWidth + cell.col * step}
              y={topPadding + cell.row * step}
              width={cellSize}
              height={cellSize}
              rx={2}
              fill={getColor(cell.count, isDark)}
              onMouseEnter={(e) => handleMouseEnter(e, cell)}
              onMouseLeave={handleMouseLeave}
              className="cursor-pointer"
            />
          ))}
        </svg>

        {/* Tooltip */}
        {tooltip.show && (
          <div
            className="absolute pointer-events-none z-20 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-lg whitespace-nowrap -translate-x-1/2 -translate-y-full"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            {tooltip.count > 0
              ? `${tooltip.count} ${tooltip.count === 1 ? 'activity' : 'activities'} on ${tooltip.date}`
              : `No activity on ${tooltip.date}`}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-end gap-1.5 mt-3">
        <span className="text-xs text-slate-400 dark:text-slate-500 mr-1">Less</span>
        {(isDark ? DARK_COLORS : LIGHT_COLORS).map((color, i) => (
          <div
            key={i}
            className="w-[11px] h-[11px] rounded-sm"
            style={{ backgroundColor: color }}
          />
        ))}
        <span className="text-xs text-slate-400 dark:text-slate-500 ml-1">More</span>
      </div>
    </div>
  );
}
