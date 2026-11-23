# KARTINI EXAM PORTAL — SMP KARTINI 1 BATAM
International-Standard Computer-Based Examination (CBE) Management System

## Architecture Overview
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons, Recharts, Mammoth.js (`.DOCX` parser), SheetJS (`xlsx`), `jsPDF`, `qrcode`.
- **Backend**: Node.js + Express (`server.ts`) with WebSocket live monitoring (`ws`) on port `3000`.
- **Database**: PostgreSQL with Drizzle ORM (`src/db/schema.ts`) — 25 normalized tables covering RBAC, teachers, students, 5 question types, multimedia metadata, exam schedules, tokens, server-timed attempts, anti-cheating violations, results, admission cards, and audit logs.
- **Authentication & Security**:
  - Firebase Auth (Google Sign-In) + server-side `scrypt` password hashing + HMAC-SHA256 Bearer session tokens stored strictly in JS memory.
  - Role-Based Access Control (RBAC): Admin has full access; Subject Teachers (`Guru Mapel`) are strictly restricted on both frontend and backend to their assigned subjects.
  - Student Exam Access requires participant number, name verification, class, and a valid server-verified session token (with rate limiting). Answer keys and scores are never sent to student browsers.

## Local Development & Database Setup
1. **Install dependencies**:
   ```bash
   npm install
   ```
2. **Environment variables**:
   Copy `.env.example` to `.env` and configure your PostgreSQL connection variables (`SQL_HOST`, `SQL_USER`, `SQL_PASSWORD`, `SQL_DB_NAME`, `SQL_ADMIN_USER`, `SQL_ADMIN_PASSWORD`) and optional `INITIAL_ADMIN_EMAIL`.
3. **Apply Database Schema**:
   ```bash
   npx drizzle-kit push --config=src/db/drizzle.config.ts
   ```
   For standalone Supabase deployments, run `supabase/migrations/001_initial_schema.sql` and `supabase/migrations/002_rls_policies.sql`.
4. **First Administrator Setup**:
   - No hardcoded default admin password exists.
   - Open `/admin/login` and click **Claim Admin** to register the first administrator credentials securely, OR sign in with Google using the configured `INITIAL_ADMIN_EMAIL`.
5. **Run Development Server**:
   ```bash
   npm run dev
   ```

## Deployment Notes
- **Important**: Static hosts like GitHub Pages **cannot** execute the PostgreSQL backend, Express API routes, server-authoritative exam timers, or WebSocket monitoring server.
- Deploy the full-stack server (`server.ts` + `dist/`) to **Cloud Run**, **Railway**, **Render**, or a Node.js VPS connected to PostgreSQL, or pair a Vercel/Netlify frontend with Supabase Edge Functions.
- Build production bundle with:
  ```bash
  npm run lint && npm run build
  ```
