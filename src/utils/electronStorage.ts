// SQLite-based Electron storage implementation
export interface OfflineData {
  students: any[];
  attendanceRecords: any[];
  documents: any[];
  lastSync: string | null;
  fullSyncCompleted?: boolean;
}

// Check if running in Electron
const isElectron = () => {
  return typeof window !== 'undefined' && window.electronAPI;
};

export const saveToFileSystem = async (data: Partial<OfflineData>) => {
  if (!isElectron()) {
    throw new Error('Not running in Electron environment');
  }

  try {
    // Save students if provided
    if (data.students && data.students.length > 0) {
      const serializedStudents = data.students.map(student => ({
        studentId: student.studentId,
        name: student.name,
        email: student.email,
        course: student.course,
        year: student.year,
        contactNumber: student.contactNumber,
        biometricData: student.biometricData,
        rfid: student.rfid,
        library: student.library,
        userType: student.userType,
        studentType: student.studentType,
        level: student.level,
        strand: student.strand,
        registrationDate: student.registrationDate instanceof Date ? student.registrationDate.toISOString() : student.registrationDate,
        lastScan: student.lastScan instanceof Date ? student.lastScan.toISOString() : student.lastScan
      }));
      
      const result = await window.electronAPI.saveStudents(serializedStudents);
      if (!result.success) {
        throw new Error(result.error);
      }
      console.log(`Saved ${result.count} students to SQLite`);
    }

    // Save attendance records if provided
    if (data.attendanceRecords && data.attendanceRecords.length > 0) {
      const serializedRecords = data.attendanceRecords.map(record => ({
        studentDatabaseId: record.studentDatabaseId,
        studentId: record.studentId,
        studentName: record.studentName,
        timestamp: record.timestamp instanceof Date ? record.timestamp.toISOString() : record.timestamp,
        type: record.type,
        barcode: record.barcode,
        method: record.method,
        purpose: record.purpose,
        contact: record.contact,
        library: record.library,
        course: record.course,
        year: record.year,
        userType: record.userType,
        studentType: record.studentType,
        level: record.level,
        strand: record.strand
      }));
      
      const result = await window.electronAPI.saveAttendance(serializedRecords);
      if (!result.success) {
        throw new Error(result.error);
      }
      console.log(`Saved ${result.count} attendance records to SQLite`);
    }

    // Save sync metadata if provided
    if (data.lastSync) {
      const result = await window.electronAPI.setSyncMetadata('lastSync', data.lastSync);
      if (!result.success) {
        throw new Error(result.error);
      }
    }

    // Save fullSyncCompleted flag if provided
    if (data.fullSyncCompleted !== undefined) {
      const result = await window.electronAPI.setSyncMetadata('fullSyncCompleted', data.fullSyncCompleted ? 'true' : 'false');
      if (!result.success) {
        throw new Error(result.error);
      }
    }

    console.log('Data saved to SQLite database');
  } catch (error) {
    console.error('Failed to save to SQLite:', error);
    throw error;
  }
};

export const getFromFileSystem = async (): Promise<OfflineData> => {
  if (!isElectron()) {
    throw new Error('Not running in Electron environment');
  }

  try {
    // Get last 30 days of attendance records by default
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Load students
    const studentsResult = await window.electronAPI.loadStudents({ limit: 10000 });
    if (!studentsResult.success) {
      throw new Error(studentsResult.error);
    }

    // Load recent attendance records
    const attendanceResult = await window.electronAPI.loadAttendance({
      startDate: thirtyDaysAgo.toISOString(),
      limit: 10000
    });
    if (!attendanceResult.success) {
      throw new Error(attendanceResult.error);
    }

    // Get last sync time
    const syncResult = await window.electronAPI.getSyncMetadata('lastSync');
    const lastSync = syncResult.success ? syncResult.data : null;

    // Get fullSyncCompleted flag
    const fullSyncResult = await window.electronAPI.getSyncMetadata('fullSyncCompleted');
    const fullSyncCompleted = fullSyncResult.success && fullSyncResult.data === 'true';

    // Deserialize Date objects properly
    const students = studentsResult.data.map((student: any) => ({
      ...student,
      lastScan: typeof student.lastScan === 'string' ? new Date(student.lastScan) : student.lastScan,
      registrationDate: typeof student.registrationDate === 'string' ? new Date(student.registrationDate) : student.registrationDate
    }));

    const attendanceRecords = attendanceResult.data.map((record: any) => ({
      ...record,
      timestamp: typeof record.timestamp === 'string' ? new Date(record.timestamp) : record.timestamp
    }));

    console.log(`Loaded ${students.length} students and ${attendanceRecords.length} attendance records from SQLite`);

    return {
      students,
      attendanceRecords,
      documents: [],
      lastSync,
      fullSyncCompleted
    };
  } catch (error) {
    console.error('Failed to load from SQLite:', error);
    return {
      students: [],
      attendanceRecords: [],
      documents: [],
      lastSync: null
    };
  }
};

export const clearFileSystem = async () => {
  if (!isElectron()) {
    throw new Error('Not running in Electron environment');
  }

  try {
    const result = await window.electronAPI.clearAllData();
    if (result.success) {
      console.log('SQLite database cleared');
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    console.error('Failed to clear SQLite database:', error);
    throw error;
  }
};