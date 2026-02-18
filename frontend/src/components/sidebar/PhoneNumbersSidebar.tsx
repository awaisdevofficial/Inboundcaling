import { useState, useEffect } from "react";
import { Phone, Loader2, Plus, X, Upload, CheckCircle2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface ImportedNumber {
  id?: string;
  phone_number: string;
  termination_uri: string;
  name?: string;
  status?: string;
  importStatus?: "pending" | "importing" | "success" | "failed";
  importError?: string;
}

export function PhoneNumbersSidebar() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [terminationUri, setTerminationUri] = useState("");
  const [numberName, setNumberName] = useState("");
  const [importedNumbers, setImportedNumbers] = useState<ImportedNumber[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(true);

  // Helper function to normalize phone number to E.164 format
  const normalizePhoneNumber = (phone: string): string => {
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
  };

  // Fetch existing numbers from database
  useEffect(() => {
    const fetchNumbers = async () => {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from("imported_phone_numbers" as any)
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (error) throw error;

        setImportedNumbers(
          (data || []).map((item: any) => ({
            id: item.id,
            phone_number: item.phone_number,
            termination_uri: item.termination_uri,
            name: item.name || "",
            status: item.status,
          }))
        );
      } catch (error) {
        // Removed console.error for security
        toast({
          title: "Error",
          description: "Failed to load phone numbers",
          variant: "destructive",
        });
      }
    };

    fetchNumbers();
  }, [user]);

  const handleAddNumber = () => {
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

    const newNumber: ImportedNumber = {
      phone_number: phoneNumber.trim(),
      termination_uri: terminationUri.trim(),
      name: numberName.trim() || phoneNumber.trim(),
    };

    setImportedNumbers((prev) => [...prev, newNumber]);
    setPhoneNumber("");
    setTerminationUri("");
    setNumberName("");
    
    toast({
      title: "Number Added",
      description: "Number added to import list. Click 'Import Numbers' to save.",
    });
  };

  const handleRemoveNumber = (index: number) => {
    setImportedNumbers((prev) => prev.filter((_, i) => i !== index));
  };

  const handleImport = async () => {
    if (importedNumbers.length === 0) {
      toast({
        title: "No Numbers to Import",
        description: "Please add at least one number to import",
        variant: "destructive",
      });
      return;
    }

    setIsImporting(true);
    setIsSubmitting(true);
    const failedNumbers: Array<{ number: ImportedNumber; error: string }> = [];
    const successfulNumbers: ImportedNumber[] = [];

    setImportedNumbers((prev) =>
      prev.map((n) => ({ ...n, importStatus: "importing" as const }))
    );

    for (let i = 0; i < importedNumbers.length; i++) {
      const number = importedNumbers[i];
      try {
        const webhookPayload = {
          action: "import_phone_number",
          phone_number: number.phone_number,
          termination_uri: number.termination_uri,
          user_id: user?.id,
          user_email: user?.email,
          timestamp: new Date().toISOString(),
        };

        const { callWebhook } = await import("@/lib/webhook");
        const webhookResult = await callWebhook(webhookPayload, {
          timeout: 30000,
          useSupabaseProxy: false,
        });

        if (!webhookResult.success) {
          throw new Error(webhookResult.error || "Webhook request failed");
        }

        const webhookResponse: any = webhookResult.data || webhookResult;
        const allMessages = [
          webhookResponse.message,
          webhookResponse.error,
          webhookResponse.response,
          webhookResponse.data?.message,
          webhookResponse.data?.error,
          JSON.stringify(webhookResponse)
        ].filter(Boolean).join(" ").toLowerCase();
        
        const hasSuccessKeywords = 
          allMessages.includes("success") ||
          allMessages.includes("imported") ||
          allMessages.includes("successfully");

        const isHttpOk = webhookResult.success;
        const hasSuccessIndicators = 
          webhookResponse.success === true ||
          webhookResponse.status === "success" ||
          webhookResponse.imported === true ||
          webhookResponse.phone_number === number.phone_number ||
          webhookResponse.id ||
          webhookResponse.phone_number_id ||
          webhookResponse.phone_id;

        if (!hasSuccessKeywords && !isHttpOk && !hasSuccessIndicators) {
          const errorMessage = 
            webhookResponse.error || 
            webhookResponse.message || 
            webhookResponse.response ||
            webhookResult.error ||
            "Webhook request failed";
          throw new Error(errorMessage);
        }

        const importedNumberId = webhookResponse.id || 
                                 webhookResponse.phone_number_id || 
                                 webhookResponse.phone_id ||
                                 null;
        
        if (user) {
          try {
            // Normalize phone number to E.164 format to prevent duplicates
            const normalizedPhoneNumber = normalizePhoneNumber(number.phone_number);
            
            // Check if normalized version already exists
            const { data: allNumbers, error: fetchError } = await supabase
              .from("imported_phone_numbers" as any)
              .select("id, phone_number")
              .eq("user_id", user.id);

            if (fetchError && fetchError.code !== "PGRST116") {
              // Continue anyway, will try to upsert
            }

            // Check if normalized version already exists
            const existingNumber = (allNumbers || []).find((item: any) => 
              normalizePhoneNumber(item.phone_number) === normalizedPhoneNumber
            );

            const upsertData: any = {
              user_id: user.id,
              phone_number: normalizedPhoneNumber, // Use normalized version
              termination_uri: number.termination_uri,
              status: "active" as const,
              imported_at: new Date().toISOString(),
            };
            
            // Only include name if it exists (column may not exist in database)
            if (number.name) {
              upsertData.name = number.name;
            }
            
            // If existing number found with different format, update it instead of creating duplicate
            if (existingNumber) {
              const { error: dbError } = await supabase
                .from("imported_phone_numbers" as any)
                .update(upsertData)
                .eq("id", existingNumber.id);
              
              if (dbError) {
                // Removed console.error for security
              }
            } else {
              const { error: dbError } = await supabase
                .from("imported_phone_numbers" as any)
                .insert(upsertData);
              
              if (dbError) {
                // Removed console.error for security
              }
            }

            if (dbError) {
              // Removed console.error for security
            }
          } catch (dbError: any) {
            // Removed console.error for security
          }
        }
        
        const importedNumber: ImportedNumber = {
          ...number,
          id: importedNumberId || number.phone_number,
          importStatus: "success",
        };
        successfulNumbers.push(importedNumber);
        
        setImportedNumbers((prev) =>
          prev.map((n) =>
            n.phone_number === number.phone_number
              ? importedNumber
              : n
          )
        );
      } catch (error) {
        // Removed console.error for security
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        const failedNumber: ImportedNumber = {
          ...number,
          importStatus: "failed",
          importError: errorMessage,
        };
        failedNumbers.push({ 
          number: failedNumber, 
          error: errorMessage 
        });
        
        setImportedNumbers((prev) =>
          prev.map((n) =>
            n.phone_number === number.phone_number
              ? failedNumber
              : n
          )
        );
      }
    }

    setIsImporting(false);
    setIsSubmitting(false);

    if (failedNumbers.length === 0 && successfulNumbers.length > 0) {
      toast({
        title: "✅ Import Successful",
        description: `Successfully imported ${successfulNumbers.length} number(s).`,
        className: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800",
      });
      
      setTimeout(() => {
        setImportedNumbers((prev) => 
          prev.filter(n => n.importStatus === "success")
        );
        setPhoneNumber("");
        setTerminationUri("");
        setNumberName("");
      }, 1500);
    } else if (successfulNumbers.length > 0 && failedNumbers.length > 0) {
      const failedDetails = failedNumbers
        .map(f => `${f.number.phone_number}: ${f.error}`)
        .join("; ");
      toast({
        title: "⚠️ Partial Import Success",
        description: `Successfully imported ${successfulNumbers.length} number(s). ${failedNumbers.length} failed.`,
        variant: "destructive",
      });
      setImportedNumbers(failedNumbers.map(f => f.number));
    } else {
      const failedDetails = failedNumbers
        .map(f => `${f.number.phone_number}: ${f.error}`)
        .join("; ");
      toast({
        title: "❌ Import Failed",
        description: `Failed to import ${failedNumbers.length} number(s).`,
        variant: "destructive",
      });
    }
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

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full">
      <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-3 hover:bg-sidebar-accent rounded-xl transition-colors text-sidebar-foreground/80 hover:text-sidebar-foreground">
        <div className="flex items-center gap-3">
          <Phone className="h-4 w-4" />
          <span className="text-sm font-medium">Phone Numbers</span>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-4 px-4">
        <Card className="p-4 bg-sidebar-accent/30 border-sidebar-border/50">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="number_name" className="text-xs font-semibold">
                Name (Optional)
              </Label>
              <Input
                id="number_name"
                placeholder="e.g., Main Business Line"
                value={numberName}
                onChange={(e) => setNumberName(e.target.value)}
                className="h-8 text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone_number" className="text-xs font-semibold">
                Phone Number <span className="text-destructive">*</span>
              </Label>
              <Input
                id="phone_number"
                placeholder="e.g., +14157774444"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="h-8 text-sm"
                disabled={isImporting || isSubmitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="termination_uri" className="text-xs font-semibold">
                Termination URI <span className="text-destructive">*</span>
              </Label>
              <Input
                id="termination_uri"
                placeholder="e.g., someuri.pstn.twilio.com"
                value={terminationUri}
                onChange={(e) => setTerminationUri(e.target.value)}
                className="h-8 text-sm"
                disabled={isImporting || isSubmitting}
              />
            </div>

            <Button
              onClick={handleAddNumber}
              disabled={isImporting || isSubmitting || !phoneNumber.trim() || !terminationUri.trim()}
              className="w-full h-8 text-xs"
              size="sm"
            >
              <Plus className="mr-2 h-3 w-3" />
              Add to List
            </Button>
          </div>
        </Card>

        {importedNumbers.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <Label className="text-xs font-semibold">
                  Numbers ({importedNumbers.length})
                </Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleImport}
                  disabled={isImporting || isSubmitting}
                  className="h-7 text-xs"
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-1 h-3 w-3" />
                      Import All
                    </>
                  )}
                </Button>
              </div>

              <ScrollArea className="max-h-[300px]">
                <div className="space-y-2">
                  {importedNumbers.map((number, index) => {
                    const isImporting = number.importStatus === "importing";
                    const isSuccess = number.importStatus === "success";
                    const isFailed = number.importStatus === "failed";
                    
                    return (
                      <Card
                        key={number.id || index}
                        className={`p-2 border-border/50 ${
                          isSuccess ? "border-green-500/70 bg-green-500/10" :
                          isFailed ? "border-red-500/50 bg-red-500/5" :
                          isImporting ? "border-primary/50 bg-primary/5" :
                          "bg-card/50"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 space-y-1 min-w-0">
                            <div className="flex items-center gap-2">
                              {isImporting ? (
                                <Loader2 className="h-3 w-3 text-primary animate-spin flex-shrink-0" />
                              ) : isSuccess ? (
                                <CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-400 flex-shrink-0" />
                              ) : isFailed ? (
                                <Phone className="h-3 w-3 text-red-600 dark:text-red-400 flex-shrink-0" />
                              ) : (
                                <Phone className="h-3 w-3 text-primary flex-shrink-0" />
                              )}
                              <span className={`text-xs font-semibold truncate ${
                                isSuccess ? "text-green-700 dark:text-green-300" : ""
                              }`}>
                                {number.name || number.phone_number}
                              </span>
                              {isSuccess && (
                                <Badge variant="default" className="bg-green-600 dark:bg-green-500 text-white text-[10px] px-1 py-0 border-0">
                                  Imported
                                </Badge>
                              )}
                            </div>
                            <div className="text-[10px] text-muted-foreground truncate">
                              {number.phone_number}
                            </div>
                            {isFailed && number.importError && (
                              <div className="text-[10px] text-red-600 dark:text-red-400">
                                {number.importError}
                              </div>
                            )}
                          </div>
                          {!isImporting && number.id && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(number.id!)}
                              className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                          {!isImporting && !isSuccess && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveNumber(index)}
                              className="h-6 w-6 p-0"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
