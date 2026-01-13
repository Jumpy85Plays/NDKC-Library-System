import { storageManager } from './storage/manager';

export interface OfflineData {
  students: any[];
  attendanceRecords: any[];
  documents: any[];
  lastSync: string | null;
  fullSyncCompleted?: boolean;
}

export const saveToLocalStorage = async (data: Partial<OfflineData>) => {
  try {
    await storageManager.save(data);
  } catch (error) {
    console.error('❌ Storage failed:', error);
    throw error;
  }
};

export const getFromLocalStorage = async (): Promise<OfflineData> => {
  try {
    return await storageManager.load();
  } catch (error) {
    console.error('❌ Storage load failed:', error);
    return {
      students: [],
      attendanceRecords: [],
      documents: [],
      lastSync: null
    };
  }
};

export const clearLocalStorage = async () => {
  try {
    await storageManager.clear();
  } catch (error) {
    console.error('❌ Storage clear failed:', error);
    throw error;
  }
};

export const getCurrentStorageEngine = (): string => {
  return storageManager.getCurrentDriverName();
};

export const isOnline = () => {
  return navigator.onLine;
};
