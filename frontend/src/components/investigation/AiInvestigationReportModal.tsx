import React, { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  AlertTriangle,
  Download,
  Printer,
  ExternalLink,
  Clock,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Brain,
  Globe,
  MessageSquare,
  FileText,
  HelpCircle,
  Layers,
  Database,
  Lock,
  X
} from 'lucide-react';
import { InvestigationReport, ThreatIndicatorItem } from '../../types';
import { api } from '../../services/api';

interface AiInvestigationReportModalProps {
  report: InvestigationReport | null;
  isOpen: boolean;
  onClose: () => void;
  onViewCase?: (scanId?: string) => void;
}

export const AiInvestigationReportModal: React.FC<AiInvestigationReportModalProps> = ({
  report,
  isOpen,
  onClose,
  onViewCase,
}) => {
  const [copiedText, setCopiedText] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>('indicators');

  if (!isOpen || !report) return null;

  const handleCopySummary = () => {
    navigator.clipboard.writeText(report.target_summary || '');
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  const getVerdictBadge = (verdict: string) => {
    switch (verdict) {
      case 'Suspicious':
        return {
          bg: 'bg-red-900/30 border-red-700/60 text-red-300',
          icon: <ShieldAlert className="w-5 h-5 text-red-400 mr-2 flex-shrink-0" />,
          label: 'SUSPICIOUS (CONFIRMED PATTERNS)'
        };
      case 'Likely Suspicious':
        return {
          bg: 'bg-amber-900/30 border-amber-700/60 text-amber-300',
          icon: <AlertTriangle className="w-5 h-5 text-amber-400 mr-2 flex-shrink-0" />,
          label: 'LIKELY SUSPICIOUS (HIGH PROBABILITY)'
        };
      case 'Inconclusive':
        return {
          bg: 'bg-yellow-900/30 border-yellow-700/60 text-yellow-300',
          icon: <ShieldQuestion className="w-5 h-5 text-yellow-400 mr-2 flex-shrink-0" />,
          label: 'INCONCLUSIVE (INSUFFICIENT EVIDENCE)'
        };
      default:
        return {
          bg: 'bg-emerald-900/30 border-emerald-700/60 text-emerald-300',
          icon: <ShieldCheck className="w-5 h-5 text-emerald-400 mr-2 flex-shrink-0" />,
          label: 'NO SIGNIFICANT THREAT DETECTED'
        };
    }
  };

  const getSeverityStyle = (sev: string) => {
    switch (sev.toLowerCase()) {
      case 'critical':
        return 'bg-red-500/20 text-red-300 border-red-500/40';
      case 'high':
        return 'bg-orange-500/20 text-orange-300 border-orange-500/40';
      case 'medium':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'low':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      default:
        return 'bg-slate-500/20 text-slate-300 border-slate-500/40';
    }
  };

  const getVerificationStatusBadge = (status: string) => {
    switch (status) {
      case 'Verified':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'Model-Inferred':
        return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
      case 'Dataset-Provided':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      default:
        return 'bg-slate-500/10 text-slate-400 border-slate-500/30';
    }
  };

  const verdictBadge = getVerdictBadge(report.verdict);
  const scorePercent = Math.min(100, Math.max(0, report.risk_score));
  const exportJsonUrl = api.getReportExportJsonUrl(report.report_id);
  const exportHtmlUrl = api.getReportExportHtmlUrl(report.report_id);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex justify-center items-start p-4 sm:p-6 md:p-10">
      <div className="relative w-full max-w-5xl bg-[#13171f] border border-[#262c38] rounded-xl shadow-2xl text-slate-200 overflow-hidden my-auto">
        
        {/* Top Control Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#262c38] bg-[#0c0f14]">
          <div className="flex items-center space-x-3">
            <span className="px-2.5 py-1 text-xs font-mono font-bold tracking-wider uppercase bg-[#1e2533] text-cyan-400 border border-cyan-800/40 rounded">
              AI INVESTIGATION REPORT
            </span>
            <span className="font-mono text-sm text-slate-400">
              {report.report_id}
            </span>
            {report.provenance?.provenance_badge && (
              <span className={`px-2 py-0.5 text-xs font-mono rounded border ${
                report.provenance.provenance_badge.includes('REPLAY') 
                  ? 'bg-purple-900/40 text-purple-300 border-purple-600/50'
                  : report.provenance.provenance_badge.includes('DEMO')
                  ? 'bg-amber-900/40 text-amber-300 border-amber-600/50'
                  : 'bg-emerald-900/40 text-emerald-300 border-emerald-600/50'
              }`}>
                {report.provenance.provenance_badge}
              </span>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            <a
              href={exportJsonUrl}
              download={`${report.report_id}.json`}
              className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg bg-[#1a2130] hover:bg-[#252f44] text-slate-300 border border-[#2b354a] transition-colors"
              title="Download structured JSON report"
            >
              <Download className="w-3.5 h-3.5 mr-1.5 text-cyan-400" />
              Export JSON
            </a>
            <button
              onClick={() => window.open(exportHtmlUrl, '_blank')}
              className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg bg-[#1a2130] hover:bg-[#252f44] text-slate-300 border border-[#2b354a] transition-colors"
              title="Printable / PDF report view"
            >
              <Printer className="w-3.5 h-3.5 mr-1.5 text-cyan-400" />
              Print / PDF
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-[#262c38] rounded-lg transition-colors"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Content */}
        <div className="p-6 sm:p-8 space-y-8 max-h-[82vh] overflow-y-auto">

          {/* Section A: Scan Summary Hero */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-[#0f131a] border border-[#212735] rounded-xl p-6">
            <div className="md:col-span-2 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className={`inline-flex items-center px-3.5 py-1 rounded-full border text-xs font-bold tracking-wide uppercase ${verdictBadge.bg}`}>
                  {verdictBadge.icon}
                  {verdictBadge.label}
                </div>
                <span className={`px-2.5 py-0.5 text-xs font-bold font-mono uppercase rounded border ${getSeverityStyle(report.severity)}`}>
                  {report.severity} SEVERITY
                </span>
                <span className="px-2.5 py-0.5 text-xs font-mono uppercase rounded border border-slate-700 bg-slate-800 text-slate-300">
                  {report.input_type.replace('_', ' ')}
                </span>
              </div>

              <div>
                <div className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-1">Target Object Under Investigation:</div>
                <div className="flex items-center space-x-2 bg-[#171c26] border border-[#262f40] px-3.5 py-2.5 rounded-lg text-sm text-slate-200 font-mono break-all">
                  <span className="flex-1 truncate">{report.target_summary}</span>
                  <button
                    onClick={handleCopySummary}
                    className="p-1 hover:text-cyan-400 transition-colors flex-shrink-0"
                    title="Copy Target Summary"
                  >
                    {copiedText ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-mono text-slate-400 pt-1">
                <div>
                  <span className="text-slate-500 block">SCAN DATE:</span>
                  <span className="text-slate-200 font-medium">{new Date(report.created_at).toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">SCAN ID:</span>
                  <span className="text-slate-200 font-medium">{report.scan_id || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">SCAN STATUS:</span>
                  <span className="text-emerald-400 font-medium flex items-center">
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    {report.scan_status}
                  </span>
                </div>
              </div>
            </div>

            {/* Large Calibrated Risk Score Gauge */}
            <div className="flex flex-col items-center justify-center p-4 bg-[#141923] border border-[#262f40] rounded-xl text-center">
              <div className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-2">CALIBRATED COMPOSITE RISK</div>
              <div className="relative flex items-center justify-center my-1">
                <div className="text-5xl font-black font-mono tracking-tight text-white">
                  {Math.round(report.risk_score)}
                  <span className="text-lg font-normal text-slate-500">/100</span>
                </div>
              </div>
              <div className="w-full bg-[#202736] h-2.5 rounded-full overflow-hidden mt-3 mb-2">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    scorePercent >= 80 ? 'bg-red-500' :
                    scorePercent >= 60 ? 'bg-orange-500' :
                    scorePercent >= 40 ? 'bg-amber-400' :
                    scorePercent >= 20 ? 'bg-emerald-400' : 'bg-slate-400'
                  }`}
                  style={{ width: `${scorePercent}%` }}
                />
              </div>
              <div className="flex justify-between w-full text-[11px] font-mono text-slate-500">
                <span>0 SAFE</span>
                <span>50 MED</span>
                <span>100 CRIT</span>
              </div>
              {report.confidence_score !== null && report.confidence_score !== undefined && (
                <div className="mt-3 text-xs font-mono text-cyan-400 bg-cyan-950/40 border border-cyan-800/40 px-3 py-1 rounded">
                  CONFIDENCE: {Math.round(report.confidence_score * 100)}%
                </div>
              )}
            </div>
          </div>

          {/* Section B: Executive Summary */}
          <div className="bg-[#10141c] border border-[#262c38] rounded-xl p-6">
            <h3 className="text-sm font-mono uppercase font-bold tracking-wider text-cyan-400 mb-3 flex items-center">
              <FileText className="w-4 h-4 mr-2" />
              Executive Summary
            </h3>
            <p className="text-sm text-slate-300 leading-relaxed font-sans bg-[#151a24] p-4 rounded-lg border border-[#212735]">
              {report.executive_summary}
            </p>
          </div>

          {/* Section C: Threat Indicators and Evidence Table */}
          <div className="bg-[#10141c] border border-[#262c38] rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-[#212735] flex justify-between items-center bg-[#0d1017]">
              <h3 className="text-sm font-mono uppercase font-bold tracking-wider text-slate-200 flex items-center">
                <AlertTriangle className="w-4 h-4 mr-2 text-amber-400" />
                Detected Threat Indicators & Forensic Evidence ({report.indicators.length})
              </h3>
            </div>
            
            <div className="overflow-x-auto">
              {report.indicators.length === 0 ? (
                <div className="p-8 text-center text-sm font-mono text-slate-500">
                  No explicit fraud indicators or heuristic rule anomalies detected in this record.
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#212735] bg-[#141923] text-slate-400 font-mono uppercase">
                      <th className="py-3 px-4">Indicator</th>
                      <th className="py-3 px-4">Observed Evidence</th>
                      <th className="py-3 px-4">Why It Matters</th>
                      <th className="py-3 px-4">Source</th>
                      <th className="py-3 px-4">Verification</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e2430] font-sans">
                    {report.indicators.map((ind, idx) => (
                      <tr key={idx} className="hover:bg-[#151a24] transition-colors">
                        <td className="py-3.5 px-4 font-medium text-slate-200 font-mono whitespace-nowrap">
                          <span className={`inline-block w-2 h-2 rounded-full mr-2 ${
                            ind.severity === 'Critical' ? 'bg-red-400' :
                            ind.severity === 'High' ? 'bg-orange-400' :
                            ind.severity === 'Medium' ? 'bg-amber-400' : 'bg-emerald-400'
                          }`} />
                          {ind.indicator_name}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-cyan-300 break-all max-w-xs">
                          {ind.observed_evidence}
                        </td>
                        <td className="py-3.5 px-4 text-slate-300 text-xs">
                          {ind.why_it_matters}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-400 whitespace-nowrap">
                          {ind.evidence_source}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap font-mono">
                          <span className={`px-2 py-0.5 rounded text-[11px] border font-medium ${getVerificationStatusBadge(ind.verification_status)}`}>
                            {ind.verification_status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Section D: AI Model Analysis */}
          {report.model_analysis && (
            <div className="bg-[#10141c] border border-[#262c38] rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-mono uppercase font-bold tracking-wider text-cyan-400 flex items-center">
                  <Brain className="w-4 h-4 mr-2" />
                  AI Machine Learning Model Analysis
                </h3>
                <span className="text-xs font-mono text-slate-500">
                  {report.model_analysis.model_name} ({report.model_analysis.model_version || 'v2.0'})
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-[#151a24] p-4 rounded-lg border border-[#212735]">
                  <div className="text-xs font-mono text-slate-500 uppercase">MODEL PREDICTION</div>
                  <div className={`text-lg font-bold font-mono mt-1 uppercase ${
                    report.model_analysis.prediction === 'suspicious' ? 'text-red-400' : 'text-emerald-400'
                  }`}>
                    {report.model_analysis.prediction}
                  </div>
                </div>

                <div className="bg-[#151a24] p-4 rounded-lg border border-[#212735]">
                  <div className="text-xs font-mono text-slate-500 uppercase">RAW PROBABILITY SIGNAL</div>
                  <div className="text-lg font-bold font-mono text-cyan-400 mt-1">
                    {report.model_analysis.suspicious_probability !== null && report.model_analysis.suspicious_probability !== undefined 
                      ? `${(report.model_analysis.suspicious_probability * 100).toFixed(1)}%`
                      : 'N/A (Text Model Skipped)'}
                  </div>
                </div>

                <div className="bg-[#151a24] p-4 rounded-lg border border-[#212735]">
                  <div className="text-xs font-mono text-slate-500 uppercase">DECISION THRESHOLD</div>
                  <div className="text-lg font-bold font-mono text-slate-300 mt-1">
                    {report.model_analysis.prediction_threshold ? `${(report.model_analysis.prediction_threshold * 100).toFixed(0)}%` : '65%'}
                  </div>
                </div>
              </div>

              {report.model_analysis.detected_patterns && report.model_analysis.detected_patterns.length > 0 && (
                <div>
                  <div className="text-xs font-mono text-slate-400 mb-2 uppercase">DETECTED PATTERN PHRASES:</div>
                  <div className="flex flex-wrap gap-2">
                    {report.model_analysis.detected_patterns.map((pat, idx) => (
                      <span key={idx} className="px-2.5 py-1 text-xs font-mono bg-red-950/30 text-red-300 border border-red-800/40 rounded">
                        "{pat.token}"
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-[#0b0e14] border border-[#1d232e] rounded-lg p-3 text-xs font-mono text-slate-400 space-y-1">
                <span className="text-slate-500 uppercase block font-bold mb-1">Model Limitations & Ground Truth Boundary:</span>
                {report.model_analysis.important_limitations.map((lim, idx) => (
                  <div key={idx} className="flex items-start">
                    <span className="text-amber-500 mr-2">•</span>
                    <span>{lim}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section E: URL and Domain Analysis (when applicable) */}
          {report.url_analysis && (
            <div className="bg-[#10141c] border border-[#262c38] rounded-xl p-6 space-y-4">
              <h3 className="text-sm font-mono uppercase font-bold tracking-wider text-slate-200 flex items-center">
                <Globe className="w-4 h-4 mr-2 text-cyan-400" />
                URL & Domain Technical Analysis
              </h3>
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
                <div className="bg-[#151a24] p-3 rounded border border-[#212735]">
                  <span className="text-slate-500 block">HOSTNAME:</span>
                  <span className="text-slate-200 break-all">{report.url_analysis.hostname || 'None'}</span>
                </div>
                <div className="bg-[#151a24] p-3 rounded border border-[#212735]">
                  <span className="text-slate-500 block">HTTPS STATUS:</span>
                  <span className={report.url_analysis.https_status.includes('HTTPS') ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                    {report.url_analysis.https_status}
                  </span>
                </div>
                <div className="bg-[#151a24] p-3 rounded border border-[#212735]">
                  <span className="text-slate-500 block">URL LENGTH:</span>
                  <span className="text-slate-200">{report.url_analysis.url_length} chars</span>
                </div>
                <div className="bg-[#151a24] p-3 rounded border border-[#212735]">
                  <span className="text-slate-500 block">IP HOSTNAME (SSRF):</span>
                  <span className={report.url_analysis.is_ip_hostname ? 'text-red-400 font-bold' : 'text-emerald-400'}>
                    {report.url_analysis.is_ip_hostname ? 'DETECTED (BLOCKED)' : 'None (Safe Domain)'}
                  </span>
                </div>
              </div>

              {report.url_analysis.external_reputation && (
                <div className="text-xs font-mono text-slate-400 bg-[#0d1017] p-3 rounded border border-[#212735] flex items-center justify-between">
                  <div>
                    <span className="text-slate-500">THREAT REPUTATION FEED: </span>
                    <span className="text-slate-300 font-bold uppercase">{report.url_analysis.external_reputation.provider}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">STATUS: </span>
                    <span className="text-amber-400 font-mono uppercase">{report.url_analysis.external_reputation.status}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Section F: Message Analysis (when applicable) */}
          {report.message_analysis && (
            <div className="bg-[#10141c] border border-[#262c38] rounded-xl p-6 space-y-4">
              <h3 className="text-sm font-mono uppercase font-bold tracking-wider text-slate-200 flex items-center">
                <MessageSquare className="w-4 h-4 mr-2 text-cyan-400" />
                Message Content & Behavioral Linguistics
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
                <div className="bg-[#151a24] p-4 rounded-lg border border-[#212735]">
                  <span className="text-slate-500 uppercase block mb-1">Urgency & Pressure Indicators:</span>
                  {report.message_analysis.urgency_or_threats.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {report.message_analysis.urgency_or_threats.map((u, i) => (
                        <span key={i} className="px-2 py-0.5 bg-amber-950/40 text-amber-300 border border-amber-700/50 rounded">
                          "{u}"
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-slate-500 italic">No artificial urgency detected.</span>
                  )}
                </div>

                <div className="bg-[#151a24] p-4 rounded-lg border border-[#212735]">
                  <span className="text-slate-500 uppercase block mb-1">Credential / Payment Solicitation:</span>
                  {report.message_analysis.credential_or_payment_requests.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {report.message_analysis.credential_or_payment_requests.map((c, i) => (
                        <span key={i} className="px-2 py-0.5 bg-red-950/40 text-red-300 border border-red-700/50 rounded">
                          "{c}"
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-slate-500 italic">No direct credential requests detected.</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Section G: Risk Breakdown */}
          <div className="bg-[#10141c] border border-[#262c38] rounded-xl p-6 space-y-4">
            <h3 className="text-sm font-mono uppercase font-bold tracking-wider text-slate-200 flex items-center">
              <Layers className="w-4 h-4 mr-2 text-cyan-400" />
              Risk Factor Breakdown & Scoring Methodology
            </h3>

            <div className="space-y-3">
              {report.risk_breakdown.map((rb, idx) => (
                <div key={idx} className="bg-[#151a24] p-3.5 rounded-lg border border-[#212735]">
                  <div className="flex justify-between items-center mb-1 text-xs font-mono">
                    <span className="text-slate-300 font-bold">{rb.category}</span>
                    <span className={rb.status === 'Evaluated' ? 'text-cyan-400 font-bold' : 'text-slate-500'}>
                      {rb.score !== null && rb.score !== undefined ? `${Math.round(rb.score)}/100` : rb.status}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 font-sans">{rb.details}</div>
                </div>
              ))}
            </div>

            <p className="text-xs text-slate-500 font-mono italic">
              {report.calculation_explanation}
            </p>
          </div>

          {/* Section H & I: Potential Impact and Recommended Actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-[#10141c] border border-[#262c38] rounded-xl p-6 space-y-3">
              <h3 className="text-sm font-mono uppercase font-bold tracking-wider text-red-400 flex items-center">
                <AlertTriangle className="w-4 h-4 mr-2" />
                Potential Fraud Impacts
              </h3>
              <ul className="space-y-2 text-xs text-slate-300 font-sans">
                {report.potential_impacts.map((imp, idx) => (
                  <li key={idx} className="flex items-start bg-[#151a24] p-2.5 rounded border border-[#212735]">
                    <span className="text-red-400 mr-2 font-bold font-mono">[{idx + 1}]</span>
                    <span>{imp}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-[#10141c] border border-[#262c38] rounded-xl p-6 space-y-3">
              <h3 className="text-sm font-mono uppercase font-bold tracking-wider text-emerald-400 flex items-center">
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Recommended Defensive Actions
              </h3>
              <ul className="space-y-2 text-xs text-slate-300 font-sans">
                {report.recommended_actions.map((act, idx) => (
                  <li key={idx} className="flex items-start bg-[#151a24] p-2.5 rounded border border-[#212735]">
                    <span className="text-emerald-400 mr-2 font-bold font-mono">[{idx + 1}]</span>
                    <span>{act}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Section J: Evidence Timeline */}
          {report.evidence_timeline && report.evidence_timeline.length > 0 && (
            <div className="bg-[#10141c] border border-[#262c38] rounded-xl p-6 space-y-3">
              <h3 className="text-sm font-mono uppercase font-bold tracking-wider text-slate-200 flex items-center">
                <Clock className="w-4 h-4 mr-2 text-cyan-400" />
                Diagnostic Evidence Timeline
              </h3>
              <div className="space-y-2 font-mono text-xs">
                {report.evidence_timeline.map((item, idx) => (
                  <div key={idx} className="flex items-center space-x-3 bg-[#151a24] p-2.5 rounded border border-[#212735]">
                    <span className="text-slate-500 text-[11px] whitespace-nowrap">{new Date(item.timestamp).toLocaleTimeString()}</span>
                    <span className="text-cyan-400 font-bold whitespace-nowrap">{item.event}</span>
                    {item.details && <span className="text-slate-400 truncate">({item.details})</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section K: Limitations & Data Provenance */}
          <div className="bg-[#0a0d12] border border-[#1c222c] rounded-xl p-6 space-y-4 text-xs font-mono text-slate-400">
            <div className="flex items-center justify-between border-b border-[#1c222c] pb-3">
              <span className="uppercase font-bold tracking-wider text-slate-300 flex items-center">
                <Database className="w-4 h-4 mr-2 text-purple-400" />
                Data Provenance & Audit Disclosures
              </span>
              <span className="px-2 py-0.5 rounded bg-[#161c26] text-slate-300 border border-[#2b3548]">
                SOURCE: {report.provenance?.data_source || report.source_type}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <span className="text-slate-500 uppercase block mb-1 font-bold">Checks Executed:</span>
                <ul className="space-y-1">
                  {report.checks_performed.map((cp, idx) => (
                    <li key={idx} className="text-emerald-400/90 flex items-center">
                      <Check className="w-3.5 h-3.5 mr-1 flex-shrink-0" />
                      <span>{cp.check}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <span className="text-slate-500 uppercase block mb-1 font-bold">Unchecked / Unavailable Feeds:</span>
                <ul className="space-y-1">
                  {report.unavailable_checks.map((uc, idx) => (
                    <li key={idx} className="text-slate-500 flex items-center">
                      <span className="w-2 h-2 rounded-full bg-slate-600 mr-2 flex-shrink-0" />
                      <span>{uc.check} ({uc.reason || 'Unconfigured'})</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="pt-2 border-t border-[#1c222c] text-[11px] text-slate-500 leading-relaxed">
              <span className="font-bold text-slate-400">LEGAL & TECHNICAL DISCLAIMER: </span>
              FraudScope AI reports represent investigative and statistical intelligence derived from automated heuristic rule evaluation and baseline NLP classification. A low risk score does not certify complete safety or legality. Findings should be corroborated by authorized forensic personnel prior to administrative or judicial action.
            </div>
          </div>

        </div>

        {/* Bottom Actions Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#262c38] bg-[#0c0f14]">
          <span className="text-xs font-mono text-slate-500">
            FRAUDSCOPE AI INVESTIGATION REPORT • {report.report_id}
          </span>
          <div className="flex items-center space-x-3">
            {onViewCase && report.scan_id && (
              <button
                onClick={() => onViewCase(report.scan_id || undefined)}
                className="inline-flex items-center px-4 py-2 text-xs font-medium rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                View Linked Case File
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-[#1f2635] hover:bg-[#2b3548] text-slate-300 transition-colors"
            >
              Close
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
