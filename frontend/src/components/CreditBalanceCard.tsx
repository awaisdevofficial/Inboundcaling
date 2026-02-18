import { useWallet } from "@/hooks/useWallet";
import { useCreditUsage } from "@/hooks/useCreditUsage";
import { useProfile } from "@/hooks/useProfile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wallet, TrendingDown, Clock, Plus, Sparkles } from "lucide-react";
import {
  formatCurrency,
  getCreditBalanceStatus,
  estimateRemainingMinutes,
  formatDuration,
} from "@/lib/credits";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";

interface CreditBalanceCardProps {
  onAddCredits?: () => void;
}

export function CreditBalanceCard({ onAddCredits }: CreditBalanceCardProps) {
  const { wallet, loading: walletLoading } = useWallet();
  const { profile, loading: profileLoading } = useProfile();
  const { getTotalMinutesUsed, loading: usageLoading } = useCreditUsage();
  const navigate = useNavigate();

  if (walletLoading || usageLoading || profileLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Credit Balance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  // Use profile fields (maintained by database trigger) as primary source
  const remainingCredits = profile?.Remaning_credits 
    ? parseFloat(String(profile.Remaning_credits)) 
    : 0;
  const totalMinutesUsed = profile?.total_minutes_used 
    ? parseFloat(String(profile.total_minutes_used)) 
    : getTotalMinutesUsed();
  const { status, color, message } = getCreditBalanceStatus(remainingCredits);
  const remainingMinutes = estimateRemainingMinutes(remainingCredits);
  const hasNoCredits = remainingCredits <= 0;
  const tourNotCompleted = profile?.tour_completed === false || profile?.tour_completed === null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          Credit Balance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Balance Display */}
        <div className="space-y-2">
          <div className="text-3xl font-bold">{remainingCredits.toFixed(2)} credits</div>
          <p className="text-sm text-slate-500">{remainingCredits.toFixed(2)} minutes available</p>
          <p className={`text-sm ${color}`}>{message}</p>
        </div>

        {/* Tour Completion Message */}
        {hasNoCredits && tourNotCompleted && (
          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-sm">
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-blue-900 dark:text-blue-100 mb-1">
                  Complete the onboarding tour to get 100 free credits!
                </p>
                <p className="text-blue-700 dark:text-blue-300 mb-3">
                  Take a quick tour of the platform and receive your free trial credits.
                </p>
                <Button
                  onClick={() => {
                    // Reset tour to show it again
                    localStorage.setItem("onboarding_tour_active", "true");
                    localStorage.setItem("onboarding_tour_step", "0");
                    window.location.reload();
                  }}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Start Tour
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 pt-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              Remaining
            </div>
            <div className="text-lg font-semibold">
              {Math.floor(remainingMinutes)} min
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TrendingDown className="h-4 w-4" />
              Used
            </div>
            <div className="text-lg font-semibold">
              {formatDuration(Math.floor(totalMinutesUsed * 60))}
            </div>
          </div>
        </div>

        {/* Add Credits Button */}
        {onAddCredits && (
          <Button
            onClick={onAddCredits}
            className="w-full"
            variant={status === "critical" ? "destructive" : "default"}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Credits
          </Button>
        )}

        {/* Warning for low balance */}
        {status === "critical" && (
          <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-800 dark:text-red-200">
            ⚠️ Your balance is critically low. Please add credits to continue
            receiving calls.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
