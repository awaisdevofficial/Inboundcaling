import OpenAI from 'openai';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generate email content using OpenAI
 */
export async function generateEmailContent(params) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const {
    leadInfo,
    emailType = 'follow-up',
    tone = 'professional',
    purpose,
    context,
  } = params;

  // Build context from lead information
  let leadContext = '';
  let appointmentDetails = '';
  
  if (leadInfo) {
    leadContext = `
Lead Information:
${leadInfo.contact_name ? `- Contact Name: ${leadInfo.contact_name}` : ''}
${leadInfo.phone_number ? `- Phone Number: ${leadInfo.phone_number}` : ''}
${leadInfo.company_name ? `- Company: ${leadInfo.company_name}` : ''}
${leadInfo.call_date ? `- Call Date: ${leadInfo.call_date}` : ''}
${leadInfo.transcript ? `- Call Transcript: ${leadInfo.transcript.substring(0, 500)}...` : ''}
`;

    // Extract appointment information from extracted_data
    if (leadInfo.extracted_data && typeof leadInfo.extracted_data === 'object') {
      const extracted = leadInfo.extracted_data;
      if (extracted.appointment && (extracted.appointment.scheduled || extracted.appointment.requested)) {
        let formattedDate = extracted.appointment.date || '';
        let dayOfWeek = '';
        if (extracted.appointment.date) {
          try {
            const dateObj = new Date(extracted.appointment.date);
            if (!isNaN(dateObj.getTime())) {
              formattedDate = dateObj.toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              });
              dayOfWeek = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
            }
          } catch {}
        }
        
        appointmentDetails = `
APPOINTMENT INFORMATION:
- Status: ${extracted.appointment.scheduled ? 'CONFIRMED/SCHEDULED' : 'REQUESTED'}
- Date: ${formattedDate}${dayOfWeek ? ` (${dayOfWeek})` : ''}
- Time: ${extracted.appointment.time || 'TBD'}
${extracted.appointment.timezone ? `- Timezone: ${extracted.appointment.timezone}` : ''}
${extracted.appointment.appointment_type ? `- Type: ${extracted.appointment.appointment_type}` : ''}

IMPORTANT: When generating the email, make sure to:
1. Mention the specific day of the week (${dayOfWeek || 'the scheduled day'}) prominently
2. Confirm the appointment date and time clearly
3. Be warm and professional
4. Include any relevant details about what will be discussed
5. Provide contact information for changes or questions
`;
      }
    }
  }

  const systemInstruction = `You are an expert email writer specializing in business communication and lead follow-up emails.
Your task is to generate professional, effective email content that:
- Is clear, concise, and engaging
- Maintains the specified tone throughout
- Includes appropriate call-to-action
- Uses proper business email formatting
- Is personalized when lead information is provided
- Avoids being too salesy or pushy
- Creates value for the recipient

Output Format:
You must return ONLY a JSON object with this exact structure:
{
  "subject": "Email subject line here",
  "body": "Email body content here (can include line breaks with \\n)"
}

Do not include any other text, explanations, or markdown formatting. Only return the JSON object.`;

  const emailTypeDescriptions = {
    'follow-up': 'a follow-up email after a phone call or conversation',
    'thank-you': 'a thank you email expressing gratitude',
    'appointment': 'an appointment confirmation or reminder email',
    'custom': purpose || 'a business email',
  };

  const userPrompt = `Generate ${emailTypeDescriptions[emailType]} with a ${tone} tone.

${leadContext}

${appointmentDetails}

${context ? `Additional Context: ${context}` : ''}

${purpose ? `Purpose: ${purpose}` : ''}

Requirements:
- Subject line should be clear and compelling (max 60 characters)
- Email body should be 2-4 paragraphs
- Include a professional greeting and closing
- Add a clear call-to-action
- Use the lead's name if provided
- Reference the call/contact if applicable
${appointmentDetails ? `- CRITICAL: Mention the appointment date and day of the week prominently` : ''}
${appointmentDetails ? `- Include appointment confirmation details if scheduled` : ''}
- Keep it concise and actionable

Return the email as a JSON object with "subject" and "body" fields.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: systemInstruction,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content || '';
    
    try {
      const parsed = JSON.parse(content);
      return {
        subject: parsed.subject || 'Follow-up Email',
        body: parsed.body?.replace(/\\n/g, '\n') || '',
      };
    } catch (parseError) {
      // Fallback: try to extract subject and body from text
      const lines = content.split('\n');
      const subject = lines.find((line) => line.toLowerCase().includes('subject'))?.replace(/subject:?/i, '').trim() || 'Follow-up Email';
      const body = content.replace(/subject:?.*/i, '').trim();
      
      return {
        subject,
        body: body || "Thank you for your interest. We'd like to follow up with you.",
      };
    }
  } catch (error) {
    console.error('OpenAI Email Generation Error:', error);
    throw new Error(error.message || 'Failed to generate email');
  }
}

/**
 * Generate email template using OpenAI
 */
export async function generateEmailTemplate(params) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const {
    name,
    description,
    emailType = 'follow-up',
    tone = 'professional',
    purpose,
  } = params;

  const systemInstruction = `You are an expert email template creator specializing in business communication.
Your task is to create reusable email templates that:
- Include placeholders for dynamic content using {{variable_name}} format
- Are clear, professional, and effective
- Maintain the specified tone
- Include appropriate structure and formatting
- Can be personalized with variables like {{contact_name}}, {{phone_number}}, {{company_name}}, {{call_date}}

Available variables that can be used:
- {{contact_name}} - Contact's name
- {{phone_number}} - Phone number
- {{company_name}} - Company name
- {{call_date}} - Date of call

Output Format:
You must return ONLY a JSON object with this exact structure:
{
  "subject": "Email subject with {{variables}}",
  "body": "Email body with {{variables}} and line breaks as \\n"
}

Do not include any other text or explanations. Only return the JSON object.`;

  const emailTypeDescriptions = {
    'follow-up': 'a follow-up email template after a phone call',
    'thank-you': 'a thank you email template',
    'appointment': 'an appointment confirmation or reminder email template',
    'custom': purpose || 'a business email template',
  };

  const userPrompt = `Create ${emailTypeDescriptions[emailType]} template named "${name}" with a ${tone} tone.

${description ? `Description: ${description}` : ''}
${purpose ? `Purpose: ${purpose}` : ''}

Requirements:
- Subject line should include variables like {{contact_name}} or {{phone_number}}
- Email body should be 2-4 paragraphs
- Use variables for personalization: {{contact_name}}, {{phone_number}}, {{company_name}}, {{call_date}}
- Include a professional greeting and closing
- Add a clear call-to-action
- Make it reusable and adaptable
- Keep it concise and actionable

Return the template as a JSON object with "subject" and "body" fields.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: systemInstruction,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content || '';
    
    try {
      const parsed = JSON.parse(content);
      return {
        subject: parsed.subject || 'Follow-up: {{contact_name}}',
        body: parsed.body?.replace(/\\n/g, '\n') || '',
      };
    } catch (parseError) {
      return {
        subject: 'Follow-up: {{contact_name}}',
        body: `Hello {{contact_name}},\n\nThank you for your interest. We'd like to follow up regarding our conversation on {{call_date}}.\n\nBest regards`,
      };
    }
  } catch (error) {
    console.error('OpenAI Email Template Generation Error:', error);
    throw new Error(error.message || 'Failed to generate email template');
  }
}

/**
 * Send verification email with OTP code
 * @param {string} email - Recipient email address
 * @param {string} otpCode - 6-digit OTP code
 * @param {string} fullName - User's full name
 */
export async function sendVerificationEmail(email, otpCode, fullName) {
  // System SMTP configuration (from environment variables)
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = parseInt(process.env.SMTP_PORT || '465');
  const smtpUser = process.env.SMTP_USER;
  const smtpPassword = process.env.SMTP_PASSWORD;
  const smtpFromEmail = process.env.SMTP_FROM_EMAIL || smtpUser;
  const smtpFromName = process.env.SMTP_FROM_NAME || 'Inbound Genie';

  // Validate required environment variables
  if (!smtpHost || !smtpUser || !smtpPassword) {
    throw new Error('SMTP configuration is missing. Please check environment variables: SMTP_HOST, SMTP_USER, SMTP_PASSWORD');
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new Error('Invalid email format');
  }

  // Configure SMTP transporter
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

  // Prepare email content
  const greeting = fullName ? `Hello ${fullName},` : 'Hello,';
  const subject = 'Verify Your Email Address - Inbound Genie';
  
  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Email Verification</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f8f9fa; padding: 30px; border-radius: 8px;">
        <h2 style="color: #2c3e50; margin-top: 0;">Email Verification</h2>
        <p>${greeting}</p>
        <p>Thank you for signing up for Inbound Genie! To complete your registration, please verify your email address using the verification code below:</p>
        <div style="background-color: #ffffff; border: 2px dashed #3498db; border-radius: 6px; padding: 20px; text-align: center; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px; color: #666; text-transform: uppercase; letter-spacing: 1px;">Your Verification Code</p>
          <p style="margin: 10px 0 0 0; font-size: 32px; font-weight: bold; color: #2c3e50; letter-spacing: 4px;">${otpCode}</p>
        </div>
        <p>This code will expire in 10 minutes. If you didn't request this verification code, please ignore this email.</p>
        <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 12px;">
          Best regards,<br>
          The Inbound Genie Team
        </p>
      </div>
    </body>
    </html>
  `;

  const textBody = `
Email Verification

${greeting}

Thank you for signing up for Inbound Genie! To complete your registration, please verify your email address using the verification code below:

Your Verification Code: ${otpCode}

This code will expire in 10 minutes. If you didn't request this verification code, please ignore this email.

Best regards,
The Inbound Genie Team
  `.trim();

  // Prepare email options
  const mailOptions = {
    from: `"${smtpFromName}" <${smtpFromEmail}>`,
    to: email,
    subject: subject,
    text: textBody,
    html: htmlBody
  };

  // Send email
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Verification email sent successfully:', info.messageId);
    return info;
  } catch (error) {
    console.error('Error sending verification email:', error);
    
    // Provide more specific error messages
    if (error.code === 'EAUTH') {
      throw new Error('SMTP authentication failed. Please check SMTP credentials.');
    } else if (error.code === 'ECONNECTION') {
      throw new Error('SMTP connection failed. Please check SMTP server settings.');
    } else {
      throw new Error(error.message || 'Failed to send verification email');
    }
  }
}
