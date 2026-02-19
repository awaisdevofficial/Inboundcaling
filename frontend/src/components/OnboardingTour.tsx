import { useState, useEffect, useRef } from "react";
import { X, ChevronRight, ChevronLeft } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { addCredits } from "@/lib/credits";

interface TourStep {
  id: string;
  title: string;
  description: string;
  target: string; // CSS selector or route path
  position?: "top" | "bottom" | "left" | "right" | "center";
  route?: string; // Route to navigate to before showing this step
  waitForElement?: boolean; // Wait for element to appear
}

const tourSteps: TourStep[] = [
  // ========== DASHBOARD SECTION ==========
  {
    id: "dashboard-overview",
    title: "Welcome to Your Dashboard!",
    description: "This is your main command center. Here you'll see an overview of all your activity including total calls, leads generated, active agents, and your current credit balance. The dashboard updates in real-time as your agents make calls.",
    target: "[data-tour='dashboard-header']",
    position: "bottom",
    route: "/dashboard",
  },
  {
    id: "dashboard-metrics",
    title: "Key Performance Metrics",
    description: "These four cards show your most important metrics: Total Calls (all calls made), Total Leads (qualified prospects), Active Agents (currently running), and Credits Balance (remaining call time). Click any card to see more details.",
    target: "[data-tour='dashboard-metrics']",
    position: "top",
    route: "/dashboard",
  },
  {
    id: "dashboard-credits",
    title: "Credits & Usage Tracking",
    description: "Your credit balance shows how many minutes you have available. Credits are consumed at 1 credit per minute of call time. Click this card to view detailed usage breakdown, see which agents use the most credits, and track your spending over time.",
    target: "[data-tour='credits-card']",
    position: "top",
    route: "/dashboard",
  },
  {
    id: "dashboard-create-agent",
    title: "Create Your First Agent",
    description: "Click this button to create your first AI voice agent. You'll configure the agent's name, voice, role (inbound for receiving calls or outbound for making calls), and behavior. Agents can handle conversations naturally using AI.",
    target: "[data-tour='create-agent-button']",
    position: "bottom",
    route: "/dashboard",
  },
  {
    id: "dashboard-activity",
    title: "Recent Activity Feed",
    description: "This section shows your latest calls and leads in real-time. You can see call status, duration, and which agent handled each call. Click 'View Full History' to see all calls with advanced filtering and search options.",
    target: "[data-tour='recent-activity']",
    position: "top",
    route: "/dashboard",
  },
  {
    id: "dashboard-charts",
    title: "Performance Analytics",
    description: "The charts show your performance trends over the last 7 days. The area chart displays calls vs leads, while the pie chart shows call outcomes (completed, failed, in-progress). Use these to track your success rate and optimize your agents.",
    target: "[data-tour='dashboard-charts']",
    position: "top",
    route: "/dashboard",
  },

  // ========== AGENTS SECTION ==========
  {
    id: "agents-overview",
    title: "Manage Your AI Agents",
    description: "This is your agent management center. Here you can view all your AI voice agents, see their status (active/inactive), edit their configurations, test them, and monitor their performance. Each agent can handle different types of conversations.",
    target: "[data-tour='agents-header']",
    position: "bottom",
    route: "/bots",
  },
  {
    id: "agents-stats",
    title: "Agent Statistics",
    description: "These cards show your agent metrics: Total Agents (all agents you've created), Active Agents (currently running and handling calls), and Inactive Agents (paused or stopped). Keep agents active to handle calls automatically.",
    target: "[data-tour='agents-stats']",
    position: "top",
    route: "/bots",
  },
  {
    id: "agents-create",
    title: "Create a New Agent",
    description: "Click this button to create a new agent. You'll configure: Agent Name, Description, Role (Inbound receives calls, Outbound makes calls), Voice Selection, AI Prompt/Instructions, Phone Number Linking, and Advanced Settings like call scheduling and webhooks.",
    target: "[data-tour='create-agent-btn']",
    position: "bottom",
    route: "/bots",
  },
  {
    id: "agent-editor-overview",
    title: "Agent Configuration",
    description: "This is the agent editor where you configure all agent settings. Use the tabs to navigate: Details (name, description, role), Voice (select voice and test), Settings (prompt, knowledge base, scheduling), and Logs (view call history for this agent).",
    target: "[data-tour='agent-editor-header']",
    position: "bottom",
    route: "/bots/create",
  },
  {
    id: "agent-editor-details",
    title: "Agent Basic Details",
    description: "Set your agent's name and description. Choose the Agent Role: Inbound agents answer incoming calls, Outbound agents make calls to prospects. The role determines how the agent behaves and what features are available.",
    target: "[data-tour='agent-details']",
    position: "top",
    route: "/bots/create",
  },
  {
    id: "agent-editor-voice",
    title: "Voice Selection",
    description: "Choose a voice for your agent from our library. You can filter by gender, accent, age, and provider. Click 'Test Voice' to hear how it sounds. The voice you select will be used for all calls made by this agent.",
    target: "[data-tour='agent-voice']",
    position: "top",
    route: "/bots/create",
  },
  {
    id: "agent-editor-prompt",
    title: "AI Prompt & Instructions",
    description: "This is where you define what your agent says and how it behaves. Write a detailed prompt explaining the agent's purpose, conversation flow, and how to handle different scenarios. You can also attach a Knowledge Base for the agent to reference during calls.",
    target: "[data-tour='agent-prompt']",
    position: "top",
    route: "/bots/create",
  },
  {
    id: "agent-editor-phone",
    title: "Link Phone Number",
    description: "Link a phone number to this agent so it can receive or make calls. Select from your imported phone numbers. Each agent can have one phone number, and each number can only be linked to one agent at a time.",
    target: "[data-tour='agent-phone']",
    position: "top",
    route: "/bots/create",
  },

  // ========== PHONE NUMBERS SECTION ==========
  {
    id: "phone-numbers-overview",
    title: "Phone Number Management",
    description: "Import and manage your phone numbers here. Phone numbers are required for agents to make or receive calls. You can import numbers from your existing phone service provider and link them to your agents.",
    target: "[data-tour='phone-numbers-header']",
    position: "bottom",
    route: "/phone-numbers",
  },
  {
    id: "phone-numbers-import",
    title: "Import a Phone Number",
    description: "To import a number: 1) Enter a name (optional) for easy identification, 2) Enter the phone number in E.164 format (e.g., +14157774444), 3) Enter the termination URI from your provider (e.g., someuri.pstn.twilio.com), 4) Click Import. The number will be available to link to agents.",
    target: "[data-tour='import-form']",
    position: "top",
    route: "/phone-numbers",
  },
  {
    id: "phone-numbers-list",
    title: "Manage Imported Numbers",
    description: "View all your imported numbers here. You can see which numbers are linked to agents, unlink them, or delete numbers you no longer need. Click 'Link Agent' to connect a number to an agent, or 'Unlink' to disconnect it.",
    target: "[data-tour='phone-numbers-list']",
    position: "top",
    route: "/phone-numbers",
  },

  // ========== CALLS SECTION ==========
  {
    id: "calls-overview",
    title: "Call History & Analytics",
    description: "View all your call records in one place. See call status, duration, transcripts, recordings, and detailed metadata. Filter by status, date range, or agent. Export data to CSV for analysis. Click any call to see full details including transcript and recording.",
    target: "[data-tour='calls-header']",
    position: "bottom",
    route: "/calls",
  },
  {
    id: "calls-stats",
    title: "Call Statistics Dashboard",
    description: "These cards show your call performance metrics: Total Calls (all time), Completed (successful calls), In Progress (currently active), Failed (unsuccessful), and Pending (scheduled). Use these to track your success rate and identify issues.",
    target: "[data-tour='calls-stats']",
    position: "top",
    route: "/calls",
  },
  {
    id: "calls-filters",
    title: "Filter & Export Calls",
    description: "Use the Filters button to filter calls by status (completed, failed, in-progress, etc.). Click 'Export CSV' to download all call data including transcripts, recordings, and metadata for analysis in Excel or other tools.",
    target: "[data-tour='calls-filters']",
    position: "top",
    route: "/calls",
  },
  {
    id: "calls-table",
    title: "Call Details Table",
    description: "This table shows all your calls with key information: phone number, contact name, status, duration, agent used, timestamps, and quick access to transcripts and recordings. Click any row to see full call details including the complete conversation transcript.",
    target: "[data-tour='calls-table']",
    position: "top",
    route: "/calls",
  },

  // ========== LEADS SECTION ==========
  {
    id: "leads-overview",
    title: "Leads Management",
    description: "View and manage all your qualified leads here. Leads come from two sources: 1) Landing page form submissions, and 2) Calls where the agent identified the prospect as a qualified lead. You can contact leads, add notes, and track their status.",
    target: "[data-tour='leads-header']",
    position: "bottom",
    route: "/leads",
  },
  {
    id: "leads-actions",
    title: "Lead Actions",
    description: "For each lead, you can: Send Email (contact them directly), View Details (see full information), Mark Status (qualified, contacted, converted), and Add Notes. Leads are automatically created when agents identify prospects during calls.",
    target: "[data-tour='leads-actions']",
    position: "top",
    route: "/leads",
  },

  // ========== KNOWLEDGE BASES SECTION ==========
  {
    id: "knowledge-bases-overview",
    title: "Knowledge Bases",
    description: "Knowledge Bases provide information to your agents during calls. Upload documents, add text content, or provide URLs. Agents can reference this information to answer questions accurately. Create separate knowledge bases for different topics or products.",
    target: "[data-tour='knowledge-bases-header']",
    position: "bottom",
    route: "/knowledge-bases",
  },
  {
    id: "knowledge-bases-create",
    title: "Create Knowledge Base",
    description: "Click 'Create Knowledge Base' to add information for your agents. You can: 1) Upload documents (PDF, TXT, DOCX), 2) Add text content directly, 3) Provide URLs for agents to reference. Enable auto-refresh to keep URLs updated automatically.",
    target: "[data-tour='knowledge-bases-create']",
    position: "top",
    route: "/knowledge-bases",
  },

  // ========== BILLING SECTION ==========
  {
    id: "billing-overview",
    title: "Billing & Credits Management",
    description: "Manage your account credits, subscriptions, and billing here. Credits are used for making calls (1 credit = 1 minute). You can purchase one-time credit packages or subscribe to monthly plans that include credits. View invoices and payment history.",
    target: "[data-tour='billing-header']",
    position: "bottom",
    route: "/billing",
  },
  {
    id: "billing-credits",
    title: "Credit Balance & Usage",
    description: "Your current credit balance shows available minutes. Total Minutes Used shows lifetime usage. Total Credits Used shows all credits consumed. Click 'Add Credits' to purchase more, or view the Plans tab to subscribe to monthly packages.",
    target: "[data-tour='credit-balance']",
    position: "top",
    route: "/billing",
  },
  {
    id: "billing-plans",
    title: "Subscription Plans",
    description: "Choose a monthly subscription plan that fits your needs. Plans include monthly credit allocations that reset each month. Starter plans are great for small businesses, while Enterprise plans offer custom pricing for high-volume users. Subscribe to save on credits.",
    target: "[data-tour='billing-plans']",
    position: "top",
    route: "/billing",
  },
  {
    id: "billing-invoices",
    title: "Invoices & Payments",
    description: "View all your invoices here. When you subscribe to a plan, an invoice is generated. Complete the payment and mark it as paid to activate your subscription. Invoices show the package, amount, date, and payment status. Download invoices for your records.",
    target: "[data-tour='billing-invoices']",
    position: "top",
    route: "/billing",
  },
  {
    id: "billing-history",
    title: "Purchase History",
    description: "See all your credit purchases and subscriptions here. Track when you bought credits, which packages you purchased, prices paid, and credits received. This helps you monitor your spending and plan future purchases.",
    target: "[data-tour='billing-history']",
    position: "top",
    route: "/billing",
  },

  // ========== SETTINGS SECTION ==========
  {
    id: "settings-overview",
    title: "Account Settings",
    description: "Manage your account settings here. Configure your profile, timezone, security settings (2FA, password), company information, KYC verification, and more. The General tab includes timezone settings and the option to restart this tour.",
    target: "[data-tour='settings-header']",
    position: "bottom",
    route: "/settings",
  },
];

const TOUR_STORAGE_KEY = "onboarding_tour_step";
const TOUR_ACTIVE_KEY = "onboarding_tour_active";

export function OnboardingTour() {
  const [currentStep, setCurrentStep] = useState(() => {
    // Restore step from localStorage if tour is active
    const savedStep = localStorage.getItem(TOUR_STORAGE_KEY);
    return savedStep ? parseInt(savedStep, 10) : 0;
  });
  const [isVisible, setIsVisible] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, refetch } = useProfile();
  const overlayRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hasInitialized = useRef(false);

  // Check if user should see the tour (only once)
  useEffect(() => {
    if (hasInitialized.current) return;
    
    if (profile) {
      // Don't show tour if it's already completed - always check database first
      if (profile.tour_completed === true) {
        setIsVisible(false);
        localStorage.removeItem(TOUR_STORAGE_KEY);
        localStorage.removeItem(TOUR_ACTIVE_KEY);
        hasInitialized.current = true;
        return;
      }
      
      // Only show tour if it's not completed and either explicitly not completed or tour is active in localStorage
      const tourActive = localStorage.getItem(TOUR_ACTIVE_KEY) === "true";
      if (profile.tour_completed === false || (tourActive && profile.tour_completed !== true)) {
        setIsVisible(true);
        localStorage.setItem(TOUR_ACTIVE_KEY, "true");
        hasInitialized.current = true;
      }
    }
  }, [profile]);

  // Save step to localStorage whenever it changes
  useEffect(() => {
    if (isVisible) {
      localStorage.setItem(TOUR_STORAGE_KEY, currentStep.toString());
    }
  }, [currentStep, isVisible]);

  // Handle step navigation and element highlighting
  useEffect(() => {
    if (!isVisible || currentStep >= tourSteps.length) return;

    const step = tourSteps[currentStep];
    
    // Navigate to the route if needed
    if (step.route && location.pathname !== step.route) {
      setIsNavigating(true);
      navigate(step.route, { replace: false });
      // Wait for navigation to complete
      const timeout = setTimeout(() => {
        setIsNavigating(false);
        // Wait a bit more for elements to render
        setTimeout(() => {
          highlightElement(step);
        }, 400);
      }, 600);
      return () => clearTimeout(timeout);
    } else if (location.pathname === step.route) {
      // We're on the correct page, just highlight
      const timeout = setTimeout(() => {
        highlightElement(step);
      }, 300);
      return () => clearTimeout(timeout);
    }
  }, [currentStep, isVisible, location.pathname, navigate]);

  const highlightElement = (step: TourStep) => {
    // Remove previous highlights
    document.querySelectorAll("[data-tour-highlight]").forEach((el) => {
      el.removeAttribute("data-tour-highlight");
      (el as HTMLElement).style.zIndex = "";
    });

    // Find and highlight the target element
    if (step.target.startsWith("[data-tour=")) {
      const selector = step.target;
      
      const tryHighlight = (attempt = 0) => {
        const element = document.querySelector(selector) as HTMLElement;
        
        if (element) {
          element.setAttribute("data-tour-highlight", "true");
          element.style.zIndex = "1000";
          element.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
          
          // Position tooltip
          setTimeout(() => {
            positionTooltip(element, step.position || "bottom");
          }, 200);
        } else if (attempt < 10) {
          // Retry up to 10 times (2 seconds total)
          setTimeout(() => tryHighlight(attempt + 1), 200);
        }
      };
      
      tryHighlight();
    }
  };

  const positionTooltip = (element: HTMLElement, position: string) => {
    if (!tooltipRef.current) return;

    const rect = element.getBoundingClientRect();
    const tooltip = tooltipRef.current;
    const tooltipRect = tooltip.getBoundingClientRect();
    const padding = 16;
    const gap = 12;

    let top = 0;
    let left = 0;

    switch (position) {
      case "top":
        top = rect.top - tooltipRect.height - gap;
        left = rect.left + rect.width / 2 - tooltipRect.width / 2;
        // If tooltip would go above viewport, show below instead
        if (top < padding) {
          top = rect.bottom + gap;
        }
        break;
      case "bottom":
        top = rect.bottom + gap;
        left = rect.left + rect.width / 2 - tooltipRect.width / 2;
        // If tooltip would go below viewport, show above instead
        if (top + tooltipRect.height > window.innerHeight - padding) {
          top = rect.top - tooltipRect.height - gap;
        }
        break;
      case "left":
        top = rect.top + rect.height / 2 - tooltipRect.height / 2;
        left = rect.left - tooltipRect.width - gap;
        // If tooltip would go left of viewport, show right instead
        if (left < padding) {
          left = rect.right + gap;
        }
        break;
      case "right":
        top = rect.top + rect.height / 2 - tooltipRect.height / 2;
        left = rect.right + gap;
        // If tooltip would go right of viewport, show left instead
        if (left + tooltipRect.width > window.innerWidth - padding) {
          left = rect.left - tooltipRect.width - gap;
        }
        break;
      case "center":
        top = window.innerHeight / 2 - tooltipRect.height / 2;
        left = window.innerWidth / 2 - tooltipRect.width / 2;
        break;
    }

    // Keep tooltip within viewport with padding
    top = Math.max(padding, Math.min(top, window.innerHeight - tooltipRect.height - padding));
    left = Math.max(padding, Math.min(left, window.innerWidth - tooltipRect.width - padding));

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
    tooltip.style.opacity = "1";
  };

  const handleNext = () => {
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = async () => {
    cleanup();
    // Skip tour without giving credits - user needs to complete it to get credits
    if (!profile) return;
    
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ tour_completed: true } as any)
        .eq("user_id", profile.user_id);

      if (error) throw error;
      await refetch();
    } catch (error) {
      console.error("Error marking tour as skipped:", error);
    }
    
    setIsVisible(false);
    localStorage.removeItem(TOUR_STORAGE_KEY);
    localStorage.removeItem(TOUR_ACTIVE_KEY);
    toast({
      title: "Tour Skipped",
      description: "Complete the tour to receive 100 free trial credits! You can restart it from Settings.",
    });
  };

  const handleComplete = async () => {
    cleanup();
    const creditsGranted = await markTourCompleted();
    setIsVisible(false);
    localStorage.removeItem(TOUR_STORAGE_KEY);
    localStorage.removeItem(TOUR_ACTIVE_KEY);
    
    if (creditsGranted) {
      toast({
        title: "Tour Completed!",
        description: "You've received 100 free trial credits! The tour is now disabled.",
      });
    } else {
      toast({
        title: "Tour Completed!",
        description: "Tour completed successfully. You've already received your free credits previously.",
      });
    }
  };

  const markTourCompleted = async (): Promise<boolean> => {
    if (!profile) return false;

    try {
      // Check if tour credits were already granted by looking for tour completion reward in credit logs
      const { data: creditLogs, error: checkError } = await supabase
        .from("credit_usage_logs")
        .select("id, cost_breakdown")
        .eq("user_id", profile.user_id)
        .eq("usage_type", "other");

      if (checkError) {
        console.error("Error checking for existing tour credits:", checkError);
      }

      // Check if any log contains tour completion reward
      const creditsAlreadyGranted = creditLogs?.some((log) => {
        const breakdown = log.cost_breakdown as any;
        return breakdown?.description === "Free trial credits - Tour completion reward" ||
               (breakdown?.purchase?.description === "Free trial credits - Tour completion reward");
      }) || false;

      // Mark tour as completed
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ tour_completed: true } as any)
        .eq("user_id", profile.user_id);

      if (updateError) throw updateError;

      // Only deposit credits if they haven't been granted before
      if (!creditsAlreadyGranted) {
        try {
          await addCredits(
            profile.user_id,
            100,
            "Free trial credits - Tour completion reward",
            `tour_completion_${profile.user_id}_${Date.now()}`
          );
          await refetch();
          return true; // Credits were granted
        } catch (creditError) {
          console.error("Error adding credits after tour completion:", creditError);
          // Don't fail the tour completion if credit addition fails
          toast({
            title: "Tour Completed",
            description: "Tour marked as complete, but there was an issue adding credits. Please contact support.",
            variant: "destructive",
          });
          await refetch();
          return false;
        }
      }

      await refetch();
      return false; // Credits were already granted
    } catch (error) {
      console.error("Error marking tour as completed:", error);
      toast({
        title: "Error",
        description: "Failed to complete tour. Please try again.",
        variant: "destructive",
      });
      return false;
    }
  };

  const cleanup = () => {
    document.querySelectorAll("[data-tour-highlight]").forEach((el) => {
      el.removeAttribute("data-tour-highlight");
      (el as HTMLElement).style.zIndex = "";
    });
  };

  if (!isVisible || currentStep >= tourSteps.length) {
    return null;
  }

  const step = tourSteps[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === tourSteps.length - 1;

  return (
    <>
      {/* Overlay */}
      <div
        ref={overlayRef}
        className="fixed inset-0 bg-black/40 z-[9998] transition-opacity"
      />

      {/* Tooltip - Cleaner, simpler design */}
      <div
        ref={tooltipRef}
        className="fixed z-[9999] w-[360px] bg-white rounded-lg shadow-xl border border-slate-200"
        style={{ pointerEvents: "auto", opacity: 0, transition: "opacity 0.2s ease" }}
      >
        <div className="p-4">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1">
              <h3 className="font-semibold text-base text-slate-900 mb-1">{step.title}</h3>
              <p className="text-xs text-slate-500">
                {currentStep + 1} / {tourSteps.length}
              </p>
            </div>
            <button
              onClick={handleSkip}
              className="text-slate-400 hover:text-slate-600 transition-colors p-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Description */}
          <p className="text-sm text-slate-600 mb-4 leading-relaxed">
            {step.description}
          </p>

          {/* Navigation */}
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={handleSkip}
              className="text-sm text-slate-500 hover:text-slate-700 px-3 py-1.5 transition-colors"
            >
              Skip
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrevious}
                disabled={isFirstStep || isNavigating}
                className="p-1.5 rounded-md border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4 text-slate-600" />
              </button>
              <button
                onClick={handleNext}
                disabled={isNavigating}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
              >
                {isLastStep ? "Done" : "Next"}
                {!isLastStep && <ChevronRight className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Highlight styles */}
      <style>{`
        [data-tour-highlight] {
          position: relative;
          outline: 2px solid #3b82f6 !important;
          outline-offset: 2px;
          border-radius: 6px;
          background-color: rgba(59, 130, 246, 0.05) !important;
          transition: all 0.2s ease;
        }
      `}</style>
    </>
  );
}
