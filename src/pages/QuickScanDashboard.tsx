import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScanBarcode, RefreshCw } from 'lucide-react';
import { attendanceService } from '@/services/attendanceService';
import { studentService } from '@/services/studentService';
import { Student } from '@/types/Student';
import { AttendanceEntry } from '@/types/AttendanceEntry';
import { format } from 'date-fns';
import BackButton from '@/components/BackButton';
import AttendanceTable from '@/components/AttendanceTable';
import { useMidnightReset } from '@/hooks/useMidnightReset';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const QuickScanDashboard = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [allRecords, setAllRecords] = useState<AttendanceEntry[]>([]);
  const [displayedRecords, setDisplayedRecords] = useState<AttendanceEntry[]>([]);
  const [todayCheckInsCount, setTodayCheckInsCount] = useState(0);
  const [todayCheckOutsCount, setTodayCheckOutsCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [studentsData, attendanceData] = await Promise.all([
        studentService.getStudents(),
        attendanceService.getAttendanceRecords()
      ]);

      setStudents(studentsData);
      
      // Get today's records starting from 12am (midnight reset)
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      
      const todayRecords = attendanceData.filter(record => 
        new Date(record.timestamp) >= todayStart
      );
      
      const sortedRecords = todayRecords.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      
      setAllRecords(sortedRecords);
      setTodayCheckInsCount(todayRecords.filter(r => r.type === 'check-in').length);
      setTodayCheckOutsCount(todayRecords.filter(r => r.type === 'check-out').length);
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  // Automatically refresh at midnight
  useMidnightReset(loadData);

  // Pagination logic
  useEffect(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    setDisplayedRecords(allRecords.slice(startIndex, endIndex));
  }, [currentPage, itemsPerPage, allRecords]);

  const totalPages = Math.ceil(allRecords.length / itemsPerPage);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handleItemsPerPageChange = (value: string) => {
    setItemsPerPage(parseInt(value));
    setCurrentPage(1);
  };

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages = [];
    const showEllipsisStart = currentPage > 3;
    const showEllipsisEnd = currentPage < totalPages - 2;

    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);
      
      if (showEllipsisStart) {
        pages.push(-1); // -1 represents ellipsis
      }
      
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      
      if (showEllipsisEnd) {
        pages.push(-2); // -2 represents ellipsis
      }
      
      pages.push(totalPages);
    }
    
    return pages;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Back Button */}
        <div className="mb-6">
          <BackButton to="/" />
        </div>
        
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-purple-700 flex items-center gap-3">
            <ScanBarcode size={32} />
            Quick Scan Dashboard
          </h1>
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="bg-purple-500 text-white">
            <CardHeader className="text-center py-4">
              <CardTitle className="text-2xl font-bold">{todayCheckInsCount}</CardTitle>
              <p className="text-sm">Today's Check-ins</p>
            </CardHeader>
          </Card>

          <Card className="bg-pink-500 text-white">
            <CardHeader className="text-center py-4">
              <CardTitle className="text-2xl font-bold">{todayCheckOutsCount}</CardTitle>
              <p className="text-sm">Today's Check-outs</p>
            </CardHeader>
          </Card>

          <Card className="bg-blue-500 text-white">
            <CardHeader className="text-center py-4">
              <CardTitle className="text-2xl font-bold">{students.length}</CardTitle>
              <p className="text-sm">Total Students</p>
            </CardHeader>
          </Card>

          <Card className="bg-indigo-500 text-white">
            <CardHeader className="text-center py-4">
              <CardTitle className="text-2xl font-bold">
                {format(new Date(), 'HH:mm')}
              </CardTitle>
              <p className="text-sm">{format(new Date(), 'MMM dd, yyyy')}</p>
            </CardHeader>
          </Card>
        </div>

        {/* Records Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Today's Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <AttendanceTable records={displayedRecords} students={students} type="check-in" />
            
            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    Showing {(currentPage - 1) * itemsPerPage + 1} to{' '}
                    {Math.min(currentPage * itemsPerPage, allRecords.length)} of{' '}
                    {allRecords.length} entries
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Rows per page:</span>
                  <Select value={itemsPerPage.toString()} onValueChange={handleItemsPerPageChange}>
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() => handlePageChange(currentPage - 1)}
                        className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                      />
                    </PaginationItem>

                    {getPageNumbers().map((page, index) => (
                      <PaginationItem key={index}>
                        {page === -1 || page === -2 ? (
                          <PaginationEllipsis />
                        ) : (
                          <PaginationLink
                            onClick={() => handlePageChange(page)}
                            isActive={currentPage === page}
                            className="cursor-pointer"
                          >
                            {page}
                          </PaginationLink>
                        )}
                      </PaginationItem>
                    ))}

                    <PaginationItem>
                      <PaginationNext
                        onClick={() => handlePageChange(currentPage + 1)}
                        className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default QuickScanDashboard;
