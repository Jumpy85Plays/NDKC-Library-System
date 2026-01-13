import { OfflineData, StorageDriver } from './types';
import { saveToFileSystem, getFromFileSystem, clearFileSystem } from '../electronStorage';

class ElectronSQLiteDriver implements StorageDriver {
  name: 'electron-sqlite' = 'electron-sqlite';

  isAvailable(): boolean {
    return typeof window !== 'undefined' && Boolean(window.electronAPI);
  }

  async load(): Promise<OfflineData> {
    try {
      const data = await getFromFileSystem();
      console.log('✅ Data loaded from Electron SQLite');
      return data;
    } catch (error) {
      console.error('❌ Failed to load from Electron SQLite:', error);
      throw error;
    }
  }

  async save(data: Partial<OfflineData>): Promise<void> {
    try {
      await saveToFileSystem(data);
      console.log('✅ Data saved to Electron SQLite');
    } catch (error) {
      console.error('❌ Failed to save to Electron SQLite:', error);
      throw error;
    }
  }

  async clear(): Promise<void> {
    try {
      await clearFileSystem();
      console.log('✅ Electron SQLite cleared');
    } catch (error) {
      console.error('❌ Failed to clear Electron SQLite:', error);
      throw error;
    }
  }
}

export const electronSqliteDriver = new ElectronSQLiteDriver();
