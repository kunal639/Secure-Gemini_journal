import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config({ path: '.env.local' });

console.log('Project:', process.env.GOOGLE_CLOUD_PROJECT);
console.log('Location:', process.env.GOOGLE_CLOUD_LOCATION);

const ai = new GoogleGenAI({
  vertexai: true,
  project: process.env.GOOGLE_CLOUD_PROJECT,
  location: process.env.GOOGLE_CLOUD_LOCATION,
});

try {
  console.log('\nCalling Gemini...\n');

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: 'Reply with exactly: GEMINI_TEST_OK',
  });

  console.log('Gemini response:');
  console.log(response.text);
} catch (error) {
  console.error('\nGemini request failed:');
  console.error(error);
  process.exit(1);
}