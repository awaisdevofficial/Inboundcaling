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
  const [callId, setCallId] = useState<string | null>(null);
  const retellClientRef = useRef<RetellWebClient | null>(null);
  const { user } = useAuth();
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      cleanup();
    };
  }, []);

  useEffect(() => {
    // Cleanup when modal closes
    if (!open) {
      cleanup();
    }
  }, [open]);

  const cleanup = async () => {
    // Save test call data before cleanup
    // callId should be the database UUID (set after successful insert)
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
    setCallId(null);
  };

  // Auto-scroll transcript to bottom
  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [transcript]);

  const handleStartCall = async () => {
    if (!bot?.retell_agent_id) {
      setError("Agent ID not found");
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      // Get call token from backend
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL || "http://localhost:3001"}/api/test-call/create-token`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            agent_id: bot.retell_agent_id,
          }),
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
        throw new Error("Invalid response from server: missing access_token or call_id");
      }

      const accessToken = data.access_token;
      const retellCallId = data.call_id;

      // Create test call record in database
      // Note: We don't set id - let Supabase generate a UUID
      // Store Retell call_id in metadata for later lookup
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
                retell_call_id: retellCallId, // Store Retell call_id in metadata
                agent_id: bot.retell_agent_id,
              },
            })
            .select()
            .single();

          if (callError) {
            console.error("Error creating test call record:", callError);
          } else if (callData) {
            // Store the database call ID for later updates
            dbCallId = callData.id;
            setCallId(dbCallId);
          }
        } catch (err) {
          console.error("Error creating test call record:", err);
        }
      }

      // If database insert failed, still store Retell call_id as fallback
      if (!dbCallId) {
        setCallId(retellCallId);
      }

      // Initialize Retell Web Client
      const retellClient = new RetellWebClient();
      retellClientRef.current = retellClient;

      // Set up event handlers
      retellClient.on('call_started', () => {
        console.log('Call started');
        setIsConnecting(false);
      });

      retellClient.on('call_ready', () => {
        console.log('Call ready - agent audio connected');
        setIsConnected(true);
        setIsConnecting(false);
        setError(null);
      });

      retellClient.on('call_ended', () => {
        console.log('Call ended');
        setIsConnected(false);
        setIsConnecting(false);
        cleanup();
      });

      retellClient.on('error', (error: any) => {
        console.error('Retell client error:', error);
        setError(typeof error === 'string' ? error : (error?.message || 'Connection error occurred'));
        setIsConnecting(false);
        setIsConnected(false);
      });

      retellClient.on('agent_start_talking', () => {
        console.log('Agent started talking');
      });

      retellClient.on('agent_stop_talking', () => {
        console.log('Agent stopped talking');
      });

      // Helper function to extract text from transcript objects
      const extractTranscriptText = (data: any): string | null => {
        if (!data) return null;
        
        // If it's already a string, return it
        if (typeof data === 'string') {
          return data.trim() || null;
        }
        
        // If it's an object, try to find text properties
        if (typeof data === 'object') {
          // Check common transcript properties
          if (data.text && typeof data.text === 'string') return data.text.trim();
          if (data.content && typeof data.content === 'string') return data.content.trim();
          if (data.transcript && typeof data.transcript === 'string') return data.transcript.trim();
          if (data.message && typeof data.message === 'string') return data.message.trim();
          if (data.sentence && typeof data.sentence === 'string') return data.sentence.trim();
          
          // If it's an array, process each item
          if (Array.isArray(data)) {
            const texts = data
              .map((item) => extractTranscriptText(item))
              .filter((text): text is string => text !== null);
            return texts.length > 0 ? texts.join(' ') : null;
          }
          
          // Try to find any string property
          for (const key in data) {
            if (typeof data[key] === 'string' && data[key].trim()) {
              return data[key].trim();
            }
          }
        }
        
        return null;
      };

      // Handle transcript updates
      retellClient.on('update', (event: any) => {
        console.log('Update event:', event);
        
        // Try to extract transcript from various locations
        const transcriptText = extractTranscriptText(event.transcript) ||
                              extractTranscriptText(event.transcript_segments) ||
                              extractTranscriptText(event.text) ||
                              extractTranscriptText(event.content) ||
                              extractTranscriptText(event);
        
        if (transcriptText) {
          setTranscript((prev) => {
            if (!prev) {
              return transcriptText.trim();
            }
            
            // Split into lines and get the last line
            const lines = prev.split('\n').filter(line => line.trim());
            const lastLine = lines[lines.length - 1] || '';
            const trimmedText = transcriptText.trim();
            
            // Check if this is an incremental update (new text extends the last line)
            // This handles cases like: "Hello!" -> "Hello! I'm" -> "Hello! I'm here"
            if (lastLine && trimmedText.startsWith(lastLine.trim())) {
              // Replace the last line with the updated/extended text
              lines[lines.length - 1] = trimmedText;
              return lines.join('\n');
            }
            
            // Check if the new text is exactly the same as the last line (duplicate)
            if (lastLine.trim() === trimmedText) {
              return prev;
            }
            
            // Check if the new text is already somewhere in the transcript (exact match)
            if (prev.includes(trimmedText)) {
              return prev;
            }
            
            // It's a completely new segment - add it as a new line
            return `${prev}\n${trimmedText}`;
          });
        }
      });

      retellClient.on('metadata', (event: any) => {
        console.log('Metadata event:', event);
        
        // Try to extract transcript from various locations
        const transcriptText = extractTranscriptText(event.transcript) ||
                              extractTranscriptText(event.transcript_segments) ||
                              extractTranscriptText(event.text) ||
                              extractTranscriptText(event.content) ||
                              extractTranscriptText(event);
        
        if (transcriptText) {
          setTranscript((prev) => {
            if (!prev) {
              return transcriptText.trim();
            }
            
            // Split into lines and get the last line
            const lines = prev.split('\n').filter(line => line.trim());
            const lastLine = lines[lines.length - 1] || '';
            const trimmedText = transcriptText.trim();
            
            // Check if this is an incremental update (new text extends the last line)
            // This handles cases like: "Hello!" -> "Hello! I'm" -> "Hello! I'm here"
            if (lastLine && trimmedText.startsWith(lastLine.trim())) {
              // Replace the last line with the updated/extended text
              lines[lines.length - 1] = trimmedText;
              return lines.join('\n');
            }
            
            // Check if the new text is exactly the same as the last line (duplicate)
            if (lastLine.trim() === trimmedText) {
              return prev;
            }
            
            // Check if the new text is already somewhere in the transcript (exact match)
            if (prev.includes(trimmedText)) {
              return prev;
            }
            
            // It's a completely new segment - add it as a new line
            return `${prev}\n${trimmedText}`;
          });
        }
      });

      // Start the call with the access token
      await retellClient.startCall({
        accessToken: accessToken,
        sampleRate: 24000,
      });

      // Start audio playback
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
                  <div className="h-20 w-20 rounded-full bg-green-500 flex items-center justify-center animate-pulse">
                    <Phone className="h-10 w-10 text-white" />
                  </div>
                  <p className="text-sm text-green-600 font-medium">
                    Connected - Speak now
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
                {transcript ? (
                  <div className="space-y-2 text-sm">
                    {transcript.split("\n").map((line, idx) => (
                      <p key={idx} className="text-muted-foreground">
                        {line}
                      </p>
                    ))}
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
                <Button
                  onClick={handleEndCall}
                  variant="destructive"
                  size="lg"
                >
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
            {error && error.includes("WebSocket") && (
              <div className="mt-3 p-3 rounded-lg bg-yellow-50 border border-yellow-200">
                <p className="text-xs text-yellow-800">
                  <strong>Note:</strong> WebRTC connection requires Retell's official JavaScript SDK or correct WebSocket endpoint. 
                  Please check Retell's documentation for web call integration or contact support for the correct connection method.
                </p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
