# INOO — R-01F FINAL Historical Inventory Re-Audit Result v1

**Date:** 2026-08-21  
**Scope:** R-01F FINAL RE-AUDIT ONLY / AUDIT ONLY / product HTML·CSS·JS mutation 0  
**Current baseline:** `5_P06__R01_UI_REVIEW__INOO_Wireframe_v2.6_VOICE_PRESERVATION_CANDIDATE_2026-08-21.html`  
**Final verdict:** **R-01F final re-audit PASS candidate**  
**H-02:** **NOT RE-FROZEN / remains pending final user screen review + explicit user approval**

> This PASS candidate is a static preservation / historical-inventory closure verdict. It is not runtime JavaScript, IndexedDB Restore, Voice/TTS/Reaction/STT, GitHub, deployment, or H-02 completion proof.

## 1. No-false-attestation update

- Pre-read attestation: **NO — evidence not yet established.**
- Post-validation attestation: **YES — baseline/inventory hashes, manifest, protected marker inventory, exact protected blocks, P-06 rollback hash, and all 175 historical rows were directly rechecked.**

## 2. Bundle / baseline integrity

- Manifest-listed files: **11 / 11 SHA MATCH**.
- Baseline actual SHA-256: `7cadf5dc42d02b46998faec6e7b703e7fd1e048338fed695e6e256a45a9c6440` — **MATCH**.
- Baseline actual bytes: **87,607** — **MATCH**.
- Baseline actual line count: **550** (`splitlines`; newline bytes=550).
- **Non-blocking metadata finding F-001:** handoff/P-06 audit record `551` lines, but the actual hash-matching file contains 550 newline-terminated lines. The byte count and SHA match exactly, so this is an audit line-count convention/calculation discrepancy, **not a file-content regression or deletion**.
- Historical inventory actual SHA-256: `4b2fb94762a59dd022d26f1aa49a0d2b0573aeca770c9d1b3b8bac590377bc1b` — **MATCH**.
- Historical inventory rows: **175** — **MATCH expected 175**.
- Historical source evidence has **103 unique row signatures + 72 expected repeated evidence rows** across rc1/rc9/rc10/H13 snapshots; these repetitions are not treated as ambiguous current routes.

### 2.1 Manifest entry check

| file | bytes | expected SHA | actual SHA | result |
|---|---:|---|---|---|
| `00_START_HERE/0_READ_ME_FIRST__INOO_R01F_H02_NEW_CHAT_2026-08-21.txt` | 2,779 | `e8050983261c810c8a41f6bc118a2fa24c8232037f5c228853c9b8fb71548ebd` | `e8050983261c810c8a41f6bc118a2fa24c8232037f5c228853c9b8fb71548ebd` | **PASS** |
| `00_START_HERE/1_ACT1__FIRST_MESSAGE_BEFORE_ZIP_UPLOAD__INOO_R01F_H02_2026-08-21.txt` | 1,222 | `a215dcb773042a022e315fce4d7413dda4e9af080d0083e77b2ebfce8d780ab8` | `a215dcb773042a022e315fce4d7413dda4e9af080d0083e77b2ebfce8d780ab8` | **PASS** |
| `00_START_HERE/2_ACT2__AFTER_ZIP_UPLOAD__INOO_R01F_H02_2026-08-21.txt` | 2,318 | `40bcb2c90e556f35430be3fce620b995382644223c2215c7965ecc85d6f6fcee` | `40bcb2c90e556f35430be3fce620b995382644223c2215c7965ecc85d6f6fcee` | **PASS** |
| `00_START_HERE/3_PACKAGE_FILE_INDEX.txt` | 1,185 | `9f101e85859bdf36bcd549575d9f3ebb8c10cec5901ef97f3f1629d23cfff516` | `9f101e85859bdf36bcd549575d9f3ebb8c10cec5901ef97f3f1629d23cfff516` | **PASS** |
| `01_GOVERNING_CONTRACTS/1_MASTER__INOO_HIGH_FIDELITY_PERSONA_VOICE_REACTION_ARCHITECTURE_v1_2026-08-21.md` | 28,315 | `b98ab047c1e363817d4233f22bcf109dd4ed2189d69ccb9ef3c3f48554718152` | `b98ab047c1e363817d4233f22bcf109dd4ed2189d69ccb9ef3c3f48554718152` | **PASS** |
| `01_GOVERNING_CONTRACTS/4_HANDOFF__Inoo_Companion_MASTER_REQUIREMENTS_MATRIX_v3.md` | 90,182 | `c89054c9183a8238bd85c299ee5f6018d373bec9e173785e1adecbf104bb5b8d` | `c89054c9183a8238bd85c299ee5f6018d373bec9e173785e1adecbf104bb5b8d` | **PASS** |
| `02_CURRENT_BASELINE/5_P06__R01_UI_REVIEW__INOO_Wireframe_v2.6_VOICE_PRESERVATION_CANDIDATE_2026-08-21.html` | 87,607 | `7cadf5dc42d02b46998faec6e7b703e7fd1e048338fed695e6e256a45a9c6440` | `7cadf5dc42d02b46998faec6e7b703e7fd1e048338fed695e6e256a45a9c6440` | **PASS** |
| `03_AUDIT_EVIDENCE/6_P06__R01G_AUDIT__INOO_VOICE_PRESERVATION_PATCH_RESULT_v1_2026-08-21.md` | 7,844 | `fb53d88b6641c386211ff2d01ff421ce3393364485e02c7722b7b311f4e25be5` | `fb53d88b6641c386211ff2d01ff421ce3393364485e02c7722b7b311f4e25be5` | **PASS** |
| `03_AUDIT_EVIDENCE/6_R01F_AUDIT__Inoo_Companion_FULL_MENU_FUNCTION_ANTI_OMISSION_v1_2026-08-21.md` | 12,656 | `563de6c095eda3cf8ae292319c5a3cc6cfccaab43625f842bcec23b941df08d2` | `563de6c095eda3cf8ae292319c5a3cc6cfccaab43625f842bcec23b941df08d2` | **PASS** |
| `03_AUDIT_EVIDENCE/6_R01F_AUDIT__Inoo_Companion_HISTORICAL_INTERACTIVE_CONTROL_INVENTORY_v1_2026-08-21.csv` | 13,853 | `4b2fb94762a59dd022d26f1aa49a0d2b0573aeca770c9d1b3b8bac590377bc1b` | `4b2fb94762a59dd022d26f1aa49a0d2b0573aeca770c9d1b3b8bac590377bc1b` | **PASS** |
| `04_HANDOFF_STATUS/4_HANDOFF__INOO_R01F_FINAL_REAUDIT_TO_H02_2026-08-21.md` | 5,622 | `beb174c277776ac03fae9568d16602458cb9b5aec7064a84c7c649bf3d4d5c10` | `beb174c277776ac03fae9568d16602458cb9b5aec7064a84c7c649bf3d4d5c10` | **PASS** |

## 3. P-06 protected regression recheck

- `<style>`: **1**, exact `<style>…</style>` SHA `6f9b154c65ae276cce5381ea54b5e1bdfae79100f902525607398486ef931e95` — expected `6f9b154c65ae276cce5381ea54b5e1bdfae79100f902525607398486ef931e95` — **PASS**.
- `<script>`: **0** — **PASS**.
- IDs: **10 / unique 10** — **PASS**.
- interactive controls (`button/input/select`): **30** — **PASS**.
- degraded banners: **2** — **PASS**.
- top-level anchors: **['시작', '학습', '기억', '관리', '시작', '학습', '기억', '관리']** = Start/Learning/Memory/Manage × mobile+desktop; fifth top-level menu **0** — **PASS**.
- P-06 preservation fragments: **2** — **PASS**.

### 3.1 17 protected marker categories

| protected marker category | actual | expected | result |
|---|---:|---:|---|
| `data-p01b-alert-hub` | 2 | 2 | **PASS** |
| `data-p02-random-reroll` | 2 | 2 | **PASS** |
| `data-p02-year-timeslip` | 2 | 2 | **PASS** |
| `data-p03-controller-settings` | 2 | 2 | **PASS** |
| `data-p03-indexeddb-diagnostic` | 2 | 2 | **PASS** |
| `data-p03a-import-safety` | 2 | 2 | **PASS** |
| `data-p04-1-restore` | 2 | 2 | **PASS** |
| `data-p04-1-restore-preview` | 2 | 2 | **PASS** |
| `data-p04-2-forward-rollback` | 2 | 2 | **PASS** |
| `data-p04-2-rollback-preview` | 2 | 2 | **PASS** |
| `P-04-3 actual Replica Conflict` | 2 | 2 | **PASS** |
| `P-04-3 out-of-scope references` | 2 | 2 | **PASS** |
| `data-p04-3-conflict-preview` | 2 | 2 | **PASS** |
| `explicit conflict branch radio` | 4 | 4 | **PASS** |
| `data-p05-advanced-reserved` | 2 | 2 | **PASS** |
| `data-p05-appearance="deferred-preserve"` | 2 | 2 | **PASS** |
| `data-p05-data-portability="deferred-preserve"` | 2 | 2 | **PASS** |

### 3.2 Exact-byte protected blocks

| block | actual bytes | expected bytes | actual SHA | expected SHA | result |
|---|---:|---:|---|---|---|
| Learning Calendar mobile | 403 | 403 | `4d4025fe6846a2c3f415bb2e73a6bbee122ad262c156e140664a8a08917f61fd` | `4d4025fe6846a2c3f415bb2e73a6bbee122ad262c156e140664a8a08917f61fd` | **PASS** |
| Learning Calendar desktop | 212 | 212 | `a89725f1223ee156d12c371f9ead92b88e9c2ad5f0396fdc215b4285c49ad999` | `a89725f1223ee156d12c371f9ead92b88e9c2ad5f0396fdc215b4285c49ad999` | **PASS** |
| Voice & Reaction mobile | 388 | 388 | `efa0e52c0afc19b86dcf2faac798d4485892c2d61a16d90d525aa9fd0eee2e69` | `efa0e52c0afc19b86dcf2faac798d4485892c2d61a16d90d525aa9fd0eee2e69` | **PASS** |
| Voice & Reaction desktop | 186 | 186 | `50ac968321d231dc376f350acaa561f4dfdf8d99f70d8d2755d1da4c345ee950` | `50ac968321d231dc376f350acaa561f4dfdf8d99f70d8d2755d1da4c345ee950` | **PASS** |
| P-04-1 mobile | 4585 | 4585 | `0b3905df7f57a220e3e625b28cee6407c8e70131d0594c098e15bc008a8d0e92` | `0b3905df7f57a220e3e625b28cee6407c8e70131d0594c098e15bc008a8d0e92` | **PASS** |
| P-04-1 desktop | 3346 | 3346 | `2cae3eaf867a35b2538cee8c2ebf6762c98da41d398d07272641fc2aa44cdebe` | `2cae3eaf867a35b2538cee8c2ebf6762c98da41d398d07272641fc2aa44cdebe` | **PASS** |
| P-04-2 mobile | 4877 | 4877 | `91b93850d6f0bb25794d1278d165fb387e2f4a28d3b22b41e135850233fdc490` | `91b93850d6f0bb25794d1278d165fb387e2f4a28d3b22b41e135850233fdc490` | **PASS** |
| P-04-2 desktop | 3602 | 3602 | `6a1418281b9377ded7e71e606af464dbcb7509cd60a65da19d3dab47566095d7` | `6a1418281b9377ded7e71e606af464dbcb7509cd60a65da19d3dab47566095d7` | **PASS** |
| P-04-3 mobile | 4986 | 4986 | `187b1bfecb027d0fbda748304feded8494dfec757db4a0b50179eb8c28f730f1` | `187b1bfecb027d0fbda748304feded8494dfec757db4a0b50179eb8c28f730f1` | **PASS** |
| P-04-3 desktop | 3940 | 3940 | `9c6b0f67c0017e8ca28e249cd0442667dc1c84bdbd0913fa06a98a4ba2713c0a` | `9c6b0f67c0017e8ca28e249cd0442667dc1c84bdbd0913fa06a98a4ba2713c0a` | **PASS** |
| P-05 Advanced mobile | 1792 | 1792 | `b6038067ad14825a692356d3b9e2d630eec9bdc5fa74bcae4db455fd2cfba04a` | `b6038067ad14825a692356d3b9e2d630eec9bdc5fa74bcae4db455fd2cfba04a` | **PASS** |
| P-05 Advanced desktop | 1839 | 1839 | `ff92ef438b6047524663e6a0ee5bff5dc34c064e2ffc5b19c7f8dd387e662cca` | `ff92ef438b6047524663e6a0ee5bff5dc34c064e2ffc5b19c7f8dd387e662cca` | **PASS** |
| P-06 fragment mobile | 4986 | 4986 | `aa4284b8d1a8b6c478b3f5b0f4ededbb487474d6f4d7f24c684c33fa57d1ec98` | `aa4284b8d1a8b6c478b3f5b0f4ededbb487474d6f4d7f24c684c33fa57d1ec98` | **PASS** |
| P-06 fragment desktop | 5117 | 5117 | `bd587b3952777f30db14aeef8f890c36fadfc9cbf95ce8cefab3ba6a1b8045f9` | `bd587b3952777f30db14aeef8f890c36fadfc9cbf95ce8cefab3ba6a1b8045f9` | **PASS** |

- Remove the two exact P-06 fragments from the saved v2.6 baseline → **77,504 bytes**, SHA `86b4382d6791cfc4d9a427f941325d5f64aaeb2b04fd306d769416984655f42a`. This matches the P-06 audit’s recorded P-05 baseline SHA `86b4382d6791cfc4d9a427f941325d5f64aaeb2b04fd306d769416984655f42a` — **PASS rollback proof**.
- Protected feature/route regression: **0**.

## 4. R-01F 175-row final classification summary

| metric | count |
|---|---:|
| Historical rows total | **175** |
| PASS-EXPLICIT | **124** |
| PASS-ROUTE | **42** |
| PASS-SUCCESSOR | **9** |
| DEFERRED-PRESERVE rows inside 175-row ACTUAL inventory | **0** |
| MISSING-ACTUAL remaining | **0** |
| PARTIAL remaining | **0** |
| User-approved removals | **0** |
| Unexplained deletions | **0** |
| Unresolved duplicate/ambiguous current routes | **0** |
| Protected feature/route regressions | **0** |

**Classification rule used:** direct visible action/setting = PASS-EXPLICIT; named secondary/detail flow = PASS-ROUTE; modern explicit replacement of a legacy control = PASS-SUCCESSOR. No working historical ACTUAL row was downgraded into DEFERRED-PRESERVE.

## 5. Prior blocker closure recheck

### 5.1 MISSING-ACTUAL 5 → remaining 0

1. **Previous settings restore** — mobile `직전 설정 복원` (HTML L150), desktop same (L343) — **CLOSED**.
2. **Default reset** — `기본값으로 복귀` mobile/desktop (L150/L343) — **CLOSED**.
3. **Controller Settings Export** — actual button ×2 under `data-p03-controller-settings` (L274/L453) — **CLOSED**.
4. **Controller Settings Import** — actual button ×2 + Import Safety contract (L274-L275/L453-L454) — **CLOSED**.
5. **Real-device IndexedDB diagnostic** — actual button ×2 under `data-p03-indexeddb-diagnostic` (L288/L467) — **CLOSED**.

### 5.2 PARTIAL 6 → remaining 0

1. **Random reroll semantics** — `data-p02-random-reroll` ×2 + `다시 뽑기` button ×2; Quick Random / Random Recommendation not merged (L88 and desktop equivalent) — **CLOSED**.
2. **Year-timeslip conditional input** — `data-p02-year-timeslip` ×2 + number input ×2; “연도 지정 선택 시만 표시” explicit (L126/L359) — **CLOSED**.
3. **Restore apply-as-new-revision** — Preview → explicit approval → staging → new forward revision → read-back (L194-L203/L393-L401) — **CLOSED**.
4. **Forward Rollback apply-as-new-revision** — target/Preview/explicit approval → new forward revision → read-back (L213-L236/L411-L423) — **CLOSED**.
5. **Replica Conflict — Keep local** — explicit Current Local branch radio mobile+desktop (L257-L260/L443-L445) — **CLOSED**.
6. **Replica Conflict — incoming → new revision** — explicit Incoming Replica branch + new forward resolution revision semantics (L260-L268/L445-L448) — **CLOSED**.

### 5.3 DEFERRED-PRESERVE 3 → all named/preserved; engine still deferred

1. **Appearance / UI customization** — `data-p05-appearance="deferred-preserve"` ×2 under `[Manage] → [Advanced]` (L277-L285/L456-L464) — **PRESERVED**.
2. **Structured Voice legacy semantics** — P-06 fragments ×2 explicitly preserve current voice / recommendation / fixed voice / era mapping / session-only override / auto recommendation, plus architecture semantics (L90-L121 and desktop equivalent) — **PRESERVED**.
3. **Data Portability / selective Export & Reset** — `data-p05-data-portability="deferred-preserve"` ×2 under Advanced (L282/L461) — **PRESERVED**.

These three groups remain **DEFERRED-PRESERVE**, not runtime-complete. Their named UI/contract slots are now present, which is the R-01F closure requirement.

## 6. Ambiguity / route-collision check

- **Quick Random vs Random Recommendation:** separate semantics explicitly stated; unresolved collision **0**.
- **Canonical Restore vs Controller Settings Import:** separate authority/scope explicitly stated (`data-controller-settings-import="separate-authority"` plus Controller Settings card); unresolved collision **0**.
- **Legacy Continuity vs Canonical Memory:** both retained and not silently merged; unresolved collision **0**.
- **Sensitive controls:** Legacy Continuity / Memory / Recovery Backup remain distinct; unresolved collision **0**.
- **Voice semantics:** current / recommendation / fixed / era mapping / session override / auto recommendation explicitly independent; unresolved collision **0**.

## 7. Final gate decision

All R-01F target closure criteria are satisfied on the supplied v2.6 baseline:

- MISSING-ACTUAL = **0**
- PARTIAL route = **0**
- user-approved removal = **0**
- unexplained deletion = **0**
- protected feature/route regression = **0**

Therefore the correct status is: **R-01F final re-audit PASS candidate**.

Next permitted gate: **final user screen review → explicit user approval → H-02 re-freeze candidate**. H-02 is **not** auto-frozen by this report.

## 8. File disposition

- Save this report in user folder: **`6_내부 검수·감사 기록`**.
- Save the row-by-row CSV appendix in the same folder: **`6_내부 검수·감사 기록`**.
- Existing P-06 HTML and prior audits: **do not delete or replace**.
- Product code/HTML/CSS/JS modifications during this audit: **0**.

## Appendix A — Complete 175-row historical inventory reclassification

| row | source | historical item | context | classification | current evidence | rationale |
|---:|---|---|---|---|---|---|
| 1 | rc1_prototype | 💬 수다 | Quick Start | **PASS-EXPLICIT** | HTML L86 / L307 | 모바일·데스크톱 Quick Start에 동일 기능이 직접 표시됨. |
| 2 | rc1_prototype | 📞 전화 | Quick Start | **PASS-EXPLICIT** | HTML L86 / L307 | 모바일·데스크톱 Quick Start에 동일 기능이 직접 표시됨. |
| 3 | rc1_prototype | 🎀 데이트 | Quick Start | **PASS-EXPLICIT** | HTML L86 / L307 | 모바일·데스크톱 Quick Start에 동일 기능이 직접 표시됨. |
| 4 | rc1_prototype | 🥂 술자리 | Quick Start | **PASS-EXPLICIT** | HTML L86 / L307 | 모바일·데스크톱 Quick Start에 동일 기능이 직접 표시됨. |
| 5 | rc1_prototype | 📻 라디오 | Quick Start | **PASS-EXPLICIT** | HTML L86 / L307 | 모바일·데스크톱 Quick Start에 동일 기능이 직접 표시됨. |
| 6 | rc1_prototype | 🌙 산책 | Quick Start | **PASS-EXPLICIT** | HTML L86 / L307 | 모바일·데스크톱 Quick Start에 동일 기능이 직접 표시됨. |
| 7 | rc1_prototype | 🕰️ 타임슬립 | Quick Start | **PASS-EXPLICIT** | HTML L86 / L307 | 모바일·데스크톱 Quick Start에 동일 기능이 직접 표시됨. |
| 8 | rc1_prototype | 🎲 랜덤 | Quick Start | **PASS-EXPLICIT** | HTML L86 / L307 | 모바일·데스크톱 Quick Start에 동일 기능이 직접 표시됨. |
| 9 | rc1_prototype | #sel_era | Private Session | **PASS-EXPLICIT** | HTML L126 / L359 | Era 축과 late_teens/year-timeslip 선택지가 직접 보존됨. |
| 10 | rc1_prototype | #year_timeslip | Private Session | **PASS-EXPLICIT** | HTML L126 / L359 | 연도 지정 시 조건부 number input이 모바일·데스크톱에 직접 존재함. |
| 11 | rc1_prototype | #sel_scene | Private Session | **PASS-EXPLICIT** | HTML L127 / L360 | Scene 축이 직접 보존됨. |
| 12 | rc1_prototype | #sel_activity | Private Session | **PASS-EXPLICIT** | HTML L128 / L361 | Activity 축이 직접 보존되며 random-recommend도 별도 항목으로 유지됨. |
| 13 | rc1_prototype | #sel_relationship | Private Session | **PASS-EXPLICIT** | HTML L129 / L362 | Relationship 축이 직접 보존됨. |
| 14 | rc1_prototype | #sel_state | Private Session | **PASS-EXPLICIT** | HTML L130 / L363 | State 축 및 음주/취기 상태 의미가 직접 보존됨. |
| 15 | rc1_prototype | #sel_language_support | Private Session | **PASS-EXPLICIT** | HTML L131 / L364 | 대화 언어/언어 지원 축이 직접 보존됨. |
| 16 | rc1_prototype | #sel_proficiency_mode | Private Session | **PASS-EXPLICIT** | HTML L135-L138 / L369 | 기존 proficiency 의미가 현재 일본어 수준 축으로 직접 보존되고 세션 난이도와 분리됨. |
| 17 | rc1_prototype | #sel_learning_mode | Private Session | **PASS-EXPLICIT** | HTML L141 / L367 | Learning mode 축이 직접 보존됨. |
| 18 | rc1_prototype | #sel_immersion | Private Session | **PASS-EXPLICIT** | HTML L142 / L368 | Immersion 축이 직접 보존됨. |
| 19 | rc1_prototype | #sel_support_style | Private Session | **PASS-EXPLICIT** | HTML L132 / L365 | Support style 축이 직접 보존됨. |
| 20 | rc1_prototype | #sel_initiative | Private Session | **PASS-EXPLICIT** | HTML L133 / L366 | Initiative 축이 직접 보존됨. |
| 21 | rc1_prototype | #difficulty_override | Private Session | **PASS-SUCCESSOR** | HTML L138, L144 / L370 | legacy free-text difficulty override는 Advanced 자유 지정/Advanced·Legacy 경로의 명시적 기능 successor로 보존됨. |
| 22 | rc1_prototype | #voice_preference | Private Session | **PASS-SUCCESSOR** | HTML L89-L119 / L310-L340 | legacy Voice preference는 structured Voice semantics 및 migration source로 명시 보존되는 successor임. |
| 23 | rc1_prototype | #private_session | Private Session | **PASS-EXPLICIT** | HTML L149 / L343 | Private Session이 Start의 단일 authority로 직접 표시됨. |
| 24 | rc1_prototype | 세션 명령 복사 | 고급 설정 · Advanced | **PASS-EXPLICIT** | HTML L151 / L343 | 설정/세션 명령 복사 액션이 직접 표시됨. |
| 25 | rc1_prototype | 복사하고 ChatGPT 열기 | 고급 설정 · Advanced | **PASS-SUCCESSOR** | HTML L151 / L343 | rc1의 Copy+Open 단일 액션은 R-01B 결정대로 Copy와 ChatGPT Open 분리 successor로 보존됨. |
| 26 | rc1_prototype | 명령 미리보기 | 고급 설정 · Advanced | **PASS-EXPLICIT** | HTML L151-L152 / L343 | 세션 명령 미리보기가 상시 접근 액션으로 직접 복원됨. |
| 27 | rc1_prototype | 현재 프리셋 저장 | 고급 설정 · Advanced | **PASS-SUCCESSOR** | HTML L87 / L308, L528 | legacy preset 저장은 Favorites 저장/적용 체계와 named preset migration source로 successor 보존됨. |
| 28 | rc1_prototype | 기본값으로 복귀 | 고급 설정 · Advanced | **PASS-EXPLICIT** | HTML L150 / L343 | 기본값 복귀 액션이 직접 표시됨. |
| 29 | rc1_prototype | 직전 설정 | 고급 설정 · Advanced | **PASS-EXPLICIT** | HTML L150 / L343 | 직전 설정 복원 액션이 직접 표시됨. |
| 30 | rc1_prototype | 설정 Export | 고급 설정 · Advanced | **PASS-EXPLICIT** | HTML L274 / L453 | Controller Settings 내보내기가 직접 버튼으로 존재함. |
| 31 | rc1_prototype | #importFile | 고급 설정 · Advanced | **PASS-EXPLICIT** | HTML L274-L275 / L453-L454 | Controller Settings 가져오기 액션과 Import Safety 경로가 직접 존재함. |
| 32 | rc1_prototype | #promptOutput | 생성된 세션 명령 | **PASS-ROUTE** | HTML L151-L152 | 생성 명령 Preview 및 selectable textarea/manual-copy fallback 경로가 명시됨. |
| 33 | rc9_public | Auto 한국어 日本語 English | 처음 사용하시나요? | **PASS-EXPLICIT** | HTML L76, L289 / L468 | 화면 언어 Auto/KO/JA/EN이 직접 보존됨. |
| 34 | rc9_public | 새 버전 적용 | 처음 사용하시나요? | **PASS-ROUTE** | HTML L80, L290 / L468 | 업데이트 알림과 명명된 업데이트 secondary route가 보존됨; row는 해당 route로 귀속됨. |
| 35 | rc9_public | 알겠어요 | 처음 사용하시나요? | **PASS-ROUTE** | HTML L290 / L468 | first-use/초기 안내가 명명된 secondary route로 보존됨. |
| 36 | rc9_public | 💬 수다 | 빠른 시작 | **PASS-EXPLICIT** | HTML L86 / L307 | 모바일·데스크톱 Quick Start에 동일 기능이 직접 표시됨. |
| 37 | rc9_public | 📞 전화 | 빠른 시작 | **PASS-EXPLICIT** | HTML L86 / L307 | 모바일·데스크톱 Quick Start에 동일 기능이 직접 표시됨. |
| 38 | rc9_public | 🎀 데이트 | 빠른 시작 | **PASS-EXPLICIT** | HTML L86 / L307 | 모바일·데스크톱 Quick Start에 동일 기능이 직접 표시됨. |
| 39 | rc9_public | 🥂 술자리 | 빠른 시작 | **PASS-EXPLICIT** | HTML L86 / L307 | 모바일·데스크톱 Quick Start에 동일 기능이 직접 표시됨. |
| 40 | rc9_public | 📻 라디오 | 빠른 시작 | **PASS-EXPLICIT** | HTML L86 / L307 | 모바일·데스크톱 Quick Start에 동일 기능이 직접 표시됨. |
| 41 | rc9_public | 🌙 산책 | 빠른 시작 | **PASS-EXPLICIT** | HTML L86 / L307 | 모바일·데스크톱 Quick Start에 동일 기능이 직접 표시됨. |
| 42 | rc9_public | 🕰️ 타임슬립 | 빠른 시작 | **PASS-EXPLICIT** | HTML L86 / L307 | 모바일·데스크톱 Quick Start에 동일 기능이 직접 표시됨. |
| 43 | rc9_public | ✏️ 일본어 공부 | 빠른 시작 | **PASS-EXPLICIT** | HTML L86 / L307 | 모바일·데스크톱 Quick Start에 동일 기능이 직접 표시됨. |
| 44 | rc9_public | 🎲 랜덤 | 빠른 시작 | **PASS-EXPLICIT** | HTML L86 / L307 | 모바일·데스크톱 Quick Start에 동일 기능이 직접 표시됨. |
| 45 | rc9_public | ⭐ 현재 설정 저장 | 즐겨찾기 | **PASS-EXPLICIT** | HTML L87 / L308 | Favorites 카드에 저장 기능이 직접 명시됨. |
| 46 | rc9_public | #era | 세부 설정 | **PASS-EXPLICIT** | HTML L126 / L359 | Era 축과 late_teens/year-timeslip 선택지가 직접 보존됨. |
| 47 | rc9_public | #year_timeslip | 세부 설정 | **PASS-EXPLICIT** | HTML L126 / L359 | 연도 지정 시 조건부 number input이 모바일·데스크톱에 직접 존재함. |
| 48 | rc9_public | #scene | 세부 설정 | **PASS-EXPLICIT** | HTML L127 / L360 | Scene 축이 직접 보존됨. |
| 49 | rc9_public | #activity | 세부 설정 | **PASS-EXPLICIT** | HTML L128 / L361 | Activity 축이 직접 보존되며 random-recommend도 별도 항목으로 유지됨. |
| 50 | rc9_public | #relationship | 세부 설정 | **PASS-EXPLICIT** | HTML L129 / L362 | Relationship 축이 직접 보존됨. |
| 51 | rc9_public | #state | 세부 설정 | **PASS-EXPLICIT** | HTML L130 / L363 | State 축 및 음주/취기 상태 의미가 직접 보존됨. |
| 52 | rc9_public | #language_support | 세부 설정 | **PASS-EXPLICIT** | HTML L131 / L364 | 대화 언어/언어 지원 축이 직접 보존됨. |
| 53 | rc9_public | #proficiency | 세부 설정 | **PASS-EXPLICIT** | HTML L135-L138 / L369 | 기존 proficiency 의미가 현재 일본어 수준 축으로 직접 보존되고 세션 난이도와 분리됨. |
| 54 | rc9_public | #learning_mode | 세부 설정 | **PASS-EXPLICIT** | HTML L141 / L367 | Learning mode 축이 직접 보존됨. |
| 55 | rc9_public | #immersion | 세부 설정 | **PASS-EXPLICIT** | HTML L142 / L368 | Immersion 축이 직접 보존됨. |
| 56 | rc9_public | #support_style | 세부 설정 | **PASS-EXPLICIT** | HTML L132 / L365 | Support style 축이 직접 보존됨. |
| 57 | rc9_public | #initiative | 세부 설정 | **PASS-EXPLICIT** | HTML L133 / L366 | Initiative 축이 직접 보존됨. |
| 58 | rc9_public | #private_session | 세부 설정 | **PASS-EXPLICIT** | HTML L149 / L343 | Private Session이 Start의 단일 authority로 직접 표시됨. |
| 59 | rc9_public | 설정 복사 복사 후 ChatGPT를 열어 붙여넣어요 | 처음 사용하시나요? | **PASS-EXPLICIT** | HTML L151 / L343 | 설정/세션 명령 복사 액션이 직접 표시됨. |
| 60 | rc9_public | ChatGPT 열기 열리면 입력창에 붙여넣기 | 처음 사용하시나요? | **PASS-EXPLICIT** | HTML L151 / L343 | ChatGPT 열기 액션이 직접 표시됨. |
| 61 | rc9_public | #fallbackPrompt | 처음 사용하시나요? | **PASS-ROUTE** | HTML L152 | Clipboard 실패 시 selectable textarea/manual copy fallback route가 명시됨. |
| 62 | rc9_public | 텍스트 선택해서 복사하기 | 처음 사용하시나요? | **PASS-ROUTE** | HTML L152 | Clipboard 실패 시 selectable textarea/manual copy fallback route가 명시됨. |
| 63 | rc9_public | 직전 설정 복원 | 처음 사용하시나요? | **PASS-EXPLICIT** | HTML L150 / L343 | 직전 설정 복원 액션이 직접 표시됨. |
| 64 | rc9_public | 내 설정 백업 | 처음 사용하시나요? | **PASS-SUCCESSOR** | HTML L274-L275 / L453-L454 | legacy “내 설정 백업/복원 파일”은 Canonical Recovery와 분리된 Controller Settings Export/Import successor로 명시됨. |
| 65 | rc9_public | #restoreFile | 처음 사용하시나요? | **PASS-SUCCESSOR** | HTML L274-L275 / L453-L454 | legacy “내 설정 백업/복원 파일”은 Canonical Recovery와 분리된 Controller Settings Export/Import successor로 명시됨. |
| 66 | rc9_public | 기본값 | 처음 사용하시나요? | **PASS-EXPLICIT** | HTML L150 / L343 | 기본값 복귀 액션이 직접 표시됨. |
| 67 | rc10_public | Auto 한국어 日本語 English | 처음 사용하시나요? | **PASS-EXPLICIT** | HTML L76, L289 / L468 | 화면 언어 Auto/KO/JA/EN이 직접 보존됨. |
| 68 | rc10_public | 새 버전 적용 | 처음 사용하시나요? | **PASS-ROUTE** | HTML L80, L290 / L468 | 업데이트 알림과 명명된 업데이트 secondary route가 보존됨; row는 해당 route로 귀속됨. |
| 69 | rc10_public | 알겠어요 | 처음 사용하시나요? | **PASS-ROUTE** | HTML L290 / L468 | first-use/초기 안내가 명명된 secondary route로 보존됨. |
| 70 | rc10_public | 💬 수다 | 빠른 시작 | **PASS-EXPLICIT** | HTML L86 / L307 | 모바일·데스크톱 Quick Start에 동일 기능이 직접 표시됨. |
| 71 | rc10_public | 📞 전화 | 빠른 시작 | **PASS-EXPLICIT** | HTML L86 / L307 | 모바일·데스크톱 Quick Start에 동일 기능이 직접 표시됨. |
| 72 | rc10_public | 🎀 데이트 | 빠른 시작 | **PASS-EXPLICIT** | HTML L86 / L307 | 모바일·데스크톱 Quick Start에 동일 기능이 직접 표시됨. |
| 73 | rc10_public | 🥂 술자리 | 빠른 시작 | **PASS-EXPLICIT** | HTML L86 / L307 | 모바일·데스크톱 Quick Start에 동일 기능이 직접 표시됨. |
| 74 | rc10_public | 📻 라디오 | 빠른 시작 | **PASS-EXPLICIT** | HTML L86 / L307 | 모바일·데스크톱 Quick Start에 동일 기능이 직접 표시됨. |
| 75 | rc10_public | 🌙 산책 | 빠른 시작 | **PASS-EXPLICIT** | HTML L86 / L307 | 모바일·데스크톱 Quick Start에 동일 기능이 직접 표시됨. |
| 76 | rc10_public | 🕰️ 타임슬립 | 빠른 시작 | **PASS-EXPLICIT** | HTML L86 / L307 | 모바일·데스크톱 Quick Start에 동일 기능이 직접 표시됨. |
| 77 | rc10_public | ✏️ 일본어 공부 | 빠른 시작 | **PASS-EXPLICIT** | HTML L86 / L307 | 모바일·데스크톱 Quick Start에 동일 기능이 직접 표시됨. |
| 78 | rc10_public | 🎲 랜덤 | 빠른 시작 | **PASS-EXPLICIT** | HTML L86 / L307 | 모바일·데스크톱 Quick Start에 동일 기능이 직접 표시됨. |
| 79 | rc10_public | ⭐ 현재 설정 저장 | 즐겨찾기 | **PASS-EXPLICIT** | HTML L87 / L308 | Favorites 카드에 저장 기능이 직접 명시됨. |
| 80 | rc10_public | 🧠 세션 정리 요청 복사 | 장기 기록 | **PASS-ROUTE** | HTML L273 / L452 | Legacy Continuity/Migration secondary route에 기록·정리요청·이전복원·JSON inspect/preview/apply·Sensitive·삭제가 명시됨. |
| 81 | rc10_public | ↩︎ 이전 기록 복원 | 장기 기록 | **PASS-ROUTE** | HTML L273 / L452 | Legacy Continuity/Migration secondary route에 기록·정리요청·이전복원·JSON inspect/preview/apply·Sensitive·삭제가 명시됨. |
| 82 | rc10_public | #continuitySensitive | 민감한 개인 맥락 포함 허용 | **PASS-ROUTE** | HTML L273 / L452 | Legacy Continuity/Migration secondary route에 기록·정리요청·이전복원·JSON inspect/preview/apply·Sensitive·삭제가 명시됨. |
| 83 | rc10_public | #continuityInput | ChatGPT가 만든 장기 기록 가져오기 | **PASS-ROUTE** | HTML L273 / L452 | Legacy Continuity/Migration secondary route에 기록·정리요청·이전복원·JSON inspect/preview/apply·Sensitive·삭제가 명시됨. |
| 84 | rc10_public | 1. 검사 | ChatGPT가 만든 장기 기록 가져오기 | **PASS-ROUTE** | HTML L273 / L452 | Legacy Continuity/Migration secondary route에 기록·정리요청·이전복원·JSON inspect/preview/apply·Sensitive·삭제가 명시됨. |
| 85 | rc10_public | 2. 확인하고 저장 | ChatGPT가 만든 장기 기록 가져오기 | **PASS-ROUTE** | HTML L273 / L452 | Legacy Continuity/Migration secondary route에 기록·정리요청·이전복원·JSON inspect/preview/apply·Sensitive·삭제가 명시됨. |
| 86 | rc10_public | 장기 기록 삭제 | 장기 기록 | **PASS-ROUTE** | HTML L273 / L452 | Legacy Continuity/Migration secondary route에 기록·정리요청·이전복원·JSON inspect/preview/apply·Sensitive·삭제가 명시됨. |
| 87 | rc10_public | #era | 세부 설정 | **PASS-EXPLICIT** | HTML L126 / L359 | Era 축과 late_teens/year-timeslip 선택지가 직접 보존됨. |
| 88 | rc10_public | #year_timeslip | 세부 설정 | **PASS-EXPLICIT** | HTML L126 / L359 | 연도 지정 시 조건부 number input이 모바일·데스크톱에 직접 존재함. |
| 89 | rc10_public | #scene | 세부 설정 | **PASS-EXPLICIT** | HTML L127 / L360 | Scene 축이 직접 보존됨. |
| 90 | rc10_public | #activity | 세부 설정 | **PASS-EXPLICIT** | HTML L128 / L361 | Activity 축이 직접 보존되며 random-recommend도 별도 항목으로 유지됨. |
| 91 | rc10_public | #relationship | 세부 설정 | **PASS-EXPLICIT** | HTML L129 / L362 | Relationship 축이 직접 보존됨. |
| 92 | rc10_public | #state | 세부 설정 | **PASS-EXPLICIT** | HTML L130 / L363 | State 축 및 음주/취기 상태 의미가 직접 보존됨. |
| 93 | rc10_public | #language_support | 세부 설정 | **PASS-EXPLICIT** | HTML L131 / L364 | 대화 언어/언어 지원 축이 직접 보존됨. |
| 94 | rc10_public | #proficiency | 세부 설정 | **PASS-EXPLICIT** | HTML L135-L138 / L369 | 기존 proficiency 의미가 현재 일본어 수준 축으로 직접 보존되고 세션 난이도와 분리됨. |
| 95 | rc10_public | #learning_mode | 세부 설정 | **PASS-EXPLICIT** | HTML L141 / L367 | Learning mode 축이 직접 보존됨. |
| 96 | rc10_public | #immersion | 세부 설정 | **PASS-EXPLICIT** | HTML L142 / L368 | Immersion 축이 직접 보존됨. |
| 97 | rc10_public | #support_style | 세부 설정 | **PASS-EXPLICIT** | HTML L132 / L365 | Support style 축이 직접 보존됨. |
| 98 | rc10_public | #initiative | 세부 설정 | **PASS-EXPLICIT** | HTML L133 / L366 | Initiative 축이 직접 보존됨. |
| 99 | rc10_public | #private_session | 세부 설정 | **PASS-EXPLICIT** | HTML L149 / L343 | Private Session이 Start의 단일 authority로 직접 표시됨. |
| 100 | rc10_public | 설정 복사 복사 후 ChatGPT를 열어 붙여넣어요 | 처음 사용하시나요? | **PASS-EXPLICIT** | HTML L151 / L343 | 설정/세션 명령 복사 액션이 직접 표시됨. |
| 101 | rc10_public | ChatGPT 열기 열리면 입력창에 붙여넣기 | 처음 사용하시나요? | **PASS-EXPLICIT** | HTML L151 / L343 | ChatGPT 열기 액션이 직접 표시됨. |
| 102 | rc10_public | #fallbackPrompt | 처음 사용하시나요? | **PASS-ROUTE** | HTML L152 | Clipboard 실패 시 selectable textarea/manual copy fallback route가 명시됨. |
| 103 | rc10_public | 텍스트 선택해서 복사하기 | 처음 사용하시나요? | **PASS-ROUTE** | HTML L152 | Clipboard 실패 시 selectable textarea/manual copy fallback route가 명시됨. |
| 104 | rc10_public | 직전 설정 복원 | 처음 사용하시나요? | **PASS-EXPLICIT** | HTML L150 / L343 | 직전 설정 복원 액션이 직접 표시됨. |
| 105 | rc10_public | 내 설정 백업 | 처음 사용하시나요? | **PASS-SUCCESSOR** | HTML L274-L275 / L453-L454 | legacy “내 설정 백업/복원 파일”은 Canonical Recovery와 분리된 Controller Settings Export/Import successor로 명시됨. |
| 106 | rc10_public | #restoreFile | 처음 사용하시나요? | **PASS-SUCCESSOR** | HTML L274-L275 / L453-L454 | legacy “내 설정 백업/복원 파일”은 Canonical Recovery와 분리된 Controller Settings Export/Import successor로 명시됨. |
| 107 | rc10_public | 기본값 | 처음 사용하시나요? | **PASS-EXPLICIT** | HTML L150 / L343 | 기본값 복귀 액션이 직접 표시됨. |
| 108 | h13_overlay | Auto 한국어 日本語 English | 처음 사용하시나요? | **PASS-EXPLICIT** | HTML L76, L289 / L468 | 화면 언어 Auto/KO/JA/EN이 직접 보존됨. |
| 109 | h13_overlay | 새 버전 적용 | 처음 사용하시나요? | **PASS-ROUTE** | HTML L80, L290 / L468 | 업데이트 알림과 명명된 업데이트 secondary route가 보존됨; row는 해당 route로 귀속됨. |
| 110 | h13_overlay | 알겠어요 | 처음 사용하시나요? | **PASS-ROUTE** | HTML L290 / L468 | first-use/초기 안내가 명명된 secondary route로 보존됨. |
| 111 | h13_overlay | 💬 수다 | 빠른 시작 | **PASS-EXPLICIT** | HTML L86 / L307 | 모바일·데스크톱 Quick Start에 동일 기능이 직접 표시됨. |
| 112 | h13_overlay | 📞 전화 | 빠른 시작 | **PASS-EXPLICIT** | HTML L86 / L307 | 모바일·데스크톱 Quick Start에 동일 기능이 직접 표시됨. |
| 113 | h13_overlay | 🎀 데이트 | 빠른 시작 | **PASS-EXPLICIT** | HTML L86 / L307 | 모바일·데스크톱 Quick Start에 동일 기능이 직접 표시됨. |
| 114 | h13_overlay | 🥂 술자리 | 빠른 시작 | **PASS-EXPLICIT** | HTML L86 / L307 | 모바일·데스크톱 Quick Start에 동일 기능이 직접 표시됨. |
| 115 | h13_overlay | 📻 라디오 | 빠른 시작 | **PASS-EXPLICIT** | HTML L86 / L307 | 모바일·데스크톱 Quick Start에 동일 기능이 직접 표시됨. |
| 116 | h13_overlay | 🌙 산책 | 빠른 시작 | **PASS-EXPLICIT** | HTML L86 / L307 | 모바일·데스크톱 Quick Start에 동일 기능이 직접 표시됨. |
| 117 | h13_overlay | 🕰️ 타임슬립 | 빠른 시작 | **PASS-EXPLICIT** | HTML L86 / L307 | 모바일·데스크톱 Quick Start에 동일 기능이 직접 표시됨. |
| 118 | h13_overlay | ✏️ 일본어 공부 | 빠른 시작 | **PASS-EXPLICIT** | HTML L86 / L307 | 모바일·데스크톱 Quick Start에 동일 기능이 직접 표시됨. |
| 119 | h13_overlay | 🎲 랜덤 | 빠른 시작 | **PASS-EXPLICIT** | HTML L86 / L307 | 모바일·데스크톱 Quick Start에 동일 기능이 직접 표시됨. |
| 120 | h13_overlay | #private_session | Persona | **PASS-EXPLICIT** | HTML L149 / L343 | Private Session이 Start의 단일 authority로 직접 표시됨. |
| 121 | h13_overlay | ⭐ 현재 설정 저장 | 즐겨찾기 | **PASS-EXPLICIT** | HTML L87 / L308 | Favorites 카드에 저장 기능이 직접 명시됨. |
| 122 | h13_overlay | 🧠 세션 정리 요청 복사 | 장기 기록 | **PASS-ROUTE** | HTML L273 / L452 | Legacy Continuity/Migration secondary route에 기록·정리요청·이전복원·JSON inspect/preview/apply·Sensitive·삭제가 명시됨. |
| 123 | h13_overlay | ↩︎ 이전 기록 복원 | 장기 기록 | **PASS-ROUTE** | HTML L273 / L452 | Legacy Continuity/Migration secondary route에 기록·정리요청·이전복원·JSON inspect/preview/apply·Sensitive·삭제가 명시됨. |
| 124 | h13_overlay | #continuitySensitive | 민감한 개인 맥락 포함 허용 | **PASS-ROUTE** | HTML L273 / L452 | Legacy Continuity/Migration secondary route에 기록·정리요청·이전복원·JSON inspect/preview/apply·Sensitive·삭제가 명시됨. |
| 125 | h13_overlay | #continuityInput | ChatGPT가 만든 장기 기록 가져오기 | **PASS-ROUTE** | HTML L273 / L452 | Legacy Continuity/Migration secondary route에 기록·정리요청·이전복원·JSON inspect/preview/apply·Sensitive·삭제가 명시됨. |
| 126 | h13_overlay | 1. 검사 | ChatGPT가 만든 장기 기록 가져오기 | **PASS-ROUTE** | HTML L273 / L452 | Legacy Continuity/Migration secondary route에 기록·정리요청·이전복원·JSON inspect/preview/apply·Sensitive·삭제가 명시됨. |
| 127 | h13_overlay | 2. 확인하고 저장 | ChatGPT가 만든 장기 기록 가져오기 | **PASS-ROUTE** | HTML L273 / L452 | Legacy Continuity/Migration secondary route에 기록·정리요청·이전복원·JSON inspect/preview/apply·Sensitive·삭제가 명시됨. |
| 128 | h13_overlay | 장기 기록 삭제 | 장기 기록 | **PASS-ROUTE** | HTML L273 / L452 | Legacy Continuity/Migration secondary route에 기록·정리요청·이전복원·JSON inspect/preview/apply·Sensitive·삭제가 명시됨. |
| 129 | h13_overlay | 이번 업데이트 미루기 | 장기 기억 유지 상태 | **PASS-EXPLICIT** | HTML L168 / L377 | Lifecycle “이번엔 미루기/postpone” 액션이 직접 표시됨. |
| 130 | h13_overlay | 새 채팅 시작함 · 주기 초기화 | 장기 기억 유지 상태 | **PASS-EXPLICIT** | HTML L168 / L377 | Lifecycle 새 채팅 시작 확인 액션이 직접 표시됨. |
| 131 | h13_overlay | 실기기 IndexedDB 진단 열기 | 장기 기억 컨트롤러 | **PASS-EXPLICIT** | HTML L288 / L467 | 실기기 IndexedDB 진단 열기 버튼이 모바일·데스크톱에 직접 존재함. |
| 132 | h13_overlay | 이전 기록 검사 | 장기 기억 컨트롤러 | **PASS-ROUTE** | HTML L168-L170 / L377-L379 | Canonical Memory Controller / handoff + Correction Sandbox의 명명된 secondary flow에 해당 단계가 보존됨. |
| 133 | h13_overlay | 확인하고 장기 기억 활성화 | 장기 기억 컨트롤러 | **PASS-ROUTE** | HTML L168-L170 / L377-L379 | Canonical Memory Controller / handoff + Correction Sandbox의 명명된 secondary flow에 해당 단계가 보존됨. |
| 134 | h13_overlay | 1. 기억 포함 세션 프롬프트 복사 | 장기 기억 컨트롤러 | **PASS-ROUTE** | HTML L168-L170 / L377-L379 | Canonical Memory Controller / handoff + Correction Sandbox의 명명된 secondary flow에 해당 단계가 보존됨. |
| 135 | h13_overlay | 2. 대화 후 기억 정리 요청 복사 | 장기 기억 컨트롤러 | **PASS-ROUTE** | HTML L168-L170 / L377-L379 | Canonical Memory Controller / handoff + Correction Sandbox의 명명된 secondary flow에 해당 단계가 보존됨. |
| 136 | h13_overlay | #memoryTransportText | 장기 기억 컨트롤러 | **PASS-ROUTE** | HTML L168-L170 / L377-L379 | Canonical Memory Controller / handoff + Correction Sandbox의 명명된 secondary flow에 해당 단계가 보존됨. |
| 137 | h13_overlay | #memoryResponseInput | 장기 기억 컨트롤러 | **PASS-ROUTE** | HTML L168-L170 / L377-L379 | Canonical Memory Controller / handoff + Correction Sandbox의 명명된 secondary flow에 해당 단계가 보존됨. |
| 138 | h13_overlay | 응답 검사 | 장기 기억 컨트롤러 | **PASS-ROUTE** | HTML L168-L170 / L377-L379 | Canonical Memory Controller / handoff + Correction Sandbox의 명명된 secondary flow에 해당 단계가 보존됨. |
| 139 | h13_overlay | #memorySensitiveOptIn | 장기 기억 컨트롤러 | **PASS-EXPLICIT** | HTML L170 / L379 | Memory Sensitive opt-in이 다른 Sensitive control과 분리되어 직접 표시됨. |
| 140 | h13_overlay | 4. 확인하고 기억 저장 | 장기 기억 컨트롤러 | **PASS-ROUTE** | HTML L168-L170 / L377-L379 | Canonical Memory Controller / handoff + Correction Sandbox의 명명된 secondary flow에 해당 단계가 보존됨. |
| 141 | h13_overlay | #recoverySensitiveOptIn | 민감 기억 포함 허용 | **PASS-EXPLICIT** | HTML L175 / L384 | Recovery Backup Sensitive opt-in이 직접 표시되고 다른 Sensitive controls와 분리됨. |
| 142 | h13_overlay | Standard Recovery Backup 생성 | 데이터 안전 · Backup / Recovery | **PASS-ROUTE** | HTML L175 / L384 | Standard Recovery Backup이 Data Safety의 명명된 secondary route로 유지됨. |
| 143 | h13_overlay | #canonicalRestoreFile | 데이터 안전 · Backup / Recovery | **PASS-EXPLICIT** | HTML L177-L182 / L386-L390 | Canonical Restore 파일 선택 input이 직접 존재함. |
| 144 | h13_overlay | 확인하고 새 revision으로 Restore | 데이터 안전 · Backup / Recovery | **PASS-EXPLICIT** | HTML L194-L203 / L393-L401 | Preview→명시 승인→staging→새 forward revision→read-back 확정 경로가 직접 명시되어 apply-as-new-revision을 닫음. |
| 145 | h13_overlay | Raw Recovery Export | 복구 도구 Raw Recovery · 후속 보호 기능 | **PASS-ROUTE** | HTML L175 / L384 | Raw Recovery가 Data Safety secondary route로 명시됨. |
| 146 | h13_overlay | Rollback 후보 확인 중 | Forward Rollback | **PASS-EXPLICIT** | HTML L213-L214 / L411 | Rollback target select가 직접 존재하고 revision_id authority가 명시됨. |
| 147 | h13_overlay | Rollback Preview | Forward Rollback | **PASS-EXPLICIT** | HTML L215-L230 / L412-L422 | Rollback 검사/Preview 액션이 직접 존재함. |
| 148 | h13_overlay | 확인하고 새 revision으로 Rollback | Forward Rollback | **PASS-EXPLICIT** | HTML L224-L235 / L414-L422 | 명시 승인 후 과거 payload를 source로 새 forward revision 생성·read-back 확정이 직접 명시됨. |
| 149 | h13_overlay | #purgeOldBackupAck | PURGE | **PASS-ROUTE** | HTML L291 / L469 | PURGE는 분리된 destructive secondary surface에 acknowledgement·Preview·sanitized NEW ROOT 의미가 보존됨. |
| 150 | h13_overlay | PURGE Preview | PURGE | **PASS-ROUTE** | HTML L291 / L469 | PURGE는 분리된 destructive secondary surface에 acknowledgement·Preview·sanitized NEW ROOT 의미가 보존됨. |
| 151 | h13_overlay | 확인하고 sanitized NEW ROOT 생성 | PURGE | **PASS-ROUTE** | HTML L291 / L469 | PURGE는 분리된 destructive secondary surface에 acknowledgement·Preview·sanitized NEW ROOT 의미가 보존됨. |
| 152 | h13_overlay | #replicaTransferFile | Replica Transfer / Conflict | **PASS-ROUTE** | HTML L175 / L384 | Replica Transfer/Conflict가 Data Safety secondary route로 명명되어 Transfer/Merge 진입·적용 기능을 보존함. |
| 153 | h13_overlay | 검증된 Transfer / Merge 적용 | Replica Transfer / Conflict | **PASS-ROUTE** | HTML L175 / L384 | Replica Transfer/Conflict가 Data Safety secondary route로 명명되어 Transfer/Merge 진입·적용 기능을 보존함. |
| 154 | h13_overlay | local 유지 · 저장 안 함 | Replica Transfer / Conflict | **PASS-SUCCESSOR** | HTML L257-L268 / L434-L447 | “Current Local 유지” 분기가 직접 존재함. legacy “저장 안 함”은 현대 conflict provenance를 보존하는 새 forward resolution revision 방식으로 안전하게 successor화됨. |
| 155 | h13_overlay | incoming 선택 · 새 revision 생성 | Replica Transfer / Conflict | **PASS-EXPLICIT** | HTML L257-L268 / L434-L447 | Incoming Replica 선택과 새 forward resolution revision 의미가 직접 명시됨. |
| 156 | h13_overlay | #era | 세부 설정 | **PASS-EXPLICIT** | HTML L126 / L359 | Era 축과 late_teens/year-timeslip 선택지가 직접 보존됨. |
| 157 | h13_overlay | #year_timeslip | 세부 설정 | **PASS-EXPLICIT** | HTML L126 / L359 | 연도 지정 시 조건부 number input이 모바일·데스크톱에 직접 존재함. |
| 158 | h13_overlay | #scene | 세부 설정 | **PASS-EXPLICIT** | HTML L127 / L360 | Scene 축이 직접 보존됨. |
| 159 | h13_overlay | #activity | 세부 설정 | **PASS-EXPLICIT** | HTML L128 / L361 | Activity 축이 직접 보존되며 random-recommend도 별도 항목으로 유지됨. |
| 160 | h13_overlay | #relationship | 세부 설정 | **PASS-EXPLICIT** | HTML L129 / L362 | Relationship 축이 직접 보존됨. |
| 161 | h13_overlay | #state | 세부 설정 | **PASS-EXPLICIT** | HTML L130 / L363 | State 축 및 음주/취기 상태 의미가 직접 보존됨. |
| 162 | h13_overlay | #language_support | 세부 설정 | **PASS-EXPLICIT** | HTML L131 / L364 | 대화 언어/언어 지원 축이 직접 보존됨. |
| 163 | h13_overlay | #proficiency | 세부 설정 | **PASS-EXPLICIT** | HTML L135-L138 / L369 | 기존 proficiency 의미가 현재 일본어 수준 축으로 직접 보존되고 세션 난이도와 분리됨. |
| 164 | h13_overlay | #learning_mode | 세부 설정 | **PASS-EXPLICIT** | HTML L141 / L367 | Learning mode 축이 직접 보존됨. |
| 165 | h13_overlay | #immersion | 세부 설정 | **PASS-EXPLICIT** | HTML L142 / L368 | Immersion 축이 직접 보존됨. |
| 166 | h13_overlay | #support_style | 세부 설정 | **PASS-EXPLICIT** | HTML L132 / L365 | Support style 축이 직접 보존됨. |
| 167 | h13_overlay | #initiative | 세부 설정 | **PASS-EXPLICIT** | HTML L133 / L366 | Initiative 축이 직접 보존됨. |
| 168 | h13_overlay | 설정 복사 복사 후 ChatGPT를 열어 붙여넣어요 | 처음 사용하시나요? | **PASS-EXPLICIT** | HTML L151 / L343 | 설정/세션 명령 복사 액션이 직접 표시됨. |
| 169 | h13_overlay | ChatGPT 열기 열리면 입력창에 붙여넣기 | 처음 사용하시나요? | **PASS-EXPLICIT** | HTML L151 / L343 | ChatGPT 열기 액션이 직접 표시됨. |
| 170 | h13_overlay | #fallbackPrompt | 처음 사용하시나요? | **PASS-ROUTE** | HTML L152 | Clipboard 실패 시 selectable textarea/manual copy fallback route가 명시됨. |
| 171 | h13_overlay | 텍스트 선택해서 복사하기 | 처음 사용하시나요? | **PASS-ROUTE** | HTML L152 | Clipboard 실패 시 selectable textarea/manual copy fallback route가 명시됨. |
| 172 | h13_overlay | 직전 설정 복원 | 처음 사용하시나요? | **PASS-EXPLICIT** | HTML L150 / L343 | 직전 설정 복원 액션이 직접 표시됨. |
| 173 | h13_overlay | 컨트롤러 설정 내보내기 | 처음 사용하시나요? | **PASS-EXPLICIT** | HTML L274-L275 / L453-L454 | H13 Controller Settings Export/Import 기능이 현재 Controller Settings 카드와 Import Safety 경로에 직접 보존됨. |
| 174 | h13_overlay | #restoreFile | 처음 사용하시나요? | **PASS-EXPLICIT** | HTML L274-L275 / L453-L454 | H13 Controller Settings Export/Import 기능이 현재 Controller Settings 카드와 Import Safety 경로에 직접 보존됨. |
| 175 | h13_overlay | 기본값 | 처음 사용하시나요? | **PASS-EXPLICIT** | HTML L150 / L343 | 기본값 복귀 액션이 직접 표시됨. |

## Appendix B — Generated row-by-row CSV

- Companion audit table file: `6_R01F_AUDIT__INOO_FINAL_HISTORICAL_REAUDIT_ROW_BY_ROW_v1_2026-08-21.csv`
