
import React, { useState } from 'react';
import { toast } from '@/components/ui/use-toast';
import { Student } from '@/types/Student';
import { AttendanceEntry } from '@/types/AttendanceEntry';
import { deduplicateAttendance } from '@/utils/deduplicateAttendance';
import { format, startOfWeek, startOfMonth, startOfYear, isAfter, subDays, subYears } from 'date-fns';
import ExportControls from './ExportControls';
import ImportControls from './ImportControls';
import DataOverview from './DataOverview';
import { convertToCSV, convertToSVD, createJSONExport, calculateTimeSpent, convertTimeSpentToCSV } from '@/utils/exportUtils';
import { exportToPDF } from '@/utils/pdfExport';
import { bulkImportStudents2025, bulkImportIBEDStudents2025, bulkImportIBEDGrade11Students2025 } from '@/utils/bulkStudentImport';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { UserPlus, Loader2, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface AdminDataManagementProps {
  students: Student[];
  attendanceRecords: AttendanceEntry[];
  onDataImported: (students: Student[], records: AttendanceEntry[]) => void;
}

const AdminDataManagement = ({ students, attendanceRecords, onDataImported }: AdminDataManagementProps) => {
  const [exportDateRange, setExportDateRange] = useState('today');
  const [exportDepartment, setExportDepartment] = useState('All Departments');
  const [exportFormat, setExportFormat] = useState('csv');
  const [reportType, setReportType] = useState('attendance');
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(undefined);
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(undefined);
  const [isBulkImporting, setIsBulkImporting] = useState(false);
  const [isIBEDBulkImporting, setIsIBEDBulkImporting] = useState(false);
  const [isIBEDGrade11Importing, setIsIBEDGrade11Importing] = useState(false);
  const [isCleaningDuplicates, setIsCleaningDuplicates] = useState(false);

  const handleBulkImport = async () => {
    setIsBulkImporting(true);
    try {
      const results = await bulkImportStudents2025();
      toast({
        title: "Bulk Import Complete!",
        description: `Added: ${results.added}, Skipped: ${results.skipped}, Errors: ${results.errors}`,
      });
      
      if (results.skippedStudents.length > 0) {
        console.log('Skipped students:', results.skippedStudents);
      }
      
      // Reload to show new students
      setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      toast({
        title: "Import Failed",
        description: "Failed to bulk import students",
        variant: "destructive",
      });
      console.error(error);
    } finally {
      setIsBulkImporting(false);
    }
  };

  const handleIBEDBulkImport = async () => {
    setIsIBEDBulkImporting(true);
    try {
      const results = await bulkImportIBEDStudents2025();
      toast({
        title: "IBED Bulk Import Complete!",
        description: `Added: ${results.added}, Skipped: ${results.skipped}, Errors: ${results.errors.length}`,
      });
      
      if (results.skippedStudents.length > 0) {
        console.log('Skipped students:', results.skippedStudents);
      }
      
      // Reload to show new students
      setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      toast({
        title: "Import Failed",
        description: "Failed to bulk import IBED students",
        variant: "destructive",
      });
      console.error(error);
    } finally {
      setIsIBEDBulkImporting(false);
    }
  };

  const handleIBEDGrade11Import = async () => {
    setIsIBEDGrade11Importing(true);
    try {
      const results = await bulkImportIBEDGrade11Students2025();
      toast({
        title: "IBED Grade 11 Import Complete!",
        description: `Added: ${results.added}, Skipped: ${results.skipped}, Errors: ${results.errors.length}`,
      });
      
      if (results.skippedStudents.length > 0) {
        console.log('Skipped students:', results.skippedStudents);
      }
      
      // Reload to show new students
      setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      toast({
        title: "Import Failed",
        description: "Failed to bulk import IBED Grade 11 students",
        variant: "destructive",
      });
      console.error(error);
    } finally {
      setIsIBEDGrade11Importing(false);
    }
  };

  const handleCleanDuplicates = async () => {
    if (!window.electronAPI?.removeDuplicateAttendance) {
      toast({
        title: "Not Available",
        description: "This feature is only available in the desktop app",
        variant: "destructive",
      });
      return;
    }

    setIsCleaningDuplicates(true);
    try {
      const result = await window.electronAPI.removeDuplicateAttendance();
      if (result.success) {
        toast({
          title: "Duplicates Removed",
          description: `Successfully removed ${result.removed || 0} duplicate attendance records`,
        });
        
        // Reload to show updated data
        setTimeout(() => window.location.reload(), 1500);
      } else {
        throw new Error(result.error || 'Unknown error');
      }
    } catch (error) {
      toast({
        title: "Cleanup Failed",
        description: "Failed to remove duplicate attendance records",
        variant: "destructive",
      });
      console.error(error);
    } finally {
      setIsCleaningDuplicates(false);
    }
  };

  const getFilteredData = () => {
    const now = new Date();
    let startDate: Date;
    let endDate: Date = now;

    switch (exportDateRange) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        startDate = startOfWeek(now);
        break;
      case 'month':
        startDate = startOfMonth(now);
        break;
      case 'year':
        startDate = startOfYear(now);
        break;
      case 'custom':
        startDate = customStartDate || subDays(now, 30);
        endDate = customEndDate || now;
        break;
      default:
        startDate = new Date(0);
    }

    const filteredRecords = attendanceRecords.filter(record => {
      const recordDate = new Date(record.timestamp);
      const isAfterStart = isAfter(recordDate, startDate) || recordDate.toDateString() === startDate.toDateString();
      const isBeforeEnd = recordDate <= endDate;
      
      if (!isAfterStart || !isBeforeEnd) return false;

      if (exportDepartment === 'All Departments') return true;

      // Find the student and check their department
      const student = students.find(s => s.studentId === record.studentId);
      return student?.department === exportDepartment;
    });

    const filteredStudents = exportDepartment === 'All Departments' 
      ? students 
      : students.filter(s => s.department === exportDepartment);

    return { filteredStudents, filteredRecords };
  };

  // Fetch full data from Supabase for export (bypasses local 30-day limitation)
  const fetchFullDataForExport = async () => {
    const now = new Date();
    let startDate: Date;
    let endDate: Date;

    switch (exportDateRange) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        endDate = new Date(now);
        break;
      case 'week':
        startDate = startOfWeek(now);
        endDate = new Date(now);
        break;
      case 'month':
        startDate = startOfMonth(now);
        endDate = new Date(now);
        break;
      case 'year':
        startDate = startOfYear(now);
        endDate = new Date(now);
        break;
      case 'custom':
        startDate = customStartDate || subDays(now, 30);
        endDate = customEndDate || now;
        break;
      default:
        startDate = new Date(0);
        endDate = new Date(now);
    }

    // Fix timezone issues - ensure we're querying from midnight local time
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    // Debug logging
    console.log('🔍 Export Date Range:', exportDateRange);
    console.log('📅 Start Date (Local):', startDate.toLocaleString());
    console.log('📅 Start Date (ISO/UTC):', startDate.toISOString());
    console.log('📅 End Date (Local):', endDate.toLocaleString());
    console.log('📅 End Date (ISO/UTC):', endDate.toISOString());

    // Query Supabase with pagination to fetch ALL records (no 1000 limit)
    let allRecords: any[] = [];
    let from = 0;
    const batchSize = 1000;
    let hasMore = true;

    console.log('📥 Starting paginated fetch from Supabase...');

    while (hasMore) {
      const { data, error, count } = await supabase
        .from('attendance_records')
        .select('*', { count: 'exact' })
        .gte('timestamp', startDate.toISOString())
        .lte('timestamp', endDate.toISOString())
        .order('timestamp', { ascending: false })
        .range(from, from + batchSize - 1);


      if (data && data.length > 0) {
        allRecords = [...allRecords, ...data];
        console.log(`📦 Batch ${Math.floor(from/batchSize) + 1}: Fetched ${data.length} records (Total so far: ${allRecords.length}${count ? `/${count}` : ''})`);
        from += batchSize;
        hasMore = data.length === batchSize;
      } else {
        hasMore = false;
      }
    }

    console.log(`✅ Pagination complete: ${allRecords.length} total records fetched from Supabase`);

    // Map Supabase response (snake_case) to AttendanceEntry format (camelCase)
    let filteredRecords: AttendanceEntry[] = (allRecords || []).map((record: any) => ({
      id: record.id,
      studentDatabaseId: record.student_database_id,
      studentId: record.student_id,
      studentName: record.student_name,
      timestamp: new Date(record.timestamp),
      type: record.type,
      barcode: record.barcode,
      method: record.method,
      purpose: record.purpose,
      contact: record.contact,
      library: record.library,
      course: record.course,
      year: record.year,
      userType: record.user_type,
      studentType: record.student_type,
      level: record.level,
      strand: record.strand,
    }));

    // Deduplicate records BEFORE filtering by department
    console.log(`📊 Records before deduplication: ${filteredRecords.length}`);
    filteredRecords = deduplicateAttendance(filteredRecords);
    console.log(`✨ Records after deduplication: ${filteredRecords.length} (removed ${allRecords.length - filteredRecords.length} duplicates)`);

    // Apply department filter
    if (exportDepartment !== 'All Departments') {
      filteredRecords = filteredRecords.filter(record => {
        const student = students.find(s => s.studentId === record.studentId);
        return student?.department === exportDepartment;
      });
    }

    const filteredStudents = exportDepartment === 'All Departments' 
      ? students 
      : students.filter(s => s.department === exportDepartment);

    return { filteredStudents, filteredRecords };
  };

  const handleExportData = async () => {
    toast({
      title: "Fetching data...",
      description: "Loading records from database for export",
    });

    const { filteredStudents, filteredRecords } = await fetchFullDataForExport();

    console.log(`✅ Export ready: ${filteredRecords.length} records, ${filteredStudents.length} students`);

    // Handle PDF export
    if (exportFormat === 'pdf') {
      try {
        await exportToPDF(filteredStudents, filteredRecords, {
          reportType: reportType === 'time-spent' ? 'Time Spent' : 'Attendance Report',
          timePeriod: exportDateRange,
          department: exportDepartment,
          customStartDate,
          customEndDate,
        });
        
        toast({
          title: "PDF Exported",
          description: `Successfully exported ${reportType === 'time-spent' ? 'time spent' : 'attendance'} report as PDF`,
        });
      } catch (error) {
        toast({
          title: "Export Failed",
          description: "Failed to generate PDF. Please try again.",
          variant: "destructive",
        });
      }
      return;
    }

    // Handle other formats
    let content: string;
    let mimeType: string;
    let fileExtension: string;

    if (reportType === 'time-spent') {
      const timeSpentData = calculateTimeSpent(filteredStudents, filteredRecords);
      
      if (exportFormat === 'csv') {
        content = convertTimeSpentToCSV(timeSpentData);
        mimeType = 'text/csv';
        fileExtension = 'csv';
      } else {
        content = JSON.stringify({ timeSpent: timeSpentData, exportInfo: { exportedAt: new Date().toISOString() } }, null, 2);
        mimeType = 'application/json';
        fileExtension = 'json';
      }
    } else {
      // Attendance report
      if (exportFormat === 'csv') {
        content = convertToCSV(filteredStudents, filteredRecords);
        mimeType = 'text/csv';
        fileExtension = 'csv';
      } else if (exportFormat === 'svd') {
        content = convertToSVD(filteredStudents, filteredRecords, exportDateRange, exportDepartment);
        mimeType = 'text/plain';
        fileExtension = 'svd';
      } else {
        const exportData = createJSONExport(filteredStudents, filteredRecords, exportDateRange, exportDepartment);
        content = JSON.stringify(exportData, null, 2);
        mimeType = 'application/json';
        fileExtension = 'json';
      }
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `library-${reportType}-${exportDateRange}-${format(new Date(), 'yyyy-MM-dd')}.${fileExtension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Success feedback with details
    const dateRangeLabel = exportDateRange === 'today' ? 'today' : 
                          exportDateRange === 'week' ? 'this week' :
                          exportDateRange === 'month' ? 'this month' : 
                          exportDateRange === 'custom' ? 'custom range' : 'this year';
    
    toast({
      title: "Export Complete!",
      description: `Exported ${filteredRecords.length} records from ${dateRangeLabel}`,
    });
  };

  const handleImportData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        
        if (data.students && data.attendance) {
          onDataImported(data.students, data.attendance);
          toast({
            title: "Data Imported",
            description: `Imported ${data.students.length} students and ${data.attendance.length} records`,
          });
        } else {
          throw new Error('Invalid file format');
        }
      } catch (error) {
        toast({
          title: "Import Failed",
          description: "Invalid file format or corrupted data",
          variant: "destructive",
        });
      }
    };
    reader.readAsText(file);
    
    // Reset the input
    event.target.value = '';
  };

  const { filteredStudents, filteredRecords } = getFilteredData();
  const visitors = filteredRecords.filter(r => r.studentId === 'VISITOR');
  const regularAttendance = filteredRecords.filter(r => r.studentId !== 'VISITOR');

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2">Admin Data Management</h2>
        <p className="text-muted-foreground">Manage and export library data</p>
      </div>

      <ExportControls
        exportDateRange={exportDateRange}
        setExportDateRange={setExportDateRange}
        exportDepartment={exportDepartment}
        setExportDepartment={setExportDepartment}
        exportFormat={exportFormat}
        setExportFormat={setExportFormat}
        reportType={reportType}
        setReportType={setReportType}
        onExportData={handleExportData}
        previewCounts={{
          records: filteredRecords.length,
          students: filteredStudents.length
        }}
        customStartDate={customStartDate}
        setCustomStartDate={setCustomStartDate}
        customEndDate={customEndDate}
        setCustomEndDate={setCustomEndDate}
      />

      <ImportControls onImportData={handleImportData} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Bulk Student Import 2025
          </CardTitle>
          <CardDescription>
            Import 367 first-year students to Notre Dame Library
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={handleBulkImport} 
            disabled={isBulkImporting}
            className="w-full"
            size="lg"
          >
            {isBulkImporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing Students...
              </>
            ) : (
              <>
                <UserPlus className="mr-2 h-4 w-4" />
                Import 367 Students
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            IBED Senior High Bulk Import 2025
          </CardTitle>
          <CardDescription>
            Import Grade 12 students (ABM, HUMSS, STEM) to IBED Library
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={handleIBEDBulkImport} 
            disabled={isIBEDBulkImporting}
            className="w-full"
            size="lg"
          >
            {isIBEDBulkImporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing IBED Students...
              </>
            ) : (
              <>
                <UserPlus className="mr-2 h-4 w-4" />
                Import IBED Grade 12 Students
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            IBED Grade 11 Bulk Import 2025
          </CardTitle>
          <CardDescription>
            Import Grade 11 students (ABM, HUMSS, STEM) to IBED Library
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={handleIBEDGrade11Import} 
            disabled={isIBEDGrade11Importing}
            className="w-full"
            size="lg"
          >
            {isIBEDGrade11Importing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing Grade 11 Students...
              </>
            ) : (
              <>
                <UserPlus className="mr-2 h-4 w-4" />
                Import IBED Grade 11 Students
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {window.electronAPI && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Clean Duplicate Attendance
            </CardTitle>
            <CardDescription>
              Remove duplicate attendance records from SQLite database (Electron only)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={handleCleanDuplicates} 
              disabled={isCleaningDuplicates}
              variant="destructive"
              className="w-full"
              size="lg"
            >
              {isCleaningDuplicates ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cleaning Duplicates...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Remove Duplicate Records
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      <DataOverview
        students={filteredStudents}
        regularAttendance={regularAttendance}
        visitors={visitors}
      />
    </div>
  );
};

export default AdminDataManagement;
