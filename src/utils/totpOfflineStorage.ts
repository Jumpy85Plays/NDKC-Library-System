interface TOTPSecret {
  role: string;
  secret: string;
}

interface TOTPCache {
  secrets: TOTPSecret[];
  lastSync: number;
}

const TOTP_STORAGE_KEY = 'totp_offline_cache';

// Helper function to check if running in Electron
const isElectron = (): boolean => {
  return typeof window !== 'undefined' && window.electronAPI !== undefined;
};

export const saveTOTPSecrets = async (secrets: TOTPSecret[]): Promise<void> => {
  const cache: TOTPCache = {
    secrets,
    lastSync: Date.now()
  };

  // Try Electron SQLite storage first
  if (isElectron()) {
    try {
      // Save TOTP secrets as JSON string in metadata table
      await window.electronAPI.setSyncMetadata('totpSecrets', JSON.stringify(cache.secrets));
      await window.electronAPI.setSyncMetadata('totpLastSync', cache.lastSync.toString());
      
      console.log('✅ TOTP secrets cached to Electron SQLite database');
      return;
    } catch (error) {
      console.warn('Electron SQLite save failed, falling back to localStorage:', error);
    }
  }

  // Fallback to localStorage
  try {
    localStorage.setItem(TOTP_STORAGE_KEY, JSON.stringify(cache));
    console.log('✅ TOTP secrets cached to localStorage');
  } catch (error) {
    console.error('Failed to cache TOTP secrets:', error);
  }
};

export const getTOTPSecrets = async (): Promise<TOTPSecret[]> => {
  // Try Electron SQLite storage first
  if (isElectron()) {
    try {
      const result = await window.electronAPI.getSyncMetadata('totpSecrets');
      
      if (result.success && result.data) {
        const secrets = JSON.parse(result.data);
        console.log('✅ TOTP secrets loaded from Electron SQLite database');
        return secrets;
      }
    } catch (error) {
      console.warn('Failed to load TOTP secrets from Electron, trying localStorage:', error);
    }
  }

  // Fallback to localStorage
  try {
    const stored = localStorage.getItem(TOTP_STORAGE_KEY);
    if (stored) {
      const cache: TOTPCache = JSON.parse(stored);
      return cache.secrets || [];
    }
  } catch (error) {
    console.error('Failed to retrieve TOTP secrets from cache:', error);
  }
  
  return [];
};

export const getTOTPLastSync = async (): Promise<number | null> => {
  // Try Electron SQLite storage first
  if (isElectron()) {
    try {
      const result = await window.electronAPI.getSyncMetadata('totpLastSync');
      
      if (result.success && result.data) {
        return parseInt(result.data, 10);
      }
    } catch (error) {
      console.warn('Failed to get TOTP last sync from Electron, trying localStorage:', error);
    }
  }

  // Fallback to localStorage
  try {
    const stored = localStorage.getItem(TOTP_STORAGE_KEY);
    if (stored) {
      const cache: TOTPCache = JSON.parse(stored);
      return cache.lastSync || null;
    }
  } catch (error) {
    console.error('Failed to get TOTP last sync:', error);
  }
  
  return null;
};

export const clearTOTPSecrets = async (): Promise<void> => {
  // Try Electron SQLite storage first
  if (isElectron()) {
    try {
      // Clear TOTP metadata by setting empty values
      await window.electronAPI.setSyncMetadata('totpSecrets', '[]');
      await window.electronAPI.setSyncMetadata('totpLastSync', '0');
      
      console.log('✅ TOTP secrets cleared from Electron SQLite database');
      return;
    } catch (error) {
      console.warn('Failed to clear TOTP secrets from Electron, trying localStorage:', error);
    }
  }

  // Fallback to localStorage
  try {
    localStorage.removeItem(TOTP_STORAGE_KEY);
    console.log('✅ TOTP secrets cleared from localStorage');
  } catch (error) {
    console.error('Failed to clear TOTP secrets:', error);
  }
};
