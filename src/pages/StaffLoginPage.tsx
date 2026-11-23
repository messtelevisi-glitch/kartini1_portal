import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, KeyRound, Lock, ShieldCheck, UserCheck } from 'lucide-react';
import { useAuth } from '../features/auth/AuthContext';
import { useToast } from '../components/ui/ToastProvider';
import { assetUrl } from '../services/api';

export function StaffLoginPage({ portalRole }: { portalRole: 'admin' | 'teacher' }) {
  const { user, hasClaimedAdmin, loginWithCredentials, claimInitialAdmin, loginWithGoogle } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // First-run Admin Setup state
  const [claimMode, setClaimMode] = useState(false);
  const [claimUsername, setClaimUsername] = useState('admin');
  const [claimEmail, setClaimEmail] = useState('');
  const [claimFullName, setClaimFullName] = useState('Administrator SMP Kartini 1 Batam');
  const [claimPassword, setClaimPassword] = useState('');

  useEffect(() => {
    if (user) {
      navigate(user.role === 'admin' ? '/admin/dashboard' : '/teacher/dashboard', { replace: true });
    }
  }, [user, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const loggedUser = await loginWithCredentials(identifier, password, portalRole);
      showToast('success', 'Sign-in successful', `Welcome, ${loggedUser.fullName}`);
      navigate(loggedUser.role === 'admin' ? '/admin/dashboard' : '/teacher/dashboard');
    } catch (err: any) {
      showToast('error', 'Sign-in failed', err.message || 'Check your credentials.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClaimAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const loggedUser = await claimInitialAdmin({
        username: claimUsername,
        email: claimEmail,
        fullName: claimFullName,
        password: claimPassword,
      });
      showToast('success', 'Administrator account claimed', 'Your admin credentials are now active.');
      navigate(loggedUser.role === 'admin' ? '/admin/dashboard' : '/teacher/dashboard');
    } catch (err: any) {
      showToast('error', 'Setup failed', err.message || 'Could not initialize administrator account.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setSubmitting(true);
    try {
      const loggedUser = await loginWithGoogle();
      showToast('success', 'Google sign-in verified', `Welcome, ${loggedUser.fullName}`);
      navigate(loggedUser.role === 'admin' ? '/admin/dashboard' : '/teacher/dashboard');
    } catch (err: any) {
      showToast('error', 'Google sign-in failed', err.message || 'Account not authorized.');
    } finally {
      setSubmitting(false);
    }
  };

  const isAdminPortal = portalRole === 'admin';

  return (
    <div className="min-h-screen bg-[#F1F4F8] flex flex-col justify-between">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-8">
          <Link to="/student/access" className="flex items-center gap-3 whitespace-nowrap shrink-0">
            <img
              src={assetUrl('assets/aistudio/logoku_6b323412.png')}
              alt="SMP Kartini 1 Batam Logo"
              className="w-9 h-9 object-contain"
              referrerPolicy="no-referrer"
            />
            <span className="text-base font-bold text-[#243B64]">KARTINI EXAM PORTAL</span>
          </Link>

          <nav className="hidden sm:flex items-center gap-6 text-sm font-medium text-slate-600">
            <Link to="/student/access" className="hover:text-[#243B64] whitespace-nowrap">
              Student Exam Access
            </Link>
            <Link
              to="/teacher/login"
              className={`whitespace-nowrap ${!isAdminPortal ? 'text-[#376FA6] font-semibold' : 'hover:text-[#243B64]'}`}
            >
              Teacher Login
            </Link>
            <Link
              to="/admin/login"
              className={`whitespace-nowrap ${isAdminPortal ? 'text-[#376FA6] font-semibold' : 'hover:text-[#243B64]'}`}
            >
              Admin Login
            </Link>
          </nav>

          <Link
            to="/student/access"
            className="px-4 py-2 text-xs font-semibold text-white bg-[#243B64] hover:bg-[#1c2f50] rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            Enter Exam Token
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-4xl grid md:grid-cols-5 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          {/* Left Institutional Panel */}
          <div className="md:col-span-2 bg-[#243B64] text-white p-8 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-6">
                <img
                  src={assetUrl('assets/aistudio/logoku_6b323412.png')}
                  alt="SMP Kartini 1 Batam Crest"
                  className="w-14 h-14 object-contain bg-white rounded-full p-1"
                  referrerPolicy="no-referrer"
                />
                <img
                  src={assetUrl('assets/aistudio/LOGO_YKB_RESOLUSI_BESAR_d340cd5e.png')}
                  alt="Yayasan Keluarga Batam Logo"
                  className="w-12 h-12 object-contain bg-white/95 rounded-lg p-1"
                  referrerPolicy="no-referrer"
                />
              </div>
              <p className="text-xs font-semibold tracking-wider text-[#D7B56D] mb-2">
                SMP KARTINI 1 BATAM
              </p>
              <h1 className="text-2xl font-bold leading-tight mb-3">
                {isAdminPortal ? 'Administrator Console' : 'Subject Teacher Portal'}
              </h1>
              <p className="text-sm text-slate-200 leading-relaxed">
                {isAdminPortal
                  ? 'Full governance over examination schedules, session tokens, teacher subject assignments, student rosters, and admission cards.'
                  : 'Manage your assigned subject question banks, Word imports, live exam monitoring, essay grading, and score reports.'}
              </p>
            </div>

            <div className="pt-8 border-t border-white/15 mt-8 text-xs text-slate-300 space-y-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#6EAAA1] shrink-0" />
                <span>Role-Based Subject Access Control</span>
              </div>
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#D7B56D] shrink-0" />
                <span>Server-Authoritative Exam Security</span>
              </div>
            </div>
          </div>

          {/* Right Form Panel */}
          <div className="md:col-span-3 p-8">
            {isAdminPortal && !hasClaimedAdmin && (
              <div className="mb-6 p-4 rounded-xl bg-[#EAF3FA] border border-[#376FA6]/25">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[#243B64]">
                      First-Run Administrator Setup
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      No local admin password has been set yet. Claim the initial administrator credentials or sign in with Google.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setClaimMode((v) => !v)}
                    className="px-3 py-1.5 text-xs font-semibold bg-[#243B64] text-white rounded-lg hover:bg-[#1a2c4b] whitespace-nowrap shrink-0"
                  >
                    {claimMode ? 'Back to Sign In' : 'Claim Admin'}
                  </button>
                </div>
              </div>
            )}

            {claimMode && isAdminPortal && !hasClaimedAdmin ? (
              <form onSubmit={handleClaimAdmin} className="space-y-4">
                <h2 className="text-lg font-semibold text-[#243B64]">
                  Initialize First Administrator Account
                </h2>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={claimFullName}
                    onChange={(e) => setClaimFullName(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#376FA6]/25 focus:border-[#376FA6]"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Username</label>
                    <input
                      type="text"
                      required
                      minLength={3}
                      value={claimUsername}
                      onChange={(e) => setClaimUsername(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#376FA6]/25 focus:border-[#376FA6]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Admin Email</label>
                    <input
                      type="email"
                      required
                      value={claimEmail}
                      onChange={(e) => setClaimEmail(e.target.value)}
                      placeholder="admin@smpkartini1batam.sch.id"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#376FA6]/25 focus:border-[#376FA6]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Password (minimum 8 characters)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={claimPassword}
                    onChange={(e) => setClaimPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#376FA6]/25 focus:border-[#376FA6]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-[#243B64] hover:bg-[#1a2c4b] rounded-lg transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Creating Administrator...' : 'Complete Administrator Setup'}
                </button>
              </form>
            ) : (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-[#243B64]">
                    {isAdminPortal ? 'Administrator Sign In' : 'Guru Mapel Sign In'}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Sign in with your assigned username/email and password or authorized Google account.
                  </p>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Username or Email
                    </label>
                    <input
                      type="text"
                      required
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder={isAdminPortal ? 'admin or email@school.sch.id' : 'teacher.username or email'}
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#376FA6]/25 focus:border-[#376FA6]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Password</label>
                    <div className="relative">
                      <input
                        type={showPass ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        className="w-full pl-3.5 pr-10 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#376FA6]/25 focus:border-[#376FA6]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPass((v) => !v)}
                        aria-label={showPass ? 'Hide password' : 'Show password'}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                      >
                        {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-[#243B64] hover:bg-[#1a2c4b] rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <UserCheck className="w-4 h-4" />
                    <span>{submitting ? 'Signing in...' : 'Sign In'}</span>
                  </button>
                </form>

                <div className="relative flex items-center py-1">
                  <div className="flex-grow border-t border-slate-200" />
                  <span className="shrink mx-3 text-xs text-slate-400">or</span>
                  <div className="flex-grow border-t border-slate-200" />
                </div>

                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={submitting}
                  className="w-full py-2.5 px-4 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors flex items-center justify-center gap-2.5 disabled:opacity-50"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                    />
                  </svg>
                  <span>Continue with Google Workspace</span>
                </button>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <Link to="/student/access" className="text-[#376FA6] hover:underline flex items-center gap-1">
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Student Exam Portal</span>
                  </Link>
                  <Link
                    to={isAdminPortal ? '/teacher/login' : '/admin/login'}
                    className="hover:text-[#243B64] hover:underline"
                  >
                    {isAdminPortal ? 'Switch to Teacher Login' : 'Switch to Admin Login'}
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="py-4 text-center text-xs text-slate-500 border-t border-slate-200 bg-white">
        SMP Kartini 1 Batam · Yayasan Keluarga Batam · International Computer-Based Examination System
      </footer>
    </div>
  );
}
