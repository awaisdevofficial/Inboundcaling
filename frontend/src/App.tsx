import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import Auth from "./pages/Auth";
import SignIn from "./pages/SignIn";
import SignUp from "./pages/SignUp";
import ResetPassword from "./pages/ResetPassword";
import VerifyEmail from "./pages/VerifyEmail";
import SetNewPassword from "./pages/SetNewPassword";
import Success from "./pages/Success";
import Dashboard from "./pages/Dashboard";
import Bots from "./pages/Bots";
import BotEditor from "./pages/BotEditor";
import KnowledgeBases from "./pages/KnowledgeBases";
import Calls from "./pages/Calls";
import Leads from "./pages/Leads";
import Billing from "./pages/Billing";
import Settings from "./pages/Settings";
import PhoneNumbers from "./pages/PhoneNumbers";
import Email from "./pages/Email";
import AIPrompt from "./pages/AIPrompt";
import NotFound from "./pages/NotFound";
import { Chatbot } from "@/components/Chatbot";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/signin" replace />} />
            <Route path="/auth" element={<Auth />} />
            {/* Authentication Pages */}
            <Route path="/signin" element={<SignIn />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/set-new-password" element={<SetNewPassword />} />
            <Route path="/success" element={<Success />} />
            {/* Dashboard Routes */}
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/bots" element={<Bots />} />
            <Route path="/bots/create" element={<BotEditor />} />
            <Route path="/bots/:id" element={<BotEditor />} />
            <Route path="/knowledge-bases" element={<KnowledgeBases />} />
            <Route path="/calls" element={<Calls />} />
            <Route path="/leads" element={<Leads />} />
            <Route path="/billing" element={<Billing />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/phone-numbers" element={<PhoneNumbers />} />
            <Route path="/emails" element={<Email />} />
            <Route path="/ai-prompt" element={<AIPrompt />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          {/* Chatbot component - available on all pages */}
          <Chatbot />
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
