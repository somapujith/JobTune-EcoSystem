const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const outputPath = path.resolve(__dirname, '..', '..', 'Pujith_Resume.pdf');

const doc = new PDFDocument({
  size: 'A4',
  margin: 48,
  info: {
    Title: 'Pujith Resume',
    Author: 'JobTube Resume Formatter'
  }
});

doc.pipe(fs.createWriteStream(outputPath));

const palette = {
  primary: '#0f172a',
  accent: '#2563eb',
  subtle: '#475569',
  divider: '#dbeafe'
};

const left = 48;
const right = 48;
const usableWidth = doc.page.width - left - right;

function section(title) {
  doc.moveDown(0.7);
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor(palette.accent)
    .text(title.toUpperCase(), left, doc.y, { width: usableWidth });

  const y = doc.y + 4;
  doc
    .strokeColor(palette.divider)
    .lineWidth(1)
    .moveTo(left, y)
    .lineTo(doc.page.width - right, y)
    .stroke();

  doc.moveDown(0.5);
}

function bullet(text) {
  const bulletX = left + 2;
  const textX = left + 14;
  const y = doc.y;

  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor(palette.primary)
    .text('•', bulletX, y, { continued: false });

  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor(palette.primary)
    .text(text, textX, y, { width: usableWidth - 14, lineGap: 1 });
}

// Header

doc
  .font('Helvetica-Bold')
  .fontSize(26)
  .fillColor(palette.primary)
  .text('Pujith', left, 48, { width: usableWidth, align: 'left' });

doc
  .font('Helvetica')
  .fontSize(10)
  .fillColor(palette.subtle)
  .text(
    'Frontend Developer | React, Vite, Node.js | Hyderabad, India',
    left,
    doc.y + 4,
    { width: usableWidth }
  );

doc
  .font('Helvetica')
  .fontSize(9.5)
  .fillColor(palette.subtle)
  .text(
    'Email: pujith.dev@example.com  |  Phone: +91-98765-43210  |  GitHub: github.com/pujith  |  LinkedIn: linkedin.com/in/pujith',
    left,
    doc.y + 6,
    { width: usableWidth }
  );

section('Professional Summary');

doc
  .font('Helvetica')
  .fontSize(10)
  .fillColor(palette.primary)
  .text(
    'Results-oriented software engineer with 3+ years of experience building ATS-focused career tooling and modern web applications. Strong in React, Node.js, and performance optimization, with a proven ability to ship reliable full-stack features end-to-end.',
    left,
    doc.y,
    { width: usableWidth, lineGap: 2 }
  );

section('Core Skills');

doc
  .font('Helvetica')
  .fontSize(10)
  .fillColor(palette.primary)
  .text(
    'React, Vite, JavaScript (ES6+), Node.js, Express, Tailwind CSS, MySQL, REST APIs, PDF/DOCX Generation, Git, CI/CD, Unit Testing, ATS Optimization',
    left,
    doc.y,
    { width: usableWidth, lineGap: 2 }
  );

section('Experience');

doc
  .font('Helvetica-Bold')
  .fontSize(10.5)
  .fillColor(palette.primary)
  .text('Software Engineer  |  JobTube Eco System', left, doc.y, { width: usableWidth });

doc
  .font('Helvetica-Oblique')
  .fontSize(9.5)
  .fillColor(palette.subtle)
  .text('2023 - Present', left, doc.y + 1, { width: usableWidth });

bullet('Built deterministic resume generation flows replacing unstable AI-dependent paths, improving success rate for DOCX/PDF output to near 100%.');
bullet('Implemented ATS scoring and keyword alignment workflows across upload, optimize, and create-from-scratch pipelines.');
bullet('Improved UI/UX in Resume Optimizer with robust error handling, download controls, and testing-focused mock data support.');

section('Projects');

doc
  .font('Helvetica-Bold')
  .fontSize(10.5)
  .fillColor(palette.primary)
  .text('Resume Forge (Full Stack)', left, doc.y, { width: usableWidth });

bullet('Engineered PDF and DOCX export using pdfkit and docx with Base64 payload transport and client-side download triggers.');
bullet('Designed ATS-first layout and keyword extraction logic to produce recruiter-friendly resume outputs.');

doc
  .font('Helvetica-Bold')
  .fontSize(10.5)
  .fillColor(palette.primary)
  .text('Developer Productivity Toolkit', left, doc.y + 6, { width: usableWidth });

bullet('Created reusable upload and parser components to streamline profile analysis and resume management features.');

section('Education');

doc
  .font('Helvetica-Bold')
  .fontSize(10.5)
  .fillColor(palette.primary)
  .text('B.Tech in Computer Science', left, doc.y, { width: usableWidth });

doc
  .font('Helvetica')
  .fontSize(10)
  .fillColor(palette.subtle)
  .text('JNTU Hyderabad  |  2019 - 2023', left, doc.y + 2, { width: usableWidth });

section('Certifications');

bullet('JavaScript Algorithms and Data Structures');
bullet('Modern React Development Practices');
bullet('SQL for Application Developers');

doc.end();

doc.on('end', () => {
  console.log(`Generated: ${outputPath}`);
});
