import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { BarChart2, AlertTriangle, TrendingDown, CheckCircle, Lightbulb, RefreshCw } from 'lucide-react';
import useAuthStore, { api } from '../store/useAuthStore';

function DiversityGauge({ score }) {
  const color = score >= 75 ? 'text-emerald-400' : score >= 50 ? 'text-amber-400' : 'text-rose-400';
  const bgColor = score >= 75 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-rose-500';
  const label = score >= 75 ? 'High' : score >= 50 ? 'Medium' : 'Low';

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-32 h-32">
        <svg className="w-32 h-32 -rotate-90" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1e293b" strokeWidth="3" />
          <circle
            cx="18" cy="18" r="15.9"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeDasharray={`${score} ${100 - score}`}
            className={color}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-2xl font-bold ${color}`}>{score}</span>
        </div>
      </div>
      <span className={`text-sm font-medium px-2 py-0.5 rounded-full ${bgColor} text-white`}>{label} Diversity</span>
    </div>
  );
}

function BulletHeatmapRow({ bullet, count, maxCount, variant }) {
  const intensity = maxCount > 0 ? count / maxCount : 0;
  
  return (
    <div className="flex items-start gap-3 py-2 border-b border-outline/10 last:border-0">
      <div 
        className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold
        ${variant === 'over' ? 'text-rose-600 dark:text-rose-300' : 'text-sky-600 dark:text-sky-300'}`}
        style={{ 
          backgroundColor: variant === 'over' ? `rgba(244, 63, 94, ${Math.max(0.1, intensity * 0.3)})` : `rgba(14, 165, 233, ${Math.max(0.1, intensity * 0.3)})` 
        }}
      >
        {count}
      </div>
      <p className="text-sm text-on-surface-variant flex-1 leading-relaxed">{bullet}</p>
    </div>
  );
}

export default function EvidenceDashboard() {
  const { isAuthenticated } = useAuthStore();
  const [report, setReport] = useState(null);
  const [bullets, setBullets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('report');

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchData();
  }, [isAuthenticated]);

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const [reportRes, bulletsRes] = await Promise.all([
        api.get('/evidence/report'),
        api.get('/evidence/bullets')
      ]);
      setReport(reportRes.data);
      setBullets(bulletsRes.data.bullets || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load evidence data');
    } finally {
      setLoading(false);
    }
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (loading) {
    return (
      <div className="w-full max-w-6xl mx-auto py-16 px-4 sm:px-6 flex items-center justify-center">
        <div className="glass-card p-12 flex items-center gap-3 text-on-surface-variant rounded-3xl">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Analyzing bullet evidence...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full max-w-6xl mx-auto py-16 px-4 sm:px-6 flex items-center justify-center">
        <div className="glass-card p-12 text-center rounded-3xl max-w-md">
          <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
          <p className="text-rose-600 font-medium mb-6">{error}</p>
          <button onClick={fetchData} className="px-6 py-2 glass-card hover:bg-white/40 text-on-surface rounded-xl text-sm transition-all font-bold">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const maxOverCount = report?.overUsed?.length > 0
    ? Math.max(...report.overUsed.map(b => b.count))
    : 1;

  return (
    <div className="w-full max-w-6xl mx-auto py-16 px-4 sm:px-6 text-on-surface">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <BarChart2 className="w-7 h-7 text-violet-400" />
            <h1 className="text-4xl font-black font-headline">Evidence Audit</h1>
          </div>
          <p className="text-on-surface-variant font-medium text-lg">Track how your resume bullets are reused across applications.</p>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard label="Unique Bullets" value={report?.uniqueBullets ?? 0} icon={CheckCircle} color="text-emerald-400" />
          <StatCard label="Over-used" value={report?.overUsed?.length ?? 0} icon={AlertTriangle} color="text-rose-400" />
          <StatCard label="Under-used" value={report?.underUsed?.length ?? 0} icon={TrendingDown} color="text-amber-400" />
          <StatCard label="Total Bullets Tracked" value={bullets.length} icon={BarChart2} color="text-sky-400" />
        </div>

        {/* Diversity + Suggestions */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <div className="glass-card rounded-3xl p-8 flex flex-col items-center gap-4">
            <h2 className="text-sm font-bold text-on-surface-variant uppercase tracking-wide self-start">Diversity Score</h2>
            <DiversityGauge score={report?.diversity ?? 0} />
            <p className="text-xs font-medium text-on-surface-variant text-center">
              Higher scores mean bullets are spread more evenly across applications.
            </p>
          </div>

          <div className="glass-card rounded-3xl p-8">
            <h2 className="text-sm font-bold text-on-surface-variant uppercase tracking-wide mb-4">Suggestions</h2>
            {report?.suggestions?.length === 0 ? (
              <p className="text-on-surface-variant text-sm font-medium">No suggestions — your bullet usage looks healthy!</p>
            ) : (
              <ul className="space-y-3">
                {report?.suggestions?.map((s, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-on-surface font-medium leading-relaxed">
                    <Lightbulb className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                    {s}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          {[
            { id: 'report', label: 'Reuse Report' },
            { id: 'bullets', label: 'All Bullets' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-3 rounded-xl text-sm font-bold transition-all shadow-sm
                ${activeTab === tab.id
                  ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg'
                  : 'glass-card hover:bg-white/40 text-on-surface-variant hover:text-on-surface'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'report' && (
          <div className="grid md:grid-cols-2 gap-6">
            {/* Over-used */}
            <div className="glass-card rounded-3xl p-8">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <h3 className="text-sm font-semibold text-rose-300">Over-used Bullets (&gt;2 uses)</h3>
              </div>
              {report?.overUsed?.length === 0 ? (
                <p className="text-on-surface-variant font-medium text-sm">None — no bullets are over-used.</p>
              ) : (
                report.overUsed.map((item, i) => (
                  <BulletHeatmapRow
                    key={i}
                    bullet={item.bullet}
                    count={item.count}
                    maxCount={maxOverCount}
                    variant="over"
                  />
                ))
              )}
            </div>

            {/* Under-used */}
            <div className="glass-card rounded-3xl p-8">
              <div className="flex items-center gap-2 mb-4">
                <TrendingDown className="w-4 h-4 text-sky-400" />
                <h3 className="text-sm font-semibold text-sky-300">Under-used Bullets (0–1 uses)</h3>
              </div>
              {report?.underUsed?.length === 0 ? (
                <p className="text-on-surface-variant font-medium text-sm">All bullets are being used.</p>
              ) : (
                report.underUsed.slice(0, 10).map((item, i) => (
                  <BulletHeatmapRow
                    key={i}
                    bullet={item.bullet}
                    count={item.count}
                    maxCount={1}
                    variant="under"
                  />
                ))
              )}
              {report?.underUsed?.length > 10 && (
                <p className="text-xs text-on-surface-variant font-bold mt-4">
                  +{report.underUsed.length - 10} more under-used bullets
                </p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'bullets' && (
          <div className="glass-card rounded-3xl p-8">
            <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-wide mb-4">
              All Bullets ({bullets.length})
            </h3>
            {bullets.length === 0 ? (
              <p className="text-on-surface-variant font-medium text-sm">
                No bullets tracked yet. Bullets are extracted when you tailor a resume or generate a cover letter.
              </p>
            ) : (
              <div className="space-y-2">
                {bullets.map((b) => (
                  <div key={b.id} className="flex items-start gap-4 py-4 border-b border-outline/10 last:border-0">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-on-surface leading-relaxed">{b.bullet_text}</p>
                      {b.skills?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {b.skills.map((skill, i) => (
                            <span key={i} className="text-xs glass-panel text-on-surface-variant px-3 py-1 rounded-full font-bold">
                              {skill}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-on-surface-variant font-bold flex-shrink-0 uppercase tracking-wider">
                      {b.source_section || 'experience'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <div className="glass-card rounded-3xl p-6 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="w-12 h-12 rounded-2xl glass-card flex items-center justify-center flex-shrink-0">
        <Icon className={`w-6 h-6 ${color}`} />
      </div>
      <div>
        <p className="text-2xl font-black text-on-surface">{value}</p>
        <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">{label}</p>
      </div>
    </div>
  );
}
