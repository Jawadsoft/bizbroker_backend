// controllers/tasks.controller.js
const { PrismaClient } = require('@prisma/client');
const { z } = require('zod');
const { createActivity } = require('../services/activityService');

const prisma = new PrismaClient();

// Validation schemas
const createTaskSchema = z.object({
  title: z.string().min(1, "Task title is required"),
  description: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED']).default('PENDING'),
  dueDate: z.string().optional(), // ISO string
  relatedTo: z.string().optional(),
  assignedToId: z.string().min(1, "Assigned user ID is required"),
});

const updateTaskSchema = z.object({
  title: z.string().min(1, "Task title is required").optional(),
  description: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED']).optional(),
  dueDate: z.string().optional(), // ISO string
  relatedTo: z.string().optional(),
  completedAt: z.string().optional(), // ISO string
});

const getTasksPaginationSchema = z.object({
  page: z.string().optional().default('1'),
  limit: z.string().optional().default('10'),
  search: z.string().optional().default(''),
  assignedToId: z.string().optional(),
  createdById: z.string().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  overdue: z.string().optional(),
});

class TasksController {
  constructor() {
    // Bind all methods
    this.getTasks = this.getTasks.bind(this);
    this.createTask = this.createTask.bind(this);
    this.updateTask = this.updateTask.bind(this);
    this.deleteTask = this.deleteTask.bind(this);
    this.getTaskById = this.getTaskById.bind(this);
    this.getUserTasks = this.getUserTasks.bind(this);
    this.markTaskComplete = this.markTaskComplete.bind(this);
    this.getTaskStats = this.getTaskStats.bind(this);
  }

  // Get all tasks with pagination and filtering
  async getTasks(req, res) {
    try {
      const validatedQuery = getTasksPaginationSchema.parse(req.query);
      const { page, limit, search, assignedToId, createdById, status, priority, overdue } = validatedQuery;
      
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);

      // Build where clause
      const whereClause = {};
      
      if (search) {
        whereClause.OR = [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { relatedTo: { contains: search, mode: 'insensitive' } },
        ];
      }
      
      if (assignedToId) {
        whereClause.assignedToId = assignedToId;
      }
      
      if (createdById) {
        whereClause.createdById = createdById;
      }
      
      if (status) {
        whereClause.status = status;
      }
      
      if (priority) {
        whereClause.priority = priority;
      }
      
      if (overdue === 'true') {
        whereClause.dueDate = {
          lt: new Date(),
        };
        whereClause.status = {
          not: 'COMPLETED'
        };
      }

      const tasks = await prisma.task.findMany({
        where: whereClause,
        include: {
          assignedTo: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            }
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            }
          }
        },
        orderBy: [
          { status: 'asc' }, // Pending tasks first
          { priority: 'desc' }, // High priority first
          { dueDate: 'asc' }, // Earliest due date first
          { createdAt: 'desc' }
        ],
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      });

      const total = await prisma.task.count({
        where: whereClause,
      });

      const formattedTasks = tasks.map(task => ({
        id: task.id,
        title: task.title,
        description: task.description,
        priority: task.priority,
        status: task.status,
        dueDate: task.dueDate,
        relatedTo: task.relatedTo,
        completedAt: task.completedAt,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        assignedTo: {
          id: task.assignedTo.id,
          name: `${task.assignedTo.firstName} ${task.assignedTo.lastName}`,
          email: task.assignedTo.email,
        },
        createdBy: {
          id: task.createdBy.id,
          name: `${task.createdBy.firstName} ${task.createdBy.lastName}`,
          email: task.createdBy.email,
        },
        // Helper fields for frontend
        isOverdue: task.dueDate ? new Date(task.dueDate) < new Date() && task.status !== 'COMPLETED' : false,
        timeAgo: this.formatRelativeTime(task.createdAt),
        dueDateFormatted: task.dueDate ? new Date(task.dueDate).toLocaleDateString() : null,
        statusColor: this.getStatusColor(task.status),
        priorityColor: this.getPriorityColor(task.priority),
      }));

      res.json({
        tasks: formattedTasks,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      console.error('Get tasks error:', error);
      res.status(500).json({ error: 'Failed to fetch tasks' });
    }
  }

 // Add this import at the top of the file if not already present

// Create a new task
async createTask(req, res) {
  try {
    const validatedData = createTaskSchema.parse(req.body);
    
    // First, ensure the assignedToId user exists
    const assignedUser = await prisma.user.findUnique({
      where: { id: validatedData.assignedToId }
    });
    
    if (!assignedUser) {
      return res.status(400).json({ 
        error: 'Assigned user not found',
        message: `User with ID ${validatedData.assignedToId} does not exist` 
      });
    }
    
    // Get or create a system user for createdById
    let createdById = req.user?.id;
    
    if (!createdById) {
      // Try to find an admin user or create a system user
      let systemUser = await prisma.user.findFirst({
        where: { role: 'ADMIN' }
      });
      
      if (!systemUser) {
        // Create a system user if none exists
        const hashedPassword = await bcrypt.hash('system123', 10);
        
        systemUser = await prisma.user.create({
          data: {
            firstName: 'System',
            lastName: 'Admin',
            email: 'system@healthcarebizbrokers.com',
            password: hashedPassword,
            role: 'ADMIN',
            stage: 'Active',
          }
        });
      }
      
      createdById = systemUser.id;
    }

    const task = await prisma.task.create({
      data: {
        title: validatedData.title,
        description: validatedData.description,
        priority: validatedData.priority,
        status: validatedData.status,
        dueDate: validatedData.dueDate ? new Date(validatedData.dueDate) : null,
        relatedTo: validatedData.relatedTo,
        assignedToId: validatedData.assignedToId,
        createdById,
      },
      include: {
        assignedTo: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          }
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          }
        }
      }
    });

    // Create activity log
    try {
      await createActivity({
        type: 'TASK_CREATED',
        title: 'Task Created',
        description: `Task assigned: ${task.title}`,
        userId: validatedData.assignedToId,
        performedBy: createdById,
        metadata: {
          taskId: task.id,
          priority: validatedData.priority,
          dueDate: validatedData.dueDate,
          relatedTo: validatedData.relatedTo,
        },
      });
    } catch (activityError) {
      console.error('Failed to create activity:', activityError);
      // Continue even if activity logging fails
    }

    res.status(201).json({
      message: 'Task created successfully',
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
        priority: task.priority,
        status: task.status,
        dueDate: task.dueDate,
        relatedTo: task.relatedTo,
        createdAt: task.createdAt,
        assignedTo: {
          id: task.assignedTo.id,
          name: `${task.assignedTo.firstName} ${task.assignedTo.lastName}`,
          email: task.assignedTo.email,
        },
        createdBy: {
          id: task.createdBy.id,
          name: `${task.createdBy.firstName} ${task.createdBy.lastName}`,
          email: task.createdBy.email,
        },
        isOverdue: task.dueDate ? new Date(task.dueDate) < new Date() : false,
        timeAgo: this.formatRelativeTime(task.createdAt),
        dueDateFormatted: task.dueDate ? new Date(task.dueDate).toLocaleDateString() : null,
        statusColor: this.getStatusColor(task.status),
        priorityColor: this.getPriorityColor(task.priority),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.errors 
      });
    }
    console.error('Create task error:', error);
    res.status(500).json({ 
      error: 'Failed to create task',
      message: error.message 
    });
  }
}

  // Update a task
  async updateTask(req, res) {
    try {
      const { id } = req.params;
      const validatedData = updateTaskSchema.parse(req.body);

      const existingTask = await prisma.task.findUnique({
        where: { id },
      });

      if (!existingTask) {
        return res.status(404).json({ error: 'Task not found' });
      }

      // Handle completion logic
      const updateData = { ...validatedData };
      if (validatedData.status === 'COMPLETED' && !validatedData.completedAt) {
        updateData.completedAt = new Date();
      } else if (validatedData.status !== 'COMPLETED') {
        updateData.completedAt = null;
      }

      // Convert dueDate string to Date if provided
      if (validatedData.dueDate) {
        updateData.dueDate = new Date(validatedData.dueDate);
      }

      const updatedTask = await prisma.task.update({
        where: { id },
        data: updateData,
        include: {
          assignedTo: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            }
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            }
          }
        }
      });

      // Create activity log
      try {
        const activityType = validatedData.status === 'COMPLETED' ? 'TASK_COMPLETED' : 'TASK_UPDATED';
        const activityTitle = validatedData.status === 'COMPLETED' ? 'Task Completed' : 'Task Updated';
        
        await createActivity({
          type: activityType,
          title: activityTitle,
          description: `Task ${activityTitle.toLowerCase()}: ${updatedTask.title}`,
          userId: updatedTask.assignedToId,
          performedBy: req.user?.id || 'system',
          metadata: {
            taskId: updatedTask.id,
            changes: validatedData,
            completedAt: updateData.completedAt,
          },
        });
      } catch (activityError) {
        console.error('Failed to create activity:', activityError);
      }

      res.json({
        message: 'Task updated successfully',
        task: {
          id: updatedTask.id,
          title: updatedTask.title,
          description: updatedTask.description,
          priority: updatedTask.priority,
          status: updatedTask.status,
          dueDate: updatedTask.dueDate,
          relatedTo: updatedTask.relatedTo,
          completedAt: updatedTask.completedAt,
          createdAt: updatedTask.createdAt,
          updatedAt: updatedTask.updatedAt,
          assignedTo: {
            id: updatedTask.assignedTo.id,
            name: `${updatedTask.assignedTo.firstName} ${updatedTask.assignedTo.lastName}`,
            email: updatedTask.assignedTo.email,
          },
          createdBy: {
            id: updatedTask.createdBy.id,
            name: `${updatedTask.createdBy.firstName} ${updatedTask.createdBy.lastName}`,
            email: updatedTask.createdBy.email,
          },
          isOverdue: updatedTask.dueDate ? new Date(updatedTask.dueDate) < new Date() && updatedTask.status !== 'COMPLETED' : false,
          timeAgo: this.formatRelativeTime(updatedTask.updatedAt),
          dueDateFormatted: updatedTask.dueDate ? new Date(updatedTask.dueDate).toLocaleDateString() : null,
          statusColor: this.getStatusColor(updatedTask.status),
          priorityColor: this.getPriorityColor(updatedTask.priority),
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      console.error('Update task error:', error);
      res.status(500).json({ error: 'Failed to update task' });
    }
  }

  // Delete a task
  async deleteTask(req, res) {
    try {
      const { id } = req.params;

      const existingTask = await prisma.task.findUnique({
        where: { id },
      });

      if (!existingTask) {
        return res.status(404).json({ error: 'Task not found' });
      }

      await prisma.task.delete({
        where: { id },
      });

      // Create activity log
      try {
        await createActivity({
          type: 'TASK_DELETED',
          title: 'Task Deleted',
          description: `Task deleted: ${existingTask.title}`,
          userId: existingTask.assignedToId,
          performedBy: req.user?.id || 'system',
          metadata: {
            taskId: id,
            deletedTitle: existingTask.title,
          },
        });
      } catch (activityError) {
        console.error('Failed to create activity:', activityError);
      }

      res.json({
        message: 'Task deleted successfully',
      });
    } catch (error) {
      console.error('Delete task error:', error);
      res.status(500).json({ error: 'Failed to delete task' });
    }
  }

  // Get a single task by ID
  async getTaskById(req, res) {
    try {
      const { id } = req.params;

      const task = await prisma.task.findUnique({
        where: { id },
        include: {
          assignedTo: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            }
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            }
          }
        }
      });

      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }

      res.json({
        task: {
          id: task.id,
          title: task.title,
          description: task.description,
          priority: task.priority,
          status: task.status,
          dueDate: task.dueDate,
          relatedTo: task.relatedTo,
          completedAt: task.completedAt,
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
          assignedTo: {
            id: task.assignedTo.id,
            name: `${task.assignedTo.firstName} ${task.assignedTo.lastName}`,
            email: task.assignedTo.email,
          },
          createdBy: {
            id: task.createdBy.id,
            name: `${task.createdBy.firstName} ${task.createdBy.lastName}`,
            email: task.createdBy.email,
          },
          isOverdue: task.dueDate ? new Date(task.dueDate) < new Date() && task.status !== 'COMPLETED' : false,
          timeAgo: this.formatRelativeTime(task.createdAt),
          dueDateFormatted: task.dueDate ? new Date(task.dueDate).toLocaleDateString() : null,
          statusColor: this.getStatusColor(task.status),
          priorityColor: this.getPriorityColor(task.priority),
        },
      });
    } catch (error) {
      console.error('Get task by ID error:', error);
      res.status(500).json({ error: 'Failed to fetch task' });
    }
  }

  // Get tasks for a specific user
  async getUserTasks(req, res) {
    try {
      const { userId } = req.params;
      const { page = 1, limit = 10, search = '', status, priority, overdue } = req.query;
      
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);

      const whereClause = { assignedToId: userId };
      
      if (search) {
        whereClause.OR = [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { relatedTo: { contains: search, mode: 'insensitive' } },
        ];
      }
      
      if (status) {
        whereClause.status = status;
      }
      
      if (priority) {
        whereClause.priority = priority;
      }
      
      if (overdue === 'true') {
        whereClause.dueDate = {
          lt: new Date(),
        };
        whereClause.status = {
          not: 'COMPLETED'
        };
      }

      const tasks = await prisma.task.findMany({
        where: whereClause,
        include: {
          assignedTo: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            }
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            }
          }
        },
        orderBy: [
          { status: 'asc' },
          { priority: 'desc' },
          { dueDate: 'asc' },
          { createdAt: 'desc' }
        ],
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      });

      const total = await prisma.task.count({
        where: whereClause,
      });

      const formattedTasks = tasks.map(task => ({
        id: task.id,
        title: task.title,
        description: task.description,
        priority: task.priority,
        status: task.status,
        dueDate: task.dueDate,
        relatedTo: task.relatedTo,
        completedAt: task.completedAt,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        assignedTo: {
          id: task.assignedTo.id,
          name: `${task.assignedTo.firstName} ${task.assignedTo.lastName}`,
          email: task.assignedTo.email,
        },
        createdBy: {
          id: task.createdBy.id,
          name: `${task.createdBy.firstName} ${task.createdBy.lastName}`,
          email: task.createdBy.email,
        },
        isOverdue: task.dueDate ? new Date(task.dueDate) < new Date() && task.status !== 'COMPLETED' : false,
        timeAgo: this.formatRelativeTime(task.createdAt),
        dueDateFormatted: task.dueDate ? new Date(task.dueDate).toLocaleDateString() : null,
        statusColor: this.getStatusColor(task.status),
        priorityColor: this.getPriorityColor(task.priority),
      }));

      res.json({
        tasks: formattedTasks,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error) {
      console.error('Get user tasks error:', error);
      res.status(500).json({ error: 'Failed to fetch user tasks' });
    }
  }

  // Mark task as complete (convenience endpoint)
  async markTaskComplete(req, res) {
    try {
      const { id } = req.params;

      const task = await prisma.task.findUnique({
        where: { id },
      });

      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }

      const updatedTask = await prisma.task.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
        include: {
          assignedTo: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            }
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            }
          }
        }
      });

      // Create activity log
      try {
        await createActivity({
          type: 'TASK_COMPLETED',
          title: 'Task Completed',
          description: `Task completed: ${updatedTask.title}`,
          userId: updatedTask.assignedToId,
          performedBy: req.user?.id || 'system',
          metadata: {
            taskId: updatedTask.id,
            completedAt: updatedTask.completedAt,
          },
        });
      } catch (activityError) {
        console.error('Failed to create activity:', activityError);
      }

      res.json({
        message: 'Task marked as complete',
        task: {
          id: updatedTask.id,
          title: updatedTask.title,
          status: updatedTask.status,
          completedAt: updatedTask.completedAt,
        },
      });
    } catch (error) {
      console.error('Mark task complete error:', error);
      res.status(500).json({ error: 'Failed to mark task as complete' });
    }
  }

  // Get task statistics
  async getTaskStats(req, res) {
    try {
      const { userId } = req.query;

      const whereClause = userId ? { assignedToId: userId } : {};

      const stats = await Promise.all([
        prisma.task.count({ where: { ...whereClause, status: 'PENDING' } }),
        prisma.task.count({ where: { ...whereClause, status: 'IN_PROGRESS' } }),
        prisma.task.count({ where: { ...whereClause, status: 'COMPLETED' } }),
        prisma.task.count({ 
          where: { 
            ...whereClause, 
            dueDate: { lt: new Date() },
            status: { not: 'COMPLETED' }
          } 
        }),
        prisma.task.count({ where: { ...whereClause, priority: 'HIGH' } }),
        prisma.task.count({ where: whereClause }),
      ]);

      res.json({
        stats: {
          pending: stats[0],
          inProgress: stats[1],
          completed: stats[2],
          overdue: stats[3],
          highPriority: stats[4],
          total: stats[5],
          completionRate: stats[5] > 0 ? Math.round((stats[2] / stats[5]) * 100) : 0,
        },
      });
    } catch (error) {
      console.error('Get task stats error:', error);
      res.status(500).json({ error: 'Failed to fetch task statistics' });
    }
  }

  // Helper methods
  formatRelativeTime(date) {
    const now = new Date();
    const diffInSeconds = Math.floor((now - new Date(date)) / 1000);
    
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
    if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)} days ago`;
    
    return new Date(date).toLocaleDateString();
  }

  getStatusColor(status) {
    switch (status) {
      case 'PENDING':
        return '#F59E0B'; // Amber
      case 'IN_PROGRESS':
        return '#3B82F6'; // Blue
      case 'COMPLETED':
        return '#10B981'; // Green
      default:
        return '#6B7280'; // Gray
    }
  }

  getPriorityColor(priority) {
    switch (priority) {
      case 'HIGH':
        return '#EF4444'; // Red
      case 'MEDIUM':
        return '#F59E0B'; // Amber
      case 'LOW':
        return '#10B981'; // Green
      default:
        return '#6B7280'; // Gray
    }
  }
}

module.exports = { TasksController };