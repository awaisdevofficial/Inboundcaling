import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { PhoneNumberInput, validatePhoneNumber } from "@/components/PhoneNumberInput";

export default function SignUp() {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  const [countryCode, setCountryCode] = useState("US");
  const [phoneError, setPhoneError] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    if (error) setError("");
    if (e.target.name === "phone" && phoneError) setPhoneError("");
  };

  const handlePhoneChange = (value: string) => {
    setFormData({
      ...formData,
      phone: value,
    });
    if (phoneError) setPhoneError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!agreeTerms) {
      setError("Please agree to the Terms & Privacy");
      return;
    }

    if (
      !formData.firstName ||
      !formData.lastName ||
      !formData.email ||
      !formData.phone ||
      !formData.password
    ) {
      setError("Please fill in all required fields");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (formData.password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    // Validate phone number — if validation API fails, allow signup to proceed
    try {
      const phoneValidation = validatePhoneNumber(formData.phone, countryCode);
      if (!phoneValidation.isValid) {
        setPhoneError(phoneValidation.error || "Please enter a valid phone number");
        return;
      }
    } catch (phoneValidationError) {
      // If phone validation itself throws, don't block signup
      console.warn("Phone validation error — allowing signup:", phoneValidationError);
    }

    try {
      setLoading(true);
      const fullName = `${formData.firstName} ${formData.lastName}`;
      const { error: signUpError, user: newUser } = await signUp(
        formData.email,
        formData.password,
        fullName,
        formData.timezone,
        formData.phone,
      );

      if (signUpError) {
        throw signUpError;
      }

      // Trial credits are now automatically granted by the database trigger (handle_new_user)

      toast({
        title: "Account created!",
        description: "Please check your email for a verification code to complete your registration.",
      });
      navigate("/verify-email", { state: { email: formData.email } });
    } catch (err: any) {
      let errorMessage = err.message || "Failed to create account. Please try again.";
      if (err.message?.includes("email rate limit") || err.message?.includes("over_email_send_rate_limit")) {
        errorMessage = "Email rate limit exceeded. Please wait a few minutes before trying again.";
      } else if (err.message?.includes("timeout") || err.message?.includes("504") || err.message?.includes("Gateway") || err.message?.includes("taking too long")) {
        errorMessage = "The server is taking too long to respond. Please check your internet connection and try again. If the problem persists, the service may be temporarily unavailable.";
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex relative overflow-hidden">
      {/* Left Panel */}
      <div className="hidden lg:flex absolute left-5 top-5 bottom-5 w-[582px] bg-gradient-primary rounded-[24px] shadow-glow p-[60px] flex flex-col justify-between overflow-hidden z-10">
        <div className="relative z-10 flex-shrink-0">
          <h1 className="text-[64px] font-bold text-white leading-tight mb-[10px] tracking-[-1px]">
            Build your AI-<br />
            powered social<br />
            growth engine
          </h1>
          <div className="w-[340px] h-[3px] bg-white rounded-[2px] mb-10 opacity-90" />
          <p className="text-[17px] leading-relaxed text-white max-w-[500px] font-normal">
            Launch your personal AI agent to handle content, insights, and<br />
            execution across platforms. Stop reacting. Start controlling your<br />
            social media with data-driven automation.
          </p>
        </div>
        <div className="absolute bottom-0 left-0 right-0 z-10 flex justify-center items-end w-full px-[60px] box-border">
          <img
            src="/assest/signup.png"
            alt="Character"
            className="max-w-[380px] w-auto h-auto max-h-[500px] object-contain block m-0"
          />
        </div>
      </div>

      {/* Right Panel */}
      <div className="flex-1 lg:ml-[602px] p-8 lg:p-[60px_80px] flex flex-col justify-center relative overflow-hidden bg-background">
        <div className="max-w-[480px] w-full mx-auto relative z-10">
          <h2 className="text-[36px] font-bold text-foreground mb-3 text-center">
            Create your account!
          </h2>
          <p className="text-[15px] text-muted-foreground mb-6 text-center font-normal">
            Tell us a bit about yourself to get started.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[14px] font-medium text-foreground mb-1.5 block">
                  First Name *
                </Label>
                <Input
                  type="text"
                  name="firstName"
                  placeholder="Enter your first name"
                  value={formData.firstName}
                  onChange={handleChange}
                  className="h-11 px-[18px] text-[15px] bg-white border-[1.5px] border-border rounded-[10px] focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <Label className="text-[14px] font-medium text-foreground mb-1.5 block">
                  Last Name *
                </Label>
                <Input
                  type="text"
                  name="lastName"
                  placeholder="Enter your last name"
                  value={formData.lastName}
                  onChange={handleChange}
                  className="h-11 px-[18px] text-[15px] bg-white border-[1.5px] border-border rounded-[10px] focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            <div>
              <Label className="text-[14px] font-medium text-foreground mb-1.5 block">
                Email Address *
              </Label>
              <Input
                type="email"
                name="email"
                placeholder="Enter your email"
                value={formData.email}
                onChange={handleChange}
                className="h-11 px-[18px] text-[15px] bg-white border-[1.5px] border-border rounded-[10px] focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div>
              <Label className="text-[14px] font-medium text-foreground mb-1.5 block">
                Phone Number *
              </Label>
              <PhoneNumberInput
                value={formData.phone}
                onChange={handlePhoneChange}
                countryCode={countryCode}
                onCountryCodeChange={setCountryCode}
                placeholder="Enter phone number"
                error={phoneError}
                disabled={loading}
              />
            </div>

            <div>
              <Label className="text-[14px] font-medium text-foreground mb-1.5 block">
                Password *
              </Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  placeholder="Enter Your Password"
                  value={formData.password}
                  onChange={handleChange}
                  className="h-11 px-[18px] pr-[45px] text-[15px] bg-white border-[1.5px] border-border rounded-[10px] focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            <div>
              <Label className="text-[14px] font-medium text-foreground mb-1.5 block">
                Confirm Password *
              </Label>
              <div className="relative">
                <Input
                  type={showConfirmPassword ? "text" : "password"}
                  name="confirmPassword"
                  placeholder="Enter Your Confirm Password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  className="h-11 px-[18px] pr-[45px] text-[15px] bg-white border-[1.5px] border-border rounded-[10px] focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 mb-4">
              <Checkbox
                id="terms"
                checked={agreeTerms}
                onCheckedChange={(checked) => setAgreeTerms(checked === true)}
              />
              <Label
                htmlFor="terms"
                className="text-[14px] text-muted-foreground cursor-pointer"
              >
                I agree to the Terms & Privacy
              </Label>
            </div>

            {error && (
              <div className="p-2.5 bg-destructive/10 border border-destructive rounded-[10px] text-destructive text-[14px] mb-3 text-center">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-12 bg-gradient-primary text-white text-[16px] font-semibold rounded-[10px] shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 transition-all disabled:opacity-50"
              disabled={loading}
            >
              {loading ? "Creating account..." : "Sign up"}
            </Button>
          </form>

          <div className="text-center text-[14px] text-muted-foreground mt-4">
            Have an account?{" "}
            <Link
              to="/signin"
              className="text-primary font-medium hover:underline"
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
