export interface TriggeredRule {
  rule_id: string;
  rule_name: string;
  category: string;
  weight: number;
  matched_phrases: string[];
  explanation: string;
}

export interface AnalysisResult {
  id?: number;
  risk_score: number;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  model_available: boolean;
  model_signal?: number | null;
  model_score?: number | null;
  model_version?: string | null;
  model_class?: 'safe' | 'suspicious' | string | null;
  model_tokens?: Array<{ token: string; contribution: number; type: string }>;
  explanation: string;
  recommended_review_action: string;
  triggered_rules?: TriggeredRule[];
  matched_rules?: any[];
  suspicious_phrases?: string[];
  is_duplicate?: boolean;
  duplicate_of_id?: string | null;
  near_duplicate_matches?: Array<{
    advertisement_id: number;
    custom_id: string;
    similarity_score: number;
    preview: string;
    review_status: string;
  }>;
}

export interface ExtractedEntity {
  id?: number;
  entity_type: 'PHONE' | 'TELEGRAM' | 'WHATSAPP' | 'URL_DOMAIN' | 'CRYPTO' | 'EMAIL' | 'UPI' | string;
  entity_value: string;
  normalized_value: string;
}

export interface EvidenceItem {
  id?: number;
  evidence_type: string;
  matched_text: string;
  description: string;
  source_location?: string;
  created_at?: string;
}

export interface EntityChip {
  entity_type: string;
  entity_value: string;
  normalized_value?: string;
}

export interface AdvertisementSummary {
  id: number;
  custom_id?: string;
  original_text: string;
  source_type: string;
  submitted_url?: string | null;
  risk_score?: number | null;
  risk_level?: 'LOW' | 'MEDIUM' | 'HIGH' | string | null;
  review_status: 'NEW' | 'NEEDS_REVIEW' | 'UNDER_INVESTIGATION' | 'ESCALATED' | 'CLOSED' | 'FALSE_POSITIVE' | 'UNDER_REVIEW' | 'CONFIRMED_FRAUD' | 'BENIGN' | string;
  platform?: string;
  platform_detected?: string;
  is_demo?: boolean;
  data_source?: string;
  raw_metadata?: string | null;
  advertiser_name?: string | null;
  external_id?: string | null;
  top_entities?: EntityChip[];
  created_at: string;
  entities_count: number;
  cases_count: number;
}

export interface ReplayStatus {
  status: 'IDLE' | 'RUNNING' | 'PAUSED' | 'STOPPED' | 'COMPLETED' | string;
  source: 'both' | 'json' | 'csv' | string;
  interval_seconds: number;
  total_records: number;
  published_count: number;
  remaining_count: number;
  current_index: number;
  loop: boolean;
  last_event_time: string | null;
  last_published_id: string | null;
  errors: string[];
}

export interface ReplayStartPayload {
  source?: 'both' | 'json' | 'csv';
  interval_seconds?: number;
  loop?: boolean;
}

export interface DatasetInfo {
  paths: {
    jsonl_path: string | null;
    csv_path: string | null;
  };
  stats: {
    json_file: string | null;
    csv_file: string | null;
    json_count: number;
    csv_count: number;
    total_raw: number;
    unique_records: number;
    cross_file_duplicates: number;
  };
  sample?: {
    event_id: string | null;
    platform: string | null;
    text: string | null;
    ground_truth: any;
  } | null;
}

export interface SourceAdapterTelemetry {
  adapter_id: string;
  name: string;
  platforms: string[];
  status: 'READY' | 'ACTIVE' | 'PENDING_AUTHORIZATION' | 'CONFIGURED' | 'ERROR' | string;
  description: string;
  is_demo: boolean;
  requires_auth: boolean;
  auth_configured: boolean;
  configured?: boolean;
  last_sync: string | null;
  items_synced: number;
  error_message: string | null;
  auth_instructions?: string | null;
}

export interface LiveFeedStatus {
  total_records: number;
  latest_ad_id: number;
  latest_custom_id: string | null;
  latest_created_at: string | null;
  telegram_status: SourceAdapterTelemetry | null;
}



export interface AdvertisementDetail {
  id: number;
  custom_id?: string;
  original_text: string;
  normalized_text: string;
  source_type: string;
  submitted_url?: string | null;
  content_hash: string;
  review_status: 'NEW' | 'NEEDS_REVIEW' | 'UNDER_INVESTIGATION' | 'ESCALATED' | 'CLOSED' | 'FALSE_POSITIVE' | 'UNDER_REVIEW' | 'CONFIRMED_FRAUD' | 'BENIGN' | string;
  platform?: string;
  platform_detected?: string;
  is_demo?: boolean;
  data_source?: string;
  raw_metadata?: string | null;
  external_id?: string | null;
  advertiser_name?: string | null;
  risk_score?: number | null;
  risk_level?: 'LOW' | 'MEDIUM' | 'HIGH' | string | null;
  created_at: string;
  analysis?: AnalysisResult;
  evidence_items: EvidenceItem[];
  entities: ExtractedEntity[];
  related_ads: Array<{
    id: number;
    custom_id?: string;
    relation_type: string;
    preview: string;
    review_status: string;
  }>;
  cases: Array<{
    id: number;
    case_ref: string;
    title: string;
    status: string;
    priority: string;
  }>;
  url_analysis?: UrlAnalysisData | null;
}

export interface UrlAnalysisData {
  url: string;
  normalized_url: string;
  domain: string;
  status: string;
  risk_score: number;
  is_suspicious: boolean;
  heuristics: string[];
  reputation_provider: string;
  reputation_status: string;
  is_ssrf_risk: boolean;
}

export interface CaseNote {
  id: number;
  case_id: number;
  note: string;
  actor: string;
  created_at: string;
}

export interface CaseItem {
  id: number;
  case_ref: string;
  title: string;
  description?: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'ESCALATED' | 'RESOLVED' | 'CLOSED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  assigned_to?: string;
  created_at: string;
  updated_at: string;
  ad_count: number;
  notes_count: number;
  ads: AdvertisementSummary[];
  advertisements_count?: number;
  advertisements?: any[];
  notes?: any[];
}

export interface AlertItem {
  id: number;
  alert_type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  message: string;
  advertisement_id?: number;
  case_id?: number;
  reviewed: boolean;
  created_at: string;
}

export interface DashboardStats {
  total_analyzed: number;
  high_risk_count: number;
  medium_risk_count: number;
  low_risk_count: number;
  open_cases_count: number;
  awaiting_review_count: number;
  total_entities_tracked: number;
  active_clusters_count?: number;
  demo_mode?: boolean;
  demo_records_count?: number;
  live_scans_count?: number;
  model_status?: string;
  model_version?: string;
  last_trained_at?: string;
  vocabulary_size?: number;
  roc_auc?: number;
  unseen_wording_test_accuracy?: number;
  unseen_wording_test_roc_auc?: number;
}

export interface DashboardActivity {
  date: string;
  high_risk: number;
  medium_risk: number;
  low_risk: number;
  total: number;
}

export interface DashboardPlatform {
  platform: string;
  suspicious: number;
  total: number;
}

export interface DashboardAuditActivity {
  id: number;
  actor: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details?: string;
  created_at: string;
  severity?: string;
}

export interface DashboardCluster {
  cluster_id: string;
  cluster_type: string;
  entity_value: string;
  advertisements_count: number;
  advertisement_ids: number[];
  highest_risk_level: string;
  last_seen: string;
}

export interface ThreatNetworkData {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
}

export interface NetworkNode {
  id: string;
  label: string;
  node_type: 'ad' | 'case' | 'entity_phone' | 'entity_telegram' | 'entity_url' | 'entity_crypto' | string;
  risk_level?: string;
  risk_score?: number;
  metadata?: Record<string, any>;
  connected_ads_count?: number;
  connected_ad_ids?: (string | number)[];
  cluster_id?: string;
}

export interface NetworkEdge {
  id: string;
  source: string;
  target: string;
  relationship: string;
  label: string;
}

export interface SystemSettings {
  risk_threshold_low: number;
  risk_threshold_high: number;
  similarity_threshold: number;
  demo_mode: boolean;
  ml_model: {
    status: string;
    model_type: string;
    version: string;
    last_trained: string;
    classes: string[];
  };
  active_rules: Array<{
    id: string;
    name: string;
    category: string;
    weight: number;
    description: string;
  }>;
}

export interface User {
  id: number;
  full_name: string;
  email: string;
  username: string;
  role: 'Investigator' | 'Fraud Analyst' | 'Developer' | 'Administrator' | string;
  avatar_url?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
  message?: string;
}

export interface RegisterPayload {
  full_name: string;
  email: string;
  username?: string;
  password: string;
  confirm_password?: string;
  role?: 'Investigator' | 'Fraud Analyst' | 'Developer' | string;
}

export interface LoginPayload {
  username_or_email?: string;
  email?: string;
  password: string;
}

export interface NotificationItem {
  id: number;
  user_id?: number | null;
  title: string;
  message: string;
  type: 'HIGH_RISK_ALERT' | 'CASE_UPDATE' | 'SCAN_COMPLETED' | 'SYSTEM' | string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO' | string;
  is_read: boolean;
  target_type?: 'case' | 'alert' | 'report' | 'scan' | string | null;
  target_id?: string | null;
  created_at: string;
}

export interface NotificationListResponse {
  notifications: NotificationItem[];
  total: number;
  unread_count: number;
}

export interface ThreatIndicatorItem {
  indicator_name: string;
  observed_evidence: string;
  why_it_matters: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'Informational' | string;
  evidence_source: string;
  verification_status: 'Verified' | 'Model-Inferred' | 'Dataset-Provided' | 'Unknown' | string;
  score_contribution?: number | null;
}

export interface AiModelAnalysis {
  model_name: string;
  model_version?: string | null;
  prediction: string;
  suspicious_probability?: number | null;
  risk_score: number;
  prediction_threshold?: number | null;
  detected_patterns: Array<{ token: string; type: string; contribution: number }>;
  important_limitations: string[];
}

export interface UrlDomainAnalysis {
  hostname: string;
  domain: string;
  https_status: string;
  url_length: number;
  suspicious_symbols: string[];
  is_ip_hostname: boolean;
  subdomains: string[];
  redirect_chain: string[];
  dns_intelligence?: string | null;
  external_reputation?: {
    provider: string;
    status: string;
    checked_at?: string;
  } | null;
}

export interface MessageAnalysis {
  message_text: string;
  urgency_or_threats: string[];
  credential_or_payment_requests: string[];
  extracted_links: string[];
  extracted_entities: Array<{ type: string; value: string }>;
  impersonation_indicators: string[];
  reasons_for_uncertainty: string[];
}

export interface RiskBreakdownItem {
  category: string;
  score?: number | null;
  status: 'Evaluated' | 'Not evaluated' | string;
  details: string;
}

export interface EvidenceTimelineItem {
  timestamp: string;
  event: string;
  details?: string | null;
}

export interface InvestigationReport {
  id?: number;
  report_id: string;
  scan_id?: string | null;
  created_at: string;
  input_type: 'url' | 'message' | 'dataset_record' | string;
  source_type: string;
  target_summary: string;
  verdict: 'Suspicious' | 'Likely Suspicious' | 'Inconclusive' | 'No Significant Threat Detected' | string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'Informational' | string;
  risk_score: number;
  model_probability?: number | null;
  confidence_score?: number | null;
  scan_status: 'Completed' | 'Partial' | 'Failed' | string;
  executive_summary: string;
  indicators: ThreatIndicatorItem[];
  model_analysis?: AiModelAnalysis | null;
  url_analysis?: UrlDomainAnalysis | null;
  message_analysis?: MessageAnalysis | null;
  risk_breakdown: RiskBreakdownItem[];
  calculation_explanation: string;
  potential_impacts: string[];
  recommended_actions: string[];
  evidence_timeline: EvidenceTimelineItem[];
  checks_performed: Array<{ check: string; status: string; result?: string }>;
  unavailable_checks: Array<{ check: string; status: string; reason?: string }>;
  provenance: {
    source_type?: string;
    data_source?: string;
    is_demo?: boolean;
    external_id?: string | null;
    custom_id?: string | null;
    content_hash?: string | null;
    provenance_badge?: string;
    [key: string]: any;
  };
  limitations: string[];
}

export interface InvestigationReportListItem {
  id: number;
  report_id: string;
  scan_id?: string | null;
  input_type: string;
  source_type: string;
  target_summary: string;
  verdict: string;
  severity: string;
  risk_score: number;
  created_at: string;
}

export interface InvestigationReportsResponse {
  items: InvestigationReportListItem[];
  reports: InvestigationReportListItem[];
  total: number;
  page: number;
  pages: number;
  limit: number;
}
