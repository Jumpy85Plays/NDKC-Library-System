import { AttendanceEntry } from '@/types/AttendanceEntry';

/**
 * Removes duplicate attendance records based on studentId, type, and timestamp (to the second).
 * Prefers newer records when duplicates exist.
 * 
 * @param records - Array of attendance records to deduplicate
 * @returns Deduplicated array of attendance records
 */
export function deduplicateAttendance(records: AttendanceEntry[]): AttendanceEntry[] {
  const deduped: AttendanceEntry[] = [];
  const seen = new Set<string>();

  // Sort by timestamp (newest first) to prefer newer records
  const sorted = [...records].sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  for (const record of sorted) {
    // Create unique key: studentId + type + timestamp (rounded to second)
    const timestamp = new Date(record.timestamp);
    const timestampKey = `${timestamp.getFullYear()}-${timestamp.getMonth()}-${timestamp.getDate()}-${timestamp.getHours()}-${timestamp.getMinutes()}-${timestamp.getSeconds()}`;
    const key = `${record.studentId}|${record.type}|${timestampKey}`;

    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(record);
    } else {
      console.log(`🗑️ Removed duplicate: ${record.studentName} (${record.type}) at ${timestamp.toLocaleString()}`);
    }
  }

  // Sort back to descending timestamp order
  return deduped.sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}
