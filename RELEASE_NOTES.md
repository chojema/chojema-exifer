# Chojema EXIFer 릴리스 노트 / Release Notes

작성자 / Author: Chulwoo Park (2026)

각 버전은 한국어 설명 뒤에 영문(English) 설명이 이어집니다.
Each version is described in Korean first, followed by English.

버전 번호는 `주.부.수` 형식(Semantic Versioning)을 따릅니다.

- 수(끝자리): 버그 수정 (예: 0.9.0 → 0.9.1)
- 부(가운데 자리): 기능 추가 (예: 0.9.x → 0.10.0)
- 주(앞자리): 검증을 마친 정식 출시 또는 호환성이 깨지는 변경 (예: 1.0.0)

Version numbers follow `MAJOR.MINOR.PATCH` (Semantic Versioning).

- PATCH: bug fixes (e.g. 0.9.0 → 0.9.1)
- MINOR: new features (e.g. 0.9.x → 0.10.0)
- MAJOR: verified official release or breaking changes (e.g. 1.0.0)

---

## 0.10.0 — 2026-10-27

Chulwoo Park, 2026

### 변경 사항

- 저장 파일 이름을 바꿨습니다. 이전에는 `사진명_edited.확장자`였고, 이제는 촬영 일시를 이름으로 한 `YYYY-MM-DD_HH-MM-SS_ed.확장자`입니다(예: `2024-05-01_10-20-30_ed.jpg`).
  - 일시·GPS 편집에서는 입력한 촬영 일시를, EXIF 복제에서는 복제 결과의 촬영 일시를 씁니다.
  - 같은 이름의 파일이 이미 있으면 `2024-05-01_10-20-30_ed (2).jpg`처럼 번호를 붙입니다.
  - 촬영 일시가 없으면 원본 파일의 수정 시각을 씁니다.
- PNG 사진은 JPG로 변환해 저장합니다. PNG의 EXIF는 많은 뷰어와 사진 앱에서 읽지 못하기 때문입니다.
  - 일시·GPS 편집과 EXIF 복제(대상 사진이 PNG일 때) 모두 해당합니다.
  - 투명한 부분은 흰색이 됩니다. 기존 메타데이터와 색상 프로파일은 옮겨 담습니다.
  - PNG를 고르면 화면에 변환 안내가 나타납니다.

### 설치 파일

- `Chojema EXIFer-0.10.0-arm64.dmg`: Apple Silicon Mac
- `Chojema EXIFer-0.10.0-x64.dmg`: Intel Mac
- `Chojema EXIFer Setup 0.10.0.exe`: Windows 64비트

### English

#### Changes

- New output file names. Previously `name_edited.ext`; now the date taken, `YYYY-MM-DD_HH-MM-SS_ed.ext` (e.g. `2024-05-01_10-20-30_ed.jpg`).
  - Date/GPS editing uses the date taken you entered; EXIF copy uses the date taken of the copied result.
  - If that name already exists, a number is added, as in `2024-05-01_10-20-30_ed (2).jpg`.
  - Without a date taken, the original file's modification time is used.
- PNG photos are converted to JPG when saved, because many viewers and photo apps do not read EXIF in PNG.
  - Applies to date/GPS editing and to EXIF copy when the target photo is a PNG.
  - Transparent areas become white. Existing metadata and the color profile are carried over.
  - A conversion notice appears when a PNG is selected.

#### Installers

- `Chojema EXIFer-0.10.0-arm64.dmg`: Apple Silicon Mac
- `Chojema EXIFer-0.10.0-x64.dmg`: Intel Mac
- `Chojema EXIFer Setup 0.10.0.exe`: Windows 64-bit

---

## 0.9.1 — 2026-10-27

Chulwoo Park, 2026

### 변경 사항

- 앱 전용 아이콘을 추가했습니다. 이전에는 Electron 기본 아이콘이 표시되었습니다.
  - 디자인: 사진 위에 시계가 든 위치 핀을 겹쳐, 이 앱이 다루는 "언제(일시)"와 "어디서(GPS)"를 나타냅니다.
  - macOS(`.icns`)와 Windows(`.ico`)용을 각각 만들었습니다. 원본은 `build/icon.svg`이며, `npm run make:icons`로 다시 생성할 수 있습니다.
- 설치 파일에 앱 실행과 무관한 개발용 파일(테스트·빌드 스크립트·문서)이 함께 들어가던 문제를 고쳤습니다.
- 라이선스를 MIT로 정했습니다.
- 기능 변경은 없습니다.

### 설치 파일

- `Chojema EXIFer-0.9.1-arm64.dmg`: Apple Silicon Mac
- `Chojema EXIFer-0.9.1-x64.dmg`: Intel Mac
- `Chojema EXIFer Setup 0.9.1.exe`: Windows 64비트

### English

#### Changes

- Added a dedicated app icon. Previously the default Electron icon was shown.
  - Design: a location pin with a clock for its head, over a photo, representing the "when (date)" and "where (GPS)" this app handles.
  - Separate icons for macOS (`.icns`) and Windows (`.ico`). The source is `build/icon.svg`; regenerate with `npm run make:icons`.
- Fixed installers that also bundled development files unrelated to running the app (tests, build scripts, documents).
- The license is now MIT.
- No feature changes.

#### Installers

- `Chojema EXIFer-0.9.1-arm64.dmg`: Apple Silicon Mac
- `Chojema EXIFer-0.9.1-x64.dmg`: Intel Mac
- `Chojema EXIFer Setup 0.9.1.exe`: Windows 64-bit

---

## 0.9.0 — 2026-10-27

Chulwoo Park, 2026

첫 공개 버전입니다. 기능은 모두 갖췄고, Windows 실기기 검증과 실제 촬영 사진 검증을 마치면 1.0.0으로 정식 출시할 예정입니다.

### 지원 환경

- 운영체제: Windows 10/11 (64비트), macOS (Apple Silicon, Intel)
- 파일 형식: JPEG, HEIC/HEIF, TIFF, WebP, PNG
- 제외 형식: RAW, GIF, BMP, 동영상

### 주요 기능

**일시·GPS 편집**

- 촬영 일시, 수정 일시, 시간대만 입력하면 관련 일시 태그 전체에 반영됩니다.
  - 촬영 일시: EXIF 촬영·디지털화 일시와 시간대, XMP 생성 일시, IPTC 생성 일시(JPEG·TIFF), PNG 생성 일시, GPS 날짜·시각(UTC로 자동 계산)
  - 수정 일시: EXIF 수정 일시와 시간대, XMP 수정·메타데이터 일시, PNG 수정 일시
- 원래 값이 없는 사진에도 새로 기록합니다.
- 파일 생성·수정 시각(탐색기·Finder에 보이는 값)도 함께 바꿀 수 있습니다.
- "고급 보기"에서는 기록될 태그를 하나씩 확인하고, 값을 고치거나 제외할 수 있습니다.
- GPS는 유지, 새로 지정, 삭제 중에서 고릅니다. 위치는 지도 클릭, 좌표 입력, "위도, 경도" 붙여넣기로 정할 수 있습니다.

**EXIF 복제**

- 두 사진을 나란히 놓고, 원본 사진의 EXIF를 대상 사진에 복제합니다.
- 전체를 복제하거나 항목을 골라 복제합니다. 항목은 일시, GPS, 카메라·렌즈, 촬영 설정, 작성자·저작권·설명입니다.
- 대상 사진의 기존 메타데이터를 지운 뒤 복제하는 옵션이 있습니다.
- 해상도, 회전 정보, 썸네일, 제조사 전용 데이터(MakerNote), 색상 프로파일은 대상 사진의 것을 유지합니다.
- 형식이 다른 사진끼리도 복제할 수 있습니다(예: HEIC → JPEG).

**원본 보존**

- 원본 파일은 수정하지 않습니다. 결과는 항상 `사진명_edited.확장자`로 새로 저장합니다. 같은 이름의 파일이 이미 있으면 `사진명_edited (2).확장자`처럼 번호를 붙입니다.

### 알려진 제한 사항

- 지도를 보려면 인터넷 연결이 필요합니다(OpenStreetMap). 연결이 없어도 좌표를 직접 입력하면 GPS를 설정할 수 있습니다.
- 코드 서명을 하지 않아 첫 실행 때 보안 경고가 나타납니다.
  - macOS: 앱을 마우스 오른쪽 버튼으로 클릭하고 "열기"를 선택합니다.
  - Windows: SmartScreen 창에서 "추가 정보"를 누른 뒤 "실행"을 선택합니다.
- 여러 사진을 한 번에 처리하는 일괄 처리 기능은 이번 버전에 없습니다.
- PNG의 EXIF는 일부 뷰어와 사진 앱에서 표시되지 않을 수 있습니다.

### 검증 현황

- 완료: JPEG, PNG, TIFF, HEIC, WebP 형식별 자동 테스트 36개 항목 통과. macOS(Apple Silicon) 설치본에서 동작 확인.
- 남은 검증: Windows 실기기 동작(특히 파일 생성 시각 변경), 아이폰 세로 사진(HEIC)의 미리보기 회전, 실제 카메라 사진.

### 설치 파일

- `Chojema EXIFer-0.9.0-arm64.dmg`: Apple Silicon Mac
- `Chojema EXIFer-0.9.0-x64.dmg`: Intel Mac
- `Chojema EXIFer Setup 0.9.0.exe`: Windows 64비트

### English

The first public version. It is feature-complete; it will be released officially as 1.0.0 after verification on real Windows PCs and with real camera photos.

#### Supported environments

- OS: Windows 10/11 (64-bit), macOS (Apple Silicon, Intel)
- File formats: JPEG, HEIC/HEIF, TIFF, WebP, PNG
- Not supported: RAW, GIF, BMP, video

#### Key features

**Date/time and GPS editing**

- Enter just the date taken, date modified, and time zone, and every related date tag is updated.
  - Date taken: EXIF date taken/digitized and time zone, XMP create date, IPTC date created (JPEG, TIFF), PNG creation time, GPS date/time (computed in UTC automatically)
  - Date modified: EXIF modify date and time zone, XMP modify/metadata date, PNG modify date
- Values are written even when the photo had none.
- File creation/modification times (as shown in Explorer or Finder) can be changed too.
- "Advanced view" lists each tag to be written so you can check it, edit its value, or exclude it.
- GPS can be kept, set anew, or removed. Set the location by clicking the map, entering coordinates, or pasting "latitude, longitude".

**EXIF copy**

- Place two photos side by side and copy the EXIF of the source photo to the target photo.
- Copy everything or selected groups: date/time, GPS, camera/lens, exposure settings, author/copyright/description.
- Option to clear the target photo's existing metadata before copying.
- The target photo keeps its own resolution, orientation, thumbnail, manufacturer data (MakerNote), and color profile.
- Photos of different formats can be copied between (e.g. HEIC → JPEG).

**Originals preserved**

- Original files are never modified. Results are always saved as a new `photo_edited.ext`. If that name already exists, a number is added, as in `photo_edited (2).ext`.

#### Known limitations

- The map needs an internet connection (OpenStreetMap). Without one, you can still set GPS by entering coordinates.
- The apps are not code-signed, so a security warning appears on first launch.
  - macOS: right-click the app and choose "Open".
  - Windows: in the SmartScreen window, click "More info", then "Run anyway".
- Batch processing of multiple photos is not included in this version.
- EXIF in PNG files may not be shown by some viewers and photo apps.

#### Verification status

- Done: 36 automated test checks pass across JPEG, PNG, TIFF, HEIC, and WebP. Verified working on an installed macOS (Apple Silicon) build.
- Remaining: behavior on real Windows PCs (especially changing file creation time), preview rotation of portrait iPhone photos (HEIC), real camera photos.

#### Installers

- `Chojema EXIFer-0.9.0-arm64.dmg`: Apple Silicon Mac
- `Chojema EXIFer-0.9.0-x64.dmg`: Intel Mac
- `Chojema EXIFer Setup 0.9.0.exe`: Windows 64-bit
