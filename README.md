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

API는 루트의 `compose.yaml`로 빌드하고 실행할 수 있습니다. 컨테이너는 Supabase PostgreSQL에
연결하며, 데이터베이스 마이그레이션은 자동으로 실행하지 않습니다.

```powershell
Copy-Item server/.env.example server/.env
# server/.env에 실제 DB 접속 정보와 운영용 CORS_ORIGINS/ALLOWED_HOSTS를 입력
$env:DOCKER_IMAGE_NAME = 'your-docker-id/donskipworkout-api:latest'
docker compose pull attendance_api
docker compose up -d --no-build attendance_api
docker compose ps
docker compose logs -f attendance_api
```

운영용 compose는 Docker Hub에서 이미지를 받아 실행만 합니다. Dockerfile을 사용하는 빌드는
Docker Hub push 스크립트에서 수행합니다.

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
3시간 동안 활동이 없으면 서버에서 만료됩니다. 인증된 요청이 있을 때마다 만료 시간이 연장되며,
localStorage나 sessionStorage에 인증 정보를 저장하지 않고,
로그아웃은 서버의 전체 기기 세션 삭제를 요청합니다.

설정은 '설정 저장'을 눌러 저장하며, 출석 처리 후 최신 데이터를 다시 조회합니다. 운동 세트는 운동 기록 화면에서 날짜를 선택해 따로 입력하고, 유효한 입력은 자동 저장합니다. 연결이 끊기면 사용자·날짜별 임시 초안을 기기에 보관하며, 저장 재시도는 최대 두 번입니다. 사진 인증은 세트와 별도로 언제든 진행할 수 있습니다.
이전 localStorage 데이터는 자동 이관하지 않습니다. API 오류 시 가짜 데이터로 대체하지 않습니다.
요청은 12초 후 취소하고 자동 재시도하지 않습니다. 시간 초과된 쓰기는 서버에서 저장됐을 수
있으므로 조회로 결과를 확인하며, 중복 쓰기 요청을 자동 전송하지 않습니다.
사진 인증은 카메라 프리뷰에서 프레임을 선택·변경한 뒤 촬영하고, 고정 웜 톤과 선택한 프레임을 적용해 서버 검증·저장합니다.
웹과 Android/iOS 모두 앱 내부 카메라 프리뷰를 우선 사용하므로 촬영 중 프레임이 화면에 표시됩니다.
앱 내부 프리뷰를 지원하지 않는 네이티브 환경에서는 Capacitor Camera 7로 촬영한 뒤 프레임을 적용하는 예비 경로를 사용합니다.
사진은 3:4 중앙 크롭 후 900×1200 JPEG로 전송합니다. 업로드 요청은 45초 후 취소하며 자동 재시도하지 않습니다.
권한은 카메라 촬영과 기기 알림에 사용합니다. Android 알림 권한은 `POST_NOTIFICATIONS`를 선언하고,
기기에서 알림 설정을 동의하면 `LocalNotifications.checkPermissions()`와 `requestPermissions()`를 호출합니다.
운동 30분 전, 운동 시간 30분 후 미인증, 미루기 30분 뒤 알림을 기기에 예약합니다. Android 12 이상에서는
배터리 절전 정책에 따라 알림 시각이 약간 늦어질 수 있으며, 정확한 알람 특수 권한은 강제로 요구하지 않습니다.
사진을 기기 갤러리에 저장하지 않으므로 사진 보관함·저장소 권한은 요청하지 않습니다. 마이크·위치·블루투스 권한도 사용하지 않습니다.
서버에는 Supabase 스키마 마이그레이션을 적용하고 `PHOTO_STORAGE_DIR`를 영속 디렉터리로 설정하세요.
개인 운동 알림은 기기 로컬 알림으로 동작합니다. Android는 마지막으로 저장한 요일·시간·시간대·문구를
네이티브 저장소에 보관하고, 매일 다음 30일치 예약을 보충하므로 앱을 다시 열어 예약을 연장할 필요가 없습니다.
예약 보충과 실제 알림 모두 절전 중 실행을 허용하며, 재부팅·앱 업데이트·정확한 알람 권한 허용 후에는
네이티브 수신기가 미래 예약을 복구합니다. 재부팅 전에 만료된 운동 알림은 몰아서 재발송하지 않습니다.
당일 출석·휴식·미루기 결과는 앱이 만든 일회성 예약을 유지하고, 알림 해제·계정 변경·로그아웃 시에는
백그라운드 예약 보충도 중지합니다. 미루기 알림 자체를 정기 반복 규칙으로 저장하지 않습니다.
설정의 알림 디버그 결과에서 `background_renewal`의 마지막 보충 시각·다음 갱신 시각·오류를 확인할 수 있습니다.
이 수정은 Android에 적용되며 iOS는 기존 예약 방식을 유지합니다.

Android에서 분 단위 정확한 시각이 필요하면 기기 설정의 정확한 알람 권한을 허용해야 합니다.
권한이 없으면 절전 허용 비정확 알람으로 예약하므로 지연될 수 있습니다. OS의 앱 강제 중지와 제조사의
백그라운드 차단은 앱 코드가 우회할 수 없으며, 해당 상태에서는 알림을 보장하지 않습니다.
[Android 알람 동작](https://developer.android.com/develop/background-work/services/alarms),
[Capacitor 7 로컬 알림](https://capacitorjs.com/docs/v7/apis/local-notifications)을 기준으로 합니다.

수신 확인은 수정한 Android 앱을 설치하고 한 번 로그인한 뒤 진행합니다. 15초 테스트 알림을 예약해
화면을 끄고 확인하고, 운동 시각 알림은 백그라운드·재부팅·장기 미접속 조건에서 별도로 확인합니다.
웹 빌드만 갱신하면 새 네이티브 수신기가 포함되지 않으므로 `npx cap sync android` 후 Android 앱을 재빌드해야 합니다.

### 알림 문구 운영

알림 제목·본문은 `server/notification-config/catalog.json`에서 관리합니다. 앱 코드에는
문구 목록을 포함하지 않습니다. 인증된 `GET /api/v1/notifications/catalog` 요청마다 서버가
파일을 다시 읽고 검증하며, 앱은 받은 데이터를 알림 예약 함수에 주입합니다.

- `defaults.workout`, `defaults.snooze`, `defaults.missed`: 알림 종류별 기본 `title`과 `body`.
- `messages_by_roast_level.spicy`: 매운맛 본문 목록. 알림마다 한 문구를 무작위로 선택합니다.
  개수는 고정하지 않으며 동일 문구가 연속으로 선택될 수 있습니다.
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

앱 실행, 포그라운드 복귀, 온라인 복구, 설정/출석 갱신 시 최신 목록을 조회하고 알림을 다시 예약합니다.
요청 실패 시 자동 재시도하지 않고 기존 요청 제한 시간(12초)을 적용합니다. 같은 앱 실행 중에는
마지막으로 받은 정상 목록을 사용할 수 있고, 목록을 한 번도 받지 못했다면 기존 기기 예약을 보존합니다.
알림을 끄거나 로그아웃하면 목록 조회 실패와 무관하게 기존 예약을 취소합니다.
파일 누락·잘못된 JSON은 서버에 로그를 남기고 503을 반환하며 다른 설정 API는 계속 동작합니다.

기기에 이미 예약된 문구는 앱이 다시 데이터를 받을 때까지 그대로입니다. 앱을 종료한 기기까지
즉시 변경해야 한다면 별도 서버 푸시 설계가 필요합니다. 이 구조를 처음 도입하는 배포에는
서버 배포와 앱 업데이트가 한 번 필요하며, 이후 문구만 바꿀 때는 JSON만 갱신합니다.

검증: 프로덕션 정적 빌드와 서버 lint/format을 통과시킨 뒤 배포하세요. Supabase
마이그레이션 적용 후 가입→세션 복원→설정 저장→출석→로그아웃 흐름과 15분 만료를 확인해야
합니다. API 오류 시 가짜 데이터로 대체하지 않습니다.

## Capacitor 실행

```bash
npm run cap:sync
npm run cap:open:android
```

`cap:sync`는 Next.js 정적 빌드를 먼저 수행한 뒤 `out/`을 네이티브 프로젝트에 동기화합니다. iOS 빌드에는 macOS와 Xcode가 필요합니다.
