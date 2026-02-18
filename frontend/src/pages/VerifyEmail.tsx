import { useState, useRef, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { authApi } from "@/services/api";

export default function VerifyEmail() {
  const navigate = useNavigate();
  const location = useLocation();
  const [otp, setOtp] = useState<string[]>(["", "", "", "", "", ""]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [loading, setLoading] = useState(false);

  // Get email from navigation state (passed from signup page)
  const email = (location.state as any)?.email || "";

  // If no email was passed, redirect back to signup
  useEffect(() => {
    if (!email) {
      toast({
        title: "Error",
        description: "No email found. Please sign up again.",
        variant: "destructive",
      });
      navigate("/signup");
    }
  }, [email, navigate]);

  const handleChange = (index: number, value: string) => {
    // Only allow single digits
    if (value && !/^\d$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    // Handle backspace
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  // Handle paste event to fill all OTP inputs
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pastedData.length > 0) {
      const newOtp = [...otp];
      for (let i = 0; i < 6; i++) {
        newOtp[i] = pastedData[i] || "";
      }
      setOtp(newOtp);
      // Focus the next empty input or the last one
      const nextEmptyIndex = newOtp.findIndex((val) => !val);
      const focusIndex = nextEmptyIndex === -1 ? 5 : nextEmptyIndex;
      inputRefs.current[focusIndex]?.focus();
    }
  };

  const handleSubmit = async () => {
    const otpValue = otp.join("");
    if (otpValue.length !== 6) {
      toast({
        title: "Error",
        description: "Please enter the complete 6-digit code",
        variant: "destructive",
      });
      return;
    }

    if (!email) {
      toast({
        title: "Error",
        description: "No email found. Please sign up again.",
        variant: "destructive",
      });
      navigate("/signup");
      return;
    }

    try {
      setLoading(true);

      // Verify OTP using backend API
      const response = await authApi.verifyEmail({
        email,
        token: otpValue,
      });

      if (!response.success || !response.data) {
        let errorMessage = response.error || "Invalid verification code. Please try again.";
        
        if (errorMessage.includes("rate limit")) {
          errorMessage = "Email rate limit exceeded. Please try again later.";
        } else if (errorMessage.includes("invalid") || errorMessage.includes("expired")) {
          errorMessage = "Invalid or expired verification code. Please request a new one.";
        }

        toast({
          title: "Verification Failed",
          description: errorMessage,
          variant: "destructive",
        });
        return;
      }

      // Set session in Supabase if tokens are provided
      if (response.data.session) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: response.data.session.access_token,
          refresh_token: response.data.session.refresh_token,
        });

        if (sessionError) {
          console.warn("Failed to set Supabase session:", sessionError);
          // Continue anyway - verification was successful
        }
      }

      toast({
        title: "Success",
        description: "Email verified successfully! Welcome aboard!",
      });
      navigate("/dashboard");
    } catch (error: any) {
      toast({
        title: "Verification Failed",
        description: error.message || "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email) {
      toast({
        title: "Error",
        description: "No email found. Please sign up again.",
        variant: "destructive",
      });
      navigate("/signup");
      return;
    }

    try {
      // Call backend API - rate limiting is handled on the backend
      const response = await authApi.resendVerification(email);

      if (!response.success) {
        let errorMessage = response.error || "Failed to resend code. Please try again.";
        
        // Log full error for debugging
        console.error('Resend verification error:', {
          error: response.error,
          message: response.message,
          data: response.data,
          fullResponse: response,
        });
        
        // Handle rate limiting from backend
        if (errorMessage.includes("wait") && response.data?.retryAfter) {
          errorMessage = `Please wait ${response.data.retryAfter} seconds before requesting another code.`;
        } else if (errorMessage.includes("rate limit")) {
          errorMessage = "Too many emails sent. Please wait a few minutes before requesting another code.";
        } else if (errorMessage.includes("already verified") || errorMessage.includes("already confirmed")) {
          errorMessage = "This email is already verified. You can sign in directly.";
          // Redirect to signin after a moment
          setTimeout(() => navigate("/signin"), 2000);
        } else if (errorMessage.includes("not found") || errorMessage.includes("No account")) {
          errorMessage = "No account found with this email. Please sign up first.";
          setTimeout(() => navigate("/signup"), 2000);
        }

        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
        return;
      }

      // Clear OTP inputs
      setOtp(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();

      toast({
        title: "Code sent",
        description: "A new verification code has been sent to your email.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to resend code. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Mask email for display (e.g., "jo***@example.com")
  const maskedEmail = email
    ? email.replace(/^(.{2})(.*)(@.*)$/, (_: string, start: string, middle: string, end: string) =>
        `${start}${"*".repeat(Math.min(middle.length, 5))}${end}`,
      )
    : "";

  return (
    <div className="min-h-screen bg-background flex relative overflow-hidden">
      {/* Left Panel */}
      <div className="hidden lg:flex absolute left-5 top-5 bottom-5 w-[582px] bg-gradient-primary rounded-[24px] shadow-glow p-[60px] flex flex-col justify-between overflow-hidden z-10">
        <div className="relative z-10 flex-shrink-0">
          <h1 className="text-[64px] font-bold text-white leading-tight mb-[10px] tracking-[-1px]">
            Verify your
            <br />
            email address
          </h1>
          <div className="w-[340px] h-[3px] bg-white rounded-[2px] mb-10 opacity-90" />
          <p className="text-[17px] leading-relaxed text-white max-w-[500px] font-normal">
            We've sent a verification code to your email.
            <br />
            Please enter it below to complete your registration.
          </p>
        </div>
        <div className="absolute bottom-0 left-0 right-0 z-10 flex justify-center items-end w-full px-[60px] box-border">
          <img
            src="/assest/verification.png"
            alt="Character"
            className="max-w-[380px] w-auto h-auto max-h-[500px] object-contain block m-0"
          />
        </div>
      </div>

      {/* Right Panel */}
      <div className="flex-1 lg:ml-[602px] p-8 lg:p-[60px_80px] flex flex-col justify-center relative overflow-y-auto bg-background">
        <div className="max-w-[480px] w-full mx-auto relative z-10">
          <h2 className="text-[36px] font-bold text-foreground mb-3 text-center">
            Verify Your Email
          </h2>
          <p className="text-[15px] text-muted-foreground mb-2 text-center font-normal">
            Please enter the 6-digit code we sent to
          </p>
          {maskedEmail && (
            <p className="text-[15px] text-primary font-semibold mb-10 text-center">
              {maskedEmail}
            </p>
          )}

          <div className="flex gap-3 justify-center mb-6">
            {otp.map((digit, index) => (
              <input
                key={index}
                ref={(el) => (inputRefs.current[index] = el)}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onPaste={index === 0 ? handlePaste : undefined}
                placeholder="-"
                className="w-[60px] h-[60px] text-center text-2xl font-semibold border-[1.5px] border-border rounded-[10px] outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 bg-card text-foreground selection:bg-primary/20"
              />
            ))}
          </div>

          <div className="text-center mb-6 text-[14px] text-muted-foreground">
            Didn't receive the code?{" "}
            <button
              onClick={handleResend}
              className="text-primary font-medium hover:underline focus:outline-none focus:ring-2 focus:ring-primary/20 rounded px-1"
            >
              Resend Code
            </button>
          </div>

          <Button
            onClick={handleSubmit}
            className="w-full h-12 bg-gradient-primary text-white text-[16px] font-semibold rounded-[10px] shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 transition-all disabled:opacity-50"
            disabled={loading || otp.join("").length !== 6}
          >
            {loading ? "Verifying..." : "Verify & Continue"}
          </Button>

          <div className="text-center text-[14px] text-muted-foreground mt-6">
            Back To{" "}
            <Link
              to="/signin"
              className="text-primary font-medium hover:underline focus:outline-none focus:ring-2 focus:ring-primary/20 rounded px-1"
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
