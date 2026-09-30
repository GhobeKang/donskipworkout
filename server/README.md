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
# server/.env에 운영 DB, CORS_ORIGINS, ALLOWED_HOSTS를 입력
$env:DOCKER_IMAGE_NAME = 'your-docker-id/donskipworkout-api:latest'
docker compose pull attendance_api
docker compose up -d --no-build attendance_api
docker compose ps
docker compose logs -f attendance_api
```

운영용 `compose.yaml`은 Dockerfile을 사용하지 않고 Docker Hub에서 이미지를 받아 실행합니다.
Dockerfile 빌드는 프로젝트 루트의 Docker Hub push 스크립트에서만 수행합니다.

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
docker compose pull attendance_api
docker compose up -d --no-build attendance_api
```

IPv4 환경에서는 Supabase Dashboard → Connect → **Session pooler(5432)** 연결을 사용합니다.
Direct connection은 IPv6가 필요합니다. Transaction pooler(6543)는 현재 설정에서 지원하지 않습니다.

사진 파일은 `attendance_photo_storage` 볼륨, 파일 로그는 `attendance_api_logs` 볼륨에
보존됩니다. 컨테이너는 비루트 사용자와 읽기 전용 루트 파일시스템으로 실행되며, 로그와
사진 디렉터리만 쓸 수 있습니다. `server/photo-frames`는 `/app/media/frames`에 읽기 전용으로
마운트됩니다. Docker 이미지에는 `.env`, 로그, 사진, 프레임 PNG, 가상환경을 넣지 않습니다.

운영 시에는 다음 순서로 진행합니다.

1. 새 프로젝트는 DB 관리자 계정으로 `supabase/migrations/*.sql`을 파일명 순서대로 적용합니다.
2. `server/.env`에 실제 DB 접속 정보와 운영용 `CORS_ORIGINS`, `ALLOWED_HOSTS`를 입력합니다.
3. `DOCKER_IMAGE_NAME`을 push한 이미지로 설정하고 `docker compose pull attendance_api`를 실행합니다.
4. `docker compose up -d --no-build attendance_api`로 실행하고 `docker compose ps`에서 `healthy` 상태를 확인합니다.

마이그레이션은 데이터 변경을 일으키므로 Docker 시작 명령에 포함하지 않았습니다. compose는
API 포트 `8000`을 호스트의 `127.0.0.1`에만 공개하므로 HTTPS reverse proxy가 이 주소로
전달하게 하세요. API 컨테이너를 다른 Docker 컨테이너의 reverse proxy에서 호출한다면
`ports` 대신 같은 Docker network를 사용하도록 compose를 조정해야 합니다.

## Supabase 연결 및 스키마

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

## API 계약

`/health`, 회원가입, 로그인을 제외한 모든 API에는 로그인 시 발급된 HttpOnly 세션 쿠키가
필요합니다. 입력 본문은 JSON입니다.
로그아웃도 `Content-Type: application/json`과 빈 객체 `{}`를 전달합니다.

| 메서드/경로 | 입력/출력 |
| --- | --- |
| POST `/api/v1/auth/register` | `email`, `password`(12~128자), `display_name` → 세션 만료초와 사용자; HttpOnly 쿠키 발급 |
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
  "roast_level": "off",
  "reuse_enabled": true,
  "notification_workout_enabled": true,
  "notification_free_workout_enabled": false,
  "notification_missed_enabled": true,
  "notification_snooze_enabled": true
}
```

요일은 JavaScript `getDay()`와 동일하게 일요일 0~토요일 6입니다. 빈 배열은 정기 일정 없음입니다.
알림 옵션은 저장할 뿐 서버에서 푸시를 발송하지는 않습니다. `notification_free_workout_enabled`는
정기 일정이 없는 날의 저장된 운동 시간에 기기 로컬 권유 알림을 한 번 예약합니다.
로그인 이메일은 소문자로 정규화하며 비밀번호는 Argon2로 해시합니다.
로그인은 JSON 방식으로, OAuth2 form 토큰 엔드포인트는 아닙니다.
서버 세션의 유휴 만료시간은 15분입니다. 인증된 요청이 들어올 때마다 DB 세션의 만료 시각과
HttpOnly 쿠키를 현재 시각 기준 15분 뒤로 갱신하며, 15분 동안 활동이 없으면 만료됩니다.
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

하루 기준과 주간 집계는 Asia/Seoul, 주 시작은 월요일입니다. DB 시각은 UTC, 응답 시각은 `Z` ISO 문자열입니다.
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
| GET `/api/v1/photo-effects` | 로그인 사용자에게 고정 필터·프레임 카탈로그 반환 |
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

업로드 필드: `photo`(JPEG 파일), `frame_id`, `filter_id`, `effect_version`, `workout_date`(서울 날짜),
`submission_id`(UUID), `note`(선택, 최대 1000자). 브라우저의 Origin은 CORS_ORIGINS 목록에 있어야 합니다.
일반 JSON API의 16KB 제한을 유지하고 사진 경로만 2MB + multipart 메타데이터 16KB를 허용합니다.
사진 본문 수신 제한은 30초이며 프런트엔드 요청 제한은 45초입니다.

파일 확장자를 신뢰하지 않고 Pillow로 JPEG 형식·완전 디코딩·900×1600 해상도·2MB 이하를 검증합니다.
EXIF/GPS 등 메타데이터를 제거하고, 서버가 원본 픽셀로 고정 필터와 프레임을 다시 합성합니다.
여기서 원본은 기기 원본 전체가 아니라 클라이언트가 자르지 않고 9:16 캔버스에 담은 **효과 적용 전 JPEG**입니다.
원본과 합성본을 비공개 `PHOTO_STORAGE_DIR`(기본 `server` 작업 디렉터리 기준 `media/photos`)에 저장합니다.
경로는 외부 정적 파일 서버에 노출하지 말고, 운영에서는 영속 볼륨과 DB를 함께 백업하세요.
여러 API 인스턴스는 같은 저장 볼륨을 사용해야 하며 현재 구현은 object storage를 사용하지 않습니다.

동일 submission_id/동일 내용의 재전송은 기존 결과를 반환합니다. 종료된 세션 덮어쓰기,
다른 날짜 요청, 허용되지 않은 효과, 같은 사용자가 이미 사용한 동일 디코딩 픽셀은 거부합니다.
사진 검증은 파일 유효성·소유권·정확히 동일한 사진 재사용 검사이며, 실제 운동 여부/촬영 시각을 판정하지 않습니다.
약간 수정한 과거 사진이나 다른 화면을 재촬영한 사진은 판별하지 못합니다.
저장 성공 후 DB에 출석을 반영합니다. 커밋 결과가 불확실한 실패에서는 파일을 보존하므로,
운영자는 실패 로그를 확인하고 오래된 UUID 디렉터리를 DB의 storage_key와 대조해 미참조 파일을 정리해야 합니다.

PNG 이미지 프레임은 `server/photo-frames`에 추가하면 파일 이름(확장자 제외)이 `frame_id`가 되고,
그 이름이 화면에 표시됩니다. API는 `/photo-effects` 요청마다 마운트 폴더를 검색하고 이미지는 인증된
`/photo-frames/{frame_id}` 경로로 전달하므로, PNG를 추가할 때 서버나 웹 앱을 다시 빌드하거나 재시작할
필요가 없습니다. 이미 열려 있는 인증 화면은 새로고침하면 새 목록을 읽습니다. 파일 이름은 영문·숫자·하이픈·
밑줄로 최대 64자까지 사용할 수 있습니다. 프레임 이미지는 투명 PNG를 권장하며 서버가 900×1600 사진 안에
비율을 유지해 알파 합성합니다. 도형 프레임은 `app/photo_effects.json`의 `frames`에서 관리합니다.
기존 효과를 바꿀 때는 새 frame_id/filter_id와 effect_version을 사용하세요. 저장된 합성본은 바뀌지 않습니다.
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

2026-09-24 전환 검증: 실제 deradera 연결과 7개 테이블 조회, API 가입·로그인·세션 만료·설정 저장·
출석·기록·사진 인증/중복 요청·다른 사용자 데이터 차단, DB 권한과 세션 시간 제한을 확인했습니다.
설정 검증을 포함한 15개 임시 테스트 항목과 Ruff lint/format 검증을 통과했습니다.
검증용 사용자·출석·사진 DB 행과 임시 테스트 소스는 정리했습니다.

배포 전 Supabase 스키마 마이그레이션을 적용하고, Python 3.12 환경에서 가입·로그인,
새로고침 세션 복원, 15분 유휴 만료, 활동 중 세션 갱신, 전체 기기 로그아웃, 사용자 데이터 격리 및 입력 검증을
확인해야 합니다. Ruff lint/format과 프론트엔드 정적 빌드를 CI에서 계속 실행하세요.

연결 방식 참고: [Supabase SQLAlchemy 연결 가이드](https://supabase.com/docs/guides/troubleshooting/using-sqlalchemy-with-supabase-FUqebT), [PostgreSQL 연결](https://supabase.com/docs/guides/database/connecting-to-postgres).


## 주간 약속 공유

`GET /api/v1/sharing/weekly?week_offset=0`은 로그인한 사용자의 주간 공유 데이터를 반환합니다.
`week_offset=1`은 지난주이며, API는 0~52 범위만 허용합니다. 주간 경계는 Asia/Seoul의 월요일~일요일입니다.

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
