from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, ConfigDict

class EntitySchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    entity_type: str
    entity_value: str
    normalized_value: str

class EvidenceSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: Optional[int] = None
    evidence_type: str
    matched_text: str
    description: str
    source_location: Optional[str] = None
    created_at: Optional[datetime] = None

class TriggeredRuleSchema(BaseModel):
    rule_id: str
    rule_name: str
    category: str
    weight: int
    matched_phrases: List[str]
    explanation: str

class AnalysisResultSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: Optional[int] = None
    risk_score: float
    risk_level: str
    classification: Optional[str] = "SAFE"
    model_available: bool
    model_signal: Optional[float] = None
    model_score: Optional[float] = None
    model_version: Optional[str] = None
    model_class: Optional[str] = None
    model_tokens: List[Dict[str, Any]] = []
    explanation: str
    recommended_review_action: str
    triggered_rules: List[TriggeredRuleSchema] = []
    suspicious_phrases: List[str] = []
    is_duplicate: bool = False
    duplicate_of_id: Optional[str] = None
    near_duplicate_matches: List[Dict[str, Any]] = []

class AdAnalyzeRequest(BaseModel):
    content: str = Field(..., max_length=15000, description="Advertisement text or OCR extracted text")
    source_type: str = Field(default="text", description="text, url, screenshot, csv_batch, api_feed, manual_entry")
    submitted_url: Optional[str] = Field(default=None, description="Optional URL string for safe static evaluation")
    platform: Optional[str] = Field(default=None, description="Optional platform source e.g. Telegram, Instagram, Facebook, X, Web")
    advertiser_name: Optional[str] = Field(default=None, description="Optional advertiser, channel, or account name")
    external_id: Optional[str] = Field(default=None, description="Optional external post or ad ID")
    data_source: Optional[str] = Field(default="LIVE_SCAN", description="Provenance e.g. REAL_API, MANUAL_SUBMISSION, LIVE_SCAN, SYNTHETIC_DEMO")

class AdSummarySchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    custom_id: Optional[str]
    original_text: str
    source_type: str
    submitted_url: Optional[str]
    platform: Optional[str] = "Unknown"
    advertiser_name: Optional[str] = None
    external_id: Optional[str] = None
    risk_score: Optional[float]
    risk_level: Optional[str]
    review_status: str
    is_demo: bool = False
    data_source: str = "LIVE_SCAN"
    raw_metadata: Optional[str] = None
    created_at: datetime
    entities_count: int = 0
    cases_count: int = 0
    top_entities: List[Dict[str, str]] = []

class AdDetailSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    custom_id: Optional[str]
    original_text: str
    normalized_text: str
    source_type: str
    submitted_url: Optional[str]
    platform: Optional[str] = "Unknown"
    advertiser_name: Optional[str] = None
    external_id: Optional[str] = None
    is_demo: bool = False
    data_source: str = "LIVE_SCAN"
    raw_metadata: Optional[str] = None
    content_hash: str
    review_status: str
    created_at: datetime
    analysis: Optional[AnalysisResultSchema]
    evidence_items: List[EvidenceSchema] = []
    entities: List[EntitySchema] = []
    related_ads: List[Dict[str, Any]] = []
    cases: List[Dict[str, Any]] = []
    url_analysis: Optional[Dict[str, Any]] = None

class ReplayStartRequest(BaseModel):
    source: str = Field(default="both", description="'both', 'json', or 'csv'")
    interval_seconds: float = Field(default=3.0, ge=0.5, le=60.0)
    loop: bool = Field(default=False, description="Whether to restart at end of dataset")

class ReplayStatusSchema(BaseModel):
    status: str  # IDLE, RUNNING, PAUSED, STOPPED, COMPLETED
    source: str  # both, json, csv
    interval_seconds: float
    total_records: int
    published_count: int
    remaining_count: int
    current_index: int
    loop: bool = False
    last_event_time: Optional[str] = None
    last_published_id: Optional[str] = None
    errors: List[str] = []

class IngestPostRequest(BaseModel):
    content: str = Field(..., max_length=15000, description="Post text or advertisement copy")
    platform: str = Field(default="Unknown", description="Source platform e.g. Facebook, Instagram, Telegram, WhatsApp, Web")
    advertiser_name: Optional[str] = Field(default=None, description="Advertiser, account, or page name")
    external_id: Optional[str] = Field(default=None, description="External native post ID or ad ID")
    submitted_url: Optional[str] = Field(default=None, description="Post or landing page link")
    source_type: str = Field(default="api_feed", description="api_feed, manual_entry, screenshot_ocr, csv_batch")
    data_source: str = Field(default="MANUAL_SUBMISSION", description="REAL_API, MANUAL_SUBMISSION, SYNTHETIC_DEMO")
    is_demo: bool = Field(default=False, description="Whether this is sample/demo data")

class AdStatusUpdateRequest(BaseModel):
    review_status: str # NEW, NEEDS_REVIEW, UNDER_INVESTIGATION, ESCALATED, CLOSED, FALSE_POSITIVE
    notes: Optional[str] = None
    actor: Optional[str] = "Analyst"

class CaseNoteSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    case_id: int
    note: str
    actor: str
    created_at: datetime

class CaseNoteCreateSchema(BaseModel):
    note: str = Field(..., min_length=1, max_length=5000)
    actor: str = Field(default="Analyst Alpha")

class CaseCreateSchema(BaseModel):
    title: str = Field(..., min_length=3, max_length=256)
    description: Optional[str] = None
    priority: str = Field(default="MEDIUM", description="LOW, MEDIUM, HIGH, CRITICAL")
    ad_ids: List[int] = Field(default_factory=list, description="IDs of advertisements to associate")
    assigned_to: Optional[str] = "Analyst Alpha"

class CaseUpdateSchema(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None # OPEN, IN_PROGRESS, ESCALATED, CLOSED
    assigned_to: Optional[str] = None
    add_ad_ids: Optional[List[int]] = None

class CaseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    case_ref: str
    title: str
    description: Optional[str]
    priority: str
    status: str
    assigned_to: str
    created_at: datetime
    updated_at: datetime
    advertisements_count: int = 0
    advertisements: List[AdSummarySchema] = []
    notes: List[CaseNoteSchema] = []

class AlertSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    advertisement_id: Optional[int]
    custom_id: Optional[str] = None
    alert_type: str
    severity: str
    message: str
    reviewed: bool
    created_at: datetime

class AlertUpdateSchema(BaseModel):
    reviewed: bool

class DashboardStatsResponse(BaseModel):
    total_analyzed: int
    high_risk_count: int
    medium_risk_count: int
    low_risk_count: int
    open_cases_count: int
    awaiting_review_count: int
    total_entities_tracked: int
    active_clusters_count: int = 0
    demo_mode: bool = False
    demo_records_count: int = 0
    live_scans_count: int = 0
    model_status: Optional[str] = "online"
    model_version: Optional[str] = None
    last_trained_at: Optional[str] = None
    vocabulary_size: Optional[int] = None
    roc_auc: Optional[float] = None
    unseen_wording_test_accuracy: Optional[float] = None
    unseen_wording_test_roc_auc: Optional[float] = None

class DashboardActivityItem(BaseModel):
    date: str
    high_risk: int
    medium_risk: int
    low_risk: int
    total: int

class DashboardPlatformItem(BaseModel):
    platform: str
    suspicious: int
    total: int

class DashboardActivityLogItem(BaseModel):
    id: int
    actor: str
    action: str
    entity_type: str
    entity_id: str
    details: Optional[str] = None
    created_at: datetime
    severity: Optional[str] = None

class DashboardClusterItem(BaseModel):
    cluster_id: str
    cluster_type: str
    entity_value: str
    advertisements_count: int
    advertisement_ids: List[int]
    highest_risk_level: str
    last_seen: datetime

class NetworkNode(BaseModel):
    id: str
    label: str
    node_type: str # ad, case, entity_phone, entity_telegram, entity_url, entity_crypto
    risk_level: Optional[str] = None
    risk_score: Optional[float] = None
    metadata: Dict[str, Any] = {}

class NetworkEdge(BaseModel):
    id: str
    source: str
    target: str
    relationship: str # SHARED_TELEGRAM, SHARED_PHONE, SHARED_DOMAIN, TEXT_SIMILARITY, LINKED_CASE, CONFIRMED_COORDINATION
    label: Optional[str] = None
    evidence_strength: Optional[str] = "MEDIUM"
    coordination_status: Optional[str] = "POTENTIALLY_CONNECTED"
    shared_identifiers: List[Dict[str, Any]] = []

class NetworkGraphResponse(BaseModel):
    nodes: List[NetworkNode]
    edges: List[NetworkEdge]
    stats: Dict[str, Any]


class UserRegisterRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=128, description="User full legal or analyst name")
    email: str = Field(..., min_length=5, max_length=128, description="Valid email address")
    username: Optional[str] = Field(default=None, description="Unique username (optional, defaults to email prefix)")
    password: str = Field(..., min_length=8, max_length=128, description="Account password (min 8 characters)")
    confirm_password: Optional[str] = Field(default=None, description="Confirmation password")
    role: Optional[str] = Field(default="Investigator", description="Account role: Investigator, Fraud Analyst, or Developer")


class UserLoginRequest(BaseModel):
    email: Optional[str] = Field(default=None, description="User email address")
    username_or_email: Optional[str] = Field(default=None, description="Username or email address")
    password: str = Field(..., min_length=1, max_length=128, description="Account password")


class UserProfileUpdateRequest(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=128)
    role: Optional[str] = Field(default=None, max_length=32)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, max_length=128)
    confirm_new_password: Optional[str] = None


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    full_name: str
    email: str
    username: str
    role: str
    avatar_url: Optional[str] = None
    is_active: bool
    created_at: datetime


class NotificationSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: Optional[int] = None
    title: str
    message: str
    type: str
    severity: str
    is_read: bool
    target_type: Optional[str] = None
    target_id: Optional[str] = None
    created_at: datetime


class NotificationListResponse(BaseModel):
    notifications: List[NotificationSchema]
    total: int
    unread_count: int


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
    message: str


# =====================================================================
# AI INVESTIGATION REPORT SCHEMAS
# =====================================================================

class ThreatIndicatorItem(BaseModel):
    indicator_name: str
    observed_evidence: str
    why_it_matters: str
    severity: str # Critical, High, Medium, Low, Informational
    evidence_source: str # URL Parser, ML Model, Rule Engine, Dataset Label, Website X-Ray, External Intelligence
    verification_status: str # Verified, Model-Inferred, Dataset-Provided, Unknown
    score_contribution: Optional[float] = None

class AiModelAnalysis(BaseModel):
    model_name: str = "TF-IDF + Logistic Regression Baseline"
    model_version: Optional[str] = "fraudscope-context-lr-v2.0"
    prediction: str # safe, needs_review, suspicious
    suspicious_probability: Optional[float] = None
    risk_score: float
    prediction_threshold: Optional[float] = 0.65
    detected_patterns: List[Dict[str, Any]] = []
    important_limitations: List[str] = []

class UrlDomainAnalysis(BaseModel):
    hostname: str
    domain: str
    https_status: str
    url_length: int
    suspicious_symbols: List[str] = []
    is_ip_hostname: bool = False
    subdomains: List[str] = []
    redirect_chain: List[str] = []
    dns_intelligence: Optional[str] = None
    external_reputation: Optional[Dict[str, Any]] = None

class MessageAnalysis(BaseModel):
    message_text: str
    urgency_or_threats: List[str] = []
    credential_or_payment_requests: List[str] = []
    extracted_links: List[str] = []
    extracted_entities: List[Dict[str, str]] = []
    impersonation_indicators: List[str] = []
    reasons_for_uncertainty: List[str] = []

class RiskBreakdownItem(BaseModel):
    category: str
    score: Optional[float] = None
    status: str # Evaluated, Not evaluated
    details: str

class EvidenceTimelineItem(BaseModel):
    timestamp: str
    event: str
    details: Optional[str] = None

class InvestigationReportSchema(BaseModel):
    report_id: str
    scan_id: Optional[str] = None
    created_at: str
    input_type: str # url, message, dataset_record
    source_type: str # manual_scan, url_scanner, website_xray, dataset_replay, api_feed
    target_summary: str
    verdict: str # Suspicious, Likely Suspicious, Inconclusive, No Significant Threat Detected
    severity: str # Critical, High, Medium, Low, Informational
    risk_score: float
    model_probability: Optional[float] = None
    confidence_score: Optional[float] = None
    scan_status: str # Completed, Partial, Failed
    executive_summary: str
    indicators: List[ThreatIndicatorItem] = []
    model_analysis: Optional[AiModelAnalysis] = None
    url_analysis: Optional[UrlDomainAnalysis] = None
    message_analysis: Optional[MessageAnalysis] = None
    risk_breakdown: List[RiskBreakdownItem] = []
    calculation_explanation: str
    potential_impacts: List[str] = []
    recommended_actions: List[str] = []
    evidence_timeline: List[EvidenceTimelineItem] = []
    checks_performed: List[Dict[str, str]] = []
    unavailable_checks: List[Dict[str, str]] = []
    provenance: Dict[str, Any] = {}
    limitations: List[str] = []

class InvestigationReportSummarySchema(BaseModel):
    id: int
    report_id: str
    scan_id: Optional[str] = None
    input_type: str
    source_type: str
    target_summary: str
    verdict: str
    severity: str
    risk_score: float
    created_at: str

class ReportGenerateRequest(BaseModel):
    scan_id: Optional[str] = None
    advertisement_id: Optional[int] = None
    input_type: Optional[str] = None # url, message, dataset_record
    content: Optional[str] = None
    url: Optional[str] = None
    title: Optional[str] = None

