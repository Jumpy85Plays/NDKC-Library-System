import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Student } from '@/types/Student';
import { AttendanceEntry } from '@/types/AttendanceEntry';
import { format, startOfDay, startOfWeek, startOfMonth, startOfYear } from 'date-fns';
import ndkcLogo from '@/assets/ndkc-logo.png';

interface ExportConfig {
  reportType: string;
  timePeriod: string;
  studentType?: string;
  yearLevel?: string;
  course?: string;
  department?: string;
  customStartDate?: Date;
  customEndDate?: Date;
}

interface CategorySummaryConfig {
  timePeriod: string;
  customStartDate?: Date;
  customEndDate?: Date;
}

// Calculate time spent for each student
export const calculateTimeSpent = (
  students: Student[],
  attendanceRecords: AttendanceEntry[]
): Array<{ studentId: string; name: string; course: string; totalMinutes: number; totalHours: string }> => {
  const timeSpentMap = new Map<string, number>();
  const studentInfoMap = new Map<string, { name: string; course: string }>();

  // Build student info map
  students.forEach(student => {
    studentInfoMap.set(student.studentId, {
      name: student.name,
      course: student.course || student.department || 'N/A'
    });
  });

  // Sort records by timestamp
  const sortedRecords = [...attendanceRecords].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // Track check-ins for each student
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

  // Convert to array and format
  const results: Array<{ studentId: string; name: string; course: string; totalMinutes: number; totalHours: string }> = [];
  
  timeSpentMap.forEach((minutes, studentId) => {
    const info = studentInfoMap.get(studentId);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = Math.round(minutes % 60);
    
    results.push({
      studentId,
      name: info?.name || 'Unknown',
      course: info?.course || 'N/A',
      totalMinutes: Math.round(minutes),
      totalHours: `${hours}h ${remainingMinutes}m`
    });
  });

  return results.sort((a, b) => b.totalMinutes - a.totalMinutes);
};

// Format time period as date range
const formatTimePeriodAsDateRange = (timePeriod: string, customStartDate?: Date, customEndDate?: Date): string => {
  const now = new Date();
  
  switch (timePeriod.toLowerCase()) {
    case 'today':
      return format(now, 'MMMM dd, yyyy');
    case 'week': {
      const weekStart = startOfWeek(now);
      return `${format(weekStart, 'MMM dd')} - ${format(now, 'MMM dd, yyyy')}`;
    }
    case 'month': {
      const monthStart = startOfMonth(now);
      return `${format(monthStart, 'MMM dd')} - ${format(now, 'MMM dd, yyyy')}`;
    }
    case 'year': {
      const yearStart = startOfYear(now);
      return `${format(yearStart, 'MMM dd')} - ${format(now, 'MMM dd, yyyy')}`;
    }
    case 'custom': {
      if (customStartDate && customEndDate) {
        return `${format(customStartDate, 'MMM dd')} - ${format(customEndDate, 'MMM dd, yyyy')}`;
      }
      return 'Custom Range';
    }
    default:
      return timePeriod;
  }
};

// Draw a pie chart on canvas and return as base64 image
const drawPieChart = (
  data: Array<{ label: string; value: number; color: string }>,
  title: string,
  width: number = 400,
  height: number = 300
): string => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const centerX = width / 2;
  const centerY = height / 2 + 20;
  const radius = Math.min(width, height) / 2 - 60;
  
  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  
  // Draw title
  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 16px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(title, centerX, 25);

  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (total === 0) {
    ctx.fillStyle = '#666666';
    ctx.font = '14px Arial';
    ctx.fillText('No data available', centerX, centerY);
    return canvas.toDataURL('image/png');
  }

  let startAngle = -Math.PI / 2; // Start from top

  data.forEach((item, index) => {
    const sliceAngle = (item.value / total) * 2 * Math.PI;
    
    // Draw slice
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
    ctx.closePath();
    ctx.fillStyle = item.color;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw label on slice
    const midAngle = startAngle + sliceAngle / 2;
    const labelRadius = radius * 0.65;
    const labelX = centerX + Math.cos(midAngle) * labelRadius;
    const labelY = centerY + Math.sin(midAngle) * labelRadius;
    
    const percentage = ((item.value / total) * 100).toFixed(1);
    if (parseFloat(percentage) > 5) { // Only show label if slice is big enough
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`${percentage}%`, labelX, labelY);
    }

    startAngle += sliceAngle;
  });

  // Draw legend
  const legendStartY = height - 35;
  const legendItemWidth = width / Math.min(data.length, 4);
  
  data.forEach((item, index) => {
    const col = index % 4;
    const row = Math.floor(index / 4);
    const x = 20 + col * legendItemWidth;
    const y = legendStartY + row * 18;
    
    // Color box
    ctx.fillStyle = item.color;
    ctx.fillRect(x, y - 10, 12, 12);
    
    // Label
    ctx.fillStyle = '#1a1a1a';
    ctx.font = '10px Arial';
    ctx.textAlign = 'left';
    const displayLabel = item.label.length > 12 ? item.label.substring(0, 12) + '...' : item.label;
    ctx.fillText(`${displayLabel}: ${item.value.toLocaleString()}`, x + 16, y);
  });

  return canvas.toDataURL('image/png');
};

// Category colors
const CATEGORY_COLORS = {
  'Grade 11': '#6366F1', // Indigo
  'Grade 12': '#22C55E', // Green
  'CECE': '#3B82F6',     // Blue
  'CBA': '#F59E0B',      // Amber
  'CTELAN': '#EF4444',   // Red
  'CHS': '#8B5CF6',      // Purple
  'Other': '#06B6D4',    // Cyan
};

const getDepartmentColor = (dept: string, index: number): string => {
  const colors = ['#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#10B981', '#F97316', '#EC4899', '#6366F1', '#84CC16'];
  return colors[index % colors.length];
};

// Export Category Summary to PDF with charts
export const exportCategorySummaryToPDF = async (
  attendanceRecords: AttendanceEntry[],
  config: CategorySummaryConfig
) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Load and add logo
  try {
    const response = await fetch(ndkcLogo);
    const blob = await response.blob();
    const logoBase64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
    
    doc.addImage(logoBase64, 'PNG', pageWidth / 2 - 20, 10, 40, 40);
  } catch (error) {
    console.error('Error loading logo:', error);
  }

  // Add header text
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('NOTRE DAME OF KIDAPAWAN COLLEGE', pageWidth / 2, 55, { align: 'center' });
  
  doc.setFontSize(14);
  doc.text('LIBRARY ATTENDANCE SYSTEM', pageWidth / 2, 62, { align: 'center' });
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('CATEGORY SUMMARY REPORT', pageWidth / 2, 70, { align: 'center' });
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${format(new Date(), 'MMMM dd, yyyy hh:mm a')}`, pageWidth / 2, 76, { align: 'center' });

  // Add filter information
  let yPosition = 86;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Report Filters:', 14, yPosition);
  
  doc.setFont('helvetica', 'normal');
  doc.text(`Time Period: ${formatTimePeriodAsDateRange(config.timePeriod, config.customStartDate, config.customEndDate)}`, 14, yPosition + 5);

  // Library Head (right side)
  doc.setFont('helvetica', 'bold');
  doc.text('Sharon Jane M. Caños', pageWidth - 14, yPosition, { align: 'right' });
  doc.setFont('helvetica', 'italic');
  doc.text('OIC Director of Libraries', pageWidth - 14, yPosition + 5, { align: 'right' });

  yPosition += 15;

  // Calculate Senior High counts (IBED students)
  const seniorHighRecords = attendanceRecords.filter(r => 
    r.studentType === 'ibed' && r.type === 'check-in'
  );
  const grade11Count = seniorHighRecords.filter(r => 
    r.year?.toLowerCase().includes('11') || r.year === 'Grade 11'
  ).length;
  const grade12Count = seniorHighRecords.filter(r => 
    r.year?.toLowerCase().includes('12') || r.year === 'Grade 12'
  ).length;
  const otherSHSCount = seniorHighRecords.length - grade11Count - grade12Count;

  // Calculate College counts by department
  const collegeRecords = attendanceRecords.filter(r => 
    r.studentType === 'college' && r.type === 'check-in'
  );
  const collegeDeptCounts: Record<string, number> = {};
  collegeRecords.forEach(r => {
    const dept = (r.course || 'Other').toUpperCase();
    collegeDeptCounts[dept] = (collegeDeptCounts[dept] || 0) + 1;
  });

  // Sort departments by count descending
  const sortedDepts = Object.entries(collegeDeptCounts)
    .sort((a, b) => b[1] - a[1]);

  // Senior High Table
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('SENIOR HIGH SCHOOL (IBED)', 14, yPosition);
  yPosition += 3;

  const seniorHighData = [
    ['Grade 11', grade11Count.toLocaleString()],
    ['Grade 12', grade12Count.toLocaleString()],
  ];
  if (otherSHSCount > 0) {
    seniorHighData.push(['Other SHS', otherSHSCount.toLocaleString()]);
  }
  const shsSubtotal = grade11Count + grade12Count + otherSHSCount;
  seniorHighData.push(['SUBTOTAL', shsSubtotal.toLocaleString()]);

  autoTable(doc, {
    startY: yPosition,
    head: [['Level', 'Count']],
    body: seniorHighData,
    styles: { fontSize: 10, halign: 'left' },
    headStyles: { fillColor: [0, 102, 51], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 100 },
      1: { cellWidth: 60, halign: 'right' },
    },
    didParseCell: (data) => {
      if (data.row.index === seniorHighData.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [220, 220, 220];
      }
    },
  });

  yPosition = (doc as any).lastAutoTable.finalY + 10;

  // College Table
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('COLLEGE DEPARTMENTS', 14, yPosition);
  yPosition += 3;

  const collegeData = sortedDepts.map(([dept, count]) => [
    `${dept} Students`,
    count.toLocaleString()
  ]);
  const collegeSubtotal = sortedDepts.reduce((sum, [, count]) => sum + count, 0);
  collegeData.push(['SUBTOTAL', collegeSubtotal.toLocaleString()]);

  autoTable(doc, {
    startY: yPosition,
    head: [['Department', 'Count']],
    body: collegeData,
    styles: { fontSize: 10, halign: 'left' },
    headStyles: { fillColor: [0, 102, 51], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 100 },
      1: { cellWidth: 60, halign: 'right' },
    },
    didParseCell: (data) => {
      if (data.row.index === collegeData.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [220, 220, 220];
      }
    },
  });

  yPosition = (doc as any).lastAutoTable.finalY + 10;

  // Grand Total
  const grandTotal = shsSubtotal + collegeSubtotal;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setFillColor(0, 102, 51);
  doc.rect(14, yPosition, pageWidth - 28, 12, 'F');
  doc.setTextColor(255, 255, 255);
  doc.text('GRAND TOTAL', 20, yPosition + 8);
  doc.text(grandTotal.toLocaleString(), pageWidth - 20, yPosition + 8, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  // New page for charts
  doc.addPage();
  
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('VISUAL ANALYTICS', pageWidth / 2, 20, { align: 'center' });

  // Senior High Pie Chart
  const shsChartData = [
    { label: 'Grade 11', value: grade11Count, color: '#6366F1' },
    { label: 'Grade 12', value: grade12Count, color: '#22C55E' },
  ];
  if (otherSHSCount > 0) {
    shsChartData.push({ label: 'Other', value: otherSHSCount, color: '#94A3B8' });
  }
  
  const shsChartImage = drawPieChart(shsChartData, 'Senior High School Distribution', 380, 280);
  if (shsChartImage) {
    doc.addImage(shsChartImage, 'PNG', 15, 30, 90, 70);
  }

  // College Pie Chart
  const collegeChartData = sortedDepts.slice(0, 8).map(([dept, count], index) => ({
    label: dept,
    value: count,
    color: getDepartmentColor(dept, index)
  }));
  
  // Group remaining as "Others" if more than 8 departments
  if (sortedDepts.length > 8) {
    const othersCount = sortedDepts.slice(8).reduce((sum, [, count]) => sum + count, 0);
    collegeChartData.push({ label: 'Others', value: othersCount, color: '#94A3B8' });
  }
  
  const collegeChartImage = drawPieChart(collegeChartData, 'College Department Distribution', 380, 280);
  if (collegeChartImage) {
    doc.addImage(collegeChartImage, 'PNG', 105, 30, 90, 70);
  }

  // Summary stats
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  let statsY = 115;
  
  doc.setFont('helvetica', 'bold');
  doc.text('Summary Statistics:', 14, statsY);
  doc.setFont('helvetica', 'normal');
  statsY += 7;
  doc.text(`• Total Senior High Entries: ${shsSubtotal.toLocaleString()}`, 20, statsY);
  statsY += 5;
  doc.text(`• Total College Entries: ${collegeSubtotal.toLocaleString()}`, 20, statsY);
  statsY += 5;
  doc.text(`• Combined Total: ${grandTotal.toLocaleString()}`, 20, statsY);
  statsY += 5;
  
  if (sortedDepts.length > 0) {
    doc.text(`• Most Active Department: ${sortedDepts[0][0]} (${sortedDepts[0][1].toLocaleString()} entries)`, 20, statsY);
  }

  // Add page numbers to all pages
  const pageCount = doc.getNumberOfPages();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
  }

  // Save the PDF
  const filename = `${format(new Date(), 'MMMM dd yyyy')} - Category Summary Report.pdf`;
  doc.save(filename);
};

export const exportToPDF = async (
  students: Student[],
  attendanceRecords: AttendanceEntry[],
  config: ExportConfig
) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Load and add logo
  try {
    const response = await fetch(ndkcLogo);
    const blob = await response.blob();
    const logoBase64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
    
    // Add logo centered at top
    doc.addImage(logoBase64, 'PNG', pageWidth / 2 - 20, 10, 40, 40);
  } catch (error) {
    console.error('Error loading logo:', error);
  }

  // Add header text
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('NOTRE DAME OF KIDAPAWAN COLLEGE', pageWidth / 2, 55, { align: 'center' });
  
  doc.setFontSize(14);
  doc.text('LIBRARY ATTENDANCE SYSTEM', pageWidth / 2, 62, { align: 'center' });
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${format(new Date(), 'MMMM dd, yyyy hh:mm a')}`, pageWidth / 2, 68, { align: 'center' });

  // Add filter information and library head name side by side
  let yPosition = 78;
  // Left side - Report Filters
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Report Filters:', 14, yPosition);
  
  doc.setFont('helvetica', 'normal');
  let leftYPosition = yPosition + 5;
  doc.text(`Report Type: ${config.reportType}`, 14, leftYPosition);
  leftYPosition += 5;
  doc.text(`Time Period: ${formatTimePeriodAsDateRange(config.timePeriod, config.customStartDate, config.customEndDate)}`, 14, leftYPosition);
  
  if (config.studentType) {
    leftYPosition += 5;
    doc.text(`Student Type: ${config.studentType}`, 14, leftYPosition);
  }
  if (config.yearLevel) {
    leftYPosition += 5;
    doc.text(`Year Level: ${config.yearLevel}`, 14, leftYPosition);
  }
  if (config.course) {
    leftYPosition += 5;
    doc.text(`Course: ${config.course}`, 14, leftYPosition);
  }
  if (config.department) {
    leftYPosition += 5;
    doc.text(`Department: ${config.department}`, 14, leftYPosition);
  }

  // Right side - Library Head
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Sharon Jane M. Caños', pageWidth - 14, yPosition, { align: 'right' });
  doc.setFont('helvetica', 'italic');
  doc.text('OIC Director of Libraries', pageWidth - 14, yPosition + 5, { align: 'right' });

  yPosition = Math.max(leftYPosition, yPosition + 5) + 10;

  // Generate table based on report type
  if (config.reportType === 'Time Spent') {
    const timeSpentData = calculateTimeSpent(students, attendanceRecords);
    
    autoTable(doc, {
      startY: yPosition,
      head: [['Name', 'Course', 'Total Time']],
      body: timeSpentData.map(row => [
        row.name.toUpperCase(),
        row.course,
        row.totalHours
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [0, 102, 51], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 245, 245] },
    });
  } else {
    // Attendance Report (Method column removed for better spacing)
    const tableData = attendanceRecords.map(record => [
      record.studentName.toUpperCase(),
      record.type,
      format(new Date(record.timestamp), 'MMM dd, yyyy hh:mm a'),
      record.course || 'N/A'
    ]);

    autoTable(doc, {
      startY: yPosition,
      head: [['Name', 'Type', 'Timestamp', 'Course']],
      body: tableData,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [0, 102, 51], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      columnStyles: {
        0: { cellWidth: 65 },  // Name - wider
        1: { cellWidth: 25 },  // Type
        2: { cellWidth: 55 },  // Timestamp
        3: { cellWidth: 35 },  // Course
      },
    });
  }

  // Add footer with summary
  const finalY = (doc as any).lastAutoTable.finalY || yPosition + 50;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`Total Records: ${config.reportType === 'Time Spent' ? calculateTimeSpent(students, attendanceRecords).length : attendanceRecords.length}`, 14, finalY + 10);

  // Add page numbers to all pages
  const addPageNumbers = () => {
    const pageCount = doc.getNumberOfPages();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(
        `Page ${i}`,
        pageWidth - 14,
        pageHeight - 10,
        { align: 'right' }
      );
    }
  };

  addPageNumbers();

  // Save the PDF with cleaner filename
  const filename = `${format(new Date(), 'MMMM dd yyyy')} - ${config.reportType} Report.pdf`;
  doc.save(filename);
};
