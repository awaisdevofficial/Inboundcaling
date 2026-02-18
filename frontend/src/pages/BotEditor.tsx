import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Settings, LayoutList, Plus, X, Loader2, Save, Activity, FileText, Phone, Clock, BookOpen, User, Mic, AlertCircle, Zap, Sparkles, Eye, CheckCircle, XCircle, PhoneCall, Link2, Unlink, Bot } from "lucide-react";
import { VoiceSelector } from "@/components/voices/VoiceSelector";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { FeatureGate } from "@/components/FeatureGate";
import { useBots } from "@/hooks/useBots";
import { useAuth } from "@/hooks/useAuth";
import { useAIPrompts } from "@/hooks/useAIPrompts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { TimezoneSelector } from "@/components/TimezoneSelector";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TranscriptDisplay } from "@/components/transcript/TranscriptDisplay";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow, format } from "date-fns";
import type { Bot, Call, CallStatus } from "@/types/database";

// Voice interface matching database schema
interface Voice {
  id: number;
  voice_id: string;
  voice_type: string | null;
  standard_voice_type: string | null;
  voice_name: string | null;
  provider: string | null;
  accent: string | null;
  gender: string | null;
  age: string | null;
  avatar_url: string | null;
  preview_audio_url: string | null;
  s2s_model: string | null;
}

const DAYS_OF_WEEK = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"
];

interface KnowledgeBase {
  id: string;
  knowledge_base_id: string;
  knowledge_base_name: string;
  status: string;
}

export default function BotEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { fetchBot, createBot, updateBot, refetch: refetchBots } = useBots();
  const { user } = useAuth();
  const { getUserPrompts } = useAIPrompts();
  
  const isCreateMode = !id || id === "create";
  
  // Quick prompt selection
  const [showPromptSelector, setShowPromptSelector] = useState(false);
  const userPrompts = getUserPrompts();
  
  // Close prompt selector when clicking outside
  useEffect(() => {
    if (showPromptSelector) {
      const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        if (!target.closest('.prompt-selector-container')) {
          setShowPromptSelector(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showPromptSelector]);
  
  const [bot, setBot] = useState<Bot | null>(null);
  const [loading, setLoading] = useState(!isCreateMode);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("edit");
  const [editSection, setEditSection] = useState("details");
  const [calls, setCalls] = useState<Call[]>([]);
  const [callsLoading, setCallsLoading] = useState(false);
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [callDetailsOpen, setCallDetailsOpen] = useState(false);

  // Dynamic Data State
  const [dbImportedNumbers, setDbImportedNumbers] = useState<string[]>([]);
  const [loadingImportedNumbers, setLoadingImportedNumbers] = useState(false);
  const [phoneNumbersWithAgents, setPhoneNumbersWithAgents] = useState<Array<{
    phone_number: string;
    id: string;
    linked_agent?: {
      id: string;
      name: string;
    } | null;
  }>>([]);
  const [linkingNumberId, setLinkingNumberId] = useState<string | null>(null);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [loadingKnowledgeBases, setLoadingKnowledgeBases] = useState(false);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);

  // Form State - Strictly matches modal fields
  const [formData, setFormData] = useState({
    name: "",
    incoming_number: "",
    transfer_call_to: "",
    knowledge_base_id: "",
    
    voice_id: "",
    begin_message: "Hello! How can I assist you today?",
    general_prompt: "",
    
    // Availability
    availability_enabled: false,
    availability_timezone: "America/New_York",
    unavailable_start_time: "20:00",
    unavailable_end_time: "08:00",
    unavailable_days: [] as string[],
  });

  // Fetch Imported Numbers with linked agent information
  useEffect(() => {
    const fetchImportedNumbers = async () => {
      if (!user) {
        setDbImportedNumbers([]);
        setPhoneNumbersWithAgents([]);
        return;
      }

      setLoadingImportedNumbers(true);
      try {
        // Fetch phone numbers
        const { data: phoneNumbersData, error: phoneError } = await supabase
          .from("imported_phone_numbers")
          .select("id, phone_number")
          .eq("user_id", user.id)
          .eq("status", "active")
          .order("created_at", { ascending: false });

        if (phoneError) throw phoneError;

        const phoneNumbers = (phoneNumbersData || []).map((item: any) => item.phone_number);
        setDbImportedNumbers(phoneNumbers);

        // Fetch bots to find which ones are linked to these phone numbers
        const { data: botsData, error: botsError } = await supabase
          .from("bots")
          .select("id, name, agent_number")
          .eq("user_id", user.id);

        if (botsError) throw botsError;

        // Create a map of phone_number -> bot
        const phoneToBotMap: Record<string, { id: string; name: string }> = {};
        (botsData || []).forEach((bot: any) => {
          if (bot.agent_number) {
            phoneToBotMap[bot.agent_number] = {
              id: bot.id,
              name: bot.name,
            };
          }
        });

        // Map phone numbers with their linked agents
        const numbersWithAgents = (phoneNumbersData || []).map((item: any) => ({
          phone_number: item.phone_number,
          id: item.id,
          linked_agent: phoneToBotMap[item.phone_number] || null,
        }));

        setPhoneNumbersWithAgents(numbersWithAgents);
      } catch (error: any) {
        // Removed console.error for security
      } finally {
        setLoadingImportedNumbers(false);
      }
    };

    fetchImportedNumbers();
  }, [user]);

  // Link/unlink handlers
  const handleLinkAgent = async (phoneNumberId: string, phoneNumber: string, botId: string) => {
    if (!user || !phoneNumberId || !botId) return;

    setLinkingNumberId(phoneNumberId);

    try {
      // Check if this phone number is already linked to another agent
      const { data: existingBots, error: checkError } = await supabase
        .from("bots")
        .select("id, name, agent_number")
        .eq("agent_number", phoneNumber)
        .neq("id", botId);

      if (checkError) throw checkError;

      if (existingBots && existingBots.length > 0) {
        toast.error("This phone number is already linked to another agent. Please unlink it first.");
        setLinkingNumberId(null);
        return;
      }

      // Check if the selected bot already has a different phone number
      const { data: selectedBot, error: botError } = await supabase
        .from("bots")
        .select("id, agent_number")
        .eq("id", botId)
        .single();

      if (botError) throw botError;

      if (selectedBot.agent_number && selectedBot.agent_number !== phoneNumber) {
        toast.error("This agent is already linked to a different phone number. Please unlink it first.");
        setLinkingNumberId(null);
        return;
      }

      // Link the phone number to the agent
      const { error: updateError } = await supabase
        .from("bots")
        .update({ agent_number: phoneNumber })
        .eq("id", botId)
        .eq("user_id", user.id);

      if (updateError) throw updateError;

      // Refresh bots and phone numbers
      await refetchBots();
      
      // Refresh phone numbers list
      const { data: phoneNumbersData } = await supabase
        .from("imported_phone_numbers")
        .select("id, phone_number")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false });

      const { data: botsData } = await supabase
        .from("bots")
        .select("id, name, agent_number")
        .eq("user_id", user.id);

      const phoneToBotMap: Record<string, { id: string; name: string }> = {};
      (botsData || []).forEach((bot: any) => {
        if (bot.agent_number) {
          phoneToBotMap[bot.agent_number] = {
            id: bot.id,
            name: bot.name,
          };
        }
      });

      const numbersWithAgents = (phoneNumbersData || []).map((item: any) => ({
        phone_number: item.phone_number,
        id: item.id,
        linked_agent: phoneToBotMap[item.phone_number] || null,
      }));

      setPhoneNumbersWithAgents(numbersWithAgents);

      toast.success("Phone number linked to agent successfully");
    } catch (error: any) {
      toast.error(error?.message || "Failed to link phone number to agent");
    } finally {
      setLinkingNumberId(null);
    }
  };

  const handleUnlinkAgent = async (phoneNumberId: string, botId: string) => {
    if (!user || !phoneNumberId || !botId) return;

    try {
      // Unlink the phone number from the agent
      const { error: updateError } = await supabase
        .from("bots")
        .update({ agent_number: null })
        .eq("id", botId)
        .eq("user_id", user.id);

      if (updateError) throw updateError;

      // Refresh bots
      await refetchBots();

      // Refresh phone numbers list
      const { data: phoneNumbersData } = await supabase
        .from("imported_phone_numbers")
        .select("id, phone_number")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false });

      const { data: botsData } = await supabase
        .from("bots")
        .select("id, name, agent_number")
        .eq("user_id", user.id);

      const phoneToBotMap: Record<string, { id: string; name: string }> = {};
      (botsData || []).forEach((bot: any) => {
        if (bot.agent_number) {
          phoneToBotMap[bot.agent_number] = {
            id: bot.id,
            name: bot.name,
          };
        }
      });

      const numbersWithAgents = (phoneNumbersData || []).map((item: any) => ({
        phone_number: item.phone_number,
        id: item.id,
        linked_agent: phoneToBotMap[item.phone_number] || null,
      }));

      setPhoneNumbersWithAgents(numbersWithAgents);

      // Clear the selected incoming number if it was unlinked
      if (formData.incoming_number && !phoneToBotMap[formData.incoming_number]) {
        setFormData({...formData, incoming_number: ""});
      }

      toast.success("Phone number unlinked from agent successfully");
    } catch (error: any) {
      toast.error(error?.message || "Failed to unlink phone number from agent");
    }
  };

  // Fetch Knowledge Bases
  useEffect(() => {
    const fetchKnowledgeBases = async () => {
      if (!user) {
        setKnowledgeBases([]);
        return;
      }

      setLoadingKnowledgeBases(true);
      try {
        const { data, error } = await supabase
          .from("knowledge_bases")
          .select("id, knowledge_base_id, knowledge_base_name, status")
          .eq("user_id", user.id)
          .eq("status", "complete")
          .order("created_at", { ascending: false });

        if (error) throw error;
        setKnowledgeBases((data || []) as KnowledgeBase[]);
      } catch (error: any) {
        // Removed console.error for security
      } finally {
        setLoadingKnowledgeBases(false);
      }
    };

    fetchKnowledgeBases();
  }, [user]);

  // Fetch voices from database
  useEffect(() => {
    const fetchVoices = async () => {
      setLoadingVoices(true);
      try {
        const { data, error } = await supabase
          .from("voices" as any)
          .select("*")
          .order("voice_name", { ascending: true });

        if (error) throw error;

        const voicesData = (data || []) as unknown as Voice[];
        setVoices(voicesData);
        
        // Set default voice_id if not set and voices are available (only in create mode)
        if (voicesData.length > 0 && isCreateMode && !formData.voice_id) {
          setFormData(prev => ({ ...prev, voice_id: voicesData[0].voice_id }));
        }
      } catch (error: any) {
        // Removed console.error for security
        setVoices([]);
      } finally {
        setLoadingVoices(false);
      }
    };

    fetchVoices();
  }, [isCreateMode]);


  // Load Bot Data
  useEffect(() => {
    if (!isCreateMode && id) {
      loadBot(id);
    }
  }, [id, isCreateMode]);

  // Fetch calls for this bot
  useEffect(() => {
    const fetchBotCalls = async () => {
      if (!bot || !user || isCreateMode) {
        setCalls([]);
        return;
      }

      setCallsLoading(true);
      try {
        const { data, error } = await supabase
          .from("calls")
          .select("*")
          .eq("user_id", user.id)
          .eq("bot_id", bot.id)
          .order("started_at", { ascending: false, nullsFirst: false })
          .limit(100);

        if (error) throw error;
        setCalls((data as unknown as Call[]) || []);
      } catch (error: any) {
        console.error("Error fetching calls:", error);
        setCalls([]);
      } finally {
        setCallsLoading(false);
      }
    };

    if (activeTab === "logs") {
      fetchBotCalls();
    }
  }, [bot, user, activeTab, isCreateMode]);

  const statusConfig: Record<
    CallStatus,
    {
      icon: typeof Phone;
      label: string;
      variant: "default" | "secondary" | "destructive" | "outline";
    }
  > = {
    pending: { icon: Clock, label: "Pending", variant: "outline" },
    in_progress: { icon: PhoneCall, label: "In Progress", variant: "secondary" },
    completed: { icon: CheckCircle, label: "Completed", variant: "default" },
    failed: { icon: XCircle, label: "Failed", variant: "destructive" },
    not_connected: { icon: XCircle, label: "Not Connected", variant: "destructive" },
    night_time_dont_call: { icon: Clock, label: "Night Time", variant: "outline" },
  };

  // Helper function to check availability instructions in prompt
  const hasAvailabilityInstructions = (prompt: string) => {
    return prompt.includes("AGENT AVAILABILITY CHECK") || 
           prompt.includes("current_time_");
  };

  // Helper function to remove availability instructions
  const removeAvailabilityInstructions = (prompt: string) => {
    const instructionsStart = prompt.indexOf("## AGENT AVAILABILITY CHECK");
    if (instructionsStart === -1) return prompt;
    return prompt.substring(0, instructionsStart).trim();
  };

  // Helper function to parse availability settings
  const parseAvailabilityFromPrompt = (prompt: string) => {
    if (!hasAvailabilityInstructions(prompt)) {
      return { enabled: false, timezone: "America/New_York", startTime: "20:00", endTime: "08:00", unavailableDays: [] };
    }

    const timezoneMatch = prompt.match(/current_time_([A-Za-z0-9_/]+)/);
    const timezone = timezoneMatch ? timezoneMatch[1] : "America/New_York";

    // Try to extract unavailable days
    let unavailableDays: string[] = [];
    const daysMatch = prompt.match(/If the current day is ([^()]+) \(in/);
    if (daysMatch) {
        const daysText = daysMatch[1];
        unavailableDays = daysText.split(/,| or /)
            .map(d => d.trim())
            .filter(d => DAYS_OF_WEEK.includes(d));
    }

    const timeMatch = prompt.match(/between (\d{1,2}):(\d{2})\s*(AM|PM) and (\d{1,2}):(\d{2})\s*(AM|PM)/i);
    
    if (timeMatch) {
      const convertTo24Hour = (hour: number, ampm: string) => {
        if (ampm.toUpperCase() === 'PM' && hour !== 12) return hour + 12;
        else if (ampm.toUpperCase() === 'AM' && hour === 12) return 0;
        return hour;
      };
      
      const startHour = convertTo24Hour(parseInt(timeMatch[1]), timeMatch[3]);
      const startMin = timeMatch[2];
      const endHour = convertTo24Hour(parseInt(timeMatch[4]), timeMatch[6]);
      const endMin = timeMatch[5];
      
      return { 
        enabled: true, 
        timezone, 
        startTime: `${startHour.toString().padStart(2, '0')}:${startMin}`, 
        endTime: `${endHour.toString().padStart(2, '0')}:${endMin}`,
        unavailableDays
      };
    }

    return { enabled: true, timezone, startTime: "20:00", endTime: "08:00", unavailableDays };
  };

  const loadBot = async (botId: string) => {
    setLoading(true);
    const data = await fetchBot(botId);
    if (data) {
      setBot(data);
      const config = data.bot_config || {};
      
      // Parse welcome message (single string preferred as per modal)
      // Note: useBots.fetchBot already maps begin_messgae -> begin_message
      let beginMessage = "Hello! How can I assist you today?";
      const botBeginMessage = (data as any).begin_message;
      if (Array.isArray(botBeginMessage)) {
        beginMessage = botBeginMessage[0] || beginMessage;
      } else if (typeof botBeginMessage === 'string') {
        beginMessage = botBeginMessage;
      }

      // Parse Availability
      let availabilitySettings;
      const generalPrompt = data.general_prompt || "";

      if ((config as any)?.unavailability_settings) {
         const s = (config as any).unavailability_settings;
           availabilitySettings = {
             enabled: s.enabled || false,
             timezone: s.timezone || "America/New_York",
             startTime: s.unavailable_start_time || "20:00",
             endTime: s.unavailable_end_time || "08:00",
             unavailableDays: s.unavailable_days || []
           };
      } else {
         availabilitySettings = parseAvailabilityFromPrompt(generalPrompt);
      }

      // Clean prompt
      const basePrompt = hasAvailabilityInstructions(generalPrompt) 
        ? removeAvailabilityInstructions(generalPrompt)
        : generalPrompt;

      setFormData({
        name: data.name,
        incoming_number: (data as any).incoming_number || data.agent_number || "",
        transfer_call_to: data.Transfer_to || (config as any).transfer_call_to || "",
        knowledge_base_id: (config as any).knowledge_base_id || "",
        
        voice_id: data.voice_id || config.voice_id || (voices.length > 0 ? voices[0].voice_id : ""),
        begin_message: beginMessage,
        general_prompt: basePrompt,
        
        availability_enabled: availabilitySettings.enabled,
        availability_timezone: availabilitySettings.timezone,
        unavailable_start_time: availabilitySettings.startTime,
        unavailable_end_time: availabilitySettings.endTime,
        unavailable_days: availabilitySettings.unavailableDays || [],
      });
    }
    setLoading(false);
  };

  // Helper to generate availability text block for prompt
  const getAvailabilityInstructions = () => {
    const timezonePlaceholder = formData.availability_timezone.replace(/\//g, "/");
    const unavailableStart = formData.unavailable_start_time;
    const unavailableEnd = formData.unavailable_end_time;
    const unavailableDays = formData.unavailable_days;
    
    // Format times for display (convert 24h to 12h)
    const formatTimeForDisplay = (time: string) => {
      const [hours, minutes] = time.split(':');
      const hour = parseInt(hours);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
      return `${displayHour}:${minutes} ${ampm}`;
    };

    const unavailableStartDisplay = formatTimeForDisplay(unavailableStart);
    const unavailableEndDisplay = formatTimeForDisplay(unavailableEnd);

    // Unavailable days message
    let unavailableDaysMessage = "";
    if (unavailableDays.length > 0) {
      unavailableDaysMessage = `- If the current day is ${unavailableDays.join(" or ")} (in ${timezonePlaceholder} timezone), you are UNAVAILABLE.`;
    }

    return `## AGENT AVAILABILITY CHECK

IMPORTANT: Before responding to the caller, you MUST check the current time in ${timezonePlaceholder} timezone.

The current time is {{current_time_${timezonePlaceholder}}}.

AVAILABILITY RULES:
${unavailableDaysMessage}
- If the current time is between ${unavailableStartDisplay} and ${unavailableEndDisplay} in ${timezonePlaceholder} timezone, you are UNAVAILABLE.
- During unavailable hours (${unavailableStartDisplay} to ${unavailableEndDisplay}) or unavailable days, you MUST immediately tell the caller: "I'm sorry, but we are currently unavailable. We are not available between ${unavailableStartDisplay} and ${unavailableEndDisplay} ${timezonePlaceholder} time${unavailableDays.length > 0 ? " or on " + unavailableDays.join(", ") : ""}. Please call back outside of these hours. Thank you for your call."
- After delivering the unavailable message, politely end the call.
- During available hours (outside of ${unavailableStartDisplay} to ${unavailableEndDisplay} ${timezonePlaceholder} time${unavailableDays.length > 0 ? " and not on " + unavailableDays.join(", ") : ""}), proceed normally with the conversation.

Always check the time FIRST before engaging in any conversation with the caller.`;
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("Agent name is required");
      return;
    }
    
    if (!formData.transfer_call_to?.trim()) {
      toast.error("Transfer call number is required");
      return;
    }
    
    if (!formData.voice_id) {
      toast.error("Voice selection is required");
      return;
    }
    
    if (!formData.begin_message?.trim()) {
      toast.error("Begin message is required");
      return;
    }
    
    if (!formData.general_prompt?.trim()) {
      toast.error("General prompt is required");
      return;
    }
    
    if (isCreateMode && !formData.incoming_number) {
      toast.error("Incoming number is required");
      return;
    }

    setSaving(true);
    
    try {
      // Prepare prompt with availability if needed (legacy support) or just clean prompt
      // The webhook handles unavailability settings object now, so we can send clean prompt
      // But we should ensure we strip old instructions first if any
      let finalPrompt = formData.general_prompt;
      
      // Calculate unavailability prompt
      const unavailabilityPrompt = formData.availability_enabled 
        ? getAvailabilityInstructions().trim() 
        : null;

      const payload = {
        name: formData.name,
        voice_id: formData.voice_id,
        general_prompt: finalPrompt,
        begin_message: formData.begin_message, // Single string
        
        incoming_number: formData.incoming_number,
        transfer_call_to: formData.transfer_call_to,
        knowledge_base_id: formData.knowledge_base_id || null,
        
        // Detailed availability settings object
        unavailability_settings: formData.availability_enabled ? {
          enabled: true,
          timezone: formData.availability_timezone,
          unavailable_start_time: formData.unavailable_start_time,
          unavailable_end_time: formData.unavailable_end_time,
          unavailable_days: formData.unavailable_days,
        } : null,

        unavailability_prompt: unavailabilityPrompt,

        // Preserve other config
        bot_config: {
          ...(bot?.bot_config || {}),
          knowledge_base_id: formData.knowledge_base_id || null,
        }
      };

      if (isCreateMode) {
        const result: any = await createBot(payload);
        if (result && (result.id || result.bot_id)) {
          toast.success("Agent created successfully");
          const newId = result.id || result.bot_id;
          navigate(`/bots/${newId}`);
        }
      } else if (id) {
        await updateBot(id, payload);
        toast.success("Agent settings updated successfully");
        await loadBot(id);
      }
    } catch (error) {
      // Removed console.error for security
      toast.error("Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[calc(100vh-100px)]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!isCreateMode && !bot) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-[calc(100vh-100px)] gap-4">
          <p className="text-lg text-muted-foreground">Agent not found</p>
          <Button onClick={() => navigate("/bots")}>Back to Agents</Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <ProtectedRoute>
      <DashboardLayout>
        <FeatureGate featureName="agent editor">
          <div className="flex flex-col h-full space-y-6 w-full pb-10">
          
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate("/bots")}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  {isCreateMode ? "Create New Agent" : (formData.name || "Untitled Agent")}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {isCreateMode ? "Setup your new voice assistant" : "Configure your AI agent"}
                </p>
              </div>
            </div>
            <Button 
              onClick={handleSave} 
              disabled={
                saving ||
                !formData.name.trim() ||
                !formData.transfer_call_to?.trim() ||
                !formData.voice_id ||
                !formData.begin_message?.trim() ||
                !formData.general_prompt?.trim() ||
                (isCreateMode && !formData.incoming_number)
              } 
              className="bg-blue-600 hover:bg-blue-700"
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {isCreateMode ? "Create Agent" : "Save Changes"}
            </Button>
          </div>

            {/* Main Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="border-b w-full bg-background/95 backdrop-blur z-10 sticky top-0">
              <TabsList className="w-auto h-12 bg-transparent p-0 justify-start gap-2">
                <TabsTrigger value="edit" className="h-full px-6 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">Edit</TabsTrigger>
                {!isCreateMode && (
                  <TabsTrigger value="logs" className="h-full px-6 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">Logs</TabsTrigger>
                )}
              </TabsList>
            </div>

            {/* Edit Tab */}
            <TabsContent value="edit" className="mt-6">
              <div className="grid grid-cols-12 gap-6 items-start">
                
                {/* Sidebar Navigation */}
                <div className="col-span-12 md:col-span-3 sticky top-20">
                  <Card className="border-none shadow-none bg-transparent">
                    <nav className="flex flex-col space-y-1">
                      <button
                        onClick={() => setEditSection("details")}
                        className={`flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-md transition-colors ${editSection === "details" ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-100"}`}
                      >
                        <LayoutList className="h-4 w-4" /> Details
                      </button>
                      <button
                        onClick={() => setEditSection("voice")}
                        className={`flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-md transition-colors ${editSection === "voice" ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-100"}`}
                      >
                        <Mic className="h-4 w-4" /> Voice Configuration
                      </button>
                      <button
                        onClick={() => setEditSection("settings")}
                        className={`flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-md transition-colors ${editSection === "settings" ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-100"}`}
                      >
                        <Settings className="h-4 w-4" /> Agent Settings
                      </button>
                    </nav>
                  </Card>
                </div>

                {/* Content Area */}
                <div className="col-span-12 md:col-span-9">
                  <Card className="border border-slate-200 shadow-sm bg-white">
                    <CardContent className="p-6 space-y-6">
                      
                      {/* Section: Details */}
                      {editSection === "details" && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                          <div className="flex justify-between items-center">
                            <h2 className="text-lg font-semibold">Agent Details</h2>
                          </div>
                          <Separator />
                          
                          <div className="space-y-4">
                            {/* Agent Name */}
                            <div className="grid gap-2">
                              <Label htmlFor="name" className="flex items-center gap-2">
                                <User className="h-4 w-4 text-primary" />
                                Agent Name <span className="text-destructive">*</span>
                              </Label>
                              <Input 
                                id="name" 
                                value={formData.name} 
                                onChange={(e) => setFormData({...formData, name: e.target.value})}
                                placeholder="e.g. Sales Assistant" 
                              />
                            </div>

                            {/* Incoming Number */}
                            <div className="grid gap-2">
                              <Label htmlFor="incoming_number" className="flex items-center gap-2">
                                <Phone className="h-4 w-4 text-primary" />
                                Assign Number to Agent {!isCreateMode && <span className="text-destructive">*</span>}
                              </Label>
                              <Select
                                value={formData.incoming_number || ""}
                                onValueChange={(val) => setFormData({...formData, incoming_number: val})}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select incoming number" />
                                </SelectTrigger>
                                <SelectContent>
                                  {phoneNumbersWithAgents.map((phoneData) => (
                                    <SelectItem key={phoneData.phone_number} value={phoneData.phone_number}>
                                      <div className="flex items-center justify-between w-full">
                                        <span className="font-medium">{phoneData.phone_number}</span>
                                        {phoneData.linked_agent && (
                                          <Badge variant="secondary" className="ml-2 text-xs">
                                            {phoneData.linked_agent.name}
                                          </Badge>
                                        )}
                                      </div>
                                    </SelectItem>
                                  ))}
                                  {phoneNumbersWithAgents.length === 0 && !loadingImportedNumbers && (
                                    <div className="px-2 py-4 text-sm text-muted-foreground text-center">No numbers available</div>
                                  )}
                                </SelectContent>
                              </Select>
                              
                              {/* Phone Numbers List with Link/Unlink */}
                              {phoneNumbersWithAgents.length > 0 && (
                                <div className="mt-3 space-y-2 border-t pt-3">
                                  <p className="text-xs text-muted-foreground mb-2">Manage phone number links:</p>
                                  <ScrollArea className="h-[200px]">
                                    <div className="space-y-2">
                                      {phoneNumbersWithAgents.map((phoneData) => {
                                        const isLinked = phoneData.linked_agent !== null;
                                        const isCurrentBot = !isCreateMode && bot && phoneData.linked_agent?.id === bot.id;
                                        
                                        return (
                                          <div
                                            key={phoneData.id}
                                            className="flex items-center justify-between p-2 border rounded-md bg-slate-50"
                                          >
                                            <div className="flex-1">
                                              <div className="flex items-center gap-2">
                                                <Phone className="h-3 w-3 text-slate-500" />
                                                <span className="text-sm font-medium">{phoneData.phone_number}</span>
                                              </div>
                                              {phoneData.linked_agent ? (
                                                <div className="flex items-center gap-2 mt-1">
                                                  <Bot className="h-3 w-3 text-blue-500" />
                                                  <span className="text-xs text-blue-600">
                                                    Linked to: {phoneData.linked_agent.name}
                                                  </span>
                                                </div>
                                              ) : (
                                                <span className="text-xs text-slate-500 mt-1 block">Not linked</span>
                                              )}
                                            </div>
                                            <div className="flex gap-2">
                                              {isLinked ? (
                                                <Button
                                                  variant="outline"
                                                  size="sm"
                                                  onClick={() => handleUnlinkAgent(phoneData.id, phoneData.linked_agent!.id)}
                                                  disabled={linkingNumberId === phoneData.id}
                                                  className="text-xs h-7 text-orange-600 hover:text-orange-700 border-orange-200 hover:border-orange-300"
                                                >
                                                  {linkingNumberId === phoneData.id ? (
                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                  ) : (
                                                    <>
                                                      <Unlink className="h-3 w-3 mr-1" />
                                                      Unlink
                                                    </>
                                                  )}
                                                </Button>
                                              ) : (
                                                !isCreateMode && bot && (
                                                  <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handleLinkAgent(phoneData.id, phoneData.phone_number, bot.id)}
                                                    disabled={linkingNumberId === phoneData.id}
                                                    className="text-xs h-7"
                                                  >
                                                    {linkingNumberId === phoneData.id ? (
                                                      <Loader2 className="h-3 w-3 animate-spin" />
                                                    ) : (
                                                      <>
                                                        <Link2 className="h-3 w-3 mr-1" />
                                                        Link to this agent
                                                      </>
                                                    )}
                                                  </Button>
                                                )
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </ScrollArea>
                                </div>
                              )}
                            </div>

                            {/* Transfer Call To */}
                            <div className="grid gap-2">
                              <Label htmlFor="transfer_call_to" className="flex items-center gap-2">
                                <Phone className="h-4 w-4 text-primary" />
                                Transfer Call To <span className="text-destructive">*</span>
                              </Label>
                              <Input 
                                id="transfer_call_to"
                                value={formData.transfer_call_to} 
                                onChange={(e) => setFormData({...formData, transfer_call_to: e.target.value})}
                                placeholder="e.g. +1234567890"
                              />
                              <p className="text-xs text-muted-foreground">Phone number to transfer inbound calls to (required)</p>
                            </div>

                            {/* Knowledge Base */}
                            <div className="grid gap-2">
                              <Label htmlFor="kb" className="flex items-center gap-2">
                                <BookOpen className="h-4 w-4 text-primary" />
                                Knowledge Base
                              </Label>
                              <Select
                                value={formData.knowledge_base_id ? formData.knowledge_base_id : "none"}
                                onValueChange={(v) => setFormData({...formData, knowledge_base_id: v === "none" ? "" : v})}
                                disabled={loadingKnowledgeBases}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder={loadingKnowledgeBases ? "Loading..." : "Select a knowledge base (optional)"} />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">None (No knowledge base)</SelectItem>
                                  {knowledgeBases.map((kb) => (
                                    <SelectItem key={kb.id} value={kb.knowledge_base_id}>
                                      {kb.knowledge_base_name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Section: Voice Configuration */}
                      {editSection === "voice" && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                          <h2 className="text-lg font-semibold">Voice Configuration</h2>
                          <Separator />

                          <div className="space-y-6">
                            {/* Voice Selection */}
                            <VoiceSelector
                              voices={voices}
                              loadingVoices={loadingVoices}
                              selectedVoiceId={formData.voice_id}
                              onSelect={(voiceId) => setFormData({...formData, voice_id: voiceId})}
                            />

                            {/* Begin Message */}
                            <div className="grid gap-2">
                              <Label htmlFor="begin_message">Begin Message <span className="text-destructive">*</span></Label>
                              <Textarea 
                                id="begin_message"
                                value={formData.begin_message} 
                                onChange={(e) => setFormData({...formData, begin_message: e.target.value})}
                                placeholder="Hello! How can I assist you today?"
                                rows={2}
                              />
                            </div>

                            {/* General Prompt */}
                            <div className="grid gap-2">
                              <div className="flex items-center justify-between">
                                <Label htmlFor="instruction">General Prompt <span className="text-destructive">*</span></Label>
                                {userPrompts.length > 0 && (
                                  <div className="relative prompt-selector-container">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setShowPromptSelector(!showPromptSelector)}
                                      className="h-7 text-xs"
                                    >
                                      <Zap className="h-3 w-3 mr-1" />
                                      Quick Select Prompt
                                    </Button>
                                    {showPromptSelector && (
                                      <div className="absolute right-0 top-9 z-50 w-72 bg-popover border border-border rounded-md shadow-lg p-2 max-h-80 overflow-y-auto">
                                        <div className="space-y-1">
                                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-b border-border mb-1 flex items-center justify-between">
                                            <span>Select a saved prompt:</span>
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => setShowPromptSelector(false)}
                                              className="h-5 w-5 p-0"
                                            >
                                              <X className="h-3 w-3" />
                                            </Button>
                                          </div>
                                          {userPrompts.length === 0 ? (
                                            <div className="px-2 py-4 text-xs text-muted-foreground text-center">
                                              No saved prompts. <br />
                                              <Button
                                                type="button"
                                                variant="link"
                                                size="sm"
                                                onClick={() => {
                                                  window.open("/ai-prompt", "_blank");
                                                  setShowPromptSelector(false);
                                                }}
                                                className="h-auto p-0 text-xs mt-1"
                                              >
                                                Generate one now
                                              </Button>
                                            </div>
                                          ) : (
                                            userPrompts.map((prompt) => (
                                              <button
                                                key={prompt.id}
                                                type="button"
                                                onClick={() => {
                                                  setFormData({...formData, general_prompt: prompt.system_prompt || ""});
                                                  if (prompt.begin_message) {
                                                    setFormData(prev => ({...prev, begin_message: prompt.begin_message || prev.begin_message}));
                                                  }
                                                  setShowPromptSelector(false);
                                                }}
                                                className="w-full text-left px-2 py-2 text-xs rounded hover:bg-accent transition-colors flex items-start gap-2 border border-transparent hover:border-border"
                                              >
                                                <FileText className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary" />
                                                <div className="flex-1 min-w-0">
                                                  <div className="font-medium truncate text-foreground">{prompt.name}</div>
                                                  <div className="text-muted-foreground truncate text-[10px] mt-0.5">
                                                    {prompt.system_prompt?.substring(0, 60)}...
                                                  </div>
                                                  <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded">
                                                      {prompt.category}
                                                    </span>
                                                    {prompt.is_active && (
                                                      <span className="text-[10px] px-1.5 py-0.5 bg-green-500/10 text-green-600 rounded">
                                                        Active
                                                      </span>
                                                    )}
                                                  </div>
                                                </div>
                                              </button>
                                            ))
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                              <Textarea 
                                id="instruction"
                                value={formData.general_prompt}
                                onChange={(e) => setFormData({...formData, general_prompt: e.target.value})}
                                placeholder="You are a helpful customer service agent..."
                                className="min-h-[200px] font-mono text-sm leading-relaxed"
                              />
                              <div className="flex items-center justify-between">
                                <p className="text-xs text-muted-foreground">Define the agent's personality, role, and detailed instructions.</p>
                                {userPrompts.length > 0 && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => window.open("/ai-prompt", "_blank")}
                                    className="h-6 text-xs"
                                  >
                                    <Sparkles className="h-3 w-3 mr-1" />
                                    Generate New Prompt
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Section: Agent Settings */}
                      {editSection === "settings" && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                          
                          {/* Availability Settings */}
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <h2 className="text-lg font-semibold flex items-center gap-2"><Clock className="h-5 w-5" /> Availability / Unavailable Settings</h2>
                              <div className="flex items-center space-x-2">
                                <Switch 
                                  checked={formData.availability_enabled}
                                  onCheckedChange={(checked) => setFormData({...formData, availability_enabled: checked})}
                                />
                                <Label>Enable Check</Label>
                              </div>
                            </div>
                            <Separator />
                            
                            {formData.availability_enabled ? (
                              <div className="p-4 bg-muted/30 rounded-lg border border-border space-y-4">
                                <div className="grid gap-2">
                                  <Label>Timezone</Label>
                                  <TimezoneSelector 
                                    value={formData.availability_timezone}
                                    onValueChange={(val) => setFormData({...formData, availability_timezone: val})}
                                  />
                                </div>
                                
                                {/* Unavailable Days */}
                                <div className="grid gap-2">
                                  <Label>Unavailable Days (All Day)</Label>
                                  <div className="flex flex-wrap gap-2">
                                    {DAYS_OF_WEEK.map((day) => (
                                      <div
                                        key={day}
                                        onClick={() => {
                                          const current = formData.unavailable_days;
                                          const updated = current.includes(day)
                                            ? current.filter((d) => d !== day)
                                            : [...current, day];
                                          setFormData({ ...formData, unavailable_days: updated });
                                        }}
                                        className={`
                                          cursor-pointer px-3 py-1.5 rounded-md text-xs font-medium border transition-all select-none
                                          ${
                                            formData.unavailable_days.includes(day)
                                              ? "bg-primary text-primary-foreground border-primary"
                                              : "bg-background border-border hover:border-primary/50"
                                          }
                                        `}
                                      >
                                        {day.slice(0, 3)}
                                      </div>
                                    ))}
                                  </div>
                                  <div className="flex gap-2">
                                    <Button 
                                      type="button" 
                                      variant="ghost" 
                                      size="sm" 
                                      className="h-6 text-xs px-2 text-muted-foreground hover:text-foreground"
                                      onClick={() => setFormData({ ...formData, unavailable_days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] })}
                                    >
                                      Select Weekdays
                                    </Button>
                                    <Button 
                                      type="button" 
                                      variant="ghost" 
                                      size="sm" 
                                      className="h-6 text-xs px-2 text-muted-foreground hover:text-foreground"
                                      onClick={() => setFormData({ ...formData, unavailable_days: ["Saturday", "Sunday"] })}
                                    >
                                      Select Weekends
                                    </Button>
                                    <Button 
                                      type="button" 
                                      variant="ghost" 
                                      size="sm" 
                                      className="h-6 text-xs px-2 text-muted-foreground hover:text-foreground"
                                      onClick={() => setFormData({ ...formData, unavailable_days: [] })}
                                    >
                                      Clear
                                    </Button>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                  <div className="grid gap-2">
                                    <Label>Unavailable Start</Label>
                                    <Input 
                                      type="time" 
                                      value={formData.unavailable_start_time}
                                      onChange={(e) => setFormData({...formData, unavailable_start_time: e.target.value})}
                                    />
                                  </div>
                                  <div className="grid gap-2">
                                    <Label>Unavailable End</Label>
                                    <Input 
                                      type="time" 
                                      value={formData.unavailable_end_time}
                                      onChange={(e) => setFormData({...formData, unavailable_end_time: e.target.value})}
                                    />
                                  </div>
                                </div>
                                <div className="flex items-start gap-2 text-sm text-blue-600 bg-blue-50 p-3 rounded-md">
                                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                                  <p>During these hours, the agent will inform the caller they are unavailable and ask them to call back later.</p>
                                </div>
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground italic">Availability check is disabled. The agent will answer calls at any time.</p>
                            )}
                          </div>
                          
                        </div>
                      )}

                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

            {/* Logs Tab */}
            <TabsContent value="logs" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Call Logs</CardTitle>
                  <CardDescription>
                    View all calls (including test calls) for this agent
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {callsLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : calls.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <FileText className="h-12 w-12 mx-auto mb-4 opacity-20" />
                      <h3 className="text-lg font-medium">No Calls Yet</h3>
                      <p>Call history and transcripts will appear here.</p>
                    </div>
                  ) : (
                    <ScrollArea className="h-[600px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Type</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Phone</TableHead>
                            <TableHead>Duration</TableHead>
                            <TableHead>Started</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {calls.map((call) => {
                            const StatusIcon = statusConfig[call.status as CallStatus]?.icon || Phone;
                            const statusLabel = statusConfig[call.status as CallStatus]?.label || call.status || "Unknown";
                            const statusVariant = statusConfig[call.status as CallStatus]?.variant || "outline";

                            return (
                              <TableRow key={call.id}>
                                <TableCell>
                                  {call.is_test_call ? (
                                    <Badge variant="secondary" className="gap-1">
                                      <Activity className="h-3 w-3" />
                                      Test
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline">Regular</Badge>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Badge variant={statusVariant} className="gap-1">
                                    <StatusIcon className="h-3 w-3" />
                                    {statusLabel}
                                  </Badge>
                                </TableCell>
                                <TableCell className="font-mono text-sm">
                                  {call.phone_number === "test_call" ? "Test Call" : call.phone_number}
                                </TableCell>
                                <TableCell>
                                  {call.duration_seconds
                                    ? `${Math.floor(call.duration_seconds / 60)}:${String(call.duration_seconds % 60).padStart(2, "0")}`
                                    : "-"}
                                </TableCell>
                                <TableCell>
                                  {call.started_at
                                    ? formatDistanceToNow(new Date(call.started_at), { addSuffix: true })
                                    : "-"}
                                </TableCell>
                                <TableCell>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setSelectedCall(call);
                                      setCallDetailsOpen(true);
                                    }}
                                  >
                                    <Eye className="h-4 w-4 mr-1" />
                                    View
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>

              {/* Call Details Dialog */}
              <Dialog open={callDetailsOpen} onOpenChange={setCallDetailsOpen}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Call Details</DialogTitle>
                    <DialogDescription>
                      {selectedCall?.is_test_call ? "Test Call" : "Regular Call"} - {selectedCall?.status}
                    </DialogDescription>
                  </DialogHeader>
                  {selectedCall && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-muted-foreground">Status</Label>
                          <p className="font-medium">
                            {statusConfig[selectedCall.status as CallStatus]?.label || selectedCall.status}
                          </p>
                        </div>
                        <div>
                          <Label className="text-muted-foreground">Phone Number</Label>
                          <p className="font-medium">
                            {selectedCall.phone_number === "test_call" ? "Test Call" : selectedCall.phone_number}
                          </p>
                        </div>
                        <div>
                          <Label className="text-muted-foreground">Duration</Label>
                          <p className="font-medium">
                            {selectedCall.duration_seconds
                              ? `${Math.floor(selectedCall.duration_seconds / 60)}:${String(selectedCall.duration_seconds % 60).padStart(2, "0")}`
                              : "N/A"}
                          </p>
                        </div>
                        <div>
                          <Label className="text-muted-foreground">Started</Label>
                          <p className="font-medium">
                            {selectedCall.started_at
                              ? format(new Date(selectedCall.started_at), "PPpp")
                              : "N/A"}
                          </p>
                        </div>
                        {selectedCall.completed_at && (
                          <div>
                            <Label className="text-muted-foreground">Completed</Label>
                            <p className="font-medium">
                              {format(new Date(selectedCall.completed_at), "PPpp")}
                            </p>
                          </div>
                        )}
                      </div>

                      {selectedCall.transcript && (
                        <TranscriptDisplay
                          transcript={selectedCall.transcript}
                          metadata={selectedCall.metadata || selectedCall.webhook_response}
                          height="h-96"
                        />
                      )}

                      {selectedCall.error_message && (
                        <div>
                          <Label className="text-muted-foreground flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 text-destructive" />
                            Error
                          </Label>
                          <p className="text-sm text-destructive mt-1">
                            {selectedCall.error_message}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            </TabsContent>
          </Tabs>
        </div>
        </FeatureGate>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
