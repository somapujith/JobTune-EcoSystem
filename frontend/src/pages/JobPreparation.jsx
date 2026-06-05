import { Link } from 'react-router-dom';
import { Target, Rocket, Wrench, ChevronRight, BookOpen, BrainCircuit } from 'lucide-react';

const TRACKS = [
  {
    id: 'tune-and-polish',
    title: 'Tune & Polish',
    subtitle: 'For Experienced Professionals',
    description: 'Optimize your resume, generate perfect STAR stories, and practice targeted mock interviews.',
    icon: Target,
    color: 'from-blue-500 to-indigo-600',
    path: '/preparation/tune-and-polish'
  },
  {
    id: 'zero-to-hero',
    title: 'Zero to Hero',
    subtitle: 'For Complete Beginners',
    description: 'Find your path, follow a detailed interactive roadmap, and learn with an AI tutor from scratch.',
    icon: Rocket,
    color: 'from-emerald-400 to-teal-600',
    path: '/preparation/zero-to-hero'
  },
  {
    id: 'learn-and-build',
    title: 'Learn & Build',
    subtitle: 'For Intermediate Builders',
    description: 'Generate hyper-targeted projects to fill skill gaps on your resume and track your portfolio.',
    icon: Wrench,
    color: 'from-orange-400 to-rose-500',
    path: '/preparation/learn-and-build'
  }
];

export default function JobPreparation() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-12">
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center p-3 bg-indigo-50 rounded-2xl mb-2">
          <BrainCircuit className="w-8 h-8 text-indigo-600" />
        </div>
        <h1 className="text-4xl font-black text-slate-900 tracking-tight">
          Job Preparation Center
        </h1>
        <p className="text-lg text-slate-500 max-w-2xl mx-auto leading-relaxed">
          Select your track based on your current experience level. Whether you are starting from scratch or just need to polish your interview skills, we have a guided path for you.
        </p>
      </div>

      {/* Tracks Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {TRACKS.map((track) => {
          const Icon = track.icon;
          return (
            <Link 
              key={track.id}
              to={track.path}
              className="group relative flex flex-col glass-card rounded-3xl p-8 hover:-translate-y-2 transition-all duration-300 hover:shadow-xl overflow-hidden border border-white/50"
            >
              {/* Background gradient blur */}
              <div className={`absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 rounded-full bg-gradient-to-br ${track.color} opacity-10 blur-2xl group-hover:opacity-20 transition-opacity`} />
              
              <div className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br ${track.color} text-white mb-6 shadow-lg shadow-indigo-200/50`}>
                <Icon className="w-7 h-7" />
              </div>
              
              <div className="flex-1">
                <p className="text-sm font-bold text-indigo-600 mb-1 uppercase tracking-wider">{track.subtitle}</p>
                <h2 className="text-2xl font-bold text-slate-900 mb-3">{track.title}</h2>
                <p className="text-slate-600 leading-relaxed mb-8">
                  {track.description}
                </p>
              </div>

              <div className="flex items-center text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors mt-auto">
                Start Track
                <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
