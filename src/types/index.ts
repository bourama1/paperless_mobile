export interface Employee {
  id: number;
  name: string;
}

export interface EmployeeAdmin extends Employee {
  active: boolean;
}

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

export type CompletionStatus =
  | "complete"
  | "complete_with_changes"
  | "missing_product"
  | "shipped_incomplete";

export interface CompletionContext {
  order_id: string;
  workstation: string;
  cycle_index: number;
  total_cycles: number;
  product_order: string | null;
  sales_order: string | null;
}

export type CheckStatus = "ok" | "issue";

export interface CycleCheck {
  cycleIndex: number;
  checked: boolean;
  status: CheckStatus | null;
  employeeName: string | null;
  note: string | null;
  checkedAt: string | null;
  // Who completed this cycle at the completion kiosk (same workstation as
  // the document) — shown to the checker so they know who to ask.
  completedBy?: string | null;
  completedAt?: string | null;
}

export interface DocumentOverviewItem {
  // Null when this order reached a kiosk finishing state but its BOM was
  // never opened/imported in-app — see filesController.getDocumentsOverview.
  document_id: number | null;
  document_name: string | null;
  project_number: string | null;
  position: string | null;
  // The workplace the order was completed at (order_completion_log.workstation)
  // — used to import the BOM on demand when document_id is null.
  workstation: string | null;
  sales_order: string | null;
  document_type: number | null;
  created_at: string | null;
  updated_at: string | null;
  // When the kiosk operator actually finished this order — use this for
  // display, not created_at/updated_at (those only reflect if/when someone
  // happened to open the BOM in-app).
  completed_at: string;
  status: CompletionStatus | null;
  revisioned: boolean;
  revisions: RevisionOverview[];
  checked: boolean;
  checked_cycles: number;
  total_cycles: number;
  unchecked_cycles: number[];
}

export interface DocumentsOverviewResponse {
  items: DocumentOverviewItem[];
}

export interface ProductStat {
  productDesc: string;
  count: number;
}
