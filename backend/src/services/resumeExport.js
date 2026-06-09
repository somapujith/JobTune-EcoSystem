const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = require('docx');
const fs = require('fs');
const path = require('path');

class ResumeExport {
  /**
   * Export resume to DOCX format
   */
  static async toDOCX(resumeText, templateType = 'modern') {
    try {
      const sections = this.parseResume(resumeText);
      const doc = new Document({
        sections: [
          {
            children: this.buildDocumentParagraphs(sections, templateType)
          }
        ]
      });

      return await Packer.toBuffer(doc);
    } catch (err) {
      console.error('DOCX export error:', err);
      throw new Error('Failed to export resume as DOCX');
    }
  }

  /**
   * Parse resume text into structured sections
   */
  static parseResume(resumeText) {
    const sections = {
      summary: [],
      experience: [],
      education: [],
      skills: [],
      projects: [],
      certifications: []
    };

    let currentSection = null;
    const lines = resumeText.split('\n').map(l => l.trim()).filter(l => l);

    const sectionPatterns = {
      summary: /PROFESSIONAL SUMMARY|SUMMARY|PROFILE|OBJECTIVE/i,
      experience: /PROFESSIONAL EXPERIENCE|EXPERIENCE|WORK HISTORY|EMPLOYMENT/i,
      education: /EDUCATION|ACADEMIC|DEGREE/i,
      skills: /SKILLS|TECHNICAL SKILLS|COMPETENCIES/i,
      projects: /PROJECTS|PORTFOLIO|NOTABLE PROJECTS/i,
      certifications: /CERTIFICATIONS|CERTIFICATES|CREDENTIALS/i
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
   * Build DOCX paragraphs from resume sections
   */
  static buildDocumentParagraphs(sections, templateType) {
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
        spacing: { after: 200 }
      })
    );

    // Professional Summary
    if (sections.summary.length > 0) {
      paragraphs.push(this.createSectionHeader('PROFESSIONAL SUMMARY'));
      for (const line of sections.summary) {
        paragraphs.push(new Paragraph({
          text: line,
          spacing: { line: 240, after: 100 }
        }));
      }
      paragraphs.push(new Paragraph({ text: '', spacing: { after: 100 } }));
    }

    // Experience
    if (sections.experience.length > 0) {
      paragraphs.push(this.createSectionHeader('EXPERIENCE'));
      for (const line of sections.experience) {
        if (line.startsWith('•')) {
          paragraphs.push(new Paragraph({
            text: line.substring(1).trim(),
            bullet: { level: 0 },
            spacing: { line: 240, after: 100 }
          }));
        } else {
          paragraphs.push(new Paragraph({
            text: line,
            bold: line.includes('|'),
            spacing: { line: 240, after: 60 }
          }));
        }
      }
      paragraphs.push(new Paragraph({ text: '', spacing: { after: 100 } }));
    }

    // Skills
    if (sections.skills.length > 0) {
      paragraphs.push(this.createSectionHeader('SKILLS'));
      for (const line of sections.skills) {
        paragraphs.push(new Paragraph({
          text: line,
          spacing: { line: 240, after: 100 }
        }));
      }
      paragraphs.push(new Paragraph({ text: '', spacing: { after: 100 } }));
    }

    // Education
    if (sections.education.length > 0) {
      paragraphs.push(this.createSectionHeader('EDUCATION'));
      for (const line of sections.education) {
        paragraphs.push(new Paragraph({
          text: line,
          spacing: { line: 240, after: 100 }
        }));
      }
      paragraphs.push(new Paragraph({ text: '', spacing: { after: 100 } }));
    }

    // Projects
    if (sections.projects.length > 0) {
      paragraphs.push(this.createSectionHeader('PROJECTS'));
      for (const line of sections.projects) {
        if (line.startsWith('•')) {
          paragraphs.push(new Paragraph({
            text: line.substring(1).trim(),
            bullet: { level: 0 },
            spacing: { line: 240, after: 100 }
          }));
        } else {
          paragraphs.push(new Paragraph({
            text: line,
            spacing: { line: 240, after: 100 }
          }));
        }
      }
      paragraphs.push(new Paragraph({ text: '', spacing: { after: 100 } }));
    }

    // Certifications
    if (sections.certifications.length > 0) {
      paragraphs.push(this.createSectionHeader('CERTIFICATIONS'));
      for (const line of sections.certifications) {
        paragraphs.push(new Paragraph({
          text: line,
          spacing: { line: 240, after: 100 }
        }));
      }
    }

    return paragraphs;
  }

  /**
   * Create section header paragraph
   */
  static createSectionHeader(title) {
    return new Paragraph({
      text: title,
      heading: HeadingLevel.HEADING_2,
      bold: true,
      size: 24,
      color: '1F4E78',
      border: {
        bottom: {
          color: '1F4E78',
          space: 1,
          style: 'single',
          size: 6
        }
      },
      spacing: { before: 200, after: 100 }
    });
  }

  /**
   * Export resume to TXT format
   */
  static toTXT(resumeText) {
    return Buffer.from(resumeText, 'utf-8');
  }

  /**
   * Generate filename with timestamp
   */
  static generateFilename(userId, format = 'docx') {
    const timestamp = Date.now();
    return `resume_${userId}_${timestamp}.${format}`;
  }
}

module.exports = ResumeExport;
