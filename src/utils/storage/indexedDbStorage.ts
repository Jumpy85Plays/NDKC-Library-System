import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { OfflineData, StorageDriver } from './types';

interface LibraryDB extends DBSchema {
  students: {
    key: string;
    value: any;
    indexes: { 'by-name': string };
  };
  attendance: {
    key: number;
    value: any;
    indexes: { 'by-student': string; 'by-timestamp': Date };
  };
  metadata: {
    key: string;
    value: any;
  };
}

const DB_NAME = 'library-attendance';
const DB_VERSION = 1;

class IndexedDBDriver implements StorageDriver {
  name: 'indexeddb' = 'indexeddb';
  private db: IDBPDatabase<LibraryDB> | null = null;

  async initDB(): Promise<IDBPDatabase<LibraryDB>> {
    if (this.db) return this.db;

    this.db = await openDB<LibraryDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Students store
        if (!db.objectStoreNames.contains('students')) {
          const studentStore = db.createObjectStore('students', { keyPath: 'studentId' });
          studentStore.createIndex('by-name', 'name');
        }

        // Attendance store
        if (!db.objectStoreNames.contains('attendance')) {
          const attendanceStore = db.createObjectStore('attendance', { keyPath: 'id', autoIncrement: true });
          attendanceStore.createIndex('by-student', 'studentId');
          attendanceStore.createIndex('by-timestamp', 'timestamp');
        }

        // Metadata store
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'key' });
        }
      },
    });

    return this.db;
  }

  isAvailable(): boolean {
    return typeof window !== 'undefined' && 'indexedDB' in window;
  }

  async load(): Promise<OfflineData> {
    const db = await this.initDB();

    // Load all students
    const students = await db.getAll('students');

    // Load recent attendance (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const allAttendance = await db.getAll('attendance');
    const attendanceRecords = allAttendance
      .filter(record => {
        const recordDate = record.timestamp instanceof Date ? record.timestamp : new Date(record.timestamp);
        return recordDate >= thirtyDaysAgo;
      })
      .map(record => ({
        ...record,
        timestamp: record.timestamp instanceof Date ? record.timestamp : new Date(record.timestamp)
      }));

    // Load metadata
    const syncMetadata = await db.get('metadata', 'lastSync');
    const lastSync = syncMetadata?.value || null;
    
    // Load fullSyncCompleted flag
    const fullSyncMetadata = await db.get('metadata', 'fullSyncCompleted');
    const fullSyncCompleted = fullSyncMetadata?.value || false;

    console.log(`✅ Data loaded from IndexedDB (${students.length} students, ${attendanceRecords.length} attendance records, fullSyncCompleted: ${fullSyncCompleted})`);

    return {
      students,
      attendanceRecords,
      documents: [],
      lastSync,
      fullSyncCompleted
    };
  }

  async save(data: Partial<OfflineData>): Promise<void> {
    const db = await this.initDB();
    const tx = db.transaction(['students', 'attendance', 'metadata'], 'readwrite');

    // Save students
    if (data.students && data.students.length > 0) {
      for (const student of data.students) {
        await tx.objectStore('students').put(student);
      }
    }

    // Save attendance records with deduplication
    if (data.attendanceRecords && data.attendanceRecords.length > 0) {
      const attendanceStore = tx.objectStore('attendance');
      
      for (const record of data.attendanceRecords) {
        // Create a composite key for deduplication
        const compositeKey = `${record.studentId}-${record.timestamp instanceof Date ? record.timestamp.toISOString() : record.timestamp}-${record.type}`;
        
        // Check if record already exists
        const existingRecords = await attendanceStore.index('by-student').getAll(record.studentId);
        const isDuplicate = existingRecords.some(existing => {
          const existingKey = `${existing.studentId}-${existing.timestamp instanceof Date ? existing.timestamp.toISOString() : existing.timestamp}-${existing.type}`;
          return existingKey === compositeKey;
        });

        if (!isDuplicate) {
          await attendanceStore.add({
            ...record,
            timestamp: record.timestamp instanceof Date ? record.timestamp : new Date(record.timestamp)
          });
        }
      }
    }

    // Save lastSync
    if (data.lastSync) {
      await tx.objectStore('metadata').put({ key: 'lastSync', value: data.lastSync });
    }
    
    // Save fullSyncCompleted flag
    if (data.fullSyncCompleted !== undefined) {
      await tx.objectStore('metadata').put({ key: 'fullSyncCompleted', value: data.fullSyncCompleted });
    }

    await tx.done;

    const stats = await this.getStats();
    console.log(`✅ Data saved to IndexedDB (${stats.studentCount} students, ${stats.attendanceCount} attendance records)`);
  }

  async clear(): Promise<void> {
    const db = await this.initDB();
    const tx = db.transaction(['students', 'attendance', 'metadata'], 'readwrite');

    await tx.objectStore('students').clear();
    await tx.objectStore('attendance').clear();
    await tx.objectStore('metadata').clear();

    await tx.done;
    console.log('✅ IndexedDB cleared');
  }

  async getStats() {
    const db = await this.initDB();
    const studentCount = await db.count('students');
    const attendanceCount = await db.count('attendance');
    const syncMetadata = await db.get('metadata', 'lastSync');

    return {
      studentCount,
      attendanceCount,
      lastSync: syncMetadata?.value || null
    };
  }
}

export const indexedDBDriver = new IndexedDBDriver();
