import initSqlJs, { Database } from 'sql.js';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

// Helper function to fetch all records with pagination
async function fetchAllRecords(table: 'students' | 'attendance_records' | 'document_links'): Promise<any[]> {
  let allData: any[] = [];
  let from = 0;
  const batchSize = 1000;
  
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, from + batchSize - 1);
    
    if (error) throw error;
    if (!data || data.length === 0) break;
    
    allData = [...allData, ...data];
    console.log(`📦 Fetched ${allData.length} ${table}...`);
    
    // If we got less than batch size, we're done
    if (data.length < batchSize) break;
    
    from += batchSize;
  }
  
  return allData;
}

export const backupService = {
  async createSupabaseBackup(): Promise<Blob> {
    try {
      // 1. Fetch all data from Supabase with pagination
      console.log('📦 Fetching data from Supabase...');
      
      const students = await fetchAllRecords('students');
      const attendance = await fetchAllRecords('attendance_records');
      const documents = await fetchAllRecords('document_links');

      console.log(`✅ Fetched ${students.length} students, ${attendance.length} attendance records, ${documents.length} documents`);

      // 2. Initialize SQLite in memory
      console.log('🔨 Creating SQLite database...');
      const SQL = await initSqlJs({
        locateFile: (file) => `https://sql.js.org/dist/${file}`
      });
      const db = new SQL.Database();

      // 3. Create tables with proper schema
      db.run(`
        CREATE TABLE students (
          id TEXT PRIMARY KEY,
          student_id TEXT NOT NULL,
          name TEXT NOT NULL,
          email TEXT,
          course TEXT,
          year TEXT,
          contact_number TEXT,
          rfid TEXT,
          qr_code TEXT,
          biometric_data TEXT,
          library TEXT,
          student_type TEXT,
          user_type TEXT,
          level TEXT,
          strand TEXT,
          created_at TEXT,
          updated_at TEXT
        );
      `);

      db.run(`
        CREATE TABLE attendance_records (
          id TEXT PRIMARY KEY,
          student_id TEXT NOT NULL,
          student_name TEXT NOT NULL,
          student_database_id TEXT,
          timestamp TEXT NOT NULL,
          type TEXT NOT NULL,
          method TEXT NOT NULL,
          barcode TEXT,
          contact TEXT,
          purpose TEXT,
          user_type TEXT,
          student_type TEXT,
          level TEXT,
          course TEXT,
          year TEXT,
          strand TEXT,
          library TEXT,
          created_at TEXT
        );
      `);

      db.run(`
        CREATE TABLE document_links (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT,
          file_url TEXT NOT NULL,
          file_type TEXT,
          uploaded_by TEXT,
          education_level TEXT,
          course TEXT,
          strand TEXT,
          year_posted INTEGER,
          created_at TEXT,
          updated_at TEXT
        );
      `);

      // 4. Insert students
      const studentStmt = db.prepare(`
        INSERT INTO students VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      students.forEach((s) => {
        studentStmt.run([
          s.id, s.student_id, s.name, s.email, s.course, s.year,
          s.contact_number, s.rfid, s.qr_code, s.biometric_data,
          s.library, s.student_type, s.user_type, s.level, s.strand,
          s.created_at, s.updated_at
        ]);
      });
      studentStmt.free();

      // 5. Insert attendance records
      const attendanceStmt = db.prepare(`
        INSERT INTO attendance_records VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      attendance.forEach((a) => {
        attendanceStmt.run([
          a.id, a.student_id, a.student_name, a.student_database_id,
          a.timestamp, a.type, a.method, a.barcode, a.contact,
          a.purpose, a.user_type, a.student_type, a.level,
          a.course, a.year, a.strand, a.library, a.created_at
        ]);
      });
      attendanceStmt.free();

      // 6. Insert documents
      const docStmt = db.prepare(`
        INSERT INTO document_links VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      documents.forEach((d) => {
        docStmt.run([
          d.id, d.title, d.description, d.file_url, d.file_type,
          d.uploaded_by, d.education_level, d.course, d.strand,
          d.year_posted, d.created_at, d.updated_at
        ]);
      });
      docStmt.free();

      // 7. Export as binary
      console.log('💾 Exporting SQLite database...');
      const binaryArray = db.export();
      db.close();

      const blob = new Blob([binaryArray], { type: 'application/x-sqlite3' });
      console.log('✅ Backup created successfully!', `Size: ${(blob.size / 1024).toFixed(2)} KB`);

      return blob;
    } catch (error) {
      console.error('❌ Backup failed:', error);
      throw error;
    }
  },

  generateBackupFilename(): string {
    const timestamp = format(new Date(), 'yyyy-MM-dd-HHmmss');
    return `ndkc-library-backup-${timestamp}.db`;
  }
};
