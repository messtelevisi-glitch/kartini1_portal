import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Clock, KeyRound, ShieldAlert, Volume2 } from 'lucide-react';
import { useToast } from '../../components/ui/ToastProvider';
import { apiRequest, assetUrl, setStudentToken } from '../../services/api';
import { examAlarm } from '../../utils/alarmAudio';

interface UpcomingSchedule {
  id: number;
  examTitle: string;
  subjectName: string;
  className: string;
  examDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  releaseStatus: string;
}

interface ConfirmationPayload {
  attemptId: number;
  studentNumber: string;
  studentName: string;
  className: string;
  subjectName: string;
  examTitle: string;
  examType: string;
  durationMinutes: number;
  startTime: string;
  serverEndTime: string;
  serverNow: string;
  instructions: string;
  totalQuestions: number;
  requireFullscreen: boolean;
  antiCheatingEnabled: boolean;
  maxViolations: number;
}

function formatCountdown(ms: number) {
  if (ms <= 0) return '00:00:00';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

export function StudentAccessPage() {
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [studentNumber, setStudentNumber] = useState('');
  const [studentName, setStudentName] = useState('');
  const [className, setClassName] = useState('');
  const [tokenCode, setTokenCode] = useState('');
  const [validating, setValidating] = useState(false);

  const [schedules, setSchedules] = useState<UpcomingSchedule[]>([]);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [nowTick, setNowTick] = useState(Date.now());
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  const [confirmation, setConfirmation] = useState<ConfirmationPayload | null>(null);
  const [agreedRules, setAgreedRules] = useState(false);

  useEffect(() => {
    apiRequest<{
      serverTimeIso: string;
      maintenanceMode: boolean;
      schedules: UpcomingSchedule[];
    }>('/api/student/upcoming', {}, 'public')
      .then((res) => {
        const srv = new Date(res.serverTimeIso).getTime();
        setServerOffsetMs(srv - Date.now());
        setSchedules(res.schedules);
        setMaintenanceMode(res.maintenanceMode);
      })
      .catch(() => {});

    const iv = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  const handleValidate = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidating(true);
    try {
      const res = await apiRequest<{
        studentToken: string;
        confirmation: ConfirmationPayload;
      }>(
        '/api/student/validate-token',
        {
          method: 'POST',
          body: JSON.stringify({
            studentNumber,
            studentName,
            className,
            tokenCode,
          }),
        },
        'public'
      );
      setStudentToken(res.studentToken);
      setConfirmation(res.confirmation);
      showToast('success', 'Participant verified', 'Review the examination rules before starting.');
    } catch (err: any) {
      showToast('error', 'Access Denied', err.message || 'Invalid credentials or token.');
    } finally {
      setValidating(false);
    }
  };

  const handleStartExam = async () => {
    if (!confirmation || !agreedRules) return;

    // Unlock Web Audio alarm during user click gesture
    examAlarm.unlock();

    // Request Fullscreen if required
    if (confirmation.requireFullscreen && document.documentElement.requestFullscreen) {
      try {
        await document.documentElement.requestFullscreen();
      } catch {
        // Fullscreen may require retry inside exam screen if blocked
      }
    }
    navigate('/student/exam');
  };

  const serverNowMs = nowTick + serverOffsetMs;

  return (
    <div className="min-h-screen bg-[#F1F4F8] flex flex-col justify-between">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-8">
          <div className="flex items-center gap-3 whitespace-nowrap shrink-0">
            <img
              src={assetUrl('assets/aistudio/logoku_6b323412.png')}
              alt="SMP Kartini 1 Batam Logo"
              className="w-9 h-9 object-contain"
              referrerPolicy="no-referrer"
            />
            <span className="text-base font-bold text-[#243B64]">KARTINI EXAM PORTAL</span>
          </div>

          <nav className="hidden sm:flex items-center gap-6 text-sm font-medium text-slate-600">
            <Link to="/student/access" className="text-[#376FA6] font-semibold whitespace-nowrap">
              Student Exam Access
            </Link>
            <Link to="/teacher/login" className="hover:text-[#243B64] whitespace-nowrap">
              Teacher Login
            </Link>
            <Link to="/admin/login" className="hover:text-[#243B64] whitespace-nowrap">
              Admin Login
            </Link>
          </nav>

          <span className="font-mono text-xs text-slate-500 tabular-nums whitespace-nowrap shrink-0">
            Server: {new Date(serverNowMs).toLocaleTimeString()}
          </span>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8">
        {maintenanceMode && (
          <div className="mb-6 p-4 rounded-xl border border-amber-300 bg-amber-50 text-sm text-amber-900">
            The examination portal is currently under scheduled maintenance. Please wait for your proctor's announcement.
          </div>
        )}

        {!confirmation ? (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
            {/* Access Form */}
            <div className="lg:col-span-3 bg-white border border-slate-200 rounded-xl p-7">
              <div className="flex items-center gap-3 pb-5 mb-5 border-b border-slate-100">
                <img
                  src={assetUrl('assets/aistudio/logoku_6b323412.png')}
                  alt="SMP Kartini 1 Batam Crest"
                  className="w-12 h-12 object-contain"
                  referrerPolicy="no-referrer"
                />
                <div>
                  <p className="text-xs font-semibold text-[#376FA6]">SMP KARTINI 1 BATAM</p>
                  <h1 className="text-xl font-bold text-[#243B64]">Student Examination Access</h1>
                </div>
              </div>

              <form onSubmit={handleValidate} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Nomor Peserta Ujian
                    </label>
                    <input
                      type="text"
                      required
                      value={studentNumber}
                      onChange={(e) => setStudentNumber(e.target.value)}
                      placeholder="e.g. KRT-2026-001"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-[#376FA6]/25 focus:border-[#376FA6]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Kelas</label>
                    <input
                      type="text"
                      required
                      value={className}
                      onChange={(e) => setClassName(e.target.value)}
                      placeholder="e.g. 8A"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg uppercase focus:outline-none focus:ring-2 focus:ring-[#376FA6]/25 focus:border-[#376FA6]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nama Lengkap Siswa (Verification)
                  </label>
                  <input
                    type="text"
                    required
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    placeholder="Enter your full registered name"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#376FA6]/25 focus:border-[#376FA6]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Token Ujian (Issued by Proctor)
                  </label>
                  <input
                    type="text"
                    required
                    value={tokenCode}
                    onChange={(e) => setTokenCode(e.target.value.toUpperCase())}
                    placeholder="6-character session token"
                    className="w-full px-3.5 py-2.5 text-base font-mono font-bold tracking-widest uppercase border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#376FA6]/25 focus:border-[#376FA6]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={validating || maintenanceMode}
                  className="w-full py-3 px-4 text-sm font-semibold text-white bg-[#243B64] hover:bg-[#1a2c4b] rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <KeyRound className="w-4 h-4" />
                  <span>{validating ? 'Verifying Session...' : 'Verify Identity & Enter Exam'}</span>
                </button>
              </form>
            </div>

            {/* Active / Upcoming Schedules with Server Countdown */}
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#376FA6]" />
                <h2 className="text-sm font-semibold text-[#243B64]">Examination Schedule</h2>
              </div>

              {schedules.length === 0 ? (
                <p className="text-xs text-slate-500 py-4">
                  No published examinations scheduled at this moment.
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {schedules.map((s) => {
                    const startMs = new Date(s.startTime).getTime();
                    const diffMs = startMs - serverNowMs;
                    const started = diffMs <= 0;
                    return (
                      <div key={s.id} className="py-3 first:pt-0 last:pb-0">
                        <p className="text-xs font-semibold text-[#243B64]">{s.examTitle}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {s.subjectName} · Class {s.className} · {s.durationMinutes} min
                        </p>
                        <div className="mt-1.5 flex items-center justify-between text-xs">
                          <span className={started ? 'text-emerald-700 font-semibold' : 'text-[#376FA6] font-medium'}>
                            {started ? 'Session Open' : 'Starts In'}
                          </span>
                          {!started && (
                            <span className="font-mono font-semibold text-[#243B64] tabular-nums">
                              {formatCountdown(diffMs)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Confirmation Screen Before START EXAM */
          <div className="max-w-2xl mx-auto bg-white border border-slate-200 rounded-xl p-7 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <p className="text-xs font-semibold text-[#376FA6]">PARTICIPANT VERIFICATION CONFIRMED</p>
                <h2 className="text-xl font-bold text-[#243B64] mt-0.5">{confirmation.examTitle}</h2>
              </div>
              <img
                src={assetUrl('assets/aistudio/logoku_6b323412.png')}
                alt="SMP Kartini 1 Batam"
                className="w-11 h-11 object-contain"
                referrerPolicy="no-referrer"
              />
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm bg-[#FAFBFD] p-4 rounded-xl border border-slate-200">
              <div>
                <p className="text-xs text-slate-500">Participant Name</p>
                <p className="font-semibold text-[#243B64]">{confirmation.studentName}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Participant Number</p>
                <p className="font-mono font-semibold text-[#243B64]">{confirmation.studentNumber}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Class</p>
                <p className="font-semibold text-slate-800">{confirmation.className}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Subject</p>
                <p className="font-semibold text-slate-800">{confirmation.subjectName}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Duration & Questions</p>
                <p className="font-semibold text-slate-800 tabular-nums">
                  {confirmation.durationMinutes} Minutes · {confirmation.totalQuestions} Questions
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Session Start Time</p>
                <p className="font-mono text-xs font-semibold text-slate-800 tabular-nums">
                  {new Date(confirmation.startTime).toLocaleString()}
                </p>
              </div>
            </div>

            <div className="space-y-2 text-xs text-slate-700">
              <p className="font-semibold text-[#243B64]">Examination Instructions & Integrity Rules:</p>
              <p className="leading-relaxed">{confirmation.instructions}</p>
              <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-950 space-y-1.5">
                <p className="font-semibold flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-amber-700" />
                  <span>Kartini Exam Security System Active</span>
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Full-screen mode is required throughout the examination.</li>
                  <li>Switching tabs, minimizing the browser, or losing window focus is logged in real time.</li>
                  <li>
                    Warnings 1–{confirmation.maxViolations} trigger an audible alarm; violation{' '}
                    {confirmation.maxViolations + 1} causes automatic disqualification.
                  </li>
                  <li className="flex items-center gap-1">
                    <Volume2 className="w-3.5 h-3.5 inline shrink-0" />
                    <span>Clicking Start Exam enables security audio alerts.</span>
                  </li>
                </ul>
              </div>
            </div>

            <label className="flex items-start gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={agreedRules}
                onChange={(e) => setAgreedRules(e.target.checked)}
                className="mt-1"
              />
              <span className="text-slate-700">
                I confirm my identity above is accurate and agree to abide by the SMP Kartini 1 Batam examination integrity rules.
              </span>
            </label>

            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmation(null);
                  setStudentToken(null);
                }}
                className="px-4 py-2.5 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50"
              >
                Back
              </button>
              <button
                type="button"
                disabled={!agreedRules}
                onClick={handleStartExam}
                className="px-6 py-2.5 text-sm font-semibold text-white bg-[#243B64] hover:bg-[#1a2c4b] rounded-lg disabled:opacity-40"
              >
                START EXAM
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="py-4 text-center text-xs text-slate-500 border-t border-slate-200 bg-white">
        SMP Kartini 1 Batam · Computer-Based Examination Portal
      </footer>
    </div>
  );
}
