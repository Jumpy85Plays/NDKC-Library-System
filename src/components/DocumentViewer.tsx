
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/use-toast';
import { documentService, DocumentLink } from '@/services/documentService';
import { Link, FileText, ExternalLink, Search, Filter, Download } from 'lucide-react';
import { format } from 'date-fns';

interface DocumentViewerProps {
  refreshTrigger: number;
}

const DocumentViewer = ({ refreshTrigger }: DocumentViewerProps) => {
  const [documents, setDocuments] = useState<DocumentLink[]>([]);
  const [filteredDocuments, setFilteredDocuments] = useState<DocumentLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [educationFilter, setEducationFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [courseFilter, setCourseFilter] = useState('all');
  const [strandFilter, setStrandFilter] = useState('all');

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const data = await documentService.getDocuments();
      setDocuments(data);
      setFilteredDocuments(data);
    } catch (error) {
      console.error('Error loading documents:', error);
      toast({
        title: "Error",
        description: "Failed to load documents",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, [refreshTrigger]);

  useEffect(() => {
    let filtered = documents;

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(doc => 
        doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (doc.description && doc.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (doc.uploaded_by && doc.uploaded_by.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    // Apply education level filter
    if (educationFilter !== 'all') {
      filtered = filtered.filter(doc => doc.education_level === educationFilter);
    }

    // Apply year filter
    if (yearFilter !== 'all') {
      filtered = filtered.filter(doc => doc.year_posted?.toString() === yearFilter);
    }

    // Apply course filter (for college)
    if (courseFilter !== 'all') {
      filtered = filtered.filter(doc => doc.course === courseFilter);
    }

    // Apply strand filter (for SHS)
    if (strandFilter !== 'all') {
      filtered = filtered.filter(doc => doc.strand === strandFilter);
    }

    setFilteredDocuments(filtered);
  }, [documents, searchTerm, educationFilter, yearFilter, courseFilter, strandFilter]);

  // Get unique years from documents
  const availableYears = Array.from(new Set(documents.map(doc => doc.year_posted).filter(Boolean))).sort((a, b) => (b as number) - (a as number));
  
  // Get unique courses and strands
  const availableCourses = Array.from(new Set(documents.filter(doc => doc.course).map(doc => doc.course)));
  const availableStrands = Array.from(new Set(documents.filter(doc => doc.strand).map(doc => doc.strand)));

  const handleExportPDF = async () => {
    if (filteredDocuments.length === 0) {
      toast({
        title: "No Data",
        description: "No documents to export with current filters",
        variant: "destructive",
      });
      return;
    }

    try {
      const { exportThesisToPDF } = await import('@/utils/thesisPdfExport');
      await exportThesisToPDF(filteredDocuments, {
        searchTerm,
        educationFilter,
        yearFilter,
        courseFilter,
        strandFilter
      });
      
      toast({
        title: "Export Complete",
        description: `Exported ${filteredDocuments.length} documents to PDF`,
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "Export Failed",
        description: "Failed to export documents to PDF",
        variant: "destructive",
      });
    }
  };

  const getFileTypeIcon = (type: string) => {
    switch (type) {
      case 'pdf':
        return <FileText className="h-4 w-4 text-red-500" />;
      default:
        return <FileText className="h-4 w-4 text-blue-500" />;
    }
  };

  const getEducationLevelBadge = (level: string) => {
    const colors = {
      senior_high: 'bg-blue-100 text-blue-800',
      college: 'bg-green-100 text-green-800'
    };
    const labels = {
      senior_high: 'Senior High',
      college: 'College'
    };
    
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[level as keyof typeof colors] || 'bg-gray-100 text-gray-800'}`}>
        {labels[level as keyof typeof labels] || level}
      </span>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Link className="h-5 w-5" />
            Document Links ({filteredDocuments.length})
          </CardTitle>
          <Button 
            onClick={handleExportPDF}
            disabled={loading || filteredDocuments.length === 0}
            className="flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            Export to PDF
          </Button>
        </div>
        
        {/* Search and Filter Controls */}
        <div className="flex flex-col gap-4 mt-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search documents..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            
            <Select value={educationFilter} onValueChange={setEducationFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="senior_high">Senior High</SelectItem>
                <SelectItem value="college">College</SelectItem>
              </SelectContent>
            </Select>

            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Years</SelectItem>
                {availableYears.map(year => (
                  <SelectItem key={year} value={year?.toString() || ''}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {educationFilter === 'college' && (
              <Select value={courseFilter} onValueChange={setCourseFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Course" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Courses</SelectItem>
                  {availableCourses.map(course => (
                    <SelectItem key={course} value={course || ''}>{course}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {educationFilter === 'senior_high' && (
              <Select value={strandFilter} onValueChange={setStrandFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Strand" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Strands</SelectItem>
                  {availableStrands.map(strand => (
                    <SelectItem key={strand} value={strand || ''}>{strand}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {loading ? (
          <p className="text-muted-foreground text-center py-8">Loading documents...</p>
        ) : filteredDocuments.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            {documents.length === 0 
              ? "No documents found. Upload your first document to get started."
              : "No documents match your search criteria."
            }
          </p>
        ) : (
          <div className="max-h-96 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Course/Strand</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Uploaded By</TableHead>
                  <TableHead>Uploaded On</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDocuments.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getFileTypeIcon(doc.file_type)}
                        <span className="text-xs uppercase">{doc.file_type}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium max-w-xs">
                      <div className="truncate" title={doc.title}>
                        {doc.title}
                      </div>
                    </TableCell>
                    <TableCell>
                      {getEducationLevelBadge(doc.education_level)}
                    </TableCell>
                    <TableCell>
                      {doc.course || doc.strand || '-'}
                    </TableCell>
                    <TableCell>
                      {doc.year_posted || '-'}
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <div className="truncate" title={doc.description || 'No description'}>
                        {doc.description || 'No description'}
                      </div>
                    </TableCell>
                    <TableCell>{doc.uploaded_by || 'Anonymous'}</TableCell>
                    <TableCell>
                      {format(new Date(doc.uploaded_at || doc.created_at), 'MMM dd, yyyy')}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(doc.file_url, '_blank')}
                          title="Open document"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DocumentViewer;
