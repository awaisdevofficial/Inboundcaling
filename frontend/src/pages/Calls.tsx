import { useState } from "react";
import {
  Phone,
  PhoneCall,
  Loader2,
  Clock,
  CheckCircle,
  XCircle,
  Eye,
  Bot as BotIcon,
  Calendar as CalendarIcon,
  Copy,
  Check,
  User,
  Link as LinkIcon,
  FileText,
  Database,
  Filter,
  PhoneOff,
  Moon,
  PhoneIncoming,
  Download,
} from "lucide-react";
import { TranscriptDisplay } from "@/components/transcript/TranscriptDisplay";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { FeatureGate } from "@/components/FeatureGate";
import { useCalls } from "@/hooks/useCalls";
import { useBots } from "@/hooks/useBots";
import { useProfile } from "@/hooks/useProfile";
import { CallStatus } from "@/types/database";
import {
  formatInUserTimezone,
  formatScheduledAt,
  exportToCSV,
} from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import type { Call } from "@/types/database";

const statusConfig: Record<
  CallStatus,
  {
    icon: typeof Phone;
    label: string;
    variant:
      | "default"
      | "secondary"
      | "destructive"
      | "outline"
      | "success"
      | "warning";
    color: string;
    bgColor: string;
  }
> = {
  pending: {
    icon: Clock,
    label: "Pending",
    variant: "outline",
    color: "text-muted-foreground",
    bgColor: "bg-muted/30",
  },
  in_progress: {
    icon: PhoneCall,
    label: "In Progress",
    variant: "warning",
    color: "text-warning",
    bgColor: "bg-warning/10",
  },
  completed: {
    icon: CheckCircle,
    label: "Completed",
    variant: "success",
    color: "text-success",
    bgColor: "bg-success/10",
  },
  failed: {
    icon: XCircle,
    label: "Failed",
    variant: "destructive",
    color: "text-destructive",
    bgColor: "bg-destructive/10",
  },
  not_connected: {
    icon: PhoneOff,
    label: "Not Connected",
    variant: "secondary",
    color: "text-muted-foreground",
    bgColor: "bg-muted/30",
  },
  night_time_dont_call: {
    icon: Moon,
    label: "Night Time Don't Call",
    variant: "outline",
    color: "text-muted-foreground",
    bgColor: "bg-muted/30",
  },
};

export default function Calls() {
  const {
    calls,
    loading,
  } = useCalls();
  const { bots } = useBots();
  const { profile } = useProfile();
  const userTimezone = profile?.timezone || "UTC";
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = async (text: string, fieldName: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const getBotName = (botId: string | null) => {
    if (!botId) return "N/A";
    const bot = bots.find((b) => b.id === botId);
    return bot?.name || botId;
  };

  // Filter calls by status
  const filteredCalls = calls.filter((call) => {
    // Status filter
    if (statusFilter !== "all") {
      const callStatus = (call.status || "").toLowerCase();
      if (callStatus !== statusFilter.toLowerCase()) return false;
    }
    return true;
  });

  // Calculate stats for calls
  const callStats = {
    totalCalls: filteredCalls.length,
    pendingCalls: filteredCalls.filter((c) => c.status === "pending").length,
    inProgressCalls: filteredCalls.filter((c) => c.status === "in_progress").length,
    completedCalls: filteredCalls.filter((c) => c.status === "completed").length,
    failedCalls: filteredCalls.filter((c) => c.status === "failed").length,
    notConnectedCalls: filteredCalls.filter((c) => c.status === "not_connected").length,
  };

  const openDetails = (call: Call) => {
    setSelectedCall(call);
    setDetailsOpen(true);
  };

  const handleExportCalls = () => {
    const exportData = filteredCalls.map((call) => {
      const status = (call.status || "pending").toLowerCase();
      const config = statusConfig[status as CallStatus] || {
        icon: Clock,
        label: status,
        variant: "outline" as const,
        color: "text-muted-foreground",
        bgColor: "bg-muted/30",
      };

      return {
        "Phone Number": call.phone_number || "",
        "Contact Name": call.contact_name || "",
        "Status": config.label,
        "Duration (seconds)": call.duration_seconds || "",
        "Duration (formatted)": call.duration_seconds
          ? `${Math.floor(call.duration_seconds / 60)}:${String(call.duration_seconds % 60).padStart(2, "0")}`
          : "",
        "Bot": getBotName(call.bot_id),
        "Started At": call.started_at
          ? formatInUserTimezone(call.started_at, userTimezone, "MMM dd, yyyy HH:mm")
          : "",
        "Completed At": call.completed_at
          ? formatInUserTimezone(call.completed_at, userTimezone, "MMM dd, yyyy HH:mm")
          : "",
        "Scheduled": formatScheduledAt(call.Scheduled_at, "MMM dd, yyyy 'at' h:mm a"),
        "Transcript": call.transcript || "",
        "Recording URL": call.recording_url || "",
        "Created At": call.created_at
          ? formatInUserTimezone(call.created_at, userTimezone, "MMM dd, yyyy HH:mm")
          : "",
      };
    });

    exportToCSV(exportData, `call-history-${new Date().toISOString().split("T")[0]}`);
  };


  return (
    <ProtectedRoute>
      <DashboardLayout>
        <FeatureGate featureName="call history">
          <div className="space-y-8 pb-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="space-y-1">
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Call History</h1>
              <p className="text-slate-500 text-base">View and manage all your call records</p>
            </div>
          </div>

          {/* Stats Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Total Calls</p>
                  <h3 className="text-2xl font-bold text-slate-900 mt-1">{callStats.totalCalls}</h3>
                </div>
                <div className="p-3 bg-blue-50 rounded-xl">
                  <Phone className="h-5 w-5 text-blue-600" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Completed</p>
                  <h3 className="text-2xl font-bold text-slate-900 mt-1">{callStats.completedCalls}</h3>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl">
                  <CheckCircle className="h-5 w-5 text-emerald-600" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">In Progress</p>
                  <h3 className="text-2xl font-bold text-slate-900 mt-1">{callStats.inProgressCalls}</h3>
                </div>
                <div className="p-3 bg-amber-50 rounded-xl">
                  <PhoneCall className="h-5 w-5 text-amber-600" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Failed</p>
                  <h3 className="text-2xl font-bold text-slate-900 mt-1">{callStats.failedCalls}</h3>
                </div>
                <div className="p-3 bg-red-50 rounded-xl">
                  <XCircle className="h-5 w-5 text-red-600" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Pending</p>
                  <h3 className="text-2xl font-bold text-slate-900 mt-1">{callStats.pendingCalls}</h3>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl">
                  <Clock className="h-5 w-5 text-slate-400" />
                </div>
              </div>
            </div>
          </div>

          {/* Calls Section */}
          <div className="space-y-6">
            <Card className="border-slate-200 shadow-sm bg-white">
              <CardHeader className="border-b border-slate-100 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                      <PhoneIncoming className="h-5 w-5 text-blue-600" />
                      Call History
                    </CardTitle>
                    <CardDescription className="text-slate-500 mt-1">
                      {callStats.totalCalls} total calls
                    </CardDescription>
                  </div>
                  {/* Filter Dropdown and Export Button */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={handleExportCalls}
                      disabled={filteredCalls.length === 0}
                    >
                      <Download className="h-4 w-4" />
                      Export CSV
                    </Button>
                    <DropdownMenu open={filterOpen} onOpenChange={setFilterOpen}>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-2">
                          <Filter className="h-4 w-4" />
                          Filters
                          {statusFilter !== "all" && (
                            <Badge variant="secondary" className="ml-1">
                              1
                            </Badge>
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuLabel>Status Filter</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuCheckboxItem
                          checked={statusFilter === "all"}
                          onCheckedChange={() => setStatusFilter("all")}
                        >
                          All ({callStats.totalCalls})
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem
                          checked={statusFilter === "in_progress"}
                          onCheckedChange={() => setStatusFilter("in_progress")}
                        >
                          In Progress ({callStats.inProgressCalls})
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem
                          checked={statusFilter === "completed"}
                          onCheckedChange={() => setStatusFilter("completed")}
                        >
                          Completed ({callStats.completedCalls})
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem
                          checked={statusFilter === "failed"}
                          onCheckedChange={() => setStatusFilter("failed")}
                        >
                          Failed ({callStats.failedCalls})
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem
                          checked={statusFilter === "not_connected"}
                          onCheckedChange={() => setStatusFilter("not_connected")}
                        >
                          Not Connected ({callStats.notConnectedCalls})
                        </DropdownMenuCheckboxItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {statusFilter !== "all" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setStatusFilter("all")}
                      >
                        Clear Filters
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : filteredCalls.length === 0 ? (
                  <div className="text-center py-12">
                    <PhoneIncoming className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No calls yet</p>
                    <p className="text-sm text-muted-foreground mt-2">
                      Calls from your agents will appear here
                    </p>
                  </div>
                ) : (
                  <ScrollArea className="h-[600px]">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Phone Number</TableHead>
                            <TableHead>Contact Name</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Duration</TableHead>
                            <TableHead>Bot</TableHead>
                            <TableHead>Started At</TableHead>
                            <TableHead>Completed At</TableHead>
                            <TableHead>Scheduled</TableHead>
                            <TableHead>Transcript</TableHead>
                            <TableHead>Recording URL</TableHead>
                            <TableHead></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredCalls.map((call) => {
                            const status = (call.status || "pending").toLowerCase();
                            const config = statusConfig[status as CallStatus] || {
                              icon: Clock,
                              label: status,
                              variant: "outline" as const,
                              color: "text-muted-foreground",
                              bgColor: "bg-muted/30",
                            };
                            const StatusIcon = config.icon;

                            return (
                              <TableRow 
                                key={call.id} 
                                className="hover:bg-muted/50 cursor-pointer"
                                onClick={() => openDetails(call)}
                              >
                                <TableCell className="font-medium">
                                  {call.phone_number}
                                </TableCell>
                                <TableCell>
                                  {call.contact_name || "-"}
                                </TableCell>
                                <TableCell>
                                  <Badge variant={config.variant} className="gap-1">
                                    <StatusIcon className="h-3 w-3" />
                                    {config.label}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  {call.duration_seconds
                                    ? `${Math.floor(call.duration_seconds / 60)}:${String(call.duration_seconds % 60).padStart(2, "0")}`
                                    : "-"}
                                </TableCell>
                                <TableCell>
                                  {getBotName(call.bot_id)}
                                </TableCell>
                                <TableCell className="text-sm">
                                  {call.started_at
                                    ? formatInUserTimezone(
                                        call.started_at,
                                        userTimezone,
                                        "MMM dd, yyyy HH:mm",
                                      )
                                    : "-"}
                                </TableCell>
                                <TableCell className="text-sm">
                                  {call.completed_at
                                    ? formatInUserTimezone(
                                        call.completed_at,
                                        userTimezone,
                                        "MMM dd, yyyy HH:mm",
                                      )
                                    : "-"}
                                </TableCell>
                                <TableCell className="text-sm">
                                  {formatScheduledAt(call.Scheduled_at, "MMM dd, yyyy 'at' h:mm a")}
                                </TableCell>
                                <TableCell className="text-xs max-w-[200px] truncate">
                                  {call.transcript ? (
                                    <span className="text-muted-foreground" title={call.transcript}>
                                      {call.transcript.length > 50 
                                        ? `${call.transcript.substring(0, 50)}...` 
                                        : call.transcript}
                                    </span>
                                  ) : "-"}
                                </TableCell>
                                <TableCell className="text-xs max-w-[200px]">
                                  {call.recording_url ? (
                                    <a
                                      href={call.recording_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-primary hover:underline truncate block"
                                      onClick={(e) => e.stopPropagation()}
                                      title={call.recording_url}
                                    >
                                      {call.recording_url.length > 30 
                                        ? `${call.recording_url.substring(0, 30)}...` 
                                        : call.recording_url}
                                    </a>
                                  ) : "-"}
                                </TableCell>
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => openDetails(call)}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Call Details Dialog */}
        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <PhoneCall className="h-5 w-5" />
                Call Details
              </DialogTitle>
              <DialogDescription>
                Complete information about this call
              </DialogDescription>
            </DialogHeader>
            {selectedCall && (
              <div className="flex-1 overflow-hidden">
                <Tabs
                  defaultValue="overview"
                  className="w-full h-full flex flex-col"
                >
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="timeline">Timeline</TabsTrigger>
                    <TabsTrigger value="content">Content</TabsTrigger>
                    <TabsTrigger value="technical">Technical</TabsTrigger>
                  </TabsList>

                  <ScrollArea className="flex-1 mt-4">
                    {/* Overview Tab */}
                    <TabsContent value="overview" className="space-y-4 mt-0">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground flex items-center gap-1">
                            <User className="h-3 w-3" />
                            Contact Name
                          </Label>
                          <p className="font-medium">
                            {selectedCall.contact_name || "N/A"}
                          </p>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            Phone Number
                          </Label>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">
                              {selectedCall.phone_number}
                            </p>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() =>
                                copyToClipboard(
                                  selectedCall.phone_number,
                                  "phone",
                                )
                              }
                            >
                              {copiedField === "phone" ? (
                                <Check className="h-3 w-3 text-success" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground flex items-center gap-1">
                            <BotIcon className="h-3 w-3" />
                            Bot
                          </Label>
                          <p className="font-medium">
                            {getBotName(selectedCall.bot_id)}
                          </p>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">
                            Status
                          </Label>
                          <Badge
                            variant={
                              statusConfig[selectedCall.status]?.variant ||
                              "outline"
                            }
                            className="mt-1"
                          >
                            {statusConfig[selectedCall.status]?.label ||
                              selectedCall.status ||
                              "Unknown"}
                          </Badge>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">
                            Duration
                          </Label>
                          <p className="font-medium">
                            {selectedCall.duration_seconds
                              ? `${Math.floor(selectedCall.duration_seconds / 60)}m ${selectedCall.duration_seconds % 60}s`
                              : "N/A"}
                          </p>
                        </div>

                        {selectedCall.started_at && (
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground flex items-center gap-1">
                              <PhoneCall className="h-3 w-3" />
                              Started At
                            </Label>
                            <p className="font-medium text-xs">
                              {formatInUserTimezone(
                                selectedCall.started_at,
                                userTimezone,
                                "PPpp",
                              )}
                            </p>
                          </div>
                        )}

                        {selectedCall.completed_at && (
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground flex items-center gap-1">
                              <CheckCircle className="h-3 w-3" />
                              Completed At
                            </Label>
                            <p className="font-medium text-xs">
                              {formatInUserTimezone(
                                selectedCall.completed_at,
                                userTimezone,
                                "PPpp",
                              )}
                            </p>
                          </div>
                        )}

                        {selectedCall.Scheduled_at && (
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Scheduled At
                            </Label>
                            <p className="font-medium text-xs">
                              {formatScheduledAt(selectedCall.Scheduled_at, "PPpp")}
                            </p>
                          </div>
                        )}
                        
                        {selectedCall.recording_url && (
                          <div className="space-y-1 col-span-full">
                            <Label className="text-xs text-muted-foreground flex items-center gap-1">
                              <LinkIcon className="h-3 w-3" />
                              Recording URL
                            </Label>
                            <div className="flex items-center gap-2">
                              <a
                                href={selectedCall.recording_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-primary hover:underline truncate"
                              >
                                {selectedCall.recording_url}
                              </a>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() =>
                                  copyToClipboard(
                                    selectedCall.recording_url || "",
                                    "recording",
                                  )
                                }
                              >
                                {copiedField === "recording" ? (
                                  <Check className="h-3 w-3 text-success" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </TabsContent>

                    {/* Timeline Tab */}
                    <TabsContent value="timeline" className="space-y-4 mt-0">
                      <div className="space-y-4">
                        {(selectedCall.created_at || selectedCall.started_at) && (
                          <div className="flex items-start gap-4">
                            <div className="flex flex-col items-center">
                              <div className="w-2 h-2 rounded-full bg-primary" />
                              <div className="w-0.5 h-full bg-border mt-1" />
                            </div>
                            <div className="flex-1 pb-4">
                              <Label className="text-sm font-medium flex items-center gap-2">
                                <CalendarIcon className="h-4 w-4" />
                                Created At
                              </Label>
                              <p className="text-sm text-muted-foreground mt-1">
                                {selectedCall.created_at
                                  ? formatInUserTimezone(
                                      selectedCall.created_at,
                                      userTimezone,
                                      "PPpp",
                                    )
                                  : selectedCall.started_at
                                  ? formatInUserTimezone(
                                      selectedCall.started_at,
                                      userTimezone,
                                      "PPpp",
                                    )
                                  : "N/A"}
                              </p>
                              {(selectedCall.created_at || selectedCall.started_at) && (
                                <p className="text-xs text-muted-foreground mt-1 font-mono">
                                  {selectedCall.created_at || selectedCall.started_at}
                                </p>
                              )}
                            </div>
                          </div>
                        )}

                        {selectedCall.started_at && selectedCall.created_at !== selectedCall.started_at && (
                          <div className="flex items-start gap-4">
                            <div className="flex flex-col items-center">
                              <div className="w-2 h-2 rounded-full bg-primary" />
                              <div className="w-0.5 h-full bg-border mt-1" />
                            </div>
                            <div className="flex-1 pb-4">
                              <Label className="text-sm font-medium flex items-center gap-2">
                                <PhoneCall className="h-4 w-4" />
                                Started At
                              </Label>
                              <p className="text-sm text-muted-foreground mt-1">
                                {formatInUserTimezone(
                                  selectedCall.started_at,
                                  userTimezone,
                                  "PPpp",
                                )}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1 font-mono">
                                {selectedCall.started_at}
                              </p>
                            </div>
                          </div>
                        )}


                        {selectedCall.completed_at && (
                          <div className="flex items-start gap-4">
                            <div className="flex flex-col items-center">
                              <div className="w-2 h-2 rounded-full bg-primary" />
                              <div className="w-0.5 h-full bg-border mt-1" />
                            </div>
                            <div className="flex-1 pb-4">
                              <Label className="text-sm font-medium flex items-center gap-2">
                                <CheckCircle className="h-4 w-4" />
                                Completed At
                              </Label>
                              <p className="text-sm text-muted-foreground mt-1">
                                {formatInUserTimezone(
                                  selectedCall.completed_at,
                                  userTimezone,
                                  "PPpp",
                                )}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1 font-mono">
                                {selectedCall.completed_at}
                              </p>
                            </div>
                          </div>
                        )}

                        {selectedCall.Scheduled_at && (
                          <div className="flex items-start gap-4">
                            <div className="flex flex-col items-center">
                              <div className="w-2 h-2 rounded-full bg-primary" />
                              <div className="w-0.5 h-full bg-border mt-1" />
                            </div>
                            <div className="flex-1 pb-4">
                              <Label className="text-sm font-medium flex items-center gap-2">
                                <Clock className="h-4 w-4" />
                                Scheduled For
                              </Label>
                              <p className="text-sm text-muted-foreground mt-1">
                                {formatScheduledAt(selectedCall.Scheduled_at, "PPpp")}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </TabsContent>

                    {/* Content Tab */}
                    <TabsContent value="content" className="space-y-4 mt-0">
                      {selectedCall.transcript && (
                        <TranscriptDisplay
                          transcript={selectedCall.transcript}
                          metadata={selectedCall.metadata || selectedCall.webhook_response}
                          height="h-96"
                        />
                      )}

                      {selectedCall.recording_url && (
                        <div>
                          <Label className="text-sm font-medium flex items-center gap-2 mb-2">
                            <Phone className="h-4 w-4" />
                            Recording
                          </Label>
                          <div className="mt-2 space-y-2">
                            <audio
                              controls
                              className="w-full"
                              src={selectedCall.recording_url}
                              preload="metadata"
                            >
                              Your browser does not support the audio element.
                            </audio>
                            <a
                              href={selectedCall.recording_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline text-sm flex items-center gap-1"
                            >
                              <LinkIcon className="h-3 w-3" />
                              Open recording in new tab
                            </a>
                          </div>
                        </div>
                      )}

                      {!selectedCall.transcript &&
                        !selectedCall.recording_url && (
                          <div className="text-center py-12 text-muted-foreground">
                            <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                            <p>No content available for this call</p>
                          </div>
                        )}
                    </TabsContent>

                    {/* Technical Tab */}
                    <TabsContent value="technical" className="space-y-4 mt-0">
                      {selectedCall.metadata &&
                        Object.keys(selectedCall.metadata).length > 0 && (
                          <div>
                            <Label className="text-sm font-medium flex items-center gap-2 mb-2">
                              <Database className="h-4 w-4" />
                              Metadata
                            </Label>
                            <ScrollArea className="h-48 mt-2 p-4 bg-secondary/30 rounded-lg border">
                              <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-words">
                                {JSON.stringify(selectedCall.metadata, null, 2)}
                              </pre>
                            </ScrollArea>
                          </div>
                        )}

                      <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                        <div>
                          <Label className="text-xs text-muted-foreground">
                            Bot ID
                          </Label>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="font-mono text-xs font-medium truncate">
                              {selectedCall.bot_id || "N/A"}
                            </p>
                            {selectedCall.bot_id && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() =>
                                  copyToClipboard(
                                    selectedCall.bot_id!,
                                    "bot_id",
                                  )
                                }
                              >
                                {copiedField === "bot_id" ? (
                                  <Check className="h-3 w-3 text-success" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>

                      {!selectedCall.metadata && (
                          <div className="text-center py-12 text-muted-foreground">
                            <Database className="h-12 w-12 mx-auto mb-3 opacity-50" />
                            <p>No technical data available</p>
                          </div>
                        )}
                    </TabsContent>
                  </ScrollArea>
                </Tabs>
              </div>
            )}
          </DialogContent>
        </Dialog>
        </FeatureGate>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
