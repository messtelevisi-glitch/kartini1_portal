import React, { useCallback, useEffect, useState } from 'react';
import {
  Copy,
  FileAudio,
  FileImage,
  FileVideo,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { PortalLayout } from '../../layouts/PortalLayout';
import { DataTable, type ColumnDef } from '../../components/ui/DataTable';
import { ConfirmModal, Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/ToastProvider';
import { apiRequest, uploadMediaFile } from '../../services/api';
import type {
  DifficultyLevel,
  MatchingPairItem,
  QuestionItem,
  QuestionMediaItem,
  QuestionOptionItem,
  QuestionType,
  SubjectItem,
} from '../../types/exam';

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  MULTIPLE_CHOICE: 'Multiple Choice',
  MULTIPLE_RESPONSE: 'Multiple Response',
  TRUE_FALSE: 'True / False',
  MATCHING: 'Matching',
  ESSAY: 'Essay',
};

export function QuestionBankPage() {
  const { showToast } = useToast();
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [subjectFilter, setSubjectFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  // Builder Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<QuestionItem | null>(null);
  const [subjectId, setSubjectId] = useState<number>(0);
  const [classLevel, setClassLevel] = useState('8');
  const [semester, setSemester] = useState('Ganjil');
  const [academicYear, setAcademicYear] = useState('2026/2027');
  const [topic, setTopic] = useState('General');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('medium');
  const [questionType, setQuestionType] = useState<QuestionType>('MULTIPLE_CHOICE');
  const [questionText, setQuestionText] = useState('');
  const [explanation, setExplanation] = useState('');
  const [points, setPoints] = useState(5);
  const [partialCredit, setPartialCredit] = useState(false);
  const [options, setOptions] = useState<QuestionOptionItem[]>([
    { optionKey: 'A', optionText: '', isCorrect: true, sortOrder: 0 },
    { optionKey: 'B', optionText: '', isCorrect: false, sortOrder: 1 },
    { optionKey: 'C', optionText: '', isCorrect: false, sortOrder: 2 },
    { optionKey: 'D', optionText: '', isCorrect: false, sortOrder: 3 },
  ]);
  const [matchingPairs, setMatchingPairs] = useState<MatchingPairItem[]>([
    { promptKey: '1', promptText: '', matchKey: 'A', matchText: '', sortOrder: 0 },
    { promptKey: '2', promptText: '', matchKey: 'B', matchText: '', sortOrder: 1 },
    { promptKey: '3', promptText: '', matchKey: 'C', matchText: '', sortOrder: 2 },
  ]);
  const [media, setMedia] = useState<QuestionMediaItem[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<QuestionItem | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [qData, sData] = await Promise.all([
        apiRequest<QuestionItem[]>('/api/questions'),
        apiRequest<SubjectItem[]>('/api/subjects'),
      ]);
      setQuestions(qData);
      setSubjects(sData);
      if (sData.length > 0 && subjectId === 0) {
        setSubjectId(sData[0].id);
      }
    } catch (err: any) {
      showToast('error', 'Failed to load question bank', err.message);
    } finally {
      setLoading(false);
    }
  }, [showToast, subjectId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const resetForm = (defaultSubId?: number) => {
    setEditing(null);
    setSubjectId(defaultSubId ?? subjects[0]?.id ?? 0);
    setClassLevel('8');
    setSemester('Ganjil');
    setAcademicYear('2026/2027');
    setTopic('General');
    setDifficulty('medium');
    setQuestionType('MULTIPLE_CHOICE');
    setQuestionText('');
    setExplanation('');
    setPoints(5);
    setPartialCredit(false);
    setOptions([
      { optionKey: 'A', optionText: '', isCorrect: true, sortOrder: 0 },
      { optionKey: 'B', optionText: '', isCorrect: false, sortOrder: 1 },
      { optionKey: 'C', optionText: '', isCorrect: false, sortOrder: 2 },
      { optionKey: 'D', optionText: '', isCorrect: false, sortOrder: 3 },
    ]);
    setMatchingPairs([
      { promptKey: '1', promptText: '', matchKey: 'A', matchText: '', sortOrder: 0 },
      { promptKey: '2', promptText: '', matchKey: 'B', matchText: '', sortOrder: 1 },
      { promptKey: '3', promptText: '', matchKey: 'C', matchText: '', sortOrder: 2 },
    ]);
    setMedia([]);
    setUploadProgress(null);
  };

  const openCreate = () => {
    resetForm();
    setModalOpen(true);
  };

  const openEdit = (q: QuestionItem) => {
    setEditing(q);
    setSubjectId(q.subjectId);
    setClassLevel(q.classLevel);
    setSemester(q.semester);
    setAcademicYear(q.academicYear);
    setTopic(q.topic);
    setDifficulty(q.difficulty);
    setQuestionType(q.questionType);
    setQuestionText(q.questionText);
    setExplanation(q.explanation || '');
    setPoints(q.points);
    setPartialCredit(q.partialCredit);
    setOptions(
      q.options.length > 0
        ? q.options
        : [
            { optionKey: 'A', optionText: 'True', isCorrect: true, sortOrder: 0 },
            { optionKey: 'B', optionText: 'False', isCorrect: false, sortOrder: 1 },
          ]
    );
    setMatchingPairs(
      q.matchingPairs.length > 0
        ? q.matchingPairs
        : [{ promptKey: '1', promptText: '', matchKey: 'A', matchText: '', sortOrder: 0 }]
    );
    setMedia(q.media || []);
    setModalOpen(true);
  };

  const handleTypeChange = (nextType: QuestionType) => {
    setQuestionType(nextType);
    if (nextType === 'TRUE_FALSE') {
      setOptions([
        { optionKey: 'A', optionText: 'True', isCorrect: true, sortOrder: 0 },
        { optionKey: 'B', optionText: 'False', isCorrect: false, sortOrder: 1 },
      ]);
    } else if (nextType === 'MULTIPLE_CHOICE' || nextType === 'MULTIPLE_RESPONSE') {
      if (options.length < 4) {
        setOptions([
          { optionKey: 'A', optionText: '', isCorrect: true, sortOrder: 0 },
          { optionKey: 'B', optionText: '', isCorrect: false, sortOrder: 1 },
          { optionKey: 'C', optionText: '', isCorrect: false, sortOrder: 2 },
          { optionKey: 'D', optionText: '', isCorrect: false, sortOrder: 3 },
        ]);
      }
    }
  };

  const handleUploadMedia = async (
    file: File,
    targetType: 'question' | 'option' = 'question',
    targetKey?: string
  ) => {
    if (file.size > 10 * 1024 * 1024) {
      showToast('error', 'File too large', 'Maximum allowed multimedia file size is 10 MB.');
      return;
    }
    setUploadProgress(0);
    try {
      const uploaded = await uploadMediaFile(file, (pct) => setUploadProgress(pct));
      if (targetType === 'option' && targetKey) {
        setOptions((prev) =>
          prev.map((o) =>
            o.optionKey === targetKey
              ? { ...o, mediaUrl: uploaded.storageUrl, mediaType: uploaded.mediaType }
              : o
          )
        );
      } else {
        setMedia((prev) => [
          ...prev,
          {
            targetType: 'question',
            targetKey: null,
            mediaType: uploaded.mediaType,
            fileName: uploaded.fileName,
            mimeType: uploaded.mimeType,
            fileSize: uploaded.fileSize,
            storageUrl: uploaded.storageUrl,
          },
        ]);
      }
      showToast('success', 'Media uploaded', uploaded.fileName);
    } catch (err: any) {
      showToast('error', 'Upload failed', err.message);
    } finally {
      setUploadProgress(null);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectId) {
      showToast('warning', 'Select a subject first');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        subjectId,
        classLevel,
        semester,
        academicYear,
        topic,
        difficulty,
        questionType,
        questionText,
        explanation: explanation || null,
        points: Number(points),
        partialCredit,
        options:
          questionType === 'MULTIPLE_CHOICE' ||
          questionType === 'MULTIPLE_RESPONSE' ||
          questionType === 'TRUE_FALSE'
            ? options.map((o, idx) => ({ ...o, sortOrder: idx }))
            : [],
        matchingPairs:
          questionType === 'MATCHING'
            ? matchingPairs.map((m, idx) => ({ ...m, sortOrder: idx }))
            : [],
        media,
      };

      if (editing) {
        await apiRequest(`/api/questions/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        showToast('success', 'Question updated');
      } else {
        await apiRequest('/api/questions', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast('success', 'Question saved to Question Bank');
      }
      setModalOpen(false);
      await loadData();
    } catch (err: any) {
      showToast('error', 'Save failed', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async (q: QuestionItem) => {
    try {
      await apiRequest(`/api/questions/${q.id}/duplicate`, { method: 'POST' });
      showToast('success', 'Question duplicated');
      await loadData();
    } catch (err: any) {
      showToast('error', 'Duplicate failed', err.message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await apiRequest(`/api/questions/${deleteTarget.id}`, { method: 'DELETE' });
      showToast('success', 'Question deleted');
      setDeleteTarget(null);
      await loadData();
    } catch (err: any) {
      showToast('error', 'Delete failed', err.message);
    } finally {
      setSaving(false);
    }
  };

  const filteredQuestions = questions.filter((q) => {
    if (subjectFilter !== 'ALL' && String(q.subjectId) !== subjectFilter) return false;
    if (typeFilter !== 'ALL' && q.questionType !== typeFilter) return false;
    return true;
  });

  const columns: ColumnDef<QuestionItem>[] = [
    {
      key: 'stem',
      header: 'Question',
      render: (q) => (
        <div className="max-w-md">
          <p className="font-medium text-slate-900 line-clamp-2">{q.questionText}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {q.subjectCode} · Grade {q.classLevel} · {q.topic} · {q.difficulty}
            {q.media.length > 0 ? ` · ${q.media.length} media` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (q) => (
        <span className="text-xs font-medium text-[#376FA6]">
          {QUESTION_TYPE_LABELS[q.questionType]}
        </span>
      ),
    },
    {
      key: 'points',
      header: 'Points',
      align: 'right',
      render: (q) => <span className="font-mono text-xs font-semibold tabular-nums">{q.points}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (q) => (
        <div className="inline-flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => openEdit(q)}
            title="Edit"
            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleDuplicate(q)}
            title="Duplicate"
            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setDeleteTarget(q)}
            title="Delete"
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
      pageTitle="Bank Soal & Question Builder"
      pageSubtitle="Create, organize, and attach multimedia across 5 Cambridge-aligned question types"
      headerAction={
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#243B64] hover:bg-[#1a2c4b] rounded-lg whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>New Question</span>
        </button>
      }
    >
      <DataTable
        data={filteredQuestions}
        columns={columns}
        keyField={(q) => q.id}
        loading={loading}
        searchPlaceholder="Search question stem or topic..."
        searchFilter={(q, query) =>
          q.questionText.toLowerCase().includes(query) ||
          q.topic.toLowerCase().includes(query) ||
          (q.subjectName || '').toLowerCase().includes(query)
        }
        toolbarExtra={
          <div className="flex items-center gap-2">
            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              className="px-3 py-2 text-xs font-medium bg-white border border-slate-200 rounded-lg"
            >
              <option value="ALL">All Authorized Subjects</option>
              {subjects.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.code} — {s.name}
                </option>
              ))}
            </select>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-2 text-xs font-medium bg-white border border-slate-200 rounded-lg"
            >
              <option value="ALL">All Types</option>
              {Object.entries(QUESTION_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        }
        emptyTitle="Question Bank is empty"
        emptyDescription="Create a question manually or import structured questions from a Word (.DOCX) file."
        emptyAction={
          <button
            type="button"
            onClick={openCreate}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#243B64] rounded-lg"
          >
            Create First Question
          </button>
        }
      />

      {/* Question Builder Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Question' : 'Create Question'}
        subtitle="Supports Multiple Choice, Multiple Response, True/False, Matching, Essay, and up to 10 MB multimedia."
        maxWidthClass="max-w-3xl"
      >
        <form id="question-form" onSubmit={handleSave} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Subject</label>
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} — {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Question Type</label>
              <select
                value={questionType}
                onChange={(e) => handleTypeChange(e.target.value as QuestionType)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              >
                {Object.entries(QUESTION_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Points</label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                required
                value={points}
                onChange={(e) => setPoints(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Grade Level</label>
              <select
                value={classLevel}
                onChange={(e) => setClassLevel(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              >
                <option value="7">Grade 7</option>
                <option value="8">Grade 8</option>
                <option value="9">Grade 9</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Semester</label>
              <select
                value={semester}
                onChange={(e) => setSemester(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              >
                <option value="Ganjil">Ganjil</option>
                <option value="Genap">Genap</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Difficulty</label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as DifficultyLevel)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Topic / Chapter</label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Question Prompt</label>
            <textarea
              required
              rows={3}
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              placeholder="Enter the question text..."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
          </div>

          {/* Multimedia Attachment Zone (All 5 Question Types) */}
          <div className="p-4 rounded-xl border border-slate-200 bg-[#FAFBFD] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-[#243B64]">
                  Question Multimedia (Max 10 MB per file)
                </p>
                <p className="text-xs text-slate-500">
                  Supported: JPG, JPEG, PNG, WEBP, MP3, WAV, M4A, MP4, WEBM
                </p>
              </div>
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#376FA6] hover:bg-[#2b5b8a] rounded-lg cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Media</span>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.mp3,.wav,.m4a,.mp4,.webm"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleUploadMedia(f, 'question');
                    e.target.value = '';
                  }}
                  className="hidden"
                />
              </label>
            </div>

            {uploadProgress !== null && (
              <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-[#376FA6] h-full transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            )}

            {media.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {media.map((m, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 bg-white border border-slate-200 rounded-lg space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 truncate">
                        {m.mediaType === 'image' && <FileImage className="w-3.5 h-3.5 text-[#376FA6]" />}
                        {m.mediaType === 'audio' && <FileAudio className="w-3.5 h-3.5 text-[#6EAAA1]" />}
                        {m.mediaType === 'video' && <FileVideo className="w-3.5 h-3.5 text-[#243B64]" />}
                        <span className="truncate">{m.fileName}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setMedia((prev) => prev.filter((_, i) => i !== idx))}
                        className="p-1 text-red-600 hover:bg-red-50 rounded"
                        aria-label="Remove media"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {m.mediaType === 'image' && (
                      <img
                        src={m.storageUrl}
                        alt={m.fileName}
                        className="w-full max-h-36 object-contain rounded border border-slate-100"
                        referrerPolicy="no-referrer"
                      />
                    )}
                    {m.mediaType === 'audio' && (
                      <audio controls src={m.storageUrl} className="w-full h-8" />
                    )}
                    {m.mediaType === 'video' && (
                      <video controls src={m.storageUrl} className="w-full max-h-40 rounded" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Options for Multiple Choice / Multiple Response / True-False */}
          {(questionType === 'MULTIPLE_CHOICE' ||
            questionType === 'MULTIPLE_RESPONSE' ||
            questionType === 'TRUE_FALSE') && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-[#243B64]">
                  Answer Options & Key
                </label>
                {questionType === 'MULTIPLE_RESPONSE' && (
                  <label className="flex items-center gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={partialCredit}
                      onChange={(e) => setPartialCredit(e.target.checked)}
                    />
                    <span>Allow Partial Credit</span>
                  </label>
                )}
                {questionType !== 'TRUE_FALSE' && options.length < 5 && (
                  <button
                    type="button"
                    onClick={() => {
                      const keys = ['A', 'B', 'C', 'D', 'E'];
                      const nextKey = keys[options.length];
                      if (nextKey) {
                        setOptions((prev) => [
                          ...prev,
                          { optionKey: nextKey, optionText: '', isCorrect: false, sortOrder: prev.length },
                        ]);
                      }
                    }}
                    className="text-xs font-medium text-[#376FA6] hover:underline"
                  >
                    + Add Option E
                  </button>
                )}
              </div>

              {options.map((opt, idx) => (
                <div
                  key={opt.optionKey}
                  className="flex flex-col sm:flex-row sm:items-center gap-2 p-2.5 border border-slate-200 rounded-lg bg-white"
                >
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type={questionType === 'MULTIPLE_RESPONSE' ? 'checkbox' : 'radio'}
                      name="correctOption"
                      checked={opt.isCorrect}
                      onChange={(e) => {
                        if (questionType === 'MULTIPLE_RESPONSE') {
                          setOptions((prev) =>
                            prev.map((o, i) => (i === idx ? { ...o, isCorrect: e.target.checked } : o))
                          );
                        } else {
                          setOptions((prev) =>
                            prev.map((o, i) => ({ ...o, isCorrect: i === idx }))
                          );
                        }
                      }}
                    />
                    <span className="font-mono text-xs font-bold text-[#243B64] w-5">
                      {opt.optionKey}.
                    </span>
                    <input
                      type="text"
                      required
                      value={opt.optionText}
                      readOnly={questionType === 'TRUE_FALSE'}
                      onChange={(e) =>
                        setOptions((prev) =>
                          prev.map((o, i) => (i === idx ? { ...o, optionText: e.target.value } : o))
                        )
                      }
                      placeholder={`Option ${opt.optionKey}`}
                      className="flex-1 px-2.5 py-1.5 text-sm border border-slate-200 rounded-md"
                    />
                  </div>
                  {questionType !== 'TRUE_FALSE' && (
                    <div className="flex items-center gap-2 shrink-0">
                      {opt.mediaUrl ? (
                        <div className="flex items-center gap-1.5">
                          <img
                            src={opt.mediaUrl}
                            alt={`Option ${opt.optionKey}`}
                            className="w-8 h-8 object-cover rounded border border-slate-200"
                            referrerPolicy="no-referrer"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setOptions((prev) =>
                                prev.map((o, i) =>
                                  i === idx ? { ...o, mediaUrl: null, mediaType: null } : o
                                )
                              )
                            }
                            className="text-xs text-red-600 hover:underline"
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <label className="text-xs text-[#376FA6] hover:underline cursor-pointer">
                          + Image
                          <input
                            type="file"
                            accept=".jpg,.jpeg,.png,.webp"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) void handleUploadMedia(f, 'option', opt.optionKey);
                              e.target.value = '';
                            }}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Matching Pairs */}
          {questionType === 'MATCHING' && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-[#243B64]">
                  Matching Pairs (Prompt ↔ Correct Match)
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const nextNum = String(matchingPairs.length + 1);
                    const nextLetter = String.fromCharCode(65 + matchingPairs.length);
                    setMatchingPairs((prev) => [
                      ...prev,
                      {
                        promptKey: nextNum,
                        promptText: '',
                        matchKey: nextLetter,
                        matchText: '',
                        sortOrder: prev.length,
                      },
                    ]);
                  }}
                  className="text-xs font-medium text-[#376FA6] hover:underline"
                >
                  + Add Pair
                </button>
              </div>
              {matchingPairs.map((pair, idx) => (
                <div key={idx} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-[#243B64] w-5">
                      {pair.promptKey}.
                    </span>
                    <input
                      type="text"
                      required
                      value={pair.promptText}
                      onChange={(e) =>
                        setMatchingPairs((prev) =>
                          prev.map((p, i) => (i === idx ? { ...p, promptText: e.target.value } : p))
                        )
                      }
                      placeholder="Statement / Prompt"
                      className="flex-1 px-2.5 py-1.5 text-sm border border-slate-200 rounded-md"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-[#6EAAA1] w-5">
                      {pair.matchKey}.
                    </span>
                    <input
                      type="text"
                      required
                      value={pair.matchText}
                      onChange={(e) =>
                        setMatchingPairs((prev) =>
                          prev.map((p, i) => (i === idx ? { ...p, matchText: e.target.value } : p))
                        )
                      }
                      placeholder="Correct Match Answer"
                      className="flex-1 px-2.5 py-1.5 text-sm border border-slate-200 rounded-md"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {questionType === 'ESSAY' && (
            <div className="p-3 rounded-lg bg-[#EAF3FA]/60 border border-[#376FA6]/20 text-xs text-slate-700">
              Essay questions support long-form student text responses and are flagged as{' '}
              <strong>Pending Grading</strong> until manually scored by the Subject Teacher or Admin.
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Teacher Explanation / Rubric Notes (Optional, never shown to students)
            </label>
            <textarea
              rows={2}
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
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
            form="question-form"
            disabled={saving}
            className="px-4 py-2 text-sm font-semibold text-white bg-[#243B64] rounded-lg disabled:opacity-50"
          >
            {saving ? 'Saving...' : editing ? 'Save Changes' : 'Save Question'}
          </button>
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Question"
        description="Are you sure you want to remove this question from the Question Bank?"
        confirmLabel="Delete Question"
        danger
        loading={saving}
      />
    </PortalLayout>
  );
}
