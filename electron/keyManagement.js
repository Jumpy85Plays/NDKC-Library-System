const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const crypto = require('crypto');

const KEY_FILE_NAME = '.encryption-key';

/**
 * Get or generate encryption key
 * Priority: Environment variable > Key file > Generate new
 * @returns {string} Hex-encoded encryption key
 */
function getOrCreateEncryptionKey() {
  // 1. Check environment variable first (for production deployments)
  if (process.env.DB_ENCRYPTION_KEY) {
    console.log('✅ Using encryption key from environment variable');
    return process.env.DB_ENCRYPTION_KEY;
  }
  
  // 2. Check if key file exists
  const keyFilePath = getKeyFilePath();
  
  if (fs.existsSync(keyFilePath)) {
    try {
      const key = fs.readFileSync(keyFilePath, 'utf8').trim();
      console.log('✅ Loaded encryption key from file');
      return key;
    } catch (error) {
      console.error('❌ Failed to read encryption key file:', error.message);
      throw new Error('Failed to load encryption key. Application cannot start.');
    }
  }
  
  // 3. Generate new key and save it
  console.log('⚠️ No encryption key found. Generating new key...');
  const newKey = crypto.randomBytes(32).toString('hex');
  
  try {
    // Save key to file with restricted permissions
    fs.writeFileSync(keyFilePath, newKey, { mode: 0o600 }); // Read/write for owner only
    console.log('✅ New encryption key generated and saved to:', keyFilePath);
    console.log('⚠️ IMPORTANT: Backup this key file! Lost key = lost data!');
    return newKey;
  } catch (error) {
    console.error('❌ Failed to save encryption key:', error.message);
    throw new Error('Failed to save encryption key. Application cannot start.');
  }
}

/**
 * Get the path to the encryption key file
 * @returns {string}
 */
function getKeyFilePath() {
  return path.join(app.getPath('userData'), KEY_FILE_NAME);
}

/**
 * Export encryption key to a backup file
 * @param {string} backupPath - Path to save the backup
 * @returns {boolean} Success status
 */
function backupEncryptionKey(backupPath) {
  try {
    const keyFilePath = getKeyFilePath();
    
    if (!fs.existsSync(keyFilePath)) {
      throw new Error('No encryption key file found');
    }
    
    const key = fs.readFileSync(keyFilePath, 'utf8');
    fs.writeFileSync(backupPath, key, { mode: 0o600 });
    
    console.log('✅ Encryption key backed up to:', backupPath);
    return true;
  } catch (error) {
    console.error('❌ Failed to backup encryption key:', error.message);
    return false;
  }
}

/**
 * Import encryption key from a backup file
 * WARNING: This will replace the existing key!
 * @param {string} backupPath - Path to the backup file
 * @returns {boolean} Success status
 */
function restoreEncryptionKey(backupPath) {
  try {
    if (!fs.existsSync(backupPath)) {
      throw new Error('Backup file not found');
    }
    
    const key = fs.readFileSync(backupPath, 'utf8').trim();
    
    // Validate key format (should be 64 hex characters)
    if (!/^[0-9a-f]{64}$/i.test(key)) {
      throw new Error('Invalid key format in backup file');
    }
    
    const keyFilePath = getKeyFilePath();
    fs.writeFileSync(keyFilePath, key, { mode: 0o600 });
    
    console.log('✅ Encryption key restored from backup');
    return true;
  } catch (error) {
    console.error('❌ Failed to restore encryption key:', error.message);
    return false;
  }
}

module.exports = {
  getOrCreateEncryptionKey,
  getKeyFilePath,
  backupEncryptionKey,
  restoreEncryptionKey
};
