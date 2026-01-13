import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/components/ui/use-toast';
import { documentService, DocumentLink } from '@/services/documentService';
import { FileText, Plus, ExternalLink, Edit2, Trash2, Search, Download } from 'lucide-react';
import { format } from 'date-fns';

const ThesisDatabaseManager = () => {
  const [documents, setDocuments] = useState<DocumentLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [academicLevelFilter, setAcademicLevelFilter] = useState<string>('all');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [courseFilter, setCourseFilter] = useState<string>('all');
  const [strandFilter, setStrandFilter] = useState<string>('all');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState<DocumentLink | null>(null);
  
  const currentYear = new Date().getFullYear();
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    file_url: '',
    file_type: 'pdf',
    education_level: 'grade_11',
    uploaded_by: '',
    year_posted: currentYear,
    course: '',
    strand: 'ABM'
  });

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    try {
      setLoading(true);
      const data = await documentService.getDocuments();
      setDocuments(data);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load documents",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title || !formData.file_url) {
      toast({
        title: "Error",
        description: "Title and file URL are required",
        variant: "destructive",
      });
      return;
    }

    // Basic URL validation
    try {
      new URL(formData.file_url);
    } catch {
      toast({
        title: "Error",
        description: "Please enter a valid URL",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const documentData: any = {
        title: formData.title,
        description: formData.description,
        file_url: formData.file_url,
        file_type: formData.file_type,
        education_level: formData.education_level,
        uploaded_by: formData.uploaded_by,
        year_posted: formData.year_posted
      };

      // Add course or strand based on education level
      if (formData.education_level === 'college') {
        documentData.course = formData.course;
      } else {
        documentData.strand = formData.strand;
      }

      await documentService.addDocument(documentData);

      setFormData({
        title: '',
        description: '',
        file_url: '',
        file_type: 'pdf',
        education_level: 'grade_11',
        uploaded_by: '',
        year_posted: currentYear,
        course: '',
        strand: 'ABM'
      });

      toast({
        title: "Success",
        description: "Document added successfully",
      });

      setIsAddDialogOpen(false);
      loadDocuments();
    } catch (error) {
      console.error('Error adding document:', error);
      toast({
        title: "Error",
        description: "Failed to add document",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingDocument) return;

    try {
      await documentService.updateDocument(editingDocument.id, {
        title: editingDocument.title,
        description: editingDocument.description,
        file_url: editingDocument.file_url,
        file_type: editingDocument.file_type,
        education_level: editingDocument.education_level,
        uploaded_by: editingDocument.uploaded_by
      });

      toast({
        title: "Success",
        description: "Document updated successfully",
      });

      setEditingDocument(null);
      loadDocuments();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update document",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return;

    try {
      await documentService.deleteDocument(id);
      toast({
        title: "Success",
        description: "Document deleted successfully",
      });
      loadDocuments();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete document",
        variant: "destructive",
      });
    }
  };

  const getAcademicLevelLabel = (level: string) => {
    const labels: Record<string, string> = {
      'grade_11': 'SHS Grade 11',
      'grade_12': 'SHS Grade 12',
      'college': 'College Graduate',
      'general': 'General'
    };
    return labels[level] || level;
  };

  // Get unique years, courses, and strands
  const availableYears = Array.from(new Set(documents.map(doc => doc.year_posted).filter(Boolean))).sort((a, b) => (b as number) - (a as number));
  const availableCourses = Array.from(new Set(documents.filter(doc => doc.course).map(doc => doc.course)));
  const availableStrands = Array.from(new Set(documents.filter(doc => doc.strand).map(doc => doc.strand)));

  const filteredDocuments = documents
    .filter(doc =>
      (doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
       (doc.description?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
       (doc.uploaded_by?.toLowerCase() || '').includes(searchTerm.toLowerCase())) &&
      (academicLevelFilter === 'all' || doc.education_level === academicLevelFilter) &&
      (yearFilter === 'all' || doc.year_posted?.toString() === yearFilter) &&
      (courseFilter === 'all' || doc.course === courseFilter) &&
      (strandFilter === 'all' || doc.strand === strandFilter)
    );

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
        educationFilter: academicLevelFilter,
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

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <Card className="border-0 shadow-sm bg-white/60 backdrop-blur-sm">
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-primary" />
              <div>
                <CardTitle className="text-2xl">Thesis Database Management</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Manage thesis and research documents for SHS and College students
                </p>
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button 
                onClick={handleExportPDF}
                disabled={loading || filteredDocuments.length === 0}
                variant="outline"
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Export to PDF
              </Button>
              
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <Plus className="h-4 w-4" />
                    Add Document
                  </Button>
                </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Add New Document</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="title">Title *</Label>
                    <Input
                      id="title"
                      value={formData.title}
                      onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="Enter document title"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Enter document description"
                      rows={3}
                    />
                  </div>

                  <div>
                    <Label htmlFor="file_url">File URL *</Label>
                    <Input
                      id="file_url"
                      type="url"
                      value={formData.file_url}
                      onChange={(e) => setFormData(prev => ({ ...prev, file_url: e.target.value }))}
                      placeholder="https://example.com/document.pdf"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="file_type">File Type</Label>
                      <Select 
                        value={formData.file_type} 
                        onValueChange={(value) => setFormData(prev => ({ ...prev, file_type: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pdf">PDF</SelectItem>
                          <SelectItem value="doc">DOC</SelectItem>
                          <SelectItem value="docx">DOCX</SelectItem>
                          <SelectItem value="txt">TXT</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="education_level">Academic Level *</Label>
                      <Select 
                        value={formData.education_level} 
                        onValueChange={(value) => setFormData(prev => ({ 
                          ...prev, 
                          education_level: value,
                          course: value === 'college' ? 'CECE' : '',
                          strand: value !== 'college' ? 'ABM' : ''
                        }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="grade_11">SHS Grade 11</SelectItem>
                          <SelectItem value="grade_12">SHS Grade 12</SelectItem>
                          <SelectItem value="college">College Graduate</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="year_posted">Year Posted *</Label>
                      <Input
                        id="year_posted"
                        type="number"
                        min="1900"
                        max={currentYear + 1}
                        value={formData.year_posted}
                        onChange={(e) => setFormData(prev => ({ ...prev, year_posted: parseInt(e.target.value) || currentYear }))}
                        placeholder="2024"
                        required
                      />
                    </div>

                    {formData.education_level === 'college' ? (
                      <div>
                        <Label htmlFor="course">Course *</Label>
                        <Select 
                          value={formData.course} 
                          onValueChange={(value) => setFormData(prev => ({ ...prev, course: value }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="CECE">CECE (Civil & Computer Engineering)</SelectItem>
                            <SelectItem value="CTELAN">CTELAN (Teacher Education & Liberal Arts)</SelectItem>
                            <SelectItem value="CBA">CBA (Business Administration)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div>
                        <Label htmlFor="strand">Strand *</Label>
                        <Select 
                          value={formData.strand} 
                          onValueChange={(value) => setFormData(prev => ({ ...prev, strand: value }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ABM">ABM (Accountancy, Business & Management)</SelectItem>
                            <SelectItem value="STEM">STEM (Science, Technology, Engineering & Mathematics)</SelectItem>
                            <SelectItem value="HUMSS">HUMSS (Humanities & Social Sciences)</SelectItem>
                            <SelectItem value="GAS">GAS (General Academic Strand)</SelectItem>
                            <SelectItem value="TVL-ICT">TVL-ICT (Information & Communications Technology)</SelectItem>
                            <SelectItem value="TVL-HE">TVL-HE (Home Economics)</SelectItem>
                            <SelectItem value="TVL-IA">TVL-IA (Industrial Arts)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="uploaded_by">Uploaded By</Label>
                    <Input
                      id="uploaded_by"
                      value={formData.uploaded_by}
                      onChange={(e) => setFormData(prev => ({ ...prev, uploaded_by: e.target.value }))}
                      placeholder="Your name (optional)"
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={loading}>
                      {loading ? 'Adding...' : 'Add Document'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        </CardHeader>
      </Card>

      {/* Filters Section */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search documents..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            <div className="flex flex-wrap gap-2">
              <Select value={academicLevelFilter} onValueChange={setAcademicLevelFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Academic Level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Levels</SelectItem>
                  <SelectItem value="grade_11">SHS Grade 11</SelectItem>
                  <SelectItem value="grade_12">SHS Grade 12</SelectItem>
                  <SelectItem value="college">College Graduate</SelectItem>
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

              {academicLevelFilter === 'college' && (
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

              {(academicLevelFilter === 'grade_11' || academicLevelFilter === 'grade_12') && (
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
        </CardContent>
      </Card>

      {/* Documents List */}
      <Card>
        <CardContent className="pt-6">
          {loading && documents.length === 0 ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
              <p className="mt-4 text-muted-foreground">Loading documents...</p>
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No documents found</h3>
              <p className="text-muted-foreground">
                {searchTerm || academicLevelFilter !== 'all' 
                  ? 'Try adjusting your filters' 
                  : 'Get started by adding your first document'}
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[600px]">
              <div className="space-y-4 pr-4">
                {filteredDocuments.map((doc) => (
                  <div key={doc.id} className="p-4 bg-muted/30 rounded-lg border hover:border-primary/50 transition-colors">
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-3 mb-2">
                          <FileText className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-lg truncate">{doc.title}</h3>
                            {doc.description && (
                              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                {doc.description}
                              </p>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex flex-wrap gap-2 mt-3">
                          <Badge variant="secondary">
                            {getAcademicLevelLabel(doc.education_level)}
                          </Badge>
                          {doc.course && <Badge variant="outline">Course: {doc.course}</Badge>}
                          {doc.strand && <Badge variant="outline">Strand: {doc.strand}</Badge>}
                          {doc.year_posted && <Badge variant="outline">Year: {doc.year_posted}</Badge>}
                          <Badge variant="outline">{doc.file_type.toUpperCase()}</Badge>
                          {doc.uploaded_by && (
                            <Badge variant="outline">By: {doc.uploaded_by}</Badge>
                          )}
                          <Badge variant="outline" className="text-xs">
                            {format(new Date(doc.created_at), 'MMM dd, yyyy')}
                          </Badge>
                        </div>
                      </div>

                      <div className="flex gap-2 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(doc.file_url, '_blank')}
                          title="Open document"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingDocument(doc)}
                          title="Edit document"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(doc.id)}
                          title="Delete document"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingDocument} onOpenChange={(open) => !open && setEditingDocument(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Document</DialogTitle>
          </DialogHeader>
          {editingDocument && (
            <div className="space-y-4">
              <div>
                <Label>Title *</Label>
                <Input
                  value={editingDocument.title}
                  onChange={(e) => setEditingDocument({ ...editingDocument, title: e.target.value })}
                />
              </div>

              <div>
                <Label>Description</Label>
                <Textarea
                  value={editingDocument.description || ''}
                  onChange={(e) => setEditingDocument({ ...editingDocument, description: e.target.value })}
                  rows={3}
                />
              </div>

              <div>
                <Label>File URL *</Label>
                <Input
                  type="url"
                  value={editingDocument.file_url}
                  onChange={(e) => setEditingDocument({ ...editingDocument, file_url: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>File Type</Label>
                  <Select 
                    value={editingDocument.file_type} 
                    onValueChange={(value) => setEditingDocument({ ...editingDocument, file_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pdf">PDF</SelectItem>
                      <SelectItem value="doc">DOC</SelectItem>
                      <SelectItem value="docx">DOCX</SelectItem>
                      <SelectItem value="txt">TXT</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Academic Level *</Label>
                  <Select 
                    value={editingDocument.education_level} 
                    onValueChange={(value) => setEditingDocument({ ...editingDocument, education_level: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="grade_11">SHS Grade 11</SelectItem>
                      <SelectItem value="grade_12">SHS Grade 12</SelectItem>
                      <SelectItem value="college">College Graduate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Uploaded By</Label>
                <Input
                  value={editingDocument.uploaded_by || ''}
                  onChange={(e) => setEditingDocument({ ...editingDocument, uploaded_by: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditingDocument(null)}>
                  Cancel
                </Button>
                <Button onClick={handleUpdate}>
                  Update Document
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ThesisDatabaseManager;
