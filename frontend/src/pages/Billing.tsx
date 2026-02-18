import { useState } from "react";
import { CreditCard, TrendingUp, DollarSign, Clock, Check, Zap, Loader2, FileText, Receipt, Package, BarChart3, Sparkles } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useProfile } from "@/hooks/useProfile";
import { useWallet } from "@/hooks/useWallet";
import { useCreditUsage } from "@/hooks/useCreditUsage";
import { useCreditManagement } from "@/hooks/useCreditManagement";
import { useSubscription } from "@/hooks/useSubscription";
import { CreditBalanceCard } from "@/components/CreditBalanceCard";
import { formatCurrency, formatDuration } from "@/lib/credits";
import { formatInUserTimezone } from "@/lib/utils";
import { CREDIT_COSTS, MONTHLY_PLANS, SubscriptionPlan } from "@/lib/creditCosts";
import { 
  isOnFreeTrial, 
  isTrialExpired, 
  getTrialDaysRemaining, 
  formatTrialExpiration,
  TRIAL_CREDITS_AMOUNT 
} from "@/lib/trialCredits";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  price: number;
  currency: string;
}

export default function Billing() {
  const { profile, loading: profileLoading } = useProfile();
  const { balance, addCredits, loading: walletLoading } = useWallet();
  const { getTotalMinutesUsed, getTotalCallCredits } = useCreditUsage();
  const { handlePurchase: recordPurchase, purchases } = useCreditManagement();
  const { invoices, markInvoicePaid, isPaid, createInvoice, packages: subscriptionPackages } = useSubscription();

  // State
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [showSubscribeModal, setShowSubscribeModal] = useState(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<CreditPackage | null>(null);
  const [subscribing, setSubscribing] = useState(false);

  // Credit packages for one-time purchases
  const packages: CreditPackage[] = [
    { id: "quick-0", name: "100 Credits", credits: 100, price: 10, currency: "USD" },
    { id: "quick-1", name: "500 Credits", credits: 500, price: 45, currency: "USD" },
    { id: "quick-2", name: "1000 Credits", credits: 1000, price: 85, currency: "USD" },
  ];

  // Use profile fields (maintained by database trigger) as primary source
  const totalMinutesUsed = profile?.total_minutes_used 
    ? parseFloat(String(profile.total_minutes_used)) 
    : getTotalMinutesUsed();
  const totalSpent = profile?.Total_credit 
    ? parseFloat(String(profile.Total_credit)) 
    : getTotalCallCredits();
  const remainingCredits = profile?.Remaning_credits 
    ? parseFloat(String(profile.Remaning_credits)) 
    : 0;

  const handlePurchase = async (packageId: string) => {
    if (!selectedPackage) return;
    
    const purchase = await recordPurchase(
      selectedPackage.id,
      selectedPackage.name,
      selectedPackage.credits,
      selectedPackage.price,
      "manual",
      `package_${packageId}_${Date.now()}`
    );

    if (purchase) {
      setShowPurchaseModal(false);
      setSelectedPackage(null);
    }
  };

  // Handle subscribing to a monthly plan — creates an invoice
  const handleSubscribe = async () => {
    if (!selectedPlan) return;
    setSubscribing(true);

    try {
      // Try to find a matching subscription package from the DB
      const matchingPkg = subscriptionPackages.find(
        (pkg) => pkg.name === selectedPlan.id || pkg.display_name === selectedPlan.name
      );

      if (matchingPkg) {
        // Use the DB-based invoice creation via RPC
        const invoiceId = await createInvoice(matchingPkg.id);
        if (invoiceId) {
          setShowSubscribeModal(false);
          setSelectedPlan(null);
        }
      } else {
        // Fallback: record as a credit purchase using the local plan data
        const purchase = await recordPurchase(
          selectedPlan.id,
          `${selectedPlan.name} Plan`,
          selectedPlan.credits,
          selectedPlan.price,
          "subscription",
          `sub_${selectedPlan.id}_${Date.now()}`
        );
        if (purchase) {
          setShowSubscribeModal(false);
          setSelectedPlan(null);
        }
      }
    } catch (error: any) {
      // Error is handled inside createInvoice/recordPurchase
    } finally {
      setSubscribing(false);
    }
  };

  if (profileLoading || walletLoading) {
    return (
      <ProtectedRoute>
        <DashboardLayout>
          <div className="flex items-center justify-center h-[400px]">
            <div className="border-[3px] border-muted border-t-primary rounded-full w-6 h-6 animate-spin" />
          </div>
        </DashboardLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <DashboardLayout>
        <div className="space-y-8 pb-8">
          {/* Page Header */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4" data-tour="billing-header">
            <div className="space-y-1">
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Billing & Credits</h1>
              <p className="text-slate-500 text-base">Manage your account credits, subscriptions, and billing history</p>
            </div>
          </div>

          {/* Free Trial Alert */}
          {isOnFreeTrial(profile?.trial_credits_expires_at, profile?.payment_status) && (
            <Alert className={isTrialExpired(profile?.trial_credits_expires_at) 
              ? "border-red-200 bg-red-50 dark:bg-red-950/20" 
              : "border-blue-200 bg-blue-50 dark:bg-blue-950/20"
            }>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle className="font-semibold">
                {isTrialExpired(profile?.trial_credits_expires_at) 
                  ? "Free Trial Expired" 
                  : "Free Trial Active"}
              </AlertTitle>
              <AlertDescription className="mt-2">
                {isTrialExpired(profile?.trial_credits_expires_at) ? (
                  <div className="space-y-3">
                    <p>Your free trial credits have expired. Upgrade to a paid plan to continue using the service.</p>
                    <Button 
                      onClick={() => {
                        const starterPlan = MONTHLY_PLANS.find(p => p.id === "starter");
                        if (starterPlan) {
                          setSelectedPlan(starterPlan);
                          setShowSubscribeModal(true);
                        }
                      }}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      Upgrade Now
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p>
                      You're on a free trial with <span className="font-semibold text-blue-700">{TRIAL_CREDITS_AMOUNT} credits</span>. 
                      {getTrialDaysRemaining(profile?.trial_credits_expires_at) !== null && (
                        <span className="font-semibold text-blue-700">
                          {" "}{getTrialDaysRemaining(profile?.trial_credits_expires_at)} day{getTrialDaysRemaining(profile?.trial_credits_expires_at) !== 1 ? 's' : ''} remaining.
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-slate-600">
                      Trial expires: {formatTrialExpiration(profile?.trial_credits_expires_at)}
                    </p>
                    <Button 
                      onClick={() => {
                        const starterPlan = MONTHLY_PLANS.find(p => p.id === "starter");
                        if (starterPlan) {
                          setSelectedPlan(starterPlan);
                          setShowSubscribeModal(true);
                        }
                      }}
                      variant="outline"
                      className="border-blue-200 text-blue-700 hover:bg-blue-100"
                    >
                      Upgrade to Keep Your Credits
                    </Button>
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Stats Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-slate-200 shadow-sm hover:shadow-md transition-all bg-white" data-tour="credit-balance">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">Current Balance</p>
                    <h3 className="text-2xl font-bold text-slate-900 mt-1">{remainingCredits.toFixed(2)}</h3>
                    <p className="text-xs text-slate-500 mt-1">{remainingCredits.toFixed(2)} minutes available</p>
                  </div>
                  <div className="p-3 bg-blue-50 rounded-xl">
                    <DollarSign className="h-5 w-5 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm hover:shadow-md transition-all bg-white">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">Total Minutes Used</p>
                    <h3 className="text-2xl font-bold text-slate-900 mt-1">{totalMinutesUsed.toFixed(2)}</h3>
                    <p className="text-xs text-slate-500 mt-1">All time usage</p>
                  </div>
                  <div className="p-3 bg-emerald-50 rounded-xl">
                    <Clock className="h-5 w-5 text-emerald-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm hover:shadow-md transition-all bg-white">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">Total Credits Used</p>
                    <h3 className="text-2xl font-bold text-slate-900 mt-1">{totalSpent.toFixed(2)}</h3>
                    <p className="text-xs text-slate-500 mt-1">{totalSpent.toFixed(2)} minutes</p>
                  </div>
                  <div className="p-3 bg-purple-50 rounded-xl">
                    <TrendingUp className="h-5 w-5 text-purple-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content Tabs */}
          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList className="grid w-full grid-cols-4 bg-slate-100 p-1 h-auto">
              <TabsTrigger value="overview" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <BarChart3 className="h-4 w-4 mr-2" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="plans" className="data-[state=active]:bg-white data-[state=active]:shadow-sm" data-tour="billing-plans">
                <Package className="h-4 w-4 mr-2" />
                Plans
              </TabsTrigger>
              <TabsTrigger value="invoices" className="data-[state=active]:bg-white data-[state=active]:shadow-sm" data-tour="billing-invoices">
                <Receipt className="h-4 w-4 mr-2" />
                Invoices
              </TabsTrigger>
              <TabsTrigger value="history" className="data-[state=active]:bg-white data-[state=active]:shadow-sm" data-tour="billing-history">
                <FileText className="h-4 w-4 mr-2" />
                History
              </TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6">
              {/* Credit Balance Card */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <CreditBalanceCard 
                    onAddCredits={() => setShowPurchaseModal(true)} 
                  />
                </div>

                {/* Quick Add Credits */}
                <Card className="lg:col-span-1 border-slate-200 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-semibold flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-blue-600" />
                      Quick Add Credits
                    </CardTitle>
                    <CardDescription className="text-sm">One-time purchase</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {[
                      { credits: 100, price: 10 },
                      { credits: 500, price: 45 },
                      { credits: 1000, price: 85 },
                    ].map((pkg, idx) => (
                      <Button
                        key={idx}
                        variant="outline"
                        className="w-full justify-between h-auto py-3 border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                        onClick={() => {
                          setSelectedPackage({
                            id: `quick-${idx}`,
                            name: `${pkg.credits} Credits`,
                            credits: pkg.credits,
                            price: pkg.price,
                            currency: "USD",
                          });
                          setShowPurchaseModal(true);
                        }}
                      >
                        <div className="flex flex-col items-start">
                          <span className="font-semibold text-slate-900">{formatCurrency(pkg.price)}</span>
                          <span className="text-xs text-slate-500">{pkg.credits} credits</span>
                        </div>
                        <span className="text-sm text-blue-600 font-medium">Add</span>
                      </Button>
                    ))}
                  </CardContent>
                </Card>
              </div>

              {/* Credit Costs */}
              <Card className="border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-blue-600" />
                    Credit Costs
                  </CardTitle>
                  <CardDescription>
                    See how credits are charged for each action in the system
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-lg border border-slate-200 overflow-hidden">
                    <Table>
                      <TableHeader className="bg-slate-50">
                        <TableRow>
                          <TableHead className="font-semibold text-slate-700">Action</TableHead>
                          <TableHead className="font-semibold text-slate-700">Description</TableHead>
                          <TableHead className="font-semibold text-right text-slate-700">Credit Cost</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {CREDIT_COSTS.map((cost, index) => (
                          <TableRow key={index} className="hover:bg-slate-50">
                            <TableCell className="font-medium text-slate-900">{cost.action}</TableCell>
                            <TableCell className="text-slate-600">{cost.description}</TableCell>
                            <TableCell className="text-right font-semibold text-slate-900">
                              {cost.creditCost} {cost.creditCost === 1 ? "credit" : "credits"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Plans Tab */}
            <TabsContent value="plans" className="space-y-6">
              <Card className="border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-blue-600" />
                    Monthly Subscription Plans
                  </CardTitle>
                  <CardDescription>
                    Choose a plan that fits your needs. Credits reset monthly.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
                    {MONTHLY_PLANS.map((plan) => (
                      <Card
                        key={plan.id}
                        className="relative overflow-hidden transition-all hover:shadow-lg border-slate-200"
                      >
                        <CardHeader className="pb-3">
                          <CardTitle className="text-xl font-bold">{plan.name}</CardTitle>
                          <CardDescription className="text-sm">{plan.description}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div>
                            <div className="flex items-baseline gap-2">
                              <span className="text-3xl font-bold text-slate-900">
                                {plan.price === 0 ? "Custom" : formatCurrency(plan.price, plan.currency)}
                              </span>
                              {plan.price > 0 && (
                                <span className="text-slate-500 text-sm">/month</span>
                              )}
                            </div>
                            <p className="text-sm text-slate-500 mt-1">
                              {plan.credits.toLocaleString()} credits/month
                            </p>
                          </div>
                          
                          {plan.features && plan.features.length > 0 && (
                            <ul className="space-y-2">
                              {plan.features.map((feature, idx) => (
                                <li key={idx} className="flex items-start gap-2 text-sm">
                                  <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                                  <span className="text-slate-600">{feature}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                          
                          <Button
                            className="w-full bg-blue-600 hover:bg-blue-700"
                            variant={plan.id === "free-trial" ? "outline" : "default"}
                            onClick={() => {
                              setSelectedPlan(plan);
                              setShowSubscribeModal(true);
                            }}
                            disabled={plan.id === "free-trial"}
                          >
                            {plan.id === "free-trial" ? "Current Plan" : "Subscribe"}
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Invoices Tab */}
            <TabsContent value="invoices" className="space-y-6">
              <Card className="border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Receipt className="h-5 w-5 text-blue-600" />
                    Invoices
                  </CardTitle>
                  <CardDescription>Your subscription invoices and payment status</CardDescription>
                </CardHeader>
                <CardContent>
                  {invoices.length === 0 ? (
                    <div className="text-center py-12">
                      <Receipt className="h-12 w-12 mx-auto text-slate-300 mb-3" />
                      <p className="text-slate-500 font-medium">No invoices yet</p>
                      <p className="text-sm text-slate-400 mt-1">Your invoices will appear here</p>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-slate-200 overflow-hidden">
                      <Table>
                        <TableHeader className="bg-slate-50">
                          <TableRow>
                            <TableHead className="font-semibold text-slate-700">Invoice Number</TableHead>
                            <TableHead className="font-semibold text-slate-700">Package</TableHead>
                            <TableHead className="font-semibold text-slate-700">Amount</TableHead>
                            <TableHead className="font-semibold text-slate-700">Date</TableHead>
                            <TableHead className="font-semibold text-slate-700">Status</TableHead>
                            <TableHead className="font-semibold text-slate-700">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {invoices.map((invoice) => (
                            <TableRow key={invoice.id} className="hover:bg-slate-50">
                              <TableCell className="font-medium text-slate-900">
                                {invoice.invoice_number}
                              </TableCell>
                              <TableCell className="text-slate-600">{invoice.package_name}</TableCell>
                              <TableCell className="font-semibold text-slate-900">
                                {formatCurrency(invoice.amount, invoice.currency)}
                              </TableCell>
                              <TableCell className="text-sm text-slate-600">
                                {formatInUserTimezone(
                                  invoice.created_at,
                                  profile?.timezone || "UTC",
                                  "MMM dd, yyyy HH:mm"
                                )}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    invoice.status === "paid"
                                      ? "default"
                                      : invoice.status === "pending"
                                      ? "secondary"
                                      : "outline"
                                  }
                                  className={
                                    invoice.status === "paid"
                                      ? "bg-green-100 text-green-700 border-green-200"
                                      : invoice.status === "pending"
                                      ? "bg-yellow-100 text-yellow-700 border-yellow-200"
                                      : ""
                                  }
                                >
                                  {invoice.status}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {invoice.status === "pending" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-slate-200 hover:bg-blue-50 hover:border-blue-300"
                                    onClick={async () => {
                                      if (
                                        window.confirm(
                                          "Have you completed the payment? Click OK to mark this invoice as paid."
                                        )
                                      ) {
                                        await markInvoicePaid(invoice.id);
                                      }
                                    }}
                                  >
                                    Mark as Paid
                                  </Button>
                                )}
                                {invoice.status === "paid" && invoice.paid_at && (
                                  <span className="text-xs text-slate-500">
                                    Paid {formatInUserTimezone(invoice.paid_at, profile?.timezone || "UTC", "MMM dd, yyyy")}
                                  </span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Purchase History Tab */}
            <TabsContent value="history" className="space-y-6">
              <Card className="border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-blue-600" />
                    Purchase History
                  </CardTitle>
                  <CardDescription>Your credit package purchase history</CardDescription>
                </CardHeader>
                <CardContent>
                  {purchases.length === 0 ? (
                    <div className="text-center py-12">
                      <FileText className="h-12 w-12 mx-auto text-slate-300 mb-3" />
                      <p className="text-slate-500 font-medium">No purchases yet</p>
                      <p className="text-sm text-slate-400 mt-1">Your purchase history will appear here</p>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-slate-200 overflow-hidden">
                      <Table>
                        <TableHeader className="bg-slate-50">
                          <TableRow>
                            <TableHead className="font-semibold text-slate-700">Date</TableHead>
                            <TableHead className="font-semibold text-slate-700">Package</TableHead>
                            <TableHead className="font-semibold text-slate-700">Price</TableHead>
                            <TableHead className="font-semibold text-slate-700">Credits</TableHead>
                            <TableHead className="font-semibold text-slate-700">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {purchases.map((purchase) => (
                            <TableRow key={purchase.id} className="hover:bg-slate-50">
                              <TableCell className="text-sm text-slate-600">
                                {formatInUserTimezone(
                                  purchase.created_at,
                                  profile?.timezone || "UTC",
                                  "MMM dd, yyyy HH:mm"
                                )}
                              </TableCell>
                              <TableCell className="font-medium text-slate-900">
                                {purchase.package_name}
                              </TableCell>
                              <TableCell className="font-semibold text-slate-900">
                                {formatCurrency(purchase.price)}
                              </TableCell>
                              <TableCell className="text-slate-600">
                                {purchase.credits.toLocaleString()} credits
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200">
                                  {purchase.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

        {/* Subscribe / Plan Confirmation Modal */}
        <Dialog open={showSubscribeModal} onOpenChange={(open) => {
          setShowSubscribeModal(open);
          if (!open) setSelectedPlan(null);
        }}>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl">
                <FileText className="h-5 w-5 text-blue-600" />
                Confirm Subscription
              </DialogTitle>
              <DialogDescription>
                Review your plan details and generate an invoice
              </DialogDescription>
            </DialogHeader>

            {selectedPlan && (
              <div className="space-y-5 pt-2">
                {/* Plan Summary */}
                <div className="p-5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-500">Plan</span>
                    <span className="text-lg font-bold text-slate-900">{selectedPlan.name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-500">Monthly Price</span>
                    <span className="text-2xl font-bold text-slate-900">
                      {selectedPlan.price === 0 ? "Free" : formatCurrency(selectedPlan.price, selectedPlan.currency)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-500">Credits Included</span>
                    <span className="font-semibold text-slate-900">{selectedPlan.credits.toLocaleString()} credits/month</span>
                  </div>
                </div>

                {/* Features */}
                {selectedPlan.features && selectedPlan.features.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-slate-700">What's included:</p>
                    <ul className="space-y-1.5">
                      {selectedPlan.features.map((feature, idx) => (
                        <li key={idx} className="flex items-center gap-2 text-sm text-slate-600">
                          <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Info box */}
                <div className="p-4 bg-blue-50 rounded-lg text-sm border border-blue-200">
                  <p className="font-medium text-blue-900 mb-1">How it works</p>
                  <p className="text-blue-700 text-xs leading-relaxed">
                    An invoice will be generated for this plan. Once you complete the payment and mark the invoice as paid, your credits will be activated and your subscription will begin.
                  </p>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowSubscribeModal(false);
                      setSelectedPlan(null);
                    }}
                    className="flex-1 border-slate-200"
                    disabled={subscribing}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSubscribe}
                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                    disabled={subscribing || selectedPlan.id === "free-trial"}
                  >
                    {subscribing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating Invoice...
                      </>
                    ) : selectedPlan.id === "free-trial" ? (
                      "Already on Free Trial"
                    ) : (
                      <>
                        <FileText className="mr-2 h-4 w-4" />
                        Generate Invoice
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Credit Purchase Modal - For adding more credits */}
        <Dialog open={showPurchaseModal} onOpenChange={setShowPurchaseModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Credits</DialogTitle>
              <DialogDescription>
                {selectedPackage
                  ? `Add ${formatCurrency(selectedPackage.price)} to your account`
                  : "Select an amount to add"}
              </DialogDescription>
            </DialogHeader>
            {selectedPackage && (
              <div className="space-y-4">
                <div className="p-6 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-medium text-slate-600">Amount</span>
                    <span className="text-2xl font-bold text-slate-900">
                      {formatCurrency(selectedPackage.price)}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {selectedPackage.credits} credits = {selectedPackage.credits} minutes of call time
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowPurchaseModal(false);
                      setSelectedPackage(null);
                    }}
                    className="flex-1 border-slate-200"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => handlePurchase(selectedPackage.id)}
                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                  >
                    Add Credits
                  </Button>
                </div>
              </div>
            )}
            {!selectedPackage && (
              <div className="space-y-3">
                {packages.map((pkg) => (
                  <Button
                    key={pkg.id}
                    variant="outline"
                    className="w-full justify-between border-slate-200 hover:bg-blue-50 hover:border-blue-300"
                    onClick={() => setSelectedPackage(pkg)}
                  >
                    <span className="font-semibold">{formatCurrency(pkg.price)}</span>
                    <span className="text-sm text-slate-500">+{pkg.credits} credits</span>
                  </Button>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
