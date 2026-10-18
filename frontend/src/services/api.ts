import {
  DashboardStats,
  DashboardActivity,
  AdvertisementDetail,
  AdvertisementSummary,
  ThreatNetworkData,
  CaseItem,
  AlertItem,
  SystemSettings,
  User,
  AuthResponse,
  RegisterPayload,
  LoginPayload,
  SourceAdapterTelemetry,
  LiveFeedStatus,
  ReplayStatus,
  ReplayStartPayload,
  DatasetInfo,
  InvestigationReport,
  InvestigationReportsResponse,
  InvestigationReportListItem,
  NotificationItem,
  NotificationListResponse
} from '../types';

// Support VITE_API_BASE_URL (standard Vercel/Vite convention) as well as VITE_API_URL or VITE_BACKEND_URL
const rawBaseUrl = (
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ||
  (import.meta.env.VITE_API_URL as string | undefined) ||
  (import.meta.env.VITE_BACKEND_URL as string | undefined) ||
  ''
).trim();

// Strip any trailing slashes and any trailing '/api' suffix so `${BASE_URL}/api/...` never produces duplicate `/api/api/...`
export const BASE_URL = rawBaseUrl.replace(/\/+$/, '').replace(/\/api$/, '');

/**
 * Resolves an API endpoint against BASE_URL, guaranteeing exactly one '/api' prefix
 * and preventing duplicate '/api/api' paths or malformed slashes.
 */
export function getApiUrl(endpoint: string): string {
  let cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  // Remove duplicate leading /api prefixes if present e.g. /api/api/ -> /api/
  while (cleanEndpoint.startsWith('/api/api/')) {
    cleanEndpoint = cleanEndpoint.substring(4);
  }
  const apiPath = (cleanEndpoint.startsWith('/api/') || cleanEndpoint === '/api')
    ? cleanEndpoint
    : `/api${cleanEndpoint}`;
  return `${BASE_URL}${apiPath}`;
}

let authToken: string | null = typeof window !== 'undefined' ? localStorage.getItem('fraudscope_token') : null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
  if (typeof window !== 'undefined') {
    if (token) {
      localStorage.setItem('fraudscope_token', token);
    } else {
      localStorage.removeItem('fraudscope_token');
    }
  }
};

export const getAuthToken = () => authToken;

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = getApiUrl(endpoint);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    let errorMsg = `HTTP Error ${response.status}`;
    try {
      const errJson = await response.json();
      errorMsg = errJson.detail || errJson.message || errorMsg;
    } catch {
      // fallback
    }
    throw new Error(errorMsg);
  }
  return response.json();
}

async function requestMultipart<T>(endpoint: string, formData: FormData): Promise<T> {
  const url = getApiUrl(endpoint);
  const headers: Record<string, string> = {};

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    body: formData,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    let errorMsg = `HTTP Error ${response.status}`;
    try {
      const errJson = await response.json();
      errorMsg = errJson.detail || errJson.message || errorMsg;
    } catch {
      // fallback
    }
    throw new Error(errorMsg);
  }
  return response.json();
}

export const authApi = {
  register: (payload: RegisterPayload) =>
    request<User>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  login: async (payload: LoginPayload) => {
    const res = await request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res.access_token) {
      setAuthToken(res.access_token);
    }
    return res;
  },

  logout: async () => {
    try {
      await request<{ message: string }>('/api/auth/logout', {
        method: 'POST',
      });
    } catch {
      // Ignore network errors on logout
    } finally {
      setAuthToken(null);
    }
  },

  getMe: () => request<User>('/api/auth/me'),

  updateProfile: (payload: { full_name?: string; role?: string }) =>
    request<User>('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  uploadAvatar: (formData: FormData) =>
    requestMultipart<User>('/api/auth/avatar', formData),

  removeAvatar: () =>
    request<User>('/api/auth/avatar', {
      method: 'DELETE',
    }),

  changePassword: (payload: { current_password: string; new_password: string; confirm_new_password?: string }) =>
    request<{ message: string }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};

export const notificationApi = {
  getNotifications: (params: { limit?: number; offset?: number; unread_only?: boolean } = {}) => {
    const query = new URLSearchParams();
    if (params.limit) query.set('limit', String(params.limit));
    if (params.offset) query.set('offset', String(params.offset));
    if (params.unread_only !== undefined) query.set('unread_only', String(params.unread_only));
    return request<NotificationListResponse>(`/api/notifications?${query.toString()}`);
  },

  getUnreadCount: () =>
    request<{ unread_count: number }>('/api/notifications/unread-count'),

  markAsRead: (id: number) =>
    request<NotificationItem>(`/api/notifications/${id}/read`, {
      method: 'POST',
    }),

  markAllAsRead: () =>
    request<{ message: string; updated_count: number }>('/api/notifications/read-all', {
      method: 'POST',
    }),
};

const listAdsRequest = (params: {
  page?: number;
  limit?: number;
  search?: string;
  platform?: string;
  risk_level?: string;
  review_status?: string;
  is_demo?: boolean;
  data_source?: string;
  sort_by?: string;
  sort_order?: string;
} = {}) => {
  const query = new URLSearchParams();
  if (params.page) query.set('page', params.page.toString());
  if (params.limit) query.set('limit', params.limit.toString());
  if (params.search) query.set('search', params.search);
  if (params.platform) query.set('platform', params.platform);
  if (params.risk_level) query.set('risk_level', params.risk_level);
  if (params.review_status) query.set('review_status', params.review_status);
  if (params.is_demo !== undefined) query.set('is_demo', params.is_demo.toString());
  if (params.data_source) query.set('data_source', params.data_source);
  if (params.sort_by) query.set('sort_by', params.sort_by);
  if (params.sort_order) query.set('sort_order', params.sort_order);

  return request<{
    items: AdvertisementSummary[];
    total: number;
    page: number;
    limit: number;
    pages: number;
  }>(`/api/ads?${query.toString()}`);
};

export const api = {
  // Health
  checkHealth: () => request<{ status: string; database: string }>('/api/health'),

  // Dashboard
  getStats: (includeDemo: boolean = true) => request<DashboardStats>(`/api/dashboard/stats?include_demo=${includeDemo}`),
  getDashboardStats: (includeDemo: boolean = true) => request<DashboardStats>(`/api/dashboard/stats?include_demo=${includeDemo}`),
  getActivity: () => request<DashboardActivity[]>('/api/dashboard/activity'),
  getTrends: (days: number = 7, includeDemo: boolean = true) => request<DashboardActivity[]>(`/api/dashboard/trends?days=${days}&include_demo=${includeDemo}`),
  getPlatforms: (includeDemo: boolean = true) => request<Array<{ platform: string; suspicious: number; total: number }>>(`/api/dashboard/platforms?include_demo=${includeDemo}`),
  getAuditActivity: (limit: number = 12) =>
    request<Array<{ id: number; actor: string; action: string; entity_type: string; entity_id: string; details?: string; created_at: string; severity?: string }>>(
      `/api/dashboard/audit-activity?limit=${limit}`
    ),
  getClusters: (limit: number = 10) =>
    request<Array<{ cluster_id: string; cluster_type: string; entity_value: string; advertisements_count: number; advertisement_ids: number[]; highest_risk_level: string; last_seen: string }>>(
      `/api/dashboard/clusters?limit=${limit}`
    ),

  // Advertisements & Scanner
  analyzeAd: (content: string, sourceType: string = 'text', submittedUrl?: string, platform?: string) =>
    request<AdvertisementDetail>('/api/ads/analyze', {
      method: 'POST',
      body: JSON.stringify({ content, source_type: sourceType, submitted_url: submittedUrl || null, platform: platform || null }),
    }),
  analyzeText: (content: string, sourceType: string = 'text', submittedUrl?: string, platform?: string) =>
    request<AdvertisementDetail>('/api/ads/analyze', {
      method: 'POST',
      body: JSON.stringify({ content, source_type: sourceType, submitted_url: submittedUrl || null, platform: platform || null }),
    }),

  // Source Adapters & Ingestion
  getSourcesStatus: () => request<SourceAdapterTelemetry[]>('/api/ads/sources'),
  syncSource: (adapterId: string) =>
    request<{ status: string; message: string; fetched: number; persisted: number; duplicates: number }>(
      `/api/ads/sync-source/${adapterId}`,
      { method: 'POST' }
    ),
  ingestPost: (post: { content: string; platform: string; external_id?: string; advertiser_name?: string; submitted_url?: string; is_demo?: boolean }) =>
    request<{ status: string; ad_id: number; custom_id: string; is_duplicate: boolean; risk_level: string }>(
      '/api/ads/ingest',
      { method: 'POST', body: JSON.stringify(post) }
    ),
  getLiveStatus: () => request<LiveFeedStatus>('/api/ads/live-status'),
  pollTelegram: () =>
    request<{ status: string; fetched_count: number; persisted_count: number; channels: string[]; message: string }>(
      '/api/ads/telegram/poll',
      { method: 'POST' }
    ),
  testTelegramConnection: () =>
    request<{
      success: boolean;
      status: string;
      connected_to_dc: boolean;
      user_authorized: boolean;
      channels_count: number;
      channels: string[];
      message: string;
    }>('/api/ads/telegram/test-connection', { method: 'POST' }),

  uploadOcrImage: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const headers: Record<string, string> = {};
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    const response = await fetch(getApiUrl('/api/ads/ocr-upload'), {
      method: 'POST',
      headers,
      credentials: 'include',
      body: formData,
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: 'OCR upload failed' }));
      throw new Error(err.detail || 'OCR upload failed');
    }
    return response.json() as Promise<{
      success: boolean;
      extracted_text: string;
      filename: string;
      message: string;
    }>;
  },

  bulkAnalyze: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const headers: Record<string, string> = {};
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    const response = await fetch(getApiUrl('/api/ads/bulk-analyze'), {
      method: 'POST',
      headers,
      credentials: 'include',
      body: formData,
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: 'Bulk CSV analysis failed' }));
      throw new Error(err.detail || 'Bulk CSV analysis failed');
    }
    return response.json() as Promise<{
      total_submitted: number;
      successful_count: number;
      failed_count: number;
      results: Array<{ row: number; id: number; custom_id: string; risk_score: number; risk_level: string; preview: string }>;
      errors: Array<{ row: number; error: string }>;
    }>;
  },

  listAds: listAdsRequest,
  listAdvertisements: listAdsRequest,

  getAdDetail: (id: number | string) => request<AdvertisementDetail>(`/api/ads/${id}`),

  updateAdStatus: (id: number | string, reviewStatus: string, notes?: string, actor?: string) =>
    request<{ message: string; old_status: string; new_status: string }>(`/api/ads/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ review_status: reviewStatus, notes, actor: actor || 'Analyst Alpha' }),
    }),

  deleteAd: (id: number | string) =>
    request<{ message: string }>(`/api/ads/${id}`, {
      method: 'DELETE',
    }),

  // Threat Network
  getThreatNetwork: () => request<ThreatNetworkData>('/api/network'),

  // Case Management
  listCases: (params: { status?: string; priority?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.priority) query.set('priority', params.priority);
    return request<CaseItem[]>(`/api/cases?${query.toString()}`);
  },

  createCase: (payload: { title: string; description?: string; priority?: string; ad_ids?: number[]; assigned_to?: string }) =>
    request<CaseItem>('/api/cases', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getCaseDetail: (id: number) => request<CaseItem>(`/api/cases/${id}`),

  updateCase: (id: number, payload: { title?: string; description?: string; priority?: string; status?: string; assigned_to?: string; add_ad_ids?: number[] }) =>
    request<CaseItem>(`/api/cases/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  addCaseNote: (id: number, note: string, actor?: string) =>
    request<{ id: number; case_id: number; note: string; actor: string; created_at: string }>(`/api/cases/${id}/notes`, {
      method: 'POST',
      body: JSON.stringify({ note, actor: actor || 'Analyst Alpha' }),
    }),

  deleteCase: (id: number | string) =>
    request<{ message: string }>(`/api/cases/${id}`, {
      method: 'DELETE',
    }),

  // Smart URL Scanner & Website X-Ray
  scanUrl: (url: string, title?: string, saveAsCase?: boolean) =>
    request<any>('/api/scanner/url', {
      method: 'POST',
      body: JSON.stringify({ url, title: title || null, save_as_case: !!saveAsCase }),
    }),

  inspectWebsiteXRay: (url: string, saveAsCase?: boolean) =>
    request<any>('/api/scanner/xray', {
      method: 'POST',
      body: JSON.stringify({ url, save_as_case: !!saveAsCase }),
    }),

  // Alerts
  listAlerts: (params: { reviewed?: boolean; severity?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.reviewed !== undefined) query.set('reviewed', String(params.reviewed));
    if (params.severity) query.set('severity', params.severity);
    return request<AlertItem[]>(`/api/alerts?${query.toString()}`);
  },

  updateAlert: (id: number, reviewed: boolean) =>
    request<AlertItem>(`/api/alerts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ reviewed }),
    }),

  // Reports
  getReportsSummary: () =>
    request<{
      report_id: string;
      generated_at: string;
      classification: string;
      metrics: any;
      disclaimer: string;
    }>('/api/reports/summary'),

  getExportCsvUrl: () => getApiUrl('/api/reports/export'),

  generateInvestigationReport: (payload: {
    scan_id?: string;
    advertisement_id?: number;
    input_type?: string;
    content?: string;
    url?: string;
    title?: string;
  }) =>
    request<InvestigationReport>('/api/reports/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  listInvestigationReports: (params: {
    page?: number;
    limit?: number;
    search?: string;
    severity?: string;
    input_type?: string;
  } = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    if (params.search) query.set('search', params.search);
    if (params.severity) query.set('severity', params.severity);
    if (params.input_type) query.set('input_type', params.input_type);
    return request<InvestigationReportsResponse>(`/api/reports?${query.toString()}`);
  },

  getInvestigationReport: (idOrReportId: string | number) =>
    request<InvestigationReport>(`/api/reports/${idOrReportId}`),

  getReportExportJsonUrl: (idOrReportId: string | number) =>
    getApiUrl(`/api/reports/${idOrReportId}/export/json`),

  getReportExportHtmlUrl: (idOrReportId: string | number) =>
    getApiUrl(`/api/reports/${idOrReportId}/export/html`),

  // Settings
  getSettings: () => request<SystemSettings>('/api/settings'),
  updateSettings: (payload: { risk_threshold_low: number; risk_threshold_high: number; similarity_threshold: number; demo_mode: boolean }) =>
    request<{ message: string }>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  // Dataset Replay & Live Feed Integration
  getReplayStatus: () => request<ReplayStatus>('/api/ads/replay/status'),
  startReplay: (payload?: ReplayStartPayload) =>
    request<ReplayStatus>('/api/ads/replay/start', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),
  pauseReplay: () => request<ReplayStatus>('/api/ads/replay/pause', { method: 'POST' }),
  resumeReplay: () => request<ReplayStatus>('/api/ads/replay/resume', { method: 'POST' }),
  stopReplay: () => request<ReplayStatus>('/api/ads/replay/stop', { method: 'POST' }),
  restartReplay: (payload?: ReplayStartPayload) =>
    request<ReplayStatus>('/api/ads/replay/restart', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),
  getDatasetInfo: () => request<DatasetInfo>('/api/ads/dataset/info'),
  importDataset: (source: string = 'both') =>
    request<{ status: string; source: string; dataset_stats: any; import_summary: any }>(
      `/api/ads/dataset/import?source=${source}`,
      { method: 'POST' }
    ),
};
