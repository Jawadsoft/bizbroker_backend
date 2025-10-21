// services/emailListener.js - FINAL FIXED VERSION
const MailListener = require('mail-listener2');
const { PrismaClient } = require('@prisma/client');
const { createActivity } = require('./activityService');

const prisma = new PrismaClient();

class EmailListenerService {
  constructor() {
    this.mailListener = null;
    this.isRunning = false;
    this.reconnectInterval = 30000; // 30 seconds
    this.maxReconnectAttempts = 5;
    this.reconnectAttempts = 0;
    this.userEmails = new Set(); // Cache of user emails for quick filtering
    this.processedMessageIds = new Set(); // Prevent duplicate processing
    
    // Bind methods
    this.start = this.start.bind(this);
    this.stop = this.stop.bind(this);
    this.handleNewEmail = this.handleNewEmail.bind(this);
    this.handleError = this.handleError.bind(this);
    this.loadUserEmails = this.loadUserEmails.bind(this);
  }

  // Load user emails into cache for filtering
  async loadUserEmails() {
    try {
      const users = await prisma.user.findMany({
        select: { email: true },
        where: { role: 'CLIENT' } // Only load client emails
      });
      
      this.userEmails = new Set(users.map(user => user.email.toLowerCase()));
      console.log(`📧 Loaded ${this.userEmails.size} user emails for filtering`);
    } catch (error) {
      console.error('❌ Failed to load user emails:', error);
    }
  }

  // Initialize and start the email listener
  async start() {
    try {
      console.log('🔄 Starting email listener service...');
      
      // Load user emails for filtering
      await this.loadUserEmails();
      
      // Calculate date for last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const formattedDate = sevenDaysAgo.toISOString().split('T')[0]; // YYYY-MM-DD format
      
      console.log(`📧 Only processing emails since: ${formattedDate}`);
      
      // Configure mail listener for Gmail IMAP with strict filtering
      this.mailListener = new MailListener({
        username: process.env.EMAIL_USERNAME,
        password: process.env.EMAIL_PASSWORD,
        host: process.env.IMAP_HOST || 'imap.gmail.com',
        port: process.env.IMAP_PORT || 993,
        tls: true,
        tlsOptions: { rejectUnauthorized: false },
        mailbox: process.env.IMAP_MAILBOX || 'INBOX',
        // FIXED: More restrictive search filter
        searchFilter: [
          'UNSEEN', // Only unseen emails
          ['SINCE', formattedDate] // Only emails from last 7 days (YYYY-MM-DD format)
        ],
        markSeen: false, // Don't mark as seen to avoid affecting other email clients
        fetchUnreadOnStart: false, // CRITICAL: Don't fetch old emails on startup
        attachments: false, // Disable attachments to avoid issues
      });

      // Set up event listeners
      this.mailListener.on('server:connected', () => {
        console.log('✅ Email listener connected to IMAP server');
        this.isRunning = true;
        this.reconnectAttempts = 0;
      });

      this.mailListener.on('server:disconnected', () => {
        console.log('❌ Email listener disconnected from IMAP server');
        this.isRunning = false;
        this.handleReconnect();
      });

      this.mailListener.on('error', this.handleError);
      this.mailListener.on('mail', this.handleNewEmail);

      // Start listening
      this.mailListener.start();
      
      console.log('✅ Email listener service started successfully');
      console.log(`📧 Monitoring emails from ${this.userEmails.size} users since ${formattedDate}`);
    } catch (error) {
      console.error('❌ Failed to start email listener:', error);
      this.handleError(error);
    }
  }

  // Stop the email listener
  stop() {
    if (this.mailListener) {
      console.log('🛑 Stopping email listener service...');
      this.mailListener.stop();
      this.isRunning = false;
      console.log('✅ Email listener service stopped');
    }
  }

  // FIXED: Handle incoming emails with proper error handling and filtering
  async handleNewEmail(mail) {
    try {
      // Skip if already processed
      if (mail.messageId && this.processedMessageIds.has(mail.messageId)) {
        console.log(`📧 Email already processed: ${mail.messageId} - skipping`);
        return;
      }

      console.log('📧 New email received:', mail.subject);
      console.log('From:', mail.from);

      // FIXED: Extract sender email address properly
      const senderEmail = this.extractEmailAddress(mail.from);
      if (!senderEmail) {
        console.log('❌ Could not extract sender email - skipping');
        return;
      }

      // CRITICAL: Only process emails from known users
      if (!this.userEmails.has(senderEmail.toLowerCase())) {
        console.log(`📧 Email from non-user: ${senderEmail} - skipping`);
        return;
      }

      console.log(`✅ Processing email from user: ${senderEmail}`);
      
      // Find user by email
      const sender = await prisma.user.findUnique({
        where: { email: senderEmail }
      });

      if (!sender) {
        console.log(`📧 User not found in database: ${senderEmail} - skipping`);
        return;
      }

      // FIXED: Extract recipient email properly
      const recipientEmail = this.extractEmailAddress(mail.to);
      if (!recipientEmail) {
        console.log('❌ Could not extract recipient email - skipping');
        return;
      }
      
      // Find staff/admin user who should receive this email
      const recipient = await this.findSystemUser(recipientEmail);
      
      if (!recipient) {
        console.log(`📧 Email sent to unknown system user: ${recipientEmail} - creating default admin`);
        const defaultAdmin = await this.ensureDefaultAdmin();
        if (defaultAdmin) {
          await this.saveIncomingEmail(mail, sender, defaultAdmin);
        }
        return;
      }

      // Save the email to database
      await this.saveIncomingEmail(mail, sender, recipient);
      
      // Mark as processed
      if (mail.messageId) {
        this.processedMessageIds.add(mail.messageId);
      }
      
      console.log(`✅ Email processed and saved for user: ${sender.email}`);
      
    } catch (error) {
      console.error('❌ Error processing incoming email:', error);
      // Don't crash the service, just log the error and continue
    }
  }

  // FIXED: Extract email address from mail-listener2 format
  extractEmailAddress(emailData) {
    try {
      if (!emailData) {
        console.log('❌ No email data provided');
        return null;
      }

      // Handle array format from mail-listener2
      if (Array.isArray(emailData)) {
        if (emailData.length === 0) {
          console.log('❌ Empty email array');
          return null;
        }
        
        // Take the first email address from the array
        const firstEmail = emailData[0];
        
        // If it's an object with address property
        if (typeof firstEmail === 'object' && firstEmail.address) {
          return firstEmail.address.toLowerCase().trim();
        }
        
        // If it's a string
        if (typeof firstEmail === 'string') {
          return this.parseEmailString(firstEmail);
        }
        
        console.log('❌ Unexpected email format in array:', firstEmail);
        return null;
      }

      // Handle string format
      if (typeof emailData === 'string') {
        return this.parseEmailString(emailData);
      }

      // Handle object format
      if (typeof emailData === 'object' && emailData.address) {
        return emailData.address.toLowerCase().trim();
      }

      console.log('❌ Unexpected email data format:', typeof emailData, emailData);
      return null;
      
    } catch (error) {
      console.error('❌ Error extracting email address:', error);
      return null;
    }
  }

  // Helper function to parse email strings
  parseEmailString(emailString) {
    try {
      if (!emailString || typeof emailString !== 'string') {
        return null;
      }

      // Extract email from "Name <email>" format
      const match = emailString.match(/<(.+)>/);
      if (match && match[1]) {
        return match[1].toLowerCase().trim();
      }
      
      // Return as-is if no brackets found (assuming it's just an email)
      return emailString.toLowerCase().trim();
    } catch (error) {
      console.error('❌ Error parsing email string:', error);
      return null;
    }
  }

  // FIXED: Save incoming email to database with proper data handling
  async saveIncomingEmail(mail, sender, recipient) {
    try {
      // FIXED: Handle attachments safely
      const attachments = [];
      if (mail.attachments && Array.isArray(mail.attachments)) {
        mail.attachments.forEach(att => {
          if (att && att.fileName) {
            attachments.push({
              filename: att.fileName,
              contentType: att.contentType || 'application/octet-stream',
              size: att.length || 0,
              path: att.path || null
            });
          }
        });
      }

      // FIXED: Handle email content safely
      const emailBody = mail.text || mail.html || '(No content)';
      const emailHtmlBody = mail.html || mail.text || '(No content)';

      // FIXED: Handle inReplyTo and references properly (convert arrays to strings)
      let inReplyTo = null;
      let references = null;

      if (mail.inReplyTo) {
        if (Array.isArray(mail.inReplyTo)) {
          inReplyTo = mail.inReplyTo[0] || null; // Take first element
        } else {
          inReplyTo = mail.inReplyTo;
        }
      }

      if (mail.references) {
        if (Array.isArray(mail.references)) {
          references = mail.references.join(' '); // Join array with spaces
        } else {
          references = mail.references;
        }
      }

      // Create email record
      const emailRecord = await prisma.email.create({
        data: {
          subject: mail.subject || '(No Subject)',
          body: emailBody,
          htmlBody: emailHtmlBody,
          direction: 'INBOUND',
          messageId: mail.messageId || null,
          inReplyTo: inReplyTo, // Now properly handled as string
          references: references, // Now properly handled as string
          senderId: sender.id,
          recipientId: recipient.id,
          attachments: attachments.length > 0 ? attachments : null,
          status: 'DELIVERED',
          deliveredAt: new Date(),
          sentAt: mail.date ? new Date(mail.date) : new Date(),
        }
      });

      // Update sender's last communication
      await prisma.user.update({
        where: { id: sender.id },
        data: {
          lastCommunication: new Date(),
          lastCommunicationMessage: mail.subject || '(No Subject)',
        }
      });

      // Create activity log
      await createActivity({
        type: 'EMAIL_RECEIVED',
        title: 'Email Received',
        description: `Email received: ${mail.subject || '(No Subject)'}`,
        userId: sender.id,
        performedBy: sender.id,
        metadata: {
          emailId: emailRecord.id,
          subject: mail.subject,
          hasAttachments: attachments.length > 0,
          attachmentCount: attachments.length,
        }
      });

      return emailRecord;
    } catch (error) {
      console.error('❌ Error saving incoming email:', error);
      throw error;
    }
  }

  // Find system user (admin/staff) by email
  async findSystemUser(email) {
    try {
      return await prisma.user.findFirst({
        where: {
          email: email.toLowerCase(),
          role: {
            in: ['ADMIN', 'STAFF']
          }
        }
      });
    } catch (error) {
      console.error('Error finding system user:', error);
      return null;
    }
  }

  // Ensure default admin exists for email handling
  async ensureDefaultAdmin() {
    try {
      // Try to find existing admin
      let admin = await prisma.user.findFirst({
        where: { role: 'ADMIN' }
      });

      // Create default admin if none exists
      if (!admin) {
        const bcrypt = require('bcrypt');
        const hashedPassword = await bcrypt.hash('admin123', 10);
        
        admin = await prisma.user.create({
          data: {
            firstName: 'System',
            lastName: 'Admin',
            email: process.env.EMAIL_USERNAME || 'admin@healthcarebizbrokers.com',
            password: hashedPassword,
            role: 'ADMIN',
            stage: 'Active',
          }
        });
        
        console.log('✅ Default admin created for email handling');
      }

      return admin;
    } catch (error) {
      console.error('❌ Error ensuring default admin:', error);
      return null;
    }
  }

  // Handle connection errors and reconnection
  handleError(err) {
    console.error('❌ Email listener error:', err);
    
    if (!this.isRunning && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.handleReconnect();
    }
  }

  // Handle reconnection logic
  handleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max reconnection attempts reached. Email listener stopped.');
      return;
    }

    this.reconnectAttempts++;
    console.log(`🔄 Attempting to reconnect email listener (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
    
    setTimeout(() => {
      if (!this.isRunning) {
        this.start();
      }
    }, this.reconnectInterval);
  }

  // Get service status
  getStatus() {
    return {
      isRunning: this.isRunning,
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts,
      userEmailsLoaded: this.userEmails.size,
      processedMessageIds: this.processedMessageIds.size,
    };
  }

  // Manual email sync (for testing or manual polling)
  async syncEmails() {
    if (!this.isRunning) {
      console.log('Email listener not running. Starting sync...');
      await this.start();
      return;
    }
    
    console.log('🔄 Manual email sync triggered');
    // Reload user emails in case new users were added
    await this.loadUserEmails();
  }

  // ADDED: Method to refresh user email cache
  async refreshUserCache() {
    console.log('🔄 Refreshing user email cache...');
    await this.loadUserEmails();
  }

  // ADDED: Clear processed message IDs cache
  clearProcessedCache() {
    this.processedMessageIds.clear();
    console.log('🔄 Processed message cache cleared');
  }
}

// Export singleton instance
const emailListenerService = new EmailListenerService();

module.exports = {
  EmailListenerService,
  emailListenerService
};