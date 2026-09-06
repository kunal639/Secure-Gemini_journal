import { GoogleGenAI } from '@google/genai';

let client: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (client) {
    return client;
  }

  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GOOGLE_CLOUD_LOCATION;

  if (!project) {
    throw new Error('GOOGLE_CLOUD_PROJECT is not configured');
  }

  if (!location) {
    throw new Error('GOOGLE_CLOUD_LOCATION is not configured');
  }

  client = new GoogleGenAI({
    vertexai: true,
    project,
    location,
  });

  return client;
}