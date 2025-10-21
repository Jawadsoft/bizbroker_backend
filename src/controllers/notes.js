// controllers/notes.controller.js
const { PrismaClient } = require('@prisma/client');
const { z } = require('zod');
const { createActivity } = require('../services/activityService');

const prisma = new PrismaClient();

// Validation schemas
const createNoteSchema = z.object({
  content: z.string().min(1, "Note content is required"),
  contentType: z.enum(['html', 'plain']).default('html'),
  isInternal: z.boolean().default(false),
  userId: z.string().min(1, "User ID is required"),
});

const updateNoteSchema = z.object({
  content: z.string().min(1, "Note content is required").optional(),
  contentType: z.enum(['html', 'plain']).optional(),
  isInternal: z.boolean().optional(),
});

const getNotesPaginationSchema = z.object({
  page: z.string().optional().default('1'),
  limit: z.string().optional().default('10'),
  search: z.string().optional().default(''),
  userId: z.string().optional(),
  isInternal: z.string().optional(),
});

class NotesController {
  constructor() {
    // Bind all methods
    this.getNotes = this.getNotes.bind(this);
    this.createNote = this.createNote.bind(this);
    this.updateNote = this.updateNote.bind(this);
    this.deleteNote = this.deleteNote.bind(this);
    this.getNoteById = this.getNoteById.bind(this);
    this.getUserNotes = this.getUserNotes.bind(this);
  }

  // Get all notes with pagination and filtering
  async getNotes(req, res) {
    try {
      const validatedQuery = getNotesPaginationSchema.parse(req.query);
      const { page, limit, search, userId, isInternal } = validatedQuery;
      
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);

      // Build where clause
      const whereClause = {};
      
      if (search) {
        whereClause.content = {
          contains: search,
          mode: 'insensitive'
        };
      }
      
      if (userId) {
        whereClause.userId = userId;
      }
      
      if (isInternal !== undefined) {
        whereClause.isInternal = isInternal === 'true';
      }

      const notes = await prisma.note.findMany({
        where: whereClause,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      });

      const total = await prisma.note.count({
        where: whereClause,
      });

      const formattedNotes = notes.map(note => ({
        id: note.id,
        content: note.content,
        contentType: note.contentType,
        isInternal: note.isInternal,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
        createdBy: note.createdBy,
        user: {
          id: note.user.id,
          name: `${note.user.firstName} ${note.user.lastName}`,
          email: note.user.email,
        },
        // Helper for frontend
        timeAgo: this.formatRelativeTime(note.createdAt),
        preview: this.stripHtml(note.content).substring(0, 100) + '...',
      }));

      res.json({
        notes: formattedNotes,
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
      console.error('Get notes error:', error);
      res.status(500).json({ error: 'Failed to fetch notes' });
    }
  }

  // Create a new note
  async createNote(req, res) {
    try {
      const validatedData = createNoteSchema.parse(req.body);
      const createdBy = req.user?.id || 'system'; // For now, default to system

      const note = await prisma.note.create({
        data: {
          content: validatedData.content,
          contentType: validatedData.contentType,
          isInternal: validatedData.isInternal,
          userId: validatedData.userId,
          createdBy,
        },
        include: {
          user: {
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
          type: 'NOTE_ADDED',
          title: 'Note Added',
          description: `Note added: ${this.stripHtml(note.content).substring(0, 50)}...`,
          userId: validatedData.userId,
          performedBy: createdBy,
          metadata: {
            noteId: note.id,
            isInternal: validatedData.isInternal,
            contentType: validatedData.contentType,
          },
        });
      } catch (activityError) {
        console.error('Failed to create activity:', activityError);
      }

      res.status(201).json({
        message: 'Note created successfully',
        note: {
          id: note.id,
          content: note.content,
          contentType: note.contentType,
          isInternal: note.isInternal,
          createdAt: note.createdAt,
          createdBy,
          user: {
            id: note.user.id,
            name: `${note.user.firstName} ${note.user.lastName}`,
            email: note.user.email,
          },
          timeAgo: this.formatRelativeTime(note.createdAt),
          preview: this.stripHtml(note.content).substring(0, 100) + '...',
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      console.error('Create note error:', error);
      res.status(500).json({ error: 'Failed to create note' });
    }
  }

  // Update a note
  async updateNote(req, res) {
    try {
      const { id } = req.params;
      const validatedData = updateNoteSchema.parse(req.body);

      const existingNote = await prisma.note.findUnique({
        where: { id },
      });

      if (!existingNote) {
        return res.status(404).json({ error: 'Note not found' });
      }

      const updatedNote = await prisma.note.update({
        where: { id },
        data: validatedData,
        include: {
          user: {
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
          type: 'NOTE_UPDATED',
          title: 'Note Updated',
          description: `Note updated: ${this.stripHtml(updatedNote.content).substring(0, 50)}...`,
          userId: updatedNote.userId,
          performedBy: req.user?.id || 'system',
          metadata: {
            noteId: updatedNote.id,
            changes: validatedData,
          },
        });
      } catch (activityError) {
        console.error('Failed to create activity:', activityError);
      }

      res.json({
        message: 'Note updated successfully',
        note: {
          id: updatedNote.id,
          content: updatedNote.content,
          contentType: updatedNote.contentType,
          isInternal: updatedNote.isInternal,
          createdAt: updatedNote.createdAt,
          updatedAt: updatedNote.updatedAt,
          createdBy: updatedNote.createdBy,
          user: {
            id: updatedNote.user.id,
            name: `${updatedNote.user.firstName} ${updatedNote.user.lastName}`,
            email: updatedNote.user.email,
          },
          timeAgo: this.formatRelativeTime(updatedNote.updatedAt),
          preview: this.stripHtml(updatedNote.content).substring(0, 100) + '...',
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      console.error('Update note error:', error);
      res.status(500).json({ error: 'Failed to update note' });
    }
  }

  // Delete a note
  async deleteNote(req, res) {
    try {
      const { id } = req.params;

      const existingNote = await prisma.note.findUnique({
        where: { id },
      });

      if (!existingNote) {
        return res.status(404).json({ error: 'Note not found' });
      }

      await prisma.note.delete({
        where: { id },
      });

      // Create activity log
      try {
        await createActivity({
          type: 'NOTE_DELETED',
          title: 'Note Deleted',
          description: `Note deleted: ${this.stripHtml(existingNote.content).substring(0, 50)}...`,
          userId: existingNote.userId,
          performedBy: req.user?.id || 'system',
          metadata: {
            noteId: id,
            deletedContent: existingNote.content.substring(0, 100),
          },
        });
      } catch (activityError) {
        console.error('Failed to create activity:', activityError);
      }

      res.json({
        message: 'Note deleted successfully',
      });
    } catch (error) {
      console.error('Delete note error:', error);
      res.status(500).json({ error: 'Failed to delete note' });
    }
  }

  // Get a single note by ID
  async getNoteById(req, res) {
    try {
      const { id } = req.params;

      const note = await prisma.note.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            }
          }
        }
      });

      if (!note) {
        return res.status(404).json({ error: 'Note not found' });
      }

      res.json({
        note: {
          id: note.id,
          content: note.content,
          contentType: note.contentType,
          isInternal: note.isInternal,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
          createdBy: note.createdBy,
          user: {
            id: note.user.id,
            name: `${note.user.firstName} ${note.user.lastName}`,
            email: note.user.email,
          },
          timeAgo: this.formatRelativeTime(note.createdAt),
        },
      });
    } catch (error) {
      console.error('Get note by ID error:', error);
      res.status(500).json({ error: 'Failed to fetch note' });
    }
  }

  // Get notes for a specific user
  async getUserNotes(req, res) {
    try {
      const { userId } = req.params;
      const { page = 1, limit = 10, search = '', isInternal } = req.query;
      
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);

      const whereClause = { userId };
      
      if (search) {
        whereClause.content = {
          contains: search,
          mode: 'insensitive'
        };
      }
      
      if (isInternal !== undefined) {
        whereClause.isInternal = isInternal === 'true';
      }

      const notes = await prisma.note.findMany({
        where: whereClause,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      });

      const total = await prisma.note.count({
        where: whereClause,
      });

      const formattedNotes = notes.map(note => ({
        id: note.id,
        content: note.content,
        contentType: note.contentType,
        isInternal: note.isInternal,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
        createdBy: note.createdBy,
        user: {
          id: note.user.id,
          name: `${note.user.firstName} ${note.user.lastName}`,
          email: note.user.email,
        },
        timeAgo: this.formatRelativeTime(note.createdAt),
        preview: this.stripHtml(note.content).substring(0, 100) + '...',
      }));

      res.json({
        notes: formattedNotes,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error) {
      console.error('Get user notes error:', error);
      res.status(500).json({ error: 'Failed to fetch user notes' });
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

  stripHtml(html) {
    return html.replace(/<[^>]*>/g, '');
  }
}

module.exports = { NotesController };