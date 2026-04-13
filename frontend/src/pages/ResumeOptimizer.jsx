import React, { useState } from 'react';
import { Link } from 'react-router-dom';

export default function ResumeOptimizer() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const [isDragOver, setIsDragOver] = useState(false);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      setTimeout(() => {
        setUploading(false);
      }, 2000);
    } catch (err) {
      console.error(err);
      setUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.name.match(/\.(pdf|doc|docx)$/i)) {
        setFile(droppedFile);
      }
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  return (
    <div className="flex pt-[0px] min-h-[calc(100vh-5rem)] w-full">
      {/* SideNavBar Shell */}
      <aside className="hidden md:flex flex-col gap-2 p-4 w-64 bg-slate-50 border-r border-slate-200 fixed left-0 top-20 h-[calc(100vh-5rem)] font-headline font-medium z-[40]">
        <div className="px-4 py-6 mb-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
            </div>
            <span className="text-lg font-black text-blue-900">Resume Pro</span>
          </div>
          <p className="text-xs text-slate-500 uppercase tracking-widest pl-11">Optimization Engine</p>
        </div>
        <nav className="flex-1 space-y-1">
          <Link to="#" className="flex items-center gap-3 px-4 py-3 text-slate-500 hover:bg-slate-100 hover:translate-x-1 transition-all duration-200 rounded-xl">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0" }}>description</span>
            <span>My Resumes</span>
          </Link>
          <Link to="#" className="flex items-center gap-3 px-4 py-3 bg-white text-blue-700 shadow-sm rounded-xl hover:translate-x-1 transition-all duration-200">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0" }}>analytics</span>
            <span>Analysis</span>
          </Link>
          <Link to="#" className="flex items-center gap-3 px-4 py-3 text-slate-500 hover:bg-slate-100 hover:translate-x-1 transition-all duration-200 rounded-xl">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0" }}>auto_awesome</span>
            <span>AI Editor</span>
          </Link>
          <Link to="#" className="flex items-center gap-3 px-4 py-3 text-slate-500 hover:bg-slate-100 hover:translate-x-1 transition-all duration-200 rounded-xl">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0" }}>history</span>
            <span>History</span>
          </Link>
          <Link to="#" className="flex items-center gap-3 px-4 py-3 text-slate-500 hover:bg-slate-100 hover:translate-x-1 transition-all duration-200 rounded-xl">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0" }}>workspace_premium</span>
            <span>Premium</span>
          </Link>
        </nav>
        <button className="mt-auto mb-4 mx-2 bg-gradient-to-br from-primary to-primary-container text-white py-3 px-6 rounded-xl font-semibold shadow-[0px_20px_40px_rgba(0,78,159,0.15)] scale-102 active:scale-95 transition-all flex items-center justify-center gap-2">
          <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 0" }}>add</span>
          New Analysis
        </button>
      </aside>

      {/* Main Content Canvas */}
      <main className="flex-1 ml-0 md:ml-64 p-8 md:p-12 bg-surface min-h-[calc(100vh-5rem)]">
        <div className="max-w-6xl mx-auto">
          {/* Hero Heading Section */}
          <header className="mb-12">
            <h1 className="text-5xl font-extrabold tracking-tight text-on-surface font-headline mb-4">Resume Optimizer - Upload</h1>
            <p className="text-xl text-on-surface-variant max-w-2xl leading-relaxed">
              Elevate your professional narrative. Our AI-driven analysis scans for keyword density, structural clarity, and impact metrics to help you land the interview.
            </p>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            {/* Main Upload Zone: Asymmetric Bento Style */}
            <section className="lg:col-span-2 space-y-8">
              <div className="relative group">
                {/* Background Accent */}
                <div className="absolute -inset-1 bg-gradient-to-r from-primary/10 to-primary-container/10 rounded-3xl blur opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
                <div 
                  className={`relative bg-surface-container-lowest rounded-3xl p-12 border-2 border-dashed ${isDragOver ? 'border-primary bg-primary/5 scale-[1.01]' : 'border-outline-variant/40'} hover:border-primary/50 transition-all duration-300 flex flex-col items-center justify-center text-center cursor-pointer min-h-[400px]`}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                >
                  <input type="file" id="resume-upload" className="hidden" accept=".pdf,.doc,.docx" onChange={(e) => setFile(e.target.files[0])} />
                  
                  <div className="w-20 h-20 bg-surface-container-low rounded-2xl flex items-center justify-center mb-6 transition-transform group-hover:scale-110 duration-500">
                    {uploading ? (
                      <span className="material-symbols-outlined text-primary text-4xl animate-spin" style={{ fontVariationSettings: "'FILL' 0" }}>sync</span>
                    ) : (
                      <span className="material-symbols-outlined text-primary text-4xl" style={{ fontVariationSettings: "'FILL' 0" }}>upload_file</span>
                    )}
                  </div>
                  <h3 className="text-2xl font-bold mb-2">Drop your resume here</h3>
                  <p className="text-on-surface-variant mb-8 font-medium">Or select to browse from your computer</p>
                  
                  <div className="flex gap-4 items-center mb-8">
                    <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-lg">
                      <span className="material-symbols-outlined text-sm text-slate-500" style={{ fontVariationSettings: "'FILL' 0" }}>picture_as_pdf</span>
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-600">PDF</span>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-lg">
                      <span className="material-symbols-outlined text-sm text-slate-500" style={{ fontVariationSettings: "'FILL' 0" }}>description</span>
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-600">DOCX</span>
                    </div>
                  </div>
                  
                  <label htmlFor="resume-upload" className="bg-white border-2 border-outline-variant/50 text-slate-700 py-3 px-8 rounded-xl font-bold hover:bg-slate-50 active:scale-95 transition-all cursor-pointer mb-6">
                    {file ? file.name : "Choose File"}
                  </label>

                  {file && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleUpload(); }} 
                      disabled={uploading}
                      className="bg-gradient-to-br from-primary to-primary-container text-white py-4 px-10 rounded-xl font-bold shadow-[0px_20px_40px_rgba(0,78,159,0.15)] hover:scale-105 active:scale-95 transition-all disabled:opacity-75 disabled:hover:scale-100 flex items-center justify-center gap-2"
                    >
                      {uploading ? <>
                         <span className="material-symbols-outlined animate-spin text-sm" style={{ fontVariationSettings: "'FILL' 0" }}>autorenew</span>
                         Analyzing...
                      </> : <>
                        <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 0" }}>analytics</span>
                        Analyze Resume
                      </>}
                    </button>
                  )}
                  
                  <p className="mt-8 text-xs text-outline font-medium">Maximum file size: 10MB</p>
                </div>
              </div>

              {/* Tips/Info Card */}
              <div className="bg-primary/5 rounded-3xl p-8 flex gap-6 items-center">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 0" }}>lightbulb</span>
                </div>
                <div>
                  <h4 className="font-bold text-primary mb-1">Pro Tip</h4>
                  <p className="text-sm text-on-surface-variant leading-relaxed">PDF format is recommended to maintain layout integrity during our AI semantic structure scan.</p>
                </div>
              </div>
            </section>

            {/* Sidebar: Recent Uploads */}
            <section className="space-y-6">
              <h2 className="text-xl font-bold flex items-center gap-3">
                <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 0" }}>history</span>
                Recent Uploads
              </h2>
              <div className="space-y-4">
                {/* Recent Item 1 */}
                <div className="group bg-surface-container-lowest p-5 rounded-2xl shadow-[0px_10px_30px_rgba(0,78,159,0.04)] hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-pointer">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-12 bg-red-50 rounded-md flex items-center justify-center">
                        <span className="material-symbols-outlined text-red-500" style={{ fontVariationSettings: "'FILL' 0" }}>picture_as_pdf</span>
                      </div>
                      <div>
                        <h5 className="font-bold text-sm truncate w-32">Senior_PM_v2.pdf</h5>
                        <p className="text-[10px] uppercase font-bold text-outline tracking-wider">Oct 12, 2024</p>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-primary px-2 py-1 bg-primary/5 rounded">84/100</span>
                  </div>
                  <div className="w-full h-1.5 bg-surface-container rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-primary to-primary-container rounded-full w-[84%] shadow-[0_0_8px_rgba(0,78,159,0.3)]"></div>
                  </div>
                </div>

                {/* Recent Item 2 */}
                <div className="group bg-surface-container-lowest p-5 rounded-2xl shadow-[0px_10px_30px_rgba(0,78,159,0.04)] hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-pointer">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-12 bg-blue-50 rounded-md flex items-center justify-center">
                        <span className="material-symbols-outlined text-blue-500" style={{ fontVariationSettings: "'FILL' 0" }}>description</span>
                      </div>
                      <div>
                        <h5 className="font-bold text-sm truncate w-32">Resume_Final_v1.docx</h5>
                        <p className="text-[10px] uppercase font-bold text-outline tracking-wider">Oct 08, 2024</p>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-primary px-2 py-1 bg-primary/5 rounded">62/100</span>
                  </div>
                  <div className="w-full h-1.5 bg-surface-container rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-primary to-primary-container rounded-full w-[62%]"></div>
                  </div>
                </div>

                {/* Empty/Placeholder Illustration Style */}
                <div className="mt-8 pt-8 border-t border-outline-variant/20">
                  <div className="rounded-3xl overflow-hidden aspect-video relative group bg-surface-container flex items-center justify-center">
                    <img alt="Professional workspace" className="w-full h-full object-cover grayscale opacity-50 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-700 mix-blend-multiply" src="https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80" />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent flex items-end p-6">
                      <p className="text-xs font-bold italic text-white/90">"Your resume is your professional signature."</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
