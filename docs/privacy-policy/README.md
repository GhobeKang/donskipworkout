# 개인정보처리방침 및 스토어 제출 보완 안내

작성 기준: 2026-10-16. 운영자: **sayudogu**, 개인정보 문의: **sayudogu@gmail.com**.

`index.html`은 GitHub Pages 게시용 단독 개인정보처리방침 초안이다. `public/legal/privacy.html`은 같은 내용을 앱 안에서 읽기 위한 사본이다. 외부 폰트·추적 스크립트·이미지 없이 열리며, 정책 원본을 수정하면 사본에도 같은 내용을 반영해야 한다.

## 구현한 기능

- **계정 삭제:** 설정 하단에서 현재 비밀번호와 `DELETE` 확인 문구를 입력한다. 서버의 계정·자격 증명·전체 세션, 설정·운동·사진 메타데이터·타이머, 관련 코칭 대화·알림·신고·차단·초대 시도, 챌린지 참가·인증·평가와 과거 성장 리포트 사본에서 해당 사용자의 정보를 제거한다.
- **다른 참가자 보호:** 탈퇴한 방장의 방은 이름·소개·규칙 설명 등 작성 정보를 지우고 방장 공석으로 처리한다. 시작 전 회차는 취소하며 새 초대·대화·다음 회차를 막는다. 다른 참가자의 개인 운동 기록·사진·계정은 보존한다.
- **사진 파일 삭제:** 계정 삭제 트랜잭션에 원본·가공 파일 삭제 작업을 함께 저장한다. API 처리 후 또는 별도 작업자가 파일을 정리한다. 30초마다 최대 25개를 처리하며 최초 시도 후 재시도는 두 번이다. 실패 작업은 남기고 운영자 화면에 표시한다. DB 장애 등 배치 전체 오류가 세 번 연속 발생하면 작업자가 중단되고 로그를 남기므로, 원인을 해결한 뒤 서버를 재시작해야 한다. 사진 저장 경로 밖의 파일은 삭제하지 않는다.
- **기기 정리:** 현재 기기의 계정별 운동 초안·타이머·미전송 작업을 정리하고, 네이티브 위치·예약 알림·푸시 등록·공유 캐시 삭제를 요청한다. 운영체제 호출이 응답하지 않으면 12초 후 로그를 남긴다. 오프라인인 다른 기기의 사본, 운영체제 백업, 이미 공유한 외부 사본 전체를 회수하는 기능은 아니다.
- **외부 삭제 경로:** 정적 빌드 결과의 `delete-account.html`에서 앱 설치나 로그인 세션 없이 계정 이메일·비밀번호·`DELETE`로 삭제한다. 이용 제한된 계정도 이 경로를 사용할 수 있다. 비밀번호를 모르는 경우의 별도 본인 확인·복구 절차는 추가 운영 결정이 필요하다.
- **이용약관:** 가입 전 약관·금지 콘텐츠 정책 동의가 필요하다. 서버에 버전·동의 시각을 저장하고 잘못된 버전을 거부한다. 기존 계정은 챌린지 참여 전에 현재 약관에 동의한다. 개인 기록·계정 삭제를 새 약관 동의로 막지 않는다.
- **신고·차단:** 챌린지 방·참가자, 코칭 질문·답변과 상대 사용자에 신고·차단 진입점을 제공한다. 신고 내용은 운영 권한이 있는 검토자만 볼 수 있다. 차단은 양방향 대화·직접 알림을 서버에서 제한하고, 관련 콘텐츠를 숨기며 대기 중 직접 알림을 취소한다. 설정에서 차단을 해제할 수 있다.
- **운영자 조치:** 설정의 신고 관리에서 미처리·처리 이력, 신고 내용과 사진 삭제 실패 수를 조회한다. 사유를 입력해 콘텐츠 숨김, 콘텐츠 숨김 및 계정 이용 제한, 위반 아님 종결을 수행한다. 제한된 계정의 세션을 철회하고 푸시를 비활성화한다. 운영자 지정 전에는 일반 사용자에게 이 기능을 허용하지 않는다.

## 확인한 데이터와 코드 근거

| 데이터 | 처리 방식·근거 |
| --- | --- |
| 계정·비밀번호·세션 | 이메일·표시 이름·국가·시간대·UUID, 비밀번호 해시, HttpOnly 세션 쿠키. `server/app/database.py`, `schemas.py`, `routes.py`, `security.py` |
| 운동 설정·기록·시간·통계 | 일정, 목표 변경 이력, 종목·부위·세트·중량·반복 수, 메모, 타이머·수정 사유와 파생 리포트. `database.py`, `workouts.py`, `timer_routes.py`, `personal_report.py` |
| 인증 사진 | 기기 크롭 이미지·촬영 시각·시간대 업로드. EXIF·GPS 제거 후 오버레이 전·후 JPEG 모두 API 서버 파일 저장소에 저장. `photo_routes.py`, `photo_processing.py`, `CheckinScreen.jsx` |
| 정확한 위치 | 장소 이름·좌표와 감지 상태는 기기 저장. 자체 API로 좌표·연속 경로를 전송하지 않지만 이탈 종료 시각은 전송. `WorkoutLocationSettings.jsx`, `useWorkoutDeparture.js`, Android·iOS `WorkoutLocationPlugin` |
| 챌린지·코칭·공유 | 참가자에게 표시 이름·참가·출석·평가 표시, 종료 후 방장에게 상세 성장 리포트, 작성자·수신 방장 간 코칭 대화. `challenge_routes.py`, `challenge_report.py`, `coaching_routes.py` |
| 약관·신고·차단 | 동의 버전·시각, 차단 관계, 신고 사유·설명·신고 콘텐츠 사본, 검토·조치 사유와 이력. `community_policy.py`, `community_safety.py`, `safety_routes.py` |
| 푸시·설치 식별자 | 계정과 연결한 설치 UUID·토큰·플랫폼·언어, 알림·발송·오류 이력. Android FCM, iOS APNs. `pushNotifications.js`, `notification_worker.py`, `apns.py` |
| 분석·외부 요청 | Android `firebase-analytics` 의존성이 있고 자동 수집 비활성화 설정이 확인되지 않음. 앱에서 Google Fonts 요청. iOS Podfile에 Analytics SDK 없음. `android/app/build.gradle`, `app/layout.js`, `ios/App/Podfile` |
| 로그·로컬 초안 | IP 기반 메모리 요청 제한, 초대 IP 해시·시도 기록, 요청·오류 로그, 기기의 초안·타이머·공유 캐시. `middleware.py`, `challenge_routes.py`, `WorkoutLogScreen.jsx`, `weeklyShare.js` |

Supabase는 DB 용도이며 Supabase Auth·Storage를 사용하는 구조가 아니다. 사진은 API 서버에 저장한다. 기본 세션 설정과 예시 환경변수는 **400일**이며 인증된 요청 때 만료 시각이 갱신된다. 실제 운영 설정은 별도로 확인해야 한다.

## 배포 순서

1. `supabase/migrations/20261016044732_account_deletion_and_community_safety.sql`을 DB 관리자 권한으로 검토·적용한다. 이번 작업에서는 운영 DB에 적용하지 않았다. 새 테이블은 비공개 `attendance` 스키마에 두고 RLS를 켰으며, 공개 API 역할 권한을 제거하고 백엔드 전용 `attendance_api` 역할에만 권한을 준다.
2. 서버를 새 코드로 배포한다. 운영자 계정을 정하고 서버의 `MODERATOR_USER_UUIDS`에 해당 계정의 변경 불가능한 UUID를 넣는다. 예: `MODERATOR_USER_UUIDS=["실제-운영자-계정-UUID"]`. `/api/v1/me` 또는 비공개 users 테이블에서 UUID를 확인한다. 이메일 소유 확인이 없는 앱이므로 이메일 주소를 운영 권한 판단에 쓰지 않는다. 기본값 `[]`는 운영자 접근을 모두 거부한다.
3. 앱을 빌드하고 Capacitor Android·iOS 번들에 동기화해 배포한다. 가입 API에는 이제 `accepted_policy_version`이 필요하므로 구버전 가입 요청과 호환되지 않는다. 기존 계정 로그인은 유지되며 커뮤니티 참여 시 현재 정책 동의가 필요하다.
4. 외부 계정 삭제 기능을 제공하려면 실제 HTTPS API 주소를 `NEXT_PUBLIC_API_BASE_URL`에 넣어 빌드한 `out/`을 정적 호스팅한다. `delete-account.html`과 함께 `_next/` 등 필요한 정적 파일도 배포한다. 이것은 단일 HTML만 올리는 개인정보처리방침과 다른 배포 단위다. 현재 빌드는 도메인 루트 경로를 기준으로 하므로 GitHub Pages의 `/저장소명/` 하위 경로에 그대로 올리면 정적 파일 경로가 맞지 않는다. 도메인 루트에서 제공하거나 웹 배포용 경로 설정을 조정해 별도 빌드해야 한다. API의 `CORS_ORIGINS`에 실제 웹 출처를 허용하고 보안 쿠키·HTTPS 설정을 확인한다.
5. 실제 외부 삭제 URL을 개인정보처리방침과 Google Play의 계정 삭제 URL 항목에 넣고, 앱을 지운 환경·로그아웃 상태에서 검증한다. 아직 실제 URL이 발급되지 않았으므로 문서에 임의의 주소를 넣지 않았다.
6. 운영자는 신고 큐와 사진 삭제 실패를 지속적으로 확인하고 적절한 조치를 취해야 한다. 기능 구현이 실제 신고 검토 업무를 대신하지 않는다.

## GitHub Pages 개인정보처리방침 게시

1. HTML에서 `[게시 전 확정:`을 검색해 미정 항목을 실제 운영 내용으로 채운다. 시행일·버전과 초안 안내를 확정한다. 복구 불가능한 삭제나 보관기간을 실제 구현·운영보다 과장해 쓰지 않는다.
2. 별도 공개 저장소의 루트에 `index.html`만 올린다. 현재 앱 저장소나 `docs/` 전체를 공개할 필요는 없다. 이 README는 운영·코드 검토 문서여서 공개 방침 본문에 포함하지 않아도 된다.
3. **Settings → Pages → Deploy from a branch → 기본 브랜치 → /(root)**로 설정한다.
4. GitHub가 표시한 실제 HTTPS 주소를 로그인 없이 확인하고 스토어 Privacy Policy URL에 넣는다. 운영자명이 GitHub 계정명과 같다는 사실은 확인하지 않았으므로 주소를 추측하지 않았다.
5. HTML을 수정하면 `public/legal/privacy.html`에도 같은 내용을 반영한 뒤 앱을 다시 빌드한다.

**아직 확정되지 않은 부분:** API·사진 호스팅 업체·계약 법인·국가와 백업 위치, 외부 사업자별 국외 이전 고지, 최대 보관기간·백업 파기·삭제 실패 대응 기한, Android Analytics 유지/제거·동의 및 실제 수집 설정, 이용 연령·필요한 아동 보호 절차, 정책 시행일·변경 공지 방식. 따라서 개인정보처리방침은 여전히 공개 전 검토용 초안이다. 신규 신고·차단 정보도 방침의 처리 항목에 반영했다.

## 검증 결과와 범위

- 임시 SQLite DB에서 외래키 검사를 켠 API 검증 6개 시나리오가 통과했다. 약관 미동의 가입·커뮤니티 차단 및 기존 계정 동의, 신고 대상 접근 제한·일반 사용자의 운영자 접근 거부·콘텐츠 숨김, 양방향 대화 차단·대기 알림 취소·해제, 전체 연관 데이터와 사진 삭제·다른 참가자 데이터 보존·방장 공석, 이용 제한 계정의 외부 삭제, 경로 이탈 파일 보호·삭제 재시도 두 번 제한을 확인했다.
- 별도 로컬 QA 데이터로 가입 동의 전 비활성화, 기존 계정 재동의, 챌린지 신고 접수, 운영자 신고 큐와 조치 선택지, 모바일 삭제 확인 팝업, 외부 삭제 화면과 영어 표시를 확인했다. 영구 삭제 처리 자체는 임시 DB API 검증으로 수행했다.
- `npm run build`, Python Ruff 검사와 모듈 컴파일을 통과했다. API 검증은 `6 passed, 2 warnings`로 끝났으며 경고는 Starlette/httpx와 AnyIO 테스트 도구의 폐기 예정 API에 관한 것이다. 임시 테스트 소스·QA 서버 파일과 해당 Python 캐시를 삭제했다. QA 서버 포트 8876·8877에 실행 중인 서버가 없음을 확인했다.
- 최종 `out/`은 일반 빌드 환경에서 다시 생성했다. 외부 삭제 화면·개인정보처리방침이 포함되고 로컬 QA API 주소가 남지 않았으며, 공개용 방침과 앱 내 방침 사본의 내용이 일치한다. 변경 파일의 공백 오류 검사도 통과했다.
- [모바일 계정 삭제 확인 화면](../assets/account-deletion-qa-2026-10-16.jpg)
- 운영 Supabase에 대한 마이그레이션 실행, 실제 PostgreSQL 권한·동시성 검증, 실기기 네이티브 캐시·위치·알림 해제 검증, GitHub Pages 공개 배포, 백업·외부 분석 사업자의 실제 데이터 삭제 검증은 수행하지 않았다.

## 공식 자료

- [Google Play UGC 정책](https://support.google.com/googleplay/android-developer/answer/9876937?hl=ko)
- [Google Play 신고·차단·약관 요구사항](https://support.google.com/googleplay/android-developer/answer/12923286?hl=ko)
- [Google Play 계정 삭제 요구사항](https://support.google.com/googleplay/android-developer/answer/13327111?hl=ko)
- [Apple 계정 삭제 가이드](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion)
- [Firebase 개인정보 및 자동 수집](https://firebase.google.com/support/privacy)
- [Analytics 데이터 공개 안내](https://support.google.com/analytics/answer/11582702?hl=ko)
- [GitHub Pages 배포 설정](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
