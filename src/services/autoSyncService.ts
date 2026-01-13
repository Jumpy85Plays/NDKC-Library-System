import { supabase } from '@/integrations/supabase/client';
import { getFromLocalStorage, saveToLocalStorage } from '@/utils/offlineStorage';
import { studentService } from './studentService';
import { attendanceService } from './attendanceService';
import { Student } from '@/types/Student';
import { AttendanceEntry } from '@/types/AttendanceEntry';

// Helper to check if a string is a valid UUID
const isUUID = (value: string): boolean => {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
};

class AutoSyncService {
  private syncInterval: NodeJS.Timeout | null = null;
  private isOnline = navigator.onLine;
  private lastKnownOnlineState = navigator.onLine;
  private lastSyncTime = 0;
  private static readonly MIN_SYNC_INTERVAL = 30000; // Minimum 30 seconds between syncs
  private static readonly REGULAR_SYNC_INTERVAL = 60000; // Regular sync every 60 seconds (was 10s)

  constructor() {
    this.setupOnlineListener();
    this.startAutoSync();
    // Immediately check for pending offline data on startup
    if (this.isOnline) {
      console.log('App started online - checking for pending offline data');
      this.performSync();
    }
    
    // Delayed startup check to catch missed online events (especially in Electron)
    setTimeout(() => {
      if (navigator.onLine && !this.isOnline) {
        console.log('🌐 Startup: detected online via delayed check');
        this.isOnline = true;
        this.performSync();
      }
    }, 2000);
  }

  private setupOnlineListener() {
    window.addEventListener('online', () => {
      console.log('Connection restored - starting sync');
      this.isOnline = true;
      this.performSync();
    });

    window.addEventListener('offline', () => {
      console.log('Connection lost - offline mode');
      this.isOnline = false;
    });
  }

  private startAutoSync() {
    // Sync every 60 seconds (reduced from 10s to prevent lag)
    this.syncInterval = setInterval(() => {
      const currentOnlineState = navigator.onLine;
      
      // Detect online transition (was offline, now online) - critical for Electron
      if (currentOnlineState && !this.lastKnownOnlineState) {
        console.log('🌐 Online transition detected via polling - triggering sync');
        this.isOnline = true;
        this.performSync(true); // Force sync on online transition
      }
      
      // Update state tracking
      this.lastKnownOnlineState = currentOnlineState;
      this.isOnline = currentOnlineState;
      
      // Regular periodic sync when online
      if (this.isOnline) {
        this.performSync();
      }
    }, AutoSyncService.REGULAR_SYNC_INTERVAL);
  }

  private async performSync(forceSync = false) {
    // Throttle sync requests to prevent overwhelming Supabase
    const now = Date.now();
    if (!forceSync && now - this.lastSyncTime < AutoSyncService.MIN_SYNC_INTERVAL) {
      console.log('⏳ Sync throttled - too soon since last sync');
      return;
    }
    this.lastSyncTime = now;
    
    try {
      const localData = await getFromLocalStorage();
      const pendingStudents = localData.students.filter(s => s.id.toString().startsWith('local_'));
      const pendingRecords = localData.attendanceRecords.filter(r => r.id.toString().startsWith('local_'));
      
      if (pendingStudents.length > 0 || pendingRecords.length > 0) {
        console.log(`📤 Syncing ${pendingStudents.length} students and ${pendingRecords.length} attendance records to server...`);
      }
      
      await this.syncLocalToSupabase();
      await this.syncSupabaseToLocal();
      console.log('Auto-sync completed successfully');
    } catch (error) {
      console.error('❌ Auto-sync failed:', error);
    }
  }

  private async syncLocalToSupabase() {
    const localData = await getFromLocalStorage();
    let syncCount = 0;
    
    // Only sync records from the last 7 days to reduce payload
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    console.log('📤 Starting sync to Supabase...', {
      totalStudents: localData.students.length,
      totalRecords: localData.attendanceRecords.length,
      localStorage: localData.students.filter(s => s.id?.toString().startsWith('local_')).length + ' students',
      localRecords: localData.attendanceRecords.filter(r => r.id?.toString().startsWith('local_')).length + ' records'
    });

    // Sync students with local_ prefix (offline-created items)
    const localStudents = localData.students.filter(s => s.id.toString().startsWith('local_'));
    for (const student of localStudents) {
      try {
        const { data, error } = await supabase
          .from('students')
          .insert({
            name: student.name,
            student_id: student.studentId,
            course: student.course,
            year: student.year,
            library: student.library,
            qr_code: student.qrCode,
            email: student.email,
            biometric_data: student.biometricData,
            rfid: student.rfid
          })
          .select()
          .single();

        if (!error && data) {
          // Replace local student with server version
          const updatedStudents = localData.students.map(s =>
            s.id === student.id ? {
              id: data.id,
              name: data.name,
              studentId: data.student_id,
              email: data.email,
              course: data.course,
              year: data.year,
              library: data.library,
              qrCode: data.qr_code,
              biometricData: data.biometric_data,
              rfid: data.rfid
            } : s
          );
          localData.students = updatedStudents;
          syncCount++;
          console.log(`Synced student: ${student.name}`);
        }
      } catch (error) {
        console.error('Failed to sync student:', error);
      }
    }

    // Sync only recent attendance records (last 7 days) that are:
    // - NOT UUIDs (numeric SQLite IDs from Electron) OR start with 'local_'
    // For Electron, sync immediately. For web, wait 15s to avoid race with realtime
    const now = Date.now();
    const isElectron = typeof window !== 'undefined' && window.electronAPI;
    const localRecords = localData.attendanceRecords.filter(r => {
      const id = r.id.toString();
      const isLocalCandidate = !isUUID(id) || id.startsWith('local_');
      const recordDate = r.timestamp instanceof Date ? r.timestamp : new Date(r.timestamp);
      const isRecent = recordDate >= sevenDaysAgo;
      // Electron: sync immediately when online. Web: wait 15s to avoid race conditions
      const isOlderThan15s = isElectron || (now - recordDate.getTime() > 15000);
      return isLocalCandidate && isRecent && isOlderThan15s;
    });
    
    console.log(`📤 Syncing ${localRecords.length} recent attendance records to Supabase (Electron: ${isElectron}, Selected: ${localRecords.length} non-UUID or local_ records)...`);
    
    // Track successfully synced record IDs to remove them from local storage
    const successfullySyncedIds: string[] = [];
    
    // Track if we replaced any local records with server records (even without inserts)
    let replacedAny = false;
    
    for (const record of localRecords) {
      try {
        console.log(`📤 Uploading attendance record: ${record.studentName} (${record.type}) at ${record.timestamp}`);

        // Idempotency: check if a similar record already exists on server within ±10s
        // Use student_database_id for duplicate check when it's a valid UUID, else use student_id
        const ts = record.timestamp instanceof Date ? record.timestamp : new Date(record.timestamp);
        const from = new Date(ts.getTime() - 10000).toISOString();
        const to = new Date(ts.getTime() + 10000).toISOString();
        
        let duplicateQuery = supabase
          .from('attendance_records')
          .select('id, student_database_id, student_id, student_name, timestamp, type, barcode, method, purpose, contact, library, course, year, user_type, student_type, level')
          .eq('type', record.type)
          .gte('timestamp', from)
          .lte('timestamp', to)
          .limit(1);
        
        // Prefer student_database_id for duplicate detection when it's a valid UUID
        if (record.studentDatabaseId && isUUID(record.studentDatabaseId)) {
          duplicateQuery = duplicateQuery.eq('student_database_id', record.studentDatabaseId);
        } else {
          duplicateQuery = duplicateQuery.eq('student_id', record.studentId);
        }
        
        const { data: existing, error: existErr } = await duplicateQuery;

        if (!existErr && existing && existing.length > 0) {
          const server = existing[0];
          // Replace local placeholder with server record and skip insert
          localData.attendanceRecords = localData.attendanceRecords.map(r =>
            r.id === record.id ? {
              id: server.id,
              studentDatabaseId: (server as any).student_database_id,
              studentId: server.student_id,
              studentName: server.student_name,
              timestamp: new Date(server.timestamp),
              type: server.type,
              barcode: server.barcode,
              method: server.method,
              purpose: server.purpose,
              contact: server.contact,
              library: server.library,
              course: (server as any).course,
              year: (server as any).year,
              userType: (server as any).user_type,
              studentType: (server as any).student_type,
              level: (server as any).level
            } : r
          );
          replacedAny = true;
          console.log(`🔄 Replaced local record with existing server record for: ${record.studentName}`);
          continue;
        }
        
        const { data, error } = await supabase
          .from('attendance_records')
          .insert({
            // Coerce student_database_id to null if not a valid UUID (prevents constraint errors)
            student_database_id: (record.studentDatabaseId && isUUID(record.studentDatabaseId)) 
              ? record.studentDatabaseId 
              : null,
            student_id: record.studentId,
            student_name: record.studentName,
            timestamp: ts.toISOString(),
            type: record.type || 'check-in',
            barcode: record.barcode,
            method: record.method,
            purpose: record.purpose,
            contact: record.contact,
            library: record.library || 'notre-dame',
            course: record.course,
            year: record.year,
            user_type: record.userType || 'student',
            student_type: record.studentType,
            level: record.level
          })
          .select()
          .single();

        if (error) {
          console.error(`❌ Failed to sync attendance record:`, {
            message: error.message,
            details: (error as any).details,
            hint: (error as any).hint
          });
          throw error;
        }

        if (data) {
          // Mark this record as successfully synced
          successfullySyncedIds.push(record.id);
          
          // Replace local record with server version
          const updatedRecords = localData.attendanceRecords.map(r =>
            r.id === record.id ? {
              id: data.id,
              studentDatabaseId: (data as any).student_database_id,
              studentId: data.student_id,
              studentName: data.student_name,
              timestamp: new Date(data.timestamp),
              type: data.type,
              barcode: data.barcode,
              method: data.method,
              purpose: data.purpose,
              contact: data.contact,
              library: data.library,
              course: (data as any).course,
              year: (data as any).year,
              userType: (data as any).user_type,
              studentType: (data as any).student_type,
              level: (data as any).level
            } : r
          );
          localData.attendanceRecords = updatedRecords;
          syncCount++;
          console.log(`✅ Successfully synced attendance record for: ${record.studentName} (${record.type})`);
        }
      } catch (error) {
        console.error('❌ Failed to sync attendance record:', error);
        // Keep the record in local storage for retry
      }
    }
    
    // Sync updates to existing students that were edited offline (_dirty flag)
    const dirtyStudents = (localData.students || []).filter((s: any) => !s.id?.toString().startsWith('local_') && (s as any)._dirty);
    for (const s of dirtyStudents) {
      try {
        const { data, error } = await supabase
          .from('students')
          .update({
            name: s.name,
            student_id: s.studentId,
            email: s.email,
            course: s.department,
            biometric_data: s.biometricData,
            rfid: s.rfid,
            library: s.library
          })
          .eq('id', s.id)
          .select()
          .single();

        if (!error && data) {
          localData.students = localData.students.map((it: any) =>
            it.id === s.id
              ? {
                  id: data.id,
                  name: data.name,
                  studentId: data.student_id,
                  email: data.email || '',
                  department: data.course,
                  biometricData: data.biometric_data || '',
                  rfid: data.rfid || '',
                  library: (data as any).library as 'notre-dame' | 'ibed' || 'notre-dame'
                }
              : it
          );
          syncCount++;
          console.log(`Synced edits for student: ${s.name}`);
        }
      } catch (error) {
        console.error('Failed to sync edited student:', error);
      }
    }

    if (syncCount > 0 || replacedAny) {
      // Save updated data immediately after successful sync OR replacements
      await saveToLocalStorage({
        students: localData.students,
        attendanceRecords: localData.attendanceRecords,
        lastSync: new Date().toISOString()
      });
      console.log(`✅ Local-to-Supabase sync completed: ${syncCount} items uploaded, ${successfullySyncedIds.length} records updated with server IDs, ${replacedAny ? 'replacements saved' : 'no replacements'}`);
    } else {
      console.log('📭 No pending local records to sync');
    }
  }

  private async syncSupabaseToLocal() {
    try {
      // Get current local data FIRST to preserve local-only records
      const localData = await getFromLocalStorage();
      const localOnlyStudents = (localData.students || []).filter((s: any) => s.id?.toString().startsWith('local_'));
      
      // Check if this is the first sync (needs full historical download)
      const needsFullDownload = !localData.fullSyncCompleted;
      
      // Only fetch records from the last 30 days to reduce memory usage (unless it's first sync)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const isoDate = thirtyDaysAgo.toISOString();
      
      // Keep local-only attendance records (not yet synced): non-UUIDs or local_ prefix
      const localOnlyRecords = (localData.attendanceRecords || []).filter((r: any) => {
        const id = r.id?.toString() || '';
        const isLocalCandidate = !isUUID(id) || id.startsWith('local_');
        const recordDate = r.timestamp instanceof Date ? r.timestamp : new Date(r.timestamp);
        return isLocalCandidate && recordDate >= thirtyDaysAgo;
      });
      
      if (needsFullDownload) {
        console.log('🔄 First-time setup: Downloading ALL historical data (students + full attendance history)...');
      } else {
        console.log('📥 Starting sync from Supabase (last 30 days)...', {
          localOnlyStudents: localOnlyStudents.length,
          localOnlyRecords: localOnlyRecords.length
        });
      }
      
      // Get fresh data from server
      // Students: always download all (already efficient)
      // Attendance: download ALL on first sync, only last 30 days on subsequent syncs
      let attendanceQuery = supabase
        .from('attendance_records')
        .select('*');
      
      if (!needsFullDownload) {
        // Regular sync: only last 30 days
        attendanceQuery = attendanceQuery.gte('timestamp', isoDate);
      }
      // If needsFullDownload is true, we skip the date filter to get ALL records
      
      attendanceQuery = attendanceQuery.order('timestamp', { ascending: false });
      
      const [studentsResponse, attendanceResponse] = await Promise.all([
        supabase.from('students').select('*').order('created_at', { ascending: false }),
        attendanceQuery
      ]);

      if (!studentsResponse.error && !attendanceResponse.error) {
        const students = studentsResponse.data?.map((s: any) => ({
          id: s.id,
          name: s.name,
          studentId: s.student_id,
          email: s.email || '',
          department: s.course,
          biometricData: s.biometric_data || '',
          rfid: s.rfid || '',
          library: (s as any).library as 'notre-dame' | 'ibed' || 'notre-dame'
        })) || [];

        const attendanceRecords = attendanceResponse.data?.map((r: any) => ({
          id: r.id,
          studentDatabaseId: r.student_database_id,
          studentId: r.student_id,
          studentName: r.student_name,
          timestamp: new Date(r.timestamp),
          type: r.type || 'check-in',
          barcode: r.barcode,
          method: r.method as 'barcode' | 'biometric' | 'manual' | 'rfid',
          purpose: r.purpose,
          contact: r.contact,
          library: r.library as 'notre-dame' | 'ibed' || 'notre-dame',
          course: r.course,
          year: r.year,
          userType: r.user_type as 'student' | 'teacher',
          studentType: r.student_type as 'ibed' | 'college',
          level: r.level
        })) || [];

        // Get dirty students (edited offline but not yet synced)
        const dirtyStudents = (localData.students || []).filter((s: any) => !s.id?.toString().startsWith('local_') && (s as any)._dirty);
        const dirtyMap = Object.fromEntries(dirtyStudents.map((s: any) => [s.id, s]));

        const overlayedStudents = students.map(s => dirtyMap[s.id] ? { ...s, ...(dirtyMap[s.id] as any) } : s);

        // Merge and dedupe attendance; keep server as source of truth when available
        const combinedRecords = [...attendanceRecords, ...localOnlyRecords];
        const pickBetter = (a: any, b: any) => {
          if (a.course && !b.course) return a;
          if (b.course && !a.course) return b;
          const aLocal = a.id?.toString().startsWith('local_');
          const bLocal = b.id?.toString().startsWith('local_');
          if (aLocal && !bLocal) return b;
          if (bLocal && !aLocal) return a;
          return (new Date(a.timestamp).getTime() >= new Date(b.timestamp).getTime()) ? a : b;
        };
        const deduped: any[] = [];
        for (const rec of combinedRecords) {
          const existing = deduped.find((c: any) => c.studentId === rec.studentId && c.type === rec.type && Math.abs((new Date(c.timestamp).getTime()) - (new Date(rec.timestamp).getTime())) <= 10000);
          if (!existing) deduped.push(rec);
          else {
            const better = pickBetter(existing, rec);
            const idx = deduped.indexOf(existing);
            deduped[idx] = better;
          }
        }

        // Merge server data with local-only records
        const finalStudents = students.length === 0 ? [...localOnlyStudents] : [...overlayedStudents, ...localOnlyStudents];
        const finalAttendance = attendanceRecords.length === 0 ? [...localOnlyRecords] : deduped;

        console.log('📥 Merge results:', {
          serverStudents: students.length,
          serverRecords: attendanceRecords.length,
          localOnlyStudents: localOnlyStudents.length,
          localOnlyRecords: localOnlyRecords.length,
          finalStudents: finalStudents.length,
          finalAttendance: finalAttendance.length,
          dedupedCount: deduped.length
        });

        // Save merged data back to local storage
        await saveToLocalStorage({
          students: finalStudents,
          attendanceRecords: finalAttendance,
          lastSync: new Date().toISOString(),
          fullSyncCompleted: true // Mark full sync as completed
        });
        
        if (needsFullDownload) {
          console.log(`✅ Full historical download completed: ${students.length} students, ${attendanceRecords.length} attendance records saved to local storage`);
        } else {
          console.log(`✅ Supabase-to-Local sync completed: ${students.length} students, ${attendanceRecords.length} records from server, preserved ${localOnlyRecords.length} local-only records`);
        }
      }
    } catch (error) {
      console.error('❌ Failed to sync from Supabase:', error);
    }
  }

  public async forceSync() {
    console.log('🔄 Force sync requested');
    await this.performSync();
  }

  public destroy() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }
}

export const autoSyncService = new AutoSyncService();
