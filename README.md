# pharmabin-data

「폐의약품 수거함 찾기」 앱(`kr.ulsan.ldh.pharmabin`)이 읽는 공공데이터 스냅샷입니다.
공공데이터포털 [전국폐의약품수거함표준데이터](https://www.data.go.kr/data/15129445/standard.do)를 받아 GitHub Pages에 정적 JSON으로 올립니다.

```
https://ldh-prog.github.io/pharmabin-data/v1/meta.json
https://ldh-prog.github.io/pharmabin-data/v1/points.json
https://ldh-prog.github.io/pharmabin-data/v1/bins/{시도코드}.json
```

## 왜 이렇게 하나

- **인증키를 앱에 넣지 않으려고.** 빌드 시크릿으로 넣어도 APK 안에 그대로 남습니다(발급기 앱 1.0.2까지의 실수). 키는 개발자 맥의 키체인에만 둡니다.
- **국내 맥에서 받습니다.** GitHub Actions 러너(미국)에서는 data.go.kr 연결이 시간 초과로 끊깁니다(kiosk-data에서 2회 확인). Actions는 테스트만 돌립니다.
- **내용이 바뀐 날에만 배포합니다.** 원본은 지자체 데이터를 월 1회 병합합니다. 매일 받되, `contentHash`가 직전 배포와 같으면 push하지 않습니다.
- **API 부담이 작습니다.** 7,696건(2026-10)이 1,000건/쪽으로 8쪽입니다. 개발 계정 트래픽(하루 1만)으로 충분합니다.

## 데이터 다듬기

필드 이름은 API 원본(`instlPlcNm`, `lat`, `lot`, `insttNm` …) 그대로 두고, 값만 다듬습니다. 앱의 `toBin()`이 원본 이름을 읽습니다.
API 응답은 `{header, body}`가 최상위에 바로 옵니다(2026-10-13 확인). 포털 문서처럼 `response`로 감싼 응답도 같게 읽습니다.

| 처리 | 이유 |
| --- | --- |
| 시도명 → 법정 시도코드 2자리(파일 이름) | 원본에 시도 코드가 없습니다. `강원도`·`전라북도` 같은 옛 이름과 줄임말도 맞춥니다. `광주시`는 경기도 광주시와 겹쳐 맞추지 않습니다 |
| 광주광역시·전라남도 → 전남광주통합특별시(`12`) | 2026-07-01 통합(행정안전부 법정동코드 jscode20260701). 2026-10 원본에 통합 후 이름 1,014건과 옛 이름 `전라남도` 446건이 섞여 있어 둘 다 `12`로 모읍니다. 주소 문자열은 원본 그대로 둡니다 |
| 시군구명 `없음` → 빈 값 | 시군구가 없는 세종의 원본 값입니다(231건). 앱의 시·군·구 목록에 ‘없음’이 뜨지 않게 합니다 |
| 시도명이 비면 주소 첫 낱말, 시군구명이 비면 주소 두 번째 낱말 | 일부 지자체 행이 비어 있습니다 |
| 위경도 뒤바뀜 보정, 대한민국 밖(0,0 등) 좌표 제거 | 좌표 없는 수거함도 목록에는 남깁니다(거리순에서 뒤로) |
| 다른 시도에 찍힌 좌표 제거 | 같은 시도의 다른 수거함이 30km 안에 없고 다른 시도 수거함이 3km 안에 있으면 지오코딩 오류로 봅니다(2026-10: 대구 주소 약국이 부산 좌표, 1건). 그대로 두면 부산 사용자에게 가까운 수거함으로 뜨고 앱이 대구 파일까지 받습니다. 섬은 다른 시도도 멀어 걸리지 않습니다 |
| 날짜를 `YYYY-MM-DD`로 | `20260915`, `2026.9.1` 등 지자체마다 다릅니다 |
| 같은 기관·장소명·주소·세부위치는 하나만 | 병합 중 중복 |
| `binId` 추가 | 기관·장소명·주소·세부위치로 만든 53비트 해시. 좌표를 고쳐도 같습니다. 앱의 ‘여기 없었어요’ 표시가 이 id에 붙습니다 |
| 장소명·시도를 알 수 없는 행은 버림 | 앱에서 찾을 수 없습니다. 건수는 `meta.json`에 남깁니다 |

배포 전 안전장치: 받은 행이 `totalCount`의 99% 미만, 3,000건 미만, 직전 배포의 90% 미만이면 실패합니다. 직전 배포본을 네트워크 문제로 못 읽으면 첫 실행처럼 굴지 않고 멈춥니다.

## 파일 형식 (v1)

| 파일 | 내용 |
| --- | --- |
| `v1/meta.json` | `{schema, generatedAt, source, sourceMode, contentHash, bins:{count, withCoordinates, latestDataDate, dropped, duplicates, swappedCoordinates, misplacedCoordinates, sidos:{코드:{count, withCoordinates, districts:{시군구:건수}}}}}` |
| `v1/bins/{코드}.json` | `{schema, generatedAt, sidoCode, count, items:[{binId, instlPlcNm, ctpvNm, sggNm, lctnRoadNm, lctnLotnoAddr, lat, lot, actlPstn, mngInstNm, mngInstTelno, crtrYmd, insttCode, insttNm}]}` 빈 값은 뺍니다 |
| `v1/points.json` | `{schema, generatedAt, sidos:{코드:[[위도, 경도], …]}}` 소수 5자리. 앱이 위치를 보내지 않고 기기에서 가까운 시도를 고릅니다 |
| `index.html` | 사람이 보는 목록과 출처 |

데이터가 없는 시도(예: 제주, 2026-10)는 파일이 없고 앱은 404를 ‘데이터 없음’으로 읽습니다. 형식을 바꾸면 `v2/`에 올리고 `v1/`은 옛 앱을 위해 남깁니다.

## 설치

1. data.go.kr에서 **전국폐의약품수거함표준데이터 OpenAPI 활용신청**(자동승인). 발급기 앱과 같은 계정이면 인증키도 같습니다.
2. 키체인에 인증키를 넣습니다(`-w` 뒤를 비우면 입력을 묻습니다).
   ```bash
   security add-generic-password -U -s kr.ulsan.ldh.pharmabin-data -a DATA_GO_KR_SERVICE_KEY -w
   ```
3. GitHub에 `ldh-prog/pharmabin-data` 저장소를 만들고 이 폴더를 `main`으로 push합니다. Pages 원본은 **`gh-pages` 브랜치 / 루트**입니다(첫 배포 뒤 설정).
4. 한 번 직접 배포해 봅니다.
   ```bash
   FORCE=1 zsh scripts/publish-local.sh
   ```
5. 예약 작업을 설치합니다.
   ```bash
   zsh scripts/install-launchd.sh
   ```

## 운영

| 할 일 | 명령 |
| --- | --- |
| 지금 한 번 실행 | `launchctl kickstart gui/$UID/kr.ulsan.ldh.pharmabin-data` |
| 로그 | `~/Library/Logs/kr.ulsan.ldh.pharmabin-data.log` |
| 끄기 | `launchctl bootout gui/$UID/kr.ulsan.ldh.pharmabin-data` |
| 마지막 성공 시각 | `~/Library/Application Support/kr.ulsan.ldh.pharmabin-data/last-success` (epoch 초) |

- 하루 04·10·13·16·19·22시에 돌고, 오늘(KST) 성공했으면 건너뜁니다. 발급기 데이터(03·09·…시)와 한 시간 어긋나게 했습니다.
- 실패하면 다음 시간대에 다시 돕니다. 마지막 성공이 30시간을 넘으면 macOS 알림을 띄웁니다.
- 배포본은 한 커밋짜리 `gh-pages` 고아 브랜치로 강제 push합니다.

### API가 막혔을 때

포털에 로그인해 표준데이터 파일(JSON 또는 CSV)을 내려받으면 그 파일로 배포할 수 있습니다. CSV는 EUC-KR도 읽습니다. 건수 하한·직전 배포 90% 검사는 그대로 적용됩니다.

```bash
INPUT_FILE=~/Downloads/전국폐의약품수거함표준데이터.json FORCE=1 zsh scripts/publish-local.sh
```

## 개발

```bash
npm test             # 순수 함수 + 샘플 파일 빌드
npm run build:sample # test/fixtures 의 샘플로 site/ 생성 (앱 개발 서버에서 씀)
```

샘플(`test/fixtures/standard-sample.json`)은 이름이 모두 ‘샘플’로 시작하는 가짜 행입니다. 위경도 뒤바뀜·좌표 없음·(0,0)·중복·시도명 없음·장소명 없음·옛 시도명을 일부러 넣었습니다.

## 출처

공공데이터포털 「전국폐의약품수거함표준데이터」(각 지자체 제공, 월 1회 병합). 이설·철거가 늦게 반영될 수 있으니 방문 전 현장을 확인하세요.
