import { useState, useEffect } from 'react';
import { api } from '../store/useAuthStore';
import { Plus, Trash2, Edit2, CheckCircle2, Clock, XCircle, TrendingUp } from 'lucide-react';

const STATUSES = [
  { id: 'applied', label: 'Applied', color: 'bg-blue-50', icon: Clock, textColor: 'text-blue-700' },
  { id: 'interview', label: 'Interview', color: 'bg-amber-50', icon: CheckCircle2, textColor: 'text-amber-700' },
  { id: 'offer', label: 'Offer', color: 'bg-green-50', icon: CheckCircle2, textColor: 'text-green-700' },
  { id: 'rejected', label: 'Rejected', color: 'bg-red-50', icon: XCircle, textColor: 'text-red-700' },
];

function JobCard({ job, status, onDelete, onUpdate, onDragStart }) {
  const [isEditing, setIsEditing] = useState(false);
  const [notes, setNotes] = useState(job.notes || '');

  const handleSaveNotes = async () => {
    try {
      await api.patch(`/jobs/${job.id}`, { notes });
      onUpdate(job.id, { ...job, notes });
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to save notes:', err);
    }
  };

  const daysAgo = Math.floor((Date.now() - new Date(job.appliedAt)) / (1000 * 60 * 60 * 24));

  return (
    <div
      draggable
      onDragStart={() => onDragStart(job)}
      className={`glass-card p-4 rounded-2xl space-y-3 cursor-grab active:cursor-grabbing transition-all hover:shadow-lg border border-white/50 relative overflow-hidden`}
    >
      <div className={`absolute top-0 left-0 w-1.5 h-full ${status.textColor.replace('text-', 'bg-')}`} />
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <h3 className="font-bold text-slate-900">{job.role}</h3>
          <p className="text-sm text-slate-600">{job.company}</p>
          <p className="text-xs text-slate-500 mt-1">{daysAgo} days ago</p>
        </div>
        <button
          onClick={() => onDelete(job.id)}
          className="p-2 hover:bg-red-100 rounded-lg transition-colors"
          title="Delete"
        >
          <Trash2 className="w-4 h-4 text-red-600" />
        </button>
      </div>

      {isEditing ? (
        <div className="space-y-2">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            placeholder="Add notes..."
            rows="3"
          />
          <button
            onClick={handleSaveNotes}
            className="px-3 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Save
          </button>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs text-slate-700 flex-1">{notes || 'No notes'}</p>
          <button
            onClick={() => setIsEditing(true)}
            className="p-1 hover:bg-blue-100 rounded transition-colors shrink-0"
            title="Edit notes"
          >
            <Edit2 className="w-3 h-3 text-blue-600" />
          </button>
        </div>
      )}
    </div>
  );
}

export default function JobTracker() {
  const [jobs, setJobs] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ company: '', role: '', status: 'applied', notes: '' });
  const [stats, setStats] = useState({ total: 0, interviews: 0, offers: 0, replyRate: 0 });

  useEffect(() => {
    fetchJobs();
  }, []);

  const fetchJobs = async () => {
    try {
      const { data } = await api.get('/jobs');
      setJobs(data.jobs || []);
      setStats(data.stats || { total: 0, interviews: 0, offers: 0, replyRate: 0 });
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
    }
  };

  const handleAddJob = async (e) => {
    e.preventDefault();
    if (!formData.company || !formData.role) return;

    try {
      const { data } = await api.post('/jobs', formData);
      setJobs([data, ...jobs]);
      setFormData({ company: '', role: '', status: 'applied', notes: '' });
      setShowForm(false);
    } catch (err) {
      console.error('Failed to add job:', err);
    }
  };

  const handleDeleteJob = async (jobId) => {
    try {
      await api.delete(`/jobs/${jobId}`);
      setJobs(jobs.filter((j) => j.id !== jobId));
    } catch (err) {
      console.error('Failed to delete job:', err);
    }
  };

  const handleUpdateJob = async (jobId, newStatus) => {
    try {
      const { data } = await api.patch(`/jobs/${jobId}`, { status: newStatus });
      setJobs(jobs.map((j) => (j.id === jobId ? data : j)));
    } catch (err) {
      console.error('Failed to update job:', err);
    }
  };

  const [draggedJob, setDraggedJob] = useState(null);

  const handleDragStart = (job) => {
    setDraggedJob(job);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDropColumn = (targetStatusId) => {
    if (draggedJob && draggedJob.status !== targetStatusId) {
      handleUpdateJob(draggedJob.id, targetStatusId);
      setDraggedJob(null);
    }
  };

  const groupedJobs = STATUSES.reduce((acc, status) => {
    acc[status.id] = jobs.filter((j) => j.status === status.id);
    return acc;
  }, {});

  return (
    <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6">
      <div className="mb-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-black text-slate-900 mb-2">Job Application Tracker</h1>
            <p className="text-slate-600">Keep track of every application and stay on top of your job search</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5" /> Add Application
          </button>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Applied', value: stats?.total || 0, icon: TrendingUp, color: 'text-blue-600' },
            { label: 'Interviews', value: stats?.interviews || 0, icon: CheckCircle2, color: 'text-amber-600' },
            { label: 'Offers', value: stats?.offers || 0, icon: CheckCircle2, color: 'text-green-600' },
            { label: 'Reply Rate', value: `${stats?.replyRate || 0}%`, icon: TrendingUp, color: 'text-purple-600' },
          ].map((stat, i) => (
            <div key={i} className="glass-card p-5 rounded-2xl">
              <p className="text-xs font-bold text-slate-500 uppercase mb-2">{stat.label}</p>
              <p className={`text-2xl font-black ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="glass-card rounded-3xl p-6 mb-8">
          <form onSubmit={handleAddJob} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                type="text"
                placeholder="Company name"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                className="w-full bg-surface-container border border-outline/20 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                required
              />
              <input
                type="text"
                placeholder="Job title"
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="w-full bg-surface-container border border-outline/20 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className="w-full bg-surface-container border border-outline/20 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              {STATUSES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <textarea
              placeholder="Notes (optional)"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full bg-surface-container border border-outline/20 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              rows="2"
            />
            <div className="flex gap-3">
              <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors">
                Add Application
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-semibold hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Kanban board */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {STATUSES.map((status) => (
          <div
            key={status.id}
            onDragOver={handleDragOver}
            onDrop={() => handleDropColumn(status.id)}
            className={`glass-card rounded-3xl p-4 min-h-[24rem] transition-all duration-300 ${
              draggedJob && draggedJob.status !== status.id ? 'ring-2 ring-blue-300 bg-blue-50/20' : ''
            }`}
          >
            <div className="flex items-center gap-2 mb-4">
              <status.icon className={`w-5 h-5 ${status.textColor}`} />
              <h2 className="font-bold text-slate-900">
                {status.label} <span className="text-slate-500">({groupedJobs[status.id]?.length || 0})</span>
              </h2>
            </div>

            <div className="space-y-3 min-h-80">
              {groupedJobs[status.id]?.map((job) => (
                <div key={job.id} className="relative group">
                  <JobCard job={job} status={status} onDelete={handleDeleteJob} onUpdate={handleUpdateJob} onDragStart={handleDragStart} />

                  {/* Status move buttons */}
                  {status.id !== 'rejected' && (
                    <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {STATUSES.filter((s) => s.id !== status.id).map((nextStatus) => (
                        <button
                          key={nextStatus.id}
                          onClick={() => handleUpdateJob(job.id, nextStatus.id)}
                          className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 m-0.5"
                          title={`Move to ${nextStatus.label}`}
                        >
                          {nextStatus.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {(!groupedJobs[status.id] || groupedJobs[status.id].length === 0) && (
                <p className="text-xs text-slate-400 italic py-8 text-center">No applications yet</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
