const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const isDev = process.env.NODE_ENV === 'development';
const db = require('./database');
const migration = require('./migration');
const backup = require('./backup');
const encryption = require('./encryption');
const keyManagement = require('./keyManagement');

// Set consistent app name and userData path
app.setName('Library Attendance System');
app.setAppUserModelId('com.library.attendance');
const userDataPath = path.join(app.getPath('appData'), 'Library Attendance System');
app.setPath('userData', userDataPath);

console.log('App userData path:', app.getPath('userData'));

// Keep a global reference of the window object
let mainWindow;

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, '../public/favicon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false, // Don't show until ready-to-show
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:8080');
    // Open DevTools in development
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // Focus on window
    if (isDev) {
      mainWindow.focus();
    }
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// App event handlers
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
    shell.openExternal(navigationUrl);
  });
});

// Create application menu
function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Backup Database',
          accelerator: 'CmdOrCtrl+B',
          click: async () => {
            await backup.createBackup(mainWindow);
          }
        },
        {
          label: 'Restore from Backup',
          click: async () => {
            await backup.restoreBackup(mainWindow);
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Open Data Folder',
          click: async () => {
            const userDataPath = app.getPath('userData');
            shell.openPath(userDataPath);
          }
        },
        {
          label: 'Show Data Path',
          click: async () => {
            const dbPath = path.join(app.getPath('userData'), 'library-attendance.db');
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Database Location',
              message: 'SQLite Database Path',
              detail: dbPath,
              buttons: ['Copy Path', 'OK']
            }).then((response) => {
              if (response.response === 0) {
                const { clipboard } = require('electron');
                clipboard.writeText(dbPath);
              }
            });
          }
        },
        {
          label: 'Diagnostics',
          click: async () => {
            try {
              const dbPath = path.join(app.getPath('userData'), 'library-attendance.db');
              const dbExists = fs.existsSync(dbPath);
              const preloadStatus = await mainWindow.webContents.executeJavaScript('Boolean(window.electronAPI)');
              
              let sqliteInfo = 'Not loaded';
              let sqliteVersion = 'N/A';
              let nativeModuleABI = 'N/A';
              
              try {
                const betterSqlite3 = require('better-sqlite3');
                sqliteVersion = require('better-sqlite3/package.json').version;
                sqliteInfo = 'Loaded successfully';
                nativeModuleABI = process.versions.modules;
              } catch (err) {
                sqliteInfo = `Failed to load: ${err.message}`;
              }
              
              const diagnosticInfo = `Database Path: ${dbPath}
Database File Exists: ${dbExists ? 'Yes' : 'No'}
Preload Loaded: ${preloadStatus ? 'Yes' : 'No'}

Platform: ${process.platform}
Electron Version: ${process.versions.electron}
Node Version: ${process.versions.node}
Node ABI (modules): ${nativeModuleABI}

better-sqlite3 Version: ${sqliteVersion}
better-sqlite3 Status: ${sqliteInfo}`;

              dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'System Diagnostics',
                message: 'Application Diagnostics',
                detail: diagnosticInfo,
                buttons: ['OK']
              });
            } catch (error) {
              console.error('Diagnostics failed:', error);
              dialog.showMessageBox(mainWindow, {
                type: 'error',
                title: 'Diagnostics Failed',
                message: 'Failed to retrieve diagnostics.',
                detail: error?.message || String(error),
                buttons: ['OK']
              });
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Database Health Check',
          click: async () => {
            try {
              const stats = db.getStats();
              const integrity = db.checkIntegrity();
              const backups = await backup.listBackups();
              
              const message = `Database Health Report:
              
Students: ${stats.students.toLocaleString()}
Attendance Records: ${stats.attendanceRecords.toLocaleString()}
Documents: ${stats.documents.toLocaleString()}

Integrity Check: ${integrity ? '✅ Passed' : '❌ Failed'}
Available Backups: ${backups.length}
Last Backup: ${backups.length > 0 ? new Date(backups[0].created).toLocaleString() : 'Never'}`;

              dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'Database Health Check',
                message: 'Database Status',
                detail: message,
                buttons: ['OK']
              });
            } catch (error) {
              console.error('Health check failed:', error);
              dialog.showMessageBox(mainWindow, {
                type: 'error',
                title: 'Database Health Check Failed',
                message: 'An error occurred during database health check.',
                detail: error?.message || String(error),
                buttons: ['OK']
              });
            }
          }
        },
        {
          label: 'Optimize Database',
          click: async () => {
            try {
              db.vacuumDatabase();
              dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'Optimization Complete',
                message: 'Database has been optimized successfully',
                buttons: ['OK']
              });
            } catch (error) {
              console.error('Optimization failed:', error);
              dialog.showMessageBox(mainWindow, {
                type: 'error',
                title: 'Optimization Failed',
                message: 'An error occurred during database optimization.',
                detail: error?.message || String(error),
                buttons: ['OK']
              });
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Encrypt Existing Data',
          click: async () => {
            const result = await dialog.showMessageBox(mainWindow, {
              type: 'warning',
              title: 'Encrypt Database',
              message: 'Encrypt all existing unencrypted data?',
              detail: 'This will encrypt sensitive student information (names, emails, contact numbers, biometric data, RFID) using AES-256-GCM encryption.\n\nThis operation cannot be undone without the encryption key.\n\nRecommended: Create a backup first.',
              buttons: ['Cancel', 'Create Backup First', 'Encrypt Now'],
              defaultId: 1,
              cancelId: 0
            });
            
            if (result.response === 0) {
              return; // Cancel
            }
            
            if (result.response === 1) {
              // Create backup first
              const backupResult = await backup.createBackup(mainWindow);
              if (!backupResult.success) {
                dialog.showMessageBox(mainWindow, {
                  type: 'error',
                  title: 'Backup Failed',
                  message: 'Cannot proceed without backup',
                  detail: 'Please create a backup manually before encrypting data.',
                  buttons: ['OK']
                });
                return;
              }
            }
            
            // Run encryption migration
            await migration.migrateToEncryption(mainWindow);
          }
        },
        {
          label: 'Show Encryption Key Location',
          click: async () => {
            const keyPath = keyManagement.getKeyFilePath();
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Encryption Key Location',
              message: 'Encryption Key File Path',
              detail: `${keyPath}\n\n⚠️ IMPORTANT:\n• Keep this file safe and backed up\n• Lost key = lost data\n• Never share this key\n• Store backups in a secure location`,
              buttons: ['Copy Path', 'OK']
            }).then((response) => {
              if (response.response === 0) {
                const { clipboard } = require('electron');
                clipboard.writeText(keyPath);
              }
            });
          }
        }
      ]
    }
  ];

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(async () => {
  createMenu();
  
  // Initialize encryption first
  try {
    const encryptionKey = keyManagement.getOrCreateEncryptionKey();
    encryption.initEncryption(encryptionKey);
    console.log('✅ Encryption system ready');
  } catch (error) {
    console.error('Encryption initialization failed:', error);
    dialog.showErrorBox('Encryption Initialization Failed', 
      `Failed to initialize encryption system.\n\nError: ${error.message || String(error)}\n\nThe application cannot start without encryption. Please check the logs.`
    );
    app.quit();
    return;
  }
  
  // Initialize database with error handling
  try {
    db.initDatabase();
  } catch (error) {
    console.error('Database initialization failed:', error);
    dialog.showErrorBox('Database Initialization Failed', 
      `Failed to initialize SQLite database.\n\nError: ${error.message || String(error)}\n\nThe application may not work correctly. Please check the logs or reinstall the application.`
    );
  }
  
  // Run migration from JSON if needed
  await migration.migrateFromJSON(mainWindow);
  
  // Setup IPC handlers
  setupDatabaseHandlers();
  
  // Start automatic daily backups
  backup.startAutomaticBackup(mainWindow);
});

// Database handlers for data persistence
function setupDatabaseHandlers() {
  // Student operations
  ipcMain.handle('save-students', async (event, students) => {
    try {
      return db.saveStudents(students);
    } catch (error) {
      console.error('Failed to save students:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('load-students', async (event, filters) => {
    try {
      const students = db.getStudents(filters);
      return { success: true, data: students };
    } catch (error) {
      console.error('Failed to load students:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-student-by-id', async (event, studentId) => {
    try {
      const student = db.getStudentById(studentId);
      return { success: true, data: student };
    } catch (error) {
      console.error('Failed to get student:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-student-by-rfid', async (event, rfid) => {
    try {
      const student = db.getStudentByRFID(rfid);
      return { success: true, data: student };
    } catch (error) {
      console.error('Failed to get student by RFID:', error);
      return { success: false, error: error.message };
    }
  });

  // Attendance operations
  ipcMain.handle('save-attendance', async (event, records) => {
    try {
      return db.saveAttendanceRecords(records);
    } catch (error) {
      console.error('Failed to save attendance:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('load-attendance', async (event, filters) => {
    try {
      const records = db.getAttendanceRecords(filters);
      return { success: true, data: records };
    } catch (error) {
      console.error('Failed to load attendance:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-last-attendance', async (event, studentId, type) => {
    try {
      const record = db.getLastAttendance(studentId, type);
      return { success: true, data: record };
    } catch (error) {
      console.error('Failed to get last attendance:', error);
      return { success: false, error: error.message };
    }
  });

  // Sync metadata operations
  ipcMain.handle('get-sync-metadata', async (event, key) => {
    try {
      const value = db.getSyncMetadata(key);
      return { success: true, data: value };
    } catch (error) {
      console.error('Failed to get sync metadata:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('set-sync-metadata', async (event, key, value) => {
    try {
      db.setSyncMetadata(key, value);
      return { success: true };
    } catch (error) {
      console.error('Failed to set sync metadata:', error);
      return { success: false, error: error.message };
    }
  });

  // Database maintenance operations
  ipcMain.handle('vacuum-database', async () => {
    try {
      db.vacuumDatabase();
      return { success: true };
    } catch (error) {
      console.error('Failed to vacuum database:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('check-integrity', async () => {
    try {
      const isValid = db.checkIntegrity();
      return { success: true, isValid };
    } catch (error) {
      console.error('Failed to check integrity:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-stats', async () => {
    try {
      const stats = db.getStats();
      return { success: true, data: stats };
    } catch (error) {
      console.error('Failed to get stats:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('clear-all-data', async () => {
    try {
      db.clearAllData();
      return { success: true };
    } catch (error) {
      console.error('Failed to clear data:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('remove-duplicate-attendance', async () => {
    try {
      const removed = db.removeDuplicateAttendance();
      return { success: true, removed };
    } catch (error) {
      console.error('Failed to remove duplicate attendance:', error);
      return { success: false, error: error.message };
    }
  });

  // Backup operations
  ipcMain.handle('create-backup', async () => {
    try {
      return await backup.createBackup(mainWindow);
    } catch (error) {
      console.error('Failed to create backup:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('restore-backup', async () => {
    try {
      return await backup.restoreBackup(mainWindow);
    } catch (error) {
      console.error('Failed to restore backup:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('list-backups', async () => {
    try {
      const backups = await backup.listBackups();
      return { success: true, data: backups };
    } catch (error) {
      console.error('Failed to list backups:', error);
      return { success: false, error: error.message };
    }
  });
}

// Cleanup on app quit
app.on('before-quit', () => {
  backup.stopAutomaticBackup();
  db.closeDatabase();
});
