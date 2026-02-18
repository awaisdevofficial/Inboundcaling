import { supabase } from "@/integrations/supabase/client";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

export interface ChatMessage {
  message: string;
  session_id?: string;
  user_id?: string | null;
  conversationHistory?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
}

export interface ChatResponse {
  response: string;
  message: string;
  session_id: string;
}

export interface ConversationHistory {
  id: string;
  session_id: string;
  user_id: string | null;
  role: "user" | "assistant";
  message: string;
  created_at: string;
}

export const chatbotApi = {
  /**
   * Send a message to the chatbot (calls backend API to keep API key secure)
   */
  async sendMessage(
    message: string,
    conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = [],
    sessionId?: string,
    userId?: string | null
  ): Promise<ChatResponse> {
    // Generate session_id if not provided
    const finalSessionId =
      sessionId ||
      `chat_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;

    // Save user message to database
    try {
      await supabase.from("chatbot_conversations").insert({
        session_id: finalSessionId,
        user_id: userId || null,
        role: "user",
        message: message,
      });
    } catch (error) {
      // Continue even if save fails
    }

    // Call backend API instead of OpenAI directly
    const response = await fetch(`${BACKEND_URL}/api/chatbot/send-message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        conversationHistory: conversationHistory.slice(-10), // Keep last 10 messages for context
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error || `API error: ${response.status}`
      );
    }

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to send chatbot message');
    }

    const botResponse = data.response || data.message ||
      "I'm sorry, I couldn't generate a response. Please try again.";

    // Save assistant response to database
    try {
      await supabase.from("chatbot_conversations").insert({
        session_id: finalSessionId,
        user_id: userId || null,
        role: "assistant",
        message: botResponse,
      });
    } catch (error) {
      // Continue even if save fails
    }

    return {
      response: botResponse,
      message: botResponse, // For compatibility
      session_id: finalSessionId,
    };
  },

  /**
   * Get conversation history for a session
   */
  async getHistory(
    sessionId: string,
    userId?: string | null
  ): Promise<{ messages: ConversationHistory[]; session_id: string }> {
    let query = supabase
      .from("chatbot_conversations")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message || "Failed to fetch conversation history");
    }

    return {
      messages: (data as ConversationHistory[]) || [],
      session_id: sessionId,
    };
  },
};
