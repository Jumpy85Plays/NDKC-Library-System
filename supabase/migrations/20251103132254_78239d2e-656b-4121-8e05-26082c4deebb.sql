-- Add strand column to students table for IBED senior high students
ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS strand TEXT;