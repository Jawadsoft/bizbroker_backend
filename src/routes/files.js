// routes/files.js
const express = require('express');
const multer = require('multer');
const filesController = require('../controllers/files');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow specific file types
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/png',
      'image/gif'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOC, DOCX, XLS, XLSX, and image files are allowed.'), false);
    }
  }
});

// Apply authentication middleware to all routes
// router.use(authenticateToken);

// Get user's files
router.get('/user/:userId', filesController.getUserFiles);

// Get all files (admin view)
router.get('/all', filesController.getAllFiles);

// Upload file for user
router.post('/user/:userId/upload', upload.single('file'), filesController.uploadFile);

// Delete file
router.delete('/:fileId', filesController.deleteFile);

// Error handling for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File too large',
        message: 'File size exceeds 10MB limit'
      });
    }
  }
  
  if (error.message.includes('Invalid file type')) {
    return res.status(400).json({
      error: 'Invalid file type',
      message: error.message
    });
  }
  
  next(error);
});

module.exports = router; 