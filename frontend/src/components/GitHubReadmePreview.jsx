import React from 'react';
import { Copy, Download, CheckCircle } from 'lucide-react';

export default function GitHubReadmePreview({ markdown, onCopy, onDownload, copied }) {
  // Convert markdown to simple HTML for preview
  const renderMarkdown = (md) => {
    if (!md) return '<p>Preview will appear here...</p>';

    let html = md
      .replace(/^### (.*?)$/gm, '<h3 class="text-xl font-bold mt-4 mb-2">$1</h3>')
      .replace(/^## (.*?)$/gm, '<h2 class="text-2xl font-bold mt-6 mb-3">$1</h2>')
      .replace(/^# (.*?)$/gm, '<h1 class="text-4xl font-black mb-3">$1</h1>')
      .replace(/^\*\*\*$/gm, '<hr class="my-6 border-slate-300">')
      .replace(/^---$/gm, '<hr class="my-6 border-slate-300">')
      .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-bold">$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em class="italic">$1</em>')
      .replace(/`([^`]+)`/g, '<code class="bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded">$1</code>')
      .replace(/^\- (.*?)$/gm, '<li class="ml-4">$1</li>')
      .replace(/(<li.*?<\/li>)/s, '<ul class="list-disc my-3">$1</ul>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-blue-600 hover:underline" target="_blank">$1</a>')
      .replace(/^(```[\s\S]*?```)/gm, (match) => {
        const code = match.replace(/```/g, '');
        return `<pre class="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto my-3"><code>${code}</code></pre>`;
      })
      .replace(/\n\n/g, '</p><p class="my-3">')
      .replace(/^(?!<[hpli]|<ul|<pre|<hr)(.+)$/gm, '<p class="my-2">$1</p>');

    html = '<p class="my-2">' + html + '</p>';
    return html;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Preview</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={onCopy}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors"
            title="Copy to clipboard"
          >
            {copied ? (
              <>
                <CheckCircle className="w-4 h-4" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copy
              </>
            )}
          </button>
          <button
            onClick={onDownload}
            className="flex items-center gap-2 px-3 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg text-sm font-semibold transition-colors"
            title="Download as README.md"
          >
            <Download className="w-4 h-4" />
            Download
          </button>
        </div>
      </div>

      {/* Preview Content */}
      <div className="flex-1 overflow-y-auto bg-white dark:bg-slate-900 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
        <div
          className="prose dark:prose-invert prose-sm max-w-none text-slate-900 dark:text-slate-100"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(markdown) }}
        />
      </div>

    </div>
  );
}
