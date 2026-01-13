
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Download, CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface ExportControlsProps {
  exportDateRange: string;
  setExportDateRange: (value: string) => void;
  exportDepartment: string;
  setExportDepartment: (value: string) => void;
  exportFormat: string;
  setExportFormat: (value: string) => void;
  reportType: string;
  setReportType: (value: string) => void;
  onExportData: () => void;
  previewCounts: {
    records: number;
    students: number;
  };
  customStartDate?: Date;
  setCustomStartDate?: (date: Date | undefined) => void;
  customEndDate?: Date;
  setCustomEndDate?: (date: Date | undefined) => void;
}

const DATE_RANGES = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'year', label: 'This Year' },
  { value: 'custom', label: 'Custom Range' },
];

const DEPARTMENTS = [
  { value: 'All Departments', label: 'All Departments' }, 
  { value: 'CECE', label: 'CECE' }, 
  { value: 'CBA', label: 'CBA' }, 
  { value: 'CTELAN', label: 'CTELAN' }
];

const EXPORT_FORMATS = [
  { value: 'csv', label: 'CSV' },
  { value: 'pdf', label: 'PDF' },
  { value: 'json', label: 'JSON' },
  { value: 'svd', label: 'SVD' },
];

const REPORT_TYPES = [
  { value: 'attendance', label: 'Attendance Report' },
  { value: 'time-spent', label: 'Time Spent' },
];

const ExportControls = ({
  exportDateRange,
  setExportDateRange,
  exportDepartment,
  setExportDepartment,
  exportFormat,
  setExportFormat,
  reportType,
  setReportType,
  onExportData,
  previewCounts,
  customStartDate,
  setCustomStartDate,
  customEndDate,
  setCustomEndDate
}: ExportControlsProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="h-5 w-5" />
          Data Export
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Report Type</label>
            <Select value={reportType} onValueChange={setReportType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REPORT_TYPES.map(type => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Time Period</label>
            <Select value={exportDateRange} onValueChange={setExportDateRange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_RANGES.map(range => (
                  <SelectItem key={range.value} value={range.value}>
                    {range.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <label className="text-sm font-medium mb-2 block">Department Filter</label>
            <Select value={exportDepartment} onValueChange={setExportDepartment}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEPARTMENTS.map(department => (
                  <SelectItem key={department.value} value={department.value}>
                    {department.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Export Format</label>
            <Select value={exportFormat} onValueChange={setExportFormat}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPORT_FORMATS.map(format => (
                  <SelectItem key={format.value} value={format.value}>
                    {format.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end">
            <Button onClick={onExportData} className="w-full">
              <Download className="h-4 w-4 mr-2" />
              Export Data
            </Button>
          </div>
        </div>

        {/* Custom Date Range Pickers */}
        {exportDateRange === 'custom' && setCustomStartDate && setCustomEndDate && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t">
            <div>
              <label className="text-sm font-medium mb-2 block">Start Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !customStartDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {customStartDate ? format(customStartDate, "MMM dd, yyyy") : "Select start date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={customStartDate}
                    onSelect={setCustomStartDate}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">End Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !customEndDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {customEndDate ? format(customEndDate, "MMM dd, yyyy") : "Select end date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={customEndDate}
                    onSelect={setCustomEndDate}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        )}
        
        <div className="text-sm text-muted-foreground space-y-1">
          <p>
            {reportType === 'time-spent' 
              ? `Will export time spent data for ${previewCounts.students} students as ${exportFormat.toUpperCase()}`
              : `Will export: ${previewCounts.records} records, ${previewCounts.students} students as ${exportFormat.toUpperCase()}`
            }
          </p>
          <p className="text-xs italic opacity-75">
            * Preview based on cached data (last 30 days). Export will fetch full date range from database.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default ExportControls;
