export interface ElectronAPI {
  platform: string;
  versions: any;
  
  // Student operations
  saveStudents: (students: any[]) => Promise<{ success: boolean; count?: number; error?: string }>;
  loadStudents: (filters?: any) => Promise<{ success: boolean; data?: any[]; error?: string }>;
  getStudentById: (studentId: string) => Promise<{ success: boolean; data?: any; error?: string }>;
  getStudentByRFID: (rfid: string) => Promise<{ success: boolean; data?: any; error?: string }>;
  
  // Attendance operations
  saveAttendance: (records: any[]) => Promise<{ success: boolean; count?: number; error?: string }>;
  loadAttendance: (filters?: any) => Promise<{ success: boolean; data?: any[]; error?: string }>;
  getLastAttendance: (studentId: string, type?: string) => Promise<{ success: boolean; data?: any; error?: string }>;
  
  // Sync metadata
  getSyncMetadata: (key: string) => Promise<{ success: boolean; data?: string; error?: string }>;
  setSyncMetadata: (key: string, value: string) => Promise<{ success: boolean; error?: string }>;
  
  // Database maintenance
  vacuumDatabase: () => Promise<{ success: boolean; error?: string }>;
  checkIntegrity: () => Promise<{ success: boolean; isValid?: boolean; error?: string }>;
  getStats: () => Promise<{ success: boolean; data?: any; error?: string }>;
  clearAllData: () => Promise<{ success: boolean; error?: string }>;
  removeDuplicateAttendance: () => Promise<{ success: boolean; removed?: number; error?: string }>;
  // Backup operations
  createBackup: () => Promise<{ success: boolean; path?: string; error?: string }>;
  restoreBackup: () => Promise<{ success: boolean; path?: string; error?: string }>;
  listBackups: () => Promise<{ success: boolean; data?: any[]; error?: string }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}