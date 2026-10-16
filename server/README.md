# 운동 출석 API

Python 3.12+, FastAPI, SQLAlchemy 2, Supabase PostgreSQL 17 기반 서버입니다.
기존 FastAPI API와 HttpOnly 쿠키 세션 인증을 유지하며, 데이터는 전용 `attendance` 스키마에 저장합니다.
Supabase Auth/Storage로 인증이나 사진 파일 저장을 변경하는 작업은 포함하지 않습니다.

## 실행

프로젝트 루트에서 PowerShell로 실행합니다.

```powershell
python -m venv server/.venv
server/.venv/Scripts/python.exe -m pip install -r server/requirements.txt
Set-Location server
Copy-Item .env.example .env
```

## Docker 배포

프로젝트 루트의 `compose.yaml`은 API 이미지를 실행합니다. DB는 Supabase PostgreSQL을
사용하고, 새 프로젝트의 마이그레이션은 컨테이너 시작 전에 별도로 적용하세요.

```powershell
# 프로젝트 루트에서 실행
Copy-Item server/.env.example server/.env
# server/.env에 운영 DB, CORS_ORIGINS, ALLOWED_HOSTS, FIREBASE_PROJECT_ID를 입력
$env:DOCKER_IMAGE_NAME = 'your-docker-id/donskipworkout-api:latest'
$env:FIREBASE_SERVICE_ACCOUNT_FILE = 'C:/private/firebase-service-account.json'
docker compose pull attendance_api
docker compose up -d --no-build attendance_api
docker compose ps
docker compose logs -f attendance_api
```

운영용 `compose.yaml`은 Dockerfile을 사용하지 않고 Docker Hub에서 이미지를 받아 실행합니다.
Dockerfile 빌드는 프로젝트 루트의 Docker Hub push 스크립트에서만 수행합니다.

기본 `compose.yaml`에 Firebase 서비스 계정 JSON 연결도 포함되어 있습니다.
`DOCKER_IMAGE_NAME`과 `FIREBASE_SERVICE_ACCOUNT_FILE`은 셸 또는 프로젝트 루트 `.env`에
설정합니다. JSON 경로는 Docker 호스트의 절대 경로이며 위 Windows 예시를 실제 서버의
경로로 바꾸세요. `FIREBASE_PROJECT_ID`는 `server/.env`에 설정합니다.
JSON 경로가 없으면 Compose가 실행을 중단합니다. 파일은 이미지에 복사하지 않고
컨테이너 내부 `/run/secrets/firebase_service_account`로 읽기 전용 연결합니다.

## Docker Hub push

Docker Hub 저장소를 만든 뒤 프로젝트 루트에서 아래 스크립트를 실행합니다. Docker CLI의
로그인 정보만 사용하며 비밀번호를 스크립트 인자로 받지 않습니다.

```powershell
.\scripts\push-docker-image.ps1 `
  -DockerHubRepository your-docker-id/donskipworkout-api `
  -ImageTag latest `
  -Login
```

이미 로그인되어 있으면 `-Login`을 생략합니다. 기본 빌드 플랫폼은 `linux/amd64`이고,
ARM 서버용 이미지는 `-Platform linux/arm64`를 사용합니다. push된 이미지는 서버에서
`docker pull your-docker-id/donskipworkout-api:latest`로 받을 수 있습니다.

compose로 push된 이미지를 실행할 때는 이미지명을 지정한 뒤 빌드 없이 배포합니다.

```powershell
$env:DOCKER_IMAGE_NAME = 'your-docker-id/donskipworkout-api:latest'
$env:FIREBASE_SERVICE_ACCOUNT_FILE = 'C:/private/firebase-service-account.json'
docker compose pull attendance_api
docker compose up -d --no-build attendance_api
```

IPv4 환경에서는 Supabase Dashboard → Connect → **Session pooler(5432)** 연결을 사용합니다.
Direct connection은 IPv6가 필요합니다. Transaction pooler(6543)는 현재 설정에서 지원하지 않습니다.

사진 파일은 `attendance_photo_storage` 볼륨, 파일 로그는 `attendance_api_logs` 볼륨에
보존됩니다. 컨테이너는 비루트 사용자와 읽기 전용 루트 파일시스템으로 실행되며, 로그와
사진 디렉터리만 쓸 수 있습니다. Docker 이미지에는 고정 인증사진 캐릭터와 한글 글꼴을 포함하고,
`.env`, 로그, 사용자 사진, 가상환경은 넣지 않습니다.

운영 시에는 다음 순서로 진행합니다.

1. 새 프로젝트는 DB 관리자 계정으로 `supabase/migrations/*.sql`을 파일명 순서대로 적용합니다.
2. `server/.env`에 실제 DB 접속 정보, 운영용 `CORS_ORIGINS`, `ALLOWED_HOSTS`, `FIREBASE_PROJECT_ID`를 입력합니다.
3. 프로젝트 루트 `.env` 또는 셸에 `DOCKER_IMAGE_NAME`과 `FIREBASE_SERVICE_ACCOUNT_FILE`을 설정하고
   `docker compose pull attendance_api`를 실행합니다.
4. `docker compose up -d --no-build attendance_api`로 실행하고 `docker compose ps`에서 `healthy` 상태를 확인합니다.

마이그레이션은 데이터 변경을 일으키므로 Docker 시작 명령에 포함하지 않았습니다. compose는
API 포트 `8000`을 호스트의 `127.0.0.1`에만 공개하므로 HTTPS reverse proxy가 이 주소로
전달하게 하세요. API 컨테이너를 다른 Docker 컨테이너의 reverse proxy에서 호출한다면
`ports` 대신 같은 Docker network를 사용하도록 compose를 조정해야 합니다.

## Supabase 연결 및 스키마

선택형 종목 세부분류를 사용하려면 API 배포 전에
`20261013054943_add_exercise_target_subarea.sql`을 적용합니다.
`POST /api/v1/exercises`와 `PUT /api/v1/exercises/custom/{exercise_id}`는
선택 필드 `target_subarea`를 받습니다. 생략·빈 문자열·`null`이면 기본 부위로 분류하며,
기본 부위에 속하지 않는 세부분류는 422로 거부합니다.
선택 목록은 프론트엔드와 API가 `server/app/exercise_target_areas.json`을 함께 사용합니다.
공통 종목에도 세부분류를 사용하려면 API 배포 전에
`20261014022929_add_shared_exercise_target_subarea.sql`을 적용합니다.
이 마이그레이션은 `attendance.shared_exercise_items.target_subarea`를 추가하고,
현재 공통 종목 31개의 이름과 기본 부위를 기준으로 세부분류를 채웁니다.
`GET /api/v1/exercises`는 개인·공통 종목 모두 `target_subarea`를 반환합니다.
기본 자세의 대표 세부 부위 하나를 지정한 분류이며, 해당 근육만 사용한다는 뜻은 아닙니다.
일반 컬은 `상완이두근`, 딥스·푸시다운은 `상완삼두근`으로 분류합니다.
이름에 그립·팔 각도 정보가 없으므로 특정 장두·단두로 단정하지 않습니다.
벤치프레스·플라이는 `대흉근`, 인클라인 벤치프레스는 `윗가슴`,
데드리프트는 `척추기립근`, 나머지 등 종목은 `광배근`을 대표 부위로 사용합니다.
어깨는 프레스 `전면 삼각근`, 사이드 레이즈 `측면 삼각근`, 리어 플라이 `후면 삼각근`,
허벅지는 레그 컬·루마니안 데드리프트 `햄스트링`, 나머지 종목 `대퇴사두근`,
복근은 크런치 `상복부`·플랭크 `복횡근`, 카프 레이즈는 `비복근`으로 분류합니다.
개인 주간·월간 리포트, 공유 리포트, 부위별 성장 추이는 세부분류가 있으면
`가슴 · 윗가슴`처럼 집계하고, 없으면 기존 기본 부위로 집계합니다.
종목의 분류를 수정하면 기존 기록도 현재 분류로 다시 집계됩니다.

`20261014023434_add_shared_exercises_and_transfer_duplicates.sql`은 공통 종목 12개와
대표 세부 부위를 추가하고, 이름·명시된 별칭이 일치하는 개인 종목을 공통 종목으로 통합합니다.
`브이 스쿼트 머신`은 `브이 스쿼트`로 통합하며 공백·하이픈·일부 표기 차이도 처리합니다.
`인클라인 프레스`와 기존 `인클라인 벤치프레스`, 시티드 레그 컬과 일반 레그 컬은
별도 종목으로 유지합니다. 사용자별 최근 세트는 통합 후 가장 최근 기록에서 복원하고,
기록이 없으면 기존 공통 종목 캐시나 최근 개인 종목 캐시를 보존합니다.
운동 세트의 공통 종목 연결을 먼저 변경한 뒤 개인 종목을 삭제합니다.
전체 작업은 한 트랜잭션에서 실행하며 세트 ID·운동일·중량·반복 수·순서와
관련 없는 종목의 보존 검증에 실패하면 전체 작업을 취소합니다.

현재 대상은 deradera (`vtqhjpyqwhcwpeuagmne`)입니다. 앱은 `public.users`나 Supabase `auth.users`를
사용하지 않고, `attendance` 스키마의 전용 테이블을 사용합니다. 기존 프로젝트 테이블과 사용자 데이터는
변경하지 않습니다. 기존 MySQL 데이터 이관은 별도 작업입니다.
현재 로컬 설정은 `aws-1-ap-northeast-2.pooler.supabase.com:5432`의 Session pooler를 사용합니다.

`server/.env`에서 아래 값을 설정합니다. `SUPABASE_DB_PASSWORD`는 전용 DB 계정의 비밀번호
원문이며, publishable/anon/service_role API 키가 아닙니다. 비밀번호에 `#` 등이 있으면 dotenv 문법에
맞춰 따옴표로 감싸세요. 서버가 URL 예약 문자를 안전하게 인코딩합니다.

| 변수 | 값 |
| --- | --- |
| `SUPABASE_DB_HOST` | Connect에 표시된 Direct 또는 Session pooler 호스트 |
| `SUPABASE_DB_PORT` | `5432` |
| `SUPABASE_DB_NAME` | `postgres` |
| `SUPABASE_DB_USER` | Direct: `attendance_api`, Session pooler: `attendance_api.<project-ref>` |
| `SUPABASE_DB_PASSWORD` | 전용 계정의 비밀번호 |
| `SUPABASE_DB_SSLMODE` | 기본 `require`; 인증서 검증 시 `verify-full` |

대안으로 `SUPABASE_DB_HOST/USER/PASSWORD`를 제거하고 `SUPABASE_DATABASE_URL`을 설정할 수 있습니다.
URL 비밀번호는 URL 인코딩해야 합니다. `postgres://`, `postgresql://`, `postgresql+psycopg://`를
지원하며 드라이버는 psycopg 3으로 통일합니다. URL 옵션은 `sslmode`와 `sslrootcert`만 허용합니다.
`verify-full`은 Supabase CA 인증서 경로를 `sslrootcert`로 지정하거나 libpq 신뢰 저장소에 설치하세요.
기존 `DATABASE_*` 설정으로 MySQL에 연결하는 경로는 제거했습니다. 프론트엔드에는 DB 키를 넣지 않습니다.

새 프로젝트에 설치할 때는 Supabase SQL Editor에서 `supabase/migrations/*.sql`을 파일명 순서대로
각각 한 번 실행합니다. 이미 적용한 파일은 다시 실행하지 않습니다. 첫 마이그레이션은 전용 스키마와
`attendance_api` 역할을 만들고, 역할은 처음에는 `NOLOGIN`입니다. 관리자 연결에서 아래 명령으로
별도의 강력한 비밀번호를 설정한 뒤 같은 값을 서버 `.env`에만 저장하세요. 실제 비밀번호가 든 SQL을
소스나 마이그레이션 파일에 저장하지 마세요.

```sql
ALTER ROLE attendance_api LOGIN PASSWORD 'REPLACE_WITH_A_NEW_RANDOM_PASSWORD';
```

API 계정은 전용 스키마의 CRUD/시퀀스 사용 권한만 가지며 테이블 생성·삭제나 RLS 우회 권한은 없습니다.
모든 테이블에 RLS를 활성화하고 신뢰된 `attendance_api` 역할에만 접근 정책을 부여했습니다.
사용자별 소유권은 기존 FastAPI 세션 인증과 조회 조건으로 검증합니다. `anon`/`authenticated`에는
접근을 허용하지 않으며, `attendance`를 Data API exposed schemas에 추가하지 마세요.

연결은 TLS, UTC, READ COMMITTED를 사용합니다. 연결 제한 5초, 쿼리 제한 10초, 잠금 대기 5초,
유휴 트랜잭션 제한 15초를 적용하며 자동 재시도하지 않습니다. 기존 MySQL SQL 파일은
`legacy/mysql/database/`에서 리뷰할 수 있습니다.

```powershell
# server 디렉터리에서 실행. 기본 바인딩은 로컬 전용입니다.
.venv/Scripts/python.exe -m uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8000 --workers 1 --no-access-log --no-proxy-headers --limit-concurrency 50 --timeout-keep-alive 5
```

`.env`에서 `DOCS_ENABLED=true`로 설정하면 `/docs`에서 OpenAPI를 확인할 수 있습니다.
`GET /health`는 프로세스 생존 확인용이며 DB 연결 성공 여부를 뜻하지 않습니다.

DB 연결은 서버를 실행하기 전에 다음 스크립트로 확인할 수 있습니다. 비밀번호와 전체 연결 문자열은 출력하지 않습니다.

```powershell
# server 디렉터리에서 실행
.venv/Scripts/python.exe scripts/check_database_connection.py
```

## 비공개 운동 문의

`20261001014411_private_coaching_questions.sql`을 API 배포 전에 적용합니다.
챌린지 상세의 운동 상담에서 참가자는 자세·자극·지도·기타 요청을 작성하고,
방장은 받은 질문에 답변하며 작성자는 같은 대화에 추가 질문을 남길 수 있습니다.
목록은 20개, 대화는 최근 50개 답변부터 조회하며 이전 내역을 더 불러올 수 있습니다.

`/api/v1/challenge-rounds/{round_uuid}/questions` 및 상세·답변 API는 기존 쿠키 세션을
사용합니다. 서버가 작성자와 수신 방장을 결정하며, 클라이언트가 보낸 작성자 ID는 받지 않습니다.
같은 방의 다른 참가자, 다른 방의 방장, 비회원에게는 상세·답변 요청이 404로 응답합니다.
DB는 기존 전용 `attendance_api` 역할만 허용하고 `anon`/`authenticated`의 직접 접근을 차단합니다.
방장 변경 시 새 방장에게 과거 비공개 문의를 인계하지 않으며 작성자는 과거 문의를 읽기만 할 수 있습니다.
탈퇴·제외 참가자는 본인 내역을 조회할 수 있지만 새 메시지는 보낼 수 없습니다.
전송 요청 UUID로 동일 요청의 중복 저장을 방지합니다. 본문을 공용 알림·푸시·로그에 넣지 않습니다.
새 문의/답변은 상담 화면의 새로고침 또는 재진입으로 확인합니다.

## Android FCM 및 iPhone APNs 연결

FCM은 AWS ARN이 아니라 Firebase 프로젝트 ID와 신뢰된 서버 자격 증명(ADC 또는 서비스 계정)으로 인증합니다.
서버는 Android의 `fcm` 토큰을 FCM HTTP v1으로, iPhone의 `apns` 토큰을 APNs HTTP/2로 전송합니다.
알림 outbox는 API와 같은 트랜잭션으로 쌓이며, FCM 또는 APNs 자격 증명이 설정된 경우 백그라운드 작업자가
10초 간격으로 최대 25건씩 처리합니다. 공급자가 수락한 상태는 기기 표시/열람 완료를 뜻하지 않습니다.

1. Firebase Console에서 Android 앱의 `google-services.json`을 내려받아 `android/app/google-services.json`에 둡니다.
   Gradle은 파일이 있을 때만 Google Services 플러그인을 적용합니다.
2. 서버가 실행되는 Firebase 프로젝트에서 Cloud Messaging API를 활성화하고, 서버 서비스 계정에 FCM 발송 권한을 부여합니다.
   Firebase Admin SDK 문서는 `Firebase Cloud Messaging API Admin` 역할을 안내합니다.
3. 로컬 개발 환경에서는 `server/.env`에 `FIREBASE_PROJECT_ID`를 설정하고,
   `GOOGLE_APPLICATION_CREDENTIALS`를 서비스 계정 JSON 파일의 절대 경로로 지정합니다.
   Docker에서는 프로젝트 루트 `.env` 또는 셸에 `FIREBASE_SERVICE_ACCOUNT_FILE`을 설정합니다.
   값은 배포 호스트에 실제로 존재하는 서비스 계정 JSON의 절대 경로입니다.
   기본 `compose.yaml`이 파일을 `/run/secrets/firebase_service_account`로 읽기 전용 연결하고
   `GOOGLE_APPLICATION_CREDENTIALS`도 해당 컨테이너 내부 경로로 설정합니다.
   `FIREBASE_PROJECT_ID`는 Docker에서도 `server/.env`에 설정해야 합니다.

   ~~~bash
   docker compose up -d --no-build --force-recreate attendance_api
   ~~~

   이전 분리 설정은 `legacy/server-push-migration/compose.push.yaml`에서 리뷰할 수 있습니다.

   인증 파일은 Docker 이미지나 Git에 포함하지 않습니다. 로컬 Windows 경로를 컨테이너에 그대로 넘기지 않습니다.
4. Docker 환경에서 설정을 변경하면 위 명령으로 컨테이너를 재생성합니다. FCM 초기화에 실패하면
   API는 계속 실행되지만 FCM 작업자는 초기화되지 않으므로,
   FCM outbox가 전송되지 않습니다. FCM이 `provider_accepted`를 반환하면 전송 수락으로 기록되고,
   미등록 토큰은 기기 등록을 비활성화합니다. 서버 작업은 최초 실행을 포함해 최대 3회 시도합니다.
   Firebase SDK의 내부 통신 재시도는 이 작업 횟수와 별도입니다.

서비스 계정 키는 `.gitignore` 대상이며, 유출되었다면 Firebase/Google Cloud Console에서 즉시 폐기하세요.
APNs만 설정해도 동일한 작업자가 실행됩니다. Apple Developer 계정에서 Push Notifications를 앱 ID에 활성화하고,
APNs 인증 키(`.p8`), Key ID, Team ID를 준비합니다. `server/.env`에 `APNS_KEY_ID`, `APNS_TEAM_ID`,
`APNS_AUTH_KEY_PATH`, `APNS_TOPIC=com.donskip.attendancecheck`를 함께 설정합니다. 개발용 Xcode 빌드는
`APNS_ENVIRONMENT=sandbox`, TestFlight/App Store 빌드는 `production`을 사용합니다. 키는 저장소나
Docker 이미지에 넣지 말고 서버 비밀 파일로 마운트합니다. iOS 앱은 Push Notifications capability가 포함된
프로비저닝 프로필로 서명하고 실기기에서 권한, 토큰 등록, 로그아웃 후 수신을 확인해야 합니다.

로그아웃은 세션만 종료하며 등록한 서버 푸시는 유지됩니다.
같은 설치에서 다른 계정으로 로그인하면 기존 계정의 등록을 해제하고 현재 계정으로 변경합니다.
발송 직전에도 기기 소유자를 확인해 이전 계정의 대기 알림을 취소합니다.
기기 알림 권한을 끄거나 앱을 삭제하면 OS가 표시를 중단할 수 있습니다.

### 서버 운동 시간 알림

20261009045020_server_workout_push.sql을 서버 코드 배포 전에 적용합니다.
업데이트된 앱은 기존 로컬 운동 예약을 취소한 뒤 workout_push_enabled=true와 언어를 등록합니다.
기존 기기의 기본값은 false이므로 업데이트 전 기기에 중복 운동 알림을 보내지 않습니다.
FCM은 높은 우선순위의 notification + data 메시지를 사용해 Android 백그라운드에서 OS가 표시합니다.
로컬 운동 시간 알람, 정확한 알람 권한, 매일 예약 보충은 제거했습니다.

- 사용자 시간대와 운동 요일·시각으로 10초마다 생성하며 당일 세션이 없어도 계산합니다.
- 출발 전에는 운동 30분 전, 미루기 후 예정 시각, 예정 시각 30·60·90분 후의 미인증 재촉,
  자유운동 권유를 각각 설정에 따릅니다.
- `지금 출발`로 `started` 상태가 되면 해당 운동일의 일반 알림과 기존 재촉을 중단합니다.
  최초 `started_at`부터 정확히 3시간 뒤에도 미인증이면 재촉 푸시를 한 번만 생성합니다.
  재촉 알림을 꺼 둔 사용자는 받지 않으며, 반복 출발 요청이나 일정 변경으로 기준 시각을 늦추지 않습니다.
  자정을 넘겨도 출발 시각부터 3시간을 기준으로 하며, 사진·수동 출석 인증 또는 휴식이면 취소합니다.
- 완료·휴식·미실시 세션은 제외하고 변경된 시각·요일·설정의 대기 작업도 전송 직전 취소합니다.
- 운동 알림은 예정 시각부터 10분 후 만료합니다. 장애 복구 시 오래된 알림을 몰아서 보내지 않습니다.
- 이벤트와 기기별 작업에 고유 제약을 적용하고 발송 중 작업에는 2분 임대를 적용합니다.
  공급자 요청 중에는 DB 연결/잠금을 보유하지 않습니다. 서버 작업의 일시 오류 재시도는 최대 2회입니다.
  공급자 응답 후 기록 전 장애가 발생하면 재전송될 수 있어 이벤트 UUID를 표시 식별자로 사용합니다.
- 방 알림의 조용한 시간 규칙은 유지하며, 사용자가 직접 정한 운동 시각과 테스트에는 적용하지 않습니다.
- 영어 기기에는 catalog.json의 localized.en 문구를 사용합니다.
- 출발 후 재촉은 `defaults.departure_unverified`와 `departure_messages_by_roast_level`의
  인증 전용 문구를 사용합니다. 기존 카탈로그에 이 항목이 없으면 기본 미인증 안내 문구를 사용합니다.

GET /api/v1/notifications/status는 현재 계정의 등록·작업 상태·최근 전송 결과만 반환하며 토큰을 노출하지 않습니다.
fcm_initialized는 SDK 초기화 상태이므로 Firebase 발송 권한이나 실기기 표시까지 보증하지 않습니다.
앱 설정의 15초 서버 테스트 알림은 POST /api/v1/notifications/test?installation_uuid=...에 빈 JSON을 보내
본인 기기 한 대에만 테스트를 예약합니다. 기본 채널은 실제 운동 알림과 같은 `workout-push`이며,
테스트는 예약한 발송 시각부터 기본 10분 후 만료합니다. 요청은 계정당 1분에 한 번입니다.
API의 /health는 생존 확인이므로 푸시 활성화 판단에 사용하지 않습니다.
권한 동의 후 자동 등록과 설정 카드 상태 갱신을 연결했습니다. 수동 등록은 거부·실패 때만 표시하며,
상태 조회의 성공·실패와 조회 시각을 화면에서 확인할 수 있습니다.

2026-10-09 검증: 격리 DB/HTTP/작업자 27개와 앱 등록·로컬 정리 14개 모의 시나리오 통과.
실제 Supabase 스키마 변경과 RLS 유지 확인, Next.js 빌드 및 Ruff 검증을 수행했습니다.
사용자 승인 후 등록된 Android 토큰으로 FCM validate-only 요청 수락을 확인했습니다.
현재 자격 증명의 발송 권한을 확인했으며 실제 알림은 전송하지 않았습니다.
Android 수신 검증, 서버 배포·앱 설치는 포함하지 않았습니다.

### 서버에서 운동 알림 테스트

서버의 curl 또는 API 클라이언트에서도 로그인 쿠키로 테스트를 예약할 수 있습니다.
`POST /api/v1/auth/login`에서 받은 쿠키를 사용하며, 본인 계정에 등록된 기기에만 전송합니다.
아래 예시는 로그인 응답 쿠키를 저장한 `cookies.txt`를 사용합니다.

`POST /api/v1/notifications/test`의 JSON 본문은 다음 필드를 받습니다.

| 필드 | 기본값 | 허용 값 |
| --- | --- | --- |
| `installation_uuid` | 생략 | 본인 기기의 UUID. 활성 기기가 한 대면 자동 선택하며, 여러 대면 필수 |
| `channel` | `workout` | `workout`: 운동 알림 채널, `server`: 챌린지 알림 채널 |
| `delay_seconds` | `15` | 0~86400초. 0이면 다음 작업자 주기에 발송 시도 |
| `ttl_seconds` | `600` | 예약한 발송 시각 이후 유효기간, 30~86400초 |

채널 선택은 Android에 적용됩니다. iOS 기기는 기존 APNs 발송 경로로 테스트합니다.
기존 쿼리 매개변수 `installation_uuid`와 빈 본문 `{}`도 계속 지원합니다.
본문과 쿼리에 기기 ID를 함께 넣었다면 두 값이 같아야 합니다.

```bash
# 한 시간 뒤 실제 운동 알림 채널로 발송: 요청 후 앱을 다시 열지 않고 확인합니다.
curl --fail-with-body -X POST "$API_BASE_URL/api/v1/notifications/test" \
  --cookie cookies.txt \
  -H 'Content-Type: application/json' \
  --data '{"channel":"workout","delay_seconds":3600,"ttl_seconds":600}'

# 위 응답의 event_uuid로 전송 결과를 조회합니다.
curl --fail-with-body "$API_BASE_URL/api/v1/notifications/test/$EVENT_UUID" \
  --cookie cookies.txt
```

예약 응답은 HTTP 202이며 `event_uuid`, `outbox_id`, `status`, `channel_id`,
`scheduled_at`, `expires_at`, `delay_seconds`, `ttl_seconds`를 반환합니다.
시각은 UTC의 `Z` 형식입니다. 결과 조회에서는 `attempt_count`, `provider_message_id`,
`last_error`도 확인할 수 있습니다. 초기 상태는 `queued`입니다.
`provider_accepted`는 FCM/APNs 접수 성공이며 기기 수신·표시 완료를 뜻하지 않습니다.
다른 계정의 테스트 ID는 404, 기기 미등록은 409, 발송 작업 비활성은 503을 반환합니다.
상태 조회는 추가 알림을 발송하지 않으며 앱을 열어 기기를 재등록할 필요도 없습니다.
로그에는 예약과 처리 결과를 이벤트 UUID로 남기며 기기 토큰은 기록하지 않습니다.
API 코드 배포·재시작 후 사용할 수 있고 DB 마이그레이션은 필요하지 않습니다.

## API 계약

로그인은 서버의 HttpOnly 쿠키 세션으로 유지합니다. 세션과 쿠키는 인증된 요청마다 갱신되며,
기본 유휴 만료는 400일(`SESSION_DAYS`)입니다. 앱을 다시 열어도 쿠키가 남아 있으면 로그인 상태가 복원됩니다.
사용자가 `전체 기기 로그아웃`을 누르면 모든 서버 세션을 즉시 삭제합니다. 쿠키 삭제, 앱 데이터 삭제,
계정 비활성화 또는 400일 이상 미사용 시에는 다시 로그인해야 합니다.

`/health`, 회원가입, 로그인을 제외한 모든 API에는 로그인 시 발급된 HttpOnly 세션 쿠키가
필요합니다. 입력 본문은 JSON입니다.
로그아웃도 `Content-Type: application/json`과 빈 객체 `{}`를 전달합니다.

| 메서드/경로 | 입력/출력 |
| --- | --- |
| POST `/api/v1/auth/register` | `email`, `password`(12~128자), `display_name`, `country_code`(ISO 2자리), `timezone`(IANA 이름) → 세션 만료초와 사용자; HttpOnly 쿠키 발급 |
| POST `/api/v1/auth/login` | `email`, `password` → 세션 만료초와 사용자; HttpOnly 쿠키 발급 |
| GET `/api/v1/auth/session` | 현재 HttpOnly 세션 검증 및 사용자 복원 |
| POST `/api/v1/auth/logout` | 해당 사용자의 **모든 기기** 서버 세션 삭제, 쿠키 삭제, 204 |
| GET `/api/v1/me` | `user_uuid`, `email`, `display_name` |
| GET/PUT `/api/v1/settings` | 아래 설정 객체 조회/전체 교체 |
| GET `/api/v1/settings/options` | `day_names`, `roast_labels`, `roast_quotes` |
| GET `/api/v1/today` | `workout_time`, 설정된 자극 강도·진행 상태에 따른 `progress_message`, `session`, `weekly_attendance`, `memory` |
| POST `/api/v1/sessions/today/actions` | `action`: `go`, `snooze`, `rest`, `manual`; 선택 `note` → 세션 |
| GET/PUT `/api/v1/sessions/by-date/{workout_date}/sets` | 해당 날짜의 `exercise_groups` 조회/전체 교체; 미래 날짜는 저장 거부 |
| GET `/api/v1/records?year=2026&month=9&offset=0&limit=20` | `calendar`, `records`, `pagination` |
| GET `/api/v1/sessions/{session_uuid}` | 본인 세션만 조회, 타인/없는 기록은 모두 404 |
| GET `/api/v1/stats` | 완료·휴식·미실행·미확정 및 전체 기록 수 |

설정 PUT 예시:

```json
{
  "schedule_days": [1, 3, 5],
  "workout_time": "19:00",
  "country_code": "KR",
  "timezone": "Asia/Seoul",
  "roast_level": "off",
  "reuse_enabled": true,
  "notification_workout_enabled": true,
  "notification_free_workout_enabled": false,
  "notification_missed_enabled": true,
  "notification_snooze_enabled": true
}
```

요일은 JavaScript `getDay()`와 동일하게 일요일 0~토요일 6입니다. 빈 배열은 정기 일정 없음입니다.
알림 옵션은 서버 운동 알림 생성과 챌린지 푸시 발송에 사용됩니다. `notification_free_workout_enabled`는
정기 일정이 없는 날의 저장된 운동 시간에 기기 로컬 권유 알림을 한 번 예약합니다.
로그인 이메일은 소문자로 정규화하며 비밀번호는 Argon2로 해시합니다.
로그인은 JSON 방식으로, OAuth2 form 토큰 엔드포인트는 아닙니다.
서버 세션의 기본 유휴 만료시간은 400일입니다. 인증된 요청이 들어올 때마다 DB 세션의 만료 시각과
HttpOnly 쿠키를 현재 시각 기준 400일 뒤로 갱신합니다.
세션 ID 원문은 HttpOnly 쿠키로만 전달하고 DB에는 SHA-256 해시와 만료 시각만 저장합니다.
로그인 시 만료된 세션을 정리합니다.

## 프론트엔드 연결과 데이터 가공

| 현재 화면 입력 | API 응답에서 사용할 값 |
| --- | --- |
| `TodayScreen.hero_quote`, `workout_time` | `/today`의 동일한 필드 |
| 주간 출석 숫자 및 진행률 | `/today.weekly_attendance` |
| 과거 기록 카드 | `/today.memory` (없거나 재사용 비활성화이면 null) |
| `SettingsScreen` 설정 props | `/settings`의 동일한 필드 |
| `calendar_mock_data` | `/records.calendar` (`year/month/days/completed_days` 포함) |
| `record_mock_data` | `/records.records` (`date/title/status` 포함) |
| GO/미루기/수동 출석 버튼 | `/sessions/today/actions` 호출 후 `/today`, `/records` 재조회 |

기록에는 화면용 `date/title/status`와 원본 `workout_date/session_status/session_uuid`를 함께 제공합니다.
캘린더는 실제 월 일수와 일요일 기준 `first_day_of_week`를 제공합니다. 화면에서 월 초 빈 칸을
이 값만큼 렌더링해야 합니다. 사용자 메모를 포함한 문자열은 React 텍스트로 렌더링하고 HTML로 삽입하지 마세요.

개인 하루 기준과 주간 집계는 계정의 `timezone`을 따르고 주 시작은 월요일입니다. 기존 계정은 `KR`/`Asia/Seoul`로 유지합니다. DB 시각은 UTC, 응답 시각은 `Z` ISO 문자열입니다.
사용자별 하루 1기록이며, 사용자 행 잠금과 유일키로 중복 생성/미루기를 제한합니다.
수동 출석은 비정기 운동일에도 가능하고 완료/휴식 재요청은 기존 결과를 반환합니다.
출발 후 미루기, 종료된 기록 변경, 자정을 넘기는 미루기는 409로 거부합니다.
설정을 바꿔도 이미 생성된 세션의 예정 시각은 유지합니다.
지난 날짜의 미완료 세션은 조회 시 미실행으로 가공합니다. **기록이 아예 없는 날은 결석으로 추정하지 않습니다.**
과거 일정 이력이 없으므로 주간 목표는 현재 설정의 요일 수입니다. 실제 운동 시간은 기록되지 않아 분 단위를 만들어 반환하지 않습니다.

프론트엔드의 로그인 화면과 fetch 연결이 구현되어 있습니다. 루트 `.env.example`의
`NEXT_PUBLIC_API_BASE_URL`을 설정하고 루트 README의 실행 절차를 따르세요.
프론트엔드는 새로고침 시 `/auth/session`으로 서버 세션을 복원하며 인증 토큰을 메모리나
localStorage에 저장하지 않습니다.
사진 인증은 아래 API를 사용합니다. Supabase 스키마 마이그레이션과 서버 의존성 설치 후 서버를 재시작하세요.

| API | 동작 |
| --- | --- |
| GET `/api/v1/photo-effects` | 로그인 사용자에게 고정 필터·브랜딩 버전 반환 |
| GET `/api/v1/photo-branding` | 상단 로고·운동 요약 오버레이와 요약 해시를 JSON으로 반환 |
| POST `/api/v1/sessions/today/photo` | multipart 사진 검증, 서버 합성, 사진 저장 후 출석 완료; 세트 입력은 받지 않음 |
| GET `/api/v1/sessions/{session_uuid}/photo` | 해당 사용자 소유의 합성 사진만 반환; 원본 조회 API 없음 |

### My Workout 및 운동 세트

`supabase/migrations/20260928020747_exercise_library_and_session_sets.sql`,
`20260928030424_seed_default_exercises.sql`, `20260928030930_shared_exercise_catalog.sql`을
순서대로 적용한 뒤 서버를 재시작하세요. 마지막 마이그레이션은 기본 운동 26개를 공용
`shared_exercise_items`에 한 번만 저장하고, 앞선 마이그레이션이 만든 회원별 기본 종목 행을
공용 종목으로 전환합니다. 직접 등록한 종목은 `exercise_items`에 저장합니다. 같은 이름의
기존 회원 종목은 최근 세트와 과거 기록 연결을 공용 종목으로 옮긴 후 제거합니다.
공용 종목의 최근 세트는 회원별 `user_shared_exercise_progress`에 저장됩니다. 기록 및 오늘 세션
응답에는 `exercise_groups`가 포함되고, 과거 세트에는 당시 종목 이름이 남습니다.

| API | 동작 |
| --- | --- |
| GET `/api/v1/exercises` | 공용 기본 종목과 내 종목을 합쳐 조회; `exercise_source`는 `shared` 또는 `custom` |
| POST `/api/v1/exercises` | `{ "name": "케이블 크런치" }`로 내 종목 등록 |
| PUT `/api/v1/exercises/custom/{exercise_id}` | 내 종목 이름 수정 |
| DELETE `/api/v1/exercises/custom/{exercise_id}` | 내 종목 삭제 |

세트 화면은 `GET /api/v1/sessions/by-date/{workout_date}/sets`로 날짜별 기록을 불러오고,
입력이 바뀔 때 `PUT`으로 `{ "exercise_groups": [{ "exercise_source": "shared", "exercise_id": 1, "sets": [{ "weight_kg": 60, "reps": 8 }] }] }`를 저장합니다.
PUT은 해당 날짜의 세트 전체를 한 트랜잭션으로 교체하며, 출석 상태나 사진 인증을 변경하지 않습니다.
인증을 아직 하지 않은 날에도 세트를 기록할 수 있고, 이후 해당 날짜에 연결된 세트로 조회됩니다.
사진 인증은 사진과 선택 메모만 저장하며, 운동 세트 기록과 별도로 진행합니다.

업로드 필드: `photo`(JPEG 파일), `captured_at`(시간대가 포함된 ISO 8601), `capture_timezone`(기기의 IANA 시간대),
`workout_summary_hash`(미리보기 응답의 SHA-256), `branding_language`(ko/en), `character_id`(카탈로그의 캐릭터 ID),
`filter_id`, `effect_version`, `workout_date`(계정 시간대의 오늘 날짜),
`submission_id`(UUID), `note`(선택, 최대 1000자). 브라우저의 Origin은 CORS_ORIGINS 목록에 있어야 합니다.
일반 JSON API의 16KB 제한을 유지하고 사진 경로만 2MB + multipart 메타데이터 16KB를 허용합니다.
사진 본문 수신 제한은 30초이며 프런트엔드 요청 제한은 45초입니다.

파일 확장자를 신뢰하지 않고 Pillow로 JPEG 형식·완전 디코딩·900×1600 해상도·2MB 이하를 검증합니다.
EXIF/GPS 등 메타데이터를 제거하고, 서버가 원본 픽셀에 고정 웜 톤과 상단 로고·계정 이름·현지 촬영 시각·당일 운동 요약·캐릭터 하나를 합성합니다.
여기서 원본은 기기 원본 전체가 아니라 클라이언트가 9:16으로 중앙 크롭한 **효과 적용 전 JPEG**입니다.
원본과 합성본을 비공개 `PHOTO_STORAGE_DIR`(기본 `server` 작업 디렉터리 기준 `media/photos`)에 저장합니다.
경로는 외부 정적 파일 서버에 노출하지 말고, 운영에서는 영속 볼륨과 DB를 함께 백업하세요.
여러 API 인스턴스는 같은 저장 볼륨을 사용해야 하며 현재 구현은 object storage를 사용하지 않습니다.

동일 submission_id/동일 내용의 재전송은 기존 결과를 반환합니다. 종료된 세션 덮어쓰기,
다른 날짜 요청, 허용되지 않은 효과, 같은 사용자가 이미 사용한 동일 디코딩 픽셀은 거부합니다.
사진 검증은 파일 유효성·소유권·정확히 동일한 사진 재사용 검사이며, 실제 운동 여부/촬영 시각을 판정하지 않습니다.
약간 수정한 과거 사진이나 다른 화면을 재촬영한 사진은 판별하지 못합니다.
저장 성공 후 DB에 출석을 반영합니다. 커밋 결과가 불확실한 실패에서는 파일을 보존하므로,
운영자는 실패 로그를 확인하고 오래된 UUID 디렉터리를 DB의 storage_key와 대조해 미참조 파일을 정리해야 합니다.

프레임 선택·프레임 PNG API·동적 프레임 폴더 로딩을 제거했습니다. 기존 프레임 이미지와 전용 UI는
`etc/review-unused-photo-frames`로 옮겼습니다. 이미 저장된 합성본은 유지됩니다.
`GET /photo-branding?captured_at=...&capture_timezone=...&workout_date=...&branding_language=ko&character_id=...`는
인증된 계정의 이름과 해당 계정 시간대의 당일 세트 기록을 사용합니다. JSON 응답의 `image_data_url`은
투명 PNG의 data URL이며, `workout_summary_hash`는 서버가 조회한 종목명·세트 수·총 중량·부위 목록의 해시입니다.
상단에는 기존 앱 로고 아이콘과 DON’T SKIP 문구를 나란히 배치하고, 하단 운동 목록은 모든 종목과 전체 이름을
표시합니다. 기본 글씨는 21px(기존 27px)이며 11개 이상은 두 열로 배치합니다. 긴 이름은 줄바꿈하고,
유효한 최대 30종목·종목명 100자도 사진 안에 들어가도록 필요할 때 글씨를 추가로 줄입니다.
총 중량은 각 세트의 중량×반복 수를 Decimal로 합산한 kg 값입니다. 주 운동 부위는 공용/개인 종목의
등록된 큰 부위별 세트 수로 집계하며, 최다 세트 부위가 동률이면 모두 표시합니다. 개인 종목 분류는
해당 사용자 소유의 종목만 조회하고 삭제·미설정 종목은 미분류로 표시하며 이름으로 추측하지 않습니다.
기록이 없으면 목록과 통계를 표시하지 않으며 다른 계정·날짜의 운동은 포함하지 않습니다.
미리보기와 저장 모두 `render_photo_branding`으로 같은 오버레이를 생성합니다. 업로드 시 요약 해시를
다시 확인해 종목·중량·반복 수·부위가 바뀌었으면 409를 반환하며, 화면의 운동 목록 새로고침으로 재촬영 없이 갱신합니다.
촬영 시각은 카메라 결과 수신 직후의 기기 시각이며 EXIF의 셔터 시각을 보증하지 않습니다.
UTC 오프셋을 함께 표시하고 일광절약시간·날짜 경계도 기기 시간대로 변환합니다.
DB 변경 없이 기존 `frame_id` 열에 고정 브랜딩 버전과 촬영 시각·운동 요약·표시 언어·캐릭터 ID의 해시를 저장하여,
같은 업로드 식별자로 촬영 정보만 바꿔 재전송한 경우도 충돌로 처리합니다.
한글 계정명 렌더링에는 Noto Sans CJK가 필요합니다. Docker는 `fonts-noto-cjk`를 설치하고,
Windows는 맑은 고딕, macOS는 Apple SD Gothic Neo를 사용합니다.
캐릭터는 `app/photo_processing.py`의 `photo_characters`에 등록한 coach 전용 5종을 사용합니다.
기존 윙크 포즈와 새로 생성한 더블 바이셉스·엄지척·덤벨 컬·승리 포즈만 포함하며,
`mascot_*`와 `coach_front/side/back`은 후보에서 제거했습니다. 제외한 서버·public 이미지 사본은
`etc/review-unused-photo-characters`로 옮겨 리뷰할 수 있게 보존했습니다.
`GET /photo-effects`의 `character_ids`에서 클라이언트가 Web Crypto 난수로 촬영당 한 번 선택하고,
같은 ID를 미리보기 GET과 업로드 폼에 전달합니다. 운동 목록 새로고침·언어/메모 변경 시 다시 뽑지 않으며
서버는 등록된 ID만 허용하고 같은 업로드 식별자의 캐릭터 변경은 충돌로 처리합니다.
후보 추가 시 이미지를 `app/photo_assets`에 포함하고 레지스트리에 안정적인 ID로 등록한 뒤 효과 버전을 올립니다.
모든 캐릭터는 독립된 투명 PNG이며 최대 180×252 안에 맞춰 캐시한 뒤 사진 우측 하단에 배치합니다.
mascot 스프라이트 분리 코드는 제거했습니다. 로고는 `app/photo_assets/logo.png`의 기존 앱 아이콘입니다.

<details>
<summary>Coach 포즈 생성 프롬프트 · 2026-10-16</summary>

내장 `image_gen`으로 기존 `app/photo_assets/coach.png`를 참조해 포즈마다 별도로 생성했습니다.
각 호출은 `transparent_background=true`이며 아래 공통 프롬프트와 포즈별 프롬프트를 이어서 사용했습니다.

공통 프롬프트:

```text
Use case: stylized-concept. Asset type: one transparent PNG character sticker used small at the bottom-right of a workout verification photo. Input image 1 is the strict character identity and material reference, not a requested background. Generate exactly ONE full-body version of this SAME coach in a new action pose. Preserve the reference's squat, very broad muscular charcoal-gray body, spiky short charcoal hair, round nonhuman stylized face with simple cream-white graphic eyes/eyebrows/mouth, textured matte clay-like 3D material, bare torso, burgundy-red athletic shorts with cream piping, and chunky off-white sneakers. Preserve the recognizable face, proportions, outfit colors, and high-quality 3D rendering. Use a friendly and encouraging expression appropriate after a workout. Full body, entire hair, hands, fingers, and BOTH shoes must be visible, centered with comfortable transparent padding. Use soft neutral studio lighting on the character. Background must be truly transparent RGBA, no floor, no cast shadow on a background, no glow or haze, no scenery, no text, no logos, no borders, no contact sheet, no extra people. This is a new expressive/action pose of the coach, never a neutral front/side/back turnaround. Change only pose and expression; keep character identity and outfit.
```

저장 경로: `server/app/photo_assets/coach_double_biceps.png`

```text
Pose: celebratory DOUBLE BICEPS flex. Both elbows lifted outward, both fists near head height, chest proud, broad friendly closed-mouth smile, eyes open, feet firmly planted slightly apart. A clear compact silhouette that reads at thumbnail size.
```

저장 경로: `server/app/photo_assets/coach_thumbs_up.png`

```text
Pose: enthusiastic DOUBLE THUMBS-UP toward the viewer, both arms bent comfortably in front of the torso with clearly readable thumbs. Friendly smile, both eyes open, weight shifted slightly onto one leg. Keep the hands anatomically clean and entirely visible.
```

저장 경로: `server/app/photo_assets/coach_dumbbell_curl.png`

```text
Pose: performing a standing one-arm DUMBBELL CURL. Hold one simple dark gray dumbbell in one hand at mid-curl near chest height; the other hand rests on the hip. Small confident smile and focused eyes. Stable feet shoulder-width apart. Only this one workout prop, held securely and fully visible.
```

저장 경로: `server/app/photo_assets/coach_victory.png`

```text
Pose: triumphant workout-completed VICTORY. One bent arm raised overhead with a closed celebratory fist, other fist at the waist, proud cheerful smile, one foot slightly forward while both feet stay grounded. Dynamic, friendly, compact pose; show the whole raised arm and hand within the canvas.
```

</details>

공유 픽셀 변환식은 `clamp(floor(((channel - 128) * contrast + 128) * brightness + offset + 0.5))`입니다.
Canvas.filter의 브라우저별 지원 차이를 피하기 위해 프런트엔드도 같은 픽셀 변환을 수행합니다.

검증(2026-09-22): 격리 SQLite API 테스트 16건 통과(위장/손상/초과크기/효과 위조/소유권/멱등성/
재사용/저장 실패), Chrome 가상 카메라 E2E 촬영→프레임 변경→업로드→조회 통과,
320/390/768/1440px 가로 넘침 없음, 프런트/서버 RGB 필터 결과 일치, Next 프로덕션 빌드 및 Ruff 통과.
실기기 카메라·기기별 색공간·권한 복원, iOS Xcode 빌드는 별도 확인이 필요합니다.
Android에서 촬영 중 OS가 앱을 종료하면 현재 초안은 복구되지 않으므로 다시 촬영해야 합니다.
임시 테스트 소스는 사용자 지침에 따라 검증 후 삭제합니다.

## 로그와 보안 설정

`LOG_LEVEL=DEBUG`이면 SQL 문장과 placeholder, 트랜잭션 및 요청 수신 정보를 볼 수 있습니다.
SQLAlchemy는 INFO 레벨로 설정하여 결과 행을 로그에 출력하지 않고, `hide_parameters=True`로
바인딩 값을 가립니다. 비밀번호·세션 ID·본문·쿼리스트링·DB 예외 메시지는 기록하지 않습니다.
오류에는 예외 종류와 파일/행/함수 경로를 기록합니다. 검증 오류도 제출된 값을 응답에 반사하지 않습니다.
기본 로그는 콘솔과 `logs/api.log`에 출력하고 5MB마다 교체하여 백업 5개를 유지합니다.
요청별 `X-Request-ID`, 상태코드, 소요시간, 수신/송신 크기와 라우트 템플릿을 남깁니다.

기본 입력 제한은 16KB 및 본문 수신 10초입니다. 추가 JSON 필드는 거부하며 페이지 크기는 최대 100입니다.
로그인/가입 등 인증 요청은 IP당 분당 10회, 전체는 분당 120회로 제한합니다.
이 제한은 **단일 프로세스 메모리 기준**이며 재시작 시 초기화됩니다. 다중 worker/서버 운영에서는
게이트웨이나 Redis 기반의 공유 제한과 계정별 로그인 시도 제한을 추가해야 합니다.
인터넷 공개 시 HTTPS reverse proxy에서 연결/헤더 시간 제한, 전역 속도 제한을 적용하고
서버에 직접 접근하지 못하게 하세요. 프록시를 사용하면 실제 IP 전달을 신뢰할 프록시 IP만
Uvicorn `--forwarded-allow-ips`로 지정하고 `--proxy-headers`를 활성화해야 합니다.
`CORS_ORIGINS`, `ALLOWED_HOSTS`에는 실제 프론트엔드 origin/API host를 명시합니다.
세션 쿠키는 `HttpOnly`, `SameSite=Lax` 기본값으로 발급합니다. HTTPS 기반의 다른 사이트
origin에서 호출하려면 `SESSION_COOKIE_SECURE=true`, `SESSION_COOKIE_SAMESITE=none`으로
설정해야 합니다. CORS origin은 실제 프론트엔드만 명시해야 합니다.
공개 회원가입은 이메일 소유권 확인을 포함하지 않습니다. 이메일 인증/비밀번호 재설정은 별도 기능입니다.

참고: [Starlette 세션 쿠키](https://www.starlette.io/responses/#set-cookie),
[SQLAlchemy 로그 및 파라미터 숨김](https://docs.sqlalchemy.org/en/20/core/engines.html).

## 검증 참고

2026-09-24 전환 검증(당시 설정 기준): 실제 deradera 연결과 7개 테이블 조회, API 가입·로그인·세션 만료·설정 저장·
출석·기록·사진 인증/중복 요청·다른 사용자 데이터 차단, DB 권한과 세션 시간 제한을 확인했습니다.
설정 검증을 포함한 15개 임시 테스트 항목과 Ruff lint/format 검증을 통과했습니다.
검증용 사용자·출석·사진 DB 행과 임시 테스트 소스는 정리했습니다.

배포 전 Supabase 스키마 마이그레이션을 적용하고, Python 3.12 환경에서 가입·로그인,
새로고침 세션 복원, 400일 유휴 만료, 활동 중 세션 갱신, 전체 기기 로그아웃, 사용자 데이터 격리 및 입력 검증을
확인해야 합니다. Ruff lint/format과 프론트엔드 정적 빌드를 CI에서 계속 실행하세요.

연결 방식 참고: [Supabase SQLAlchemy 연결 가이드](https://supabase.com/docs/guides/troubleshooting/using-sqlalchemy-with-supabase-FUqebT), [PostgreSQL 연결](https://supabase.com/docs/guides/database/connecting-to-postgres).


## 주간 약속 공유

`GET /api/v1/sharing/weekly?week_offset=0`은 로그인한 사용자의 주간 공유 데이터를 반환합니다.
`week_offset=1`은 지난주이며, API는 0~52 범위만 허용합니다. 주간 경계는 사용자 시간대의 월요일~일요일입니다.

- 약속 달성률: `min(완료한 날짜 수 / 저장된 주간 목표, 1) × 100`. 하루 최대 1회이며 요일 이동을 허용합니다.
- 추가 운동: `max(완료한 날짜 수 - 목표, 0)`. 달성률에 합산하지 않고 별도 표시합니다.
- 기록 향상: 지난주와 동일 종목 ID·출처·중량의 최고 반복 수를 비교합니다. 향상한 기록 중 반복 증가가 가장 큰 하나를 표시합니다. 완료 세션만 사용하며 삭제한 종목, 다른 중량, 비교 기록이 없는 경우는 추정하지 않습니다.
- 미래 날짜는 제외합니다. 0회 목표, 저장된 목표가 없는 과거, 중간에 시작한 최초 주는 달성률과 추가 운동 평가를 하지 않습니다. 완료한 운동 수는 계속 표시합니다.
- 설정 변경은 알림/요일에 즉시 적용되지만 평가 목표 횟수는 다음 월요일부터 적용합니다. 목표 이력은 변경 시점마다 저장하며 변경하지 않은 주에는 직전 목표가 이어집니다.
- 이름·사진·메모는 공유 이미지에 포함하지 않습니다. 자가 기록 기준임을 이미지에 표시합니다.

배포 전에 `supabase/migrations/20260929043242_weekly_promise_sharing.sql`을 적용해야 합니다.
이 마이그레이션은 새 목표 이력 테이블과 현재 설정의 최초 기준만 추가하며, 기존 완료 기록은 바꾸지 않습니다.
기능 시작 이전의 약속 달성률은 소급 생성하지 않습니다. 애플리케이션 코드를 배포하기 전에 마이그레이션을 적용하세요.

프론트엔드의 기록 화면에서 `내 약속, 자랑하기`를 누르면 1080×1350 PNG를 준비합니다.
웹은 파일 공유 지원 시 공유 창을 열고, 미지원 시 다운로드로 연결합니다. 별도 이미지 저장 버튼도 제공합니다.
네이티브는 Capacitor Share/Filesystem을 사용하며 PNG 1개를 앱 캐시에 덮어씁니다.
iOS는 macOS에서 CocoaPods 설치와 Xcode 빌드가 필요합니다. 파일 타임스탬프 사용 사유는 앱의 PrivacyInfo.xcprivacy에 포함했습니다.

2026-09-29 로컬 검증: Next.js 프로덕션 빌드 및 서버 Ruff 통과.
격리된 SQLite 메모리 DB의 11개 시나리오 그룹(목표별 공정성, 초과 운동, 0회/첫 주/이력 없음,
미래 제외, 목표 변경과 이월, 사용자 격리, 연월 경계, 종목 비교, HTTP 인증·범위·설정)을 통과했습니다.
브라우저에서 카드 생성, 이번 주/지난주 전환 및 320/768/1024/1440px 가로 넘침 없음을 확인했습니다.
이미지 저장 요청은 확인했으나 인앱 브라우저의 다운로드 완료 이벤트가 시간 초과되어 실제 파일 저장 완료는 검증하지 못했습니다.
실제 Supabase에 대한 마이그레이션 적용과 Android/iOS 실기기 공유는 별도 배포 검증 항목입니다.


## 개인 변화 리포트 (personal_report_v1)

기록 → 나의 변화 리포트에서 다음 6개 항목을 비교합니다. 기존 주간 공유 API의 `insights`에
타입이 지정된 세부 근거와 종합 해석을 추가했습니다. 이번 확장에는 추가 DB 마이그레이션이 없습니다.
기존 `weekly_promise_changes` 마이그레이션은 계속 필요합니다.

1. 최근 기록 변화: 같은 중량의 최고 반복 수와 같은 반복 수의 최고 중량. 현재 주는 지난주의 같은 요일까지 비교합니다. 한 종목에 상승/유지/하락이 동시에 있을 수 있어 각각 공개합니다.
2. 시작과 지금: 종목별 첫 완료 운동일과 마지막 완료 운동일의 같은 조건을 비교합니다. 같은 날의 세트만 있거나 조건이 맞지 않으면 비교 불가입니다.
3. 복귀: 목표 미달 주 다음의 목표가 있는 주에서 목표를 채웠는지 평가합니다. 중간 0회 목표 주는 건너뛰고, 목표 이력 없음은 연결을 끊습니다. 진행 중인 주는 대기로 표시하고 성공/실패 분모에 넣지 않습니다.
4. 도전: 저장된 이력에서 처음 등장한 종목과, 해당 주 이전의 동일 조건 최고 기록을 초과한 종목을 분리합니다. 첫 중량/반복 조건 자체는 개인 기록 경신으로 세지 않습니다.
5. 꾸준함: 최근 최대 53주 안의 목표 달성 주, 현재 연속/최장 연속 주. 미달은 연속을 끊고 목표 없는 휴식 주는 일시정지합니다. 현재 주는 목표를 이미 채웠어도 결산 전에는 연속에 넣지 않습니다.
6. 운동 취향: 세트 기록이 있는 운동일 중 각 종목을 한 날의 비중. 세트 수가 많아도 같은 날짜는 1회이며 여러 종목의 비중 합계는 100%를 넘을 수 있습니다.

종합 해석은 가중 합산 점수가 아닌 우선순위 규칙입니다. 완료 운동 없음 → 최근 상승/하락 혼합 →
최근 하락 → 이번 주 복귀 → 상승과 완료된 약속 3주 이상 연속 달성 → 상승 → 꾸준함 → 첫 도전 →
유지 → 기준 수집 순서로 분류합니다. 최초 대비 변화와 개인 기록도 근거 문장에 포함하며,
취향과 비교 기회 없음은 우열 점수로 환산하지 않습니다. 데이터 커버리지와 부족한 비교 종목 수를 공개합니다.

이력 조회는 사용자 ID와 리포트 기준일로 제한하며 사진·메모·계정 정보는 읽지 않습니다.
완료 세션과 종목 식별자가 남은 세트만 분석합니다. 과거 리포트는 그 기준일 이후의 데이터로 평가하지 않습니다.
종목별 첫날/개인 최고 기록의 정확한 비교를 위해 해당 사용자의 과거 세트 투영값을 읽습니다.
매우 긴 기록 이력을 가진 사용자 규모에서는 별도 일별 집계 테이블 도입을 검토해야 합니다.

전체 리포트를 UTF-8 `.txt` 파일로 공유할 수 있고, SNS용 PNG에는 종합 해석과 6개 요약을 표시합니다.
원래 약속 달성률과 추가 운동도 보조 지표로 유지합니다. 서버와 웹을 함께 배포하세요.
기록 수정 시 리포트는 재계산되며, 현재 구현은 변경 불가능한 인증서가 아닙니다.

검증: 격리 SQLite/HTTP 28개 시나리오 통과. 한국어/영어 상세 리포트의 6개 항목, 근거,
UTF-8 내보내기를 확인했습니다. Next.js 빌드와 서버 Ruff 통과. 브라우저에서 상승/하락 동시 표시,
비교 날짜, 복귀와 꾸준함 내역, PNG 생성 및 320/768/1024/1440px 가로 넘침 없음을 확인했습니다.
실제 운영 DB 반영 및 Android/iOS 앱으로의 파일 전달은 이 검증에 포함하지 않았습니다.

## 방장용 팀원 성장 리포트 (growth_v2)

챌린지 종료 후 `settling`에서 방장은 팀원별 잠정 리포트를 봅니다.
`completed`에는 저장된 리포트를 반환하며 일반 참가자와 외부인은 상세 API를 사용할 수 없습니다.

- `GET /api/v1/challenge-rounds/{round_uuid}/member-reports`: 점수·평가 가능 배점·총중량 증가 종목 수
- `GET /api/v1/challenge-rounds/{round_uuid}/member-reports/{member_uuid}`: 개인 목표와 출석, 종목·세트·총중량, 인증 시각의 근거
- 두 응답은 `Cache-Control: private, no-store`입니다. 이메일·사진·개인 메모는 포함하지 않습니다.
- 일반 진행/결과 API에서 `growth_reports`, `growth_report_history`, `growth_snapshot_origin`을 제거합니다.

| 항목 | 배점 | 계산 |
| --- | ---: | --- |
| 개인 출석 목표 달성 | 20 | 각 7일 구간의 출석을 개인 주간 목표까지만 인정한 뒤, 전체 목표 대비 비율 × 20 |
| 총중량 성장 | 50 | 직전 동일 길이 기간보다 늘어난 총중량 비율 / 20% × 50, 최대 50 |
| 인증 시간 준수 | 20 | 예정 시각부터 2시간 이내 인증한 날 / 현재 인정 출석일 × 20 |
| 추가 운동 성장 | 10 | 쉬는 요일 운동 또는 주차별 챌린지 목표 초과 출석이 이전보다 주당 1일 늘면 10 |

출석은 이전보다 증가해야만 점수를 주는 항목이 아닙니다. 예를 들어 개인 목표가 주 3일이면
3일을 채웠을 때 해당 주차 출석 배점의 상한에 도달합니다. 4일을 가도 해당 주차의 출석 배점은
늘지 않습니다. 2주 회차에서 첫 주에 몰아간 초과 출석으로 둘째 주의 부족분을 채우지 않습니다.
시작 예약 때 저장한 개인 운동 요일 수를 고정 목표로 사용합니다. 그 정보가 없는 회차는 시작 시점에
적용된 `weekly_promise_changes` 이력을 사용하며 현재 설정이나 방 공통 목표로 과거 개인 목표를
추정하지 않습니다. 개인 목표가 없거나 0일이면 출석 항목은 평가 불가입니다.

총중량은 **모든 세트의 중량(kg) × 반복 수를 합산한 값**입니다. 기존 중량·반복 30점과 세트 20점을
한 개의 총중량 성장 50점 항목으로 합쳤습니다. 10% 성장 = 25점, 20% 이상 성장 = 50점이며
감소·유지는 성장 점수 0입니다. 두 기간에 각각 2일 이상의 완료·인증 운동 세트와 양수인 이전 총중량이
있어야 평가합니다. 같은 중량/반복 조건이나 같은 종목이 있어야 한다는 채점 조건은 제거했습니다.
종목별 총중량·세트·반복과 동일 조건 비교는 상세 근거로 유지하지만 중복 채점하지 않습니다.
현재 출석·총중량은 인정된 인증 이벤트의 세션 ID로 연결하며 이전 기록은 같은 인증 방식으로 완료된
직전 동일 길이 기간(7/14/28일)의 운동입니다.

인증 시간은 `예정 시각 <= 인증 완료 시각 <= 예정 시각 + 2시간`이면 인정합니다.
예정 전 인증은 제외하고 정확히 2시간 뒤는 인정하며 1초라도 초과하면 제외합니다.
미루기로 변경된 세션 시각에서 30분 × 미룬 횟수를 빼 원래 예정 시각을 복원합니다.
현재 회차는 챌린지에 인정된 `challenge_verification_events.accepted_at`을 사용하므로 출발 버튼을
누르지 않아도 채점할 수 있고, 나중에 수정된 `workout_sessions.completed_at`으로 인증 시각이 바뀌지
않습니다. 두 기간의 시간 준수율 증가를 요구하지 않습니다. 기록이 없는 인증일의 배점을 다른 날에
나눠 주지 않습니다. 자정을 넘는 2시간 구간과 사용자 시간대 차이를 포함해 UTC 시각으로 비교합니다.

추가 운동 기준은 v1과 같습니다. 시작 예약 시 저장한 개인 요일을 두 기간에 동일 적용하며
이 정보가 없는 회차는 주차별 챌린지 목표 초과 출석으로 비교합니다.
개인 목표 달성·인증 시간 준수는 현재 수행 기준이고, 총중량·추가 운동은 이전 대비 성장 기준입니다.
평가 불가 배점은 재분배하지 않습니다. 평가 가능 배점이 50 미만이면 총점은 보류하되,
이미 산정된 출석·시간 준수 등의 항목 점수는 보여줍니다.

`challenge_evaluations.result_json.growth_reports`에 리포트를 저장하며 DB 마이그레이션은 없습니다.
`growth_v1` 확정 리포트가 있으면 최초 방장 조회 때 새 기준으로 한 번 재산정합니다.
이전 리포트는 비공개 `growth_report_history.growth_v1`에 보관하고
`snapshot_origin: criteria_recalculation`로 남아 있는 기록을 새 기준으로 재평가했음을 표시합니다.
원래 정산 시점의 수정 전 운동 기록을 복원한 값은 아닙니다. 이후 v2 조회는 고정된 스냅샷을 반환합니다.
성장 리포트가 없던 확정 회차는 `historical_backfill`로 한 번 생성합니다.
기존 챌린지의 출석 목표 달성 결과는 유지됩니다. 서버와 웹/앱 번들을 함께 배포하세요.

## 시작 전 챌린지 방 삭제

방장은 참여 중인 방 목록 또는 상세 상단의 `방 삭제` 버튼으로 삭제를 요청합니다.
앱 내부 확인창은 대상 방 이름을 표시하며 취소 버튼에 먼저 초점을 둡니다.
확인 전에는 API를 호출하지 않고, 처리 중에는 중복 삭제와 확인창 닫기를 막습니다.

`GET /api/v1/challenge-rooms`는 현재 사용자에게 적용되는 `can_delete`를 반환합니다.
방의 모든 회차 상태·시작 시각은 한 번에 조회하며 상세·삭제 API와 같은 판정 함수를 사용합니다.
`DELETE /api/v1/challenge-rooms/{room_uuid}`는 방장 권한과 시작 전 조건을 잠금 후 다시 확인합니다.
이전 회차가 시작되었거나 결과가 있는 방 전체는 삭제하지 않습니다.

삭제 성공 시 방·회차를 취소 상태로 보존하고 모든 참가자의 목록·상세 조회에서 제외합니다.
초대를 철회하고 아직 발송 대기 중인 알림을 취소하며 참가자 알림함에 삭제 사실을 남깁니다.
새 테이블이나 마이그레이션은 없으며, 목록의 삭제 버튼 표시에는 서버와 앱 번들 갱신이 모두 필요합니다.

## 운동 장소 이탈 시 운동 종료

`POST /api/v1/workout-timers/{timer_uuid}/location-exit`는 세션 쿠키로 인증하며
`request_id`(UUID), `expected_revision`(정수), `client_action_at`(시간대가 포함된 시각)을 받습니다.
운동 시간을 요청 도착 시각이 아니라 기기에 저장된 이탈 감지 시각까지 계산하고 타이머를
`finished`로 전환하고 종료 시각도 이탈 감지 시각으로 저장합니다. 수동 일시정지 상태에서
이탈하면 일시정지 이후의 시간을 더하지 않고 종료합니다. 이탈 시각은 현재 열린 구간의 시작 이후여야 하며 서버 시각보다
30초 이상 미래인 값은 거부합니다. 기기의 서버 시각 보정값을 이탈 시각에 적용합니다.

중복 요청은 같은 상태를 반환합니다. 저장한 버전과 달라진 타이머나 이미 종료한 타이머에는 늦게 도착한
이탈 요청을 적용하지 않습니다. 6시간 만료 처리만 진행된 타이머는 복구할 수 있으나,
다른 타이머를 새로 시작했다면 기존 타이머를 다시 활성화하지 않습니다.
기존 타이머·구간·이벤트 테이블을 사용하므로 DB 마이그레이션은 없습니다.
Android·iOS 백그라운드에서 이탈 시각을 기기에 저장하고 앱 복귀 또는 연결 복구 시 반영하며,
서버와 앱 번들을 함께 업데이트해야 합니다.

## 2026-10-12: 기존 데이터 기반 수행·유지·복귀 리포트

개인 리포트 해석은 `performance_report_v3`입니다. `insights.performance`와
`insights.journey_performance`에 동일 종목·중량의 최고 반복 수, 동일 종목·반복 수의 최고 중량을
비교합니다. 종목 ID와 소스를 함께 사용하며 삭제된 종목을 이름으로 연결하지 않습니다.
`confirmation_days`는 현재 최고 기록이 확인된 서로 다른 운동일 수입니다.
같은 날 여러 세트는 1일로 계산하며 2일 이상이면 반복 확인, 1일이면 관찰로 구분합니다.
맨몸 운동은 같은 0kg 조건에서 반복 수를 비교하고 0kg → 0kg을 중량 유지 근거로 세지 않습니다.

수행 향상·유지·확인 필요·혼합·자료 부족은 총중량과 분리합니다. 한 종목의 여러 비교 조건은
종목 수에서 중복 집계하지 않습니다. 총중량·세트·운동일 변화는 보조 훈련량이며 수행 저하의
판정 입력으로 사용하지 않습니다. 자세·가동 범위·운동 강도가 같았는지는 기존 데이터로 확인할 수 없습니다.

출석이 같은 완료 목표 주도 표시합니다. 개인 목표 연속 달성은 저장된 목표 이력에서 계산하며
진행 중인 주는 연속 달성에 추가하지 않습니다. 미달 후 운동 재개는 복귀 진행 중,
완료 목표 주의 목표를 채우면 복귀 달성으로 구분하고 선택 기간의 첫 복귀일을 확인합니다.
한국어·영어 상세 화면, 텍스트 내보내기, 공유 이미지의 대표 근거에 같은 해석을 사용합니다.

팀 리포트의 새 해석 버전은 `performance_evidence_v1`이며 기존 `growth_v2` 점수와 별개입니다.
방장 전용 목록 API에 `growth_summary`와 `team_summary`, 상세에 `growth_evidence`를 제공합니다.
팀 집계는 전체 인원, 동일 조건 비교 가능 인원, 자료 부족 인원을 공개하고 향상·반복 유지·목표 달성·복귀를
분리합니다. 목표 달성 분모는 저장된 개인 목표를 평가할 수 있는 인원입니다. 항목 간 중복은 허용합니다.
팀 목표 주는 월~일이 아니라 회차 시작일부터 7일 구간이며, 연속 달성은 저장된 이전·현재 비교 기간 안에서만 계산합니다.

이미 저장된 `growth_v2` 리포트는 저장된 종목별 세트 로그와 주차별 목표·출석으로 해석을 도출합니다.
이번 해석 추가로 확정 점수·원본 스냅샷을 수정하거나 현재 운동 기록을 다시 조회하지 않습니다.
기존 점수는 참고 상세에 남기고 팀원 목록·대표 해석에는 사용하지 않습니다. 기존 v1 → v2 처리 흐름은 유지합니다.
DB 마이그레이션이나 입력 항목 추가는 없으며 서버와 웹/앱 번들을 함께 업데이트해야 합니다.

개인 화면은 전후 수행 그래프·목표 주 상태·복귀 흐름·짧은 비교 표로 요약하고 상세 근거를 접습니다.
`consistency.period_weeks`는 표시용 목표 주이며 휴식·진행 중 주를 포함합니다. 기존 `weeks`와 목표 달성
분모는 완료된 목표 주만 유지합니다. 과거 월말의 불완전한 목표 주는 부분 주로 표시하고 평가에서 제외합니다.
팀 화면은 비교 날짜·기록일·반복 확인, 저장된 이전·현재 목표, 유지된 훈련량 수치와 비교 기준이 없는
종목의 세트 로그까지 보여줍니다. 성장 방향 논의는 기록에서 도출한 확인 항목이며 방장의 판단을 대체하지 않습니다.
공유 PNG는 수행·목표 유지·복귀 요약과 전후 그래프를 사용하고 텍스트 내보내기는 전체 근거를 유지합니다.

변경 전후 재현 데이터, 검증 범위와 결과: [개선 비교 리포트](../docs/report-improvement-2026-10-12.html).


## 계정 삭제·커뮤니티 안전 기능 (2026-10-16)

배포 전 `supabase/migrations/20261016044732_account_deletion_and_community_safety.sql`을 적용해야 합니다.
운영자 권한은 서버 환경변수 `MODERATOR_USER_UUIDS`의 계정 UUID 허용 목록으로 부여하며 기본값 `[]`는 접근을 거부합니다.
신고 조회·처리는 앱 설정의 운영자 신고 관리에서 수행합니다. 이메일 주소는 권한 판단에 사용하지 않습니다.

| API | 기능 |
| --- | --- |
| `GET /api/v1/policies/community` | 현재 약관 버전과 한국어·영어 전문 |
| `PUT /api/v1/me/community-consent` | 현재 버전 동의 저장 |
| `DELETE /api/v1/me/account` | 로그인 계정 삭제, 현재 비밀번호·DELETE 확인 필요 |
| `POST /api/v1/auth/delete-account` | 세션 없이 이메일·비밀번호·DELETE로 계정 삭제. 이용 제한 계정도 사용 가능 |
| `GET /api/v1/safety/status` | 동의 상태와 운영자 여부 |
| `GET /api/v1/safety/blocks` | 내가 차단한 사용자 목록 |
| `PUT/DELETE /api/v1/safety/blocks/{user_uuid}` | 사용자 차단·해제 |
| `POST /api/v1/safety/reports` | 사용자·방·질문·답변 신고 |
| `GET /api/v1/moderation/reports` | 운영자 전용 미처리/처리 이력·사진 삭제 대기/실패 수 |
| `POST /api/v1/moderation/reports/{report_uuid}/resolve` | 사유와 함께 숨김·이용 제한·종결 |
| `POST /api/v1/moderation/photo-cleanup/retry` | 운영자가 실패 파일 삭제를 명시적으로 재시도 |

가입 요청에는 `accepted_policy_version`이 필요합니다. 기존 계정은 커뮤니티 참여 전에 현재 정책을 수락하며, 개인 기록과 계정 삭제에는 새 정책 동의를 강제하지 않습니다.
계정 삭제는 자격 증명·전체 세션과 연관 개인 기록, 챌린지 평가 JSON의 현재·과거 사용자 사본까지 제거합니다.
탈퇴한 방장의 방은 개인정보가 담길 수 있는 이름·설명을 지우고 방장 공석으로 처리하며, 다른 참가자의 개인 기록은 유지합니다.
원본/가공 사진 삭제 작업은 DB 트랜잭션과 함께 저장되고 별도 작업자가 30초 주기로 최대 25개씩 처리합니다.
최초 시도와 재시도 두 번 후에는 실패 상태·로그를 남기며 운영자가 확인해야 합니다.
공급자가 이미 전달한 푸시, 오프라인 기기, 백업 및 외부 공유 사본 회수는 별도 운영 문제입니다.

외부 계정 삭제 페이지는 정적 빌드의 `/delete-account.html`입니다. 앱 설치·로그인 세션을 요구하지 않으며 실제 HTTPS API 주소와 CORS 설정으로 빌드·배포해야 합니다.
자세한 데이터 범위·보관 정책 미정 항목·검증 결과는 [개인정보 및 게시 안내](../docs/privacy-policy/README.md)를 참고하세요.
