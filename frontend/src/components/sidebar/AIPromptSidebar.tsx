import { useState } from "react";
import { Sparkles, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function AIPromptSidebar() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(true);
  const [activeSection, setActiveSection] = useState<"generate" | "format">("generate");
  
  // Generate Prompt Section
  const [businessType, setBusinessType] = useState("");
  const [businessDescription, setBusinessDescription] = useState("");
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  // Format Prompt Section
  const [promptToFormat, setPromptToFormat] = useState("");
  const [formattedPrompt, setFormattedPrompt] = useState("");
  const [isFormatting, setIsFormatting] = useState(false);

  const handleGeneratePrompt = async () => {
    if (!businessType.trim() || !businessDescription.trim()) {
      toast({
        title: "Validation Error",
        description: "Please fill in both business type and description",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    
    try {
      const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

      // Call backend API instead of OpenAI directly
      const response = await fetch(`${BACKEND_URL}/api/ai-prompt/sidebar-generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          businessType,
          businessDescription,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `API error: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to generate prompt');
      }

      const generatedText = data.generatedPrompt || "";
      
      setGeneratedPrompt(generatedText);
      
      // Deduct credits for prompt generation (2 credits)
      if (user) {
        try {
          const { data: creditData, error: creditError } = await supabase.rpc(
            "deduct_credits_for_prompt_generation",
            {
              p_user_id: user.id,
              p_prompt_id: null,
              p_metadata: {
                business_type: businessType,
                business_description: businessDescription,
              },
            }
          );

          if (creditError) {
            const errorMsg = creditError.message || "Unknown error";
            if (errorMsg.includes("Insufficient credits")) {
              toast({
                title: "Warning",
                description: "Prompt generated successfully, but you have insufficient credits. Please add credits to continue using this feature.",
                variant: "destructive",
              });
            } else {
              toast({
                title: "Warning",
                description: `Prompt generated successfully, but credit deduction failed: ${errorMsg}`,
                variant: "destructive",
              });
            }
          } else if (creditData && (creditData as any).success) {
            toast({
              title: "Success",
              description: "Prompt generated successfully (2 credits deducted)",
            });
          } else {
            toast({
              title: "Success",
              description: "Prompt generated successfully",
            });
          }
        } catch (creditDeductionError: any) {
          toast({
            title: "Success",
            description: `Prompt generated successfully, but credit deduction failed: ${creditDeductionError?.message || "Unknown error"}`,
          });
        }
      } else {
        toast({
          title: "Success",
          description: "Prompt generated successfully",
        });
      }
    } catch (error) {
      // Removed console.error for security
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate prompt. Please check your API key.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

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
      const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

      // Call backend API instead of OpenAI directly
      const response = await fetch(`${BACKEND_URL}/api/ai-prompt/sidebar-format`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          promptToFormat,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `API error: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to format prompt');
      }

      const formattedText = data.formattedPrompt || "";
      
      setFormattedPrompt(formattedText);
      
      // Deduct credits for prompt formatting (1 credit)
      if (user) {
        try {
          const { data: creditData, error: creditError } = await supabase.rpc(
            "deduct_credits_for_prompt_formatting",
            {
              p_user_id: user.id,
              p_prompt_id: null,
              p_metadata: {
                prompt_length: promptToFormat.length,
              },
            }
          );

          if (creditError) {
            const errorMsg = creditError.message || "Unknown error";
            if (errorMsg.includes("Insufficient credits")) {
              toast({
                title: "Warning",
                description: "Prompt formatted successfully, but you have insufficient credits. Please add credits to continue using this feature.",
                variant: "destructive",
              });
            } else {
              toast({
                title: "Warning",
                description: `Prompt formatted successfully, but credit deduction failed: ${errorMsg}`,
                variant: "destructive",
              });
            }
          } else if (creditData && (creditData as any).success) {
            toast({
              title: "Success",
              description: "Prompt formatted successfully (1 credit deducted)",
            });
          } else {
            toast({
              title: "Success",
              description: "Prompt formatted successfully",
            });
          }
        } catch (creditDeductionError: any) {
          toast({
            title: "Success",
            description: `Prompt formatted successfully, but credit deduction failed: ${creditDeductionError?.message || "Unknown error"}`,
          });
        }
      } else {
        toast({
          title: "Success",
          description: "Prompt formatted successfully",
        });
      }
    } catch (error) {
      // Removed console.error for security
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to format prompt",
        variant: "destructive",
      });
    } finally {
      setIsFormatting(false);
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full">
      <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-3 hover:bg-sidebar-accent rounded-xl transition-colors text-sidebar-foreground/80 hover:text-sidebar-foreground">
        <div className="flex items-center gap-3">
          <Sparkles className="h-4 w-4" />
          <span className="text-sm font-medium">AI Prompt</span>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-4 px-4">
        <div className="flex gap-2">
          <Button
            variant={activeSection === "generate" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveSection("generate")}
            className="flex-1 h-7 text-xs"
          >
            Generate
          </Button>
          <Button
            variant={activeSection === "format" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveSection("format")}
            className="flex-1 h-7 text-xs"
          >
            Format
          </Button>
        </div>

        {activeSection === "generate" && (
          <Card className="p-4 bg-sidebar-accent/30 border-sidebar-border/50">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="business_type" className="text-xs font-semibold">
                  Business Type <span className="text-destructive">*</span>
                </Label>
                <Select value={businessType} onValueChange={setBusinessType}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Select business type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="restaurant">Restaurant</SelectItem>
                    <SelectItem value="retail">Retail Store</SelectItem>
                    <SelectItem value="healthcare">Healthcare</SelectItem>
                    <SelectItem value="real-estate">Real Estate</SelectItem>
                    <SelectItem value="legal">Legal Services</SelectItem>
                    <SelectItem value="automotive">Automotive</SelectItem>
                    <SelectItem value="education">Education</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="business_description" className="text-xs font-semibold">
                  Business Description <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="business_description"
                  placeholder="Describe your business, services, and what customers typically ask about..."
                  value={businessDescription}
                  onChange={(e) => setBusinessDescription(e.target.value)}
                  className="min-h-[100px] text-sm"
                />
              </div>

              <Button
                onClick={handleGeneratePrompt}
                disabled={isGenerating || !businessType.trim() || !businessDescription.trim()}
                className="w-full h-8 text-xs"
                size="sm"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-3 w-3" />
                    Generate Prompt
                  </>
                )}
              </Button>

              {generatedPrompt && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Generated Prompt</Label>
                    <Textarea
                      value={generatedPrompt}
                      onChange={(e) => setGeneratedPrompt(e.target.value)}
                      className="min-h-[200px] text-sm"
                      readOnly={false}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(generatedPrompt);
                        toast({
                          title: "Copied",
                          description: "Prompt copied to clipboard",
                        });
                      }}
                      className="w-full h-7 text-xs"
                    >
                      Copy Prompt
                    </Button>
                  </div>
                </>
              )}
            </div>
          </Card>
        )}

        {activeSection === "format" && (
          <Card className="p-4 bg-sidebar-accent/30 border-sidebar-border/50">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="prompt_to_format" className="text-xs font-semibold">
                  Prompt to Format <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="prompt_to_format"
                  placeholder="Paste your prompt here to format it according to best practices..."
                  value={promptToFormat}
                  onChange={(e) => setPromptToFormat(e.target.value)}
                  className="min-h-[150px] text-sm"
                />
              </div>

              <Button
                onClick={handleFormatPrompt}
                disabled={isFormatting || !promptToFormat.trim()}
                className="w-full h-8 text-xs"
                size="sm"
              >
                {isFormatting ? (
                  <>
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    Formatting...
                  </>
                ) : (
                  <>
                    <FileText className="mr-2 h-3 w-3" />
                    Format Prompt
                  </>
                )}
              </Button>

              {formattedPrompt && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Formatted Prompt</Label>
                    <Textarea
                      value={formattedPrompt}
                      onChange={(e) => setFormattedPrompt(e.target.value)}
                      className="min-h-[200px] text-sm"
                      readOnly={false}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(formattedPrompt);
                        toast({
                          title: "Copied",
                          description: "Formatted prompt copied to clipboard",
                        });
                      }}
                      className="w-full h-7 text-xs"
                    >
                      Copy Formatted Prompt
                    </Button>
                  </div>
                </>
              )}
            </div>
          </Card>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
