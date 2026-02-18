import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Bot,
  Phone,
  Clock,
  CheckCircle,
  XCircle,
  PhoneCall,
  Eye,
  FileText,
  AlertCircle,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { TranscriptDisplay } from "@/components/transcript/TranscriptDisplay";
import { formatDistanceToNow, format } from "date-fns";
import { CallStatus, Call, Bot as BotType } from "@/types/database";
import { toast } from "@/hooks/use-toast";

const statusConfig: Record<
  CallStatus,
  {
    icon: typeof Phone;
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  pending: { icon: Clock, label: "Pending", variant: "outline" },
  in_progress: { icon: PhoneCall, label: "In Progress", variant: "secondary" },
  completed: { icon: CheckCircle, label: "Completed", variant: "default" },
  failed: { icon: XCircle, label: "Failed", variant: "destructive" },
  not_connected: { icon: XCircle, label: "Not Connected", variant: "destructive" },
  night_time_dont_call: { icon: Clock, label: "Night Time", variant: "outline" },
};

interface BotDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bot: BotType | null;
}

export function BotDetailsDialog({
  open,
  onOpenChange,
  bot,
}: BotDetailsDialogProps) {
  const { user } = useAuth();
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [callDetailsOpen, setCallDetailsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("all");

  const fetchBotCalls = async () => {
    if (!bot || !user) return;

    setLoading(true);
    try {
      // Check if we have a valid session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        throw new Error("Authentication session expired. Please sign in again.");
      }

      const { data, error } = await supabase
        .from("calls")
        .select("*")
        .eq("user_id", user.id)
        .eq("bot_id", bot.id)
        .order("started_at", { ascending: false, nullsFirst: false });

      if (error) {
        // Provide more helpful error messages for common issues
        if (error.code === "PGRST301" || error.message?.includes("permission denied") || error.message?.includes("403")) {
          throw new Error("Permission denied. Please check your Row Level Security (RLS) policies in Supabase.");
        }
        throw error;
      }
      setCalls((data as unknown as Call[]) || []);
    } catch (error: any) {
      // Removed console.error for security
      const errorMessage = error?.message || "Failed to fetch bot calls";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && bot && user) {
      fetchBotCalls();
      // Only reset tab if switching to a different bot
      // Don't reset when dialog is just opened/closed
    }
    // Don't reset state when dialog closes - preserve call history
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bot, user]);

  const openCallDetails = (call: Call) => {
    setSelectedCall(call);
    setCallDetailsOpen(true);
  };

  const filteredCalls = calls.filter((call) => {
    if (activeTab === "all") return true;
    return call.status === activeTab;
  });

  // Calculate statistics
  const stats = {
    total: calls.length,
    pending: calls.filter((c) => c.status === "pending").length,
    inProgress: calls.filter((c) => c.status === "in_progress").length,
    completed: calls.filter((c) => c.status === "completed").length,
    failed: calls.filter((c) => c.status === "failed").length,
  };

  if (!bot) return null;

  // Use schema fields directly, fallback to bot_config for backward compatibility
  const voiceId = bot.voice_id || bot.bot_config?.voice_id;
  const voiceName =
    voiceId?.replace("11labs-", "").replace("openai-", "") || "Default";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              {bot.name} - Call Logs & Details
            </DialogTitle>
            <DialogDescription>
              View all calls made with this bot, their status, and processing
              details
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-hidden flex flex-col gap-4">
            {/* Bot Info Card */}
            <Card className="bg-gradient-to-br from-card to-muted/20 border-border/50">
              <CardHeader>
                <CardTitle className="text-lg">Bot Information</CardTitle>
                <CardDescription>Configuration and status</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <Label className="text-muted-foreground text-xs">
                      Status
                    </Label>
                    <div className="flex items-center gap-2 mt-1">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          bot.is_active
                            ? "bg-green-500 shadow-sm shadow-green-500/50"
                            : "bg-muted"
                        }`}
                      />
                      <span className="text-sm font-medium">
                        {bot.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">
                      Voice
                    </Label>
                    <p className="text-sm font-medium mt-1">{voiceName}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">
                      Created
                    </Label>
                    <p className="text-sm font-medium mt-1">
                      {formatDistanceToNow(new Date(bot.created_at), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">
                      Total Calls
                    </Label>
                    <p className="text-sm font-medium mt-1">{stats.total}</p>
                  </div>
                </div>
                {bot.description && (
                  <div className="mt-4">
                    <Label className="text-muted-foreground text-xs">
                      Description
                    </Label>
                    <p className="text-sm mt-1">{bot.description}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Call Statistics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="bg-gradient-to-br from-card to-muted/20 border-border/50">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total</p>
                      <p className="text-2xl font-bold">{stats.total}</p>
                    </div>
                    <Phone className="h-8 w-8 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-card to-muted/20 border-border/50">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Pending</p>
                      <p className="text-2xl font-bold">{stats.pending}</p>
                    </div>
                    <Clock className="h-8 w-8 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-card to-muted/20 border-border/50">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Completed</p>
                      <p className="text-2xl font-bold">{stats.completed}</p>
                    </div>
                    <CheckCircle className="h-8 w-8 text-green-500" />
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-card to-muted/20 border-border/50">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Failed</p>
                      <p className="text-2xl font-bold">{stats.failed}</p>
                    </div>
                    <XCircle className="h-8 w-8 text-destructive" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Call Logs Table */}
            <Card className="flex-1 flex flex-col overflow-hidden bg-gradient-to-br from-card to-muted/20 border-border/50">
              <CardHeader>
                <CardTitle>Call Logs</CardTitle>
                <CardDescription>
                  All calls made with this bot and their processing status
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col overflow-hidden">
                <Tabs
                  value={activeTab}
                  onValueChange={setActiveTab}
                  className="mb-4"
                >
                  <TabsList>
                    <TabsTrigger value="all">All ({stats.total})</TabsTrigger>
                    <TabsTrigger value="pending">
                      Pending ({stats.pending})
                    </TabsTrigger>
                    <TabsTrigger value="in_progress">
                      In Progress ({stats.inProgress})
                    </TabsTrigger>
                    <TabsTrigger value="completed">
                      Completed ({stats.completed})
                    </TabsTrigger>
                    <TabsTrigger value="failed">
                      Failed ({stats.failed})
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                {loading ? (
                  <div className="space-y-2 flex-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className="h-14 bg-secondary/50 rounded animate-pulse"
                      />
                    ))}
                  </div>
                ) : filteredCalls.length === 0 ? (
                  <div className="text-center py-12 flex-1 flex items-center justify-center">
                    <div>
                      <Phone className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                      <p className="text-muted-foreground">
                        No calls found for this bot
                      </p>
                    </div>
                  </div>
                ) : (
                  <ScrollArea className="flex-1">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Type</TableHead>
                          <TableHead>Contact</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Duration</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredCalls.map((call) => {
                          const statusCfg = statusConfig[call.status] || {
                            icon: Clock,
                            label: call.status || "Unknown",
                            variant: "outline" as const,
                          };
                          return (
                            <TableRow key={call.id}>
                              <TableCell>
                                {call.is_test_call ? (
                                  <Badge variant="secondary" className="gap-1">
                                    <Activity className="h-3 w-3" />
                                    Test
                                  </Badge>
                                ) : (
                                  <Badge variant="outline">Regular</Badge>
                                )}
                              </TableCell>
                              <TableCell className="font-medium">
                                {call.contact_name || "Unknown"}
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {call.phone_number === "test_call" ? "Test Call" : call.phone_number}
                              </TableCell>
                              <TableCell>
                                <Badge variant={statusCfg.variant}>
                                  {statusCfg.label}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {call.duration_seconds
                                  ? `${Math.floor(call.duration_seconds / 60)}m ${call.duration_seconds % 60}s`
                                  : "N/A"}
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {call.started_at
                                  ? formatDistanceToNow(
                                      new Date(call.started_at),
                                      {
                                        addSuffix: true,
                                      },
                                    )
                                  : call.completed_at
                                  ? formatDistanceToNow(
                                      new Date(call.completed_at),
                                      {
                                        addSuffix: true,
                                      },
                                    )
                                  : "N/A"}
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => openCallDetails(call)}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>
        </DialogContent>
      </Dialog>

      {/* Call Details Dialog */}
      <Dialog open={callDetailsOpen} onOpenChange={setCallDetailsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Call Details</DialogTitle>
            <DialogDescription>
              Full information about this call
            </DialogDescription>
          </DialogHeader>
          {selectedCall && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Contact Name</Label>
                  <p className="font-medium">
                    {selectedCall.contact_name || "Unknown"}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Phone Number</Label>
                  <p className="font-medium">{selectedCall.phone_number}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <Badge
                    variant={
                      statusConfig[selectedCall.status]?.variant || "outline"
                    }
                    className="mt-1"
                  >
                    {statusConfig[selectedCall.status]?.label ||
                      selectedCall.status ||
                      "Unknown"}
                  </Badge>
                </div>
                <div>
                  <Label className="text-muted-foreground">Duration</Label>
                  <p className="font-medium">
                    {selectedCall.duration_seconds
                      ? `${Math.floor(selectedCall.duration_seconds / 60)}m ${selectedCall.duration_seconds % 60}s`
                      : "N/A"}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Started</Label>
                  <p className="font-medium">
                    {selectedCall.started_at
                      ? format(new Date(selectedCall.started_at), "PPpp")
                      : selectedCall.completed_at
                      ? format(new Date(selectedCall.completed_at), "PPpp")
                      : "N/A"}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Completed</Label>
                  <p className="font-medium">
                    {selectedCall.completed_at
                      ? format(new Date(selectedCall.completed_at), "PPpp")
                      : "N/A"}
                  </p>
                </div>
              </div>

              {selectedCall.transcript && (
                <TranscriptDisplay
                  transcript={selectedCall.transcript}
                  metadata={selectedCall.metadata || selectedCall.webhook_response}
                  height="h-64"
                />
              )}

              {selectedCall.error_message && (
                <div>
                  <Label className="text-muted-foreground flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-destructive" />
                    Error
                  </Label>
                  <p className="text-sm text-destructive mt-1">
                    {selectedCall.error_message}
                  </p>
                </div>
              )}

              {selectedCall.recording_url && (
                <div>
                  <Label className="text-muted-foreground">Recording</Label>
                  <a
                    href={selectedCall.recording_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline text-sm mt-1 block"
                  >
                    Listen to recording
                  </a>
                </div>
              )}

              {selectedCall.metadata &&
                Object.keys(selectedCall.metadata).length > 0 && (
                  <div>
                    <Label className="text-muted-foreground">Metadata</Label>
                    <ScrollArea className="h-32 mt-2 p-3 bg-secondary/30 rounded-lg border border-border/50">
                      <pre className="text-xs font-mono text-foreground whitespace-pre-wrap">
                        {JSON.stringify(selectedCall.metadata, null, 2)}
                      </pre>
                    </ScrollArea>
                  </div>
                )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
