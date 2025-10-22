const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { PrismaClient } = require('@prisma/client');
const { emailListenerService } = require('./src/services/emailListener');

  const userRoutes = require('./src/routes/users');
  const notesRoutes = require('./src/routes/notes')
  const tasksRoutes = require('./src/routes/tasks')
  const appointmentRoutes = require('./src/routes/appointments')
  const dealsRoutes = require('./src/routes/deals')
  const filesRoutes = require('./src/routes/files')
  const authRoutes = require('./src/routes/auth');
  const businessRoutes = require('./src/routes/businesses');
require('dotenv').config();

// Initialize Express app first
const app = express();
const prisma = new PrismaClient();

// Basic middleware first
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CORS configuration for production and development
const allowedOrigins = [
  'https://bizbroker-front.onrender.com',  // Production frontend
  'http://localhost:3000',                  // Local development
  'http://localhost:8080',                // Alternative local port
  'http://104.236.234.69:3000'             // Previous IP (if still needed)
];

// Add environment variable for additional origins
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  optionsSuccessStatus: 200 // For legacy browser support
}));

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// Logging middleware
app.use(morgan('combined'));

// Basic rate limiting (simple implementation)
const requestCounts = new Map();

function simpleRateLimit(req, res, next) {
  const identifier = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const maxRequests = 100;
  
  const record = requestCounts.get(identifier);
  
  if (!record || now > record.resetTime) {
    requestCounts.set(identifier, {
      count: 1,
      resetTime: now + windowMs,
    });
    return next();
  }
  
  // if (record.count >= maxRequests) {
  //   return res.status(429).json({
  //     error: 'Too many requests',
  //     message: 'Rate limit exceeded. Please try again later.',
  //   });
  // }
  
  record.count++;
  next();
}

app.use(simpleRateLimit);

// Health check endpoint with email service status
app.get('/health', async (req, res) => {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;
    
    // Check if users table exists
    const tableCheck = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `;
    
    // Get email service status
    const emailStatus = emailListenerService.getStatus();
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        users_table_exists: tableCheck[0]?.exists || false,
        email_sending: 'configured',
        email_receiving: emailStatus.isRunning ? 'active' : 'inactive',
        email_reconnect_attempts: emailStatus.reconnectAttempts,
      },
      version: '1.0.0',
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Service unavailable',
      details: error.message,
    });
  }
});

// Email service control endpoints
app.post('/api/email/start-listener', async (req, res) => {
  try {
    await emailListenerService.start();
    res.json({ message: 'Email listener started', status: emailListenerService.getStatus() });
  } catch (error) {
    res.status(500).json({ error: 'Failed to start email listener', message: error.message });
  }
});

app.post('/api/email/stop-listener', (req, res) => {
  try {
    emailListenerService.stop();
    res.json({ message: 'Email listener stopped', status: emailListenerService.getStatus() });
  } catch (error) {
    res.status(500).json({ error: 'Failed to stop email listener', message: error.message });
  }
});

app.get('/api/email/status', (req, res) => {
  res.json({ 
    message: 'Email service status',
    status: emailListenerService.getStatus() 
  });
});

app.post('/api/email/sync', async (req, res) => {
  try {
    await emailListenerService.syncEmails();
    res.json({ message: 'Email sync triggered', status: emailListenerService.getStatus() });
  } catch (error) {
    res.status(500).json({ error: 'Failed to sync emails', message: error.message });
  }
});

// NEW: Refresh user email cache when new users are added
app.post('/api/email/refresh-cache', async (req, res) => {
  try {
    await emailListenerService.refreshUserCache();
    res.json({ message: 'User email cache refreshed', status: emailListenerService.getStatus() });
  } catch (error) {
    res.status(500).json({ error: 'Failed to refresh cache', message: error.message });
  }
});

// NEW: Clear processed message cache
app.post('/api/email/clear-processed-cache', (req, res) => {
  try {
    emailListenerService.clearProcessedCache();
    res.json({ message: 'Processed message cache cleared', status: emailListenerService.getStatus() });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear cache', message: error.message });
  }
});

// Test route
app.get('/test', (req, res) => {
  res.json({ 
    message: 'Server is working!',
    timestamp: new Date().toISOString()
  });
});

// CORS test endpoint
app.get('/cors-test', (req, res) => {
  res.json({
    message: 'CORS is working!',
    origin: req.headers.origin,
    timestamp: new Date().toISOString(),
    allowedOrigins: allowedOrigins
  });
});


  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/notes', notesRoutes);
  app.use('/api/tasks' , tasksRoutes)
  app.use('/api/appointments', appointmentRoutes);
  app.use('/api/deals', dealsRoutes);
  app.use('/api/files', filesRoutes);
  app.use('/api/businesses', businessRoutes); 

// Welcome route
app.get('/', (req, res) => {
  res.json({
    message: 'Healthcare Biz Brokers CRM API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      test: '/test',
      users: '/api/users',
      email_status: '/api/email/status',
      email_sync: '/api/email/sync'
    }
  });
});

// Import and use routes (after basic middleware is set up)
try {
  // Public routes (no authentication required)
  app.use('/api/auth', authRoutes);
  
  // Protected routes (authentication required)
  app.use('/api/users', userRoutes);
  app.use('/api/notes', notesRoutes);
  app.use('/api/tasks' , tasksRoutes)
  app.use('/api/appointments', appointmentRoutes);
  app.use('/api/deals', dealsRoutes);
  app.use('/api/files', filesRoutes); 

  console.log('✅ All routes loaded successfully');
} catch (error) {
  console.error('❌ Failed to load routes:', error.message);
  // Continue without routes for now
}

// Start email listener service when app starts
async function startEmailListener() {
  try {
    // Wait for database to be ready
    console.log('🔍 Checking database readiness...');
    await prisma.$queryRaw`SELECT 1`;
    
    // Check if users table exists
    const tableCheck = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `;
    
    if (!tableCheck[0]?.exists) {
      console.log('❌ Users table not found. Database may not be properly migrated.');
      console.log('   Please check your database migrations.');
      return;
    }
    
    console.log('✅ Database is ready');
    
    // Only start if email configuration is provided
    if (process.env.EMAIL_USERNAME && process.env.EMAIL_PASSWORD) {
      console.log('🔄 Starting email listener service...');
      await emailListenerService.start();
    } else {
      console.log('⚠️  Email credentials not configured. Email listening disabled.');
      console.log('   Set EMAIL_USERNAME and EMAIL_PASSWORD in your .env file to enable email receiving.');
    }
  } catch (error) {
    console.error('❌ Failed to start email listener:', error);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received. Shutting down gracefully...');
  emailListenerService.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received. Shutting down gracefully...');
  emailListenerService.stop();
  process.exit(0);
});

// Start email listener after a short delay to ensure app is ready
setTimeout(startEmailListener, 2000);

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Health check available at: http://localhost:${PORT}/health`);
});

module.exports = app;
