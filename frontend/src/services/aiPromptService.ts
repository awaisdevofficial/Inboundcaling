import type { AgentPromptProfile, DocumentExtractionResult, PromptGenerationResult } from '@/types/aiPrompt';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

/**
 * Agent A: Document Extractor
 * Extracts structured business profile from document text
 * Now calls backend API to keep API key secure
 */
export async function extractDocumentProfile(
  extractedText: string
): Promise<DocumentExtractionResult> {
  const response = await fetch(`${BACKEND_URL}/api/ai-prompt/extract-document-profile`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      extractedText,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `API error: ${response.statusText} (Status: ${response.status})`);
  }

  const data = await response.json();
  
  if (!data.success) {
    throw new Error(data.error || 'Failed to extract document profile');
  }

  return {
    extractedProfile: data.extractedProfile,
    missingFields: data.missingFields || [],
  };
}

/**
 * Agent B: Prompt Generator
 * Generates final prompt from structured profile, or returns clarification questions
 * Now calls backend API to keep API key secure
 */
export async function generatePromptFromProfile(
  profile: Partial<AgentPromptProfile>
): Promise<PromptGenerationResult> {
  const response = await fetch(`${BACKEND_URL}/api/ai-prompt/generate-from-profile`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      profile,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `API error: ${response.statusText} (Status: ${response.status})`);
  }

  const data = await response.json();
  
  if (!data.success) {
    throw new Error(data.error || 'Failed to generate prompt from profile');
  }

  return {
    status: data.status,
    clarificationQuestions: data.clarificationQuestions || [],
    finalPrompt: data.finalPrompt || '',
  };
}

/**
 * Agent C: Prompt Formatter
 * Formats raw unstructured prompt into structured format
 * Now calls backend API to keep API key secure
 */
export async function formatRawPrompt(
  rawPrompt: string
): Promise<string> {
  const response = await fetch(`${BACKEND_URL}/api/ai-prompt/format-raw-prompt`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      rawPrompt,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `API error: ${response.statusText} (Status: ${response.status})`);
  }

  const data = await response.json();
  
  if (!data.success) {
    throw new Error(data.error || 'Failed to format prompt');
  }

  return data.formattedPrompt || '';
}
