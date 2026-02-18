import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const router = express.Router();

// Initialize Supabase admin client
const supabaseAdmin = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

// Webhook secret for verifying Supabase webhooks
const WEBHOOK_SECRET = process.env.SUPABASE_WEBHOOK_SECRET || '';

/**
 * Verify webhook signature (if Supabase provides one)
 */
function verifyWebhookSignature(req, secret) {
  if (!secret) return true; // Skip verification if no secret configured

  const signature = req.headers['x-supabase-signature'] || req.headers['x-webhook-signature'];
  if (!signature) return false;

  // Simple verification - adjust based on Supabase's actual signature method
  const payload = JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * POST /api/webhooks/supabase/auth
 * Handle Supabase Auth webhook events
 * 
 * This endpoint receives events from Supabase when auth events occur
 * (user created, email verified, etc.)
 */
router.post('/supabase/auth', async (req, res) => {
  try {
    // Verify webhook signature if secret is configured
    if (WEBHOOK_SECRET && !verifyWebhookSignature(req, WEBHOOK_SECRET)) {
      console.warn('Invalid webhook signature');
      return res.status(401).json({
        success: false,
        error: 'Invalid webhook signature',
      });
    }

    const { type, record, old_record } = req.body;

    console.log('Received Supabase Auth webhook:', type);

    // Handle different event types
    switch (type) {
      case 'INSERT': // New user created
        if (record && record.id) {
          await handleUserCreated(record);
        }
        break;

      case 'UPDATE': // User updated (e.g., email verified)
        if (record && record.id) {
          await handleUserUpdated(record, old_record);
        }
        break;

      case 'DELETE': // User deleted
        if (record && record.id) {
          await handleUserDeleted(record);
        }
        break;

      default:
        console.log('Unhandled webhook event type:', type);
    }

    // Always return 200 to acknowledge receipt
    res.json({
      success: true,
      message: 'Webhook processed successfully',
    });

  } catch (error) {
    console.error('Webhook processing error:', error);
    // Still return 200 to prevent retries for non-retryable errors
    res.status(200).json({
      success: false,
      error: error.message || 'Webhook processing failed',
    });
  }
});

/**
 * Handle new user creation
 */
async function handleUserCreated(user) {
  try {
    console.log('Handling new user creation:', user.id);

    if (!supabaseAdmin) {
      console.warn('Supabase admin not configured, skipping user creation handler');
      return;
    }

    // The database trigger should have already created the profile
    // But we can verify and update it if needed
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileError && !profileError.message?.includes('not found')) {
      console.error('Error checking profile:', profileError);
    }

    // If profile doesn't exist, create it (fallback)
    if (!profile) {
      const trialExpirationDate = new Date();
      trialExpirationDate.setDate(trialExpirationDate.getDate() + 7);

      const profileData = {
        user_id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || user.raw_user_meta_data?.full_name || '',
        timezone: 'UTC',
        retell_api_key: process.env.RETELL_API_KEY || null,
        total_minutes_used: 0,
        Total_credit: 0,
        Remaning_credits: 0, // Credits will be given after tour completion
        is_deactivated: false,
        payment_status: 'unpaid',
        trial_credits_expires_at: trialExpirationDate.toISOString(),
      };

      const { error: insertError } = await supabaseAdmin
        .from('profiles')
        .insert(profileData);

      if (insertError) {
        console.error('Failed to create profile in webhook:', insertError);
      } else {
        console.log('Profile created successfully via webhook');
      }
    }
    // Credits will be deposited when user completes the onboarding tour

    // Log activity
    await logActivity(user.id, 'account_created', 'User account created', {
      email: user.email,
      created_at: user.created_at,
    });

  } catch (error) {
    console.error('Error handling user creation:', error);
  }
}

/**
 * Handle user update (e.g., email verification)
 */
async function handleUserUpdated(user, oldUser) {
  try {
    console.log('Handling user update:', user.id);

    if (!supabaseAdmin) {
      return;
    }

    // Check if email was just verified
    const wasEmailVerified = oldUser?.email_confirmed_at === null && user.email_confirmed_at !== null;

    if (wasEmailVerified) {
      console.log('Email verified for user:', user.id);
      const now = new Date().toISOString();

      // Update profile with verification status
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update({
          updated_at: now,
          last_activity_at: now,
          phone_verified: true, // Mark as verified (reusing field)
        })
        .eq('user_id', user.id);

      if (profileError) {
        console.error('Failed to update profile after email verification:', profileError);
      }

      // Log activity
      await logActivity(user.id, 'account_login', 'Email verified and account activated', {
        email: user.email,
        verified_at: user.email_confirmed_at,
        event: 'email_verified',
      });

      // Send welcome notification (optional)
      try {
        await supabaseAdmin
          .from('notifications')
          .insert({
            user_id: user.id,
            type: 'success',
            title: 'Email Verified',
            message: 'Your email has been verified successfully. Welcome to Inbound Genie!',
            metadata: {
              event: 'email_verified',
              verified_at: user.email_confirmed_at,
            },
            created_at: now,
          });
      } catch (notifError) {
        console.warn('Failed to create welcome notification:', notifError);
        // Don't fail if notification creation fails
      }
    }

  } catch (error) {
    console.error('Error handling user update:', error);
  }
}

/**
 * Handle user deletion
 */
async function handleUserDeleted(user) {
  try {
    console.log('Handling user deletion:', user.id);

    if (!supabaseAdmin) {
      return;
    }

    // Profile should be automatically deleted via CASCADE
    // But we can log the activity
    await logActivity(user.id, 'account_deactivated', 'User account deleted', {
      email: user.email,
      deleted_at: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Error handling user deletion:', error);
  }
}

/**
 * Log activity to activity_logs table
 */
async function logActivity(userId, activityType, description, metadata = {}) {
  try {
    if (!supabaseAdmin) return;

    await supabaseAdmin
      .from('activity_logs')
      .insert({
        user_id: userId,
        activity_type: activityType,
        description: description,
        metadata: metadata,
        created_at: new Date().toISOString(),
      });
  } catch (error) {
    console.error('Error logging activity:', error);
    // Don't throw - activity logging is not critical
  }
}

/**
 * POST /api/webhooks/retell
 * Handle Retell webhook events (call events)
 */
router.post('/retell', async (req, res) => {
  try {
    const event = req.body;
    const eventType = event.event || event.type;

    console.log('Received Retell webhook:', eventType);

    if (!supabaseAdmin) {
      return res.status(500).json({
        success: false,
        error: 'Supabase not configured',
      });
    }

    // Handle different Retell event types
    switch (eventType) {
      case 'call_started':
      case 'call.connected':
        await handleCallStarted(event);
        break;

      case 'call_ended':
      case 'call.ended':
        await handleCallEnded(event);
        break;

      case 'call_analysis':
        await handleCallAnalysis(event);
        break;

      default:
        console.log('Unhandled Retell event type:', eventType);
    }

    res.json({
      success: true,
      message: 'Webhook processed successfully',
    });

  } catch (error) {
    console.error('Retell webhook processing error:', error);
    res.status(200).json({
      success: false,
      error: error.message || 'Webhook processing failed',
    });
  }
});

/**
 * Handle call started event
 */
async function handleCallStarted(event) {
  try {
    // Extract call information from Retell webhook
    const callId = event.call_id || event.call?.id;
    const userId = event.user_id || event.metadata?.user_id;
    const phoneNumber = event.phone_number || event.call?.phone_number;

    if (!callId || !userId) {
      console.warn('Missing required fields in call started event');
      return;
    }

    // Update or create call record
    await supabaseAdmin
      .from('calls')
      .upsert({
        id: callId,
        user_id: userId,
        phone_number: phoneNumber,
        status: 'in_progress',
        started_at: new Date().toISOString(),
        metadata: event,
      }, {
        onConflict: 'id',
      });

    console.log('Call started event processed:', callId);

  } catch (error) {
    console.error('Error handling call started:', error);
  }
}

/**
 * Handle call ended event
 */
async function handleCallEnded(event) {
  try {
    const callId = event.call_id || event.call?.id;
    const duration = event.duration_seconds || event.call?.duration;
    const transcript = event.transcript || event.call?.transcript;
    const recordingUrl = event.recording_url || event.call?.recording_url;

    if (!callId) {
      console.warn('Missing call_id in call ended event');
      return;
    }

    // Update call record
    await supabaseAdmin
      .from('calls')
      .update({
        status: 'completed',
        duration_seconds: duration,
        transcript: transcript,
        recording_url: recordingUrl,
        completed_at: new Date().toISOString(),
        webhook_response: event,
        updated_at: new Date().toISOString(),
      })
      .eq('id', callId);

    console.log('Call ended event processed:', callId);

  } catch (error) {
    console.error('Error handling call ended:', error);
  }
}

/**
 * Handle call analysis event
 */
async function handleCallAnalysis(event) {
  try {
    const callId = event.call_id || event.call?.id;
    const analysis = event.analysis || event.data;

    if (!callId || !analysis) {
      console.warn('Missing required fields in call analysis event');
      return;
    }

    // Update call with analysis
    await supabaseAdmin
      .from('calls')
      .update({
        webhook_response: event,
        updated_at: new Date().toISOString(),
      })
      .eq('id', callId);

    // Create or update call_analytics record
    await supabaseAdmin
      .from('call_analytics')
      .upsert({
        call_id: callId,
        user_id: event.user_id,
        sentiment: analysis.sentiment,
        is_lead: analysis.is_lead,
        lead_quality_score: analysis.lead_quality_score,
        ai_analysis_data: analysis,
        created_at: new Date().toISOString(),
      }, {
        onConflict: 'call_id',
      });

    console.log('Call analysis event processed:', callId);

  } catch (error) {
    console.error('Error handling call analysis:', error);
  }
}

export default router;
