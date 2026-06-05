import { useState, useEffect } from 'react';
import { api } from '../store/useAuthStore';
import { ChevronLeft, Download, Copy, Check } from 'lucide-react';
import { Link } from 'react-router-dom';

function DiffView({ oldText, newText }) {
  const oldLines = (oldText || '').split('\n');
  const newLines = (newText || '').split('\n');
  const maxLines = Math.max(oldLines.length, newLines.length);

  return (
    <div className="space-y-2 font-mono text-sm">
      {Array.from({ length: maxLines }).map((_, i) => {
        const oldLine = oldLines[i] || '';
        const newLine = newLines[i] || '';
        const isChanged = oldLine !== newLine;

        return (
          <div key={i} className="flex gap-4">
            <div className={`flex-1 p-2 rounded ${oldLine ? (isChanged ? 'bg-red-50' : 'bg-slate-50') : ''}`}>
              {oldLine && (
                <>
                  <span className="text-red-600 font-semibold">- </span>
                  <span className={isChanged ? 'text-red-700 line-through' : 'text-slate-700'}>{oldLine}</span>
                </>
              )}
            </div>
            <div className={`flex-1 p-2 rounded ${newLine ? (isChanged ? 'bg-green-50' : 'bg-slate-50') : ''}`}>
              {newLine && (
                <>
                  <span className="text-green-600 font-semibold">+ </span>
                  <span className={isChanged ? 'text-green-700 font-semibold' : 'text-slate-700'}>{newLine}</span>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatDelta({ label, oldVal, newVal }) {
  const delta = newVal - oldVal;
  const isPositive = delta >= 0;

  return (
    <div className="flex items-center justify-between p-3 glass-card rounded-lg">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-500">{oldVal}</span>
        <span className="text-xs text-slate-400">→</span>
        <span className="text-sm font-bold text-slate-900">{newVal}</span>
        {delta !== 0 && (
          <span className={`text-xs font-bold px-2 py-1 rounded-full ${isPositive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {isPositive ? '+' : ''}{delta}
          </span>
        )}
      </div>
    </div>
  );
}

export default function ResumeComparison() {
  const [versions, setVersions] = useState([]);
  const [selected, setSelected] = useState({ old: null, new: null });
  const [comparison, setComparison] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchVersions();
  }, []);

  const fetchVersions = async () => {
    try {
      const { data } = await api.get('/resume/versions');
      setVersions(data);
    } catch (err) {
      console.error('Failed to fetch versions:', err);
    }
  };

  const handleCompare = async () => {
    if (!selected.old || !selected.new) return;

    try {
      const { data } = await api.post('/resume/compare', {
        versionId1: selected.old,
        versionId2: selected.new,
      });
      setComparison(data);
    } catch (err) {
      console.error('Comparison failed:', err);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-6xl mx-auto py-12 px-4 sm:px-6">
      <Link to="/resume/history" className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-semibold mb-8">
        <ChevronLeft className="w-4 h-4" /> Back to History
      </Link>

      <div className="mb-8">
        <h1 className="text-4xl font-black text-slate-900 mb-2">Compare Resume Versions</h1>
        <p className="text-slate-600">See what changed between two versions side-by-side</p>
      </div>

      {/* Version selector */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">Original Version</label>
          <select
            value={selected.old || ''}
            onChange={(e) => setSelected({ ...selected, old: e.target.value })}
            className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
          >
            <option value="">Choose version...</option>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} ({new Date(v.createdAt).toLocaleDateString()})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">New Version</label>
          <select
            value={selected.new || ''}
            onChange={(e) => setSelected({ ...selected, new: e.target.value })}
            className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
          >
            <option value="">Choose version...</option>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} ({new Date(v.createdAt).toLocaleDateString()})
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        onClick={handleCompare}
        disabled={!selected.old || !selected.new}
        className="mb-8 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 text-white rounded-xl font-bold transition-all shadow-lg"
      >
        Compare Versions
      </button>

      {comparison && (
        <div className="space-y-8">
          {/* Stats summary */}
          <div className="glass-card rounded-3xl p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Changes Summary</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <StatDelta label="Keywords" oldVal={comparison.oldStats?.keywords || 0} newVal={comparison.newStats?.keywords || 0} />
              <StatDelta label="Bullets" oldVal={comparison.oldStats?.bulletCount || 0} newVal={comparison.newStats?.bulletCount || 0} />
              <StatDelta label="Word Count" oldVal={comparison.oldStats?.wordCount || 0} newVal={comparison.newStats?.wordCount || 0} />
              <StatDelta label="ATS Score" oldVal={comparison.oldStats?.atsScore || 0} newVal={comparison.newStats?.atsScore || 0} />
            </div>
          </div>

          {/* Sections diff */}
          <div className="glass-card rounded-3xl p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Content Changes</h2>
            <div className="space-y-6">
              {comparison.sections?.map((section) => (
                <div key={section.name}>
                  <h3 className="font-bold text-slate-900 mb-3">{section.name}</h3>
                  <DiffView oldText={section.old} newText={section.new} />
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => copyToClipboard(comparison.newContent)}
              className="flex items-center gap-2 px-6 py-3 glass-card hover:bg-white/40 text-on-surface rounded-xl font-bold transition-all"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied!' : 'Copy New Version'}
            </button>
            <button className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold transition-all shadow-lg">
              <Download className="w-4 h-4" /> Download PDF
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
