import { OfflineData, StorageDriver } from './types';

const STORAGE_KEY = 'library-attendance-offline';

class LocalStorageDriver implements StorageDriver {
  name: 'localstorage' = 'localstorage';

  isAvailable(): boolean {
    return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
  }

  async load(): Promise<OfflineData> {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        
        console.log('✅ Data loaded from localStorage');
        return {
          ...parsed,
          attendanceRecords: parsed.attendanceRecords?.map((record: any) => ({
            ...record,
            timestamp: typeof record.timestamp === 'string' ? new Date(record.timestamp) : record.timestamp
          })) || [],
          students: parsed.students?.map((student: any) => ({
            ...student,
            lastScan: typeof student.lastScan === 'string' ? new Date(student.lastScan) : student.lastScan,
            registrationDate: typeof student.registrationDate === 'string' ? new Date(student.registrationDate) : student.registrationDate
          })) || []
        };
      }
    } catch (error) {
      console.error('❌ Failed to load from localStorage:', error);
    }
    
    return {
      students: [],
      attendanceRecords: [],
      documents: [],
      lastSync: null
    };
  }

  async save(data: Partial<OfflineData>): Promise<void> {
    try {
      const existing = await this.load();
      
      // Merge data
      const allAttendance = [
        ...(existing.attendanceRecords || []),
        ...(data.attendanceRecords || [])
      ];
      
      const allStudents = [
        ...(existing.students || []),
        ...(data.students || [])
      ];
      
      // Remove duplicates
      const uniqueAttendance = Array.from(
        new Map(allAttendance.map(r => [
          `${r.studentId}-${r.timestamp instanceof Date ? r.timestamp.toISOString() : r.timestamp}-${r.type}`, 
          r
        ])).values()
      );
      
      const uniqueStudents = Array.from(
        new Map(allStudents.map(s => [s.studentId, s])).values()
      );
      
      const updated: OfflineData = {
        students: uniqueStudents,
        attendanceRecords: uniqueAttendance,
        documents: data.documents || existing.documents || [],
        lastSync: data.lastSync || existing.lastSync || null
      };
      
      // Serialize properly
      const serializedData = {
        ...updated,
        attendanceRecords: updated.attendanceRecords?.map(record => ({
          ...record,
          timestamp: record.timestamp instanceof Date ? record.timestamp.toISOString() : record.timestamp
        })),
        students: updated.students?.map(student => ({
          ...student,
          lastScan: student.lastScan instanceof Date ? student.lastScan.toISOString() : student.lastScan,
          registrationDate: student.registrationDate instanceof Date ? student.registrationDate.toISOString() : student.registrationDate
        }))
      };
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializedData));
      console.log(`✅ Data saved to localStorage (${updated.students.length} students, ${updated.attendanceRecords.length} attendance records)`);
    } catch (error) {
      console.error('❌ Failed to save to localStorage:', error);
      throw error;
    }
  }

  async clear(): Promise<void> {
    try {
      localStorage.removeItem(STORAGE_KEY);
      console.log('✅ localStorage cleared');
    } catch (error) {
      console.error('❌ Failed to clear localStorage:', error);
      throw error;
    }
  }
}

export const localStorageDriver = new LocalStorageDriver();
