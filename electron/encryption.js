const crypto = require('crypto');

// Constants
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32; // 256 bits

let encryptionKey = null;

/**
 * Initialize encryption with a key
 * @param {Buffer|string} key - Encryption key (32 bytes or hex string)
 */
function initEncryption(key) {
  if (!key) {
    throw new Error('Encryption key is required');
  }
  
  if (typeof key === 'string') {
    // Convert hex string to buffer
    encryptionKey = Buffer.from(key, 'hex');
  } else {
    encryptionKey = key;
  }
  
  if (encryptionKey.length !== KEY_LENGTH) {
    throw new Error(`Encryption key must be ${KEY_LENGTH} bytes (${KEY_LENGTH * 2} hex characters)`);
  }
  
  console.log('✅ Encryption initialized');
}

/**
 * Generate a new encryption key
 * @returns {string} Hex-encoded encryption key
 */
function generateKey() {
  return crypto.randomBytes(KEY_LENGTH).toString('hex');
}

/**
 * Encrypt text using AES-256-GCM
 * @param {string|null} text - Text to encrypt
 * @returns {string|null} Encrypted text in format: iv:encrypted:authTag
 */
function encrypt(text) {
  if (!text) return null;
  if (!encryptionKey) {
    throw new Error('Encryption not initialized. Call initEncryption() first.');
  }
  
  try {
    // Generate random IV for each encryption (ensures different ciphertext for same plaintext)
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey, iv);
    
    // Encrypt data
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Get authentication tag
    const authTag = cipher.getAuthTag();
    
    // Return format: iv:encrypted:authTag (all in hex)
    return `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`;
  } catch (error) {
    console.error('❌ Encryption failed:', error.message);
    throw new Error(`Encryption failed: ${error.message}`);
  }
}

/**
 * Decrypt text using AES-256-GCM
 * @param {string|null} encryptedText - Encrypted text in format: iv:encrypted:authTag
 * @returns {string|null} Decrypted text
 */
function decrypt(encryptedText) {
  if (!encryptedText) return null;
  if (!encryptionKey) {
    throw new Error('Encryption not initialized. Call initEncryption() first.');
  }
  
  try {
    // Split encrypted data
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }
    
    const [ivHex, encrypted, authTagHex] = parts;
    
    // Convert from hex
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey, iv);
    decipher.setAuthTag(authTag);
    
    // Decrypt data
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('❌ Decryption failed:', error.message);
    // Return null instead of throwing to handle corrupted data gracefully
    return null;
  }
}

/**
 * Create a deterministic hash for searchable encrypted fields
 * Used for RFID/student_id lookups without decrypting all records
 * @param {string} text - Text to hash
 * @returns {string} SHA-256 hash
 */
function createSearchHash(text) {
  if (!text) return null;
  return crypto.createHash('sha256').update(text).digest('hex');
}

/**
 * Check if encryption is initialized
 * @returns {boolean}
 */
function isInitialized() {
  return encryptionKey !== null;
}

module.exports = {
  initEncryption,
  generateKey,
  encrypt,
  decrypt,
  createSearchHash,
  isInitialized
};
