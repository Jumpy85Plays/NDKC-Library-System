export interface OfflineData {
  students: any[];
  attendanceRecords: any[];
  documents: any[];
  lastSync: string | null;
  fullSyncCompleted?: boolean;
}

export interface StorageDriver {
  name: 'electron-sqlite' | 'indexeddb' | 'localstorage';
  isAvailable(): boolean | Promise<boolean>;
  load(): Promise<OfflineData>;
  save(data: Partial<OfflineData>): Promise<void>;
  clear(): Promise<void>;
}

export interface StorageStats {
  studentCount: number;
  attendanceCount: number;
  lastSync: string | null;
}
