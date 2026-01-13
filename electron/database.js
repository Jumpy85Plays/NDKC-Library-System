const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const encryption = require('./encryption');

let db = null;

function initDatabase() {
  if (db) return db;

  const dbPath = path.join(app.getPath('userData'), 'library-attendance.db');
  
  // Ensure the directory exists
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  
  console.log('Initializing SQLite database at:', dbPath);
  
  db = new Database(dbPath);
  
  // Enable WAL mode for better concurrent access and crash recovery
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 10000'); // 10 seconds timeout for network drives
  db.pragma('synchronous = NORMAL'); // Better performance while maintaining safety
  
  createTables();
  migrateDatabase();
  createIndexes();
  
  console.log('SQLite database initialized successfully');
  return db;
}

function createTables() {
  // Students table
  db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      course TEXT,
      year TEXT,
      contact_number TEXT,
      biometric_data TEXT,
      rfid TEXT,
      rfid_hash TEXT,
      library TEXT,
      user_type TEXT,
      student_type TEXT,
      level TEXT,
      strand TEXT,
      registration_date TEXT,
      last_scan TEXT,
      data_encrypted INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Attendance records table
  db.exec(`
    CREATE TABLE IF NOT EXISTS attendance_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_database_id INTEGER,
      student_id TEXT NOT NULL,
      student_name TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      type TEXT NOT NULL,
      barcode TEXT,
      method TEXT,
      purpose TEXT,
      contact TEXT,
      library TEXT,
      course TEXT,
      year TEXT,
      user_type TEXT,
      student_type TEXT,
      level TEXT,
      strand TEXT,
      data_encrypted INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Sync metadata table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Documents table (for future use)
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_type TEXT,
      student_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function migrateDatabase() {
  // Add strand column to students table if it doesn't exist
  try {
    const tableInfo = db.prepare("PRAGMA table_info(students)").all();
    const hasStrand = tableInfo.some(col => col.name === 'strand');
    
    if (!hasStrand) {
      console.log('Adding strand column to students table...');
      db.exec('ALTER TABLE students ADD COLUMN strand TEXT');
      console.log('Migration complete: strand column added');
    }
  } catch (error) {
    console.error('Migration error:', error.message);
  }
}

function createIndexes() {
  const indexes = [
    // Student indexes
    'CREATE INDEX IF NOT EXISTS idx_students_student_id ON students(student_id)',
    'CREATE INDEX IF NOT EXISTS idx_students_rfid ON students(rfid)',
    'CREATE INDEX IF NOT EXISTS idx_students_rfid_hash ON students(rfid_hash)',
    'CREATE INDEX IF NOT EXISTS idx_students_library ON students(library)',
    'CREATE INDEX IF NOT EXISTS idx_students_name ON students(name)',
    
    // Attendance indexes for fast queries
    'CREATE INDEX IF NOT EXISTS idx_attendance_student_id ON attendance_records(student_id)',
    'CREATE INDEX IF NOT EXISTS idx_attendance_student_db_id ON attendance_records(student_database_id)',
    'CREATE INDEX IF NOT EXISTS idx_attendance_timestamp ON attendance_records(timestamp DESC)',
    'CREATE INDEX IF NOT EXISTS idx_attendance_type ON attendance_records(type)',
    'CREATE INDEX IF NOT EXISTS idx_attendance_library ON attendance_records(library)',
    'CREATE INDEX IF NOT EXISTS idx_attendance_composite ON attendance_records(student_database_id, type, timestamp DESC)',
    
    // Unique constraint to prevent duplicate check-ins (same student, same timestamp, same type)
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_unique ON attendance_records(student_id, timestamp, type)',
    
    // Documents index
    'CREATE INDEX IF NOT EXISTS idx_documents_student_id ON documents(student_id)'
  ];

  indexes.forEach(indexSQL => {
    try {
      db.exec(indexSQL);
    } catch (error) {
      console.error('Error creating index:', error.message);
    }
  });
}

// Student operations
function saveStudents(students) {
  const useEncryption = encryption.isInitialized();
  
  const insert = db.prepare(`
    INSERT OR REPLACE INTO students 
    (student_id, name, email, course, year, contact_number, biometric_data, rfid, rfid_hash,
     library, user_type, student_type, level, strand, registration_date, last_scan, 
     data_encrypted, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);

  const saveMany = db.transaction((students) => {
    for (const student of students) {
      // Encrypt sensitive fields if encryption is enabled
      const name = useEncryption ? encryption.encrypt(student.name) : student.name;
      const email = useEncryption && student.email ? encryption.encrypt(student.email) : (student.email || null);
      const contactNumber = useEncryption && student.contactNumber ? encryption.encrypt(student.contactNumber) : (student.contactNumber || null);
      const biometricData = student.biometricData ? JSON.stringify(student.biometricData) : null;
      const encryptedBiometric = useEncryption && biometricData ? encryption.encrypt(biometricData) : biometricData;
      const rfid = useEncryption && student.rfid ? encryption.encrypt(student.rfid) : (student.rfid || null);
      const rfidHash = useEncryption && student.rfid ? encryption.createSearchHash(student.rfid) : null;
      
      insert.run(
        student.studentId,
        name,
        email,
        student.course || null,
        student.year || null,
        contactNumber,
        encryptedBiometric,
        rfid,
        rfidHash,
        student.library || null,
        student.userType || null,
        student.studentType || null,
        student.level || null,
        student.strand || null,
        student.registrationDate || null,
        student.lastScan || null,
        useEncryption ? 1 : 0
      );
    }
  });

  saveMany(students);
  return { success: true, count: students.length };
}

function getStudents(filters = {}) {
  const { limit = 10000, offset = 0, library = null, searchTerm = null } = filters;
  
  let query = 'SELECT * FROM students WHERE 1=1';
  const params = [];

  if (library) {
    query += ' AND library = ?';
    params.push(library);
  }

  if (searchTerm) {
    query += ' AND (name LIKE ? OR student_id LIKE ?)';
    params.push(`%${searchTerm}%`, `%${searchTerm}%`);
  }

  query += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const students = db.prepare(query).all(...params);
  
  return students.map(student => {
    const isEncrypted = student.data_encrypted === 1;
    
    // Decrypt if encrypted
    const name = isEncrypted ? encryption.decrypt(student.name) : student.name;
    const email = isEncrypted && student.email ? encryption.decrypt(student.email) : student.email;
    const contactNumber = isEncrypted && student.contact_number ? encryption.decrypt(student.contact_number) : student.contact_number;
    const biometricDataRaw = isEncrypted && student.biometric_data ? encryption.decrypt(student.biometric_data) : student.biometric_data;
    const biometricData = biometricDataRaw ? JSON.parse(biometricDataRaw) : null;
    const rfid = isEncrypted && student.rfid ? encryption.decrypt(student.rfid) : student.rfid;
    
    return {
      id: student.id,
      studentId: student.student_id,
      name,
      email,
      course: student.course,
      year: student.year,
      contactNumber,
      biometricData,
      rfid,
      library: student.library,
      userType: student.user_type,
      studentType: student.student_type,
      level: student.level,
      strand: student.strand,
      registrationDate: student.registration_date,
      lastScan: student.last_scan
    };
  });
}

function getStudentById(studentId) {
  const student = db.prepare('SELECT * FROM students WHERE student_id = ?').get(studentId);
  
  if (!student) return null;

  const isEncrypted = student.data_encrypted === 1;
  
  const name = isEncrypted ? encryption.decrypt(student.name) : student.name;
  const email = isEncrypted && student.email ? encryption.decrypt(student.email) : student.email;
  const contactNumber = isEncrypted && student.contact_number ? encryption.decrypt(student.contact_number) : student.contact_number;
  const biometricDataRaw = isEncrypted && student.biometric_data ? encryption.decrypt(student.biometric_data) : student.biometric_data;
  const biometricData = biometricDataRaw ? JSON.parse(biometricDataRaw) : null;
  const rfid = isEncrypted && student.rfid ? encryption.decrypt(student.rfid) : student.rfid;

  return {
    id: student.id,
    studentId: student.student_id,
    name,
    email,
    course: student.course,
    year: student.year,
    contactNumber,
    biometricData,
    rfid,
    library: student.library,
    userType: student.user_type,
    studentType: student.student_type,
    level: student.level,
    strand: student.strand,
    registrationDate: student.registration_date,
    lastScan: student.last_scan
  };
}

function getStudentByRFID(rfid) {
  // If encryption is enabled, search by hash
  if (encryption.isInitialized()) {
    const rfidHash = encryption.createSearchHash(rfid);
    const student = db.prepare('SELECT * FROM students WHERE rfid_hash = ?').get(rfidHash);
    
    if (!student) return null;
    
    const name = encryption.decrypt(student.name);
    const email = student.email ? encryption.decrypt(student.email) : null;
    const contactNumber = student.contact_number ? encryption.decrypt(student.contact_number) : null;
    const biometricDataRaw = student.biometric_data ? encryption.decrypt(student.biometric_data) : null;
    const biometricData = biometricDataRaw ? JSON.parse(biometricDataRaw) : null;
    const decryptedRfid = student.rfid ? encryption.decrypt(student.rfid) : null;

    return {
      id: student.id,
      studentId: student.student_id,
      name,
      email,
      course: student.course,
      year: student.year,
      contactNumber,
      biometricData,
      rfid: decryptedRfid,
      library: student.library,
      userType: student.user_type,
      studentType: student.student_type,
      level: student.level,
      strand: student.strand,
      registrationDate: student.registration_date,
      lastScan: student.last_scan
    };
  }
  
  // If no encryption, search directly
  const student = db.prepare('SELECT * FROM students WHERE rfid = ?').get(rfid);
  
  if (!student) return null;

  return {
    id: student.id,
    studentId: student.student_id,
    name: student.name,
    email: student.email,
    course: student.course,
    year: student.year,
    contactNumber: student.contact_number,
    biometricData: student.biometric_data ? JSON.parse(student.biometric_data) : null,
    rfid: student.rfid,
    library: student.library,
    userType: student.user_type,
    studentType: student.student_type,
    level: student.level,
    strand: student.strand,
    registrationDate: student.registration_date,
    lastScan: student.last_scan
  };
}

// Attendance operations
function saveAttendanceRecords(records) {
  const useEncryption = encryption.isInitialized();
  
  const insert = db.prepare(`
    INSERT OR IGNORE INTO attendance_records 
    (student_database_id, student_id, student_name, timestamp, type, barcode, method, 
     purpose, contact, library, course, year, user_type, student_type, level, strand, data_encrypted)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const saveMany = db.transaction((records) => {
    for (const record of records) {
      // Encrypt sensitive attendance fields
      const studentName = useEncryption ? encryption.encrypt(record.studentName) : record.studentName;
      const contact = useEncryption && record.contact ? encryption.encrypt(record.contact) : (record.contact || null);
      
      insert.run(
        record.studentDatabaseId || null,
        record.studentId,
        studentName,
        record.timestamp,
        record.type,
        record.barcode || null,
        record.method || null,
        record.purpose || null,
        contact,
        record.library || null,
        record.course || null,
        record.year || null,
        record.userType || null,
        record.studentType || null,
        record.level || null,
        record.strand || null,
        useEncryption ? 1 : 0
      );
    }
  });

  saveMany(records);
  return { success: true, count: records.length };
}

function getAttendanceRecords(filters = {}) {
  const { limit = 10000, offset = 0, startDate = null, endDate = null, library = null } = filters;
  
  let query = 'SELECT * FROM attendance_records WHERE 1=1';
  const params = [];

  if (startDate) {
    query += ' AND timestamp >= ?';
    params.push(startDate);
  }

  if (endDate) {
    query += ' AND timestamp <= ?';
    params.push(endDate);
  }

  if (library) {
    query += ' AND library = ?';
    params.push(library);
  }

  query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const records = db.prepare(query).all(...params);
  
  return records.map(record => {
    const isEncrypted = record.data_encrypted === 1;
    
    const studentName = isEncrypted ? encryption.decrypt(record.student_name) : record.student_name;
    const contact = isEncrypted && record.contact ? encryption.decrypt(record.contact) : record.contact;
    
    return {
      id: record.id,
      studentDatabaseId: record.student_database_id,
      studentId: record.student_id,
      studentName,
      timestamp: record.timestamp,
      type: record.type,
      barcode: record.barcode,
      method: record.method,
      purpose: record.purpose,
      contact,
      library: record.library,
      course: record.course,
      year: record.year,
      userType: record.user_type,
      studentType: record.student_type,
      level: record.level,
      strand: record.strand
    };
  });
}

function getLastAttendance(studentId, type = null) {
  let query = 'SELECT * FROM attendance_records WHERE student_id = ?';
  const params = [studentId];

  if (type) {
    query += ' AND type = ?';
    params.push(type);
  }

  query += ' ORDER BY timestamp DESC LIMIT 1';

  const record = db.prepare(query).get(...params);
  
  if (!record) return null;

  const isEncrypted = record.data_encrypted === 1;
  
  const studentName = isEncrypted ? encryption.decrypt(record.student_name) : record.student_name;
  const contact = isEncrypted && record.contact ? encryption.decrypt(record.contact) : record.contact;

  return {
    id: record.id,
    studentDatabaseId: record.student_database_id,
    studentId: record.student_id,
    studentName,
    timestamp: record.timestamp,
    type: record.type,
    barcode: record.barcode,
    method: record.method,
    purpose: record.purpose,
    contact,
    library: record.library,
    course: record.course,
    year: record.year,
    userType: record.user_type,
    studentType: record.student_type,
    level: record.level,
    strand: record.strand
  };
}

// Metadata operations
function getSyncMetadata(key) {
  const row = db.prepare('SELECT value FROM sync_metadata WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSyncMetadata(key, value) {
  db.prepare(`
    INSERT OR REPLACE INTO sync_metadata (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
  `).run(key, value);
}

// Database maintenance
function vacuumDatabase() {
  console.log('Running VACUUM to optimize database...');
  db.exec('VACUUM');
  console.log('Database optimization complete');
}

function checkIntegrity() {
  const result = db.pragma('integrity_check');
  return result[0].integrity_check === 'ok';
}

function getStats() {
  const studentCount = db.prepare('SELECT COUNT(*) as count FROM students').get().count;
  const attendanceCount = db.prepare('SELECT COUNT(*) as count FROM attendance_records').get().count;
  const documentCount = db.prepare('SELECT COUNT(*) as count FROM documents').get().count;
  
  return {
    students: studentCount,
    attendanceRecords: attendanceCount,
    documents: documentCount
  };
}

function clearAllData() {
  const clearAll = db.transaction(() => {
    db.exec('DELETE FROM students');
    db.exec('DELETE FROM attendance_records');
    db.exec('DELETE FROM documents');
    db.exec('DELETE FROM sync_metadata');
  });

  clearAll();
  console.log('All data cleared from database');
}

function removeDuplicateAttendance() {
  // Remove duplicate attendance records, keeping only the first occurrence
  const removeDuplicates = db.transaction(() => {
    db.exec(`
      DELETE FROM attendance_records
      WHERE id NOT IN (
        SELECT MIN(id)
        FROM attendance_records
        GROUP BY student_id, timestamp, type
      )
    `);
  });

  removeDuplicates();
  const changes = db.prepare('SELECT changes()').get();
  console.log(`Removed ${changes['changes()']} duplicate attendance records`);
  return changes['changes()'];
}

function closeDatabase() {
  if (db) {
    db.close();
    db = null;
    console.log('Database closed');
  }
}

// Expose raw database for migrations
function getDb() {
  return db;
}

module.exports = {
  initDatabase,
  saveStudents,
  getStudents,
  getStudentById,
  getStudentByRFID,
  saveAttendanceRecords,
  getAttendanceRecords,
  getLastAttendance,
  getSyncMetadata,
  setSyncMetadata,
  vacuumDatabase,
  checkIntegrity,
  getStats,
  clearAllData,
  removeDuplicateAttendance,
  closeDatabase,
  getDb
};
