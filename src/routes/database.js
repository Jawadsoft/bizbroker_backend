// routes/database.js - Database Inspector API Routes
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const router = express.Router();
const prisma = new PrismaClient();

// Get all database tables
router.get('/tables', async (req, res) => {
  try {
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `;
    
    res.json({
      success: true,
      tables: tables.map(t => t.table_name)
    });
  } catch (error) {
    console.error('Error fetching tables:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tables',
      message: error.message
    });
  }
});

// Execute SQL query
router.post('/query', async (req, res) => {
  try {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'SQL query is required'
      });
    }

    // Security check - only allow SELECT queries for safety
    const trimmedQuery = query.trim().toLowerCase();
    if (!trimmedQuery.startsWith('select') && 
        !trimmedQuery.startsWith('with') &&
        !trimmedQuery.startsWith('show') &&
        !trimmedQuery.startsWith('describe') &&
        !trimmedQuery.startsWith('explain')) {
      return res.status(400).json({
        success: false,
        error: 'Only SELECT, WITH, SHOW, DESCRIBE, and EXPLAIN queries are allowed'
      });
    }

    const result = await prisma.$queryRawUnsafe(query);
    
    res.json({
      success: true,
      result: result,
      rowCount: Array.isArray(result) ? result.length : 0
    });
  } catch (error) {
    console.error('Error executing query:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to execute query',
      message: error.message
    });
  }
});

// Create test data
router.post('/test-data', async (req, res) => {
  try {
    // Create a test user
    const testUser = await prisma.user.create({
      data: {
        firstName: 'Test',
        lastName: 'User',
        email: `test-${Date.now()}@example.com`,
        password: 'hashedpassword123',
        role: 'CLIENT',
        status: 'ACTIVE'
      }
    });

    // Create a test task
    const testTask = await prisma.task.create({
      data: {
        title: 'Test Task',
        description: 'This is a test task created by the database inspector',
        status: 'PENDING',
        priority: 'MEDIUM',
        assignedToId: testUser.id,
        createdById: testUser.id
      }
    });

    // Create a test note
    const testNote = await prisma.note.create({
      data: {
        content: 'This is a test note created by the database inspector',
        contentType: 'html',
        isInternal: false,
        userId: testUser.id,
        createdBy: testUser.id
      }
    });

    // Create a test activity
    const testActivity = await prisma.activity.create({
      data: {
        type: 'USER_CREATED',
        title: 'Test User Created',
        description: 'Test user created via database inspector',
        userId: testUser.id,
        performedBy: testUser.id
      }
    });

    res.json({
      success: true,
      message: 'Test data created successfully',
      data: {
        user: testUser,
        task: testTask,
        note: testNote,
        activity: testActivity
      }
    });
  } catch (error) {
    console.error('Error creating test data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create test data',
      message: error.message
    });
  }
});

// Reset database (recreate all tables)
router.post('/reset', async (req, res) => {
  try {
    // This is a dangerous operation - only allow in development
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        error: 'Database reset is not allowed in production'
      });
    }

    // Delete all data from all tables
    await prisma.$transaction([
      prisma.activity.deleteMany(),
      prisma.note.deleteMany(),
      prisma.task.deleteMany(),
      prisma.email.deleteMany(),
      prisma.appointment.deleteMany(),
      prisma.userTag.deleteMany(),
      prisma.userForm.deleteMany(),
      prisma.userFile.deleteMany(),
      prisma.dealDocument.deleteMany(),
      prisma.dealStage.deleteMany(),
      prisma.deal.deleteMany(),
      prisma.business.deleteMany(),
      prisma.emailTemplate.deleteMany(),
      prisma.user.deleteMany()
    ]);

    res.json({
      success: true,
      message: 'Database reset successfully - all data deleted'
    });
  } catch (error) {
    console.error('Error resetting database:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset database',
      message: error.message
    });
  }
});

// Delete all data (but keep table structure)
router.post('/delete-all', async (req, res) => {
  try {
    // Delete all data from all tables
    await prisma.$transaction([
      prisma.activity.deleteMany(),
      prisma.note.deleteMany(),
      prisma.task.deleteMany(),
      prisma.email.deleteMany(),
      prisma.appointment.deleteMany(),
      prisma.userTag.deleteMany(),
      prisma.userForm.deleteMany(),
      prisma.userFile.deleteMany(),
      prisma.dealDocument.deleteMany(),
      prisma.dealStage.deleteMany(),
      prisma.deal.deleteMany(),
      prisma.business.deleteMany(),
      prisma.emailTemplate.deleteMany(),
      prisma.user.deleteMany()
    ]);

    res.json({
      success: true,
      message: 'All data deleted successfully - table structure preserved'
    });
  } catch (error) {
    console.error('Error deleting all data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete all data',
      message: error.message
    });
  }
});

// Get database statistics
router.get('/stats', async (req, res) => {
  try {
    const stats = await prisma.$transaction([
      prisma.user.count(),
      prisma.email.count(),
      prisma.task.count(),
      prisma.note.count(),
      prisma.activity.count(),
      prisma.appointment.count(),
      prisma.deal.count(),
      prisma.business.count()
    ]);

    const [userCount, emailCount, taskCount, noteCount, activityCount, appointmentCount, dealCount, businessCount] = stats;

    res.json({
      success: true,
      stats: {
        users: userCount,
        emails: emailCount,
        tasks: taskCount,
        notes: noteCount,
        activities: activityCount,
        appointments: appointmentCount,
        deals: dealCount,
        businesses: businessCount
      }
    });
  } catch (error) {
    console.error('Error fetching database stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch database statistics',
      message: error.message
    });
  }
});

// Get table structure
router.get('/table-structure/:tableName', async (req, res) => {
  try {
    const { tableName } = req.params;
    
    const columns = await prisma.$queryRaw`
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default,
        character_maximum_length
      FROM information_schema.columns 
      WHERE table_name = ${tableName}
      AND table_schema = 'public'
      ORDER BY ordinal_position;
    `;

    res.json({
      success: true,
      tableName,
      columns
    });
  } catch (error) {
    console.error('Error fetching table structure:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch table structure',
      message: error.message
    });
  }
});

// Run database migrations
router.post('/migrate', async (req, res) => {
  try {
    console.log('🚀 Starting database migration...');
    
    // Check if we're in production
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        error: 'Manual migrations are not allowed in production. Use automated deployment.'
      });
    }

    // Execute the complete database setup migration
    const migrationSQL = `
      -- Migration: Complete Database Setup
      -- This migration creates all necessary tables for the Bizbroker CRM system

      -- CreateEnum
      CREATE TYPE "UserRole" AS ENUM ('SUPERADMIN', 'ADMIN', 'STAFF', 'CLIENT');

      -- CreateEnum
      CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'PENDING');

      -- CreateEnum
      CREATE TYPE "ListingAgreementType" AS ENUM ('YES', 'NO', 'NA');

      -- CreateEnum
      CREATE TYPE "AppointmentType" AS ENUM ('IN_PERSON', 'VIDEO', 'PHONE');

      -- CreateEnum
      CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'CANCELLED', 'COMPLETED');

      -- CreateEnum
      CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED');

      -- CreateEnum
      CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

      -- CreateEnum
      CREATE TYPE "EmailStatus" AS ENUM ('DRAFT', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'BOUNCED');

      -- CreateEnum
      CREATE TYPE "EmailDirection" AS ENUM ('INBOUND', 'OUTBOUND');

      -- CreateEnum
      CREATE TYPE "ActivityType" AS ENUM (
        'USER_CREATED', 'USER_UPDATED', 'USER_DELETED',
        'EMAIL_SENT', 'EMAIL_RECEIVED', 'EMAIL_OPENED', 'EMAIL_CLICKED',
        'NOTE_ADDED', 'NOTE_UPDATED', 'NOTE_DELETED',
        'TASK_CREATED', 'TASK_UPDATED', 'TASK_COMPLETED', 'TASK_DELETED',
        'APPOINTMENT_SCHEDULED', 'APPOINTMENT_UPDATED', 'APPOINTMENT_CANCELLED', 'APPOINTMENT_COMPLETED', 'APPOINTMENT_NO_SHOW',
        'FORM_SUBMITTED', 'FORM_ASSIGNED',
        'DEAL_CREATED', 'DEAL_UPDATED', 'DEAL_STAGE_COMPLETED', 'DEAL_DOCUMENT_UPLOADED', 'DEAL_DOCUMENT_DELETED', 'DEAL_DOCUMENT_STATUS_UPDATED',
        'FILE_UPLOADED',
        'LOGIN', 'LOGOUT', 'PROFILE_UPDATED'
      );

      -- CreateEnum
      CREATE TYPE "DealStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED', 'ON_HOLD');

      -- CreateEnum
      CREATE TYPE "StageStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED');

      -- CreateEnum
      CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED');

      -- CreateTable
      CREATE TABLE IF NOT EXISTS "users" (
          "id" TEXT NOT NULL,
          "email" TEXT NOT NULL,
          "password" TEXT NOT NULL,
          "firstName" TEXT NOT NULL,
          "lastName" TEXT NOT NULL,
          "title" TEXT,
          "phone" TEXT,
          "address" TEXT,
          "city" TEXT,
          "state" TEXT,
          "zipCode" TEXT,
          "businessName" TEXT,
          "buyerSellerNDA" BOOLEAN NOT NULL DEFAULT false,
          "buyerSellerWorksheet" BOOLEAN NOT NULL DEFAULT false,
          "listingAgreement" "ListingAgreementType" NOT NULL DEFAULT 'NA',
          "bizBenId" TEXT,
          "bizBuySellId" TEXT,
          "businessesForSaleId" TEXT,
          "dealStreamId" TEXT,
          "role" "UserRole" NOT NULL DEFAULT 'CLIENT',
          "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
          "stage" TEXT,
          "agentId" TEXT,
          "leadSource" TEXT,
          "preferredContact" TEXT DEFAULT 'Email',
          "lastCommunication" TIMESTAMP(3),
          "lastCommunicationMessage" TEXT,
          "emailWebhookSecret" TEXT,
          "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
          "lastLogin" TIMESTAMP(3),
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL,

          CONSTRAINT "users_pkey" PRIMARY KEY ("id")
      );

      -- CreateTable
      CREATE TABLE IF NOT EXISTS "appointments" (
          "id" TEXT NOT NULL,
          "title" TEXT NOT NULL,
          "clientId" TEXT NOT NULL,
          "date" TIMESTAMP(3) NOT NULL,
          "startTime" TIMESTAMP(3) NOT NULL,
          "endTime" TIMESTAMP(3) NOT NULL,
          "type" "AppointmentType" NOT NULL DEFAULT 'VIDEO',
          "location" TEXT,
          "notes" TEXT,
          "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL,

          CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
      );

      -- CreateTable
      CREATE TABLE IF NOT EXISTS "emails" (
          "id" TEXT NOT NULL,
          "subject" TEXT NOT NULL,
          "body" TEXT NOT NULL,
          "htmlBody" TEXT,
          "direction" "EmailDirection" NOT NULL DEFAULT 'OUTBOUND',
          "threadId" TEXT,
          "inReplyTo" TEXT,
          "references" TEXT,
          "senderId" TEXT NOT NULL,
          "recipientId" TEXT NOT NULL,
          "messageId" TEXT,
          "status" "EmailStatus" NOT NULL DEFAULT 'SENT',
          "readAt" TIMESTAMP(3),
          "deliveredAt" TIMESTAMP(3),
          "attachments" JSONB,
          "providerData" JSONB,
          "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

          CONSTRAINT "emails_pkey" PRIMARY KEY ("id")
      );

      -- CreateTable
      CREATE TABLE IF NOT EXISTS "tasks" (
          "id" TEXT NOT NULL,
          "title" TEXT NOT NULL,
          "description" TEXT,
          "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
          "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
          "dueDate" TIMESTAMP(3),
          "completedAt" TIMESTAMP(3),
          "relatedTo" TEXT,
          "assignedToId" TEXT NOT NULL,
          "createdById" TEXT NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL,

          CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
      );

      -- CreateTable
      CREATE TABLE IF NOT EXISTS "notes" (
          "id" TEXT NOT NULL,
          "content" TEXT NOT NULL,
          "contentType" TEXT NOT NULL DEFAULT 'html',
          "isInternal" BOOLEAN NOT NULL DEFAULT false,
          "userId" TEXT NOT NULL,
          "createdBy" TEXT NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL,

          CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
      );

      -- CreateTable
      CREATE TABLE IF NOT EXISTS "activities" (
          "id" TEXT NOT NULL,
          "type" "ActivityType" NOT NULL,
          "title" TEXT NOT NULL,
          "description" TEXT,
          "metadata" JSONB,
          "userId" TEXT NOT NULL,
          "performedBy" TEXT NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

          CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
      );

      -- CreateTable
      CREATE TABLE IF NOT EXISTS "user_tags" (
          "id" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "userId" TEXT NOT NULL,

          CONSTRAINT "user_tags_pkey" PRIMARY KEY ("id")
      );

      -- CreateTable
      CREATE TABLE IF NOT EXISTS "user_forms" (
          "id" TEXT NOT NULL,
          "formId" TEXT NOT NULL,
          "formName" TEXT NOT NULL,
          "userId" TEXT NOT NULL,

          CONSTRAINT "user_forms_pkey" PRIMARY KEY ("id")
      );

      -- CreateTable
      CREATE TABLE IF NOT EXISTS "email_templates" (
          "id" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "subject" TEXT NOT NULL,
          "htmlBody" TEXT NOT NULL,
          "variables" TEXT[],
          "isActive" BOOLEAN NOT NULL DEFAULT true,
          "createdBy" TEXT NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL,

          CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
      );

      -- CreateTable
      CREATE TABLE IF NOT EXISTS "deals" (
          "id" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "description" TEXT,
          "status" "DealStatus" NOT NULL DEFAULT 'ACTIVE',
          "userId" TEXT NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL,

          CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
      );

      -- CreateTable
      CREATE TABLE IF NOT EXISTS "deal_stages" (
          "id" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "description" TEXT NOT NULL,
          "order" INTEGER NOT NULL,
          "status" "StageStatus" NOT NULL DEFAULT 'PENDING',
          "progress" INTEGER NOT NULL DEFAULT 0,
          "dealId" TEXT NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL,

          CONSTRAINT "deal_stages_pkey" PRIMARY KEY ("id")
      );

      -- CreateTable
      CREATE TABLE IF NOT EXISTS "deal_documents" (
          "id" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "originalName" TEXT NOT NULL,
          "fileUrl" TEXT NOT NULL,
          "fileSize" INTEGER NOT NULL,
          "mimeType" TEXT NOT NULL,
          "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
          "dealId" TEXT NOT NULL,
          "stageId" TEXT,
          "uploadedBy" TEXT NOT NULL,
          "uploadDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL,

          CONSTRAINT "deal_documents_pkey" PRIMARY KEY ("id")
      );

      -- CreateTable
      CREATE TABLE IF NOT EXISTS "user_files" (
          "id" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "originalName" TEXT NOT NULL,
          "fileUrl" TEXT NOT NULL,
          "fileSize" INTEGER NOT NULL,
          "mimeType" TEXT NOT NULL,
          "uploadedBy" TEXT NOT NULL,
          "uploadDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "userId" TEXT NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL,

          CONSTRAINT "user_files_pkey" PRIMARY KEY ("id")
      );

      -- CreateTable
      CREATE TABLE IF NOT EXISTS "businesses" (
          "id" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "description" TEXT,
          "image" TEXT,
          "state" TEXT NOT NULL,
          "cashflow" DOUBLE PRECISION,
          "review" DOUBLE PRECISION,
          "industry" TEXT,
          "address" TEXT,
          "phone" TEXT,
          "email" TEXT,
          "website" TEXT,
          "foundedYear" INTEGER,
          "employeeCount" INTEGER,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL,

          CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
      );

      -- CreateIndex
      CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");
      CREATE UNIQUE INDEX IF NOT EXISTS "email_templates_name_key" ON "email_templates"("name");

      -- AddForeignKey
      DO $$ 
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'appointments_clientId_fkey') THEN
              ALTER TABLE "appointments" ADD CONSTRAINT "appointments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
          END IF;
      END $$;

      DO $$ 
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'emails_senderId_fkey') THEN
              ALTER TABLE "emails" ADD CONSTRAINT "emails_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
          END IF;
      END $$;

      DO $$ 
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'emails_recipientId_fkey') THEN
              ALTER TABLE "emails" ADD CONSTRAINT "emails_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
          END IF;
      END $$;

      DO $$ 
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'tasks_assignedToId_fkey') THEN
              ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
          END IF;
      END $$;

      DO $$ 
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'tasks_createdById_fkey') THEN
              ALTER TABLE "tasks" ADD CONSTRAINT "tasks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
          END IF;
      END $$;

      DO $$ 
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'notes_userId_fkey') THEN
              ALTER TABLE "notes" ADD CONSTRAINT "notes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
          END IF;
      END $$;

      DO $$ 
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'activities_userId_fkey') THEN
              ALTER TABLE "activities" ADD CONSTRAINT "activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
          END IF;
      END $$;

      DO $$ 
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'user_tags_userId_fkey') THEN
              ALTER TABLE "user_tags" ADD CONSTRAINT "user_tags_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
          END IF;
      END $$;

      DO $$ 
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'user_forms_userId_fkey') THEN
              ALTER TABLE "user_forms" ADD CONSTRAINT "user_forms_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
          END IF;
      END $$;

      DO $$ 
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'deals_userId_fkey') THEN
              ALTER TABLE "deals" ADD CONSTRAINT "deals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
          END IF;
      END $$;

      DO $$ 
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'deal_stages_dealId_fkey') THEN
              ALTER TABLE "deal_stages" ADD CONSTRAINT "deal_stages_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
      END $$;

      DO $$ 
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'deal_documents_dealId_fkey') THEN
              ALTER TABLE "deal_documents" ADD CONSTRAINT "deal_documents_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
      END $$;

      DO $$ 
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'deal_documents_stageId_fkey') THEN
              ALTER TABLE "deal_documents" ADD CONSTRAINT "deal_documents_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "deal_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
          END IF;
      END $$;

      DO $$ 
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'user_files_userId_fkey') THEN
              ALTER TABLE "user_files" ADD CONSTRAINT "user_files_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
      END $$;
    `;

    // Execute the migration
    await prisma.$executeRawUnsafe(migrationSQL);

    // Verify tables were created
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `;

    console.log('✅ Database migration completed successfully');
    console.log('📋 Created tables:', tables.map(t => t.table_name));

    res.json({
      success: true,
      message: 'Database migration completed successfully!',
      tablesCreated: tables.map(t => t.table_name),
      tableCount: tables.length
    });

  } catch (error) {
    console.error('❌ Migration failed:', error);
    res.status(500).json({
      success: false,
      error: 'Migration failed',
      message: error.message
    });
  }
});

// Check migration status
router.get('/migration-status', async (req, res) => {
  try {
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `;

    const expectedTables = [
      'users', 'appointments', 'emails', 'tasks', 'notes', 'activities',
      'user_tags', 'user_forms', 'email_templates', 'deals', 'deal_stages',
      'deal_documents', 'user_files', 'businesses'
    ];

    const missingTables = expectedTables.filter(table => 
      !tables.some(t => t.table_name === table)
    );

    res.json({
      success: true,
      tables: tables.map(t => t.table_name),
      expectedTables,
      missingTables,
      isComplete: missingTables.length === 0,
      migrationNeeded: missingTables.length > 0
    });

  } catch (error) {
    console.error('Error checking migration status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check migration status',
      message: error.message
    });
  }
});

module.exports = router;

