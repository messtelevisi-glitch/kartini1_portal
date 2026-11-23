import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ShieldAlert } from 'lucide-react';
import { PortalLayout } from '../../layouts/PortalLayout';
import { DataTable, type ColumnDef } from '../../components/ui/DataTable';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/ToastProvider';
import { apiRequest, getActiveAuthHeader } from '../../services/api';

interface AttemptMonitorRow {
  id: number;
  examId: number;
  examTitle: string;
  subjectName: string;
  studentNumber: string;
  studentName: string;
  className: string;
  startedAt: string;
  lastSyncAt: string;
  remainingSeconds: number;
  answeredCount: number;
  totalQuestions: number;
  violationCount: number;
  status: string;
  displayStatus: string;
  disqualificationReason: string | null;
  violations: {
    id: number;
    violationType: string;
    severity: string;
    description: string;
    occurredAt: string;
  }[];
}

function formatTimer(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

export function LiveMonitoringPage() {
  const { showToast } = useToast();
  const [attempts, setAttempts] = useState<AttemptMonitorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [selectedAttempt, setSelectedAttempt] = useState<AttemptMonitorRow | null>(null);

  const loadAttempts = useCallback(async () => {
    try {
      const rows = await apiRequest<AttemptMonitorRow[]>('/api/monitoring/attempts');
      setAttempts(rows);
    } catch (err: any) {
      showToast('error', 'Failed to load monitoring stream', err.message);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadAttempts();

    let ws: WebSocket | null = null;
    let closed = false;

    const connectWs = async () => {
      const authHeader = await getActiveAuthHeader();
      if (!authHeader || closed) return;
      const token = authHeader.replace(/^Bearer\s+/i, '');
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${proto}//${window.location.host}/ws/monitoring?token=${encodeURIComponent(token)}`);

      ws.onopen = () => setWsConnected(true);
      ws.onclose = () => setWsConnected(false);
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as {
            type: string;
            payload?: {
              studentName?: string;
              violationType?: string;
              severity?: string;
            };
          };
          if (msg.type === 'violation:recorded') {
            showToast(
              'warning',
              `Violation: ${msg.payload?.studentName || 'Participant'}`,
              `${msg.payload?.violationType} (${msg.payload?.severity})`
            );
          } else if (msg.type === 'attempt:disqualified') {
            showToast(
              'error',
              `Auto-Disqualified: ${msg.payload?.studentName || 'Participant'}`,
              msg.payload?.violationType
            );
          }
          if (msg.type !== 'monitoring:connected') {
            void loadAttempts();
          }
        } catch {
          // Ignore invalid socket frames
        }
      };
    };

    void connectWs();

    // Tick remainingSeconds locally every second for smooth display
    const timer = setInterval(() => {
      setAttempts((prev) =>
        prev.map((a) =>
          a.status === 'In Progress' && a.remainingSeconds > 0
            ? { ...a, remainingSeconds: a.remainingSeconds - 1 }
            : a
        )
      );
    }, 1000);

    return () => {
      closed = true;
      clearInterval(timer);
      if (ws) ws.close();
    };
  }, [loadAttempts, showToast]);

  const total = attempts.length;
  const inProgress = attempts.filter((a) => a.status === 'In Progress').length;
  const completed = attempts.filter((a) => ['Submitted', 'Completed'].includes(a.status)).length;
  const disqualified = attempts.filter((a) => a.status === 'Disqualified').length;
  const notStarted = attempts.filter((a) => a.status === 'Not Started').length;

  const columns: ColumnDef<AttemptMonitorRow>[] = [
    {
      key: 'studentNumber',
      header: 'Participant No.',
      render: (a) => <span className="font-mono text-xs font-semibold text-[#243B64] tabular-nums">{a.studentNumber}</span>,
    },
    {
      key: 'studentName',
      header: 'Student',
      render: (a) => (
        <div>
          <p className="font-medium text-slate-900">{a.studentName}</p>
          <p className="text-xs text-slate-500">
            Class {a.className} · {a.subjectName}
          </p>
        </div>
      ),
    },
    {
      key: 'startTime',
      header: 'Started At',
      render: (a) => (
        <span className="text-xs text-slate-600 tabular-nums">
          {new Date(a.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      ),
    },
    {
      key: 'remaining',
      header: 'Remaining Time',
      render: (a) => (
        <span className="font-mono text-xs font-semibold text-[#243B64] tabular-nums">
          {a.status === 'In Progress' ? formatTimer(a.remainingSeconds) : '00:00:00'}
        </span>
      ),
    },
    {
      key: 'progress',
      header: 'Progress',
      render: (a) => {
        const pct = a.totalQuestions > 0 ? Math.round((a.answeredCount / a.totalQuestions) * 100) : 0;
        return (
          <div className="w-44">
            <div className="flex justify-between text-[11px] text-slate-600 mb-1 tabular-nums">
              <span>
                {a.answeredCount} / {a.totalQuestions} Questions
              </span>
              <span>{pct}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-[#376FA6]" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      },
    },
    {
      key: 'violations',
      header: 'Violations',
      align: 'center',
      render: (a) => (
        <span
          className={`font-mono text-xs font-semibold tabular-nums ${
            a.violationCount >= 3
              ? 'text-red-700'
              : a.violationCount > 0
              ? 'text-amber-700'
              : 'text-slate-500'
          }`}
        >
          {a.violationCount}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (a) => {
        const color =
          a.displayStatus === 'Disqualified'
            ? 'text-red-700'
            : a.displayStatus === 'Connection Lost'
            ? 'text-amber-700'
            : a.displayStatus === 'Submitted' || a.displayStatus === 'Completed'
            ? 'text-emerald-700'
            : 'text-[#376FA6]';
        return <span className={`text-xs font-semibold ${color}`}>{a.displayStatus}</span>;
      },
    },
    {
      key: 'detail',
      header: 'Detail',
      align: 'right',
      render: (a) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedAttempt(a);
          }}
          className="text-xs font-medium text-[#376FA6] hover:underline"
        >
          Inspect
        </button>
      ),
    },
  ];

  return (
    <PortalLayout
      pageTitle="Live Exam Monitoring"
      pageSubtitle="Real-time WebSocket participant progress, connection sync, and anti-cheating violation stream"
      headerAction={
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
            <span
              className={`w-2 h-2 rounded-full ${
                wsConnected ? 'bg-emerald-600' : 'bg-amber-500'
              }`}
            />
            <span>{wsConnected ? 'Realtime Live' : 'Reconnecting'}</span>
          </span>
          <button
            type="button"
            onClick={() => void loadAttempts()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 bg-white hover:bg-slate-50 rounded-lg"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        {[
          ['Total Active Records', total],
          ['Not Started', notStarted],
          ['In Progress', inProgress],
          ['Completed', completed],
          ['Disqualified', disqualified],
        ].map(([label, val]) => (
          <div key={label as string} className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500">{label as string}</p>
            <p className="text-2xl font-bold text-[#243B64] mt-1 tabular-nums">{val as number}</p>
          </div>
        ))}
      </div>

      <DataTable
        data={attempts}
        columns={columns}
        keyField={(a) => a.id}
        loading={loading}
        searchPlaceholder="Search participant name, number, or exam..."
        searchFilter={(a, q) =>
          a.studentName.toLowerCase().includes(q) ||
          a.studentNumber.toLowerCase().includes(q) ||
          a.examTitle.toLowerCase().includes(q)
        }
        onRowClick={(a) => setSelectedAttempt(a)}
        emptyTitle="No active exam attempts"
        emptyDescription="Attempts appear automatically in real time as soon as students validate their exam token."
      />

      {/* Participant Detail Modal */}
      <Modal
        open={Boolean(selectedAttempt)}
        onClose={() => setSelectedAttempt(null)}
        title={`Participant Inspection — ${selectedAttempt?.studentName || ''}`}
        subtitle={`${selectedAttempt?.studentNumber || ''} · Class ${selectedAttempt?.className || ''} · ${selectedAttempt?.examTitle || ''}`}
      >
        {selectedAttempt && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-[#FAFBFD] border border-slate-200">
                <p className="text-slate-500">Status</p>
                <p className="font-semibold text-[#243B64] mt-0.5">{selectedAttempt.displayStatus}</p>
              </div>
              <div className="p-3 rounded-lg bg-[#FAFBFD] border border-slate-200">
                <p className="text-slate-500">Progress</p>
                <p className="font-semibold text-[#243B64] mt-0.5 tabular-nums">
                  {selectedAttempt.answeredCount} / {selectedAttempt.totalQuestions}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-[#FAFBFD] border border-slate-200">
                <p className="text-slate-500">Violations</p>
                <p className="font-semibold text-red-700 mt-0.5 tabular-nums">
                  {selectedAttempt.violationCount}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-[#FAFBFD] border border-slate-200">
                <p className="text-slate-500">Last Sync</p>
                <p className="font-semibold text-slate-700 mt-0.5 tabular-nums">
                  {new Date(selectedAttempt.lastSyncAt).toLocaleTimeString()}
                </p>
              </div>
            </div>

            {selectedAttempt.disqualificationReason && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                <strong>Disqualification Reason:</strong> {selectedAttempt.disqualificationReason}
              </div>
            )}

            <div>
              <h4 className="text-xs font-semibold text-[#243B64] mb-2 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-amber-600" />
                <span>Violation Timeline</span>
              </h4>
              {selectedAttempt.violations.length === 0 ? (
                <p className="text-xs text-slate-500 p-4 border border-slate-200 rounded-lg text-center">
                  No security violations recorded for this attempt.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                  {selectedAttempt.violations.map((v) => (
                    <div key={v.id} className="p-3 text-xs flex items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold text-slate-800">
                          {v.severity}: {v.violationType}
                        </p>
                        <p className="text-slate-500 mt-0.5">{v.description}</p>
                      </div>
                      <span className="font-mono text-slate-500 tabular-nums shrink-0">
                        {new Date(v.occurredAt).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </PortalLayout>
  );
}
