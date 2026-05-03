# Application Status Report — PHYSIOSHIELD

**Report type:** Codebase audit (static analysis, April 2026)  
**Scope:** Repository as of audit date  
**Audience:** Engineering leads, product, and clinical stakeholders  
**Artifact:** `PROJECT_STATUS_REPORT.md` (repository root)

---

## Current Status

PHYSIOSHIELD is a **Hebrew-first, RTL** single-page application built with **React 19**, **Vite 8**, and **TypeScript ~6**. It delivers a **feature-rich clinical rehabilitation prototype**: therapist dashboard, patient portal with 3D anatomy, gamification, AI-assisted flows (Google Gemini via direct HTTP), heuristic safety screening, and **optional Supabase** persistence (manual push and selective reads—not a full real-time multi-tenant backend).

**Production readiness:** Suitable for **demonstration and usability research**. It is **not** a validated clinical device, monitored alerting service, or HIPAA-grade deployment without substantial backend, identity, and audit work.

---

## 2. Clinical, Avatar, Companion & Security Specifications

The subsections below record **agreed clinical and product logic** for ongoing implementation. Where behavior is not yet fully reflected in code, the **Master Requirements Matrix** and **implementation notes** in each subsection remain the source of truth for delivery status.

### 2.0 Clinical Safety — Influencing Zone Warning

**Definition.** An **influencing zone** (also referred to as a chain-reaction or adjacent-area risk) is any body region **Y** that is biomechanically or clinically linked to the region **X** where the patient is currently training. In the UI, **Y** may be **marked in red** (or equivalent high-salience state) on the anatomical map so that both patient and clinician understand that activity in **X** can load, shear, or sensitize **Y**.

**Required logic.**

1. **Mapping.** The system maintains a deterministic graph of influencing relationships (e.g. hip → knee, lumbar → hip) consistent with intake, AI-assisted intake (`chainReactionZoneJoints` in `geminiClinicalIntake.ts`), and `chainReactionZones.ts`. Primary clinical focus and influencing zones must be visually distinguishable (primary vs **red** influencing markers).

2. **During / after training in X.** When the patient completes or reports exertion related to **X**, the runtime compares **pain in zone Y** (any **red** influencing region) against an appropriate baseline (e.g. pre-session value, rolling clinical-day average, or last stable reading—exact baseline to be frozen in implementation).

3. **Escalation — AI + therapist + session stop.** If pain reported for **any influencing zone Y** **increases** relative to that baseline after or during work in **X**, the system **must**:
   - **Notify the therapist** through the clinical inbox / safety alert channel (and, when integrated, the approved real-time channel—e.g. secure messaging or WhatsApp Business—per deployment policy);
   - **Record** a structured safety event (tier, zones X/Y, delta pain, timestamp, clinical day);
   - **Stop the session** from the patient’s perspective: block further prescribed exercises for that clinical session (or equivalent **exercise safety lock** / portal lock) until a therapist **explicitly clears** the lock after review.

**AI role.** The AI layer is responsible for **classifying** the situation (e.g. confirming that the pain change is tied to an influencing-zone pattern rather than noise), **enriching** the therapist notification with concise Hebrew clinical context, and **recommending** hold vs modify-plan actions. **Hard stops** (session halt, lock) must remain **deterministic** in application logic so they do not depend solely on model output.

**Implementation note.** Chain-reaction heuristics and high-pain paths after self-care / strength zones exist in `PatientContext.tsx` with `mailto` and in-app alerts; full parity with the **red-zone pain-increase → mandatory session stop + AI-classified therapist alert** contract above is a **delivery target**, not guaranteed in every edge case in the current build.

---

### 2.1 Dynamic Limp Scale — Pain–Limp Scale

**Clinical intent.** Walking is represented as a blend between a **normal gait** animation and an **antalgic (limp-predominant) gait** animation. Reported **pain intensity (VAS 0–10)** drives how much of the limp animation is visible, modeling **pain-avoidant, reduced weight-bearing** behavior consistent with **antalgic gait** in clinical teaching.

**Pain–limp intensity (VAS-driven blend).**

- Let \( \text{VAS} \in [0,10] \). Define a normalized **limp weight** \( w = \text{VAS} / 10 \) (e.g. **VAS 8/10 → \( w = 0.8 \)** → **80% limp intensity** in the blend).
- At runtime, the avatar’s locomotion pose is computed as a **blend of two animation states** (or two procedural gait generators):
  - **Normal:** symmetric cadence, neutral hip/knee moments, bilateral weight acceptance.
  - **Limp:** reduced stance time / reduced vertical reaction on the affected side, increased lateral trunk moment, abbreviated push-off—tuned per **primary side** and **primary body area** from intake.
- **Blending function:** use linear cross-fade of clip weights or equivalent **1D blend tree** \( \text{Pose} = (1-w)\cdot\text{Normal} + w\cdot\text{Limp} \) (with optional easing or clinical caps—e.g. cap \( w \) at 0.95 below VAS 10—to avoid degenerate poses). The **Pain–Limp Scale** is therefore **directly readable** from VAS for demo and education.

**Strength, ROM, and antalgic weight-bearing.**

- **ROM deficit** (e.g. limited knee flexion or hip extension from intake, expressed in degrees) **modulates** how much load the patient can accept on the affected limb during stance: smaller usable ROM typically **increases** compensatory demand on the contralateral limb and **amplifies** visible asymmetry for a given VAS (the limp clip contribution may be scaled by a **ROM factor** derived from measured vs normative range).
- **Muscle strength** (manual muscle test grade or isometric score from intake) **modulates weight-bearing confidence**: lower strength on the affected side increases **offloading** behavior—implemented as an additional multiplier on limp visibility or stance-time asymmetry **independent of** raw VAS, then **clamped** with VAS so pain remains the primary patient-reported driver.
- Together, these produce a **clinically interpretable antalgic gait model**: VAS sets baseline limp blend; ROM and strength **bias** timing and magnitude of reduced weight-bearing and compensatory motion.

**Implementation note.** The current codebase uses a procedural **walk-in-place** without VAS-weighted dual-clip blending; **Three.js** integration should attach this spec to the rig’s animation mixer or procedural leg phase offsets, with **per-bone** limits described in §2.2.

---

### 2.2 Intake-to-Bone Mapping

**Objective.** Quantitative intake (ROM in degrees, strength grades, pain diagrams) maps **directly** to the **Three.js skeleton** so the avatar’s default pose and allowable motion reflect the individual patient.

**ROM → bone constraints.**

- Intake records joint-specific ROM (e.g. **knee flexion 90°**). For each driven DOF, the engine sets **hard or soft limits** on the corresponding bone’s Euler or quaternion channel:
  - Example: knee flexion \( \theta_{\max} = 90° \) → convert to radians and set **`maxRotation` / `minRotation`** (or equivalent custom `clampJoint` in the animation loop) on the knee flexion axis so passive visualization, guided exercise ghosts, and overpressure warnings never exceed documented range without an explicit therapist override.
- **Primary vs influencing zones:** primary injury drives the **strictest** limits; influencing zones may use relaxed or coupled limits (e.g. hip ROM caps when lumbar is primary) per clinical ruleset.

**Visual feedback at pain thresholds.**

- **Facial / affect:** at configured VAS thresholds (e.g. ≥4 “discomfort”, ≥7 “severe”), drive **facial expression** via morph targets, substitute simplified **emoji-style** face on the mascot, or **screen-space** vignette—not only material tint on the body.
- **Hand-to-area contact:** when VAS exceeds a threshold and a **primary pain region** is defined, trigger an **IK or keyed pose** that brings the hand toward that surface region (within anatomical plausibility), reinforcing **patient-reported localization** for education and therapist review.

**Implementation note.** Today, intake maps strongly to **`BodyArea`** highlights and AI text; **per-bone `maxRotation` from degrees in intake** and **IK hand contact** are **target behaviors** for the next avatar milestone.

---

### 2.3 Guardi’s Evolution — Hype Man & 360° Intro

**Roles beyond safety and rewards.**

- **Hype Man / progression messaging:** Guardi surfaces **anticipation copy** tied to the RPG calendar—e.g. *“2 days until Pelvic Dance unlocks”*—driven by server or local **unlock ETA** (clinical day at 04:00, streak gates, level thresholds). Messages must be **non-clinical in tone** but **clinically safe** (no promise of cure; reinforce adherence and upcoming milestones only).
- **360° intro sequence:** On first session of a clinical day or after major progression events, play Guardi’s **hero intro**: full **Y-axis spin** (documented in `GuardiFullScreenCelebration` / `index.css` patterns) plus branded flourish, before returning to the standard companion loop. This is distinct from the **mission-complete** confetti sequence but may reuse the same rotation choreography.

**Implementation note.** Victory confetti + 360° celebration **[V]**; **Hype Man countdown strings** and **dedicated daily intro gate** align with skill-unlock roadmap **[WIP]**.

---

### 2.4 Security & Confidentiality Policy (UI)

**Mandatory warning (copy).** The following line **must** appear on **Login** and on **Settings** surfaces (therapist **and** patient settings modals/pages), visible without scrolling when reasonable:

> **Do not enter personal data for security and medical confidentiality.**

For Hebrew-first deployment, an authoritative Hebrew equivalent should be approved by clinical/legal stakeholders and displayed **with equal prominence**.

**Username / login identifier policy.**

- **Only the treating therapist (or delegated clinic admin)** may **assign or change** patient **usernames / portal login identifiers** in production workflows. Patients use credentials issued by the clinic; **self-service identifier changes** are **not** permitted under this policy (even if password updates are allowed).

**Implementation note.** As of the audit date, the patient portal **can** offer login-ID change behind password verification (`PatientPortalSettingsModal`, `changePatientLoginId`); aligning UI with **therapist-only identifier changes** requires removing or gating that path and enforcing the same rule in any future API.

---

## Master Requirements Matrix

Legend: **[V]** Implemented · **[WIP]** Partially implemented or demo-grade · **[ ]** Missing or not started

### Multi-tenant infrastructure

| Requirement | Status | Evidence / gap |
|-------------|--------|----------------|
| Login for **separate therapists** (distinct sessions) | **[V]** | `AuthContext`, `authPersistence`, demo therapists A/B; dashboard uses `PatientProvider` with `therapistScopeId` to filter `patients` by `therapistId` (`App.tsx`, `PatientContext.tsx`). |
| **Patient** portal login (isolated to one patient) | **[V]** | `restrictPatientSessionId` limits visible patient to the logged-in account. |
| **Password reset** (self-service, email/SMS, or admin) | **[ ]** | Login shows “שכחת סיסמה?” which toggles **demo credentials only** (`LoginPage.tsx`)—no reset flow. |
| **Patient data isolation** (server-enforced, per clinic) | **[WIP]** | UI scoping is implemented; all data still lives in **shared browser `localStorage`** for the origin. Supabase push is **manual** and not row-level security–complete for multi-clinic production. |
| **Confidentiality warning + username policy** (Login / Settings) | **[WIP]** | **Policy:** §2.4 — mandatory **“Do not enter personal data…”** line; **therapist-only** patient login identifier changes. **Gap:** warning string **not** yet in `LoginPage` / settings components; patient **can** still change login ID in portal settings (`PatientPortalSettingsModal`). |

### Clinical avatar engine

| Requirement | Status | Evidence / gap |
|-------------|--------|----------------|
| **Intake-based constraints** (ROM/strength → skeletal / bone mapping) | **[WIP]** | **Target:** §2.2 — ROM (e.g. 90° knee) → **Three.js** joint limits (`maxRotation` / clamp). **Current:** intake maps to **`BodyArea`** and highlights; `clinicalBoneIndices` / picking tie picks to anatomy; **no** per-DOF limits from intake degrees yet. |
| **Dynamic limp / pain scale** (animation **blending** from VAS) | **[WIP]** | **Target:** §2.1 — **Pain–Limp Scale:** blend **Normal** vs **Limp** with \( w=\text{VAS}/10 \) (e.g. 8/10 → 80% limp), ROM/strength **modulate antalgic weight-bearing**. **Current:** procedural **walk-in-place** + `painByArea` visuals only (`AnatomyModel`). |
| **Real-time pain reflection** (facial expression, hand-to-area at thresholds) | **[WIP]** | **Target:** §2.2 — thresholds → facial / IK **hand-to-area**. **Current:** Guardi moods + area tint; **no** 3D facial rig or IK contact on avatar. |

### AI and safety

| Requirement | Status | Evidence / gap |
|-------------|--------|----------------|
| **WhatsApp** red-flag alerts | **[WIP]** | `setPatientContactWhatsapp` stores contact text; **alerts use `mailto:`** and in-app messages (`clinicalAlertEmail.ts`, `PatientContext`). UI copy references push-style messaging in places (e.g. `RedFlagAlert`) without an actual WhatsApp Business API integration. |
| **AI intake analysis** including **differential diagnosis** | **[V]** * | `geminiClinicalIntake.ts` requests and parses `differentialDiagnosis` (up to three Hebrew strings) plus primary zone and chain joints. *Requires `VITE_GEMINI_API_KEY` (and optional model env). |
| **“Influencing zone”** (red-zone pain increase → alert + session stop) | **[WIP]** | **Target:** §2.0 — training in **X**; if pain in **red** influencing **Y** **increases**, **AI + therapist alert** and **session stop** / lock. **Current:** `chainReactionZones.ts`, AI `chainReactionZoneJoints`, `submitExerciseReport` path with **mailto + safety messaging** and related locks; **full** red-zone delta + mandatory AI classification parity per §2.0 not verified for all paths. |

### RPG economy and gamification

| Requirement | Status | Evidence / gap |
|-------------|--------|----------------|
| **XP / coins** sync (authoritative, multi-device) | **[WIP]** | **Single source of truth:** local state + `localStorage`. `submitExerciseReport` applies XP/coins/streak rules (`PatientContext`, `gamification-utils`, `patientRewards`). Supabase **does not** continuously sync economy fields in the audited paths. |
| **Item shop** (gear + **pets**) | **[WIP]** | **`GearStoreArmory`**, `gearCatalog.ts` (skins, auras, functional `xp_booster`, consumable `streak_shield`). **No pet companion SKU** or pet progression in catalog. |
| **Guardi** (**360° intro**, **confetti**, **Hype Man**) | **[WIP]** | **[V]** Mission-complete **confetti + 360° spin** (`GuardiFullScreenCelebration`, `index.css`). **Target (§2.3):** **Hype Man** countdown copy (e.g. days until **Pelvic Dance** unlock) + **dedicated daily intro** using same rotation idiom. Companion bubble, victory sequences, safety mood already **[V]**. |
| **Skill unlocking** (e.g. Pelvic Dance) | **[ ]** | Exercises such as pelvic tilt exist in **`EXERCISE_LIBRARY`** (`mockData.ts`); **no** gated “skill unlock” progression tied to level/quests (feeds §2.3 messaging once built). |

### UI / UX audit

| Requirement | Status | Evidence / gap |
|-------------|--------|----------------|
| **“End of day”** control placement | **[WIP]** | Therapist **`ExercisesPanel`**: “✓ סיום יום – סמן הכל כהושלם” after exercise list (marks completions via `toggleExercise` **without** full patient gamification pipeline). **Patient portal** has no equivalent single control; progress is per exercise/mission. |
| **3-tier pain report** (Current / Average / Area average) | **[WIP]** | `getPainMetricsFromReports` exposes today / 7d / last-known (`patientPainMetrics.ts`) for AI/command logic. Portal home shows **overall average + last report**; **`PatientPainProgressSheet`** adds timeline (daily pain avg) and **per-area averages**—not a single labeled “three-tier” clinical strip. |
| **Anatomical body map** (visual **evolution** of muscles / vessels) | **[WIP]** | 3D map with clinical/self-care highlights, gear attachments, optional **`segmentGrowthMul`** (e.g. **Heroes Hall** fictional profiles). **No** time-based muscle/vessel remodeling from adherence or physiology data for the live patient avatar. |
| **Social “Heroes Hall”** | **[V]** | `PatientHeroesHallTab`, `fictionalHeroesHall.ts`, route `/patient-portal/heroes`—curated fictional profiles, not live peer leaderboard. |

### Data persistence and clinical day

| Requirement | Status | Evidence / gap |
|-------------|--------|----------------|
| **localStorage** vs **database** | **[WIP]** | Primary: `patientPersistence` / `authPersistence`. **Supabase:** schema under `supabase/migrations/`, client `lib/supabase.ts`, **manual** “save to cloud” from therapist settings / debug, auto-push hooks after some session updates, knowledge base refresh, 7-day compliance chart optional remote read. **No** full bidirectional sync or auth-bound RLS story in app layer. |
| **New day at 04:00** | **[V]** | `getClinicalDate` in `clinicalCalendar.ts` (local browser clock); `clinicalToday` in `PatientContext`; UI note in `ClinicalMonthCalendar`. |

---

## Completed Milestones (engineering)

- End-to-end **therapist dashboard** and **patient portal** with RTL Hebrew UX, routing, and role separation.
- **3D anatomy** experience (GLTF, picking, clinical/secondary highlights, self-care zones, gear attachments, injury highlights).
- **Clinical day boundary** at **04:00** local time, streak and calendar semantics aligned to that definition.
- **Gamification loop** in the patient portal: XP, levels, coins, streak multipliers, streak shield consumable, gear store, Guardi feedback and celebrations.
- **Safety layer:** keyword/heuristic emergency screening, red-flag flows, exercise safety lock, chain-reaction high-pain handling, clinical `mailto` alerts.
- **AI-assisted clinical intake** (Gemini) with structured output including **differential diagnosis** and **chain-reaction joints** when API key is configured.
- **Supabase groundwork:** migrations, push helper (`supabaseSync.ts`), optional analytics/knowledge reads.

---

## Prioritized Next Steps (gaps)

1. **Real identity and tenant isolation** — Server-side auth, per-tenant data stores, and enforced isolation (replace shared-`localStorage` demo model). Align Supabase RLS and therapist/patient JWT claims before any pilot with PHI.

2. **Security & confidentiality UI (§2.4)** — Add the mandatory **“Do not enter personal data for security and medical confidentiality.”** line to **Login** and **Settings** (therapist + patient). Remove or disable **patient self-service login-ID change** so **only therapists** (or clinic admin) assign identifiers, matching policy.

3. **Password reset and credential lifecycle** — Replace the demo hint with a secure reset channel (email magic link or OIDC provider) and audit patient login-id change flows under server authority.

4. **Alerting channel honesty and integration** — Either implement **WhatsApp Business / SMS** webhooks with delivery receipts or remove push/WhatsApp implications from copy; keep `mailto` as explicit fallback only.

5. **Proxy Gemini and secrets** — Move generative calls to a backend; rotate keys; never ship unconstrained `VITE_*` keys for production.

6. **Avatar clinical fidelity (§2.1–2.2)** — Implement **Pain–Limp** dual-animation blend (\(w=\text{VAS}/10\)), ROM/strength multipliers for antalgic weight-bearing, **intake-driven joint limits** (`maxRotation`), and threshold-driven **facial / hand-to-area** feedback; validate with clinical advisors.

7. **Influencing zone contract (§2.0)** — Ensure **red-zone** pain **increase** after training in **X** always yields **therapist notification**, **structured safety record**, and **session stop** until therapist release; keep deterministic locks independent of model-only output.

8. **Economy and persistence contract** — Define whether XP/coins are server-authoritative; if yes, migrate grants to API + idempotent events; extend Supabase schema and sync beyond manual push.

9. **Product gaps** — Pet shop / companions, skill-gated content (e.g. Pelvic Dance) + **Guardi Hype Man** countdowns (§2.3), and a dedicated **patient** “end of session” control if workflow requires it; align with clinical protocol.

10. **Testing and decomposition** — Extract pure functions from `PatientContext` for streak, suggestions, influencing-zone baselines, and clinical date rules; add automated tests before further feature growth.

---

## Reference: Core Stack (concise)

| Layer | Choice |
|--------|--------|
| UI | React 19, Vite 8, TypeScript, Tailwind v4, Lucide, Recharts |
| 3D | three, @react-three/fiber, drei, postprocessing |
| Routing | react-router-dom v7 |
| State | React Context (`AuthProvider`, `PatientProvider`) |
| Persistence | `localStorage` + optional `@supabase/supabase-js` |
| AI | `src/ai/geminiClient.ts` + feature modules (no `@google/generative-ai` package in current `package.json`) |

---

## Document Control

**Maintenance:** Regenerate or amend after major changes (production auth, full Supabase sync, **§2.0–2.4** clinical/security spec changes, avatar animation implementation, Guardi progression messaging, or new alerting integrations).
