export interface Revision {
  id: number;
  document_id: number;
  filename: string;
  version: number;
  created_at: string;
}

export interface Document {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
  revisions: Revision[];
}

export interface Annotation {
  id: string;
  path: string; // SVG path
  color: string;
  strokeWidth: number;
}
