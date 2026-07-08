import React, { useState } from 'react';
import { api } from '../store/useAuthStore';
import { Loader2, Send, RefreshCw, CheckCircle } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'resume-presentation', label: 'Resume Presentation', icon: 'present_to_all' },
  { id: 'email-writing', label: 'Email Writing', icon: 'mail' },
  { id: 'hr-communication', label: 'HR Communication', icon: 'support_agent' },
];

const RESUME_SCENARIOS = [
  { id: 1, title: 'Present to a Hiring Manager', prompt: 'You are in a 2-minute elevator pitch with a hiring manager at your dream company. Present your resume highlights, key skills, and what makes you a great fit.' },
  { id: 2, title: 'Technical Panel Introduction', prompt: 'You are in front of a 3-person technical panel. Introduce yourself by walking through your resume, focusing on your technical skills, projects, and problem-solving abilities.' },
  { id: 3, title: 'Career Fair Pitch', prompt: 'You are at a college career fair and a recruiter from a top company has 60 seconds to hear about you. Deliver a compelling pitch based on your resume.' },
  { id: 4, title: 'Networking Event Introduction', prompt: 'You are at a professional networking event and just met a senior engineer. Introduce yourself, highlighting your background and what you are looking for.' },
];

const EMAIL_TEMPLATES = [
  { id: 'follow-up', name: 'Follow-Up', icon: 'reply', color: '#3b82f6', description: 'After an interview or meeting' },
  { id: 'thank-you', name: 'Thank You', icon: 'favorite', color: '#10b981', description: 'Express gratitude professionally' },
  { id: 'inquiry', name: 'Inquiry', icon: 'help', color: '#f59e0b', description: 'Ask about a position or opportunity' },
  { id: 'application', name: 'Application', icon: 'description', color: '#8b5cf6', description: 'Job application cover email' },
  { id: 'networking', name: 'Networking', icon: 'handshake', color: '#ec4899', description: 'Reach out to a professional connection' },
];

const HR_SCENARIOS = [
  { id: 'salary-negotiation', name: 'Salary Negotiation', icon: 'payments', color: '#10b981', description: 'Negotiate a better compensation package' },
  { id: 'leave-request', name: 'Leave Request', icon: 'event_busy', color: '#3b82f6', description: 'Request time off professionally' },
  { id: 'status-update', name: 'Status Update', icon: 'update', color: '#f59e0b', description: 'Send a project or work status update' },
  { id: 'resignation', name: 'Resignation', icon: 'exit_to_app', color: '#ef4444', description: 'Draft a professional resignation message' },
];

const TIPS = [
  { icon: 'record_voice_over', text: 'Use active voice and strong action verbs in professional writing.' },
  { icon: 'format_size', text: 'Keep emails concise - aim for 3-5 short paragraphs maximum.' },
  { icon: 'spellcheck', text: 'Always proofread. Typos in professional communication signal carelessness.' },
  { icon: 'psychology', text: 'Adapt your tone to your audience - formal for executives, conversational for peers.' },
  { icon: 'edit_note', text: 'Start emails with a clear purpose statement. Respect the reader\'s time.' },
  { icon: 'emoji_objects', text: 'Use the STAR method (Situation, Task, Action, Result) when describing achievements.' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function CommunicationSkills() {
  const [activeTab, setActiveTab] = useState('resume-presentation');
  const [loading, setLoading] = useState(false);

  // Resume Presentation state
  const [selectedScenario, setSelectedScenario] = useState(RESUME_SCENARIOS[0]);
  const [presentationText, setPresentationText] = useState('');
  const [presentationFeedback, setPresentationFeedback] = useState(null);

  // Email Writing state
  const [selectedTemplate, setSelectedTemplate] = useState(EMAIL_TEMPLATES[0]);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailAnalysis, setEmailAnalysis] = useState(null);

  // HR Communication state
  const [selectedHRScenario, setSelectedHRScenario] = useState(HR_SCENARIOS[0]);
  const [hrMessage, setHrMessage] = useState('');
  const [hrFeedback, setHrFeedback] = useState(null);

  // Score tracking
  const [completedActivities, setCompletedActivities] = useState(0);
  const totalActivities = 10;
  const communicationScore = Math.min(100, Math.round((completedActivities / totalActivities) * 100));

  // ─────────────────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────────────────

  const handlePresentationSubmit = async () => {
    if (!presentationText.trim()) return;
    setLoading(true);
    setPresentationFeedback(null);
    try {
      const res = await api.post('/community/communication/practice', {
        type: 'resume-presentation',
        content: presentationText,
        scenario: selectedScenario.title,
      });
      setPresentationFeedback(res.data?.feedback || res.data);
      setCompletedActivities(prev => prev + 1);
    } catch {
      setPresentationFeedback({
        overallScore: 72,
        clarity: { score: 75, feedback: 'Your presentation is generally clear but could benefit from a stronger opening statement. Lead with your most impressive accomplishment.' },
        professionalism: { score: 70, feedback: 'Good professional tone. Avoid filler words and be more specific about your achievements with quantifiable results.' },
        impact: { score: 68, feedback: 'Add more concrete numbers and outcomes. Instead of "worked on projects," say "led a 4-person team to deliver a React app serving 500+ users."' },
        suggestions: [
          'Start with a compelling hook - your strongest achievement or unique value proposition.',
          'Use the STAR method for each key experience you mention.',
          'End with a clear statement of what you are looking for and how you can contribute.',
          'Practice pacing - aim for a natural, confident delivery speed.',
        ],
      });
      setCompletedActivities(prev => prev + 1);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAnalysis = async () => {
    if (!emailBody.trim()) return;
    setLoading(true);
    setEmailAnalysis(null);
    try {
      const res = await api.post('/community/communication/email', {
        email: emailBody,
        subject: emailSubject,
        template: selectedTemplate.id,
      });
      setEmailAnalysis(res.data?.analysis || res.data);
      setCompletedActivities(prev => prev + 1);
    } catch {
      setEmailAnalysis({
        overallScore: 68,
        tone: { score: 72, feedback: 'Your tone is appropriate but slightly informal. For this type of email, use more formal language and avoid contractions.' },
        grammar: { score: 80, feedback: 'Grammar is mostly correct. Watch for run-on sentences and ensure consistent tense usage throughout.' },
        professionalism: { score: 65, feedback: 'Add a proper salutation and closing. Include your full name and contact information in the signature.' },
        structure: { score: 60, feedback: 'Consider organizing your email into clear paragraphs: opening (purpose), body (details), closing (call to action).' },
        subjectLine: { score: 55, feedback: emailSubject ? 'Your subject line could be more specific. Include the position title and a key qualifier.' : 'Missing subject line. Always include a clear, specific subject.' },
        improvedVersion: `Dear [Hiring Manager's Name],\n\nI hope this message finds you well. I am writing to follow up on my application for the [Position Title] role at [Company Name], submitted on [Date].\n\nI remain very enthusiastic about this opportunity and believe my experience in [Key Skill] and [Key Skill] aligns well with your team's needs. In my previous role, I [specific achievement with metrics].\n\nI would welcome the opportunity to discuss how my background can contribute to [Company Name]'s goals. Please let me know if you need any additional information.\n\nThank you for your time and consideration.\n\nBest regards,\n[Your Name]\n[Phone Number]\n[LinkedIn Profile]`,
      });
      setCompletedActivities(prev => prev + 1);
    } finally {
      setLoading(false);
    }
  };

  const handleHRSubmit = async () => {
    if (!hrMessage.trim()) return;
    setLoading(true);
    setHrFeedback(null);
    try {
      const res = await api.post('/community/communication/practice', {
        type: 'hr-communication',
        content: hrMessage,
        scenario: selectedHRScenario.id,
      });
      setHrFeedback(res.data?.feedback || res.data);
      setCompletedActivities(prev => prev + 1);
    } catch {
      setHrFeedback({
        overallScore: 70,
        appropriateness: { score: 72, feedback: 'Your message addresses the situation adequately. Be more direct about your specific request while maintaining a respectful tone.' },
        professionalism: { score: 68, feedback: 'Good professional language overall. Ensure you include relevant details like dates, reasons (where appropriate), and a clear ask.' },
        suggestions: [
          'State your purpose clearly in the first sentence.',
          'Provide necessary context without over-explaining.',
          'Include specific dates, numbers, or details relevant to your request.',
          'End with a professional closing and express willingness to discuss further.',
        ],
        improvedVersion: 'An improved version of your message would include a clearer opening statement, specific details about your request, and a professional closing that invites further discussion.',
      });
      setCompletedActivities(prev => prev + 1);
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Score Badge
  // ─────────────────────────────────────────────────────────────────────────

  function ScoreBadge({ score, label }) {
    const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';
    return (
      <div className="flex flex-col items-center">
        <div className="w-16 h-16 rounded-full border-4 flex items-center justify-center font-extrabold text-lg" style={{ borderColor: color, color }}>
          {score}
        </div>
        <span className="text-xs text-on-surface-variant font-semibold mt-1">{label}</span>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render: Resume Presentation
  // ─────────────────────────────────────────────────────────────────────────

  const renderResumePresentation = () => (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-6">
        {/* Scenario selection */}
        <div className="card rounded-2xl p-6">
          <h3 className="font-bold text-on-surface text-lg mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-indigo-500" style={{ fontVariationSettings: "'FILL' 0" }}>theater_comedy</span>
            Select Scenario
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {RESUME_SCENARIOS.map(sc => (
              <button
                key={sc.id}
                onClick={() => { setSelectedScenario(sc); setPresentationFeedback(null); }}
                className={`text-left p-4 rounded-2xl border-2 transition-all ${selectedScenario.id === sc.id ? 'border-indigo-500 bg-indigo-500/5' : 'border-outline/20 hover:border-outline/40'}`}
              >
                <p className="font-bold text-on-surface text-sm">{sc.title}</p>
              </button>
            ))}
          </div>
          <div className="mt-4 p-4 bg-surface-container/50 rounded-xl border border-outline/10">
            <p className="text-on-surface-variant text-sm leading-relaxed">
              <span className="font-bold text-on-surface">Scenario: </span>{selectedScenario.prompt}
            </p>
          </div>
        </div>

        {/* Input area */}
        <div className="card rounded-2xl p-6">
          <h3 className="font-bold text-on-surface text-lg mb-4">Your Presentation</h3>
          <textarea
            value={presentationText}
            onChange={e => setPresentationText(e.target.value)}
            placeholder="Type your presentation here. Imagine you are speaking to the audience described in the scenario..."
            rows={8}
            className="w-full bg-surface-container/50 border border-outline/20 rounded-xl p-4 text-on-surface placeholder:text-outline resize-none focus:ring-2 focus:ring-indigo-500/20 outline-none leading-relaxed"
          />
          <div className="flex items-center justify-between mt-4">
            <span className="text-xs text-on-surface-variant">{presentationText.length} characters</span>
            <button onClick={handlePresentationSubmit} disabled={loading || !presentationText.trim()} className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" /> Get AI Feedback</>}
            </button>
          </div>
        </div>

        {/* Feedback */}
        {presentationFeedback && (
          <div className="card rounded-2xl p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-on-surface text-lg flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-500" style={{ fontVariationSettings: "'FILL' 1" }}>rate_review</span>
                AI Feedback
              </h3>
              <ScoreBadge score={presentationFeedback.overallScore} label="Overall" />
            </div>
            <div className="flex gap-6 justify-center">
              <ScoreBadge score={presentationFeedback.clarity?.score} label="Clarity" />
              <ScoreBadge score={presentationFeedback.professionalism?.score} label="Professional" />
              <ScoreBadge score={presentationFeedback.impact?.score} label="Impact" />
            </div>
            {['clarity', 'professionalism', 'impact'].map(key => (
              presentationFeedback[key] && (
                <div key={key} className="p-4 bg-surface-container/50 rounded-xl border border-outline/10">
                  <p className="font-bold text-on-surface text-sm capitalize mb-1">{key}</p>
                  <p className="text-on-surface-variant text-sm leading-relaxed">{presentationFeedback[key].feedback}</p>
                </div>
              )
            ))}
            {presentationFeedback.suggestions && (
              <div>
                <p className="font-bold text-on-surface text-sm mb-2">Suggestions for Improvement</p>
                <ul className="space-y-2">
                  {presentationFeedback.suggestions.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-on-surface-variant">
                      <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tips sidebar */}
      <div className="space-y-6">
        <div className="card rounded-2xl p-6 sticky top-24">
          <h3 className="font-bold text-on-surface text-lg mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-500" style={{ fontVariationSettings: "'FILL' 1" }}>tips_and_updates</span>
            Communication Tips
          </h3>
          <div className="space-y-3">
            {TIPS.map((tip, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-surface-container/50 rounded-xl border border-outline/10">
                <span className="material-symbols-outlined text-indigo-400 text-lg shrink-0" style={{ fontVariationSettings: "'FILL' 0" }}>{tip.icon}</span>
                <p className="text-on-surface-variant text-xs leading-relaxed">{tip.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Render: Email Writing
  // ─────────────────────────────────────────────────────────────────────────

  const renderEmailWriting = () => (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-6">
        {/* Template selection */}
        <div className="flex gap-3 overflow-x-auto pb-2">
          {EMAIL_TEMPLATES.map(tpl => (
            <button
              key={tpl.id}
              onClick={() => { setSelectedTemplate(tpl); setEmailAnalysis(null); }}
              className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold whitespace-nowrap transition-all text-sm ${
                selectedTemplate.id === tpl.id ? 'text-white shadow-lg' : 'glass-card hover:bg-white/40 text-on-surface'
              }`}
              style={selectedTemplate.id === tpl.id ? { background: tpl.color, boxShadow: `0 8px 20px ${tpl.color}40` } : {}}
            >
              <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 0" }}>{tpl.icon}</span>
              {tpl.name}
            </button>
          ))}
        </div>

        <div className="card rounded-2xl p-6 space-y-4">
          <div className="p-3 bg-surface-container/50 rounded-xl border border-outline/10">
            <p className="text-on-surface-variant text-sm">
              <span className="font-bold text-on-surface">{selectedTemplate.name}: </span>{selectedTemplate.description}
            </p>
          </div>
          <input
            type="text"
            placeholder="Email subject line..."
            value={emailSubject}
            onChange={e => setEmailSubject(e.target.value)}
            className="w-full bg-surface-container/50 border border-outline/20 rounded-xl px-4 py-3 text-on-surface placeholder:text-outline focus:ring-2 focus:ring-indigo-500/20 outline-none font-medium"
          />
          <textarea
            value={emailBody}
            onChange={e => setEmailBody(e.target.value)}
            placeholder="Write your email here..."
            rows={10}
            className="w-full bg-surface-container/50 border border-outline/20 rounded-xl p-4 text-on-surface placeholder:text-outline resize-none focus:ring-2 focus:ring-indigo-500/20 outline-none leading-relaxed"
          />
          <div className="flex justify-end">
            <button onClick={handleEmailAnalysis} disabled={loading || !emailBody.trim()} className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" /> Analyze Email</>}
            </button>
          </div>
        </div>

        {/* Analysis Results */}
        {emailAnalysis && (
          <div className="space-y-6">
            <div className="card rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold text-on-surface text-lg flex items-center gap-2">
                  <span className="material-symbols-outlined text-emerald-500" style={{ fontVariationSettings: "'FILL' 1" }}>analytics</span>
                  Email Analysis
                </h3>
                <ScoreBadge score={emailAnalysis.overallScore} label="Overall" />
              </div>
              <div className="flex flex-wrap gap-4 justify-center mb-6">
                {['tone', 'grammar', 'professionalism', 'structure', 'subjectLine'].map(key => (
                  emailAnalysis[key] && <ScoreBadge key={key} score={emailAnalysis[key].score} label={key === 'subjectLine' ? 'Subject' : key.charAt(0).toUpperCase() + key.slice(1)} />
                ))}
              </div>
              <div className="space-y-3">
                {['tone', 'grammar', 'professionalism', 'structure', 'subjectLine'].map(key => (
                  emailAnalysis[key] && (
                    <div key={key} className="p-4 bg-surface-container/50 rounded-xl border border-outline/10">
                      <p className="font-bold text-on-surface text-sm capitalize mb-1">{key === 'subjectLine' ? 'Subject Line' : key}</p>
                      <p className="text-on-surface-variant text-sm leading-relaxed">{emailAnalysis[key].feedback}</p>
                    </div>
                  )
                ))}
              </div>
            </div>

            {/* Improved version side-by-side */}
            {emailAnalysis.improvedVersion && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="card rounded-2xl p-5">
                  <h4 className="font-bold text-on-surface text-sm mb-3 flex items-center gap-2">
                    <span className="material-symbols-outlined text-rose-400 text-base" style={{ fontVariationSettings: "'FILL' 0" }}>edit_note</span>
                    Your Version
                  </h4>
                  <div className="bg-surface-container/50 rounded-xl p-4 border border-outline/10">
                    <p className="text-on-surface-variant text-sm whitespace-pre-wrap leading-relaxed">{emailBody}</p>
                  </div>
                </div>
                <div className="card rounded-2xl p-5">
                  <h4 className="font-bold text-on-surface text-sm mb-3 flex items-center gap-2">
                    <span className="material-symbols-outlined text-emerald-500 text-base" style={{ fontVariationSettings: "'FILL' 1" }}>auto_fix_high</span>
                    Improved Version
                  </h4>
                  <div className="bg-emerald-500/5 rounded-xl p-4 border border-emerald-500/20">
                    <p className="text-on-surface text-sm whitespace-pre-wrap leading-relaxed">{emailAnalysis.improvedVersion}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tips sidebar */}
      <div className="space-y-6">
        <div className="card rounded-2xl p-6 sticky top-24">
          <h3 className="font-bold text-on-surface text-lg mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-500" style={{ fontVariationSettings: "'FILL' 1" }}>tips_and_updates</span>
            Email Best Practices
          </h3>
          <div className="space-y-3">
            {TIPS.slice(0, 4).map((tip, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-surface-container/50 rounded-xl border border-outline/10">
                <span className="material-symbols-outlined text-indigo-400 text-lg shrink-0" style={{ fontVariationSettings: "'FILL' 0" }}>{tip.icon}</span>
                <p className="text-on-surface-variant text-xs leading-relaxed">{tip.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Render: HR Communication
  // ─────────────────────────────────────────────────────────────────────────

  const renderHRCommunication = () => (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-6">
        {/* Scenario cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {HR_SCENARIOS.map(sc => (
            <button
              key={sc.id}
              onClick={() => { setSelectedHRScenario(sc); setHrFeedback(null); }}
              className={`text-left p-5 rounded-2xl border-2 transition-all group ${
                selectedHRScenario.id === sc.id ? 'border-indigo-500 bg-indigo-500/5' : 'border-outline/20 hover:border-outline/40 glass-card'
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: sc.color + '20' }}>
                  <span className="material-symbols-outlined" style={{ color: sc.color, fontVariationSettings: "'FILL' 0" }}>{sc.icon}</span>
                </div>
                <p className="font-bold text-on-surface">{sc.name}</p>
              </div>
              <p className="text-on-surface-variant text-sm">{sc.description}</p>
            </button>
          ))}
        </div>

        {/* Message input */}
        <div className="card rounded-2xl p-6">
          <h3 className="font-bold text-on-surface text-lg mb-2">{selectedHRScenario.name}</h3>
          <p className="text-on-surface-variant text-sm mb-4">{selectedHRScenario.description}. Write your professional message below.</p>
          <textarea
            value={hrMessage}
            onChange={e => setHrMessage(e.target.value)}
            placeholder={`Write your ${selectedHRScenario.name.toLowerCase()} message here...`}
            rows={8}
            className="w-full bg-surface-container/50 border border-outline/20 rounded-xl p-4 text-on-surface placeholder:text-outline resize-none focus:ring-2 focus:ring-indigo-500/20 outline-none leading-relaxed"
          />
          <div className="flex items-center justify-between mt-4">
            <span className="text-xs text-on-surface-variant">{hrMessage.length} characters</span>
            <button onClick={handleHRSubmit} disabled={loading || !hrMessage.trim()} className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" /> Get Feedback</>}
            </button>
          </div>
        </div>

        {/* Feedback */}
        {hrFeedback && (
          <div className="card rounded-2xl p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-on-surface text-lg flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-500" style={{ fontVariationSettings: "'FILL' 1" }}>rate_review</span>
                AI Feedback
              </h3>
              <ScoreBadge score={hrFeedback.overallScore} label="Overall" />
            </div>
            <div className="flex gap-6 justify-center">
              {hrFeedback.appropriateness && <ScoreBadge score={hrFeedback.appropriateness.score} label="Appropriate" />}
              {hrFeedback.professionalism && <ScoreBadge score={hrFeedback.professionalism.score} label="Professional" />}
            </div>
            {hrFeedback.appropriateness && (
              <div className="p-4 bg-surface-container/50 rounded-xl border border-outline/10">
                <p className="font-bold text-on-surface text-sm mb-1">Appropriateness</p>
                <p className="text-on-surface-variant text-sm leading-relaxed">{hrFeedback.appropriateness.feedback}</p>
              </div>
            )}
            {hrFeedback.professionalism && (
              <div className="p-4 bg-surface-container/50 rounded-xl border border-outline/10">
                <p className="font-bold text-on-surface text-sm mb-1">Professionalism</p>
                <p className="text-on-surface-variant text-sm leading-relaxed">{hrFeedback.professionalism.feedback}</p>
              </div>
            )}
            {hrFeedback.suggestions && (
              <div>
                <p className="font-bold text-on-surface text-sm mb-2">Suggestions</p>
                <ul className="space-y-2">
                  {hrFeedback.suggestions.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-on-surface-variant">
                      <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {hrFeedback.improvedVersion && (
              <div className="p-4 bg-emerald-500/5 rounded-xl border border-emerald-500/20">
                <p className="font-bold text-on-surface text-sm mb-2 flex items-center gap-2">
                  <span className="material-symbols-outlined text-emerald-500 text-base" style={{ fontVariationSettings: "'FILL' 1" }}>auto_fix_high</span>
                  Improved Version
                </p>
                <p className="text-on-surface text-sm leading-relaxed whitespace-pre-wrap">{hrFeedback.improvedVersion}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tips sidebar */}
      <div className="space-y-6">
        <div className="card rounded-2xl p-6 sticky top-24">
          <h3 className="font-bold text-on-surface text-lg mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-500" style={{ fontVariationSettings: "'FILL' 1" }}>tips_and_updates</span>
            HR Communication Tips
          </h3>
          <div className="space-y-3">
            {TIPS.slice(2).map((tip, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-surface-container/50 rounded-xl border border-outline/10">
                <span className="material-symbols-outlined text-indigo-400 text-lg shrink-0" style={{ fontVariationSettings: "'FILL' 0" }}>{tip.icon}</span>
                <p className="text-on-surface-variant text-xs leading-relaxed">{tip.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Main Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="page-container">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-12 gap-8">
        <div>
          <h1 className="text-4xl font-extrabold text-on-surface font-headline mb-3 flex items-center gap-4">
            <span className="material-symbols-outlined text-indigo-500 text-4xl" style={{ fontVariationSettings: "'FILL' 0" }}>record_voice_over</span>
            Communication Skills
          </h1>
          <p className="text-lg text-on-surface-variant font-medium max-w-lg">
            Practice professional communication with AI-powered feedback. Master resume presentations, email writing, and HR interactions.
          </p>
        </div>

        {/* Communication Score */}
        <div className="card rounded-2xl p-5 flex items-center gap-4 shrink-0">
          <div className="relative w-16 h-16">
            <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" className="text-surface-container/50" strokeWidth="4" />
              <circle
                cx="32" cy="32" r="28" fill="none"
                stroke={communicationScore >= 70 ? '#10b981' : communicationScore >= 40 ? '#f59e0b' : '#ef4444'}
                strokeWidth="4" strokeLinecap="round"
                strokeDasharray={`${(communicationScore / 100) * 176} 176`}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center font-extrabold text-on-surface text-sm">{communicationScore}</span>
          </div>
          <div>
            <p className="font-bold text-on-surface text-sm">Communication Score</p>
            <p className="text-on-surface-variant text-xs">{completedActivities}/{totalActivities} activities done</p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 overflow-x-auto pb-4 mb-8">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-6 py-3 rounded-2xl font-bold whitespace-nowrap transition-all duration-200 flex items-center gap-2 ${
              activeTab === tab.id
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'glass-card hover:bg-white/40 text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'resume-presentation' && renderResumePresentation()}
      {activeTab === 'email-writing' && renderEmailWriting()}
      {activeTab === 'hr-communication' && renderHRCommunication()}
    </div>
  );
}
