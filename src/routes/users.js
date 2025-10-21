// routes/user.routes.js - Updated with new email conversation endpoints
const { Router } = require('express');
const { UserController } = require('../controllers/users');
const { authenticateToken, requireRole } = require('../middleware/authMiddleware');

const router = Router();
const userController = new UserController();

// User management routes (Admin/Staff only)
router.get('/', 
  // authenticateToken, 
  // requireRole(['SUPERADMIN', 'ADMIN', 'STAFF']), 
  userController.getUsers
);

router.post('/', 
  // authenticateToken, 
  // requireRole(['SUPERADMIN', 'ADMIN', 'STAFF']), 
  userController.createUser
);

router.get('/:id', 
  // authenticateToken, 
  userController.getUserById
);

// Activity tab routes - Email functionality (UPDATED)
router.post('/:id/send-email', 
  // authenticateToken, 
  // requireRole(['SUPERADMIN', 'ADMIN', 'STAFF']), 
  userController.sendEmailToUser
);

// NEW: Get email conversation with filtering and pagination
router.get('/:id/emails', 
  // authenticateToken, 
  userController.getEmailConversation
);

// NEW: Mark specific email as read
router.patch('/emails/:emailId/read', 
  // authenticateToken, 
  userController.markEmailAsRead
);

// Webhook for receiving emails FROM users
router.post('/webhook/email', 
  userController.receiveEmailWebhook
);

// Activity tab routes - Notes functionality
router.post('/:id/notes', 
  // authenticateToken, 
  // requireRole(['SUPERADMIN', 'ADMIN', 'STAFF']), 
  userController.addNote
);

// Activity tab routes - Tasks functionality
router.post('/:id/tasks', 
  // authenticateToken, 
  // requireRole(['SUPERADMIN', 'ADMIN', 'STAFF']), 
  userController.createTask
);

// Activity tab routes - Activity timeline
router.get('/:id/activities', 
  // authenticateToken, 
  userController.getUserActivities
);

module.exports = router;