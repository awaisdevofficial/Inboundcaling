import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Mic, MicOff, Phone, PhoneOff, Loader2, FileText } from "lucide-react";
import { RetellWebClient } from "retell-client-js-sdk";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { Bot } from "@/types/database";

interface TestAgentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bot: Bot | null;
}

export function TestAgentModal({
  open,
  onOpenChange,
  bot,
}: TestAgentModalProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string>("");
  const [transcriptSegments, setTranscriptSegments] = useState<
    Array<{ text: string; role: "agent" | "user" }>
  >([]);
  const [callId, setCallId] = useState<string | null>(null);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const retellClientRef = useRef<RetellWebClient | null>(null);
  const { user } = useAuth();
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  useEffect(() => {
    if (!open) {
      cleanup();
    }
  }, [open]);

  const cleanup = async () => {
    if (callId && user && bot && !callId.startsWith("call_")) {
      try {
        await supabase
          .from("calls")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            transcript: transcript || null,
            is_test_call: true,
          })
          .eq("id", callId);
      } catch (err) {
        console.error("Error saving test call:", err);
      }
    }

    if (retellClientRef.current) {
      try {
        retellClientRef.current.stopCall();
      } catch (err) {
        // Ignore cleanup errors
      }
      retellClientRef.current = null;
    }
    setIsConnected(false);
    setIsConnecting(false);
    setIsMuted(false);
    setError(null);
    setTranscript("");
    setTranscriptSegments([]);
    setIsAgentSpeaking(false);
    setCallId(null);
  };

  // Auto-scroll transcript to bottom
  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [transcriptSegments]);

  /**
   * Parse the Retell `update` event transcript array.
   * Retell sends: { transcript: [{ role: "agent"|"user", content: string }, ...] }
   * We rebuild the full segments list from this authoritative array each time.
   */
  const parseRetellTranscript = (
    transcriptArray: Array<{ role: string; content: string }>
  ): Array<{ text: string; role: "agent" | "user" }> => {
    return transcriptArray
      .filter((item) => item && item.content && item.content.trim())
      .map((item) => ({
        text: item.content.trim(),
        role: item.role === "agent" ? "agent" : "user",
      }));
  };

  const handleStartCall = async () => {
    if (!bot?.retell_agent_id) {
      setError("Agent ID not found");
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL || "http://localhost:3001"}/api/test-call/create-token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agent_id: bot.retell_agent_id }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error ||
            errorData.message ||
            `Failed to create call: ${response.status}`
        );
      }

      const data = await response.json();

      if (!data.access_token || !data.call_id) {
        throw new Error(
          "Invalid response from server: missing access_token or call_id"
        );
      }

      const accessToken = data.access_token;
      const retellCallId = data.call_id;

      // Create test call record in database
      let dbCallId: string | null = null;
      if (user && bot) {
        try {
          const { data: callData, error: callError } = await supabase
            .from("calls")
            .insert({
              user_id: user.id,
              bot_id: bot.id,
              phone_number: "test_call",
              contact_name: "Test Call",
              status: "in_progress",
              started_at: new Date().toISOString(),
              is_test_call: true,
              metadata: {
                test_call: true,
                retell_call_id: retellCallId,
                agent_id: bot.retell_agent_id,
              },
            })
            .select()
            .single();

          if (callError) {
            console.error("Error creating test call record:", callError);
          } else if (callData) {
            dbCallId = callData.id;
            setCallId(dbCallId);
          }
        } catch (err) {
          console.error("Error creating test call record:", err);
        }
      }

      if (!dbCallId) {
        setCallId(retellCallId);
      }

      // Initialize Retell Web Client
      const retellClient = new RetellWebClient();
      retellClientRef.current = retellClient;

      retellClient.on("call_started", () => {
        console.log("Call started");
        setIsConnecting(false);
      });

      retellClient.on("call_ready", () => {
        console.log("Call ready");
        setIsConnected(true);
        setIsConnecting(false);
        setError(null);
      });

      retellClient.on("call_ended", () => {
        console.log("Call ended");
        setIsConnected(false);
        setIsConnecting(false);
        cleanup();
      });

      retellClient.on("error", (error: any) => {
        console.error("Retell client error:", error);
        setError(
          typeof error === "string"
            ? error
            : error?.message || "Connection error occurred"
        );
        setIsConnecting(false);
        setIsConnected(false);
      });

      retellClient.on("agent_start_talking", () => {
        setIsAgentSpeaking(true);
      });

      retellClient.on("agent_stop_talking", () => {
        setIsAgentSpeaking(false);
      });

      /**
       * The Retell `update` event contains the FULL transcript array so far.
       * Shape: { transcript: [{ role: "agent"|"user", content: string }] }
       * We simply replace our segments with the latest full array each time.
       */
      retellClient.on("update", (event: any) => {
        console.log("Update event:", JSON.stringify(event, null, 2));

        // Retell transcript is an array of {role, content} objects
        if (Array.isArray(event?.transcript) && event.transcript.length > 0) {
          const segments = parseRetellTranscript(event.transcript);
          if (segments.length > 0) {
            setTranscriptSegments(segments);

            // Build plain transcript string for DB storage
            const plainText = segments
              .map((s) => `${s.role === "agent" ? "Agent" : "Human"}: ${s.text}`)
              .join("\n");
            setTranscript(plainText);
          }
        }
      });

      // Start the call
      await retellClient.startCall({
        accessToken: accessToken,
        sampleRate: 24000,
      });

      await retellClient.startAudioPlayback();
    } catch (err: any) {
      setError(err.message || "Failed to start call");
      setIsConnecting(false);
      setIsConnected(false);
      cleanup();
    }
  };

  const handleEndCall = () => {
    cleanup();
  };

  const handleToggleMute = () => {
    if (retellClientRef.current) {
      try {
        if (isMuted) {
          retellClientRef.current.unmute();
        } else {
          retellClientRef.current.mute();
        }
        setIsMuted(!isMuted);
      } catch (err) {
        setError("Failed to toggle mute");
      }
    }
  };

  if (!bot) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Test Agent: {bot.name}</DialogTitle>
          <DialogDescription>
            Start a voice conversation with your agent to test its responses
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Status Display */}
          <div className="flex items-center justify-center py-8">
            <div className="flex flex-col items-center gap-4">
              {isConnecting && (
                <>
                  <Loader2 className="h-12 w-12 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">
                    Connecting to agent...
                  </p>
                </>
              )}

              {!isConnecting && !isConnected && (
                <>
                  <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center">
                    <Phone className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Ready to start test call
                  </p>
                </>
              )}

              {isConnected && (
                <>
                  <div
                    className={`h-20 w-20 rounded-full flex items-center justify-center transition-all ${
                      isAgentSpeaking
                        ? "bg-blue-500 animate-pulse"
                        : "bg-green-500 animate-pulse"
                    }`}
                  >
                    <Phone className="h-10 w-10 text-white" />
                  </div>
                  <p
                    className={`text-sm font-medium ${
                      isAgentSpeaking ? "text-blue-600" : "text-green-600"
                    }`}
                  >
                    {isAgentSpeaking ? "Agent is speaking..." : "Connected - Speak now"}
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {/* Live Transcript */}
          {isConnected && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-medium">Live Transcript</h3>
              </div>
              <ScrollArea className="h-48 w-full rounded-lg border bg-muted/30 p-4">
                {transcriptSegments.length > 0 ? (
                  <div className="space-y-2 text-sm">
                    {transcriptSegments.map((segment, idx) => {
                      const isAgent = segment.role === "agent";
                      return (
                        <div key={idx} className="flex items-start gap-2">
                          <span
                            className={`font-semibold min-w-[60px] ${
                              isAgent ? "text-blue-600" : "text-slate-600"
                            }`}
                          >
                            {isAgent ? "Agent:" : "Human:"}
                          </span>
                          <span className="text-muted-foreground flex-1">
                            {segment.text}
                          </span>
                        </div>
                      );
                    })}
                    <div ref={transcriptEndRef} />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    Waiting for conversation to start...
                  </p>
                )}
              </ScrollArea>
            </div>
          )}

          {/* Controls */}
          <div className="flex items-center justify-center gap-4">
            {!isConnected && !isConnecting && (
              <Button
                onClick={handleStartCall}
                className="bg-green-600 hover:bg-green-700 text-white"
                size="lg"
              >
                <Phone className="h-5 w-5 mr-2" />
                Start Test Call
              </Button>
            )}

            {isConnecting && (
              <Button disabled size="lg">
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Connecting...
              </Button>
            )}

            {isConnected && (
              <>
                <Button
                  onClick={handleToggleMute}
                  variant={isMuted ? "destructive" : "outline"}
                  size="lg"
                >
                  {isMuted ? (
                    <MicOff className="h-5 w-5" />
                  ) : (
                    <Mic className="h-5 w-5" />
                  )}
                </Button>
                <Button onClick={handleEndCall} variant="destructive" size="lg">
                  <PhoneOff className="h-5 w-5 mr-2" />
                  End Call
                </Button>
              </>
            )}
          </div>

          {/* Instructions */}
          <div className="pt-4 border-t">
            <p className="text-xs text-muted-foreground text-center">
              {isConnected
                ? "You're now connected. Speak naturally to test your agent."
                : "Click 'Start Test Call' to begin a voice conversation with your agent."}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}