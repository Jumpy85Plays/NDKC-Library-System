import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Zap, UserPlus, Search, RefreshCw, ArrowDown, ArrowUp, Activity, Wifi } from 'lucide-react';
import BackButton from '@/components/BackButton';
import { toast } from '@/hooks/use-toast';
import { attendanceService } from '@/services/attendanceService';
import { studentService } from '@/services/studentService';
import { Student } from '@/types/Student';
import { AttendanceEntry } from '@/types/AttendanceEntry';
import { getFromLocalStorage } from '@/utils/offlineStorage';
import { useLibrary } from '@/contexts/LibraryContext';
import AttendanceTable from '@/components/AttendanceTable';
import StudentPagination from '@/components/StudentPagination';
import { format } from 'date-fns';
import { useMidnightReset } from '@/hooks/useMidnightReset';
import { supabase } from '@/integrations/supabase/client';

const QuickScanPage = () => {
  const { currentLibrary } = useLibrary();
  const [rfidInput, setRfidInput] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [recentActivity, setRecentActivity] = useState<AttendanceEntry[]>([]);
  const [todayCheckIns, setTodayCheckIns] = useState(0);
  const [todayCheckOuts, setTodayCheckOuts] = useState(0);
  const [totalScans, setTotalScans] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  // Visitor dialogs
  const [visitorCheckInDialog, setVisitorCheckInDialog] = useState(false);
  const [visitorCheckOutDialog, setVisitorCheckOutDialog] = useState(false);
  const [visitorData, setVisitorData] = useState({ name: '', purpose: '', contact: '' });
  const [checkedInVisitors, setCheckedInVisitors] = useState<AttendanceEntry[]>([]);
  
  // Student search dialog
  const [studentSearchDialog, setStudentSearchDialog] = useState(false);
  const [studentSearchId, setStudentSearchId] = useState('');
  const [searchResults, setSearchResults] = useState<Student[]>([]);

  const rfidInputRef = useRef<HTMLInputElement>(null);
  const lastRFIDRef = useRef<{ value: string; time: number } | null>(null);
  
  const loadData = async () => {
    try {
      const [studentsData, attendanceData] = await Promise.all([
        studentService.getStudents(),
        attendanceService.getAttendanceRecords()
      ]);

      setStudents(studentsData);
      
      // Get today's records
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      
      const todayRecords = attendanceData.filter(record => 
        new Date(record.timestamp) >= todayStart
      );
      
      const checkIns = todayRecords.filter(r => r.type === 'check-in').length;
      const checkOuts = todayRecords.filter(r => r.type === 'check-out').length;
      
      setTodayCheckIns(checkIns);
      setTodayCheckOuts(checkOuts);
      setTotalScans(checkIns + checkOuts);
      
      // Get recent activity (all today's records for pagination)
      const recent = todayRecords
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setRecentActivity(recent);
      
      // Get checked-in visitors
      const visitors = todayRecords.filter(r => 
        r.studentId.startsWith('VISITOR_') && r.type === 'check-in'
      );
      // Filter out visitors who have checked out
      const activeVisitors = visitors.filter(v => {
        const hasCheckedOut = todayRecords.some(r => 
          r.studentId === v.studentId && 
          r.type === 'check-out' &&
          new Date(r.timestamp) > new Date(v.timestamp)
        );
        return !hasCheckedOut;
      });
      setCheckedInVisitors(activeVisitors);
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };
  
  useEffect(() => {
    rfidInputRef.current?.focus();
    loadData();
    
    // Listen for online/offline status
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Set up Supabase realtime subscription for live updates
    const channel = supabase
      .channel('quick-scan-attendance-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'attendance_records'
        },
        (payload) => {
          console.log('New attendance record detected:', payload);
          loadData(); // Reload data when new record is inserted
        }
      )
      .subscribe();
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      supabase.removeChannel(channel);
    };
  }, []);
  
  useMidnightReset(() => {
    setCurrentPage(1); // Reset to first page at midnight
    loadData();
  });

  const findStudent = async (searchId: string) => {
    // First check local storage
    const localData = await getFromLocalStorage();
    const localStudents = localData.students.filter(s =>
      (s.studentId === searchId || s.id === searchId || s.rfid === searchId) &&
      (!s.library || s.library === currentLibrary)
    );
    
    // Return most recent local match
    if (localStudents.length > 0) {
      return localStudents.sort((a, b) => {
        const dateA = a.registrationDate ? new Date(a.registrationDate).getTime() : 0;
        const dateB = b.registrationDate ? new Date(b.registrationDate).getTime() : 0;
        return dateB - dateA;
      })[0];
    }

    // Try online lookup if available
    try {
      if (navigator.onLine) {
        let student = await studentService.findStudentByBarcode(searchId, currentLibrary);
        if (!student) {
          student = await studentService.findStudentByRFID(searchId, currentLibrary);
        }
        return student;
      }
    } catch (error) {
      console.log('Online lookup failed, using local data only');
    }
    
    return null;
  };

  const handleRfidInput = async (rfidValue: string) => {
    if (!rfidValue.trim()) return;
    const val = rfidValue.trim();
    const now = Date.now();
    if (lastRFIDRef.current && lastRFIDRef.current.value === val && now - lastRFIDRef.current.time < 1500) {
      setRfidInput('');
      return;
    }
    lastRFIDRef.current = { value: val, time: now };
    
    try {
      const student = await findStudent(val);
      
      if (student) {
        // Determine check-in or check-out based on current status
        const currentStatus = await attendanceService.getStudentCurrentStatus(student.studentId);
        const actionType = currentStatus === 'checked-in' ? 'check-out' : 'check-in';
        
        const newRecord: Omit<AttendanceEntry, 'id'> = {
          studentDatabaseId: student.id,
          studentId: student.studentId,
          studentName: student.name,
          timestamp: new Date(),
          type: actionType,
          method: 'rfid',
          course: student.course,
          year: student.year,
          userType: student.userType || 'student',
          studentType: student.studentType,
          level: student.level,
          strand: student.strand
        };
        
        try {
          await attendanceService.addAttendanceRecord(newRecord);
          toast({
            title: actionType === 'check-in' ? "Welcome!" : "Goodbye!",
            description: `${student.name} ${actionType === 'check-in' ? 'checked in' : 'checked out'} successfully`,
            duration: 3000,
          });
          setRfidInput('');
          loadData(); // Refresh dashboard immediately
        } catch (error: any) {
          if (error.message?.startsWith('COOLDOWN:')) {
            const parts = error.message.split(':');
            const remainingMinutes = parseInt(parts[1] || '0', 10);
            const remainingSeconds = parseInt(parts[2] || '0', 10);
            const timeMsg = remainingMinutes > 0 
              ? `${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''} ${remainingSeconds > 0 ? `and ${remainingSeconds} second${remainingSeconds > 1 ? 's' : ''}` : ''}`
              : `${remainingSeconds} second${remainingSeconds > 1 ? 's' : ''}`;
            toast({
              title: "⏱️ Please wait",
              description: `Please wait ${timeMsg} before scanning again`,
              variant: "destructive",
            });
            setRfidInput('');
            return;
          } else {
            throw error;
          }
        }
      } else {
        toast({
          title: "Student Not Found",
          description: "RFID not registered. Please register student first.",
          variant: "destructive",
        });
        setRfidInput('');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
      setRfidInput('');
    }
  };

  const handleVisitorCheckIn = async () => {
    if (!visitorData.name || !visitorData.purpose) {
      toast({
        title: "Error",
        description: "Name and purpose are required",
        variant: "destructive",
      });
      return;
    }

    const visitorId = `VISITOR_${visitorData.name.toUpperCase().replace(/\s+/g, '_')}`;
    
    const visitorRecord: Omit<AttendanceEntry, 'id'> = {
      studentId: visitorId,
      studentName: visitorData.name,
      timestamp: new Date(),
      type: 'check-in',
      method: 'manual',
      purpose: visitorData.purpose,
      contact: visitorData.contact
    };

    try {
      await attendanceService.addAttendanceRecord(visitorRecord);
      toast({
        title: "Welcome!",
        description: `Visitor ${visitorData.name} checked in successfully`,
      });
      setVisitorData({ name: '', purpose: '', contact: '' });
      setVisitorCheckInDialog(false);
      loadData();
      // Auto-focus RFID input for next scan
      setTimeout(() => {
        rfidInputRef.current?.focus();
      }, 300);
    } catch (error: any) {
      if (error.message?.startsWith('COOLDOWN:')) {
        const parts = error.message.split(':');
        const remainingMinutes = parseInt(parts[1] || '0', 10);
        const remainingSeconds = parseInt(parts[2] || '0', 10);
        const timeMsg = remainingMinutes > 0 
          ? `${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''} ${remainingSeconds > 0 ? `and ${remainingSeconds} second${remainingSeconds > 1 ? 's' : ''}` : ''}`
          : `${remainingSeconds} second${remainingSeconds > 1 ? 's' : ''}`;
        toast({
          title: "⏱️ Please wait",
          description: `Please wait ${timeMsg}`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to check in visitor",
          variant: "destructive",
        });
      }
    }
  };
  
  const handleVisitorCheckOut = async (visitor: AttendanceEntry) => {
    const checkOutRecord: Omit<AttendanceEntry, 'id'> = {
      studentId: visitor.studentId,
      studentName: visitor.studentName,
      timestamp: new Date(),
      type: 'check-out',
      method: 'manual',
      purpose: visitor.purpose,
      contact: visitor.contact
    };

    try {
      await attendanceService.addAttendanceRecord(checkOutRecord);
      toast({
        title: "Goodbye!",
        description: `Visitor ${visitor.studentName} checked out successfully`,
      });
      setVisitorCheckOutDialog(false);
      loadData();
      // Auto-focus RFID input for next scan
      setTimeout(() => {
        rfidInputRef.current?.focus();
      }, 300);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to check out visitor",
        variant: "destructive",
      });
    }
  };
  
  const handleStudentSearch = (searchId: string) => {
    setStudentSearchId(searchId);
    if (searchId.trim()) {
      const results = students.filter(student => 
        student.studentId.toLowerCase().includes(searchId.toLowerCase()) ||
        student.name.toLowerCase().includes(searchId.toLowerCase())
      );
      setSearchResults(results);
    } else {
      setSearchResults([]);
    }
  };
  
  const handleStudentQuickScan = async (student: Student) => {
    try {
      const currentStatus = await attendanceService.getStudentCurrentStatus(student.studentId);
      const actionType = currentStatus === 'checked-in' ? 'check-out' : 'check-in';

      const studentRecord: Omit<AttendanceEntry, 'id'> = {
        studentDatabaseId: student.id,
        studentId: student.studentId,
        studentName: student.name,
        timestamp: new Date(),
        type: actionType,
        method: 'manual',
        course: student.course,
        year: student.year,
        userType: student.userType || 'student',
        studentType: student.studentType,
        level: student.level,
        strand: student.strand
      };

      await attendanceService.addAttendanceRecord(studentRecord);
      toast({
        title: actionType === 'check-in' ? "Welcome!" : "Goodbye!",
        description: `${student.name} ${actionType === 'check-in' ? 'checked in' : 'checked out'} successfully`,
      });
      setStudentSearchId('');
      setSearchResults([]);
      setStudentSearchDialog(false);
      loadData();
      // Auto-focus RFID input for next scan
      setTimeout(() => {
        rfidInputRef.current?.focus();
      }, 300);
    } catch (error: any) {
      if (error.message?.startsWith('COOLDOWN:')) {
        const parts = error.message.split(':');
        const remainingMinutes = parseInt(parts[1] || '0', 10);
        const remainingSeconds = parseInt(parts[2] || '0', 10);
        const timeMsg = remainingMinutes > 0 
          ? `${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''} ${remainingSeconds > 0 ? `and ${remainingSeconds} second${remainingSeconds > 1 ? 's' : ''}` : ''}`
          : `${remainingSeconds} second${remainingSeconds > 1 ? 's' : ''}`;
        toast({
          title: "⏱️ Please wait",
          description: `Please wait ${timeMsg}`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to process scan",
          variant: "destructive",
        });
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Back Button */}
        <div className="mb-6">
          <BackButton to="/" />
        </div>

        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-4xl font-bold text-purple-700 flex items-center justify-center gap-3 mb-2">
            <Zap size={40} />
            Quick Scan
          </h1>
          <p className="text-muted-foreground text-lg">Smart check-in/out · System automatically detects your status</p>
          <div className="flex items-center justify-center gap-2 mt-2">
            <Wifi className={`h-4 w-4 ${isOnline ? 'text-green-500' : 'text-red-500'}`} />
            <span className={`text-sm font-medium ${isOnline ? 'text-green-500' : 'text-red-500'}`}>
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="bg-blue-500 text-white">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <p className="text-sm font-medium">Today's Check-ins</p>
                <p className="text-4xl font-bold">{todayCheckIns}</p>
              </div>
              <ArrowDown size={32} />
            </CardHeader>
          </Card>

          <Card className="bg-orange-500 text-white">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <p className="text-sm font-medium">Today's Check-outs</p>
                <p className="text-4xl font-bold">{todayCheckOuts}</p>
              </div>
              <ArrowUp size={32} />
            </CardHeader>
          </Card>

          <Card className="bg-purple-500 text-white">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <p className="text-sm font-medium">Total Scans</p>
                <p className="text-4xl font-bold">{totalScans}</p>
              </div>
              <Activity size={32} />
            </CardHeader>
          </Card>
        </div>

        {/* RFID Scanner - Compact */}
        <Card className="mb-4 bg-purple-500 text-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap size={20} />
              RFID Scanner - Ready to Scan
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <Input
              id="rfidInput"
              ref={rfidInputRef}
              value={rfidInput}
              onChange={(e) => setRfidInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && rfidInput.trim()) {
                  handleRfidInput(rfidInput);
                }
              }}
              placeholder="Scan RFID card here or type student ID..."
              className="text-center py-3 bg-white text-gray-900"
              autoFocus
            />
            <p className="text-xs text-white/80 mt-2 text-center">
              Place your RFID card near the reader or type your student ID and press Enter
            </p>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
          {/* Visitor Check In Dialog */}
          <Dialog open={visitorCheckInDialog} onOpenChange={(open) => {
            setVisitorCheckInDialog(open);
            if (!open) {
              // Auto-focus RFID when dialog closes
              setTimeout(() => rfidInputRef.current?.focus(), 200);
            }
          }}>
            <DialogTrigger asChild>
              <Button 
                className="w-full h-14 text-base bg-green-600 hover:bg-green-700 text-white"
              >
                <UserPlus className="mr-2 h-4 w-4" />
                Visitor Check In
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="text-2xl text-center">Visitor Check In</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="visitor-name">Full Name *</Label>
                  <Input
                    id="visitor-name"
                    value={visitorData.name}
                    onChange={(e) => setVisitorData({...visitorData, name: e.target.value})}
                    placeholder="Enter visitor's full name"
                  />
                </div>
                <div>
                  <Label htmlFor="visitor-purpose">Purpose of Visit *</Label>
                  <Textarea
                    id="visitor-purpose"
                    value={visitorData.purpose}
                    onChange={(e) => setVisitorData({...visitorData, purpose: e.target.value})}
                    placeholder="Why are you visiting?"
                    rows={3}
                  />
                </div>
                <div>
                  <Label htmlFor="visitor-contact">Contact Number</Label>
                  <Input
                    id="visitor-contact"
                    value={visitorData.contact}
                    onChange={(e) => setVisitorData({...visitorData, contact: e.target.value})}
                    placeholder="Enter contact number"
                  />
                </div>
                <Button onClick={handleVisitorCheckIn} className="w-full bg-green-600 hover:bg-green-700">
                  Check In Visitor
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Visitor Check Out Dialog */}
          <Dialog open={visitorCheckOutDialog} onOpenChange={(open) => {
            setVisitorCheckOutDialog(open);
            if (!open) {
              // Auto-focus RFID when dialog closes
              setTimeout(() => rfidInputRef.current?.focus(), 200);
            }
          }}>
            <DialogTrigger asChild>
              <Button 
                className="w-full h-14 text-base bg-red-600 hover:bg-red-700 text-white"
              >
                <UserPlus className="mr-2 h-4 w-4" />
                Visitor Check Out
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="text-2xl text-center">Visitor Check Out</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Search and select a visitor to check out:</p>
                {checkedInVisitors.length > 0 ? (
                  <div className="max-h-96 overflow-y-auto space-y-2">
                    {checkedInVisitors.map((visitor) => (
                      <Button
                        key={visitor.id}
                        variant="outline"
                        className="w-full justify-start text-left h-auto py-3 hover:bg-red-50"
                        onClick={() => handleVisitorCheckOut(visitor)}
                      >
                        <div className="flex-1">
                          <div className="font-medium">{visitor.studentName}</div>
                          <div className="text-sm text-muted-foreground">
                            Purpose: {visitor.purpose}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Checked in: {format(new Date(visitor.timestamp), 'HH:mm:ss')}
                          </div>
                        </div>
                      </Button>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-4">
                    No visitors currently checked in
                  </p>
                )}
              </div>
            </DialogContent>
          </Dialog>

          {/* Student Search Dialog */}
          <Dialog open={studentSearchDialog} onOpenChange={(open) => {
            setStudentSearchDialog(open);
            if (!open) {
              // Auto-focus RFID when dialog closes
              setTimeout(() => rfidInputRef.current?.focus(), 200);
            }
          }}>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full h-14 text-base">
                <Search className="mr-2 h-4 w-4" />
                Student Search
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="text-2xl text-center">Student Search</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="student-search">Search Student ID or Name</Label>
                  <Input
                    id="student-search"
                    value={studentSearchId}
                    onChange={(e) => handleStudentSearch(e.target.value)}
                    placeholder="Enter student ID or name"
                    className="text-lg p-3"
                  />
                </div>
                
                {searchResults.length > 0 && (
                  <div className="max-h-64 overflow-y-auto border rounded-lg">
                    <div className="text-sm font-medium p-2 bg-gray-50 border-b">
                      Found {searchResults.length} student(s):
                    </div>
                    {searchResults.map((student) => (
                      <button
                        key={student.id}
                        onClick={() => handleStudentQuickScan(student)}
                        className="w-full p-3 text-left hover:bg-blue-50 border-b last:border-b-0 transition-colors"
                      >
                        <div className="font-medium text-blue-600">{student.name}</div>
                        <div className="text-sm text-gray-600">ID: {student.studentId}</div>
                        {student.course && (
                          <div className="text-xs text-gray-500">Course: {student.course}</div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                
                {studentSearchId && searchResults.length === 0 && (
                  <div className="text-center p-4 text-gray-500">
                    No students found matching "{studentSearchId}"
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

          {/* Refresh Data Button */}
          <Button 
            variant="outline" 
            className="w-full h-14 text-base"
            onClick={loadData}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh Data
          </Button>
        </div>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <Activity size={20} />
              Today's Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AttendanceTable 
              records={recentActivity.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)} 
              students={students} 
              type="check-in" 
            />
            
            <div className="mt-4">
              <StudentPagination
                currentPage={currentPage}
                totalPages={Math.ceil(recentActivity.length / itemsPerPage)}
                itemsPerPage={itemsPerPage}
                totalItems={recentActivity.length}
                onPageChange={setCurrentPage}
                onItemsPerPageChange={(newSize) => {
                  setItemsPerPage(newSize);
                  setCurrentPage(1); // Reset to first page when changing items per page
                }}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default QuickScanPage;
