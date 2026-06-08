import { useState } from 'react';
import { Wrench, Plus, Loader2, Code2, ArrowRight, X, Terminal, FileCode2 } from 'lucide-react';
import { api } from '../store/useAuthStore';
import { useUserProgress } from '../hooks/useUserProgress';

const LEARN_BUILD_DEFAULTS = {
  targetRole: '',
  currentSkills: '',
  projectIdeas: [],
  tasks: [
    { id: 't1', title: 'Personal Portfolio', status: 'done' },
    { id: 't2', title: 'React Weather App', status: 'in-progress' },
  ],
};

export default function LearnAndBuildTrack() {
  const { data: progress, updateProgress, isLoading: progressLoading, isSaving } = useUserProgress(
    'learn-and-build',
    LEARN_BUILD_DEFAULTS
  );

  const targetRole = progress.targetRole;
  const currentSkills = progress.currentSkills;
  const projectIdeas = progress.projectIdeas;
  const tasks = progress.tasks;

  const [loadingProjects, setLoadingProjects] = useState(false);
  const [activeBlueprint, setActiveBlueprint] = useState(null);
  const [loadingBlueprint, setLoadingBlueprint] = useState(false);

  if (progressLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-24 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-orange-600" />
      </div>
    );
  }

  const handleGenerateProjects = async (e) => {
    e.preventDefault();
    if (!targetRole.trim()) return;

    setLoadingProjects(true);
    try {
      const res = await api.post('/job-prep/projects', { role: targetRole, skills: currentSkills });
      updateProgress({ projectIdeas: res.data.data.projects });
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingProjects(false);
    }
  };

  const handleGenerateBlueprint = async (project) => {
    setLoadingBlueprint(true);
    setActiveBlueprint({ title: project.title, loading: true });
    
    try {
      const res = await api.post('/job-prep/project-blueprint', { projectTitle: project.title });
      setActiveBlueprint({
        title: project.title,
        loading: false,
        blueprint: res.data.data.blueprint
      });
      
      // Auto-add to Kanban 'todo' if not there
      if (!tasks.find(t => t.title === project.title)) {
        updateProgress({
          tasks: [...tasks, { id: Date.now().toString(), title: project.title, status: 'todo' }],
        });
      }
    } catch (err) {
      setActiveBlueprint(null);
    } finally {
      setLoadingBlueprint(false);
    }
  };

  const handleDragStart = (e, id) => {
    e.dataTransfer.setData('taskId', id);
  };

  const handleDrop = (e, status) => {
    const id = e.dataTransfer.getData('taskId');
    updateProgress({
      tasks: tasks.map(t => t.id === id ? { ...t, status } : t),
    });
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="p-4 bg-orange-100 text-orange-600 rounded-2xl">
          <Wrench className="w-8 h-8" />
        </div>
        <div>
          <h1 className="text-3xl font-black text-slate-900">
            Learn & Build Track
            {isSaving && <span className="ml-2 text-orange-600 text-sm font-semibold">Saving…</span>}
          </h1>
          <p className="text-slate-500 mt-1 text-lg">Build hyper-targeted projects to fill your resume skill gaps.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Project Generator */}
        <div className="lg:col-span-1 space-y-6">
          <div className="glass-card rounded-3xl p-6 border border-white/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-orange-50 text-orange-600 rounded-xl">
                <Code2 className="w-5 h-5" />
              </div>
              <h2 className="font-bold text-lg text-slate-900">Project Architect</h2>
            </div>
            <p className="text-sm text-slate-500 mb-6">Tell us your target role and current skills, and we'll suggest 3 perfect portfolio projects.</p>
            
            <form onSubmit={handleGenerateProjects} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Target Role</label>
                <input
                  type="text"
                  value={targetRole}
                  onChange={e => updateProgress({ targetRole: e.target.value })}
                  placeholder="e.g. React Developer"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Current Skills (Optional)</label>
                <input
                  type="text"
                  value={currentSkills}
                  onChange={e => updateProgress({ currentSkills: e.target.value })}
                  placeholder="e.g. HTML, CSS, JS"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <button
                type="submit"
                disabled={loadingProjects || !targetRole}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl transition-colors flex justify-center items-center gap-2 disabled:opacity-50"
              >
                {loadingProjects ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                Generate Ideas
              </button>
            </form>
          </div>

          {projectIdeas.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider">Suggested Projects</h3>
              {projectIdeas.map((proj, i) => (
                <div key={i} className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
                  <h4 className="font-bold text-slate-900 mb-1">{proj.title}</h4>
                  <p className="text-xs text-slate-500 mb-3">{proj.description}</p>
                  <div className="flex flex-wrap gap-1 mb-4">
                    {proj.skills_gained?.map((s, j) => (
                      <span key={j} className="text-[10px] font-bold px-2 py-1 bg-slate-100 text-slate-600 rounded-md uppercase">
                        {s}
                      </span>
                    ))}
                  </div>
                  <button
                    onClick={() => handleGenerateBlueprint(proj)}
                    className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition-colors flex justify-center items-center gap-1"
                  >
                    Generate Blueprint <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Kanban Board */}
        <div className="lg:col-span-2">
          <div className="glass-card rounded-3xl p-6 border border-white/50 h-full">
            <h2 className="font-bold text-xl text-slate-900 mb-6 flex items-center gap-2">
              Portfolio Kanban
              <span className="text-xs font-medium bg-slate-100 text-slate-500 px-2 py-1 rounded-full">Drag & Drop</span>
            </h2>

            <div className="grid grid-cols-3 gap-4 h-[500px]">
              {/* To Do */}
              <div 
                className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex flex-col"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, 'todo')}
              >
                <h3 className="font-bold text-slate-700 mb-4 flex items-center justify-between">
                  To Do
                  <span className="bg-slate-200 text-slate-600 text-xs px-2 py-0.5 rounded-full">{tasks.filter(t => t.status === 'todo').length}</span>
                </h3>
                <div className="flex-1 space-y-3 overflow-y-auto">
                  {tasks.filter(t => t.status === 'todo').map(task => (
                    <div 
                      key={task.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, task.id)}
                      className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm cursor-grab active:cursor-grabbing hover:border-orange-300 transition-colors"
                    >
                      <p className="font-medium text-sm text-slate-900">{task.title}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* In Progress */}
              <div 
                className="bg-orange-50/30 rounded-2xl p-4 border border-orange-100/50 flex flex-col"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, 'in-progress')}
              >
                <h3 className="font-bold text-orange-800 mb-4 flex items-center justify-between">
                  In Progress
                  <span className="bg-orange-200 text-orange-700 text-xs px-2 py-0.5 rounded-full">{tasks.filter(t => t.status === 'in-progress').length}</span>
                </h3>
                <div className="flex-1 space-y-3 overflow-y-auto">
                  {tasks.filter(t => t.status === 'in-progress').map(task => (
                    <div 
                      key={task.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, task.id)}
                      className="bg-white p-3 rounded-xl border border-orange-200 shadow-sm cursor-grab active:cursor-grabbing hover:border-orange-400 transition-colors"
                    >
                      <p className="font-medium text-sm text-slate-900">{task.title}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Done */}
              <div 
                className="bg-emerald-50/30 rounded-2xl p-4 border border-emerald-100/50 flex flex-col"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, 'done')}
              >
                <h3 className="font-bold text-emerald-800 mb-4 flex items-center justify-between">
                  Done
                  <span className="bg-emerald-200 text-emerald-700 text-xs px-2 py-0.5 rounded-full">{tasks.filter(t => t.status === 'done').length}</span>
                </h3>
                <div className="flex-1 space-y-3 overflow-y-auto">
                  {tasks.filter(t => t.status === 'done').map(task => (
                    <div 
                      key={task.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, task.id)}
                      className="bg-white p-3 rounded-xl border border-emerald-200 shadow-sm cursor-grab active:cursor-grabbing opacity-70 hover:opacity-100 transition-all"
                    >
                      <p className="font-medium text-sm text-slate-900 line-through decoration-slate-300">{task.title}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Blueprint Modal Overlay */}
      {activeBlueprint && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <FileCode2 className="w-6 h-6 text-orange-500" />
                Blueprint: {activeBlueprint.title}
              </h2>
              <button onClick={() => setActiveBlueprint(null)} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              {activeBlueprint.loading ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                  <Loader2 className="w-12 h-12 animate-spin text-orange-500 mb-4" />
                  <p>Architecting your solution...</p>
                </div>
              ) : (
                <div className="space-y-8">
                  {/* Architecture */}
                  <div>
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Architecture & Stack</h3>
                    <p className="text-slate-800 bg-orange-50 p-4 rounded-xl border border-orange-100">
                      {activeBlueprint.blueprint?.architecture}
                    </p>
                  </div>

                  {/* Setup Commands */}
                  <div>
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Setup Commands</h3>
                    <div className="bg-slate-900 rounded-xl p-4 font-mono text-sm text-green-400 space-y-2 overflow-x-auto">
                      {activeBlueprint.blueprint?.setup_commands?.map((cmd, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <Terminal className="w-4 h-4 text-slate-600 shrink-0" />
                          <span>{cmd}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Step by Step */}
                  <div>
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Implementation Steps</h3>
                    <ul className="space-y-3">
                      {activeBlueprint.blueprint?.steps?.map((step, i) => (
                        <li key={i} className="flex items-start gap-3 text-slate-700 bg-white border border-slate-200 p-3 rounded-xl shadow-sm">
                          <div className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center shrink-0 text-xs font-bold">
                            {i + 1}
                          </div>
                          <span className="mt-0.5">{step}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* README */}
                  <div>
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">README.md Draft</h3>
                    <pre className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-sm text-slate-700 whitespace-pre-wrap font-mono">
                      {activeBlueprint.blueprint?.readme_draft}
                    </pre>
                  </div>
                </div>
              )}
            </div>
            
            {!activeBlueprint.loading && (
              <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end">
                <button 
                  onClick={() => setActiveBlueprint(null)}
                  className="px-6 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition-colors"
                >
                  Close & View Kanban
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
