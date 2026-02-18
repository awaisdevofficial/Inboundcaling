import { ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Bot,
  BookOpen,
  Phone,
  CreditCard,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  PhoneCall,
  Mail,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { InvoiceNotificationBanner } from "@/components/InvoiceNotificationBanner";
import { NotificationCenter } from "@/components/NotificationCenter";
import { OnboardingTour } from "@/components/OnboardingTour";

interface DashboardLayoutProps {
  children: ReactNode;
}

interface MenuItem {
  path: string;
  label: string;
  icon: any;
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

const menuSections: MenuSection[] = [
  {
    title: "Overview",
    items: [
      { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    title: "Operations",
    items: [
      { path: "/bots", label: "Agents", icon: Bot },
      { path: "/phone-numbers", label: "Phone Numbers", icon: PhoneCall },
      { path: "/knowledge-bases", label: "Knowledge Bases", icon: BookOpen },
      { path: "/emails", label: "Emails", icon: Mail },
      { path: "/ai-prompt", label: "AI Prompt", icon: Sparkles },
    ],
  },
  {
    title: "Analytics",
    items: [
      { path: "/calls", label: "Call History", icon: Phone },
      { path: "/leads", label: "Leads", icon: UserCheck },
    ],
  },
  {
    title: "Account",
    items: [
      { path: "/billing", label: "Billing", icon: CreditCard },
      { path: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

// Flatten for finding current page title
const allMenuItems = menuSections.flatMap(section => section.items);

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { profile } = useProfile();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  const userName = profile?.full_name || (user?.user_metadata?.full_name as string) || "User";

  const handleLogout = async () => {
    await signOut();
    navigate("/signin");
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      {/* Sidebar */}
      <aside
        className={cn(
          "bg-white flex flex-col transition-all duration-300 ease-in-out z-20 border-r border-slate-200",
          sidebarOpen ? "w-[260px]" : "w-[72px]"
        )}
      >
        {/* Logo Section */}
        <div className="h-16 flex items-center px-6 border-b border-slate-100">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
               <span className="text-white font-bold text-lg">G</span>
            </div>
            {sidebarOpen && (
              <span className="font-bold text-xl text-slate-900 tracking-tight whitespace-nowrap">
                Genie
              </span>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto">
          <div className="p-3 space-y-6">
            {menuSections.map((section, sectionIndex) => (
              <div key={section.title} className={cn("space-y-1", sectionIndex > 0 && "pt-2")}>
                {sidebarOpen && (
                  <div className="px-3 mb-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    {section.title}
                  </div>
                )}
                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 group",
                          isActive
                            ? "bg-blue-50 text-blue-600 shadow-sm"
                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                        )}
                        title={!sidebarOpen ? item.label : undefined}
                      >
                        <Icon className={cn(
                          "w-5 h-5 shrink-0 transition-colors",
                          isActive ? "text-blue-600" : "text-slate-500 group-hover:text-slate-700"
                        )} />
                        {sidebarOpen && (
                          <span className="whitespace-nowrap overflow-hidden text-sm">
                            {item.label}
                          </span>
                        )}
                        {isActive && sidebarOpen && (
                          <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-600" />
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>

        {/* User / Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50">
          <div className={cn("flex items-center gap-3", !sidebarOpen && "justify-center")}>
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-semibold shrink-0 shadow-sm">
              {userName.charAt(0).toUpperCase()}
            </div>
            {sidebarOpen && (
              <div className="flex-1 min-w-0 overflow-hidden">
                <p className="text-sm font-medium text-slate-900 truncate">{userName}</p>
                <button 
                  onClick={handleLogout}
                  className="text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1.5 transition-colors mt-0.5 group"
                >
                  <LogOut className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" /> 
                  <span>Sign out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden bg-slate-50">
        <header className="h-16 bg-white border-b border-slate-200 px-6 lg:px-8 flex items-center justify-between sticky top-0 z-10 shadow-sm">
           <div className="flex items-center gap-3">
             <button 
               onClick={() => setSidebarOpen(!sidebarOpen)}
               className="p-2 -ml-2 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-50 transition-colors"
               aria-label="Toggle sidebar"
             >
               {sidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
             </button>
             {/* Page Title */}
             <h1 className="text-xl font-semibold text-slate-800 hidden sm:block">
                {allMenuItems.find(m => m.path === location.pathname || location.pathname.startsWith(m.path + '/'))?.label || "Dashboard"}
             </h1>
           </div>
           
           <div className="flex items-center gap-3">
             <NotificationCenter />
           </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="p-6 lg:p-8">
            <InvoiceNotificationBanner />
            <div className="max-w-[1600px] mx-auto">
              {children}
            </div>
          </div>
        </div>
      </main>

      {/* Onboarding Tour */}
      <OnboardingTour />
    </div>
  );
}

