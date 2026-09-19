'use strict';

/**
 * Worker port of backend/src/routes/adminPanels.js (12 endpoints).   (T3B, ADR-001 section 7)
 *
 *   /university/{overview,students,departments}         requireRole('admin','university')
 *   /faculty/{courses,assignments(GET,POST),students}   requireRole('admin','faculty')
 *   /recruiter/{search,shortlist(GET,POST),jobs(POST,GET)} requireRole('admin','recruiter')
 *
 * Every endpoint is authenticateToken -> requireRole(...), in that order (no file-level use()).
 * requireRole is defined locally in the Express file, so it is re-implemented here and tagged
 * {kind:'role', roles:[...]} for route introspection (manifest `roles`). It reads the CURRENT role
 * from the users table on every request, answers 403 {"error":"Insufficient permissions"} for a
 * missing user or a role outside the list, and 500 {"error":"Authorization check failed"} when the
 * lookup throws. Fails closed: next() runs only after a row whose role is in the list was read.
 *
 * The data is demo/fallback data held in module-scope arrays, like Express, and three handlers
 * MUTATE it (POST /faculty/assignments, POST /recruiter/jobs, POST /recruiter/shortlist).
 * PLATFORM DEVIATION (documented, not fixable without a behaviour change): on Render one process
 * holds one copy, on Workers every isolate holds its own, so those writes are per-isolate and are
 * lost when the isolate is recycled. A created assignment/job or a shortlist move can therefore
 * vanish or differ between consecutive requests. Persisting them would be a behaviour change and is
 * left to a post-cutover decision (see docs/migration/wave/auth.md).
 */
const { createRouter } = require('../lib/routes');
const { authenticateToken } = require('../middleware/auth');
const { tagMiddleware } = require('../lib/tag');
const { getDb } = require('../db');
const { getBody, getQuery } = require('../lib/http');

const router = createRouter();

const requireRole = (...roles) => {
  return tagMiddleware(async (c, next) => {
    try {
      const result = await getDb(c).query('SELECT role FROM users WHERE id = $1', [c.get('user').id]);
      if (result.rows.length === 0 || !roles.includes(result.rows[0].role)) {
        return c.json({ error: 'Insufficient permissions' }, 403);
      }
    } catch (err) {
      return c.json({ error: 'Authorization check failed' }, 500);
    }
    return next();
  }, `requireRole(${roles.join(',')})`, { kind: 'role', roles: [...roles] });
};

// ─────────────────────────────────────────────────────────────────────────────
// Demo / Fallback Data
// ─────────────────────────────────────────────────────────────────────────────

const DEMO_STUDENTS = [
  { id: 1, name: 'Aditya Verma', department: 'Computer Science', skillScore: 88, gpa: 3.8, year: 2025, location: 'Bangalore', skills: ['React', 'Node.js', 'Python', 'AWS'], resumeStatus: 'Uploaded', coursesCompleted: 8, resumeUrl: '#', portfolioUrl: '#', githubUrl: '#', linkedinUrl: '#', projects: ['E-commerce Platform', 'ML Pipeline Dashboard'] },
  { id: 2, name: 'Meera Krishnan', department: 'Data Science', skillScore: 92, gpa: 3.9, year: 2025, location: 'Chennai', skills: ['Python', 'TensorFlow', 'SQL', 'Tableau'], resumeStatus: 'Uploaded', coursesCompleted: 9, resumeUrl: '#', portfolioUrl: '#', githubUrl: '#', linkedinUrl: '#', projects: ['Sentiment Analyzer', 'Fraud Detection System'] },
  { id: 3, name: 'Rohit Joshi', department: 'Computer Science', skillScore: 76, gpa: 3.5, year: 2025, location: 'Pune', skills: ['Java', 'Spring Boot', 'Docker', 'Kubernetes'], resumeStatus: 'Needs Revision', coursesCompleted: 6, resumeUrl: '#', portfolioUrl: null, githubUrl: '#', linkedinUrl: '#', projects: ['Microservices Architecture'] },
  { id: 4, name: 'Sanya Gupta', department: 'Design', skillScore: 84, gpa: 3.7, year: 2025, location: 'Mumbai', skills: ['Figma', 'UI/UX', 'Adobe XD', 'Prototyping'], resumeStatus: 'Uploaded', coursesCompleted: 7, resumeUrl: '#', portfolioUrl: '#', githubUrl: null, linkedinUrl: '#', projects: ['Banking App Redesign', 'Design System'] },
  { id: 5, name: 'Kunal Desai', department: 'Computer Science', skillScore: 70, gpa: 3.3, year: 2026, location: 'Hyderabad', skills: ['Python', 'Django', 'React', 'PostgreSQL'], resumeStatus: 'Draft', coursesCompleted: 4, resumeUrl: '#', portfolioUrl: '#', githubUrl: '#', linkedinUrl: '#', projects: ['Task Management App'] },
  { id: 6, name: 'Pooja Rao', department: 'Data Science', skillScore: 95, gpa: 4.0, year: 2025, location: 'Bangalore', skills: ['R', 'Python', 'ML', 'Statistics', 'NLP'], resumeStatus: 'Uploaded', coursesCompleted: 10, resumeUrl: '#', portfolioUrl: '#', githubUrl: '#', linkedinUrl: '#', projects: ['NLP Chatbot', 'Climate Data Analysis', 'Predictive Analytics'] },
  { id: 7, name: 'Arjun Mehta', department: 'Electrical Eng.', skillScore: 72, gpa: 3.4, year: 2025, location: 'Delhi', skills: ['Embedded C', 'IoT', 'FPGA', 'Verilog'], resumeStatus: 'Not Uploaded', coursesCompleted: 5, resumeUrl: '#', portfolioUrl: null, githubUrl: '#', linkedinUrl: '#', projects: ['Smart Home System'] },
  { id: 8, name: 'Nisha Patel', department: 'Business Admin', skillScore: 68, gpa: 3.6, year: 2026, location: 'Ahmedabad', skills: ['Analytics', 'Excel', 'Tableau', 'SQL'], resumeStatus: 'Draft', coursesCompleted: 3, resumeUrl: '#', portfolioUrl: null, githubUrl: null, linkedinUrl: '#', projects: ['Market Analysis Dashboard'] },
  { id: 9, name: 'Vikram Singh', department: 'Computer Science', skillScore: 82, gpa: 3.7, year: 2025, location: 'Bangalore', skills: ['Go', 'Rust', 'Systems Programming', 'Linux'], resumeStatus: 'Uploaded', coursesCompleted: 7, resumeUrl: '#', portfolioUrl: '#', githubUrl: '#', linkedinUrl: '#', projects: ['Distributed KV Store', 'CLI Tool Suite'] },
  { id: 10, name: 'Divya Sharma', department: 'Design', skillScore: 86, gpa: 3.8, year: 2025, location: 'Mumbai', skills: ['UI/UX', 'Figma', 'Motion Design', 'Research'], resumeStatus: 'Uploaded', coursesCompleted: 8, resumeUrl: '#', portfolioUrl: '#', githubUrl: null, linkedinUrl: '#', projects: ['Healthcare App', 'Brand Identity System'] },
  { id: 11, name: 'Ravi Kumar', department: 'Mechanical Eng.', skillScore: 64, gpa: 3.2, year: 2026, location: 'Chennai', skills: ['CAD', 'MATLAB', 'Python', 'FEA'], resumeStatus: 'Needs Revision', coursesCompleted: 3, resumeUrl: '#', portfolioUrl: null, githubUrl: '#', linkedinUrl: '#', projects: ['Drone Optimization'] },
  { id: 12, name: 'Ananya Reddy', department: 'Computer Science', skillScore: 78, gpa: 3.6, year: 2025, location: 'Hyderabad', skills: ['Flutter', 'Dart', 'Firebase', 'Swift'], resumeStatus: 'Uploaded', coursesCompleted: 6, resumeUrl: '#', portfolioUrl: '#', githubUrl: '#', linkedinUrl: '#', projects: ['Food Delivery App', 'Fitness Tracker'] },
  { id: 13, name: 'Priya Sharma', department: 'Business Admin', skillScore: 28, gpa: 2.6, year: 2025, location: 'Jaipur', skills: ['Excel'], resumeStatus: 'Not Uploaded', coursesCompleted: 1, resumeUrl: null, portfolioUrl: null, githubUrl: null, linkedinUrl: null, projects: [] },
  { id: 14, name: 'Rahul Gupta', department: 'Mechanical Eng.', skillScore: 35, gpa: 2.8, year: 2025, location: 'Lucknow', skills: ['CAD', 'SolidWorks'], resumeStatus: 'Not Uploaded', coursesCompleted: 3, resumeUrl: null, portfolioUrl: null, githubUrl: null, linkedinUrl: null, projects: [] },
  { id: 15, name: 'Sneha Patel', department: 'Data Science', skillScore: 22, gpa: 2.4, year: 2026, location: 'Surat', skills: ['Excel'], resumeStatus: 'Draft', coursesCompleted: 0, resumeUrl: null, portfolioUrl: null, githubUrl: null, linkedinUrl: null, projects: [] },
  { id: 16, name: 'Deepak Kumar', department: 'Computer Science', skillScore: 25, gpa: 2.5, year: 2025, location: 'Patna', skills: ['HTML', 'CSS'], resumeStatus: 'Not Uploaded', coursesCompleted: 1, resumeUrl: null, portfolioUrl: null, githubUrl: null, linkedinUrl: null, projects: [] },
  { id: 17, name: 'Kavitha Nair', department: 'Business Admin', skillScore: 33, gpa: 2.7, year: 2025, location: 'Kochi', skills: ['Excel', 'PowerPoint'], resumeStatus: 'Draft', coursesCompleted: 2, resumeUrl: null, portfolioUrl: null, githubUrl: null, linkedinUrl: null, projects: [] },
  { id: 18, name: 'Anjali Reddy', department: 'Design', skillScore: 38, gpa: 2.9, year: 2025, location: 'Vizag', skills: ['Canva'], resumeStatus: 'Needs Revision', coursesCompleted: 2, resumeUrl: '#', portfolioUrl: null, githubUrl: null, linkedinUrl: null, projects: [] },
  { id: 19, name: 'Suresh Babu', department: 'Electrical Eng.', skillScore: 30, gpa: 2.6, year: 2026, location: 'Coimbatore', skills: ['Arduino'], resumeStatus: 'Not Uploaded', coursesCompleted: 1, resumeUrl: null, portfolioUrl: null, githubUrl: null, linkedinUrl: null, projects: [] },
  { id: 20, name: 'Lakshmi Devi', department: 'Computer Science', skillScore: 42, gpa: 3.0, year: 2025, location: 'Mysore', skills: ['Java', 'HTML'], resumeStatus: 'Draft', coursesCompleted: 3, resumeUrl: '#', portfolioUrl: null, githubUrl: null, linkedinUrl: null, projects: [] },
];

const DEMO_DEPARTMENTS = [
  { name: 'Computer Science', studentCount: 245, avgScore: 74, placementRate: 82, topSkills: ['Python', 'React', 'ML'] },
  { name: 'Electrical Eng.', studentCount: 180, avgScore: 68, placementRate: 71, topSkills: ['VLSI', 'Embedded', 'IoT'] },
  { name: 'Mechanical Eng.', studentCount: 160, avgScore: 62, placementRate: 65, topSkills: ['CAD', 'Thermodynamics', 'FEA'] },
  { name: 'Business Admin', studentCount: 130, avgScore: 70, placementRate: 76, topSkills: ['Analytics', 'Marketing', 'Finance'] },
  { name: 'Data Science', studentCount: 95, avgScore: 79, placementRate: 88, topSkills: ['Python', 'SQL', 'Tableau'] },
  { name: 'Design', studentCount: 75, avgScore: 66, placementRate: 70, topSkills: ['Figma', 'UI/UX', 'Prototyping'] },
];

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

const DEMO_FACULTY_STUDENTS = [
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

const DEMO_JOBS = [
  { id: 1, title: 'Frontend Developer', company: 'TechCorp', description: 'Build modern web applications', requirements: 'React, TypeScript, Tailwind', location: 'Bangalore', salaryRange: '8-12 LPA', applications: 24, status: 'active', posted: '2025-10-28' },
  { id: 2, title: 'Data Scientist', company: 'DataViz Inc', description: 'Analyze and model complex datasets', requirements: 'Python, TensorFlow, SQL', location: 'Remote', salaryRange: '10-15 LPA', applications: 18, status: 'active', posted: '2025-11-01' },
  { id: 3, title: 'Backend Engineer', company: 'TechCorp', description: 'Design and build scalable APIs', requirements: 'Node.js, PostgreSQL, Docker', location: 'Pune', salaryRange: '9-14 LPA', applications: 31, status: 'active', posted: '2025-11-05' },
];

// In-memory shortlist store (per-session, keyed by user id)
const shortlistStore = {};

function getUserShortlist(userId) {
  if (!shortlistStore[userId]) {
    shortlistStore[userId] = {
      Shortlisted: [1, 2, 6, 9],
      Contacted: [3, 4],
      Interviewed: [10],
      Offered: [12],
    };
  }
  return shortlistStore[userId];
}

// ─────────────────────────────────────────────────────────────────────────────
// University Routes
// ─────────────────────────────────────────────────────────────────────────────

// GET /university/overview - Dashboard KPIs and charts data
router.get('/university/overview', authenticateToken, requireRole('admin', 'university'), async (c) => {
  try {
    const { range } = getQuery(c);

    // Compute KPIs from demo data
    const totalStudents = DEMO_STUDENTS.length;
    const avgScore = Math.round(DEMO_STUDENTS.reduce((s, st) => s + st.skillScore, 0) / totalStudents);
    const placed = DEMO_STUDENTS.filter(s => s.skillScore >= 70).length;
    const placementRate = Math.round((placed / totalStudents) * 100);

    return c.json({
      kpis: {
        totalStudents: { value: totalStudents.toLocaleString(), change: '+8.2%', trend: 'up' },
        activeUsers: { value: '580', change: '+12.5%', trend: 'up' },
        avgSkillScore: { value: String(avgScore), change: '+3.1%', trend: 'up' },
        placementRate: { value: `${placementRate}%`, change: '-2.3%', trend: 'down' },
      },
      weeklyActivity: [
        { week: 'Week 1', activeUsers: 320, completions: 45 },
        { week: 'Week 2', activeUsers: 380, completions: 62 },
        { week: 'Week 3', activeUsers: 410, completions: 58 },
        { week: 'Week 4', activeUsers: 455, completions: 71 },
        { week: 'Week 5', activeUsers: 490, completions: 85 },
        { week: 'Week 6', activeUsers: 520, completions: 92 },
        { week: 'Week 7', activeUsers: 545, completions: 88 },
        { week: 'Week 8', activeUsers: 580, completions: 105 },
      ],
      courseCompletion: [
        { department: 'Computer Science', rate: 78 },
        { department: 'Electrical Eng.', rate: 65 },
        { department: 'Mechanical Eng.', rate: 58 },
        { department: 'Business Admin', rate: 72 },
        { department: 'Data Science', rate: 82 },
        { department: 'Design', rate: 69 },
      ],
      skillDistribution: [
        { name: 'Programming', value: 340, color: '#6366f1' },
        { name: 'Data Analysis', value: 220, color: '#0ea5e9' },
        { name: 'Communication', value: 180, color: '#10b981' },
        { name: 'Problem Solving', value: 290, color: '#f59e0b' },
        { name: 'Design', value: 140, color: '#ef4444' },
        { name: 'Leadership', value: 110, color: '#8b5cf6' },
      ],
      placementReadiness: [
        { name: 'Ready', value: 185, color: '#10b981' },
        { name: 'Almost Ready', value: 240, color: '#0ea5e9' },
        { name: 'Needs Work', value: 160, color: '#f59e0b' },
        { name: 'At Risk', value: 65, color: '#ef4444' },
      ],
      recentActivity: [
        { id: 1, type: 'enrollment', message: '12 new students enrolled in AI Fundamentals', time: '2 hours ago', icon: 'school' },
        { id: 2, type: 'completion', message: 'Batch CS-2025 completed Resume Workshop', time: '4 hours ago', icon: 'task_alt' },
        { id: 3, type: 'assessment', message: '45 students completed Skill Assessment', time: '6 hours ago', icon: 'quiz' },
        { id: 4, type: 'placement', message: '3 students received placement offers', time: '1 day ago', icon: 'work' },
        { id: 5, type: 'enrollment', message: '8 students joined Mock Interview Prep', time: '1 day ago', icon: 'groups' },
        { id: 6, type: 'completion', message: 'Data Science batch completed Python module', time: '2 days ago', icon: 'task_alt' },
        { id: 7, type: 'assessment', message: 'Monthly placement readiness assessment completed', time: '3 days ago', icon: 'assessment' },
        { id: 8, type: 'placement', message: '5 students shortlisted by TCS', time: '3 days ago', icon: 'work' },
      ],
      dateRange: range || 'Last 30 Days',
    });
  } catch (err) {
    console.error('University overview error:', err.message);
    return c.json({ error: 'Failed to fetch university overview' }, 500);
  }
});

// GET /university/students - List students with filters
router.get('/university/students', authenticateToken, requireRole('admin', 'university'), async (c) => {
  try {
    const { department, status, search, page = 1 } = getQuery(c);
    let students = [...DEMO_STUDENTS];

    if (department) {
      students = students.filter(s => s.department === department);
    }
    if (status === 'at-risk') {
      students = students.filter(s => s.skillScore < 40);
    } else if (status === 'ready') {
      students = students.filter(s => s.skillScore >= 70);
    }
    if (search) {
      const q = search.toLowerCase();
      students = students.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.department.toLowerCase().includes(q)
      );
    }

    const pageSize = 20;
    const pageNum = parseInt(page, 10) || 1;
    const start = (pageNum - 1) * pageSize;
    const paginated = students.slice(start, start + pageSize);

    return c.json({
      students: paginated,
      total: students.length,
      page: pageNum,
      pageSize,
    });
  } catch (err) {
    console.error('University students error:', err.message);
    return c.json({ error: 'Failed to fetch students' }, 500);
  }
});

// GET /university/departments - Department breakdown
router.get('/university/departments', authenticateToken, requireRole('admin', 'university'), async (c) => {
  try {
    return c.json({ departments: DEMO_DEPARTMENTS });
  } catch (err) {
    console.error('University departments error:', err.message);
    return c.json({ error: 'Failed to fetch departments' }, 500);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Faculty Routes
// ─────────────────────────────────────────────────────────────────────────────

// GET /faculty/courses - Faculty's assigned courses
router.get('/faculty/courses', authenticateToken, requireRole('admin', 'faculty'), async (c) => {
  try {
    return c.json({ courses: DEMO_COURSES });
  } catch (err) {
    console.error('Faculty courses error:', err.message);
    return c.json({ error: 'Failed to fetch courses' }, 500);
  }
});

// GET /faculty/assignments - List assignments
router.get('/faculty/assignments', authenticateToken, requireRole('admin', 'faculty'), async (c) => {
  try {
    return c.json({ assignments: DEMO_ASSIGNMENTS });
  } catch (err) {
    console.error('Faculty assignments error:', err.message);
    return c.json({ error: 'Failed to fetch assignments' }, 500);
  }
});

// POST /faculty/assignments - Create assignment
router.post('/faculty/assignments', authenticateToken, requireRole('admin', 'faculty'), async (c) => {
  try {
    const { title, description, dueDate, courseId, maxMarks } = getBody(c);

    if (!title || !dueDate || !courseId) {
      return c.json({ error: 'Title, due date, and course are required' }, 400);
    }

    const course = DEMO_COURSES.find(cr => cr.id === parseInt(courseId, 10));
    const assignment = {
      id: Date.now(),
      title,
      description: description || '',
      courseId: parseInt(courseId, 10),
      courseName: course ? course.code : 'N/A',
      dueDate,
      submissions: 0,
      total: course ? course.students : 0,
      status: 'upcoming',
      maxMarks: parseInt(maxMarks, 10) || 100,
    };

    DEMO_ASSIGNMENTS.push(assignment);
    return c.json({ assignment }, 201);
  } catch (err) {
    console.error('Create assignment error:', err.message);
    return c.json({ error: 'Failed to create assignment' }, 500);
  }
});

// GET /faculty/students - Student performance data
router.get('/faculty/students', authenticateToken, requireRole('admin', 'faculty'), async (c) => {
  try {
    const { course, gradeMin, gradeMax } = getQuery(c);
    let students = [...DEMO_FACULTY_STUDENTS];

    if (course) {
      students = students.filter(s => s.course === course);
    }

    return c.json({ students });
  } catch (err) {
    console.error('Faculty students error:', err.message);
    return c.json({ error: 'Failed to fetch student performance' }, 500);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Recruiter Routes
// ─────────────────────────────────────────────────────────────────────────────

// GET /recruiter/search - Search students
router.get('/recruiter/search', authenticateToken, requireRole('admin', 'recruiter'), async (c) => {
  try {
    const { skills, department, minScore, year, search, page = 1 } = getQuery(c);
    let students = [...DEMO_STUDENTS];

    if (department) {
      students = students.filter(s => s.department === department);
    }
    if (minScore) {
      students = students.filter(s => s.skillScore >= parseInt(minScore, 10));
    }
    if (year) {
      students = students.filter(s => s.year === parseInt(year, 10));
    }
    if (skills) {
      const skillList = skills.split(',').map(s => s.trim().toLowerCase());
      students = students.filter(s =>
        skillList.every(sk => s.skills.some(ss => ss.toLowerCase().includes(sk)))
      );
    }
    if (search) {
      const q = search.toLowerCase();
      students = students.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.department.toLowerCase().includes(q) ||
        s.skills.some(sk => sk.toLowerCase().includes(q))
      );
    }

    const pageSize = 20;
    const pageNum = parseInt(page, 10) || 1;
    const start = (pageNum - 1) * pageSize;
    const paginated = students.slice(start, start + pageSize);

    return c.json({
      students: paginated,
      total: students.length,
      page: pageNum,
      pageSize,
    });
  } catch (err) {
    console.error('Recruiter search error:', err.message);
    return c.json({ error: 'Failed to search students' }, 500);
  }
});

// GET /recruiter/shortlist - Get shortlisted candidates
router.get('/recruiter/shortlist', authenticateToken, requireRole('admin', 'recruiter'), async (c) => {
  try {
    const userId = c.get('user').id;
    const pipeline = getUserShortlist(userId);
    return c.json({ pipeline });
  } catch (err) {
    console.error('Recruiter shortlist error:', err.message);
    return c.json({ error: 'Failed to fetch shortlist' }, 500);
  }
});

// POST /recruiter/shortlist - Add to shortlist
router.post('/recruiter/shortlist', authenticateToken, requireRole('admin', 'recruiter'), async (c) => {
  try {
    const userId = c.get('user').id;
    const { studentId, status } = getBody(c);

    if (!studentId) {
      return c.json({ error: 'Student ID is required' }, 400);
    }

    const validStatuses = ['Shortlisted', 'Contacted', 'Interviewed', 'Offered'];
    const targetStatus = validStatuses.includes(status) ? status : 'Shortlisted';
    const pipeline = getUserShortlist(userId);

    // Remove from all columns first
    for (const col of validStatuses) {
      pipeline[col] = (pipeline[col] || []).filter(id => id !== studentId);
    }

    // Add to target column
    pipeline[targetStatus] = [...(pipeline[targetStatus] || []), studentId];

    return c.json({ pipeline, message: `Student moved to ${targetStatus}` });
  } catch (err) {
    console.error('Recruiter shortlist update error:', err.message);
    return c.json({ error: 'Failed to update shortlist' }, 500);
  }
});

// POST /recruiter/jobs - Post a job
router.post('/recruiter/jobs', authenticateToken, requireRole('admin', 'recruiter'), async (c) => {
  try {
    const { title, company, description, requirements, location, salaryRange } = getBody(c);

    if (!title || !company) {
      return c.json({ error: 'Job title and company are required' }, 400);
    }

    const job = {
      id: Date.now(),
      title,
      company,
      description: description || '',
      requirements: requirements || '',
      location: location || 'Not specified',
      salaryRange: salaryRange || 'Not disclosed',
      applications: 0,
      status: 'active',
      posted: new Date().toISOString().split('T')[0],
      postedBy: c.get('user').id,
    };

    DEMO_JOBS.push(job);
    return c.json({ job }, 201);
  } catch (err) {
    console.error('Post job error:', err.message);
    return c.json({ error: 'Failed to post job' }, 500);
  }
});

// GET /recruiter/jobs - List posted jobs
router.get('/recruiter/jobs', authenticateToken, requireRole('admin', 'recruiter'), async (c) => {
  try {
    return c.json({ jobs: DEMO_JOBS });
  } catch (err) {
    console.error('Recruiter jobs error:', err.message);
    return c.json({ error: 'Failed to fetch jobs' }, 500);
  }
});

module.exports = router;
