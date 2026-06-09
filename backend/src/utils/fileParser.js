const { Document, Packer } = require('docx');
const pdfParse = require('pdf-parse');

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
    return data.text;
  } catch (err) {
    console.error('PDF parsing error:', err);
    throw new Error('Could not extract text from PDF');
  }
}

function extractTextFromDOCX(buffer) {
  try {
    const zip = require('unzipper');
    const xml2js = require('xml2js');
    const parser = new xml2js.Parser();

    return new Promise((resolve, reject) => {
      const chunks = [];

      zip
        .Open.buffer(buffer)
        .then((directory) => {
          return directory.file('word/document.xml').stream();
        })
        .then((stream) => {
          stream.on('data', (chunk) => chunks.push(chunk));
          stream.on('end', async () => {
            try {
              const xmlString = Buffer.concat(chunks).toString('utf-8');
              const result = await parser.parseStringPromise(xmlString);

              // Extract text from XML
              const text = extractTextFromXML(result);
              resolve(text);
            } catch (err) {
              reject(new Error('Could not parse DOCX XML'));
            }
          });
          stream.on('error', reject);
        })
        .catch(reject);
    });
  } catch (err) {
    console.error('DOCX parsing error:', err);
    throw new Error('Could not extract text from DOCX');
  }
}

function extractTextFromXML(obj) {
  let text = '';

  function traverse(node) {
    if (typeof node === 'string') {
      text += node;
    } else if (Array.isArray(node)) {
      node.forEach((item) => traverse(item));
    } else if (typeof node === 'object') {
      Object.values(node).forEach((value) => traverse(value));
    }
  }

  traverse(obj);
  return text;
}

module.exports = {
  extractTextFromFile
};
