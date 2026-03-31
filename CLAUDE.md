# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint (Next.js core web vitals)
```

## Architecture

This is a **Next.js 16 App Router** project (JavaScript, no TypeScript) for a divorce coaching business website. Deployed on **Vercel** with **Supabase** as the backend (auth, database, storage, realtime).

**Navigation model:** SPA-style. A `page` state variable in `src/app/page.js` controls which view renders. Auth state from `useAuth()` context determines public vs portal views. No file-based routing beyond the single `page.js` entry point. New users without `first_name` are forced to the Profile setup page on first login.

**File structure:**
- `src/app/page.js` — slim root component (imports + routing logic)
- `src/app/api/invite/route.js` — server-side API for admin user invitations
- `src/app/api/clients/route.js` — server-side API for admin to list all clients (bypasses RLS)
- `src/components/` — public page components (HomePage, AboutPage, ContactPage, LoginPage)
- `src/components/portal/` — authenticated views (PortalHome, Documents, Schedule, Messages, Profile, Clients)
- `src/components/illustrations/` — inline SVG components (Hero, CoParent, Coach)
- `src/lib/constants.js` — `C` (color palette) and `S` (reusable style objects)
- `src/lib/hooks.js` — `useIsMobile()` (768px breakpoint)
- `src/lib/supabase/client.js` — browser Supabase client via `createBrowserClient()`
- `src/lib/supabase/middleware.js` — session refresh helper
- `src/context/AuthContext.js` — `AuthProvider` + `useAuth()` hook (user, profile, loading, refreshProfile)
- `src/proxy.js` — Next.js 16 proxy (replaces middleware) for session refresh

**Styling:** All inline styles via `C` (colors) and `S` (style objects) from `src/lib/constants.js`. No CSS modules, Tailwind, or CSS-in-JS.

## Supabase Integration

**Tables:** `profiles`, `contact_submissions`, `documents`, `availability`, `bookings`, `messages`
**Schema:** `supabase-schema.sql` — base schema. Profiles also has `first_name`, `last_name`, `phone`, `preferred_email` columns (added post-schema).
**Auth:** Email/password via `@supabase/ssr`. `profiles.role` distinguishes `client` vs `admin`.
**Invitations:** Admins invite new clients via `/api/invite` (uses service_role key). No public sign-up.
**Storage:** Private `documents` bucket, path pattern `{user_id}/{filename}`
**Realtime:** Enabled on `messages` table for live chat
**Env vars:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`

**RLS note:** The admin read policy on `profiles` was dropped due to infinite recursion. Admin access to all profiles is handled via server-side API routes using the service_role key instead.

## Key Conventions

- Path alias: `@/*` maps to `./src/*`
- No TypeScript, Tailwind, or CSS-in-JS — pure inline styles
- No testing framework, no CI/CD
- SVG illustrations are inline React components, not image files
- Phone numbers displayed in `(xxx) xxx-xxxx` format throughout the app
- Admin bootstrap: create account via Supabase dashboard, then `update profiles set role = 'admin'`
- New clients are invited by admins only (no public registration)
