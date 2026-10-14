/**
 * 표준데이터에 없는 시·군·구를 채우는 지자체 폐의약품 파일데이터(공공데이터포털) 목록.
 *
 * 2026-10-14 카탈로그에서 ‘폐의약품’ 파일데이터를 찾아, 표준데이터에 없는 시·군·구의 수거함·수거 참여 약국 목록 중
 * 2023년 이후 자료이고 주소가 있는 것을 넣었다. 뺀 것과 이유는 README ‘지자체 파일데이터로 채우기’에 있다.
 * 표준데이터에 그 시·군·구가 생기면 표준데이터를 쓰고 이 행은 건너뛴다(mergeSupplements).
 *
 * 항목
 *   fileDataId     공공데이터포털 데이터 번호. 다운로드 주소는 빌드할 때 데이터 페이지에서 찾는다(해마다 바뀜).
 *   title          로그·index.html 에 보일 이름(포털 제목에서 날짜를 뺀 것)
 *   ctpvNm         시도. 파일에 없어 설정으로 채운다
 *   sggNm          시·군·구(앱의 시·군·구 목록 이름). 한 파일에 여러 시·군·구가 있으면 대신 districtColumn
 *   districtColumn 시·군·구가 든 열(전남·광주처럼 시도 전체 파일)
 *   insttNm        제공기관. 앱 상세에 ‘○○ 제공(지자체 파일데이터)’로 보인다
 *   columns        파일의 열 이름(공백 정리 후) → 스냅샷 필드. 하나라도 없으면 그 파일은 직전 배포본으로 대신한다
 *   nameColumns    이름 열이 없을 때 이어 붙여 장소명으로 쓸 열(대구 서구)
 *   addressPrefix  주소 앞에 시도·시군이 빠졌거나 줄임말·중복이면 바로잡을 앞부분. addressAliases 는 걷어 낼 줄임말
 *
 * 기준일 열이 없으면 내려받은 파일 이름의 날짜, 그것도 없으면 데이터 페이지 제목의 날짜를 쓴다.
 */
export const SUPPLEMENTS = [
  // 서울
  {
    fileDataId: "15074891",
    title: "서울특별시 용산구_폐의약품 수거가능위치 현황",
    ctpvNm: "서울특별시",
    sggNm: "용산구",
    insttNm: "서울특별시 용산구",
    // 명칭 열은 ‘폐의약품 전용수거함’·‘우체통’ 같은 종류라 세부 위치로 보이고, 장소명은 수거함위치로 쓴다.
    columns: { 수거함위치: "instlPlcNm", 명칭: "actlPstn", 도로명주소: "lctnRoadNm", 관리기관: "mngInstNm", 관리기관전화번호: "mngInstTelno" }
  },
  // 대구
  {
    fileDataId: "15113013",
    title: "대구광역시 동구_폐의약품 수거함 현황",
    ctpvNm: "대구광역시",
    sggNm: "동구",
    insttNm: "대구광역시 동구",
    columns: { "수거함 위치명": "instlPlcNm", 주소: "lctnRoadNm", 세부위치: "actlPstn", 관리기관명: "mngInstNm", 전화번호: "mngInstTelno" }
  },
  {
    fileDataId: "15112956",
    title: "대구광역시 서구_폐의약품 수거함 현황",
    ctpvNm: "대구광역시",
    sggNm: "서구",
    insttNm: "대구광역시 서구",
    // 장소명 열이 없다. ‘내당1동 약국’처럼 행정동과 구분을 이어 붙이고, 찾기는 주소로 한다.
    nameColumns: ["행정동", "관할구분"],
    columns: { 도로명주소: "lctnRoadNm" }
  },
  {
    fileDataId: "15113103",
    title: "대구광역시 수성구_폐의약품수거함현황",
    ctpvNm: "대구광역시",
    sggNm: "수성구",
    insttNm: "대구광역시 수성구",
    columns: { 기관명칭: "instlPlcNm", 소재지: "lctnRoadNm", 세부위치: "actlPstn", 전화번호: "mngInstTelno" }
  },
  // 인천
  {
    fileDataId: "15074640",
    title: "인천광역시 남동구_폐의약품 수거함 현황",
    ctpvNm: "인천광역시",
    sggNm: "남동구",
    insttNm: "인천광역시 남동구",
    columns: { 수거함위치명: "instlPlcNm", "도로명 주소": "lctnRoadNm", 세부위치: "actlPstn", 위도: "lat", 경도: "lot", 데이터기준일자: "crtrYmd" }
  },
  {
    fileDataId: "15074643",
    title: "인천광역시 남동구_폐의약품 수집참여 약국현황",
    ctpvNm: "인천광역시",
    sggNm: "남동구",
    insttNm: "인천광역시 남동구",
    columns: { 사업장명칭: "instlPlcNm", "사업장소재지(도로명주소)": "lctnRoadNm", 세부위치: "actlPstn", 소재지전화번호: "mngInstTelno", 데이터기준일자: "crtrYmd" }
  },
  {
    // 송도동만 담은 2025-04 파일(15143018, 인천광역시 제공)은 이 파일과 주소 10곳이 겹치고 더 오래돼 넣지 않는다.
    fileDataId: "15145898",
    title: "인천광역시 연수구_폐의약품수거함현황",
    ctpvNm: "인천광역시",
    sggNm: "연수구",
    insttNm: "인천광역시 연수구",
    columns: { 상호: "instlPlcNm", 도로명주소: "lctnRoadNm", 세부위치: "actlPstn", 위도: "lat", 경도: "lot" }
  },
  {
    fileDataId: "15074630",
    title: "인천광역시 영종구_폐의약품 수거함 현황",
    ctpvNm: "인천광역시",
    sggNm: "영종구",
    insttNm: "인천광역시 영종구",
    columns: { 명칭: "instlPlcNm", "소재지(도로명)": "lctnRoadNm", 데이터기준일: "crtrYmd" }
  },
  {
    fileDataId: "15074383",
    title: "인천광역시 옹진군_폐의약품수집",
    ctpvNm: "인천광역시",
    sggNm: "옹진군",
    insttNm: "인천광역시 옹진군",
    columns: { 폐의약품수거함위치명: "instlPlcNm", 소재지도로명주소: "lctnRoadNm", 소재지지번주소: "lctnLotnoAddr", 연락처: "mngInstTelno" }
  },
  // 대전
  {
    fileDataId: "15077803",
    title: "대전광역시 동구_폐의약품 수거함 및 수집 참여 약국 현황",
    ctpvNm: "대전광역시",
    sggNm: "동구",
    insttNm: "대전광역시 동구",
    columns: { 수거장소명: "instlPlcNm", "도로명 주소": "lctnRoadNm", 지번주소: "lctnLotnoAddr", 전화번호: "mngInstTelno" }
  },
  {
    fileDataId: "15101285",
    title: "대전광역시 중구_폐의약품 수거함 현황",
    ctpvNm: "대전광역시",
    sggNm: "중구",
    insttNm: "대전광역시 중구",
    columns: { 구분: "instlPlcNm", 주소지: "lctnRoadNm", 전화번호: "mngInstTelno", 데이터기준일자: "crtrYmd" }
  },
  {
    fileDataId: "15077823",
    title: "대전광역시 대덕구_폐의약품수거장소현황",
    ctpvNm: "대전광역시",
    sggNm: "대덕구",
    insttNm: "대전광역시 대덕구",
    columns: { 폐의약품수거장소명: "instlPlcNm", 소재지도로명주소: "lctnRoadNm", 전화번호: "mngInstTelno", 데이터기준일자: "crtrYmd" }
  },
  // 울산
  {
    fileDataId: "15168452",
    title: "울산광역시 북구_폐의약품 수거함 위치",
    ctpvNm: "울산광역시",
    sggNm: "북구",
    insttNm: "울산광역시 북구",
    columns: { 수거지명: "instlPlcNm", 주소: "lctnRoadNm", 세부위치: "actlPstn", 전화번호: "mngInstTelno", 관리기관명: "mngInstNm", 데이터기준일: "crtrYmd" }
  },
  // 경기
  {
    fileDataId: "15077990",
    title: "경기도 고양시_폐의약품 수거함 현황",
    ctpvNm: "경기도",
    sggNm: "고양시",
    insttNm: "경기도 고양시",
    columns: { 수거지명: "instlPlcNm", 주소: "lctnRoadNm", 전화번호: "mngInstTelno" }
  },
  {
    fileDataId: "15074686",
    title: "경기도 구리시_폐의약품 수거함 위치",
    ctpvNm: "경기도",
    sggNm: "구리시",
    insttNm: "경기도 구리시",
    columns: { "설치 장소": "instlPlcNm", "위치(도로명)": "lctnRoadNm", 위도: "lat", 경도: "lot", 전화번호: "mngInstTelno", 관리기관명: "mngInstNm", 데이터기준일자: "crtrYmd" },
    addressPrefix: "경기도 구리시",
    addressAliases: ["경기"]
  },
  {
    fileDataId: "15074687",
    title: "경기도 구리시_폐의약품 수집 협조 약국 현황",
    ctpvNm: "경기도",
    sggNm: "구리시",
    insttNm: "경기도 구리시",
    columns: { 약국명칭: "instlPlcNm", "약국소재지(도로명)": "lctnRoadNm", 위도: "lat", 경도: "lot", 전화번호: "mngInstTelno", 관리기관명: "mngInstNm", 데이터기준일자: "crtrYmd" },
    addressPrefix: "경기도 구리시",
    addressAliases: ["경기"]
  },
  {
    fileDataId: "15138648",
    title: "경기도 이천시_폐의약품 수거함(공공기관) 현황",
    ctpvNm: "경기도",
    sggNm: "이천시",
    insttNm: "경기도 이천시",
    columns: { 기관명칭: "instlPlcNm", "소재지(도로명주소)": "lctnRoadNm", 전화번호: "mngInstTelno" }
  },
  // 충남
  {
    fileDataId: "15126374",
    title: "충청남도 천안시_폐의약품 수거함 배부 위치",
    ctpvNm: "충청남도",
    sggNm: "천안시",
    insttNm: "충청남도 천안시",
    columns: { 수거장소명: "instlPlcNm", 도로명주소: "lctnRoadNm", 지번주소: "lctnLotnoAddr", "수거함 위치": "actlPstn", 데이터기준일자: "crtrYmd" },
    addressPrefix: "충청남도",
    addressAliases: ["충남"]
  },
  {
    fileDataId: "15094084",
    title: "충청남도 보령시_불용의약품수거함설치현황",
    ctpvNm: "충청남도",
    sggNm: "보령시",
    insttNm: "충청남도 보령시",
    columns: { 수거함설치장소: "instlPlcNm", 주소: "lctnRoadNm", 위도: "lat", 경도: "lot", 연락처: "mngInstTelno", 데이터기준일: "crtrYmd" }
  },
  // 전남광주
  {
    // 광산구는 표준데이터에 있어 건너뛰고 동구·서구·남구·북구만 쓰인다.
    fileDataId: "15077669",
    title: "전남광주통합특별시_폐의약품 수집 참여약국현황",
    ctpvNm: "전남광주통합특별시",
    districtColumn: "시군구",
    insttNm: "전남광주통합특별시",
    columns: { 약국명: "instlPlcNm", 소재지: "lctnRoadNm", 전화번호: "mngInstTelno", 데이터기준일자: "crtrYmd" }
  },
  {
    // 옛 전라남도 22개 시군 파일. 표준데이터에 있는 시군(강진·순천 등 12곳)은 건너뛴다. 주소에 시도가 없어 붙인다.
    fileDataId: "15113201",
    title: "전남광주통합특별시_폐의약품 수거함 현황",
    ctpvNm: "전남광주통합특별시",
    districtColumn: "시군",
    insttNm: "전남광주통합특별시",
    columns: { 설치장소: "instlPlcNm", 도로명주소: "lctnRoadNm", 비고: "actlPstn" },
    addressPrefix: "전라남도",
    addressAliases: ["전남"]
  },
  // 경북
  {
    fileDataId: "15113109",
    title: "경상북도 경주시_폐의약품 수거함 현황",
    ctpvNm: "경상북도",
    sggNm: "경주시",
    insttNm: "경상북도 경주시",
    columns: { 설치장소: "instlPlcNm", "주소(도로명)": "lctnRoadNm" }
  },
  {
    fileDataId: "15113129",
    title: "경상북도 구미시_폐의약품 수거함",
    ctpvNm: "경상북도",
    sggNm: "구미시",
    insttNm: "경상북도 구미시",
    columns: { 기관명칭: "instlPlcNm", "소재지(도로명주소)": "lctnRoadNm", 전화번호: "mngInstTelno", 데이터기준일자: "crtrYmd" },
    addressPrefix: "경상북도 구미시",
    addressAliases: ["경북"]
  },
  {
    fileDataId: "15126480",
    title: "경상북도 경산시_폐의약품수거함",
    ctpvNm: "경상북도",
    sggNm: "경산시",
    insttNm: "경상북도 경산시",
    columns: { "명 칭": "instlPlcNm", "주 소": "lctnRoadNm" },
    addressPrefix: "경상북도 경산시",
    addressAliases: ["경북"]
  },
  {
    fileDataId: "15113177",
    title: "경상북도 봉화군_폐의약품 수거함 위치",
    ctpvNm: "경상북도",
    sggNm: "봉화군",
    insttNm: "경상북도 봉화군",
    columns: { 명칭: "instlPlcNm", 주소: "lctnRoadNm", 데이터기준일: "crtrYmd" },
    addressPrefix: "경상북도 봉화군",
    addressAliases: ["경북"]
  },
  {
    fileDataId: "15113245",
    title: "경상북도 성주군_폐의약품 회수함 보관장소",
    ctpvNm: "경상북도",
    sggNm: "성주군",
    insttNm: "경상북도 성주군",
    columns: { "폐의약품 회수함 보관장소명": "instlPlcNm", 주소: "lctnRoadNm" },
    addressPrefix: "경상북도 성주군",
    addressAliases: ["경북"]
  },
  {
    fileDataId: "15113127",
    title: "경상북도 울릉군_폐의약품 수거함 현황",
    ctpvNm: "경상북도",
    sggNm: "울릉군",
    insttNm: "경상북도 울릉군",
    columns: { 영업소명: "instlPlcNm", "영업소소재지(도로명)": "lctnRoadNm", 영업소전화번호: "mngInstTelno" }
  },
  {
    fileDataId: "15113001",
    title: "경상북도 의성군_폐의약품 수거함 현황",
    ctpvNm: "경상북도",
    sggNm: "의성군",
    insttNm: "경상북도 의성군",
    columns: { 위치: "instlPlcNm", 상세주소: "lctnRoadNm", 데이터기준일자: "crtrYmd" },
    addressPrefix: "경상북도 의성군",
    addressAliases: ["경북"]
  },
  // 경남
  {
    fileDataId: "15126395",
    title: "경상남도 김해시_폐의약품 수거함 현황",
    ctpvNm: "경상남도",
    sggNm: "김해시",
    insttNm: "경상남도 김해시",
    columns: { 기관명: "instlPlcNm", 주소: "lctnRoadNm", 전화번호: "mngInstTelno", 위도: "lat", 경도: "lot" }
  },
  {
    fileDataId: "15124584",
    title: "경상남도 함안군_폐의약품 수거함 위치와 폐의약품 수집참여 약국현황",
    ctpvNm: "경상남도",
    sggNm: "함안군",
    insttNm: "경상남도 함안군",
    // 주소가 ‘경상남도 함안군 경상남도 함안군 가야읍 …’처럼 앞부분이 겹친 행이 있다.
    columns: { 기관명: "instlPlcNm", 주소: "lctnRoadNm", 전화번호: "mngInstTelno" },
    addressPrefix: "경상남도 함안군",
    addressAliases: ["경남"]
  }
];
