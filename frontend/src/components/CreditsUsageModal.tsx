import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCreditUsage } from "@/hooks/useCreditUsage";
import { useProfile } from "@/hooks/useProfile";
import { formatDuration } from "@/lib/credits";
import { format } from "date-fns";
import {
  Phone,
  MessageSquare,
  Brain,
  PhoneCall,
  Zap,
  Clock,
  TrendingUp,
  Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { CreditUsageLog } from "@/types/database";

interface CreditsUsageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const usageTypeConfig = {
  call: {
    label: "Calls",
    icon: Phone,
    color: "bg-blue-50 text-blue-700 border-blue-200",
    iconColor: "text-blue-600",
  },
  sms: {
    label: "SMS",
    icon: MessageSquare,
    color: "bg-purple-50 text-purple-700 border-purple-200",
    iconColor: "text-purple-600",
  },
  ai_analysis: {
    label: "AI Analysis",
    icon: Brain,
    color: "bg-emerald-50 text-emerald-700 border-emerald-200",
    iconColor: "text-emerald-600",
  },
  phone_number_rental: {
    label: "Phone Number Rental",
    icon: PhoneCall,
    color: "bg-amber-50 text-amber-700 border-amber-200",
    iconColor: "text-amber-600",
  },
  other: {
    label: "Other",
    icon: Zap,
    color: "bg-slate-50 text-slate-700 border-slate-200",
    iconColor: "text-slate-600",
  },
};

export function CreditsUsageModal({
  open,
  onOpenChange,
}: CreditsUsageModalProps) {
  const { usageLogs, loading, getTotalUsageByType, getTotalMinutesUsed } =
    useCreditUsage();
  const { profile } = useProfile();

  const remainingCredits = profile?.Remaning_credits
    ? parseFloat(String(profile.Remaning_credits))
    : 0;

  // Use profile's total_minutes_used (maintained by database triggers) as primary source
  // This is more accurate than calculating from logs since it includes all historical data
  const totalMinutesUsed = profile?.total_minutes_used !== null && profile?.total_minutes_used !== undefined
    ? parseFloat(String(profile.total_minutes_used))
    : getTotalMinutesUsed();
  const totalCallCredits = getTotalUsageByType("call");
  const totalOtherCredits = getTotalUsageByType("other");
  const totalSmsCredits = getTotalUsageByType("sms");
  const totalAiAnalysisCredits = getTotalUsageByType("ai_analysis");
  const totalPhoneRentalCredits = getTotalUsageByType("phone_number_rental");

  const totalCreditsUsed =
    totalCallCredits +
    totalOtherCredits +
    totalSmsCredits +
    totalAiAnalysisCredits +
    totalPhoneRentalCredits;

  // Get recent usage logs (last 20)
  const recentLogs = usageLogs.slice(0, 20);

  const getUsageTypeConfig = (type: CreditUsageLog["usage_type"]) => {
    return (
      usageTypeConfig[type] || {
        label: type,
        icon: Zap,
        color: "bg-slate-50 text-slate-700 border-slate-200",
        iconColor: "text-slate-600",
      }
    );
  };

  const getActionName = (log: CreditUsageLog): string => {
    if (log.usage_type === "call") {
      return "Call";
    }
    if (log.cost_breakdown && typeof log.cost_breakdown === "object") {
      const breakdown = log.cost_breakdown as any;
      return breakdown.action_name || breakdown.action_type || "Other";
    }
    return "Other";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            <Zap className="h-6 w-6 text-amber-600" />
            Credits Usage Breakdown
          </DialogTitle>
          <DialogDescription>
            Detailed breakdown of your credit usage across all services
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <ScrollArea className="max-h-[calc(90vh-180px)] pr-4">
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="border-slate-200">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-slate-500 font-medium">
                          Remaining Credits
                        </p>
                        <h3 className="text-2xl font-bold text-slate-900 mt-1">
                          {remainingCredits.toFixed(0)}
                        </h3>
                      </div>
                      <div className="p-3 bg-amber-50 rounded-xl">
                        <Zap className="h-5 w-5 text-amber-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-slate-200">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-slate-500 font-medium">
                          Total Credits Used
                        </p>
                        <h3 className="text-2xl font-bold text-slate-900 mt-1">
                          {totalCreditsUsed.toFixed(0)}
                        </h3>
                      </div>
                      <div className="p-3 bg-blue-50 rounded-xl">
                        <TrendingUp className="h-5 w-5 text-blue-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-slate-200">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-slate-500 font-medium">
                          Total Minutes Used
                        </p>
                        <h3 className="text-2xl font-bold text-slate-900 mt-1">
                          {totalMinutesUsed.toFixed(0)}
                        </h3>
                      </div>
                      <div className="p-3 bg-emerald-50 rounded-xl">
                        <Clock className="h-5 w-5 text-emerald-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Usage Breakdown by Type */}
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-4">
                  Usage by Category
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Calls */}
                  {totalCallCredits > 0 && (
                    <Card className="border-slate-200">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-50 rounded-lg">
                              <Phone className="h-5 w-5 text-blue-600" />
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900">
                                Calls
                              </p>
                              <p className="text-sm text-slate-500">
                                {totalMinutesUsed.toFixed(0)} minutes
                              </p>
                            </div>
                          </div>
                          <Badge
                            variant="outline"
                            className="bg-blue-50 text-blue-700 border-blue-200"
                          >
                            {totalCallCredits.toFixed(0)} credits
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Other */}
                  {totalOtherCredits > 0 && (
                    <Card className="border-slate-200">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-slate-50 rounded-lg">
                              <Zap className="h-5 w-5 text-slate-600" />
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900">
                                Other
                              </p>
                              <p className="text-sm text-slate-500">
                                Various actions
                              </p>
                            </div>
                          </div>
                          <Badge
                            variant="outline"
                            className="bg-slate-50 text-slate-700 border-slate-200"
                          >
                            {totalOtherCredits.toFixed(0)} credits
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* SMS */}
                  {totalSmsCredits > 0 && (
                    <Card className="border-slate-200">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-purple-50 rounded-lg">
                              <MessageSquare className="h-5 w-5 text-purple-600" />
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900">SMS</p>
                              <p className="text-sm text-slate-500">
                                Text messages
                              </p>
                            </div>
                          </div>
                          <Badge
                            variant="outline"
                            className="bg-purple-50 text-purple-700 border-purple-200"
                          >
                            {totalSmsCredits.toFixed(0)} credits
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* AI Analysis */}
                  {totalAiAnalysisCredits > 0 && (
                    <Card className="border-slate-200">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-emerald-50 rounded-lg">
                              <Brain className="h-5 w-5 text-emerald-600" />
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900">
                                AI Analysis
                              </p>
                              <p className="text-sm text-slate-500">
                                AI processing
                              </p>
                            </div>
                          </div>
                          <Badge
                            variant="outline"
                            className="bg-emerald-50 text-emerald-700 border-emerald-200"
                          >
                            {totalAiAnalysisCredits.toFixed(0)} credits
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Phone Number Rental */}
                  {totalPhoneRentalCredits > 0 && (
                    <Card className="border-slate-200">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-amber-50 rounded-lg">
                              <PhoneCall className="h-5 w-5 text-amber-600" />
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900">
                                Phone Rental
                              </p>
                              <p className="text-sm text-slate-500">
                                Number rental
                              </p>
                            </div>
                          </div>
                          <Badge
                            variant="outline"
                            className="bg-amber-50 text-amber-700 border-amber-200"
                          >
                            {totalPhoneRentalCredits.toFixed(0)} credits
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>

              {/* Recent Usage Logs */}
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-4">
                  Recent Usage History
                </h3>
                {recentLogs.length > 0 ? (
                  <div className="space-y-2">
                    {recentLogs.map((log) => {
                      const config = getUsageTypeConfig(log.usage_type);
                      const Icon = config.icon;
                      const actionName = getActionName(log);

                      return (
                        <Card
                          key={log.id}
                          className="border-slate-200 hover:border-slate-300 transition-colors"
                        >
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3 flex-1">
                                <div
                                  className={`p-2 rounded-lg ${config.color}`}
                                >
                                  <Icon className={`h-4 w-4 ${config.iconColor}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-slate-900">
                                    {actionName}
                                  </p>
                                  <div className="flex items-center gap-2 mt-1">
                                    <p className="text-sm text-slate-500">
                                      {format(
                                        new Date(log.created_at),
                                        "MMM dd, yyyy h:mm a"
                                      )}
                                    </p>
                                    {log.usage_type === "call" &&
                                      log.duration_seconds && (
                                        <span className="text-sm text-slate-400">
                                          •{" "}
                                          {formatDuration(log.duration_seconds)}
                                        </span>
                                      )}
                                  </div>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="font-bold text-slate-900">
                                  -{log.amount_used.toFixed(0)} credits
                                </p>
                                {log.balance_after !== null && (
                                  <p className="text-xs text-slate-500">
                                    Balance: {log.balance_after.toFixed(0)}
                                  </p>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <Card className="border-slate-200">
                    <CardContent className="p-8 text-center">
                      <Zap className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-500 font-medium">
                        No usage history yet
                      </p>
                      <p className="text-sm text-slate-400 mt-1">
                        Your credit usage will appear here as you use the
                        platform
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
