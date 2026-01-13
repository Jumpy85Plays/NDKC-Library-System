import { supabase } from '@/integrations/supabase/client';
import { saveToLocalStorage, getFromLocalStorage } from '@/utils/offlineStorage';
import { Student } from '@/types/Student';
import { AttendanceEntry } from '@/types/AttendanceEntry';

class RealtimeService {
  private studentsChannel: any = null;
  private attendanceChannel: any = null;
  private onDataUpdateCallback: ((students: Student[], records: AttendanceEntry[]) => void) | null = null;
  
  // Batching for performance - debounce updates
  private pendingStudentUpdates: Map<string, any> = new Map();
  private pendingAttendanceUpdates: Map<string, any> = new Map();
  private flushTimeout: NodeJS.Timeout | null = null;
  private static readonly FLUSH_INTERVAL = 2000; // Flush every 2 seconds

  constructor() {
    this.setupRealtimeListeners();
  }

  private setupRealtimeListeners() {
    // Listen for student changes
    this.studentsChannel = supabase
      .channel('students-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'students'
        },
        (payload) => {
          console.log('Student change detected:', payload);
          this.queueStudentChange(payload);
        }
      )
      .subscribe();

    // Listen for attendance changes
    this.attendanceChannel = supabase
      .channel('attendance-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'attendance_records'
        },
        (payload) => {
          console.log('Attendance change detected:', payload);
          this.queueAttendanceChange(payload);
        }
      )
      .subscribe();
  }

  private queueStudentChange(payload: any) {
    const id = payload.new?.id || payload.old?.id;
    this.pendingStudentUpdates.set(id, payload);
    this.scheduleFlush();
  }

  private queueAttendanceChange(payload: any) {
    const id = payload.new?.id || payload.old?.id;
    this.pendingAttendanceUpdates.set(id, payload);
    this.scheduleFlush();
  }

  private scheduleFlush() {
    if (this.flushTimeout) return; // Already scheduled
    
    this.flushTimeout = setTimeout(() => {
      this.flushUpdates();
      this.flushTimeout = null;
    }, RealtimeService.FLUSH_INTERVAL);
  }

  private async flushUpdates() {
    if (this.pendingStudentUpdates.size === 0 && this.pendingAttendanceUpdates.size === 0) {
      return;
    }

    console.log(`🔄 Flushing ${this.pendingStudentUpdates.size} student updates and ${this.pendingAttendanceUpdates.size} attendance updates`);

    const localData = await getFromLocalStorage();
    let dataChanged = false;

    // Process student updates
    for (const payload of this.pendingStudentUpdates.values()) {
      const changed = this.processStudentChange(payload, localData);
      if (changed) dataChanged = true;
    }

    // Process attendance updates
    for (const payload of this.pendingAttendanceUpdates.values()) {
      const changed = this.processAttendanceChange(payload, localData);
      if (changed) dataChanged = true;
    }

    // Clear pending updates
    this.pendingStudentUpdates.clear();
    this.pendingAttendanceUpdates.clear();

    // Save once if any changes
    if (dataChanged) {
      await saveToLocalStorage(localData);
      this.notifyDataUpdate();
    }
  }

  private processStudentChange(payload: any, localData: any): boolean {
    if (payload.eventType === 'INSERT') {
      const newStudent: Student = {
        id: payload.new.id,
        name: payload.new.name,
        studentId: payload.new.student_id,
        email: payload.new.email,
        course: payload.new.course,
        year: payload.new.year,
        library: payload.new.library,
        department: payload.new.course,
        biometricData: payload.new.biometric_data,
        rfid: payload.new.rfid
      };
      
      const existingIndex = localData.students.findIndex((s: any) => s.id === newStudent.id);
      if (existingIndex === -1) {
        localData.students.unshift(newStudent);
        return true;
      }
    } else if (payload.eventType === 'UPDATE') {
      const updatedStudent: Student = {
        id: payload.new.id,
        name: payload.new.name,
        studentId: payload.new.student_id,
        email: payload.new.email,
        course: payload.new.course,
        year: payload.new.year,
        library: payload.new.library,
        department: payload.new.course,
        biometricData: payload.new.biometric_data,
        rfid: payload.new.rfid
      };
      
      const existingIndex = localData.students.findIndex((s: any) => s.id === updatedStudent.id);
      if (existingIndex !== -1) {
        localData.students[existingIndex] = updatedStudent;
        return true;
      }
    } else if (payload.eventType === 'DELETE') {
      const deletedId = payload.old.id;
      const existingIndex = localData.students.findIndex((s: any) => s.id === deletedId);
      if (existingIndex !== -1) {
        localData.students.splice(existingIndex, 1);
        return true;
      }
    }
    return false;
  }

  private processAttendanceChange(payload: any, localData: any): boolean {
    const pickBetter = (a: any, b: any) => {
      if (a.course && !b.course) return a;
      if (b.course && !a.course) return b;
      const aLocal = a.id?.toString().startsWith('local_');
      const bLocal = b.id?.toString().startsWith('local_');
      if (aLocal && !bLocal) return b;
      if (bLocal && !aLocal) return a;
      const at = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp).getTime();
      const bt = b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp).getTime();
      return at >= bt ? a : b;
    };

    const dedupeList = (list: any[]) => {
      const out: any[] = [];
      for (const rec of list) {
        const match = out.find((c: any) => c.studentId === rec.studentId && c.type === rec.type && Math.abs((new Date(c.timestamp).getTime()) - (new Date(rec.timestamp).getTime())) <= 10000);
        if (!match) out.push(rec);
        else {
          const better = pickBetter(match, rec);
          const idx = out.indexOf(match);
          out[idx] = better;
        }
      }
      return out;
    };
    
    if (payload.eventType === 'INSERT') {
      const newRecord: AttendanceEntry = {
        id: payload.new.id,
        studentDatabaseId: payload.new.student_database_id,
        studentId: payload.new.student_id,
        studentName: payload.new.student_name,
        timestamp: new Date(payload.new.timestamp),
        type: payload.new.type,
        barcode: payload.new.barcode,
        method: payload.new.method,
        purpose: payload.new.purpose,
        contact: payload.new.contact,
        library: payload.new.library,
        course: payload.new.course,
        year: payload.new.year,
        userType: payload.new.user_type,
        studentType: payload.new.student_type,
        level: payload.new.level
      };
      
      const byIdIdx = localData.attendanceRecords.findIndex((r: any) => r.id === newRecord.id);
      if (byIdIdx !== -1) {
        localData.attendanceRecords[byIdIdx] = newRecord;
      } else {
        const windowMs = 10000;
        const dupIdx = localData.attendanceRecords.findIndex((r: any) => {
          const t1 = r.timestamp instanceof Date ? r.timestamp.getTime() : new Date(r.timestamp).getTime();
          const t2 = newRecord.timestamp.getTime();
          return r.studentId === newRecord.studentId && r.type === newRecord.type && Math.abs(t1 - t2) <= windowMs;
        });

        if (dupIdx !== -1) {
          const existing = localData.attendanceRecords[dupIdx];
          localData.attendanceRecords[dupIdx] = pickBetter(existing, newRecord);
        } else {
          localData.attendanceRecords.unshift(newRecord);
        }

        localData.attendanceRecords = dedupeList(localData.attendanceRecords);
      }
      return true;
    } else if (payload.eventType === 'UPDATE') {
      const updatedRecord: AttendanceEntry = {
        id: payload.new.id,
        studentDatabaseId: payload.new.student_database_id,
        studentId: payload.new.student_id,
        studentName: payload.new.student_name,
        timestamp: new Date(payload.new.timestamp),
        type: payload.new.type,
        barcode: payload.new.barcode,
        method: payload.new.method,
        purpose: payload.new.purpose,
        contact: payload.new.contact,
        library: payload.new.library,
        course: payload.new.course,
        year: payload.new.year,
        userType: payload.new.user_type,
        studentType: payload.new.student_type,
        level: payload.new.level
      };
      
      const existingIndex = localData.attendanceRecords.findIndex((r: any) => r.id === updatedRecord.id);
      if (existingIndex !== -1) {
        localData.attendanceRecords[existingIndex] = updatedRecord;
        localData.attendanceRecords = dedupeList(localData.attendanceRecords);
        return true;
      }
    } else if (payload.eventType === 'DELETE') {
      const deletedId = payload.old.id;
      const existingIndex = localData.attendanceRecords.findIndex((r: any) => r.id === deletedId);
      if (existingIndex !== -1) {
        localData.attendanceRecords.splice(existingIndex, 1);
        return true;
      }
    }
    return false;
  }

  private async notifyDataUpdate() {
    if (this.onDataUpdateCallback) {
      const localData = await getFromLocalStorage();
      this.onDataUpdateCallback(localData.students, localData.attendanceRecords);
    }
  }

  public setOnDataUpdateCallback(callback: (students: Student[], records: AttendanceEntry[]) => void) {
    this.onDataUpdateCallback = callback;
  }

  public destroy() {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }
    if (this.studentsChannel) {
      supabase.removeChannel(this.studentsChannel);
      this.studentsChannel = null;
    }
    if (this.attendanceChannel) {
      supabase.removeChannel(this.attendanceChannel);
      this.attendanceChannel = null;
    }
  }
}

export const realtimeService = new RealtimeService();