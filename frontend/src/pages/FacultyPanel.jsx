import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../store/useAuthStore';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import {
  BookOpen, Users, CheckCircle2, Clock, Plus, Send, Upload,
  FileText, Award, ChevronDown, ChevronUp, Search, X,
  ClipboardList, BarChart3, Megaphone, PenLine, Download
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Demo / Fallback Data
// ─────────────────────────────────────────────────────────────────────────────

const DEMO_COURSES = [
  { id: 1, name: 'Data Structures & Algorithms', code: 'CS301', students: 64, completionRate: 78, avgScore: 72, semester: 'Fall 2025' },
  { id: 2, name: 'Machine Learning Fundamentals', code: 'CS405', students: 48, completionRate: 65, avgScore: 68, semester: 'Fall 2025' },
  { id: 3, name: 'Web Development', code: 'CS202', students: 55, completionRate: 82, avgScore: 76, semester: 'Fall 2025' },
  { id: 4, name: 'Database Systems', code: 'CS303', students: 42, completionRate: 71, avgScore: 70, semester: 'Fall 2025' },
];

const DEMO_ASSIGNMENTS = [
  { id: 1, title: 'Binary Tree Implementation', courseId: 1, courseName: 'CS301', dueDate: '2025-11-15', submissions: 58, total: 64, status: 'active', maxMarks: 100 },
  { id: 2, title: 'Linear Regression Project', courseId: 2, courseName: 'CS405', dueDate: '2025-11-20', submissions: 32, total: 48, status: 'active', maxMarks: 50 },
  { id: 3, title: 'REST API Design', courseId: 3, courseName: 'CS202', dueDate: '2025-11-10', submissions: 55, total: 55, status: 'graded', maxMarks: 100 },
  { id: 4, title: 'SQL Query Optimization', courseId: 4, courseName: 'CS303', dueDate: '2025-11-08', submissions: 40, total: 42, status: 'graded', maxMarks: 75 },
  { id: 5, title: 'Graph Algorithms Quiz', courseId: 1, courseName: 'CS301', dueDate: '2025-11-25', submissions: 0, total: 64, status: 'upcoming', maxMarks: 30 },
  { id: 6, title: 'Neural Network Lab', courseId: 2, courseName: 'CS405', dueDate: '2025-12-01', submissions: 0, total: 48, status: 'upcoming', maxMarks: 100 },
];

const DEMO_SUBMISSIONS = [
  { id: 1, studentName: 'Aditya Verma', submittedDate: '2025-11-14', score: 88, status: 'graded' },
  { id: 2, studentName: 'Meera Krishnan', submittedDate: '2025-11-14', score: 92, status: 'graded' },
  { id: 3, studentName: 'Rohit Joshi', submittedDate: '2025-11-13', score: null, status: 'pending' },
  { id: 4, studentName: 'Sanya Gupta', submittedDate: '2025-11-15', score: 76, status: 'graded' },
  { id: 5, studentName: 'Kunal Desai', submittedDate: '2025-11-14', score: null, status: 'pending' },
  { id: 6, studentName: 'Pooja Rao', submittedDate: '2025-11-12', score: 95, status: 'graded' },
];

const DEMO_STUDENTS = [
  { id: 1, name: 'Aditya Verma', course: 'CS301', quizAvg: 82, assignmentAvg: 88, overallGrade: 'A', attendance: 92 },
  { id: 2, name: 'Meera Krishnan', course: 'CS301', quizAvg: 90, assignmentAvg: 92, overallGrade: 'A+', attendance: 96 },
  { id: 3, name: 'Rohit Joshi', course: 'CS405', quizAvg: 65, assignmentAvg: 70, overallGrade: 'B', attendance: 78 },
  { id: 4, name: 'Sanya Gupta', course: 'CS202', quizAvg: 74, assignmentAvg: 76, overallGrade: 'B+', attendance: 85 },
  { id: 5, name: 'Kunal Desai', course: 'CS303', quizAvg: 58, assignmentAvg: 62, overallGrade: 'C+', attendance: 70 },
  { id: 6, name: 'Pooja Rao', course: 'CS301', quizAvg: 95, assignmentAvg: 94, overallGrade: 'A+', attendance: 98 },
  { id: 7, name: 'Arjun Mehta', course: 'CS405', quizAvg: 72, assignmentAvg: 68, overallGrade: 'B', attendance: 82 },
  { id: 8, name: 'Nisha Patel', course: 'CS202', quizAvg: 80, assignmentAvg: 85, overallGrade: 'A', attendance: 90 },
  { id: 9, name: 'Vikram Singh', course: 'CS303', quizAvg: 45, assignmentAvg: 50, overallGrade: 'D', attendance: 60 },
  { id: 10, name: 'Divya Sharma', course: 'CS301', quizAvg: 88, assignmentAvg: 82, overallGrade: 'A', attendance: 94 },
  { id: 11, name: 'Ravi Kumar', course: 'CS405', quizAvg: 55, assignmentAvg: 60, overallGrade: 'C', attendance: 72 },
  { id: 12, name: 'Ananya Reddy', course: 'CS202', quizAvg: 78, assignmentAvg: 80, overallGrade: 'B+', attendance: 88 },
];

const DEMO_PERFORMANCE_CHART = [
  { assignment: 'Assignment 1', classAvg: 72, highest: 98, lowest: 35 },
  { assignment: 'Assignment 2', classAvg: 68, highest: 95, lowest: 28 },
  { assignment: 'Assignment 3', classAvg: 75, highest: 100, lowest: 42 },
  { assignment: 'Quiz 1', classAvg: 70, highest: 92, lowest: 30 },
  { assignment: 'Midterm', classAvg: 65, highest: 96, lowest: 25 },
  { assignment: 'Assignment 4', classAvg: 78, highest: 100, lowest: 45 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getGradeColor(grade) {
  if (grade.startsWith('A')) return 'text-emerald-600 dark:text-emerald-400';
  if (grade.startsWith('B')) return 'text-blue-600 dark:text-blue-400';
  if (grade.startsWith('C')) return 'text-amber-600 dark:text-amber-400';
  return 'text-rose-600 dark:text-rose-400';
}

function getStatusBadge(status) {
  const map = {
    active: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    graded: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    upcoming: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    pending: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  };
  return map[status] || 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

export default function FacultyPanel() {
  const [activeTab, setActiveTab] = useState('courses');
  const [courses, setCourses] = useState(DEMO_COURSES);
  const [assignments, setAssignments] = useState(DEMO_ASSIGNMENTS);
  const [students, setStudents] = useState(DEMO_STUDENTS);
  const [performanceData, setPerformanceData] = useState(DEMO_PERFORMANCE_CHART);
  const [loading, setLoading] = useState(true);

  // Assignment form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newAssignment, setNewAssignment] = useState({ title: '', description: '', dueDate: '', courseId: '', maxMarks: 100 });
  const [creating, setCreating] = useState(false);

  // Submissions view
  const [viewingSubmissions, setViewingSubmissions] = useState(null);
  const [submissions, setSubmissions] = useState(DEMO_SUBMISSIONS);

  // Student detail
  const [selectedStudent, setSelectedStudent] = useState(null);

  // Filters
  const [courseFilter, setCourseFilter] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('name');
  const [sortDir, setSortDir] = useState('asc');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [coursesRes, assignmentsRes, studentsRes] = await Promise.allSettled([
          api.get('/admin-panels/faculty/courses'),
          api.get('/admin-panels/faculty/assignments'),
          api.get('/admin-panels/faculty/students'),
        ]);
        if (coursesRes.status === 'fulfilled' && coursesRes.value.data.courses) setCourses(coursesRes.value.data.courses);
        if (assignmentsRes.status === 'fulfilled' && assignmentsRes.value.data.assignments) setAssignments(assignmentsRes.value.data.assignments);
        if (studentsRes.status === 'fulfilled' && studentsRes.value.data.students) setStudents(studentsRes.value.data.students);
      } catch { /* keep demo */ }
      setLoading(false);
    };
    fetchData();
  }, []);

  const handleCreateAssignment = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const { data } = await api.post('/admin-panels/faculty/assignments', newAssignment);
      if (data.assignment) setAssignments(prev => [...prev, data.assignment]);
      setNewAssignment({ title: '', description: '', dueDate: '', courseId: '', maxMarks: 100 });
      setShowCreateForm(false);
    } catch {
      // Add locally as fallback
      const fallback = {
        id: Date.now(),
        title: newAssignment.title,
        courseId: Number(newAssignment.courseId),
        courseName: courses.find(c => c.id === Number(newAssignment.courseId))?.code || 'N/A',
        dueDate: newAssignment.dueDate,
        submissions: 0,
        total: courses.find(c => c.id === Number(newAssignment.courseId))?.students || 0,
        status: 'upcoming',
        maxMarks: Number(newAssignment.maxMarks),
      };
      setAssignments(prev => [...prev, fallback]);
      setNewAssignment({ title: '', description: '', dueDate: '', courseId: '', maxMarks: 100 });
      setShowCreateForm(false);
    }
    setCreating(false);
  };

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const filteredStudents = useMemo(() => {
    let list = [...students];
    if (courseFilter) list = list.filter(s => s.course === courseFilter);
    if (gradeFilter) list = list.filter(s => s.overallGrade.startsWith(gradeFilter));
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(s => s.name.toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (typeof aVal === 'number') return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      return sortDir === 'asc' ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
    });
    return list;
  }, [students, courseFilter, gradeFilter, searchQuery, sortField, sortDir]);

  const uniqueCourses = useMemo(() => [...new Set(students.map(s => s.course))], [students]);

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <ChevronDown className="w-3.5 h-3.5 opacity-30" />;
    return sortDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />;
  };

  const tabs = [
    { id: 'courses', label: 'My Courses', icon: BookOpen },
    { id: 'assignments', label: 'Assignments', icon: ClipboardList },
    { id: 'students', label: 'Student Performance', icon: Users },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  ];

  return (
    <div className="max-w-7xl mx-auto py-10 px-4 sm:px-6 lg:px-8 w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="font-headline text-3xl text-on-surface flex items-center gap-3">
            <span className="material-symbols-outlined text-4xl text-teal-500" style={{ fontVariationSettings: "'FILL' 1" }}>person</span>
            Faculty Panel
          </h1>
          <p className="text-on-surface-variant mt-1">Manage courses, assignments, and student performance</p>
        </div>
        {/* Quick Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <button className="glass-card rounded-xl px-3 py-2 flex items-center gap-1.5 text-xs text-on-surface hover:bg-surface-container/50 transition-colors border border-outline/20">
            <Megaphone className="w-3.5 h-3.5" /> Announce
          </button>
          <button className="glass-card rounded-xl px-3 py-2 flex items-center gap-1.5 text-xs text-on-surface hover:bg-surface-container/50 transition-colors border border-outline/20">
            <PenLine className="w-3.5 h-3.5" /> Create Quiz
          </button>
          <button className="glass-card rounded-xl px-3 py-2 flex items-center gap-1.5 text-xs text-on-surface hover:bg-surface-container/50 transition-colors border border-outline/20">
            <Upload className="w-3.5 h-3.5" /> Upload Material
          </button>
          <button className="glass-card rounded-xl px-3 py-2 flex items-center gap-1.5 text-xs text-on-surface hover:bg-surface-container/50 transition-colors border border-outline/20">
            <Download className="w-3.5 h-3.5" /> Export Grades
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
          <span className="material-symbols-outlined animate-spin text-3xl text-teal-500">sync</span>
          <span className="ml-3 text-on-surface-variant">Loading faculty data...</span>
        </div>
      )}

      {/* ─── My Courses Tab ─── */}
      {activeTab === 'courses' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {courses.map(course => (
            <div key={course.id} className="glass-card rounded-2xl p-6 border border-outline/20 hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-headline text-lg text-on-surface">{course.name}</h3>
                  <p className="text-sm text-on-surface-variant">{course.code} &middot; {course.semester}</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-teal-500 flex items-center justify-center">
                  <BookOpen className="w-5 h-5 text-white" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 mt-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-on-surface">{course.students}</div>
                  <div className="text-xs text-on-surface-variant">Students</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{course.completionRate}%</div>
                  <div className="text-xs text-on-surface-variant">Completion</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{course.avgScore}</div>
                  <div className="text-xs text-on-surface-variant">Avg Score</div>
                </div>
              </div>
              <div className="mt-4">
                <div className="w-full h-2 bg-surface-container/50 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-teal-500" style={{ width: `${course.completionRate}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Assignments Tab ─── */}
      {activeTab === 'assignments' && (
        <div>
          {/* Submissions modal */}
          {viewingSubmissions && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setViewingSubmissions(null)}>
              <div className="glass-card rounded-2xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto border border-outline/20" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-headline text-lg text-on-surface">Submissions: {viewingSubmissions.title}</h3>
                  <button onClick={() => setViewingSubmissions(null)} className="text-on-surface-variant hover:text-on-surface"><X className="w-5 h-5" /></button>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-outline/20">
                      <th className="text-left py-2 text-on-surface-variant font-medium">Student</th>
                      <th className="text-left py-2 text-on-surface-variant font-medium">Submitted</th>
                      <th className="text-left py-2 text-on-surface-variant font-medium">Score</th>
                      <th className="text-left py-2 text-on-surface-variant font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {submissions.map(sub => (
                      <tr key={sub.id} className="border-b border-outline/10">
                        <td className="py-2 text-on-surface">{sub.studentName}</td>
                        <td className="py-2 text-on-surface-variant">{formatDate(sub.submittedDate)}</td>
                        <td className="py-2 text-on-surface font-medium">{sub.score !== null ? sub.score : '-'}</td>
                        <td className="py-2">
                          <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${getStatusBadge(sub.status)}`}>{sub.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mb-4">
            <h2 className="font-headline text-lg text-on-surface">All Assignments</h2>
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Assignment
            </button>
          </div>

          {/* Create Assignment Form */}
          {showCreateForm && (
            <div className="glass-card rounded-2xl p-6 border border-outline/20 mb-6">
              <h3 className="font-headline text-base text-on-surface mb-4">New Assignment</h3>
              <form onSubmit={handleCreateAssignment} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm text-on-surface-variant mb-1">Title</label>
                  <input
                    type="text"
                    required
                    value={newAssignment.title}
                    onChange={e => setNewAssignment(p => ({ ...p, title: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl bg-surface-container/50 border border-outline/20 text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                    placeholder="Assignment title"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm text-on-surface-variant mb-1">Description</label>
                  <textarea
                    value={newAssignment.description}
                    onChange={e => setNewAssignment(p => ({ ...p, description: e.target.value }))}
                    rows={3}
                    className="w-full px-4 py-2.5 rounded-xl bg-surface-container/50 border border-outline/20 text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 resize-none"
                    placeholder="Assignment description..."
                  />
                </div>
                <div>
                  <label className="block text-sm text-on-surface-variant mb-1">Course</label>
                  <select
                    required
                    value={newAssignment.courseId}
                    onChange={e => setNewAssignment(p => ({ ...p, courseId: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl bg-surface-container/50 border border-outline/20 text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                  >
                    <option value="">Select course</option>
                    {courses.map(c => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-on-surface-variant mb-1">Due Date</label>
                  <input
                    type="date"
                    required
                    value={newAssignment.dueDate}
                    onChange={e => setNewAssignment(p => ({ ...p, dueDate: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl bg-surface-container/50 border border-outline/20 text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                  />
                </div>
                <div>
                  <label className="block text-sm text-on-surface-variant mb-1">Max Marks</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={newAssignment.maxMarks}
                    onChange={e => setNewAssignment(p => ({ ...p, maxMarks: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl bg-surface-container/50 border border-outline/20 text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <button
                    type="submit"
                    disabled={creating}
                    className="px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {creating ? 'Creating...' : 'Create'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="px-4 py-2.5 text-on-surface-variant hover:text-on-surface text-sm transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Assignments list */}
          <div className="space-y-3">
            {assignments.map(a => (
              <div key={a.id} className="glass-card rounded-2xl p-5 border border-outline/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-on-surface font-medium truncate">{a.title}</h3>
                    <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${getStatusBadge(a.status)}`}>{a.status}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-on-surface-variant">
                    <span>{a.courseName}</span>
                    <span>Due: {formatDate(a.dueDate)}</span>
                    <span>Max: {a.maxMarks} marks</span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <div className="text-lg font-bold text-on-surface">{a.submissions}/{a.total}</div>
                    <div className="text-xs text-on-surface-variant">Submissions</div>
                  </div>
                  {a.submissions > 0 && (
                    <button
                      onClick={() => setViewingSubmissions(a)}
                      className="px-3 py-1.5 text-teal-600 dark:text-teal-400 text-xs font-medium hover:underline"
                    >
                      View
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Student Performance Tab ─── */}
      {activeTab === 'students' && (
        <div>
          {/* Student detail modal */}
          {selectedStudent && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedStudent(null)}>
              <div className="glass-card rounded-2xl p-6 max-w-md w-full border border-outline/20" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-headline text-lg text-on-surface">{selectedStudent.name}</h3>
                  <button onClick={() => setSelectedStudent(null)} className="text-on-surface-variant hover:text-on-surface"><X className="w-5 h-5" /></button>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="glass-card rounded-xl p-4 border border-outline/20 text-center">
                      <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{selectedStudent.quizAvg}</div>
                      <div className="text-xs text-on-surface-variant mt-1">Quiz Average</div>
                    </div>
                    <div className="glass-card rounded-xl p-4 border border-outline/20 text-center">
                      <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{selectedStudent.assignmentAvg}</div>
                      <div className="text-xs text-on-surface-variant mt-1">Assignment Avg</div>
                    </div>
                    <div className="glass-card rounded-xl p-4 border border-outline/20 text-center">
                      <div className={`text-2xl font-bold ${getGradeColor(selectedStudent.overallGrade)}`}>{selectedStudent.overallGrade}</div>
                      <div className="text-xs text-on-surface-variant mt-1">Overall Grade</div>
                    </div>
                    <div className="glass-card rounded-xl p-4 border border-outline/20 text-center">
                      <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{selectedStudent.attendance}%</div>
                      <div className="text-xs text-on-surface-variant mt-1">Attendance</div>
                    </div>
                  </div>
                  <div className="text-sm text-on-surface-variant">
                    <span className="font-medium text-on-surface">Course:</span> {selectedStudent.course}
                  </div>
                  <div className="w-full bg-surface-container/50 rounded-full h-3 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500" style={{ width: `${selectedStudent.attendance}%` }} />
                  </div>
                  <p className="text-xs text-on-surface-variant text-center">Attendance: {selectedStudent.attendance}%</p>
                </div>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
              <input
                type="text"
                placeholder="Search students..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-surface-container/50 border border-outline/20 text-on-surface text-sm placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-teal-500/30"
              />
            </div>
            <select
              value={courseFilter}
              onChange={e => setCourseFilter(e.target.value)}
              className="px-4 py-2.5 rounded-xl bg-surface-container/50 border border-outline/20 text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30"
            >
              <option value="">All Courses</option>
              {uniqueCourses.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              value={gradeFilter}
              onChange={e => setGradeFilter(e.target.value)}
              className="px-4 py-2.5 rounded-xl bg-surface-container/50 border border-outline/20 text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30"
            >
              <option value="">All Grades</option>
              <option value="A">A range</option>
              <option value="B">B range</option>
              <option value="C">C range</option>
              <option value="D">D range</option>
            </select>
          </div>

          {/* Students table */}
          <div className="glass-card rounded-2xl border border-outline/20 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-container/50 border-b border-outline/20">
                    {[
                      { key: 'name', label: 'Student Name' },
                      { key: 'course', label: 'Course' },
                      { key: 'quizAvg', label: 'Quiz Avg' },
                      { key: 'assignmentAvg', label: 'Assignment Avg' },
                      { key: 'overallGrade', label: 'Grade' },
                      { key: 'attendance', label: 'Attendance' },
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
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map(student => (
                    <tr
                      key={student.id}
                      onClick={() => setSelectedStudent(student)}
                      className="border-b border-outline/10 hover:bg-surface-container/50 transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-4 text-on-surface font-medium">{student.name}</td>
                      <td className="py-3 px-4 text-on-surface-variant">{student.course}</td>
                      <td className="py-3 px-4 text-on-surface">{student.quizAvg}</td>
                      <td className="py-3 px-4 text-on-surface">{student.assignmentAvg}</td>
                      <td className="py-3 px-4">
                        <span className={`font-semibold ${getGradeColor(student.overallGrade)}`}>{student.overallGrade}</span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 bg-surface-container/50 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-teal-500" style={{ width: `${student.attendance}%` }} />
                          </div>
                          <span className="text-xs text-on-surface-variant">{student.attendance}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredStudents.length === 0 && (
                    <tr><td colSpan={6} className="py-8 text-center text-on-surface-variant">No students match your filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── Analytics Tab ─── */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          <div className="glass-card rounded-2xl p-6 border border-outline/20">
            <h2 className="font-headline text-lg text-on-surface mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-teal-500" />
              Class Performance Comparison
            </h2>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={performanceData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-outline, #e2e8f0)" opacity={0.3} />
                <XAxis dataKey="assignment" tick={{ fontSize: 11, fill: 'var(--color-on-surface-variant, #64748b)' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: 'var(--color-on-surface-variant, #64748b)' }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar dataKey="classAvg" name="Class Average" fill="#14b8a6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="highest" name="Highest" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="lowest" name="Lowest" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Course summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {courses.map(course => (
              <div key={course.id} className="glass-card rounded-2xl p-5 border border-outline/20 text-center">
                <div className="text-sm text-on-surface-variant mb-1">{course.code}</div>
                <div className="text-2xl font-bold text-on-surface">{course.avgScore}</div>
                <div className="text-xs text-on-surface-variant">Class Average</div>
                <div className="mt-3 w-full h-2 bg-surface-container/50 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-teal-500" style={{ width: `${course.avgScore}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
