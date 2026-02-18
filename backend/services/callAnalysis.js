import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const openaiApiKey = process.env.OPENAI_API_KEY?.trim();
const openai = new OpenAI({
  apiKey: openaiApiKey,
});

/**
 * AI System Prompt for Universal Call Analysis
 */
const ANALYSIS_SYSTEM_PROMPT = `You are an expert call transcript analyzer. Analyze the provided call transcript and extract structured information.

IMPORTANT RULES:
1. Extract ONLY explicit information from the transcript. Never guess or infer.
2. Return null for any field if the information is not explicitly stated.
3. Output ONLY valid JSON, no other text.
4. Be precise and accurate.

Output JSON structure:
{
  "call_type": "order" | "appointment" | "sales_inquiry" | "support" | "billing" | "complaint" | "general_inquiry" | "wrong_number" | "spam" | "unknown",
  "is_lead": true | false,
  "lead_strength": "hot" | "warm" | "cold" | null,
  "customer": {
    "name": null | string,
    "email": null | string,
    "phone_number": null | string,
    "address": null | string
  },
  "summary": null | string,
  "intent_summary": null | string,
  "appointment": {
    "requested": true | false,
    "scheduled": true | false,
    "date": null | string,
    "time": null | string,
    "timezone": null | string,
    "appointment_type": null | string
  },
  "order": {
    "order_requested": true | false,
    "order_type": "delivery" | "pickup" | "dine_in" | null,
    "items": [],
    "total_price": null | string,
    "payment_method": null | string,
    "preferred_time": null | string
  },
  "support": {
    "issue": null | string,
    "resolution_provided": true | false
  },
  "billing": {
    "billing_issue": null | string,
    "refund_requested": true | false
  },
  "complaint": {
    "complaint_reason": null | string
  },
  "next_step": {
    "type": "callback" | "appointment" | "send_information" | "send_payment_link" | "support_ticket" | "transfer" | "follow_up_later" | "none" | "unknown",
    "details": null | string
  },
  "call_outcome": "completed_successfully" | "follow_up_needed" | "not_resolved" | "caller_not_interested" | "call_dropped" | "unknown",
  "sentiment": "positive" | "neutral" | "negative" | "unknown",
  "urgency_level": "low" | "medium" | "high" | "unknown",
  "confidence_score": 0.0
}`;

/**
 * Analyze call transcript using OpenAI
 */
export async function analyzeCallTranscript(transcript) {
  if (!transcript || transcript.trim().length === 0) {
    throw new Error('Transcript is empty or invalid');
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // or 'gpt-4' for better accuracy
      messages: [
        { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
        { role: 'user', content: `Analyze this call transcript:\n\n${transcript}` },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) {
      throw new Error('No response from OpenAI');
    }

    // Parse and validate JSON
    let analysis;
    try {
      analysis = JSON.parse(responseText);
    } catch (parseError) {
      throw new Error(`Invalid JSON response: ${parseError.message}`);
    }

    // Validate required fields
    if (!analysis.call_type) {
      analysis.call_type = 'unknown';
    }
    if (typeof analysis.is_lead !== 'boolean') {
      analysis.is_lead = false;
    }
    if (typeof analysis.confidence_score !== 'number') {
      analysis.confidence_score = 0;
    }

    return {
      success: true,
      analysis,
    };
  } catch (error) {
    console.error('OpenAI Analysis Error:', error);
    return {
      success: false,
      error: error.message || 'Failed to analyze transcript',
      raw_response: error.response?.data || null,
    };
  }
}
