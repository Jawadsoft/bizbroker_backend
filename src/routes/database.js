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

module.exports = router;

