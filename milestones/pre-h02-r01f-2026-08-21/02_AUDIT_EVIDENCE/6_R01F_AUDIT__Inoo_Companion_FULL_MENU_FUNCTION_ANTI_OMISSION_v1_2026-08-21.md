# Inoo Companion — R-01F Full Menu / Function Anti-Omission Audit v1
Date: 2026-08-21
Status: **FAIL_WITH_FINDINGS — H-02 remains BLOCKED**
Scope: read-only preservation audit. No product code / GitHub / Stable mutation.

## 0. Why this audit exists
The previous 31-keyword sweep was not exhaustive enough. This audit reconstructs the union of:
1. rc1 prototype actual user controls,
2. rc9/rc10 public-web actual user controls,
3. H13 remediation actual user controls,
4. rc1→rc10 persistent legacy UI/menu/data contracts,
5. newly REQUIRED R-00B/R-00C/R-01 requirements,
and compares that union against the current R-01E v2.5 wireframe.

A string appearing somewhere is not sufficient. Each user-invokable function needs either:
- an explicit visible control,
- a clearly named secondary/detail route,
- an approved functional successor,
- or an explicit DEFERRED-PRESERVE classification.

## 1. Source integrity check
The following legacy contract files are bit-identical across rc1, rc9, rc10:
- `09_UI_SPEC.md`
- `21_MENU_SCHEMA.json`
- `22_UI_CUSTOMIZATION_STATE.json`
- `36_PRIVACY_EXPORT_DELETE.md`

This matters because Appearance/customization/privacy-portability concepts were not one-off notes; they remained in the package through rc10.

## 2. Historical ACTUAL menu/action inventory vs v2.5

Legend:
- `PASS-EXPLICIT`: visible in v2.5.
- `PASS-SUCCESSOR`: successor path is explicit enough.
- `PASS-ROUTE`: may live on a secondary screen; route is named.
- `PARTIAL`: capability is mentioned but the user action/path is not sufficiently specified.
- `MISSING-ACTUAL`: historically working/public user action has no explicit v2.5 route.

### A. Global / startup
| Historical actual action | Evidence generation | v2.5 | Result |
|---|---|---|---|
| Screen language Auto/KO/JA/EN | rc9/rc10/H13 | Global + header | PASS-EXPLICIT |
| New-version apply/reload action | rc9/rc10/H13 | `초기 안내 / HTTPS·로컬 / 업데이트 〉` | PASS-ROUTE; detail must retain Apply action |
| First-use information/dismiss | rc9/rc10/H13 | `초기 안내` | PASS-ROUTE |
| Local-file/HTTPS warning | rc9/rc10/H13 | Global | PASS-ROUTE |
| Online/offline/status errors | rc9/rc10/H13 | System + degraded global slot | PASS-EXPLICIT |

### B. Start / Quick Start / Favorites
| Historical actual action | v2.5 | Result |
|---|---|---|
| 9 current Quick Starts | 9 explicitly shown mobile+desktop | PASS-EXPLICIT |
| Night Call / Listen to me / One drink | restored one-tap shortcuts | PASS-EXPLICIT |
| `random_recommend` distinct from Quick Random | separate Random Recommendation shortcut/activity | PASS-EXPLICIT |
| Save current configuration as Favorite | Favorites says save/apply/delete/order | PASS-SUCCESSOR |
| Apply Favorite | explicit | PASS-EXPLICIT |
| Delete Favorite | explicit | PASS-EXPLICIT |
| Reorder Favorite | explicit | PASS-EXPLICIT |
| Duplicate/limit behavior of dynamic Favorites | not a menu item; implementation invariant | R-10 VERIFY |
| Legacy default favorite shortcuts | explicit preserve text | PASS-EXPLICIT |
| Legacy named preset data | migration source named | PASS-ROUTE, but migration detail must expose found presets |
| **Random reroll control/behavior** | Random exists, but no explicit `다시 뽑기/재추첨` behavior contract | **PARTIAL** |

### C. Core settings axes
| Control | v2.5 | Result |
|---|---|---|
| Era incl. `late_teens` | explicit | PASS-EXPLICIT |
| Year-timeslip selection | `연도 지정` named but conditional year input not shown | PARTIAL-UI |
| Scene | explicit | PASS-EXPLICIT |
| Activity incl. random_recommend | explicit | PASS-EXPLICIT |
| Relationship | explicit | PASS-EXPLICIT |
| State incl. intoxication states | explicit | PASS-EXPLICIT |
| Language support | explicit | PASS-EXPLICIT |
| Learning mode | explicit | PASS-EXPLICIT |
| Immersion | explicit | PASS-EXPLICIT |
| Support style | explicit | PASS-EXPLICIT |
| Initiative | explicit | PASS-EXPLICIT |
| Private Session | explicit single authority | PASS-EXPLICIT |
| Old free difficulty override | Advanced | PASS-SUCCESSOR |
| Old free Voice preference | migration source into future structured Voice | PASS-SUCCESSOR/DEFERRED |
| late_teens + alcohol/intoxication blocks | explicit | PASS-EXPLICIT |

### D. Session transport / controller utility
| Historical actual action | v2.5 | Result |
|---|---|---|
| Settings/session prompt Copy | explicit | PASS-EXPLICIT |
| Open ChatGPT | explicit | PASS-EXPLICIT |
| Always-available generated command Preview (rc1) | restored | PASS-EXPLICIT |
| Clipboard failure textarea/manual copy | explicit | PASS-EXPLICIT |
| **Restore previous settings** | no explicit control/route | **MISSING-ACTUAL — BLOCKER** |
| **Reset to defaults** | no explicit control/route | **MISSING-ACTUAL — BLOCKER** |
| **Controller-settings Export** | only mentioned indirectly as a different backup; no action/route | **MISSING-ACTUAL — BLOCKER** |
| **Controller-settings Import** | no explicit action/route | **MISSING-ACTUAL — BLOCKER** |
| rc1 one-tap Copy+Open | approved successor is split Copy/Open | PASS-SUCCESSOR (R-01B decision) |

### E. Legacy Continuity
All public rc10/H13 user actions are represented by the v2.5 `Legacy Continuity / Migration` route:
- current record
- count/status
- session-summary request copy
- previous-record rollback
- continuity Sensitive opt-in
- JSON input/import
- inspect
- preview
- apply
- clear/delete

Result: **PASS-ROUTE**. Detail implementation must retain inspect→preview→apply semantics.

### F. Canonical Memory
Represented explicitly in v2.5:
- lifecycle status
- postpone
- new-chat acknowledgement
- legacy inspect/init
- memory-included session prompt
- update request
- manual transport
- response paste
- inspect
- Memory Sensitive opt-in
- editable correction
- failed-validation input retention
- preview
- explicit apply
- atomic commit / stale-candidate block

Result: **PASS-EXPLICIT / PASS-ROUTE**.

### G. Data Safety / Recovery / Replica
| Historical actual action | v2.5 | Result |
|---|---|---|
| Recovery Sensitive opt-in | explicit, separately shown | PASS-EXPLICIT |
| Standard Recovery Backup generation | named | PASS-ROUTE |
| Restore file inspect/preview | named | PASS-ROUTE |
| **Restore explicit Apply as new revision** | not named in the v2.5 Data Safety route | **PARTIAL** |
| Raw Recovery Export | named | PASS-ROUTE |
| Rollback target / Preview | named generically | PASS-ROUTE |
| **Rollback explicit Apply as new revision** | not named | **PARTIAL** |
| PURGE acknowledgement / preview / sanitized new root | explicit | PASS-EXPLICIT |
| Replica Transfer/Conflict inspect | named | PASS-ROUTE |
| Transfer/Merge apply | implied by route/summary | PASS-ROUTE |
| **Conflict: Keep local** | not named | **PARTIAL** |
| **Conflict: choose incoming → new revision** | not named | **PARTIAL** |
| no revision-number-wins | preservation contract | PASS-CONTRACT |

These Data Safety PARTIALs do not need to be first-level buttons. They do need to be explicitly listed in the Data Safety detail wireframe/contract before H-02 freeze.

### H. System / diagnostics
| Historical actual action | v2.5 | Result |
|---|---|---|
| Persona status | named | PASS-ROUTE |
| ChatGPT capability status | named | PASS-ROUTE |
| Voice/browser support | named | PASS-ROUTE |
| Network/storage status | named | PASS-ROUTE |
| **Open real-device IndexedDB diagnostics** | storage is named, but diagnostic action is absent | **MISSING-ACTUAL — BLOCKER** |

## 3. Legacy PLANNED / LATENT menu contracts that must not silently disappear
These were not all proven public working UI, so they are not `MISSING-ACTUAL`. However, they persisted in rc1→rc10 package contracts and have no user-approved removal.

### A. Appearance / UI customization — currently not represented
Persistent legacy design includes:
- theme selection
- layout selection
- user photo / hero background
- hide/reorder menu
- font scale
- motion on/off
- exportable UI customization state
- planned layouts: card / compact list / photo-home
- planned themes: pastel-kitsch / soft / photo / seasonal / minimal-study / custom theme support

v2.5 result: **DEFERRED-PRESERVE BUT NOT SHOWN**.

Required closure before H-02:
- add one secondary `Appearance / 화면 꾸미기` reserved/deferred route under Manage/Advanced, OR
- explicitly freeze a documented successor location with user approval.
Do not expose every future option on the main screen.

### B. Structured Voice legacy contract — only partially represented
Legacy Voice Settings contract includes:
- current Voice display
- recommended Voice candidates
- fixed user Voice
- era-specific Voice mapping
- session-only Voice override
- auto recommendation ON/OFF

v2.5 has a first-class Voice & Reaction reserved card but only says TTS / Reaction / Mic-STT plus migration source.
Result: **DEFERRED-PRESERVE / PARTIAL CONTRACT VISIBILITY**.

Closure: the Voice reserved-detail note should explicitly preserve the six legacy Voice semantics above; engine may remain DEFERRED.

### C. Privacy / portability selective operations — currently not represented
Legacy persisted contracts include:
- export: full settings / UI customization / learning state / presets / roleplay shared memory / public profile package
- reset separately: learning only / roleplay memory only / UI only / Voice only / all user data
- portability modes: learning_only / settings_only / full_private_state / full_private_state_without_saved_memories

These were design contracts, not proven public controls, and modern Canonical Recovery is NOT automatically a 100% successor for all selective modes.
Result: **DEFERRED-PRESERVE / NO EXPLICIT v2.5 ROUTE**.

Closure: reserve one secondary `Data Portability / Selective Export & Reset` future/advanced route under Manage. Do not implement destructive reset in R-01; R-02 must define ownership and safety first.

## 4. Latent mode capabilities
Registry-only/latent scene capabilities such as broadcast, serious_explanation, roleplay, magazine_interview, qa_50_100, continuous_day, and scene=random remain **DEFERRED-PRESERVE**. v2.5 says `latent legacy Scene`, which is sufficient for R-01 top-level placement, provided R-02/R-03 inventory keeps their IDs and no deletion occurs without user approval.

## 5. New REQUIRED feature/menu inventory
The following are present in v2.5 and remain PASS-C at wireframe level:
- four anchors Start / Learning / Memory / Manage
- Companion Days
- Learning Capture first action
- plain-note fallback
- Learning Journal CRUD/search
- human-readable MD/TXT export + selectable-text fallback
- Learning Item foundation (internal; review markers may surface)
- Calendar physical slot + future attendance CTA location
- Practice physical slot
- N5→N1+ growth architecture
- separate current level / session difficulty
- skill-specific learner state
- three distinct Sensitive opt-ins
- global degraded status slot

## 6. Newly discovered blockers/findings
### MISSING-ACTUAL — must be placed before screen approval
1. `직전 설정 복원`
2. `기본값으로 복귀`
3. `컨트롤러 설정 내보내기`
4. `컨트롤러 설정 가져오기`
5. `실기기 IndexedDB 진단 열기`

### PARTIAL — behavior/detail route must be explicit
6. Random reroll / “다시 뽑기” semantics
7. Year-timeslip conditional year input
8. Restore explicit Apply-as-new-revision step
9. Rollback explicit Apply-as-new-revision step
10. Replica conflict `keep local`
11. Replica conflict `choose incoming → new revision`

### DEFERRED-PRESERVE — latent menu contract must get a named secondary slot
12. Appearance / UI customization
13. Structured Voice legacy semantics detail
14. Data Portability / Selective Export & Reset

## 7. Revised gate status
The earlier `31항목 누락 0` statement is **superseded** by this exhaustive audit.

Current status:
- R-01A preservation inventory: reopened only for these newly surfaced menu-level findings; historical feature evidence remains valid.
- R-01B preservation direction: unchanged (no deletion approved).
- R-01 v2.5: **NOT screen-approval ready**.
- H-02: **BLOCKED**.
- User-approved removals: **0**.
- Product code / GitHub mutation: **0**.

## 8. Next permitted action
Before visual screen approval, produce an R-01 v2.6 menu-complete wireframe that:
- restores the five MISSING-ACTUAL entries,
- makes the six PARTIAL paths explicit in appropriate secondary/details UI,
- reserves named secondary routes for the three DEFERRED-PRESERVE groups,
- changes no product code,
- then rerun this inventory row-by-row rather than using keyword-count-only validation.
