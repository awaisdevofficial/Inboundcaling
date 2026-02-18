import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Bot, BotConfig } from "@/types/database";
import { useAuth } from "./useAuth";
import { toast } from "./use-toast";
import { formatWebhookResponse } from "@/lib/utils";
import { callWebhook, validateWebhookResponse } from "@/lib/webhook";

export function useBots() {
  const { user } = useAuth();
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBots = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      // Check if we have a valid session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        throw new Error("Authentication session expired. Please sign in again.");
      }

      const { data, error } = await supabase
        .from("bots")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        // Provide more helpful error messages for common issues
        if (error.code === "PGRST301" || error.message?.includes("permission denied") || error.message?.includes("403")) {
          throw new Error("Permission denied. Please check your Row Level Security (RLS) policies in Supabase. The bots table may need RLS policies to allow users to read their own bots.");
        }
        throw error;
      }

      const mappedBots: Bot[] = (data || []).map((bot: any) => {
        const botConfig = (bot.bot_config as BotConfig) || {};
        
        // Read from direct columns first (per schema), then fallback to bot_config
        const retellLlmId = bot.retell_llm_id ?? botConfig.llm_id ?? (botConfig as any).retell_llm_id ?? null;
        const model = bot.modal ?? bot.model ?? botConfig.model ?? null; // Handle typo: modal -> model
        const generalPrompt = bot.general_prompt ?? botConfig.general_prompt ?? null;
        // Handle typo: begin_messgae -> begin_message
        const beginMessageDirect = bot.begin_messgae ?? bot.begin_message ?? null;
        const beginMessageConfig = botConfig.begin_message ?? null;
        const beginMessage = beginMessageDirect ?? beginMessageConfig ?? null;
        
        // Read from direct column first, then fallback to bot_config
        const isInbound = (bot as any).is_inbound ?? (botConfig as any).is_inbound ?? null;
        
        return {
          id: bot.id,
          user_id: bot.user_id,
          name: bot.name,
          retell_agent_id: bot.retell_agent_id,
          is_active: bot.is_active,
          created_at: bot.created_at,
          updated_at: bot.updated_at,
          retell_llm_id: retellLlmId,
          voice_id: botConfig.voice_id ?? null,
          model: model,
          general_prompt: generalPrompt,
          begin_message: beginMessage,
          max_call_duration_ms: botConfig.max_call_duration_ms ?? null,
          Speaking_plan: (botConfig as any).Speaking_plan ?? null,
          is_inbound: isInbound,
          transfer_call_to: (botConfig as any).transfer_call_to || null,
          Agent_role: (bot as any).Agent_role || (isInbound ? "Inbound" : null) || null,
          // Legacy fields for backward compatibility
          description: bot.description,
          voice_settings: (bot.voice_settings as Record<string, unknown>) || {},
          bot_config: botConfig,
        };
      });

      setBots(mappedBots);
      setError(null); // Clear any previous errors on success
    } catch (error: any) {
      // Removed console.error for security
      
      // Extract more detailed error information
      let errorMessage = error?.message || "Failed to fetch bots";
      
      // Handle 403 Forbidden specifically
      if (error?.code === "PGRST301" || error?.status === 403 || errorMessage?.includes("403") || errorMessage?.includes("permission denied")) {
        errorMessage = "Access denied (403). Row Level Security (RLS) policies need to be configured in Supabase. See RLS_POLICY_SETUP.md for instructions.";
        setError(errorMessage);
      }
      
      // Removed console.error for security - prevents sensitive data exposure
      // Error details are handled via error state and user notifications
      
      // Only show toast if it's a new error (not a retry)
      if (!error || error?.status !== 403) {
        toast({
          title: "Error Fetching Bots",
          description: errorMessage,
          variant: "destructive",
          duration: 10000, // Show longer for important errors
        });
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchBots();
  }, [fetchBots]);

  const createBot = async (botData: {
    name: string;
    retell_llm_id?: string | null;
    voice_id?: string | null;
    model?: string | null;
    general_prompt?: string | null;
    begin_message?: string | string[] | null; // Support both string and array
    max_call_duration_ms?: number | null;
    Speaking_plan?: string | null;
    is_inbound?: boolean | null;
    transfer_call_to?: string | null;
    incoming_number?: string | null;
    knowledge_base_id?: string | null;
    unavailability_settings?: {
      enabled: boolean;
      timezone: string;
      unavailable_start_time: string;
      unavailable_end_time: string;
    } | null;
    unavailability_prompt?: string | null;
    // Legacy support
    description?: string;
    bot_config?: BotConfig;
  }) => {
    if (!user) return null;

    try {
      // Send directly to webhook - no Supabase edge function
      const isInbound = true; // Always inbound for inbound-only system
      // Handle begin_message: for inbound, use first message as string
      const beginMessage = botData.begin_message
        ? (Array.isArray(botData.begin_message)
            ? botData.begin_message[0] || "Hello! How can I assist you today?"
            : botData.begin_message)
        : "Hello! How can I assist you today?";
      
      const webhookPayload = {
        action: isInbound ? "create inbound agent" : "create",
        name: botData.name,
        retell_llm_id: botData.retell_llm_id,
        voice_id: botData.voice_id,
        model: botData.model || "gpt-4.1",
        general_prompt: botData.general_prompt,
        begin_message: beginMessage,
        max_call_duration_ms: botData.max_call_duration_ms || 3600000,
        Speaking_plan: botData.Speaking_plan,
        is_inbound: isInbound,
        transfer_call_to: botData.transfer_call_to || null,
        incoming_number: botData.incoming_number || null,
        knowledge_base_id: botData.knowledge_base_id || null,
        unavailability_settings: botData.unavailability_settings ?? null, // Explicitly null if not set
        unavailability_prompt: botData.unavailability_prompt ?? null, // Separate prompt field
        description: botData.description,
        bot_config: botData.bot_config,
        user_id: user.id,
        user_email: user.email,
        timestamp: new Date().toISOString(),
      };

      // Call webhook with improved error handling
      const webhookResult = await callWebhook(webhookPayload, {
        timeout: 30000,
        useSupabaseProxy: false,
      });

      if (!webhookResult.success) {
        throw new Error(webhookResult.error || "Webhook request failed");
      }

      const webhookResponse = webhookResult.data || webhookResult;

      // For inbound agents, handle incoming number assignment
      if (isInbound) {
        const defaultIncomingNumber = "+17655227839";
        
        // If webhook response contains incoming numbers, use them
        // Otherwise, use the default number
        const incomingNumbers = webhookResponse.incoming_numbers
          ? (Array.isArray(webhookResponse.incoming_numbers)
              ? webhookResponse.incoming_numbers
              : [])
          : [defaultIncomingNumber];

        // If there are multiple numbers, show selection dialog
        if (incomingNumbers.length > 1) {
          return {
            ...webhookResponse,
            requiresNumberSelection: true,
            incoming_numbers: incomingNumbers,
          };
        } else {
          // Automatically assign the single/default number
          const botId = webhookResponse.bot_id || webhookResponse.id || webhookResponse.agent_id;
          const numberToAssign = incomingNumbers[0] || defaultIncomingNumber;
          
          // Show success message with number assignment info
          const formattedResponse = formatWebhookResponse(webhookResponse);
          toast({
            title: "Inbound Agent Created Successfully",
            description: `Agent created. Assigning incoming number ${numberToAssign}...`,
          });
          
          // Refresh bots list after webhook processes
          await fetchBots();
          
          // Automatically assign the number immediately
          if (botId) {
            try {
              await assignIncomingNumber(botId, numberToAssign, webhookResponse);
            } catch (error) {
              // Removed console.error for security
              // Don't show error to user as bot was created successfully
            }
          }
          
          // Find the newly created bot's database ID by querying the database
          let databaseBotId: string | null = null;
          try {
            const { data: newBot, error: botError } = await supabase
              .from("bots")
              .select("id")
              .eq("user_id", user.id)
              .eq("name", botData.name)
              .order("created_at", { ascending: false })
              .limit(1)
              .single();
            
            if (!botError && newBot) {
              databaseBotId = newBot.id;
            }
          } catch (error) {
            // If query fails, databaseBotId remains null
          }
          
          return {
            ...webhookResponse,
            database_bot_id: databaseBotId,
          };
        }
      }

      // Show formatted webhook response in toast for non-inbound or if no numbers
      const formattedResponse = formatWebhookResponse(webhookResponse);
      toast({
        title: "Bot Created Successfully",
        description:
          formattedResponse.length > 200
            ? `${formattedResponse.substring(0, 200)}...`
            : formattedResponse,
      });

      // Refresh bots list after webhook processes (webhook handles DB)
      await fetchBots();

      // Find the newly created bot's database ID by querying the database
      let databaseBotId: string | null = null;
      try {
        const { data: newBot, error: botError } = await supabase
          .from("bots")
          .select("id")
          .eq("user_id", user.id)
          .eq("name", botData.name)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();
        
        if (!botError && newBot) {
          databaseBotId = newBot.id;
        }
      } catch (error) {
        // If query fails, databaseBotId remains null
      }

      return {
        ...webhookResponse,
        database_bot_id: databaseBotId,
      };
    } catch (error) {
      // Removed console.error for security
      const errorMessage =
        error instanceof Error ? error.message : "Failed to create bot";

      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
      return null;
    }
  };

  const updateBot = async (
    id: string,
    updates: {
      name?: string;
      retell_llm_id?: string | null;
      voice_id?: string | null;
      model?: string | null;
      general_prompt?: string | null;
      begin_message?: string | string[] | null; // Support both string and array
      max_call_duration_ms?: number | null;
      Speaking_plan?: string | null;
      is_active?: boolean;
      is_inbound?: boolean | null;
      transfer_call_to?: string | null;
      incoming_number?: string | null;
      knowledge_base_id?: string | null;
      unavailability_settings?: {
        enabled: boolean;
        timezone: string;
        unavailable_start_time: string;
        unavailable_end_time: string;
      } | null;
      unavailability_prompt?: string | null;
      // Legacy support
      description?: string | null;
      bot_config?: BotConfig;
    },
  ) => {
    if (!user) return;

    try {
      // Fetch fresh bot data to ensure we have the latest values
      const freshBot = await fetchBot(id);
      if (!freshBot) throw new Error("Bot not found");

      // Send directly to webhook - no Supabase edge function
      // Use provided updates or fall back to current bot values
      // Handle begin_message: for inbound, use first message as string
      const isInbound = true; // Always inbound for inbound-only system
      
      const beginMessageValue = updates.begin_message !== undefined
        ? updates.begin_message
        : freshBot.begin_message;
      
      const beginMessage = beginMessageValue
        ? (Array.isArray(beginMessageValue)
            ? (isInbound ? beginMessageValue[0] || null : beginMessageValue)
            : beginMessageValue)
        : null;
      
      const webhookPayload = {
        action: "update",
        bot_id: id,
        name: updates.name ?? freshBot.name,
        retell_llm_id:
          updates.retell_llm_id !== undefined
            ? updates.retell_llm_id
            : freshBot.retell_llm_id,
        voice_id:
          updates.voice_id !== undefined ? updates.voice_id : freshBot.voice_id,
        model: updates.model !== undefined ? updates.model : freshBot.model,
        general_prompt:
          updates.general_prompt !== undefined
            ? updates.general_prompt
            : freshBot.general_prompt,
        begin_message: beginMessage,
        max_call_duration_ms:
          updates.max_call_duration_ms !== undefined
            ? updates.max_call_duration_ms
            : freshBot.max_call_duration_ms,
        Speaking_plan:
          updates.Speaking_plan !== undefined
            ? updates.Speaking_plan
            : freshBot.Speaking_plan,
        is_inbound: isInbound,
        transfer_call_to:
          updates.transfer_call_to !== undefined
            ? updates.transfer_call_to
            : freshBot.transfer_call_to || null,
        incoming_number:
          updates.incoming_number !== undefined
            ? updates.incoming_number
            : null,
        knowledge_base_id:
          updates.knowledge_base_id !== undefined
            ? updates.knowledge_base_id
            : (freshBot.bot_config as any)?.knowledge_base_id || null,
        unavailability_settings:
          updates.unavailability_settings !== undefined
            ? updates.unavailability_settings
            : (freshBot.bot_config as any)?.unavailability_settings ?? null, // Explicitly null if not set
        unavailability_prompt:
          updates.unavailability_prompt !== undefined
            ? updates.unavailability_prompt
            : (freshBot.bot_config as any)?.unavailability_prompt ?? null, // Separate prompt field
        retell_agent_id: freshBot.retell_agent_id,
        is_active:
          updates.is_active !== undefined
            ? updates.is_active
            : freshBot.is_active,
        description:
          updates.description !== undefined
            ? updates.description
            : freshBot.description,
        bot_config: updates.bot_config || freshBot.bot_config,
        voice_settings: freshBot.voice_settings,
        user_id: user.id,
        user_email: user.email,
        timestamp: new Date().toISOString(),
      };

      // Call webhook with improved error handling
      const webhookResult = await callWebhook(webhookPayload, {
        timeout: 30000,
        useSupabaseProxy: false,
      });

      if (!webhookResult.success) {
        throw new Error(webhookResult.error || "Webhook request failed");
      }

      const webhookResponse = webhookResult.data || webhookResult;

      // Show formatted webhook response in toast
      const formattedResponse = formatWebhookResponse(webhookResponse);
      toast({
        title: "Bot Updated Successfully",
        description:
          formattedResponse.length > 200
            ? `${formattedResponse.substring(0, 200)}...`
            : formattedResponse,
      });

      // Refresh bots list after webhook processes (webhook handles DB)
      await fetchBots();
    } catch (error) {
      // Removed console.error for security
      const errorMessage =
        error instanceof Error ? error.message : "Failed to update bot";

      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const deleteBot = async (id: string) => {
    if (!user) return;

    try {
      const botToDelete = bots.find((b) => b.id === id);

      // Send directly to webhook - no Supabase edge function
      const webhookPayload = {
        action: "delete",
        bot_id: id,
        name: botToDelete?.name || "",
        description: botToDelete?.description || null,
        bot_config: botToDelete?.bot_config || {},
        retell_agent_id: botToDelete?.retell_agent_id || "",
        is_active: botToDelete?.is_active ?? true,
        voice_settings: botToDelete?.voice_settings || {},
        user_id: user.id,
        user_email: user.email,
        timestamp: new Date().toISOString(),
      };

      // Call webhook with improved error handling
      const webhookResult = await callWebhook(webhookPayload, {
        timeout: 30000,
        useSupabaseProxy: false,
      });

      if (!webhookResult.success) {
        throw new Error(webhookResult.error || "Webhook request failed");
      }

      const webhookResponse = webhookResult.data || webhookResult;

      // Show formatted webhook response in toast
      const formattedResponse = formatWebhookResponse(webhookResponse);
      toast({
        title: "Bot Deleted Successfully",
        description:
          formattedResponse.length > 200
            ? `${formattedResponse.substring(0, 200)}...`
            : formattedResponse,
      });

      // Refresh bots list after webhook processes (webhook handles DB)
      await fetchBots();
    } catch (error) {
      // Removed console.error for security
      const errorMessage =
        error instanceof Error ? error.message : "Failed to delete bot";

      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const fetchBot = useCallback(
    async (id: string): Promise<Bot | null> => {
      if (!user) return null;

      try {
        // Check if we have a valid session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session) {
          throw new Error("Authentication session expired. Please sign in again.");
        }

        const { data, error } = await supabase
          .from("bots")
          .select("*")
          .eq("id", id)
          .eq("user_id", user.id)
          .single();

        if (error) {
          // Provide more helpful error messages for common issues
          if (error.code === "PGRST301" || error.message?.includes("permission denied") || error.message?.includes("403")) {
            throw new Error("Permission denied. Please check your Row Level Security (RLS) policies in Supabase.");
          }
          throw error;
        }

        if (!data) return null;

        const botConfig = (data.bot_config as BotConfig) || {};
        
        // Read from direct columns first (per schema), then fallback to bot_config
        const retellLlmId = (data as any).retell_llm_id ?? botConfig.llm_id ?? (botConfig as any).retell_llm_id ?? null;
        const model = (data as any).modal ?? (data as any).model ?? botConfig.model ?? null; // Handle typo: modal -> model
        const generalPrompt = (data as any).general_prompt ?? botConfig.general_prompt ?? null;
        // Handle typo: begin_messgae -> begin_message
        const beginMessageDirect = (data as any).begin_messgae ?? (data as any).begin_message ?? null;
        const beginMessageConfig = botConfig.begin_message ?? null;
        const beginMessage = beginMessageDirect ?? beginMessageConfig ?? null;
        
        const isInbound = (botConfig as any).is_inbound ?? null;
        
        const mappedBot: Bot = {
          id: data.id,
          user_id: data.user_id,
          name: data.name,
          retell_agent_id: data.retell_agent_id,
          is_active: data.is_active,
          created_at: data.created_at,
          updated_at: data.updated_at,
          retell_llm_id: retellLlmId,
          voice_id: botConfig.voice_id ?? null,
          model: model,
          general_prompt: generalPrompt,
          begin_message: beginMessage,
          max_call_duration_ms: botConfig.max_call_duration_ms ?? null,
          Speaking_plan: (botConfig as any).Speaking_plan ?? null,
          is_inbound: isInbound,
          transfer_call_to: (botConfig as any).transfer_call_to || null,
          Agent_role: (data as any).Agent_role || (isInbound ? "Inbound" : null) || null,
          // Legacy fields for backward compatibility
          description: data.description,
          voice_settings:
            (data.voice_settings as Record<string, unknown>) || {},
          bot_config: botConfig,
        };

        return mappedBot;
      } catch (error: any) {
        // Removed console.error for security
        const errorMessage = error?.message || "Failed to fetch bot data";
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
        return null;
      }
    },
    [user],
  );

  const assignIncomingNumber = async (
    botId: string,
    incomingNumber: string,
    originalWebhookResponse?: any,
  ) => {
    if (!user) return null;

    try {
      // Fetch fresh bot data - retry if not found (for auto-assignment)
      let freshBot = await fetchBot(botId);
      if (!freshBot) {
        // If bot not found yet, retry immediately (for auto-assignment during creation)
        freshBot = await fetchBot(botId);
        if (!freshBot) throw new Error("Bot not found");
      }

      // Send to webhook to assign the incoming number with full context
      const webhookPayload = {
        action: "assign_incoming_number",
        bot_id: botId,
        incoming_number: incomingNumber,
        retell_agent_id: freshBot.retell_agent_id,
        name: freshBot.name,
        is_inbound: freshBot.is_inbound ?? true,
        transfer_call_to: freshBot.transfer_call_to || null,
        voice_id: freshBot.voice_id,
        model: freshBot.model,
        general_prompt: freshBot.general_prompt,
        begin_message: freshBot.begin_message,
        user_id: user.id,
        user_email: user.email,
        timestamp: new Date().toISOString(),
        // Include original webhook response data if available
        original_response: originalWebhookResponse || null,
      };

      // Call webhook with improved error handling
      const webhookResult = await callWebhook(webhookPayload, {
        timeout: 30000,
        useSupabaseProxy: false,
      });

      if (!webhookResult.success) {
        throw new Error(webhookResult.error || "Webhook request failed");
      }

      const webhookResponse = webhookResult.data || webhookResult;

      // Show success message (only if called from UI, not auto-assignment)
      if (originalWebhookResponse) {
        toast({
          title: "Number Assigned Successfully",
          description: `Incoming number ${incomingNumber} has been assigned to ${freshBot.name}`,
        });
      }

      // Refresh bots list
      await fetchBots();

      return webhookResponse;
    } catch (error) {
      // Removed console.error for security
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to assign incoming number";

      // Only show error if called from UI
      if (originalWebhookResponse) {
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
      }
      return null;
    }
  };

  const importPhoneNumber = async (
    phoneNumber: string,
    terminationUri: string,
  ) => {
    if (!user) return null;

    try {
      const webhookPayload = {
        action: "import_phone_number",
        phone_number: phoneNumber,
        termination_uri: terminationUri,
        user_id: user.id,
        user_email: user.email,
        timestamp: new Date().toISOString(),
      };

      // Call webhook with improved error handling
      const webhookResult = await callWebhook(webhookPayload, {
        timeout: 30000,
        useSupabaseProxy: false,
      });

      if (!webhookResult.success) {
        throw new Error(webhookResult.error || "Webhook request failed");
      }

      const webhookResponse: any = webhookResult.data || webhookResult;

      // Verify the response indicates successful import
      const isSuccess = 
        webhookResponse.success === true ||
        webhookResponse.status === "success" ||
        webhookResponse.imported === true ||
        (webhookResponse.phone_number && webhookResponse.phone_number === phoneNumber) ||
        (webhookResponse.id || webhookResponse.phone_number_id);

      if (!isSuccess) {
        const errorMessage = 
          webhookResponse.error || 
          webhookResponse.message || 
          "Import verification failed - server did not confirm success";
        throw new Error(errorMessage);
      }

      return {
        success: true,
        ...webhookResponse,
        phone_number: phoneNumber,
        termination_uri: terminationUri,
      };
    } catch (error) {
      // Removed console.error for security
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to import phone number";

      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
      return null;
    }
  };

  return {
    bots,
    loading,
    error,
    createBot,
    updateBot,
    deleteBot,
    fetchBot,
    assignIncomingNumber,
    importPhoneNumber,
    refetch: fetchBots,
  };
}
