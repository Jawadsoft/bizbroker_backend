// controllers/files.controller.js
const { PrismaClient } = require('@prisma/client');
const { z } = require('zod');
const { createActivity } = require('../services/activityService');
const { uploadToCloudinary, deleteFromCloudinary, validateFile, formatFileSize } = require('../utils/cloudinaryHelper');

const prisma = new PrismaClient();

// Validation schemas
const getUserFilesSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  search: z.string().optional(),
});

const getAllFilesSchema = z.object({
  search: z.string().optional(),
  userId: z.string().optional(),
});

class FilesController {
  // Get user's files
  async getUserFiles(req, res) {
    try {
      const { userId } = req.params;
      const { search } = req.query;

      // Validate user exists
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        return res.status(404).json({ 
          error: 'User not found',
          message: `User with ID ${userId} does not exist` 
        });
      }

      // Build where clause
      const whereClause = {
        userId,
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { originalName: { contains: search, mode: 'insensitive' } },
          ]
        })
      };

      const files = await prisma.userFile.findMany({
        where: whereClause,
        orderBy: { uploadDate: 'desc' }
      });

      // Format files for frontend
      const formattedFiles = files.map(file => ({
        id: file.id,
        name: file.name,
        originalName: file.originalName,
        fileUrl: file.fileUrl,
        fileSize: formatFileSize(file.fileSize),
        mimeType: file.mimeType,
        uploadedBy: file.uploadedBy,
        uploadDate: file.uploadDate,
        type: FilesController.getFileType(file.mimeType),
      }));

      res.json({
        success: true,
        data: formattedFiles,
        total: files.length
      });

    } catch (error) {
      console.error('Error fetching user files:', error);
      res.status(500).json({ 
        error: 'Failed to fetch files',
        message: error.message 
      });
    }
  }

  // Get all files (admin view)
  async getAllFiles(req, res) {
    try {
      const { search, userId } = req.query;

      // Build where clause
      const whereClause = {
        ...(userId && { userId }),
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { originalName: { contains: search, mode: 'insensitive' } },
          ]
        })
      };

      const files = await prisma.userFile.findMany({
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
        orderBy: { uploadDate: 'desc' }
      });

      // Format files for frontend
      const formattedFiles = files.map(file => ({
        id: file.id,
        name: file.name,
        originalName: file.originalName,
        fileUrl: file.fileUrl,
        fileSize: formatFileSize(file.fileSize),
        mimeType: file.mimeType,
        uploadedBy: file.uploadedBy,
        uploadDate: file.uploadDate,
        user: file.user,
        type: FilesController.getFileType(file.mimeType),
      }));

      res.json({
        success: true,
        data: formattedFiles,
        total: files.length
      });

    } catch (error) {
      console.error('Error fetching all files:', error);
      res.status(500).json({ 
        error: 'Failed to fetch files',
        message: error.message 
      });
    }
  }

  // Upload file for user
  async uploadFile(req, res) {
    try {
      const { userId } = req.params;

      // Validate file
      if (!req.file) {
        return res.status(400).json({ 
          error: 'No file uploaded',
          message: 'Please select a file to upload' 
        });
      }

      const validation = validateFile(req.file, [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'image/jpeg',
        'image/png',
        'image/gif'
      ], 10 * 1024 * 1024); // 10MB limit

      if (!validation.isValid) {
        return res.status(400).json({ 
          error: 'File validation failed',
          message: validation.errors.join(', ')
        });
      }

      // Verify user exists
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        return res.status(404).json({ 
          error: 'User not found',
          message: `User with ID ${userId} does not exist` 
        });
      }

      // Upload to Cloudinary or use fallback
      let fileUrl;
      
      // Check if Cloudinary is configured
      if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
        try {
          const uploadResult = await uploadToCloudinary(req.file.buffer, {
            folder: `users/${userId}/files`,
            public_id: `${Date.now()}_${req.file.originalname.replace(/\.[^/.]+$/, '')}`
          });
          fileUrl = uploadResult.url;
        } catch (uploadError) {
          console.error('Cloudinary upload failed:', uploadError);
          return res.status(500).json({ 
            error: 'File upload failed',
            message: 'Failed to upload file to cloud storage. Please try again.' 
          });
        }
      } else {
        // Fallback: Store file info without Cloudinary URL
        console.log('⚠️  Cloudinary not configured, using fallback storage');
        fileUrl = `local://${Date.now()}_${req.file.originalname}`;
      }

      // Save file to database
      const file = await prisma.userFile.create({
        data: {
          name: req.file.originalname,
          originalName: req.file.originalname,
          fileUrl: fileUrl,
          fileSize: req.file.size,
          mimeType: req.file.mimetype,
          uploadedBy: req.user?.id || 'system',
          userId: userId,
        }
      });

      // Create activity log
      try {
        await createActivity({
          type: 'FILE_UPLOADED',
          title: 'File Uploaded',
          description: `File "${file.name}" uploaded`,
          userId: userId,
          performedBy: req.user?.id || 'system',
          metadata: {
            fileId: file.id,
            fileName: file.name,
            fileSize: file.fileSize,
          },
        });
      } catch (activityError) {
        console.error('Failed to create activity:', activityError);
      }

      res.status(201).json({
        success: true,
        data: {
          id: file.id,
          name: file.name,
          originalName: file.originalName,
          fileUrl: file.fileUrl,
          fileSize: formatFileSize(file.fileSize),
          mimeType: file.mimeType,
          uploadedBy: file.uploadedBy,
          uploadDate: file.uploadDate,
          type: FilesController.getFileType(file.mimeType),
        },
        message: 'File uploaded successfully'
      });

    } catch (error) {
      console.error('Error uploading file:', error);
      res.status(500).json({ 
        error: 'Failed to upload file',
        message: error.message 
      });
    }
  }

  // Delete file
  async deleteFile(req, res) {
    try {
      const { fileId } = req.params;

      const file = await prisma.userFile.findUnique({
        where: { id: fileId },
        include: {
          user: true
        }
      });

      if (!file) {
        return res.status(404).json({ 
          error: 'File not found',
          message: `File with ID ${fileId} does not exist` 
        });
      }

      // Delete from Cloudinary if it's a Cloudinary URL
      if (file.fileUrl && !file.fileUrl.startsWith('local://')) {
        try {
          const fileInfo = getFileInfoFromUrl(file.fileUrl);
          if (fileInfo) {
            await deleteFromCloudinary(fileInfo.publicId);
          }
        } catch (cloudinaryError) {
          console.error('Failed to delete from Cloudinary:', cloudinaryError);
          // Continue with database deletion even if Cloudinary fails
        }
      }

      // Delete from database
      await prisma.userFile.delete({
        where: { id: fileId }
      });

      // Create activity log
      try {
        await createActivity({
          type: 'FILE_DELETED',
          title: 'File Deleted',
          description: `File "${file.name}" deleted`,
          userId: file.userId,
          performedBy: req.user?.id || 'system',
          metadata: {
            fileId: file.id,
            fileName: file.name,
          },
        });
      } catch (activityError) {
        console.error('Failed to create activity:', activityError);
      }

      res.json({
        success: true,
        message: 'File deleted successfully'
      });

    } catch (error) {
      console.error('Error deleting file:', error);
      res.status(500).json({ 
        error: 'Failed to delete file',
        message: error.message 
      });
    }
  }

  // Helper method to get file type
  static getFileType(mimeType) {
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType.includes('word') || mimeType.includes('document')) return 'doc';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'xls';
    if (mimeType.startsWith('image/')) return 'image';
    return 'other';
  }
}

module.exports = new FilesController(); 