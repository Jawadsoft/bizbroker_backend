// services/email.service.js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendOnboardingEmail(email, data) {
  const htmlTemplate = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Welcome to Healthcare Biz Brokers</title>
      <style>
        body { 
          font-family: Arial, sans-serif; 
          background: #f6f6f6; 
          color: #333; 
          padding: 20px; 
          margin: 0;
        }
        .container { 
          background: #ffffff; 
          max-width: 600px; 
          margin: auto; 
          padding: 30px; 
          border-radius: 8px; 
          box-shadow: 0 0 10px rgba(0,0,0,0.05); 
        }
        .header {
          background: #305464;
          color: white;
          padding: 20px;
          border-radius: 8px 8px 0 0;
          margin: -30px -30px 30px -30px;
        }
        .btn { 
          display: inline-block; 
          padding: 12px 20px; 
          background: #305464; 
          color: white; 
          text-decoration: none; 
          border-radius: 5px; 
          margin-top: 20px; 
        }
        .credentials {
          background: #f8f9fa;
          padding: 20px;
          border-radius: 5px;
          margin: 20px 0;
        }
        .footer { 
          font-size: 12px; 
          color: #999; 
          margin-top: 30px; 
          border-top: 1px solid #eee;
          padding-top: 20px;
        }
        .warning {
          background: #fff3cd;
          border: 1px solid #ffeaa7;
          color: #856404;
          padding: 10px;
          border-radius: 4px;
          margin: 15px 0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2 style="margin: 0;">Welcome to Healthcare Biz Brokers!</h2>
        </div>
        
        <p>Hi <strong>${data.name}</strong>,</p>
        <p>You've been added to our Healthcare Business Brokers CRM system. We're excited to work with you!</p>
        
        <div class="credentials">
          <h3 style="margin-top: 0;">Your Login Credentials:</h3>
          <ul style="list-style: none; padding: 0;">
            <li style="margin: 10px 0;"><strong>Login URL:</strong> <a href="${data.loginUrl}" style="color: #305464;">${data.loginUrl}</a></li>
            <li style="margin: 10px 0;"><strong>Email:</strong> ${data.email}</li>
            <li style="margin: 10px 0;"><strong>Temporary Password:</strong> <code style="background: #e9ecef; padding: 4px 8px; border-radius: 3px;">${data.tempPassword}</code></li>
          </ul>
        </div>
        
        <div class="warning">
          <strong>⚠️ Important:</strong> Please change your password after logging in for the first time for security purposes.
        </div>
        
        <p>Once you log in, you'll be able to:</p>
        <ul>
          <li>View and manage your business information</li>
          <li>Fill out required forms and questionnaires</li>
          <li>Communicate with your assigned agent</li>
          <li>Track your business listing or purchase progress</li>
          <li>Access important documents and resources</li>
        </ul>
        
        <a href="${data.loginUrl}" class="btn">Login to Your Account</a>
        
        <p style="margin-top: 30px;">If you have any questions or need assistance, don't hesitate to reach out to your assigned agent or our support team.</p>
        
        <div class="footer">
          Best regards,<br>
          <strong>Healthcare Biz Brokers Team</strong><br>
          Email: support@healthcarebizbrokers.com<br>
          Phone: (555) 123-4567<br>
          <br>
          <em>This email was sent automatically. Please do not reply to this email address.</em>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await transporter.sendMail({
      from: '"Healthcare Biz Brokers" <no-reply@healthcarebizbrokers.com>',
      to: email,
      subject: 'Welcome to Healthcare Biz Brokers - Your Account is Ready!',
      html: htmlTemplate,
      // Plain text fallback
      text: `
        Welcome to Healthcare Biz Brokers!
        
        Hi ${data.name},
        
        You've been added to our system. Here are your login credentials:
        
        Login URL: ${data.loginUrl}
        Email: ${data.email}
        Temporary Password: ${data.tempPassword}
        
        Please change your password after logging in for the first time.
        
        Best regards,
        Healthcare Biz Brokers Team
      `,
    });
    
    console.log(`Onboarding email sent successfully to ${email}`);
  } catch (error) {
    console.error('Failed to send onboarding email:', error);
    throw error;
  }
}

async function sendRichTextEmail(data) {
  try {
    const mailOptions = {
      from: `"Healthcare Biz Brokers" <${process.env.SMTP_USER}>`,
      to: data.to,
      subject: data.subject,
      html: data.htmlBody,
      text: data.plainBody,
    };

    // Add reply-to if provided
    if (data.replyTo) {
      mailOptions.replyTo = data.replyTo;
    }

    // Add attachments if provided
    if (data.attachments && data.attachments.length > 0) {
      mailOptions.attachments = data.attachments.map(attachment => ({
        filename: attachment.split('/').pop(), // Extract filename from URL
        path: attachment, // Assuming these are URLs or file paths
      }));
    }

    // Add custom headers for email tracking
    mailOptions.headers = {
      'X-Healthcare-CRM': 'true',
      'X-Sender-Type': 'crm-system',
    };

    const result = await transporter.sendMail(mailOptions);
    
    console.log(`Rich text email sent successfully to ${data.to}:`, result.messageId);
    return result;
  } catch (error) {
    console.error('Failed to send rich text email:', error);
    throw error;
  }
}

// Function to send email using templates
async function sendTemplateEmail(to, templateName, variables, attachments) {
  try {
    // This would fetch the template from database
    // For now, we'll use a simple template system
    const templates = {
      'follow-up': {
        subject: 'Follow-up: {{subject}}',
        html: `
          <p>Hi {{name}},</p>
          <p>{{message}}</p>
          <p>Best regards,<br>{{senderName}}</p>
        `,
      },
      'appointment-reminder': {
        subject: 'Appointment Reminder - {{date}}',
        html: `
          <p>Hi {{name}},</p>
          <p>This is a reminder about your upcoming appointment:</p>
          <p><strong>Date:</strong> {{date}}<br>
          <strong>Time:</strong> {{time}}<br>
          <strong>Type:</strong> {{type}}</p>
          <p>Best regards,<br>Healthcare Biz Brokers</p>
        `,
      },
    };

    const template = templates[templateName];
    if (!template) {
      throw new Error(`Template ${templateName} not found`);
    }

    // Replace variables in template
    let subject = template.subject;
    let html = template.html;

    Object.keys(variables).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      subject = subject.replace(regex, variables[key]);
      html = html.replace(regex, variables[key]);
    });

    await sendRichTextEmail({
      to,
      subject,
      htmlBody: html,
      plainBody: html.replace(/<[^>]*>/g, ''), // Strip HTML for plain text
      attachments,
    });

    console.log(`Template email '${templateName}' sent to ${to}`);
  } catch (error) {
    console.error('Failed to send template email:', error);
    throw error;
  }
}

async function sendPasswordResetEmail(email, data) {
  const htmlTemplate = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Password Reset - Healthcare Biz Brokers</title>
      <style>
        body { 
          font-family: Arial, sans-serif; 
          background: #f6f6f6; 
          color: #333; 
          padding: 20px; 
          margin: 0;
        }
        .container { 
          background: #ffffff; 
          max-width: 600px; 
          margin: auto; 
          padding: 30px; 
          border-radius: 8px; 
          box-shadow: 0 0 10px rgba(0,0,0,0.05); 
        }
        .header {
          background: #305464;
          color: white;
          padding: 20px;
          border-radius: 8px 8px 0 0;
          margin: -30px -30px 30px -30px;
        }
        .btn { 
          display: inline-block; 
          padding: 12px 20px; 
          background: #305464; 
          color: white; 
          text-decoration: none; 
          border-radius: 5px; 
          margin-top: 20px; 
        }
        .warning {
          background: #fff3cd;
          border: 1px solid #ffeaa7;
          color: #856404;
          padding: 10px;
          border-radius: 4px;
          margin: 15px 0;
        }
        .footer { 
          font-size: 12px; 
          color: #999; 
          margin-top: 30px; 
          border-top: 1px solid #eee;
          padding-top: 20px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2 style="margin: 0;">Password Reset Request</h2>
        </div>
        
        <p>Hi <strong>${data.name}</strong>,</p>
        <p>We received a request to reset your password for your Healthcare Biz Brokers account.</p>
        
        <a href="${data.resetUrl}" class="btn">Reset Your Password</a>
        
        <div class="warning">
          <strong>⚠️ Security Notice:</strong> This link will expire in 1 hour for security reasons. If you didn't request this password reset, please ignore this email.
        </div>
        
        <p>If the button above doesn't work, you can copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #666;">${data.resetUrl}</p>
        
        <div class="footer">
          Best regards,<br>
          <strong>Healthcare Biz Brokers Team</strong><br>
          Email: support@healthcarebizbrokers.com<br>
          Phone: (555) 123-4567<br>
          <br>
          <em>This email was sent automatically. Please do not reply to this email address.</em>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await transporter.sendMail({
      from: '"Healthcare Biz Brokers" <no-reply@healthcarebizbrokers.com>',
      to: email,
      subject: 'Password Reset Request - Healthcare Biz Brokers',
      html: htmlTemplate,
      // Plain text fallback
      text: `
        Password Reset Request - Healthcare Biz Brokers
        
        Hi ${data.name},
        
        We received a request to reset your password for your Healthcare Biz Brokers account.
        
        Reset your password: ${data.resetUrl}
        
        This link will expire in 1 hour for security reasons.
        If you didn't request this password reset, please ignore this email.
        
        Best regards,
        Healthcare Biz Brokers Team
      `,
    });
    
    console.log(`Password reset email sent successfully to ${email}`);
  } catch (error) {
    console.error('Failed to send password reset email:', error);
    throw error;
  }
}

// Verify email configuration
async function verifyEmailConfig() {
  try {
    await transporter.verify();
    console.log('Email configuration verified successfully');
    return true;
  } catch (error) {
    console.error('Email configuration verification failed:', error);
    return false;
  }
}

module.exports = {
  sendOnboardingEmail,
  sendRichTextEmail,
  sendTemplateEmail,
  sendPasswordResetEmail,
  verifyEmailConfig,
};