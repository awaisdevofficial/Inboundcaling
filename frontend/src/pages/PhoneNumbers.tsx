import { useState, useEffect, useCallback } from "react";
import { Phone, Loader2, Plus, X, Upload, CheckCircle2, Trash2, Clock, Maximize2, Minimize2, Play, Link2, Unlink, User, Bot } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useBots } from "@/hooks/useBots";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { callWebhook } from "@/lib/webhook";
import { Bot as BotType } from "@/types/database";
import { Profile } from "@/types/database";

interface ImportedNumber {
  id?: string;
  phone_number: string;
  termination_uri: string;
  name?: string;
  status?: string;
  importStatus?: "pending" | "importing" | "success" | "failed";
  importError?: string;
  linked_agent?: {
    id: string;
    name: string;
    user_id: string;
  } | null;
  owner?: {
    user_id: string;
    email: string | null;
    full_name: string | null;
  } | null;
}

export default function PhoneNumbers() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { bots, refetch: refetchBots } = useBots();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [terminationUri, setTerminationUri] = useState("");
  const [numberName, setNumberName] = useState("");
  const [importedNumbers, setImportedNumbers] = useState<ImportedNumber[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVideoExpanded, setIsVideoExpanded] = useState(false);
  const [linkingNumberId, setLinkingNumberId] = useState<string | null>(null);
  const [userProfiles, setUserProfiles] = useState<Record<string, Profile>>({});

  // Helper function to normalize phone number to E.164 format
  const normalizePhoneNumber = useCallback((phone: string): string => {
    // Remove all spaces, dashes, parentheses, dots, and other special chars except +
    let normalized = phone
      .replace(/\s/g, "")      // Remove all spaces
      .replace(/-/g, "")        // Remove dashes
      .replace(/\(/g, "")       // Remove opening parentheses
      .replace(/\)/g, "")       // Remove closing parentheses
      .replace(/\./g, "")       // Remove dots
      .replace(/\s+/g, "");     // Remove any remaining whitespace
    
    // Ensure it starts with + (if it doesn't already)
    if (!normalized.startsWith("+")) {
      // If it starts with a digit, add +
      if (/^\d/.test(normalized)) {
        normalized = "+" + normalized;
      }
    }
    
    return normalized;
  }, []);

  // Helper function to refresh phone numbers list
  const refreshPhoneNumbers = useCallback(async () => {
    if (!user) return;

    try {
      const { data: phoneNumbersData, error: phoneError } = await supabase
        .from("imported_phone_numbers" as any)
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (phoneError) throw phoneError;

      const userIds = [...new Set((phoneNumbersData || []).map((p: any) => p.user_id))];
      let profilesMap: Record<string, Profile> = {};

      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, email, full_name")
          .in("user_id", userIds);

        if (profiles) {
          profiles.forEach((p: any) => {
            profilesMap[p.user_id] = p;
          });
        }
      }

      setUserProfiles(profilesMap);

      const { data: botsData } = await supabase
        .from("bots")
        .select("id, name, agent_number, user_id")
        .eq("user_id", user.id);

      const phoneToBotMap: Record<string, { id: string; name: string; user_id: string }> = {};
      (botsData || []).forEach((bot: any) => {
        if (bot.agent_number) {
          phoneToBotMap[bot.agent_number] = {
            id: bot.id,
            name: bot.name,
            user_id: bot.user_id,
          };
        }
      });

      const mappedNumbers = (phoneNumbersData || []).map((item: any) => {
        const linkedAgent = phoneToBotMap[item.phone_number] || null;
        const owner = profilesMap[item.user_id] ? {
          user_id: item.user_id,
          email: profilesMap[item.user_id].email,
          full_name: profilesMap[item.user_id].full_name,
        } : null;

        return {
          id: item.id,
          phone_number: item.phone_number,
          termination_uri: item.termination_uri,
          name: item.name || "",
          status: item.status,
          importStatus: "success" as const,
          linked_agent: linkedAgent,
          owner: owner,
        };
      });

      setImportedNumbers(mappedNumbers);
    } catch (error) {
      // Silently fail
    }
  }, [user]);

  // Fetch existing numbers from database with linked agent information
  useEffect(() => {
    refreshPhoneNumbers().catch(() => {
      toast({
        title: "Error",
        description: "Failed to load phone numbers",
        variant: "destructive",
      });
    });
  }, [user, refreshPhoneNumbers]);

  const handleImport = async () => {
    if (!phoneNumber.trim() || !terminationUri.trim()) {
      toast({
        title: "Validation Error",
        description: "Please fill in both phone number and termination URI",
        variant: "destructive",
      });
      return;
    }

    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    if (!phoneRegex.test(phoneNumber.replace(/\s/g, ""))) {
      toast({
        title: "Invalid Phone Number",
        description: "Please enter a valid phone number (e.g., +14157774444)",
        variant: "destructive",
      });
      return;
    }

    const numberToImport: ImportedNumber = {
      phone_number: phoneNumber.trim(),
      termination_uri: terminationUri.trim(),
      name: numberName.trim() || phoneNumber.trim(),
      importStatus: "importing",
    };

    // Add to list with importing status
    setImportedNumbers((prev) => [...prev, numberToImport]);
    setIsImporting(true);
    setIsSubmitting(true);

    // Clear form immediately
    const savedPhoneNumber = phoneNumber.trim();
    const savedTerminationUri = terminationUri.trim();
    const savedName = numberName.trim() || phoneNumber.trim();
    setPhoneNumber("");
    setTerminationUri("");
    setNumberName("");

    try {
      // Normalize phone number to E.164 format to prevent duplicates
      const normalizedPhoneNumber = normalizePhoneNumber(savedPhoneNumber);
      
      const number = {
        phone_number: normalizedPhoneNumber,
        termination_uri: savedTerminationUri,
        name: savedName,
      };
      if (user) {
        try {
          // Check if the phone number already exists for this user (check all formats)
          // Fetch all phone numbers for this user and compare normalized versions
          const { data: allNumbers, error: fetchError } = await supabase
            .from("imported_phone_numbers" as any)
            .select("id, phone_number")
            .eq("user_id", user.id);

          if (fetchError && fetchError.code !== "PGRST116") {
            throw new Error(`Database error: ${fetchError.message}`);
          }

          // Check if normalized version already exists
          const existingData = (allNumbers || []).find((item: any) => 
            normalizePhoneNumber(item.phone_number) === normalizedPhoneNumber
          );

          let importedNumberId: string;

          if (existingData && (existingData as any).id) {
            // Update existing record
            const existingId = (existingData as any).id;
            const updateData: any = {
              termination_uri: number.termination_uri,
              status: "active" as const,
              imported_at: new Date().toISOString(),
            };

            const { data: updatedData, error: updateError } = await supabase
              .from("imported_phone_numbers" as any)
              .update(updateData)
              .eq("id", existingId)
              .select()
              .single();

            if (updateError) {
              throw new Error(`Database error: ${updateError.message}`);
            }

            importedNumberId = existingId;
          } else {
            // Insert new record
            const insertData: any = {
              user_id: user.id,
              phone_number: number.phone_number,
              termination_uri: number.termination_uri,
              status: "active" as const,
              imported_at: new Date().toISOString(),
            };

            const { data: insertedData, error: insertError } = await supabase
              .from("imported_phone_numbers" as any)
              .insert(insertData)
              .select()
              .single();

            if (insertError) {
              throw new Error(`Database error: ${insertError.message}`);
            }

            importedNumberId = (insertedData as any)?.id || number.phone_number;
          }
          
          // Send phone number import data to webhook
          try {
            await callWebhook(
              {
                action: "import_phone_number",
                phone_number: number.phone_number,
                termination_uri: number.termination_uri,
                name: number.name || number.phone_number,
                status: "active",
                imported_number_id: importedNumberId,
                user: {
                  id: user.id,
                  email: user.email,
                  full_name: profile?.full_name || null,
                  company_name: profile?.company_name || null,
                },
                timestamp: new Date().toISOString(),
              },
              {
                url: "https://auto.nsolbpo.com/webhook/import",
              }
            );
          } catch (webhookError: any) {
            // Log webhook error but don't fail the import
            // The phone number is still successfully saved to database
          }
          
          // Refresh the numbers list to get updated agent/user info
          await refreshPhoneNumbers();

          toast({
            title: "✅ Import Successful",
            description: `Successfully imported ${number.phone_number} and sent to webhook.`,
            className: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800",
          });
        } catch (dbError: any) {
          const errorMessage = dbError instanceof Error ? dbError.message : "Unknown error occurred";
          const failedNumber: ImportedNumber = {
            ...number,
            importStatus: "failed",
            importError: errorMessage,
          };
          
          setImportedNumbers((prev) =>
            prev.map((n) =>
              n.phone_number === number.phone_number
                ? failedNumber
                : n
            )
          );

          toast({
            title: "❌ Import Failed",
            description: `Failed to import ${number.phone_number}: ${errorMessage}`,
            variant: "destructive",
          });
        }
      } else {
        // If no user, send to webhook but can't save to DB
        try {
          await callWebhook(
            {
              action: "import_phone_number",
              phone_number: number.phone_number,
              termination_uri: number.termination_uri,
              name: number.name || number.phone_number,
              status: "active",
              user: null,
              timestamp: new Date().toISOString(),
            },
            {
              url: "https://auto.nsolbpo.com/webhook/import",
            }
          );
          
          const importedNumber: ImportedNumber = {
            ...number,
            id: number.phone_number,
            importStatus: "success",
          };
          
          setImportedNumbers((prev) =>
            prev.map((n) =>
              n.phone_number === number.phone_number
                ? importedNumber
                : n
            )
          );

          toast({
            title: "✅ Import Successful",
            description: `Successfully imported ${number.phone_number}.`,
            className: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800",
          });
        } catch (webhookError: any) {
          const errorMessage = webhookError instanceof Error ? webhookError.message : "Unknown error occurred";
          const failedNumber: ImportedNumber = {
            ...number,
            importStatus: "failed",
            importError: errorMessage,
          };
          
          setImportedNumbers((prev) =>
            prev.map((n) =>
              n.phone_number === number.phone_number
                ? failedNumber
                : n
            )
          );

          toast({
            title: "❌ Import Failed",
            description: `Failed to import ${number.phone_number}: ${errorMessage}`,
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      const failedNumber: ImportedNumber = {
        ...numberToImport,
        importStatus: "failed",
        importError: errorMessage,
      };
      
      setImportedNumbers((prev) =>
        prev.map((n) =>
          n.phone_number === numberToImport.phone_number
            ? failedNumber
            : n
        )
      );

      toast({
        title: "❌ Import Failed",
        description: `Failed to import: ${errorMessage}`,
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
      setIsSubmitting(false);
    }
  };

  const handleRemoveNumber = (index: number) => {
    setImportedNumbers((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDelete = async (id: string) => {
    if (!user || !id) return;

    let retellDeleted = false;
    let retellError: any = null;
    let supabaseDeleted = false;
    let supabaseError: any = null;

    try {
      // First, get the phone number record to retrieve the phone number
      const { data: phoneData, error: fetchError } = await supabase
        .from("imported_phone_numbers" as any)
        .select("phone_number")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();

      if (fetchError) throw fetchError;
      if (!phoneData?.phone_number) {
        throw new Error("Phone number not found");
      }

      const phoneNumber = phoneData.phone_number;

      // Delete phone number from Retell API if API key exists
      if (profile?.retell_api_key) {
        try {
          // Format phone number to E.164 format: remove all spaces, dashes, parentheses, and other special chars except +
          // Keep only digits and + sign, ensure it starts with +
          let formattedPhoneNumber = phoneNumber
            .replace(/\s/g, "")      // Remove all spaces
            .replace(/-/g, "")        // Remove dashes
            .replace(/\(/g, "")       // Remove opening parentheses
            .replace(/\)/g, "")       // Remove closing parentheses
            .replace(/\./g, "")       // Remove dots
            .replace(/\s+/g, "");     // Remove any remaining whitespace
          
          // Ensure it starts with + (if it doesn't already)
          if (!formattedPhoneNumber.startsWith("+")) {
            // If it starts with a digit, add +
            if (/^\d/.test(formattedPhoneNumber)) {
              formattedPhoneNumber = "+" + formattedPhoneNumber;
            }
          }
          
          // Final validation: should match E.164 format (+ followed by 1-15 digits)
          if (!/^\+[1-9]\d{1,14}$/.test(formattedPhoneNumber)) {
            throw new Error(`Invalid phone number format: ${formattedPhoneNumber}. Expected E.164 format (e.g., +14157774444)`);
          }
          
          const response = await fetch(
            `https://api.retellai.com/delete-phone-number/${encodeURIComponent(formattedPhoneNumber)}`,
            {
              method: "DELETE",
              headers: {
                Authorization: `Bearer ${profile.retell_api_key}`,
              },
            }
          );

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(
              errorData.message || errorData.error || `Retell API error: ${response.status}`
            );
          }
          retellDeleted = true;
        } catch (error: any) {
          retellError = error;
          // Continue with database deletion even if Retell deletion fails
        }
      }

      // Delete from Supabase database (attempt regardless of Retell deletion result)
      try {
        const { error: dbError } = await supabase
          .from("imported_phone_numbers" as any)
          .delete()
          .eq("id", id)
          .eq("user_id", user.id);

        if (dbError) throw dbError;
        supabaseDeleted = true;
      } catch (error: any) {
        supabaseError = error;
      }

      // Handle results
      if (retellDeleted && supabaseDeleted) {
        setImportedNumbers((prev) => prev.filter((n) => n.id !== id));
        toast({
          title: "Success",
          description: "Phone number deleted successfully from both Retell and database",
        });
      } else if (supabaseDeleted && !retellDeleted) {
        setImportedNumbers((prev) => prev.filter((n) => n.id !== id));
        // If no API key, just show success. Otherwise show partial success
        if (!profile?.retell_api_key) {
          toast({
            title: "Success",
            description: "Phone number deleted successfully from database",
          });
        } else {
          toast({
            title: "Partial Success",
            description: `Phone number deleted from database. Retell deletion failed: ${retellError?.message || "Unknown error"}`,
            variant: "destructive",
          });
        }
      } else if (retellDeleted && !supabaseDeleted) {
        toast({
          title: "Partial Success",
          description: `Phone number deleted from Retell. Database deletion failed: ${supabaseError?.message || "Unknown error"}`,
          variant: "destructive",
        });
      } else {
        throw new Error(
          `Both deletions failed. Retell: ${retellError?.message || "Unknown error"}, Database: ${supabaseError?.message || "Unknown error"}`
        );
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to delete phone number",
        variant: "destructive",
      });
    }
  };

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
        toast({
          title: "Error",
          description: "This phone number is already linked to another agent. Please unlink it first.",
          variant: "destructive",
        });
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
        toast({
          title: "Error",
          description: "This agent is already linked to a different phone number. Please unlink it first.",
          variant: "destructive",
        });
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
      await refreshPhoneNumbers();

      toast({
        title: "Success",
        description: "Phone number linked to agent successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to link phone number to agent",
        variant: "destructive",
      });
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

      // Refresh bots and phone numbers
      await refetchBots();
      await refreshPhoneNumbers();

      toast({
        title: "Success",
        description: "Phone number unlinked from agent successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to unlink phone number from agent",
        variant: "destructive",
      });
    }
  };

  return (
    <ProtectedRoute>
      <DashboardLayout>
        <div className="space-y-8 pb-8">
          {/* Header Section */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4" data-tour="phone-numbers-header">
            <div className="space-y-1">
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Phone Numbers</h1>
              <p className="text-slate-500 text-base">Import and manage your phone numbers, link them to agents, and view ownership information</p>
            </div>
          </div>

          {/* Stats Section */}
          {importedNumbers.filter(n => n.importStatus === "success").length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">Total Numbers</p>
                    <h3 className="text-2xl font-bold text-slate-900 mt-1">{importedNumbers.filter(n => n.importStatus === "success").length}</h3>
                  </div>
                  <div className="p-3 bg-blue-50 rounded-xl">
                    <Phone className="h-5 w-5 text-blue-600" />
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">Imported</p>
                    <h3 className="text-2xl font-bold text-slate-900 mt-1">{importedNumbers.filter(n => n.importStatus === "success").length}</h3>
                  </div>
                  <div className="p-3 bg-emerald-50 rounded-xl">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-3 gap-6">
            {/* Video Tutorial Box - Side Panel */}
            <div className={`transition-all duration-300 ${isVideoExpanded ? 'md:col-span-3 order-first' : 'md:col-span-1'}`}>
              <Card className="border-slate-200 shadow-sm sticky top-4">
                <CardHeader className="border-b border-slate-100 pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900">
                      <Play className="h-4 w-4 text-blue-600" />
                      <span className="text-sm">Video Tutorial</span>
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsVideoExpanded(!isVideoExpanded)}
                      className="h-7 w-7 p-0"
                    >
                      {isVideoExpanded ? (
                        <Minimize2 className="h-4 w-4" />
                      ) : (
                        <Maximize2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <CardDescription className="text-xs text-slate-500 mt-1">
                    {isVideoExpanded ? "Click to minimize" : "Click to enlarge"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-4 space-y-3">
                  <div className="rounded-lg overflow-hidden border border-slate-200 bg-black/5 shadow-sm">
                    <video
                      controls
                      className={`w-full h-auto ${isVideoExpanded ? 'max-h-[600px]' : 'max-h-[200px]'}`}
                      preload="metadata"
                    >
                      <source src="https://fsotzwtqsrpymqasksej.supabase.co/storage/v1/object/public/vidoesdemo/In%20Bound%20Calling.mp4" type="video/mp4" />
                      Your browser does not support the video tag.
                    </video>
                  </div>
                  {!isVideoExpanded && (
                    <div className="bg-slate-50 border border-slate-200 rounded-md p-3 space-y-1.5">
                      <p className="text-xs font-semibold text-slate-900">Quick Steps:</p>
                      <ol className="text-xs text-slate-600 space-y-1 list-decimal list-inside">
                        <li>Enter phone number (E.164 format)</li>
                        <li>Enter termination URI</li>
                        <li>Click "Add to List"</li>
                        <li>Click "Import All"</li>
                      </ol>
                    </div>
                  )}
                  {isVideoExpanded && (
                    <div className="bg-white/80 border border-slate-200 rounded-lg p-4 space-y-2">
                      <p className="text-sm font-semibold text-slate-900">Detailed Instructions:</p>
                      <ol className="text-sm text-slate-700 space-y-1.5 list-decimal list-inside">
                        <li>Enter a name for your phone number (optional) - e.g., "Main Business Line"</li>
                        <li>Enter your phone number in E.164 format (e.g., +14157774444)</li>
                        <li>Enter the termination URI for your phone number (e.g., someuri.pstn.twilio.com)</li>
                        <li>Click "Add to List" to add the number to your import list</li>
                        <li>Repeat steps 1-4 for additional numbers if needed</li>
                        <li>Click "Import All" to complete the import process for all numbers in your list</li>
                      </ol>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Main Content - Forms */}
            <div className={`transition-all duration-300 ${isVideoExpanded ? 'md:col-span-3 order-last' : 'md:col-span-2'}`}>
              <div className="grid md:grid-cols-2 gap-6">
                {/* Add Number Form */}
                <Card className="border-slate-200 shadow-sm" data-tour="import-form">
              <CardHeader className="border-b border-slate-100 pb-4">
                <CardTitle className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                  <Phone className="h-5 w-5 text-blue-600" />
                  Add Phone Number
                </CardTitle>
                <CardDescription className="text-slate-500 mt-1">
                  Enter phone number and termination URI, then click Import to add it immediately
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="number_name">
                    Name (Optional)
                  </Label>
                  <Input
                    id="number_name"
                    placeholder="e.g., Main Business Line"
                    value={numberName}
                    onChange={(e) => setNumberName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone_number">
                    Phone Number <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="phone_number"
                    placeholder="e.g., +14157774444"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    disabled={isImporting || isSubmitting}
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter the phone number in E.164 format
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="termination_uri">
                    Termination URI <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="termination_uri"
                    placeholder="e.g., someuri.pstn.twilio.com"
                    value={terminationUri}
                    onChange={(e) => setTerminationUri(e.target.value)}
                    disabled={isImporting || isSubmitting}
                  />
                </div>

                <Button
                  onClick={handleImport}
                  disabled={isImporting || isSubmitting || !phoneNumber.trim() || !terminationUri.trim()}
                  className="w-full"
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Import
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Numbers List */}
            <Card className="border-slate-200 shadow-sm" data-tour="phone-numbers-list">
              <CardHeader className="border-b border-slate-100 pb-4">
                <div>
                  <CardTitle className="text-lg font-semibold text-slate-900">Imported Numbers</CardTitle>
                  <CardDescription className="text-slate-500 mt-1">
                    {importedNumbers.filter(n => n.importStatus === "success").length} number(s) imported
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {importedNumbers.filter(n => n.importStatus === "success").length === 0 && importedNumbers.filter(n => n.importStatus !== "success").length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Phone className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">No numbers imported yet</p>
                    <p className="text-xs mt-1">Import a number to get started</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-3">
                      {importedNumbers.map((number, index) => {
                        const isImporting = number.importStatus === "importing";
                        const isSuccess = number.importStatus === "success";
                        const isFailed = number.importStatus === "failed";
                        
                        // Only show successful imports and currently importing/failed ones
                        if (!isSuccess && !isImporting && !isFailed) {
                          return null;
                        }
                        
                        return (
                          <Card
                            key={number.id || index}
                            className={`${
                              isSuccess ? "border-green-500/70 bg-green-500/10" :
                              isFailed ? "border-red-500/50 bg-red-500/5" :
                              isImporting ? "border-primary/50 bg-primary/5" :
                              ""
                            }`}
                          >
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 space-y-2">
                                  <div className="flex items-center gap-2">
                                    {isImporting ? (
                                      <Loader2 className="h-4 w-4 text-primary animate-spin" />
                                    ) : isSuccess ? (
                                      <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                                    ) : isFailed ? (
                                      <Phone className="h-4 w-4 text-red-600 dark:text-red-400" />
                                    ) : (
                                      <Phone className="h-4 w-4 text-primary" />
                                    )}
                                    <span className={`font-semibold ${
                                      isSuccess ? "text-green-700 dark:text-green-300" : ""
                                    }`}>
                                      {number.name || number.phone_number}
                                    </span>
                                    {isSuccess && (
                                      <Badge variant="default" className="bg-green-600 dark:bg-green-500 text-white">
                                        <CheckCircle2 className="h-3 w-3 mr-1" />
                                        Imported
                                      </Badge>
                                    )}
                                    {isFailed && (
                                      <Badge variant="destructive">
                                        Failed
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    {number.phone_number}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    URI: {number.termination_uri}
                                  </div>
                                  
                                  {/* Owner Information */}
                                  {number.owner && (
                                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-200">
                                      <User className="h-3 w-3 text-slate-500" />
                                      <span className="text-xs text-slate-600">
                                        Owner: {number.owner.full_name || number.owner.email || "Unknown"}
                                      </span>
                                    </div>
                                  )}

                                  {/* Linked Agent Information */}
                                  {number.linked_agent ? (
                                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-200">
                                      <Bot className="h-3 w-3 text-blue-500" />
                                      <span className="text-xs text-blue-600 font-medium">
                                        Linked to: {number.linked_agent.name}
                                      </span>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-200">
                                      <span className="text-xs text-slate-500 italic">
                                        Not linked to any agent
                                      </span>
                                    </div>
                                  )}

                                  {isFailed && number.importError && (
                                    <div className="text-xs text-red-600 dark:text-red-400">
                                      Error: {number.importError}
                                    </div>
                                  )}
                                </div>
                                <div className="flex flex-col gap-2">
                                  {isSuccess && number.id && (
                                    <>
                                      {/* Link/Unlink Agent */}
                                      {number.linked_agent ? (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => handleUnlinkAgent(number.id!, number.linked_agent!.id)}
                                          disabled={linkingNumberId === number.id}
                                          className="text-orange-600 hover:text-orange-700 border-orange-200 hover:border-orange-300"
                                        >
                                          {linkingNumberId === number.id ? (
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                          ) : (
                                            <>
                                              <Unlink className="h-3 w-3 mr-1" />
                                              Unlink
                                            </>
                                          )}
                                        </Button>
                                      ) : (
                                        <Select
                                          onValueChange={(botId) => handleLinkAgent(number.id!, number.phone_number, botId)}
                                          disabled={linkingNumberId === number.id || bots.length === 0}
                                        >
                                          <SelectTrigger className="h-8 text-xs">
                                            <SelectValue placeholder="Link Agent" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {bots
                                              .filter(bot => !bot.agent_number || bot.agent_number === number.phone_number)
                                              .map((bot) => (
                                                <SelectItem key={bot.id} value={bot.id}>
                                                  {bot.name}
                                                </SelectItem>
                                              ))}
                                            {bots.filter(bot => !bot.agent_number || bot.agent_number === number.phone_number).length === 0 && (
                                              <SelectItem value="no-agents" disabled>
                                                No available agents
                                              </SelectItem>
                                            )}
                                          </SelectContent>
                                        </Select>
                                      )}
                                      
                                      {/* Delete Button */}
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleDelete(number.id!)}
                                        className="text-destructive hover:text-destructive"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </>
                                  )}
                                  {!isImporting && !isSuccess && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleRemoveNumber(index)}
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
