'use strict';

/**
 * resumeExport: Worker port of backend/src/services/resumeExport.js (HEAD).  (docs slice)
 *
 * Same output as the Express class: DOCX built with the `docx` library (spike S4: all zip entries identical
 * to Node after masking dates, 6/6 documents), TXT as a Buffer. `docx` is loaded lazily on the first
 * toDOCX call (services/docs/docLibs.js) so a cold start that never exports does not evaluate it.
 *
 * Differences from the Express class, all forced by the platform or dead-code removal:
 *   - a factory of closures instead of statics (methods are safe to destructure).
 *   - buildDocumentParagraphs / createSectionHeader are ASYNC (they need the lazily loaded docx). Nothing
 *     else calls them; toDOCX is the public entry.
 *   - the dead `fs` / `path` requires (ADR 4.3.2) are gone.
 *
 * Preserved quirks (not fixed, ADR 4.3): parseResume drops every line before the first recognised section
 * header ("unsectioned lines"); the section patterns are un-anchored so a body line containing e.g. "skills"
 * starts a new section; Paragraph options such as `bold`, `size`, `color` and `themeColor` are passed
 * exactly as before even though docx ignores them at paragraph level; toTXT throws (masked 500 upstream) when
 * given a non-string, because Buffer.from(undefined) throws.
 */
const docLibs = require('./docs/docLibs');

function createResumeExport() {
  /**
   * Parse resume text into structured sections
   */
  function parseResume(resumeText) {
    const sections = {
      summary: [],
      experience: [],
      education: [],
      skills: [],
      projects: [],
      certifications: [],
    };

    let currentSection = null;
    const lines = resumeText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l);

    const sectionPatterns = {
      summary: /PROFESSIONAL SUMMARY|SUMMARY|PROFILE|OBJECTIVE/i,
      experience: /PROFESSIONAL EXPERIENCE|EXPERIENCE|WORK HISTORY|EMPLOYMENT/i,
      education: /EDUCATION|ACADEMIC|DEGREE/i,
      skills: /SKILLS|TECHNICAL SKILLS|COMPETENCIES/i,
      projects: /PROJECTS|PORTFOLIO|NOTABLE PROJECTS/i,
      certifications: /CERTIFICATIONS|CERTIFICATES|CREDENTIALS/i,
    };

    for (const line of lines) {
      // Check for section header
      let foundSection = false;
      for (const [section, pattern] of Object.entries(sectionPatterns)) {
        if (pattern.test(line)) {
          currentSection = section;
          foundSection = true;
          break;
        }
      }

      // Add line to current section
      if (!foundSection && currentSection && line.length > 0) {
        sections[currentSection].push(line);
      }
    }

    return sections;
  }

  /**
   * Create section header paragraph (docx namespace `D` already loaded)
   */
  function sectionHeader(D, title) {
    return new D.Paragraph({
      text: title,
      heading: D.HeadingLevel.HEADING_2,
      bold: true,
      size: 24,
      color: '1F4E78',
      border: {
        bottom: {
          color: '1F4E78',
          space: 1,
          style: 'single',
          size: 6,
        },
      },
      spacing: { before: 200, after: 100 },
    });
  }

  /**
   * Build DOCX paragraphs from resume sections (docx namespace `D` already loaded)
   */
  function paragraphsFor(D, sections, templateType) { // eslint-disable-line no-unused-vars
    const { Paragraph, HeadingLevel, AlignmentType } = D;
    const paragraphs = [];

    // Title
    paragraphs.push(
      new Paragraph({
        text: 'RESUME',
        heading: HeadingLevel.HEADING_1,
        themeColor: 'accent1',
        bold: true,
        size: 32,
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      })
    );

    // Professional Summary
    if (sections.summary.length > 0) {
      paragraphs.push(sectionHeader(D, 'PROFESSIONAL SUMMARY'));
      for (const line of sections.summary) {
        paragraphs.push(
          new Paragraph({
            text: line,
            spacing: { line: 240, after: 100 },
          })
        );
      }
      paragraphs.push(new Paragraph({ text: '', spacing: { after: 100 } }));
    }

    // Experience
    if (sections.experience.length > 0) {
      paragraphs.push(sectionHeader(D, 'EXPERIENCE'));
      for (const line of sections.experience) {
        if (line.startsWith('•')) {
          paragraphs.push(
            new Paragraph({
              text: line.substring(1).trim(),
              bullet: { level: 0 },
              spacing: { line: 240, after: 100 },
            })
          );
        } else {
          paragraphs.push(
            new Paragraph({
              text: line,
              bold: line.includes('|'),
              spacing: { line: 240, after: 60 },
            })
          );
        }
      }
      paragraphs.push(new Paragraph({ text: '', spacing: { after: 100 } }));
    }

    // Skills
    if (sections.skills.length > 0) {
      paragraphs.push(sectionHeader(D, 'SKILLS'));
      for (const line of sections.skills) {
        paragraphs.push(
          new Paragraph({
            text: line,
            spacing: { line: 240, after: 100 },
          })
        );
      }
      paragraphs.push(new Paragraph({ text: '', spacing: { after: 100 } }));
    }

    // Education
    if (sections.education.length > 0) {
      paragraphs.push(sectionHeader(D, 'EDUCATION'));
      for (const line of sections.education) {
        paragraphs.push(
          new Paragraph({
            text: line,
            spacing: { line: 240, after: 100 },
          })
        );
      }
      paragraphs.push(new Paragraph({ text: '', spacing: { after: 100 } }));
    }

    // Projects
    if (sections.projects.length > 0) {
      paragraphs.push(sectionHeader(D, 'PROJECTS'));
      for (const line of sections.projects) {
        if (line.startsWith('•')) {
          paragraphs.push(
            new Paragraph({
              text: line.substring(1).trim(),
              bullet: { level: 0 },
              spacing: { line: 240, after: 100 },
            })
          );
        } else {
          paragraphs.push(
            new Paragraph({
              text: line,
              spacing: { line: 240, after: 100 },
            })
          );
        }
      }
      paragraphs.push(new Paragraph({ text: '', spacing: { after: 100 } }));
    }

    // Certifications
    if (sections.certifications.length > 0) {
      paragraphs.push(sectionHeader(D, 'CERTIFICATIONS'));
      for (const line of sections.certifications) {
        paragraphs.push(
          new Paragraph({
            text: line,
            spacing: { line: 240, after: 100 },
          })
        );
      }
    }

    return paragraphs;
  }

  async function buildDocumentParagraphs(sections, templateType) {
    return paragraphsFor(await docLibs.loadDocx(), sections, templateType);
  }

  async function createSectionHeader(title) {
    return sectionHeader(await docLibs.loadDocx(), title);
  }

  /**
   * Export resume to DOCX format
   */
  async function toDOCX(resumeText, templateType = 'modern') {
    try {
      const sections = parseResume(resumeText);
      const D = await docLibs.loadDocx();
      const doc = new D.Document({
        sections: [
          {
            children: paragraphsFor(D, sections, templateType),
          },
        ],
      });

      return await D.Packer.toBuffer(doc);
    } catch (err) {
      console.error('DOCX export error:', err);
      throw new Error('Failed to export resume as DOCX');
    }
  }

  /**
   * Export resume to TXT format
   */
  function toTXT(resumeText) {
    return Buffer.from(resumeText, 'utf-8');
  }

  /**
   * Generate filename with timestamp
   */
  function generateFilename(userId, format = 'docx') {
    const timestamp = Date.now();
    return `resume_${userId}_${timestamp}.${format}`;
  }

  return { toDOCX, parseResume, buildDocumentParagraphs, createSectionHeader, toTXT, generateFilename };
}

module.exports = { createResumeExport };
