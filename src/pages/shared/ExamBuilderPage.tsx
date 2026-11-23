import React, { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { PortalLayout } from '../../layouts/PortalLayout';
import { DataTable, type ColumnDef } from '../../components/ui/DataTable';
import { ConfirmModal, Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/ToastProvider';
import { apiRequest } from '../../services/api';
import type { ExamItem, ExamStatus, QuestionItem, SubjectItem } from '../../types/exam';

const EXAM_TYPES = [
  'Ujian Tengah Semester',
  'Ujian Akhir Semester',
  'Ujian Sekolah',
  'Ujian Harian',
  'Ujian Praktik',
  'Try Out',
];

export function ExamBuilderPage() {
  const { showToast } = useToast();
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ExamItem | null>(null);
  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState<number>(0);
  const [className, setClassName] = useState('8A');
  const [semester, setSemester] = useState('Ganjil');
  const [academicYear, setAcademicYear] = useState('2026/2027');
  const [examType, setExamType] = useState('Ujian Akhir Semester');
  const [durationMinutes, setDurationMinutes] = useState(90);
  const [instructions, setInstructions] = useState(
    'Read each question carefully. Maintain full-screen mode throughout the examination.'
  );
  const [status, setStatus] = useState<ExamStatus>('Published');
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [shuffleOptions, setShuffleOptions] = useState(false);
  const [allowPrevious, setAllowPrevious] = useState(true);
  const [allowMarkReview, setAllowMarkReview] = useState(true);
  const [requireFullscreen, setRequireFullscreen] = useState(true);
  const [antiCheatingEnabled, setAntiCheatingEnabled] = useState(true);
  const [autosaveEnabled, setAutosaveEnabled] = useState(true);
  const [autoSubmitEnabled, setAutoSubmitEnabled] = useState(true);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ExamItem | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [eData, sData, qData] = await Promise.all([
        apiRequest<ExamItem[]>('/api/exams'),
        apiRequest<SubjectItem[]>('/api/subjects'),
        apiRequest<QuestionItem[]>('/api/questions'),
      ]);
      setExams(eData);
      setSubjects(sData);
      setQuestions(qData);
      if (sData.length > 0 && subjectId === 0) setSubjectId(sData[0].id);
    } catch (err: any) {
      showToast('error', 'Failed to load exams', err.message);
    } finally {
      setLoading(false);
    }
  }, [showToast, subjectId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openCreate = () => {
    setEditing(null);
    setTitle('');
    setSubjectId(subjects[0]?.id ?? 0);
    setClassName('8A');
    setSemester('Ganjil');
    setAcademicYear('2026/2027');
    setExamType('Ujian Akhir Semester');
    setDurationMinutes(90);
    setStatus('Published');
    setShuffleQuestions(false);
    setShuffleOptions(false);
    setAllowPrevious(true);
    setAllowMarkReview(true);
    setRequireFullscreen(true);
    setAntiCheatingEnabled(true);
    setAutosaveEnabled(true);
    setAutoSubmitEnabled(true);
    setSelectedQuestionIds([]);
    setModalOpen(true);
  };

  const openEdit = (ex: ExamItem) => {
    setEditing(ex);
    setTitle(ex.title);
    setSubjectId(ex.subjectId);
    setClassName(ex.className);
    setSemester(ex.semester);
    setAcademicYear(ex.academicYear);
    setExamType(ex.examType);
    setDurationMinutes(ex.durationMinutes);
    setInstructions(ex.instructions);
    setStatus(ex.status);
    setShuffleQuestions(ex.shuffleQuestions);
    setShuffleOptions(ex.shuffleOptions);
    setAllowPrevious(ex.allowPrevious);
    setAllowMarkReview(ex.allowMarkReview);
    setRequireFullscreen(ex.requireFullscreen);
    setAntiCheatingEnabled(ex.antiCheatingEnabled);
    setAutosaveEnabled(ex.autosaveEnabled);
    setAutoSubmitEnabled(ex.autoSubmitEnabled);
    setSelectedQuestionIds(ex.questionIds || []);
    setModalOpen(true);
  };

  const subjectQuestions = questions.filter((q) => q.subjectId === subjectId);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedQuestionIds.length === 0) {
      showToast('warning', 'Select questions', 'Attach at least 1 question from your Question Bank.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title,
        subjectId,
        className,
        semester,
        academicYear,
        examType,
        durationMinutes: Number(durationMinutes),
        instructions,
        status,
        shuffleQuestions,
        shuffleOptions,
        oneQuestionPerPage: true,
        allowNavigation: true,
        showQuestionNumbers: true,
        allowMarkReview,
        allowPrevious,
        requireFullscreen,
        antiCheatingEnabled,
        autosaveEnabled,
        autoSubmitEnabled,
        questionIds: selectedQuestionIds,
      };

      if (editing) {
        await apiRequest(`/api/exams/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        showToast('success', 'Examination updated');
      } else {
        await apiRequest('/api/exams', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast('success', 'Examination created');
      }
      setModalOpen(false);
      await loadData();
    } catch (err: any) {
      showToast('error', 'Save failed', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await apiRequest(`/api/exams/${deleteTarget.id}`, { method: 'DELETE' });
      showToast('success', 'Examination deleted');
      setDeleteTarget(null);
      await loadData();
    } catch (err: any) {
      showToast('error', 'Delete failed', err.message);
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnDef<ExamItem>[] = [
    {
      key: 'title',
      header: 'Examination',
      render: (e) => (
        <div>
          <p className="font-semibold text-[#243B64]">{e.title}</p>
          <p className="text-xs text-slate-500">
            {e.subjectCode} — {e.subjectName} · {e.examType}
          </p>
        </div>
      ),
    },
    {
      key: 'class',
      header: 'Target Class',
      render: (e) => <span className="font-medium text-slate-700">{e.className}</span>,
    },
    {
      key: 'questions',
      header: 'Questions',
      align: 'right',
      render: (e) => <span className="font-mono text-xs tabular-nums">{e.totalQuestions} Qs</span>,
    },
    {
      key: 'duration',
      header: 'Duration',
      align: 'right',
      render: (e) => <span className="font-mono text-xs tabular-nums">{e.durationMinutes} min</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (e) => <span className="text-xs font-semibold text-[#376FA6]">{e.status}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (e) => (
        <div className="inline-flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => openEdit(e)}
            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setDeleteTarget(e)}
            className="p-1.5 rounded-lg border border-slate-200 text-red-600 hover:bg-red-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <PortalLayout
      pageTitle="Manajemen Ujian & Exam Builder"
      pageSubtitle="Assemble examinations from Bank Soal and configure security, randomization, and timer rules"
      headerAction={
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#243B64] hover:bg-[#1a2c4b] rounded-lg whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>Create Exam</span>
        </button>
      }
    >
      <DataTable
        data={exams}
        columns={columns}
        keyField={(e) => e.id}
        loading={loading}
        searchPlaceholder="Search exams by title or subject..."
        searchFilter={(e, q) =>
          e.title.toLowerCase().includes(q) || (e.subjectName || '').toLowerCase().includes(q)
        }
        emptyTitle="No examinations created yet"
        emptyDescription="Build an examination by selecting questions from your Question Bank."
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Examination' : 'Create New Examination'}
        maxWidthClass="max-w-3xl"
      >
        <form id="exam-form" onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Exam Title</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="UAS Bahasa Inggris Kelas 8"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Subject</label>
              <select
                value={subjectId}
                onChange={(e) => {
                  setSubjectId(Number(e.target.value));
                  setSelectedQuestionIds([]);
                }}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} — {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Class (or ALL)</label>
              <input
                type="text"
                required
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                placeholder="8A"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Exam Type</label>
              <select
                value={examType}
                onChange={(e) => setExamType(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              >
                {EXAM_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Duration (min)</label>
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
              <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ExamStatus)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              >
                <option value="Draft">Draft</option>
                <option value="Scheduled">Scheduled</option>
                <option value="Published">Published</option>
                <option value="Ongoing">Ongoing</option>
                <option value="Completed">Completed</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Exam Instructions</label>
            <textarea
              rows={2}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
          </div>

          {/* Security & Engine Toggles */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-3.5 rounded-xl bg-[#FAFBFD] border border-slate-200 text-xs">
            {[
              ['Shuffle Questions', shuffleQuestions, setShuffleQuestions],
              ['Shuffle Options', shuffleOptions, setShuffleOptions],
              ['Allow Previous', allowPrevious, setAllowPrevious],
              ['Allow Mark Review', allowMarkReview, setAllowMarkReview],
              ['Require Fullscreen', requireFullscreen, setRequireFullscreen],
              ['Anti-Cheating System', antiCheatingEnabled, setAntiCheatingEnabled],
              ['Server Autosave', autosaveEnabled, setAutosaveEnabled],
              ['Auto-Submit on Timeout', autoSubmitEnabled, setAutoSubmitEnabled],
            ].map(([label, val, setter]) => (
              <label key={label as string} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={val as boolean}
                  onChange={(e) => (setter as React.Dispatch<React.SetStateAction<boolean>>)(e.target.checked)}
                />
                <span>{label as string}</span>
              </label>
            ))}
          </div>

          {/* Question Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-[#243B64]">
                Select Questions ({selectedQuestionIds.length} selected)
              </label>
              <button
                type="button"
                onClick={() =>
                  setSelectedQuestionIds(
                    selectedQuestionIds.length === subjectQuestions.length
                      ? []
                      : subjectQuestions.map((q) => q.id)
                  )
                }
                className="text-xs text-[#376FA6] hover:underline"
              >
                {selectedQuestionIds.length === subjectQuestions.length
                  ? 'Deselect All'
                  : `Select All (${subjectQuestions.length})`}
              </button>
            </div>
            <div className="max-h-52 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
              {subjectQuestions.length === 0 ? (
                <p className="p-4 text-xs text-slate-500 text-center">
                  No questions found for this subject. Create or import questions first.
                </p>
              ) : (
                subjectQuestions.map((q) => (
                  <label
                    key={q.id}
                    className="flex items-start gap-2.5 p-2.5 hover:bg-slate-50 cursor-pointer text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={selectedQuestionIds.includes(q.id)}
                      onChange={(e) =>
                        setSelectedQuestionIds((prev) =>
                          e.target.checked ? [...prev, q.id] : prev.filter((id) => id !== q.id)
                        )
                      }
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-800 font-medium line-clamp-1">{q.questionText}</p>
                      <p className="text-slate-500 mt-0.5">
                        {q.questionType} · {q.points} pts · {q.topic}
                      </p>
                    </div>
                  </label>
                ))
              )}
            </div>
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
            form="exam-form"
            disabled={saving}
            className="px-4 py-2 text-sm font-semibold text-white bg-[#243B64] rounded-lg"
          >
            {saving ? 'Saving...' : 'Save Examination'}
          </button>
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Examination"
        description={`Delete "${deleteTarget?.title}"?`}
        confirmLabel="Delete"
        danger
        loading={saving}
      />
    </PortalLayout>
  );
}
