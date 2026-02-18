import { useState, useEffect, useRef } from "react";
import { BookOpen, Trash2, Plus, Upload, File, X, Loader2, CheckCircle2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useProfile } from "@/hooks/useProfile";

interface KnowledgeBase {
  id: string;
  knowledge_base_id: string;
  knowledge_base_name: string;
  status: string;
  knowledge_base_texts?: Array<{ title: string; text: string }>;
  knowledge_base_urls?: string[];
  enable_auto_refresh?: boolean;
  created_at: string;
}

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB in bytes

export default function KnowledgeBases() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [error, setError] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState({
    knowledge_base_name: "",
    knowledge_base_texts: [] as Array<{ title: string; text: string }>,
    knowledge_base_urls: [] as string[],
    enable_auto_refresh: false,
  });

  useEffect(() => {
    if (user) {
      fetchKnowledgeBases();
    }
  }, [user]);

  const fetchKnowledgeBases = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      setError("");
      const { data, error } = await supabase
        .from("knowledge_bases")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setKnowledgeBases(data || []);
    } catch (error: any) {
      // Removed console.error for security
      const errorMessage = error?.message || "Failed to load knowledge bases";
      setError(errorMessage);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateKnowledgeBase = async () => {
    try {
      setError("");
      setCreating(true);
      if (!user) return;

      // Validate knowledge base name
      if (!formData.knowledge_base_name.trim()) {
        setError("Knowledge base name is required");
        setCreating(false);
        return;
      }

      // Get user's Genie API key from profile
      if (!profile?.retell_api_key) {
        setError("Genie API key not found. Please add your Genie API key in your profile settings.");
        setCreating(false);
        toast({
          title: "Error",
          description: "Genie API key not found. Please add your Genie API key in your profile settings.",
          variant: "destructive",
        });
        return;
      }

      // Validate: file is required
      if (!selectedFile) {
        setError("Please upload a document file to create the knowledge base.");
        setCreating(false);
        return;
      }

      // Create knowledge base using Genie REST API with file upload
      const formDataPayload = new FormData();
      formDataPayload.append("knowledge_base_name", formData.knowledge_base_name);
      formDataPayload.append("enable_auto_refresh", String(formData.enable_auto_refresh));
      formDataPayload.append("knowledge_base_files", selectedFile);

      const response = await fetch("https://api.retellai.com/create-knowledge-base", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${profile.retell_api_key}`,
        },
        body: formDataPayload,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error_message || errorData.error || `Genie API error: ${response.status}`);
      }
      const knowledgeBaseResponse = await response.json();

      if (!knowledgeBaseResponse.knowledge_base_id) {
        throw new Error("Failed to create knowledge base: No knowledge_base_id returned");
      }

      // Save knowledge base to database with all details
      const { data, error: dbError } = await supabase
        .from("knowledge_bases")
        .insert({
          user_id: user.id,
          knowledge_base_id: knowledgeBaseResponse.knowledge_base_id,
          knowledge_base_name: formData.knowledge_base_name,
          status: "complete", // Set to complete if creation was successful
          knowledge_base_texts: null,
          knowledge_base_urls: null,
          enable_auto_refresh: formData.enable_auto_refresh,
        })
        .select()
        .single();

      if (dbError) throw dbError;

      setShowCreateModal(false);
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setFormData({
        knowledge_base_name: "",
        knowledge_base_texts: [],
        knowledge_base_urls: [],
        enable_auto_refresh: false,
      });
      toast({
        title: "Success",
        description: "Knowledge base created successfully!",
      });
      fetchKnowledgeBases();
    } catch (error: any) {
      // Removed console.error for security
      const errorMessage = error?.message || "An error occurred while creating the knowledge base";
      setError(errorMessage);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteKnowledgeBase = async (kbId: string) => {
    if (!window.confirm("Are you sure you want to delete this knowledge base?")) {
      return;
    }
    if (!user) return;
    
    let retellDeleted = false;
    let supabaseDeleted = false;
    let retellError: any = null;
    let supabaseError: any = null;
    
    try {
      setError("");
      
      // Get user's Genie API key from profile
      if (!profile?.retell_api_key) {
        setError("Genie API key not found. Please add your Genie API key in your profile settings.");
        toast({
          title: "Error",
          description: "Genie API key not found. Please add your Genie API key in your profile settings.",
          variant: "destructive",
        });
        return;
      }

      // First, get the knowledge base record to retrieve the Genie knowledge_base_id
      const { data: kbData, error: fetchError } = await supabase
        .from("knowledge_bases")
        .select("knowledge_base_id")
        .eq("id", kbId)
        .eq("user_id", user.id)
        .single();

      if (fetchError) throw fetchError;
      if (!kbData?.knowledge_base_id) {
        throw new Error("Knowledge base ID not found");
      }

      const retellKnowledgeBaseId = kbData.knowledge_base_id;

      // Delete knowledge base from Genie via REST API
      try {
        const response = await fetch(`https://api.retellai.com/delete-knowledge-base/${retellKnowledgeBaseId}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${profile.retell_api_key}`,
          },
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || errorData.error || `Genie API error: ${response.status}`);
        }
        retellDeleted = true;
      } catch (error: any) {
        retellError = error;
        // Removed console.error for security
      }

      // Delete from Supabase database (attempt regardless of Genie deletion result)
      try {
        const { error: dbError } = await supabase
          .from("knowledge_bases")
          .delete()
          .eq("id", kbId)
          .eq("user_id", user.id); // Add user_id filter for security

        if (dbError) {
          supabaseError = dbError;
          throw dbError;
        }
        supabaseDeleted = true;
      } catch (error: any) {
        supabaseError = error;
        // Removed console.error for security
      }

      // Check results and provide appropriate feedback
      if (retellDeleted && supabaseDeleted) {
        // Both deletions successful
        fetchKnowledgeBases();
        toast({
          title: "Success",
          description: "Knowledge base deleted successfully from both Genie and database",
        });
      } else if (supabaseDeleted && !retellDeleted) {
        // Supabase deleted but Genie failed
        fetchKnowledgeBases();
        toast({
          title: "Partial Success",
          description: "Knowledge base deleted from database, but failed to delete from Genie. You may need to delete it manually from Genie.",
          variant: "destructive",
        });
        setError(`Genie deletion failed: ${retellError?.message || "Unknown error"}`);
      } else if (retellDeleted && !supabaseDeleted) {
        // Genie deleted but Supabase failed
        toast({
          title: "Partial Success",
          description: "Knowledge base deleted from Genie, but failed to delete from database. You may need to delete it manually from database.",
          variant: "destructive",
        });
        setError(`Database deletion failed: ${supabaseError?.message || "Unknown error"}`);
      } else {
        // Both deletions failed
        throw new Error(
          `Both deletions failed. Genie: ${retellError?.message || "Unknown error"}, Database: ${supabaseError?.message || "Unknown error"}`
        );
      }
    } catch (error: any) {
      // Removed console.error for security
      const errorMessage = error?.message || "Failed to delete knowledge base";
      setError(errorMessage);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type - only allow document files
    const allowedExtensions = ['.pdf', '.doc', '.docx', '.txt', '.md'];
    const fileName = file.name.toLowerCase();
    const isValidFileType = allowedExtensions.some(ext => fileName.endsWith(ext));
    
    if (!isValidFileType) {
      setError(`Invalid file type. Only document files are allowed: PDF, DOC, DOCX, TXT, MD`);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    // Validate file size (100 MB limit)
    if (file.size > MAX_FILE_SIZE) {
      setError(`File size exceeds the maximum limit of 100 MB. Selected file is ${(file.size / (1024 * 1024)).toFixed(2)} MB.`);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    setSelectedFile(file);
    setError("");
  };


  const handleRemoveFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
  };

  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case "complete":
        return "bg-success/10 text-success border border-success/20";
      case "in_progress":
      case "refreshing_in_progress":
        return "bg-primary/10 text-primary border border-primary/20";
      case "error":
        return "bg-destructive/10 text-destructive border border-destructive/20";
      default:
        return "bg-muted text-muted-foreground border border-border/50";
    }
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <DashboardLayout>
          <div className="flex items-center justify-center h-[400px]">
            <div className="border-[3px] border-muted border-t-primary rounded-full w-6 h-6 animate-spin" />
          </div>
        </DashboardLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <DashboardLayout>
        <div className="space-y-8 pb-8">
          {/* Header Section */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="space-y-1">
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Knowledge Bases</h1>
              <p className="text-slate-500 text-base">Create and manage knowledge bases for your AI agents</p>
            </div>
            <Button 
              onClick={() => setShowCreateModal(true)} 
              className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all hover:shadow-md"
            >
              <Plus className="mr-2 h-4 w-4" /> Create Knowledge Base
            </Button>
          </div>

          {/* Stats Section */}
          {knowledgeBases.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">Total Knowledge Bases</p>
                    <h3 className="text-2xl font-bold text-slate-900 mt-1">{knowledgeBases.length}</h3>
                  </div>
                  <div className="p-3 bg-blue-50 rounded-xl">
                    <BookOpen className="h-5 w-5 text-blue-600" />
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">Complete</p>
                    <h3 className="text-2xl font-bold text-slate-900 mt-1">{knowledgeBases.filter(kb => kb.status === "complete").length}</h3>
                  </div>
                  <div className="p-3 bg-emerald-50 rounded-xl">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">In Progress</p>
                    <h3 className="text-2xl font-bold text-slate-900 mt-1">{knowledgeBases.filter(kb => kb.status === "in_progress" || kb.status === "refreshing_in_progress").length}</h3>
                  </div>
                  <div className="p-3 bg-amber-50 rounded-xl">
                    <Loader2 className="h-5 w-5 text-amber-600" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive rounded-[10px] text-destructive text-sm mb-6 flex justify-between items-center">
              <span>{error}</span>
              <button
                onClick={() => setError("")}
                className="bg-transparent border-none text-2xl text-destructive cursor-pointer p-0 w-6 h-6 flex items-center justify-center hover:bg-destructive/10 rounded"
              >
                ×
              </button>
            </div>
          )}

          {/* Knowledge Bases Grid */}
          <div>
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Your Knowledge Bases</h2>
              <p className="text-sm text-slate-500 mt-1">Manage your knowledge bases and their content</p>
            </div>
            {knowledgeBases.length === 0 ? (
              <Card className="border-slate-200 shadow-sm bg-white">
                <CardContent className="flex flex-col items-center justify-center p-16 text-center">
                  <div className="w-16 h-16 text-slate-300 mb-6">
                    <BookOpen className="w-full h-full" />
                  </div>
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">No knowledge bases yet</h3>
                  <p className="text-sm text-slate-500 mb-6">
                    Create your first knowledge base to provide information to your AI agents
                  </p>
                  <Button 
                    onClick={() => setShowCreateModal(true)} 
                    className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                  >
                    <Plus className="mr-2 h-4 w-4" /> Create Knowledge Base
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {knowledgeBases.map((kb) => (
                  <Card
                    key={kb.id}
                    className="border-slate-200 shadow-sm hover:shadow-md transition-all duration-200 bg-white"
                  >
                  <CardHeader className="flex flex-row justify-between items-start mb-4 border-b border-slate-100 pb-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-slate-900 mb-2 m-0">{kb.knowledge_base_name}</h3>
                      <span
                        className={`inline-block px-3 py-1 rounded-lg text-xs font-medium capitalize ${getStatusBadgeStyle(kb.status)}`}
                      >
                        {kb.status.replace("_", " ")}
                      </span>
                    </div>
                    <button
                      onClick={() => handleDeleteKnowledgeBase(kb.id)}
                      className="bg-transparent border-none p-2 cursor-pointer rounded-md text-muted-foreground flex items-center justify-center transition-all hover:bg-destructive/10 hover:text-destructive"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col gap-3 pt-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-500">Genie ID:</span>
                        <span className="text-sm font-semibold text-slate-900 font-mono">{kb.knowledge_base_id}</span>
                      </div>
                      {kb.knowledge_base_texts && kb.knowledge_base_texts.length > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-slate-500">Texts:</span>
                          <span className="text-sm font-semibold text-slate-900">{kb.knowledge_base_texts.length}</span>
                        </div>
                      )}
                      {kb.knowledge_base_urls && kb.knowledge_base_urls.length > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-slate-500">URLs:</span>
                          <span className="text-sm font-semibold text-slate-900">{kb.knowledge_base_urls.length}</span>
                        </div>
                      )}
                      {kb.enable_auto_refresh && (
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-slate-500">Auto Refresh:</span>
                          <span className="text-sm font-semibold text-emerald-600">Enabled</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                        <span className="text-sm text-slate-500">Created:</span>
                        <span className="text-sm font-semibold text-slate-900">
                          {new Date(kb.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          </div>

          {/* Create Knowledge Base Modal */}
          <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Knowledge Base</DialogTitle>
                <DialogDescription>
                  Create a new knowledge base by uploading a document file (PDF, DOC, DOCX, TXT, MD). Maximum file size is 100 MB.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Knowledge Base Name *</Label>
                  <Input
                    value={formData.knowledge_base_name}
                    onChange={(e) =>
                      setFormData({ ...formData, knowledge_base_name: e.target.value })
                    }
                    placeholder="Enter knowledge base name"
                  />
                </div>

                {/* File Upload Section */}
                <div>
                  <Label>Upload Document (Max 100 MB)</Label>
                  <div className="mt-2">
                    {!selectedFile ? (
                      <div className="flex items-center justify-center w-full">
                        <label
                          htmlFor="file-upload"
                          className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-lg cursor-pointer bg-secondary/50 hover:bg-secondary transition-colors"
                        >
                          <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            <Upload className="w-10 h-10 mb-3 text-muted-foreground" />
                            <p className="mb-2 text-sm text-muted-foreground">
                              <span className="font-semibold">Click to upload</span> or drag and drop
                            </p>
                            <p className="text-xs text-muted-foreground/70">PDF, DOC, DOCX, TXT, MD (MAX. 100 MB)</p>
                          </div>
                          <input
                            id="file-upload"
                            ref={fileInputRef}
                            type="file"
                            className="hidden"
                            onChange={handleFileSelect}
                            accept=".pdf,.doc,.docx,.txt,.md"
                          />
                        </label>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between p-4 border border-border/50 rounded-lg bg-secondary/50">
                        <div className="flex items-center gap-3">
                          <File className="w-5 h-5 text-primary" />
                          <div>
                            <p className="text-sm font-medium text-foreground">{selectedFile.name}</p>
                            <p className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
                          </div>
                        </div>
                        <button
                          onClick={handleRemoveFile}
                          className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    )}
                  </div>
                  {selectedFile && (
                    <div className="mt-3">
                      <p className="text-sm text-muted-foreground">
                        File will be uploaded when you create the knowledge base.
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="auto-refresh"
                    checked={formData.enable_auto_refresh}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, enable_auto_refresh: checked === true })
                    }
                  />
                  <Label htmlFor="auto-refresh" className="cursor-pointer">
                    Enable Auto Refresh
                  </Label>
                </div>
                <div className="flex justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowCreateModal(false);
                      setSelectedFile(null);
                      setError("");
                      if (fileInputRef.current) {
                        fileInputRef.current.value = "";
                      }
                      setFormData({
                        knowledge_base_name: "",
                        knowledge_base_texts: [],
                        knowledge_base_urls: [],
                        enable_auto_refresh: false,
                      });
                    }}
                    disabled={creating}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleCreateKnowledgeBase} disabled={creating}>
                    {creating ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      "Create"
                    )}
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
