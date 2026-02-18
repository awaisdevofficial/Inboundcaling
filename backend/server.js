import express from 'express';
import nodemailer from 'nodemailer';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import OpenAI from 'openai';
import Retell from 'retell-sdk';
import { extractTextFromFile } from './services/documentExtractor.js';
import { analyzeCallTranscript } from './services/callAnalysis.js';
import { extractDocumentProfile, generatePromptFromProfile, formatRawPrompt } from './services/aiPromptService.js';
import { sendChatbotMessage } from './services/chatbotService.js';
import { generateEmailContent, generateEmailTemplate } from './services/emailService.js';
import { createClient } from '@supabase/supabase-js';
import authRoutes from './routes/auth.js';
import webhookRoutes from './routes/webhooks.js';

// Load environment variables from .env file
dotenv.config();

// Initialize OpenAI client for sidebar endpoints
const openaiApiKey = process.env.OPENAI_API_KEY?.trim();
if (!openaiApiKey) {
  console.warn('Warning: OPENAI_API_KEY is not configured. OpenAI features will not work.');
}
const openai = new OpenAI({
  apiKey: openaiApiKey,
});

// Initialize Supabase client (only if env vars are available)
let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
} else {
  console.warn('Warning: Supabase credentials not configured. Call analysis features will not work.');
}

// Initialize Retell client (only if API key is available)
let retellClient = null;
if (process.env.RETELL_API_KEY) {
  retellClient = new Retell({
    apiKey: process.env.RETELL_API_KEY,
  });
} else {
  console.warn('Warning: Retell API key not configured. Test call features will not work.');
}

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
// CORS configuration - allow multiple origins for development
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:8080',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:3000',
].filter(Boolean); // Remove undefined values

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/webhooks', webhookRoutes);

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

/**
 * POST /api/send-email
 * Send email using user-provided email credentials
 * 
 * Request body:
 * {
 *   "userEmail": "user@example.com",
 *   "appPassword": "app-password-here",
 *   "to": "recipient@example.com",
 *   "subject": "Email Subject",
 *   "text": "Plain text email body",
 *   "html": "<h1>HTML email body</h1>" // optional, if not provided, text will be used
 * }
 */
app.post('/api/send-email', async (req, res) => {
  try {
    const { userEmail, appPassword, to, subject, text, html } = req.body;

    // Validate required fields
    if (!userEmail || !appPassword || !to || !subject || (!text && !html)) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields. Please provide: userEmail, appPassword, to, subject, and either text or html'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userEmail) || !emailRegex.test(to)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    // Determine SMTP settings based on email domain
    const emailDomain = userEmail.split('@')[1].toLowerCase();
    let smtpConfig = {
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: userEmail,
        pass: appPassword
      }
    };

    // Configure SMTP for different email providers
    if (emailDomain.includes('gmail.com')) {
      smtpConfig = {
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
          user: userEmail,
          pass: appPassword
        }
      };
    } else if (emailDomain.includes('outlook.com') || emailDomain.includes('hotmail.com') || emailDomain.includes('live.com')) {
      smtpConfig = {
        host: 'smtp-mail.outlook.com',
        port: 587,
        secure: false,
        auth: {
          user: userEmail,
          pass: appPassword
        }
      };
    } else if (emailDomain.includes('yahoo.com')) {
      smtpConfig = {
        host: 'smtp.mail.yahoo.com',
        port: 587,
        secure: false,
        auth: {
          user: userEmail,
          pass: appPassword
        }
      };
    } else {
      // For other domains, try common SMTP settings
      // User can customize these if needed
      smtpConfig = {
        host: `smtp.${emailDomain}`,
        port: 587,
        secure: false,
        auth: {
          user: userEmail,
          pass: appPassword
        }
      };
    }

    // Create transporter
    const transporter = nodemailer.createTransport(smtpConfig);

    // Verify connection
    await transporter.verify();

    // Prepare email options
    const mailOptions = {
      from: userEmail,
      to: to,
      subject: subject,
      text: text || (html ? html.replace(/<[^>]*>/g, '') : ''),
      html: html || text
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);

    res.json({
      success: true,
      message: 'Email sent successfully',
      messageId: info.messageId
    });

  } catch (error) {
    console.error('Error sending email:', error);
    
    // Provide more specific error messages
    let errorMessage = 'Failed to send email';
    if (error.code === 'EAUTH') {
      errorMessage = 'Authentication failed. Please check your email and app password.';
    } else if (error.code === 'ECONNECTION') {
      errorMessage = 'Connection failed. Please check your internet connection and SMTP settings.';
    } else if (error.message) {
      errorMessage = error.message;
    }

    res.status(500).json({
      success: false,
      error: errorMessage
    });
  }
});

/**
 * POST /api/send-email-custom
 * Send email with custom SMTP configuration
 * 
 * Request body:
 * {
 *   "userEmail": "user@example.com",
 *   "appPassword": "app-password-here",
 *   "smtpHost": "smtp.example.com",
 *   "smtpPort": 587,
 *   "secure": false,
 *   "to": "recipient@example.com",
 *   "subject": "Email Subject",
 *   "text": "Plain text email body",
 *   "html": "<h1>HTML email body</h1>"
 * }
 */
app.post('/api/send-email-custom', async (req, res) => {
  try {
    const { 
      userEmail, 
      appPassword, 
      smtpHost, 
      smtpPort = 587, 
      secure = false,
      to, 
      subject, 
      text, 
      html 
    } = req.body;

    // Validate required fields
    if (!userEmail || !appPassword || !smtpHost || !to || !subject || (!text && !html)) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields. Please provide: userEmail, appPassword, smtpHost, to, subject, and either text or html'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userEmail) || !emailRegex.test(to)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    // Create transporter with custom SMTP settings
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(smtpPort),
      secure: secure === true || secure === 'true',
      auth: {
        user: userEmail,
        pass: appPassword
      }
    });

    // Verify connection
    await transporter.verify();

    // Prepare email options
    const mailOptions = {
      from: userEmail,
      to: to,
      subject: subject,
      text: text || (html ? html.replace(/<[^>]*>/g, '') : ''),
      html: html || text
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);

    res.json({
      success: true,
      message: 'Email sent successfully',
      messageId: info.messageId
    });

  } catch (error) {
    console.error('Error sending email:', error);
    
    let errorMessage = 'Failed to send email';
    if (error.code === 'EAUTH') {
      errorMessage = 'Authentication failed. Please check your email and app password.';
    } else if (error.code === 'ECONNECTION') {
      errorMessage = 'Connection failed. Please check your SMTP host and port settings.';
    } else if (error.message) {
      errorMessage = error.message;
    }

    res.status(500).json({
      success: false,
      error: errorMessage
    });
  }
});

/**
 * POST /email
 * Send email endpoint for frontend integration
 * Matches the format expected by useSendEmail hook
 * 
 * Request body:
 * {
 *   "from_email": "user@example.com",
 *   "to_email": "recipient@example.com",
 *   "subject": "Email Subject",
 *   "body": "Plain text email body",
 *   "html_body": "<h1>HTML email body</h1>", // optional
 *   "smtp_password": "app-password-here"
 * }
 */
app.post('/email', async (req, res) => {
  try {
    const { from_email, to_email, subject, body, html_body, smtp_password } = req.body;

    // Validate required fields
    if (!from_email || !to_email || !subject || !smtp_password) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields. Please provide: from_email, to_email, subject, and smtp_password'
      });
    }

    // At least body or html_body should be provided
    if (!body && !html_body) {
      return res.status(400).json({
        success: false,
        error: 'Either body or html_body must be provided'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(from_email) || !emailRegex.test(to_email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    // Determine SMTP settings based on email domain
    const emailDomain = from_email.split('@')[1].toLowerCase();
    let smtpConfig = {
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: from_email,
        pass: smtp_password
      }
    };

    // Configure SMTP for different email providers
    if (emailDomain.includes('gmail.com')) {
      smtpConfig = {
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
          user: from_email,
          pass: smtp_password
        }
      };
    } else if (emailDomain.includes('outlook.com') || emailDomain.includes('hotmail.com') || emailDomain.includes('live.com')) {
      smtpConfig = {
        host: 'smtp-mail.outlook.com',
        port: 587,
        secure: false,
        auth: {
          user: from_email,
          pass: smtp_password
        }
      };
    } else if (emailDomain.includes('yahoo.com')) {
      smtpConfig = {
        host: 'smtp.mail.yahoo.com',
        port: 587,
        secure: false,
        auth: {
          user: from_email,
          pass: smtp_password
        }
      };
    } else {
      // For other domains, try common SMTP settings
      smtpConfig = {
        host: `smtp.${emailDomain}`,
        port: 587,
        secure: false,
        auth: {
          user: from_email,
          pass: smtp_password
        }
      };
    }

    // Create transporter
    const transporter = nodemailer.createTransport(smtpConfig);

    // Verify connection
    await transporter.verify();

    // Prepare email options - prefer html_body if available, otherwise use body
    const html = html_body || (body ? body.replace(/\n/g, '<br>') : '');
    const text = body || (html_body ? html_body.replace(/<[^>]*>/g, '') : '');

    const mailOptions = {
      from: from_email,
      to: to_email,
      subject: subject,
      text: text,
      html: html
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);

    res.json({
      success: true,
      message: 'Email sent successfully',
      messageId: info.messageId
    });

  } catch (error) {
    console.error('Error sending email:', error);
    
    // Provide more specific error messages
    let errorMessage = 'Failed to send email';
    if (error.code === 'EAUTH') {
      errorMessage = 'Authentication failed. Please check your email and app password.';
    } else if (error.code === 'ECONNECTION') {
      errorMessage = 'Connection failed. Please check your internet connection and SMTP settings.';
    } else if (error.message) {
      errorMessage = error.message;
    }

    res.status(500).json({
      success: false,
      error: errorMessage
    });
  }
});

/**
 * POST /api/send-system-email
 * Send system emails (invoices, deactivation codes) using secure SMTP
 * This endpoint uses server-side SMTP credentials and should not expose them to frontend
 */
app.post('/api/send-system-email', async (req, res) => {
  try {
    const { to_email, subject, body, html_body, type } = req.body;

    // Validate required fields
    if (!to_email || !subject || (!body && !html_body)) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields. Please provide: to_email, subject, and either body or html_body'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to_email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    // System SMTP configuration (secure, not exposed to frontend)
    // Load from environment variables
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = parseInt(process.env.SMTP_PORT || '465');
    const smtpUser = process.env.SMTP_USER;
    const smtpPassword = process.env.SMTP_PASSWORD;
    const smtpFromEmail = process.env.SMTP_FROM_EMAIL || smtpUser;
    const smtpFromName = process.env.SMTP_FROM_NAME || 'Inbound Genie';

    // Validate required environment variables
    if (!smtpHost || !smtpUser || !smtpPassword) {
      return res.status(500).json({
        success: false,
        error: 'SMTP configuration is missing. Please check environment variables.'
      });
    }

    const smtpConfig = {
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465, // SSL/TLS for port 465
      auth: {
        user: smtpUser,
        pass: smtpPassword
      }
    };

    // Create transporter
    const transporter = nodemailer.createTransport(smtpConfig);

    // Verify connection
    await transporter.verify();

    // Prepare email options
    const html = html_body || (body ? body.replace(/\n/g, '<br>') : '');
    const text = body || (html_body ? html_body.replace(/<[^>]*>/g, '') : '');

    const mailOptions = {
      from: `"${smtpFromName}" <${smtpFromEmail}>`,
      to: to_email,
      subject: subject,
      text: text,
      html: html
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);

    res.json({
      success: true,
      message: 'Email sent successfully',
      messageId: info.messageId
    });

  } catch (error) {
    console.error('Error sending system email:', error);
    
    // Provide more specific error messages
    let errorMessage = 'Failed to send email';
    if (error.code === 'EAUTH') {
      errorMessage = 'Authentication failed. Please check SMTP credentials.';
    } else if (error.code === 'ECONNECTION') {
      errorMessage = 'Connection failed. Please check SMTP server settings.';
    } else if (error.message) {
      errorMessage = error.message;
    }

    res.status(500).json({
      success: false,
      error: errorMessage
    });
  }
});

/**
 * POST /api/extract-document
 * Extract text from uploaded document (PDF, DOCX, TXT)
 */
app.post('/api/extract-document', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain'
    ];

    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        error: `Unsupported file type: ${req.file.mimetype}. Supported types: PDF, DOCX, TXT`
      });
    }

    const extractedText = await extractTextFromFile(req.file.buffer, req.file.mimetype);
    
    res.json({
      success: true,
      extractedText,
      fileName: req.file.originalname,
      fileType: req.file.mimetype,
      fileSize: req.file.size
    });
  } catch (error) {
    console.error('Error extracting document:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to extract text from document'
    });
  }
});

/**
 * POST /api/ai-prompt/extract-document-profile
 * Extract structured business profile from document text using AI
 * 
 * Request body:
 * {
 *   "extractedText": "text content from document"
 * }
 */
app.post('/api/ai-prompt/extract-document-profile', async (req, res) => {
  try {
    const { extractedText } = req.body;

    if (!extractedText || extractedText.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'extractedText is required'
      });
    }

    const result = await extractDocumentProfile(extractedText);

    res.json({
      success: true,
      extractedProfile: result.extractedProfile,
      missingFields: result.missingFields,
    });
  } catch (error) {
    console.error('Error extracting document profile:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to extract document profile'
    });
  }
});

/**
 * POST /api/ai-prompt/generate-from-profile
 * Generate AI prompt from business profile
 * 
 * Request body:
 * {
 *   "profile": { ... business profile object ... }
 * }
 */
app.post('/api/ai-prompt/generate-from-profile', async (req, res) => {
  try {
    const { profile } = req.body;

    if (!profile || typeof profile !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'profile is required and must be an object'
      });
    }

    const result = await generatePromptFromProfile(profile);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Error generating prompt from profile:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate prompt from profile'
    });
  }
});

/**
 * POST /api/ai-prompt/format-raw-prompt
 * Format raw unstructured prompt into structured format
 * 
 * Request body:
 * {
 *   "rawPrompt": "raw prompt text"
 * }
 */
app.post('/api/ai-prompt/format-raw-prompt', async (req, res) => {
  try {
    const { rawPrompt } = req.body;

    if (!rawPrompt || rawPrompt.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'rawPrompt is required'
      });
    }

    const formattedPrompt = await formatRawPrompt(rawPrompt);

    res.json({
      success: true,
      formattedPrompt,
    });
  } catch (error) {
    console.error('Error formatting prompt:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to format prompt'
    });
  }
});

/**
 * POST /api/chatbot/send-message
 * Send a message to the chatbot
 * 
 * Request body:
 * {
 *   "message": "user message",
 *   "conversationHistory": [{"role": "user", "content": "..."}],
 *   "sessionId": "optional-session-id",
 *   "userId": "optional-user-id"
 * }
 */
app.post('/api/chatbot/send-message', async (req, res) => {
  try {
    const { message, conversationHistory = [] } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'message is required'
      });
    }

    const botResponse = await sendChatbotMessage(message, conversationHistory);

    res.json({
      success: true,
      response: botResponse,
      message: botResponse, // For compatibility
    });
  } catch (error) {
    console.error('Error sending chatbot message:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to send chatbot message'
    });
  }
});

/**
 * POST /api/ai-email/generate
 * Generate email content using AI
 * 
 * Request body:
 * {
 *   "leadInfo": {...},
 *   "emailType": "follow-up" | "thank-you" | "appointment" | "custom",
 *   "tone": "professional" | "friendly" | "casual" | "formal",
 *   "purpose": "optional purpose",
 *   "context": "optional context"
 * }
 */
app.post('/api/ai-email/generate', async (req, res) => {
  try {
    const { leadInfo, emailType, tone, purpose, context } = req.body;

    const result = await generateEmailContent({
      leadInfo,
      emailType,
      tone,
      purpose,
      context,
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Error generating email:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate email'
    });
  }
});

/**
 * POST /api/ai-email/generate-template
 * Generate email template using AI
 * 
 * Request body:
 * {
 *   "name": "template name",
 *   "description": "optional description",
 *   "emailType": "follow-up" | "thank-you" | "appointment" | "custom",
 *   "tone": "professional" | "friendly" | "casual" | "formal",
 *   "purpose": "optional purpose"
 * }
 */
app.post('/api/ai-email/generate-template', async (req, res) => {
  try {
    const { name, description, emailType, tone, purpose } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'name is required'
      });
    }

    const result = await generateEmailTemplate({
      name,
      description,
      emailType,
      tone,
      purpose,
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Error generating email template:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate email template'
    });
  }
});

/**
 * POST /api/ai-prompt/sidebar-generate
 * Generate prompt from business type and description (for sidebar)
 * 
 * Request body:
 * {
 *   "businessType": "business type",
 *   "businessDescription": "business description"
 * }
 */
app.post('/api/ai-prompt/sidebar-generate', async (req, res) => {
  try {
    const { businessType, businessDescription } = req.body;

    if (!businessType || !businessDescription) {
      return res.status(400).json({
        success: false,
        error: 'businessType and businessDescription are required'
      });
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at creating AI voice agent prompts. Generate professional, effective prompts for voice agents based on business information.',
        },
        {
          role: 'user',
          content: `Generate a comprehensive AI voice agent prompt for a ${businessType} business. Business description: ${businessDescription}. The prompt should be professional, clear, and effective for handling customer inquiries.`,
        },
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    const generatedText = completion.choices[0]?.message?.content || '';

    res.json({
      success: true,
      generatedPrompt: generatedText,
    });
  } catch (error) {
    console.error('Error generating sidebar prompt:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate prompt'
    });
  }
});

/**
 * POST /api/ai-prompt/sidebar-format
 * Format prompt using AI (for sidebar)
 * 
 * Request body:
 * {
 *   "promptToFormat": "raw prompt text"
 * }
 */
app.post('/api/ai-prompt/sidebar-format', async (req, res) => {
  try {
    const { promptToFormat } = req.body;

    if (!promptToFormat || promptToFormat.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'promptToFormat is required'
      });
    }

    const formatInstructions = `Format the following prompt according to these guidelines:
1. Use clear, concise language
2. Structure with bullet points or numbered lists where appropriate
3. Include specific instructions for tone and behavior
4. Add context about the business or service
5. Include examples of good responses
6. Ensure professional and friendly tone

Original Prompt:
${promptToFormat}

Formatted Prompt:`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at formatting and structuring AI prompts. Format prompts to be clear, professional, and effective.',
        },
        {
          role: 'user',
          content: formatInstructions,
        },
      ],
      temperature: 0.7,
      max_tokens: 1500,
    });

    const formattedText = completion.choices[0]?.message?.content || '';

    res.json({
      success: true,
      formattedPrompt: formattedText,
    });
  } catch (error) {
    console.error('Error formatting sidebar prompt:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to format prompt'
    });
  }
});

/**
 * POST /api/calls/analyze
 * Analyze a completed call transcript and update database
 * 
 * Request body:
 * {
 *   "callId": "uuid-of-call"
 * }
 */
app.post('/api/calls/analyze', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({
        success: false,
        error: 'Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in environment variables.',
      });
    }

    const { callId } = req.body;

    if (!callId) {
      return res.status(400).json({
        success: false,
        error: 'callId is required',
      });
    }

    // Fetch call from database
    const { data: call, error: callError } = await supabase
      .from('calls')
      .select('*')
      .eq('id', callId)
      .single();

    if (callError || !call) {
      return res.status(404).json({
        success: false,
        error: 'Call not found',
      });
    }

    // Check if already analyzed
    if (call.analyzed && call.analysis) {
      return res.json({
        success: true,
        message: 'Call already analyzed',
        analysis: call.analysis,
        callId: call.id,
      });
    }

    // Check if transcript exists
    if (!call.transcript || call.transcript.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Call transcript is empty',
      });
    }

    // Analyze transcript
    const analysisResult = await analyzeCallTranscript(call.transcript);

    if (!analysisResult.success) {
      // Store error in analysis field
      await supabase
        .from('calls')
        .update({
          analyzed: true,
          analysis: {
            error: analysisResult.error,
            raw_response: analysisResult.raw_response,
            analyzed_at: new Date().toISOString(),
          },
        })
        .eq('id', callId);

      return res.status(500).json({
        success: false,
        error: analysisResult.error,
      });
    }

    const analysis = analysisResult.analysis;

    // Update calls table with analysis
    const updateData = {
      analyzed: true,
      analysis: analysis,
      call_type: analysis.call_type,
      call_outcome: analysis.call_outcome,
      sentiment: analysis.sentiment,
      urgency_level: analysis.urgency_level,
      confidence_score: analysis.confidence_score,
      intent_summary: analysis.intent_summary,
      call_summary: analysis.summary,
      is_lead: analysis.is_lead,
      lead_strength: analysis.lead_strength,
      extracted_customer_data: analysis.customer || {},
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from('calls')
      .update(updateData)
      .eq('id', callId);

    if (updateError) {
      throw updateError;
    }

    // Upsert into page_leads table
    await upsertLeadFromAnalysis(call, analysis);

    res.json({
      success: true,
      message: 'Call analyzed successfully',
      analysis: analysis,
      callId: call.id,
    });
  } catch (error) {
    console.error('Error analyzing call:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to analyze call',
    });
  }
});

/**
 * Upsert lead into page_leads table based on analysis
 */
async function upsertLeadFromAnalysis(call, analysis) {
  try {
    if (!supabase) {
      console.error('Supabase not configured, skipping lead upsert');
      return;
    }

    const customer = analysis.customer || {};
    const phoneNumber = customer.phone_number || call.phone_number;
    const email = customer.email;

    // Determine status based on analysis
    let status = 'general';
    if (analysis.is_lead && analysis.lead_strength === 'hot') {
      status = 'hot';
    } else if (analysis.is_lead && analysis.lead_strength === 'warm') {
      status = 'warm';
    } else if (analysis.is_lead && analysis.lead_strength === 'cold') {
      status = 'cold';
    } else if (analysis.call_type === 'support') {
      status = 'support';
    } else if (analysis.call_type === 'order') {
      status = 'order';
    } else if (analysis.call_type === 'appointment') {
      status = 'appointment';
    }

    // Get bot name
    let botName = null;
    if (call.bot_id) {
      const { data: bot } = await supabase
        .from('bots')
        .select('name')
        .eq('id', call.bot_id)
        .single();
      botName = bot?.name || null;
    }

    // Prepare lead data
    const leadData = {
      user_id: call.user_id,
      name: customer.name || call.contact_name,
      email: email,
      phone_number: phoneNumber,
      address: customer.address,
      bot_name: botName,
      status: status,
      call_id: call.id,
      call_type: analysis.call_type,
      lead_strength: analysis.lead_strength,
      intent_summary: analysis.intent_summary,
      call_summary: analysis.summary,
      call_outcome: analysis.call_outcome,
      next_step_type: analysis.next_step?.type,
      next_step_details: analysis.next_step?.details,
      appointment_date: analysis.appointment?.date,
      appointment_time: analysis.appointment?.time,
      appointment_timezone: analysis.appointment?.timezone,
      appointment_type: analysis.appointment?.appointment_type,
      order_items: analysis.order?.items || [],
      order_total: analysis.order?.total_price,
      order_type: analysis.order?.order_type,
      payment_method: analysis.order?.payment_method,
      support_issue: analysis.support?.issue,
      resolution_provided: analysis.support?.resolution_provided || false,
      sentiment: analysis.sentiment,
      urgency_level: analysis.urgency_level,
      confidence_score: analysis.confidence_score,
      transcript: call.transcript,
      extracted_data: analysis,
      is_lead: analysis.is_lead,
      source: 'call',
      last_call_at: call.completed_at || call.started_at,
      updated_at: new Date().toISOString(),
    };

    // Try to find existing lead by phone or email
    let existingLead = null;
    if (phoneNumber) {
      const { data: phoneLead } = await supabase
        .from('page_leads')
        .select('id')
        .eq('user_id', call.user_id)
        .eq('phone_number', phoneNumber)
        .single();
      existingLead = phoneLead;
    }

    if (!existingLead && email) {
      const { data: emailLead } = await supabase
        .from('page_leads')
        .select('id')
        .eq('user_id', call.user_id)
        .eq('email', email)
        .single();
      existingLead = emailLead;
    }

    if (existingLead) {
      // Update existing lead
      const { error } = await supabase
        .from('page_leads')
        .update(leadData)
        .eq('id', existingLead.id);

      if (error) throw error;
    } else if (analysis.is_lead || phoneNumber || email) {
      // Create new lead only if it's marked as lead or has contact info
      const { error } = await supabase
        .from('page_leads')
        .insert(leadData);

      if (error) throw error;
    }
  } catch (error) {
    console.error('Error upserting lead:', error);
    // Don't throw - we don't want to fail the analysis if lead upsert fails
  }
}

/**
 * POST /api/test-call/create-token
 * Create a WebRTC call token for testing an agent
 * 
 * Request body:
 * {
 *   "agent_id": "retell_agent_id"
 * }
 */
app.post('/api/test-call/create-token', async (req, res) => {
  try {
    const { agent_id } = req.body;

    if (!agent_id) {
      return res.status(400).json({
        success: false,
        error: 'agent_id is required'
      });
    }

    if (!retellClient) {
      return res.status(500).json({
        success: false,
        error: 'Retell API key not configured'
      });
    }

    // Create a WebRTC call using Retell SDK
    const webCallResponse = await retellClient.call.createWebCall({
      agent_id: agent_id,
      retell_llm_dynamic_variables: {},
    });

    console.log('Web call created successfully:', {
      call_id: webCallResponse.call_id,
      agent_id: webCallResponse.agent_id,
    });

    res.json({
      success: true,
      call_id: webCallResponse.call_id,
      access_token: webCallResponse.access_token,
      call_type: webCallResponse.call_type,
      agent_id: webCallResponse.agent_id,
      ...webCallResponse,
    });

  } catch (error) {
    console.error('Error creating test call token:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create test call token'
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend server is running' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
  console.log(`Email endpoint: http://localhost:${PORT}/email`);
  console.log(`System email endpoint: http://localhost:${PORT}/api/send-system-email`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});
