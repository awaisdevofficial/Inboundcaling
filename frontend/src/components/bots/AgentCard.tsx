import { useState } from "react";
import {
  Bot,
  Trash2,
  Edit2,
  MoreVertical,
  Settings2,
  Mic,
  PhoneIncoming,
  PhoneOutgoing,
  Phone,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDistanceToNow } from "date-fns";
import type { Bot as BotType } from "@/types/database";
import { TestAgentModal } from "./TestAgentModal";

interface AgentCardProps {
  bot: BotType;
  onEdit: (bot: BotType) => void;
  onDelete: (bot: BotType) => void;
  onViewDetails?: (bot: BotType) => void;
}

export function AgentCard({
  bot,
  onEdit,
  onDelete,
  onViewDetails,
}: AgentCardProps) {
  const [testModalOpen, setTestModalOpen] = useState(false);

  // Use schema fields directly, fallback to bot_config for backward compatibility
  const voiceId = bot.voice_id || bot.bot_config?.voice_id;
  const voiceName =
    voiceId?.replace("11labs-", "").replace("openai-", "") || "Default";
  const beginMessage =
    bot.begin_message || bot.bot_config?.begin_message;
  
  // Handle begin_message - could be string or array
  const displayMessage = Array.isArray(beginMessage)
    ? beginMessage[0] || ""
    : beginMessage || "";

  const handleCardClick = () => {
    if (onViewDetails) {
      onViewDetails(bot);
    }
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit(bot);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(bot);
  };

  const handleTestAgent = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTestModalOpen(true);
  };

  return (
    <Card
      className="group bg-gradient-to-br from-card via-card/95 to-muted/20 border-border/50 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10 transition-all duration-300 cursor-pointer transform hover:-translate-y-1 h-full flex flex-col"
      onClick={handleCardClick}
    >
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary via-primary/90 to-primary/70 flex items-center justify-center shadow-lg shadow-primary/20 group-hover:shadow-xl group-hover:shadow-primary/30 transition-shadow duration-300 flex-shrink-0">
              <Bot className="h-7 w-7 text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-lg group-hover:text-primary transition-colors truncate">
                {bot.name}
              </CardTitle>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <div
                  className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                    bot.is_active
                      ? "bg-success shadow-lg shadow-success/50 animate-pulse"
                      : "bg-muted"
                  }`}
                />
                <span className="text-xs text-muted-foreground">
                  {bot.is_active ? "Active" : "Inactive"}
                </span>
              </div>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-primary/10 hover:text-primary flex-shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={handleTestAgent}>
                <Phone className="mr-2 h-4 w-4" />
                Test Agent
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleEdit}>
                <Edit2 className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 flex-1 flex flex-col">
        {bot.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
            {bot.description}
          </p>
        )}

        {/* Badges */}
        <div className="flex flex-wrap gap-2">
          {bot.Agent_role && (
            <Badge
              variant="secondary"
              className={`gap-1.5 border-0 ${
                bot.Agent_role === "Inbound"
                  ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                  : "bg-green-500/10 text-green-600 dark:text-green-400"
              }`}
            >
              {bot.Agent_role === "Inbound" ? (
                <PhoneIncoming className="h-3 w-3" />
              ) : (
                <PhoneOutgoing className="h-3 w-3" />
              )}
              {bot.Agent_role}
            </Badge>
          )}
          <Badge
            variant="secondary"
            className="gap-1.5 bg-primary/10 text-primary border-0"
          >
            <Mic className="h-3 w-3" />
            {voiceName}
          </Badge>
          {bot.model && (
            <Badge variant="outline" className="text-xs">
              {bot.model}
            </Badge>
          )}
        </div>

        {/* Begin message preview */}
        {displayMessage && (
          <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
            <p className="text-xs text-muted-foreground italic line-clamp-2 leading-relaxed">
              "{displayMessage}"
            </p>
          </div>
        )}

        <div className="flex items-center justify-between pt-4 border-t border-border/50 mt-auto gap-2">
          <p className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(bot.created_at), {
              addSuffix: true,
            })}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs hover:bg-green-50 hover:text-green-600 hover:border-green-300 transition-colors duration-200"
              onClick={handleTestAgent}
            >
              <Phone className="h-3.5 w-3.5 mr-1.5" />
              Test
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-3 text-xs hover:bg-primary/10 hover:text-primary transition-colors duration-200"
              onClick={handleEdit}
            >
              <Settings2 className="h-3.5 w-3.5 mr-1.5" />
              Configure
            </Button>
          </div>
        </div>
      </CardContent>
      <TestAgentModal
        open={testModalOpen}
        onOpenChange={setTestModalOpen}
        bot={bot}
      />
    </Card>
  );
}
