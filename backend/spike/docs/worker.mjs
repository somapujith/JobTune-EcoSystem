// Phase 0 spike S1-S6 + S12 (ADR-001). Throwaway, local-only Worker.
// Every library is loaded lazily inside its handler so one failing lib cannot
// take down the worker. Results: JSON {ok, ms, ...} or
// {ok:false, stage:'load'|'run', error, stack}. Generated documents are
// returned as raw bytes with X-Spike-* headers.
//
// NOTE: workerd freezes performance.now()/Date.now() during pure-CPU work
// (Spectre mitigation), so in-worker `ms` is usually 0 for CPU-bound ops.
// The harness measures wall time from the client side instead.

const now = () => performance.now();
const stack5 = (e) => String((e && e.stack) || '').split('\n').slice(0, 5).join('\n');
const errMsg = (e) => String((e && e.message) || e);

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function sha256(bufLike) {
  const d = await crypto.subtle.digest('SHA-256', bufLike);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function bytesResponse(bytes, type, extra = {}) {
  return sha256(bytes).then(
    (hash) =>
      new Response(bytes, {
        status: 200,
        headers: {
          'content-type': type,
          'x-spike-ok': '1',
          'x-spike-size': String(bytes.byteLength),
          'x-spike-sha256': hash,
          ...Object.fromEntries(Object.entries(extra).map(([k, v]) => ['x-spike-' + k, String(v)])),
        },
      })
  );
}

/**
 * loader: () => Promise<module>  (lazy `await import(...)` lives in the handler)
 * fn:     (mod) => Promise<Response | object>
 */
async function guarded(loader, fn) {
  const t0 = now();
  let mod;
  try {
    mod = await loader();
  } catch (e) {
    return json({ ok: false, stage: 'load', error: errMsg(e), stack: stack5(e), ms: now() - t0 }, 500);
  }
  const tLoad = now();
  try {
    const out = await fn(mod);
    if (out instanceof Response) {
      const h = new Headers(out.headers);
      h.set('x-spike-ms', String(now() - tLoad));
      h.set('x-spike-load-ms', String(tLoad - t0));
      return new Response(out.body, { status: out.status, headers: h });
    }
    return json({ ok: true, ms: now() - tLoad, loadMs: tLoad - t0, ...out });
  } catch (e) {
    return json({ ok: false, stage: 'run', error: errMsg(e), stack: stack5(e), ms: now() - tLoad }, 500);
  }
}

const dflt = (m) => (m && m.default !== undefined ? m.default : m);

// --- S1 -------------------------------------------------------------------
// variants: default (require('pdf-parse') -> dynamic require of pdf.js/<ver>),
//           direct  (pinned pdf.js v1.10.100 build imported statically + copy of pdf-parse's PDF()),
//           unpdf   (fallback)
async function s1(request, url) {
  const v = url.searchParams.get('v') || 'default';
  const ab = await request.arrayBuffer();
  // input=buffer (default): what src/utils/fileParser.js does (Node Buffer). input=u8: plain Uint8Array.
  const body = url.searchParams.get('input') === 'u8' ? new Uint8Array(ab) : Buffer.from(ab);
  if (v === 'default') {
    return guarded(
      () => import('pdf-parse'),
      async (m) => {
        const pdfParse = dflt(m);
        const data = await pdfParse(body);
        return { variant: v, text: data.text || '', numpages: data.numpages, pdfjsVersion: data.version };
      }
    );
  }
  if (v === 'direct') {
    return guarded(
      () => import('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js'),
      async (m) => {
        const PDFJS = dflt(m);
        PDFJS.disableWorker = true;
        const doc = await PDFJS.getDocument(body);
        let text = '';
        for (let i = 1; i <= doc.numPages; i++) {
          // verbatim copy of pdf-parse/lib/pdf-parse.js render_page + accumulation
          const pageText = await doc
            .getPage(i)
            .then((pageData) =>
              pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false }).then((tc) => {
                let lastY,
                  t = '';
                for (const item of tc.items) {
                  if (lastY == item.transform[5] || !lastY) t += item.str;
                  else t += '\n' + item.str;
                  lastY = item.transform[5];
                }
                return t;
              })
            )
            .catch(() => '');
          text = `${text}\n\n${pageText}`;
        }
        const numpages = doc.numPages;
        doc.destroy();
        return { variant: v, text, numpages, pdfjsVersion: PDFJS.version };
      }
    );
  }
  if (v === 'unpdf') {
    return guarded(
      () => import('unpdf'),
      async (m) => {
        const pdf = await m.getDocumentProxy(new Uint8Array(body));
        const r = await m.extractText(pdf, { mergePages: true });
        return { variant: v, text: r.text, numpages: r.totalPages };
      }
    );
  }
  return json({ ok: false, stage: 'run', error: 'unknown variant ' + v }, 400);
}

// --- S2 -------------------------------------------------------------------
async function s2(request) {
  const body = Buffer.from(await request.arrayBuffer());
  return guarded(
    () => import('unzipper'),
    async (m) => {
      const unzipper = dflt(m);
      const directory = await unzipper.Open.buffer(body);
      const f = directory.files.find((x) => x.path === 'word/document.xml');
      if (!f) throw new Error('document.xml not found in DOCX');
      const buf = await f.buffer();
      return {
        entries: directory.files.length,
        docXmlLen: buf.length,
        docXmlSha256: await sha256(buf),
      };
    }
  );
}

// --- S3 -------------------------------------------------------------------
// Replica of routes/resume.js markdownToPdfBuffer (Helvetica / Helvetica-Bold).
function buildMarkdownPdf(PDFDocument, markdownText) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const lines = String(markdownText || '').split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine || ' ';
      if (line.startsWith('# ')) {
        doc.fontSize(18).font('Helvetica-Bold').text(line.replace(/^#\s*/, ''), { paragraphGap: 8 });
      } else if (line.startsWith('## ')) {
        doc.moveDown(0.4);
        doc.fontSize(13).font('Helvetica-Bold').text(line.replace(/^##\s*/, ''), { paragraphGap: 6 });
      } else if (line.startsWith('- ')) {
        doc.fontSize(11).font('Helvetica').text(`• ${line.replace(/^-\s*/, '')}`, { paragraphGap: 4 });
      } else {
        doc.fontSize(11).font('Helvetica').text(line, { paragraphGap: 5 });
      }
    }
    doc.end();
  });
}

async function s3(request, url) {
  const v = url.searchParams.get('v') || 'default';
  const md = await request.text();
  const loader = v === 'standalone' ? () => import('pdfkit/js/pdfkit.standalone.js') : () => import('pdfkit');
  return guarded(loader, async (m) => {
    const PDFDocument = dflt(m);
    const bytes = await buildMarkdownPdf(PDFDocument, md);
    return bytesResponse(new Uint8Array(bytes), 'application/pdf', { variant: v });
  });
}

// real src/services/v2/resumeExportEngine.js (CJS, imported as-is)
async function s3b(request) {
  const text = await request.text();
  return guarded(
    () => import('../../src/services/v2/resumeExportEngine.js'),
    async (m) => {
      const Engine = dflt(m);
      const r = await Engine.export(text, 'pdf');
      return bytesResponse(new Uint8Array(r.content), r.mimeType);
    }
  );
}

// --- S4 -------------------------------------------------------------------
async function s4(request) {
  const md = await request.text();
  return guarded(
    () => import('docx'),
    async (m) => {
      const D = m.Document ? m : dflt(m);
      const { Document, Paragraph, TextRun, HeadingLevel, Packer } = D;
      // replica of routes/resume.js markdownToDocxBuffer
      const paragraphs = [];
      for (const line of String(md || '').split(/\r?\n/)) {
        if (!line.trim()) {
          paragraphs.push(new Paragraph({ text: '' }));
        } else if (line.startsWith('# ')) {
          paragraphs.push(new Paragraph({ text: line.replace(/^#\s*/, ''), heading: HeadingLevel.TITLE }));
        } else if (line.startsWith('## ')) {
          paragraphs.push(new Paragraph({ text: line.replace(/^##\s*/, ''), heading: HeadingLevel.HEADING_2 }));
        } else if (line.startsWith('- ')) {
          paragraphs.push(
            new Paragraph({ children: [new TextRun(line.replace(/^-\s*/, ''))], bullet: { level: 0 } })
          );
        } else {
          paragraphs.push(new Paragraph({ children: [new TextRun(line)] }));
        }
      }
      const doc = new Document({ sections: [{ properties: {}, children: paragraphs }] });
      const buf = await Packer.toBuffer(doc);
      return bytesResponse(new Uint8Array(buf), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    }
  );
}

// real src/services/resumeExport.js (CJS, imported as-is; has dead fs/path requires)
async function s4b(request) {
  const text = await request.text();
  return guarded(
    () => import('../../src/services/resumeExport.js'),
    async (m) => {
      const ResumeExport = dflt(m);
      const buf = await ResumeExport.toDOCX(text);
      return bytesResponse(new Uint8Array(buf), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    }
  );
}

// --- S5 -------------------------------------------------------------------
async function s5(request, url) {
  const mode = url.searchParams.get('mode') || 'buffer';
  const ab = await request.arrayBuffer();
  return guarded(
    () => import('mammoth'),
    async (m) => {
      const mammoth = dflt(m);
      const input = mode === 'arrayBuffer' ? { arrayBuffer: ab } : { buffer: Buffer.from(ab) };
      const r = await mammoth.extractRawText(input);
      return { mode, text: r.value, messages: r.messages.map((x) => x.type + ': ' + x.message) };
    }
  );
}

// --- S6 -------------------------------------------------------------------
async function s6(request) {
  const xml = await request.text();
  return guarded(
    () => import('xml2js'),
    async (m) => {
      const xml2js = dflt(m);
      const parser = new xml2js.Parser();
      const result = await parser.parseStringPromise(xml);
      return { result };
    }
  );
}

// --- S12: real src/utils/fileParser.js ----------------------------------------
async function s12(request, url) {
  const mimetype = request.headers.get('x-mime') || url.searchParams.get('mime');
  const buffer = Buffer.from(await request.arrayBuffer());
  return guarded(
    () => import('../../src/utils/fileParser.js'),
    async (m) => {
      const { extractTextFromFile } = m.extractTextFromFile ? m : dflt(m);
      const text = await extractTextFromFile({ mimetype, buffer });
      return { text };
    }
  );
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    try {
      switch (url.pathname) {
        case '/health':
          return json({ ok: true, spike: 'jobtune-spike-docs', runtime: 'workerd', hasProcess: typeof process !== 'undefined', hasBuffer: typeof Buffer !== 'undefined' });
        case '/s1': return await s1(request, url);
        case '/s2': return await s2(request, url);
        case '/s3': return await s3(request, url);
        case '/s3b': return await s3b(request, url);
        case '/s4': return await s4(request, url);
        case '/s4b': return await s4b(request, url);
        case '/s5': return await s5(request, url);
        case '/s6': return await s6(request, url);
        case '/s12': return await s12(request, url);
        default: return json({ ok: false, stage: 'route', error: 'not found: ' + url.pathname }, 404);
      }
    } catch (e) {
      return json({ ok: false, stage: 'run', error: errMsg(e), stack: stack5(e) }, 500);
    }
  },
};
