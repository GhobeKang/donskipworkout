# Codemagic iOS 빌드와 TestFlight 업로드

저장소 루트의 `codemagic.yaml`에서 `ios-testflight` 워크플로를 실행합니다. Next.js 정적 export → Capacitor iOS 동기화와 CocoaPods 설치 → 빌드 번호 갱신 → App Store 서명 → IPA 생성 → App Store Connect 업로드 순서입니다.

## 이 앱에 연결한 값

| 항목 | 값 |
| --- | --- |
| 저장소 | `GhobeKang/donskipworkout` |
| Bundle ID | `com.donskip.attendancecheck` |
| App Store Apple ID | `6823856877` |
| Codemagic Apple 연동 이름 | `dontskip-appstore-key` |
| Apple Team ID | `HXFCFUL9YY` |
| Codemagic 배포 인증서 참조 이름 | `donskip_ios_distribution` |
| App Store 배포 프로파일 참조 이름 | `donskip_appstore_codemagic` |
| 워크스페이스 / 공유 스킴 | `ios/App/App.xcworkspace` / `App` |
| API origin | `https://kuuki-jp.com:8000` |
| 빌드 머신 / Xcode / Node | Mac mini M2 / Xcode 26.6 / Node 22 |

Apple 키 자체의 이름은 `donskip-appstore-key`이고, Codemagic에 등록된 연동 이름은 **`dontskip-appstore-key`**입니다. YAML에는 Codemagic의 연동 이름을 사용합니다. API 키·배포 개인키·인증서 암호는 저장소에 넣지 않습니다. 서버의 APNs 키는 이 빌드 설정에 사용하지 않습니다.

내려받은 서명 자료를 프로젝트에 보관할 경우 Git에서 제외한 `ios/signing/`을 사용합니다. 인증서 개인키와 암호는 별도로 안전하게 백업해야 합니다.

## 최초 실행 전 서명 준비

Codemagic Personal account settings → Code signing identities에서 다음을 준비합니다.

1. 이 Apple 팀의 유효한 Apple Distribution 인증서와 개인키를 등록하거나 Codemagic의 Generate certificate로 만듭니다. 기존 인증서를 불필요하게 폐기하지 않습니다.
2. `com.donskip.attendancecheck` 식별자에서 **Push Notifications**가 활성화되어 있는지 확인합니다.
3. 위 인증서와 식별자에 연결된 **App Store Connect 배포용 프로비저닝 프로파일**을 만들고 Codemagic에 등록합니다. Development·Ad Hoc 프로파일은 이 워크플로에 사용하지 않습니다.
4. YAML의 `ios_signing`은 Bundle ID와 배포 유형으로 이 서명 파일을 선택합니다. Release의 `aps-environment=production`을 지원하는 프로파일이어야 합니다.

새 인증서·프로파일 생성이나 서명 파일의 Codemagic 제공은 Apple 계정에 대한 접근 설정이므로 계정 소유자가 확인한 후 진행합니다.

2026-10-17 계정 소유자의 승인으로 위 배포 인증서와 앱 전용 프로파일을 생성해 Codemagic에 등록했습니다. 프로파일 만료일은 2027-10-17입니다. 서명 자료가 만료되거나 인증서를 교체하면 프로파일도 갱신해야 합니다.

## 실행

1. 이 설정이 포함된 브랜치를 원격 저장소에 올립니다.
2. Codemagic → Applications → donskipworkout → 해당 브랜치 선택 → Check for configuration files.
3. `ios-testflight`를 선택하고 Start new build를 실행합니다. 자동 push 트리거는 설정하지 않았습니다.
4. 성공하면 Codemagic에서 IPA를 내려받을 수 있습니다. App Store Connect → 이 앱 → TestFlight → iOS → **빌드 업로드**에서 Apple의 처리 결과를 확인합니다. **완료** 상태가 되어야 TestFlight 준비 완료로 판단합니다.

업로드는 자동이지만 **외부 베타 심사, 테스터 그룹 배정, App Store 정식 심사 제출은 자동으로 하지 않습니다.** `submit_to_testflight: false`는 업로드를 끄는 옵션이 아니라 외부 TestFlight 베타 심사 자동 제출을 끄는 옵션입니다. 내부 테스트 그룹에 빌드를 선택해 테스트하거나, 외부 테스트 정보 작성과 베타 심사 후 배포합니다.

## 업로드 및 처리 기록

- 2026-10-17 `codex/codemagic-ios-testflight` 브랜치의 `0ed1d18`로 iOS `1.0 (1)`을 빌드했습니다.
- [Codemagic 빌드와 IPA](https://codemagic.io/app/6ad2fb6fb2c924ab2bedd215/build/6ad2ffe47550aed8108f7c2c): Xcode 아카이브·IPA 내보내기·앱 ID와 위치 권한 검증을 통과했고 Apple 업로드 도구가 `UPLOAD SUCCEEDED`를 반환했습니다.
- [TestFlight iOS 빌드와 업로드 내역](https://appstoreconnect.apple.com/teams/29261b7d-3b33-41cc-864f-f9b608e445f2/apps/6823856877/testflight/ios): 업로드 후 Apple의 처리가 끝나야 테스터에게 배정할 수 있습니다.
- Apple 경고 `90068`: 현재 최소 지원 버전은 iOS 14.0이며, 2027년 4월부터 업로드하려면 iOS 15.0 이상을 대상으로 해야 합니다. 이번 업로드는 수락됐습니다. 이후 지원 버전을 올릴 때 Xcode 프로젝트와 Podfile을 함께 변경합니다.
- 전송 수락 이후 Apple의 빌드 처리는 `90683`(`NSPhotoLibraryUsageDescription` 누락)으로 실패했습니다. 기본 TestFlight 주소에서는 빌드가 없는 것으로 보이므로, `/testflight/ios` → **빌드 업로드** → **실패** 상세에서 실제 처리 결과를 확인해야 합니다. 전송 성공만으로 TestFlight 준비 완료로 판단하지 않습니다.
- 설치된 Capacitor Camera의 iOS 요구사항에 맞춰 사진 보관함 읽기·추가 목적 문구를 선언하고, IPA 업로드 전 카메라·사진 보관함 목적 문구 3개의 존재와 값을 검증합니다. 현재 사진 촬영은 계속 `CameraSource.Camera`, `saveToGallery: false`를 사용합니다. 이번 수정은 추가 권한 요청이나 갤러리 저장을 활성화하지 않습니다.
- 수정 빌드 `ee2e846`: [Codemagic 두 번째 빌드](https://codemagic.io/app/6ad2fb6fb2c924ab2bedd215/build/6ad304317550aed8108f7cd5)에서 iOS `1.0 (2)`를 3분 21초에 빌드·업로드했습니다. 실제 IPA에 카메라와 사진 보관함 목적 문구 3개가 포함되었고, Bundle ID·위치 권한 제거 검증도 통과했습니다.
- [TestFlight 1.0 (2)](https://appstoreconnect.apple.com/teams/29261b7d-3b33-41cc-864f-f9b608e445f2/apps/6823856877/testflight/ios/28da79fa-d349-45be-b674-bffdc21fe665)의 **빌드 업로드: 완료**, **진행 상태: 제출 준비 완료**를 실제 화면에서 확인했습니다. 외부 베타 심사나 테스터 초대·그룹 배정은 실행하지 않았습니다.

## 빌드 번호와 검증

### 로그인 검증

iOS API 요청은 `CapacitorHttp`로 전송하여 서버의 HttpOnly 세션 쿠키를 네이티브 저장소에서 유지합니다.
WebView의 일반 `fetch`는 `capacitor://localhost`와 외부 HTTPS API 사이의 쿠키 제한으로
로그인 응답을 받은 뒤에도 후속 요청이 401로 실패할 수 있습니다. CORS 허용만으로 해결되지 않습니다.
이 변경은 웹 자산에 포함되므로 새 TestFlight 빌드를 설치해야 합니다.

새 빌드에서 로그인 → 오늘 화면 조회 → 앱 완전 종료·재실행 → 세션 복원 → 사진 업로드·조회 →
로그아웃을 확인합니다. 요청 로그의 `transport=ios_native`로 전송 경로를 구분할 수 있습니다.
API 서버의 인증 실패 사유 로그도 배포하면 `missing_session_cookie`와 `session_expired`를 구분할 수 있습니다.
실기기 검증 전에는 로그인 문제가 완전히 해결됐다고 판단하지 않습니다.

2026-10-17 로컬 검증: 쿠키 차단을 모의한 클라이언트 10개 시나리오, 격리된 메모리 DB의
서버 인증 9개 시나리오, Next.js 빌드와 변경한 Python 파일의 Ruff 검사를 통과했습니다.
운영 API의 iOS Origin preflight는 200이며, 쿠키 없는 세션 조회의 401 응답에도 올바른 CORS 헤더가 포함됩니다.
이 결과는 iOS 실기기의 쿠키 저장·앱 재실행 검증을 대신하지 않습니다.

### 빌드 설정

- Apple의 App Store·TestFlight 전체 버전에서 최신 빌드 번호를 조회해 증가시키고, Codemagic의 프로젝트 빌드 번호가 더 크면 그 값을 사용합니다.
- Apple 조회 실패를 0으로 덮어쓰지 않습니다. 잘못된 키·연결 오류가 나면 빌드를 중단합니다. API 재시도는 최대 2회로 설정했습니다.
- 앱 버전 `1.0`은 Xcode 프로젝트에서 관리합니다. 다음 버전 출시 시 `MARKETING_VERSION`을 변경합니다.
- IPA의 Bundle ID, 비면제 암호화 미사용 선언, 위치 권한 설명 제거를 업로드 전에 확인합니다.
- 앱 자체의 UserDefaults 사용(구형 위치 설정 정리)에 필요한 `CA92.1` 사유를 PrivacyInfo에 선언했습니다.
- `ITSAppUsesNonExemptEncryption=false`는 현재 앱이 OS의 HTTPS·난수 기능을 사용하고 자체 비면제 암호화를 제공하지 않는 구성을 반영합니다. 암호화 기능이 바뀌면 이 선언을 다시 검토해야 합니다.
- 개인 계정의 M2 월 500분 무료 범위와 잔여 사용량을 확인하고 실행합니다. 워크플로의 최대 실행 시간은 45분입니다.

## 공식 자료

- [Capacitor 빌드](https://docs.codemagic.io/yaml-quick-start/building-an-ionic-app/)
- [iOS 코드 서명](https://docs.codemagic.io/yaml-code-signing/signing-ios/)
- [TestFlight 업로드와 베타 심사 옵션](https://docs.codemagic.io/yaml-publishing/app-store-connect/)
