import { useState, useEffect } from 'react';
import { generateReadme, SKILLS_BY_CATEGORY } from '../utils/readmeGenerator';
import GitHubReadmePreview from './GitHubReadmePreview';
import { X } from 'lucide-react';

export default function GitHubReadmeGenerator() {
  const [formData, setFormData] = useState({
    name: '',
    tagline: '',
    bio: '',
    github: '',
    currentWork: '',
    learning: '',
    askAbout: '',
    email: '',
    linkedin: '',
    twitter: '',
    instagram: '',
    portfolio: '',
    blog: '',
    skills: [],
    techStack: '',
    showGithubStats: true,
    showStreakStats: true,
    showTopLanguages: true,
    showVisitors: true,
    buyMeCoffee: '',
    customSection: '',
    customSectionTitle: 'Additional Info',
  });

  const [markdown, setMarkdown] = useState('');
  const [copied, setCopied] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState(null);

  // Generate markdown whenever form data changes
  useEffect(() => {
    setMarkdown(generateReadme(formData));
  }, [formData]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const addSkill = (skill) => {
    setFormData(prev => ({
      ...prev,
      skills: prev.skills.includes(skill)
        ? prev.skills.filter(s => s !== skill)
        : [...prev.skills, skill]
    }));
  };

  const removeSkill = (skill) => {
    setFormData(prev => ({
      ...prev,
      skills: prev.skills.filter(s => s !== skill)
    }));
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const element = document.createElement('a');
    const file = new Blob([markdown], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = 'README.md';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="w-full space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Form */}
        <div className="space-y-6 overflow-y-auto max-h-[80vh] pr-4">
          {/* Personal Info */}
          <section className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Personal Info</h3>
            <div className="space-y-4">
              <input
                type="text"
                name="name"
                placeholder="Your Name"
                value={formData.name}
                onChange={handleInputChange}
                className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <input
                type="text"
                name="tagline"
                placeholder="Your Tagline (e.g., Full Stack Developer | React Enthusiast)"
                value={formData.tagline}
                onChange={handleInputChange}
                className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <textarea
                name="bio"
                placeholder="Short bio about yourself..."
                value={formData.bio}
                onChange={handleInputChange}
                rows={3}
                className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <input
                type="email"
                name="email"
                placeholder="Your Email"
                value={formData.email}
                onChange={handleInputChange}
                className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </section>

          {/* Current Work */}
          <section className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Current Work</h3>
            <div className="space-y-4">
              <input
                type="text"
                name="currentWork"
                placeholder="What are you working on?"
                value={formData.currentWork}
                onChange={handleInputChange}
                className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <input
                type="text"
                name="learning"
                placeholder="What are you learning?"
                value={formData.learning}
                onChange={handleInputChange}
                className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <input
                type="text"
                name="askAbout"
                placeholder="What to ask you about? (e.g., Web Development, React)"
                value={formData.askAbout}
                onChange={handleInputChange}
                className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </section>

          {/* Dev Profiles */}
          <section className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Dev Profiles</h3>
            <div className="space-y-3">
              {[
                { name: 'github', label: 'GitHub Username' },
                { name: 'linkedin', label: 'LinkedIn Profile URL' },
                { name: 'portfolio', label: 'Portfolio URL' },
                { name: 'blog', label: 'Blog URL' },
                { name: 'twitter', label: 'Twitter Handle' },
                { name: 'instagram', label: 'Instagram Handle' },
              ].map(field => (
                <input
                  key={field.name}
                  type="text"
                  name={field.name}
                  placeholder={field.label}
                  value={formData[field.name]}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                />
              ))}
            </div>
          </section>

          {/* Skills */}
          <section className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Skills</h3>

            {/* Selected Skills */}
            {formData.skills.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {formData.skills.map(skill => (
                  <div key={skill} className="flex items-center gap-2 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-3 py-1 rounded-full text-sm">
                    {skill}
                    <button
                      onClick={() => removeSkill(skill)}
                      className="text-blue-700 dark:text-blue-300 hover:text-blue-900"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Skill Categories */}
            <div className="space-y-2">
              {Object.entries(SKILLS_BY_CATEGORY).map(([category, skills]) => (
                <div key={category}>
                  <button
                    onClick={() => setExpandedCategory(expandedCategory === category ? null : category)}
                    className="w-full text-left px-3 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg font-semibold text-slate-900 dark:text-white transition-colors"
                  >
                    {category}
                  </button>
                  {expandedCategory === category && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {skills.map(skill => (
                        <button
                          key={skill}
                          onClick={() => addSkill(skill)}
                          className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                            formData.skills.includes(skill)
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-600'
                          }`}
                        >
                          {skill}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Stats & Features */}
          <section className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">GitHub Stats</h3>
            <div className="space-y-3">
              {[
                { name: 'showGithubStats', label: 'Show GitHub Stats Card' },
                { name: 'showStreakStats', label: 'Show GitHub Streak Stats' },
                { name: 'showTopLanguages', label: 'Show Top Languages' },
                { name: 'showVisitors', label: 'Show Visitors Counter' },
              ].map(field => (
                <label key={field.name} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    name={field.name}
                    checked={formData[field.name]}
                    onChange={handleInputChange}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600"
                  />
                  <span className="text-slate-900 dark:text-white">{field.label}</span>
                </label>
              ))}
            </div>
          </section>

          {/* Extras */}
          <section className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Extras</h3>
            <div className="space-y-4">
              <input
                type="text"
                name="buyMeCoffee"
                placeholder="Buy Me A Coffee Link (optional)"
                value={formData.buyMeCoffee}
                onChange={handleInputChange}
                className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <input
                type="text"
                name="techStack"
                placeholder="Tech Stack (comma-separated, e.g., React, Node.js, MongoDB)"
                value={formData.techStack}
                onChange={handleInputChange}
                className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </section>

          {/* Custom Section */}
          <section className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Custom Section</h3>
            <div className="space-y-3">
              <input
                type="text"
                name="customSectionTitle"
                placeholder="Section Title"
                value={formData.customSectionTitle}
                onChange={handleInputChange}
                className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <textarea
                name="customSection"
                placeholder="Custom markdown content..."
                value={formData.customSection}
                onChange={handleInputChange}
                rows={4}
                className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </section>
        </div>

        {/* Right: Preview */}
        <div className="h-[80vh]">
          <GitHubReadmePreview
            markdown={markdown}
            onCopy={handleCopy}
            onDownload={handleDownload}
            copied={copied}
          />
        </div>
      </div>
    </div>
  );
}
