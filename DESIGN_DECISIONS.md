TraceCode — Design Decisions
Status: Approved discovery direction; implementation pending
Date: 2026-11-02
Scope: Product identity, public experience, learning application, and interaction principles
Authority: Explicit product-owner selections from the 20-question design discovery and subsequent clarifications
This file defines the approved direction, not proof that a feature or design is implemented. Record subsequent material changes in the decision log; do not silently overwrite approved decisions.

North star
Make invisible code execution understandable.

TraceCode is a precision learning instrument. Its core learning loop is Write → Run → Explore → Improve. The public website can be cinematic and expressive; the real coding environment should remain calm, precise, and learner-controlled.
Approved choices — complete 20-question record
Question	Approved choice	Binding interpretation
1. Brand personality	A — Precision learning instrument	Exact, thoughtful, evidence-driven, trustworthy; not generic gamification.
2. First-minute experience	A — Understanding	The user should feel, “I can finally see what my code is doing.”
3. Logo concept	Superseded — retain original `⌁`	Keep TraceCode's existing original `⌁` logo. All debugger-path and stepped-execution proposals are cancelled.
4. Wordmark	Superseded — retain current styling	Keep the existing wordmark styling unchanged. Do not replace or redraw it during the Landing Page work.
5. Color direction	A — Emerald + graphite	Preserve the existing Practice Workspace colors as baseline; do not replace them with a speculative palette.
6. Theme	A — Light-first, dark optional	Light is the design baseline; dark is an intentional accessible counterpart, not a separate rebrand.
7. UI typography	A — DM Sans	Retain existing UI font; standardize hierarchy and scale.
8. Coding typography	A — JetBrains Mono	Retain current editor/replay monospace font.
9. Public visual direction	A — Cinematic scrollytelling	Use scroll-led motion and visual storytelling on public pages.
10. Public motion intensity	C — Rich and immersive	Quality motion and expressive sequences on public pages, subject to performance and accessibility.
11. Public navigation	A — Minimal floating header	Compact public navigation; essential links and one clear primary CTA.
12. Landing hero	A — Animated code execution	Center the hero on visible execution, not abstract 3D decoration.
13. Authentication	B — Split-screen cinematic	Usable form paired with a branded visual/motion panel; collapse gracefully on mobile.
14. Surface treatment	A — Soft precision	Thin borders, restrained shadows, moderate rounding, clean whitespace.
15. Animated mark	Superseded — cancelled	Do not create a Stepped Execution, debugger-path `</>`, or replacement-logo animation.
16. Landing story	C — Interactive product tour	Visitors actively click/step/run a simplified demo. Do not make scroll the only way to progress.
17. Three.js	A — Hero only	If used, constrain Three.js/React Three Fiber to one purposeful hero experience, isolated and lazy-loaded.
18. Loading	B — Skeleton-led	Content-shaped skeletons remain primary. No proposed debugger-path or Stepped Execution loader is authorized.
19. App navigation	D — Context-sensitive	Minimal navigation in Practice; richer destinations on Dashboard/Progress/Settings as needed.
20. Finishing priority	A — Visual perfection	Prioritize consistency of typography, spacing, alignment, surfaces, and visual composition. Performance and accessibility remain hard acceptance criteria.


Clarifications and conflict resolutions
Public motion versus Practice stability
Approved scope distinction: The Karma reference and cinematic motion are for public-facing pages (Home/Landing, Login, Sign Up, informational pages, brand-loading moments). Do not carry decorative scroll effects or 3D into the existing Practice Workspace. Preserve its colors, overall layout, editor, tests, execution/replay controls, and current interaction model. Fix actual defects only through separately approved changes.
Scrollytelling versus interactive product tour
Question 9 approves cinematic scrollytelling as a visual/motion language; Question 16 makes the interactive product tour the controlling interaction model. Reconcile them by giving visitors explicit Run, Next, Previous, Replay/Reset controls for the hero demo. Scrolling may reveal narrative sections and animate transitions, but must not be the exclusive controller of execution. Do not auto-scroll users through code or pretend a prerecorded demonstration is live execution.
Rich motion versus visual perfection
Rich motion is an approved public-page capability, not a mandate to animate every surface. First perfect typography, spacing, alignment, and static composition; then add high-quality intentional motion. Prefer fewer exemplary interactions over many mediocre ones. Motion must not degrade performance, stability, or comprehension.
Three.js hero versus animated code execution
The hero's primary subject is understandable code execution. The approved Three.js placement is hero only, if it materially contributes to this subject. Use SVG/CSS/Motion for code lines, arrays, pointers, and variable-state transitions when clearer; do not install a WebGL library simply because it was mentioned in discovery. No Three.js in auth, Practice, Progress, Settings, or general navigation for this phase.
Rotating brand loader versus skeleton-led loading
The animated debugger-path </> mark is a brand identity and major-load indicator, not the default loader on every button or card. For asynchronous page content use layout-matched skeletons. For Pyodide startup use honest runtime-stage status. For brief actions use unobtrusive inline feedback. Provide a stable reduced-motion mark.
Exact palette versus color direction
The existing Practice Workspace screenshot and actual CSS control color decisions. The audited global token references below are inventory values, not permission to overwrite Practice-specific colors:
Existing global role	Light	Dark
Page background	#f4f5f2	#0f1412
Surface	#ffffff	#161c19
Subtle surface	#fafbf9	#1a211d
Hover surface	#eef2ec	#1e2622
Border	#e1e6df	#26302b
Primary text	#17231e	#eef2ef
Muted text	#4d5852	#a9b5ae
Brand accent	#087a56	#39a67e


Existing Practice has additional independent values, including a dark editor/code surface around #171d24. Extract its actual tokens from source when implementing. Do not treat the earlier Midnight Mint proposal as approved.
Design references
Reference 01 — Karma
URL: https://www.karma.business
Purpose: Ambition for expressive public-page motion, fluid transitions, and interactive storytelling.
Borrow: Controlled cinematic choreography, thoughtful scroll sections, refined public interactions, and narrative pacing only after examining them in the actual site.
Avoid: Copying colors, logos, type treatment or visual compositions; unverified claims about its underlying animation stack; transplanting marketing animation into the coding environment.

Verification note: Specific Karma page behaviors/technologies have not yet been independently confirmed in this design record. Record observed findings separately after Codex's actual browser inspection.

Additional references: Up to five more can be curated later. Do not make missing references a blocker to the first brand explorations.
Brand and typography
- Product name: TraceCode, case-sensitive.
- Logo concept: debugger path incorporating </> and a minimal execution-state motif; must work as a static monochrome mark, favicon, app icon, and animated variant. The illustrative sketches seen in conversation are not final logo assets.
- Wordmark: TraceCode, with DM Sans as the preferred existing font starting point; custom details are a design proposal, not yet approved.
- UI font: DM Sans.
- Code/trace font: JetBrains Mono.
- Avoid inconsistent competing header treatments (⌁, lowercase tracecode, tracecode.) once the final brand asset is approved.
Public experience specification
Landing / Home
- Floating minimal header with brand, essential links, auth, and one primary CTA.
- Strong headline and an interactive code-execution preview.
- User-controlled mini-journey: Write → Run → Explore → Improve with clear interaction affordances.
- Cinematic scrolling, visual transitions, and supporting narrative sections may surround the interactive tour.
- Be truthful about the demo: if it is deterministic illustrative content, say so; if it executes code, use the actual safe execution contract.
- Three.js permitted only for a justified hero element, independently lazy-loaded and with a robust non-WebGL fallback. No new package until explicitly approved.
Authentication
- Split-screen desktop composition: accessible sign-in/up form + distinctive visual storytelling panel.
- The form always takes precedence; mobile collapses to a clean, straightforward form.
- Do not imply Google OAuth is working unless the backend truly supports it.
Public motion
- Rich and immersive but choreographed, not gratuitous.
- No scroll hijacking; keyboard, pointer, and touch must remain usable.
- Respect prefers-reduced-motion; provide equivalent static/interactable content.
- Avoid layout shifts and hydration errors; budget JS and render work carefully.
Authenticated learning experience — preservation boundary
Practice is a protected existing product experience. Do not redesign or reanimate it as part of the initial brand/public prototype. Preserve existing palette, editor, test runner, trace controls, replay states, hint behavior, and layout. The existing line-by-line replay is user-controlled and is not a scrollytelling surface.

For future application architecture:
- Use context-sensitive authenticated navigation: little chrome in Practice; richer destinations outside Practice.
- Give notification preferences a real Settings home, reusing the existing M7 preferences APIs/actions rather than duplicating state.
- Prefer skeleton loaders for dashboard, progress, history, recommendations, and notification data.
- Distinguish observed evidence and deterministic recommendations from experimental AI-generated insights; clearly mark nonfunctional future M8–M11 previews.
- Future Visual Academy lessons can use purposeful educational animation under a separate design approval. They are not authorized by public-page motion decisions.
Implementation sequencing
Stage 0 — Design record: Add this approved document to the repository with audit references. Do not treat it as a request to modify other code.

Stage 1 — Brand explorations (first prototype): Explore three static </> debugger-path symbol variations, paired with the TraceCode wordmark; test monochrome and favicon scale; propose a single motion storyboard for the selected mark. Review before selecting a final logo.

Stage 2 — Public hero prototype (only after brand review): Build one isolated landing hero concept, with static or local deterministic interactive code-execution content, a minimal floating header, and a refined light palette consistent with the existing Practice visual identity. Demonstrate manual interaction, visual polish, responsiveness, reduced-motion fallback, and loading behavior. No broad page rewrite.

Stage 3 — Broader public experience (separate approval): Expand to public storytelling sections and split-screen auth, then design system extraction.

Stage 4 — App shell/Settings (separate approval): Context-sensitive navigation, Settings and notifications, skeletons, and eventual optional dark theme.

Stage 5 — Future learning features (separate approval): M8–M11 education interfaces and Visual Academy.
Technical constraints identified by the audit
- Next.js 16, React 19, Tailwind CSS 4; semantic CSS variables, cva, Radix primitives, and Phosphor icons are already in place.
- Existing fonts are loaded through next/font/google; check for duplicated font declarations on Practice.
- Existing theming follows prefers-color-scheme; no manual theme provider or preference yet.
- No Motion/Framer Motion, GSAP, Three.js, React Three Fiber, or Lottie package was installed at the time of the audit. Installing one requires a separate, justified decision.
- The current working tree is concurrently edited by other sessions, particularly Practice/catalog/AI code. Avoid colliding with uncommitted work, and use a safe worktree/branch strategy only after checking how current changes are preserved.
Prototype review / acceptance criteria
- [ ] All approved 20 choices are represented without silent substitutions.
- [ ] No Practice Workspace code/styles changed.
- [ ] Logo is recognizably ownable, readable at small size, and effective in monochrome.
- [ ] Brand palette derives from current code/screenshot, not an invented replacement.
- [ ] The first prototype has one disciplined focal point: understandable execution.
- [ ] Interactive tour works by pointer and keyboard; scrolling is supplementary.
- [ ] Loading uses skeleton-first semantics; animated mark is used selectively.
- [ ] Reduced-motion version remains clear and operable.
- [ ] No unsupported backend/API behavior is claimed live.
- [ ] No unrelated dependencies, migrations, commits, pushes, or deployment.
Decision log
Date	Record	Status
2026-11-02	Q1–5: brand personality, understanding, debugger-path logo, TraceCode wordmark, emerald/graphite	Approved
2026-11-02	Preserve current Practice Workspace palette and interactions	Approved
2026-11-02	Karma reference limited to public pages; future Academy separately scoped	Approved
2026-11-02	Q6–10: light-first, DM Sans, JetBrains Mono, cinematic scrollytelling, rich public motion	Approved
2026-11-02	Q11–15: floating header, animated execution hero, split-screen auth, soft precision, hybrid mark motion	Approved
2026-11-02	Q16–20: interactive tour, hero-only Three.js, skeleton-led loading, context-sensitive navigation, visual perfection	Approved
2026-11-02	Original `⌁` logo and current wordmark retained; all replacement marks and their animations cancelled	Approved — supersedes prior logo decisions
Pending	Landing Page design plan and prototype	Proposed, not approved


Change protocol
For future edits, identify which decision is changing, why, and whether the change affects an approved preservation boundary. Request explicit approval for material changes to logo concept, palette, typography, Practice interaction model, public narrative model, and dependency/Three.js scope. Keep all implementation statuses truthful.

Superseded logo proposal — retained for decision history
Date: 2026-11-02
Status: Superseded and cancelled by the subsequent decision to retain the original `⌁` logo and current wordmark

Canonical static reference
- Selected direction: the original B — Stepped Execution mark.
- Preserve the original rising diagonal orientation from lower-left to upper-right. Straight vertical, straight horizontal, and plain-slash substitutions are not approved.
- Use dark emerald angle brackets and a bright-green ascending stepped execution path between them.
- Keep three connected circular nodes on the path. The middle node is a distinct ring.
- Preserve the approved proportions, rounded stroke character, spacing, and orientation.
- Pair the mark with the case-sensitive TraceCode wordmark in DM Sans.
- The static mark must remain effective in monochrome and at favicon scale after optical correction.

Animation boundary
1. Every animation begins from the exact approved diagonal static logo.
2. The brackets may move outward to open noticeably wider.
3. The stepped path rotates fluidly between orientations but remains stepped at every frame; it never becomes a straight slash.
4. As the trace approaches its narrow or vertical phase, the brackets move inward.
5. The most closed bracket position is exactly the approved static logo position. The brackets must never close further.
6. As the trace moves toward a wider orientation, the brackets open outward again.
7. The loop returns seamlessly to the original diagonal static logo.
8. Implement the mark with SVG geometry and CSS or an approved motion tool, not Three.js.
9. Provide a stable reduced-motion rendering of the exact static mark.

Scope boundary
- Approve the static SVG before prototyping motion.
- Prototype the animated SVG separately before landing-page implementation.
- This decision authorizes no redesign of Practice, Progress, Settings, authentication, backend behavior, or any other page.

Current logo and wordmark decision
Date: 2026-11-02
Status: Approved; supersedes every debugger-path, `</>`, and Stepped Execution proposal above

- Retain TraceCode's existing original `⌁` logo exactly as it currently appears.
- Retain the current wordmark styling exactly as it currently appears.
- Cancel the proposed Stepped Execution symbol, debugger-path `</>` symbols, static recreations, favicon replacements, and all related animation concepts.
- Do not modify the existing logo, favicon, social image, header branding, or brand components during the Landing Page design phase.
- The existing logo is a stable input to the Landing Page design, not a design task within it.
- Any future logo reconsideration requires a new explicit decision that supersedes this one.

Landing Page scope following this decision
- Move directly to the Landing Page design using the approved emerald-and-graphite palette, DM Sans, JetBrains Mono, cinematic public motion, and user-controlled interactive product tour.
- Present and approve the Landing Page plan before implementation.
- Preserve the Practice Workspace completely.
- Approval of the Landing Page never authorizes redesign of another page.
