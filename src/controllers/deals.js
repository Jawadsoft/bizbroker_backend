// controllers/deals.controller.js
const { PrismaClient } = require('@prisma/client');
const { z } = require('zod');
const { createActivity } = require('../services/activityService');
const { uploadToCloudinary, deleteFromCloudinary, validateFile, formatFileSize } = require('../utils/cloudinaryHelper');

// Helper function to calculate and update stage progress
async function updateStageProgress(stageId) {
  try {
    // Get all documents for this stage
    const documents = await prisma.dealDocument.findMany({
      where: { stageId: stageId }
    });

    if (documents.length === 0) {
      // No documents, stage is pending
      await prisma.dealStage.update({
        where: { id: stageId },
        data: {
          status: 'PENDING',
          progress: 0
        }
      });
      return;
    }

    // Calculate progress based on document statuses
    const totalDocuments = documents.length;
    const completedDocuments = documents.filter(doc => doc.status === 'COMPLETED').length;
    const inProgressDocuments = documents.filter(doc => doc.status === 'IN_PROGRESS').length;

    // Calculate progress percentage
    let progress = 0;
    let status = 'PENDING';

    if (completedDocuments === totalDocuments) {
      // All documents completed
      progress = 100;
      status = 'COMPLETED';
    } else if (completedDocuments > 0 || inProgressDocuments > 0) {
      // Some documents are completed or in progress
      progress = Math.round(((completedDocuments + (inProgressDocuments * 0.5)) / totalDocuments) * 100);
      status = 'IN_PROGRESS';
    } else {
      // All documents are pending
      progress = 0;
      status = 'PENDING';
    }

    // Update stage
    await prisma.dealStage.update({
      where: { id: stageId },
      data: {
        status: status,
        progress: progress
      }
    });

    console.log(`✅ Updated stage ${stageId}: ${status} (${progress}%)`);
  } catch (error) {
    console.error('Error updating stage progress:', error);
  }
}

const prisma = new PrismaClient();

// Validation schemas
const createDealSchema = z.object({
  name: z.string().min(1, "Deal name is required"),
  description: z.string().optional(),
  userId: z.string().min(1, "User ID is required"),
});

const updateDealSchema = z.object({
  name: z.string().min(1, "Deal name is required").optional(),
  description: z.string().optional(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED', 'ON_HOLD']).optional(),
});

const updateStageSchema = z.object({
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED']),
  progress: z.number().min(0).max(100).optional(),
});

const updateDocumentSchema = z.object({
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED']),
});

const getDealsSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  search: z.string().optional(),
  status: z.string().optional(),
});

class DealsController {
  // Get user's deals with stages and documents
  async getUserDeals(req, res) {
    try {
      const { userId } = req.params;
      const { search, status } = req.query;

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
        ...(status && { status }),
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ]
        })
      };

      let deals = await prisma.deal.findMany({
        where: whereClause,
        include: {
          stages: {
            orderBy: { order: 'asc' },
            include: {
              documents: {
                orderBy: { createdAt: 'desc' }
              }
            }
          },
          documents: {
            orderBy: { createdAt: 'desc' }
          }
        },
        orderBy: { updatedAt: 'desc' }
      });

      // If user has no deals, create a default one
      if (deals.length === 0) {
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

          const defaultDeal = await prisma.deal.create({
            data: {
              name: `${user.firstName} ${user.lastName} - Business Sale`,
              description: `Deal for ${user.firstName} ${user.lastName}'s business sale`,
              userId: user.id,
              stages: {
                create: defaultStages
              }
            },
            include: {
              stages: {
                orderBy: { order: 'asc' },
                include: {
                  documents: {
                    orderBy: { createdAt: 'desc' }
                  }
                }
              },
              documents: {
                orderBy: { createdAt: 'desc' }
              }
            }
          });

          deals = [defaultDeal];
          console.log(`✅ Created default deal for user ${user.id}`);
        } catch (createError) {
          console.error('Failed to create default deal:', createError);
          // Continue with empty deals array
        }
      }

      // Format deals for frontend
      const formattedDeals = deals.map(deal => ({
        id: deal.id,
        name: deal.name,
        description: deal.description,
        status: deal.status.toLowerCase(),
        createdAt: deal.createdAt,
        updatedAt: deal.updatedAt,
        stages: deal.stages.map(stage => ({
          id: stage.id,
          name: stage.name,
          description: stage.description,
          order: stage.order,
          status: stage.status.toLowerCase(),
          progress: stage.progress,
          documents: stage.documents.map(doc => ({
            id: doc.id,
            name: doc.name,
            originalName: doc.originalName,
            fileUrl: doc.fileUrl,
            fileSize: formatFileSize(doc.fileSize),
            mimeType: doc.mimeType,
            status: doc.status.toLowerCase(),
            uploadedBy: doc.uploadedBy,
            uploadDate: doc.uploadDate,
          }))
        })),
        documents: deal.documents.map(doc => ({
          id: doc.id,
          name: doc.name,
          originalName: doc.originalName,
          fileUrl: doc.fileUrl,
          fileSize: formatFileSize(doc.fileSize),
          mimeType: doc.mimeType,
          status: doc.status.toLowerCase(),
          uploadedBy: doc.uploadedBy,
          uploadDate: doc.uploadDate,
        }))
      }));

      res.json({
        success: true,
        data: formattedDeals,
        total: deals.length
      });

    } catch (error) {
      console.error('Error fetching user deals:', error);
      res.status(500).json({ 
        error: 'Failed to fetch deals',
        message: error.message 
      });
    }
  }

  // Create new deal with default stages
  async createDeal(req, res) {
    try {
      const validatedData = createDealSchema.parse(req.body);
      
      // Validate user exists
      const user = await prisma.user.findUnique({
        where: { id: validatedData.userId }
      });

      if (!user) {
        return res.status(404).json({ 
          error: 'User not found',
          message: `User with ID ${validatedData.userId} does not exist` 
        });
      }

      // Default stages for a new deal
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
          name: validatedData.name,
          description: validatedData.description,
          userId: validatedData.userId,
          stages: {
            create: defaultStages
          }
        },
        include: {
          stages: {
            orderBy: { order: 'asc' }
          }
        }
      });

      // Create activity log
      try {
        await createActivity({
          type: 'DEAL_CREATED',
          title: 'Deal Created',
          description: `New deal created: ${deal.name}`,
          userId: validatedData.userId,
          performedBy: req.user?.id || 'system',
          metadata: {
            dealId: deal.id,
            dealName: deal.name,
          },
        });
      } catch (activityError) {
        console.error('Failed to create activity:', activityError);
      }

      res.status(201).json({
        success: true,
        data: deal,
        message: 'Deal created successfully'
      });

    } catch (error) {
      console.error('Error creating deal:', error);
      res.status(500).json({ 
        error: 'Failed to create deal',
        message: error.message 
      });
    }
  }

  // Update deal
  async updateDeal(req, res) {
    try {
      const { dealId } = req.params;
      const validatedData = updateDealSchema.parse(req.body);

      const deal = await prisma.deal.findUnique({
        where: { id: dealId }
      });

      if (!deal) {
        return res.status(404).json({ 
          error: 'Deal not found',
          message: `Deal with ID ${dealId} does not exist` 
        });
      }

      const updatedDeal = await prisma.deal.update({
        where: { id: dealId },
        data: validatedData,
        include: {
          stages: {
            orderBy: { order: 'asc' },
            include: {
              documents: {
                orderBy: { createdAt: 'desc' }
              }
            }
          }
        }
      });

      // Create activity log
      try {
        await createActivity({
          type: 'DEAL_UPDATED',
          title: 'Deal Updated',
          description: `Deal updated: ${updatedDeal.name}`,
          userId: updatedDeal.userId,
          performedBy: req.user?.id || 'system',
          metadata: {
            dealId: updatedDeal.id,
            dealName: updatedDeal.name,
            changes: validatedData,
          },
        });
      } catch (activityError) {
        console.error('Failed to create activity:', activityError);
      }

      res.json({
        success: true,
        data: updatedDeal,
        message: 'Deal updated successfully'
      });

    } catch (error) {
      console.error('Error updating deal:', error);
      res.status(500).json({ 
        error: 'Failed to update deal',
        message: error.message 
      });
    }
  }

  // Update stage status and progress
  async updateStage(req, res) {
    try {
      const { dealId, stageId } = req.params;
      const validatedData = updateStageSchema.parse(req.body);

      // Verify deal and stage exist
      const stage = await prisma.dealStage.findFirst({
        where: { 
          id: stageId,
          dealId: dealId
        },
        include: {
          deal: true
        }
      });

      if (!stage) {
        return res.status(404).json({ 
          error: 'Stage not found',
          message: `Stage with ID ${stageId} does not exist for this deal` 
        });
      }

      const updatedStage = await prisma.dealStage.update({
        where: { id: stageId },
        data: validatedData,
        include: {
          documents: {
            orderBy: { createdAt: 'desc' }
          }
        }
      });

      // Create activity log
      try {
        await createActivity({
          type: 'DEAL_STAGE_COMPLETED',
          title: 'Stage Updated',
          description: `Stage "${updatedStage.name}" updated to ${validatedData.status}`,
          userId: stage.deal.userId,
          performedBy: req.user?.id || 'system',
          metadata: {
            dealId: stage.dealId,
            stageId: updatedStage.id,
            stageName: updatedStage.name,
            status: validatedData.status,
            progress: validatedData.progress,
          },
        });
      } catch (activityError) {
        console.error('Failed to create activity:', activityError);
      }

      res.json({
        success: true,
        data: updatedStage,
        message: 'Stage updated successfully'
      });

    } catch (error) {
      console.error('Error updating stage:', error);
      res.status(500).json({ 
        error: 'Failed to update stage',
        message: error.message 
      });
    }
  }

  // Upload document to stage
  async uploadDocument(req, res) {
    try {
      const { dealId, stageId } = req.params;
      const { status = 'PENDING' } = req.body;

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

      // Verify deal and stage exist
      const stage = await prisma.dealStage.findFirst({
        where: { 
          id: stageId,
          dealId: dealId
        },
        include: {
          deal: true
        }
      });

      if (!stage) {
        return res.status(404).json({ 
          error: 'Stage not found',
          message: `Stage with ID ${stageId} does not exist for this deal` 
        });
      }

      // Upload to Cloudinary or use fallback
      let uploadResult;
      let fileUrl;
      
      // Check if Cloudinary is configured
      if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
        try {
          uploadResult = await uploadToCloudinary(req.file.buffer, {
            folder: `deals/${dealId}/stages/${stageId}`,
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

      // Save document to database
      const document = await prisma.dealDocument.create({
        data: {
          name: req.file.originalname,
          originalName: req.file.originalname,
          fileUrl: fileUrl,
          fileSize: req.file.size,
          mimeType: req.file.mimetype,
          status: status.toUpperCase(),
          dealId: dealId,
          stageId: stageId,
          uploadedBy: req.user?.id || 'system',
        }
      });

      // Update stage progress based on document statuses
      await updateStageProgress(stageId);

      // Create activity log
      try {
        await createActivity({
          type: 'DEAL_DOCUMENT_UPLOADED',
          title: 'Document Uploaded',
          description: `Document "${document.name}" uploaded to stage "${stage.name}"`,
          userId: stage.deal.userId,
          performedBy: req.user?.id || 'system',
          metadata: {
            dealId: stage.dealId,
            stageId: stage.id,
            documentId: document.id,
            fileName: document.name,
            fileSize: document.fileSize,
          },
        });
      } catch (activityError) {
        console.error('Failed to create activity:', activityError);
      }

      res.status(201).json({
        success: true,
        data: {
          id: document.id,
          name: document.name,
          originalName: document.originalName,
          fileUrl: document.fileUrl,
          fileSize: formatFileSize(document.fileSize),
          mimeType: document.mimeType,
          status: document.status.toLowerCase(),
          uploadedBy: document.uploadedBy,
          uploadDate: document.uploadDate,
        },
        message: 'Document uploaded successfully'
      });

    } catch (error) {
      console.error('Error uploading document:', error);
      res.status(500).json({ 
        error: 'Failed to upload document',
        message: error.message 
      });
    }
  }

  // Update document status
  async updateDocumentStatus(req, res) {
    try {
      const { dealId, documentId } = req.params;
      const validatedData = updateDocumentSchema.parse(req.body);

      const document = await prisma.dealDocument.findFirst({
        where: { 
          id: documentId,
          dealId: dealId
        },
        include: {
          stage: {
            include: {
              deal: true
            }
          }
        }
      });

      if (!document) {
        return res.status(404).json({ 
          error: 'Document not found',
          message: `Document with ID ${documentId} does not exist for this deal` 
        });
      }

      const updatedDocument = await prisma.dealDocument.update({
        where: { id: documentId },
        data: { status: validatedData.status }
      });

      // Update stage progress based on document statuses
      await updateStageProgress(document.stageId);

      // Create activity log
      try {
        await createActivity({
          type: 'DEAL_DOCUMENT_STATUS_UPDATED',
          title: 'Document Status Updated',
          description: `Document "${document.name}" status updated to ${validatedData.status}`,
          userId: document.stage.deal.userId,
          performedBy: req.user?.id || 'system',
          metadata: {
            dealId: document.dealId,
            stageId: document.stageId,
            documentId: document.id,
            fileName: document.name,
            status: validatedData.status,
          },
        });
      } catch (activityError) {
        console.error('Failed to create activity:', activityError);
      }

      res.json({
        success: true,
        data: updatedDocument,
        message: 'Document status updated successfully'
      });

    } catch (error) {
      console.error('Error updating document status:', error);
      res.status(500).json({ 
        error: 'Failed to update document status',
        message: error.message 
      });
    }
  }

  // Delete document
  async deleteDocument(req, res) {
    try {
      const { dealId, documentId } = req.params;

      const document = await prisma.dealDocument.findFirst({
        where: { 
          id: documentId,
          dealId: dealId
        },
        include: {
          stage: {
            include: {
              deal: true
            }
          }
        }
      });

      if (!document) {
        return res.status(404).json({ 
          error: 'Document not found',
          message: `Document with ID ${documentId} does not exist for this deal` 
        });
      }

      // Delete from Cloudinary
      try {
        const fileInfo = getFileInfoFromUrl(document.fileUrl);
        if (fileInfo) {
          await deleteFromCloudinary(fileInfo.publicId);
        }
      } catch (cloudinaryError) {
        console.error('Failed to delete from Cloudinary:', cloudinaryError);
        // Continue with database deletion even if Cloudinary fails
      }

      // Delete from database
      await prisma.dealDocument.delete({
        where: { id: documentId }
      });

      // Update stage progress based on remaining documents
      await updateStageProgress(document.stageId);

      // Create activity log
      try {
        await createActivity({
          type: 'DEAL_DOCUMENT_DELETED',
          title: 'Document Deleted',
          description: `Document "${document.name}" deleted`,
          userId: document.stage.deal.userId,
          performedBy: req.user?.id || 'system',
          metadata: {
            dealId: document.dealId,
            stageId: document.stageId,
            documentId: document.id,
            fileName: document.name,
          },
        });
      } catch (activityError) {
        console.error('Failed to create activity:', activityError);
      }

      res.json({
        success: true,
        message: 'Document deleted successfully'
      });

    } catch (error) {
      console.error('Error deleting document:', error);
      res.status(500).json({ 
        error: 'Failed to delete document',
        message: error.message 
      });
    }
  }
}

module.exports = new DealsController(); 