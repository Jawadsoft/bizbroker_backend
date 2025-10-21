const { Router } = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { z } = require('zod');
const { sendPasswordResetEmail } = require('../services/emailService');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = Router();
const prisma = new PrismaClient();

// Validation schemas
const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const resetPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

// Login endpoint
router.post('/login', async (req, res) => {
  try {
    const validatedData = loginSchema.parse(req.body);
    const { email, password } = validatedData;

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: {
        id: true,
        email: true,
        password: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        lastLogin: true,
      },
    });

    if (!user) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email or password is incorrect'
      });
    }

    // Check if user is active
    if (user.status !== 'ACTIVE') {
      return res.status(401).json({
        error: 'Account inactive',
        message: 'Your account has been deactivated. Please contact support.'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email or password is incorrect'
      });
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Create activity log
    try {
      const { createActivity } = require('../services/activityService');
      await createActivity({
        type: 'LOGIN',
        title: 'User Login',
        description: `User logged in successfully`,
        userId: user.id,
        performedBy: user.id,
      });
    } catch (activityError) {
      console.error('Failed to create login activity:', activityError);
    }

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        name: `${user.firstName} ${user.lastName}`,
      },
      token,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.errors
      });
    }
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Login failed',
      message: 'An error occurred during login'
    });
  }
});

// Logout endpoint
router.post('/logout', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Create logout activity log
        try {
          const { createActivity } = require('../services/activityService');
          await createActivity({
            type: 'LOGOUT',
            title: 'User Logout',
            description: `User logged out successfully`,
            userId: decoded.id,
            performedBy: decoded.id,
          });
        } catch (activityError) {
          console.error('Failed to create logout activity:', activityError);
        }
      } catch (jwtError) {
        // Token is invalid, but we still return success for logout
        console.log('Invalid token during logout:', jwtError.message);
      }
    }

    res.json({
      message: 'Logout successful'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      error: 'Logout failed',
      message: 'An error occurred during logout'
    });
  }
});

// Request password reset
router.post('/forgot-password', async (req, res) => {
  try {
    const validatedData = resetPasswordSchema.parse(req.body);
    const { email } = validatedData;

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
      },
    });

    if (!user) {
      // Don't reveal if user exists or not for security
      return res.json({
        message: 'If an account with this email exists, a password reset link has been sent.'
      });
    }

    if (user.status !== 'ACTIVE') {
      return res.status(400).json({
        error: 'Account inactive',
        message: 'Your account has been deactivated. Please contact support.'
      });
    }

    // Generate reset token
    const resetToken = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Send password reset email
    try {
      await sendPasswordResetEmail(user.email, {
        name: `${user.firstName} ${user.lastName}`,
        resetToken,
        resetUrl: `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`,
      });
    } catch (emailError) {
      console.error('Failed to send password reset email:', emailError);
      return res.status(500).json({
        error: 'Failed to send reset email',
        message: 'Please try again later'
      });
    }

    res.json({
      message: 'Password reset email sent successfully'
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.errors
      });
    }
    console.error('Forgot password error:', error);
    res.status(500).json({
      error: 'Password reset failed',
      message: 'An error occurred during password reset'
    });
  }
});

// Reset password with token
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Token and new password are required'
      });
    }

    // Verify reset token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user password
    await prisma.user.update({
      where: { id: decoded.id },
      data: { password: hashedPassword },
    });

    // Create activity log
    try {
      const { createActivity } = require('../services/activityService');
      await createActivity({
        type: 'PROFILE_UPDATED',
        title: 'Password Reset',
        description: `Password was reset successfully`,
        userId: decoded.id,
        performedBy: decoded.id,
      });
    } catch (activityError) {
      console.error('Failed to create password reset activity:', activityError);
    }

    res.json({
      message: 'Password reset successful'
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(400).json({
        error: 'Token expired',
        message: 'Password reset link has expired. Please request a new one.'
      });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(400).json({
        error: 'Invalid token',
        message: 'Invalid password reset link.'
      });
    }
    console.error('Reset password error:', error);
    res.status(500).json({
      error: 'Password reset failed',
      message: 'An error occurred during password reset'
    });
  }
});

// Change password (authenticated user)
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const validatedData = changePasswordSchema.parse(req.body);
    const { currentPassword, newPassword } = validatedData;

    // Get user from request (set by auth middleware)
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'You must be logged in to change your password'
      });
    }

    // Get current user
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { password: true },
    });

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User account not found'
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        error: 'Invalid current password',
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    // Create activity log
    try {
      const { createActivity } = require('../services/activityService');
      await createActivity({
        type: 'PROFILE_UPDATED',
        title: 'Password Changed',
        description: `Password was changed successfully`,
        userId: userId,
        performedBy: userId,
      });
    } catch (activityError) {
      console.error('Failed to create password change activity:', activityError);
    }

    res.json({
      message: 'Password changed successfully'
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.errors
      });
    }
    console.error('Change password error:', error);
    res.status(500).json({
      error: 'Password change failed',
      message: 'An error occurred during password change'
    });
  }
});

// Get current user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'You must be logged in to access your profile'
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        title: true,
        phone: true,
        address: true,
        city: true,
        state: true,
        zipCode: true,
        businessName: true,
        lastLogin: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User account not found'
      });
    }

    res.json({
      user: {
        ...user,
        name: `${user.firstName} ${user.lastName}`,
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      error: 'Failed to get profile',
      message: 'An error occurred while fetching your profile'
    });
  }
});

module.exports = router; 