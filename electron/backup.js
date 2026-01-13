const fs = require('fs').promises;
const path = require('path');
const { app, dialog } = require('electron');
const Database = require('better-sqlite3');

async function createBackup(mainWindow) {
  try {
    const dbPath = path.join(app.getPath('userData'), 'library-attendance.db');
    const backupDir = path.join(app.getPath('userData'), 'backups');
    
    // Create backups directory if it doesn't exist
    await fs.mkdir(backupDir, { recursive: true });

    // Generate backup filename with timestamp
    const date = new Date().toISOString().split('T')[0];
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('.')[0];
    const backupPath = path.join(backupDir, `library-attendance-${timestamp}.db`);

    // Copy database file
    await fs.copyFile(dbPath, backupPath);

    // Clean old backups (keep last 7)
    await cleanOldBackups(backupDir);

    console.log('Backup created successfully:', backupPath);
    
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Backup Created',
        message: 'Database backup created successfully',
        detail: `Backup saved to:\\n${backupPath}`,
        buttons: ['OK']
      });
    }

    return { success: true, path: backupPath };
  } catch (error) {
    console.error('Backup failed:', error);
    
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'Backup Failed',
        message: 'Failed to create database backup',
        detail: error.message,
        buttons: ['OK']
      });
    }

    return { success: false, error: error.message };
  }
}

async function restoreBackup(mainWindow) {
  try {
    const backupDir = path.join(app.getPath('userData'), 'backups');
    
    // Show file picker for backup selection
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Backup to Restore',
      defaultPath: backupDir,
      filters: [
        { name: 'Database Backups', extensions: ['db'] }
      ],
      properties: ['openFile']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, reason: 'cancelled' };
    }

    const backupPath = result.filePaths[0];
    
    // Confirm restoration
    const confirm = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'Confirm Restore',
      message: 'Are you sure you want to restore from this backup?',
      detail: 'This will replace all current data with the backup. Current data will be backed up first.',
      buttons: ['Cancel', 'Restore'],
      defaultId: 0,
      cancelId: 0
    });

    if (confirm.response !== 1) {
      return { success: false, reason: 'cancelled' };
    }

    // Create backup of current database first
    await createBackup(mainWindow);

    // Restore from backup
    const dbPath = path.join(app.getPath('userData'), 'library-attendance.db');
    await fs.copyFile(backupPath, dbPath);

    console.log('Database restored from backup:', backupPath);
    
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Restore Complete',
      message: 'Database restored successfully',
      detail: 'Please restart the application for changes to take effect.',
      buttons: ['OK']
    });

    return { success: true, path: backupPath };
  } catch (error) {
    console.error('Restore failed:', error);
    
    dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Restore Failed',
      message: 'Failed to restore database from backup',
      detail: error.message,
      buttons: ['OK']
    });

    return { success: false, error: error.message };
  }
}

async function cleanOldBackups(backupDir) {
  try {
    const files = await fs.readdir(backupDir);
    const backups = files
      .filter(file => file.startsWith('library-attendance-') && file.endsWith('.db'))
      .map(file => ({
        name: file,
        path: path.join(backupDir, file)
      }))
      .sort((a, b) => b.name.localeCompare(a.name)); // Sort newest first

    // Keep only last 7 backups
    const toDelete = backups.slice(7);
    
    for (const backup of toDelete) {
      await fs.unlink(backup.path);
      console.log('Deleted old backup:', backup.name);
    }

    if (toDelete.length > 0) {
      console.log(`Cleaned up ${toDelete.length} old backup(s)`);
    }
  } catch (error) {
    console.error('Failed to clean old backups:', error);
  }
}

async function listBackups() {
  try {
    const backupDir = path.join(app.getPath('userData'), 'backups');
    
    try {
      await fs.access(backupDir);
    } catch {
      return []; // No backups directory
    }

    const files = await fs.readdir(backupDir);
    const backups = [];

    for (const file of files) {
      if (file.startsWith('library-attendance-') && file.endsWith('.db')) {
        const filePath = path.join(backupDir, file);
        const stats = await fs.stat(filePath);
        
        backups.push({
          name: file,
          path: filePath,
          size: stats.size,
          created: stats.birthtime.toISOString()
        });
      }
    }

    return backups.sort((a, b) => new Date(b.created) - new Date(a.created));
  } catch (error) {
    console.error('Failed to list backups:', error);
    return [];
  }
}

// Automatic daily backup
let backupInterval = null;

function startAutomaticBackup(mainWindow) {
  // Run backup once per day (24 hours)
  backupInterval = setInterval(async () => {
    console.log('Running automatic daily backup...');
    await createBackup(mainWindow);
  }, 24 * 60 * 60 * 1000); // 24 hours

  console.log('Automatic daily backup enabled');
}

function stopAutomaticBackup() {
  if (backupInterval) {
    clearInterval(backupInterval);
    backupInterval = null;
    console.log('Automatic backup disabled');
  }
}

module.exports = {
  createBackup,
  restoreBackup,
  listBackups,
  startAutomaticBackup,
  stopAutomaticBackup
};
