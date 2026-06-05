import { useState } from 'react';
import { api } from '../store/useAuthStore';
import { Search, MapPin, Briefcase, ExternalLink, Plus, Loader2, AlertCircle, CheckCircle } from 'lucide-react';

const SOURCES = [
  { value: 'mock', label: 'Sample Jobs (Demo)' },
  { value: 'remotive', label: 'Remotive (Remote Jobs)' }
];

function JobCard({ job, onAddToTracker, addedIds }) {
  const isAdded = addedIds.has(job.externalId);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-slate-900 text-base leading-snug truncate">
            {job.title}
          </h3>
          <p className="text-sm text-slate-600 mt-0.5">{job.company}</p>
        </div>
        <span className="shrink-0 text-xs font-medium bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full">
          {job.source}
        </span>
      </div>

      {job.location && (
        <div className="flex items-center gap-1.5 text-sm text-slate-500">
          <MapPin className="w-4 h-4 shrink-0" />
          <span className="truncate">{job.location}</span>
        </div>
      )}

      {job.description && (
        <p className="text-sm text-slate-600 line-clamp-3 leading-relaxed">
          {job.description.replace(/<[^>]*>/g, '')}
        </p>
      )}

      {Array.isArray(job.tags) && job.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {job.tags.slice(0, 5).map(tag => (
            <span
              key={tag}
              className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        {job.url && (
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            View Job
          </a>
        )}
        <button
          onClick={() => onAddToTracker(job)}
          disabled={isAdded}
          className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            isAdded
              ? 'bg-green-50 text-green-700 cursor-default'
              : 'bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800'
          }`}
        >
          {isAdded ? (
            <>
              <CheckCircle className="w-4 h-4" />
              Added
            </>
          ) : (
            <>
              <Plus className="w-4 h-4" />
              Add to Tracker
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default function JobDiscovery() {
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [source, setSource] = useState('mock');
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resultMeta, setResultMeta] = useState(null);
  const [addedIds, setAddedIds] = useState(new Set());
  const [addError, setAddError] = useState('');

  const handleSearch = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setJobs([]);
    setResultMeta(null);

    try {
      const params = new URLSearchParams({ source });
      if (query.trim()) params.set('query', query.trim());
      if (location.trim()) params.set('location', location.trim());

      const res = await api.get(`/jobs/discover?${params.toString()}`);
      const { jobs: fetched, count, source: usedSource } = res.data.data;
      setJobs(fetched);
      setResultMeta({ count, source: usedSource });
    } catch (err) {
      const msg = err?.response?.data?.error || 'Failed to fetch jobs. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleAddToTracker = async (job) => {
    setAddError('');
    try {
      await api.post('/jobs', {
        company: job.company || 'Unknown Company',
        role: job.title,
        jobDescription: job.description || '',
        jobUrl: job.url || '',
        source: job.source,
        status: 'applied'
      });
      setAddedIds(prev => new Set([...prev, job.externalId]));
    } catch (err) {
      const msg = err?.response?.data?.error || 'Failed to add job to tracker.';
      setAddError(msg);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
          <Briefcase className="w-8 h-8 text-indigo-600" />
          Job Discovery
        </h1>
        <p className="mt-2 text-slate-500">
          Search and discover job opportunities from multiple sources, then add them directly to your tracker.
        </p>
      </div>

      {/* Search Form */}
      <form onSubmit={handleSearch} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <label htmlFor="query" className="block text-sm font-medium text-slate-700 mb-1">
              Job Title / Keywords
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                id="query"
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="e.g. React Developer"
                className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label htmlFor="location" className="block text-sm font-medium text-slate-700 mb-1">
              Location
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                id="location"
                type="text"
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="e.g. Remote, New York"
                className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label htmlFor="source" className="block text-sm font-medium text-slate-700 mb-1">
              Source
            </label>
            <select
              id="source"
              value={source}
              onChange={e => setSource(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
            >
              {SOURCES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 active:bg-indigo-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Searching...
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                Search Jobs
              </>
            )}
          </button>
        </div>
      </form>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          {error}
        </div>
      )}

      {addError && (
        <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          {addError}
        </div>
      )}

      {/* Results */}
      {resultMeta && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">
            Found <span className="font-semibold text-slate-800">{resultMeta.count}</span> jobs
            {resultMeta.source !== source && (
              <span className="ml-1 text-amber-600">
                (showing sample jobs — live API unavailable)
              </span>
            )}
          </p>
          <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full font-medium">
            Source: {resultMeta.source}
          </span>
        </div>
      )}

      {jobs.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {jobs.map(job => (
            <JobCard
              key={`${job.source}-${job.externalId}`}
              job={job}
              onAddToTracker={handleAddToTracker}
              addedIds={addedIds}
            />
          ))}
        </div>
      )}

      {resultMeta && jobs.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          <Briefcase className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-lg font-medium">No jobs found</p>
          <p className="text-sm mt-1">Try a different query or source</p>
        </div>
      )}
    </div>
  );
}
