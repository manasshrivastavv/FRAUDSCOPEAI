import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Globe,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Layers,
  ArrowRight,
  Info,
  Lock,
  FileText,
  Search,
  CheckCircle,
  XCircle,
  Cpu,
  ArrowUpRight,
  Loader2
} from 'lucide-react';
import { api } from '../services/api';
import { ExplainableVerdictCard } from '../components/investigation/ExplainableVerdictCard';
import { generateCaseReportPdf } from '../services/pdfReportGenerator';

export const WebsiteXRayPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [urlInput, setUrlInput] = useState(searchParams.get('url') || '');
  const [inspecting, setInspecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [xrayResult, setXrayResult] = useState<any | null>(null);
  const [savedCaseRef, setSavedCaseRef] = useState<string | undefined>(undefined);
  const resultRef = useRef<HTMLDivElement>(null);

  const samplePresets = [
    {
      label: 'Phishing Deposit Portal',
      url: 'https://fast-incomex.in/claim',
    },
    {
      label: 'High-Yield Crypto Doubler',
      url: 'https://crypto-double-pool.xyz/deposit',
    },
    {
      label: 'SSRF Loopback Defense Test',
      url: 'http://127.0.0.1:9000/internal-keys',
    },
    {
      label: 'Legitimate RBI Portal',
      url: 'https://rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx',
    },
  ];

  const handleInspect = async (targetUrl?: string) => {
    const toScan = (targetUrl || urlInput).trim();
    if (!toScan) return;

    setInspecting(true);
    setErrorMsg(null);
    setXrayResult(null);
    setSavedCaseRef(undefined);

    try {
      const data = await api.inspectWebsiteXRay(toScan);
      setXrayResult(data);
      if (data.saved_case_ref) {
        setSavedCaseRef(data.saved_case_ref);
      }
      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (err: any) {
      setErrorMsg(err.message || 'Website X-Ray inspection failed.');
    } finally {
      setInspecting(false);
    }
  };

  useEffect(() => {
    if (searchParams.get('url')) {
      handleInspect(searchParams.get('url') || undefined);
    }
  }, []);

  const handleSaveToCase = async () => {
    if (!xrayResult) return;
    try {
      const saved = await api.inspectWebsiteXRay(xrayResult.url, true);
      if (saved.saved_case_ref) {
        setSavedCaseRef(saved.saved_case_ref);
      }
    } catch (err: any) {
      alert('Failed to save case: ' + err.message);
    }
  };

  const handleExportPdf = () => {
    if (!xrayResult) return;
    generateCaseReportPdf({
      id: 8888,
      custom_id: `XRAY-${xrayResult.domain}`,
      original_text: `Website X-Ray Inspection: ${xrayResult.url}\nTitle: ${xrayResult.page_metadata?.title || 'N/A'}\nSnippet: ${xrayResult.visible_text_snippet || ''}`,
      normalized_text: xrayResult.normalized_url || xrayResult.url,
      source_type: 'url',
      submitted_url: xrayResult.url,
      platform: 'Web Server',
      is_demo: false,
      data_source: 'LIVE_SCAN',
      content_hash: 'SHA256-XRAY-EVAL',
      review_status: xrayResult.risk_assessment?.risk_level === 'HIGH' ? 'NEEDS_REVIEW' : 'NEW',
      created_at: new Date().toISOString(),
      analysis: {
        risk_score: xrayResult.risk_assessment?.risk_score ?? 0,
        risk_level: xrayResult.risk_assessment?.risk_level ?? 'LOW',
        model_available: xrayResult.ml_analysis?.model_available ?? true,
        model_signal: xrayResult.ml_analysis?.model_probability ?? 0,
        explanation: xrayResult.risk_assessment?.verdict_summary ?? 'Website X-Ray inspection completed.',
        recommended_review_action: 'Investigate source code and external linkages',
      },
      evidence_items: (xrayResult.detected_signals || []).map((sig: any, idx: number) => ({
        id: idx + 1,
        evidence_type: sig.category,
        matched_text: sig.source_quote,
        description: sig.explanation,
      })),
      entities: [
        { id: 1, entity_type: 'URL_DOMAIN', entity_value: xrayResult.domain, normalized_value: xrayResult.domain }
      ]
    });
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 font-sans">
      {/* 1. Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[var(--border)]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[var(--accent)] text-white font-bold uppercase tracking-wider">
              Module 2
            </span>
            <span className="text-xs font-mono text-[var(--muted)]">Deep Content & Heuristic Inspection</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[var(--text)] tracking-tight">
            Website X-Ray
          </h1>
          <p className="text-xs sm:text-sm text-[var(--muted)] mt-1">
            Safe sandboxed page fetching, Anti-SSRF boundary enforcement, title/metadata extraction, and live ML fraud signal detection.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-[var(--radius)] bg-[#E6F7F0] border border-[#A3E3CB] text-[#1D6B4F] self-start sm:self-auto font-medium shadow-2xs">
          <ShieldCheck className="w-4 h-4" />
          <span>Anti-SSRF Active · Max 1MB · No Script Execution</span>
        </div>
      </div>

      {/* 2. URL Input & Controls Form */}
      <div className="rounded-[var(--radius)] bg-[var(--card)] border border-[var(--border)] p-5 shadow-xs space-y-4">
        <form onSubmit={(e) => { e.preventDefault(); handleInspect(); }} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="xray-url-input" className="block text-xs font-bold text-[var(--text)] uppercase font-mono">
              Target Website URL for Content X-Ray:
            </label>
            <div className="relative">
              <Globe className="w-4 h-4 text-[var(--muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="xray-url-input"
                type="text"
                placeholder="https://example-banking-spoof.com/deposit..."
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                className="input-surface w-full pl-9 pr-3 py-2 text-xs sm:text-sm text-[var(--text)] font-mono"
                required
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            {/* Presets */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-mono text-[var(--muted)] mr-1">Quick Presets:</span>
              {samplePresets.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setUrlInput(p.url);
                    handleInspect(p.url);
                  }}
                  className="text-xs px-2.5 py-1 rounded-[var(--radius)] bg-[var(--bg)] hover:bg-[var(--table-hover)] border border-[var(--border)] text-[var(--text)] transition-colors flex items-center gap-1.5"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)]" />
                  <span>{p.label}</span>
                </button>
              ))}
            </div>

            <button
              type="submit"
              disabled={inspecting || !urlInput.trim()}
              className="btn-primary text-xs sm:text-sm py-2 px-5 font-semibold shadow-xs flex items-center gap-2"
            >
              {inspecting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Fetching & Inspecting...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Run Website X-Ray</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* 3. Loading Indicator */}
      {inspecting && (
        <div className="p-8 rounded-[var(--radius)] bg-[var(--card)] border border-[var(--border)] text-center space-y-3 shadow-xs animate-in fade-in">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--primary)] mx-auto" />
          <p className="text-xs font-semibold text-[var(--text)]">Safely inspecting remote webpage and collecting TLS telemetry...</p>
          <p className="text-[11px] text-[var(--muted)]">Performing SSRF mitigation, TLS validation, form extraction, and behavioral risk scoring.</p>
        </div>
      )}

      {/* 4. Error Banner */}
      {errorMsg && (
        <div className="p-4 rounded-[var(--radius)] bg-[#FDE8E8] border border-[#F8B4B6] text-xs text-[#A8341C] font-mono flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 5. Inspection Report */}
      {xrayResult && (
        <div ref={resultRef} className="space-y-6 animate-in fade-in duration-200">
          {/* Safe Fetch Status & Network Telemetry */}
          <div className="rounded-[var(--radius)] bg-[var(--card)] border border-[var(--border)] p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <span className="font-bold text-xs uppercase font-mono tracking-wider text-[var(--text)]">
                Safe Network Fetch Telemetry
              </span>
              <span
                className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded uppercase ${
                  (xrayResult.scan_status || xrayResult.fetch_status) === 'SUCCESS'
                    ? 'bg-[#E6F7F0] text-[#1D6B4F] border border-[#A3E3CB]'
                    : (xrayResult.scan_status || xrayResult.fetch_status) === 'BLOCKED' || xrayResult.fetch_status === 'SSRF_BLOCKED'
                    ? 'bg-[#FDE8E8] text-[#A8341C] border border-[#F8B4B6]'
                    : 'bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]'
                }`}
              >
                {xrayResult.scan_status || xrayResult.fetch_status}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
              <div className="p-3 rounded bg-[var(--bg)] border border-[var(--border)]">
                <span className="text-[var(--muted)] block text-[10px] uppercase">Destination IP:</span>
                <strong className="text-[var(--text)] truncate block">
                  {xrayResult.resolved_ips?.[0] || 'Unresolved'}
                </strong>
              </div>

              <div className="p-3 rounded bg-[var(--bg)] border border-[var(--border)]">
                <span className="text-[var(--muted)] block text-[10px] uppercase">HTTP Status Code:</span>
                <strong className="text-[var(--text)]">
                  {xrayResult.status_code !== null && xrayResult.status_code !== undefined
                    ? xrayResult.status_code
                    : xrayResult.tls_status === 'FAILED'
                    ? 'N/A (TLS Rejection)'
                    : 'N/A'}
                </strong>
              </div>

              <div className="p-3 rounded bg-[var(--bg)] border border-[var(--border)]">
                <span className="text-[var(--muted)] block text-[10px] uppercase">Transport Security:</span>
                <strong
                  className={
                    xrayResult.tls_status === 'VERIFIED'
                      ? 'text-[#2FA97C]'
                      : xrayResult.tls_status === 'FAILED'
                      ? 'text-[#E5484D]'
                      : xrayResult.tls_status === 'UNVERIFIED'
                      ? 'text-[#F5A524]'
                      : xrayResult.security_headers?.has_https
                      ? 'text-[#2FA97C]'
                      : 'text-[#E5484D]'
                  }
                >
                  {xrayResult.actual_transport || (xrayResult.security_headers?.has_https ? 'HTTPS (TLS)' : 'HTTP (Unencrypted)')}
                </strong>
              </div>

              <div className="p-3 rounded bg-[var(--bg)] border border-[var(--border)]">
                <span className="text-[var(--muted)] block text-[10px] uppercase">Redirect Chain:</span>
                <strong className="text-[var(--text)]">
                  {xrayResult.redirect_chain?.length ? `${xrayResult.redirect_chain.length} hop(s)` : 'Direct'}
                </strong>
              </div>
            </div>

            {/* TLS Certificate Rejection Banner */}
            {xrayResult.tls_error && (
              <div className="p-3.5 rounded-[var(--radius)] bg-[#FDE8E8] border border-[#F8B4B6] text-xs font-mono text-[#A8341C] flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <strong className="block font-bold">TLS Certificate Verification Failed</strong>
                  <span>{xrayResult.tls_error}</span>
                  <p className="text-[11px] text-[#A8341C]/80 mt-1 font-sans">
                    Strict certificate verification prevents connecting to servers with invalid, expired, self-signed, or mismatched certificates.
                  </p>
                </div>
              </div>
            )}

            {/* Reason Incomplete Banner */}
            {xrayResult.risk_assessment?.reason_incomplete && !xrayResult.tls_error && (
              <div className="p-3.5 rounded-[var(--radius)] bg-[#FEF3C7] border border-[#FDE68A] text-xs font-mono text-[#92400E] flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <strong className="block font-bold">Investigation Incomplete — Verdict Inconclusive</strong>
                  <span>{xrayResult.risk_assessment.reason_incomplete}</span>
                </div>
              </div>
            )}

            {xrayResult.error_detail && !xrayResult.tls_error && !xrayResult.risk_assessment?.reason_incomplete && (
              <div className="p-3 rounded bg-[var(--bg)] border border-[var(--border)] text-xs text-[var(--muted)] font-mono">
                <span className="font-bold text-[var(--text)]">Notice:</span> {xrayResult.error_detail}
              </div>
            )}
          </div>

          {/* Webpage Content & Metadata Card */}
          {xrayResult.page_metadata && (
            <div className="rounded-[var(--radius)] bg-[var(--card)] border border-[var(--border)] p-5 shadow-xs space-y-4">
              <span className="font-bold text-xs uppercase font-mono tracking-wider text-[var(--text)] block border-b border-[var(--border)] pb-2">
                Extracted Page Metadata & Structure
              </span>

              <div className="space-y-2">
                <div>
                  <span className="text-xs font-mono text-[var(--muted)]">Page Title:</span>
                  <p className="text-sm font-bold text-[var(--text)]">{xrayResult.page_metadata.title}</p>
                </div>

                <div>
                  <span className="text-xs font-mono text-[var(--muted)]">Meta Description:</span>
                  <p className="text-xs text-[var(--muted)]">{xrayResult.page_metadata.description}</p>
                </div>

                {xrayResult.visible_text_snippet && (
                  <div className="space-y-1 pt-2">
                    <span className="text-xs font-mono text-[var(--muted)]">Visible Text Sample (Sanitized):</span>
                    <div className="p-3 rounded bg-[var(--bg)] text-xs text-[var(--text)] font-mono leading-relaxed max-h-36 overflow-y-auto border border-[var(--border)]">
                      {xrayResult.visible_text_snippet}
                    </div>
                  </div>
                )}

                {xrayResult.page_metadata.external_domains?.length > 0 && (
                  <div className="pt-2">
                    <span className="text-xs font-mono text-[var(--muted)] block mb-1.5">
                      Referenced External Domains ({xrayResult.page_metadata.external_domains.length}):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {xrayResult.page_metadata.external_domains.map((dom: string, i: number) => (
                        <span key={i} className="text-xs font-mono px-2 py-0.5 rounded bg-[var(--bg)] border border-[var(--border)] text-[var(--text)]">
                          {dom}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Explainable Fraud Verdict */}
          <ExplainableVerdictCard
            riskScore={xrayResult.risk_assessment?.risk_score ?? null}
            riskLevel={xrayResult.risk_assessment?.risk_level ?? 'INCONCLUSIVE'}
            verdictSummary={xrayResult.risk_assessment?.verdict_summary || 'Website X-Ray inspection finished.'}
            sourceTarget={xrayResult.normalized_url || xrayResult.url}
            provisionalScore={xrayResult.risk_assessment?.provisional_risk_score ?? null}
            reasonIncomplete={xrayResult.risk_assessment?.reason_incomplete ?? null}
            checks={xrayResult.checks || []}
            checksCompleted={xrayResult.checks_completed || []}
            checksUnavailable={xrayResult.checks_unavailable || []}
            ruleIndicators={(xrayResult.detected_signals || []).map((sig: any) => ({
              category: sig.category,
              severity: sig.severity,
              sourceQuote: sig.source_quote,
              explanation: sig.explanation,
              context: sig.context,
            }))}
            modelAnalysis={xrayResult.ml_analysis}
            reputationFindings={{
              provider: xrayResult.url_analysis?.reputation_provider || 'unconfigured',
              status: xrayResult.url_analysis?.reputation_status || 'check_unavailable',
              detail: 'External reputation check was not run because commercial API key is unconfigured.',
            }}
            recommendedSteps={[
              xrayResult.risk_assessment?.risk_level === 'HIGH'
                ? 'Issue threat alert and file case report for infrastructure takedown.'
                : xrayResult.risk_assessment?.risk_level === 'INCONCLUSIVE'
                ? 'Attempt manual forensic reachability diagnostics in an isolated sandbox.'
                : 'Monitor domain for subsequent changes in financial promotion phrasing.',
              'Cross-reference referenced phone numbers and UPI VPAs with Network Detective graph.'
            ]}
            calculationBreakdown={xrayResult.risk_assessment?.calculation_breakdown}
            onSaveCase={handleSaveToCase}
            onExportReport={handleExportPdf}
            savedCaseRef={savedCaseRef}
          />
        </div>
      )}
    </div>
  );
};
