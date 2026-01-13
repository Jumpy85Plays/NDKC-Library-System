import React, { useState, memo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { AttendanceEntry } from '@/types/AttendanceEntry';
import { Student } from '@/types/Student';

interface AttendanceTableProps {
  records: AttendanceEntry[];
  students: Student[];
  type: 'check-in' | 'check-out';
}

const ITEMS_PER_PAGE = 50;

const AttendanceTable: React.FC<AttendanceTableProps> = memo(({ records, students, type }) => {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(records.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentRecords = records.slice(startIndex, endIndex);
  const getDisplayInfo = (record: AttendanceEntry) => {
    // Enrich missing fields from students list when offline records lack metadata
    const studentFallback = students.find(s => s.studentId === record.studentId);
    const course = record.course ?? studentFallback?.course ?? '';
    const year = record.year ?? studentFallback?.year ?? '';
    const userType = record.userType ?? (studentFallback?.userType as any);
    const studentType = record.studentType ?? (studentFallback?.studentType as any);
    const level = record.level ?? studentFallback?.level;
    const strand = record.strand ?? (studentFallback as any)?.strand;

    // Check if it's a visitor (starts with VISITOR_)
    if (record.studentId.startsWith('VISITOR_')) {
      return {
        type: 'visitor',
        field1: record.purpose || 'Visit',
        field2: record.contact || null,
        isStrand: false
      };
    }

    // Check if it's a teacher - check userType field
    if (userType === 'teacher') {
      return {
        type: 'teacher',
        field1: course && course !== 'N/A' ? course : null,
        field2: 'Teacher',
        isStrand: false
      };
    }

    // Check if it's an IBED student - explicitly check studentType FIRST, exclude 'college' level
    if (studentType === 'ibed' || 
        (level && level !== 'N/A' && level !== 'college' && !course)) {
      // For Senior High students (level='senior-high' OR Grade 11-12), show strand instead of level
      const isSeniorHigh = level === 'senior-high' || 
                           year === 'Grade 11' || year === 'Grade 12' || 
                           year === '11' || year === '12';
      
      return {
        type: 'ibed',
        field1: isSeniorHigh && strand && strand !== 'N/A' 
          ? strand 
          : (level && level !== 'N/A' ? level : null),
        field2: year && year !== 'N/A' ? year : null,
        isStrand: isSeniorHigh && strand && strand !== 'N/A'
      };
    }

    // Default to college student - show course and year
    return {
      type: 'college',
      field1: course && course !== 'N/A' ? course : 'Not Specified',
      field2: year && year !== 'N/A' ? year : null,
      isStrand: false
    };
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Info 1</TableHead>
              <TableHead>Info 2</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentRecords.length > 0 ? (
              currentRecords.map((record) => {
                const displayInfo = getDisplayInfo(record);
                // Color based on check-in (green) or check-out (red)
                const typeColorClass = record.type === 'check-in' 
                  ? 'bg-green-50 hover:bg-green-100' 
                  : 'bg-red-50 hover:bg-red-100';
                
                return (
                  <TableRow key={record.id} className={`${typeColorClass} border-l-4 ${
                    record.type === 'check-in' ? 'border-l-green-500' : 'border-l-red-500'
                  }`}>
                    <TableCell className="font-medium">{record.studentName}</TableCell>
                    <TableCell>
                      {displayInfo.type === 'visitor' && displayInfo.field1 && (
                        <span className="text-orange-700 font-medium">Purpose: {displayInfo.field1}</span>
                      )}
                      {displayInfo.type === 'teacher' && displayInfo.field1 && (
                        <span className="text-purple-700 font-medium">Dept: {displayInfo.field1}</span>
                      )}
                      {displayInfo.type === 'ibed' && displayInfo.field1 && (
                        <span className="text-blue-700 font-medium">
                          {displayInfo.isStrand ? 'Strand: ' : 'Level: '}
                          {displayInfo.field1}
                        </span>
                      )}
                      {displayInfo.type === 'college' && displayInfo.field1 && (
                        <span className={`font-medium ${displayInfo.field1 === 'Not Specified' ? 'text-muted-foreground' : 'text-green-700'}`}>
                          Course: {displayInfo.field1}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {displayInfo.type === 'visitor' && displayInfo.field2 && (
                        <span className="text-orange-700 font-medium">Contact: {displayInfo.field2}</span>
                      )}
                      {displayInfo.type === 'teacher' && (
                        <span className="text-purple-700 font-medium">Role: {displayInfo.field2}</span>
                      )}
                      {displayInfo.type === 'ibed' && displayInfo.field2 && (
                        <span className="text-blue-700 font-medium">{displayInfo.field2}</span>
                      )}
                      {displayInfo.type === 'college' && displayInfo.field2 && (
                        <span className="text-green-700 font-medium">{displayInfo.field2}</span>
                      )}
                    </TableCell>
                    <TableCell>{format(new Date(record.timestamp), 'HH:mm:ss')}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${
                        record.type === 'check-in' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {record.type === 'check-in' ? '✓ Check In' : '✓ Check Out'}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  No {type === 'check-in' ? 'check-ins' : 'check-outs'} today
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {startIndex + 1} to {Math.min(endIndex, records.length)} of {records.length} entries
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  // Re-render when length, type, or newest record changes
  const sameLength = prevProps.records.length === nextProps.records.length;
  const sameType = prevProps.type === nextProps.type;
  const prevFirst = prevProps.records[0]?.id || prevProps.records[0]?.timestamp?.toString();
  const nextFirst = nextProps.records[0]?.id || nextProps.records[0]?.timestamp?.toString();
  const sameHead = prevFirst === nextFirst;
  return sameLength && sameType && sameHead;
});

AttendanceTable.displayName = 'AttendanceTable';

export default AttendanceTable;
