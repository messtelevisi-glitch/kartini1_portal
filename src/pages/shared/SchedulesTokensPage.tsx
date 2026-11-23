import React, { useCallback, useEffect, useState } from 'react';
import { Copy, KeyRound, Plus, Power, Trash2 } from 'lucide-react';
import { PortalLayout } from '../../layouts/PortalLayout';
import { DataTable, type ColumnDef } from '../../components/ui/DataTable';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/ToastProvider';
import { useAuth } from '../../features/auth/AuthContext';
import { apiRequest } from '../../services/api';
import type { ExamItem, ExamScheduleItem, ExamStatus } from '../../types/exam';

export function SchedulesTokensPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isAdmin = user?.role === 'admin';

  const [schedules, setSchedules] = useState<ExamScheduleItem[]>([]);
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [examId, setExamId] = useState<number>(0);
  const [className, setClassName] = useState('8A');
  const [examDate, setExamDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startTimeLocal, setStartTimeLocal] = useState(() => {
    const d = new Date();
    return `${d.toISOString().slice(0, 10)}T07:00`;
  });
  const [endTimeLocal, setEndTimeLocal] = useState(() => {
    const d = new Date(Date.now() + 4 * 60 * 60 * 1000);
    return `${d.toISOString().slice(0, 10)}T23:59`;
  });
  const [durationMinutes, setDurationMinutes] = useState(90);
  const [proctorName, setProctorName] = useState('');
  const [releaseStatus, setReleaseStatus] = useState<ExamStatus>('Ongoing');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [schedData, examData] = await Promise.all([
        apiRequest<ExamScheduleItem[]>('/api/schedules'),
        apiRequest<ExamItem[]>('/api/exams'),
      ]);
      setSchedules(schedData);
      setExams(examData);
      if (examData.length > 0 && examId === 0) {
        setExamId(examData[0].id);
        setClassName(examData[0].className);
        setDurationMinutes(examData[0].durationMinutes);
      }
    } catch (err: any) {
      showToast('error', 'Failed to load schedules', err.message);
    } finally {
      setLoading(false);
    }
  }, [showToast, examId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiRequest('/api/schedules', {
        method: 'POST',
        body: JSON.stringify({
          examId,
          className,
          examDate,
          startTime: new Date(startTimeLocal).toISOString(),
          endTime: new Date(endTimeLocal).toISOString(),
          durationMinutes: Number(durationMinutes),
          proctorName,
          releaseStatus,
        }),
      });
      showToast('success', 'Schedule created');
      setModalOpen(false);
      await loadData();
    } catch (err: any) {
      showToast('error', 'Failed to save schedule', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateToken = async (scheduleId: number) => {
    try {
      const tok = await apiRequest<{ tokenCode: string }>('/api/tokens/generate', {
        method: 'POST',
        body: JSON.stringify({ scheduleId, validMinutes: 180 }),
      });
      showToast('success', 'Session Token Generated', `Token: ${tok.tokenCode}`);
      await loadData();
    } catch (err: any) {
      showToast('error', 'Token generation failed', err.message);
    }
  };

  const handleToggleToken = async (tokenId: number) => {
    try {
      await apiRequest(`/api/tokens/${tokenId}/toggle`, { method: 'PATCH' });
      showToast('info', 'Token status updated');
      await loadData();
    } catch (err: any) {
      showToast('error', 'Update failed', err.message);
    }
  };

  const handleReleaseChange = async (scheduleId: number, nextStatus: ExamStatus) => {
    try {
      await apiRequest(`/api/schedules/${scheduleId}`, {
        method: 'PATCH',
        body: JSON.stringify({ releaseStatus: nextStatus }),
      });
      showToast('success', 'Schedule status updated', nextStatus);
      await loadData();
    } catch (err: any) {
      showToast('error', 'Update failed', err.message);
    }
  };

  const handleDeleteSchedule = async (scheduleId: number) => {
    try {
      await apiRequest(`/api/schedules/${scheduleId}`, { method: 'DELETE' });
      showToast('success', 'Schedule deleted');
      await loadData();
    } catch (err: any) {
      showToast('error', 'Delete failed', err.message);
    }
  };

  const columns: ColumnDef<ExamScheduleItem>[] = [
    {
      key: 'exam',
      header: 'Examination & Subject',
      render: (s) => (
        <div>
          <p className="font-semibold text-[#243B64]">{s.examTitle}</p>
          <p className="text-xs text-slate-500">
            {s.subjectCode} — {s.subjectName} · Class {s.className}
          </p>
        </div>
      ),
    },
    {
      key: 'window',
      header: 'Schedule Window',
      render: (s) => (
        <div className="text-xs text-slate-700 tabular-nums">
          <p className="font-medium">{s.examDate}</p>
          <p className="text-slate-500">
            {new Date(s.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} –{' '}
            {new Date(s.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({s.durationMinutes}m)
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Release Status',
      render: (s) => (
        <select
          value={s.releaseStatus}
          onChange={(e) => handleReleaseChange(s.id, e.target.value as ExamStatus)}
          className="px-2.5 py-1 text-xs font-medium border border-slate-200 rounded-md bg-white"
        >
          {['Draft', 'Scheduled', 'Published', 'Ongoing', 'Completed', 'Cancelled'].map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>
      ),
    },
    {
      key: 'token',
      header: 'Session Token',
      render: (s) =>
        isAdmin ? (
          s.activeToken ? (
            <div className="flex items-center gap-2">
              <span
                className={`font-mono text-xs font-bold tracking-wider ${
                  s.activeToken.isActive ? 'text-[#243B64]' : 'text-slate-400 line-through'
                }`}
              >
                {s.activeToken.tokenCode}
              </span>
              <button
                type="button"
                title="Copy token"
                onClick={() => {
                  void navigator.clipboard.writeText(s.activeToken!.tokenCode);
                  showToast('info', 'Token copied', s.activeToken!.tokenCode);
                }}
                className="p-1 text-slate-500 hover:text-slate-800"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                title={s.activeToken.isActive ? 'Deactivate token' : 'Activate token'}
                onClick={() => handleToggleToken(s.activeToken!.id)}
                className="p-1 text-slate-500 hover:text-[#376FA6]"
              >
                <Power className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleGenerateToken(s.id)}
                className="text-xs text-[#376FA6] hover:underline"
              >
                Regenerate
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => handleGenerateToken(s.id)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#243B64] bg-[#EAF3FA] hover:bg-[#dcebf7] rounded-md"
            >
              <KeyRound className="w-3 h-3" />
              <span>Generate Token</span>
            </button>
          )
        ) : (
          <span className="text-xs text-slate-500">
            {s.activeToken?.isActive ? 'Active (Managed by Admin)' : 'Not issued'}
          </span>
        ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (s) => (
        <button
          type="button"
          onClick={() => handleDeleteSchedule(s.id)}
          className="p-1.5 rounded-lg border border-slate-200 text-red-600 hover:bg-red-50"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      ),
    },
  ];

  return (
    <PortalLayout
      pageTitle="Jadwal & Token Ujian"
      pageSubtitle="Release exam schedules with server-enforced time windows and session-bound access tokens"
      headerAction={
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#243B64] rounded-lg whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>Schedule Exam</span>
        </button>
      }
    >
      <DataTable
        data={schedules}
        columns={columns}
        keyField={(s) => s.id}
        loading={loading}
        searchPlaceholder="Search scheduled exams..."
        searchFilter={(s, q) =>
          (s.examTitle || '').toLowerCase().includes(q) ||
          (s.subjectName || '').toLowerCase().includes(q) ||
          s.className.toLowerCase().includes(q)
        }
        emptyTitle="No exam schedules published"
        emptyDescription="Schedule an examination and generate an active session token so students can enter."
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Schedule & Release Examination"
      >
        <form id="schedule-form" onSubmit={handleCreateSchedule} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Select Examination</label>
            <select
              value={examId}
              onChange={(e) => {
                const id = Number(e.target.value);
                setExamId(id);
                const found = exams.find((x) => x.id === id);
                if (found) {
                  setClassName(found.className);
                  setDurationMinutes(found.durationMinutes);
                }
              }}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            >
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.title} ({ex.subjectCode})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Target Class (or ALL)</label>
              <input
                type="text"
                required
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Exam Date</label>
              <input
                type="date"
                required
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Window Start</label>
              <input
                type="datetime-local"
                required
                value={startTimeLocal}
                onChange={(e) => setStartTimeLocal(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Window End</label>
              <input
                type="datetime-local"
                required
                value={endTimeLocal}
                onChange={(e) => setEndTimeLocal(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Duration (minutes)</label>
              <input
                type="number"
                min={5}
                max={360}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Release Status</label>
              <select
                value={releaseStatus}
                onChange={(e) => setReleaseStatus(e.target.value as ExamStatus)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              >
                <option value="Draft">Draft</option>
                <option value="Scheduled">Scheduled</option>
                <option value="Published">Published</option>
                <option value="Ongoing">Ongoing</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Proctor Name (Optional)</label>
            <input
              type="text"
              value={proctorName}
              onChange={(e) => setProctorName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
          </div>
        </form>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setModalOpen(false)}
            className="px-4 py-2 text-sm border border-slate-200 rounded-lg"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="schedule-form"
            disabled={saving}
            className="px-4 py-2 text-sm font-semibold text-white bg-[#243B64] rounded-lg"
          >
            {saving ? 'Saving...' : 'Save Schedule'}
          </button>
        </div>
      </Modal>
    </PortalLayout>
  );
}
