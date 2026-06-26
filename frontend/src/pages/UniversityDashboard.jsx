import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../store/useAuthStore';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import {
  Users, TrendingUp, TrendingDown, Award, Briefcase, GraduationCap,
  Download, Calendar, Search, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle2, Clock, BookOpen, FileText, Activity
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Demo / Fallback Data
// ─────────────────────────────────────────────────────────────────────────────

const DEMO_WEEKLY_ACTIVITY = [
  { week: 'Week 1', activeUsers: 320, completions: 45 },
  { week: 'Week 2', activeUsers: 380, completions: 62 },
  { week: 'Week 3', activeUsers: 410, completions: 58 },
  { week: 'Week 4', activeUsers: 455, completions: 71 },
  { week: 'Week 5', activeUsers: 490, completions: 85 },
  { week: 'Week 6', activeUsers: 520, completions: 92 },
  { week: 'Week 7', activeUsers: 545, completions: 88 },
  { week: 'Week 8', activeUsers: 580, completions: 105 },
];

const DEMO_COURSE_COMPLETION = [
  { department: 'Computer Science', rate: 78 },
  { department: 'Electrical Eng.', rate: 65 },
  { department: 'Mechanical Eng.', rate: 58 },
  { department: 'Business Admin', rate: 72 },
  { department: 'Data Science', rate: 82 },
  { department: 'Design', rate: 69 },
];

const DEMO_SKILL_DISTRIBUTION = [
  { name: 'Programming', value: 340, color: '#6366f1' },
  { name: 'Data Analysis', value: 220, color: '#0ea5e9' },
  { name: 'Communication', value: 180, color: '#10b981' },
  { name: 'Problem Solving', value: 290, color: '#f59e0b' },
  { name: 'Design', value: 140, color: '#ef4444' },
  { name: 'Leadership', value: 110, color: '#8b5cf6' },
];

const DEMO_PLACEMENT_READINESS = [
  { name: 'Ready', value: 185, color: '#10b981' },
  { name: 'Almost Ready', value: 240, color: '#0ea5e9' },
  { name: 'Needs Work', value: 160, color: '#f59e0b' },
  { name: 'At Risk', value: 65, color: '#ef4444' },
];

const DEMO_AT_RISK_STUDENTS = [
  { id: 1, name: 'Arjun Mehta', department: 'Computer Science', skillScore: 32, resumeStatus: 'Not Uploaded', coursesCompleted: 2 },
  { id: 2, name: 'Priya Sharma', department: 'Business Admin', skillScore: 28, resumeStatus: 'Needs Revision', coursesCompleted: 1 },
  { id: 3, name: 'Rahul Gupta', department: 'Mechanical Eng.', skillScore: 35, resumeStatus: 'Not Uploaded', coursesCompleted: 3 },
  { id: 4, name: 'Sneha Patel', department: 'Data Science', skillScore: 22, resumeStatus: 'Draft', coursesCompleted: 0 },
  { id: 5, name: 'Vikram Singh', department: 'Electrical Eng.', skillScore: 30, resumeStatus: 'Not Uploaded', coursesCompleted: 1 },
  { id: 6, name: 'Anjali Reddy', department: 'Design', skillScore: 38, resumeStatus: 'Needs Revision', coursesCompleted: 2 },
  { id: 7, name: 'Deepak Kumar', department: 'Computer Science', skillScore: 25, resumeStatus: 'Not Uploaded', coursesCompleted: 1 },
  { id: 8, name: 'Kavitha Nair', department: 'Business Admin', skillScore: 33, resumeStatus: 'Draft', coursesCompleted: 2 },
];

const DEMO_DEPARTMENTS = [
  { name: 'Computer Science', studentCount: 245, avgScore: 74, placementRate: 82, topSkills: ['Python', 'React', 'ML'] },
  { name: 'Electrical Eng.', studentCount: 180, avgScore: 68, placementRate: 71, topSkills: ['VLSI', 'Embedded', 'IoT'] },
  { name: 'Mechanical Eng.', studentCount: 160, avgScore: 62, placementRate: 65, topSkills: ['CAD', 'Thermodynamics', 'FEA'] },
  { name: 'Business Admin', studentCount: 130, avgScore: 70, placementRate: 76, topSkills: ['Analytics', 'Marketing', 'Finance'] },
  { name: 'Data Science', studentCount: 95, avgScore: 79, placementRate: 88, topSkills: ['Python', 'SQL', 'Tableau'] },
  { name: 'Design', studentCount: 75, avgScore: 66, placementRate: 70, topSkills: ['Figma', 'UI/UX', 'Prototyping'] },
];

const DEMO_RECENT_ACTIVITY = [
  { id: 1, type: 'enrollment', message: '12 new students enrolled in AI Fundamentals', time: '2 hours ago', icon: 'school' },
  { id: 2, type: 'completion', message: 'Batch CS-2025 completed Resume Workshop', time: '4 hours ago', icon: 'task_alt' },
  { id: 3, type: 'assessment', message: '45 students completed Skill Assessment', time: '6 hours ago', icon: 'quiz' },
  { id: 4, type: 'placement', message: '3 students received placement offers', time: '1 day ago', icon: 'work' },
  { id: 5, type: 'enrollment', message: '8 students joined Mock Interview Prep', time: '1 day ago', icon: 'groups' },
  { id: 6, type: 'completion', message: 'Data Science batch completed Python module', time: '2 days ago', icon: 'task_alt' },
  { id: 7, type: 'assessment', message: 'Monthly placement readiness assessment completed', time: '3 days ago', icon: 'assessment' },
  { id: 8, type: 'placement', message: '5 students shortlisted by TCS', time: '3 days ago', icon: 'work' },
];

const DATE_RANGES = ['Last 7 Days', 'Last 30 Days', 'Last 90 Days', 'All Time'];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getScoreColor(score) {
  if (score >= 75) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 60) return 'text-blue-600 dark:text-blue-400';
  if (score >= 40) return 'text-amber-600 dark:text-amber-400';
  return 'text-rose-600 dark:text-rose-400';
}

function getResumeStatusBadge(status) {
  const map = {
    'Uploaded': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    'Needs Revision': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    'Draft': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    'Not Uploaded': 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  };
  return map[status] || 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';
}

function getActivityColor(type) {
  const map = {
    enrollment: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400',
    completion: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400',
    assessment: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400',
    placement: 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400',
  };
  return map[type] || 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-Components
// ─────────────────────────────────────────────────────────────────────────────

function KPICard({ title, value, change, trend, icon: Icon, color }) {
  const isPositive = trend === 'up';
  return (
    <div className="glass-card rounded-2xl p-6 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-on-surface-variant text-sm font-medium">{title}</span>
        <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
      <div className="font-headline text-3xl text-on-surface">{value}</div>
      <div className="flex items-center gap-1.5 text-sm">
        {isPositive ? (
          <TrendingUp className="w-4 h-4 text-emerald-500" />
        ) : (
          <TrendingDown className="w-4 h-4 text-rose-500" />
        )}
        <span className={isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
          {change}
        </span>
        <span className="text-on-surface-variant">vs last period</span>
      </div>
    </div>
  );
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

export default function UniversityDashboard() {
  const [dateRange, setDateRange] = useState('Last 30 Days');
  const [showDateDropdown, setShowDateDropdown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [students, setStudents] = useState(DEMO_AT_RISK_STUDENTS);
  const [departments, setDepartments] = useState(DEMO_DEPARTMENTS);
  const [weeklyActivity, setWeeklyActivity] = useState(DEMO_WEEKLY_ACTIVITY);
  const [courseCompletion, setCourseCompletion] = useState(DEMO_COURSE_COMPLETION);
  const [skillDistribution, setSkillDistribution] = useState(DEMO_SKILL_DISTRIBUTION);
  const [placementReadiness, setPlacementReadiness] = useState(DEMO_PLACEMENT_READINESS);
  const [recentActivity, setRecentActivity] = useState(DEMO_RECENT_ACTIVITY);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('skillScore');
  const [sortDir, setSortDir] = useState('asc');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const { data } = await api.get('/admin-panels/university/overview', { params: { range: dateRange } });
        if (data.kpis) setOverview(data.kpis);
        if (data.weeklyActivity) setWeeklyActivity(data.weeklyActivity);
        if (data.courseCompletion) setCourseCompletion(data.courseCompletion);
        if (data.skillDistribution) setSkillDistribution(data.skillDistribution);
        if (data.placementReadiness) setPlacementReadiness(data.placementReadiness);
        if (data.recentActivity) setRecentActivity(data.recentActivity);
      } catch {
        // keep demo data
      }
      try {
        const { data } = await api.get('/admin-panels/university/departments');
        if (data.departments) setDepartments(data.departments);
      } catch { /* keep demo */ }
      try {
        const { data } = await api.get('/admin-panels/university/students', { params: { status: 'at-risk' } });
        if (data.students) setStudents(data.students);
      } catch { /* keep demo */ }
      setLoading(false);
    };
    fetchData();
  }, [dateRange]);

  const kpis = overview || {
    totalStudents: { value: '1,285', change: '+8.2%', trend: 'up' },
    activeUsers: { value: '580', change: '+12.5%', trend: 'up' },
    avgSkillScore: { value: '68.4', change: '+3.1%', trend: 'up' },
    placementRate: { value: '74%', change: '-2.3%', trend: 'down' },
  };

  const totalReadiness = useMemo(
    () => placementReadiness.reduce((sum, r) => sum + r.value, 0),
    [placementReadiness]
  );

  const filteredStudents = useMemo(() => {
    let list = [...students];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(s => s.name.toLowerCase().includes(q) || s.department.toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (typeof aVal === 'number') return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      return sortDir === 'asc' ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
    });
    return list;
  }, [students, searchQuery, sortField, sortDir]);

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const handleExport = () => {
    const rows = [
      ['Name', 'Department', 'Skill Score', 'Resume Status', 'Courses Completed'],
      ...students.map(s => [s.name, s.department, s.skillScore, s.resumeStatus, s.coursesCompleted])
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'university_data.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <ChevronDown className="w-3.5 h-3.5 opacity-30" />;
    return sortDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />;
  };

  return (
    <div className="max-w-7xl mx-auto py-10 px-4 sm:px-6 lg:px-8 w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="font-headline text-3xl text-on-surface flex items-center gap-3">
            <span className="material-symbols-outlined text-4xl text-indigo-500" style={{ fontVariationSettings: "'FILL' 1" }}>school</span>
            University Dashboard
          </h1>
          <p className="text-on-surface-variant mt-1">Platform analytics and student performance overview</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Date Range Selector */}
          <div className="relative">
            <button
              onClick={() => setShowDateDropdown(!showDateDropdown)}
              className="glass-card rounded-xl px-4 py-2.5 flex items-center gap-2 text-sm text-on-surface hover:bg-surface-container/50 transition-colors border border-outline/20"
            >
              <Calendar className="w-4 h-4 text-on-surface-variant" />
              {dateRange}
              <ChevronDown className="w-4 h-4 text-on-surface-variant" />
            </button>
            {showDateDropdown && (
              <div className="absolute right-0 top-full mt-1 z-20 glass-card rounded-xl border border-outline/20 shadow-xl py-1 min-w-[160px]">
                {DATE_RANGES.map(range => (
                  <button
                    key={range}
                    onClick={() => { setDateRange(range); setShowDateDropdown(false); }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-surface-container/50 transition-colors ${dateRange === range ? 'text-indigo-600 dark:text-indigo-400 font-medium' : 'text-on-surface'}`}
                  >
                    {range}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Export */}
          <button
            onClick={handleExport}
            className="glass-card rounded-xl px-4 py-2.5 flex items-center gap-2 text-sm text-on-surface hover:bg-surface-container/50 transition-colors border border-outline/20"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <span className="material-symbols-outlined animate-spin text-3xl text-indigo-500">sync</span>
          <span className="ml-3 text-on-surface-variant">Loading dashboard data...</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KPICard title="Total Students" value={kpis.totalStudents?.value || '1,285'} change={kpis.totalStudents?.change || '+8.2%'} trend={kpis.totalStudents?.trend || 'up'} icon={Users} color="bg-indigo-500" />
        <KPICard title="Active Users" value={kpis.activeUsers?.value || '580'} change={kpis.activeUsers?.change || '+12.5%'} trend={kpis.activeUsers?.trend || 'up'} icon={Activity} color="bg-emerald-500" />
        <KPICard title="Avg. Skill Score" value={kpis.avgSkillScore?.value || '68.4'} change={kpis.avgSkillScore?.change || '+3.1%'} trend={kpis.avgSkillScore?.trend || 'up'} icon={Award} color="bg-amber-500" />
        <KPICard title="Placement Rate" value={kpis.placementRate?.value || '74%'} change={kpis.placementRate?.change || '-2.3%'} trend={kpis.placementRate?.trend || 'down'} icon={Briefcase} color="bg-purple-500" />
      </div>

      {/* Charts Row 1: Activity + Course Completion */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Student Progress Line Chart */}
        <div className="glass-card rounded-2xl p-6 border border-outline/20">
          <h2 className="font-headline text-lg text-on-surface mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-blue-500">trending_up</span>
            Student Progress
          </h2>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={weeklyActivity}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-outline, #e2e8f0)" opacity={0.3} />
              <XAxis dataKey="week" tick={{ fontSize: 12, fill: 'var(--color-on-surface-variant, #64748b)' }} />
              <YAxis tick={{ fontSize: 12, fill: 'var(--color-on-surface-variant, #64748b)' }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Line type="monotone" dataKey="activeUsers" name="Active Users" stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey="completions" name="Completions" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Course Completion Bar Chart */}
        <div className="glass-card rounded-2xl p-6 border border-outline/20">
          <h2 className="font-headline text-lg text-on-surface mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-emerald-500">bar_chart</span>
            Course Completion by Department
          </h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={courseCompletion} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-outline, #e2e8f0)" opacity={0.3} />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12, fill: 'var(--color-on-surface-variant, #64748b)' }} />
              <YAxis dataKey="department" type="category" width={120} tick={{ fontSize: 11, fill: 'var(--color-on-surface-variant, #64748b)' }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="rate" name="Completion %" fill="#6366f1" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts Row 2: Skill Distribution + Placement Readiness */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Skill Distribution Pie Chart */}
        <div className="glass-card rounded-2xl p-6 border border-outline/20">
          <h2 className="font-headline text-lg text-on-surface mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-500">pie_chart</span>
            Skill Distribution
          </h2>
          <div className="flex flex-col md:flex-row items-center gap-4">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={skillDistribution}
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  innerRadius={45}
                  dataKey="value"
                  nameKey="name"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {skillDistribution.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-3 mt-3 justify-center">
            {skillDistribution.map((s, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                {s.name}: {s.value}
              </div>
            ))}
          </div>
        </div>

        {/* Placement Readiness Donut */}
        <div className="glass-card rounded-2xl p-6 border border-outline/20">
          <h2 className="font-headline text-lg text-on-surface mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-purple-500">target</span>
            Placement Readiness
          </h2>
          <div className="flex flex-col md:flex-row items-center gap-6">
            <ResponsiveContainer width="50%" height={220}>
              <PieChart>
                <Pie
                  data={placementReadiness}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  dataKey="value"
                  nameKey="name"
                >
                  {placementReadiness.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-3 flex-1">
              {placementReadiness.map((item, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-sm text-on-surface">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-on-surface">{item.value}</span>
                    <span className="text-xs text-on-surface-variant">({totalReadiness > 0 ? Math.round((item.value / totalReadiness) * 100) : 0}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* At-Risk Students Table */}
      <div className="glass-card rounded-2xl p-6 border border-outline/20 mb-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
          <h2 className="font-headline text-lg text-on-surface flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-500" />
            At-Risk Students
          </h2>
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input
              type="text"
              placeholder="Search students..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-surface-container/50 border border-outline/20 text-on-surface text-sm placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline/20">
                {[
                  { key: 'name', label: 'Name' },
                  { key: 'department', label: 'Department' },
                  { key: 'skillScore', label: 'Skill Score' },
                  { key: 'resumeStatus', label: 'Resume Status' },
                  { key: 'coursesCompleted', label: 'Courses' },
                ].map(col => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className="text-left py-3 px-4 text-on-surface-variant font-medium cursor-pointer hover:text-on-surface transition-colors select-none"
                  >
                    <span className="flex items-center gap-1">
                      {col.label}
                      <SortIcon field={col.key} />
                    </span>
                  </th>
                ))}
                <th className="text-left py-3 px-4 text-on-surface-variant font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map(student => (
                <tr key={student.id} className="border-b border-outline/10 hover:bg-surface-container/50 transition-colors">
                  <td className="py-3 px-4 text-on-surface font-medium">{student.name}</td>
                  <td className="py-3 px-4 text-on-surface-variant">{student.department}</td>
                  <td className="py-3 px-4">
                    <span className={`font-semibold ${getScoreColor(student.skillScore)}`}>{student.skillScore}</span>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${getResumeStatusBadge(student.resumeStatus)}`}>
                      {student.resumeStatus}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-on-surface-variant">{student.coursesCompleted}</td>
                  <td className="py-3 px-4">
                    <button className="text-indigo-600 dark:text-indigo-400 text-xs font-medium hover:underline">
                      View Profile
                    </button>
                  </td>
                </tr>
              ))}
              {filteredStudents.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-on-surface-variant">No students match your search.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Department Breakdown */}
      <div className="glass-card rounded-2xl p-6 border border-outline/20 mb-8">
        <h2 className="font-headline text-lg text-on-surface mb-4 flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-indigo-500" />
          Department Breakdown
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline/20">
                <th className="text-left py-3 px-4 text-on-surface-variant font-medium">Department</th>
                <th className="text-left py-3 px-4 text-on-surface-variant font-medium">Students</th>
                <th className="text-left py-3 px-4 text-on-surface-variant font-medium">Avg Score</th>
                <th className="text-left py-3 px-4 text-on-surface-variant font-medium">Placement Rate</th>
                <th className="text-left py-3 px-4 text-on-surface-variant font-medium">Top Skills</th>
              </tr>
            </thead>
            <tbody>
              {departments.map((dept, i) => (
                <tr key={i} className="border-b border-outline/10 hover:bg-surface-container/50 transition-colors">
                  <td className="py-3 px-4 text-on-surface font-medium">{dept.name}</td>
                  <td className="py-3 px-4 text-on-surface-variant">{dept.studentCount}</td>
                  <td className="py-3 px-4">
                    <span className={`font-semibold ${getScoreColor(dept.avgScore)}`}>{dept.avgScore}</span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-2 bg-surface-container/50 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-indigo-500"
                          style={{ width: `${dept.placementRate}%` }}
                        />
                      </div>
                      <span className="text-on-surface-variant text-xs">{dept.placementRate}%</span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap gap-1.5">
                      {dept.topSkills.map((skill, j) => (
                        <span key={j} className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 text-xs">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Activity Feed */}
      <div className="glass-card rounded-2xl p-6 border border-outline/20">
        <h2 className="font-headline text-lg text-on-surface mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-blue-500" />
          Recent Activity
        </h2>
        <div className="space-y-3">
          {recentActivity.map((item) => (
            <div key={item.id} className="flex items-start gap-3 py-2 border-b border-outline/10 last:border-0">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${getActivityColor(item.type)}`}>
                <span className="material-symbols-outlined text-lg">{item.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-on-surface">{item.message}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">{item.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
