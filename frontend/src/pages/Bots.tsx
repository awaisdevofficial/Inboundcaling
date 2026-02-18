import { useState } from "react";
import { Plus, Bot, Edit2, Trash2, Mic, PhoneIncoming, PhoneOutgoing, Calendar, MessageSquare, Phone } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { FeatureGate } from "@/components/FeatureGate";
import { useBots } from "@/hooks/useBots";
import type { Bot as BotType } from "@/types/database";
import { useNavigate } from "react-router-dom";
import { TestAgentModal } from "@/components/bots/TestAgentModal";

export default function Bots() {
  const { bots, deleteBot } = useBots();
  const navigate = useNavigate();
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [selectedBot, setSelectedBot] = useState<BotType | null>(null);
  
  const safeBots = Array.isArray(bots) ? bots : [];

  const handleEdit = (bot: BotType) => {
    navigate(`/bots/${bot.id}`);
  };

  const handleCreate = () => {
    navigate("/bots/create");
  };

  const handleDelete = async (bot: BotType) => {
    if (window.confirm(`Are you sure you want to delete "${bot.name}"?`)) {
      await deleteBot(bot.id);
    }
  };

  const handleViewDetails = (bot: BotType) => {
    // Navigate to editor directly for now, which has logs/details
    navigate(`/bots/${bot.id}`);
  };

  const handleTestAgent = (e: React.MouseEvent, bot: BotType) => {
    e.stopPropagation();
    setSelectedBot(bot);
    setTestModalOpen(true);
  };

  return (
    <ProtectedRoute>
      <DashboardLayout>
        <FeatureGate featureName="agents">
          <div className="space-y-8 pb-8">
            {/* Header Section */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4" data-tour="agents-header">
              <div className="space-y-1">
                <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Agents</h1>
                <p className="text-slate-500 text-base">Manage your AI voice agents and automate customer interactions</p>
              </div>
              <Button 
                onClick={handleCreate}
                className="bg-blue-600 hover:bg-blue-700 text-white gap-2 shadow-sm transition-all hover:shadow-md"
                data-tour="create-agent-btn"
              >
                <Plus className="h-4 w-4" /> Create Agent
              </Button>
            </div>

            {/* Stats Section */}
            {safeBots.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-tour="agents-stats">
                <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-500">Total Agents</p>
                      <h3 className="text-2xl font-bold text-slate-900 mt-1">{safeBots.length}</h3>
                    </div>
                    <div className="p-3 bg-blue-50 rounded-xl">
                      <Bot className="h-5 w-5 text-blue-600" />
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-500">Active Agents</p>
                      <h3 className="text-2xl font-bold text-slate-900 mt-1">{safeBots.filter(b => b.is_active).length}</h3>
                    </div>
                    <div className="p-3 bg-emerald-50 rounded-xl">
                      <Bot className="h-5 w-5 text-emerald-600" />
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-500">Inactive Agents</p>
                      <h3 className="text-2xl font-bold text-slate-900 mt-1">{safeBots.filter(b => !b.is_active).length}</h3>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl">
                      <Bot className="h-5 w-5 text-slate-400" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Agents List */}
            <div>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Your Agents</h2>
                  <p className="text-sm text-slate-500 mt-1">Click on an agent to view details or create a new one</p>
                </div>
                <Button 
                  onClick={handleCreate}
                  className="bg-blue-600 hover:bg-blue-700 text-white gap-2 shadow-sm"
                  size="sm"
                >
                  <Plus className="h-4 w-4" /> Create Agent
                </Button>
              </div>
              
              <div className="space-y-3">
                {safeBots.map((bot) => {
                  // Extract bot details
                  const voiceId = bot.voice_id || bot.bot_config?.voice_id;
                  const voiceName = voiceId?.replace("11labs-", "").replace("openai-", "") || "Default";
                  const beginMessage = bot.begin_message || bot.bot_config?.begin_message;
                  const displayMessage = Array.isArray(beginMessage)
                    ? beginMessage[0] || ""
                    : beginMessage || "";
                  
                  return (
                    <div
                      key={bot.id}
                      onClick={() => handleViewDetails(bot)}
                      className="bg-white rounded-lg border border-slate-200 p-5 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer group"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4 flex-1 min-w-0">
                          <div className={`w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 ${
                            bot.is_active 
                              ? 'bg-blue-50 text-blue-600' 
                              : 'bg-slate-50 text-slate-400'
                          }`}>
                            <Bot className="h-7 w-7" />
                          </div>
                          <div className="flex-1 min-w-0 space-y-3">
                            {/* Header Row */}
                            <div>
                              <div className="flex items-center gap-2 mb-1.5">
                                <h3 className="font-semibold text-slate-900 text-lg group-hover:text-blue-600 transition-colors">
                                  {bot.name}
                                </h3>
                                <span className={`w-2 h-2 rounded-full ${
                                  bot.is_active ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'
                                }`} />
                                <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${
                                  bot.is_active 
                                    ? 'bg-emerald-50 text-emerald-700' 
                                    : 'bg-slate-100 text-slate-600'
                                }`}>
                                  {bot.is_active ? 'Active' : 'Inactive'}
                                </span>
                              </div>
                              {bot.description && (
                                <p className="text-sm text-slate-600 line-clamp-2 mt-1">
                                  {bot.description}
                                </p>
                              )}
                            </div>

                            {/* Details Row */}
                            <div className="flex flex-wrap items-center gap-3">
                              {bot.Agent_role && (
                                <div className="flex items-center gap-1.5 text-xs">
                                  {bot.Agent_role === "Inbound" ? (
                                    <PhoneIncoming className="h-3.5 w-3.5 text-blue-600" />
                                  ) : (
                                    <PhoneOutgoing className="h-3.5 w-3.5 text-green-600" />
                                  )}
                                  <span className="px-2 py-1 rounded-md bg-slate-100 text-slate-700 font-medium">
                                    {bot.Agent_role}
                                  </span>
                                </div>
                              )}
                              {voiceName && (
                                <div className="flex items-center gap-1.5 text-xs">
                                  <Mic className="h-3.5 w-3.5 text-purple-600" />
                                  <span className="px-2 py-1 rounded-md bg-purple-50 text-purple-700 font-medium">
                                    {voiceName}
                                  </span>
                                </div>
                              )}
                              {bot.model && (
                                <span className="px-2 py-1 rounded-md bg-slate-50 text-slate-600 text-xs font-medium border border-slate-200">
                                  {bot.model}
                                </span>
                              )}
                              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                <Calendar className="h-3.5 w-3.5" />
                                <span>
                                  {formatDistanceToNow(new Date(bot.created_at), { addSuffix: true })}
                                </span>
                              </div>
                            </div>

                            {/* Begin Message Preview */}
                            {displayMessage && (
                              <div className="flex items-start gap-2 p-2.5 rounded-md bg-slate-50 border border-slate-200">
                                <MessageSquare className="h-3.5 w-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                                <p className="text-xs text-slate-600 italic line-clamp-2 leading-relaxed">
                                  "{displayMessage}"
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 pt-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => handleTestAgent(e, bot)}
                            className="h-9 w-9 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-green-50 hover:text-green-600"
                            title="Test Agent"
                          >
                            <Phone className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEdit(bot);
                            }}
                            className="h-9 w-9 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-blue-50 hover:text-blue-600"
                            title="Edit Agent"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(bot);
                            }}
                            className="h-9 w-9 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Delete Agent"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                
                {/* Create New Row */}
                <button 
                  onClick={handleCreate}
                  className="w-full bg-white rounded-lg border-2 border-dashed border-slate-200 hover:border-blue-300 hover:bg-blue-50/30 transition-all group p-4"
                >
                  <div className="flex items-center justify-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                      <Plus className="h-5 w-5 text-slate-400 group-hover:text-blue-600" />
                    </div>
                    <span className="font-medium text-slate-900 group-hover:text-blue-600">Create New Agent</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </FeatureGate>
      </DashboardLayout>
      {selectedBot && (
        <TestAgentModal
          open={testModalOpen}
          onOpenChange={setTestModalOpen}
          bot={selectedBot}
        />
      )}
    </ProtectedRoute>
  );
}
