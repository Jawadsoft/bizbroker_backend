const express = require('express');
const rateLimit = require('express-rate-limit');
const { PrismaClient } = require('@prisma/client');
const {isValidSubdomain, sanitizeSubdomain} = require('../utils/helpers.js');

const router = express.Router();
const prisma = new PrismaClient();

// Rate limiting for subdomain checks
const subdomainCheckLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // limit each IP to 30 requests per windowMs
  message: { error: 'Too many subdomain checks, please try again later.' }
});


const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 registration attempts per windowMs
  message: { error: 'Too many registration attempts, please try again later.' }
});


// GET /api/onboarding/check-subdomain
router.get('/check-subdomain', subdomainCheckLimiter, async (req, res) => {
  try {
    const { subdomain } = req.query;

    if (!subdomain) {
      return res.status(400).json({ error: 'Subdomain is required' });
    }

    const sanitized = sanitizeSubdomain(subdomain);

    if (!isValidSubdomain(sanitized)) {
      return res.status(400).json({ 
        error: 'Invalid subdomain format. Use only lowercase letters, numbers, and hyphens.' 
      });
    }

    // Check if subdomain exists or is reserved
    const existing = await prisma.company.findFirst({
      where: {
        subdomain: sanitized,
        OR: [
          { subscriptionStatus: 'ACTIVE' },
          { subscriptionStatus: 'TRIAL' },
          { 
            subscriptionStatus: 'PENDING_PAYMENT',
            // Still within reservation window
            createdAt: { gt: new Date(Date.now() - 30 * 60 * 1000) }
          }
        ]
      }
    });

    if (existing) {
      // Generate suggestions
      const suggestions = await generateSubdomainSuggestions(sanitized);
      
      return res.json({
        available: false,
        suggestions,
        message: 'This subdomain is already taken'
      });
    }

    return res.json({ 
      available: true,
      subdomain: sanitized,
      message: 'Subdomain is available!'
    });

  } catch (error) {
    console.error('Subdomain check error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function to generate subdomain suggestions
async function generateSubdomainSuggestions(baseSubdomain) {
  const suggestions = [
    `${baseSubdomain}-corp`,
    `${baseSubdomain}-inc`,
    `${baseSubdomain}-co`,
    `${baseSubdomain}-llc`,
    `${baseSubdomain}2024`,
    `${baseSubdomain}${Math.floor(Math.random() * 999) + 1}`
  ];

  const availableSuggestions = [];
  
  for (const suggestion of suggestions) {
    const exists = await prisma.company.findFirst({
      where: { subdomain: suggestion }
    });
    
    if (!exists) {
      availableSuggestions.push(suggestion);
    }
    
    if (availableSuggestions.length >= 3) break;
  }

  return availableSuggestions;
}

module.exports = router;