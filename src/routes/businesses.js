const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const multer = require('multer');
const { z } = require('zod');

const prisma = new PrismaClient();

// Multer configuration for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Validation schemas
const createBusinessSchema = z.object({
  name: z.string().min(1, 'Business name is required'),
  description: z.string().optional(),
  state: z.string().min(1, 'State is required'),
  cashflow: z.number().optional(),
  review: z.number().min(0).max(5).optional(),
  industry: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  website: z.string().url().optional(),
  foundedYear: z.number().int().min(1900).max(new Date().getFullYear()).optional(),
  employeeCount: z.number().int().positive().optional(),
});

const updateBusinessSchema = createBusinessSchema.partial();

// Get all businesses
router.get('/', async (req, res) => {
  try {
    const businesses = await prisma.business.findMany({
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json(businesses);
  } catch (error) {
    console.error('Error fetching businesses:', error);
    res.status(500).json({ error: 'Failed to fetch businesses' });
  }
});

// Get a single business by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const business = await prisma.business.findFirst({
      where: {
        id: id
      }
    });

    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    res.json(business);
  } catch (error) {
    console.error('Error fetching business:', error);
    res.status(500).json({ error: 'Failed to fetch business' });
  }
});

// Create a new business
router.post('/', upload.single('image'), async (req, res) => {
  try {
    // Validate input
    const validatedData = createBusinessSchema.parse(req.body);
    
    let imageUrl = null;
    
    // Handle image upload if provided
    if (req.file) {
      // For now, we'll store the image data as base64
      // In production, you'd want to upload to Cloudinary or similar
      const base64Image = req.file.buffer.toString('base64');
      const mimeType = req.file.mimetype;
      imageUrl = `data:${mimeType};base64,${base64Image}`;
    }

    const business = await prisma.business.create({
      data: {
        ...validatedData,
        image: imageUrl
      }
    });

    res.status(201).json(business);
  } catch (error) {
    console.error('Error creating business:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to create business' });
  }
});

// Update a business
router.put('/:id', upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if business exists
    const existingBusiness = await prisma.business.findFirst({
      where: {
        id: id
      }
    });

    if (!existingBusiness) {
      return res.status(404).json({ error: 'Business not found' });
    }

    // Validate input
    const validatedData = updateBusinessSchema.parse(req.body);
    
    let imageUrl = existingBusiness.image;
    
    // Handle image upload if provided
    if (req.file) {
      const base64Image = req.file.buffer.toString('base64');
      const mimeType = req.file.mimetype;
      imageUrl = `data:${mimeType};base64,${base64Image}`;
    }

    const business = await prisma.business.update({
      where: { id },
      data: {
        ...validatedData,
        image: imageUrl
      }
    });

    res.json(business);
  } catch (error) {
    console.error('Error updating business:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to update business' });
  }
});

// Delete a business
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if business exists
    const existingBusiness = await prisma.business.findFirst({
      where: {
        id: id
      }
    });

    if (!existingBusiness) {
      return res.status(404).json({ error: 'Business not found' });
    }

    await prisma.business.delete({
      where: { id }
    });

    res.json({ message: 'Business deleted successfully' });
  } catch (error) {
    console.error('Error deleting business:', error);
    res.status(500).json({ error: 'Failed to delete business' });
  }
});

module.exports = router; 