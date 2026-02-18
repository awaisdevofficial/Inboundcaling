import {
  Users,
  Phone,
  Clock,
  MoreHorizontal,
  Bot,
  Loader2,
  CheckCircle,
  Eye,
  Edit,
  Trash,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Calendar,
  PhoneCall,
  UserPlus,
  Zap,
  BarChart3,
  TrendingUp,
  AlertCircle
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { FeatureGate } from "@/components/FeatureGate";
import { useCalls } from "@/hooks/useCalls";
import { useBots } from "@/hooks/useBots";
import { useProfile } from "@/hooks/useProfile";
import { usePageLeads } from "@/hooks/usePageLeads";
import { useCreditUsage } from "@/hooks/useCreditUsage";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  PieChart,
  Pie,
  Cell,
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
  Tooltip
} from "recharts";
import { useMemo, useState } from "react";
import { formatDuration } from "@/lib/credits";
import type { Call, PageLead } from "@/types/database";
import { format, subDays, isSameDay, parseISO, startOfDay } from "date-fns";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { CreditsUsageModal } from "@/components/CreditsUsageModal";

export default function Dashboard() {
  const { stats, calls, loading: callsLoading } = useCalls();
  const { bots, loading: botsLoading } = useBots();
  const { leads, loading: leadsLoading } = usePageLeads();
  const { profile, loading: profileLoading } = useProfile();
  const { getTotalMinutesUsed } = useCreditUsage();
  const navigate = useNavigate();
  const [creditsModalOpen, setCreditsModalOpen] = useState(false);
  
  // Use profile's total_minutes_used (maintained by database triggers) as primary source
  // This is more accurate than calculating from logs since it includes all historical data
  const totalMinutesUsed = useMemo(() => {
    if (profile?.total_minutes_used !== null && profile?.total_minutes_used !== undefined) {
      return parseFloat(String(profile.total_minutes_used));
    }
    // Fallback to calculating from usage logs if profile value is not available
    return getTotalMinutesUsed();
  }, [profile?.total_minutes_used, getTotalMinutesUsed]);
  
  const remainingCredits = profile?.Remaning_credits 
    ? parseFloat(String(profile.Remaning_credits)) 
    : 0;

  const safeCalls = Array.isArray(calls) ? calls : [];
  const safeBots = Array.isArray(bots) ? bots : [];
  const safeLeads = Array.isArray(leads) ? leads : [];
  
  const safeStats = stats || {
    totalCalls: 0,
    pendingCalls: 0,
    inProgressCalls: 0,
    completedCalls: 0,
    failedCalls: 0,
    notConnectedCalls: 0,
  };

  const userName = profile?.full_name || (profile as any)?.user_metadata?.full_name || "there";

  // Calculate Qualified Leads (Call Leads)
  const isLead = (call: Call): boolean => {
    if (call.metadata && typeof call.metadata === "object") {
      const leadStatus = (call.metadata as any).Lead_status || (call.metadata as any).lead_status;
      if (leadStatus === "Yes" || leadStatus === "yes" || leadStatus === true) {
        return true;
      }
    }
    if (call.webhook_response && typeof call.webhook_response === "object") {
      const leadStatus = call.webhook_response.Lead_status || call.webhook_response.lead_status;
      if (leadStatus === "Yes" || leadStatus === "yes" || leadStatus === true) {
        return true;
      }
    }
    return false;
  };

  const qualifiedLeadsCount = useMemo(() => {
    return safeCalls.filter(isLead).length;
  }, [safeCalls]);

  const totalLeadsCount = safeLeads.length + qualifiedLeadsCount;

  // Chart Data: Status Distribution
  const statusDistribution = useMemo(() => {
    return [
      { name: "Completed", value: safeStats.completedCalls, fill: "#10b981" }, // emerald-500
      { name: "Failed", value: safeStats.failedCalls, fill: "#ef4444" }, // red-500
      { name: "In Progress", value: safeStats.inProgressCalls, fill: "#3b82f6" }, // blue-500
      { name: "Pending", value: safeStats.pendingCalls, fill: "#f59e0b" }, // amber-500
      { name: "Not Connected", value: safeStats.notConnectedCalls, fill: "#94a3b8" }, // slate-400
    ].filter(item => item.value > 0);
  }, [safeStats]);

  const successRate = useMemo(() => {
    if (safeStats.totalCalls === 0) return 0;
    return Math.round((safeStats.completedCalls / safeStats.totalCalls) * 100);
  }, [safeStats]);

  // Chart Data: Activity Over Time (Last 7 Days)
  const activityData = useMemo(() => {
    const days = 7;
    const data = [];
    const today = startOfDay(new Date());

    for (let i = days - 1; i >= 0; i--) {
      const date = subDays(today, i);
      const dateStr = format(date, "MMM dd");
      
      const callsCount = safeCalls.filter(c => {
        const callDate = c.started_at ? parseISO(c.started_at) : null;
        return callDate && isSameDay(startOfDay(callDate), date);
      }).length;

      const leadsCount = safeLeads.filter(l => {
        const leadDate = l.created_at ? parseISO(l.created_at) : null;
        return leadDate && isSameDay(startOfDay(leadDate), date);
      }).length;

      // Add qualified leads from calls to leads count
      const qualifiedCallsCount = safeCalls.filter(c => {
        const callDate = c.started_at ? parseISO(c.started_at) : null;
        return callDate && isSameDay(startOfDay(callDate), date) && isLead(c);
      }).length;

      data.push({
        date: dateStr,
        calls: callsCount,
        leads: leadsCount + qualifiedCallsCount,
      });
    }
    return data;
  }, [safeCalls, safeLeads]);

  // Recent Activity Feed
  const recentActivity = useMemo(() => {
    const activities = [
      ...safeCalls.map(c => ({
        type: 'call',
        id: c.id,
        date: c.started_at ? new Date(c.started_at) : new Date(),
        title: `Call with ${c.phone_number}`,
        subtitle: c.status === 'completed' ? 'Completed successfully' : c.status,
        status: c.status,
        details: c.duration_seconds ? formatDuration(c.duration_seconds) : null,
        botName: safeBots.find(b => b.id === c.bot_id)?.name || 'Agent'
      })),
      ...safeLeads.map(l => ({
        type: 'lead',
        id: l.id,
        date: l.created_at ? new Date(l.created_at) : new Date(),
        title: `New Lead: ${l.name}`,
        subtitle: l.email,
        status: 'new',
        details: 'Landing Page',
        botName: l.bot_name || 'System'
      }))
    ];

    return activities
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 6);
  }, [safeCalls, safeLeads, safeBots]);

  // Active Agents Stats
  const agentStats = useMemo(() => {
    return safeBots.map(bot => {
      const botCalls = safeCalls.filter(c => c.bot_id === bot.id);
      const completed = botCalls.filter(c => c.status === 'completed').length;
      return {
        ...bot,
        totalCalls: botCalls.length,
        successRate: botCalls.length > 0 ? Math.round((completed / botCalls.length) * 100) : 0,
        lastActive: botCalls.length > 0 ? botCalls[0].started_at : null
      };
    }).sort((a, b) => b.totalCalls - a.totalCalls).slice(0, 4);
  }, [safeBots, safeCalls]);

  if (profileLoading || callsLoading || botsLoading || leadsLoading) {
    return (
      <ProtectedRoute>
        <DashboardLayout>
          <div className="flex items-center justify-center h-[calc(100vh-100px)]">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <p className="text-sm text-slate-500 font-medium">Loading dashboard...</p>
            </div>
          </div>
        </DashboardLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <DashboardLayout>
        <FeatureGate featureName="the dashboard">
          <div className="space-y-8 pb-8">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div className="space-y-1">
                <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
                  Welcome back, {userName}
                </h1>
                <p className="text-slate-500 text-base">Here's what's happening with your agents today.</p>
              </div>
              <div className="flex gap-3">
                <Button onClick={() => navigate('/bots/create')} className="bg-blue-600 hover:bg-blue-700 shadow-sm transition-all hover:shadow">
                  <Bot className="mr-2 h-4 w-4" /> Create Agent
                </Button>
              </div>
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Total Calls Card */}
              <Card className="border-slate-200 shadow-sm hover:shadow-md transition-all duration-200 group">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-500 group-hover:text-blue-600 transition-colors">Total Calls</p>
                      <h3 className="text-2xl font-bold text-slate-900 mt-1">{safeStats.totalCalls.toLocaleString()}</h3>
                    </div>
                    <div className="p-3 bg-blue-50 rounded-xl group-hover:bg-blue-100 transition-colors">
                      <Phone className="h-5 w-5 text-blue-600" />
                    </div>
                  </div>
                  <div className="mt-4 flex items-center text-xs">
                    <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium flex items-center">
                      <ArrowUpRight className="h-3 w-3 mr-1" />
                      {safeStats.completedCalls} completed
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Total Leads Card */}
              <Card className="border-slate-200 shadow-sm hover:shadow-md transition-all duration-200 group">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-500 group-hover:text-purple-600 transition-colors">Total Leads</p>
                      <h3 className="text-2xl font-bold text-slate-900 mt-1">{totalLeadsCount.toLocaleString()}</h3>
                    </div>
                    <div className="p-3 bg-purple-50 rounded-xl group-hover:bg-purple-100 transition-colors">
                      <Users className="h-5 w-5 text-purple-600" />
                    </div>
                  </div>
                  <div className="mt-4 flex items-center text-xs">
                    <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full font-medium flex items-center">
                      <UserPlus className="h-3 w-3 mr-1" />
                      {qualifiedLeadsCount} from calls
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Active Agents Card */}
              <Card className="border-slate-200 shadow-sm hover:shadow-md transition-all duration-200 group">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-500 group-hover:text-emerald-600 transition-colors">Active Agents</p>
                      <h3 className="text-2xl font-bold text-slate-900 mt-1">{safeBots.filter(b => b.is_active).length}</h3>
                    </div>
                    <div className="p-3 bg-emerald-50 rounded-xl group-hover:bg-emerald-100 transition-colors">
                      <Bot className="h-5 w-5 text-emerald-600" />
                    </div>
                  </div>
                  <div className="mt-4 flex items-center text-xs text-slate-500">
                    <span className="font-medium text-slate-900">{safeBots.length}</span>
                    <span className="ml-1">total agents deployed</span>
                  </div>
                </CardContent>
              </Card>

              {/* Credits Usage Card */}
              <Card 
                className="border-slate-200 shadow-sm hover:shadow-md transition-all duration-200 group cursor-pointer"
                onClick={() => setCreditsModalOpen(true)}
              >
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-500 group-hover:text-amber-600 transition-colors">Credits Balance</p>
                      <h3 className="text-2xl font-bold text-slate-900 mt-1">{remainingCredits.toFixed(0)}</h3>
                    </div>
                    <div className="p-3 bg-amber-50 rounded-xl group-hover:bg-amber-100 transition-colors">
                      <Zap className="h-5 w-5 text-amber-600" />
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-slate-500 text-xs">
                      <Clock className="h-3 w-3 inline mr-1" />
                      <span className="font-medium text-slate-900">{totalMinutesUsed.toFixed(0)}</span> minutes used
                    </span>
                    <span className="text-xs text-amber-600 font-medium group-hover:text-amber-700">
                      View details →
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Activity Chart */}
              <Card className="col-span-1 lg:col-span-2 border-slate-200 shadow-sm">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <Activity className="h-5 w-5 text-blue-600" />
                        Performance Trends
                      </CardTitle>
                      <CardDescription>Calls vs Leads over the last 7 days</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="h-[320px] w-full mt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={activityData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorCalls" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1}/>
                            <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#9333ea" stopOpacity={0.1}/>
                            <stop offset="95%" stopColor="#9333ea" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                          dataKey="date" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 12, fill: '#64748b' }} 
                          dy={10}
                        />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 12, fill: '#64748b' }} 
                        />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: '#fff', 
                            borderRadius: '8px', 
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                          }}
                          itemStyle={{ fontSize: '13px', fontWeight: 500 }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="calls" 
                          stroke="#2563eb" 
                          strokeWidth={2}
                          fillOpacity={1} 
                          fill="url(#colorCalls)" 
                          name="Calls"
                          activeDot={{ r: 6, strokeWidth: 0 }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="leads" 
                          stroke="#9333ea" 
                          strokeWidth={2}
                          fillOpacity={1} 
                          fill="url(#colorLeads)" 
                          name="Leads"
                          activeDot={{ r: 6, strokeWidth: 0 }}
                        />
                        <Legend wrapperStyle={{ paddingTop: '20px' }} iconType="circle" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Status Distribution */}
              <Card className="col-span-1 border-slate-200 shadow-sm flex flex-col">
                <CardHeader>
                  <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <PieChart className="h-5 w-5 text-slate-600" />
                    Call Outcomes
                  </CardTitle>
                  <CardDescription>Breakdown of all call statuses</CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-center">
                  <div className="h-[220px] w-full relative">
                    {statusDistribution.length > 0 ? (
                      <>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={statusDistribution}
                              cx="50%"
                              cy="50%"
                              innerRadius={65}
                              outerRadius={85}
                              paddingAngle={4}
                              dataKey="value"
                              cornerRadius={4}
                            >
                              {statusDistribution.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.fill} strokeWidth={0} />
                              ))}
                            </Pie>
                            <Tooltip 
                               contentStyle={{ 
                                backgroundColor: '#fff', 
                                borderRadius: '8px', 
                                border: '1px solid #e2e8f0',
                                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none flex-col z-10">
                          <span className="text-3xl font-bold text-slate-900">{successRate}%</span>
                          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Success Rate</p>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-slate-400 text-sm gap-2">
                        <AlertCircle className="h-8 w-8 opacity-20" />
                        <p className="text-slate-500 font-medium">No call data available yet</p>
                        <p className="text-xs text-slate-400">Start making calls to see statistics</p>
                      </div>
                    )}
                  </div>
                  {statusDistribution.length > 0 && (
                    <div className="mt-6 space-y-3">
                      {statusDistribution.slice(0, 4).map((item, index) => (
                        <div key={index} className="flex items-center justify-between text-sm group cursor-default">
                          <div className="flex items-center gap-2.5">
                            <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: item.fill }} />
                            <span className="text-slate-600 font-medium group-hover:text-slate-900 transition-colors">{item.name}</span>
                          </div>
                          <span className="font-bold text-slate-900 bg-slate-50 px-2 py-0.5 rounded-md min-w-[32px] text-center">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Bottom Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Recent Activity Feed */}
              <Card className="col-span-1 lg:col-span-2 border-slate-200 shadow-sm">
                <CardHeader className="border-b border-slate-100 pb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <Clock className="h-5 w-5 text-blue-600" />
                        Recent Activity
                      </CardTitle>
                      <CardDescription>Latest interactions across your agents</CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => navigate('/calls')} className="text-blue-600 hover:text-blue-700 hover:bg-blue-50">
                      View Full History
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="relative space-y-0">
                    {recentActivity.length > 0 ? (
                      recentActivity.map((activity, index) => (
                        <div key={`${activity.type}-${activity.id}-${index}`} className="flex gap-4 pb-8 last:pb-0 relative group">
                          {/* Vertical Line */}
                          {index !== recentActivity.length - 1 && (
                            <div className="absolute left-[19px] top-10 bottom-0 w-px bg-slate-200 group-hover:bg-slate-300 transition-colors" />
                          )}
                          
                          {/* Icon */}
                          <div className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center shadow-sm border border-white transition-all duration-200 ${
                            activity.type === 'call' 
                              ? 'bg-blue-50 text-blue-600 group-hover:scale-110 group-hover:bg-blue-100' 
                              : 'bg-purple-50 text-purple-600 group-hover:scale-110 group-hover:bg-purple-100'
                          }`}>
                            {activity.type === 'call' ? <PhoneCall className="h-5 w-5" /> : <UserPlus className="h-5 w-5" />}
                          </div>

                          {/* Content */}
                          <div className="flex-1 pt-1">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-1">
                              <p className="text-sm font-semibold text-slate-900 group-hover:text-blue-700 transition-colors">
                                {activity.title}
                              </p>
                              <span className="text-xs text-slate-400 font-medium whitespace-nowrap bg-slate-50 px-2 py-0.5 rounded-full">
                                {format(activity.date, "MMM dd, h:mm a")}
                              </span>
                            </div>
                            
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                                {activity.botName}
                              </span>
                              {activity.status && (
                                <span className={`text-xs font-medium px-2 py-0.5 rounded-md capitalize border ${
                                  activity.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                  activity.status === 'failed' ? 'bg-red-50 text-red-700 border-red-100' :
                                  'bg-slate-50 text-slate-600 border-slate-200'
                                }`}>
                                  {activity.status}
                                </span>
                              )}
                            </div>

                            <p className="text-sm text-slate-500 line-clamp-1">
                              {activity.subtitle}
                              {activity.details && (
                                <span className="ml-1 text-slate-400">• {activity.details}</span>
                              )}
                            </p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                          <Activity className="h-6 w-6 text-slate-300" />
                        </div>
                        <p className="text-slate-900 font-medium">No recent activity</p>
                        <p className="text-sm text-slate-500 mt-1">Calls and leads will appear here as they come in.</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Top Agents */}
              <Card className="col-span-1 border-slate-200 shadow-sm flex flex-col">
                <CardHeader className="border-b border-slate-100 pb-4">
                  <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-emerald-600" />
                    Top Agents
                  </CardTitle>
                  <CardDescription>Highest performing agents by volume</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 flex-1">
                  <div className="space-y-4">
                    {agentStats.length > 0 ? (
                      agentStats.map((agent, index) => (
                        <div key={agent.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:bg-slate-50 hover:border-slate-200 transition-all duration-200 group">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shadow-sm ${
                              index === 0 ? 'bg-yellow-100 text-yellow-700' : 
                              index === 1 ? 'bg-slate-100 text-slate-700' : 
                              'bg-orange-50 text-orange-700'
                            }`}>
                              {agent.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-900 group-hover:text-blue-700 transition-colors line-clamp-1">{agent.name}</p>
                              <p className="text-xs text-slate-500 font-medium">{agent.totalCalls} calls</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <p className="text-sm font-bold text-slate-900">{agent.successRate}%</p>
                              {agent.successRate >= 80 && <CheckCircle className="h-3 w-3 text-emerald-500" />}
                            </div>
                            <p className="text-xs text-slate-500 font-medium">success rate</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-12">
                        <Bot className="h-10 w-10 text-slate-200 mx-auto mb-3" />
                        <p className="text-sm text-slate-500">No agent data available yet</p>
                      </div>
                    )}
                  </div>
                  
                  <div className="mt-auto pt-6">
                    <Button 
                      variant="outline" 
                      className="w-full border-slate-200 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                      onClick={() => navigate('/bots')}
                    >
                      Manage All Agents
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </FeatureGate>
        <CreditsUsageModal
          open={creditsModalOpen}
          onOpenChange={setCreditsModalOpen}
        />
      </DashboardLayout>
    </ProtectedRoute>
  );
}
