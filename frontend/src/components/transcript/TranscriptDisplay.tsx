import { FileText, Bot, User } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface TranscriptSegment {
  role: "agent" | "user" | "assistant" | "human";
  text: string;
  timestamp?: string;
}

interface TranscriptDisplayProps {
  transcript: string | null;
  metadata?: any;
  className?: string;
  showLabel?: boolean;
  height?: string;
}

/**
 * Parses a transcript string and attempts to identify speaker roles
 */
function parseTranscript(transcript: string, metadata?: any): TranscriptSegment[] {
  if (!transcript) return [];

  // First, check if metadata has structured transcript segments
  if (metadata?.transcript_segments && Array.isArray(metadata.transcript_segments)) {
    return metadata.transcript_segments.map((seg: any) => ({
      role: seg.role || seg.speaker || (seg.is_agent ? "agent" : "user"),
      text: seg.text || seg.transcript || seg.content || "",
      timestamp: seg.timestamp,
    }));
  }

  // Check if metadata has a structured transcript object
  if (metadata?.transcript && typeof metadata.transcript === "object") {
    if (Array.isArray(metadata.transcript)) {
      return metadata.transcript.map((seg: any) => ({
        role: seg.role || seg.speaker || (seg.is_agent ? "agent" : "user"),
        text: seg.text || seg.transcript || seg.content || "",
        timestamp: seg.timestamp,
      }));
    }
  }

  // Fallback: Parse plain text transcript
  // First try splitting by double newlines (paragraph breaks)
  let segments = transcript
    .split(/\n\n+/)
    .map((text) => text.trim())
    .filter((text) => text.length > 0);

  // If no double newlines, try single newlines
  if (segments.length <= 1) {
    segments = transcript
      .split("\n")
      .map((text) => text.trim())
      .filter((text) => text.length > 0);
  }

  // If still only one segment, try splitting by sentence boundaries
  if (segments.length === 1 && segments[0].length > 200) {
    // Split by periods followed by space and capital letter, or question marks
    segments = segments[0]
      .split(/(?<=[.!?])\s+(?=[A-Z])/)
      .map((text) => text.trim())
      .filter((text) => text.length > 0);
  }

  // Process segments with context awareness
  return segments.map((text, index) => {
    const segment = identifySpeaker(text);
    // Use context from previous segments to improve accuracy
    if (index > 0) {
      const prevSegment = segments[index - 1];
      const prevRole = identifySpeaker(prevSegment).role;
      
      // If current segment is very short and previous was agent, likely human response
      if (prevRole === "agent" && text.length < 100 && !text.match(/^(how|what|when|where|why|can|would|is|are|do|does)/i)) {
        segment.role = "user";
      }
      
      // If previous was user and current is long with questions, likely agent
      if (prevRole === "user" && text.length > 100 && (text.match(/\?/g) || []).length >= 1) {
        segment.role = "agent";
      }
    }
    return segment;
  });
}

/**
 * Attempts to identify if a text segment is from the agent or human
 */
function identifySpeaker(text: string): TranscriptSegment {
  const lowerText = text.toLowerCase().trim();

  // Agent indicators (common greetings and professional phrases)
  const agentIndicators = [
    "how can i assist",
    "how can i help",
    "how are you doing",
    "thank you for",
    "i'm here to",
    "i'd be happy to",
    "let me help",
    "i understand",
    "i'm sorry to hear",
    "would you like",
    "is there anything",
    "can i help",
    "what can i do",
    "i can help",
    "i'll be happy",
    "please let me know",
    "feel free to",
    "i'm here",
    "good morning",
    "good afternoon",
    "good evening",
    "hello!",
    "hi there",
  ];

  // Check if text starts with common agent phrases
  const startsWithAgentPhrase = agentIndicators.some((phrase) =>
    lowerText.startsWith(phrase)
  );

  // Check if text contains multiple questions (agent behavior)
  const questionCount = (text.match(/\?/g) || []).length;
  const hasMultipleQuestions = questionCount >= 2;

  // Check if text is very long (agent often provides more detailed responses)
  const isLongResponse = text.length > 150;

  // Check if text contains professional language patterns
  const hasProfessionalLanguage =
    lowerText.includes("assist") ||
    lowerText.includes("help") ||
    lowerText.includes("please") ||
    lowerText.includes("thank you") ||
    lowerText.includes("understand");

  // Human indicators (shorter, more casual responses)
  const humanIndicators = [
    "i am",
    "i'm",
    "yes",
    "no",
    "okay",
    "ok",
    "sure",
    "thanks",
    "thank you",
    "i want",
    "i need",
    "i have",
    "i think",
    "i feel",
  ];

  const startsWithHumanPhrase = humanIndicators.some((phrase) =>
    lowerText.startsWith(phrase)
  );

  // Scoring system
  let agentScore = 0;
  let humanScore = 0;

  if (startsWithAgentPhrase) agentScore += 3;
  if (hasMultipleQuestions) agentScore += 2;
  if (isLongResponse && hasProfessionalLanguage) agentScore += 2;
  if (hasProfessionalLanguage) agentScore += 1;

  if (startsWithHumanPhrase) humanScore += 2;
  if (text.length < 50 && !startsWithAgentPhrase) humanScore += 1;
  if (questionCount === 0 && text.length < 100) humanScore += 1;

  // Default to agent if it's the first segment and starts with greeting
  if (lowerText.match(/^(hello|hi|hey|good (morning|afternoon|evening))/)) {
    return { role: "agent", text };
  }

  // Determine role based on score
  if (agentScore > humanScore) {
    return { role: "agent", text };
  } else if (humanScore > agentScore) {
    return { role: "user", text };
  }

  // Default: alternate between agent and user if uncertain
  // This is a fallback - in practice, better data structure would help
  return { role: "agent", text };
}

export function TranscriptDisplay({
  transcript,
  metadata,
  className = "",
  showLabel = true,
  height = "h-48",
}: TranscriptDisplayProps) {
  if (!transcript) return null;

  const segments = parseTranscript(transcript, metadata);

  return (
    <div className={className}>
      {showLabel && (
        <Label className="text-sm font-medium flex items-center gap-2 mb-2">
          <FileText className="h-4 w-4" />
          Transcript
        </Label>
      )}
      <ScrollArea className={`${height} mt-2 p-4 bg-secondary/30 rounded-lg border`}>
        <div className="space-y-3">
          {segments.map((segment, index) => {
            const isAgent = segment.role === "agent" || segment.role === "assistant";
            const isUser = segment.role === "user" || segment.role === "human";

            return (
              <div
                key={index}
                className={`flex gap-3 ${
                  isAgent ? "flex-row" : "flex-row-reverse"
                }`}
              >
                {/* Avatar/Badge */}
                <div
                  className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    isAgent
                      ? "bg-blue-100 text-blue-700"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {isAgent ? (
                    <Bot className="h-4 w-4" />
                  ) : (
                    <User className="h-4 w-4" />
                  )}
                </div>

                {/* Message Content */}
                <div className={`flex-1 ${isAgent ? "" : "text-right"}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge
                      variant={isAgent ? "default" : "secondary"}
                      className={`text-xs ${
                        isAgent
                          ? "bg-blue-100 text-blue-700 hover:bg-blue-100"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {isAgent ? "Agent" : "Human"}
                    </Badge>
                    {segment.timestamp && (
                      <span className="text-xs text-muted-foreground">
                        {segment.timestamp}
                      </span>
                    )}
                  </div>
                  <div
                    className={`text-sm whitespace-pre-wrap leading-relaxed p-3 rounded-lg ${
                      isAgent
                        ? "bg-blue-50 text-blue-900 border border-blue-200"
                        : "bg-slate-50 text-slate-900 border border-slate-200"
                    }`}
                  >
                    {segment.text}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
