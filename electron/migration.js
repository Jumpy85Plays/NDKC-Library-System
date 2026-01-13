const fs = require('fs').promises;
const path = require('path');
const { app, dialog } = require('electron');
const db = require('./database');
const encryption = require('./encryption');

async function migrateFromJSON(mainWindow) {
  const jsonPath = path.join(app.getPath('userData'), 'library-attendance-data.json');
  
  try {
    // Check if JSON file exists
    try {
      await fs.access(jsonPath);
    } catch {
      console.log('No JSON file found, skipping migration');
      return { migrated: false, reason: 'no_json_file' };
    }

    // Check if database already has data
    const stats = db.getStats();
    if (stats.students > 0 || stats.attendanceRecords > 0) {
      console.log('Database already contains data, skipping migration');
      return { migrated: false, reason: 'database_not_empty' };
    }

    console.log('Starting migration from JSON to SQLite...');
    
    // Read and parse JSON file
    const jsonData = await fs.readFile(jsonPath, 'utf8');
    const data = JSON.parse(jsonData);

    let studentCount = 0;
    let attendanceCount = 0;

    // Migrate students
    if (data.students && Array.isArray(data.students) && data.students.length > 0) {
      console.log(`Migrating ${data.students.length} students...`);
      
      // Convert to proper format
      const students = data.students.map(student => ({
        studentId: student.studentId || student.student_id,
        name: student.name,
        email: student.email,
        course: student.course,
        year: student.year,
        contactNumber: student.contactNumber || student.contact_number,
        biometricData: student.biometricData || student.biometric_data,
        rfid: student.rfid,
        library: student.library,
        userType: student.userType || student.user_type,
        studentType: student.studentType || student.student_type,
        level: student.level,
        registrationDate: student.registrationDate || student.registration_date,
        lastScan: student.lastScan || student.last_scan
      }));

      const result = db.saveStudents(students);
      studentCount = result.count;
      console.log(`✅ Migrated ${studentCount} students`);
    }

    // Migrate attendance records
    if (data.attendanceRecords && Array.isArray(data.attendanceRecords) && data.attendanceRecords.length > 0) {
      console.log(`Migrating ${data.attendanceRecords.length} attendance records...`);
      
      // Convert to proper format
      const records = data.attendanceRecords.map(record => ({
        studentDatabaseId: record.studentDatabaseId || record.student_database_id,
        studentId: record.studentId || record.student_id,
        studentName: record.studentName || record.student_name,
        timestamp: record.timestamp,
        type: record.type,
        barcode: record.barcode,
        method: record.method,
        purpose: record.purpose,
        contact: record.contact,
        library: record.library,
        course: record.course,
        year: record.year,
        userType: record.userType || record.user_type,
        studentType: record.studentType || record.student_type,
        level: record.level
      }));

      const result = db.saveAttendanceRecords(records);
      attendanceCount = result.count;
      console.log(`✅ Migrated ${attendanceCount} attendance records`);
    }

    // Migrate sync metadata
    if (data.lastSync) {
      db.setSyncMetadata('lastSync', data.lastSync);
      console.log(`✅ Migrated sync metadata: ${data.lastSync}`);
    }

    // Backup JSON file
    const backupPath = `${jsonPath}.backup`;
    await fs.copyFile(jsonPath, backupPath);
    console.log(`✅ Backed up JSON file to: ${backupPath}`);

    // Delete original JSON file
    await fs.unlink(jsonPath);
    console.log(`✅ Deleted original JSON file`);

    console.log('Migration completed successfully!');
    
    // Show success dialog
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Migration Successful',
        message: 'Data Migration Complete',
        detail: `Successfully migrated:\n• ${studentCount} students\n• ${attendanceCount} attendance records\n\nThe old JSON file has been backed up as:\n${backupPath}`,
        buttons: ['OK']
      });
    }

    return {
      migrated: true,
      studentCount,
      attendanceCount
    };

  } catch (error) {
    console.error('Migration failed:', error);
    
    // Show error dialog
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'Migration Failed',
        message: 'Failed to migrate data from JSON to SQLite',
        detail: `Error: ${error.message}\n\nYour original data file is safe. Please contact support.`,
        buttons: ['OK']
      });
    }

    return {
      migrated: false,
      error: error.message
    };
  }
}

/**
 * Migrate existing unencrypted data to encrypted format
 * This should be run once after enabling encryption
 */
async function migrateToEncryption(mainWindow) {
  if (!encryption.isInitialized()) {
    console.error('❌ Cannot migrate: encryption not initialized');
    return { success: false, error: 'Encryption not initialized' };
  }

  try {
    console.log('Starting encryption migration...');
    
    // Get unencrypted students
    const unencryptedStudents = db.getDb().prepare(
      'SELECT * FROM students WHERE data_encrypted = 0'
    ).all();
    
    console.log(`Found ${unencryptedStudents.length} unencrypted student records`);
    
    if (unencryptedStudents.length > 0) {
      const updateStudent = db.getDb().prepare(`
        UPDATE students 
        SET name = ?, email = ?, contact_number = ?, biometric_data = ?, 
            rfid = ?, rfid_hash = ?, data_encrypted = 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      
      const migrateStudents = db.getDb().transaction((students) => {
        for (const student of students) {
          const encryptedName = encryption.encrypt(student.name);
          const encryptedEmail = student.email ? encryption.encrypt(student.email) : null;
          const encryptedContact = student.contact_number ? encryption.encrypt(student.contact_number) : null;
          const encryptedBiometric = student.biometric_data ? encryption.encrypt(student.biometric_data) : null;
          const encryptedRfid = student.rfid ? encryption.encrypt(student.rfid) : null;
          const rfidHash = student.rfid ? encryption.createSearchHash(student.rfid) : null;
          
          updateStudent.run(
            encryptedName,
            encryptedEmail,
            encryptedContact,
            encryptedBiometric,
            encryptedRfid,
            rfidHash,
            student.id
          );
        }
      });
      
      migrateStudents(unencryptedStudents);
      console.log(`✅ Encrypted ${unencryptedStudents.length} student records`);
    }
    
    // Get unencrypted attendance records
    const unencryptedAttendance = db.getDb().prepare(
      'SELECT * FROM attendance_records WHERE data_encrypted = 0'
    ).all();
    
    console.log(`Found ${unencryptedAttendance.length} unencrypted attendance records`);
    
    if (unencryptedAttendance.length > 0) {
      const updateAttendance = db.getDb().prepare(`
        UPDATE attendance_records 
        SET student_name = ?, contact = ?, data_encrypted = 1
        WHERE id = ?
      `);
      
      const migrateAttendance = db.getDb().transaction((records) => {
        for (const record of records) {
          const encryptedName = encryption.encrypt(record.student_name);
          const encryptedContact = record.contact ? encryption.encrypt(record.contact) : null;
          
          updateAttendance.run(encryptedName, encryptedContact, record.id);
        }
      });
      
      migrateAttendance(unencryptedAttendance);
      console.log(`✅ Encrypted ${unencryptedAttendance.length} attendance records`);
    }
    
    // Show success dialog
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Encryption Migration Complete',
        message: 'Data Successfully Encrypted',
        detail: `Encrypted:\n• ${unencryptedStudents.length} student records\n• ${unencryptedAttendance.length} attendance records\n\nYour data is now protected with AES-256-GCM encryption.`,
        buttons: ['OK']
      });
    }
    
    return {
      success: true,
      studentsEncrypted: unencryptedStudents.length,
      attendanceEncrypted: unencryptedAttendance.length
    };
    
  } catch (error) {
    console.error('❌ Encryption migration failed:', error);
    
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'Encryption Migration Failed',
        message: 'Failed to encrypt existing data',
        detail: `Error: ${error.message}\n\nYour data remains unchanged. Please try again or contact support.`,
        buttons: ['OK']
      });
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  migrateFromJSON,
  migrateToEncryption
};
