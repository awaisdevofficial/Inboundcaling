import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  Loader2,
  Mail,
  Lock,
  User,
  Globe,
  Eye,
  EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { TimezoneSelector } from "@/components/TimezoneSelector";
import { PhoneNumberInput, validatePhoneNumber } from "@/components/PhoneNumberInput";

const signInSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  rememberMe: z.boolean().optional(),
});

const signUpSchema = z
  .object({
    firstName: z.string().min(2, "First name must be at least 2 characters"),
    lastName: z.string().min(2, "Last name must be at least 2 characters"),
    email: z.string().email("Please enter a valid email"),
    phone: z.string().min(1, "Phone number is required"),
    countryCode: z.string().min(1, "Country code is required"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string(),
    timezone: z.string().min(1, "Please select your timezone"),
    terms: z.boolean().refine((val) => val === true, {
      message: "You must accept the terms and privacy policy",
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  })
  .refine((data) => {
    const validation = validatePhoneNumber(data.phone, data.countryCode);
    return validation.isValid;
  }, {
    message: "Please enter a valid phone number",
    path: ["phone"],
  });

type SignInFormData = z.infer<typeof signInSchema>;
type SignUpFormData = z.infer<typeof signUpSchema>;

export default function Auth() {
  const navigate = useNavigate();
  const { user, signIn, signUp, loading: authLoading } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("signin");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    if (user && !authLoading) {
      navigate("/dashboard");
    }
  }, [user, authLoading, navigate]);

  const signInForm = useForm<SignInFormData>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "", rememberMe: false },
  });

  const signUpForm = useForm<SignUpFormData>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      countryCode: "US",
      password: "",
      confirmPassword: "",
      timezone: "",
      terms: false,
    },
  });

  const handleSignIn = async (data: SignInFormData) => {
    setIsLoading(true);
    const { error } = await signIn(data.email, data.password);
    setIsLoading(false);

    if (error) {
      toast({
        title: "Sign In Failed",
        description: error.message || "Invalid credentials. Please try again.",
        variant: "destructive",
      });
    } else {
      toast({ title: "Welcome back!", description: "Successfully signed in." });
      navigate("/dashboard");
    }
  };

  const handleSignUp = async (data: SignUpFormData) => {
    setIsLoading(true);
    const fullName = `${data.firstName} ${data.lastName}`;
    const { error, user: newUser } = await signUp(
      data.email,
      data.password,
      fullName,
      data.timezone,
      data.phone,
    );
    setIsLoading(false);

    if (error) {
      let message = error.message;
      if (error.message.includes("already registered")) {
        message = "This email is already registered. Please sign in instead.";
      } else if (error.message.includes("email rate limit") || error.message.includes("over_email_send_rate_limit")) {
        message = "Email rate limit exceeded. Please wait a few minutes before trying again.";
      } else if (error.message.includes("timeout") || error.message.includes("504") || error.message.includes("Gateway") || error.message.includes("taking too long")) {
        message = "The server is taking too long to respond. Please check your internet connection and try again. If the problem persists, the service may be temporarily unavailable.";
      }
      toast({
        title: "Sign Up Failed",
        description: message,
        variant: "destructive",
      });
    } else {
      // Trial credits are now automatically granted by the database trigger (handle_new_user)

      toast({
        title: "Account created!",
        description: "Please check your email for a verification code to complete your registration.",
      });
      navigate("/verify-email", { state: { email: data.email } });
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex relative">
      {/* Left Panel - Branded Section */}
      <div className="hidden lg:flex absolute left-0 top-0 bottom-0 w-[582px] bg-gradient-to-br from-[#3B82F6] to-[#2563EB] rounded-r-[24px] shadow-[0_10px_40px_rgba(37,99,235,0.15)] p-[60px] flex flex-col justify-between">
        <div className="space-y-6">
          <h1 className="text-[64px] font-bold text-white leading-tight">
            {activeTab === "signin"
              ? "Sign in to your creative HQ"
              : "Build your AI-powered social growth engine"}
          </h1>
          <div className="w-[340px] h-[3px] bg-white" />
          <p className="text-[17px] text-white font-normal leading-relaxed">
            {activeTab === "signin"
              ? "Welcome back! We're excited to have you here. Sign in to continue your journey with us."
              : "Join thousands of businesses automating their voice communications. Create intelligent voice bots and manage calls at scale."}
          </p>
        </div>
        <div className="flex items-end justify-center">
          <img
            src={activeTab === "signin" ? "/assest/signin.png" : "/assest/signup.png"}
            alt="Character illustration"
            className="max-w-[380px] max-h-[500px] object-contain"
          />
        </div>
      </div>

      {/* Right Panel - Form Section */}
      <div className="flex-1 lg:ml-[602px] p-8 lg:p-[60px_80px] flex items-center justify-center bg-white">
        <div className="w-full max-w-[480px]">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="hidden">
              <TabsTrigger value="signin" />
              <TabsTrigger value="signup" />
            </TabsList>

            {/* Sign In Tab */}
            <TabsContent value="signin" className="mt-0">
              <div className="space-y-6">
                <div>
                  <h2 className="text-[36px] font-bold text-[#1F2937] mb-2">
                    Welcome back!
                  </h2>
                  <p className="text-[15px] text-[#6B7280]">
                    Good to see you again.
                  </p>
                </div>

                <Form {...signInForm}>
                  <form
                    onSubmit={signInForm.handleSubmit(handleSignIn)}
                    className="space-y-5"
                  >
                    <FormField
                      control={signInForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[14px] font-medium text-[#1F2937]">
                            Email Address
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="123@gmail.com"
                              type="email"
                              className="h-[48px] px-[14px] border-[1.5px] border-[#E5E7EB] rounded-[10px] focus:border-[#3B82F6] focus:ring-2 focus:ring-[#3B82F6]/20"
                              {...field}
                              disabled={isLoading}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={signInForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[14px] font-medium text-[#1F2937]">
                            Password
                          </FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                type={showPassword ? "text" : "password"}
                                placeholder="Enter Your Password"
                                className="h-[48px] px-[14px] pr-[48px] border-[1.5px] border-[#E5E7EB] rounded-[10px] focus:border-[#3B82F6] focus:ring-2 focus:ring-[#3B82F6]/20"
                                {...field}
                                disabled={isLoading}
                              />
                              <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-[14px] top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-[#1F2937]"
                              >
                                {showPassword ? (
                                  <EyeOff className="h-5 w-5" />
                                ) : (
                                  <Eye className="h-5 w-5" />
                                )}
                              </button>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex items-center justify-between">
                      <FormField
                        control={signInForm.control}
                        name="rememberMe"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <FormLabel className="text-[14px] font-normal text-[#1F2937] cursor-pointer">
                              Terms & Privacy
                            </FormLabel>
                          </FormItem>
                        )}
                      />
                      <Link
                        to="/reset-password"
                        className="text-[14px] text-[#3B82F6] font-medium hover:underline"
                      >
                        Forgot Password?
                      </Link>
                    </div>

                    <Button
                      type="submit"
                      className="w-full h-[48px] bg-[#3B82F6] hover:bg-[#2563EB] text-white text-[16px] font-bold rounded-[10px] shadow-[0_4px_12px_rgba(59,130,246,0.3)] hover:shadow-[0_6px_16px_rgba(59,130,246,0.4)] transition-all"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Signing in...
                        </>
                      ) : (
                        "Sign In"
                      )}
                    </Button>
                  </form>
                </Form>

                <div className="text-center text-[14px] text-[#6B7280]">
                  Don't have an account?{" "}
                  <Link
                    to="/signup"
                    className="text-[#3B82F6] font-medium hover:underline"
                  >
                    Sign up
                  </Link>
                </div>

                {/* Social Login */}
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="flex-1 h-[1px] bg-[#E5E7EB]" />
                    <span className="text-[14px] text-[#6B7280]">or</span>
                    <div className="flex-1 h-[1px] bg-[#E5E7EB]" />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {/* Google Button */}
                    <Button
                      type="button"
                      variant="outline"
                      className="h-[48px] border-[1.5px] border-[#E5E7EB] rounded-[10px] hover:bg-[#F3F4F6]"
                    >
                      <svg
                        className="w-5 h-5"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                          fill="#4285F4"
                        />
                        <path
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                          fill="#34A853"
                        />
                        <path
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                          fill="#FBBC05"
                        />
                        <path
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                          fill="#EA4335"
                        />
                      </svg>
                    </Button>

                    {/* Apple Button */}
                    <Button
                      type="button"
                      variant="outline"
                      className="h-[48px] border-[1.5px] border-[#E5E7EB] rounded-[10px] hover:bg-[#F3F4F6]"
                    >
                      <svg
                        className="w-5 h-5"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                      </svg>
                    </Button>

                    {/* Facebook Button */}
                    <Button
                      type="button"
                      variant="outline"
                      className="h-[48px] border-[1.5px] border-[#E5E7EB] rounded-[10px] hover:bg-[#F3F4F6]"
                    >
                      <svg
                        className="w-5 h-5"
                        viewBox="0 0 24 24"
                        fill="#1877F2"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                      </svg>
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Sign Up Tab */}
            <TabsContent value="signup" className="mt-0">
              <div className="space-y-6">
                <div>
                  <h2 className="text-[36px] font-bold text-[#1F2937] mb-2">
                    Create your account!
                  </h2>
                  <p className="text-[15px] text-[#6B7280]">
                    Tell us a bit about yourself to get started.
                  </p>
                </div>

                <Form {...signUpForm}>
                  <form
                    onSubmit={signUpForm.handleSubmit(handleSignUp)}
                    className="space-y-5"
                  >
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={signUpForm.control}
                        name="firstName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-[14px] font-medium text-[#1F2937]">
                              First Name
                            </FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Enter your first name"
                                className="h-[48px] px-[14px] border-[1.5px] border-[#E5E7EB] rounded-[10px] focus:border-[#3B82F6] focus:ring-2 focus:ring-[#3B82F6]/20"
                                {...field}
                                disabled={isLoading}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={signUpForm.control}
                        name="lastName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-[14px] font-medium text-[#1F2937]">
                              Last Name
                            </FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Enter your last name"
                                className="h-[48px] px-[14px] border-[1.5px] border-[#E5E7EB] rounded-[10px] focus:border-[#3B82F6] focus:ring-2 focus:ring-[#3B82F6]/20"
                                {...field}
                                disabled={isLoading}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={signUpForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[14px] font-medium text-[#1F2937]">
                            Email Address
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Enter your email"
                              type="email"
                              className="h-[48px] px-[14px] border-[1.5px] border-[#E5E7EB] rounded-[10px] focus:border-[#3B82F6] focus:ring-2 focus:ring-[#3B82F6]/20"
                              {...field}
                              disabled={isLoading}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={signUpForm.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[14px] font-medium text-[#1F2937]">
                            Phone Number
                          </FormLabel>
                          <FormControl>
                            <PhoneNumberInput
                              value={field.value}
                              onChange={(value) => {
                                field.onChange(value);
                                signUpForm.trigger("phone");
                              }}
                              countryCode={signUpForm.watch("countryCode") || "US"}
                              onCountryCodeChange={(value) => {
                                signUpForm.setValue("countryCode", value, { shouldValidate: true });
                                signUpForm.trigger("phone");
                              }}
                              placeholder="Enter phone number"
                              error={signUpForm.formState.errors.phone?.message}
                              disabled={isLoading}
                              height="lg"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <input
                      type="hidden"
                      {...signUpForm.register("countryCode")}
                    />

                    <FormField
                      control={signUpForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[14px] font-medium text-[#1F2937]">
                            Password
                          </FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                type={showPassword ? "text" : "password"}
                                placeholder="Enter Your Password"
                                className="h-[48px] px-[14px] pr-[48px] border-[1.5px] border-[#E5E7EB] rounded-[10px] focus:border-[#3B82F6] focus:ring-2 focus:ring-[#3B82F6]/20"
                                {...field}
                                disabled={isLoading}
                              />
                              <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-[14px] top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-[#1F2937]"
                              >
                                {showPassword ? (
                                  <EyeOff className="h-5 w-5" />
                                ) : (
                                  <Eye className="h-5 w-5" />
                                )}
                              </button>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={signUpForm.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[14px] font-medium text-[#1F2937]">
                            Confirm Password
                          </FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                type={showConfirmPassword ? "text" : "password"}
                                placeholder="Enter Your Confirm Password"
                                className="h-[48px] px-[14px] pr-[48px] border-[1.5px] border-[#E5E7EB] rounded-[10px] focus:border-[#3B82F6] focus:ring-2 focus:ring-[#3B82F6]/20"
                                {...field}
                                disabled={isLoading}
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setShowConfirmPassword(!showConfirmPassword)
                                }
                                className="absolute right-[14px] top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-[#1F2937]"
                              >
                                {showConfirmPassword ? (
                                  <EyeOff className="h-5 w-5" />
                                ) : (
                                  <Eye className="h-5 w-5" />
                                )}
                              </button>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={signUpForm.control}
                      name="timezone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[14px] font-medium text-[#1F2937]">
                            Timezone
                          </FormLabel>
                          <FormControl>
                            <TimezoneSelector
                              value={field.value}
                              onValueChange={field.onChange}
                              disabled={isLoading}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={signUpForm.control}
                      name="terms"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-2 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <FormLabel className="text-[14px] font-normal text-[#1F2937] cursor-pointer">
                            I agree to the Terms & Privacy Policy
                          </FormLabel>
                        </FormItem>
                      )}
                    />

                    <Button
                      type="submit"
                      className="w-full h-[48px] bg-[#3B82F6] hover:bg-[#2563EB] text-white text-[16px] font-bold rounded-[10px] shadow-[0_4px_12px_rgba(59,130,246,0.3)] hover:shadow-[0_6px_16px_rgba(59,130,246,0.4)] transition-all"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating account...
                        </>
                      ) : (
                        "Sign up"
                      )}
                    </Button>
                  </form>
                </Form>

                <div className="text-center text-[14px] text-[#6B7280]">
                  Have an account?{" "}
                  <Link
                    to="/signin"
                    className="text-[#3B82F6] font-medium hover:underline"
                  >
                    Sign in
                  </Link>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
