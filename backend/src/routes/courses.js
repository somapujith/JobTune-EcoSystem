const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requirePlan } = require('../middleware/requirePlan');
const { callAI, extractJSON } = require('../utils/aiClient');
const { pool } = require('../config/database');

// ── Ensure tables exist ──────────────────────────────────────────────────────
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS courses (
        id            SERIAL PRIMARY KEY,
        title         VARCHAR(255) NOT NULL,
        instructor    VARCHAR(255) DEFAULT '',
        category      VARCHAR(100) DEFAULT '',
        difficulty    VARCHAR(50) DEFAULT 'Beginner',
        duration_hrs  REAL DEFAULT 0,
        lesson_count  INTEGER DEFAULT 0,
        rating        REAL DEFAULT 0,
        enrolled      INTEGER DEFAULT 0,
        thumbnail     TEXT DEFAULT '',
        description   TEXT DEFAULT '',
        skills        JSONB DEFAULT '[]',
        syllabus      JSONB DEFAULT '[]',
        outcomes      JSONB DEFAULT '[]',
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS course_enrollments (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER NOT NULL,
        course_id   INTEGER NOT NULL,
        progress    REAL DEFAULT 0,
        completed_lessons JSONB DEFAULT '[]',
        enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, course_id)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS learning_paths (
        id              SERIAL PRIMARY KEY,
        title           VARCHAR(255) NOT NULL,
        description     TEXT DEFAULT '',
        icon            VARCHAR(100) DEFAULT 'route',
        estimated_weeks INTEGER DEFAULT 12,
        skill_tags      JSONB DEFAULT '[]',
        course_ids      JSONB DEFAULT '[]',
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS learning_streaks (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER NOT NULL UNIQUE,
        current     INTEGER DEFAULT 0,
        longest     INTEGER DEFAULT 0,
        last_date   DATE,
        daily_goal  INTEGER DEFAULT 30,
        updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (err) {
    console.error('Courses table migration error:', err.message);
  }
})();

// ── Fallback Data ────────────────────────────────────────────────────────────

const FALLBACK_COURSES = [
  {
    id: 1, title: 'React Fundamentals & Hooks', instructor: 'Sarah Chen', category: 'Frontend',
    difficulty: 'Beginner', duration_hrs: 12, lesson_count: 24, rating: 4.8, enrolled: 3420,
    description: 'Master React from scratch — components, state, hooks, and routing. Build three production-ready apps along the way.',
    skills: ['React', 'JSX', 'Hooks', 'React Router', 'State Management'],
    syllabus: [
      { id: 'l1', title: 'Introduction to React', duration: '30 min' },
      { id: 'l2', title: 'JSX & Component Basics', duration: '45 min' },
      { id: 'l3', title: 'Props & State', duration: '40 min' },
      { id: 'l4', title: 'useState & useEffect Deep Dive', duration: '50 min' },
      { id: 'l5', title: 'Custom Hooks', duration: '35 min' },
      { id: 'l6', title: 'React Router v6', duration: '45 min' },
      { id: 'l7', title: 'Context API & State Patterns', duration: '55 min' },
      { id: 'l8', title: 'Building a Task Manager App', duration: '60 min' },
    ],
    outcomes: ['Build React apps from scratch', 'Master React hooks', 'Implement client-side routing', 'Manage complex state'],
  },
  {
    id: 2, title: 'Node.js & Express Masterclass', instructor: 'James Rodriguez', category: 'Backend',
    difficulty: 'Intermediate', duration_hrs: 18, lesson_count: 32, rating: 4.7, enrolled: 2890,
    description: 'Build scalable REST APIs with Node.js and Express. Covers authentication, databases, testing, and deployment.',
    skills: ['Node.js', 'Express', 'REST APIs', 'JWT Auth', 'PostgreSQL'],
    syllabus: [
      { id: 'l1', title: 'Node.js Runtime & Event Loop', duration: '40 min' },
      { id: 'l2', title: 'Express Setup & Middleware', duration: '45 min' },
      { id: 'l3', title: 'RESTful Route Design', duration: '50 min' },
      { id: 'l4', title: 'Database Integration with PostgreSQL', duration: '55 min' },
      { id: 'l5', title: 'Authentication & JWT', duration: '60 min' },
      { id: 'l6', title: 'Error Handling & Validation', duration: '40 min' },
      { id: 'l7', title: 'Testing with Jest & Supertest', duration: '50 min' },
      { id: 'l8', title: 'Deploying to Production', duration: '45 min' },
    ],
    outcomes: ['Design and build REST APIs', 'Implement secure authentication', 'Integrate with PostgreSQL', 'Write automated tests'],
  },
  {
    id: 3, title: 'Machine Learning with Python', instructor: 'Dr. Priya Patel', category: 'AI/ML',
    difficulty: 'Intermediate', duration_hrs: 24, lesson_count: 40, rating: 4.9, enrolled: 4150,
    description: 'From linear regression to neural networks — a comprehensive ML journey with scikit-learn, pandas, and TensorFlow.',
    skills: ['Python', 'scikit-learn', 'TensorFlow', 'Pandas', 'NumPy'],
    syllabus: [
      { id: 'l1', title: 'Python for Data Science Refresher', duration: '45 min' },
      { id: 'l2', title: 'Linear Regression & Gradient Descent', duration: '55 min' },
      { id: 'l3', title: 'Classification Algorithms', duration: '50 min' },
      { id: 'l4', title: 'Decision Trees & Random Forests', duration: '45 min' },
      { id: 'l5', title: 'Neural Networks Intro', duration: '60 min' },
      { id: 'l6', title: 'Deep Learning with TensorFlow', duration: '55 min' },
      { id: 'l7', title: 'Model Evaluation & Tuning', duration: '40 min' },
      { id: 'l8', title: 'Capstone: End-to-End ML Pipeline', duration: '90 min' },
    ],
    outcomes: ['Understand core ML algorithms', 'Build and train models', 'Evaluate model performance', 'Deploy ML pipelines'],
  },
  {
    id: 4, title: 'Advanced CSS & Tailwind Design Systems', instructor: 'Emily Park', category: 'Frontend',
    difficulty: 'Intermediate', duration_hrs: 10, lesson_count: 20, rating: 4.6, enrolled: 1870,
    description: 'Level up your styling skills — build design systems, master responsive layouts, and create beautiful animations with Tailwind CSS.',
    skills: ['CSS3', 'Tailwind CSS', 'Responsive Design', 'Animations', 'Design Systems'],
    syllabus: [
      { id: 'l1', title: 'CSS Architecture Patterns', duration: '35 min' },
      { id: 'l2', title: 'Tailwind Configuration & Theming', duration: '40 min' },
      { id: 'l3', title: 'Responsive Design Strategies', duration: '45 min' },
      { id: 'l4', title: 'CSS Animations & Transitions', duration: '50 min' },
      { id: 'l5', title: 'Building a Design System', duration: '60 min' },
    ],
    outcomes: ['Build scalable design systems', 'Master Tailwind CSS', 'Create fluid animations', 'Implement responsive layouts'],
  },
  {
    id: 5, title: 'Data Analysis with SQL & Python', instructor: 'Michael Torres', category: 'Data Science',
    difficulty: 'Beginner', duration_hrs: 14, lesson_count: 28, rating: 4.5, enrolled: 2340,
    description: 'Learn to extract insights from data using SQL queries and Python visualization libraries like Matplotlib and Seaborn.',
    skills: ['SQL', 'Python', 'Matplotlib', 'Seaborn', 'Data Wrangling'],
    syllabus: [
      { id: 'l1', title: 'SQL Fundamentals', duration: '40 min' },
      { id: 'l2', title: 'Advanced Queries & Joins', duration: '50 min' },
      { id: 'l3', title: 'Window Functions & CTEs', duration: '45 min' },
      { id: 'l4', title: 'Python Pandas Essentials', duration: '55 min' },
      { id: 'l5', title: 'Data Visualization with Matplotlib', duration: '50 min' },
      { id: 'l6', title: 'Statistical Analysis Basics', duration: '40 min' },
    ],
    outcomes: ['Write complex SQL queries', 'Perform exploratory data analysis', 'Create insightful visualizations', 'Clean and transform datasets'],
  },
  {
    id: 6, title: 'Docker, Kubernetes & CI/CD', instructor: 'Alex Nguyen', category: 'DevOps',
    difficulty: 'Advanced', duration_hrs: 20, lesson_count: 36, rating: 4.7, enrolled: 1560,
    description: 'Containerize applications, orchestrate with Kubernetes, and build CI/CD pipelines from scratch.',
    skills: ['Docker', 'Kubernetes', 'GitHub Actions', 'CI/CD', 'Infrastructure'],
    syllabus: [
      { id: 'l1', title: 'Docker Fundamentals', duration: '45 min' },
      { id: 'l2', title: 'Dockerfile Best Practices', duration: '40 min' },
      { id: 'l3', title: 'Docker Compose Multi-Service Apps', duration: '50 min' },
      { id: 'l4', title: 'Kubernetes Architecture', duration: '55 min' },
      { id: 'l5', title: 'Deployments, Services & Ingress', duration: '60 min' },
      { id: 'l6', title: 'GitHub Actions CI/CD Pipelines', duration: '50 min' },
    ],
    outcomes: ['Containerize any application', 'Deploy to Kubernetes', 'Build CI/CD pipelines', 'Manage infrastructure as code'],
  },
  {
    id: 7, title: 'AWS Cloud Practitioner to Solutions Architect', instructor: 'David Kim', category: 'Cloud',
    difficulty: 'Intermediate', duration_hrs: 30, lesson_count: 48, rating: 4.8, enrolled: 3210,
    description: 'Start from cloud basics and progress to designing highly available, fault-tolerant architectures on AWS.',
    skills: ['AWS', 'EC2', 'S3', 'Lambda', 'CloudFormation', 'VPC'],
    syllabus: [
      { id: 'l1', title: 'Cloud Computing Fundamentals', duration: '35 min' },
      { id: 'l2', title: 'IAM & Security Best Practices', duration: '45 min' },
      { id: 'l3', title: 'Compute: EC2, ECS & Lambda', duration: '55 min' },
      { id: 'l4', title: 'Storage: S3, EBS & EFS', duration: '50 min' },
      { id: 'l5', title: 'Networking: VPC, Subnets & Load Balancers', duration: '60 min' },
      { id: 'l6', title: 'Databases: RDS, DynamoDB & ElastiCache', duration: '55 min' },
      { id: 'l7', title: 'Infrastructure as Code with CloudFormation', duration: '50 min' },
      { id: 'l8', title: 'Architecting for High Availability', duration: '60 min' },
    ],
    outcomes: ['Navigate the AWS console', 'Design scalable architectures', 'Implement security best practices', 'Pass the Solutions Architect exam'],
  },
  {
    id: 8, title: 'React Native Mobile Development', instructor: 'Lisa Wang', category: 'Mobile',
    difficulty: 'Intermediate', duration_hrs: 16, lesson_count: 30, rating: 4.6, enrolled: 1980,
    description: 'Build cross-platform mobile apps with React Native — from navigation to native modules, camera, and push notifications.',
    skills: ['React Native', 'Expo', 'Mobile UI', 'Navigation', 'Native APIs'],
    syllabus: [
      { id: 'l1', title: 'React Native & Expo Setup', duration: '30 min' },
      { id: 'l2', title: 'Core Components & Styling', duration: '45 min' },
      { id: 'l3', title: 'Navigation with React Navigation', duration: '50 min' },
      { id: 'l4', title: 'State Management in Mobile', duration: '40 min' },
      { id: 'l5', title: 'Camera, Location & Native APIs', duration: '55 min' },
      { id: 'l6', title: 'Push Notifications', duration: '35 min' },
      { id: 'l7', title: 'App Store Deployment', duration: '45 min' },
    ],
    outcomes: ['Build cross-platform mobile apps', 'Use native device features', 'Implement mobile navigation', 'Deploy to app stores'],
  },
  {
    id: 9, title: 'TypeScript Complete Course', instructor: 'Sarah Chen', category: 'Frontend',
    difficulty: 'Beginner', duration_hrs: 8, lesson_count: 18, rating: 4.7, enrolled: 2650,
    description: 'Learn TypeScript from the ground up — types, interfaces, generics, and how to integrate TS into React and Node projects.',
    skills: ['TypeScript', 'Generics', 'Type Guards', 'Interfaces', 'Utility Types'],
    syllabus: [
      { id: 'l1', title: 'Why TypeScript?', duration: '20 min' },
      { id: 'l2', title: 'Basic Types & Type Inference', duration: '35 min' },
      { id: 'l3', title: 'Interfaces & Type Aliases', duration: '40 min' },
      { id: 'l4', title: 'Generics', duration: '45 min' },
      { id: 'l5', title: 'TypeScript with React', duration: '50 min' },
      { id: 'l6', title: 'TypeScript with Node.js', duration: '40 min' },
    ],
    outcomes: ['Write type-safe code', 'Use generics effectively', 'Integrate TS into existing projects', 'Catch errors at compile time'],
  },
  {
    id: 10, title: 'Deep Learning & Neural Networks', instructor: 'Dr. Priya Patel', category: 'AI/ML',
    difficulty: 'Advanced', duration_hrs: 28, lesson_count: 44, rating: 4.9, enrolled: 2100,
    description: 'Go deep into CNNs, RNNs, transformers, and GANs. Build real-world projects including image classification and NLP models.',
    skills: ['PyTorch', 'CNNs', 'RNNs', 'Transformers', 'GANs'],
    syllabus: [
      { id: 'l1', title: 'Neural Network Mathematics', duration: '55 min' },
      { id: 'l2', title: 'PyTorch Fundamentals', duration: '50 min' },
      { id: 'l3', title: 'Convolutional Neural Networks', duration: '60 min' },
      { id: 'l4', title: 'Recurrent Neural Networks & LSTMs', duration: '55 min' },
      { id: 'l5', title: 'Attention & Transformers', duration: '65 min' },
      { id: 'l6', title: 'Generative Adversarial Networks', duration: '50 min' },
      { id: 'l7', title: 'Transfer Learning & Fine-Tuning', duration: '45 min' },
      { id: 'l8', title: 'Capstone: Build a Transformer Model', duration: '90 min' },
    ],
    outcomes: ['Build deep learning models', 'Understand transformer architecture', 'Implement computer vision models', 'Train and fine-tune NLP models'],
  },
  {
    id: 11, title: 'Cybersecurity Fundamentals', instructor: 'Ryan Mitchell', category: 'DevOps',
    difficulty: 'Beginner', duration_hrs: 15, lesson_count: 26, rating: 4.5, enrolled: 1740,
    description: 'Understand threat landscapes, secure coding practices, network security, and ethical hacking fundamentals.',
    skills: ['Network Security', 'OWASP', 'Ethical Hacking', 'Encryption', 'Secure Coding'],
    syllabus: [
      { id: 'l1', title: 'Security Landscape Overview', duration: '30 min' },
      { id: 'l2', title: 'Network Security Basics', duration: '45 min' },
      { id: 'l3', title: 'OWASP Top 10 Vulnerabilities', duration: '55 min' },
      { id: 'l4', title: 'Cryptography & Encryption', duration: '50 min' },
      { id: 'l5', title: 'Secure Coding Practices', duration: '45 min' },
      { id: 'l6', title: 'Penetration Testing Basics', duration: '60 min' },
    ],
    outcomes: ['Identify common vulnerabilities', 'Implement secure coding practices', 'Understand encryption principles', 'Perform basic pen testing'],
  },
  {
    id: 12, title: 'Full-Stack Project: SaaS App', instructor: 'James Rodriguez', category: 'Backend',
    difficulty: 'Advanced', duration_hrs: 22, lesson_count: 38, rating: 4.8, enrolled: 1290,
    description: 'Build a complete SaaS application from scratch — auth, billing, multi-tenancy, admin dashboards, and deployment.',
    skills: ['Full Stack', 'Stripe', 'Multi-Tenancy', 'Admin Dashboards', 'Deployment'],
    syllabus: [
      { id: 'l1', title: 'SaaS Architecture Planning', duration: '40 min' },
      { id: 'l2', title: 'Authentication & Multi-Tenancy', duration: '55 min' },
      { id: 'l3', title: 'Stripe Billing Integration', duration: '60 min' },
      { id: 'l4', title: 'Admin Dashboard & Analytics', duration: '50 min' },
      { id: 'l5', title: 'Email & Notification Systems', duration: '45 min' },
      { id: 'l6', title: 'Performance Optimization', duration: '40 min' },
      { id: 'l7', title: 'Production Deployment & Monitoring', duration: '50 min' },
    ],
    outcomes: ['Architect a SaaS product', 'Integrate payment processing', 'Build admin interfaces', 'Deploy and monitor production apps'],
  },
  {
    id: 13, title: 'Data Engineering with Apache Spark', instructor: 'Michael Torres', category: 'Data Science',
    difficulty: 'Advanced', duration_hrs: 20, lesson_count: 34, rating: 4.6, enrolled: 1120,
    description: 'Process massive datasets with Apache Spark. Learn ETL pipelines, data lakes, and real-time streaming with Kafka.',
    skills: ['Apache Spark', 'PySpark', 'Kafka', 'ETL', 'Data Lakes'],
    syllabus: [
      { id: 'l1', title: 'Big Data & Spark Overview', duration: '35 min' },
      { id: 'l2', title: 'RDDs & DataFrames', duration: '50 min' },
      { id: 'l3', title: 'Spark SQL & Optimizations', duration: '55 min' },
      { id: 'l4', title: 'ETL Pipeline Design', duration: '60 min' },
      { id: 'l5', title: 'Streaming with Kafka & Spark', duration: '55 min' },
      { id: 'l6', title: 'Data Lake Architecture', duration: '45 min' },
    ],
    outcomes: ['Build ETL pipelines', 'Process big data with Spark', 'Design data lake architectures', 'Implement real-time streaming'],
  },
  {
    id: 14, title: 'Flutter Mobile App Development', instructor: 'Lisa Wang', category: 'Mobile',
    difficulty: 'Beginner', duration_hrs: 14, lesson_count: 26, rating: 4.7, enrolled: 2080,
    description: 'Build beautiful, natively compiled mobile apps with Dart and Flutter. Covers widgets, state, Firebase, and deployment.',
    skills: ['Flutter', 'Dart', 'Firebase', 'Mobile UI', 'State Management'],
    syllabus: [
      { id: 'l1', title: 'Dart Language Essentials', duration: '40 min' },
      { id: 'l2', title: 'Flutter Widget System', duration: '50 min' },
      { id: 'l3', title: 'Layouts & Responsive Design', duration: '45 min' },
      { id: 'l4', title: 'State Management with Provider', duration: '50 min' },
      { id: 'l5', title: 'Firebase Integration', duration: '55 min' },
      { id: 'l6', title: 'Building a Complete App', duration: '70 min' },
    ],
    outcomes: ['Build Flutter apps from scratch', 'Master the widget system', 'Integrate with Firebase', 'Deploy to iOS and Android'],
  },
  {
    id: 15, title: 'GCP & Terraform Infrastructure', instructor: 'David Kim', category: 'Cloud',
    difficulty: 'Advanced', duration_hrs: 18, lesson_count: 30, rating: 4.5, enrolled: 980,
    description: 'Deploy and manage Google Cloud infrastructure using Terraform. Covers GKE, Cloud Run, BigQuery, and IAM.',
    skills: ['GCP', 'Terraform', 'GKE', 'Cloud Run', 'BigQuery'],
    syllabus: [
      { id: 'l1', title: 'GCP Console & Cloud Shell', duration: '30 min' },
      { id: 'l2', title: 'Terraform Basics & State', duration: '50 min' },
      { id: 'l3', title: 'Compute Engine & Cloud Run', duration: '55 min' },
      { id: 'l4', title: 'GKE Cluster Management', duration: '60 min' },
      { id: 'l5', title: 'BigQuery & Data Analytics', duration: '50 min' },
      { id: 'l6', title: 'IAM & Security Policies', duration: '40 min' },
    ],
    outcomes: ['Manage GCP resources', 'Write Terraform configurations', 'Deploy to GKE', 'Implement cloud security'],
  },
];

const FALLBACK_PATHS = [
  {
    id: 1, title: 'Frontend Developer', icon: 'web',
    description: 'Master modern frontend technologies from HTML/CSS to React and design systems.',
    estimated_weeks: 12, skill_tags: ['HTML/CSS', 'JavaScript', 'React', 'TypeScript', 'Tailwind CSS'],
    course_ids: [9, 1, 4],
  },
  {
    id: 2, title: 'Backend Developer', icon: 'dns',
    description: 'Build robust server-side applications with Node.js, databases, and API design.',
    estimated_weeks: 14, skill_tags: ['Node.js', 'Express', 'PostgreSQL', 'REST APIs', 'Testing'],
    course_ids: [2, 12],
  },
  {
    id: 3, title: 'Full Stack Engineer', icon: 'stacks',
    description: 'Combine frontend and backend skills to build complete web applications end to end.',
    estimated_weeks: 20, skill_tags: ['React', 'Node.js', 'TypeScript', 'PostgreSQL', 'DevOps'],
    course_ids: [9, 1, 2, 4, 12],
  },
  {
    id: 4, title: 'AI/ML Engineer', icon: 'psychology',
    description: 'From Python basics to deep learning — build intelligent systems and deploy ML models.',
    estimated_weeks: 18, skill_tags: ['Python', 'scikit-learn', 'TensorFlow', 'PyTorch', 'NLP'],
    course_ids: [5, 3, 10],
  },
  {
    id: 5, title: 'Data Analyst', icon: 'monitoring',
    description: 'Learn to extract actionable insights from data using SQL, Python, and visualization tools.',
    estimated_weeks: 10, skill_tags: ['SQL', 'Python', 'Pandas', 'Visualization', 'Statistics'],
    course_ids: [5, 3],
  },
  {
    id: 6, title: 'DevOps Engineer', icon: 'cloud_sync',
    description: 'Automate deployments, manage infrastructure, and build resilient CI/CD pipelines.',
    estimated_weeks: 14, skill_tags: ['Docker', 'Kubernetes', 'CI/CD', 'Linux', 'Monitoring'],
    course_ids: [6, 11],
  },
  {
    id: 7, title: 'Cloud Architect', icon: 'cloud',
    description: 'Design and deploy scalable, secure cloud architectures on AWS and GCP.',
    estimated_weeks: 16, skill_tags: ['AWS', 'GCP', 'Terraform', 'Networking', 'Security'],
    course_ids: [7, 15, 6],
  },
  {
    id: 8, title: 'Cybersecurity Analyst', icon: 'shield',
    description: 'Protect systems and data — learn threat modeling, penetration testing, and secure architecture.',
    estimated_weeks: 12, skill_tags: ['Network Security', 'OWASP', 'Ethical Hacking', 'Encryption', 'Compliance'],
    course_ids: [11, 6],
  },
];

// ── Helper: get courses (DB with fallback) ───────────────────────────────────
async function getAllCourses() {
  try {
    const { rows } = await pool.query('SELECT * FROM courses ORDER BY id');
    if (rows.length > 0) return rows;
  } catch { /* fall through */ }
  return FALLBACK_COURSES;
}

async function getAllPaths() {
  try {
    const { rows } = await pool.query('SELECT * FROM learning_paths ORDER BY id');
    if (rows.length > 0) return rows;
  } catch { /* fall through */ }
  return FALLBACK_PATHS;
}

// ── GET / — List courses with pagination & filters ───────────────────────────
router.get('/', authenticateToken, requirePlan(1), async (req, res, next) => {
  try {
    const { category, difficulty, search, page = 1 } = req.query;
    const perPage = 12;

    let courses = await getAllCourses();

    if (category && category !== 'All') {
      courses = courses.filter(c => c.category === category);
    }
    if (difficulty && difficulty !== 'All') {
      courses = courses.filter(c => c.difficulty === difficulty);
    }
    if (search) {
      const q = search.toLowerCase();
      courses = courses.filter(c =>
        c.title.toLowerCase().includes(q) ||
        c.instructor.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        (c.skills || []).some(s => s.toLowerCase().includes(q))
      );
    }

    const total = courses.length;
    const start = (Number(page) - 1) * perPage;
    const paginated = courses.slice(start, start + perPage);

    res.json({
      success: true,
      data: paginated,
      pagination: { page: Number(page), perPage, total, totalPages: Math.ceil(total / perPage) },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /progress — User's learning progress, streaks, active courses ────────
router.get('/progress', authenticateToken, requirePlan(1), async (req, res, next) => {
  try {
    let enrollments = [];
    try {
      const { rows } = await pool.query(
        'SELECT * FROM course_enrollments WHERE user_id = $1 ORDER BY updated_at DESC',
        [req.user.id]
      );
      enrollments = rows;
    } catch { /* no table yet */ }

    let streak = { current: 0, longest: 0, last_date: null, daily_goal: 30 };
    try {
      const { rows } = await pool.query(
        'SELECT * FROM learning_streaks WHERE user_id = $1',
        [req.user.id]
      );
      if (rows.length > 0) streak = rows[0];
    } catch { /* no table yet */ }

    const allCourses = await getAllCourses();

    const activeCourses = enrollments
      .filter(e => e.progress < 100)
      .map(e => {
        const course = allCourses.find(c => c.id === e.course_id);
        return course ? { ...course, progress: e.progress, enrolled_at: e.enrolled_at } : null;
      })
      .filter(Boolean);

    const completedCount = enrollments.filter(e => e.progress >= 100).length;
    const totalMinutes = enrollments.reduce((sum, e) => {
      const course = allCourses.find(c => c.id === e.course_id);
      return sum + (course ? course.duration_hrs * 60 * (e.progress / 100) : 0);
    }, 0);

    res.json({
      success: true,
      data: {
        activeCourses,
        completedCount,
        totalMinutesLearned: Math.round(totalMinutes),
        streak,
        enrollmentCount: enrollments.length,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /paths — List all learning paths ─────────────────────────────────────
router.get('/paths', authenticateToken, requirePlan(1), async (req, res, next) => {
  try {
    const paths = await getAllPaths();
    const allCourses = await getAllCourses();

    let enrollments = [];
    try {
      const { rows } = await pool.query(
        'SELECT * FROM course_enrollments WHERE user_id = $1',
        [req.user.id]
      );
      enrollments = rows;
    } catch { /* no table yet */ }

    const enriched = paths.map(p => {
      const courseIds = Array.isArray(p.course_ids) ? p.course_ids : JSON.parse(p.course_ids || '[]');
      const courses = courseIds.map(id => allCourses.find(c => c.id === id)).filter(Boolean);
      const totalHours = courses.reduce((s, c) => s + (c.duration_hrs || 0), 0);

      // Compute path progress from user's course enrollments
      let progress = 0;
      if (courses.length > 0) {
        const courseProgress = courses.map(c => {
          const enrollment = enrollments.find(e => e.course_id === c.id);
          return enrollment ? enrollment.progress : 0;
        });
        progress = Math.round(courseProgress.reduce((s, p) => s + p, 0) / courses.length);
      }

      return {
        ...p,
        course_ids: courseIds,
        courses,
        total_courses: courses.length,
        total_hours: totalHours,
        progress,
      };
    });

    res.json({ success: true, data: enriched });
  } catch (err) {
    next(err);
  }
});

// ── GET /paths/:id — Get a specific path with its courses ────────────────────
router.get('/paths/:id', authenticateToken, requirePlan(1), async (req, res, next) => {
  try {
    const pathId = Number(req.params.id);
    const paths = await getAllPaths();
    const path = paths.find(p => p.id === pathId);

    if (!path) return res.status(404).json({ error: 'Learning path not found' });

    const allCourses = await getAllCourses();
    const courseIds = Array.isArray(path.course_ids) ? path.course_ids : JSON.parse(path.course_ids || '[]');
    const courses = courseIds.map(id => allCourses.find(c => c.id === id)).filter(Boolean);

    let enrollments = [];
    try {
      const { rows } = await pool.query(
        'SELECT * FROM course_enrollments WHERE user_id = $1',
        [req.user.id]
      );
      enrollments = rows;
    } catch { /* no table yet */ }

    const enrichedCourses = courses.map((c, idx) => {
      const enrollment = enrollments.find(e => e.course_id === c.id);
      const prevCompleted = idx === 0 || (enrollments.find(e => e.course_id === courses[idx - 1]?.id)?.progress || 0) >= 100;
      return {
        ...c,
        progress: enrollment ? enrollment.progress : 0,
        status: enrollment && enrollment.progress >= 100 ? 'completed' : (enrollment || (idx === 0 || prevCompleted)) ? 'available' : 'locked',
      };
    });

    const totalHours = courses.reduce((s, c) => s + (c.duration_hrs || 0), 0);
    let progress = 0;
    if (courses.length > 0) {
      progress = Math.round(enrichedCourses.reduce((s, c) => s + c.progress, 0) / courses.length);
    }

    res.json({
      success: true,
      data: { ...path, courses: enrichedCourses, total_courses: courses.length, total_hours: totalHours, progress },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /:id — Get course details with syllabus ──────────────────────────────
router.get('/:id', authenticateToken, requirePlan(1), async (req, res, next) => {
  try {
    const courseId = Number(req.params.id);
    const courses = await getAllCourses();
    const course = courses.find(c => c.id === courseId);

    if (!course) return res.status(404).json({ error: 'Course not found' });

    let enrollment = null;
    try {
      const { rows } = await pool.query(
        'SELECT * FROM course_enrollments WHERE user_id = $1 AND course_id = $2',
        [req.user.id, courseId]
      );
      if (rows.length > 0) enrollment = rows[0];
    } catch { /* no table yet */ }

    res.json({
      success: true,
      data: {
        ...course,
        enrolled: enrollment !== null,
        progress: enrollment ? enrollment.progress : 0,
        completed_lessons: enrollment ? (enrollment.completed_lessons || []) : [],
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /:id/enroll — Enroll in a course ────────────────────────────────────
router.post('/:id/enroll', authenticateToken, requirePlan(1), async (req, res, next) => {
  try {
    const courseId = Number(req.params.id);
    const courses = await getAllCourses();
    const course = courses.find(c => c.id === courseId);

    if (!course) return res.status(404).json({ error: 'Course not found' });

    await pool.query(
      `INSERT INTO course_enrollments (user_id, course_id, progress, completed_lessons)
       VALUES ($1, $2, 0, '[]')
       ON CONFLICT (user_id, course_id) DO NOTHING`,
      [req.user.id, courseId]
    );

    res.json({ success: true, message: `Enrolled in "${course.title}"` });
  } catch (err) {
    next(err);
  }
});

// ── POST /:id/progress — Update course progress ─────────────────────────────
router.post('/:id/progress', authenticateToken, requirePlan(1), async (req, res, next) => {
  try {
    const courseId = Number(req.params.id);
    const { lessonId, completed } = req.body;

    if (!lessonId) return res.status(400).json({ error: 'lessonId is required' });

    const courses = await getAllCourses();
    const course = courses.find(c => c.id === courseId);
    if (!course) return res.status(404).json({ error: 'Course not found' });

    // Get current enrollment
    let enrollment;
    try {
      const { rows } = await pool.query(
        'SELECT * FROM course_enrollments WHERE user_id = $1 AND course_id = $2',
        [req.user.id, courseId]
      );
      enrollment = rows[0];
    } catch { /* fall through */ }

    if (!enrollment) {
      // Auto-enroll if not enrolled
      await pool.query(
        `INSERT INTO course_enrollments (user_id, course_id, progress, completed_lessons) VALUES ($1, $2, 0, '[]')`,
        [req.user.id, courseId]
      );
      enrollment = { completed_lessons: [] };
    }

    let completedLessons = Array.isArray(enrollment.completed_lessons)
      ? enrollment.completed_lessons
      : JSON.parse(enrollment.completed_lessons || '[]');

    if (completed && !completedLessons.includes(lessonId)) {
      completedLessons.push(lessonId);
    } else if (!completed) {
      completedLessons = completedLessons.filter(l => l !== lessonId);
    }

    const syllabus = Array.isArray(course.syllabus) ? course.syllabus : JSON.parse(course.syllabus || '[]');
    const totalLessons = syllabus.length || course.lesson_count || 1;
    const progress = Math.round((completedLessons.length / totalLessons) * 100);

    await pool.query(
      `UPDATE course_enrollments SET progress = $1, completed_lessons = $2, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $3 AND course_id = $4`,
      [progress, JSON.stringify(completedLessons), req.user.id, courseId]
    );

    // Update streak
    const today = new Date().toISOString().split('T')[0];
    try {
      const { rows } = await pool.query('SELECT * FROM learning_streaks WHERE user_id = $1', [req.user.id]);
      if (rows.length > 0) {
        const streak = rows[0];
        const lastDate = streak.last_date ? new Date(streak.last_date).toISOString().split('T')[0] : null;
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

        let newCurrent = streak.current;
        if (lastDate === today) {
          // Already counted today
        } else if (lastDate === yesterday) {
          newCurrent = streak.current + 1;
        } else {
          newCurrent = 1;
        }
        const newLongest = Math.max(streak.longest, newCurrent);

        await pool.query(
          'UPDATE learning_streaks SET current = $1, longest = $2, last_date = $3, updated_at = CURRENT_TIMESTAMP WHERE user_id = $4',
          [newCurrent, newLongest, today, req.user.id]
        );
      } else {
        await pool.query(
          'INSERT INTO learning_streaks (user_id, current, longest, last_date) VALUES ($1, 1, 1, $2)',
          [req.user.id, today]
        );
      }
    } catch { /* streak tracking is best-effort */ }

    res.json({ success: true, data: { progress, completedLessons } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
