# 2026-11-18 카테고리별 인체도 타겟 배포

소스 커밋: `c733a76`.

- 큰 카테고리를 먼저 고르고 해당 부위에 속하는 세부 타겟만 인체도에서 다중 선택합니다.
- 카테고리를 바꾸면 세부 선택을 초기화하며 서버에서도 분류 일치를 검증합니다.
- 큰 부위 성장추이에 하위 부위 기록을 반영합니다.
- 사진 인증·수동 출석 후 운동 시간 종료 여부를 확인합니다.

## 서버

- 이미지: `ghobekang/donskipworkout-api:muscle-targets-20261118-feb024806b`.
- 실제 운영 DB는 읽기 전용으로 확인했고 쓰기 시나리오는 격리 메모리 DB에서 실행했습니다.
- 검증 65개 통과, Docker healthy, HTTPS 헬스 200, 보호 경로 4개 401, 시작 오류 0건입니다.
- 복구 자료: `/home/dontskip/deployments/muscle-targets-20261118-feb024806b`.
- 배포 로그와 검증 자료: `review/muscle_targets_release_20261118/`.

## Android

- 버전: `1.0.2 (14)`, 앱 ID: `com.donskip.attendancecheck`.
- 기존 업로드 인증서 일치, APK/AAB 서명, 필수 검사 및 배포 빌드 통과.
- 내보낸 화면 파일 63개가 APK/AAB와 일치하며 운영 API 연결과 개인 파일 미포함을 확인했습니다.
- 내부 테스트 릴리스 10: `Available to internal testers` 상태를 확인했습니다.
- 비공개 Alpha 릴리스 12: 심사 요청을 제출했으며 `Changes in review` 및 사전 자동 검사 진행 상태를 확인했습니다.
- 사전 검사·Google 승인 완료는 확인하지 않았습니다. 공개 운영 트랙, 기존 테스터·국가 설정은 변경하지 않았습니다.
- 최신 관측 상태는 `release-status.json`, 실제 페이지 문구는 리뷰 폴더의 `play-*.txt`에 기록했습니다.
- [내부 테스트 설치](https://play.google.com/apps/internaltest/4700597736683655910).
- 실제 기기 설치·알림 전달 검증은 수행하지 않았습니다.

iOS 앱·빌드·배포 작업은 실행하지 않았습니다.
