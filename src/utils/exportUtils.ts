
import { Student } from '@/types/Student';
import { AttendanceEntry } from '@/types/AttendanceEntry';

export const convertToCSV = (filteredStudents: Student[], filteredRecords: AttendanceEntry[]) => {
  // Create CSV for students
  const studentHeaders = ['ID', 'Name', 'Student ID', 'Email', 'Department', 'Level', 'Shift'];
  const studentRows = filteredStudents.map((student: Student) => [
    student.id,
    student.name,
    student.studentId.startsWith('VISITOR_') ? '' : student.studentId,
    student.email || '',
    student.department || '',
    student.level || '',
    student.shift || ''
  ]);
  
  // Create CSV for attendance
  const attendanceHeaders = ['ID', 'Student Name', 'Student ID', 'Timestamp', 'Method', 'Student Type', 'Course', 'Year', 'Strand', 'Purpose'];
  const attendanceRows = filteredRecords.map((record: AttendanceEntry) => [
    record.id,
    record.studentName,
    record.studentId.startsWith('VISITOR_') ? '' : record.studentId,
    new Date(record.timestamp).toISOString(),
    record.method,
    record.studentType || '',
    record.course || '',
    record.year || '',
    record.strand || '',
    record.purpose || ''
  ]);

  const studentCSV = [studentHeaders, ...studentRows].map(row => row.join(',')).join('\n');
  const attendanceCSV = [attendanceHeaders, ...attendanceRows].map(row => row.join(',')).join('\n');
  
  return `STUDENTS\n${studentCSV}\n\nATTENDANCE\n${attendanceCSV}`;
};

export const convertToSVD = (filteredStudents: Student[], filteredRecords: AttendanceEntry[], exportDateRange: string, exportDepartment: string) => {
  // SVD format: Simple delimited format with pipe separators
  let svdContent = 'LIBRARY_DATA_SVD|1.0\n';
  svdContent += `EXPORT_INFO|${exportDateRange}|${exportDepartment}|${new Date().toISOString()}\n`;
  svdContent += `COUNTS|${filteredStudents.length}|${filteredRecords.length}\n\n`;
  
  svdContent += 'STUDENTS_START\n';
  filteredStudents.forEach((student: Student) => {
    svdContent += `STU|${student.id}|${student.name}|${student.studentId}|${student.email || ''}|${student.department || ''}|${student.level || ''}|${student.shift || ''}\n`;
  });
  svdContent += 'STUDENTS_END\n\n';
  
  svdContent += 'ATTENDANCE_START\n';
  filteredRecords.forEach((record: AttendanceEntry) => {
    svdContent += `ATT|${record.id}|${record.studentName}|${record.studentId}|${new Date(record.timestamp).toISOString()}|${record.method}|${record.userType || 'student'}|${record.studentType || ''}|${record.course || ''}|${record.year || ''}|${record.level || ''}|${record.strand || ''}|${record.purpose || ''}|${record.contact || ''}\n`;
  });
  svdContent += 'ATTENDANCE_END\n';
  
  return svdContent;
};

export const createJSONExport = (filteredStudents: Student[], filteredRecords: AttendanceEntry[], exportDateRange: string, exportDepartment: string) => {
  return {
    students: filteredStudents,
    attendance: filteredRecords,
    visitors: filteredRecords.filter(r => r.studentId === 'VISITOR'),
    exportInfo: {
      dateRange: exportDateRange,
      department: exportDepartment,
      exportedAt: new Date().toISOString(),
      totalStudents: filteredStudents.length,
      totalAttendance: filteredRecords.length,
    }
  };
};

// Calculate time spent in library for each student
export const calculateTimeSpent = (students: Student[], attendanceRecords: AttendanceEntry[]) => {
  const timeSpentMap = new Map<string, number>();
  const studentInfoMap = new Map<string, { name: string; course: string }>();

  students.forEach(student => {
    studentInfoMap.set(student.studentId, {
      name: student.name,
      course: student.course || student.department || 'N/A'
    });
  });

  const sortedRecords = [...attendanceRecords].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const checkInMap = new Map<string, Date>();

  sortedRecords.forEach(record => {
    if (record.type === 'check-in') {
      checkInMap.set(record.studentId, new Date(record.timestamp));
    } else if (record.type === 'check-out') {
      const checkInTime = checkInMap.get(record.studentId);
      if (checkInTime) {
        const checkOutTime = new Date(record.timestamp);
        const minutesSpent = (checkOutTime.getTime() - checkInTime.getTime()) / (1000 * 60);
        
        const currentTotal = timeSpentMap.get(record.studentId) || 0;
        timeSpentMap.set(record.studentId, currentTotal + minutesSpent);
        checkInMap.delete(record.studentId);
      }
    }
  });

  return Array.from(timeSpentMap.entries()).map(([studentId, minutes]) => {
    const info = studentInfoMap.get(studentId);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = Math.round(minutes % 60);
    
    return {
      studentId,
      name: info?.name || 'Unknown',
      course: info?.course || 'N/A',
      totalMinutes: Math.round(minutes),
      totalHours: `${hours}h ${remainingMinutes}m`
    };
  }).sort((a, b) => b.totalMinutes - a.totalMinutes);
};

export const convertTimeSpentToCSV = (timeSpentData: ReturnType<typeof calculateTimeSpent>) => {
  const headers = ['Student ID', 'Name', 'Course', 'Total Minutes', 'Total Hours'];
  const rows = timeSpentData.map(row => [
    row.studentId.startsWith('VISITOR_') ? '' : row.studentId,
    row.name,
    row.course,
    row.totalMinutes.toString(),
    row.totalHours
  ]);
  
  return [headers, ...rows].map(row => row.join(',')).join('\n');
};
