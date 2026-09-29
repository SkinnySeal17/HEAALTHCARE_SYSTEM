# Architectural Decision Log

Milestone: frontend MVP code baseline on a documentation-first branch.

## ADR-001 — React frontend initialization

**Status:** Accepted

**Decision:** Initialize the frontend as a Vite + React application in `FRONTEND/`, with React 19, `lucide-react`, and Tailwind CSS v4 wired through `vite.config.js`.

**Context:** The repository previously held requirements, architecture diagrams, and an empty `FRONTEND/` folder. This milestone needs a runnable UI shell without introducing backend, routing libraries, or clinical data clients.

**Consequences:**
- `npm install` and `npm run dev` are enough to launch the sandbox UI.
- Utility-first Tailwind classes (zinc/slate neutrals, thin borders, high-contrast spacing) keep the empty dashboard looking like a Figma canvas.
- Future screens can be added as components under `src/` without changing the build toolchain.

## ADR-002 — State-based component routing

**Status:** Accepted

**Decision:** Route Welcome, Login, and Dashboard through local React state in `src/App.jsx` instead of React Router or a file-based router.

**Context:** This branch only needs a linear three-screen sequence. A router package would add dependency, URL, and layout overhead before any FHIR or terminology work exists.

**Consequences:**
- Screen order is explicit: Welcome Page → Login View → Empty Dashboard Base.
- Session data (full name and selected profile) stays in component state for this milestone.
- A URL router can replace the state switch later without rewriting the screen markup.

## ADR-003 — Preparation for medical terminology integration grids

**Status:** Accepted

**Decision:** Ship the dashboard as an empty canvas with a stable top navigation chrome, leaving the main region free for future terminology mapping grids.

**Context:** MedTalk Connect validation will later surface FHIR R4 / clinical terminology alignment (SNOMED CT-AU, AMT, and related mapping chains). Those grids need a clean host surface, not a pre-filled dashboard.

**Consequences:**
- The current dashboard card is a placeholder greeting only.
- Navigation identity (`AU-Sandbox`, user name, logout) is already in place for later clinician and tester workflows.
- Terminology tables, mapping inspectors, and FHIR resource panes can mount in the main canvas without restructuring the shell.

## ADR-004 — Native SMART on FHIR OAuth 2.0 simulation

**Status:** Accepted

**Decision:** Implement Phase 3 SMART App Launch as an in-process FastAPI mock identity provider in `backend/app/auth_smart.py`, with `/.well-known/smart-configuration`, `/auth/authorize`, and `/auth/token`.

**Context:** Assessment 2 specifies SMART on FHIR / OAuth 2.0 for FHIR interface authentication and requires connector testing without binding to production EMR registries (Best Practice, Halo Connect, Oracle Health). This milestone needs a runnable authorization simulation that stays on synthetic patient targets.

**Consequences:**
- Discovery, short-lived authorization codes (90s, single use), and token exchange run locally through `uvicorn app.auth_smart:app`.
- Every token response injects the explicit synthetic client context `patient: PT-AU-94821` and `fhirUser: DrAlexSmith` so downstream clinic-context sync can be exercised without a live Best Practice session.
- `aud` and `redirect_uri` are rejected unless they resolve to a localhost or sandbox/synthetic host. Real identifier prefixes such as IHI `800360` are blocked.
- No production clinical registry models are imported, called, or stored.

## ADR-005 — Launch-parameter state routing with production isolation

**Status:** Accepted

**Decision:** Keep state-based routing in `frontend/src/App.jsx` and add a `useEffect` hook that consumes SMART `launch` and `iss` query parameters, then routes accepted launches into the existing login profile-resolution screen.

**Context:** EHR launch arrives as a query string on the SPA. Introducing a URL router would add overhead. Unauthenticated views must not inherit production issuer or launch values.

**Consequences:**
- A valid synthetic `launch` + `iss` pair skips Welcome and opens Login for Doctor / Tester resolution.
- The query string is stripped immediately. Production hosts, unknown schemes, and malformed launch tokens never enter React state.
- Unauthenticated UI shows only a generic sandbox-launch message; it does not echo `launch` or `iss`.
- Logout clears both the session and any retained synthetic launch context.

## ADR-006 — Federated healthcare SSO instead of local credentials

**Status:** Accepted

**Decision:** Replace the login view's local full-name and profile-toggle form with a MedTalk Identity & Access Management card that offers two federated execution paths: clinician hospital-provider SSO and a developer pipeline key.

**Context:** Australian health-provider access is modeled on PRODA, My Health Record, and hospital Active Directory, not a local username/password database. A sandbox IAM surface should mirror that blueprint so Stage 2 connector work does not imply a custom credential store.

**Consequences:**
- No local username/password database is collected, stored, or validated in the React shell.
- Clinician SSO immediately establishes the synthetic session `Dr. Alex Smith` / `doctor` and routes to the dashboard.
- Tester access uses a masked sandbox token field only; any non-empty key grants Tester privileges as `System Tester`.
- SMART `launch` / `iss` handling is unchanged: accepted launches still land on this IAM card, and production parameters still never enter unauthenticated state.
