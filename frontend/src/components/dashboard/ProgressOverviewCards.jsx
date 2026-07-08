import { BookOpen, Activity, Target, UserCheck } from 'lucide-react';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';

const DEFAULT_SKILLS = [
  { subject: 'Technical', value: 0 },
  { subject: 'Problem Solving', value: 0 },
  { subject: 'Communication', value: 0 },
  { subject: 'Industry', value: 0 },
];

const PROFILE_SEGMENTS = [
  { key: 'resume', label: 'Resume' },
  { key: 'skills', label: 'Skills' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'github', label: 'GitHub' },
];

function ProgressBar({ value }) {
  return (
    <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-600 transition-all duration-500"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

function ProgressRing({ value, size = 80, stroke = 6 }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, value)) / 100) * circumference;

  return (
    <svg width={size} height={size}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        className="text-slate-200 dark:text-slate-700"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="url(#readiness-grad)"
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="transition-all duration-700"
      />
      <defs>
        <linearGradient id="readiness-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#10b981" />
        </linearGradient>
      </defs>
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        className="fill-slate-900 dark:fill-white text-sm font-extrabold"
      >
        {value}%
      </text>
    </svg>
  );
}

function CardWrapper({ children }) {
  return (
    <div className="glass-card p-6 rounded-2xl">
      {children}
    </div>
  );
}

function CardHeader({ icon: Icon, iconBg, iconColor, title }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg}`}>
        <Icon size={20} className={iconColor} />
      </div>
      <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 leading-none">
        {title}
      </span>
    </div>
  );
}

function LearningProgressCard({ overview }) {
  const coursesEnrolled = overview?.coursesEnrolled || 0;
  const learningProgress = overview?.learningProgress || 0;

  return (
    <CardWrapper>
      <CardHeader
        icon={BookOpen}
        iconBg="bg-blue-100 dark:bg-blue-900/40"
        iconColor="text-blue-500"
        title="Learning Progress"
      />
      <p className="text-3xl font-extrabold text-slate-900 dark:text-white">
        {coursesEnrolled}
      </p>
      <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">Courses enrolled</p>
      <ProgressBar value={learningProgress} />
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{learningProgress}% complete</p>
    </CardWrapper>
  );
}

function SkillsGrowthCard({ overview }) {
  const skillScores = overview?.skillScores || DEFAULT_SKILLS;

  return (
    <CardWrapper>
      <CardHeader
        icon={Activity}
        iconBg="bg-violet-100 dark:bg-violet-900/40"
        iconColor="text-violet-500"
        title="Skills Growth"
      />
      <div className="flex justify-center">
        <div style={{ width: 150, height: 150 }}>
          <RadarChart width={150} height={150} data={skillScores} cx="50%" cy="50%" outerRadius="70%">
            <PolarGrid stroke="#e2e8f0" className="dark:stroke-slate-700" />
            <PolarAngleAxis
              dataKey="subject"
              tick={{ fontSize: 9, fill: '#94a3b8' }}
            />
            <PolarRadiusAxis hide domain={[0, 100]} />
            <Radar
              dataKey="value"
              stroke="#8b5cf6"
              fill="#8b5cf6"
              fillOpacity={0.5}
              strokeWidth={1.5}
            />
          </RadarChart>
        </div>
      </div>
    </CardWrapper>
  );
}

function CareerReadinessCard({ overview }) {
  const readinessScore = overview?.readinessScore || 0;

  return (
    <CardWrapper>
      <CardHeader
        icon={Target}
        iconBg="bg-emerald-100 dark:bg-emerald-900/40"
        iconColor="text-emerald-500"
        title="Career Readiness"
      />
      <div className="flex justify-center">
        <ProgressRing value={readinessScore} />
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500 text-center mt-2">Readiness score</p>
    </CardWrapper>
  );
}

function ProfileCompletionCard({ overview }) {
  const profileCompletion = overview?.profileCompletion || 0;
  const completedSegments = overview?.profileSegments || {};

  return (
    <CardWrapper>
      <CardHeader
        icon={UserCheck}
        iconBg="bg-amber-100 dark:bg-amber-900/40"
        iconColor="text-amber-500"
        title="Profile Completion"
      />
      <p className="text-3xl font-extrabold text-slate-900 dark:text-white">
        {profileCompletion}%
      </p>
      <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">Complete</p>
      <div className="flex gap-1">
        {PROFILE_SEGMENTS.map(seg => {
          const done = completedSegments[seg.key] === true;
          return (
            <div key={seg.key} className="flex-1 flex flex-col items-center gap-1">
              <div
                className={`w-full h-2 rounded-full transition-colors duration-300 ${
                  done
                    ? 'bg-gradient-to-r from-amber-400 to-amber-500'
                    : 'bg-slate-200 dark:bg-slate-700'
                }`}
              />
              <span className={`text-[10px] font-medium ${
                done ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'
              }`}>
                {seg.label}
              </span>
            </div>
          );
        })}
      </div>
    </CardWrapper>
  );
}

export default function ProgressOverviewCards({ overview = {} }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <LearningProgressCard overview={overview} />
      <SkillsGrowthCard overview={overview} />
      <CareerReadinessCard overview={overview} />
      <ProfileCompletionCard overview={overview} />
    </div>
  );
}
