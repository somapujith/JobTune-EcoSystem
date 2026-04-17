import os

file_path = r"h:\JobTube Eco System\frontend\src\pages\ResumeOptimizer.jsx"

with open(file_path, "r", encoding="utf-8") as f:
    text = f.read()

start_marker = "      {/* ═══════════════════════════════════════════════════════════════════════ */}\n      {/* FORGE TAB                                                              */}\n      {/* ═══════════════════════════════════════════════════════════════════════ */}\n      {activeTab === 'forge' && ("

end_marker = "    </div>\n  );\n}"

start_index = text.find(start_marker)
end_index = text.find(end_marker, start_index)

if start_index == -1 or end_index == -1:
    print("Could not find the target code section in the file.")
    exit(1)

new_code = r"""      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* FORGE TAB                                                              */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'forge' && (() => {
        const resultToRender = forgeMode === 'optimize' ? forgeResult : createResult;
        const isLoading = forgeMode === 'optimize' ? forging : creating;

        return (
          <div className="space-y-8">
            {/* Mode Switcher */}
            <div className="bg-surface-container-lowest rounded-3xl p-4 shadow-[0px_20px_40px_rgba(16,185,129,0.05)] border border-outline/10 flex gap-2">
              <button
                onClick={() => setForgeMode('optimize')}
                className={`flex-1 py-3 px-6 rounded-2xl font-bold flex justify-center items-center gap-3 transition-all duration-200 ${
                  forgeMode === 'optimize' 
                    ? 'bg-emerald-50 text-emerald-700 shadow-sm border border-emerald-100' 
                    : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>auto_fix_high</span>
                Optimize Existing Resume
              </button>
              <button
                onClick={() => setForgeMode('create')}
                className={`flex-1 py-3 px-6 rounded-2xl font-bold flex justify-center items-center gap-3 transition-all duration-200 ${
                  forgeMode === 'create' 
                    ? 'bg-sky-50 text-sky-700 shadow-sm border border-sky-100' 
                    : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>note_add</span>
                Create New Resume
              </button>
            </div>

            {/* Input Panel */}
            <div className="bg-surface-container-lowest rounded-3xl p-8 shadow-[0px_20px_40px_rgba(16,185,129,0.08)]">
              {forgeMode === 'optimize' ? (
                <>
                  <h2 className="text-xl font-bold mb-2 flex items-center gap-3">
                    <span className="material-symbols-outlined text-emerald-600" style={{ fontVariationSettings: "'FILL' 1" }}>auto_fix_high</span>
                    Forge Resume for a Job
                  </h2>
                  <p className="text-on-surface-variant text-sm mb-6">Upload your resume and paste the job description. AI will calculate your ATS match and generate a tuned version.</p>

                  {forgeError && (
                    <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-center gap-3 text-sm">
                      <span className="material-symbols-outlined text-red-500 shrink-0">error</span>{forgeError}
                    </div>
                  )}

                  <form onSubmit={handleForge} className="space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Resume Upload */}
                      <div>
                        <label className="block text-sm font-bold text-on-surface mb-2">
                          <span className="material-symbols-outlined text-sm align-middle mr-1" style={{ fontVariationSettings: "'FILL' 0" }}>upload_file</span>
                          Your Resume (PDF / DOCX)
                        </label>
                        <div
                          onDrop={handleForgeDrop}
                          onDragOver={(e) => { e.preventDefault(); forgeDrop.current = true; }}
                          onDragLeave={() => { forgeDrop.current = false; }}
                          onClick={() => document.getElementById('forge-file-input').click()}
                          className="border-2 border-dashed border-outline/30 hover:border-emerald-400/70 hover:bg-emerald-50/30 rounded-2xl p-8 text-center cursor-pointer transition-all duration-200"
                        >
                          <input id="forge-file-input" type="file" accept=".pdf,.doc,.docx" className="hidden"
                            onChange={(e) => setForgeFile(e.target.files?.[0] || null)} />
                          <span className="material-symbols-outlined text-4xl text-outline/40 mb-2 block" style={{ fontVariationSettings: "'FILL' 0" }}>
                            {forgeFile ? 'description' : 'cloud_upload'}
                          </span>
                          {forgeFile ? (
                            <div>
                              <p className="font-bold text-on-surface text-sm">{forgeFile.name}</p>
                              <p className="text-xs text-on-surface-variant mt-0.5">{(forgeFile.size / 1024).toFixed(0)} KB · Click to change</p>
                            </div>
                          ) : (
                            <div>
                              <p className="font-semibold text-on-surface text-sm">Drop file or click to browse</p>
                              <p className="text-xs text-on-surface-variant mt-0.5">PDF, DOC, DOCX</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Job Description */}
                      <div>
                        <label className="block text-sm font-bold text-on-surface mb-2">
                          <span className="material-symbols-outlined text-sm align-middle mr-1" style={{ fontVariationSettings: "'FILL' 0" }}>work</span>
                          Job Description
                          <span className="text-xs font-normal text-on-surface-variant ml-2">{jobDescription.split(/\s+/).filter(Boolean).length} words</span>
                        </label>
                        <textarea
                          rows={10}
                          placeholder="Paste the full job description here — include required skills, responsibilities, and qualifications for the best ATS match..."
                          className="w-full bg-surface-container border border-outline/20 rounded-2xl px-4 py-3 font-medium text-on-surface placeholder:text-outline/40 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 resize-y text-sm leading-relaxed"
                          value={jobDescription}
                          onChange={(e) => setJobDescription(e.target.value)}
                        />
                      </div>
                    </div>

                    <button type="submit" disabled={!forgeFile || !jobDescription.trim() || forging}
                      className="w-full py-4 bg-gradient-to-r from-emerald-500 to-sky-500 text-white font-bold rounded-2xl hover:from-emerald-600 hover:to-sky-600 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0px_10px_30px_rgba(16,185,129,0.35)] flex items-center justify-center gap-3 text-base">
                      {forging ? (
                        <><span className="material-symbols-outlined animate-spin text-xl" style={{ fontVariationSettings: "'FILL' 0" }}>sync</span>Forging your resume — this takes ~15 seconds...</>
                      ) : (
                        <><span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>auto_fix_high</span>Forge Resume for This Job</>
                      )}
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <h2 className="text-xl font-bold mb-2 flex items-center gap-3">
                    <span className="material-symbols-outlined text-sky-600" style={{ fontVariationSettings: "'FILL' 1" }}>note_add</span>
                    Create Resume from Scratch
                  </h2>
                  <p className="text-on-surface-variant text-sm mb-6">Fill in your details and let AI craft a professional, ATS-friendly resume perfectly targeted to your desired role.</p>

                  {createError && (
                    <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-center gap-3 text-sm">
                      <span className="material-symbols-outlined text-red-500 shrink-0">error</span>{createError}
                    </div>
                  )}

                  <form onSubmit={handleCreateResume} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Personal Info */}
                      <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-on-surface mb-1">Full Name *</label>
                          <input required type="text" className="w-full bg-surface-container border border-outline/20 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-sky-500"
                            value={createFormData.fullName} onChange={e => setCreateFormData({...createFormData, fullName: e.target.value})} />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-on-surface mb-1">Email</label>
                          <input type="email" className="w-full bg-surface-container border border-outline/20 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-sky-500"
                            value={createFormData.email} onChange={e => setCreateFormData({...createFormData, email: e.target.value})} />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-on-surface mb-1">Phone</label>
                          <input type="tel" className="w-full bg-surface-container border border-outline/20 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-sky-500"
                            value={createFormData.phone} onChange={e => setCreateFormData({...createFormData, phone: e.target.value})} />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-on-surface mb-1">Target Job Title</label>
                          <input type="text" className="w-full bg-surface-container border border-outline/20 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-sky-500"
                            value={createFormData.targetJobTitle} onChange={e => setCreateFormData({...createFormData, targetJobTitle: e.target.value})} />
                        </div>
                      </div>

                      {/* Content Fields */}
                      <div>
                         <label className="block text-xs font-bold text-on-surface mb-1 text-emerald-600">Target Job Description *</label>
                         <textarea required rows={5} placeholder="Paste the JD here..." className="w-full bg-surface-container border border-outline/20 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-sky-500 resize-y"
                            value={createFormData.targetJobDescription} onChange={e => setCreateFormData({...createFormData, targetJobDescription: e.target.value})} />
                      </div>
                      <div>
                         <label className="block text-xs font-bold text-on-surface mb-1">Experience</label>
                         <textarea rows={5} placeholder="Job titles, companies, dates, achievements..." className="w-full bg-surface-container border border-outline/20 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-sky-500 resize-y"
                            value={createFormData.experience} onChange={e => setCreateFormData({...createFormData, experience: e.target.value})} />
                      </div>
                      <div>
                         <label className="block text-xs font-bold text-on-surface mb-1">Professional Summary & Skills</label>
                         <textarea rows={4} placeholder="Brief summary and list of key skills..." className="w-full bg-surface-container border border-outline/20 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-sky-500 resize-y"
                            value={createFormData.summary} onChange={e => setCreateFormData({...createFormData, summary: e.target.value})} />
                      </div>
                      <div>
                         <label className="block text-xs font-bold text-on-surface mb-1">Education & Projects</label>
                         <textarea rows={4} placeholder="Degrees, schools, notable projects..." className="w-full bg-surface-container border border-outline/20 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-sky-500 resize-y"
                            value={createFormData.education} onChange={e => setCreateFormData({...createFormData, education: e.target.value})} />
                      </div>
                    </div>

                    <button type="submit" disabled={!createFormData.fullName || !createFormData.targetJobDescription || creating}
                      className="w-full py-4 bg-gradient-to-r from-sky-500 to-indigo-500 text-white font-bold rounded-2xl hover:from-sky-600 hover:to-indigo-600 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0px_10px_30px_rgba(14,165,233,0.35)] flex items-center justify-center gap-3 text-base">
                      {creating ? (
                        <><span className="material-symbols-outlined animate-spin text-xl" style={{ fontVariationSettings: "'FILL' 0" }}>sync</span>Crafting your resume...</>
                      ) : (
                        <><span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>draw</span>Create Tailored Resume</>
                      )}
                    </button>
                  </form>
                </>
              )}
            </div>

            {/* Shared Results Panel */}
            {resultToRender && !isLoading && (
              <>
                {/* ATS Score + Keyword Stats Row */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* ATS Ring */}
                  <div className="bg-surface-container-lowest rounded-3xl p-8 shadow-[0px_20px_40px_rgba(16,185,129,0.08)] flex flex-col items-center justify-center text-center">
                    <ATSRing score={resultToRender.atsScore} label={resultToRender.atsLabel} />
                    <p className="text-sm text-on-surface-variant mt-4 max-w-[180px]">
                      {resultToRender.totalJdKeywords} tech keywords found in the job description
                    </p>
                  </div>

                  {/* Matched Keywords */}
                  <div className="bg-surface-container-lowest rounded-3xl p-6 shadow-[0px_20px_40px_rgba(16,185,129,0.08)]">
                    <h3 className="text-sm font-bold text-emerald-700 mb-3 flex items-center gap-2">
                      <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                      Optimized Keywords ({resultToRender.matchedKeywords?.length || 0})
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {resultToRender.matchedKeywords?.length > 0 ? (
                        resultToRender.matchedKeywords.map(kw => <KeywordPill key={kw} text={kw} variant="match" />)
                      ) : (
                        <p className="text-xs text-on-surface-variant">No matching keywords found.</p>
                      )}
                    </div>
                  </div>

                  {/* Missing Keywords */}
                  <div className="bg-surface-container-lowest rounded-3xl p-6 shadow-[0px_20px_40px_rgba(16,185,129,0.08)]">
                    <h3 className="text-sm font-bold text-red-700 mb-3 flex items-center gap-2">
                      <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 0" }}>cancel</span>
                      Still Missing ({resultToRender.missingKeywords?.length || 0})
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {resultToRender.missingKeywords?.length > 0 ? (
                        resultToRender.missingKeywords.map(kw => <KeywordPill key={kw} text={kw} variant="missing" />)
                      ) : (
                        <p className="text-xs text-emerald-700 font-semibold">Your resume is a perfect keyword match!</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* AI-Tuned Resume */}
                <div className="bg-slate-900 rounded-3xl shadow-[0px_25px_50px_rgba(15,23,42,0.25)] overflow-hidden">
                  <div className="bg-slate-800 px-8 py-5 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                      <span className="material-symbols-outlined text-emerald-400 text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>auto_fix_high</span>
                      <div>
                        <h3 className="text-white font-bold text-base">Final Resume</h3>
                        <p className="text-slate-400 text-xs">Forged by Gemini AI — tailored specifically for this JD</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-emerald-400 bg-emerald-400/10 px-3 py-1 rounded-full">
                        {resultToRender.atsScore}% ATS Match
                      </span>
                      <button onClick={() => {
                        const txt = resultToRender.tunedResume || resultToRender.generatedResume;
                        if (txt) {
                          navigator.clipboard.writeText(txt);
                          setCopiedReadme(true); setTimeout(() => setCopiedReadme(false), 2000);
                        }
                      }}
                        className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-xl font-medium text-sm transition-colors flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 0" }}>
                          {copiedReadme ? 'check' : 'content_copy'}
                        </span>
                        {copiedReadme ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </div>
                  <div className="p-8 max-h-[600px] overflow-y-auto">
                    <pre className="text-slate-200 font-mono text-sm whitespace-pre-wrap leading-relaxed">
                      {resultToRender.tunedResume || resultToRender.generatedResume || "No resume text generated."}
                    </pre>
                  </div>
                </div>

                {/* How it was tuned note */}
                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6 flex gap-4">
                  <span className="material-symbols-outlined text-emerald-600 text-xl shrink-0 mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>info</span>
                  <div>
                    <p className="text-sm font-bold text-emerald-800 mb-1">How Resume Forge works</p>
                    <p className="text-xs text-emerald-700 leading-relaxed">
                      Inspired by the <strong>Restuner</strong> architecture — your factual details are merged into a cohesive, optimized structure specifically designed to maximize your ATS alignment with the target job descriptions. Bullet points are improved and missing keywords are injected naturally.
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        );
      })()}
"""

final_text = text[:start_index] + new_code + end_marker

with open(file_path, "w", encoding="utf-8") as f:
    f.write(final_text)

print("✅ Successfully patched ResumeOptimizer.jsx!")