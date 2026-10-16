# 출석체크 Next.js + Capacitor

운동 출석 습관 앱입니다. Next.js App Router로 구성하며, 정적 export 결과물인 `out/`을 Capacitor가 Android/iOS 앱 번들에 포함합니다.

## 웹 실행

```bash
npm install
npm run dev
```

기본 주소는 `http://localhost:3000`입니다.

## 화면 구성

하단 메뉴는 **오늘 · 운동 · 기록**입니다. 설정과 로그아웃은 상단 설정 버튼에서 접근합니다.
오늘 화면은 실제 주간 출석과 현재 운동 상태에 따라 출발·인증·기록 보기 행동을 표시합니다.
주간 출석은 월요일부터 일요일까지이며 월이 바뀌는 주는 두 달의 기록을 함께 조회합니다.
세트 입력은 기존처럼 자동 저장하고, 사진 인증·수동 출석은 별도로 진행합니다.
달력의 저장된 날짜를 누르면 해당 운동 기록을 열 수 있습니다.
기기 화면 모드에 따라 밝은/어두운 테마가 적용됩니다.
교체 전 스타일과 사용하지 않는 장식 파일은 `legacy/ui-before-action-design/`에서 검토할 수 있습니다.

## 운동 장소 이탈과 타이머

Android·iOS 앱의 설정에서 운동 장소를 등록하면, 등록 좌표 반경 150m를 벗어날 때 진행 중인
운동을 자동으로 종료하고 이탈 시각까지의 운동 시간을 저장합니다. 정확한 위치와 항상 허용 권한이 필요합니다.
앱이 열려 있으면 30초 간격으로 위치를 확인하며, GPS 오차 범위까지 반경 밖일 때만 종료합니다.
백그라운드에서는 운영체제의 장소 이탈 이벤트를 받아 기기에 이탈 시각과 타이머 버전을 저장합니다.
운영체제의 위치 감지 특성상 이벤트 전달은 지연될 수 있습니다.

앱 복귀 또는 연결 복구 시 저장한 이탈 시각을 서버에 반영하므로, 복귀할 때까지의 시간을
운동 시간에 더하지 않습니다. 자동 재시도는 최초 요청 이후 2회로 제한하고, 실패한 요청은
기기에 보존합니다. 타이머의 **동기화 다시 시도** 버튼으로 수동 복구할 수 있습니다.
재입장 시 이전 운동을 재개하지 않으며 **운동 시작**으로 새 운동을 시작해야 합니다.
이 기능을 반영하려면 API 서버와 Android·iOS 앱을 함께 업데이트해야 합니다.

## 언어 설정

로그인 화면 또는 **설정 → 언어 / Language**에서 한국어와 English를 선택할 수 있습니다.
변경 즉시 화면, 기본 운동 종목, 안내·오류 메시지와 이후 예약되는 운동 알림에 적용됩니다.
언어는 `donskipworkout.language` 키로 기기에 저장되며, 로그아웃·재실행 후에도 유지됩니다.
사용자가 입력한 이름, 운동 종목, 메모와 이미 저장된 사진은 번역하지 않습니다.
카메라·권한 요청 등 운영체제가 제공하는 화면은 기기의 언어 설정을 따릅니다.
번역 문구는 `app/_lib/translations/en.json`에서 관리합니다. 서버에서 새 표시 문구를 추가할 때에도 이 사전에 번역을 함께 추가하세요.

## 프로덕션 빌드

```bash
npm run build
```

빌드 결과는 `out/`에 생성됩니다.

## 프로젝트 구조

```text
app/                 Next.js App Router와 앱 코드 전체
app/_components/app/ 앱 상태와 화면 조합
app/_components/layout/ 상태바와 하단 내비게이션
app/_components/screens/ 오늘, 인증, 기록, 설정 화면
app/_components/ui/  아이콘, 토스트, 토글 등 공통 UI
app/_lib/            세션 쿠키·시간 제한을 처리하는 API 클라이언트
app/_hooks/          취소 및 오류 처리를 포함한 API 조회 상태
app/_styles/         전역 스타일
public/assets/       화면별 이미지 asset
legacy/vanilla-app/  이전 HTML/CSS/JS 구현 보관본
legacy/frontend-mock/ 이전 mock 데이터와 localStorage 설정 훅 보관본
```

밑줄로 시작하는 폴더는 App Router에서 route로 해석되지 않는 private folder입니다. 앱 구현 파일과 라우팅 파일을 구분하기 위해 사용합니다.

## Python API 서버

Supabase PostgreSQL 기반 FastAPI 서버는 `server/`에 있습니다. 서버 세션 쿠키 인증, 설정 저장, 운동 출석 처리,
화면용 기록/통계 응답을 제공합니다. 설치·마이그레이션·API 계약은
[server/README.md](server/README.md)를 참고하세요.

프론트엔드는 회원가입/로그인 후 API에서 설정·출석·기록·통계를 가져옵니다.
프론트엔드 실행 전에 루트의 환경변수를 설정하세요.

```powershell
Copy-Item .env.example .env.local
# .env.local의 NEXT_PUBLIC_API_BASE_URL을 실제 API 주소로 수정
npm run dev
```

기본 API 주소는 `http://localhost:8000`입니다. 서버의 DB/세션 설정과 SQL 마이그레이션을
먼저 완료해야 합니다. `NEXT_PUBLIC_API_BASE_URL`에는 `/api/v1`을 제외한 origin을 넣습니다.
`NEXT_PUBLIC_` 값은 공개되고 빌드 시 포함되므로 비밀번호·세션 비밀값을 넣지 마세요.
주소 변경 후 개발 서버를 재시작하고 정적 배포/Capacitor 번들은 다시 빌드해야 합니다.
실기기에서는 접근 가능한 HTTPS API 주소를 사용하고, 서버의 CORS_ORIGINS와 ALLOWED_HOSTS도
실제 웹/네이티브 origin 및 API 호스트에 맞게 설정하세요.

### Docker 배포

API는 루트의 `compose.yaml`로 Docker Hub 이미지를 받아 실행합니다. 컨테이너는 Supabase PostgreSQL에
연결하며, 데이터베이스 마이그레이션은 자동으로 실행하지 않습니다.

```powershell
Copy-Item server/.env.example server/.env
# server/.env에 실제 DB 접속 정보, CORS_ORIGINS/ALLOWED_HOSTS, FIREBASE_PROJECT_ID를 입력
$env:DOCKER_IMAGE_NAME = 'your-docker-id/donskipworkout-api:latest'
$env:FIREBASE_SERVICE_ACCOUNT_FILE = 'C:/private/firebase-service-account.json'
docker compose pull attendance_api
docker compose up -d --no-build attendance_api
docker compose ps
docker compose logs -f attendance_api
```

운영용 compose는 Docker Hub에서 이미지를 받아 실행만 합니다. Dockerfile을 사용하는 빌드는
Docker Hub push 스크립트에서 수행합니다.

`compose.yaml` 하나에 Firebase 인증 파일 연결도 포함되어 있습니다. `DOCKER_IMAGE_NAME`과
`FIREBASE_SERVICE_ACCOUNT_FILE`은 위처럼 셸에 설정하거나 프로젝트 루트의 `.env`에 넣습니다.
`FIREBASE_SERVICE_ACCOUNT_FILE`은 Docker가 실행되는 호스트의 서비스 계정 JSON 절대 경로입니다.
Windows 예시는 실제 배포 서버의 경로로 바꾸세요. JSON은 컨테이너 내부의
`/run/secrets/firebase_service_account`로 읽기 전용 연결되며 인증 경로도 자동 설정됩니다.
`FIREBASE_PROJECT_ID`는 `server/.env`에 별도로 설정합니다. JSON 경로가 없으면 Compose가
명확한 오류로 실행을 중단합니다. 설정을 변경한 뒤에는
`docker compose up -d --no-build --force-recreate attendance_api`로 컨테이너를 재생성합니다.

Docker Hub에 API 이미지를 빌드하고 push하려면 Docker Desktop/Engine을 실행한 뒤 아래
스크립트를 사용하세요. Docker Hub 저장소는 미리 생성하고, 인증 정보는 Docker CLI에만 입력합니다.

```powershell
.\scripts\push-docker-image.ps1 `
  -DockerHubRepository your-docker-id/donskipworkout-api `
  -ImageTag latest `
  -Login
```

이미 로그인되어 있으면 `-Login`을 생략할 수 있습니다. 기본 플랫폼은 `linux/amd64`이며
ARM 서버에 배포할 경우 `-Platform linux/arm64`로 변경하세요. 이 스크립트는 현재
`server/Dockerfile`을 빌드하고 동일한 이미지를 로컬 태그와 Docker Hub 태그로 만든 뒤 push합니다.

서버에서 Docker Hub 이미지를 배포할 때는 compose가 사용할 이미지명을 지정한 뒤 빌드 없이
받아 실행합니다.

```powershell
$env:DOCKER_IMAGE_NAME = 'your-docker-id/donskipworkout-api:latest'
$env:FIREBASE_SERVICE_ACCOUNT_FILE = 'C:/private/firebase-service-account.json'
docker compose pull attendance_api
docker compose up -d --no-build attendance_api
```

DB는 deradera Supabase 프로젝트의 전용 `attendance` 스키마를 사용합니다.
`server/.env`의 `SUPABASE_DB_*`에 접속 정보를 설정합니다. IPv4 환경에서는 Dashboard의
Connect → Session pooler(5432) 주소와 `attendance_api.<project-ref>` 사용자명을 사용하세요.
API 계정은 이 앱의 테이블만 읽고 수정하며, 기존 `public` 테이블은 사용하지 않습니다.
새 환경은 `supabase/migrations/*.sql`을 파일명 순서대로 적용하고 전용 계정의 비밀번호를
설정해야 합니다. 세부 절차는 `server/README.md`를 참고하세요.
사진은 `attendance_photo_storage`, 로그는 `attendance_api_logs` Docker 볼륨에 저장됩니다.
이전 MySQL SQL은 `legacy/mysql/database/`에 보관하며 실행 대상에서 제외했습니다.
기존 MySQL 사용자·출석 데이터는 자동 이관하지 않습니다.

외부 reverse proxy에서 HTTPS를 종료하는 경우 compose가 API 포트 `8000`을 호스트의
`127.0.0.1`에만 공개하므로 reverse proxy가 이 주소로 전달하게 하세요. `SESSION_COOKIE_SECURE=true`와 실제 프론트엔드 origin을
`CORS_ORIGINS`, API 호스트를 `ALLOWED_HOSTS`에 설정해야 합니다.

인증은 서버 DB 세션과 HttpOnly 쿠키로 유지합니다. 새로고침 시 `/auth/session`으로 복원하고
기본 유휴 만료는 400일이며 서버의 `SESSION_DAYS`로 설정합니다. 인증된 요청이 있을 때마다 만료 시간이 연장되며,
localStorage나 sessionStorage에 인증 정보를 저장하지 않고,
로그아웃은 서버의 전체 기기 세션 삭제를 요청합니다.

설정은 '설정 저장'을 눌러 저장하며, 출석 처리 후 최신 데이터를 다시 조회합니다. 운동 세트는 운동 기록 화면에서 날짜를 선택해 따로 입력하고, 유효한 입력은 자동 저장합니다. 연결이 끊기면 사용자·날짜별 임시 초안을 기기에 보관하며, 저장 재시도는 최대 두 번입니다. 사진 인증은 세트와 별도로 언제든 진행할 수 있습니다.
이전 localStorage 데이터는 자동 이관하지 않습니다. API 오류 시 가짜 데이터로 대체하지 않습니다.
요청은 12초 후 취소하고 자동 재시도하지 않습니다. 시간 초과된 쓰기는 서버에서 저장됐을 수
있으므로 조회로 결과를 확인하며, 중복 쓰기 요청을 자동 전송하지 않습니다.
사진 인증은 기기 카메라로 촬영한 뒤 세로 9:16으로 중앙 크롭하고 900×1600 JPEG로 전송합니다.
기존 프레임 선택은 제거했으며 고정 웜 톤을 적용하고, 사진 상단에 로고 아이콘과 DON’T SKIP 문구를 나란히 넣습니다.
하단에는 계정 이름, 현지 촬영 날짜·시각, 캐릭터 하나와 당일 저장된 운동 목록(종목명·세트 수)을 작게 표시합니다.
우측 하단 캐릭터는 coach 전용 5종(기존 윙크, 새로 생성한 더블 바이셉스·엄지척·덤벨 컬·승리 포즈) 중 촬영마다 하나를 무작위 선택합니다. 선택값은 미리보기 갱신·언어 변경·메모 변경·저장 시 유지합니다.
운동 목록은 작은 글씨로 전 종목과 전체 이름을 표시하며, 11개 이상이면 두 열로 배치합니다. 긴 이름은 줄바꿈하고 기록이 많으면 글씨를 추가로 줄입니다.
총 중량은 저장된 중량×반복 수의 합계(kg)이며, 주 운동 부위는 분류된 세트 수가 가장 많은 부위입니다. 동률은 함께 표시하고 미분류 기록도 구분합니다.
운동 기록이 없으면 목록·집계는 표시하지 않습니다. 미리보기 이후 중량·반복 수·부위가 바뀌어도 목록 새로고침 후 저장합니다.
촬영 정보는 카메라 결과를 받은 직후 고정하며, 기기의 IANA 시간대로 변환한 시각과 UTC 오프셋을 표시합니다.
미리보기와 서버 저장은 같은 서버 생성 오버레이를 사용합니다. 업로드 요청은 45초 후 취소하며 자동 재시도하지 않습니다.
권한은 카메라 촬영과 기기 알림, 선택한 헬스장 도착 감지에 사용합니다.
Android 알림 권한은 POST_NOTIFICATIONS를 선언하고 Capacitor Push Notifications로 요청합니다.
사진을 기기 갤러리에 저장하지 않으므로 사진 보관함·저장소 권한은 요청하지 않습니다.

개인 운동 시간 알림은 서버가 관리합니다. Android는 FCM, iOS는 APNs로 받습니다.
서버는 저장된 요일·시간·사용자 시간대와 당일 상태를 기준으로 10초마다 작업을 계산합니다.
앱 실행이나 당일 세션 생성 없이 출발 전 운동 30분 전, 미루기 후 예정 시각,
예정 시각 30·60·90분 후의 미인증 재촉, 설정한 자유운동 권유를 발송합니다.
`지금 출발`을 누르면 해당 운동일의 일반 알림을 중단하고 최초 출발 시각부터 3시간 뒤에도
인증이 없을 때만 재촉 푸시를 한 번 보냅니다. 재촉 알림을 꺼 두면 이 알림도 보내지 않습니다.
3시간이 자정을 넘겨도 출발 시각을 기준으로 합니다. 출석·휴식·설정 변경은 발송 직전에 다시 확인합니다.
이미 만료된 작업은 취소하고 운동 알림의 유효기간은 예정 시각부터 10분입니다.
공급자가 수락한 알림은 그 남은 유효기간까지만 전달을 기다립니다.

업데이트한 앱에서 로그인하면 기존 로컬 운동 예약과 Android 예약 보충 작업을 취소한 뒤
서버 운동 알림을 활성화합니다. 정리가 실패하면 전환 완료로 표시하지 않습니다.
구버전 기기는 기본적으로 서버 운동 알림 대상에서 제외하므로 기존 로컬 알림과 중복되지 않습니다.
이 전환에는 서버 배포와 Android/iOS 앱 업데이트가 모두 필요합니다.
supabase/migrations/20261009045020_server_workout_push.sql을 먼저 적용하세요.
종료된 로컬 예약 구현은 legacy/server-push-migration/에서 리뷰할 수 있습니다.
헬스장 도착 감지 알림은 도착 감지 기능에서 계속 처리합니다.

설정 → 서버 푸시 알림에서 서버 작업 상태·기기 등록·최근 발송 결과를 확인합니다.
로그인 후 알림 권한에 동의하면 자동 등록되며 등록 결과가 설정 카드에 반영됩니다.
수동 버튼은 권한 거부·등록 실패 때의 복구용입니다. 발송 상태 확인은 진행 표시·완료 안내·
마지막 확인 시각을 보여주며 서버 설정 누락이나 작업 오류의 원인도 표시합니다.
15초 서버 테스트 알림을 누르고 앱을 내려놓아 실제 서버 발송을 확인할 수 있습니다.
한 계정의 테스트 요청은 1분에 한 번으로 제한합니다.
앱이 장기간 열리지 않아도 서버가 계속 실행 중이면 새 운동 알림을 계산합니다.
인터넷 연결·알림 권한이 필요하며, Android 설정에서 강제 중지한 앱은 다시 열어야 수신을 재개합니다.
정확한 분 단위 도착을 보장하는 기능은 아닙니다.
[FCM Android 수신](https://firebase.google.com/docs/cloud-messaging/android/receive-messages),
[FCM 메시지 수명](https://firebase.google.com/docs/cloud-messaging/customize-messages/setting-message-lifespan)을 참고하세요.

### 알림 문구 운영

알림 제목·본문은 `server/notification-config/catalog.json`에서 관리합니다. 앱 코드에는
문구 목록을 포함하지 않습니다. 인증된 `GET /api/v1/notifications/catalog` 요청마다 서버가
파일을 다시 읽고 검증하며, 서버 작업자도 매 주기 같은 파일을 읽어 발송 본문을 생성합니다.

- defaults.workout, defaults.free_workout, defaults.snooze, defaults.missed: 종류별 기본 제목·본문.
- localized.en: 같은 구조의 영어 목록. 기기 등록 때 저장한 언어를 사용합니다.
- messages_by_roast_level.spicy: 매운맛 본문 목록. 알림 식별자로 문구를 선택해 재시도에도 같은 내용을 보냅니다.
- `off`, `hot` 목록도 추가할 수 있습니다. 해당 목록이 없거나 비어 있으면 종류별 기본 본문을 씁니다.
- 제목·본문의 `{workout_time}`은 해당 운동의 예약 시간으로 치환합니다.
- 제목은 공백 제거 후 1~100자, 본문은 1~500자, 강도별 목록은 최대 100개입니다.
  빈 문구, 잘못된 타입, 알 수 없는 필드는 서버 검증에서 거부합니다.

Docker compose는 호스트의 `server/notification-config/` 디렉터리를 읽기 전용으로 연결합니다.
**운영 서버 호스트의 JSON을 수정하면 앱/서버 이미지 재빌드나 서버 재시작이 필요 없습니다.**
로컬 개발 파일만 수정하면 운영 서버에는 반영되지 않습니다. 다른 경로를 쓰려면 서버 환경변수
`NOTIFICATION_CATALOG_PATH`를 지정하고 해당 디렉터리를 컨테이너에 연결하세요.

수정본을 같은 디렉터리의 임시 파일에 완성하고 검증한 뒤 `catalog.json`으로 원자적으로 교체하세요.
서버 디렉터리에서 다음 명령으로 교체 전 JSON을 검증할 수 있습니다.

```bash
python -c "from pathlib import Path; from app.notification_catalog import notificationCatalog; notificationCatalog.model_validate_json(Path('notification-config/catalog.next.json').read_bytes()); print('valid')"
```

새 문구는 다음 서버 알림 작업 생성부터 반영합니다. 이미 생성한 작업의 문구는 그대로 유지하며,
기기에서 앱을 열어 문구를 다시 받을 필요가 없습니다. 파일 누락·잘못된 JSON은 서버에 로그를 남기고
새 운동 작업 생성을 중단합니다. 정상 파일로 복구하면 다음 주기에 다시 계산합니다.

검증: 서버·앱 모의 시나리오 41개, Next.js 프로덕션 빌드, 서버 Ruff.
FCM validate-only 요청 수락으로 현재 서버 인증·발송 권한을 확인했습니다. 실제 알림 전송과
Android 백그라운드 수신은 배포 후 별도 실기기 검증이 필요합니다.

## Capacitor 실행

```bash
npm run cap:sync
npm run cap:open:android
```

`cap:sync`는 Next.js 정적 빌드를 먼저 수행한 뒤 `out/`을 네이티브 프로젝트에 동기화합니다. iOS 빌드에는 macOS와 Xcode가 필요합니다.
