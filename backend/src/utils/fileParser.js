const pdfParse = require('pdf-parse');
const unzipper = require('unzipper');
const xml2js = require('xml2js');

async function extractTextFromFile(file) {
  if (!file) throw new Error('No file provided');

  if (file.mimetype === 'application/pdf') {
    return extractTextFromPDF(file.buffer);
  } else if (
    file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    file.mimetype === 'application/msword'
  ) {
    return extractTextFromDOCX(file.buffer);
  } else {
    throw new Error('Unsupported file format. Use PDF or DOCX.');
  }
}

async function extractTextFromPDF(buffer) {
  try {
    const data = await pdfParse(buffer);
    return data.text || '';
  } catch (err) {
    console.error('PDF parsing error:', err.message);
    throw new Error('Could not extract text from PDF');
  }
}

async function extractTextFromDOCX(buffer) {
  try {
    const directory = await unzipper.Open.buffer(buffer);

    const docXmlFile = directory.files.find(f => f.path === 'word/document.xml');
    if (!docXmlFile) {
      throw new Error('document.xml not found in DOCX');
    }

    const xmlContent = await docXmlFile.buffer();
    const xmlString = xmlContent.toString('utf-8');

    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(xmlString);

    const text = extractTextFromXML(result);
    return text || '';
  } catch (err) {
    console.error('DOCX parsing error:', err.message);
    throw new Error('Could not extract text from DOCX: ' + err.message);
  }
}

function extractTextFromXML(obj) {
  let text = '';

  function traverse(node) {
    if (typeof node === 'string') {
      text += node + ' ';
    } else if (Array.isArray(node)) {
      node.forEach((item) => traverse(item));
    } else if (typeof node === 'object' && node !== null) {
      Object.values(node).forEach((value) => traverse(value));
    }
  }

  traverse(obj);
  return text.trim();
}

module.exports = {
  extractTextFromFile
};
