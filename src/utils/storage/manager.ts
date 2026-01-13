import { StorageDriver, OfflineData } from './types';
import { electronSqliteDriver } from './electronSqliteDriver';
import { indexedDBDriver } from './indexedDbStorage';
import { localStorageDriver } from './localStorageDriver';
import { toast } from '@/hooks/use-toast';

class StorageManager {
  private currentDriver: StorageDriver | null = null;
  private initialized: boolean = false;

  private drivers: StorageDriver[] = [
    electronSqliteDriver,
    indexedDBDriver,
    localStorageDriver
  ];

  async init(): Promise<void> {
    if (this.initialized) return;

    // Try drivers in order of preference
    for (const driver of this.drivers) {
      const available = await driver.isAvailable();
      if (available) {
        try {
          // Test the driver
          await driver.load();
          this.currentDriver = driver;
          this.initialized = true;
          
          // Store current driver name for UI
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('current-storage-engine', driver.name);
          }
          
          console.log(`✅ Storage engine initialized: ${driver.name}`);
          
          // Show notification if not using SQLite (fallback mode)
          if (driver.name !== 'electron-sqlite' && typeof window !== 'undefined' && window.electronAPI) {
            toast({
              title: "SQLite Unavailable",
              description: `Using ${driver.name === 'indexeddb' ? 'IndexedDB' : 'LocalStorage'} for data storage. Data remains on this device.`,
              variant: "default",
            });
          }
          
          return;
        } catch (error) {
          console.warn(`❌ Driver ${driver.name} failed initialization:`, error);
          continue;
        }
      }
    }

    throw new Error('No storage driver available');
  }

  async load(): Promise<OfflineData> {
    if (!this.currentDriver) {
      await this.init();
    }

    if (!this.currentDriver) {
      throw new Error('No storage driver initialized');
    }

    try {
      return await this.currentDriver.load();
    } catch (error) {
      console.error(`❌ Load failed with ${this.currentDriver.name}, trying fallback...`);
      
      // Try next available driver
      const currentIndex = this.drivers.indexOf(this.currentDriver);
      for (let i = currentIndex + 1; i < this.drivers.length; i++) {
        const fallbackDriver = this.drivers[i];
        if (await fallbackDriver.isAvailable()) {
          try {
            const data = await fallbackDriver.load();
            this.currentDriver = fallbackDriver;
            console.log(`✅ Switched to fallback driver: ${fallbackDriver.name}`);
            
            toast({
              title: "Storage Fallback",
              description: `Switched to ${fallbackDriver.name} for data storage.`,
              variant: "default",
            });
            
            return data;
          } catch (fallbackError) {
            console.error(`❌ Fallback driver ${fallbackDriver.name} also failed:`, fallbackError);
          }
        }
      }
      
      throw error;
    }
  }

  async save(data: Partial<OfflineData>): Promise<void> {
    if (!this.currentDriver) {
      await this.init();
    }

    if (!this.currentDriver) {
      throw new Error('No storage driver initialized');
    }

    try {
      await this.currentDriver.save(data);
    } catch (error) {
      console.error(`❌ Save failed with ${this.currentDriver.name}, trying fallback...`);
      
      // Try next available driver
      const currentIndex = this.drivers.indexOf(this.currentDriver);
      for (let i = currentIndex + 1; i < this.drivers.length; i++) {
        const fallbackDriver = this.drivers[i];
        if (await fallbackDriver.isAvailable()) {
          try {
            await fallbackDriver.save(data);
            this.currentDriver = fallbackDriver;
            console.log(`✅ Switched to fallback driver: ${fallbackDriver.name}`);
            
            toast({
              title: "Storage Fallback",
              description: `Switched to ${fallbackDriver.name} for data storage.`,
              variant: "default",
            });
            
            return;
          } catch (fallbackError) {
            console.error(`❌ Fallback driver ${fallbackDriver.name} also failed:`, fallbackError);
          }
        }
      }
      
      throw error;
    }
  }

  async clear(): Promise<void> {
    if (!this.currentDriver) {
      await this.init();
    }

    if (!this.currentDriver) {
      throw new Error('No storage driver initialized');
    }

    await this.currentDriver.clear();
  }

  getCurrentDriverName(): string {
    return this.currentDriver?.name || 'unknown';
  }

  getAllDrivers(): StorageDriver[] {
    return this.drivers;
  }

  async migrate(toDriverName: 'electron-sqlite' | 'indexeddb' | 'localstorage'): Promise<void> {
    if (!this.currentDriver) {
      await this.init();
    }

    const targetDriver = this.drivers.find(d => d.name === toDriverName);
    if (!targetDriver) {
      throw new Error(`Driver ${toDriverName} not found`);
    }

    if (!(await targetDriver.isAvailable())) {
      throw new Error(`Driver ${toDriverName} is not available`);
    }

    // Load from current driver
    const data = await this.load();

    // Save to target driver
    await targetDriver.save(data);

    // Switch to target driver
    this.currentDriver = targetDriver;

    console.log(`✅ Migrated data to ${toDriverName}`);
    
    toast({
      title: "Migration Complete",
      description: `Data successfully migrated to ${toDriverName}.`,
    });
  }
}

export const storageManager = new StorageManager();
