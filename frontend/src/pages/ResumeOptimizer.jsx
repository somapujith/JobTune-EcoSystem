import React, { useState } from 'react';
import { UploadCloud, File, CheckCircle, BarChart3, AlertTriangle } from 'lucide-react';
import { api } from '../store/useAuthStore';

export default function ResumeOptimizer() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [report, setReport] = useState(null);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      // Typically we'd use FormData, but since there's no backend for PDF parsing yet, 
      // we'll mock the response.
      setTimeout(() => {
        setReport({
          scores: { ats: 85, impact: 70, skills: 90, clarity: 80, completeness: 85, industry_fit: 80 },
          improvements: [
             "Quantify your impact in the 'Experience' section using numbers.",
             "Add more action verbs (e.g., Developed, Orchestrated) instead of passive verbs.",
             "Your education section is missing Graduation Year."
          ],
          strengths: [
             "Strong keyword match for Frontend Developer roles.",
             "Clean formatting that passes basic ATS checks."
          ]
        });
        setUploading(false);
      }, 2000);
    } catch (err) {
      console.error(err);
      setUploading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold text-slate-900 mb-4">Resume Optimizer</h1>
        <p className="text-lg text-slate-600">Upload your resume to get instant feedback on ATS compatibility, impact, and more.</p>
      </div>

      {!report ? (
        <div className="max-w-2xl mx-auto">
          <div className="border-2 border-dashed border-blue-200 rounded-3xl p-12 text-center bg-blue-50/50 hover:bg-blue-50 transition-colors">
            <UploadCloud className="w-16 h-16 text-blue-500 mx-auto mb-6" />
            <h3 className="text-xl font-medium text-slate-900 mb-2">Drag and drop your resume here</h3>
            <p className="text-slate-500 mb-6">PDF, DOCX, or TXT up to 5MB</p>
            <input 
              type="file" 
              id="resume-upload" 
              className="hidden" 
              accept=".pdf,.docx,.doc,.txt"
              onChange={(e) => setFile(e.target.files[0])}
            />
            <label htmlFor="resume-upload" className="cursor-pointer inline-block bg-white text-blue-600 font-medium px-6 py-3 rounded-lg border border-blue-200 shadow-sm hover:shadow-md transition-all">
               Browse Files
            </label>
            {file && (
              <div className="mt-8 p-4 bg-white rounded-xl shadow-sm flex items-center justify-between border border-slate-100">
                <div className="flex items-center gap-3">
                  <File className="text-slate-400 w-8 h-8" />
                  <div className="text-left">
                    <p className="font-medium text-slate-800">{file.name}</p>
                    <p className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                </div>
                <button 
                  onClick={handleUpload} 
                  disabled={uploading}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {uploading ? 'Analyzing...' : 'Analyze Resume'}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
           <div className="lg:col-span-1 space-y-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-blue-600" /> Overall Scores</h3>
                <div className="space-y-4">
                  {Object.entries(report.scores).map(([key, val]) => (
                    <div key={key}>
                      <div className="flex justify-between text-sm font-medium mb-1 capitalize">
                        <span className="text-slate-600">{key.replace('_', ' ')}</span>
                        <span className={val >= 80 ? 'text-emerald-600' : 'text-amber-600'}>{val}/100</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full">
                        <div className={`h-2 rounded-full ${val >= 80 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${val}%` }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
           </div>
           <div className="lg:col-span-2 space-y-6">
              <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
                <h3 className="text-xl font-bold text-slate-800 mb-4 border-b pb-4 flex items-center gap-2">
                   <AlertTriangle className="w-5 h-5 text-amber-500" /> Actionable Improvements
                </h3>
                <ul className="space-y-4">
                  {report.improvements.map((imp, idx) => (
                    <li key={idx} className="flex gap-3 text-slate-700">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-sm font-bold">{idx + 1}</span>
                      {imp}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
                <h3 className="text-xl font-bold text-slate-800 mb-4 border-b pb-4 flex items-center gap-2">
                   <CheckCircle className="w-5 h-5 text-emerald-500" /> Strengths
                </h3>
                <ul className="space-y-4">
                  {report.strengths.map((s, idx) => (
                    <li key={idx} className="flex gap-3 text-slate-700">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-sm font-bold">✓</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
              <button onClick={() => setReport(null)} className="mt-8 text-blue-600 font-medium hover:text-blue-700">← Analyze another resume</button>
           </div>
        </div>
      )}
    </div>
  );
}
