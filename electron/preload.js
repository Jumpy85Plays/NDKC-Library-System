// Preload script for security
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  versions: process.versions,
  
  // Student operations
  saveStudents: (students) => ipcRenderer.invoke('save-students', students),
  loadStudents: (filters) => ipcRenderer.invoke('load-students', filters),
  getStudentById: (studentId) => ipcRenderer.invoke('get-student-by-id', studentId),
  getStudentByRFID: (rfid) => ipcRenderer.invoke('get-student-by-rfid', rfid),
  
  // Attendance operations
  saveAttendance: (records) => ipcRenderer.invoke('save-attendance', records),
  loadAttendance: (filters) => ipcRenderer.invoke('load-attendance', filters),
  getLastAttendance: (studentId, type) => ipcRenderer.invoke('get-last-attendance', studentId, type),
  
  // Sync metadata
  getSyncMetadata: (key) => ipcRenderer.invoke('get-sync-metadata', key),
  setSyncMetadata: (key, value) => ipcRenderer.invoke('set-sync-metadata', key, value),
  
  // Database maintenance
  vacuumDatabase: () => ipcRenderer.invoke('vacuum-database'),
  checkIntegrity: () => ipcRenderer.invoke('check-integrity'),
  getStats: () => ipcRenderer.invoke('get-stats'),
  clearAllData: () => ipcRenderer.invoke('clear-all-data'),
  removeDuplicateAttendance: () => ipcRenderer.invoke('remove-duplicate-attendance'),
  
  // Backup operations
  createBackup: () => ipcRenderer.invoke('create-backup'),
  restoreBackup: () => ipcRenderer.invoke('restore-backup'),
  listBackups: () => ipcRenderer.invoke('list-backups'),
});