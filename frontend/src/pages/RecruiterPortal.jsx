import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../store/useAuthStore';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line
} from 'recharts';
import {
  Search, Filter, Plus, Download, Send, Briefcase, Users, Star,
  ChevronDown, ChevronUp, X, ExternalLink, Github, Linkedin,
  FileText, GripVertical, MapPin, DollarSign, Calendar,
  TrendingUp, UserCheck, Eye
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Demo / Fallback Data
// ─────────────────────────────────────────────────────────────────────────────

const DEMO_STUDENTS = [
  { id: 1, name: 'Aditya Verma', department: 'Computer Science', skills: ['React', 'Node.js', 'Python', 'AWS'], skillScore: 88, gpa: 3.8, year: 2025, location: 'Bangalore', resumeUrl: '#', portfolioUrl: '#', githubUrl: '#', linkedinUrl: '#', projects: ['E-commerce Platform', 'ML Pipeline Dashboard'] },
  { id: 2, name: 'Meera Krishnan', department: 'Data Science', skills: ['Python', 'TensorFlow', 'SQL', 'Tableau'], skillScore: 92, gpa: 3.9, year: 2025, location: 'Chennai', resumeUrl: '#', portfolioUrl: '#', githubUrl: '#', linkedinUrl: '#', projects: ['Sentiment Analyzer', 'Fraud Detection System'] },
  { id: 3, name: 'Rohit Joshi', department: 'Computer Science', skills: ['Java', 'Spring Boot', 'Docker', 'Kubernetes'], skillScore: 76, gpa: 3.5, year: 2025, location: 'Pune', resumeUrl: '#', portfolioUrl: null, githubUrl: '#', linkedinUrl: '#', projects: ['Microservices Architecture'] },
  { id: 4, name: 'Sanya Gupta', department: 'Design', skills: ['Figma', 'UI/UX', 'Adobe XD', 'Prototyping'], skillScore: 84, gpa: 3.7, year: 2025, location: 'Mumbai', resumeUrl: '#', portfolioUrl: '#', githubUrl: null, linkedinUrl: '#', projects: ['Banking App Redesign', 'Design System'] },
  { id: 5, name: 'Kunal Desai', department: 'Computer Science', skills: ['Python', 'Django', 'React', 'PostgreSQL'], skillScore: 70, gpa: 3.3, year: 2026, location: 'Hyderabad', resumeUrl: '#', portfolioUrl: '#', githubUrl: '#', linkedinUrl: '#', projects: ['Task Management App'] },
  { id: 6, name: 'Pooja Rao', department: 'Data Science', skills: ['R', 'Python', 'ML', 'Statistics', 'NLP'], skillScore: 95, gpa: 4.0, year: 2025, location: 'Bangalore', resumeUrl: '#', portfolioUrl: '#', githubUrl: '#', linkedinUrl: '#', projects: ['NLP Chatbot', 'Climate Data Analysis', 'Predictive Analytics'] },
  { id: 7, name: 'Arjun Mehta', department: 'Electrical Eng.', skills: ['Embedded C', 'IoT', 'FPGA', 'Verilog'], skillScore: 72, gpa: 3.4, year: 2025, location: 'Delhi', resumeUrl: '#', portfolioUrl: null, githubUrl: '#', linkedinUrl: '#', projects: ['Smart Home System'] },
  { id: 8, name: 'Nisha Patel', department: 'Business Admin', skills: ['Analytics', 'Excel', 'Tableau', 'SQL'], skillScore: 68, gpa: 3.6, year: 2026, location: 'Ahmedabad', resumeUrl: '#', portfolioUrl: null, githubUrl: null, linkedinUrl: '#', projects: ['Market Analysis Dashboard'] },
  { id: 9, name: 'Vikram Singh', department: 'Computer Science', skills: ['Go', 'Rust', 'Systems Programming', 'Linux'], skillScore: 82, gpa: 3.7, year: 2025, location: 'Bangalore', resumeUrl: '#', portfolioUrl: '#', githubUrl: '#', linkedinUrl: '#', projects: ['Distributed KV Store', 'CLI Tool Suite'] },
  { id: 10, name: 'Divya Sharma', department: 'Design', skills: ['UI/UX', 'Figma', 'Motion Design', 'Research'], skillScore: 86, gpa: 3.8, year: 2025, location: 'Mumbai', resumeUrl: '#', portfolioUrl: '#', githubUrl: null, linkedinUrl: '#', projects: ['Healthcare App', 'Brand Identity System'] },
  { id: 11, name: 'Ravi Kumar', department: 'Mechanical Eng.', skills: ['CAD', 'MATLAB', 'Python', 'FEA'], skillScore: 64, gpa: 3.2, year: 2026, location: 'Chennai', resumeUrl: '#', portfolioUrl: null, githubUrl: '#', linkedinUrl: '#', projects: ['Drone Optimization'] },
  { id: 12, name: 'Ananya Reddy', department: 'Computer Science', skills: ['Flutter', 'Dart', 'Firebase', 'Swift'], skillScore: 78, gpa: 3.6, year: 2025, location: 'Hyderabad', resumeUrl: '#', portfolioUrl: '#', githubUrl: '#', linkedinUrl: '#', projects: ['Food Delivery App', 'Fitness Tracker'] },
];

const PIPELINE_COLUMNS = ['Shortlisted', 'Contacted', 'Interviewed', 'Offered'];

const DEMO_PIPELINE = {
  Shortlisted: [1, 2, 6, 9],
  Contacted: [3, 4],
  Interviewed: [10],
  Offered: [12],
};

const DEMO_JOBS = [
  { id: 1, title: 'Frontend Developer', company: 'TechCorp', location: 'Bangalore', salaryRange: '8-12 LPA', applications: 24, status: 'active', posted: '2025-10-28' },
  { id: 2, title: 'Data Scientist', company: 'DataViz Inc', location: 'Remote', salaryRange: '10-15 LPA', applications: 18, status: 'active', posted: '2025-11-01' },
  { id: 3, title: 'Backend Engineer', company: 'TechCorp', location: 'Pune', salaryRange: '9-14 LPA', applications: 31, status: 'active', posted: '2025-11-05' },
];

const DEMO_FUNNEL = [
  { stage: 'Applied', count: 245 },
  { stage: 'Screened', count: 180 },
  { stage: 'Shortlisted', count: 95 },
  { stage: 'Interviewed', count: 48 },
  { stage: 'Offered', count: 22 },
  { stage: 'Accepted', count: 18 },
];

const DEMO_TOP_SKILLS = [
  { skill: 'Python', demand: 85, color: '#6366f1' },
  { skill: 'React', demand: 78, color: '#0ea5e9' },
  { skill: 'SQL', demand: 72, color: '#10b981' },
  { skill: 'AWS', demand: 65, color: '#f59e0b' },
  { skill: 'Machine Learning', demand: 60, color: '#8b5cf6' },
  { skill: 'Docker', demand: 55, color: '#ef4444' },
];

const DEMO_HIRING_TRENDS = [
  { month: 'Jun', hires: 12 },
  { month: 'Jul', hires: 18 },
  { month: 'Aug', hires: 15 },
  { month: 'Sep', hires: 22 },
  { month: 'Oct', hires: 28 },
  { month: 'Nov', hires: 25 },
];

const ALL_SKILLS = ['React', 'Node.js', 'Python', 'Java', 'Go', 'Rust', 'SQL', 'AWS', 'Docker', 'Kubernetes', 'TensorFlow', 'Figma', 'UI/UX', 'Flutter', 'Spring Boot', 'Django', 'ML', 'NLP', 'R', 'Tableau'];
const ALL_DEPARTMENTS = ['Computer Science', 'Data Science', 'Design', 'Electrical Eng.', 'Mechanical Eng.', 'Business Admin'];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getScoreBadgeColor(score) {
  if (score >= 85) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
  if (score >= 70) return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
  if (score >= 55) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
  return 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400';
}

function getPipelineColor(column) {
  const map = {
    Shortlisted: 'border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-950/20',
    Contacted: 'border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20',
    Interviewed: 'border-purple-300 dark:border-purple-700 bg-purple-50/50 dark:bg-purple-950/20',
    Offered: 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/20',
  };
  return map[column] || '';
}

function getPipelineHeaderColor(column) {
  const map = {
    Shortlisted: 'text-blue-600 dark:text-blue-400',
    Contacted: 'text-amber-600 dark:text-amber-400',
    Interviewed: 'text-purple-600 dark:text-purple-400',
    Offered: 'text-emerald-600 dark:text-emerald-400',
  };
  return map[column] || 'text-on-surface';
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-card rounded-xl p-3 shadow-lg border border-outline/20">
      <p className="text-on-surface text-sm font-medium mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function RecruiterPortal() {
  const [activeTab, setActiveTab] = useState('search');
  const [allStudents, setAllStudents] = useState(DEMO_STUDENTS);
  const [pipeline, setPipeline] = useState(DEMO_PIPELINE);
  const [jobs, setJobs] = useState(DEMO_JOBS);
  const [loading, setLoading] = useState(true);

  // Search & filters
  const [searchQuery, setSearchQuery] = useState('');
  const [skillFilter, setSkillFilter] = useState([]);
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [minScore, setMinScore] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Student profile expand
  const [expandedStudent, setExpandedStudent] = useState(null);

  // Job posting form
  const [showJobForm, setShowJobForm] = useState(false);
  const [newJob, setNewJob] = useState({ title: '', company: '', description: '', requirements: '', location: '', salaryRange: '' });
  const [postingJob, setPostingJob] = useState(false);

  // Drag state for pipeline
  const [draggedStudent, setDraggedStudent] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [searchRes, shortlistRes, jobsRes] = await Promise.allSettled([
          api.get('/admin-panels/recruiter/search'),
          api.get('/admin-panels/recruiter/shortlist'),
          api.get('/admin-panels/recruiter/jobs'),
        ]);
        if (searchRes.status === 'fulfilled' && searchRes.value.data.students) setAllStudents(searchRes.value.data.students);
        if (shortlistRes.status === 'fulfilled' && shortlistRes.value.data.pipeline) setPipeline(shortlistRes.value.data.pipeline);
        if (jobsRes.status === 'fulfilled' && jobsRes.value.data.jobs) setJobs(jobsRes.value.data.jobs);
      } catch { /* keep demo */ }
      setLoading(false);
    };
    fetchData();
  }, []);

  // ─── Search filtering ───
  const filteredStudents = useMemo(() => {
    let list = [...allStudents];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.department.toLowerCase().includes(q) ||
        s.skills.some(sk => sk.toLowerCase().includes(q))
      );
    }
    if (departmentFilter) list = list.filter(s => s.department === departmentFilter);
    if (minScore) list = list.filter(s => s.skillScore >= Number(minScore));
    if (yearFilter) list = list.filter(s => s.year === Number(yearFilter));
    if (skillFilter.length > 0) {
      list = list.filter(s => skillFilter.every(sf => s.skills.some(sk => sk.toLowerCase() === sf.toLowerCase())));
    }
    return list;
  }, [allStudents, searchQuery, departmentFilter, minScore, yearFilter, skillFilter]);

  // ─── Pipeline helpers ───
  const getStudentById = (id) => allStudents.find(s => s.id === id);

  const moveStudentInPipeline = (studentId, toColumn) => {
    setPipeline(prev => {
      const next = {};
      for (const col of PIPELINE_COLUMNS) {
        next[col] = (prev[col] || []).filter(id => id !== studentId);
      }
      next[toColumn] = [...(next[toColumn] || []), studentId];
      return next;
    });
    // fire and forget
    api.post('/admin-panels/recruiter/shortlist', { studentId, status: toColumn }).catch(() => {});
  };

  const addToShortlist = (studentId) => {
    if (PIPELINE_COLUMNS.some(col => (pipeline[col] || []).includes(studentId))) return;
    moveStudentInPipeline(studentId, 'Shortlisted');
  };

  const handleDragStart = (studentId) => setDraggedStudent(studentId);
  const handleDragOver = (e) => e.preventDefault();
  const handleDrop = (column) => {
    if (draggedStudent) moveStudentInPipeline(draggedStudent, column);
    setDraggedStudent(null);
  };

  // ─── Job posting ───
  const handlePostJob = async (e) => {
    e.preventDefault();
    setPostingJob(true);
    try {
      const { data } = await api.post('/admin-panels/recruiter/jobs', newJob);
      if (data.job) setJobs(prev => [...prev, data.job]);
    } catch {
      const fallback = { id: Date.now(), ...newJob, applications: 0, status: 'active', posted: new Date().toISOString().split('T')[0] };
      setJobs(prev => [...prev, fallback]);
    }
    setNewJob({ title: '', company: '', description: '', requirements: '', location: '', salaryRange: '' });
    setShowJobForm(false);
    setPostingJob(false);
  };

  // ─── Export ───
  const handleExportShortlist = () => {
    const shortlisted = (pipeline.Shortlisted || []).map(id => getStudentById(id)).filter(Boolean);
    const rows = [
      ['Name', 'Department', 'Skills', 'Skill Score', 'GPA', 'Year'],
      ...shortlisted.map(s => [s.name, s.department, s.skills.join('; '), s.skillScore, s.gpa, s.year])
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'shortlist.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const tabs = [
    { id: 'search', label: 'Student Search', icon: Search },
    { id: 'pipeline', label: 'Talent Pool', icon: Users },
    { id: 'jobs', label: 'Job Postings', icon: Briefcase },
    { id: 'analytics', label: 'Analytics', icon: TrendingUp },
  ];

  return (
    <div className="max-w-7xl mx-auto py-10 px-4 sm:px-6 lg:px-8 w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="font-headline text-3xl text-on-surface flex items-center gap-3">
            <span className="material-symbols-outlined text-4xl text-orange-500" style={{ fontVariationSettings: "'FILL' 1" }}>business_center</span>
            Recruiter Portal
          </h1>
          <p className="text-on-surface-variant mt-1">Find, shortlist, and hire top university talent</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExportShortlist} className="glass-card rounded-xl px-3 py-2 flex items-center gap-1.5 text-xs text-on-surface hover:bg-surface-container/50 transition-colors border border-outline/20">
            <Download className="w-3.5 h-3.5" /> Export Shortlist
          </button>
          <button className="glass-card rounded-xl px-3 py-2 flex items-center gap-1.5 text-xs text-on-surface hover:bg-surface-container/50 transition-colors border border-outline/20">
            <Send className="w-3.5 h-3.5" /> Bulk Invite
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-8 bg-surface-container/50 rounded-xl p-1 overflow-x-auto border border-outline/20">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-white dark:bg-gray-800 text-on-surface shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <span className="material-symbols-outlined animate-spin text-3xl text-orange-500">sync</span>
          <span className="ml-3 text-on-surface-variant">Loading recruiter data...</span>
        </div>
      )}

      {/* ─── Student Search Tab ─── */}
      {activeTab === 'search' && (
        <div>
          {/* Search bar + filter toggle */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
              <input
                type="text"
                placeholder="Search by name, department, or skill..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-surface-container/50 border border-outline/20 text-on-surface text-sm placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`glass-card rounded-xl px-4 py-2.5 flex items-center gap-2 text-sm transition-colors border border-outline/20 ${showFilters ? 'bg-orange-50 dark:bg-orange-950/30 text-orange-600' : 'text-on-surface hover:bg-surface-container/50'}`}
            >
              <Filter className="w-4 h-4" />
              Filters
              {(departmentFilter || minScore || yearFilter || skillFilter.length > 0) && (
                <span className="w-2 h-2 rounded-full bg-orange-500" />
              )}
            </button>
          </div>

          {/* Expanded filters */}
          {showFilters && (
            <div className="glass-card rounded-2xl p-5 border border-outline/20 mb-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs text-on-surface-variant mb-1">Department</label>
                  <select
                    value={departmentFilter}
                    onChange={e => setDepartmentFilter(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container/50 border border-outline/20 text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                  >
                    <option value="">All Departments</option>
                    {ALL_DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-on-surface-variant mb-1">Min Skill Score</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    placeholder="e.g. 70"
                    value={minScore}
                    onChange={e => setMinScore(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container/50 border border-outline/20 text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                  />
                </div>
                <div>
                  <label className="block text-xs text-on-surface-variant mb-1">Graduation Year</label>
                  <select
                    value={yearFilter}
                    onChange={e => setYearFilter(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container/50 border border-outline/20 text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                  >
                    <option value="">Any Year</option>
                    <option value="2025">2025</option>
                    <option value="2026">2026</option>
                    <option value="2027">2027</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-on-surface-variant mb-1">Skills</label>
                  <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                    {ALL_SKILLS.slice(0, 10).map(skill => (
                      <button
                        key={skill}
                        onClick={() => setSkillFilter(prev => prev.includes(skill) ? prev.filter(s => s !== skill) : [...prev, skill])}
                        className={`px-2 py-0.5 rounded-md text-xs transition-colors ${
                          skillFilter.includes(skill)
                            ? 'bg-orange-500 text-white'
                            : 'bg-surface-container/50 text-on-surface-variant hover:bg-surface-container border border-outline/20'
                        }`}
                      >
                        {skill}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {(departmentFilter || minScore || yearFilter || skillFilter.length > 0) && (
                <button
                  onClick={() => { setDepartmentFilter(''); setMinScore(''); setYearFilter(''); setSkillFilter([]); }}
                  className="mt-3 text-xs text-orange-600 dark:text-orange-400 hover:underline"
                >
                  Clear all filters
                </button>
              )}
            </div>
          )}

          {/* Results count */}
          <p className="text-sm text-on-surface-variant mb-3">{filteredStudents.length} student{filteredStudents.length !== 1 ? 's' : ''} found</p>

          {/* Student cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredStudents.map(student => (
              <div key={student.id} className="glass-card rounded-2xl border border-outline/20 overflow-hidden">
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-on-surface font-medium text-base">{student.name}</h3>
                      <p className="text-sm text-on-surface-variant">{student.department} &middot; Class of {student.year}</p>
                      <p className="text-xs text-on-surface-variant flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3" /> {student.location}
                      </p>
                    </div>
                    <span className={`px-2.5 py-1 rounded-lg text-sm font-bold ${getScoreBadgeColor(student.skillScore)}`}>
                      {student.skillScore}
                    </span>
                  </div>

                  {/* Skills */}
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {student.skills.map((skill, i) => (
                      <span key={i} className="px-2 py-0.5 rounded-md bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 text-xs">
                        {skill}
                      </span>
                    ))}
                  </div>

                  {/* Links & Actions */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {student.resumeUrl && (
                        <a href={student.resumeUrl} className="text-on-surface-variant hover:text-on-surface transition-colors" title="Resume">
                          <FileText className="w-4 h-4" />
                        </a>
                      )}
                      {student.githubUrl && (
                        <a href={student.githubUrl} className="text-on-surface-variant hover:text-on-surface transition-colors" title="GitHub">
                          <Github className="w-4 h-4" />
                        </a>
                      )}
                      {student.linkedinUrl && (
                        <a href={student.linkedinUrl} className="text-on-surface-variant hover:text-on-surface transition-colors" title="LinkedIn">
                          <Linkedin className="w-4 h-4" />
                        </a>
                      )}
                      {student.portfolioUrl && (
                        <a href={student.portfolioUrl} className="text-on-surface-variant hover:text-on-surface transition-colors" title="Portfolio">
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setExpandedStudent(expandedStudent === student.id ? null : student.id)}
                        className="text-xs text-orange-600 dark:text-orange-400 hover:underline"
                      >
                        {expandedStudent === student.id ? 'Collapse' : 'View Profile'}
                      </button>
                      <button
                        onClick={() => addToShortlist(student.id)}
                        className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-medium transition-colors"
                      >
                        <Star className="w-3 h-3 inline mr-1" />Shortlist
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded profile */}
                {expandedStudent === student.id && (
                  <div className="px-5 pb-5 pt-0 border-t border-outline/10">
                    <div className="grid grid-cols-3 gap-3 mt-4 mb-4">
                      <div className="text-center glass-card rounded-xl p-3 border border-outline/20">
                        <div className="text-lg font-bold text-on-surface">{student.gpa}</div>
                        <div className="text-xs text-on-surface-variant">GPA</div>
                      </div>
                      <div className="text-center glass-card rounded-xl p-3 border border-outline/20">
                        <div className="text-lg font-bold text-on-surface">{student.skillScore}</div>
                        <div className="text-xs text-on-surface-variant">Skill Score</div>
                      </div>
                      <div className="text-center glass-card rounded-xl p-3 border border-outline/20">
                        <div className="text-lg font-bold text-on-surface">{student.projects.length}</div>
                        <div className="text-xs text-on-surface-variant">Projects</div>
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-on-surface mb-2">Projects</h4>
                      <div className="space-y-1.5">
                        {student.projects.map((project, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm text-on-surface-variant">
                            <span className="material-symbols-outlined text-base text-orange-500">code</span>
                            {project}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {filteredStudents.length === 0 && (
              <div className="col-span-2 text-center py-12 text-on-surface-variant">
                No students match your search criteria. Try adjusting filters.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Talent Pool / Pipeline Tab ─── */}
      {activeTab === 'pipeline' && (
        <div>
          <h2 className="font-headline text-lg text-on-surface mb-4">Talent Pipeline</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {PIPELINE_COLUMNS.map(column => (
              <div
                key={column}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(column)}
                className={`rounded-2xl border-2 border-dashed p-4 min-h-[300px] transition-colors ${getPipelineColor(column)}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className={`font-medium text-sm ${getPipelineHeaderColor(column)}`}>{column}</h3>
                  <span className="text-xs bg-white/60 dark:bg-gray-800/60 rounded-full px-2 py-0.5 text-on-surface-variant">
                    {(pipeline[column] || []).length}
                  </span>
                </div>
                <div className="space-y-2">
                  {(pipeline[column] || []).map(studentId => {
                    const student = getStudentById(studentId);
                    if (!student) return null;
                    return (
                      <div
                        key={studentId}
                        draggable
                        onDragStart={() => handleDragStart(studentId)}
                        className="glass-card rounded-xl p-3 border border-outline/20 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <GripVertical className="w-3 h-3 text-on-surface-variant flex-shrink-0" />
                          <span className="text-sm text-on-surface font-medium truncate">{student.name}</span>
                        </div>
                        <p className="text-xs text-on-surface-variant pl-5">{student.department}</p>
                        <div className="flex flex-wrap gap-1 mt-1.5 pl-5">
                          {student.skills.slice(0, 3).map((s, i) => (
                            <span key={i} className="px-1.5 py-0.5 rounded text-[10px] bg-white/80 dark:bg-gray-800/80 text-on-surface-variant">{s}</span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Job Postings Tab ─── */}
      {activeTab === 'jobs' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-headline text-lg text-on-surface">Job Postings</h2>
            <button
              onClick={() => setShowJobForm(!showJobForm)}
              className="flex items-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Post a Job
            </button>
          </div>

          {/* Job posting form */}
          {showJobForm && (
            <div className="glass-card rounded-2xl p-6 border border-outline/20 mb-6">
              <h3 className="font-headline text-base text-on-surface mb-4">New Job Posting</h3>
              <form onSubmit={handlePostJob} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-on-surface-variant mb-1">Job Title</label>
                  <input type="text" required value={newJob.title} onChange={e => setNewJob(p => ({ ...p, title: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl bg-surface-container/50 border border-outline/20 text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30" placeholder="e.g. Frontend Developer" />
                </div>
                <div>
                  <label className="block text-sm text-on-surface-variant mb-1">Company</label>
                  <input type="text" required value={newJob.company} onChange={e => setNewJob(p => ({ ...p, company: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl bg-surface-container/50 border border-outline/20 text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30" placeholder="Company name" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm text-on-surface-variant mb-1">Description</label>
                  <textarea value={newJob.description} onChange={e => setNewJob(p => ({ ...p, description: e.target.value }))} rows={3}
                    className="w-full px-4 py-2.5 rounded-xl bg-surface-container/50 border border-outline/20 text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 resize-none" placeholder="Job description..." />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm text-on-surface-variant mb-1">Requirements</label>
                  <textarea value={newJob.requirements} onChange={e => setNewJob(p => ({ ...p, requirements: e.target.value }))} rows={2}
                    className="w-full px-4 py-2.5 rounded-xl bg-surface-container/50 border border-outline/20 text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 resize-none" placeholder="Required skills and qualifications..." />
                </div>
                <div>
                  <label className="block text-sm text-on-surface-variant mb-1">Location</label>
                  <input type="text" value={newJob.location} onChange={e => setNewJob(p => ({ ...p, location: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl bg-surface-container/50 border border-outline/20 text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30" placeholder="e.g. Bangalore / Remote" />
                </div>
                <div>
                  <label className="block text-sm text-on-surface-variant mb-1">Salary Range</label>
                  <input type="text" value={newJob.salaryRange} onChange={e => setNewJob(p => ({ ...p, salaryRange: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl bg-surface-container/50 border border-outline/20 text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30" placeholder="e.g. 8-12 LPA" />
                </div>
                <div className="md:col-span-2 flex items-center gap-2">
                  <button type="submit" disabled={postingJob}
                    className="px-6 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
                    {postingJob ? 'Posting...' : 'Post Job'}
                  </button>
                  <button type="button" onClick={() => setShowJobForm(false)}
                    className="px-4 py-2.5 text-on-surface-variant hover:text-on-surface text-sm transition-colors">Cancel</button>
                </div>
              </form>
            </div>
          )}

          {/* Job listings */}
          <div className="space-y-3">
            {jobs.map(job => (
              <div key={job.id} className="glass-card rounded-2xl p-5 border border-outline/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Briefcase className="w-4 h-4 text-orange-500 flex-shrink-0" />
                    <h3 className="text-on-surface font-medium truncate">{job.title}</h3>
                    <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${job.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-gray-100 text-gray-700'}`}>
                      {job.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-on-surface-variant flex-wrap">
                    <span>{job.company}</span>
                    {job.location && <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{job.location}</span>}
                    {job.salaryRange && <span className="flex items-center gap-0.5"><DollarSign className="w-3 h-3" />{job.salaryRange}</span>}
                    <span className="flex items-center gap-0.5"><Calendar className="w-3 h-3" />{job.posted}</span>
                  </div>
                </div>
                <div className="text-center flex-shrink-0">
                  <div className="text-xl font-bold text-on-surface">{job.applications}</div>
                  <div className="text-xs text-on-surface-variant">Applications</div>
                </div>
              </div>
            ))}
            {jobs.length === 0 && (
              <div className="text-center py-12 text-on-surface-variant">No job postings yet. Click "Post a Job" to get started.</div>
            )}
          </div>
        </div>
      )}

      {/* ─── Analytics Tab ─── */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          {/* Funnel + Top Skills */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="glass-card rounded-2xl p-6 border border-outline/20">
              <h2 className="font-headline text-lg text-on-surface mb-4 flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-orange-500" />
                Applicant Funnel
              </h2>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={DEMO_FUNNEL} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-outline, #e2e8f0)" opacity={0.3} />
                  <XAxis type="number" tick={{ fontSize: 12, fill: 'var(--color-on-surface-variant, #64748b)' }} />
                  <YAxis dataKey="stage" type="category" width={90} tick={{ fontSize: 11, fill: 'var(--color-on-surface-variant, #64748b)' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" name="Candidates" fill="#f97316" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="glass-card rounded-2xl p-6 border border-outline/20">
              <h2 className="font-headline text-lg text-on-surface mb-4 flex items-center gap-2">
                <Award className="w-5 h-5 text-orange-500" />
                Top Skills in Demand
              </h2>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={DEMO_TOP_SKILLS}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-outline, #e2e8f0)" opacity={0.3} />
                  <XAxis dataKey="skill" tick={{ fontSize: 11, fill: 'var(--color-on-surface-variant, #64748b)' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: 'var(--color-on-surface-variant, #64748b)' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="demand" name="Demand %" radius={[4, 4, 0, 0]}>
                    {DEMO_TOP_SKILLS.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Hiring Trends */}
          <div className="glass-card rounded-2xl p-6 border border-outline/20">
            <h2 className="font-headline text-lg text-on-surface mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-orange-500" />
              Hiring Trends
            </h2>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={DEMO_HIRING_TRENDS}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-outline, #e2e8f0)" opacity={0.3} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'var(--color-on-surface-variant, #64748b)' }} />
                <YAxis tick={{ fontSize: 12, fill: 'var(--color-on-surface-variant, #64748b)' }} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="hires" name="Hires" stroke="#f97316" strokeWidth={2} dot={{ r: 5 }} activeDot={{ r: 7 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
