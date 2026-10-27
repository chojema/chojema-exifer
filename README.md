# Chojema EXIFer

사진의 촬영·수정 일시와 GPS를 수정하고, 한 사진의 EXIF를 다른 사진으로 복제하는 Windows·macOS 데스크톱 앱입니다.
원본은 건드리지 않고 항상 `<이름>_edited.<확장자>` 새 파일로 저장합니다.

- 작성자: Chulwoo Park (2026)
- 라이선스: MIT — [LICENSE](LICENSE) 참고
- 현재 버전: 0.9.1 — 변경 내역은 [RELEASE_NOTES.md](RELEASE_NOTES.md) 참고

- 지원 형식: JPEG, HEIC/HEIF, TIFF, WebP, PNG (RAW·GIF·BMP·동영상 제외)
- 구성: Electron + ExifTool(`exiftool-vendored.pl` / `exiftool-vendored.exe`로 동봉)

## 개발

```sh
npm install
npm start                          # 앱 실행
npm test -- <샘플 사진 폴더>        # sample.jpg/png/tiff/heic/webp 등으로 통합 테스트
npm run dist                       # macOS + Windows 설치 파일 모두
npm run dist:mac                   # dist/*.dmg (arm64, x64)
npm run dist:win                   # dist/Chojema EXIFer Setup <버전>.exe
npm run clean:dist                 # dist 정리만 따로 실행
npm run make:icons                 # build/icon.svg → icon.png, icon.icns, icon.ico 재생성
```

### 빌드 후 정리 규칙

빌드가 끝나면 `scripts/clean-dist.js`가 자동으로 실행되어 `dist/`에 **설치 파일만** 남깁니다.

- 남김: `*.dmg`, `* Setup *.exe` — 배포용이며, 이전 버전 설치 파일도 기록으로 유지
- 삭제: 압축 해제된 앱 폴더(`mac/`, `mac-arm64/`, `win-unpacked/` 등), `*.blockmap`, `latest*.yml`
  (자동 업데이트용, 이 앱은 미사용), `builder-debug.yml` — 모두 다음 빌드에서 다시 생성됨
- 규칙에 없는 파일은 지우지 않고 그대로 두며 출력에 표시
- 새 빌드 산출물 종류가 생기면, 기록·재사용 가치가 없는 경우 `REMOVE_FILES`에 추가

Windows 빌드는 macOS에서도 만들 수 있지만, `exiftool-vendored.exe`가 설치되어 있어야 합니다
(`package.json` 의존성에 포함, 다른 OS에서는 `npm install --force`).

## 구조

- `src/main/exiftool.js` — ExifTool 실행 (UTF-8 인자 파일 사용)
- `src/main/metadata.js` — 읽기, 일시 태그 계획(`planDates`), 저장(`saveEdits`), EXIF 복제(`copyExif`)
- `src/main/preview.js` — HEIC/TIFF 미리보기 변환
- `src/renderer/` — 화면 (일시·GPS 편집, EXIF 복제 탭)

## 동작 메모

- 촬영 일시 → EXIF DateTimeOriginal/CreateDate/OffsetTime*, XMP(exif·xmp·photoshop), IPTC(JPEG·TIFF), PNG CreationTime, GPS 날짜·시각(UTC), 파일 생성 시각
- 수정 일시 → EXIF ModifyDate/OffsetTime, XMP ModifyDate/MetadataDate, PNG ModifyDate, 파일 수정 시각
- 파일 생성 시각: macOS는 `utimes`(과거 시각 지정 시 생성 시각도 이동), Windows는 ExifTool `FileCreateDate`
- EXIF 복제 시 제외: 해상도·크기, 회전, 썸네일·미리보기, MakerNote, ICC 프로파일, xmpMM, Photoshop IRB
- 지도: OpenStreetMap 타일 (인터넷 연결 필요)
