import { useState, useEffect, useRef } from "react";
import {
  Globe,
  Loader2,
  Save,
  User,
  Bell,
  Shield,
  CheckCircle,
  AlertTriangle,
  Lock,
  Power,
  Upload,
  Camera,
  FileText,
  Phone,
  QrCode,
  Key,
  X,
  Eye,
  EyeOff,
  Copy,
  Check,
  TrendingUp,
  CreditCard,
  Zap,
  Building2,
  MapPin,
  Briefcase,
  Contact,
  Map,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useProfile } from "@/hooks/useProfile";
import { TimezoneSelector } from "@/components/TimezoneSelector";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { DeactivateAccountModal } from "@/components/DeactivateAccountModal";
import { uploadFile, deleteFile, extractFilePathFromUrl } from "@/lib/fileUpload";
import { generateTwoFactorSetup, verifyTwoFactorToken, generateBackupCodes } from "@/lib/twoFactorAuth";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { PhoneNumberInput } from "@/components/PhoneNumberInput";
import { CREDIT_COSTS, MONTHLY_PLANS } from "@/lib/creditCosts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/credits";
import { Link } from "react-router-dom";
import { 
  isOnFreeTrial, 
  isTrialExpired, 
  getTrialDaysRemaining, 
  formatTrialExpiration,
  TRIAL_CREDITS_AMOUNT 
} from "@/lib/trialCredits";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

export default function Settings() {
  const { profile, loading, updateProfile, refetch, deactivateAccount, reactivateAccount, requestDeactivation, verifyDeactivationCode } = useProfile();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [timezone, setTimezone] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  
  // Password Change
  const [oldPassword, setOldPassword] = useState("");
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [oldPasswordVerified, setOldPasswordVerified] = useState(false);
  const [isVerifyingOldPassword, setIsVerifyingOldPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState(false);
  const [isDeactivateModalOpen, setIsDeactivateModalOpen] = useState(false);
  
  // Profile & Avatar
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  
  // KYC
  const [isUploadingKYC, setIsUploadingKYC] = useState(false);
  const [kycDocumentType, setKycDocumentType] = useState<"passport" | "id" | "other">("passport");
  const passportInputRef = useRef<HTMLInputElement>(null);
  const idInputRef = useRef<HTMLInputElement>(null);
  const otherDocsInputRef = useRef<HTMLInputElement>(null);
  
  // 2FA
  const [show2FASetup, setShow2FASetup] = useState(false);
  const [twoFactorSecret, setTwoFactorSecret] = useState<string | null>(null);
  const [twoFactorQRCode, setTwoFactorQRCode] = useState<string | null>(null);
  const [twoFactorManualKey, setTwoFactorManualKey] = useState<string | null>(null);
  const [twoFactorVerificationCode, setTwoFactorVerificationCode] = useState("");
  const [isVerifying2FA, setIsVerifying2FA] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  
  // Phone Verification
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneCountryCode, setPhoneCountryCode] = useState("+1");
  const [phoneVerificationCode, setPhoneVerificationCode] = useState("");
  const [isSendingPhoneCode, setIsSendingPhoneCode] = useState(false);
  const [isVerifyingPhone, setIsVerifyingPhone] = useState(false);
  const [showPhoneVerification, setShowPhoneVerification] = useState(false);

  // Company Information
  const [companyName, setCompanyName] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [position, setPosition] = useState("");
  const [contactInfo, setContactInfo] = useState("");
  const [isSavingCompany, setIsSavingCompany] = useState(false);

  // Set timezone from profile when it loads
  useEffect(() => {
    if (profile) {
      setTimezone(profile.timezone || "UTC");
      setPhoneNumber(profile.phone_number || "");
      setCompanyName(profile.company_name || "");
      setCompanyAddress(profile.company_address || "");
      setPosition(profile.position || "");
      setContactInfo(profile.contact_info || "");
    }
  }, [profile]);

  const handleSave = async () => {
    if (!timezone) {
      toast({
        title: "Missing Timezone",
        description: "Please select a timezone.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    const result = await updateProfile({ timezone });
    setIsSaving(false);

    if (result) {
      toast({
        title: "Settings Updated",
        description: "Your timezone has been updated successfully.",
      });
    }
  };

  // Save Company Information
  const handleSaveCompanyInfo = async () => {
    setIsSavingCompany(true);
    try {
      const result = await updateProfile({
        company_name: companyName || null,
        company_address: companyAddress || null,
        position: position || null,
        contact_info: contactInfo || null,
      });

      if (result) {
        toast({
          title: "Company Info Updated",
          description: "Your company information has been saved successfully.",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save company information",
        variant: "destructive",
      });
    } finally {
      setIsSavingCompany(false);
    }
  };

  const hasCompanyChanges = () => {
    return (
      companyName !== (profile?.company_name || "") ||
      companyAddress !== (profile?.company_address || "") ||
      position !== (profile?.position || "") ||
      contactInfo !== (profile?.contact_info || "")
    );
  };

  // Avatar Upload
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setIsUploadingAvatar(true);
    try {
      // Delete old avatar if exists
      if (profile?.avatar_url) {
        const oldPath = extractFilePathFromUrl(profile.avatar_url, "avatars");
        if (oldPath) {
          await deleteFile("avatars", oldPath);
        }
      }

      const result = await uploadFile(file, "avatars", "", user.id);
      
      if (result.error) {
        toast({
          title: "Upload Failed",
          description: result.error,
          variant: "destructive",
        });
        return;
      }

      if (result.url) {
        await updateProfile({ avatar_url: result.url });
        toast({
          title: "Success",
          description: "Profile picture updated successfully.",
        });
        refetch();
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to upload avatar",
        variant: "destructive",
      });
    } finally {
      setIsUploadingAvatar(false);
      if (avatarInputRef.current) {
        avatarInputRef.current.value = "";
      }
    }
  };

  // KYC Document Upload
  const handleKYCDocumentUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "passport" | "id" | "other"
  ) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setIsUploadingKYC(true);
    try {
      let result;
      if (type === "passport") {
        // Delete old passport if exists
        if (profile?.passport_url) {
          const oldPath = extractFilePathFromUrl(profile.passport_url, "kyc-documents");
          if (oldPath) {
            await deleteFile("kyc-documents", oldPath);
          }
        }
        result = await uploadFile(file, "kyc-documents", "passport", user.id);
        if (result.url) {
          await updateProfile({ 
            passport_url: result.url,
            kyc_status: profile?.kyc_status || "pending",
            kyc_submitted_at: new Date().toISOString(),
          });
        }
      } else if (type === "id") {
        // Delete old ID if exists
        if (profile?.id_document_url) {
          const oldPath = extractFilePathFromUrl(profile.id_document_url, "kyc-documents");
          if (oldPath) {
            await deleteFile("kyc-documents", oldPath);
          }
        }
        result = await uploadFile(file, "kyc-documents", "id", user.id);
        if (result.url) {
          await updateProfile({ 
            id_document_url: result.url,
            kyc_status: profile?.kyc_status || "pending",
            kyc_submitted_at: new Date().toISOString(),
          });
        }
      } else {
        result = await uploadFile(file, "kyc-documents", "other", user.id);
        if (result.url) {
          const existingDocs = profile?.kyc_other_documents || [];
          await updateProfile({ 
            kyc_other_documents: [...existingDocs, result.url],
            kyc_status: profile?.kyc_status || "pending",
            kyc_submitted_at: new Date().toISOString(),
          });
        }
      }

      if (result.error) {
        toast({
          title: "Upload Failed",
          description: result.error,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Success",
        description: "Document uploaded successfully.",
      });
      refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to upload document",
        variant: "destructive",
      });
    } finally {
      setIsUploadingKYC(false);
      if (passportInputRef.current) passportInputRef.current.value = "";
      if (idInputRef.current) idInputRef.current.value = "";
      if (otherDocsInputRef.current) otherDocsInputRef.current.value = "";
    }
  };

  // 2FA Setup
  const handleSetup2FA = async () => {
    if (!user?.email) return;

    try {
      const setup = await generateTwoFactorSetup(user.email);
      setTwoFactorSecret(setup.secret);
      setTwoFactorQRCode(setup.qrCodeUrl);
      setTwoFactorManualKey(setup.manualEntryKey);
      setShow2FASetup(true);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to generate 2FA setup",
        variant: "destructive",
      });
    }
  };

  const handleVerify2FA = async () => {
    if (!twoFactorSecret || !twoFactorVerificationCode) {
      toast({
        title: "Error",
        description: "Please enter the verification code",
        variant: "destructive",
      });
      return;
    }

    setIsVerifying2FA(true);
    try {
      const isValid = verifyTwoFactorToken(twoFactorSecret, twoFactorVerificationCode);
      
      if (!isValid) {
        toast({
          title: "Invalid Code",
          description: "The verification code is incorrect. Please try again.",
          variant: "destructive",
        });
        return;
      }

      // Generate backup codes
      const codes = generateBackupCodes(10);
      setBackupCodes(codes);
      setShowBackupCodes(true);

      // Save 2FA to profile
      await updateProfile({
        two_factor_enabled: true,
        two_factor_secret: twoFactorSecret,
        two_factor_backup_codes: codes,
      });

      toast({
        title: "2FA Enabled",
        description: "Two-factor authentication has been enabled successfully.",
      });

      refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to verify 2FA",
        variant: "destructive",
      });
    } finally {
      setIsVerifying2FA(false);
    }
  };

  const handleDisable2FA = async () => {
    try {
      await updateProfile({
        two_factor_enabled: false,
        two_factor_secret: null,
        two_factor_backup_codes: null,
      });

      toast({
        title: "2FA Disabled",
        description: "Two-factor authentication has been disabled.",
      });

      refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to disable 2FA",
        variant: "destructive",
      });
    }
  };

  const copyBackupCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Phone Verification
  const handleSendPhoneCode = async () => {
    if (!phoneNumber || !user) {
      toast({
        title: "Error",
        description: "Please enter a phone number",
        variant: "destructive",
      });
      return;
    }

    setIsSendingPhoneCode(true);
    try {
      // Generate a 6-digit verification code
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      
      // Save code to profile (in production, send via SMS service)
      await updateProfile({
        phone_number: phoneNumber,
        phone_verification_code: code,
        phone_verification_sent_at: new Date().toISOString(),
        phone_verified: false,
      });

      // For demo purposes, show the code in a toast (in production, send via SMS)
      toast({
        title: "Verification Code Sent",
        description: `Your verification code is: ${code} (This is a demo - in production this would be sent via SMS)`,
      });

      setShowPhoneVerification(true);
      refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send verification code",
        variant: "destructive",
      });
    } finally {
      setIsSendingPhoneCode(false);
    }
  };

  const handleVerifyPhone = async () => {
    if (!phoneVerificationCode || !user) return;

    setIsVerifyingPhone(true);
    try {
      // In production, verify against the code sent via SMS
      // For now, we'll check against the stored code
      const storedCode = profile?.phone_verification_code;
      
      if (phoneVerificationCode !== storedCode) {
        toast({
          title: "Invalid Code",
          description: "The verification code is incorrect. Please try again.",
          variant: "destructive",
        });
        return;
      }

      await updateProfile({
        phone_verified: true,
        phone_verification_code: null,
      });

      toast({
        title: "Phone Verified",
        description: "Your phone number has been verified successfully.",
      });

      setShowPhoneVerification(false);
      setPhoneVerificationCode("");
      refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to verify phone number",
        variant: "destructive",
      });
    } finally {
      setIsVerifyingPhone(false);
    }
  };

  return (
    <ProtectedRoute>
      <DashboardLayout>
        {loading ? (
          <div className="flex items-center justify-center min-h-[500px]">
            <div className="text-center">
              <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-4" />
              <p className="text-muted-foreground font-medium">
                Loading settings...
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-8 pb-8">
            {/* Header Section */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4" data-tour="settings-header">
              <div className="space-y-1">
                <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Settings</h1>
                <p className="text-slate-500 text-base">Manage your account preferences and configurations</p>
              </div>
            </div>

            <Tabs defaultValue="profile" className="space-y-6">
              <TabsList className="grid w-full grid-cols-5 bg-slate-100 p-1 h-auto">
                <TabsTrigger value="profile" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
                  <User className="h-4 w-4 mr-2" />
                  Profile
                </TabsTrigger>
                <TabsTrigger value="kyc" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
                  <Shield className="h-4 w-4 mr-2" />
                  KYC
                </TabsTrigger>
                <TabsTrigger value="security" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
                  <Lock className="h-4 w-4 mr-2" />
                  Security
                </TabsTrigger>
                <TabsTrigger value="billing" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
                  <CreditCard className="h-4 w-4 mr-2" />
                  Billing
                </TabsTrigger>
                <TabsTrigger value="general" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
                  <Globe className="h-4 w-4 mr-2" />
                  General
                </TabsTrigger>
              </TabsList>

              {/* Profile Tab */}
              <TabsContent value="profile" className="space-y-6">
                <Card className="border-slate-200 shadow-sm">
                  <CardHeader className="border-b border-slate-100 pb-4">
                    <CardTitle className="text-xl font-semibold flex items-center gap-2">
                      <User className="h-5 w-5 text-blue-600" />
                      Profile Settings
                    </CardTitle>
                    <CardDescription className="text-sm mt-1">
                      Manage your profile picture and personal information
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-6">
                    {/* Profile Picture */}
                    <div className="space-y-4">
                      <Label className="text-base font-bold">Profile Picture</Label>
                      <div className="flex items-center gap-6">
                        <Avatar className="h-24 w-24">
                          <AvatarImage src={profile?.avatar_url || undefined} alt={user?.email || "User"} />
                          <AvatarFallback className="text-2xl">
                            {user?.email?.charAt(0).toUpperCase() || "U"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-3">
                            <input
                              ref={avatarInputRef}
                              type="file"
                              accept="image/jpeg,image/jpg,image/png,image/webp"
                              onChange={handleAvatarUpload}
                              className="hidden"
                              id="avatar-upload"
                            />
                            <Button
                              variant="outline"
                              onClick={() => avatarInputRef.current?.click()}
                              disabled={isUploadingAvatar}
                              className="gap-2"
                            >
                              {isUploadingAvatar ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Uploading...
                                </>
                              ) : (
                                <>
                                  <Camera className="h-4 w-4" />
                                  {profile?.avatar_url ? "Change Picture" : "Upload Picture"}
                                </>
                              )}
                            </Button>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            JPG, PNG or WebP. Max size 10MB.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Full Name */}
                    <div className="space-y-2">
                      <Label htmlFor="fullName" className="text-base font-bold">
                        Full Name
                      </Label>
                      <Input
                        id="fullName"
                        value={profile?.full_name || ""}
                        onChange={async (e) => {
                          await updateProfile({ full_name: e.target.value });
                        }}
                        placeholder="Enter your full name"
                      />
                    </div>

                    {/* Email (Read-only) */}
                    <div className="space-y-2">
                      <Label className="text-base font-bold">Email</Label>
                      <Input
                        value={user?.email || ""}
                        disabled
                        className="bg-muted"
                      />
                      <p className="text-sm text-muted-foreground">
                        Email cannot be changed
                      </p>
                    </div>

                    {/* Phone Verification */}
                    <div className="space-y-4">
                      <Label className="text-base font-bold">Phone Number</Label>
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <PhoneNumberInput
                            value={phoneNumber}
                            onChange={(value) => setPhoneNumber(value)}
                            countryCode={phoneCountryCode}
                            onCountryCodeChange={setPhoneCountryCode}
                            disabled={profile?.phone_verified === true}
                          />
                        </div>
                        {!profile?.phone_verified ? (
                          <Button
                            variant="outline"
                            onClick={handleSendPhoneCode}
                            disabled={isSendingPhoneCode || !phoneNumber}
                            className="gap-2"
                          >
                            {isSendingPhoneCode ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Sending...
                              </>
                            ) : (
                              <>
                                <Phone className="h-4 w-4" />
                                Verify
                              </>
                            )}
                          </Button>
                        ) : (
                          <div className="flex items-center gap-2 text-success">
                            <CheckCircle className="h-5 w-5" />
                            <span className="text-sm font-semibold">Verified</span>
                          </div>
                        )}
                      </div>
                      {showPhoneVerification && (
                        <div className="space-y-2 p-4 rounded-lg bg-primary/5 border border-primary/20">
                          <Label>Enter Verification Code</Label>
                          <div className="flex items-center gap-3">
                            <Input
                              value={phoneVerificationCode}
                              onChange={(e) => setPhoneVerificationCode(e.target.value)}
                              placeholder="Enter 6-digit code"
                              maxLength={6}
                              className="flex-1"
                            />
                            <Button
                              onClick={handleVerifyPhone}
                              disabled={isVerifyingPhone || phoneVerificationCode.length !== 6}
                              className="gap-2"
                            >
                              {isVerifyingPhone ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Verifying...
                                </>
                              ) : (
                                "Verify"
                              )}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Company Information Card */}
                <Card className="border-slate-200 shadow-sm">
                  <CardHeader className="border-b border-slate-100 pb-4">
                    <CardTitle className="text-xl font-semibold flex items-center gap-2">
                      <Building2 className="h-5 w-5 text-blue-600" />
                      Company Information
                    </CardTitle>
                    <CardDescription className="text-sm mt-1">
                      Add your company details. These will be used in email signatures and templates.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-6">
                    {/* Your Name (read from full_name) */}
                    <div className="space-y-2">
                      <Label htmlFor="companyYourName" className="flex items-center gap-2 text-base font-bold">
                        <User className="h-4 w-4 text-primary" />
                        Your Name
                      </Label>
                      <Input
                        id="companyYourName"
                        value={profile?.full_name || ""}
                        disabled
                        className="bg-muted"
                      />
                      <p className="text-sm text-muted-foreground">
                        This is your profile name from above. Update it in the Profile Picture section.
                      </p>
                    </div>

                    {/* Position / Title */}
                    <div className="space-y-2">
                      <Label htmlFor="position" className="flex items-center gap-2 text-base font-bold">
                        <Briefcase className="h-4 w-4 text-primary" />
                        Your Position / Title
                      </Label>
                      <Input
                        id="position"
                        value={position}
                        onChange={(e) => setPosition(e.target.value)}
                        placeholder="e.g. Sales Manager, CEO, Customer Support Lead"
                      />
                    </div>

                    {/* Company Name */}
                    <div className="space-y-2">
                      <Label htmlFor="companyName" className="flex items-center gap-2 text-base font-bold">
                        <Building2 className="h-4 w-4 text-primary" />
                        Company Name
                      </Label>
                      <Input
                        id="companyName"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        placeholder="e.g. Acme Corporation"
                      />
                    </div>

                    {/* Company Address */}
                    <div className="space-y-2">
                      <Label htmlFor="companyAddress" className="flex items-center gap-2 text-base font-bold">
                        <MapPin className="h-4 w-4 text-primary" />
                        Company Address
                      </Label>
                      <Input
                        id="companyAddress"
                        value={companyAddress}
                        onChange={(e) => setCompanyAddress(e.target.value)}
                        placeholder="e.g. 123 Main St, Suite 100, New York, NY 10001"
                      />
                    </div>

                    {/* Contact Information */}
                    <div className="space-y-2">
                      <Label htmlFor="contactInfo" className="flex items-center gap-2 text-base font-bold">
                        <Contact className="h-4 w-4 text-primary" />
                        Contact Information
                      </Label>
                      <Input
                        id="contactInfo"
                        value={contactInfo}
                        onChange={(e) => setContactInfo(e.target.value)}
                        placeholder="e.g. +1 (555) 123-4567 | www.example.com"
                      />
                      <p className="text-sm text-muted-foreground">
                        Phone number, website, or any other contact details you want in your email signature.
                      </p>
                    </div>

                    {/* Preview */}
                    {(companyName || position || companyAddress || contactInfo || profile?.full_name) && (
                      <div className="space-y-2">
                        <Label className="text-base font-bold">Email Signature Preview</Label>
                        <div className="p-4 rounded-lg bg-muted/50 border border-border/50 text-sm leading-relaxed">
                          {profile?.full_name && <p className="font-semibold">{profile.full_name}</p>}
                          {position && <p className="text-muted-foreground">{position}</p>}
                          {companyName && <p className="text-muted-foreground">{companyName}</p>}
                          {companyAddress && <p className="text-muted-foreground">{companyAddress}</p>}
                          {contactInfo && <p className="text-muted-foreground">{contactInfo}</p>}
                        </div>
                      </div>
                    )}

                    {/* Save Button */}
                    <div className="flex items-center justify-between pt-5 border-t border-border/50">
                      <div className="text-sm text-muted-foreground">
                        {hasCompanyChanges() && (
                          <span className="text-warning font-semibold">
                            ● Unsaved changes
                          </span>
                        )}
                      </div>
                      <Button
                        onClick={handleSaveCompanyInfo}
                        disabled={isSavingCompany || !hasCompanyChanges()}
                        variant="call"
                        size="lg"
                        className="gap-2"
                      >
                        {isSavingCompany ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4" />
                            Save Company Info
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* KYC Tab */}
              <TabsContent value="kyc" className="space-y-6">
                <Card className="border-slate-200 shadow-sm">
                  <CardHeader className="border-b border-slate-100 pb-4">
                    <CardTitle className="text-xl font-semibold flex items-center gap-2">
                      <Shield className="h-5 w-5 text-blue-600" />
                      KYC Verification
                    </CardTitle>
                    <CardDescription className="text-sm mt-1">
                      Upload your identity documents for verification
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-6">
                    {/* KYC Status */}
                    {profile?.kyc_status && (
                      <div className={`p-4 rounded-lg border ${
                        profile.kyc_status === "verified" 
                          ? "bg-success/10 border-success/20" 
                          : profile.kyc_status === "rejected"
                          ? "bg-destructive/10 border-destructive/20"
                          : "bg-warning/10 border-warning/20"
                      }`}>
                        <div className="flex items-center gap-2">
                          {profile.kyc_status === "verified" ? (
                            <CheckCircle className="h-5 w-5 text-success" />
                          ) : profile.kyc_status === "rejected" ? (
                            <AlertTriangle className="h-5 w-5 text-destructive" />
                          ) : (
                            <Loader2 className="h-5 w-5 text-warning animate-spin" />
                          )}
                          <span className="font-semibold">
                            Status: {profile.kyc_status.charAt(0).toUpperCase() + profile.kyc_status.slice(1)}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Passport Upload */}
                    <div className="space-y-4">
                      <Label className="text-base font-bold">Passport</Label>
                      <div className="space-y-3">
                        {profile?.passport_url ? (
                          <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                            <FileText className="h-5 w-5 text-primary" />
                            <span className="flex-1 text-sm">Passport uploaded</span>
                            <a
                              href={profile.passport_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline text-sm"
                            >
                              View
                            </a>
                          </div>
                        ) : (
                          <div className="border-2 border-dashed border-border rounded-lg p-6">
                            <input
                              ref={passportInputRef}
                              type="file"
                              accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
                              onChange={(e) => handleKYCDocumentUpload(e, "passport")}
                              className="hidden"
                              id="passport-upload"
                            />
                            <div className="text-center space-y-3">
                              <FileText className="h-10 w-10 mx-auto text-muted-foreground" />
                              <div>
                                <Button
                                  variant="outline"
                                  onClick={() => passportInputRef.current?.click()}
                                  disabled={isUploadingKYC}
                                  className="gap-2"
                                >
                                  {isUploadingKYC ? (
                                    <>
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                      Uploading...
                                    </>
                                  ) : (
                                    <>
                                      <Upload className="h-4 w-4" />
                                      Upload Passport
                                    </>
                                  )}
                                </Button>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                JPG, PNG, WebP or PDF. Max size 10MB.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ID Document Upload */}
                    <div className="space-y-4">
                      <Label className="text-base font-bold">ID Document</Label>
                      <div className="space-y-3">
                        {profile?.id_document_url ? (
                          <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                            <FileText className="h-5 w-5 text-primary" />
                            <span className="flex-1 text-sm">ID document uploaded</span>
                            <a
                              href={profile.id_document_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline text-sm"
                            >
                              View
                            </a>
                          </div>
                        ) : (
                          <div className="border-2 border-dashed border-border rounded-lg p-6">
                            <input
                              ref={idInputRef}
                              type="file"
                              accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
                              onChange={(e) => handleKYCDocumentUpload(e, "id")}
                              className="hidden"
                              id="id-upload"
                            />
                            <div className="text-center space-y-3">
                              <FileText className="h-10 w-10 mx-auto text-muted-foreground" />
                              <div>
                                <Button
                                  variant="outline"
                                  onClick={() => idInputRef.current?.click()}
                                  disabled={isUploadingKYC}
                                  className="gap-2"
                                >
                                  {isUploadingKYC ? (
                                    <>
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                      Uploading...
                                    </>
                                  ) : (
                                    <>
                                      <Upload className="h-4 w-4" />
                                      Upload ID Document
                                    </>
                                  )}
                                </Button>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                JPG, PNG, WebP or PDF. Max size 10MB.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Other Documents */}
                    <div className="space-y-4">
                      <Label className="text-base font-bold">Other Documents (Optional)</Label>
                      <div className="space-y-3">
                        {profile?.kyc_other_documents && profile.kyc_other_documents.length > 0 && (
                          <div className="space-y-2">
                            {profile.kyc_other_documents.map((doc, index) => (
                              <div key={index} className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                                <FileText className="h-5 w-5 text-primary" />
                                <span className="flex-1 text-sm">Document {index + 1}</span>
                                <a
                                  href={doc}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline text-sm"
                                >
                                  View
                                </a>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="border-2 border-dashed border-border rounded-lg p-6">
                          <input
                            ref={otherDocsInputRef}
                            type="file"
                            accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
                            onChange={(e) => handleKYCDocumentUpload(e, "other")}
                            className="hidden"
                            id="other-docs-upload"
                          />
                          <div className="text-center space-y-3">
                            <FileText className="h-10 w-10 mx-auto text-muted-foreground" />
                            <div>
                              <Button
                                variant="outline"
                                onClick={() => otherDocsInputRef.current?.click()}
                                disabled={isUploadingKYC}
                                className="gap-2"
                              >
                                {isUploadingKYC ? (
                                  <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Uploading...
                                  </>
                                ) : (
                                  <>
                                    <Upload className="h-4 w-4" />
                                    Upload Additional Document
                                  </>
                                )}
                              </Button>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              JPG, PNG, WebP or PDF. Max size 10MB.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Security Tab */}
              <TabsContent value="security" className="space-y-6">
                {/* 2FA Settings */}
                <Card className="border-slate-200 shadow-sm">
                  <CardHeader className="border-b border-slate-100 pb-4">
                    <CardTitle className="text-xl font-semibold flex items-center gap-2">
                      <Shield className="h-5 w-5 text-blue-600" />
                      Two-Factor Authentication
                    </CardTitle>
                    <CardDescription className="text-sm mt-1">
                      Add an extra layer of security to your account
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-6">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <Label className="text-base font-bold">2FA Status</Label>
                          <div className="flex items-center gap-2 mt-1">
                            {profile?.two_factor_enabled ? (
                              <>
                                <CheckCircle className="h-5 w-5 text-success" />
                                <p className="text-sm text-success font-semibold">
                                  Two-factor authentication is enabled
                                </p>
                              </>
                            ) : (
                              <>
                                <AlertTriangle className="h-5 w-5 text-muted-foreground" />
                                <p className="text-sm text-muted-foreground">
                                  Two-factor authentication is disabled
                                </p>
                              </>
                            )}
                          </div>
                        </div>
                        {profile?.two_factor_enabled ? (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" className="border-destructive text-destructive hover:bg-destructive/10">
                                Disable 2FA
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Disable 2FA?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to disable two-factor authentication? This will make your account less secure.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={handleDisable2FA}
                                  className="bg-destructive hover:bg-destructive/90"
                                >
                                  Disable
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        ) : (
                          <Button onClick={handleSetup2FA} className="gap-2">
                            <Key className="h-4 w-4" />
                            Enable 2FA
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Password Change */}
                <Card className="border-slate-200 shadow-sm">
                  <CardHeader className="border-b border-slate-100 pb-4">
                    <CardTitle className="text-xl font-semibold flex items-center gap-2">
                      <Lock className="h-5 w-5 text-blue-600" />
                      Password
                    </CardTitle>
                    <CardDescription className="text-sm mt-1">
                      Change your account password
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-6">
                    {passwordChangeSuccess ? (
                      /* Success state */
                      <div className="space-y-4">
                        <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                          <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                          <div>
                            <p className="text-sm font-semibold text-green-800 dark:text-green-300">Password updated successfully!</p>
                            <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">Your new password is now active.</p>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPasswordChangeSuccess(false)}
                        >
                          Change password again
                        </Button>
                      </div>
                    ) : !oldPasswordVerified ? (
                      /* Step 1: Verify current password */
                      <div className="space-y-5">
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border/50">
                          <Shield className="h-4 w-4 text-primary flex-shrink-0" />
                          <p className="text-sm text-muted-foreground">
                            For your security, please verify your current password first.
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="old-password" className="text-sm font-semibold">
                            Current Password
                          </Label>
                          <div className="relative">
                            <Input
                              id="old-password"
                              type={showOldPassword ? "text" : "password"}
                              placeholder="Enter your current password"
                              value={oldPassword}
                              onChange={(e) => setOldPassword(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && oldPassword.length > 0 && !isVerifyingOldPassword) {
                                  e.preventDefault();
                                  document.getElementById("verify-old-password-btn")?.click();
                                }
                              }}
                              className="h-11 pr-11"
                            />
                            <button
                              type="button"
                              onClick={() => setShowOldPassword(!showOldPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                            >
                              {showOldPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 pt-1">
                          <Button
                            id="verify-old-password-btn"
                            onClick={async () => {
                              if (!oldPassword) {
                                toast({
                                  title: "Error",
                                  description: "Please enter your current password.",
                                  variant: "destructive",
                                });
                                return;
                              }

                              if (!user?.email) {
                                toast({
                                  title: "Error",
                                  description: "User email not found.",
                                  variant: "destructive",
                                });
                                return;
                              }

                              setIsVerifyingOldPassword(true);
                              try {
                                // Verify old password by attempting to sign in with it
                                const { error } = await supabase.auth.signInWithPassword({
                                  email: user.email,
                                  password: oldPassword,
                                });

                                if (error) {
                                  toast({
                                    title: "Incorrect Password",
                                    description: "The current password you entered is incorrect. Please try again.",
                                    variant: "destructive",
                                  });
                                  return;
                                }

                                // Password verified successfully
                                setOldPasswordVerified(true);
                                toast({
                                  title: "Password Verified",
                                  description: "You can now set your new password.",
                                });
                              } catch (error: any) {
                                toast({
                                  title: "Error",
                                  description: error.message || "Failed to verify password.",
                                  variant: "destructive",
                                });
                              } finally {
                                setIsVerifyingOldPassword(false);
                              }
                            }}
                            disabled={isVerifyingOldPassword || !oldPassword}
                            className="bg-gradient-primary text-white shadow-sm hover:shadow-md transition-all"
                          >
                            {isVerifyingOldPassword ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Verifying...
                              </>
                            ) : (
                              <>
                                <Key className="h-4 w-4 mr-2" />
                                Verify Password
                              </>
                            )}
                          </Button>

                          {oldPassword && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setOldPassword("");
                                setShowOldPassword(false);
                              }}
                              className="text-muted-foreground"
                            >
                              Cancel
                            </Button>
                          )}
                        </div>

                        {/* Forgot password - Reset via email */}
                        <div className="pt-2 border-t border-border/50">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span>Forgot your password?</span>
                            <Button
                              variant="link"
                              size="sm"
                              className="text-primary p-0 h-auto font-medium"
                              disabled={isResettingPassword}
                              onClick={async () => {
                                if (!user?.email) {
                                  toast({
                                    title: "Error",
                                    description: "User email not found.",
                                    variant: "destructive",
                                  });
                                  return;
                                }

                                // Throttle reset requests
                                const lastResetKey = `last_password_reset_${user.email}`;
                                const lastResetTime = localStorage.getItem(lastResetKey);
                                const now = Date.now();
                                if (lastResetTime && now - parseInt(lastResetTime) < 60000) {
                                  const secondsLeft = Math.ceil((60000 - (now - parseInt(lastResetTime))) / 1000);
                                  toast({
                                    title: "Please wait",
                                    description: `Please wait ${secondsLeft} seconds before requesting another reset link.`,
                                    variant: "destructive",
                                  });
                                  return;
                                }

                                setIsResettingPassword(true);
                                try {
                                  const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
                                    redirectTo: `${window.location.origin}/set-new-password`,
                                  });

                                  if (error) {
                                    if (error.message?.includes("over_email_send_rate_limit") || error.message?.includes("email rate limit")) {
                                      toast({
                                        title: "Rate limit exceeded",
                                        description: "Too many emails sent. Please wait a few minutes.",
                                        variant: "destructive",
                                      });
                                      return;
                                    }
                                    throw error;
                                  }

                                  localStorage.setItem(lastResetKey, now.toString());

                                  toast({
                                    title: "Reset link sent!",
                                    description: `A password reset link has been sent to ${user.email}. Check your inbox.`,
                                  });
                                } catch (error: any) {
                                  toast({
                                    title: "Error",
                                    description: error.message || "Failed to send reset link.",
                                    variant: "destructive",
                                  });
                                } finally {
                                  setIsResettingPassword(false);
                                }
                              }}
                            >
                              {isResettingPassword ? (
                                <>
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  Sending...
                                </>
                              ) : (
                                "Reset via email"
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Step 2: Enter new password (only shown after old password is verified) */
                      <div className="space-y-5">
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                          <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                          <p className="text-sm text-green-700 dark:text-green-300 font-medium">
                            Current password verified. Enter your new password below.
                          </p>
                        </div>

                        {/* New Password */}
                        <div className="space-y-2">
                          <Label htmlFor="new-password" className="text-sm font-semibold">
                            New Password
                          </Label>
                          <div className="relative">
                            <Input
                              id="new-password"
                              type={showNewPassword ? "text" : "password"}
                              placeholder="Enter new password"
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              className="h-11 pr-11"
                            />
                            <button
                              type="button"
                              onClick={() => setShowNewPassword(!showNewPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                            >
                              {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                          {/* Password strength indicator */}
                          {newPassword.length > 0 && (
                            <div className="space-y-1.5">
                              <div className="flex gap-1">
                                {[1, 2, 3, 4].map((level) => {
                                  const strength =
                                    (newPassword.length >= 8 ? 1 : 0) +
                                    (/[A-Z]/.test(newPassword) ? 1 : 0) +
                                    (/[0-9]/.test(newPassword) ? 1 : 0) +
                                    (/[^A-Za-z0-9]/.test(newPassword) ? 1 : 0);
                                  return (
                                    <div
                                      key={level}
                                      className={`h-1.5 flex-1 rounded-full transition-colors ${
                                        level <= strength
                                          ? strength <= 1
                                            ? "bg-red-500"
                                            : strength === 2
                                            ? "bg-orange-500"
                                            : strength === 3
                                            ? "bg-yellow-500"
                                            : "bg-green-500"
                                          : "bg-muted"
                                      }`}
                                    />
                                  );
                                })}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {newPassword.length < 8
                                  ? "Password must be at least 8 characters"
                                  : (() => {
                                      const s =
                                        (newPassword.length >= 8 ? 1 : 0) +
                                        (/[A-Z]/.test(newPassword) ? 1 : 0) +
                                        (/[0-9]/.test(newPassword) ? 1 : 0) +
                                        (/[^A-Za-z0-9]/.test(newPassword) ? 1 : 0);
                                      return s <= 1
                                        ? "Weak — add uppercase, numbers, or symbols"
                                        : s === 2
                                        ? "Fair — try adding more variety"
                                        : s === 3
                                        ? "Good — almost there!"
                                        : "Strong password";
                                    })()}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Confirm Password */}
                        <div className="space-y-2">
                          <Label htmlFor="confirm-new-password" className="text-sm font-semibold">
                            Confirm New Password
                          </Label>
                          <div className="relative">
                            <Input
                              id="confirm-new-password"
                              type={showConfirmNewPassword ? "text" : "password"}
                              placeholder="Confirm new password"
                              value={confirmNewPassword}
                              onChange={(e) => setConfirmNewPassword(e.target.value)}
                              className="h-11 pr-11"
                            />
                            <button
                              type="button"
                              onClick={() => setShowConfirmNewPassword(!showConfirmNewPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                            >
                              {showConfirmNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                          {confirmNewPassword.length > 0 && newPassword !== confirmNewPassword && (
                            <p className="text-xs text-red-500 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Passwords do not match
                            </p>
                          )}
                          {confirmNewPassword.length > 0 && newPassword === confirmNewPassword && newPassword.length >= 8 && (
                            <p className="text-xs text-green-600 flex items-center gap-1">
                              <CheckCircle className="h-3 w-3" />
                              Passwords match
                            </p>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-3 pt-2">
                          <Button
                            onClick={async () => {
                              // Validation
                              if (!newPassword || !confirmNewPassword) {
                                toast({
                                  title: "Error",
                                  description: "Please fill in both password fields.",
                                  variant: "destructive",
                                });
                                return;
                              }

                              if (newPassword.length < 8) {
                                toast({
                                  title: "Error",
                                  description: "Password must be at least 8 characters long.",
                                  variant: "destructive",
                                });
                                return;
                              }

                              if (newPassword !== confirmNewPassword) {
                                toast({
                                  title: "Error",
                                  description: "Passwords do not match.",
                                  variant: "destructive",
                                });
                                return;
                              }

                              setIsChangingPassword(true);
                              try {
                                const { error } = await supabase.auth.updateUser({
                                  password: newPassword,
                                });

                                if (error) throw error;

                                toast({
                                  title: "Password Updated",
                                  description: "Your password has been changed successfully.",
                                });

                                // Reset entire form and show success
                                setOldPassword("");
                                setShowOldPassword(false);
                                setOldPasswordVerified(false);
                                setNewPassword("");
                                setConfirmNewPassword("");
                                setShowNewPassword(false);
                                setShowConfirmNewPassword(false);
                                setPasswordChangeSuccess(true);
                              } catch (error: any) {
                                const msg = error.message || "Failed to update password.";
                                toast({
                                  title: "Error",
                                  description: msg.includes("same_password")
                                    ? "New password must be different from your current password."
                                    : msg,
                                  variant: "destructive",
                                });
                              } finally {
                                setIsChangingPassword(false);
                              }
                            }}
                            disabled={isChangingPassword || !newPassword || !confirmNewPassword || newPassword !== confirmNewPassword || newPassword.length < 8}
                            className="bg-gradient-primary text-white shadow-sm hover:shadow-md transition-all"
                          >
                            {isChangingPassword ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Updating...
                              </>
                            ) : (
                              <>
                                <Lock className="h-4 w-4 mr-2" />
                                Update Password
                              </>
                            )}
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setOldPassword("");
                              setShowOldPassword(false);
                              setOldPasswordVerified(false);
                              setNewPassword("");
                              setConfirmNewPassword("");
                              setShowNewPassword(false);
                              setShowConfirmNewPassword(false);
                            }}
                            className="text-muted-foreground"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Account Deactivation */}
                <Card className="border-slate-200 shadow-sm">
                  <CardHeader className="border-b border-slate-100 pb-4">
                    <CardTitle className="text-xl font-semibold flex items-center gap-2">
                      <Power className="h-5 w-5 text-blue-600" />
                      Account Deactivation
                    </CardTitle>
                    <CardDescription className="text-sm mt-1">
                      {profile?.is_deactivated
                        ? "Reactivate your account to restore access"
                        : "Temporarily deactivate your account"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-6">
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <Power className="h-5 w-5 text-warning" />
                        <div className="flex-1">
                          <Label className="text-base font-bold">
                            Account Status
                          </Label>
                          <p className="text-sm text-muted-foreground mt-1">
                            {profile?.is_deactivated
                              ? "Your account is currently deactivated"
                              : "Deactivate your account temporarily"}
                          </p>
                        </div>
                        {profile?.is_deactivated ? (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" className="border-success text-success hover:bg-success/10">
                                Reactivate Account
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Reactivate Account</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to reactivate your account? You will regain full access to all features.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={async () => {
                                    setIsDeactivating(true);
                                    const success = await reactivateAccount();
                                    setIsDeactivating(false);
                                    if (success) {
                                      window.location.reload();
                                    }
                                  }}
                                  disabled={isDeactivating}
                                  className="bg-success hover:bg-success/90"
                                >
                                  {isDeactivating ? (
                                    <>
                                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                      Reactivating...
                                    </>
                                  ) : (
                                    "Reactivate"
                                  )}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        ) : (
                          <>
                            <Button 
                              variant="outline" 
                              className="border-warning text-warning hover:bg-warning/10"
                              onClick={() => setIsDeactivateModalOpen(true)}
                            >
                              Deactivate Account
                            </Button>
                            <DeactivateAccountModal
                              open={isDeactivateModalOpen}
                              onOpenChange={setIsDeactivateModalOpen}
                              onSuccess={async () => {
                                await signOut();
                                navigate("/signin");
                              }}
                              requestDeactivation={requestDeactivation}
                              verifyDeactivationCode={verifyDeactivationCode}
                              userEmail={user?.email}
                            />
                          </>
                        )}
                      </div>
                      {profile?.is_deactivated && (
                        <div className="p-4 rounded-lg bg-warning/10 border border-warning/20">
                          <p className="text-sm text-warning-foreground">
                            <strong>Note:</strong> Your account is currently deactivated. Some features may be limited.
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Billing Tab */}
              <TabsContent value="billing" className="space-y-6">
                {/* Credit Costs */}
                <Card className="relative overflow-hidden bg-gradient-card border-border/50 shadow-lg">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-full blur-3xl" />
                  <CardHeader className="relative z-10 border-b border-border/50 pb-5">
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-xl bg-primary/10 shadow-sm">
                        <Zap className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-2xl font-extrabold tracking-tight">
                          Credit Costs
                        </CardTitle>
                        <CardDescription className="text-sm font-medium mt-1.5">
                          See how credits are charged for each action
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="font-semibold">Action</TableHead>
                          <TableHead className="font-semibold">Description</TableHead>
                          <TableHead className="font-semibold text-right">Credit Cost</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {CREDIT_COSTS.map((cost, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">{cost.action}</TableCell>
                            <TableCell className="text-muted-foreground">{cost.description}</TableCell>
                            <TableCell className="text-right font-semibold">
                              {cost.creditCost} {cost.creditCost === 1 ? "credit" : "credits"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {/* Monthly Plans */}
                <Card className="relative overflow-hidden bg-gradient-card border-border/50 shadow-lg">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-full blur-3xl" />
                  <CardHeader className="relative z-10 border-b border-border/50 pb-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="p-3 rounded-xl bg-primary/10 shadow-sm">
                          <CreditCard className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-2xl font-extrabold tracking-tight">
                            Monthly Subscription Plans
                          </CardTitle>
                          <CardDescription className="text-sm font-medium mt-1.5">
                            Choose a plan that fits your needs. Credits reset monthly.
                          </CardDescription>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                      {MONTHLY_PLANS.map((plan) => (
                        <Card
                          key={plan.id}
                          className={`relative overflow-hidden transition-all hover:shadow-lg ${
                            plan.popular ? "ring-2 ring-primary shadow-lg" : ""
                          }`}
                        >
                          {plan.popular && (
                            <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-bl-lg z-10">
                              POPULAR
                            </div>
                          )}
                          <CardHeader className="pb-3">
                            <CardTitle className="text-xl">{plan.name}</CardTitle>
                            <CardDescription className="text-sm">{plan.description}</CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <div>
                              <div className="flex items-baseline gap-2">
                                <span className="text-3xl font-bold">
                                  {plan.price === 0 ? "Custom" : formatCurrency(plan.price, plan.currency)}
                                </span>
                                {plan.price > 0 && (
                                  <span className="text-muted-foreground text-sm">/month</span>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground mt-1">
                                {plan.credits.toLocaleString()} credits/month
                              </p>
                            </div>
                            
                            {plan.features && plan.features.length > 0 && (
                              <ul className="space-y-2">
                                {plan.features.map((feature, idx) => (
                                  <li key={idx} className="flex items-start gap-2 text-sm">
                                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                                    <span className="text-muted-foreground">{feature}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                            
                            <Link to="/billing">
                              <Button
                                className="w-full"
                                variant={plan.popular ? "default" : "outline"}
                              >
                                {plan.price === 0 ? "Contact Sales" : "View Details"}
                              </Button>
                            </Link>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Current Usage Summary */}
                <Card className="bg-gradient-card border-border/50 shadow-md">
                  <CardHeader className="border-b border-border/50 pb-4">
                    <CardTitle className="flex items-center gap-3 text-xl font-bold">
                      <TrendingUp className="h-5 w-5 text-primary" />
                      Current Usage
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-5">
                    {/* Free Trial Alert */}
                    {isOnFreeTrial(profile?.trial_credits_expires_at, profile?.payment_status) && (
                      <Alert className={isTrialExpired(profile?.trial_credits_expires_at) 
                        ? "border-destructive bg-destructive/10" 
                        : "border-primary bg-primary/10"
                      }>
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle className="font-semibold">
                          {isTrialExpired(profile?.trial_credits_expires_at) 
                            ? "Free Trial Expired" 
                            : "Free Trial Active"}
                        </AlertTitle>
                        <AlertDescription className="mt-2">
                          {isTrialExpired(profile?.trial_credits_expires_at) ? (
                            <p>Your free trial credits have expired. Upgrade to continue using the service.</p>
                          ) : (
                            <div className="space-y-1">
                              <p>
                                You're on a free trial with {TRIAL_CREDITS_AMOUNT} credits.
                                {getTrialDaysRemaining(profile?.trial_credits_expires_at) !== null && (
                                  <span className="font-semibold">
                                    {" "}{getTrialDaysRemaining(profile?.trial_credits_expires_at)} day{getTrialDaysRemaining(profile?.trial_credits_expires_at) !== 1 ? 's' : ''} remaining.
                                  </span>
                                )}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                Expires: {formatTrialExpiration(profile?.trial_credits_expires_at)}
                              </p>
                            </div>
                          )}
                        </AlertDescription>
                      </Alert>
                    )}

                    <div>
                      <Label className="text-xs text-muted-foreground font-medium mb-2 block">
                        Remaining Credits
                      </Label>
                      <p className="font-semibold text-2xl text-primary">
                        {profile?.Remaning_credits 
                          ? parseFloat(String(profile.Remaning_credits)).toFixed(2)
                          : "0.00"} credits
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground font-medium mb-2 block">
                        Total Credits Used
                      </Label>
                      <p className="font-semibold text-base">
                        {profile?.Total_credit 
                          ? parseFloat(String(profile.Total_credit)).toFixed(2)
                          : "0.00"} credits
                      </p>
                    </div>
                    <div>
                      <Link to="/billing">
                        <Button className="w-full" variant="default">
                          Manage Billing & Credits
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* General Tab */}
              <TabsContent value="general" className="space-y-6">
                {/* Timezone Settings */}
                <Card className="border-slate-200 shadow-sm">
                  <CardHeader className="border-b border-slate-100 pb-4">
                    <CardTitle className="text-xl font-semibold flex items-center gap-2">
                      <Globe className="h-5 w-5 text-blue-600" />
                      Timezone Configuration
                    </CardTitle>
                    <CardDescription className="text-sm mt-1">
                      Configure your timezone for accurate call scheduling
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-6">
                    <div className="space-y-4">
                      <Label
                        htmlFor="timezone"
                        className="flex items-center gap-2 text-base font-bold"
                      >
                        <Globe className="h-5 w-5 text-primary" />
                        Your Timezone{" "}
                        <span className="text-destructive">*</span>
                      </Label>
                      <TimezoneSelector
                        value={timezone || profile?.timezone || "UTC"}
                        onValueChange={setTimezone}
                        disabled={isSaving}
                      />
                      <div className="p-5 rounded-xl bg-primary/5 border border-primary/20">
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          <strong className="text-foreground font-semibold">
                            Important:
                          </strong>{" "}
                          All scheduled calls will use this timezone. Make sure
                          to select your correct location to ensure calls are
                          made at the right time.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-5 border-t border-border/50">
                      <div className="text-sm text-muted-foreground">
                        {timezone &&
                          timezone !== (profile?.timezone || "UTC") && (
                            <span className="text-warning font-semibold">
                              ● Unsaved changes
                            </span>
                          )}
                      </div>
                      <Button
                        onClick={handleSave}
                        disabled={
                          isSaving ||
                          !timezone ||
                          timezone === (profile?.timezone || "UTC")
                        }
                        variant="call"
                        size="lg"
                        className="gap-2"
                      >
                        {isSaving ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Saving Changes...
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4" />
                            Save Changes
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Account Info Card */}
                <Card className="bg-gradient-card border-border/50 shadow-md">
                  <CardHeader className="border-b border-border/50 pb-4">
                    <CardTitle className="flex items-center gap-3 text-xl font-bold">
                      <User className="h-5 w-5 text-primary" />
                      Account Info
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-5">
                    <div>
                      <Label className="text-xs text-muted-foreground font-medium mb-2 block">
                        Email
                      </Label>
                      <p className="font-semibold text-base break-all">
                        {user?.email}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground font-medium mb-2 block">
                        Account Status
                      </Label>
                      <div className="flex items-center gap-2">
                        {profile?.is_deactivated ? (
                          <>
                            <AlertTriangle className="h-5 w-5 text-warning" />
                            <p className="font-semibold text-base text-warning">
                              Deactivated
                            </p>
                          </>
                        ) : (
                          <>
                            <CheckCircle className="h-5 w-5 text-success" />
                            <p className="font-semibold text-base text-success">
                              Active
                            </p>
                          </>
                        )}
                      </div>
                      {profile?.deactivated_at && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Deactivated on{" "}
                          {new Date(profile.deactivated_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Onboarding Tour Card */}
                <Card className="border-slate-200 shadow-sm">
                  <CardHeader className="border-b border-slate-100 pb-4">
                    <CardTitle className="text-xl font-semibold flex items-center gap-2">
                      <Map className="h-5 w-5 text-blue-600" />
                      Onboarding Tour
                    </CardTitle>
                    <CardDescription className="text-sm mt-1">
                      Restart the interactive tour to learn about all features
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-4">
                    <div className="space-y-2">
                      <p className="text-sm text-slate-600">
                        The onboarding tour will guide you through the main features of the platform, including:
                      </p>
                      <ul className="text-sm text-slate-600 space-y-1 list-disc list-inside ml-2">
                        <li>Dashboard overview and key metrics</li>
                        <li>How to create and manage agents</li>
                        <li>Importing and linking phone numbers</li>
                        <li>Viewing call history and statistics</li>
                        <li>Managing credits and billing</li>
                      </ul>
                    </div>
                    <div className="pt-4 border-t border-slate-100">
                      <Button
                        onClick={async () => {
                          if (!profile) return;
                          
                          try {
                            // Clear localStorage
                            localStorage.removeItem("onboarding_tour_step");
                            localStorage.setItem("onboarding_tour_active", "true");
                            
                            const { error } = await supabase
                              .from("profiles")
                              .update({ tour_completed: false } as any)
                              .eq("user_id", profile.user_id);

                            if (error) throw error;
                            
                            await refetch();
                            
                            toast({
                              title: "Tour Restarted",
                              description: "The onboarding tour will start when you navigate to the dashboard.",
                            });
                            
                            // Navigate to dashboard to start the tour
                            navigate("/dashboard");
                          } catch (error: any) {
                            toast({
                              title: "Error",
                              description: error?.message || "Failed to restart tour",
                              variant: "destructive",
                            });
                          }
                        }}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        <Map className="h-4 w-4 mr-2" />
                        Restart Tour
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* 2FA Setup Dialog */}
        <Dialog open={show2FASetup} onOpenChange={setShow2FASetup}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Set Up Two-Factor Authentication</DialogTitle>
              <DialogDescription>
                Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {twoFactorQRCode && (
                <div className="flex justify-center p-4 bg-white rounded-lg">
                  <img src={twoFactorQRCode} alt="2FA QR Code" className="w-64 h-64" />
                </div>
              )}
              {twoFactorManualKey && (
                <div className="space-y-2">
                  <Label>Or enter this key manually:</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={twoFactorManualKey}
                      readOnly
                      className="font-mono text-sm"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        navigator.clipboard.writeText(twoFactorManualKey.replace(/\s/g, ""));
                        toast({
                          title: "Copied",
                          description: "Manual key copied to clipboard",
                        });
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label>Enter verification code from your app:</Label>
                <InputOTP
                  maxLength={6}
                  value={twoFactorVerificationCode}
                  onChange={(value) => setTwoFactorVerificationCode(value)}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShow2FASetup(false);
                    setTwoFactorVerificationCode("");
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleVerify2FA}
                  disabled={isVerifying2FA || twoFactorVerificationCode.length !== 6}
                  className="flex-1"
                >
                  {isVerifying2FA ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    "Verify & Enable"
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Backup Codes Dialog */}
        <Dialog open={showBackupCodes} onOpenChange={setShowBackupCodes}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Backup Codes</DialogTitle>
              <DialogDescription>
                Save these backup codes in a safe place. You can use them to access your account if you lose your authenticator device.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-muted space-y-2">
                {backupCodes.map((code, index) => (
                  <div key={index} className="flex items-center justify-between p-2 rounded bg-background">
                    <code className="font-mono text-sm">{code}</code>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => copyBackupCode(code)}
                      className="h-8 w-8"
                    >
                      {copiedCode === code ? (
                        <Check className="h-4 w-4 text-success" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                onClick={() => {
                  setShowBackupCodes(false);
                  setShow2FASetup(false);
                  setTwoFactorVerificationCode("");
                }}
                className="w-full"
              >
                I've Saved These Codes
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
