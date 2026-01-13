-- Add year_posted, course, and strand columns to document_links table
ALTER TABLE public.document_links
ADD COLUMN IF NOT EXISTS year_posted integer,
ADD COLUMN IF NOT EXISTS course text,
ADD COLUMN IF NOT EXISTS strand text;

-- Add index for better filtering performance
CREATE INDEX IF NOT EXISTS idx_document_links_year_posted ON public.document_links(year_posted);
CREATE INDEX IF NOT EXISTS idx_document_links_course ON public.document_links(course);
CREATE INDEX IF NOT EXISTS idx_document_links_strand ON public.document_links(strand);