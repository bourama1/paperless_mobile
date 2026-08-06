export interface Revision {
  id: number;
  document_id: number;
  filename: string;
  version: number;
  annotations?: string; // JSON string of SVG paths
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

export interface WorkstationOrder {
  _id: string;
  position: string;
  productOrder: string;
  projectNumber: string;
  salesOrder: string;
  schedule: string;
  type: string;
  createdAt: string;
  customer: string;
  customerDesc: string;
  filename: string;
  maxCycle: number;
  productDesc: string;
  quantity: number;
  updatedAt: string;
  workplace: string;
}

export interface Workstation {
  id: number;
  name: string;
  current_order_id: string | null;
  current_order_data: WorkstationOrder | null;
  is_active: number;
  last_polled_at: string | null;
  cycle_index: number | null;
  total_cycles: number | null;
}

export interface RevisionOverview {
  id: number;
  filename: string;
  version: number;
  created_at: string;
  has_annotations: boolean;
  is_edited: boolean;
}

export type CompletionStatus = "complete" | "missing_product" | "shipped_incomplete";

export interface CompletionContext {
  order_id: string;
  workstation: string;
  cycle_index: number;
  total_cycles: number;
  product_order: string | null;
  sales_order: string | null;
}

export interface DocumentOverviewItem {
  document_id: number;
  document_name: string;
  project_number: string | null;
  position: string | null;
  document_type: number | null;
  created_at: string;
  updated_at: string;
  status: CompletionStatus | null;
  revisioned: boolean;
  revisions: RevisionOverview[];
}

export interface DocumentsOverviewResponse {
  items: DocumentOverviewItem[];
}
