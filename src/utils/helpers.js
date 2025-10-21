// utils/helpers.js

/**
 * Generate a secure random password
 */
function generatePassword(length = 12) {
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*';
  
  const allChars = lowercase + uppercase + numbers + symbols;
  
  let password = '';
  
  // Ensure at least one character from each category
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];
  
  // Fill the rest randomly
  for (let i = 4; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }
  
  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

/**
 * Get initials from a full name
 */
function getInitials(name) {
  if (!name) return 'UN';
  
  return name
    .split(' ')
    .map(part => part.charAt(0))
    .join('')
    .toUpperCase()
    .substring(0, 2);
}

/**
 * Format a date as relative time (e.g., "2 hours ago", "3 days ago")
 */
function formatRelativeTime(date) {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) {
    return 'Just now';
  }
  
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `${diffInMinutes} minute${diffInMinutes === 1 ? '' : 's'} ago`;
  }
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours} hour${diffInHours === 1 ? '' : 's'} ago`;
  }
  
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) {
    return `${diffInDays} day${diffInDays === 1 ? '' : 's'} ago`;
  }
  
  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) {
    return `${diffInMonths} month${diffInMonths === 1 ? '' : 's'} ago`;
  }
  
  const diffInYears = Math.floor(diffInMonths / 12);
  return `${diffInYears} year${diffInYears === 1 ? '' : 's'} ago`;
}

/**
 * Format file size in human readable format
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Validate email address
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate phone number (US format)
 */
function isValidPhone(phone) {
  const phoneRegex = /^(\+\d{1,2}\s?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/;
  return phoneRegex.test(phone);
}

/**
 * Generate a unique identifier
 */
function generateUniqueId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Sanitize HTML content for safe display
 */
function sanitizeHtml(html) {
  // Basic HTML sanitization - in production, use a library like DOMPurify
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+="[^"]*"/gi, '');
}

/**
 * Extract plain text from HTML
 */
function stripHtml(html) {
  return html.replace(/<[^>]*>/g, '').trim();
}

/**
 * Capitalize first letter of each word
 */
function capitalizeWords(str) {
  return str.replace(/\w\S*/g, (txt) => 
    txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
  );
}

/**
 * Generate a slug from a string
 */
function generateSlug(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .trim();
}

/**
 * Get form name by ID (for the form assignment feature)
 */
function getFormNameById(formId) {
  const forms = {
    'form-1': 'Healthcare Buyer Questionnaire',
    'form-2': 'Insurance Preference Form',
    'form-3': 'Provider Selection Form',
    'form-4': 'Medical History Form',
    'form-5': 'Coverage Needs Assessment',
    'form-6': 'Budget Planning Worksheet',
    'form-7': 'Business Valuation Form',
    'form-8': 'Financial Disclosure Form',
    'form-9': 'Legal Documentation Checklist',
    'form-10': 'Confidentiality Agreement',
  };
  
  return forms[formId] || 'Unknown Form';
}

/**
 * Get all available forms
 */
function getAvailableForms() {
  return [
    { id: 'form-1', name: 'Healthcare Buyer Questionnaire', category: 'buyer' },
    { id: 'form-2', name: 'Insurance Preference Form', category: 'buyer' },
    { id: 'form-3', name: 'Provider Selection Form', category: 'buyer' },
    { id: 'form-4', name: 'Medical History Form', category: 'buyer' },
    { id: 'form-5', name: 'Coverage Needs Assessment', category: 'buyer' },
    { id: 'form-6', name: 'Budget Planning Worksheet', category: 'general' },
    { id: 'form-7', name: 'Business Valuation Form', category: 'seller' },
    { id: 'form-8', name: 'Financial Disclosure Form', category: 'seller' },
    { id: 'form-9', name: 'Legal Documentation Checklist', category: 'general' },
    { id: 'form-10', name: 'Confidentiality Agreement', category: 'general' },
  ];
}

/**
 * Get US states list
 */
function getUSStates() {
  return [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
  ];
}

/**
 * Format currency
 */
function formatCurrency(amount, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Parse currency string to number
 */
function parseCurrency(currencyString) {
  return parseFloat(currencyString.replace(/[^0-9.-]+/g, '')) || 0;
}

/**
 * Generate random color for avatars
 */
function generateAvatarColor(seed) {
  const colors = [
    '#305464', '#4D4D4D', '#2C3E50', '#E74C3C', '#3498DB',
    '#2ECC71', '#F39C12', '#9B59B6', '#1ABC9C', '#34495E'
  ];
  
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  return colors[Math.abs(hash) % colors.length];
}

/**
 * Deep clone an object
 */
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (obj instanceof Array) return obj.map(item => deepClone(item));
  if (typeof obj === 'object') {
    const clonedObj = {};
    for (const key in obj) {
      clonedObj[key] = deepClone(obj[key]);
    }
    return clonedObj;
  }
  return obj;
}

/**
 * Check if user is online (basic implementation)
 */
function isUserOnline(lastActivity) {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  return lastActivity > fiveMinutesAgo;
}

/**
 * Generate breadcrumb trail
 */
function generateBreadcrumbs(path) {
  const pathSegments = path.split('/').filter(Boolean);
  const breadcrumbs = [{ name: 'Dashboard', path: '/' }];
  
  let currentPath = '';
  pathSegments.forEach(segment => {
    currentPath += `/${segment}`;
    breadcrumbs.push({
      name: capitalizeWords(segment.replace(/-/g, ' ')),
      path: currentPath,
    });
  });
  
  return breadcrumbs;
}

/**
 * Validate business hours format
 */
function isValidBusinessHours(hours) {
  // Format: "9:00 AM - 5:00 PM"
  const timeRegex = /^\d{1,2}:\d{2}\s?(AM|PM)\s?-\s?\d{1,2}:\d{2}\s?(AM|PM)$/i;
  return timeRegex.test(hours);
}

/**
 * Generate QR code data URL (placeholder - would need actual QR library)
 */
function generateQRCodeUrl(data) {
  // This is a placeholder - in real implementation, use a QR code library
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data)}`;
}

/**
 * Calculate business days between two dates
 */
function calculateBusinessDays(startDate, endDate) {
  let count = 0;
  const current = new Date(startDate);
  
  while (current <= endDate) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not Sunday (0) or Saturday (6)
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  
  return count;
}

/**
 * Format address for display
 */
function formatAddress(address) {
  const parts = [
    address.street,
    address.city,
    address.state,
    address.zipCode
  ].filter(Boolean);
  
  return parts.join(', ');
}

/**
 * Generate password strength score
 */
function getPasswordStrength(password) {
  let score = 0;
  const feedback = [];
  
  if (password.length >= 8) score += 1;
  else feedback.push('Password should be at least 8 characters long');
  
  if (/[a-z]/.test(password)) score += 1;
  else feedback.push('Add lowercase letters');
  
  if (/[A-Z]/.test(password)) score += 1;
  else feedback.push('Add uppercase letters');
  
  if (/\d/.test(password)) score += 1;
  else feedback.push('Add numbers');
  
  if (/[^a-zA-Z\d]/.test(password)) score += 1;
  else feedback.push('Add special characters');
  
  return { score, feedback };
}

module.exports = {
  generatePassword,
  getInitials,
  formatRelativeTime,
  formatFileSize,
  isValidEmail,
  isValidPhone,
  generateUniqueId,
  sanitizeHtml,
  stripHtml,
  capitalizeWords,
  generateSlug,
  getFormNameById,
  getAvailableForms,
  getUSStates,
  formatCurrency,
  parseCurrency,
  generateAvatarColor,
  deepClone,
  isUserOnline,
  generateBreadcrumbs,
  isValidBusinessHours,
  generateQRCodeUrl,
  calculateBusinessDays,
  formatAddress,
  getPasswordStrength,
};