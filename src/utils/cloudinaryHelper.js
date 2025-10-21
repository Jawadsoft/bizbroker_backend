const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

let obj = {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
}

/**
 * Upload file to Cloudinary
 * @param {Buffer|string} file - File buffer or base64 string
 * @param {Object} options - Upload options
 * @returns {Promise<Object>} Upload result
 */
async function uploadToCloudinary(file, options = {}) {
  try {
    const uploadOptions = {
      folder: options.folder || 'deals',
      resource_type: 'auto',
      allowed_formats: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png', 'gif'],
      transformation: [
        { quality: 'auto' },
        { fetch_format: 'auto' }
      ],
      ...options
    };

    let uploadResult;
    
    if (Buffer.isBuffer(file)) {
      // Upload from buffer using Promise
      uploadResult = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          uploadOptions,
          (error, result) => {
            if (error) {
              reject(new Error(`Cloudinary upload failed: ${error.message}`));
            } else {
              resolve(result);
            }
          }
        );
        uploadStream.end(file);
      });
    } else if (typeof file === 'string') {
      uploadResult = await cloudinary.uploader.upload(file, uploadOptions);
    } else {
      throw new Error('Invalid file format. Expected Buffer or base64 string.');
    }

    return {
      success: true,
      url: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      format: uploadResult.format,
      size: uploadResult.bytes,
      width: uploadResult.width,
      height: uploadResult.height,
    };
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw new Error(`File upload failed: ${error.message}`);
  }
}

/**
 * Delete file from Cloudinary
 * @param {string} publicId - Cloudinary public ID
 * @returns {Promise<Object>} Delete result
 */
async function deleteFromCloudinary(publicId) {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return {
      success: result.result === 'ok',
      message: result.result
    };
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    throw new Error(`File deletion failed: ${error.message}`);
  }
}

/**
 * Get file info from Cloudinary URL
 * @param {string} url - Cloudinary URL
 * @returns {Object} File information
 */
function getFileInfoFromUrl(url) {
  try {
    const urlParts = url.split('/');
    const filename = urlParts[urlParts.length - 1];
    const publicId = urlParts.slice(-2).join('/').split('.')[0];
    
    return {
      filename,
      publicId,
      format: filename.split('.').pop(),
    };
  } catch (error) {
    console.error('Error parsing Cloudinary URL:', error);
    return null;
  }
}

/**
 * Validate file before upload
 * @param {Object} file - File object
 * @param {Array} allowedTypes - Allowed MIME types
 * @param {number} maxSize - Maximum file size in bytes
 * @returns {Object} Validation result
 */
function validateFile(file, allowedTypes = [], maxSize = 10 * 1024 * 1024) {
  const errors = [];

  // Check file size
  if (file.size > maxSize) {
    errors.push(`File size exceeds ${maxSize / 1024 / 1024}MB limit`);
  }

  // Check file type
  if (allowedTypes.length > 0 && !allowedTypes.includes(file.mimetype)) {
    errors.push(`File type ${file.mimetype} is not allowed`);
  }

  // Check file name
  if (!file.originalname || file.originalname.trim() === '') {
    errors.push('File name is required');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Format file size for display
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = {
  uploadToCloudinary,
  deleteFromCloudinary,
  getFileInfoFromUrl,
  validateFile,
  formatFileSize,
}; 