import { z, ZodError } from "zod"

// Generic validation middleware
export function validateRequest(schema) {
  return (req, res, next) => {
    try {
      schema.parse({
        body: req.body,
        query: req.query,
        params: req.params
      })
      next()
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = error.errors.map(err => ({
          field: err.path.join("."),
          message: err.message
        }))

        return res.status(400).json({
          error: "Validation failed",
          details: errorMessages
        })
      }
      next(error)
    }
  }
}

// Validation schemas for user operations
export const userValidationSchemas = {
  createUser: z.object({
    body: z.object({
      firstName: z
        .string()
        .min(1, "First name is required")
        .max(50),
      lastName: z
        .string()
        .min(1, "Last name is required")
        .max(50),
      email: z.string().email("Invalid email address"),
      title: z
        .string()
        .max(100)
        .optional(),
      phone: z
        .string()
        .regex(
          /^(\+\d{1,2}\s?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/,
          "Invalid phone number"
        )
        .optional(),
      address: z
        .string()
        .max(200)
        .optional(),
      city: z
        .string()
        .max(50)
        .optional(),
      state: z
        .string()
        .length(2, "State must be 2 characters")
        .optional(),
      zipCode: z
        .string()
        .regex(/^\d{5}(-\d{4})?$/, "Invalid ZIP code")
        .optional(),
      businessName: z
        .string()
        .max(100)
        .optional(),
      stage: z
        .string()
        .max(50)
        .optional(),
      agentId: z
        .string()
        .uuid()
        .optional(),
      leadSource: z
        .string()
        .max(50)
        .optional(),
      preferredContact: z
        .enum(["Email", "Phone", "SMS", "Mail", "Any"])
        .optional(),
      tags: z
        .array(z.string().max(30))
        .max(10)
        .optional(),
      assignedForms: z
        .array(z.string())
        .max(20)
        .optional()
    })
  }),

  updateUser: z.object({
    params: z.object({
      id: z.string().uuid("Invalid user ID")
    }),
    body: z.object({
      firstName: z
        .string()
        .min(1)
        .max(50)
        .optional(),
      lastName: z
        .string()
        .min(1)
        .max(50)
        .optional(),
      email: z
        .string()
        .email()
        .optional(),
      title: z
        .string()
        .max(100)
        .optional(),
      phone: z
        .string()
        .regex(/^(\+\d{1,2}\s?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/)
        .optional(),
      address: z
        .string()
        .max(200)
        .optional(),
      city: z
        .string()
        .max(50)
        .optional(),
      state: z
        .string()
        .length(2)
        .optional(),
      zipCode: z
        .string()
        .regex(/^\d{5}(-\d{4})?$/)
        .optional(),
      businessName: z
        .string()
        .max(100)
        .optional(),
      stage: z
        .string()
        .max(50)
        .optional(),
      agentId: z
        .string()
        .uuid()
        .optional(),
      leadSource: z
        .string()
        .max(50)
        .optional(),
      preferredContact: z
        .enum(["Email", "Phone", "SMS", "Mail", "Any"])
        .optional(),
      buyerSellerNDA: z.boolean().optional(),
      buyerSellerWorksheet: z.boolean().optional(),
      listingAgreement: z.enum(["YES", "NO", "NA"]).optional(),
      bizBenId: z
        .string()
        .max(20)
        .optional(),
      bizBuySellId: z
        .string()
        .max(20)
        .optional(),
      businessesForSaleId: z
        .string()
        .max(20)
        .optional(),
      dealStreamId: z
        .string()
        .max(20)
        .optional()
    })
  }),

  sendEmail: z.object({
    params: z.object({
      id: z.string().uuid("Invalid user ID")
    }),
    body: z.object({
      subject: z
        .string()
        .min(1, "Subject is required")
        .max(200),
      body: z
        .string()
        .min(1, "Body is required")
        .max(50000),
      htmlBody: z
        .string()
        .max(100000)
        .optional(),
      attachments: z
        .array(z.string().url())
        .max(10)
        .optional()
    })
  }),

  addNote: z.object({
    params: z.object({
      id: z.string().uuid("Invalid user ID")
    }),
    body: z.object({
      content: z
        .string()
        .min(1, "Note content is required")
        .max(10000),
      contentType: z.enum(["html", "plain"]).default("html"),
      isInternal: z.boolean().default(false)
    })
  }),

  createTask: z.object({
    params: z.object({
      id: z.string().uuid("Invalid user ID")
    }),
    body: z.object({
      title: z
        .string()
        .min(1, "Task title is required")
        .max(200),
      description: z
        .string()
        .max(1000)
        .optional(),
      priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
      dueDate: z
        .string()
        .datetime()
        .optional(),
      relatedTo: z
        .string()
        .max(100)
        .optional()
    })
  })
}

// Validation schemas for query parameters
export const queryValidationSchemas = {
  pagination: z.object({
    query: z.object({
      page: z
        .string()
        .regex(/^\d+$/)
        .transform(Number)
        .default("1"),
      limit: z
        .string()
        .regex(/^\d+$/)
        .transform(Number)
        .default("10"),
      search: z
        .string()
        .max(100)
        .optional()
    })
  }),

  userFilters: z.object({
    query: z.object({
      page: z
        .string()
        .regex(/^\d+$/)
        .transform(Number)
        .default("1"),
      limit: z
        .string()
        .regex(/^\d+$/)
        .transform(Number)
        .default("10"),
      search: z
        .string()
        .max(100)
        .optional(),
      role: z.enum(["ADMIN", "STAFF", "CLIENT"]).optional(),
      status: z.enum(["ACTIVE", "INACTIVE", "PENDING"]).optional(),
      stage: z
        .string()
        .max(50)
        .optional(),
      agentId: z
        .string()
        .uuid()
        .optional()
    })
  })
}

// File upload validation
export const fileValidationSchemas = {
  uploadFile: z.object({
    body: z.object({
      category: z
        .string()
        .max(50)
        .optional(),
      description: z
        .string()
        .max(500)
        .optional(),
      isPublic: z.boolean().default(false)
    })
  })
}

// Custom validation functions
export function validateFileUpload(allowedTypes, maxSize = 10 * 1024 * 1024) {
  return (req, res, next) => {
    if (!req.file && !req.files) {
      return res.status(400).json({ error: "No file uploaded" })
    }

    const file =
      req.file || (Array.isArray(req.files) ? req.files[0] : req.files)

    if (!file) {
      return res.status(400).json({ error: "Invalid file" })
    }

    // Check file type
    if (!allowedTypes.includes(file.mimetype)) {
      return res.status(400).json({
        error: "Invalid file type",
        allowedTypes,
        receivedType: file.mimetype
      })
    }

    // Check file size
    if (file.size > maxSize) {
      return res.status(400).json({
        error: "File too large",
        maxSize: `${maxSize / 1024 / 1024}MB`,
        receivedSize: `${(file.size / 1024 / 1024).toFixed(2)}MB`
      })
    }

    next()
  }
}

// Sanitize HTML input
export function sanitizeHtmlInput(req, res, next) {
  const fieldsToSanitize = ["body", "htmlBody", "content", "description"]

  fieldsToSanitize.forEach(field => {
    if (req.body[field] && typeof req.body[field] === "string") {
      // Basic HTML sanitization - remove dangerous elements
      req.body[field] = req.body[field]
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
        .replace(/javascript:/gi, "")
        .replace(/on\w+="[^"]*"/gi, "")
    }
  })

  next()
}

// Rate limiting validation
export function validateRateLimit(req, res, next) {
  const userAgent = req.headers["user-agent"]
  const suspiciousPatterns = [/bot/i, /crawler/i, /spider/i, /curl/i, /wget/i]

  if (
    userAgent &&
    suspiciousPatterns.some(pattern => pattern.test(userAgent))
  ) {
    return res.status(429).json({
      error: "Automated requests not allowed",
      message: "Please use the web interface for normal usage"
    })
  }

  next()
}

// Validate user ownership
export function validateUserOwnership(req, res, next) {
  const { id } = req.params
  const user = req.user

  if (!user) {
    return res.status(401).json({ error: "Authentication required" })
  }

  // Admin and Staff can access any user
  if (user.role === "ADMIN" || user.role === "STAFF") {
    return next()
  }

  // Clients can only access their own data
  if (user.role === "CLIENT" && user.id !== id) {
    return res.status(403).json({
      error: "Access denied",
      message: "You can only access your own information"
    })
  }

  next()
}

// Email validation middleware
export function validateEmailWebhook(req, res, next) {
  const requiredFields = ["from", "to", "subject", "body"]
  const missingFields = requiredFields.filter(field => !req.body[field])

  if (missingFields.length > 0) {
    return res.status(400).json({
      error: "Missing required fields",
      missingFields
    })
  }

  // Validate email addresses
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(req.body.from) || !emailRegex.test(req.body.to)) {
    return res.status(400).json({ error: "Invalid email address format" })
  }

  next()
}

// Common validation error handler
export function handleValidationError(error, req, res, next) {
  if (error instanceof ZodError) {
    const errorMessages = error.errors.map(err => ({
      field: err.path.join("."),
      message: err.message
    }))

    return res.status(400).json({
      error: "Validation failed",
      details: errorMessages
    })
  }

  next(error)
}
