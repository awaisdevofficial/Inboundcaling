import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "./use-toast";

// ===== Voice Types =====
export interface RetellVoice {
  voice_id: string;
  voice_name: string;
  provider: "elevenlabs" | "openai" | "deepgram" | "cartesia" | "minimax";
  gender: "male" | "female";
  accent?: string;
  age?: string;
  preview_audio_url?: string;
}

// ===== LLM Types =====
export interface RetellLLM {
  llm_id: string;
  llm_name?: string;
  model: string;
  s2s_model?: string; // Speech-to-speech model like 'gpt-4o-realtime'
  temperature?: number;
  model_high_priority?: boolean;
  tool_call_strict_mode?: boolean;
  is_published?: boolean;
  version?: number;
  last_modification_timestamp?: number;

  // Latency metrics
  latency?: number;
  latency_ms?: number;
  average_latency?: number;
  average_latency_ms?: number;
  p50_latency_ms?: number;
  p95_latency_ms?: number;
  p99_latency_ms?: number;
}

// ===== STT (Speech-to-Text) / Transcriber Types =====
export interface CustomSTTConfig {
  provider: "azure" | "deepgram" | "google" | "assembly";
  endpointing_ms?: number;
  language?: string;
}

export interface STTMode {
  mode: "fast" | "accurate" | "custom";
  custom_config?: CustomSTTConfig;
}

export interface TranscriberInfo {
  stt_mode: "fast" | "accurate" | "custom";
  custom_stt_config?: CustomSTTConfig;
  vocab_specialization?: "general" | "medical" | "legal" | "finance";
  allow_user_dtmf?: boolean;
  denoising_mode?: "noise-cancellation" | "echo-cancellation" | "off";
}

// ===== Agent Types =====
export interface RetellAgent {
  agent_id: string;
  agent_name?: string;
  version?: number;
  voice_id: string;
  language?: string;
  response_engine?: {
    type: "retell-llm" | "custom-llm" | "conversation-flow";
    llm_id?: string;
    version?: number;
  };

  // Voice settings
  voice_model?: string;
  voice_temperature?: number;
  voice_speed?: number;
  volume?: number;
  fallback_voice_ids?: string[];

  // Conversation settings
  responsiveness?: number;
  interruption_sensitivity?: number;
  enable_backchannel?: boolean;
  backchannel_frequency?: number;
  backchannel_words?: string[];

  // STT/Transcriber settings
  stt_mode?: "fast" | "accurate" | "custom";
  custom_stt_config?: CustomSTTConfig;
  vocab_specialization?: "general" | "medical" | "legal" | "finance";

  // Advanced settings
  ambient_sound?: string;
  webhook_url?: string;
  boosted_keywords?: string[];
  is_published?: boolean;
  last_modification_timestamp?: number;
}

// ===== TTS (Text-to-Speech) Provider Types =====
export interface TTSProvider {
  provider: "elevenlabs" | "openai" | "deepgram" | "cartesia" | "minimax";
  models: string[];
  latency_ms?: number;
  supports_streaming?: boolean;
}

// ===== Available LLM Models =====
export interface LLMModel {
  model_name: string;
  provider: "openai" | "anthropic" | "custom";
  supports_function_calling?: boolean;
  supports_streaming?: boolean;
  context_window?: number;
  cost_per_minute?: number;
}

// ===== Knowledge Base Types =====
export interface KnowledgeBase {
  kb_id: string;
  kb_name?: string;
  sources?: string[];
  last_updated?: number;
}

// ===== Main Hook =====
export function useRetellData() {
  const [voices, setVoices] = useState<RetellVoice[]>([]);
  const [llms, setLlms] = useState<RetellLLM[]>([]);
  const [agents, setAgents] = useState<RetellAgent[]>([]);
  const [ttsProviders, setTtsProviders] = useState<TTSProvider[]>([]);
  const [sttProviders, setSTTProviders] = useState<string[]>([]);
  const [availableModels, setAvailableModels] = useState<LLMModel[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRetellData = async () => {
    setLoading(true);
    setError(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const authToken =
        session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const headers = {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      };

      // Fetch Voices
      try {
        const voicesResponse = await fetch(
          `${supabaseUrl}/functions/v1/retell-data?type=voices`,
          { method: "GET", headers },
        );
        if (voicesResponse.ok) {
          const voicesResult = await voicesResponse.json();
          setVoices(Array.isArray(voicesResult) ? voicesResult : []);
        }
      } catch (err) {
        // Removed console.warn for security
      }

      // Fetch LLMs
      try {
        const llmsResponse = await fetch(
          `${supabaseUrl}/functions/v1/retell-data?type=llms`,
          { method: "GET", headers },
        );
        if (llmsResponse.ok) {
          const llmsResult = await llmsResponse.json();
          setLlms(Array.isArray(llmsResult) ? llmsResult : []);
        }
      } catch (err) {
        // Removed console.warn for security
      }

      // Fetch Agents
      try {
        const agentsResponse = await fetch(
          `${supabaseUrl}/functions/v1/retell-data?type=agents`,
          { method: "GET", headers },
        );
        if (agentsResponse.ok) {
          const agentsResult = await agentsResponse.json();
          setAgents(Array.isArray(agentsResult) ? agentsResult : []);
        }
      } catch (err) {
        // Removed console.warn for security
      }

      // Fetch TTS Providers info
      try {
        const ttsResponse = await fetch(
          `${supabaseUrl}/functions/v1/retell-data?type=tts-providers`,
          { method: "GET", headers },
        );
        if (ttsResponse.ok) {
          const ttsResult = await ttsResponse.json();
          setTtsProviders(Array.isArray(ttsResult) ? ttsResult : []);
        }
      } catch (err) {
        // Removed console.warn for security
      }

      // Fetch STT Providers
      try {
        const sttResponse = await fetch(
          `${supabaseUrl}/functions/v1/retell-data?type=stt-providers`,
          { method: "GET", headers },
        );
        if (sttResponse.ok) {
          const sttResult = await sttResponse.json();
          setSTTProviders(Array.isArray(sttResult) ? sttResult : []);
        }
      } catch (err) {
        // Removed console.warn for security
      }

      // Fetch Available LLM Models
      try {
        const modelsResponse = await fetch(
          `${supabaseUrl}/functions/v1/retell-data?type=llm-models`,
          { method: "GET", headers },
        );
        if (modelsResponse.ok) {
          const modelsResult = await modelsResponse.json();
          setAvailableModels(Array.isArray(modelsResult) ? modelsResult : []);
        }
      } catch (err) {
        // Removed console.warn for security
      }

      // Fetch Knowledge Bases
      try {
        const kbResponse = await fetch(
          `${supabaseUrl}/functions/v1/retell-data?type=knowledge-bases`,
          { method: "GET", headers },
        );
        if (kbResponse.ok) {
          const kbResult = await kbResponse.json();
          setKnowledgeBases(Array.isArray(kbResult) ? kbResult : []);
        }
      } catch (err) {
        // Removed console.warn for security
      }
    } catch (err) {
      // Removed console.error for security
      setError(
        err instanceof Error ? err.message : "Failed to fetch Genie data",
      );
      toast({
        title: "Warning",
        description:
          "Could not fetch complete Genie data. Using available options.",
        variant: "default",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRetellData();
  }, []);

  // Compute llmLatency for backward compatibility with BotFormDialog
  const llmLatency = llms.map((llm) => ({
    llm_id: llm.llm_id,
    llm_name: llm.llm_name || llm.llm_id,
    model: llm.model,
    average_latency_ms:
      llm.average_latency_ms ||
      llm.latency_ms ||
      llm.average_latency ||
      llm.latency,
    p50_latency_ms: llm.p50_latency_ms,
    p95_latency_ms: llm.p95_latency_ms,
    p99_latency_ms: llm.p99_latency_ms,
  }));

  return {
    // Voice data
    voices,

    // LLM data
    llms,
    llmLatency, // For backward compatibility
    availableModels,

    // Agent data
    agents,

    // TTS (Text-to-Speech) data
    ttsProviders,

    // STT (Speech-to-Text / Transcriber) data
    sttProviders,

    // Knowledge Base data
    knowledgeBases,

    // Utility
    loading,
    error,
    refetch: fetchRetellData,
  };
}
