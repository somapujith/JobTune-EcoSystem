/**
 * Formatting Analyzer - Detects ATS-unfriendly formatting elements
 * Max Score: 20 Points, starts full and is penalized per detected issue.
 *
 * Note: input is plain extracted text, not the original PDF layout, so
 * "Images"/"Icons"/"Headers-Footers"/"Text Boxes" are detected via textual
 * signatures (e.g. leftover OCR/alt-text artifacts, repeated boilerplate
 * lines) rather than true visual inspection of the PDF.
 */

class FormattingAnalyzer {
  static MAX_SCORE = 20;

  static PENALTIES = {
    table: 5,
    multiColumn: 5,
    image: 5,
    icon: 2,
    headerFooter: 2,
    textBox: 5
  };

  static analyze(resumeText, fileContent = null) {
    if (!resumeText || typeof resumeText !== 'string') {
      return { score: 0, maxScore: this.MAX_SCORE, issues: [], recommendations: [] };
    }

    const issues = [];
    let score = this.MAX_SCORE;

    if (this._hasTable(resumeText)) {
      issues.push({ type: 'table', message: 'Table layout detected', penalty: this.PENALTIES.table });
      score -= this.PENALTIES.table;
    }

    if (this._hasMultiColumn(resumeText)) {
      issues.push({ type: 'multiColumn', message: 'Two-column layout found', penalty: this.PENALTIES.multiColumn });
      score -= this.PENALTIES.multiColumn;
    }

    if (this._hasImage(resumeText)) {
      issues.push({ type: 'image', message: 'Profile photo or embedded image detected', penalty: this.PENALTIES.image });
      score -= this.PENALTIES.image;
    }

    if (this._hasIcon(resumeText)) {
      issues.push({ type: 'icon', message: 'Decorative icons detected', penalty: this.PENALTIES.icon });
      score -= this.PENALTIES.icon;
    }

    if (this._hasHeaderFooter(resumeText)) {
      issues.push({ type: 'headerFooter', message: 'Repeating header/footer content detected', penalty: this.PENALTIES.headerFooter });
      score -= this.PENALTIES.headerFooter;
    }

    if (this._hasTextBox(resumeText)) {
      issues.push({ type: 'textBox', message: 'Text box / sidebar layout detected', penalty: this.PENALTIES.textBox });
      score -= this.PENALTIES.textBox;
    }

    score = Math.max(0, Math.min(score, this.MAX_SCORE));

    return {
      score,
      maxScore: this.MAX_SCORE,
      percentage: (score / this.MAX_SCORE) * 100,
      issues,
      atsCompatible: issues.length === 0,
      recommendations: this._getRecommendations(issues)
    };
  }

  /**
   * A real table/grid layout shows up as a markdown-style separator row
   * (|---|---|) or as 3+ consecutive lines with pipes at matching column
   * positions. A single "Title | Company" label line is not a table.
   */
  static _hasTable(text) {
    if (/\+[-]{3,}\+/.test(text)) return true;
    if (/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/m.test(text)) return true;

    const lines = text.split('\n');
    const pipePositions = lines
      .map(line => [...line].reduce((positions, ch, idx) => (ch === '|' ? [...positions, idx] : positions), []))
      .filter(positions => positions.length >= 2);

    if (pipePositions.length < 3) return false;

    for (let i = 0; i <= pipePositions.length - 3; i++) {
      const [a, b, c] = pipePositions.slice(i, i + 3);
      const matches = (x, y) => x.length === y.length && x.every((pos, idx) => Math.abs(pos - y[idx]) <= 1);
      if (matches(a, b) && matches(b, c)) return true;
    }

    return false;
  }

  /** Large runs of inline whitespace between words on the same line suggest column alignment. */
  static _hasMultiColumn(text) {
    const lines = text.split('\n');
    const columnLikeLines = lines.filter(l => /\S\s{4,}\S/.test(l));
    return columnLikeLines.length >= 3;
  }

  /** PDF/DOCX text extractors leave behind alt-text or [image] placeholders for embedded images. */
  static _hasImage(text) {
    return /\[image\]|\[photo\]|\[picture\]|alt\s*=\s*["']?(photo|headshot|profile)/i.test(text);
  }

  /** Common icon-font ligature names or emoji used as bullet/section markers. */
  static _hasIcon(text) {
    return /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text) || /\b(fa-|material-icons|glyphicon)\b/i.test(text);
  }

  /** A short line repeated verbatim near the top and bottom of the document indicates a running header/footer. */
  static _hasHeaderFooter(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 10) return false;

    const topSlice = lines.slice(0, 3);
    const bottomSlice = lines.slice(-3);
    return topSlice.some(top => top.length > 0 && top.length < 60 && bottomSlice.includes(top));
  }

  /** Sidebar/text-box content often appears as short isolated lines surrounded by large whitespace gaps mid-document. */
  static _hasTextBox(text) {
    return /\t{2,}/.test(text);
  }

  static _getRecommendations(issues) {
    if (issues.length === 0) return [];

    return issues.map(issue => ({
      priority: issue.penalty >= 5 ? 'high' : 'medium',
      message: `Remove ${issue.message.toLowerCase()} — ATS parsers often misread or skip this content (-${issue.penalty} pts)`
    }));
  }
}

module.exports = FormattingAnalyzer;
