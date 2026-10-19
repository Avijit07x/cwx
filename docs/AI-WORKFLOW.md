# AI workflow

How AI tools were used to build this submission: the tools, who decided what, how the work was organised, mistakes the AI made and how they were caught, what was verified, and what a human still has to check.

## In short

- **Claude wrote the code, tests and documents.** The main session ran in Claude Code 2.1.301 (in VS Code) on Claude Opus 5.5 and acted as the orchestrator. Most of the work was done by subagents it started from workflow scripts: 17 workflows with 155 agent runs in total, all on Claude Opus 5.5.
- **The human, Avijit Dey, directed and managed the work.** As the candidate, they set the requirements and the working rules, made the technology and design calls, decided how the work was split across agents and how every check was reviewed, and used the running app between phases. That is how five bugs were found that the agents' own checks had missed.
- **Every review was done by a team of two or three agents.** Reviewers worked independently, then checked each other's findings, and a script applied the agreement rule. Fixes were checked again by other agents.
- **Some things could not be checked by agents.** Real trackpads, Safari, laptops with integrated graphics and real screen readers were not tested (see [Limits](#limits-what-a-human-should-still-check)).

## Tools

| Tool                                                        | Used for                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code 2.1.301 with Claude Opus 5.5 (the main session) | Orchestration: the plan and task list, the build contract, the shared foundation code, the workflow scripts, integration, keeping the docs current                                                                                                                                                 |
| Claude Code workflows                                       | Short JavaScript scripts that start subagents in parallel or in sequence, require each one to return a report in a fixed JSON shape (for a finding: id, severity, file, evidence, kind of evidence, reproduction, suggested fix), pass the reports to the next round, and apply the agreement rule |
| Subagents (Claude Opus 5.5)                                 | Building modules, writing tests, reviewing, fixing, verifying, measuring, writing docs                                                                                                                                                                                                             |
| TypeScript (strict), ESLint (strict type-checked), Prettier | Static checks on every change                                                                                                                                                                                                                                                                      |
| Vitest, Testing Library, jsdom                              | Unit and component tests, and the domain benchmark                                                                                                                                                                                                                                                 |
| Playwright (`@playwright/test`, headless Chromium)          | End-to-end tests with real clicks, drags, keys and pinch gestures; frame-by-frame layout measurements; screenshots; the GPU measurement scripts                                                                                                                                                    |
| axe-core (`@axe-core/playwright`)                           | Accessibility scans with the WCAG 2.2 AA rules                                                                                                                                                                                                                                                     |
| glTF-Transform, meshoptimizer, KTX-Software, sharp          | The model optimisation pipeline; sharp also compared before-and-after renders pixel by pixel                                                                                                                                                                                                       |
| Playwright MCP                                              | Early, read-only page checks in the human's own Chrome (see [What did not work well](#what-did-not-work-well))                                                                                                                                                                                     |
| A project memory server                                     | Carrying decisions and the human's standing rules from one session to the next                                                                                                                                                                                                                     |

## Who decided what

### The human

- Gave the brief and a kickoff prompt: read the whole specification first, turn every requirement into a checklist with acceptance criteria, state assumptions, then build; no placeholders, no fake measurements or test results ([prompts](#representative-prompts)).
- Made the technology and design calls:
  - established, well-maintained packages instead of hand-rolled code ("use the best packages, not normal ones");
  - Base UI, not Radix, for accessible primitives;
  - keep the app's own hand-drawn icons, no icon library;
  - pnpm;
  - TanStack Query only for API-like calls (in the editor, that is the assistant request), not for editor state;
  - no code comments anywhere; design reasoning lives in the docs.
- Set the process:
  - every check is done by a team of two or three agents that discuss, never by one agent, and the model optimisation gets its own two-agent team;
  - the main session orchestrates and agents do the work through workflows;
  - split the work across more agents when there are many independent fixes;
  - keep going through all phases without stopping for approval.
- Found five real bugs by hand in the running app ([table below](#bugs-the-human-found-by-hand)).
- Keeps the final steps: the name on the design document's cover, git (repository name, visibility, commits), pushing, and sending the submission.

### The AI

- Turned the brief into the plan: 7 requirements and 5 optional items, each with an acceptance check; 13 written assumptions; the architecture; and a task list in which a task is marked done only after its check has run.
- Wrote the build contract ([CONTRACTS.md](CONTRACTS.md)): which agent owns which files, the shared APIs, and the visual and accessibility rules.
- Drew up the package list under the human's "best packages" rule and agreed it with the human, then tried each package and dropped the ones that did not earn their place, with reasons in [PLAN.md §4.1](PLAN.md). For example, `r3f-perf` read 0 ms of GPU time in development and pulled in older copies of drei and zustand, and `react-i18next` was not needed because the typed `useT()` hook stays a store selector.
- Wrote the modules, tests, scripts and documents, found root causes, and kept the status log in the plan.

The Phase 5 review prompts listed the human's choices and told reviewers not to suggest changing them, and the fix prompts repeated them as rules.

## How the human split the work between agents

- **Roles.** Separate agents for writing code, QA, code quality and code review.
- **Teams.** Every check was done by two or three agents who discussed each other's findings, never by one agent alone; the model optimisation had its own pair, an optimiser and a verifier.
- **Orchestration.** The main session planned, routed and verified; workflows of agents did the work.
- **Scale.** More agents whenever the work allowed it: eight build agents in parallel, then waves of 12 and 11 fixers that each owned a separate set of files, and five agents in parallel for the last checks.
- **Pace.** At first a stop after each phase for review; later, straight through to the end without stopping.

## How the human managed the work

- **Short rules, one per message, kept for the whole project:** pnpm, no code comments, Base UI, the app's own icons, TanStack Query only where needed, the best packages.
- **Written plans.** Plans and tasks in `docs/`, verified after writing, and progress remembered between sessions.
- **Hands-on testing.** The human used the running app between phases and reported problems with screenshots, which found five bugs the agents had missed ([below](#bugs-the-human-found-by-hand)).
- **Status checks.** Frequent questions about progress, agent counts and token use kept the work and its cost visible.
- **Final decisions stayed human:** the repository name and visibility, a licence, pushing, the submission email and the name on the design document.

## How the work ran

The phase numbers match [PLAN.md §6](PLAN.md).

### 1. Plan

The orchestrator read the brief and turned it into the checklist, assumptions, architecture and task list described above. It set up Node 24.22 (through nvm) and pnpm 10.33. A separate agent then checked the plan against the brief, and its findings were folded in, among them copy and paste, definitions for the measurements, a Clear button, a fresh-clone run, this document, and WCAG 2.1.4, 2.5.7 and 2.5.8.

### 2. Foundation

Before any parallel work, the orchestrator wrote the shared base itself: tool configs; the pure domain layer (edit operations with computed inverses, undo history, the clearance rule, bill of materials, naming, placement search, saved-draft parsing, seeded layouts); the zustand store with actions and selectors; i18n; design tokens and UI primitives; the app shell with a stub for every module; and the build contract. Shared code came first so that several agents could later work at once without editing the same files.

### 3. Parallel build

One workflow started eight build agents at the same time, each owning its own folders: the 3D viewport; top bar, palette, status bar and shortcuts; item list, properties, rule check and bill of materials; the assistant; embedding and the demo host page; the model pipeline and bench page; the architecture design document; and tests for the foundation. An agent that needed a change in a file it did not own wrote it into a list of requests instead of making it. Each agent had to pass its own type check, lint, tests and formatting before reporting. All eight finished. The test agent's 368 tests included two that failed on purpose because they exposed a real bug in the orchestrator's code (`nextTag`, [below](#mistakes-the-ai-made-and-how-they-were-caught)).

### 4. Integration

The orchestrator applied the first ten integration fixes itself, for example the `nextTag` fix, Enter on a focused button no longer placing an item, missing announcements, and the `frame-ancestors` header built from configuration. The human then asked for agents to do the work, so the rest ran as a workflow: a fixer made every check pass and added tests; a code reviewer and a browser-QA agent checked independently; each reviewed the other's findings; and a second fixer fixed what they agreed on. The phase ended with the type check, lint, 766 unit tests in 65 files and the production build passing.

While this workflow was running, the human reported the chat-scroll bug. The orchestrator restarted the running step with the bug added to its task as top priority. The same happened in Phase 4b with the zoom bug.

### 4b. Package upgrade

Under the human's "best packages" rule, one workflow of 16 agents replaced hand-rolled code with Base UI, TanStack Query and Virtual, Sonner, zod, i18next, drei and react-hotkeys-hook, and added headless Playwright with axe. An infrastructure agent installed 13 packages at exact versions; six agents upgraded their own folders in parallel; an integration agent ran every check and fixed the zoom bug; a verification team of three (end-to-end QA, accessibility, code review) worked independently and then discussed; a fixer applied what they agreed; and a documentation agent wrote [ARCHITECTURE.md](ARCHITECTURE.md) from the code. The team raised 17 findings, confirmed them 33 times with no disputes, and added 9 more during the discussion. The phase ended with all 84 end-to-end tests passing.

### Bug-fix workflows

Each later bug report from the human (long search text, oversized switch, jumping input box) got a small workflow of its own: a fixer reproduced the bug, fixed the root cause and added tests, then an independent verifier measured everything again in headless Chromium. When the verifier found anything above a nit, both went a second round. Every one of these verifiers found something the fixer had missed.

### 5. Verification teams

Each team worked in three rounds:

1. **Independent pass.** Each agent checks its own slice and records findings with evidence a teammate can re-run: a file and line, a command and its output, a screenshot, a measurement or a failing test, labelled with its kind. Code reading alone counts as the weakest kind.
2. **Discussion.** Each agent gets its teammates' findings, re-runs their reproductions or takes its own measurements, and answers confirmed, disputed (with evidence) or needs more information. A new finding raised in this round needs hard evidence.
3. **Agreement.** The workflow script, not an agent, applies the rule. From the review-team script: a finding stands if at least one teammate confirms it, or if it has hard evidence and fewer than two teammates dispute it.

```js
if (confirms >= 1 || (HARD.includes(f.evidenceType) && disputes < 2)) agreed.push(entry);
```

Reviewers only review: they do not edit product code and never fix their own findings. Each one worked in its own scratch folder, with its own port and its own build output, so that nine reviewers could share one machine and one dev server.

| Team                        | Agents | Outcome                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Code quality + code review  | 3 + 3  | 92 findings in round 1: 90 confirmed by both teammates, 1 by one teammate, 1 dropped after a dispute (a question about a product choice, not a defect). 11 more added in the discussion, each with a failing test, command output or measurement. 102 agreed findings before duplicates were merged: 8 major, 64 minor, 30 nits                                                                                                  |
| QA, each with its own specs | 3      | 35 findings in round 1: 33 confirmed by both teammates, 1 by one teammate, 1 dropped after two teammates disputed it (Clear layout is undoable by design, and the Undo button names it). 4 more added in the discussion, each with a failing test. 38 agreed findings: 12 major, 19 minor, 7 nits. Their specs that failed on purpose became the acceptance tests for the fixes                                                  |
| Model optimisation          | 2      | An optimiser and a verifier went two rounds until the verifier agreed with the final settings                                                                                                                                                                                                                                                                                                                                    |
| Design document             | 2      | Each reviewer confirmed all of the other's findings and added more: 53 agreed, none disputed. A fixer applied most of them, gave reasons for the ones it declined, and re-rendered the PDF. Two more rounds of re-checks and fixes followed. An editor then cut the PDF from 27 to 25 pages without losing coverage and made Figure 1's labels legible (8.7 pt, up from 6.8), and both reviewers approved it with only nits left |

The code-quality reviewers covered types and structure; React, CSS and visual consistency; and tests, simplicity and docs accuracy. The code reviewers covered domain, state and undo; 3D rendering and interaction; and security, error handling, accessibility semantics and bundle size. Three reviewers in two different teams independently found the same major bug: once the 3D code fails to download, "Try again" can never recover, because `React.lazy` keeps the failed import. Wave 1 fixed it: "Try again" now reloads the editor.

### Fixes by owner area

The human asked to split the fixing across more agents, so it ran in two waves of fixers that each owned a disjoint set of files. A fixer had to reproduce a finding first, could decline it with evidence if it was wrong or the fix would add complexity, and had to write a regression test that failed before the fix. Changes needed in another owner's files went into requests for an integrator.

- **Wave 1** gave the 102 code-quality and code-review findings to twelve fixers: state, domain, 3D rendering, 3D pointer handling, UI kit, panels, toolbar and assistant, i18n, embedding, app shell, build configuration, and the model pipeline with the bench page. The integrator applied about 40 cross-owner requests and ran every check: the type check, lint, format, 905 unit tests in 77 files and the build passed, and the end-to-end run had 219 passed and 24 failed, all 24 being QA specs that fail on purpose until wave 2. The workflow was then stopped before its own re-verification, so that both waves could be re-verified together.
- **Triage.** The review workflow's triage lead re-checked every finding against the integrated code. Wave 1 had already closed nearly every code-quality and code-review finding and 12 of the QA findings. The remaining work became 40 items, 8 of them major, all keyboard or WCAG defects. The lead also decided to cut the first-screen bundle rather than raise its limit again, and declined or moved 11 items with reasons, for example draft eviction (when storage is full the editor already shows "Not saved"), renames that would only add churn, and checks that need real devices.
- **Wave 2** gave the QA findings, the end-to-end harness and the measurement carry-ins to eleven fixers. It also made the Assistant tab, with TanStack Query, a lazy chunk and tightened the size guard ([below](#mistakes-the-ai-made-and-how-they-were-caught)), and a docs agent rewrote [ARCHITECTURE.md](ARCHITECTURE.md) and [CONTRACTS.md](CONTRACTS.md) for both waves.
- **Re-verification of both waves.** Three re-verifiers, one each for QA, code quality and code review, checked every fix with fresh reproductions and then discussed each other's results. The QA re-verifier re-ran the whole suite (251 passed, none failed or flaky, 23 gated benchmark variants skipped), found 37 of the 38 QA findings fixed in the running app, in English and Vietnamese, and confirmed that the five bugs the human had found were still fixed. The other two confirmed 58 of the 64 code-quality findings and 37 of the 38 code-review findings fixed, and accepted the reasons given for most of the declined ones. Their discussion agreed on 18 issues, 9 minor and 9 nits, including two regressions from wave 2: at 1366 × 768 the host page left the editor's status bar, badge and expiry alert below the window, and at 320 px the overlays covered most of the 3D view while placing.
- **Round 2.** Six fixers fixed 8 of the 9 minor issues, with regression tests where behaviour changed, and a final checker confirmed them with fresh measurements. Every check then passed: the type check, lint, format, 930 unit tests in 77 files, the build, and 262 end-to-end tests with none failing. The ninth minor issue, renaming the spec files that were named after fix rounds, and most of the nits were done in Phase 7.

### 6. Measurement

A preparation workflow wrote the measurement scripts and tried them on the GPU. In Phase 6 a measurer ran them against the production build, served by `vite preview`, with no other test or benchmark running: `pnpm measure:fps` twice and `pnpm measure:bench` once. They drive Playwright's bundled Chromium 156 headless at 1920 × 1080 and a device pixel ratio of 1, and stop unless WebGL runs on the Apple GPU through ANGLE Metal. The machine was a MacBook Pro with an Apple M2 Pro (16-core GPU) and 16 GB of memory, on AC power.

At 500 items the editor drew 60 fps with and without instancing when capped by headless Chromium's synthetic 60 Hz vsync. Uncapped, it drew 725 to 747 fps with instancing (10 draw calls) and 554 to 604 fps without (506 draw calls). On the benchmark page the optimised model loaded in 509.1 ms against 1,230.5 ms for the raw model (cold cache, median of 5), and 100 instanced copies took 13.41 ms per frame against 105.35 ms.

An independent verifier re-measured on the same machine: frame times agreed within about 5 %, cold loads within 2 %, and draw calls and triangles exactly, and every number in the docs matched the raw results. It also found six wording problems, for example that "nothing else heavy running" overstated how quiet the machine was while everyday apps were open; the measurer fixed them without changing a number. A second verification agreed again and raised only three small wording points. The figures, the method and the hardware are in the README's Performance section and in [measurements/](measurements/).

### 7. Delivery

One workflow, `phase7a-finish`, first ran four agents in parallel on separate files:

- a design-document agent synced every statement about the built editor with the final code and the Phase 6 measurements, added a committed benchmark of the domain code (`pnpm measure:domain`, run three times on a quiet machine) so that the document's cost figures come from a script, and re-rendered the PDF at 25 pages;
- an end-to-end agent folded the 35 spec files named after fix rounds or defects into behaviour-named files: still 285 tests, now in 32 files instead of 62. A script confirmed that every assertion was kept, and every moved test passed in two runs in a row;
- two agents cleared the last code nits from the re-verification: unused exports, an error-boundary reset that only its test used, a separate message when the Assistant tab fails to download, the placement clearance check moved into the domain layer, and a gap of at least 10 s between token requests. Two more nits needed edits in files another agent was changing at the time, so they were left as tested patches.

An integrator then ran every check with nobody else editing and had nothing to fix. `pnpm check` passed: the type check, lint, format check, 934 unit tests in 77 files, and the build within its size guards (first screen 177.9 kB after Brotli and 203.7 kB after gzip, lazy 3D view 225.5 kB after Brotli). The full end-to-end suite passed 262 tests, with the 23 gated benchmark variants skipped and none failing or flaky, in 8.5 minutes with two workers. Finally the README and this document were brought in line with the final code, while two design-doc reviewers checked the re-rendered PDF.

### Workflows and agent runs

In the order they started:

| Workflow                     | Phase   | Agent runs                                                                                                                                                                     |
| ---------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `build-layout-editor`        | 3       | 8 build agents                                                                                                                                                                 |
| `phase4-integration`         | 4       | 7: 6 ran to the end, plus one step restarted when the human reported a bug                                                                                                     |
| `phase4b-packages`           | 4b      | 17: 16 ran to the end, plus one step restarted when the human reported a bug                                                                                                   |
| `phase5b-model-optimisation` | 5       | 4: an optimiser and a verifier, two rounds                                                                                                                                     |
| `fix-long-text-overflow`     | bug fix | 4: a fixer and a verifier, two rounds                                                                                                                                          |
| `fix-switch-size`            | bug fix | 4: a fixer and a verifier, two rounds                                                                                                                                          |
| `fix-composer-jump`          | bug fix | 4: a fixer and a verifier, two rounds                                                                                                                                          |
| `phase5a-review-teams`       | 5       | 19: 9 reviewers, one discussion run each, then a triage lead                                                                                                                   |
| `phase5c-design-doc`         | 5       | 10: 2 reviewers, 2 discussion runs, a fixer, 2 re-checks, a second fix round and 2 more re-checks                                                                              |
| `phase5a-fix-wave1`          | 5       | 16: 12 fixers and an integrator, then a docs agent and 2 re-verifiers that were stopped with the workflow after integration                                                    |
| `prep-phase6-phase7`         | 6 and 7 | 3: measurement scripts, a README draft, a draft of this document                                                                                                               |
| `phase5c-tighten`            | 5       | 6: an editor and 2 reviewers, two rounds                                                                                                                                       |
| `phase5a-fix-wave2`          | 5       | 26: 11 fixers, an integrator, a docs agent, 3 re-verifiers with a discussion run each, 6 second-round fixers and a final checker                                               |
| `phase6-measure`             | 6       | 4: a measurer and an independent verifier, two rounds                                                                                                                          |
| `phase7a-finish`             | 7       | 11: a design-doc agent, an end-to-end agent, 2 code-nit fixers, an integrator, the writer of the README and this document, 2 design-doc reviewers, a doc fixer and 2 re-checks |
| `phase7c-final-audit`        | 7       | 5: 2 agents applied the tested patches and doc corrections; 3 auditors had just started when the workflow was stopped                                                          |
| `phase7-sprint`              | 7       | 6: five parallel checks (README, repository, editing and language, assistant and embedding, fresh copy) and a gate agent                                                       |

Counting restarted and stopped steps, these 17 workflows started 154 agent runs, and one more agent ran on its own in Phase 1 to check the plan against the brief: 155 in total. Across the orchestrator and all agents that took about 15,378 model calls and about 4.4 billion tokens, of which about 4.30 billion were cached context read again on each step; the new input was about 75 million tokens and the output about 5.3 million. The scripts and run logs are kept with the Claude Code session data, not in this repository.

## Bugs the human found by hand

The human used the running app between phases and reported these with screenshots. None of them had been caught by the agents' own checks.

| Report (paraphrased)                                                                                  | Root cause the agents found                                                                                                                                                                                               | Fix and proof                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| After many assistant chats the whole screen scrolls: the top bar disappears and a blank band appears. | Hidden screen-reader labels in the chat log were absolutely positioned inside a scroll box that was not positioned, so each message made the page taller (1,000 px to 1,846 px after nine chats in a 2000 × 1000 window). | The log became a positioned scroll box and the app shell clips its overflow. Checked headless at five window sizes with before-and-after screenshots; an end-to-end test sends ten prompts at 1920 × 1080 and checks that the page does not move.   |
| Zoom misbehaves, trackpad pinch does not zoom, and the room drifts off to one side.                   | The camera library's own wheel handling: a pinch changed the lens field of view (a 2× pinch zoomed about 4 %), one Mac wheel step moved the camera 40–67 %, and zooming out pushed the view into a corner.                | Own wheel and pinch handling, Safari gesture events, touch pinch, zoom buttons and +/− keys, instant zoom under reduced motion; 13 zoom end-to-end tests. Simulated input only.                                                                     |
| A very long search text pushes the sidebar sideways.                                                  | The centred "no items match" text was sized to its longest word, so a long word gave the 271 px sidebar 1,176 px of content, and the column scrolled sideways.                                                            | Text may wrap anywhere, the filter accepts 64 characters, the echoed query is shortened with the full text as a tooltip, and columns never scroll sideways. Checked at four widths in both languages; the spec fails if the wrap rule is removed.   |
| The single-key shortcuts switch is too big and does not match the design.                             | A one-off switch styled inside the shortcut dialog at 40 × 24 px, about 80 × 48 device pixels on a 2× screen.                                                                                                             | A shared compact `Switch` in the UI kit (32 × 18 px track, 24 px tall hit area, token colours, focus ring only for keyboard focus). Checked with screenshots in every state at 1× and 2× and in both languages; the dialog's end-to-end tests pass. |
| Clicking a suggestion chip makes the assistant's input box jump.                                      | While a reply streamed, a Stop button appeared next to Send, so the hint wrapped onto two lines and the box grew, then shrank when the reply ended.                                                                       | Send and Stop share one fixed slot. 176 frame-by-frame runs (9,482 frames) showed 0.00 px of movement; the spec fails on the old code.                                                                                                              |

## Mistakes the AI made, and how they were caught

These are examples, not a complete list; [TASKS.md](TASKS.md) and the status log in [PLAN.md](PLAN.md) record more.

**`nextTag` broke on very large tag numbers.** The orchestrator's tag generator parsed tag numbers with `Number()`, which loses precision above 2^53. Two deliberately failing tests from the foundation-test agent showed that with a tag such as `CAB-9007199254740993` in the layout, the generator kept returning the same tag, so the second cabinet added after it was rejected as a duplicate; and that a 24-character tag produced a 25-character next tag, over the length limit. The orchestrator fixed it during integration. A later code-quality review found that one test of the new length guard could never fail, because that guard can never be reached.

**A wrong guess about the chat-scroll bug.** The orchestrator told the fixer that the likely cause was an overflowing grid area or focus-driven scrolling. The fixer reproduced the bug in headless Chromium and found the real cause (table above). The jsdom stub for `scrollIntoView` was also removed, so any code that brings that call back now fails the unit tests.

**The first zoom fix had its own bug.** The integration agent's replacement for the camera library's wheel handling limited each event to 25 %. Under load Chrome merges pinch events, so with 500 items a 2× pinch zoomed only 1.3–1.7×. The end-to-end QA agent caught it; two teammates reproduced it, measured that the limit explained the whole loss, and warned that simply removing the limit would make Ctrl + mouse wheel jump about 2.7× per notch. The code reviewer also found two zoom tests that could never fail. The fixer let pinch follow the fingers without a per-event limit and fixed the other agreed findings except one nit.

**Glass drawn about 90 times too thick.** three.js ignores per-instance scale when it computes the thickness of transmissive glass, and mesh quantisation had moved a scale into the instance transforms, so the instanced glass pieces of the chess model rendered about 90 times too thick. The optimiser found this in its own output and kept glass out of instancing (29 draw calls per copy). The verifier then showed that moving the shared scale onto the parent node gives an identical render and lets the glass be instanced again: 15 draw calls per copy, down from 49 in the original model.

**A colour shift the quality score missed.** The pipeline compressed every colour texture with ETC1S. The verifier rendered the original model and each level of detail from the same camera and saw the chess board turn from teal-green to slate blue: 21 % of the model's pixels changed visibly at the most detailed level. The optimiser's score had missed it because it averaged over the whole frame, about 70 % of which was empty background. The fix is a measured rule: each colour texture is encoded, decoded again, and re-encoded as UASTC if more than 10 % of its texels change by more than ΔE 5. Visible change dropped to 5.7 %, and the report now scores model pixels only.

**Negative zero kept vertices apart.** While testing one of the verifier's suggestions, the optimiser found a bug in its own pipeline: a step that snapped direction vectors wrote −0, and the weld step treats −0 and +0 as different values. That kept 26,927 identical vertices apart, and the simplifier preserved them as seams. The fix removed 16–28 % of the triangles without raising the error limits.

**An over-claim about repeatable builds.** The optimiser reported that repeated runs give byte-identical files. The verifier ran two builds at the same time and found one texture that differed by 8 bytes: the UASTC encoder is only fully repeatable with one thread. The report now says that repeated runs usually, but not always, give byte-identical files.

**A borderline model.** The build agent chose a model that was 10.13 MB but only 9.66 MiB, borderline for the plan's target of at least 10 MB, and said so in its report. The orchestrator had the model team switch to the Khronos ABeautifulGame chess set (40.99 MiB), whose repeated meshes and real textures gave every optimisation step something to work on.

**Fixes that caused new problems.** The input-box fix stopped the jump, but the verifier found that a double click on Send now sent a message and instantly stopped the reply, and a double click on Stop sent the typed draft. The long-text fix cut long user names in the top bar even when there was room, and its regression test did not protect the main CSS rule: with the rule switched off it still passed, because it typed narrow letters. It now types wide letters and fails without the rule. After the switch fix the label still spanned the whole dialog footer (602 px wide), so a click on empty space flipped the setting; the verifier also found that the dimmed rows in the same dialog failed contrast (3.37:1), an older problem. All of these were fixed in a second round and measured again.

**State and data-loss bugs that earlier checks had passed.** The Phase 5 reviewers found, among others: a tag or position typed in the properties panel was silently discarded when the next item was picked in the 3D view (found independently by a QA agent and a code reviewer); two browser tabs on the same project overwrote each other's draft while both showed "Saved"; and a saved draft that failed validation was silently replaced by the sample layout and then overwritten. All three were fixed in wave 1, each with regression tests, and the re-verifiers confirmed the fixes with fresh reproductions:

- A press in the 3D view now commits the focused properties field before it picks another item: `src/viewport/pointer.test.ts`, and in `e2e/flows/editing-coverage.spec.ts` the tests for a typed tag, a typed X and, since round 2, a touch drag of the same item.
- A tab with no unsaved edits loads the draft another tab saved, and a tab with unsaved edits stops saving and asks for a reload instead of overwriting it: `src/state/persistence.test.ts` and `e2e/a11y/other-tab.spec.ts`.
- A draft the editor cannot read is kept as a separate copy, and the editor says so before it shows the sample layout: `src/state/persistence.test.ts`, `src/state/bootstrap.test.ts` and `e2e/flows/editing-coverage.spec.ts`.

**Documents that drifted from the code, and a budget that was raised instead of met.** After the package upgrade the design document still described the editor as it was before, and parts of the plan and contract were out of date. The design-document team and a code-quality reviewer found this by checking each statement against the code and real command output. In the same upgrade the editor's first-screen JavaScript roughly doubled. The code reviewer flagged that it broke the design document's own budget of 140 KB; the fixer added a build-time size check but set its limit above the new size instead of cutting the bundle, and the orchestrator tracked that as an open decision. Wave 2 settled both. The docs agent rewrote the architecture and contract documents after checking each statement against the source, and in Phase 7 another agent synced the design document's statements about the editor with the final code and measurements. For the budget, the triage chose to cut rather than raise the limit again: the Assistant tab, with TanStack Query, became a lazy chunk, the first screen went from 187.2 kB to 177.8 kB after Brotli (214.7 kB to 203.6 kB after gzip), and the guard was tightened from 200 and 230 kB to 180 and 205 kB. The 140 KB target was judged unrealistic with React and Base UI on the first screen, and the design document now states the 180 KB budget that the build enforces.

## Representative prompts

Paraphrased and shortened.

From the human:

- **Kickoff.** "Read the whole specification and treat it as the source of truth. Extract every requirement and constraint into a checklist with acceptance criteria, state your assumptions, make a plan, then implement it without stopping at the plan. Strict types, no `any` or lint suppressions, accessible controls. No placeholder behaviour, no fake measurements or test results, and no claims about features that do not exist."
- **Packages.** "Use the best packages, not normal ones." Later: "Base UI, not Radix" and "don't change the icons."
- **Checks.** "QA should be two or three agents that discuss. Give the model optimisation its own two agents. Do the same for every check, not one agent."
- **Delegation.** "Don't do it yourself; use workflows and agents." Later: "We can use more agents to split the task."
- **A bug report**, with a screenshot: "When we chat a lot, the entire screen scrolls."

From the orchestrator to subagents, taken from the workflow scripts:

- **Every build agent.** "No code comments of any kind. Strict types: no any, no casts, no non-null assertions. Edit only the files you own and put anything else under requests. Never start, stop or restart the dev server. Add no dependencies. Never fabricate results. Finish only after your own type check, lint, tests and formatting pass."
- **Reviewers, discussion round.** "For every finding of your teammates, check it yourself: run their reproduction, read the code, take your own measurement. Then give a verdict: confirmed, disputed (with evidence) or needs more information. A new finding in this round needs hard evidence."
- **Fixers.** "Reproduce or verify each finding first. If it is wrong, or the fix would add complexity a reviewer would question, decline it with evidence. Otherwise fix the root cause and add a regression test that fails without the fix; write the test first and see it fail."
- **Model verifier.** "Re-run the pipeline from a clean state and confirm the outputs reproduce. Render the original model and each level of detail from the same camera, measure visual fidelity, and check every number in the report against the files."
- **Input-box bug fixer.** "Reproduce first: record the composer's bounding boxes on every animation frame from idle through a full streamed reply, at several widths and in both languages. Prove the regression spec catches the bug by running it before the fix (it must fail) and after it (it must pass)."

## What was verified, and how

- **Static checks.** TypeScript in strict mode for the app, Node and end-to-end configs; ESLint with the strict type-checked rules; Prettier. `pnpm check` runs the type check, lint, format check, unit tests and the production build, whose guard fails the build if the first screen or the 3D view outgrows its size budget.
- **Unit and component tests.** Vitest with Testing Library in jsdom: 766 tests at the end of integration, 834 tests in 67 files when the Phase 5 review started, 905 after wave 1, 930 after wave 2 and 934 tests in 77 files at delivery. A code-quality reviewer changed code in a scratch copy to see whether the tests notice: 68 of 76 such mutations were caught, including all 23 in the domain and state layers. A code reviewer ran property tests outside the repository (40 seeds × 4,000 random user actions, and 8 seeds × 1,500 random edit transactions): every state replayed exactly through undo and redo, and the history never went past its 200-step limit.
- **End-to-end tests.** `@playwright/test` in headless Chromium at 1920 × 1080: placing, selecting in both directions, dragging with snapping and a single undo step, keyboard editing, Vietnamese, the assistant, embedding, zoom and pinch, and regression specs for the chat-scroll, zoom, long-text and input-box bugs. 84 tests passed at the end of the package upgrade. The Phase 5 QA team added specs that failed on purpose until the fixes landed. At delivery the suite has 285 tests in 32 files; a default run executes 262 and skips 23 benchmark variants that need `QA_BENCH_ALL=1`, and the last full run passed all 262, with none failing or flaky, in 8.5 minutes with two workers. The QA re-verifier also ran the acceptance, regression and accessibility specs against a production build: 137 of 137 passed.
- **Accessibility.** axe scans with the WCAG 2.2 AA rules in many states (dialogs, placement, the assistant's proposal, Vietnamese, the embedded host page, narrow widths); keyboard-only paths and focus order; measured contrast; forced colours, reduced motion, 320 px reflow and 400 % zoom emulated in Chromium.
- **3D.** Draw calls and triangles were read from the performance overlay in headless runs, for example 10 draw calls at 500 items with instancing and 506 without. The headless test runs draw WebGL in software (SwiftShader), so no frame rate from them is used anywhere; frame rates come only from the Phase 6 runs, which drove headless Chromium on the real GPU through ANGLE Metal.
- **Model optimisation.** The verifier rebuilt the pipeline from an empty folder with a fresh download and got files byte-identical to the committed ones, rendered every level of detail, and checked every number in [model-optimisation.md](model-optimisation.md) against the JSON and the files.
- **Documents.** Reviewers checked statements in the docs against the code and real command output, and the design-document reviewers re-derived numbers in it by running the domain code. Its cost figures now come from a committed benchmark, `pnpm measure:domain`.
- **Bug fixes.** The long-text, switch and input-box fixes were each verified by an independent agent over two rounds, and the long-text and input-box specs were shown to fail on the old code. The chat-scroll and zoom fixes were checked by the Phase 4 and Phase 4b verification teams, and all five again by the Phase 5 QA re-verifier.

## Limits: what a human should still check

- **Real trackpads, mice and touch screens.** Pinch, wheel and touch zoom were tested only with simulated events in headless Chromium. After the first zoom fix, the code reviewer measured with simulated events that a slow Mac mouse-wheel notch zoomed only about 0.8 %; only real hardware can show whether that is still a problem.
- **Safari and other browsers.** Safari's gesture events are handled in code but were only simulated. The end-to-end suite runs in Chromium only; nothing was run in Safari, Firefox or Edge.
- **Integrated graphics.** Every GPU number comes from one Apple M2 Pro, which is much faster than typical laptop integrated graphics. Adaptive resolution and the draw-call budget were not tried on a weak GPU.
- **Screen readers.** Announcements were checked by reading the live region's text in tests, and semantics with axe and code review. No agent used a real screen reader such as VoiceOver or NVDA.
- **Windows.** High-contrast mode was emulated in Chromium; nothing was run on Windows.
- **Vietnamese.** The Vietnamese text is machine-assisted; a native speaker should read it.
- **Embedding.** Embedded mode was tested against the demo host page with a mock token, not a real host application or identity provider.

## What did not work well

- **Clicking in the human's own browser.** The Playwright MCP was connected to the human's real Chrome, and the human's settings let the AI look there but not click or type. When the browser-QA agent tried a click during integration, the permission system blocked it and then refused even read-only calls; the agent stopped instead of working around the block. Some build agents were also blocked from starting a browser of their own. From Phase 4b on, every interactive check ran in headless Playwright in a separate browser, which also let several agents test in parallel.
- **One machine, many agents.** Often a dozen or more agents shared one machine and one dev server. Under that load some browser tests timed out waiting for the lazily loaded 3D view and passed when run alone, so the rules required re-running a failure alone before calling it real and reporting load flakiness separately. Agents also had to avoid commands that write shared build output, such as `tsc -b`, and built into their own folders.
- **Optimistic reports.** Agents sometimes claimed more than their own checks supported: byte-identical builds, a quiet machine while everyday apps were open, or a fix reported as done that had side effects. Those claims were caught only because a different agent measured again, which is why fixes were checked by a different agent.
