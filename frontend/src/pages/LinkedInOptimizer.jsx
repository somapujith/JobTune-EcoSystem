import React, { useEffect, useState } from 'react';
import { api } from '../store/useAuthStore';

function getScoreColor(score) {
  if (score >= 80) return '#10b981';
  if (score >= 60) return '#0ea5e9';
  if (score >= 40) return '#f59e0b';
  return '#ef4444';
}

const ROLE_OPTIONS = [
  'Software Engineer',
  'Full Stack Developer',
  'Frontend Engineer',
  'Backend Engineer',
  'DevOps Engineer',
  'Data Scientist',
  'Product Manager',
  'Engineering Manager',
  'Tech Lead',
  'Other'
];

const EXPERIENCE_LEVELS = [
  { label: 'Entry Level', years: '0-2' },
  { label: 'Mid-Level', years: '2-5' },
  { label: 'Senior', years: '5-10' },
  { label: 'Lead/Manager', years: '10+' },
];

const SKILL_CATEGORIES = [
  { label: 'Frontend', skills: ['React', 'Vue', 'Angular', 'TypeScript', 'JavaScript', 'HTML/CSS', 'Tailwind'] },
  { label: 'Backend', skills: ['Node.js', 'Python', 'Java', 'Go', 'C++', 'Ruby', 'PHP'] },
  { label: 'Cloud/DevOps', skills: ['AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'CI/CD', 'Terraform'] },
  { label: 'Databases', skills: ['PostgreSQL', 'MongoDB', 'MySQL', 'Redis', 'DynamoDB', 'Elasticsearch'] },
  { label: 'AI/ML', skills: ['Python', 'TensorFlow', 'PyTorch', 'Scikit-learn', 'NLP', 'Machine Learning'] },
];

const COMPANY_SIZES = ['Startup', 'Small (10-50)', 'Mid-size (50-500)', 'Large (500+)', 'Fortune 500'];

const INDUSTRY_OPTIONS = [
  'Technology/SaaS',
  'Finance/FinTech',
  'Healthcare',
  'E-commerce',
  'Media/Entertainment',
  'Education',
  'Other'
];

const TARGET_ROLE_OPTIONS = [
  'Senior Engineer',
  'Tech Lead',
  'Engineering Manager',
  'Staff Engineer',
  'Product Manager',
  'Architect',
  'Specialist',
  'Open to opportunities'
];

function ProgressBar({ current, total }) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold text-on-surface">Step {current} of {total}</span>
        <span className="text-sm font-bold text-on-surface-variant">{Math.round((current / total) * 100)}%</span>
      </div>
      <div className="w-full h-2 bg-surface-container/60 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-sky-500 to-sky-600 rounded-full transition-all duration-300"
          style={{ width: `${(current / total) * 100}%` }}
        />
      </div>
    </div>
  );
}

function SelectionGrid({ options, selected, onSelect, multiple = false, columns = 2 }) {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-${columns} gap-3`}>
      {options.map((option, idx) => {
        const isSelected = multiple
          ? Array.isArray(selected) && selected.includes(option)
          : selected === option;

        return (
          <button
            key={idx}
            type="button"
            onClick={() => {
              if (multiple) {
                onSelect(
                  isSelected
                    ? selected.filter(s => s !== option)
                    : [...(selected || []), option]
                );
              } else {
                onSelect(option);
              }
            }}
            className={`p-4 rounded-2xl border-2 font-bold transition-all text-center ${
              isSelected
                ? 'border-sky-500 bg-sky-500/10 text-on-surface'
                : 'border-outline/20 bg-surface-container/30 text-on-surface-variant hover:border-sky-500/50'
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

function MultiSelectSkills({ selected, onSelect }) {
  const [activeCategory, setActiveCategory] = useState(SKILL_CATEGORIES[0].label);
  const activeSkills = SKILL_CATEGORIES.find(c => c.label === activeCategory)?.skills || [];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-bold text-on-surface mb-3">Select a category:</p>
        <div className="flex flex-wrap gap-2">
          {SKILL_CATEGORIES.map(cat => (
            <button
              key={cat.label}
              type="button"
              onClick={() => setActiveCategory(cat.label)}
              className={`px-4 py-2 rounded-xl font-bold transition-all text-sm ${
                activeCategory === cat.label
                  ? 'bg-sky-500 text-white'
                  : 'bg-surface-container/50 text-on-surface hover:bg-surface-container'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-bold text-on-surface mb-3">Choose skills:</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {activeSkills.map(skill => {
            const isSelected = selected.includes(skill);
            return (
              <button
                key={skill}
                type="button"
                onClick={() => {
                  if (isSelected) {
                    onSelect(selected.filter(s => s !== skill));
                  } else {
                    onSelect([...selected, skill]);
                  }
                }}
                className={`p-3 rounded-xl border-2 font-bold transition-all text-sm ${
                  isSelected
                    ? 'border-emerald-500 bg-emerald-500/10 text-on-surface'
                    : 'border-outline/20 bg-surface-container/30 text-on-surface-variant hover:border-emerald-500/50'
                }`}
              >
                {skill}
              </button>
            );
          })}
        </div>
      </div>

      {selected.length > 0 && (
        <div className="bg-sky-500/10 rounded-2xl p-4 border border-sky-500/30">
          <p className="text-sm font-bold text-on-surface mb-2">Selected ({selected.length}):</p>
          <div className="flex flex-wrap gap-2">
            {selected.map((skill, idx) => (
              <span
                key={idx}
                className="px-3 py-1 bg-sky-500 text-white rounded-full text-xs font-bold"
              >
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LoadingContent({ headline, about }) {
  return (
    <div className="space-y-6">
      <div className="text-center py-12">
        <span className="material-symbols-outlined animate-spin text-sky-500 text-5xl block mb-4" style={{ fontVariationSettings: "'FILL' 0" }}>sync</span>
        <p className="text-on-surface-variant font-bold">Generating your LinkedIn content...</p>
      </div>

      {headline && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6">
          <p className="text-sm font-bold text-emerald-700 mb-3">✨ Generated Headline</p>
          <p className="text-on-surface font-bold">{headline}</p>
        </div>
      )}

      {about && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6">
          <p className="text-sm font-bold text-emerald-700 mb-3">✨ Generated About Section</p>
          <p className="text-on-surface font-medium text-sm leading-relaxed">{about}</p>
        </div>
      )}
    </div>
  );
}

export default function LinkedInOptimizer() {
  const [step, setStep] = useState(0);
  const [responses, setResponses] = useState({
    role: null,
    experienceLevel: null,
    company: null,
    industry: null,
    skills: [],
    targetRole: null,
    targetIndustries: [],
    achievements: null,
  });
  const [generatedContent, setGeneratedContent] = useState({
    headline: null,
    about: null,
  });
  const [generatingHeadline, setGeneratingHeadline] = useState(false);
  const [generatingAbout, setGeneratingAbout] = useState(false);
  const [loadingFinal, setLoadingFinal] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState(null);
  const [showResults, setShowResults] = useState(false);

  const STEPS = [
    {
      title: 'What is your current role?',
      description: 'Select the option that best describes your position',
      key: 'role',
      options: ROLE_OPTIONS,
      type: 'single'
    },
    {
      title: 'What is your experience level?',
      description: 'Choose the range that matches your years of experience',
      key: 'experienceLevel',
      options: EXPERIENCE_LEVELS.map(e => e.label),
      type: 'single'
    },
    {
      title: 'What size company do you work for?',
      description: 'Select your current or most recent company size',
      key: 'company',
      options: COMPANY_SIZES,
      type: 'single'
    },
    {
      title: 'What is your current industry?',
      description: 'Choose your primary industry',
      key: 'industry',
      options: INDUSTRY_OPTIONS,
      type: 'single'
    },
    {
      title: 'What are your main skills?',
      description: 'Select 5-10 skills that best represent your expertise',
      key: 'skills',
      type: 'multi-skills'
    },
    {
      title: 'What is your target role?',
      description: 'Where do you want to grow to or what are you looking for?',
      key: 'targetRole',
      options: TARGET_ROLE_OPTIONS,
      type: 'single'
    },
    {
      title: 'What industries interest you?',
      description: 'Select the industries you want to work in',
      key: 'targetIndustries',
      options: INDUSTRY_OPTIONS,
      type: 'multi'
    },
    {
      title: 'Key achievements or highlights?',
      description: 'What are 1-2 major things you\'ve accomplished?',
      key: 'achievements',
      type: 'info'
    }
  ];

  const currentStep = STEPS[step];
  const isLastStep = step === STEPS.length - 1;

  // Generate headline in background after step 1
  useEffect(() => {
    if (responses.role && step > 0 && !generatedContent.headline && !generatingHeadline) {
      setGeneratingHeadline(true);
      api.post('/profiles/linkedin/generate-headline', {
        roleInfo: responses.role,
        companyContext: responses.company,
        achievements: responses.achievements,
        targetRoles: responses.targetRole
      })
        .then(res => {
          setGeneratedContent(prev => ({ ...prev, headline: res.data.options?.[0] }));
        })
        .catch(err => console.error('Headline generation failed:', err))
        .finally(() => setGeneratingHeadline(false));
    }
  }, [responses.role, step]);

  // Generate about section in background after step 6
  useEffect(() => {
    if (responses.targetRole && step > 5 && !generatedContent.about && !generatingAbout) {
      setGeneratingAbout(true);
      api.post('/profiles/linkedin/generate-about', {
        profileContext: `${responses.role} with ${responses.experienceLevel} experience`,
        skills: responses.skills,
        achievements: responses.achievements,
        targetRoles: responses.targetRole,
        targetIndustries: responses.targetIndustries.length > 0 ? responses.targetIndustries : [responses.industry]
      })
        .then(res => {
          setGeneratedContent(prev => ({ ...prev, about: res.data.about }));
        })
        .catch(err => console.error('About generation failed:', err))
        .finally(() => setGeneratingAbout(false));
    }
  }, [responses.targetRole, step]);

  const handleNext = () => {
    if (!responses[currentStep.key]) {
      if (currentStep.key !== 'achievements') {
        setError('Please make a selection to continue');
        return;
      }
    }

    setError('');

    if (isLastStep) {
      handleSubmit();
    } else {
      setStep(step + 1);
    }
  };

  const handlePrev = () => {
    if (step > 0) {
      setStep(step - 1);
      setError('');
    }
  };

  const handleSelectOption = (value) => {
    setResponses(prev => ({
      ...prev,
      [currentStep.key]: value
    }));
  };

  const handleSubmit = async () => {
    setLoadingFinal(true);
    setError('');
    try {
      const payload = {
        profileUrl: 'https://www.linkedin.com/in/user',
        headline: generatedContent.headline || responses.role,
        about: generatedContent.about || '',
        skills: responses.skills,
        experiences: [],
        yearsOfExperience: EXPERIENCE_LEVELS.find(e => e.label === responses.experienceLevel)?.years.split('-')[0] || 0,
        connections: '500+',
        openToWork: true,
        hasPhoto: true,
        hasFeatured: false,
        targetRoles: responses.targetRole ? [responses.targetRole] : [],
        targetIndustries: responses.targetIndustries || [responses.industry],
      };

      const { data } = await api.post('/profiles/linkedin/analyze', payload);
      setReport(data);
      setShowResults(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Analysis failed. Please try again.');
      setStep(STEPS.length - 1); // Go back to last step if analysis fails
    } finally {
      setLoadingFinal(false);
    }
  };

  const resetForm = () => {
    setStep(0);
    setResponses({
      role: null,
      experienceLevel: null,
      company: null,
      industry: null,
      skills: [],
      targetRole: null,
      targetIndustries: [],
      achievements: null,
    });
    setGeneratedContent({ headline: null, about: null });
    setReport(null);
    setShowResults(false);
    setError('');
  };

  if (showResults && report && !loadingFinal) {
    return (
      <div className="w-full max-w-5xl mx-auto py-16 px-4 sm:px-6">
        <button
          onClick={resetForm}
          className="mb-8 text-sky-600 hover:text-sky-700 font-bold flex items-center gap-2"
        >
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0" }}>arrow_back</span>
          Start Over
        </button>

        <div className="text-center mb-12">
          <h1 className="text-4xl font-black text-on-surface font-headline mb-4">Your Profile Analysis</h1>
          <p className="text-lg text-on-surface-variant font-medium">Here's what we recommend for your LinkedIn</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Profile Score */}
          <div className="glass-card p-8 rounded-3xl flex flex-col items-center justify-center text-center">
            <div className="relative mb-8">
              <svg viewBox="0 0 36 36" className="w-32 h-32 -rotate-90 mx-auto">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5eeff" strokeWidth="3.2" />
                <circle
                  cx="18" cy="18" r="15.9" fill="none"
                  stroke={getScoreColor(report.score)}
                  strokeWidth="3.2"
                  strokeDasharray={`${(report.score / 100) * 100} 100`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-black text-on-surface">{report.score}</span>
                <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">/ 100</span>
              </div>
            </div>
            <div
              className="inline-block px-4 py-1 rounded-full text-sm font-bold mb-3"
              style={{ backgroundColor: `${getScoreColor(report.score)}20`, color: getScoreColor(report.score) }}
            >
              {report.scoreLabel}
            </div>
            <h3 className="text-2xl font-bold text-on-surface mb-3 font-headline">Profile Score</h3>
          </div>

          {/* Metrics */}
          <div className="glass-card p-8 rounded-3xl">
            <h3 className="text-xl font-bold text-on-surface mb-8 flex items-center gap-3 font-headline">
              <span className="material-symbols-outlined text-sky-600" style={{ fontVariationSettings: "'FILL' 0" }}>bar_chart</span>
              Metrics
            </h3>
            <div className="space-y-6">
              {report.metrics?.slice(0, 5).map((m, i) => (
                <div key={i}>
                  <div className="flex justify-between text-sm font-bold mb-2">
                    <span className="text-on-surface">{m.label}</span>
                    <span style={{ color: getScoreColor(m.val) }}>{m.val}/100</span>
                  </div>
                  <div className="w-full bg-surface-container/50 h-2 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${m.val}%`,
                        backgroundColor: getScoreColor(m.val)
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {report.optimizations?.headlineOptions && (
            <div className="glass-card p-8 rounded-3xl">
              <h3 className="text-xl font-bold text-on-surface mb-6 flex items-center gap-3 font-headline">
                <span className="material-symbols-outlined text-sky-600" style={{ fontVariationSettings: "'FILL' 1" }}>edit_note</span>
                Headline Ideas
              </h3>
              <div className="space-y-3">
                {report.optimizations.headlineOptions.slice(0, 3).map((h, i) => (
                  <div key={i} className="bg-surface-container/40 rounded-2xl p-4 border border-outline/10">
                    <p className="text-on-surface font-bold text-sm">{h}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {report.optimizations?.aboutRewrite && (
            <div className="glass-card p-8 rounded-3xl">
              <h3 className="text-xl font-bold text-on-surface mb-6 flex items-center gap-3 font-headline">
                <span className="material-symbols-outlined text-sky-600" style={{ fontVariationSettings: "'FILL' 1" }}>article</span>
                About Section
              </h3>
              <div className="bg-surface-container/40 rounded-2xl p-5 border border-outline/10 text-on-surface font-medium text-sm leading-relaxed">
                {report.optimizations.aboutRewrite}
              </div>
            </div>
          )}

          {report.optimizations?.quickWins && (
            <div className="lg:col-span-2 glass-card p-8 rounded-3xl">
              <h3 className="text-xl font-bold text-on-surface mb-6 flex items-center gap-3 font-headline">
                <span className="material-symbols-outlined text-sky-600" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
                Quick Wins
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {report.optimizations.quickWins.slice(0, 4).map((win, i) => (
                  <div key={i} className="bg-surface-container/40 rounded-2xl p-4 border border-outline/10">
                    <p className="text-on-surface font-bold text-sm">{win.action}</p>
                    <p className="text-xs text-on-surface-variant mt-2">{win.effort}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (loadingFinal) {
    return (
      <div className="w-full max-w-2xl mx-auto py-16 px-4 sm:px-6">
        <LoadingContent
          headline={generatedContent.headline}
          about={generatedContent.about}
        />
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto py-16 px-4 sm:px-6">
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-sky-500/5 mb-6">
          <span className="material-symbols-outlined text-sky-600 text-3xl" style={{ fontVariationSettings: "'FILL' 0" }}>group</span>
        </div>
        <h1 className="text-4xl font-black text-on-surface font-headline mb-4">
          LinkedIn Profile Builder
        </h1>
        <p className="text-lg text-on-surface-variant font-medium">
          Answer a few quick questions and get AI-generated recommendations
        </p>
      </div>

      {error && (
        <div className="mb-6 glass-card border-rose-200/50 p-4 rounded-2xl text-rose-600 text-sm font-medium">
          {error}
        </div>
      )}

      <div className="glass-card rounded-3xl p-8">
        <ProgressBar current={step + 1} total={STEPS.length} />

        <div className="mb-12">
          <h2 className="text-3xl font-black text-on-surface font-headline mb-2">
            {currentStep.title}
          </h2>
          <p className="text-lg text-on-surface-variant font-medium">
            {currentStep.description}
          </p>
        </div>

        {currentStep.type === 'single' && (
          <SelectionGrid
            options={currentStep.options}
            selected={responses[currentStep.key]}
            onSelect={handleSelectOption}
            columns={2}
          />
        )}

        {currentStep.type === 'multi' && (
          <SelectionGrid
            options={currentStep.options}
            selected={responses[currentStep.key]}
            onSelect={handleSelectOption}
            multiple={true}
            columns={2}
          />
        )}

        {currentStep.type === 'multi-skills' && (
          <MultiSelectSkills
            selected={responses.skills}
            onSelect={handleSelectOption}
          />
        )}

        {currentStep.type === 'info' && (
          <div>
            <textarea
              placeholder="E.g., Led team of 5, reduced latency by 40%, built mobile app..."
              className="w-full bg-surface-container/50 border border-outline/20 rounded-2xl px-6 py-4 font-medium text-on-surface placeholder:text-outline/50 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500 resize-none"
              rows="4"
              value={responses.achievements || ''}
              onChange={e => setResponses(prev => ({ ...prev, achievements: e.target.value }))}
            />
            <p className="text-sm text-on-surface-variant mt-2">(Optional - helps with better recommendations)</p>
          </div>
        )}

        {/* Show preview if content is being generated or already generated */}
        {(generatingHeadline || generatedContent.headline) && step >= 1 && (
          <div className="mt-8 p-6 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl">
            {generatingHeadline ? (
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined animate-spin text-emerald-600" style={{ fontVariationSettings: "'FILL' 0" }}>sync</span>
                <p className="text-sm font-bold text-emerald-700">Generating headline...</p>
              </div>
            ) : (
              <>
                <p className="text-sm font-bold text-emerald-700 mb-3">✨ Your Generated Headline</p>
                <p className="text-on-surface font-bold">{generatedContent.headline}</p>
              </>
            )}
          </div>
        )}

        {(generatingAbout || generatedContent.about) && step >= 6 && (
          <div className="mt-4 p-6 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl">
            {generatingAbout ? (
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined animate-spin text-emerald-600" style={{ fontVariationSettings: "'FILL' 0" }}>sync</span>
                <p className="text-sm font-bold text-emerald-700">Generating about section...</p>
              </div>
            ) : (
              <>
                <p className="text-sm font-bold text-emerald-700 mb-3">✨ Your Generated About Section</p>
                <p className="text-on-surface font-medium text-sm leading-relaxed">{generatedContent.about}</p>
              </>
            )}
          </div>
        )}

        <div className="flex items-center gap-3 pt-8 mt-8 border-t border-outline/10">
          <button
            type="button"
            onClick={handlePrev}
            disabled={step === 0}
            className="px-6 py-3 border border-outline/20 rounded-xl font-bold text-on-surface hover:bg-surface-container/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Back
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={loadingFinal}
            className="flex-1 bg-gradient-to-r from-sky-500 to-sky-600 text-white px-8 py-3 rounded-xl font-bold hover:from-sky-600 hover:to-sky-700 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 shadow-lg flex items-center justify-center gap-3"
          >
            {isLastStep ? 'Get Recommendations' : 'Confirm & Continue'}
            <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>
              {isLastStep ? 'done_all' : 'arrow_forward'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
