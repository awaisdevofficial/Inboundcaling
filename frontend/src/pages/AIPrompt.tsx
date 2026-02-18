import { useState, useEffect } from "react";
import { Sparkles, FileText, Loader2, Copy, Save, Building2, List, Edit2, Trash2, ChevronDown, ChevronUp, Upload, X, AlertCircle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useAIPrompts } from "@/hooks/useAIPrompts";
import { supabase } from "@/integrations/supabase/client";
import { uploadFile } from "@/lib/fileUpload";
import { extractDocumentProfile, generatePromptFromProfile, formatRawPrompt } from "@/services/aiPromptService";
import type { AgentPromptProfile } from "@/types/aiPrompt";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

export default function AIPrompt() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { prompts, loading: promptsLoading, createPrompt, updatePrompt, deletePrompt, getUserPrompts } = useAIPrompts();
  
  // Form state - AgentPromptProfile
  const [formData, setFormData] = useState<Partial<AgentPromptProfile>>({
    companyName: "",
    companyAddress: "",
    companyWebsite: "",
    companyEmail: "",
    companyPhone: "",
    businessIndustry: "",
    businessDescription: "",
    agentPurpose: "",
    callType: "Sales",
    targetAudience: "",
    callGoal: "Book Appointment",
    services: [],
    pricingInfo: "",
    businessHours: "",
    bookingMethod: "",
    appointmentRules: "",
    escalationProcess: "",
    requiredCustomerFields: [],
    faqs: [],
    objections: [],
    policies: [],
    tone: "Friendly",
    languages: [],
  });

  // Document upload
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionResult, setExtractionResult] = useState<{ extractedProfile: Partial<AgentPromptProfile>; missingFields: string[] } | null>(null);

  // Prompt generation
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [clarificationQuestions, setClarificationQuestions] = useState<string[]>([]);
  const [needsClarification, setNeedsClarification] = useState(false);
  const [clarificationAnswers, setClarificationAnswers] = useState<Record<string, string>>({});

  // Format Prompt Section
  const [promptToFormat, setPromptToFormat] = useState("");
  const [formattedPrompt, setFormattedPrompt] = useState("");
  const [isFormatting, setIsFormatting] = useState(false);

  // Save Dialog
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [savePromptName, setSavePromptName] = useState("");
  const [savePromptCategory, setSavePromptCategory] = useState("general");
  const [savePromptContent, setSavePromptContent] = useState("");
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [activeTab, setActiveTab] = useState("generate");

  // Edit Dialog
  const [editingPrompt, setEditingPrompt] = useState<any>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editPromptName, setEditPromptName] = useState("");
  const [editPromptCategory, setEditPromptCategory] = useState("general");
  const [editPromptContent, setEditPromptContent] = useState("");
  const [editBeginMessage, setEditBeginMessage] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [expandedPrompts, setExpandedPrompts] = useState<Set<string>>(new Set());

  // Service input fields
  const [newService, setNewService] = useState("");

  // Auto-populate from profile
  useEffect(() => {
    if (profile && !formData.companyName) {
      setFormData(prev => ({
        ...prev,
        companyName: profile.company_name || "",
        companyAddress: profile.company_address || "",
      }));
    }
  }, [profile]);

  // Handle file upload and extraction
  const handleFileUpload = async (file: File) => {
    if (!user) return;

    setUploadedFile(file);
    setIsUploading(true);
    setIsExtracting(true);

    try {
      // Step 1: Extract text from document via backend
      const formData = new FormData();
      formData.append("file", file);

      const extractResponse = await fetch(`${BACKEND_URL}/api/extract-document`, {
        method: "POST",
        body: formData,
      });

      if (!extractResponse.ok) {
        throw new Error("Failed to extract text from document");
      }

      const { extractedText } = await extractResponse.json();

      // Step 2: Upload file to Supabase storage
      const uploadResult = await uploadFile(file, "company-documents", "", user.id);
      if (uploadResult.error) {
        throw new Error(uploadResult.error);
      }

      // Step 3: Use Agent A to extract profile
      const extraction = await extractDocumentProfile(extractedText);
      
      setExtractionResult(extraction);

      // Step 4: Auto-fill form with extracted data
      setFormData(prev => ({
        ...prev,
        ...extraction.extractedProfile,
        // Merge arrays instead of replacing
        services: [...(prev.services || []), ...(extraction.extractedProfile.services || [])].filter((v, i, a) => a.indexOf(v) === i),
        faqs: [...(prev.faqs || []), ...(extraction.extractedProfile.faqs || [])].filter((v, i, a) => a.indexOf(v) === i),
        objections: [...(prev.objections || []), ...(extraction.extractedProfile.objections || [])].filter((v, i, a) => a.indexOf(v) === i),
        policies: [...(prev.policies || []), ...(extraction.extractedProfile.policies || [])].filter((v, i, a) => a.indexOf(v) === i),
      }));

      // Step 5: Save document to database (using RPC or direct insert with type assertion)
      try {
        await (supabase as any).from("company_documents").insert({
          user_id: user.id,
          file_name: file.name,
          file_type: file.type,
          file_url: uploadResult.url,
          extracted_text: extractedText,
          extracted_profile: extraction.extractedProfile,
          missing_fields: extraction.missingFields,
        });
      } catch (dbError) {
        // Table might not exist yet - that's okay, document was still processed
        console.warn("Could not save document to database:", dbError);
      }

      toast({
        title: "Document Processed",
        description: `Extracted ${extraction.missingFields.length} missing fields. Please review and fill them.`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to process document",
        variant: "destructive",
      });
      setUploadedFile(null);
    } finally {
      setIsUploading(false);
      setIsExtracting(false);
    }
  };

  // Handle prompt generation using Agent B
  const handleGeneratePrompt = async () => {
    // Validate required fields - only essential ones
    if (!formData.companyName || !formData.agentPurpose || !formData.targetAudience || !formData.callGoal || !formData.callType) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields (Company Name, Agent Purpose, Target Audience, Call Goal, Call Type)",
        variant: "destructive",
      });
      return;
    }

    if (!formData.businessIndustry && !formData.businessDescription) {
      toast({
        title: "Validation Error",
        description: "Please provide either Business Industry or Business Description",
        variant: "destructive",
      });
      return;
    }

    if (!formData.services || formData.services.length < 2) {
      toast({
        title: "Validation Error",
        description: "Please add at least 2 services",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    setNeedsClarification(false);
    setClarificationQuestions([]);

    try {
      // Use Agent B: Prompt Generator
      const result = await generatePromptFromProfile(formData);

      if (result.status === "needs_clarification") {
        setNeedsClarification(true);
        setClarificationQuestions(result.clarificationQuestions || []);
        toast({
          title: "Clarification Needed",
          description: "Please answer the clarification questions below",
          variant: "default",
        });
      } else {
        setGeneratedPrompt(result.finalPrompt);
        setNeedsClarification(false);
        toast({
          title: "Success",
          description: "Prompt generated successfully",
        });
      }
    } catch (error: any) {
      const errorMessage = error.message || "Failed to generate prompt";
      
      // Check if it's an API key issue
      if (errorMessage.includes("API key") || errorMessage.includes("401") || errorMessage.includes("Unauthorized") || errorMessage.includes("authentication")) {
        toast({
          title: "OpenAI API Key Error",
          description: errorMessage + " Please check your backend .env file and ensure OPENAI_API_KEY is set correctly. Get your key from https://platform.openai.com/api-keys",
          variant: "destructive",
          duration: 10000,
        });
      } else {
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
      }
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle clarification answers and regenerate
  const handleAnswerClarification = async () => {
    // Merge clarification answers into form data
    const updatedFormData = { ...formData };
    
    // Simple merge - in production, you'd want smarter merging
    Object.keys(clarificationAnswers).forEach(key => {
      if (key.toLowerCase().includes("service")) {
        updatedFormData.services = [...(updatedFormData.services || []), clarificationAnswers[key]];
      } else if (key.toLowerCase().includes("pricing")) {
        updatedFormData.pricingInfo = clarificationAnswers[key];
      } else if (key.toLowerCase().includes("hour")) {
        updatedFormData.businessHours = clarificationAnswers[key];
      }
      // Add more smart merging logic as needed
    });

    setFormData(updatedFormData);
    
    // Regenerate prompt
    setIsGenerating(true);
    try {
      const result = await generatePromptFromProfile(updatedFormData);
      
      if (result.status === "needs_clarification") {
        setClarificationQuestions(result.clarificationQuestions || []);
        toast({
          title: "More Information Needed",
          description: "Please provide additional details",
        });
      } else {
        setGeneratedPrompt(result.finalPrompt);
        setNeedsClarification(false);
        setClarificationAnswers({});
        toast({
          title: "Success",
          description: "Prompt generated successfully",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to generate prompt",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle prompt formatting using Agent C
  const handleFormatPrompt = async () => {
    if (!promptToFormat.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter a prompt to format",
        variant: "destructive",
      });
      return;
    }

    setIsFormatting(true);
    
    try {
      const formatted = await formatRawPrompt(promptToFormat);
      setFormattedPrompt(formatted);
      toast({
        title: "Success",
        description: "Prompt formatted successfully",
      });
    } catch (error: any) {
      const errorMessage = error.message || "Failed to format prompt";
      
      // Check if it's an API key issue
      if (errorMessage.includes("API key") || errorMessage.includes("401") || errorMessage.includes("Unauthorized") || errorMessage.includes("authentication")) {
        toast({
          title: "OpenAI API Key Error",
          description: errorMessage + " Please check your backend .env file and ensure OPENAI_API_KEY is set correctly. Get your key from https://platform.openai.com/api-keys",
          variant: "destructive",
          duration: 10000,
        });
      } else {
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
      }
    } finally {
      setIsFormatting(false);
    }
  };

  // Add service
  const addService = () => {
    if (newService.trim()) {
      setFormData(prev => ({
        ...prev,
        services: [...(prev.services || []), newService.trim()],
      }));
      setNewService("");
    }
  };

  // Remove service
  const removeService = (index: number) => {
    setFormData(prev => ({
      ...prev,
      services: prev.services?.filter((_, i) => i !== index) || [],
    }));
  };


  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: `${type} copied to clipboard`,
    });
  };

  const openSaveDialog = (content: string) => {
    setSavePromptContent(content);
    setSavePromptName(formData.companyName ? `${formData.companyName} - Prompt` : "New Prompt");
    setSaveDialogOpen(true);
  };

  const savePromptToAIPrompts = async () => {
    if (!user || !savePromptContent.trim() || !savePromptName.trim()) {
      toast({
        title: "Validation Error",
        description: "Please provide a name and prompt content",
        variant: "destructive",
      });
      return;
    }

    setSavingPrompt(true);
    try {
      const result = await createPrompt({
        name: savePromptName.trim(),
        category: savePromptCategory,
        system_prompt: savePromptContent,
        begin_message: null,
        state_prompts: {},
        tools_config: {},
        is_active: true,
        is_template: false,
      });

      if (result) {
        // Also save the agent profile (using type assertion for new fields)
        try {
          await (supabase as any)
            .from("ai_prompts")
            .update({
              agent_profile: formData,
              status: "ready",
              call_type: formData.callType,
              tone: formData.tone,
              call_goal: formData.callGoal,
            })
            .eq("id", result.id);
        } catch (updateError) {
          // Fields might not exist yet - that's okay, prompt was still saved
          console.warn("Could not update prompt with profile:", updateError);
        }

        setSaveDialogOpen(false);
        setSavePromptName("");
        setSavePromptContent("");
        toast({
          title: "Success",
          description: "Prompt saved successfully",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error Saving Prompt",
        description: error?.message || "Failed to save prompt",
        variant: "destructive",
      });
    } finally {
      setSavingPrompt(false);
    }
  };

  // Handle prompt actions
  const openEditDialog = (prompt: any) => {
    setEditingPrompt(prompt);
    setEditPromptName(prompt.name);
    setEditPromptCategory(prompt.category);
    setEditPromptContent(prompt.system_prompt);
    setEditBeginMessage(prompt.begin_message || "");
    setIsActive(prompt.is_active ?? true);
    setEditDialogOpen(true);
  };

  const handleUpdatePrompt = async () => {
    if (!editingPrompt || !editPromptName.trim() || !editPromptContent.trim()) {
      toast({
        title: "Validation Error",
        description: "Please provide a name and prompt content",
        variant: "destructive",
      });
      return;
    }

    try {
      const success = await updatePrompt(editingPrompt.id, {
        name: editPromptName.trim(),
        category: editPromptCategory,
        system_prompt: editPromptContent,
        begin_message: editBeginMessage || null,
        is_active: isActive,
      });

      if (success) {
        setEditDialogOpen(false);
        setEditingPrompt(null);
        toast({
          title: "Success",
          description: "Prompt updated successfully",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to update prompt",
        variant: "destructive",
      });
    }
  };

  const handleDeletePrompt = async (id: string) => {
    if (!confirm("Are you sure you want to delete this prompt?")) {
      return;
    }

    try {
      const success = await deletePrompt(id);
      if (success) {
        toast({
          title: "Success",
          description: "Prompt deleted successfully",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to delete prompt",
        variant: "destructive",
      });
    }
  };

  const loadPromptToEditor = (prompt: any) => {
    setGeneratedPrompt(prompt.system_prompt);
    setActiveTab("generate");
    toast({
      title: "Loaded",
      description: "Prompt loaded into editor",
    });
  };

  const togglePromptExpansion = (id: string) => {
    setExpandedPrompts((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const userPrompts = getUserPrompts();

  return (
    <ProtectedRoute>
      <DashboardLayout>
        <div className="space-y-8 pb-8">
          {/* Header Section */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="space-y-1">
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">AI Prompt Generator</h1>
              <p className="text-slate-500 text-base">Generate accurate, data-driven AI prompts with 3-layer agent system</p>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full max-w-lg grid-cols-3">
              <TabsTrigger value="generate">
                <Sparkles className="mr-2 h-4 w-4" />
                Prompt Creator
              </TabsTrigger>
              <TabsTrigger value="format">
                <FileText className="mr-2 h-4 w-4" />
                Prompt Formatter
              </TabsTrigger>
              <TabsTrigger value="my-prompts">
                <List className="mr-2 h-4 w-4" />
                My Prompts
              </TabsTrigger>
            </TabsList>

            <TabsContent value="generate" className="mt-6">
              <Card className="border-slate-200 shadow-sm bg-white">
                <CardHeader className="border-b border-slate-100 pb-4">
                  <CardTitle className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                    <Sparkles className="h-5 w-5 text-blue-600" />
                    AI Prompt Generation (3-Layer System)
                  </CardTitle>
                  <CardDescription className="text-slate-500 mt-1">
                    Upload a document or fill the form manually. The system uses 3 AI agents to ensure accuracy.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                  {/* Document Upload Section */}
                  <div className="space-y-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-center gap-2">
                      <Upload className="h-4 w-4 text-blue-600" />
                      <Label className="text-base font-semibold">Upload Company Document (Optional)</Label>
                    </div>
                    <p className="text-sm text-slate-600">
                      Upload a PDF, DOCX, or TXT file containing your company information. The system will automatically extract and fill the form.
                    </p>
                    <div className="flex items-center gap-4">
                      <input
                        type="file"
                        accept=".pdf,.docx,.doc,.txt"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(file);
                        }}
                        className="hidden"
                        id="document-upload"
                        disabled={isUploading || isExtracting}
                      />
                      <label htmlFor="document-upload">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={isUploading || isExtracting}
                          className="cursor-pointer"
                        >
                          {isUploading || isExtracting ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              {isExtracting ? "Extracting..." : "Uploading..."}
                            </>
                          ) : (
                            <>
                              <Upload className="mr-2 h-4 w-4" />
                              Upload Document
                            </>
                          )}
                        </Button>
                      </label>
                      {uploadedFile && (
                        <div className="flex items-center gap-2 text-sm">
                          <FileText className="h-4 w-4 text-green-600" />
                          <span>{uploadedFile.name}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setUploadedFile(null)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                    {extractionResult && extractionResult.missingFields.length > 0 && (
                      <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          <strong>Missing Fields:</strong> {extractionResult.missingFields.join(", ")}. Please fill these manually.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>

                  {/* Company Information Section - Essential Only */}
                  <div className="space-y-4 p-4 bg-muted/30 rounded-lg border">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      <Label className="text-base font-semibold">Company Information</Label>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="companyName">
                          Company Name <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="companyName"
                          value={formData.companyName || ""}
                          onChange={(e) => setFormData(prev => ({ ...prev, companyName: e.target.value }))}
                          placeholder="e.g., NSOL BPO"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Business & Agent Setup - Essential Fields Only */}
                  <div className="space-y-4 p-4 bg-muted/30 rounded-lg border">
                    <Label className="text-base font-semibold">Business & Agent Setup</Label>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="businessIndustry">
                          Business Industry
                        </Label>
                        <Input
                          id="businessIndustry"
                          value={formData.businessIndustry || ""}
                          onChange={(e) => setFormData(prev => ({ ...prev, businessIndustry: e.target.value }))}
                          placeholder="e.g., BPO, Education, Real Estate"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="callType">
                          Call Type <span className="text-destructive">*</span>
                        </Label>
                        <Select
                          value={formData.callType}
                          onValueChange={(value: AgentPromptProfile["callType"]) => 
                            setFormData(prev => ({ ...prev, callType: value }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Sales">Sales</SelectItem>
                            <SelectItem value="Support">Support</SelectItem>
                            <SelectItem value="Booking">Booking</SelectItem>
                            <SelectItem value="Billing">Billing</SelectItem>
                            <SelectItem value="Complaint">Complaint</SelectItem>
                            <SelectItem value="Mixed">Mixed</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="businessDescription">
                          Business Description <span className="text-xs text-muted-foreground">(Required if Industry not provided)</span>
                        </Label>
                        <Textarea
                          id="businessDescription"
                          value={formData.businessDescription || ""}
                          onChange={(e) => setFormData(prev => ({ ...prev, businessDescription: e.target.value }))}
                          placeholder="Short summary of your business"
                          className="min-h-[80px]"
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="agentPurpose">
                          Agent Purpose <span className="text-destructive">*</span>
                        </Label>
                        <Textarea
                          id="agentPurpose"
                          value={formData.agentPurpose || ""}
                          onChange={(e) => setFormData(prev => ({ ...prev, agentPurpose: e.target.value }))}
                          placeholder="e.g., Handle inbound customer support calls"
                          className="min-h-[80px]"
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="targetAudience">
                          Target Audience <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="targetAudience"
                          value={formData.targetAudience || ""}
                          onChange={(e) => setFormData(prev => ({ ...prev, targetAudience: e.target.value }))}
                          placeholder="e.g., Customers calling for help or inquiries"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="callGoal">
                          Call Goal <span className="text-destructive">*</span>
                        </Label>
                        <Select
                          value={formData.callGoal}
                          onValueChange={(value: AgentPromptProfile["callGoal"]) => 
                            setFormData(prev => ({ ...prev, callGoal: value }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Book Appointment">Book Appointment</SelectItem>
                            <SelectItem value="Close Sale">Close Sale</SelectItem>
                            <SelectItem value="Qualify Lead">Qualify Lead</SelectItem>
                            <SelectItem value="Collect Information">Collect Information</SelectItem>
                            <SelectItem value="Support Resolution">Support Resolution</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="tone">
                          Tone <span className="text-destructive">*</span>
                        </Label>
                        <Select
                          value={formData.tone}
                          onValueChange={(value: AgentPromptProfile["tone"]) => 
                            setFormData(prev => ({ ...prev, tone: value }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Friendly">Friendly</SelectItem>
                            <SelectItem value="Professional">Professional</SelectItem>
                            <SelectItem value="Empathetic">Empathetic</SelectItem>
                            <SelectItem value="Energetic">Energetic</SelectItem>
                            <SelectItem value="Strict">Strict</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  {/* Services Section */}
                  <div className="space-y-4 p-4 bg-muted/30 rounded-lg border">
                    <Label className="text-base font-semibold">
                      Services <span className="text-destructive">*</span> (Minimum 2 required)
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        value={newService}
                        onChange={(e) => setNewService(e.target.value)}
                        onKeyPress={(e) => e.key === "Enter" && addService()}
                        placeholder="Add a service"
                      />
                      <Button type="button" onClick={addService}>Add</Button>
                    </div>
                    {formData.services && formData.services.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {formData.services.map((service, index) => (
                          <div key={index} className="flex items-center gap-2 bg-blue-100 px-3 py-1 rounded-full">
                            <span className="text-sm">{service}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-5 w-5 p-0"
                              onClick={() => removeService(index)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Generate Button */}
                  <Button
                    onClick={handleGeneratePrompt}
                    disabled={isGenerating}
                    className="w-full"
                    size="lg"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        Generate Prompt
                      </>
                    )}
                  </Button>

                  {/* Clarification Questions */}
                  {needsClarification && clarificationQuestions.length > 0 && (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        <div className="space-y-4">
                          <p className="font-semibold">Please answer these questions to generate the prompt:</p>
                          {clarificationQuestions.map((question, index) => (
                            <div key={index} className="space-y-2">
                              <Label>{question}</Label>
                              <Textarea
                                value={clarificationAnswers[question] || ""}
                                onChange={(e) => setClarificationAnswers(prev => ({ ...prev, [question]: e.target.value }))}
                                placeholder="Your answer..."
                                className="min-h-[60px]"
                              />
                            </div>
                          ))}
                          <Button onClick={handleAnswerClarification} className="w-full">
                            Submit Answers & Regenerate
                          </Button>
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Generated Prompt */}
                  {generatedPrompt && (
                    <>
                      <Separator />
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <Label>Generated Prompt</Label>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openSaveDialog(generatedPrompt)}
                            >
                              <Save className="mr-2 h-4 w-4" />
                              Save
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => copyToClipboard(generatedPrompt, "Prompt")}
                            >
                              <Copy className="mr-2 h-4 w-4" />
                              Copy
                            </Button>
                          </div>
                        </div>
                        <Textarea
                          value={generatedPrompt}
                          onChange={(e) => setGeneratedPrompt(e.target.value)}
                          className="min-h-[400px] font-mono text-sm"
                        />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="format" className="mt-6">
              <Card className="border-slate-200 shadow-sm bg-white">
                <CardHeader className="border-b border-slate-100 pb-4">
                  <CardTitle className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                    <FileText className="h-5 w-5 text-blue-600" />
                    Prompt Formatter (Agent C)
                  </CardTitle>
                  <CardDescription className="text-slate-500 mt-1">
                    Convert your raw unstructured prompt into a clear, structured, professional AI prompt
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="prompt_to_format">
                      Raw Prompt to Format <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                      id="prompt_to_format"
                      placeholder='e.g., "make me a prompt for calling leads and selling my service"'
                      value={promptToFormat}
                      onChange={(e) => setPromptToFormat(e.target.value)}
                      className="min-h-[200px]"
                    />
                  </div>

                  <Button
                    onClick={handleFormatPrompt}
                    disabled={isFormatting || !promptToFormat.trim()}
                    className="w-full"
                    size="lg"
                  >
                    {isFormatting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Formatting...
                      </>
                    ) : (
                      <>
                        <FileText className="mr-2 h-4 w-4" />
                        Format Prompt
                      </>
                    )}
                  </Button>

                  {formattedPrompt && (
                    <>
                      <Separator />
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <Label>Formatted Prompt</Label>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openSaveDialog(formattedPrompt)}
                            >
                              <Save className="mr-2 h-4 w-4" />
                              Save
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => copyToClipboard(formattedPrompt, "Formatted prompt")}
                            >
                              <Copy className="mr-2 h-4 w-4" />
                              Copy
                            </Button>
                          </div>
                        </div>
                        <Textarea
                          value={formattedPrompt}
                          onChange={(e) => setFormattedPrompt(e.target.value)}
                          className="min-h-[400px] font-mono text-sm"
                        />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="my-prompts" className="mt-6">
              <Card className="border-slate-200 shadow-sm bg-white">
                <CardHeader className="border-b border-slate-100 pb-4">
                  <CardTitle className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                    <List className="h-5 w-5 text-blue-600" />
                    My Prompts
                  </CardTitle>
                  <CardDescription className="text-slate-500 mt-1">
                    View and manage all your saved prompts
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {promptsLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : userPrompts.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <List className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No prompts saved yet</p>
                      <p className="text-sm mt-2">Generate or format a prompt to save it here</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {userPrompts.map((prompt) => {
                        const isExpanded = expandedPrompts.has(prompt.id);
                        const promptPreview = prompt.system_prompt?.substring(0, 150) || "";
                        
                        return (
                          <Card key={prompt.id} className="border-border/50 hover:border-primary/50 transition-colors">
                            <CardHeader 
                              className="pb-3 cursor-pointer"
                              onClick={() => togglePromptExpansion(prompt.id)}
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    {isExpanded ? (
                                      <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                    ) : (
                                      <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                    )}
                                    <CardTitle className="text-lg flex items-center gap-2">
                                      {prompt.name}
                                      <span className={`text-xs px-2 py-1 rounded-full ${
                                        prompt.is_active
                                          ? "bg-green-500/20 text-green-600 dark:text-green-400"
                                          : "bg-gray-500/20 text-gray-600 dark:text-gray-400"
                                      }`}>
                                        {prompt.is_active ? "Active" : "Inactive"}
                                      </span>
                                    </CardTitle>
                                  </div>
                                  <CardDescription className="mt-1 flex items-center gap-4">
                                    <span>Category: {prompt.category}</span>
                                    <span>•</span>
                                    <span>Usage: {prompt.usage_count || 0} times</span>
                                    <span>•</span>
                                    <span>Created: {new Date(prompt.created_at).toLocaleDateString()}</span>
                                  </CardDescription>
                                  {!isExpanded && promptPreview && (
                                    <div className="mt-2">
                                      <p className="text-sm text-muted-foreground line-clamp-2 font-mono">
                                        {promptPreview}...
                                      </p>
                                    </div>
                                  )}
                                </div>
                                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => loadPromptToEditor(prompt)}
                                    title="Load into editor"
                                  >
                                    <FileText className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openEditDialog(prompt)}
                                    title="Edit prompt"
                                  >
                                    <Edit2 className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleDeletePrompt(prompt.id)}
                                    title="Delete prompt"
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              </div>
                            </CardHeader>
                            {isExpanded && (
                              <CardContent className="space-y-4 pt-0">
                                <div>
                                  <Label className="text-sm font-semibold mb-2 block">System Prompt:</Label>
                                  <div className="p-4 bg-muted/30 rounded-lg border border-border/50 max-h-96 overflow-y-auto">
                                    <pre className="text-sm whitespace-pre-wrap font-mono">
                                      {prompt.system_prompt}
                                    </pre>
                                  </div>
                                </div>
                                {prompt.begin_message && (
                                  <div>
                                    <Label className="text-sm font-semibold mb-2 block">Begin Message:</Label>
                                    <div className="p-3 bg-muted/30 rounded-lg border border-border/50">
                                      <p className="text-sm">{prompt.begin_message}</p>
                                    </div>
                                  </div>
                                )}
                                <div className="flex gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => copyToClipboard(prompt.system_prompt || "", "Prompt")}
                                    className="flex-1"
                                  >
                                    <Copy className="mr-2 h-4 w-4" />
                                    Copy Prompt
                                  </Button>
                                </div>
                              </CardContent>
                            )}
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Save Dialog */}
          <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Save Prompt</DialogTitle>
                <DialogDescription>
                  Save your prompt to ai_prompts for later use
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="save-name">Name</Label>
                  <Input
                    id="save-name"
                    value={savePromptName}
                    onChange={(e) => setSavePromptName(e.target.value)}
                    placeholder="e.g., Sales Agent Prompt"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="save-category">Category</Label>
                  <Select value={savePromptCategory} onValueChange={setSavePromptCategory}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">General</SelectItem>
                      <SelectItem value="sales">Sales</SelectItem>
                      <SelectItem value="support">Support</SelectItem>
                      <SelectItem value="appointment">Appointment</SelectItem>
                      <SelectItem value="follow-up">Follow-up</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Prompt Preview</Label>
                  <div className="p-3 bg-muted/30 rounded-lg border border-border/50 max-h-40 overflow-y-auto">
                    <pre className="text-sm whitespace-pre-wrap font-mono">
                      {savePromptContent.substring(0, 500)}
                      {savePromptContent.length > 500 && "..."}
                    </pre>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => setSaveDialogOpen(false)}
                    disabled={savingPrompt}
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={savePromptToAIPrompts} 
                    disabled={!savePromptName.trim() || savingPrompt}
                  >
                    {savingPrompt ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Save
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Edit Dialog */}
          <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit Prompt</DialogTitle>
                <DialogDescription>
                  Update your prompt details
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Name</Label>
                  <Input
                    id="edit-name"
                    value={editPromptName}
                    onChange={(e) => setEditPromptName(e.target.value)}
                    placeholder="Enter prompt name"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-category">Category</Label>
                    <Select value={editPromptCategory} onValueChange={setEditPromptCategory}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general">General</SelectItem>
                        <SelectItem value="sales">Sales</SelectItem>
                        <SelectItem value="support">Support</SelectItem>
                        <SelectItem value="appointment">Appointment</SelectItem>
                        <SelectItem value="follow-up">Follow-up</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-active">Status</Label>
                    <Select value={isActive ? "active" : "inactive"} onValueChange={(v) => setIsActive(v === "active")}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-content">System Prompt</Label>
                  <Textarea
                    id="edit-content"
                    value={editPromptContent}
                    onChange={(e) => setEditPromptContent(e.target.value)}
                    className="min-h-[300px] font-mono text-sm"
                    placeholder="Enter system prompt"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-begin-message">Begin Message (Optional)</Label>
                  <Textarea
                    id="edit-begin-message"
                    value={editBeginMessage}
                    onChange={(e) => setEditBeginMessage(e.target.value)}
                    className="min-h-[80px]"
                    placeholder="Enter begin message"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setEditDialogOpen(false);
                      setEditingPrompt(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleUpdatePrompt} 
                    disabled={!editPromptName.trim() || !editPromptContent.trim()}
                  >
                    <Save className="mr-2 h-4 w-4" />
                    Save Changes
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
