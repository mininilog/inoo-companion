# Inoo Companion — Stage 9 isolated HTTPS device gate

이 폴더만 독립적인 HTTPS 테스트 경로에 업로드합니다.

## 절대 하지 않는 것
- rc9 Stable 파일과 덮어쓰기 금지
- 제품 USER DB 파일/스크립트 추가 금지
- `storage.js`, `user_state.js`, `migration.js`, `controller_ui.js` 등을 이 진단 사이트에 추가 금지
- Service Worker 추가 금지
- 진단 결과가 한 번 PASS했다고 영구 저장 보장으로 해석 금지

## 필요한 서버 조건
- HTTPS
- 정적 파일 그대로 제공
- `index.html`, `device_gate.js`, `device-gate.css`, `manifest.webmanifest`, `icons/`가 같은 테스트 scope에 있어야 함
- 가능하면 테스트 경로/서브도메인은 rc9 Stable과 분리

## iPhone Safari
1. HTTPS 진단 URL을 Safari에서 연다.
2. `진단 실행` → 결과가 `PENDING`이면 같은 Safari 탭에서 새로고침.
3. 다시 `진단 실행` → `Reload persistence: PASS` 여부를 확인.
4. `진단 결과 복사`로 결과를 보관.
5. Safari 공유 메뉴 → `홈 화면에 추가` → `웹 앱으로 열기`를 켜고 추가.
6. 홈 화면 웹 앱에서 다시 1차 실행 → 새로고침/재실행 → 최종 결과 복사.
7. Safari 결과와 홈 화면 웹 앱 결과의 `진단 컨테이너 ID`를 각각 보관.

## Android Chrome
1. HTTPS 진단 URL을 Chrome에서 연다.
2. 1차 실행 → 새로고침 → 2차 실행 후 최종 결과 복사.
3. Chrome 메뉴에서 `앱 설치` 또는 `홈 화면에 추가`를 사용해 설치형 환경을 만든다.
4. 설치형 Web App에서 동일하게 1차 실행 → 재실행 → 최종 결과 복사.
5. Chrome 탭과 설치형 앱의 `진단 컨테이너 ID`를 각각 보관.

## 판정
각 환경의 최종 두 번째 실행에서:
- `결과: PASS`
- IndexedDB open: PASS
- Unicode fidelity: PASS
- Abort atomicity: PASS
- Multi-store commit: PASS
- Concurrent CAS: PASS
- versionchange: PASS
- Reload persistence: PASS
- 제품 USER DB 접근: 없음

이어야 그 **저장 컨테이너에 한해서** Gate PASS 후보입니다.

FAIL/PENDING/UNKNOWN은 숨기지 말고 그대로 결과를 전달합니다.
