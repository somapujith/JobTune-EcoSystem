const { callAI } = require('./src/utils/aiClient');
require('dotenv').config();

async function testGemini() {
  console.log('--- Testing Gemini API Integration ---');
  console.log('Model:', process.env.GEMINI_MODEL);
  console.log('API Key First 5 Chars:', process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.slice(0, 5) : 'MISSING');

  const result = await callAI({
    systemPrompt: "You are a helpful assistant.",
    userPrompt: "Hello Gemini! If you can read this, respond with 'The quick brown fox jumps over the lazy dog.'",
    maxTokens: 100
  });

  if (result.ok) {
    console.log('✅ GEMINI API IS WORKING!');
    console.log('Response content:', result.data);
  } else {
    console.log('❌ GEMINI API FAILED!');
    console.log('Error:', result.error);
  }
}

testGemini();
