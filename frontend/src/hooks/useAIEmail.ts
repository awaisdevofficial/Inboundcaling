import { useState } from "react";
import { toast } from "./use-toast";
import { useAuth } from "./useAuth";
import { useProfile } from "./useProfile";
import { fillEmailPlaceholders } from "@/lib/emailPlaceholders";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

export interface GenerateEmailParams {
  leadInfo?: {
    contact_name?: string;
    phone_number?: string;
    company_name?: string;
    call_date?: string;
    transcript?: string;
    metadata?: Record<string, any>;
  };
  emailType?: "follow-up" | "thank-you" | "appointment" | "custom";
  tone?: "professional" | "friendly" | "casual" | "formal";
  purpose?: string;
  context?: string;
}

export interface GeneratedEmail {
  subject: string;
  body: string;
}

export function useAIEmail() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [generating, setGenerating] = useState(false);

  const generateEmail = async (params: GenerateEmailParams): Promise<GeneratedEmail | null> => {
    setGenerating(true);
    
    try {
      const {
        leadInfo,
        emailType = "follow-up",
        tone = "professional",
        purpose,
        context,
      } = params;

      // Call backend API instead of OpenAI directly
      const response = await fetch(`${BACKEND_URL}/api/ai-email/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          leadInfo,
          emailType,
          tone,
          purpose,
          context,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `API error: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to generate email');
      }

      // Fill bracket-style placeholders with user profile data
      let body = data.body || "";
      body = fillEmailPlaceholders(body, profile, user, {
        recipientName: leadInfo?.contact_name,
        recipientEmail: undefined,
      });
      
      let subject = data.subject || "Follow-up Email";
      subject = fillEmailPlaceholders(subject, profile, user);
      
      return {
        subject,
        body: body,
      };
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate email. Please check your backend configuration.",
        variant: "destructive",
      });
      return null;
    } finally {
      setGenerating(false);
    }
  };

  const generateTemplate = async (params: {
    name: string;
    description?: string;
    emailType?: "follow-up" | "thank-you" | "appointment" | "custom";
    tone?: "professional" | "friendly" | "casual" | "formal";
    purpose?: string;
  }): Promise<GeneratedEmail | null> => {
    setGenerating(true);
    
    try {
      const {
        name,
        description,
        emailType = "follow-up",
        tone = "professional",
        purpose,
      } = params;

      // Call backend API instead of OpenAI directly
      const response = await fetch(`${BACKEND_URL}/api/ai-email/generate-template`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          description,
          emailType,
          tone,
          purpose,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `API error: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to generate email template');
      }

      let body = data.body || "";
      
      // Fill bracket-style placeholders with user profile data
      body = fillEmailPlaceholders(body, profile, user);
      
      let subject = data.subject || "Follow-up: {{contact_name}}";
      subject = fillEmailPlaceholders(subject, profile, user);
      
      return {
        subject,
        body: body,
      };
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate template",
        variant: "destructive",
      });
      return null;
    } finally {
      setGenerating(false);
    }
  };

  return {
    generateEmail,
    generateTemplate,
    generating,
  };
}
