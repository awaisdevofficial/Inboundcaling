import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { sendVerificationEmail } from '../services/emailService.js';
import crypto from 'crypto';

dotenv.config();

const router = express.Router();

// Initialize Supabase admin client (service role key for admin operations)
const supabaseAdmin = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

// Initialize Supabase client for user operations
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

if (!supabaseAdmin) {
  console.warn('Warning: Supabase admin credentials not configured. Auth features may not work.');
}

/**
 * POST /api/auth/signup
 * Create a new user account
 * 
 * Request body:
 * {
 *   "email": "user@example.com",
 *   "password": "password123",
 *   "fullName": "John Doe",
 *   "timezone": "America/New_York",
 *   "phoneNumber": "+1234567890" (optional)
 * }
 */
router.post('/signup', async (req, res) => {
  try {
    const { email, password, fullName, timezone, phoneNumber } = req.body;

    // Validate required fields
    if (!email || !password || !fullName || !timezone) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: email, password, fullName, and timezone are required',
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format',
      });
    }

    // Validate password strength
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters',
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        success: false,
        error: 'Authentication service is not configured',
      });
    }

    // Create user with Supabase Auth
    // Note: email_confirm: false means user must verify email before signing in
    // Supabase should automatically send verification email, but we'll also explicitly send it
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: false, // Require email confirmation
      user_metadata: {
        full_name: fullName,
      },
      email_redirect_to: undefined, // We're using OTP, not magic links
    });

    if (authError) {
      // Handle specific errors
      if (authError.message?.includes('already registered') || authError.message?.includes('already exists')) {
        return res.status(409).json({
          success: false,
          error: 'An account with this email already exists',
        });
      }

      if (authError.message?.includes('rate limit') || authError.message?.includes('over_email_send_rate_limit')) {
        return res.status(429).json({
          success: false,
          error: 'Email rate limit exceeded. Please wait a few minutes before trying again.',
        });
      }

      return res.status(400).json({
        success: false,
        error: authError.message || 'Failed to create account',
      });
    }

    if (!authData?.user) {
      return res.status(500).json({
        success: false,
        error: 'User creation failed - no user data returned',
      });
    }

    const userId = authData.user.id;
    const userEmail = authData.user.email || email;

    // Calculate trial expiration date (1 week from now)
    const trialExpirationDate = new Date();
    trialExpirationDate.setDate(trialExpirationDate.getDate() + 7);

    // Create or update profile
    const profileData = {
      user_id: userId,
      email: userEmail,
      full_name: fullName,
      timezone: timezone,
      retell_api_key: process.env.RETELL_API_KEY || null,
      total_minutes_used: 0,
      Total_credit: 0,
      Remaning_credits: 100, // 100 free trial credits
      is_deactivated: false,
      payment_status: 'unpaid',
      trial_credits_expires_at: trialExpirationDate.toISOString(),
      updated_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
    };

    // Add phone number if provided
    if (phoneNumber) {
      profileData.phone_number = phoneNumber;
    }

    // Upsert profile (trigger may have already created it, so use upsert)
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert(profileData, {
        onConflict: 'user_id',
        ignoreDuplicates: false,
      });

    // Log profile errors but don't block signup (profile can be updated later)
    if (profileError && 
        !profileError.message?.includes('duplicate') && 
        !profileError.message?.includes('already exists')) {
      console.warn('Profile creation warning:', profileError);
    }

    // Generate 6-digit OTP code
    const otpCode = crypto.randomInt(100000, 999999).toString();
    const otpExpiresAt = new Date();
    otpExpiresAt.setMinutes(otpExpiresAt.getMinutes() + 10); // OTP expires in 10 minutes

    // Store OTP in database (using dedicated email_verification_code field)
    try {
      await supabaseAdmin
        .from('profiles')
        .update({
          email_verification_code: otpCode,
          email_verification_sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);
    } catch (otpError) {
      console.warn('Failed to store OTP in database:', otpError);
      // Continue anyway - we'll try to send email
    }

    // Send verification email via SMTP
    let emailSent = false;
    let emailError = null;

    try {
      await sendVerificationEmail(email, otpCode, fullName);
      emailSent = true;
      console.log('✓ Verification email sent via SMTP to:', email);
    } catch (smtpError) {
      emailError = smtpError;
      console.error('Failed to send verification email via SMTP:', smtpError);
      
      // Fallback: Try Supabase email if SMTP fails
      try {
        const { error: supabaseError } = await supabaseAdmin.auth.resend({
          type: 'signup',
          email: email,
        });
        if (!supabaseError) {
          emailSent = true;
          console.log('✓ Verification email sent via Supabase (fallback) to:', email);
        } else {
          console.error('Supabase fallback also failed:', supabaseError);
        }
      } catch (fallbackError) {
        console.error('Fallback email sending failed:', fallbackError);
      }
    }

    // If email failed to send, log it but don't fail signup
    // User can use the resend endpoint later
    if (!emailSent) {
      console.warn('⚠ Verification email was not sent during signup. User can request resend.');
    }

    // Update profile with last resend time (for rate limiting)
    try {
      await supabaseAdmin
        .from('profiles')
        .update({
          phone_verification_sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);
    } catch (updateError) {
      console.warn('Failed to update profile with verification sent time:', updateError);
    }

    res.json({
      success: true,
      message: 'Account created successfully. Please check your email for verification.',
      user: {
        id: authData.user.id,
        email: authData.user.email,
        email_confirmed: authData.user.email_confirmed_at !== null,
      },
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'An unexpected error occurred during signup',
    });
  }
});

/**
 * POST /api/auth/signin
 * Sign in an existing user
 * 
 * Request body:
 * {
 *   "email": "user@example.com",
 *   "password": "password123"
 * }
 */
router.post('/signin', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required',
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        success: false,
        error: 'Authentication service is not configured',
      });
    }

    // Sign in user
    const { data: authData, error: authError } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      // Handle specific errors
      if (authError.message?.includes('Invalid login credentials') || 
          authError.message?.includes('Invalid email or password')) {
        return res.status(401).json({
          success: false,
          error: 'Invalid email or password',
        });
      }

      if (authError.message?.includes('Email not confirmed')) {
        return res.status(403).json({
          success: false,
          error: 'Please verify your email before signing in',
        });
      }

      return res.status(400).json({
        success: false,
        error: authError.message || 'Failed to sign in',
      });
    }

    if (!authData?.user || !authData?.session) {
      return res.status(500).json({
        success: false,
        error: 'Sign in failed - no user or session data returned',
      });
    }

    // Check if account is deactivated
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('is_deactivated')
      .eq('user_id', authData.user.id)
      .maybeSingle();

    if (!profileError && profile?.is_deactivated) {
      // Sign out immediately if account is deactivated
      await supabaseAdmin.auth.signOut();
      return res.status(403).json({
        success: false,
        error: 'Your account has been deactivated. Please contact support to reactivate your account.',
      });
    }

    res.json({
      success: true,
      message: 'Signed in successfully',
      user: {
        id: authData.user.id,
        email: authData.user.email,
        email_confirmed: authData.user.email_confirmed_at !== null,
      },
      session: {
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token,
        expires_at: authData.session.expires_at,
        expires_in: authData.session.expires_in,
      },
    });

  } catch (error) {
    console.error('Signin error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'An unexpected error occurred during sign in',
    });
  }
});

/**
 * POST /api/auth/verify-email
 * Verify email with OTP code
 * 
 * Request body:
 * {
 *   "email": "user@example.com",
 *   "token": "123456"
 * }
 */
router.post('/verify-email', async (req, res) => {
  try {
    const { email, token } = req.body;

    // Validate required fields
    if (!email || !token) {
      return res.status(400).json({
        success: false,
        error: 'Email and verification token are required',
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format',
      });
    }

    // Validate token format (should be 6 digits)
    if (!/^\d{6}$/.test(token)) {
      return res.status(400).json({
        success: false,
        error: 'Verification code must be 6 digits',
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        success: false,
        error: 'Authentication service is not configured',
      });
    }

    // Find user by email
    let user = null;
    try {
      const { data: userList } = await supabaseAdmin.auth.admin.listUsers();
      user = userList?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
    } catch (listError) {
      console.error('Error finding user:', listError);
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'No account found with this email address.',
      });
    }

    // Verify OTP from database (stored in email_verification_code field)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('email_verification_code, email_verification_sent_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error('Error fetching profile for OTP verification:', profileError);
    }

    const storedOtp = profile?.email_verification_code;
    const otpSentAt = profile?.email_verification_sent_at;

    // Check if OTP exists and is valid
    let verificationData = null; // Store verification result for session data
    
    if (!storedOtp) {
      // Fallback to Supabase OTP verification if database OTP not found
      console.log('No OTP found in database, trying Supabase verification...');
      const { data, error } = await supabaseAdmin.auth.verifyOtp({
        email,
        token,
        type: 'signup',
      });

      if (error) {
        const errorMessage = error.message || String(error) || 'Failed to verify email';
        if (errorMessage.includes('invalid') || errorMessage.includes('expired')) {
          return res.status(400).json({
            success: false,
            error: 'Invalid or expired verification code. Please request a new one.',
          });
        }
        return res.status(400).json({
          success: false,
          error: errorMessage,
        });
      }

      if (!data?.user) {
        return res.status(500).json({
          success: false,
          error: 'Verification failed - no user data returned',
        });
      }

      // Use Supabase verification result
      user = data.user;
      verificationData = data; // Store for session data
    } else {
      // Verify OTP from database
      if (storedOtp !== token) {
        return res.status(400).json({
          success: false,
          error: 'Invalid verification code. Please check and try again.',
        });
      }

      // Check if OTP is expired (10 minutes)
      if (otpSentAt) {
        const sentTime = new Date(otpSentAt);
        const now = new Date();
        const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

        if (sentTime < tenMinutesAgo) {
          return res.status(400).json({
            success: false,
            error: 'Verification code has expired. Please request a new one.',
          });
        }
      }

      // OTP is valid - confirm email in Supabase
      try {
        const { error: confirmError } = await supabaseAdmin.auth.admin.updateUserById(
          user.id,
          { email_confirm: true }
        );

        if (confirmError) {
          console.error('Failed to confirm email in Supabase:', confirmError);
          // Continue anyway - OTP was verified
        }
      } catch (confirmException) {
        console.error('Exception confirming email:', confirmException);
      }

      // Clear OTP from database after successful verification
      await supabaseAdmin
        .from('profiles')
        .update({
          email_verification_code: null,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);
    }

    // Use user.id (user is defined in both code paths)
    const userId = user.id;
    const now = new Date();

    // Get fresh user data and session
    let verifiedUser = user;
    let sessionData = verificationData?.session || null;

    // Get fresh user data to ensure email_confirmed_at is up to date
    try {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(user.id);
      if (userData?.user) {
        verifiedUser = userData.user;
      }
    } catch (userDataError) {
      console.warn('Failed to get fresh user data:', userDataError);
    }

    // Update profile to mark email as verified
    try {
      await supabaseAdmin
        .from('profiles')
        .update({
          updated_at: now.toISOString(),
          last_activity_at: now.toISOString(),
        })
        .eq('user_id', userId);
    } catch (profileError) {
      console.warn('Failed to update profile after verification:', profileError);
      // Don't fail verification if profile update fails
    }

    // Log successful verification
    try {
      await supabaseAdmin
        .from('activity_logs')
        .insert({
          user_id: userId,
          activity_type: 'account_login',
          description: 'Email verified successfully',
          metadata: {
            email: email,
            verified_at: now.toISOString(),
          },
          created_at: now.toISOString(),
        });
    } catch (logError) {
      console.warn('Failed to log verification activity:', logError);
      // Don't fail if logging fails
    }

    res.json({
      success: true,
      message: 'Email verified successfully',
      user: {
        id: verifiedUser.id,
        email: verifiedUser.email,
        email_confirmed: verifiedUser.email_confirmed_at !== null,
      },
      session: sessionData ? {
        access_token: sessionData.access_token,
        refresh_token: sessionData.refresh_token,
        expires_at: sessionData.expires_at,
        expires_in: sessionData.expires_in,
      } : null,
    });

  } catch (error) {
    console.error('Email verification error:', error);
    const errorMessage = error?.message || String(error) || 'An unexpected error occurred during email verification';
    res.status(500).json({
      success: false,
      error: errorMessage,
    });
  }
});

/**
 * POST /api/auth/resend-verification
 * Resend verification email with rate limiting
 * 
 * Request body:
 * {
 *   "email": "user@example.com"
 * }
 */
router.post('/resend-verification', async (req, res) => {
  try {
    // Log request for debugging
    console.log('Resend verification request:', {
      body: req.body,
      headers: req.headers['content-type'],
    });

    const { email } = req.body;

    // Validate email
    if (!email) {
      console.error('Resend verification: Email is missing from request body');
      return res.status(400).json({
        success: false,
        error: 'Email is required',
        details: 'Please provide an email address in the request body',
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.error('Resend verification: Invalid email format:', email);
      return res.status(400).json({
        success: false,
        error: 'Invalid email format',
        details: 'Please provide a valid email address',
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        success: false,
        error: 'Authentication service is not configured',
      });
    }

    // Check if user exists - try to get user by email from profiles table first (faster)
    let user = null;
    let userConfirmed = false;

    try {
      // First, try to find user via profiles table (faster)
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('user_id, email')
        .eq('email', email.toLowerCase())
        .maybeSingle();

      if (profile && profile.user_id) {
        // User exists, now get auth user details
        const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.getUserById(profile.user_id);
        
        if (authUser?.user) {
          user = authUser.user;
          userConfirmed = !!authUser.user.email_confirmed_at;
        } else if (authError) {
          console.warn('Could not get auth user by ID:', authError);
        }
      }
    } catch (profileException) {
      console.warn('Error checking profile:', profileException);
    }

    // Fallback: if we couldn't find via profile, try listUsers (slower)
    if (!user) {
      try {
        const { data: userData, error: userError } = await supabaseAdmin.auth.admin.listUsers();
        
        if (userError) {
          console.error('Error listing users:', userError);
        } else {
          user = userData?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
          if (user) {
            userConfirmed = !!user.email_confirmed_at;
          }
        }
      } catch (listException) {
        console.error('Exception while listing users:', listException);
      }
    }

    if (!user) {
      console.error('Resend verification: User not found for email:', email);
      return res.status(404).json({
        success: false,
        error: 'No account found with this email address. Please sign up first.',
        details: `No user exists with email: ${email}`,
      });
    }

    // Check if email is already verified
    if (userConfirmed || user.email_confirmed_at) {
      console.log('Resend verification: Email already verified for:', email);
      return res.status(400).json({
        success: false,
        error: 'This email is already verified. You can sign in directly.',
        details: 'Your email was verified on ' + (user.email_confirmed_at ? new Date(user.email_confirmed_at).toISOString() : 'unknown date'),
      });
    }

    // Rate limiting: Check last resend time from database
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('phone_verification_sent_at, updated_at')
      .eq('user_id', user.id)
      .maybeSingle();

    // Use phone_verification_sent_at as a temporary field to track last resend
    // Or check updated_at if phone_verification_sent_at doesn't exist
    const lastResendTime = profile?.phone_verification_sent_at || profile?.updated_at;
    const currentTime = new Date();
    const oneMinuteAgo = new Date(currentTime.getTime() - 60000); // 60 seconds ago

    if (lastResendTime && new Date(lastResendTime) > oneMinuteAgo) {
      const secondsLeft = Math.ceil((new Date(lastResendTime).getTime() + 60000 - currentTime.getTime()) / 1000);
      return res.status(429).json({
        success: false,
        error: `Please wait ${secondsLeft} seconds before requesting another verification code.`,
        retryAfter: secondsLeft,
      });
    }

    // Generate new 6-digit OTP code
    const otpCode = crypto.randomInt(100000, 999999).toString();
    const now = currentTime;

    // Get user's full name from profile
    const { data: userProfile } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('user_id', user.id)
      .maybeSingle();

    const fullName = userProfile?.full_name || '';

    // Store OTP in database (using dedicated email_verification_code field)
    await supabaseAdmin
      .from('profiles')
      .update({
        email_verification_code: otpCode,
        email_verification_sent_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('user_id', user.id);

    // Check if SMTP is configured
    const smtpConfigured = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
    
    // Send verification email via SMTP
    console.log('Attempting to resend verification email via SMTP to:', email);
    let emailSent = false;
    let emailError = null;

    if (!smtpConfigured) {
      console.warn('SMTP not configured. Skipping SMTP and trying Supabase fallback...');
      emailError = new Error('SMTP not configured');
      emailError.code = 'SMTP_NOT_CONFIGURED';
    } else {
      try {
        await sendVerificationEmail(email, otpCode, fullName);
        emailSent = true;
        console.log('✓ Verification email resent successfully via SMTP to:', email);
      } catch (smtpError) {
        emailError = smtpError;
        console.error('Failed to send verification email via SMTP:', {
          message: smtpError.message,
          code: smtpError.code,
          error: smtpError,
        });
      }
    }

    // Fallback: Try Supabase email if SMTP fails or not configured
    if (!emailSent) {
      console.log('Attempting Supabase fallback for verification email...');
      try {
        // Set a timeout for Supabase call to avoid hanging
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Supabase request timeout')), 10000)
        );
        
        const supabasePromise = supabaseAdmin.auth.resend({
          type: 'signup',
          email: email,
        });

        const { error: supabaseError } = await Promise.race([supabasePromise, timeoutPromise]);
        
        if (!supabaseError) {
          emailSent = true;
          console.log('✓ Verification email resent via Supabase (fallback) to:', email);
        } else {
          console.error('Supabase fallback also failed:', supabaseError);
        }
      } catch (fallbackError) {
        console.error('Fallback email sending failed:', {
          message: fallbackError.message,
          code: fallbackError.code,
          error: fallbackError,
        });
      }
    }

    if (!emailSent) {
      // Provide better error message
      let errorMessage = 'Failed to send verification email.';
      
      if (emailError) {
        if (emailError.message && emailError.message !== '{}') {
          errorMessage = emailError.message;
        } else if (emailError.code === 'EAUTH') {
          errorMessage = 'SMTP authentication failed. Please check your SMTP credentials.';
        } else if (emailError.code === 'ECONNECTION') {
          errorMessage = 'SMTP connection failed. Please check your SMTP settings.';
        } else if (emailError.message) {
          errorMessage = emailError.message;
        }
      }
      
      console.error('Failed to send verification email (both SMTP and Supabase failed):', {
        smtpError: emailError,
        email: email,
      });
      
      return res.status(500).json({
        success: false,
        error: errorMessage || 'Failed to send verification email. Please check your SMTP configuration or try again later.',
        details: emailError ? {
          code: emailError.code,
          message: emailError.message,
          smtpConfigured: !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD),
        } : undefined,
      });
    }

    // Update profile with last resend time
    await supabaseAdmin
      .from('profiles')
      .update({
        phone_verification_sent_at: now.toISOString(), // Reusing this field temporarily
        updated_at: now.toISOString(),
      })
      .eq('user_id', user.id);

    // Log activity
    try {
      await supabaseAdmin
        .from('activity_logs')
        .insert({
          user_id: user.id,
          activity_type: 'account_login', // Using existing type
          description: 'Verification email resent',
          metadata: {
            email: email,
            timestamp: now.toISOString(),
          },
          created_at: now.toISOString(),
        });
    } catch (logError) {
      // Don't fail if logging fails
      console.warn('Failed to log resend activity:', logError);
    }

    res.json({
      success: true,
      message: 'Verification email sent successfully. Please check your inbox.',
      data: {
        email: email,
        sentAt: now.toISOString(),
      },
    });

  } catch (error) {
    console.error('Resend verification error:', error);
    const errorMessage = error?.message || String(error) || 'An unexpected error occurred';
    res.status(500).json({
      success: false,
      error: errorMessage,
    });
  }
});

/**
 * POST /api/auth/refresh-token
 * Refresh access token using refresh token
 * 
 * Request body:
 * {
 *   "refresh_token": "refresh_token_here"
 * }
 */
router.post('/refresh-token', async (req, res) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({
        success: false,
        error: 'Refresh token is required',
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        success: false,
        error: 'Authentication service is not configured',
      });
    }

    // Refresh session
    const { data, error } = await supabaseAdmin.auth.refreshSession({
      refresh_token,
    });

    if (error) {
      return res.status(401).json({
        success: false,
        error: error.message || 'Failed to refresh session',
      });
    }

    if (!data?.session) {
      return res.status(500).json({
        success: false,
        error: 'Session refresh failed - no session data returned',
      });
    }

    res.json({
      success: true,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
        expires_in: data.session.expires_in,
      },
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'An unexpected error occurred',
    });
  }
});

/**
 * POST /api/auth/signout
 * Sign out the current user
 * 
 * Headers:
 *   Authorization: Bearer <access_token>
 */
router.post('/signout', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const accessToken = authHeader?.replace('Bearer ', '');

    if (!accessToken) {
      return res.status(401).json({
        success: false,
        error: 'Access token is required',
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        success: false,
        error: 'Authentication service is not configured',
      });
    }

    // Sign out user
    const { error } = await supabaseAdmin.auth.signOut(accessToken);

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.message || 'Failed to sign out',
      });
    }

    res.json({
      success: true,
      message: 'Signed out successfully',
    });

  } catch (error) {
    console.error('Signout error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'An unexpected error occurred',
    });
  }
});

/**
 * GET /api/auth/user
 * Get current user information
 * 
 * Headers:
 *   Authorization: Bearer <access_token>
 */
router.get('/user', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const accessToken = authHeader?.replace('Bearer ', '');

    if (!accessToken) {
      return res.status(401).json({
        success: false,
        error: 'Access token is required',
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        success: false,
        error: 'Authentication service is not configured',
      });
    }

    // Get user from token
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken);

    if (error || !user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
      });
    }

    // Get profile
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        email_confirmed: user.email_confirmed_at !== null,
        user_metadata: user.user_metadata,
      },
      profile: profile || null,
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'An unexpected error occurred',
    });
  }
});

/**
 * GET /api/auth/test-email
 * Test endpoint to check if email sending is working
 * (For debugging purposes - remove in production)
 */
router.get('/test-email/:email', async (req, res) => {
  try {
    const { email } = req.params;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email parameter is required',
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        success: false,
        error: 'Authentication service is not configured',
      });
    }

    // Try to resend verification email
    const { data, error } = await supabaseAdmin.auth.resend({
      type: 'signup',
      email: email,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.message || 'Failed to send test email',
        details: error,
      });
    }

    res.json({
      success: true,
      message: 'Test email sent successfully',
      email: email,
      data: data,
    });

  } catch (error) {
    console.error('Test email error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'An unexpected error occurred',
    });
  }
});

export default router;
