'use strict';

/**
 * resumeExportEngine: Worker port of backend/src/services/v2/resumeExportEngine.js (HEAD).  (docs slice)
 * Resume Export Engine - Generates multiple export formats.
 *
 * Same behaviour as the Express class, including its quirks (preserved, ADR 4.3):
 *   - `export(text, 'docx')` does NOT build a DOCX: it returns the plain text labelled with the DOCX mime type
 *     (see exportAsDOCX's own comment). The Worker route therefore also serves plain text under a DOCX mime.
 *   - validateExport requires >= 100 characters, so short resumes get "Export validation failed" (500).
 *   - a null `format` throws (format.toLowerCase()), surfaced by the route as its 500 "Export failed".
 *
 * pdfkit is loaded lazily on the first PDF export through services/docs/docLibs.js, where the wrangler
 * alias points it at the standalone build (spike S3: 6/6 valid PDFs, text identical to Node; bytes differ
 * 10-54 B from Node because of zlib plus the /ID and dates, so PDFs cannot be byte-compared with Render).
 *
 * Differences from the Express class, all forced by the platform or dead-code removal:
 *   - a factory of closures instead of statics.
 *   - the unused `require('stream')` and `Readable.from([])` in exportAsPDF are dropped (dead code).
 *   - exportAsPDF is async because it awaits the lazy pdfkit import (it still resolves the same result object).
 */
const docLibs = require('../docs/docLibs');

function createResumeExportEngine() {
  /**
   * Format PDF content
   * @private
   */
  function _formatPDFContent(doc, resumeText) {
    const lines = resumeText.split('\n');
    const fontSize = 10;

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
   * Export as plain text (ATS-friendly)
   */
  function exportAsText(resumeText) {
    return {
      format: 'txt',
      mimeType: 'text/plain',
      content: resumeText,
      filename: `resume-${Date.now()}.txt`,
    };
  }

  /**
   * Export as PDF
   */
  async function exportAsPDF(resumeText) {
    const PDFDocument = await docLibs.loadPdfKit();
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          margin: 40,
          bufferPages: true,
        });

        const chunks = [];

        // Capture PDF data
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => {
          const buffer = Buffer.concat(chunks);
          resolve({
            format: 'pdf',
            mimeType: 'application/pdf',
            content: buffer,
            filename: `resume-${Date.now()}.pdf`,
          });
        });

        doc.on('error', reject);

        // Format PDF
        _formatPDFContent(doc, resumeText);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Export as DOCX
   * Note: Full DOCX generation requires docx library
   * For now, returning formatted text that can be imported
   */
  function exportAsDOCX(resumeText) {
    // Simple DOCX-compatible format
    // In production, use 'docx' npm package for true DOCX generation
    return {
      format: 'docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      content: resumeText, // Would use docx library to generate proper DOCX
      filename: `resume-${Date.now()}.docx`,
      note: 'Import this text into Word to create DOCX',
    };
  }

  /**
   * Export resume in specified format
   * @param {string} resumeText - Resume text content
   * @param {string} format - Export format (pdf, docx, txt)
   * @returns {Promise} Export data
   */
  async function exportResume(resumeText, format = 'txt') {
    if (!resumeText || typeof resumeText !== 'string') {
      throw new Error('Invalid resume text');
    }

    switch (format.toLowerCase()) {
      case 'pdf':
        return exportAsPDF(resumeText);
      case 'docx':
        return exportAsDOCX(resumeText);
      case 'txt':
      default:
        return exportAsText(resumeText);
    }
  }

  /**
   * Validate export content
   */
  function validateExport(content, format) {
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
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Get file extension for format
   */
  function getFileExtension(format) {
    const extensions = {
      pdf: 'pdf',
      docx: 'docx',
      txt: 'txt',
    };
    return extensions[format.toLowerCase()] || 'txt';
  }

  /**
   * Get MIME type for format
   */
  function getMimeType(format) {
    const mimeTypes = {
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      txt: 'text/plain',
    };
    return mimeTypes[format.toLowerCase()] || 'text/plain';
  }

  return {
    export: exportResume,
    exportAsText,
    exportAsPDF,
    _formatPDFContent,
    exportAsDOCX,
    validateExport,
    getFileExtension,
    getMimeType,
  };
}

module.exports = { createResumeExportEngine };
