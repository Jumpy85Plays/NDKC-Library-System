import React, { useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { User, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { Student } from '@/types/Student';

interface StudentListProps {
  students: Student[];
}

const ITEMS_PER_PAGE = 50;

const StudentList: React.FC<StudentListProps> = ({ students }) => {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(students.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentStudents = students.slice(startIndex, endIndex);
  const formatLastScan = (date?: Date) => {
    if (!date) return 'Never';
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    return date.toLocaleDateString();
  };

  const isRecentScan = (date?: Date) => {
    if (!date) return false;
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    return diffMs < 5 * 60 * 1000; // 5 minutes
  };

  return (
    <div className="space-y-4">
      <ScrollArea className="h-[600px]">
        <div className="space-y-3 pr-4">
          {students.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No students registered yet
            </div>
          ) : (
            currentStudents.map((student) => (
          <div
            key={student.id}
            className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
              isRecentScan(student.lastScan) 
                ? 'bg-green-50 border border-green-200' 
                : 'bg-muted/50 hover:bg-muted/70'
            }`}
          >
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  isRecentScan(student.lastScan)
                    ? 'bg-green-100'
                    : 'bg-primary/10'
                }`}>
                  <User className={`h-5 w-5 ${
                    isRecentScan(student.lastScan)
                      ? 'text-green-600'
                      : 'text-primary'
                  }`} />
                </div>
              </div>
              <div>
                <p className="font-medium text-foreground">
                  {student.name}
                </p>
                <p className="text-sm text-muted-foreground">
                  ID: {student.studentId}
                </p>
              </div>
            </div>
            
            <div className="text-right">
              <Badge 
                variant={student.lastScan ? 'default' : 'secondary'}
                className="text-xs mb-1"
              >
                {student.lastScan ? 'Present' : 'Absent'}
              </Badge>
              <div className="flex items-center space-x-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>{formatLastScan(student.lastScan)}</span>
              </div>
              </div>
            </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2">
          <p className="text-sm text-muted-foreground">
            Showing {startIndex + 1} to {Math.min(endIndex, students.length)} of {students.length} students
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
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
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentList;
