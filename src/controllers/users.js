// controllers/user.controller.js - Updated with better email conversation handling
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const { z } = require('zod');
const { generatePassword, getInitials, formatRelativeTime, getFormNameById } = require('../utils/helpers');
const { sendOnboardingEmail, sendRichTextEmail } = require('../services/emailService');
const { createActivity } = require('../services/activityService');

const prisma = new PrismaClient();

// Add new schema for email conversation
const getEmailConversationSchema = z.object({
  page: z.string().optional().default('1'),
  limit: z.string().optional().default('20'),
  type: z.enum(['all', 'sent', 'received']).optional().default('all'),
});

// Existing schemas...
const createUserSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address"),
  title: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  businessName: z.string().optional(),
  stage: z.string().optional(),
  agentId: z.string().optional(),
  leadSource: z.string().optional(),
  preferredContact: z.string().optional(),
  tags: z.array(z.string()).optional(),
  assignedForms: z.array(z.string()).optional(),
});

const sendEmailSchema = z.object({
  subject: z.string().min(1, "Subject is required"),
  body: z.string().min(1, "Body is required"),
  htmlBody: z.string().optional(),
  attachments: z.array(z.string()).optional(),
});

class UserController {
  constructor() {
    // Bind all methods to maintain 'this' context
    this.getUsers = this.getUsers.bind(this);
    this.createUser = this.createUser.bind(this);
    this.getUserById = this.getUserById.bind(this);
    this.sendEmailToUser = this.sendEmailToUser.bind(this);
    this.receiveEmailWebhook = this.receiveEmailWebhook.bind(this);
    this.addNote = this.addNote.bind(this);
    this.createTask = this.createTask.bind(this);
    this.getUserActivities = this.getUserActivities.bind(this);
    this.getEmailConversation = this.getEmailConversation.bind(this);
    this.markEmailAsRead = this.markEmailAsRead.bind(this);
  }

  // Get all users (Admin/Staff only)
  async getUsers(req, res) {
    try {
      const { page = 1, limit = 10, search = '' } = req.query;
      
      const users = await prisma.user.findMany({
        where: {
          NOT: {
            role: { in: ['SUPERADMIN', 'ADMIN'] },
          },
          OR: [
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { businessName: { contains: search, mode: 'insensitive' } },
          ],
        },
        include: {
          tags: true,
          assignedForms: true,
        },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
      });

      const total = await prisma.user.count({
        where: {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        },
      });

      // Format for frontend (matching the DataGrid structure)
      const formattedUsers = users.map(user => ({
        id: user.id,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        businessName: user.businessName || '',
        buyerSellerNDA: user.buyerSellerNDA,
        buyerSellerWorksheet: user.buyerSellerWorksheet,
        listingAgreement: user.listingAgreement,
        bizBenId: user.bizBenId || '',
        bizBuySellId: user.bizBuySellId || '',
        businessesForSaleId: user.businessesForSaleId || '',
        dealStreamId: user.dealStreamId || '',
        lastCommunication: user.lastCommunication ? formatRelativeTime(user.lastCommunication) : 'Never',
        lastCommunicationMessage: user.lastCommunicationMessage,
      }));

      res.json({
        users: formattedUsers,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          totalPages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error) {
      console.error('Get users error:', error);
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  }

  // Create new user
  async createUser(req, res) {
    try {
      const validatedData = createUserSchema.parse(req.body);
      
      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: validatedData.email },
      });

      if (existingUser) {
        return res.status(400).json({ error: 'User with this email already exists' });
      }

      // Generate secure password
      const tempPassword = generatePassword();
      const hashedPassword = await bcrypt.hash(tempPassword, 10);

      // Separate tags and assignedForms from main user data
      const { tags, assignedForms, ...userData } = validatedData;

      // Create user WITHOUT tags and assignedForms first
      const user = await prisma.user.create({
        data: {
          ...userData,
          password: hashedPassword,
          stage: validatedData.stage || 'New Lead',
        },
      });

      // Add tags if provided (create them separately)
      if (tags && tags.length > 0) {
        const tagData = tags.map(tag => ({
          name: tag,
          userId: user.id,
        }));
        
        await prisma.userTag.createMany({
          data: tagData,
        });
      }

      // Add assigned forms if provided (create them separately)
      if (assignedForms && assignedForms.length > 0) {
        const formData = assignedForms.map(formId => ({
          formId,
          formName: getFormNameById(formId),
          userId: user.id,
        }));
        
        await prisma.userForm.createMany({
          data: formData,
        });
      }

      // ADDED: Refresh email listener cache with new user
      try {
        const { emailListenerService } = require('../services/emailListener');
        await emailListenerService.refreshUserCache();
        console.log('✅ Email listener cache refreshed with new user');
      } catch (emailCacheError) {
        console.error('⚠️  Failed to refresh email cache:', emailCacheError);
        // Don't fail user creation if cache refresh fails
      }

      // Send onboarding email
      try {
        await sendOnboardingEmail(user.email, {
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          tempPassword,
          loginUrl: process.env.FRONTEND_URL + '/login',
        });
      } catch (emailError) {
        console.error('Failed to send onboarding email:', emailError);
        // Continue even if email fails
      }

      // Create default deal with all stages for the new user
      try {
        const defaultStages = [
          { name: 'Initial Assessment', description: 'Gather client information and business details', order: 1 },
          { name: 'Business Valuation', description: 'Analyze financials and determine business value', order: 2 },
          { name: 'Marketing Preparation', description: 'Prepare marketing materials and listing', order: 3 },
          { name: 'Buyer Qualification', description: 'Screen potential buyers for financial capability', order: 4 },
          { name: 'Due Diligence', description: 'Facilitate buyer review of business information', order: 5 },
          { name: 'Purchase Agreement', description: 'Negotiate and finalize purchase terms', order: 6 },
          { name: 'Financing & Escrow', description: 'Secure funding and establish escrow', order: 7 },
          { name: 'Closing & Transition', description: 'Complete sale and transition ownership', order: 8 },
        ];

        const deal = await prisma.deal.create({
          data: {
            name: `${user.firstName} ${user.lastName} - Business Sale`,
            description: `Deal for ${user.firstName} ${user.lastName}'s business sale`,
            userId: user.id,
            stages: {
              create: defaultStages
            }
          }
        });

        console.log(`✅ Created default deal with ${defaultStages.length} stages for user ${user.id}`);
      } catch (dealError) {
        console.error('Failed to create default deal:', dealError);
        // Continue even if deal creation fails
      }

      // Create activity log
      try {
        await createActivity({
          type: 'USER_CREATED',
          title: 'User Created',
          description: `New user ${user.firstName} ${user.lastName} created`,
          userId: user.id,
          performedBy: req.user?.id || 'System',
        });
      } catch (activityError) {
        console.error('Failed to create activity:', activityError);
        // Continue even if activity logging fails
      }

      res.status(201).json({
        message: 'User created successfully and onboarding email sent',
        user: {
          id: user.id,
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          role: user.role,
          stage: user.stage,
          tagsAdded: tags?.length || 0,
          formsAssigned: assignedForms?.length || 0,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: 'Validation failed',
          details: error.errors 
        });
      }
      console.error('Create user error:', error);
      res.status(500).json({ 
        error: 'Failed to create user',
        message: error.message 
      });
    }
  }

  // Get user details with activity data
  async getUserById(req, res) {
    try {
      const { id } = req.params;
      
      const user = await prisma.user.findUnique({
        where: { id },
        include: {
          tags: true,
          assignedForms: true,
          assignedTasks: {
            include: {
              createdBy: true,
            },
            orderBy: { createdAt: 'desc' },
          },
          activities: {
            orderBy: { createdAt: 'desc' },
            take: 30,
          },
          notes: {
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Format user data for frontend
      const formattedUser = {
        id: user.id,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        phone: user.phone,
        address: user.address,
        title: user.title,
        businessName: user.businessName,
        stage: user.stage,
        agentId: user.agentId,
        lastCommunication: user.lastCommunication,
        tags: user.tags.map(tag => tag.name),
        
        // Activity tab data - formatted for frontend components
        tasks: user.assignedTasks.map(task => ({
          id: task.id,
          title: task.title,
          description: task.description,
          status: task.status.toLowerCase(),
          priority: task.priority.toLowerCase(),
          dueDate: task.dueDate,
          relatedTo: task.relatedTo,
          assignee: req.user?.id === task.createdById ? 'You' : 'System',
        })),
        activities: user.activities.map(activity => ({
          id: activity.id,
          type: activity.type.toLowerCase().replace('_', ''),
          title: activity.title,
          content: activity.description || '',
          date: formatRelativeTime(activity.createdAt),
          user: {
            name: activity.performedBy === req.user?.id ? 'You' : activity.performedBy,
            avatar: getInitials(activity.performedBy),
          },
        })),
        notes: user.notes.map(note => ({
          id: note.id,
          content: note.content,
          contentType: note.contentType,
          isInternal: note.isInternal,
          createdAt: note.createdAt,
          createdBy: note.createdBy === req.user?.id ? 'You' : note.createdBy,
        })),
      };

      res.json(formattedUser);
    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({ error: 'Failed to fetch user' });
    }
  }

  // Send rich text email to user
  async sendEmailToUser(req, res) {
    try {
      const { id } = req.params;
      const validatedData = sendEmailSchema.parse(req.body);
      
      // For development: Use static sender ID or find/create a default admin
      let senderId = req.user?.id || req.body.senderId;
      
      // If no sender provided, create or find a default admin user
      if (!senderId) {
        // Try to find an existing admin user
        let adminUser = await prisma.user.findFirst({
          where: { role: 'ADMIN' }
        });
        
        // If no admin exists, create a default one for development
        if (!adminUser) {
          console.log('No admin user found, creating default admin for development...');
          const hashedPassword = await bcrypt.hash('admin123', 10);
          
          adminUser = await prisma.user.create({
            data: {
              firstName: 'System',
              lastName: 'Admin',
              email: 'admin@healthcarebizbrokers.com',
              password: hashedPassword,
              role: 'ADMIN',
              stage: 'Active',
            }
          });
          console.log('Default admin created with email: admin@healthcarebizbrokers.com');
        }
        
        senderId = adminUser.id;
      }

      // Verify sender exists
      const sender = await prisma.user.findUnique({
        where: { id: senderId }
      });

      if (!sender) {
        return res.status(400).json({ 
          error: 'Invalid sender',
          message: 'Sender user not found' 
        });
      }

      // Get recipient user
      const recipient = await prisma.user.findUnique({
        where: { id },
      });

      if (!recipient) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Create email record
      const email = await prisma.email.create({
        data: {
          subject: validatedData.subject,
          body: validatedData.body,
          htmlBody: validatedData.htmlBody || validatedData.body,
          direction: 'OUTBOUND',
          senderId,
          recipientId: id,
          attachments: validatedData.attachments?.length ? validatedData.attachments : null,
        },
        include: {
          sender: true,
          recipient: true,
        },
      });

      // Send actual email using email service
      try {
        await sendRichTextEmail({
          to: recipient.email,
          subject: validatedData.subject,
          htmlBody: validatedData.htmlBody || validatedData.body,
          plainBody: validatedData.body,
          attachments: validatedData.attachments || [],
          replyTo: sender.email,
        });

        // Update email status to delivered
        await prisma.email.update({
          where: { id: email.id },
          data: { status: 'DELIVERED', deliveredAt: new Date() },
        });

      } catch (emailError) {
        console.error('Email sending failed:', emailError);
        // Update email status to failed
        await prisma.email.update({
          where: { id: email.id },
          data: { status: 'FAILED' },
        });
      }

      // Update last communication
      await prisma.user.update({
        where: { id },
        data: {
          lastCommunication: new Date(),
          lastCommunicationMessage: validatedData.subject,
        },
      });

      // Create activity log
      try {
        await createActivity({
          type: 'EMAIL_SENT',
          title: 'Email Sent',
          description: `Email sent: ${validatedData.subject}`,
          userId: id,
          performedBy: senderId,
          metadata: {
            emailId: email.id,
            subject: validatedData.subject,
            hasAttachments: validatedData.attachments?.length > 0,
          },
        });
      } catch (activityError) {
        console.error('Failed to create activity:', activityError);
      }

      res.status(201).json({
        message: 'Email sent successfully',
        email: {
          id: email.id,
          subject: email.subject,
          sentAt: email.sentAt,
          status: email.status,
          sender: `${email.sender.firstName} ${email.sender.lastName}`,
          recipient: `${email.recipient.firstName} ${email.recipient.lastName}`,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: 'Validation failed',
          details: error.errors 
        });
      }
      console.error('Send email error:', error);
      res.status(500).json({ 
        error: 'Failed to send email',
        message: error.message 
      });
    }
  }

  // Handle incoming email webhook (for receiving emails FROM users)
  async receiveEmailWebhook(req, res) {
    try {
      const { 
        from, 
        to, 
        subject, 
        body, 
        htmlBody,
        messageId,
        references,
        inReplyTo,
        attachments = []
      } = req.body;

      // Find the user who sent this email
      const sender = await prisma.user.findUnique({
        where: { email: from },
      });

      if (!sender) {
        console.log(`Received email from unknown user: ${from}`);
        return res.status(200).json({ message: 'Email processed' });
      }

      // Find the recipient (admin/staff user)
      const recipient = await prisma.user.findUnique({
        where: { email: to },
      });

      if (!recipient) {
        console.log(`Email sent to unknown recipient: ${to}`);
        return res.status(200).json({ message: 'Email processed' });
      }

      // Create email record for received email
      const email = await prisma.email.create({
        data: {
          subject,
          body,
          htmlBody,
          direction: 'INBOUND',
          messageId,
          references,
          inReplyTo,
          senderId: sender.id,
          recipientId: recipient.id,
          attachments: attachments.length > 0 ? attachments : null,
          status: 'DELIVERED',
          deliveredAt: new Date(),
        },
      });

      // Update last communication for sender
      await prisma.user.update({
        where: { id: sender.id },
        data: {
          lastCommunication: new Date(),
          lastCommunicationMessage: subject,
        },
      });

      // Create activity log
      await createActivity({
        type: 'EMAIL_RECEIVED',
        title: 'Email Received',
        description: `Email received: ${subject}`,
        userId: sender.id,
        performedBy: sender.id,
        metadata: {
          emailId: email.id,
          subject,
          hasAttachments: attachments.length > 0,
        },
      });

      res.status(200).json({ message: 'Email received and processed' });
    } catch (error) {
      console.error('Receive email webhook error:', error);
      res.status(500).json({ error: 'Failed to process incoming email' });
    }
  }

  // Get email conversation for user (NEW/IMPROVED)
  async getEmailConversation(req, res) {
    try {
      const { id } = req.params;
      const validatedQuery = getEmailConversationSchema.parse(req.query);
      const { page, limit, type } = validatedQuery;
      
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);

      // Build where clause based on type filter
      let whereClause = {
        OR: [
          { senderId: id },
          { recipientId: id },
        ],
      };

      if (type === 'sent') {
        whereClause = { senderId: id };
      } else if (type === 'received') {
        whereClause = { recipientId: id };
      }

      const emails = await prisma.email.findMany({
        where: whereClause,
        include: {
          sender: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true,
            }
          },
          recipient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true,
            }
          },
        },
        orderBy: { sentAt: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      });

      const total = await prisma.email.count({
        where: whereClause,
      });

      const formattedEmails = emails.map(email => ({
        id: email.id,
        subject: email.subject,
        body: email.body,
        htmlBody: email.htmlBody,
        direction: email.direction,
        status: email.status,
        sentAt: email.sentAt,
        readAt: email.readAt,
        deliveredAt: email.deliveredAt,
        attachments: email.attachments,
        messageId: email.messageId,
        inReplyTo: email.inReplyTo,
        references: email.references,
        sender: {
          id: email.sender.id,
          name: `${email.sender.firstName} ${email.sender.lastName}`,
          email: email.sender.email,
          avatar: getInitials(`${email.sender.firstName} ${email.sender.lastName}`),
          role: email.sender.role,
        },
        recipient: {
          id: email.recipient.id,
          name: `${email.recipient.firstName} ${email.recipient.lastName}`,
          email: email.recipient.email,
          avatar: getInitials(`${email.recipient.firstName} ${email.recipient.lastName}`),
          role: email.recipient.role,
        },
        // Helper fields for frontend
        isFromUser: email.direction === 'INBOUND',
        isToUser: email.direction === 'OUTBOUND',
        timeAgo: formatRelativeTime(email.sentAt),
      }));

      res.json({
        emails: formattedEmails,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
        summary: {
          total,
          sent: await prisma.email.count({ where: { senderId: id } }),
          received: await prisma.email.count({ where: { recipientId: id } }),
          unread: await prisma.email.count({ 
            where: { 
              recipientId: id, 
              readAt: null,
              direction: 'INBOUND'
            } 
          }),
        },
      });
    } catch (error) {
      console.error('Get email conversation error:', error);
      res.status(500).json({ error: 'Failed to fetch email conversation' });
    }
  }

  // Mark email as read
  async markEmailAsRead(req, res) {
    try {
      const { emailId } = req.params;
      
      const email = await prisma.email.update({
        where: { id: emailId },
        data: { readAt: new Date() },
        include: {
          sender: true,
          recipient: true,
        },
      });

      res.json({
        message: 'Email marked as read',
        email: {
          id: email.id,
          readAt: email.readAt,
        },
      });
    } catch (error) {
      console.error('Mark email as read error:', error);
      res.status(500).json({ error: 'Failed to mark email as read' });
    }
  }

  // Add note to user (supports rich text)
  async addNote(req, res) {
    try {
      const { id } = req.params;
      const { content, contentType = 'html', isInternal = false } = req.body;
      const createdBy = req.user?.id || id; // fallback when auth is disabled

      // if (!createdBy) {
      //   return res.status(401).json({ error: 'Unauthorized' });
      // }

      if (!content) {
        return res.status(400).json({ error: 'Note content is required' });
      }

      const note = await prisma.note.create({
        data: {
          content,
          contentType,
          isInternal,
          userId: id,
          createdBy,
        },
      });

      // Create activity log
      await createActivity({
        type: 'NOTE_ADDED',
        title: 'Note Added',
        description: `Note added: ${content.replace(/<[^>]*>/g, '').substring(0, 50)}...`,
        userId: id,
        performedBy: createdBy,
        metadata: {
          noteId: note.id,
          isInternal,
          contentType,
        },
      });

      res.status(201).json({
        message: 'Note added successfully',
        note: {
          id: note.id,
          content: note.content,
          contentType: note.contentType,
          isInternal: note.isInternal,
          createdAt: note.createdAt,
          createdBy: 'You',
        },
      });
    } catch (error) {
      console.error('Add note error:', error);
      res.status(500).json({ error: 'Failed to add note' });
    }
  }

  // Create task for user
  async createTask(req, res) {
    try {
      const { id } = req.params;
      const { title, description, priority = 'MEDIUM', dueDate, relatedTo } = req.body;
      const createdById = req.user?.id;

      // if (!createdById) {
      //   return res.status(401).json({ error: 'Unauthorized' });
      // }

      if (!title) {
        return res.status(400).json({ error: 'Task title is required' });
      }

      const task = await prisma.task.create({
        data: {
          title,
          description,
          priority,
          dueDate: dueDate ? new Date(dueDate) : null,
          relatedTo,
          assignedToId: id,
          createdById,
        },
        include: {
          assignedTo: true,
          createdBy: true,
        },
      });

      // Create activity log
      await createActivity({
        type: 'TASK_CREATED',
        title: 'Task Created',
        description: `Task assigned: ${title}`,
        userId: id,
        performedBy: createdById,
        metadata: {
          taskId: task.id,
          priority,
          dueDate,
          relatedTo,
        },
      });

      res.status(201).json({
        message: 'Task created successfully',
        task: {
          id: task.id,
          title: task.title,
          description: task.description,
          status: task.status.toLowerCase(),
          priority: task.priority.toLowerCase(),
          dueDate: task.dueDate,
          relatedTo: task.relatedTo,
          assignee: 'You',
        },
      });
    } catch (error) {
      console.error('Create task error:', error);
      res.status(500).json({ error: 'Failed to create task' });
    }
  }

  // Get user activities (for activity timeline)
  async getUserActivities(req, res) {
    try {
      const { id } = req.params;
      const { page = 1, limit = 20 } = req.query;

      const activities = await prisma.activity.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      });

      // Format activities for frontend (matching ActivityTab component)
      const formattedActivities = activities.map(activity => ({
        id: activity.id,
        type: activity.type.toLowerCase().replace('_', ''),
        title: activity.title,
        content: activity.description || '',
        date: formatRelativeTime(activity.createdAt),
        user: {
          name: activity.performedBy === req.user?.id ? 'You' : activity.performedBy,
          avatar: getInitials(activity.performedBy),
        },
      }));

      res.json(formattedActivities);
    } catch (error) {
      console.error('Get activities error:', error);
      res.status(500).json({ error: 'Failed to fetch activities' });
    }
  }
}

module.exports = { UserController };