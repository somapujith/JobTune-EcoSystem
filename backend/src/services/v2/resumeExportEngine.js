/**
 * Resume Export Engine - Generates multiple export formats
 * Latency Target: <2 seconds
 */

const PDFDocument = require('pdfkit');
const { Readable } = require('stream');

class ResumeExportEngine {
  /**
   * Export resume in specified format
   * @param {string} resumeText - Resume text content
   * @param {string} format - Export format (pdf, docx, txt)
   * @returns {Promise} Export data
   */
  static async export(resumeText, format = 'txt') {
    if (!resumeText || typeof resumeText !== 'string') {
      throw new Error('Invalid resume text');
    }

    switch (format.toLowerCase()) {
      case 'pdf':
        return this.exportAsPDF(resumeText);
      case 'docx':
        return this.exportAsDOCX(resumeText);
      case 'txt':
      default:
        return this.exportAsText(resumeText);
    }
  }

  /**
   * Export as plain text (ATS-friendly)
   */
  static exportAsText(resumeText) {
    return {
      format: 'txt',
      mimeType: 'text/plain',
      content: resumeText,
      filename: `resume-${Date.now()}.txt`
    };
  }

  /**
   * Export as PDF
   */
  static exportAsPDF(resumeText) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          margin: 40,
          bufferPages: true
        });

        const stream = Readable.from([]);
        const chunks = [];

        // Capture PDF data
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => {
          const buffer = Buffer.concat(chunks);
          resolve({
            format: 'pdf',
            mimeType: 'application/pdf',
            content: buffer,
            filename: `resume-${Date.now()}.pdf`
          });
        });

        doc.on('error', reject);

        // Format PDF
        this._formatPDFContent(doc, resumeText);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Format PDF content
   * @private
   */
  static _formatPDFContent(doc, resumeText) {
    const lines = resumeText.split('\n');
    const fontSize = 10;
    const lineHeight = 12;

    doc.fontSize(fontSize);

    for (const line of lines) {
      // Skip empty lines but keep spacing
      if (line.trim().length === 0) {
        doc.moveDown(0.3);
      }
      // Check if line is a header (ALL CAPS or with specific markers)
      else if (line === line.toUpperCase() && line.trim().length > 0) {
        doc.fontSize(12).font('Helvetica-Bold');
        doc.text(line.trim());
        doc.moveDown(0.2);
        doc.fontSize(fontSize).font('Helvetica');
      }
      // Check if line is a bullet point
      else if (line.match(/^[\s]*[-•*]/)) {
        doc.fontSize(fontSize).font('Helvetica');
        const bulletText = line.replace(/^[\s]*[-•*]/, '').trim();
        doc.text(`• ${bulletText}`, { indent: 10 });
      }
      // Regular text
      else {
        doc.fontSize(fontSize).font('Helvetica');
        doc.text(line.trim());
      }
    }
  }

  /**
   * Export as DOCX
   * Note: Full DOCX generation requires docx library
   * For now, returning formatted text that can be imported
   */
  static exportAsDOCX(resumeText) {
    // Simple DOCX-compatible format
    // In production, use 'docx' npm package for true DOCX generation
    return {
      format: 'docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      content: resumeText, // Would use docx library to generate proper DOCX
      filename: `resume-${Date.now()}.docx`,
      note: 'Import this text into Word to create DOCX'
    };
  }

  /**
   * Validate export content
   */
  static validateExport(content, format) {
    const errors = [];

    if (!content || content.length === 0) {
      errors.push('Empty content');
    }

    if (content.length < 100) {
      errors.push('Content too short (minimum 100 characters)');
    }

    if (format === 'pdf' && !Buffer.isBuffer(content)) {
      errors.push('PDF content must be a buffer');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * Get file extension for format
   */
  static getFileExtension(format) {
    const extensions = {
      pdf: 'pdf',
      docx: 'docx',
      txt: 'txt'
    };
    return extensions[format.toLowerCase()] || 'txt';
  }

  /**
   * Get MIME type for format
   */
  static getMimeType(format) {
    const mimeTypes = {
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      txt: 'text/plain'
    };
    return mimeTypes[format.toLowerCase()] || 'text/plain';
  }
}

module.exports = ResumeExportEngine;
