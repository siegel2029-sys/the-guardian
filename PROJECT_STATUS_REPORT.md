# Application Status Report — The Guardian

**Report type:** Codebase audit (static analysis)  
**Scope:** Repository as of audit date  
**Audience:** Engineering leads and future maintainers  

---

## 1. Tech Stack & Architecture

### Core runtime & tooling

- **Framework:** React 19 with **Vite 8** and **TypeScript** (~6.0).
- **Routing:** `react-router-dom` v7 — three logical areas: `/login`, `/therapist` (dashboard), `/patient-portal` (patient-facing).
- **Build:** `vite.config.ts` uses `@vitejs/plugin-react` and `@tailwindcss/vite`.

### UI & visualization

- **Styling:** **Tailwind CSS v4** (utility-first), plus inline gradients and RTL (`dir="rtl"`) for Hebrew-first UX.
- **Icons:** `lucide-react`.
- **Charts:** `recharts` for therapist-side analytics.
- **3D:** `three`, `@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing`, `postprocessing` — used for the anatomical / body-map experience and related visuals.

### Architectural pattern

- **Single-page application (SPA)** with **no dedicated backend** in this repo.
- **Global state:** Two large **React Context** providers — `AuthProvider` and `PatientProvider` — not Redux, Zustand, or TanStack Query.
- **Persistence:** **Browser `localStorage`** for authentication snapshot (`authPersistence`) and full patient domain state (`patientPersistence`, versioned `PersistedPatientStateV1`). Cross-tab sync is partially handled via `storage` events on patient state.
- **Domain logic:** Mixed between context methods (`PatientContext`), dedicated modules under `src/ai/`, `src/safety/`, `src/utils/`, and `src/body/`.

---

## 2. Feature Inventory

| Area | Description | Completion (assessment) |
|------|-------------|-------------------------|
| **Authentication & roles** | Therapist login (email-like identifier + password) vs patient login (portal ID + password). Session stored locally; patient first-login password change and login-ID change. Multi-therapist demo data. | **Demo-complete** — not production auth (no server, passwords in local storage). |
| **Therapist dashboard** | Patient switcher, nav sections: clinical overview, clinical reports, history/analytics, messages/chat, settings. Header + sidebar layout. | **Feature-rich prototype** — flows work end-to-end in-browser. |
| **Patient overview (therapist)** | Plan management modal, AI clinical intake wizard, red-flag handling, pending AI approvals, quick chat, deep-dive clinical tabs, smart analysis center, patient data management, portal credential display. | **High** for a demo; depends on mock + local state. |
| **Patient portal (`PatientDailyView`)** | Daily rehab view: 3D body map, prescribed exercises, timers/modals, pain/effort reporting, self-care zones and strength tiers, gear store, Gordy companion/mascot and celebrations, Guardian assistant FAB, clinical month calendar, pain progress, heroes hall, emergency/red-flag modals, optional debug panel. | **High** — broad surface area implemented. |
| **3D body map** | GLTF anatomy, picking/highlighting, injury highlights, therapist clinical cycling (primary/secondary), equipped gear attachments, fallbacks. | **High** — substantial Three.js integration. |
| **Exercise library & plans** | Library data (`mockData`, `exerciseBank`, strength DB, video defaults). Per-patient `ExercisePlan` / `PatientExercise` with therapist edits. | **High** for in-app library; content is static TS data, not CMS/API. |
| **Gamification** | XP, levels, coins, streaks (clinical calendar), rewards config, gear catalog (purchase/equip, streak shield, XP booster). | **High** within local rules. |
| **AI-assisted flows** | Gemini-backed clinical intake, patient “Gordy” assistant, therapist clinical dive; rule/heuristic layers (`clinicalCommandInsight`, narratives, emergency screening). | **Functional when `VITE_GEMINI_API_KEY` is set**; degrades or errors when missing depending on call site. |
| **Safety & red flags** | Keyword/heuristic emergency screening, safety alerts, exercise lock after certain events, `mailto:` clinical alerts, AI clinical messages to therapist inbox. | **Prototype-complete** — not a certified medical device; alerting is UX + email client, not monitored service. |
| **AI suggestion pipeline** | Suggestions with statuses (`pending` → `awaiting_therapist` → `approved` / `declined`), patient agreement, therapist approval applying plan updates; Guardian reps-increase requests; assessment engine tied to therapist notes. | **High** for demo workflow. |
| **Messaging** | Simulated patient ↔ therapist messages in shared local state; unread counts; AI clinical alerts as messages. | **Demo** — no real-time server. |

### 2.1. Gamification & Progression Mechanics

*Source of truth in code:* `src/context/PatientContext.tsx` (reward application, streak shield, gear purchases), `src/config/patientRewards.ts`, `src/body/patientLevelXp.ts`, `src/utils/exerciseStreak.ts`, `src/config/gearCatalog.ts`, and patient UI in `src/components/patient/PatientDailyView.tsx` / Gordy components.

#### XP & leveling

- **Patient portal (authoritative rewards):** Each completed exercise is logged via **`submitExerciseReport`**. One completion produces **one** XP grant and **one** coin grant (there is **no separate lump-sum bonus** for finishing every exercise in a day; completing *N* exercises yields *N* grants). **Note:** A second report for the **same** `exerciseId` on the **same** clinical day still adds **XP and coins** again and increases **`sessionXp`**; **`completedIds`** for that day only stores the id once.
- **Base XP per exercise:** `exerciseBaseXp(planXpReward) = max(exercise.xpReward from the plan, PATIENT_REWARDS.EXERCISE_COMPLETE.xp)` — i.e. at least **50** XP, or the plan’s `xpReward` if higher (`patientRewards.ts`).
- **Streak multiplier** (applied to that base): `getStreakXpMultiplier(nextStreak)` — **×1** default, **×1.2** if streak ≥ 3, **×1.5** if streak ≥ 5 (`patientRewards.ts`). The streak value used is the one computed for the **first completion of the current clinical day** inside `submitExerciseReport` (see Streak System).
- **XP Booster gear:** If `xp_booster` is **owned and equipped** as the passive (`equippedPassiveId === 'xp_booster'`), final XP is **`round(round(base × streakMult) × 1.15)`** (`PatientContext.tsx`, constant `XP_BOOSTER_MULT = 1.15`).
- **Therapist dashboard `toggleExercise`:** Only updates **`DailySession`** (`completedIds` / `sessionXp` on the session row). It does **not** run the patient XP/coin/streak formulas and does **not** trigger `pushRewardFeedback` — treat it as operational toggling, not gamification.

- **Level-up formula:** Not `level × 100`. XP required to go from level **L** to **L+1** (for L = 1…99) is:

  `min(26_000, max(280, floor(440 × 1.041^(L − 1))))`

  (`xpRequiredToReachNextLevel` in `patientLevelXp.ts`). At level 100, further level-ups are effectively capped (very large threshold). **`applyXpCoinsLevelUp`** in `PatientContext` adds XP and coins, then repeatedly subtracts `xpForNextLevel` while `xp ≥ xpForNextLevel` and `level < PATIENT_MAX_LEVEL` (100).

#### Streak system

- **Definition used for display and history (`exerciseStreak.ts`):** A **daily streak** is the count of **consecutive clinical days** (using `clinicalCalendar`), ending at **today** if today has at least one completed exercise, otherwise ending at **yesterday** — same “fitness app” pattern as in `computeStreakForPatient`. A day counts if **`DailyHistoryEntry.exercisesCompleted > 0`** or **`sessionHistory`** has that date with `exercisesCompleted > 0`.
- **Definition used for XP multiplier on first daily completion (`PatientContext.submitExerciseReport`):** On the **first** exercise completion of the clinical day (`firstOfDay`), let `last = patient.lastSessionDate`. Then:
  - If `last === clinicalYesterday` → streak becomes **`currentStreak + 1`**.
  - If `last === clinicalToday` → streak **unchanged** (additional exercises the same day).
  - If `last === clinicalTwoDaysAgo` **and** `streakShieldCharges > 0` → streak becomes **`currentStreak + 1`** and **one charge is consumed** (`consumeStreakShield`).
  - Else if `last !== clinicalToday` (gap of more than one day without shield, or two days with no charge) → streak **resets to 1**.
- **Persistence:** `PatientContext` also syncs `currentStreak` / `longestStreak` from `computeStreakForPatient` + `dailyHistoryByPatient` in an effect so stored patients stay aligned with calendar history.

##### Streak Shield (consumable)

- **Catalog:** `streak_shield` in `gearCatalog.ts` — **180 coins**, **`xpRequired: 0`** (no XP gate). **`equipSlot: 'none'`** (not worn; it increments **`streakShieldCharges`**).
- **Purchase:** In `purchaseGearItem`, buying **streak_shield** deducts coins and adds **+1** to **`streakShieldCharges`** (can be bought multiple times to stack charges).
- **Effect:** Only on the **first** completion of a clinical day, if the patient would otherwise break the chain (last activity was **two clinical days ago**), a charge **bridges** to **`currentStreak + 1`** instead of resetting to 1; **one charge is removed** after use.

#### Currency (coins)

- **Exercise completion:** **`PATIENT_REWARDS.EXERCISE_COMPLETE.coins` = 10** per **`submitExerciseReport`** call — **flat**, not scaled by streak multiplier (streak affects **XP only**).
- **Articles (“Did You Know”):** **`ARTICLE_READ` → 5 coins** (and 20 XP), once per `articleId`, only after link opened + reader confirmation (`markArticleAsRead` in `PatientContext`).
- **First login of clinical day:** **`FIRST_LOGIN_OF_DAY` → 10 XP, 0 coins** (`claimDailyLoginBonusIfNeeded`).
- **Other:** `grantPatientCoins` can add arbitrary amounts (e.g. learning bonuses). **Gear** is bought with coins (and some items require minimum current XP — see Gear Store).

#### Gear store

- **Kinds (`GearKind`):** **`visual`** (cosmetics) vs **`functional`** (`xp_booster`, `streak_shield`).
- **Equippable vs consumable (by `equipSlot` + purchase logic):**
  - **Equippable cosmetics:** `equipSlot` is one of `skin | aura | hands | torso | chest | feet | cape`. Purchase adds `id` to **`ownedGearIds`**; **`equipGearItem`** requires ownership and sets the matching slot on `PatientGearState`.
  - **Functional passive:** `xp_booster` uses **`equipSlot: 'functional_passive'`** and **`equippedPassiveId`** (still must be owned).
  - **Consumable:** **`streak_shield`** — **`equipSlot: 'none'`**; purchase increments **`streakShieldCharges`** instead of a normal equip flow.
- **Pricing tiers (`GearTier` in `gearCatalog.ts`):**
  - **`low`:** 55–95 coins, XP gates 0–100 (e.g. aura_crimson 55/0, trail_sparks 95/100).
  - **`functional`:** `xp_booster` 100 coins / 150 XP min; `streak_shield` 180 coins / 0 XP.
  - **`elite`:** 300–500 coins, XP gates 200–400 (e.g. gold_skin 500/400, clinical_cape 450/350).
- **Purchase rules (`purchaseGearItem`):** Must meet **`patient.coins ≥ priceCoins`** and **`patient.xp ≥ xpRequired`** (except shield path which only checks coins for that item). **`streak_shield`** bypasses normal “add to owned list” for repeat buys; other items return **`already_owned`** if already in **`ownedGearIds`**.

#### Gordy’s role (mascot feedback)

- **Reward events (XP / coins / streak bonus XP):** `pushRewardFeedback` in `PatientContext` sets **`rewardFeedback`**. **`PatientDailyView`** reacts in a `useEffect` on **`rewardFeedback.id`**: triggers **coin kick** animation, and if any of **`xpAdded`**, **`coinsAdded`**, or **`streakBonusXp`** is positive, increments **`gordyVictoryBurst`** and passes amounts into **`GordyVictorySequence`** (short victory UI with Gordy **joy** mood). Feedback is cleared after ~2.4s.
- **Halfway encouragement:** When **≥ half** of today’s **mission** items (rehab + selected self-care rows) are done but not all, **`GordyCompanion`** shows a dismissible bubble (“חצי דרך…”) unless dismissed for that patient/day in **`sessionStorage`**.
- **Full “session” celebration (all missions done):** When **`completedMissionCount === totalMissions`**, once per patient/clinical day ( **`sessionStorage`** + in-memory dedupe), **`GordyFullScreenCelebration`** runs. This is **purely celebratory UI** — it does **not** grant extra XP or coins by itself.
- **Safety / red flag:** **`GordyCompanion`** switches to **concerned** mood and safety copy when exercise safety lock or red-flag portal lock is active (`GordyCompanion.tsx`).

---

## 3. Data Model & State

### Primary types (`src/types/index.ts`)

- **`Therapist`**, **`Patient`** (analytics, body areas, flags, coins, XP, streaks, etc.).
- **`BodyArea`** union + **`bodyAreaLabels`** — drives maps, plans, and UI copy.
- **`Exercise`**, **`PatientExercise`**, **`ExercisePlan`**, **`DailySession`**, **`DailyHistoryEntry`**, **`ClinicalDayStatus`**.
- **`Message`**, **`SafetyAlert`**, **`AiSuggestion`** (+ status/source enums).
- **`SelfCareSessionReport`**, **`PatientExerciseFinishReport`**, **`SelfCareExercise`**.

### Where state lives

- **`AuthContext`:** Current session (`AuthSessionV2`), therapist profile, patient session id, login errors, profile/password helpers. Backed by **`authPersistence`** (`AuthSnapshotV2`, patient account map, therapist records).
- **`PatientContext`:** Single source of truth for patients, plans, sessions, messages, AI suggestions, safety, self-care, gear, rewards metadata, and most mutations. Auto-saves via **`savePersistedPatientState`** to `localStorage`.

### Data flow (high level)

1. App bootstraps from **`readPersistedOnce()`** (bootstrap cache) into React state.  
2. User actions update context → **`useEffect`** persists patient bundle; auth updates merge into auth snapshot.  
3. Optional cross-tab refresh when **`guardian-patient-state-v1`** changes.  
4. No REST/GraphQL layer; **`sendDataToTherapist`** is explicitly a **placeholder** (`console.info` only).

---

## 4. User Interface & UX

### Main views

- **`LoginPage`:** Role-distinguished login (therapist email vs patient ID).
- **`DashboardLayout`:** Therapist shell — **`PatientOverview`**, **`ClinicalReportsPanel`**, **`HistoryAnalyticsPanel`**, **`MessagesPanel`**, **`TherapistSettingsPanel`** by `NavSection`.
- **`PatientDailyView`:** Full patient portal (body map, exercises, gamification, assistant, modals).

### Design system

- **No third-party component library** (e.g. no MUI/Chakra). Consistent **Tailwind** utility patterns, **Lucide** icons, and **custom components** under `src/components/` (dashboard, patient, body-map, ui).
- **Hebrew RTL** is first-class in layout and copy.

---

## 5. External Integrations

| Integration | Role |
|-------------|------|
| **Google Gemini (Generative Language API)** | Used via **`src/ai/geminiClient.ts`** (`generateContent`-style HTTP calls). Config: **`VITE_GEMINI_API_KEY`**, optional **`VITE_GEMINI_MODEL`**. |
| **Email** | **`mailto:`** links for clinical alerts (`clinicalAlertEmail.ts`); optional override **`VITE_CLINICAL_ALERT_EMAIL`**. |
| **npm `@google/generative-ai`** | Declared in **`package.json`** but **not referenced in `src/`** — Gemini access is implemented with direct HTTP in `geminiClient.ts`. |

**Not present in codebase:** Supabase, Firebase, Postgres, dedicated auth provider (Auth0, Clerk), or application backend API.

---

## 6. Technical Debt & Red Flags

- **Secrets in the browser:** `VITE_*` variables are exposed to the client bundle. Gemini calls from the SPA mean the API key is **not suitable for production** without a server-side proxy or constrained key policies.
- **Demo security model:** Therapist and patient credentials and sessions live in **`localStorage`**; passwords are compared in plain form in the demo path — acceptable only for prototypes.
- **Monolithic `PatientContext`:** Very large provider file mixing persistence, gamification, safety, AI hooks, and UI-facing API — harder to test, review, and evolve.
- **Placeholder analytics pipe:** Exercise finish reports log to console only; therapist “analytics” is local state, not a server aggregate.
- **Dependency hygiene:** **`@google/generative-ai`** appears **unused**; consider removing or migrating to it consistently.
- **Medical / regulatory:** Rich clinical UX and copy; implementation is **software demo quality**, not validated clinical workflow or monitored alerting.
- **Error handling:** Gemini paths have retry/rate-limit awareness in `geminiClient`, but the app overall has **no global error boundary** or unified API error UX pattern (many flows are optimistic local updates).
- **Naming / paths:** Occasional duplicate or oddly pathed files in the tree (e.g. mixed path separators in tooling listings) — worth normalizing to avoid editor confusion.

---

## 7. Immediate Next Steps (Top 3)

1. **Introduce a real backend and auth** — Replace local credential checks with a proper identity layer; persist patients, plans, and messages server-side (or BaaS) so the product is multi-device and auditable.

2. **Proxy Gemini (or all AI) through a server** — Keep API keys off the client; enforce quotas, logging, and optional content filtering; align with security and licensing expectations.

3. **Split domain logic out of `PatientContext`** — Extract modules (e.g. exercises, safety, rewards, persistence adapters) and add targeted tests for streak rules, suggestion state machine, and clinical date boundaries — before scaling features further.

---

## 8. Document Control

- **Artifact:** `PROJECT_STATUS_REPORT.md` (repository root).  
- **Maintenance:** Regenerate or amend after major architectural changes (backend introduction, state library change, or auth overhaul).
