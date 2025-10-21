// middleware/auth.middleware.js
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ 
        error: 'Access token required',
        message: 'Please provide a valid authorization token'
      });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Optional: Verify user still exists and is active
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        status: true,
      },
    });

    if (!user) {
      return res.status(401).json({ 
        error: 'User not found',
        message: 'The user associated with this token no longer exists'
      });
    }

    if (user.status !== 'ACTIVE') {
      return res.status(401).json({ 
        error: 'User account inactive',
        message: 'Your account has been deactivated'
      });
    }

    // Attach user info to request
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expired',
        message: 'Your session has expired. Please login again.'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({ 
        error: 'Invalid token',
        message: 'The provided token is invalid'
      });
    }

    console.error('Authentication error:', error);
    res.status(500).json({ 
      error: 'Authentication failed',
      message: 'An error occurred during authentication'
    });
  }
}

function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'You must be logged in to access this resource'
      });
    }

    // SUPERADMIN has access to everything
    if (req.user.role === 'SUPERADMIN') {
      return next();
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        message: `Access denied. Required role: ${allowedRoles.join(' or ')}`,
        userRole: req.user.role
      });
    }

    next();
  };
}

// Middleware to check if user can access specific user data
function requireUserAccess(req, res, next) {
  const { id } = req.params;
  const user = req.user;

  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Admin and Staff can access any user
  if (user.role === 'ADMIN' || user.role === 'STAFF') {
    return next();
  }

  // Clients can only access their own data
  if (user.role === 'CLIENT' && user.id === id) {
    return next();
  }

  return res.status(403).json({ 
    error: 'Access denied',
    message: 'You can only access your own information'
  });
}

// Optional middleware to log user actions
function logUserAction(action) {
  return (req, res, next) => {
    if (req.user) {
      console.log(`User ${req.user.email} performed action: ${action}`);
      
      // You could also save this to database for audit trail
      // prisma.auditLog.create({
      //   data: {
      //     userId: req.user.id,
      //     action,
      //     resource: req.path,
      //     timestamp: new Date(),
      //   }
      // });
    }
    next();
  };
}

// Middleware to validate API key for webhook endpoints
function validateWebhookSignature(req, res, next) {
  const signature = req.headers['x-webhook-signature'];
  const expectedSignature = process.env.WEBHOOK_SECRET;

  if (!signature || !expectedSignature) {
    return res.status(401).json({ error: 'Webhook signature required' });
  }

  // Simple signature validation - in production, use proper HMAC verification
  if (signature !== expectedSignature) {
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  next();
}

// Rate limiting middleware (basic implementation)
const requestCounts = new Map();

function rateLimit(maxRequests = 100, windowMs = 15 * 60 * 1000) {
  return (req, res, next) => {
    const identifier = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const now = Date.now();
    
    const record = requestCounts.get(identifier);
    
    if (!record || now > record.resetTime) {
      requestCounts.set(identifier, {
        count: 1,
        resetTime: now + windowMs,
      });
      return next();
    }
    
    if (record.count >= maxRequests) {
      return res.status(429).json({
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: Math.ceil((record.resetTime - now) / 1000),
      });
    }
    
    record.count++;
    next();
  };
}

module.exports = {
  authenticateToken,
  requireRole,
  requireUserAccess,
  logUserAction,
  validateWebhookSignature,
  rateLimit,
};