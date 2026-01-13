import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DocumentLink } from '@/services/documentService';
import { format } from 'date-fns';
import ndkcLogo from '@/assets/ndkc-logo.png';

interface ThesisExportConfig {
  searchTerm?: string;
  educationFilter?: string;
  yearFilter?: string;
  courseFilter?: string;
  strandFilter?: string;
}

export const exportThesisToPDF = async (
  documents: DocumentLink[],
  config: ThesisExportConfig
) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Add NDKC Logo
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

  // Header
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('NOTRE DAME OF KIDAPAWAN COLLEGE', pageWidth / 2, 55, { align: 'center' });
  
  doc.setFontSize(14);
  doc.text('THESIS & RESEARCH DOCUMENTS', pageWidth / 2, 62, { align: 'center' });
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${format(new Date(), 'MMMM dd, yyyy hh:mm a')}`, pageWidth / 2, 68, { align: 'center' });

  // Filter information
  let yPosition = 78;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Applied Filters:', 14, yPosition);
  
  doc.setFont('helvetica', 'normal');
  yPosition += 5;
  
  if (config.searchTerm) {
    doc.text(`Search: "${config.searchTerm}"`, 14, yPosition);
    yPosition += 5;
  }
  if (config.educationFilter && config.educationFilter !== 'all') {
    const label = config.educationFilter === 'senior_high' ? 'Senior High' : 'College';
    doc.text(`Education Level: ${label}`, 14, yPosition);
    yPosition += 5;
  }
  if (config.yearFilter && config.yearFilter !== 'all') {
    doc.text(`Year: ${config.yearFilter}`, 14, yPosition);
    yPosition += 5;
  }
  if (config.courseFilter && config.courseFilter !== 'all') {
    doc.text(`Course: ${config.courseFilter}`, 14, yPosition);
    yPosition += 5;
  }
  if (config.strandFilter && config.strandFilter !== 'all') {
    doc.text(`Strand: ${config.strandFilter}`, 14, yPosition);
    yPosition += 5;
  }

  // Library Head info (right side)
  doc.setFont('helvetica', 'bold');
  doc.text('Sharon Jane M. Caños', pageWidth - 14, 78, { align: 'right' });
  doc.setFont('helvetica', 'italic');
  doc.text('OIC Director of Libraries', pageWidth - 14, 83, { align: 'right' });

  yPosition += 5;

  // Generate table
  const tableData = documents.map(doc => [
    doc.title.toUpperCase(),
    doc.description || 'N/A',
    doc.education_level === 'senior_high' ? 'Senior High' : 'College',
    doc.year_posted?.toString() || 'N/A',
    doc.course || doc.strand || 'N/A',
    doc.uploaded_by || 'N/A'
  ]);

  autoTable(doc, {
    startY: yPosition,
    head: [['Title', 'Description', 'Education Level', 'Year', 'Course/Strand', 'Uploaded By']],
    body: tableData,
    styles: { 
      fontSize: 8,
      cellPadding: 3,
    },
    headStyles: { 
      fillColor: [0, 102, 51], 
      textColor: 255,
      fontStyle: 'bold'
    },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    columnStyles: {
      0: { cellWidth: 50 }, // Title
      1: { cellWidth: 50 }, // Description
      2: { cellWidth: 25 }, // Education Level
      3: { cellWidth: 15 }, // Year
      4: { cellWidth: 25 }, // Course/Strand
      5: { cellWidth: 25 }, // Uploaded By
    },
  });

  // Footer with summary
  const finalY = (doc as any).lastAutoTable.finalY || yPosition + 50;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`Total Documents: ${documents.length}`, 14, finalY + 10);

  // Page numbers
  const pageCount = doc.getNumberOfPages();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth - 14,
      pageHeight - 10,
      { align: 'right' }
    );
  }

  // Save PDF
  const filename = `${format(new Date(), 'MMMM dd yyyy')} - Thesis Documents.pdf`;
  doc.save(filename);
};
