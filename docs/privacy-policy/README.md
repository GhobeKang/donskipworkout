# 개인정보처리방침 및 스토어 제출 보완 안내

작성 기준: 2026-10-16. 운영자: **sayudogu**, 개인정보 문의: **sayudogu@gmail.com**.

`index.html`은 GitHub Pages 게시용 단독 개인정보처리방침이다. `public/legal/privacy.html`은 같은 내용을 앱 안에서 읽기 위한 사본이다. 외부 폰트·추적 스크립트·이미지 없이 열리며, 정책 원본을 수정하면 사본에도 같은 내용을 반영해야 한다.

## 공개 저장소와 Play Console URL

- 정책 전용 공개 저장소: https://github.com/GhobeKang/donskipworkout-privacy
- 개인정보처리방침 URL: https://ghobekang.github.io/donskipworkout-privacy/
- 계정 삭제 URL: https://ghobekang.github.io/donskipworkout-privacy/#deletion
- 공개 저장소에는 루트의 `index.html` 한 파일만 게시하며, Pages는 `main` 브랜치의 `/(root)`를 사용한다. 앱 코드·환경변수·다른 문서는 게시하지 않는다.
- 계정 삭제 링크는 `sayudogu@gmail.com`으로 이메일을 보내는 안내다. 앱 설치·로그인 없이 가입 이메일과 삭제 범위를 제출하고 운영자가 본인 확인·삭제·결과 안내를 수행한다. 공개 URL 자체가 계정을 자동 삭제하지 않는다.
- 운영자가 확인한 기준: sayudogu / 대한민국 운영, 운영자 관리 백업 최대 90일, 전 연령 대상, 시행일 2026-10-16. Supabase 프로젝트 조회로 DB의 서울 리전(`ap-northeast-2`)을 확인했다.

## 구현한 기능

- **계정 삭제:** 설정 하단에서 현재 비밀번호와 `DELETE` 확인 문구를 입력한다. 서버의 계정·자격 증명·전체 세션, 설정·운동·사진 메타데이터·타이머, 관련 코칭 대화·알림·신고·차단·초대 시도, 챌린지 참가·인증·평가와 과거 성장 리포트 사본에서 해당 사용자의 정보를 제거한다.
- **다른 참가자 보호:** 탈퇴한 방장의 방은 이름·소개·규칙 설명 등 작성 정보를 지우고 방장 공석으로 처리한다. 시작 전 회차는 취소하며 새 초대·대화·다음 회차를 막는다. 다른 참가자의 개인 운동 기록·사진·계정은 보존한다.
- **사진 파일 삭제:** 계정 삭제 트랜잭션에 원본·가공 파일 삭제 작업을 함께 저장한다. API 처리 후 또는 별도 작업자가 파일을 정리한다. 30초마다 최대 25개를 처리하며 최초 시도 후 재시도는 두 번이다. 실패 작업은 남기고 운영자 화면에 표시한다. DB 장애 등 배치 전체 오류가 세 번 연속 발생하면 작업자가 중단되고 로그를 남기므로, 원인을 해결한 뒤 서버를 재시작해야 한다. 사진 저장 경로 밖의 파일은 삭제하지 않는다.
- **기기 정리:** 현재 기기의 계정별 운동 초안·타이머·미전송 작업을 정리하고, 예약 알림·푸시 등록·공유 캐시 삭제를 요청한다. 운영체제 호출이 응답하지 않으면 12초 후 로그를 남긴다. 오프라인인 다른 기기의 사본, 운영체제 백업, 이미 공유한 외부 사본 전체를 회수하는 기능은 아니다.
- **외부 삭제 경로:** 현재 공개 경로는 위 개인정보처리방침의 이메일 삭제 요청 안내다. 별도로 정적 빌드 결과의 `delete-account.html`에는 계정 이메일·비밀번호·`DELETE`를 입력하는 자동 삭제 화면이 구현되어 있다. 이 자동 삭제 화면은 이번 정책 전용 저장소에 배포하지 않았다.
- **이용약관:** 가입 전 약관·금지 콘텐츠 정책 동의가 필요하다. 서버에 버전·동의 시각을 저장하고 잘못된 버전을 거부한다. 기존 계정은 챌린지 참여 전에 현재 약관에 동의한다. 개인 기록·계정 삭제를 새 약관 동의로 막지 않는다.
- **신고·차단:** 챌린지 방·참가자, 코칭 질문·답변과 상대 사용자에 신고·차단 진입점을 제공한다. 신고 내용은 운영 권한이 있는 검토자만 볼 수 있다. 차단은 양방향 대화·직접 알림을 서버에서 제한하고, 관련 콘텐츠를 숨기며 대기 중 직접 알림을 취소한다. 설정에서 차단을 해제할 수 있다.
- **운영자 조치:** 설정의 신고 관리에서 미처리·처리 이력, 신고 내용과 사진 삭제 실패 수를 조회한다. 사유를 입력해 콘텐츠 숨김, 콘텐츠 숨김 및 계정 이용 제한, 위반 아님 종결을 수행한다. 제한된 계정의 세션을 철회하고 푸시를 비활성화한다. 운영자 지정 전에는 일반 사용자에게 이 기능을 허용하지 않는다.

## 확인한 데이터와 코드 근거

| 데이터 | 처리 방식·근거 |
| --- | --- |
| 계정·비밀번호·세션 | 이메일·표시 이름·국가·시간대·UUID, 비밀번호 해시, HttpOnly 세션 쿠키. `server/app/database.py`, `schemas.py`, `routes.py`, `security.py` |
| 운동 설정·기록·시간·통계 | 일정, 목표 변경 이력, 종목·부위·세트·중량·반복 수, 메모, 타이머·수정 사유와 파생 리포트. `database.py`, `workouts.py`, `timer_routes.py`, `personal_report.py` |
| 인증 사진 | 기기 크롭 이미지·촬영 시각·시간대 업로드. EXIF·GPS 제거 후 오버레이 전·후 JPEG 모두 API 서버 파일 저장소에 저장. `photo_routes.py`, `photo_processing.py`, `CheckinScreen.jsx` |
| 위치 자동화 제거 | 2026-10-17 버전에서 도착 알림·위치 이탈 자동 종료·위치 권한 요청을 제거. 업데이트 실행 시 기존 기기 장소 상태·알림을 정리. 수동 타이머와 서버 기록 유지. `MainActivity.java`, `AppDelegate.swift`, `WorkoutTimer.jsx` |
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
4. 자동 삭제 웹 화면까지 추가 제공하려는 경우에만 실제 HTTPS API 주소를 `NEXT_PUBLIC_API_BASE_URL`에 넣어 빌드한 `out/`을 별도 정적 호스팅한다. `delete-account.html`과 함께 `_next/` 등 필요한 정적 파일도 배포한다. 현재 공개된 이메일 요청 경로에는 이 작업이 필요하지 않다. 자동 삭제 화면을 배포한다면 도메인 루트 경로·API의 `CORS_ORIGINS`·보안 쿠키·HTTPS 설정을 함께 확인한다.
5. Google Play의 계정 삭제 URL 항목에는 위 `#deletion` 주소를 넣는다. 이메일 요청을 실제로 접수·확인·처리하고 결과를 회신해야 한다.
6. 운영자는 신고 큐와 사진 삭제 실패를 지속적으로 확인하고 적절한 조치를 취해야 한다. 기능 구현이 실제 신고 검토 업무를 대신하지 않는다.

## GitHub Pages 개인정보처리방침 게시

1. 운영 내용이 바뀌면 `index.html`의 해당 항목·시행일·버전을 수정한다. 실제 운영하지 않는 삭제 절차나 보관기간을 약속하지 않는다.
2. 정책 전용 공개 저장소 루트의 `index.html`을 갱신한다. 현재 앱 저장소나 `docs/` 전체를 공개하지 않는다. 이 README도 게시 대상이 아니다.
3. Pages 설정은 **Deploy from a branch → main → /(root)**를 유지한다.
4. Pages 배포가 완료되면 공개 URL과 `#deletion` 이동, 이메일 링크를 확인한다.
5. `public/legal/privacy.html`에도 같은 내용을 반영한 뒤 다음 앱 빌드에 포함한다. 이번 문서 배포에서는 앱 번들을 새로 빌드·배포하지 않았다.

**남은 운영 과제:** 전 연령을 대상으로 하지만 현재 앱에는 만 14세 미만 아동의 연령 확인·법정대리인 동의 기능이 없다. 방침에 이 사실을 명시했으며 방침 게시가 해당 기능을 대신하지 않는다. Android Analytics에는 앱 내 수집 전환·동의 제어가 없으므로 출시 대상 연령에 맞는 SDK 설정과 외부 사업자별 처리·삭제·국외 이전 요건을 별도로 확인해야 한다. 운영자 관리 백업 90일 만료와 이메일 삭제 요청도 실제 운영에서 이행해야 한다.

## 검증 결과와 범위

- 2026-10-16 정책 전용 공개 저장소를 만들고 `index.html`만 커밋했다. 공개 커밋은 `4da8fed6dafb5ee59a3d0297bb4c41ead2762d2f`이며 Pages 작업 `38856560354`가 `completed / success`로 끝났다.
- 실제 공개 페이지의 한글 표시, `#deletion` 이동(대상 영역이 화면 상단 24px에 표시), 이메일 수신 주소·제목, 12개 본문 항목을 브라우저에서 확인했다. HTML의 중복 ID·깨진 내부 링크·미정 게시 문구·외부 스크립트 및 자산이 없고 앱 내 사본과 일치함을 검사했다. 별도 테스트 파일은 만들지 않았다.
- 셸에서 공개 URL을 추가 조회하는 검증은 네트워크 소켓 권한 제한으로 실패했다. 재시도하지 않았으며 위 브라우저의 실제 공개 페이지 검증과 Pages 성공 결과를 사용했다. 문서 미리보기용 로컬 서버는 종료했다.
- 임시 SQLite DB에서 외래키 검사를 켠 API 검증 6개 시나리오가 통과했다. 약관 미동의 가입·커뮤니티 차단 및 기존 계정 동의, 신고 대상 접근 제한·일반 사용자의 운영자 접근 거부·콘텐츠 숨김, 양방향 대화 차단·대기 알림 취소·해제, 전체 연관 데이터와 사진 삭제·다른 참가자 데이터 보존·방장 공석, 이용 제한 계정의 외부 삭제, 경로 이탈 파일 보호·삭제 재시도 두 번 제한을 확인했다.
- 별도 로컬 QA 데이터로 가입 동의 전 비활성화, 기존 계정 재동의, 챌린지 신고 접수, 운영자 신고 큐와 조치 선택지, 모바일 삭제 확인 팝업, 외부 삭제 화면과 영어 표시를 확인했다. 영구 삭제 처리 자체는 임시 DB API 검증으로 수행했다.
- `npm run build`, Python Ruff 검사와 모듈 컴파일을 통과했다. API 검증은 `6 passed, 2 warnings`로 끝났으며 경고는 Starlette/httpx와 AnyIO 테스트 도구의 폐기 예정 API에 관한 것이다. 임시 테스트 소스·QA 서버 파일과 해당 Python 캐시를 삭제했다. QA 서버 포트 8876·8877에 실행 중인 서버가 없음을 확인했다.
- 이전 기능 검증 당시 `out/`은 일반 빌드 환경에서 다시 생성했다. 외부 삭제 화면·개인정보처리방침이 포함되고 로컬 QA API 주소가 남지 않음을 확인했다. 이번 정책 게시에서 수정한 앱 내 방침 사본은 다음 앱 빌드에 반영해야 한다. 변경 파일의 공백 오류 검사는 통과했다.
- [모바일 계정 삭제 확인 화면](../assets/account-deletion-qa-2026-10-16.jpg)
- 운영 Supabase에 대한 마이그레이션 실행, 실제 PostgreSQL 권한·동시성 검증, 실기기 네이티브 캐시·위치·알림 해제 검증, 백업·외부 분석 사업자의 실제 데이터 삭제 검증은 수행하지 않았다.

## 공식 자료

- [Google Play UGC 정책](https://support.google.com/googleplay/android-developer/answer/9876937?hl=ko)
- [Google Play 신고·차단·약관 요구사항](https://support.google.com/googleplay/android-developer/answer/12923286?hl=ko)
- [Google Play 계정 삭제 요구사항](https://support.google.com/googleplay/android-developer/answer/13327111?hl=ko)
- [Apple 계정 삭제 가이드](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion)
- [Firebase 개인정보 및 자동 수집](https://firebase.google.com/support/privacy)
- [Analytics 데이터 공개 안내](https://support.google.com/analytics/answer/11582702?hl=ko)
- [GitHub Pages 배포 설정](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## 2026-10-17 위치 자동화 제거

- 앱 내 방침과 게시용 `index.html`을 문서 버전 1.1로 함께 갱신했다. 도착 알림·위치 자동 종료·기기 위치 권한 요청을 제거한 동작을 반영했다. IP 기반 Android 분석 안내는 유지했다.
- 공개 정책 저장소의 `index.html`을 커밋 `18cc8194df2f2901364adc8d300ea9fc947a7906`으로 갱신했다. GitHub 연결 앱의 쓰기 권한 오류(403)가 있어 기존 GitHub 브라우저 로그인으로 커밋했으며, 앱 소스·환경변수·다른 문서는 공개하지 않았다.
- Pages 배포 작업 `38995201750`이 `completed / success`로 끝났다. 공개 URL이 HTTP 200이며 실제 응답 HTML이 앱 내·게시용 방침 1.1과 바이트 단위로 일치함을 확인했다. SHA-256: `d5529a01af2f91302aead67cb11c9e15a4bd36c9d494352e188ed1c6998daea0`.
- versionCode 4의 서명 AAB를 새로 빌드했다. Play Console 업로드·위치 권한·데이터 보안 응답·활성 출시 트랙 변경은 수행하지 않았다.
