import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Flag,
  Maximize2,
  Send,
  ShieldAlert,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { ConfirmModal, Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/ToastProvider';
import { apiRequest, assetUrl, getStudentToken, setStudentToken } from '../../services/api';
import { examAlarm } from '../../utils/alarmAudio';
import type { StudentAnswerPayload, StudentSanitizedQuestion } from '../../types/exam';

interface ExamSessionResponse {
  attempt: {
    id: number;
    status: string;
    startedAt: string;
    serverEndTime: string;
    serverNow: string;
    violationCount: number;
    currentQuestionIndex: number;
  };
  exam: {
    id: number;
    title: string;
    subjectName: string;
    allowNavigation: boolean;
    allowPrevious: boolean;
    allowMarkReview: boolean;
    showQuestionNumbers: boolean;
    requireFullscreen: boolean;
    antiCheatingEnabled: boolean;
    autosaveEnabled: boolean;
    autoSubmitEnabled: boolean;
    maxViolations: number;
  };
  student: {
    studentNumber: string;
    studentName: string;
    className: string;
  };
  questions: StudentSanitizedQuestion[];
  savedAnswers: StudentAnswerPayload[];
}

function formatTimer(sec: number) {
  const safe = Math.max(0, sec);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

export function StudentExamPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [session, setSession] = useState<ExamSessionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answersMap, setAnswersMap] = useState<Record<number, StudentAnswerPayload>>({});

  // Server-authoritative timer state
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const warnedMilestonesRef = useRef<Set<number>>(new Set());

  // Connection & Autosave sync queue
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncState, setSyncState] = useState<'saved' | 'saving' | 'queued' | 'error'>('saved');
  const pendingQueueRef = useRef<Record<number, StudentAnswerPayload>>({});

  // Anti-Cheating Security State
  const [violationCount, setViolationCount] = useState(0);
  const [securityWarning, setSecurityWarning] = useState<{
    severity: string;
    message: string;
  } | null>(null);
  const [needsFullscreenPrompt, setNeedsFullscreenPrompt] = useState(false);
  const [disqualifiedReason, setDisqualifiedReason] = useState<string | null>(null);
  const lastViolationAtRef = useRef<number>(0);

  // Submission State
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittedSuccessfully, setSubmittedSuccessfully] = useState(false);

  const answersRef = useRef(answersMap);
  answersRef.current = answersMap;
  const currentIdxRef = useRef(currentIdx);
  currentIdxRef.current = currentIdx;

  // Load sanitized exam session from server
  useEffect(() => {
    if (!getStudentToken()) {
      navigate('/student/access', { replace: true });
      return;
    }

    apiRequest<ExamSessionResponse>('/api/student/exam/start', { method: 'POST' }, 'student')
      .then((res) => {
        setSession(res);
        setCurrentIdx(res.attempt.currentQuestionIndex || 0);
        setViolationCount(res.attempt.violationCount || 0);

        const initialMap: Record<number, StudentAnswerPayload> = {};
        for (const q of res.questions) {
          const found = res.savedAnswers.find((a) => a.questionId === q.id);
          initialMap[q.id] = found || {
            questionId: q.id,
            selectedOptions: [],
            matchingAnswers: {},
            essayText: '',
            isMarkedForReview: false,
          };
        }
        setAnswersMap(initialMap);

        const serverNowMs = new Date(res.attempt.serverNow).getTime();
        const serverEndMs = new Date(res.attempt.serverEndTime).getTime();
        const initialRemaining = Math.max(0, Math.floor((serverEndMs - serverNowMs) / 1000));
        setRemainingSeconds(initialRemaining);

        if (res.exam.requireFullscreen && !document.fullscreenElement) {
          setNeedsFullscreenPrompt(true);
        }
      })
      .catch((err: any) => {
        showToast('error', 'Cannot load exam session', err.message);
        setStudentToken(null);
        navigate('/student/access', { replace: true });
      })
      .finally(() => setLoading(false));
  }, [navigate, showToast]);

  const flushAutosave = useCallback(async (payloadList: StudentAnswerPayload[]) => {
    if (payloadList.length === 0 || submittedSuccessfully || disqualifiedReason) return;
    setSyncState('saving');
    try {
      await apiRequest(
        '/api/student/exam/autosave',
        {
          method: 'POST',
          body: JSON.stringify({
            currentQuestionIndex: currentIdxRef.current,
            answers: payloadList,
          }),
        },
        'student'
      );
      for (const p of payloadList) {
        delete pendingQueueRef.current[p.questionId];
      }
      setSyncState(Object.keys(pendingQueueRef.current).length > 0 ? 'queued' : 'saved');
    } catch (err: any) {
      if (err?.payload?.expired) {
        setSyncState('error');
        return;
      }
      for (const p of payloadList) {
        pendingQueueRef.current[p.questionId] = p;
      }
      setSyncState('queued');
    }
  }, [submittedSuccessfully, disqualifiedReason]);

  const handleFinalSubmit = useCallback(
    async (isAuto = false) => {
      if (submitting || submittedSuccessfully || disqualifiedReason) return;
      setSubmitting(true);
      try {
        const queued = Object.values(pendingQueueRef.current);
        if (queued.length > 0) {
          await flushAutosave(queued);
        }
        await apiRequest('/api/student/exam/submit', { method: 'POST' }, 'student');
        setSubmittedSuccessfully(true);
        setConfirmSubmitOpen(false);
        setStudentToken(null);
        if (document.fullscreenElement) {
          void document.exitFullscreen().catch(() => {});
        }
        if (isAuto) {
          showToast('info', 'Time Expired', 'Your examination has been submitted automatically.');
        }
      } catch (err: any) {
        showToast('error', 'Submission error', err.message);
      } finally {
        setSubmitting(false);
      }
    },
    [submitting, submittedSuccessfully, disqualifiedReason, flushAutosave, showToast]
  );

  // Server-anchored 1-second countdown + milestone warnings + auto-submit
  useEffect(() => {
    if (!session || submittedSuccessfully || disqualifiedReason) return;

    const timer = setInterval(() => {
      setRemainingSeconds((prev) => {
        const next = Math.max(0, prev - 1);
        if (next === 900 && !warnedMilestonesRef.current.has(900)) {
          warnedMilestonesRef.current.add(900);
          showToast('info', '15 Minutes Remaining', 'Please pace your remaining answers.');
        } else if (next === 300 && !warnedMilestonesRef.current.has(300)) {
          warnedMilestonesRef.current.add(300);
          showToast('warning', '5 Minutes Remaining', 'Begin reviewing marked questions.');
        } else if (next === 60 && !warnedMilestonesRef.current.has(60)) {
          warnedMilestonesRef.current.add(60);
          showToast('error', '1 Minute Remaining (Critical)', 'Exam will auto-submit at 00:00:00.');
        }
        if (next === 0 && session.exam.autoSubmitEnabled) {
          void handleFinalSubmit(true);
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [session, submittedSuccessfully, disqualifiedReason, showToast, handleFinalSubmit]);

  // Network online/offline sync
  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      const queued = Object.values(pendingQueueRef.current);
      if (queued.length > 0) void flushAutosave(queued);
    };
    const onOffline = () => {
      setIsOnline(false);
      setSyncState('queued');
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [flushAutosave]);

  // KARTINI EXAM SECURITY SYSTEM (Debounced violation reporting + Alarm + 3-strike -> 4th DQ)
  const triggerViolation = useCallback(
    async (violationType: string, description: string) => {
      if (!session?.exam.antiCheatingEnabled || submittedSuccessfully || disqualifiedReason) return;

      // Debounce identical/overlapping browser events within 2500ms so 1 action = 1 strike
      const now = Date.now();
      if (now - lastViolationAtRef.current < 2500) return;
      lastViolationAtRef.current = now;

      examAlarm.playWarningAlarm(violationCount >= 2);

      try {
        const res = await apiRequest<{
          violationCount: number;
          maxWarnings: number;
          severity: string;
          disqualified: boolean;
        }>(
          '/api/student/exam/violation',
          {
            method: 'POST',
            body: JSON.stringify({ violationType, description }),
          },
          'student'
        );

        setViolationCount(res.violationCount);
        if (res.disqualified) {
          setDisqualifiedReason(
            `Exceeded maximum warnings (${res.violationCount} violations). Last event: ${violationType}`
          );
          setStudentToken(null);
        } else {
          setSecurityWarning({
            severity: res.severity,
            message: `${violationType}: ${description}. Strike ${res.violationCount} of ${res.maxWarnings} before automatic disqualification.`,
          });
        }
      } catch {
        // Offline or network hiccup
      }
    },
    [session, submittedSuccessfully, disqualifiedReason, violationCount]
  );

  useEffect(() => {
    if (!session?.exam.antiCheatingEnabled || submittedSuccessfully || disqualifiedReason) return;

    const onVisibilityChange = () => {
      if (document.hidden) {
        void triggerViolation('Tab / Application Switching', 'Examination window became hidden');
      }
    };

    const onWindowBlur = () => {
      void triggerViolation('Window Focus Lost', 'Browser window lost active focus');
    };

    const onFullscreenChange = () => {
      if (session.exam.requireFullscreen && !document.fullscreenElement) {
        setNeedsFullscreenPrompt(true);
        void triggerViolation('Fullscreen Exited', 'Participant exited mandatory fullscreen mode');
      } else if (document.fullscreenElement) {
        setNeedsFullscreenPrompt(false);
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const ctrlOrMeta = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (
        e.key === 'F12' ||
        (ctrlOrMeta && ['c', 'v', 'x', 'u', 's'].includes(key)) ||
        (ctrlOrMeta && e.shiftKey && ['i', 'j', 'c'].includes(key))
      ) {
        e.preventDefault();
        void triggerViolation('Restricted Shortcut', `Blocked keyboard shortcut (${e.key})`);
      }
    };

    // Indicative DevTools viewport delta check (debounced)
    const devToolsInterval = setInterval(() => {
      const widthDiff = window.outerWidth - window.innerWidth;
      const heightDiff = window.outerHeight - window.innerHeight;
      if (widthDiff > 240 || heightDiff > 240) {
        void triggerViolation('Indicative DevTools / Docked Inspector', 'Significant viewport-to-window dimension delta detected');
      }
    }, 5000);

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onWindowBlur);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      clearInterval(devToolsInterval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onWindowBlur);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [session, submittedSuccessfully, disqualifiedReason, triggerViolation]);

  const updateAnswer = (qId: number, patch: Partial<StudentAnswerPayload>) => {
    const current = answersRef.current[qId] || {
      questionId: qId,
      selectedOptions: [],
      matchingAnswers: {},
      essayText: '',
      isMarkedForReview: false,
    };
    const nextAns = { ...current, ...patch };
    setAnswersMap((prev) => ({ ...prev, [qId]: nextAns }));
    pendingQueueRef.current[qId] = nextAns;
    void flushAutosave([nextAns]);
  };

  if (loading || !session) {
    return (
      <div className="min-h-screen bg-[#FAFBFD] flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-2 border-[#243B64] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-600">Loading secured examination session...</p>
        </div>
      </div>
    );
  }

  // Strictly no scores, keys, or explanations on completion!
  if (submittedSuccessfully) {
    return (
      <div className="min-h-screen bg-[#F1F4F8] flex items-center justify-center p-4">
        <div className="max-w-lg w-full bg-white border border-slate-200 rounded-xl p-8 text-center space-y-4">
          <img
            src={assetUrl('assets/aistudio/logoku_6b323412.png')}
            alt="SMP Kartini 1 Batam Logo"
            className="w-16 h-16 object-contain mx-auto"
            referrerPolicy="no-referrer"
          />
          <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
          <h1 className="text-lg font-bold text-[#243B64]">
            YOUR EXAM HAS BEEN SUBMITTED SUCCESSFULLY.
          </h1>
          <p className="text-sm text-slate-600">
            Thank you for completing your examination. Your answers have been recorded.
          </p>
          <div className="pt-4 border-t border-slate-100 text-xs text-slate-500">
            {session.student.studentName} · {session.student.studentNumber} · {session.exam.title}
          </div>
          <button
            type="button"
            onClick={() => navigate('/student/access', { replace: true })}
            className="mt-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#243B64] rounded-lg"
          >
            Return to Portal Home
          </button>
        </div>
      </div>
    );
  }

  if (disqualifiedReason) {
    return (
      <div className="min-h-screen bg-[#F1F4F8] flex items-center justify-center p-4">
        <div className="max-w-lg w-full bg-white border border-red-200 rounded-xl p-8 text-center space-y-4">
          <ShieldAlert className="w-12 h-12 text-red-600 mx-auto" />
          <h1 className="text-lg font-bold text-red-800">EXAMINATION LOCKED — DISQUALIFIED</h1>
          <p className="text-sm text-slate-700">{disqualifiedReason}</p>
          <p className="text-xs text-slate-500">
            Your previously saved answers have been preserved and your proctor has been notified. Please remain seated and contact the examination proctor.
          </p>
          <button
            type="button"
            onClick={() => navigate('/student/access', { replace: true })}
            className="px-5 py-2.5 text-sm font-semibold text-white bg-[#243B64] rounded-lg"
          >
            Exit Session
          </button>
        </div>
      </div>
    );
  }

  const currentQuestion = session.questions[currentIdx];
  const currentAnswer = currentQuestion ? answersMap[currentQuestion.id] : undefined;

  const isAnswered = (qId: number) => {
    const a = answersMap[qId];
    if (!a) return false;
    return (
      a.selectedOptions.length > 0 ||
      Object.keys(a.matchingAnswers).length > 0 ||
      a.essayText.trim().length > 0
    );
  };

  return (
    <div className="min-h-screen bg-[#F1F4F8] flex flex-col select-none">
      {/* Focused Exam Header */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 sticky top-0 z-30">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={assetUrl('assets/aistudio/logoku_6b323412.png')}
              alt="SMP Kartini 1 Batam"
              className="w-9 h-9 object-contain shrink-0"
              referrerPolicy="no-referrer"
            />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[#376FA6] truncate">
                {session.exam.subjectName} · {session.exam.title}
              </p>
              <p className="text-sm font-bold text-[#243B64] truncate">
                {session.student.studentName} ({session.student.studentNumber})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="hidden sm:flex items-center gap-1.5 text-xs">
              {isOnline ? (
                <Wifi className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <WifiOff className="w-3.5 h-3.5 text-amber-600" />
              )}
              <span className="text-slate-600">
                {syncState === 'saved'
                  ? 'Saved'
                  : syncState === 'saving'
                  ? 'Saving...'
                  : syncState === 'queued'
                  ? 'Queued Offline'
                  : 'Sync Issue'}
              </span>
            </div>

            {session.exam.antiCheatingEnabled && (
              <div className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-md tabular-nums">
                Warnings: {violationCount} / {session.exam.maxViolations}
              </div>
            )}

            <div
              className={`px-3.5 py-1.5 rounded-lg font-mono text-base font-bold tabular-nums border ${
                remainingSeconds <= 60
                  ? 'bg-red-50 text-red-700 border-red-200'
                  : remainingSeconds <= 300
                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                  : 'bg-[#EAF3FA] text-[#243B64] border-[#376FA6]/25'
              }`}
            >
              {formatTimer(remainingSeconds)}
            </div>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 max-w-[1440px] w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Question Area */}
        <div className="lg:col-span-3 bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
          {currentQuestion ? (
            <>
              <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <span className="text-sm font-bold text-[#243B64]">
                  Question {currentIdx + 1} of {session.questions.length}
                </span>
                {session.exam.allowMarkReview && (
                  <button
                    type="button"
                    onClick={() =>
                      updateAnswer(currentQuestion.id, {
                        isMarkedForReview: !currentAnswer?.isMarkedForReview,
                      })
                    }
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                      currentAnswer?.isMarkedForReview
                        ? 'bg-amber-50 border-amber-300 text-amber-900'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Flag className="w-3.5 h-3.5" />
                    <span>
                      {currentAnswer?.isMarkedForReview ? 'Marked for Review' : 'Mark for Review'}
                    </span>
                  </button>
                )}
              </div>

              {/* Embedded Media (Images / Audio / Video directly inside exam page) */}
              {currentQuestion.media.length > 0 && (
                <div className="space-y-3">
                  {currentQuestion.media.map((m, idx) => (
                    <div key={idx} className="p-3 rounded-lg bg-[#FAFBFD] border border-slate-200">
                      {m.mediaType === 'image' && (
                        <img
                          src={m.storageUrl}
                          alt={m.fileName}
                          className="max-h-80 mx-auto object-contain rounded"
                          referrerPolicy="no-referrer"
                        />
                      )}
                      {m.mediaType === 'audio' && (
                        <audio controls controlsList="nodownload" src={m.storageUrl} className="w-full" />
                      )}
                      {m.mediaType === 'video' && (
                        <video controls controlsList="nodownload" src={m.storageUrl} className="w-full max-h-80 rounded" />
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="text-base text-slate-900 leading-relaxed whitespace-pre-wrap select-text">
                {currentQuestion.questionText}
              </div>

              {/* Answer Input per Type */}
              {(currentQuestion.questionType === 'MULTIPLE_CHOICE' ||
                currentQuestion.questionType === 'TRUE_FALSE') && (
                <div className="space-y-2.5">
                  {currentQuestion.options.map((opt) => {
                    const selected = currentAnswer?.selectedOptions.includes(opt.optionKey);
                    return (
                      <label
                        key={opt.optionKey}
                        className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors ${
                          selected
                            ? 'border-[#376FA6] bg-[#EAF3FA]/60'
                            : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`q-${currentQuestion.id}`}
                          checked={Boolean(selected)}
                          onChange={() =>
                            updateAnswer(currentQuestion.id, { selectedOptions: [opt.optionKey] })
                          }
                          className="mt-1"
                        />
                        <div className="flex-1 space-y-2">
                          <div className="text-sm text-slate-800">
                            <span className="font-mono font-bold text-[#243B64] mr-2">
                              {opt.optionKey}.
                            </span>
                            {opt.optionText}
                          </div>
                          {opt.mediaUrl && (
                            <img
                              src={opt.mediaUrl}
                              alt={`Option ${opt.optionKey}`}
                              className="max-h-40 rounded border border-slate-200 object-contain"
                              referrerPolicy="no-referrer"
                            />
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              {currentQuestion.questionType === 'MULTIPLE_RESPONSE' && (
                <div className="space-y-2.5">
                  <p className="text-xs text-slate-500">Select all correct answers:</p>
                  {currentQuestion.options.map((opt) => {
                    const selected = currentAnswer?.selectedOptions.includes(opt.optionKey);
                    return (
                      <label
                        key={opt.optionKey}
                        className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors ${
                          selected
                            ? 'border-[#376FA6] bg-[#EAF3FA]/60'
                            : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(selected)}
                          onChange={(e) => {
                            const prev = currentAnswer?.selectedOptions || [];
                            const next = e.target.checked
                              ? [...prev, opt.optionKey]
                              : prev.filter((k) => k !== opt.optionKey);
                            updateAnswer(currentQuestion.id, { selectedOptions: next });
                          }}
                          className="mt-1"
                        />
                        <div className="text-sm text-slate-800">
                          <span className="font-mono font-bold text-[#243B64] mr-2">
                            {opt.optionKey}.
                          </span>
                          {opt.optionText}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              {currentQuestion.questionType === 'MATCHING' && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500">
                    Match each statement on the left with the corresponding option on the right:
                  </p>
                  {currentQuestion.matchingPrompts.map((p) => (
                    <div
                      key={p.promptKey}
                      className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center p-3 rounded-xl border border-slate-200 bg-[#FAFBFD]"
                    >
                      <div className="text-sm font-medium text-slate-800">
                        <span className="font-mono font-bold text-[#243B64] mr-2">
                          {p.promptKey}.
                        </span>
                        {p.promptText}
                      </div>
                      <select
                        value={currentAnswer?.matchingAnswers?.[p.promptKey] || ''}
                        onChange={(e) => {
                          const next = {
                            ...(currentAnswer?.matchingAnswers || {}),
                            [p.promptKey]: e.target.value,
                          };
                          updateAnswer(currentQuestion.id, { matchingAnswers: next });
                        }}
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                      >
                        <option value="">— Select matching answer —</option>
                        {currentQuestion.matchingChoices.map((c) => (
                          <option key={c.matchKey} value={c.matchKey}>
                            {c.matchText}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}

              {currentQuestion.questionType === 'ESSAY' && (
                <div>
                  <textarea
                    rows={7}
                    value={currentAnswer?.essayText || ''}
                    onChange={(e) =>
                      updateAnswer(currentQuestion.id, { essayText: e.target.value })
                    }
                    placeholder="Write your essay answer clearly here..."
                    className="w-full px-4 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#376FA6]/25 focus:border-[#376FA6] select-text"
                  />
                </div>
              )}

              {/* Navigation Buttons */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                {session.exam.allowPrevious ? (
                  <button
                    type="button"
                    disabled={currentIdx === 0}
                    onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Previous</span>
                  </button>
                ) : (
                  <div />
                )}

                {currentIdx < session.questions.length - 1 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setCurrentIdx((i) => Math.min(session.questions.length - 1, i + 1))
                    }
                    className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white bg-[#376FA6] hover:bg-[#2b5b8a] rounded-lg"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmSubmitOpen(true)}
                    className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white bg-[#243B64] hover:bg-[#1a2c4b] rounded-lg"
                  >
                    <Send className="w-4 h-4" />
                    <span>Submit Exam</span>
                  </button>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">No questions available in this examination.</p>
          )}
        </div>

        {/* Question Sidebar */}
        <aside className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
          <div>
            <h2 className="text-sm font-semibold text-[#243B64] mb-3">Question Navigator</h2>
            <div className="grid grid-cols-5 gap-2">
              {session.questions.map((q, idx) => {
                const answered = isAnswered(q.id);
                const marked = answersMap[q.id]?.isMarkedForReview;
                const active = idx === currentIdx;

                let style = 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50';
                if (marked) style = 'bg-amber-50 border-amber-300 text-amber-900';
                else if (answered) style = 'bg-[#EAF3FA] border-[#376FA6] text-[#243B64]';

                return (
                  <button
                    key={q.id}
                    type="button"
                    disabled={!session.exam.allowNavigation}
                    onClick={() => setCurrentIdx(idx)}
                    className={`h-9 rounded-lg border text-xs font-mono font-semibold tabular-nums transition-all ${style} ${
                      active ? 'ring-2 ring-[#243B64]' : ''
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5 text-xs text-slate-600 pt-3 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-[#EAF3FA] border border-[#376FA6]" />
              <span>Answered</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-amber-50 border border-amber-300" />
              <span>Marked for Review</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-white border border-slate-200" />
              <span>Unanswered</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setConfirmSubmitOpen(true)}
            className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-[#243B64] hover:bg-[#1a2c4b] rounded-lg transition-colors"
          >
            SUBMIT EXAM
          </button>
        </aside>
      </div>

      {/* Security Warning Modal */}
      <Modal
        open={Boolean(securityWarning)}
        onClose={() => setSecurityWarning(null)}
        title={`Security Alert — ${securityWarning?.severity || ''}`}
        maxWidthClass="max-w-md"
        footer={
          <button
            type="button"
            onClick={() => setSecurityWarning(null)}
            className="px-4 py-2 text-sm font-semibold text-white bg-[#243B64] rounded-lg"
          >
            Acknowledge & Resume
          </button>
        }
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-slate-700 leading-relaxed">{securityWarning?.message}</p>
        </div>
      </Modal>

      {/* Re-Enter Fullscreen Modal */}
      <Modal
        open={needsFullscreenPrompt && !securityWarning}
        onClose={() => {}}
        title="Fullscreen Mode Required"
        maxWidthClass="max-w-md"
        footer={
          <button
            type="button"
            onClick={async () => {
              try {
                await document.documentElement.requestFullscreen();
                setNeedsFullscreenPrompt(false);
              } catch {
                showToast('warning', 'Press F11 or allow fullscreen permission to continue.');
              }
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#243B64] rounded-lg"
          >
            <Maximize2 className="w-4 h-4" />
            <span>Enter Fullscreen</span>
          </button>
        }
      >
        <p className="text-sm text-slate-600 leading-relaxed">
          This examination requires full-screen mode. Exiting full-screen during an active attempt is logged by the Kartini Exam Security System.
        </p>
      </Modal>

      {/* Submit Confirmation Modal */}
      <ConfirmModal
        open={confirmSubmitOpen}
        onClose={() => setConfirmSubmitOpen(false)}
        onConfirm={() => void handleFinalSubmit(false)}
        title="Submit Examination"
        description={`Are you sure you want to submit your answers now? You have answered ${
          session.questions.filter((q) => isAnswered(q.id)).length
        } of ${session.questions.length} questions. Once submitted, answers cannot be edited.`}
        confirmLabel="Confirm & Submit"
        loading={submitting}
      />
    </div>
  );
}
