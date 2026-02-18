import { useState } from "react";
import {
  Phone,
  PhoneCall,
  Loader2,
  Clock,
  CheckCircle,
  XCircle,
  Eye,
  Bot as BotIcon,
  Calendar as CalendarIcon,
  Copy,
  Check,
  User,
  Link as LinkIcon,
  FileText,
  Database,
  PhoneOff,
  Moon,
  UserCheck,
  Mail,
  Send,
  Sparkles,
  Download,
  Filter,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { FeatureGate } from "@/components/FeatureGate";
import { useCalls } from "@/hooks/useCalls";
import { useBots } from "@/hooks/useBots";
import { useProfile } from "@/hooks/useProfile";
import { usePageLeads } from "@/hooks/usePageLeads";
import { TranscriptDisplay } from "@/components/transcript/TranscriptDisplay";
import { CallStatus } from "@/types/database";
import {
  formatInUserTimezone,
  formatScheduledAt,
  exportToCSV,
  cn,
} from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Call } from "@/types/database";
import type { PageLead } from "@/types/database";
import { useEmails } from "@/hooks/useEmails";
import { useSendEmail } from "@/hooks/useSendEmail";
import { useEmailTemplates } from "@/hooks/useEmailTemplates";
import { useAIEmail } from "@/hooks/useAIEmail";
import { useCallAnalysis } from "@/hooks/useCallAnalysis";
import { useAutoCallAnalysis } from "@/hooks/useAutoCallAnalysis";

const statusConfig: Record<
  CallStatus,
  {
    icon: typeof Phone;
    label: string;
    variant:
      | "default"
      | "secondary"
      | "destructive"
      | "outline";
    color: string;
    bgColor: string;
  }
> = {
  pending: {
    icon: Clock,
    label: "Pending",
    variant: "outline",
    color: "text-slate-500",
    bgColor: "bg-slate-50",
  },
  in_progress: {
    icon: PhoneCall,
    label: "In Progress",
    variant: "default", 
    color: "text-blue-600",
    bgColor: "bg-blue-50",
  },
  completed: {
    icon: CheckCircle,
    label: "Completed",
    variant: "default", 
    color: "text-green-600",
    bgColor: "bg-green-50",
  },
  failed: {
    icon: XCircle,
    label: "Failed",
    variant: "destructive",
    color: "text-red-600",
    bgColor: "bg-red-50",
  },
  not_connected: {
    icon: PhoneOff,
    label: "Not Connected",
    variant: "secondary",
    color: "text-slate-500",
    bgColor: "bg-slate-50",
  },
  night_time_dont_call: {
    icon: Moon,
    label: "Night Time Don't Call",
    variant: "outline",
    color: "text-slate-500",
    bgColor: "bg-slate-50",
  },
};

// Helper function to check if a call has Lead_status = "Yes" or is_lead = true
const isLead = (call: Call): boolean => {
  // Check new is_lead field first
  if (call.is_lead === true) {
    return true;
  }
  
  // Check metadata for Lead_status
  if (call.metadata && typeof call.metadata === "object") {
    const leadStatus = (call.metadata as any).Lead_status || (call.metadata as any).lead_status;
    if (leadStatus === "Yes" || leadStatus === "yes" || leadStatus === true) {
      return true;
    }
  }
  
  // Check webhook_response for Lead_status (if available)
  if (call.webhook_response && typeof call.webhook_response === "object") {
    const leadStatus = call.webhook_response.Lead_status || call.webhook_response.lead_status;
    if (leadStatus === "Yes" || leadStatus === "yes" || leadStatus === true) {
      return true;
    }
  }
  
  return false;
};

// Helper function to get call type color
const getCallTypeColor = (callType: string | null | undefined) => {
  const colors: Record<string, string> = {
    order: "bg-blue-100 text-blue-700 border-blue-200",
    appointment: "bg-purple-100 text-purple-700 border-purple-200",
    sales_inquiry: "bg-green-100 text-green-700 border-green-200",
    support: "bg-orange-100 text-orange-700 border-orange-200",
    billing: "bg-yellow-100 text-yellow-700 border-yellow-200",
    complaint: "bg-red-100 text-red-700 border-red-200",
    general_inquiry: "bg-gray-100 text-gray-700 border-gray-200",
  };
  return colors[callType || ""] || "bg-slate-100 text-slate-700 border-slate-200";
};

// Helper function to format call type for display
const formatCallType = (callType: string | null | undefined) => {
  if (!callType) return "N/A";
  return callType
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

export default function Leads() {
  // All hooks must be called at the top level, in the same order
  const {
    calls,
    loading: callsLoading,
  } = useCalls();
  const { leads: pageLeads, loading: pageLeadsLoading } = usePageLeads();
  const { bots } = useBots();
  const { profile } = useProfile();
  const { emails, loading: emailsLoading } = useEmails();
  const { sendEmail, sending } = useSendEmail();
  const { templates, processTemplate, getDefaultTemplate } = useEmailTemplates();
  const { generateEmail, generating: aiGenerating } = useAIEmail();
  const { analyzeCall, analyzing } = useCallAnalysis();
  
  // All useState hooks must be grouped together
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedLeadStrength, setSelectedLeadStrength] = useState<string>("all");
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailToSend, setEmailToSend] = useState<Call | PageLead | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("none");
  const [emailForm, setEmailForm] = useState({
    fromEmail: "",
    toEmail: "",
    subject: "",
    body: "",
  });

  // Auto-analyze calls when they complete - must be after ALL useState hooks
  useAutoCallAnalysis();

  const userTimezone = profile?.timezone || "UTC";
  
  // Defensive checks to prevent crashes
  const safeCalls = Array.isArray(calls) ? calls : [];
  const safePageLeads = Array.isArray(pageLeads) ? pageLeads : [];
  const safeBots = Array.isArray(bots) ? bots : [];
  const safeEmails = Array.isArray(emails) ? emails : [];
  const safeTemplates = Array.isArray(templates) ? templates : [];

  const copyToClipboard = async (text: string, fieldName: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const getBotName = (botId: string | null) => {
    if (!botId) return "N/A";
    const bot = safeBots.find((b) => b.id === botId);
    return bot?.name || botId;
  };

  // Filter calls where Lead_status is "Yes" or is_lead = true
  const leadCalls = safeCalls.filter(isLead);
  
  // Filter leads by category
  const filteredPageLeads = selectedCategory === "all" 
    ? safePageLeads 
    : safePageLeads.filter(lead => lead.call_type === selectedCategory);
  
  const filteredCallLeads = selectedCategory === "all"
    ? leadCalls
    : leadCalls.filter(call => call.call_type === selectedCategory);
  
  // Calculate total leads count
  const totalLeadsCount = safePageLeads.length + leadCalls.length;

  const openDetails = (call: Call) => {
    setSelectedCall(call);
    setDetailsOpen(true);
  };

    const handleExportPageLeads = () => {
    const exportData = filteredPageLeads.map((lead) => ({
      "Name": lead.name || "",
      "Email": lead.email || "",
      "Phone Number": lead.phone_number || "",
      "Category": formatCallType(lead.call_type) || "",
      "Lead Strength": lead.lead_strength || "",
      "Address": lead.address || "",
      "Bot Name": lead.bot_name || "",
      "Status": lead.status || "",
      "Sentiment": lead.sentiment || "",
      "Urgency": lead.urgency_level || "",
      "Created At": lead.created_at
        ? formatInUserTimezone(lead.created_at, userTimezone, "MMM dd, yyyy HH:mm")
        : "",
    }));

    exportToCSV(exportData, `page-leads-${new Date().toISOString().split("T")[0]}`);
  };

  const handleExportCallLeads = () => {
    const exportData = filteredCallLeads.map((call) => {
      const status = (call.status || "pending").toLowerCase();
      const config = statusConfig[status as CallStatus] || statusConfig.pending;

      return {
        "Phone Number": call.phone_number || "",
        "Contact Name": call.contact_name || "",
        "Category": formatCallType(call.call_type) || "",
        "Status": config.label,
        "Lead Strength": call.lead_strength || "",
        "Duration (seconds)": call.duration_seconds || "",
        "Duration (formatted)": call.duration_seconds
          ? `${Math.floor(call.duration_seconds / 60)}:${String(call.duration_seconds % 60).padStart(2, "0")}`
          : "",
        "Bot": getBotName(call.bot_id),
        "Started At": call.started_at
          ? formatInUserTimezone(call.started_at, userTimezone, "MMM dd, yyyy HH:mm")
          : "",
        "Scheduled": formatScheduledAt(call.Scheduled_at, "MMM dd, yyyy 'at' h:mm a"),
        "Recording URL": call.recording_url || "",
        "Email": call.metadata?.email || call.metadata?.Email || call.extracted_customer_data?.email || "",
        "Company Name": call.metadata?.company_name || call.metadata?.Company_name || "",
        "Sentiment": call.sentiment || "",
        "Urgency": call.urgency_level || "",
        "Analyzed": call.analyzed ? "Yes" : "No",
      };
    });

    exportToCSV(exportData, `call-leads-${new Date().toISOString().split("T")[0]}`);
  };

  const openEmailDialog = (lead: Call | PageLead, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    setEmailToSend(lead);
    
    // Extract email and name based on type
    let leadEmail = "";
    let leadName = "";
    let leadPhone = "";
    let appointmentDate = "";
    let appointmentTime = "";
    let appointmentType = "";
    let appointmentTimezone = "";
    let hasAppointment = false;
    let extractedData: any = null;
    
    if ('email' in lead) {
      // PageLead
      leadEmail = lead.email;
      leadName = lead.name;
      leadPhone = lead.phone_number || "";
      appointmentDate = lead.appointment_date || "";
      appointmentTime = lead.appointment_time || "";
      appointmentType = lead.appointment_type || "";
      appointmentTimezone = lead.appointment_timezone || "";
      hasAppointment = !!(lead.appointment_date || lead.appointment_time);
      extractedData = lead.extracted_data;
    } else {
      // Call
      leadEmail = lead.metadata?.email || lead.metadata?.Email || lead.extracted_customer_data?.email || "";
      leadName = lead.contact_name || lead.extracted_customer_data?.name || "";
      leadPhone = lead.phone_number;
      // Check analysis data for appointment
      if (lead.analysis && typeof lead.analysis === 'object') {
        const analysis = lead.analysis as any;
        if (analysis.appointment) {
          appointmentDate = analysis.appointment.date || "";
          appointmentTime = analysis.appointment.time || "";
          appointmentType = analysis.appointment.appointment_type || "";
          appointmentTimezone = analysis.appointment.timezone || "";
          hasAppointment = analysis.appointment.scheduled || analysis.appointment.requested;
        }
        extractedData = analysis;
      }
    }
    
    // Set first SMTP email as default from email
    const primaryEmail = safeEmails.find((e) => e.smtp_password) || safeEmails[0];
    
    // Format appointment date for display
    let formattedAppointmentDate = "";
    let appointmentDayOfWeek = "";
    if (appointmentDate) {
      try {
        const dateObj = new Date(appointmentDate);
        if (!isNaN(dateObj.getTime())) {
          formattedAppointmentDate = dateObj.toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          });
          appointmentDayOfWeek = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
        } else {
          formattedAppointmentDate = appointmentDate;
        }
      } catch {
        formattedAppointmentDate = appointmentDate;
      }
    }
    
    // Try to use default template or create default content
    const defaultTemplate = getDefaultTemplate();
    let defaultSubject = `Follow-up: ${leadName || leadPhone || "Lead"}`;
    let defaultBody = `Hello ${leadName || "there"},

Thank you for your interest. We'd like to follow up with you.

Best regards`;

    // If appointment exists, create appointment-specific content
    if (hasAppointment && (appointmentDate || appointmentTime)) {
      defaultSubject = `Appointment Confirmation: ${leadName || "Scheduled Call"}${appointmentDate ? ` on ${formattedAppointmentDate}` : ""}`;
      defaultBody = `Dear ${leadName || "there"},

I hope this message finds you well. I am writing to confirm our upcoming ${appointmentType || "appointment"}${appointmentDate ? ` scheduled for ${formattedAppointmentDate}` : ""}${appointmentTime ? ` at ${appointmentTime}` : ""}${appointmentTimezone ? ` (${appointmentTimezone})` : ""}.

We are looking forward to discussing opportunities and how we can be of service to you.${appointmentDayOfWeek ? ` This ${appointmentDayOfWeek},` : ""} we will cover the topics we discussed during our call.

Please let us know if you have a preferred agenda or specific topics you would like to cover during our conversation.${leadPhone ? ` You can reach me directly at ${leadPhone}` : ""} if there are any changes or questions.

Looking forward to speaking with you soon.

Best regards`;
    }

    if (defaultTemplate) {
      const processed = processTemplate(defaultTemplate, {
        contact_name: leadName || "there",
        phone_number: leadPhone || "",
        company_name: ('metadata' in lead && lead.metadata) ? (lead.metadata?.company_name || lead.metadata?.Company_name || "") : "",
        call_date: ('started_at' in lead && lead.started_at) 
          ? new Date(lead.started_at).toLocaleDateString() 
          : new Date().toLocaleDateString(),
        appointment_date: formattedAppointmentDate || appointmentDate || "",
        appointment_time: appointmentTime || "",
        appointment_type: appointmentType || "",
        appointment_day: appointmentDayOfWeek || "",
      });
      defaultSubject = processed.subject;
      defaultBody = processed.body;
      setSelectedTemplateId(defaultTemplate.id);
    } else {
      setSelectedTemplateId("none");
    }
    
    setEmailForm({
      fromEmail: primaryEmail?.email || "",
      toEmail: leadEmail,
      subject: defaultSubject,
      body: defaultBody,
    });
    setEmailDialogOpen(true);
  };

  const handleTemplateSelect = (templateId: string) => {
    if (!emailToSend) return;
    
    setSelectedTemplateId(templateId);
    
    // If "none" is selected, reset to default empty form
    if (templateId === "none") {
      let leadName = "";
      let leadPhone = "";
      
      if ('email' in emailToSend) {
        // PageLead
        leadName = emailToSend.name;
        leadPhone = emailToSend.phone_number || "";
      } else {
        // Call
        leadName = emailToSend.contact_name || "";
        leadPhone = emailToSend.phone_number;
      }
      
      setEmailForm({
        ...emailForm,
        subject: `Follow-up: ${leadName || leadPhone || "Lead"}`,
        body: `Hello ${leadName || "there"},

Thank you for your interest. We'd like to follow up with you.

Best regards`,
      });
      return;
    }
    
    const template = safeTemplates.find((t) => t.id === templateId);
    
    if (template) {
      let leadName = "";
      let leadPhone = "";
      let companyName = "";
      let callDate = new Date().toLocaleDateString();
      let appointmentDate = "";
      let appointmentTime = "";
      let appointmentType = "";
      let appointmentDay = "";
      
      if ('email' in emailToSend) {
        // PageLead
        leadName = emailToSend.name;
        leadPhone = emailToSend.phone_number || "";
        appointmentDate = emailToSend.appointment_date || "";
        appointmentTime = emailToSend.appointment_time || "";
        appointmentType = emailToSend.appointment_type || "";
        
        if (emailToSend.appointment_date) {
          try {
            const dateObj = new Date(emailToSend.appointment_date);
            if (!isNaN(dateObj.getTime())) {
              appointmentDay = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
            }
          } catch {}
        }
      } else {
        // Call
        leadName = emailToSend.contact_name || "there";
        leadPhone = emailToSend.phone_number;
        companyName = emailToSend.metadata?.company_name || emailToSend.metadata?.Company_name || "";
        callDate = emailToSend.started_at 
          ? new Date(emailToSend.started_at).toLocaleDateString() 
          : new Date().toLocaleDateString();
        
        // Check analysis for appointment
        if (emailToSend.analysis && typeof emailToSend.analysis === 'object') {
          const analysis = emailToSend.analysis as any;
          if (analysis.appointment) {
            appointmentDate = analysis.appointment.date || "";
            appointmentTime = analysis.appointment.time || "";
            appointmentType = analysis.appointment.appointment_type || "";
            
            if (analysis.appointment.date) {
              try {
                const dateObj = new Date(analysis.appointment.date);
                if (!isNaN(dateObj.getTime())) {
                  appointmentDay = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
                }
              } catch {}
            }
          }
        }
      }
      
      const processed = processTemplate(template, {
        contact_name: leadName || "there",
        phone_number: leadPhone || "",
        company_name: companyName,
        call_date: callDate,
        appointment_date: appointmentDate || "",
        appointment_time: appointmentTime || "",
        appointment_type: appointmentType || "",
        appointment_day: appointmentDay || "",
      });
      
      setEmailForm({
        ...emailForm,
        subject: processed.subject,
        body: processed.body,
      });
    }
  };

  const handleSendEmail = async () => {
    if (!emailToSend) return;

    if (!emailForm.fromEmail || !emailForm.toEmail || !emailForm.subject || !emailForm.body) {
      return;
    }

    const phoneNumber = emailToSend && ('email' in emailToSend)
      ? emailToSend.phone_number || undefined
      : emailToSend ? (emailToSend.phone_number || undefined) : undefined;
    const callId = ('bot_id' in emailToSend) ? emailToSend.id : undefined;

    const result = await sendEmail({
      fromEmail: emailForm.fromEmail,
      toEmail: emailForm.toEmail,
      toPhoneNumber: phoneNumber || undefined,
      subject: emailForm.subject,
      body: emailForm.body,
      callId: callId,
    });

    if (result.success) {
      setEmailDialogOpen(false);
      setEmailToSend(null);
      setEmailForm({
        fromEmail: "",
        toEmail: "",
        subject: "",
        body: "",
      });
    }
  };

  const handleGenerateEmailWithAI = async () => {
    if (!emailToSend) return;

    let leadInfo: any = {};
    let appointmentInfo: any = null;
    let emailType: "follow-up" | "thank-you" | "appointment" | "custom" = "follow-up";
    let appointmentContext = "";
    
    if ('email' in emailToSend) {
      // PageLead
      leadInfo = {
        contact_name: emailToSend.name || undefined,
        phone_number: emailToSend.phone_number || undefined,
        email: emailToSend.email,
      };
      
      // Check for appointment data
      if (emailToSend.appointment_date || emailToSend.appointment_time) {
        appointmentInfo = {
          date: emailToSend.appointment_date,
          time: emailToSend.appointment_time,
          timezone: emailToSend.appointment_timezone,
          type: emailToSend.appointment_type,
        };
        emailType = "appointment";
        
        // Format appointment date
        let formattedDate = emailToSend.appointment_date || "";
        let dayOfWeek = "";
        if (emailToSend.appointment_date) {
          try {
            const dateObj = new Date(emailToSend.appointment_date);
            if (!isNaN(dateObj.getTime())) {
              formattedDate = dateObj.toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              });
              dayOfWeek = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
            }
          } catch {}
        }
        
        appointmentContext = `Appointment Details:
- Date: ${formattedDate}${dayOfWeek ? ` (${dayOfWeek})` : ""}
- Time: ${emailToSend.appointment_time || "TBD"}
${emailToSend.appointment_timezone ? `- Timezone: ${emailToSend.appointment_timezone}` : ""}
${emailToSend.appointment_type ? `- Type: ${emailToSend.appointment_type}` : ""}`;
      }
      
      // Add extracted data if available
      if (emailToSend.extracted_data) {
        leadInfo.extracted_data = emailToSend.extracted_data;
      }
    } else {
      // Call
      leadInfo = {
        contact_name: emailToSend.contact_name || emailToSend.extracted_customer_data?.name || undefined,
        phone_number: emailToSend.phone_number,
        company_name: emailToSend.metadata?.company_name || emailToSend.metadata?.Company_name || undefined,
        call_date: emailToSend.started_at 
          ? new Date(emailToSend.started_at).toLocaleDateString() 
          : new Date().toLocaleDateString(),
        transcript: emailToSend.transcript || undefined,
        metadata: emailToSend.metadata,
      };
      
      // Check analysis data for appointment
      if (emailToSend.analysis && typeof emailToSend.analysis === 'object') {
        const analysis = emailToSend.analysis as any;
        leadInfo.extracted_data = analysis;
        
        if (analysis.appointment && (analysis.appointment.scheduled || analysis.appointment.requested)) {
          appointmentInfo = analysis.appointment;
          emailType = "appointment";
          
          // Format appointment date
          let formattedDate = analysis.appointment.date || "";
          let dayOfWeek = "";
          if (analysis.appointment.date) {
            try {
              const dateObj = new Date(analysis.appointment.date);
              if (!isNaN(dateObj.getTime())) {
                formattedDate = dateObj.toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                });
                dayOfWeek = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
              }
            } catch {}
          }
          
          appointmentContext = `Appointment Details:
- Date: ${formattedDate}${dayOfWeek ? ` (${dayOfWeek})` : ""}
- Time: ${analysis.appointment.time || "TBD"}
${analysis.appointment.timezone ? `- Timezone: ${analysis.appointment.timezone}` : ""}
${analysis.appointment.appointment_type ? `- Type: ${analysis.appointment.appointment_type}` : ""}
- Status: ${analysis.appointment.scheduled ? "Scheduled" : "Requested"}`;
        }
      }
    }

    const generated = await generateEmail({
      leadInfo,
      emailType: emailType,
      tone: "professional",
      context: appointmentContext || undefined,
      purpose: appointmentInfo 
        ? `Generate an appointment ${appointmentInfo.scheduled ? "confirmation" : "follow-up"} email. The appointment is ${appointmentInfo.scheduled ? "confirmed" : "requested"} for ${appointmentInfo.date || "a future date"}. Make sure to mention the specific day of the week (${appointmentContext.match(/\(([^)]+)\)/)?.[1] || ""}) and be warm and professional.`
        : undefined,
    });

    if (generated) {
      setEmailForm({
        ...emailForm,
        subject: generated.subject,
        body: generated.body,
      });
    }
  };

  return (
    <ProtectedRoute>
      <DashboardLayout>
        <FeatureGate featureName="leads">
          <div className="space-y-8 pb-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="space-y-1">
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Leads</h1>
              <p className="text-slate-500 text-base">View and manage your leads from calls and landing pages</p>
            </div>
          </div>

          {/* Stats Section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Total Leads</p>
                  <h3 className="text-2xl font-bold text-slate-900 mt-1">{totalLeadsCount}</h3>
                </div>
                <div className="p-3 bg-blue-50 rounded-xl">
                  <UserCheck className="h-5 w-5 text-blue-600" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Page Leads</p>
                  <h3 className="text-2xl font-bold text-slate-900 mt-1">{safePageLeads.length}</h3>
                </div>
                <div className="p-3 bg-purple-50 rounded-xl">
                  <UserCheck className="h-5 w-5 text-purple-600" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Call Leads</p>
                  <h3 className="text-2xl font-bold text-slate-900 mt-1">{leadCalls.length}</h3>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl">
                  <PhoneCall className="h-5 w-5 text-emerald-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Category Filter and Analyze Button */}
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-500" />
              <Label className="text-sm font-medium text-slate-700">Filter by Category:</Label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="order">Orders</SelectItem>
                  <SelectItem value="appointment">Appointments</SelectItem>
                  <SelectItem value="sales_inquiry">Sales Inquiries</SelectItem>
                  <SelectItem value="support">Support</SelectItem>
                  <SelectItem value="billing">Billing</SelectItem>
                  <SelectItem value="complaint">Complaints</SelectItem>
                  <SelectItem value="general_inquiry">General Inquiries</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {leadCalls.filter(call => 
              call.status === 'completed' && 
              call.transcript && 
              call.transcript.trim().length > 0 && 
              !call.analyzed
            ).length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const unanalyzedCalls = leadCalls.filter(call => 
                    call.status === 'completed' && 
                    call.transcript && 
                    call.transcript.trim().length > 0 && 
                    !call.analyzed
                  );
                  
                  for (let i = 0; i < unanalyzedCalls.length; i++) {
                    try {
                      await analyzeCall(unanalyzedCalls[i].id);
                      // Small delay between calls
                      if (i < unanalyzedCalls.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 2000));
                      }
                    } catch (error) {
                      // Continue with next call even if one fails
                    }
                  }
                }}
                disabled={analyzing}
                className="gap-2"
              >
                {analyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Analyze All Unanalyzed Calls ({leadCalls.filter(call => 
                      call.status === 'completed' && 
                      call.transcript && 
                      call.transcript.trim().length > 0 && 
                      !call.analyzed
                    ).length})
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Tabs for Page Leads and Call Leads */}
          <Tabs defaultValue="page-leads" className="space-y-6">
            <TabsList className="bg-slate-100 p-1 rounded-lg hidden">
              <TabsTrigger value="page-leads" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">Page Leads</TabsTrigger>
              <TabsTrigger value="call-leads" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">Call Leads</TabsTrigger>
            </TabsList>

            {/* Page Leads Tab */}
            <TabsContent value="page-leads">
              <Card className="border-slate-200 shadow-sm bg-white">
                <CardHeader className="border-b border-slate-100 pb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                        <UserCheck className="h-5 w-5 text-blue-600" />
                        Page Leads
                      </CardTitle>
                      <CardDescription className="text-slate-500 mt-1">
                        {filteredPageLeads.length} lead{filteredPageLeads.length !== 1 ? "s" : ""} from landing pages
                        {selectedCategory !== "all" && ` (${safePageLeads.length} total)`}
                      </CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 border-slate-200"
                      onClick={handleExportPageLeads}
                      disabled={safePageLeads.length === 0}
                    >
                      <Download className="h-4 w-4" />
                      Export CSV
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {pageLeadsLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                    </div>
                  ) : filteredPageLeads.length === 0 ? (
                    <div className="text-center py-12">
                      <UserCheck className="h-12 w-12 mx-auto text-slate-300 mb-4" />
                      <p className="text-slate-500 font-medium">No page leads yet</p>
                      <p className="text-sm text-slate-400 mt-2">
                        Leads from your landing pages will appear here
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader className="bg-slate-50">
                          <TableRow className="border-slate-100">
                            <TableHead className="font-semibold text-slate-700">Name</TableHead>
                            <TableHead className="font-semibold text-slate-700">Email</TableHead>
                            <TableHead className="font-semibold text-slate-700">Phone</TableHead>
                            <TableHead className="font-semibold text-slate-700">Category</TableHead>
                            <TableHead className="font-semibold text-slate-700">Address</TableHead>
                            <TableHead className="font-semibold text-slate-700">Bot Name</TableHead>
                            <TableHead className="font-semibold text-slate-700">Status</TableHead>
                            <TableHead className="font-semibold text-slate-700">Created At</TableHead>
                            <TableHead className="font-semibold text-slate-700"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredPageLeads.map((lead) => (
                            <TableRow key={lead.id} className="hover:bg-slate-50/80 border-slate-100 transition-colors">
                              <TableCell className="font-medium text-slate-900">
                                {lead.name}
                              </TableCell>
                              <TableCell className="text-slate-600">
                                {lead.email}
                              </TableCell>
                              <TableCell className="font-mono text-slate-600 text-xs">
                                {lead.phone_number || "-"}
                              </TableCell>
                              <TableCell>
                                {lead.call_type ? (
                                  <Badge variant="outline" className={getCallTypeColor(lead.call_type)}>
                                    {formatCallType(lead.call_type)}
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200">
                                    N/A
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-slate-600">
                                {lead.address || "-"}
                              </TableCell>
                              <TableCell className="text-slate-600">
                                {lead.bot_name || "-"}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200">
                                  {lead.status || "new"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm text-slate-600">
                                {lead.created_at
                                  ? formatInUserTimezone(
                                      lead.created_at,
                                      userTimezone,
                                      "MMM dd, yyyy HH:mm",
                                    )
                                  : "-"}
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => openEmailDialog(lead, e)}
                                  title="Send Email"
                                  className="h-8 w-8 text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                                >
                                  <Mail className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Call Leads Tab */}
            <TabsContent value="call-leads">
              <Card className="border-slate-200 shadow-sm bg-white">
                <CardHeader className="border-b border-slate-100 pb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                        <UserCheck className="h-5 w-5 text-blue-600" />
                        Lead Calls
                      </CardTitle>
                      <CardDescription className="text-slate-500 mt-1">
                        {filteredCallLeads.length} lead call{filteredCallLeads.length !== 1 ? "s" : ""}
                        {selectedCategory !== "all" && ` (${leadCalls.length} total)`}
                      </CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 border-slate-200"
                      onClick={handleExportCallLeads}
                      disabled={leadCalls.length === 0}
                    >
                      <Download className="h-4 w-4" />
                      Export CSV
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {callsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                  </div>
                ) : filteredCallLeads.length === 0 ? (
                  <div className="text-center py-12">
                    <UserCheck className="h-12 w-12 mx-auto text-slate-300 mb-4" />
                    <p className="text-slate-500 font-medium">No lead calls yet</p>
                    <p className="text-sm text-slate-400 mt-2">
                      Calls with Lead_status = "Yes" will appear here
                    </p>
                  </div>
                ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader className="bg-slate-50">
                          <TableRow className="border-slate-100">
                            <TableHead className="font-semibold text-slate-700">Phone Number</TableHead>
                            <TableHead className="font-semibold text-slate-700">Contact Name</TableHead>
                            <TableHead className="font-semibold text-slate-700">Category</TableHead>
                            <TableHead className="font-semibold text-slate-700">Status</TableHead>
                            <TableHead className="font-semibold text-slate-700">Duration</TableHead>
                            <TableHead className="font-semibold text-slate-700">Bot</TableHead>
                            <TableHead className="font-semibold text-slate-700">Started At</TableHead>
                            <TableHead className="font-semibold text-slate-700">Scheduled</TableHead>
                            <TableHead className="font-semibold text-slate-700">Recording</TableHead>
                            <TableHead className="font-semibold text-slate-700"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredCallLeads.map((call) => {
                            const status = (call.status || "pending").toLowerCase();
                            const config = statusConfig[status as CallStatus] || statusConfig.pending;
                            const StatusIcon = config.icon;

                            return (
                              <TableRow 
                                key={call.id} 
                                className="hover:bg-slate-50/80 cursor-pointer border-slate-100 transition-colors"
                                onClick={() => openDetails(call)}
                              >
                                <TableCell className="font-mono text-slate-900 text-xs font-medium">
                                  {call.phone_number}
                                </TableCell>
                                <TableCell className="text-slate-600">
                                  {call.contact_name || "-"}
                                </TableCell>
                                <TableCell>
                                  {call.call_type ? (
                                    <Badge variant="outline" className={getCallTypeColor(call.call_type)}>
                                      {formatCallType(call.call_type)}
                                    </Badge>
                                  ) : call.analyzed === false ? (
                                    <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                                      Not Analyzed
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200">
                                      N/A
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={cn("gap-1 font-normal", config.color, config.bgColor, "border-transparent")}>
                                    <StatusIcon className="h-3 w-3" />
                                    {config.label}
                                  </Badge>
                                </TableCell>
                                <TableCell className="font-mono text-xs text-slate-600">
                                  {call.duration_seconds
                                    ? `${Math.floor(call.duration_seconds / 60)}:${String(call.duration_seconds % 60).padStart(2, "0")}`
                                    : "-"}
                                </TableCell>
                                <TableCell className="text-slate-600">
                                  {getBotName(call.bot_id)}
                                </TableCell>
                                <TableCell className="text-sm text-slate-600">
                                  {call.started_at
                                    ? formatInUserTimezone(
                                        call.started_at,
                                        userTimezone,
                                        "MMM dd, yyyy HH:mm",
                                      )
                                    : "-"}
                                </TableCell>
                                <TableCell className="text-sm text-slate-600">
                                  {formatScheduledAt(call.Scheduled_at, "MMM dd, yyyy 'at' h:mm a")}
                                </TableCell>
                                <TableCell className="text-xs max-w-[200px]">
                                  {call.recording_url ? (
                                    <a
                                      href={call.recording_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-600 hover:underline truncate block flex items-center gap-1"
                                      onClick={(e) => e.stopPropagation()}
                                      title={call.recording_url}
                                    >
                                      <LinkIcon className="h-3 w-3" />
                                      Recording
                                    </a>
                                  ) : "-"}
                                </TableCell>
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  <div className="flex items-center gap-1">
                                    {!call.analyzed && call.transcript && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={async (e) => {
                                          e.stopPropagation();
                                          try {
                                            await analyzeCall(call.id);
                                            // Refresh will happen via real-time subscription
                                          } catch (error) {
                                            // Error already handled in hook
                                          }
                                        }}
                                        disabled={analyzing}
                                        title="Analyze Call"
                                        className="h-8 text-xs"
                                      >
                                        {analyzing ? (
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                          "Analyze"
                                        )}
                                      </Button>
                                    )}
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={(e) => openEmailDialog(call, e)}
                                      title="Send Email"
                                      className="h-8 w-8 text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                                    >
                                      <Mail className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => openDetails(call)}
                                      title="View Details"
                                      className="h-8 w-8 text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Call Details Dialog */}
          <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col bg-white">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl font-bold text-slate-900">
                <PhoneCall className="h-5 w-5 text-blue-600" />
                Call Details
              </DialogTitle>
              <DialogDescription className="text-slate-500">
                Complete information about this call
              </DialogDescription>
            </DialogHeader>
            {selectedCall && (
              <div className="flex-1 overflow-hidden">
                <Tabs
                  defaultValue="overview"
                  className="w-full h-full flex flex-col"
                >
                  <TabsList className="grid w-full grid-cols-4 bg-slate-100 p-1">
                    <TabsTrigger value="overview" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">Overview</TabsTrigger>
                    <TabsTrigger value="timeline" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">Timeline</TabsTrigger>
                    <TabsTrigger value="content" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">Content</TabsTrigger>
                    <TabsTrigger value="technical" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">Technical</TabsTrigger>
                  </TabsList>

                  <ScrollArea className="flex-1 mt-4">
                    {/* Overview Tab */}
                    <TabsContent value="overview" className="space-y-4 mt-0">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-500 flex items-center gap-1 uppercase tracking-wider font-semibold">
                            <User className="h-3 w-3" />
                            Contact Name
                          </Label>
                          <p className="font-medium text-slate-900">
                            {selectedCall.contact_name || "N/A"}
                          </p>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs text-slate-500 flex items-center gap-1 uppercase tracking-wider font-semibold">
                            <Phone className="h-3 w-3" />
                            Phone Number
                          </Label>
                          <div className="flex items-center gap-2">
                            <p className="font-mono font-medium text-slate-900">
                              {selectedCall.phone_number}
                            </p>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-slate-400 hover:text-blue-600"
                              onClick={() =>
                                copyToClipboard(
                                  selectedCall.phone_number,
                                  "phone",
                                )
                              }
                            >
                              {copiedField === "phone" ? (
                                <Check className="h-3 w-3 text-green-600" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs text-slate-500 flex items-center gap-1 uppercase tracking-wider font-semibold">
                            <BotIcon className="h-3 w-3" />
                            Bot
                          </Label>
                          <p className="font-medium text-slate-900">
                            {getBotName(selectedCall.bot_id)}
                          </p>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs text-slate-500 uppercase tracking-wider font-semibold">
                            Status
                          </Label>
                          <div className="mt-1">
                            <Badge
                              variant="outline"
                              className={cn(
                                "border-transparent",
                                statusConfig[selectedCall.status as CallStatus]?.color || "text-slate-500",
                                statusConfig[selectedCall.status as CallStatus]?.bgColor || "bg-slate-100"
                              )}
                            >
                              {statusConfig[selectedCall.status as CallStatus]?.label ||
                                selectedCall.status ||
                                "Unknown"}
                            </Badge>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs text-slate-500 uppercase tracking-wider font-semibold">
                            Duration
                          </Label>
                          <p className="font-mono font-medium text-slate-900">
                            {selectedCall.duration_seconds
                              ? `${Math.floor(selectedCall.duration_seconds / 60)}m ${selectedCall.duration_seconds % 60}s`
                              : "N/A"}
                          </p>
                        </div>

                        {selectedCall.started_at && (
                          <div className="space-y-1">
                            <Label className="text-xs text-slate-500 flex items-center gap-1 uppercase tracking-wider font-semibold">
                              <PhoneCall className="h-3 w-3" />
                              Started At
                            </Label>
                            <p className="font-medium text-xs text-slate-900">
                              {formatInUserTimezone(
                                selectedCall.started_at,
                                userTimezone,
                                "PPpp",
                              )}
                            </p>
                          </div>
                        )}
                        
                        {selectedCall.recording_url && (
                          <div className="space-y-1 col-span-full">
                            <Label className="text-xs text-slate-500 flex items-center gap-1 uppercase tracking-wider font-semibold">
                              <LinkIcon className="h-3 w-3" />
                              Recording URL
                            </Label>
                            <div className="flex items-center gap-2">
                              <a
                                href={selectedCall.recording_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-blue-600 hover:underline truncate"
                              >
                                {selectedCall.recording_url}
                              </a>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-slate-400 hover:text-blue-600"
                                onClick={() =>
                                  copyToClipboard(
                                    selectedCall.recording_url || "",
                                    "recording",
                                  )
                                }
                              >
                                {copiedField === "recording" ? (
                                  <Check className="h-3 w-3 text-green-600" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </TabsContent>

                    {/* Timeline Tab */}
                    <TabsContent value="timeline" className="space-y-4 mt-0">
                      <div className="space-y-6 ml-2 border-l-2 border-slate-100 pl-6 py-2">
                        {(selectedCall.created_at || selectedCall.started_at) && (
                          <div className="relative">
                            <div className="absolute -left-[31px] top-1 w-4 h-4 rounded-full bg-white border-2 border-blue-600" />
                            <div className="space-y-1">
                              <p className="text-sm font-semibold text-slate-900">Call Created</p>
                              <p className="text-xs text-slate-500">
                                {selectedCall.created_at
                                  ? formatInUserTimezone(
                                      selectedCall.created_at,
                                      userTimezone,
                                      "PPpp",
                                    )
                                  : "N/A"}
                              </p>
                            </div>
                          </div>
                        )}

                        {selectedCall.started_at && selectedCall.created_at !== selectedCall.started_at && (
                          <div className="relative">
                            <div className="absolute -left-[31px] top-1 w-4 h-4 rounded-full bg-white border-2 border-blue-600" />
                            <div className="space-y-1">
                              <p className="text-sm font-semibold text-slate-900">Call Started</p>
                              <p className="text-xs text-slate-500">
                                {formatInUserTimezone(
                                  selectedCall.started_at,
                                  userTimezone,
                                  "PPpp",
                                )}
                              </p>
                            </div>
                          </div>
                        )}

                        {selectedCall.completed_at && (
                          <div className="relative">
                            <div className="absolute -left-[31px] top-1 w-4 h-4 rounded-full bg-white border-2 border-green-600" />
                            <div className="space-y-1">
                              <p className="text-sm font-semibold text-slate-900">Call Completed</p>
                              <p className="text-xs text-slate-500">
                                {formatInUserTimezone(
                                  selectedCall.completed_at,
                                  userTimezone,
                                  "PPpp",
                                )}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </TabsContent>

                    {/* Content Tab */}
                    <TabsContent value="content" className="space-y-4 mt-0">
                      {selectedCall.transcript && (
                        <TranscriptDisplay
                          transcript={selectedCall.transcript}
                          metadata={selectedCall.metadata || selectedCall.webhook_response}
                          height="h-96"
                        />
                      )}

                      {selectedCall.recording_url && (
                        <div>
                          <Label className="text-sm font-medium flex items-center gap-2 mb-2 text-slate-900">
                            <Phone className="h-4 w-4 text-blue-600" />
                            Recording
                          </Label>
                          <div className="mt-2 space-y-2">
                            <audio
                              controls
                              className="w-full"
                              src={selectedCall.recording_url}
                              preload="metadata"
                            >
                              Your browser does not support the audio element.
                            </audio>
                          </div>
                        </div>
                      )}
                    </TabsContent>

                    {/* Technical Tab */}
                    <TabsContent value="technical" className="space-y-4 mt-0">
                      {selectedCall.metadata &&
                        Object.keys(selectedCall.metadata).length > 0 && (
                          <div>
                            <Label className="text-sm font-medium flex items-center gap-2 mb-2 text-slate-900">
                              <Database className="h-4 w-4 text-blue-600" />
                              Metadata
                            </Label>
                            <ScrollArea className="h-64 mt-2 p-4 bg-slate-50 rounded-lg border border-slate-200">
                              <pre className="text-xs font-mono text-slate-700 whitespace-pre-wrap break-words">
                                {JSON.stringify(selectedCall.metadata, null, 2)}
                              </pre>
                            </ScrollArea>
                          </div>
                        )}
                    </TabsContent>
                  </ScrollArea>
                </Tabs>
              </div>
            )}
          </DialogContent>
          </Dialog>

          {/* Send Email Dialog */}
          <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
          <DialogContent className="max-w-2xl bg-white">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mail className="h-5 w-5 text-blue-600" />
                  Send Email to Lead
                </div>
                {emailToSend && (
                  (('email' in emailToSend && (emailToSend.appointment_date || emailToSend.appointment_time)) ||
                   ('analysis' in emailToSend && emailToSend.analysis && typeof emailToSend.analysis === 'object' && (emailToSend.analysis as any).appointment)) && (
                    <Badge className="bg-purple-100 text-purple-700 border-purple-200">
                      <CalendarIcon className="h-3 w-3 mr-1" />
                      Appointment Scheduled
                    </Badge>
                  )
                )}
              </DialogTitle>
              <DialogDescription className="text-slate-500">
                Send an email to {emailToSend && ('email' in emailToSend)
                  ? emailToSend.name 
                  : emailToSend && ('contact_name' in emailToSend)
                    ? emailToSend.contact_name || emailToSend.phone_number
                    : "lead"}
                {emailToSend && (
                  (('email' in emailToSend && emailToSend.appointment_date) ||
                   ('analysis' in emailToSend && emailToSend.analysis && typeof emailToSend.analysis === 'object' && (emailToSend.analysis as any).appointment?.date)) && (
                    <span className="ml-2 text-purple-600 font-medium">
                      • Appointment: {(() => {
                        const date = ('email' in emailToSend) 
                          ? emailToSend.appointment_date 
                          : (emailToSend.analysis as any)?.appointment?.date;
                        if (!date) return "";
                        try {
                          const dateObj = new Date(date);
                          if (!isNaN(dateObj.getTime())) {
                            return dateObj.toLocaleDateString('en-US', { 
                              weekday: 'long', 
                              month: 'long', 
                              day: 'numeric' 
                            });
                          }
                        } catch {}
                        return date;
                      })()}
                    </span>
                  )
                )}
              </DialogDescription>
            </DialogHeader>
            {emailToSend && (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="from_email" className="text-slate-700">From Email</Label>
                  {emailsLoading ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                      <span className="text-sm text-slate-500">Loading emails...</span>
                    </div>
                  ) : safeEmails.length === 0 ? (
                    <div className="text-sm text-red-500 p-3 border border-red-200 bg-red-50 rounded-md">
                      No email addresses configured. Please add an email address in Settings.
                    </div>
                  ) : (
                    <Select
                      value={emailForm.fromEmail}
                      onValueChange={(value) => setEmailForm({ ...emailForm, fromEmail: value })}
                    >
                      <SelectTrigger className="bg-white border-slate-200">
                        <SelectValue placeholder="Select email address" />
                      </SelectTrigger>
                      <SelectContent>
                        {safeEmails.map((email) => (
                          <SelectItem key={email.id} value={email.email}>
                            {email.name || email.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="to_email" className="text-slate-700">
                    To Email <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="to_email"
                    type="email"
                    placeholder="lead@example.com"
                    value={emailForm.toEmail}
                    onChange={(e) => setEmailForm({ ...emailForm, toEmail: e.target.value })}
                    className="bg-white border-slate-200"
                  />
                  <p className="text-xs text-slate-500">
                    Lead phone: {emailToSend ? (emailToSend.phone_number || "N/A") : "N/A"}
                  </p>
                </div>

                {safeTemplates.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="email_template" className="text-slate-700">Email Template (Optional)</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const defaultTemplate = getDefaultTemplate();
                          if (defaultTemplate) {
                            handleTemplateSelect(defaultTemplate.id);
                          }
                        }}
                        className="text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                      >
                        <Sparkles className="mr-1 h-3 w-3" />
                        Quick Import Default
                      </Button>
                    </div>
                    <Select
                      value={selectedTemplateId}
                      onValueChange={handleTemplateSelect}
                    >
                      <SelectTrigger className="bg-white border-slate-200">
                        <SelectValue placeholder="Select a template or start from scratch" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Start from scratch</SelectItem>
                        {safeTemplates.map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.name} {template.is_default && "⭐"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="subject" className="text-slate-700">
                      Subject <span className="text-red-500">*</span>
                    </Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleGenerateEmailWithAI}
                      disabled={aiGenerating}
                      className="text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                    >
                      {aiGenerating ? (
                        <>
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Sparkles className="mr-1 h-3 w-3" />
                          Generate with AI
                        </>
                      )}
                    </Button>
                  </div>
                  <Input
                    id="subject"
                    placeholder="Email subject"
                    value={emailForm.subject}
                    onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })}
                    className="bg-white border-slate-200"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="body" className="text-slate-700">
                    Message <span className="text-red-500">*</span>
                  </Label>
                  <Textarea
                    id="body"
                    placeholder="Email message"
                    rows={8}
                    value={emailForm.body}
                    onChange={(e) => setEmailForm({ ...emailForm, body: e.target.value })}
                    className="bg-white border-slate-200"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEmailDialogOpen(false);
                      setEmailToSend(null);
                    }}
                    className="border-slate-200 text-slate-700"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSendEmail}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                    disabled={
                      sending ||
                      !emailForm.fromEmail ||
                      !emailForm.toEmail ||
                      !emailForm.subject ||
                      !emailForm.body ||
                      safeEmails.length === 0
                    }
                  >
                    {sending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 h-4 w-4" />
                        Send Email
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
          </Dialog>
        </div>
        </FeatureGate>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
