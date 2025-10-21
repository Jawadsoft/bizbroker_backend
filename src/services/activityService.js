// services/activity.service.js
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function createActivity(data) {
  try {
    const activity = await prisma.activity.create({
      data: {
        type: data.type,
        title: data.title,
        description: data.description,
        userId: data.userId,
        performedBy: data.performedBy || data.userId, // default to user when auth disabled
        metadata: data.metadata || null,
      },
    });

    console.log(`Activity created: ${data.type} for user ${data.userId}`);
    return activity;
  } catch (error) {
    console.error('Failed to create activity:', error);
    throw error;
  }
}

// Bulk create activities for multiple users
async function createBulkActivities(activities) {
  try {
    const result = await prisma.activity.createMany({
      data: activities.map(activity => ({
        type: activity.type,
        title: activity.title,
        description: activity.description,
        userId: activity.userId,
        performedBy: activity.performedBy,
        metadata: activity.metadata || null,
      })),
    });

    console.log(`${result.count} activities created`);
    return result;
  } catch (error) {
    console.error('Failed to create bulk activities:', error);
    throw error;
  }
}

// Get activities for a user with pagination
async function getUserActivities(userId, page = 1, limit = 20, activityType) {
  try {
    const where = { userId };
    
    if (activityType) {
      where.type = activityType;
    }

    const activities = await prisma.activity.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const total = await prisma.activity.count({ where });

    return {
      activities,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    console.error('Failed to get user activities:', error);
    throw error;
  }
}

// Get system-wide activity summary
async function getActivitySummary(days = 7) {
  try {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const summary = await prisma.activity.groupBy({
      by: ['type'],
      where: {
        createdAt: {
          gte: since,
        },
      },
      _count: {
        type: true,
      },
    });

    return summary.map(item => ({
      type: item.type,
      count: item._count.type,
    }));
  } catch (error) {
    console.error('Failed to get activity summary:', error);
    throw error;
  }
}

// Helper functions for common activity types
const ActivityHelpers = {
  // Email related activities
  async logEmailSent(userId, performedBy, emailData) {
    return createActivity({
      type: 'EMAIL_SENT',
      title: 'Email Sent',
      description: `Email sent: ${emailData.subject}`,
      userId,
      performedBy,
      metadata: {
        emailId: emailData.id,
        subject: emailData.subject,
        hasAttachments: emailData.attachments?.length > 0,
      },
    });
  },

  async logEmailReceived(userId, emailData) {
    return createActivity({
      type: 'EMAIL_RECEIVED',
      title: 'Email Received',
      description: `Email received: ${emailData.subject}`,
      userId,
      performedBy: userId,
      metadata: {
        emailId: emailData.id,
        subject: emailData.subject,
        hasAttachments: emailData.attachments?.length > 0,
      },
    });
  },

  // Note related activities
  async logNoteAdded(userId, performedBy, noteData) {
    return createActivity({
      type: 'NOTE_ADDED',
      title: 'Note Added',
      description: `Note added: ${noteData.content.replace(/<[^>]*>/g, '').substring(0, 50)}...`,
      userId,
      performedBy,
      metadata: {
        noteId: noteData.id,
        isInternal: noteData.isInternal,
        contentType: noteData.contentType,
      },
    });
  },

  // Task related activities
  async logTaskCreated(userId, performedBy, taskData) {
    return createActivity({
      type: 'TASK_CREATED',
      title: 'Task Created',
      description: `Task assigned: ${taskData.title}`,
      userId,
      performedBy,
      metadata: {
        taskId: taskData.id,
        priority: taskData.priority,
        dueDate: taskData.dueDate,
        relatedTo: taskData.relatedTo,
      },
    });
  },

  async logTaskCompleted(userId, performedBy, taskData) {
    return createActivity({
      type: 'TASK_COMPLETED',
      title: 'Task Completed',
      description: `Task completed: ${taskData.title}`,
      userId,
      performedBy,
      metadata: {
        taskId: taskData.id,
        completedAt: new Date(),
      },
    });
  },

  // User related activities
  async logUserCreated(userId, performedBy, userData) {
    return createActivity({
      type: 'USER_CREATED',
      title: 'User Created',
      description: `New user created: ${userData.firstName} ${userData.lastName}`,
      userId,
      performedBy,
      metadata: {
        email: userData.email,
        role: userData.role,
        stage: userData.stage,
      },
    });
  },

  async logUserUpdated(userId, performedBy, changes) {
    return createActivity({
      type: 'USER_UPDATED',
      title: 'User Updated',
      description: `User information updated`,
      userId,
      performedBy,
      metadata: {
        changes,
        updatedAt: new Date(),
      },
    });
  },

  async logUserLogin(userId) {
    return createActivity({
      type: 'LOGIN',
      title: 'User Login',
      description: 'User logged into the system',
      userId,
      performedBy: userId,
      metadata: {
        loginAt: new Date(),
        source: 'web',
      },
    });
  },
};

// Clean up old activities (optional maintenance function)
async function cleanupOldActivities(olderThanDays = 365) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await prisma.activity.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    console.log(`Cleaned up ${result.count} old activities`);
    return result;
  } catch (error) {
    console.error('Failed to cleanup old activities:', error);
    throw error;
  }
}

module.exports = {
  createActivity,
  createBulkActivities,
  getUserActivities,
  getActivitySummary,
  ActivityHelpers,
  cleanupOldActivities,
};