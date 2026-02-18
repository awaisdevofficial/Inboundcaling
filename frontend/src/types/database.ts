export type CallStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed"
  | "not_connected"
  | "night_time_dont_call";

export type ActivityType =
  | "bot_created"
  | "bot_updated"
  | "bot_deleted"
  | "call_started"
  | "call_completed"
  | "call_failed"
  | "credit_added"
  | "credit_used"
  | "template_created"
  | "template_updated"
  | "account_login"
  | "lead_created"
  | "email_sent"
  | "settings_changed";

export type NotificationType = "info" | "success" | "warning" | "error" | "system";

export type TransactionType = "credit" | "debit" | "refund" | "adjustment";

export type UsageType = "call" | "sms" | "ai_analysis" | "phone_number_rental" | "other";

export interface BotConfig {
  // LLM Configuration
  llm_id?: string; // Genie LLM ID
  model?: string; // Model name (e.g., "gpt-4", "gpt-3.5-turbo")
  model_temperature?: number; // 0-2, default 0.7
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;

  // Agent Behavior
  start_speaker?: "agent" | "user";
  begin_message?: string | string[]; // Support both string (backward compat) and array for multiple messages
  begin_after_user_silence_ms?: number;
  general_prompt?: string;
  enable_voicemail_detection?: boolean;
  voicemail_message?: string;
  voicemail_detection_timeout_ms?: number;

  // Voice Configuration
  voice_id?: string;
  voice_temperature?: number; // 0-2, default 1
  voice_speed?: number; // 0.25-4, default 1
  volume?: number; // 0-1, default 1
  responsiveness?: number; // 0-1, default 1
  interruption_sensitivity?: number; // 0-1, default 1
  enable_backchannel?: boolean;
  backchannel_frequency?: number; // 0-1, default 0.8

  // Call Settings
  language?: string; // e.g., "en-US", "es-ES"
  ambient_sound?: string; // "none", "coffee_shop", "office", etc.
  ambient_sound_volume?: number; // 0-1, default 0.5
  reminder_trigger_ms?: number; // Default 10000
  reminder_max_count?: number; // Default 2
  end_call_after_silence_ms?: number; // Default 600000 (10 minutes)
  max_call_duration_ms?: number; // Default 3600000 (1 hour)

  // Advanced Settings
  enable_transcription?: boolean;
  enable_recording?: boolean;
  webhook_url?: string;
  metadata?: Record<string, any>;

  unavailability_settings?: {
    enabled: boolean;
    timezone: string;
    unavailable_start_time: string;
    unavailable_end_time: string;
    unavailable_days?: string[];
  };
}

export interface Bot {
  id: string;
  user_id: string;
  name: string;
  retell_agent_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  retell_llm_id: string | null;
  voice_id: string | null;
  modal: string | null;
  general_prompt: string | null;
  begin_messgae: string | null; // Note: typo from your schema
  agent_number: string | null; // Incoming phone number
  Transfer_to: string | null; // Transfer destination
  // Legacy fields for backward compatibility
  description?: string | null;
  voice_settings?: Record<string, any>;
  bot_config?: BotConfig;
}

export interface Call {
  id: string;
  user_id: string;
  bot_id: string | null;
  phone_number: string;
  contact_name: string | null;
  status: string | null;
  duration_seconds: number | null;
  transcript: string | null;
  recording_url: string | null;
  metadata: Record<string, any>;
  webhook_response?: Record<string, any> | null;
  created_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  Lead_status?: string | null; // "Yes" or "No"
  // New analysis fields
  call_type?: string | null;
  analyzed?: boolean;
  analysis?: Record<string, any> | null;
  call_outcome?: string | null;
  sentiment?: string | null;
  urgency_level?: string | null;
  confidence_score?: number | null;
  intent_summary?: string | null;
  call_summary?: string | null;
  is_lead?: boolean;
  lead_strength?: string | null;
  extracted_customer_data?: Record<string, any> | null;
  updated_at?: string | null;
  Scheduled_at?: string | null; // Scheduled call time
  is_test_call?: boolean; // Indicates if this is a test call
}

export interface Profile {
  id: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  timezone: string;
  retell_api_key: string | null;
  created_at: string;
  updated_at: string;
  total_minutes_used: number | null;
  Total_credit: number | null;
  is_deactivated: boolean | null;
  deactivated_at: string | null;
  last_activity_at: string | null;
  Remaning_credits: number | null;
  // KYC fields
  kyc_status?: "pending" | "verified" | "rejected" | null;
  passport_url?: string | null;
  id_document_url?: string | null;
  kyc_other_documents?: string[] | null;
  kyc_submitted_at?: string | null;
  kyc_verified_at?: string | null;
  // 2FA fields
  two_factor_enabled?: boolean | null;
  two_factor_secret?: string | null;
  two_factor_backup_codes?: string[] | null;
  // Phone verification
  phone_number?: string | null;
  phone_verified?: boolean | null;
  phone_verification_code?: string | null;
  phone_verification_sent_at?: string | null;
  // Company information
  company_name?: string | null;
  company_address?: string | null;
  position?: string | null;
  contact_info?: string | null;
  // Payment and trial
  payment_status?: string | null;
  trial_credits_expires_at?: string | null;
}

export interface PageLead {
  id: string;
  user_id: string;
  name: string | null;
  email: string | null;
  phone_number: string | null;
  address: string | null;
  bot_name: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
  call_id?: string | null;
  // New categorization fields
  call_type?: string | null;
  lead_strength?: string | null;
  intent_summary?: string | null;
  call_summary?: string | null;
  call_outcome?: string | null;
  next_step_type?: string | null;
  next_step_details?: string | null;
  appointment_date?: string | null;
  appointment_time?: string | null;
  appointment_timezone?: string | null;
  appointment_type?: string | null;
  order_items?: any[] | null;
  order_total?: string | null;
  order_type?: string | null;
  payment_method?: string | null;
  support_issue?: string | null;
  resolution_provided?: boolean | null;
  sentiment?: string | null;
  urgency_level?: string | null;
  confidence_score?: number | null;
  transcript?: string | null;
  extracted_data?: Record<string, any> | null;
  is_lead?: boolean | null;
  source?: string | null;
  last_call_at?: string | null;
}

export interface Wallet {
  id: string;
  user_id: string;
  balance: number;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  user_id: string; // Changed from wallet_id to user_id since wallet table was removed
  wallet_id?: string; // Optional for backward compatibility
  amount: number;
  type: TransactionType;
  description: string | null;
  reference_id: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

export interface CreditUsageLog {
  id: string;
  user_id: string;
  transaction_id: string | null;
  call_id: string | null;
  usage_type: UsageType;
  amount_used: number;
  duration_seconds: number | null;
  rate_per_minute: number | null;
  cost_breakdown: Record<string, any>;
  balance_before: number | null;
  balance_after: number | null;
  created_at: string;
}

export interface EmailTemplate {
  id: string;
  user_id: string;
  name: string;
  subject: string;
  body: string;
  description: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface EmailSentLog {
  id: string;
  user_id: string;
  from_email: string;
  to_email: string;
  to_phone_number: string | null;
  subject: string;
  body: string;
  call_id: string | null;
  status: "pending" | "sent" | "failed" | "bounced" | null;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface EmailAutomationRule {
  id: string;
  user_id: string;
  name: string;
  trigger_type: "lead_created" | "call_ended" | "call_completed" | "no_response" | "high_quality_lead";
  conditions: Record<string, any>;
  template_id: string | null;
  delay_minutes: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CallAnalytics {
  id: string;
  call_id: string;
  user_id: string;
  sentiment: "positive" | "neutral" | "negative" | null;
  is_lead: boolean;
  lead_quality_score: number | null; // 1-10
  conversation_topics: string[] | null;
  user_intent: string | null;
  agent_performance_score: number | null; // 1-10
  voicemail_detected: boolean;
  transfer_occurred: boolean;
  key_phrases: Record<string, any>;
  call_outcome: string | null;
  ai_analysis_data: Record<string, any>;
  created_at: string;
}

export interface AIPrompt {
  id: string;
  user_id: string;
  name: string;
  category: string;
  system_prompt: string;
  begin_message: string | null;
  state_prompts: Record<string, any>;
  tools_config: Record<string, any>;
  is_active: boolean;
  is_template: boolean;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export interface ActivityLog {
  id: string;
  user_id: string;
  activity_type: ActivityType;
  entity_type: string | null;
  entity_id: string | null;
  description: string;
  metadata: Record<string, any>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  metadata: Record<string, any>;
  created_at: string;
  read_at: string | null;
}

export interface ImportedPhoneNumber {
  id: string;
  user_id: string;
  phone_number: string;
  termination_uri: string | null;
  status: "active" | "inactive" | "pending";
  imported_at: string;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeBase {
  id: string;
  user_id: string;
  knowledge_base_id: string | null;
  knowledge_base_name: string;
  status: string;
  knowledge_base_texts: Record<string, any>;
  knowledge_base_urls: string[] | null;
  enable_auto_refresh: boolean;
  created_at: string;
}

export interface UserEmail {
  id: string;
  user_id: string;
  email: string;
  name: string | null;
  is_primary: boolean;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}
