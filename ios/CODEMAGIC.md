# Codemagic iOS 빌드와 TestFlight 업로드

저장소 루트의 `codemagic.yaml`에서 `ios-testflight` 워크플로를 실행합니다. Next.js 정적 export → Capacitor iOS 동기화와 CocoaPods 설치 → 빌드 번호 갱신 → App Store 서명 → IPA 생성 → App Store Connect 업로드 순서입니다.

## 이 앱에 연결한 값

| 항목 | 값 |
| --- | --- |
| 저장소 | `GhobeKang/donskipworkout` |
| Bundle ID | `com.donskip.attendancecheck` |
| App Store Apple ID | `6823856877` |
| Codemagic Apple 연동 이름 | `dontskip-appstore-key` |
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

## 실행

1. 이 설정이 포함된 브랜치를 원격 저장소에 올립니다.
2. Codemagic → Applications → donskipworkout → 해당 브랜치 선택 → Check for configuration files.
3. `ios-testflight`를 선택하고 Start new build를 실행합니다. 자동 push 트리거는 설정하지 않았습니다.
4. 성공하면 Codemagic에서 IPA를 내려받을 수 있고, App Store Connect → 이 앱 → TestFlight에서 Apple 처리 상태를 확인할 수 있습니다.

업로드는 자동이지만 **외부 베타 심사, 테스터 그룹 배정, App Store 정식 심사 제출은 자동으로 하지 않습니다.** `submit_to_testflight: false`는 업로드를 끄는 옵션이 아니라 외부 TestFlight 베타 심사 자동 제출을 끄는 옵션입니다. 내부 테스트 그룹에 빌드를 선택해 테스트하거나, 외부 테스트 정보 작성과 베타 심사 후 배포합니다.

## 빌드 번호와 검증

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
