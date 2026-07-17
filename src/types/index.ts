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
}

export interface RevisionOverview {
  id: number;
  filename: string;
  version: number;
  created_at: string;
  has_annotations: boolean;
}

export interface RevisionOverviewItem {
  document_id: number;
  document_name: string;
  updated_at: string;
  revisions: RevisionOverview[];
}

export interface RevisionsResponse {
  date: string;
  items: RevisionOverviewItem[];
}
