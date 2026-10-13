/**
 * 전국폐의약품수거함 표준데이터 스냅샷의 순수 함수 모음. 네트워크·파일은 build-snapshot.mjs 에서만 다룬다.
 *
 * 앱(kr.ulsan.ldh.pharmabin)은 표준데이터 API의 원본 필드명을 그대로 읽어 toBin()으로 매핑한다.
 * 그래서 필드 이름은 바꾸지 않고, 값만 다듬어(공백·좌표·날짜) 앱이 쓰는 필드만 남긴다.
 * 원본에 없는 필드는 binId 하나뿐이다.
 */
import { createHash } from "node:crypto";

export const SCHEMA_VERSION = 1;
/** 엔드포인트 이름의 lung_medicine 은 ‘폐(廢)의약품’을 ‘폐(肺)’로 옮긴 원본 그대로다. 오타가 아니다. */
export const API_URL = "https://api.data.go.kr/openapi/tn_pubr_public_lung_medicine_api";
export const SOURCE_URL = "https://www.data.go.kr/data/15129445/standard.do";
/** 표준데이터 API의 numOfRows 최대값. 7,696건(2026-10)이 8쪽이다. */
export const MAX_ROWS = 1000;

/** 앱의 toBin()이 읽는 필드. 이름은 2026-10-13 실제 API 응답 그대로다(제공기관은 insttCode·insttNm). */
export const BIN_FIELDS = [
  "binId",
  "instlPlcNm",
  "ctpvNm",
  "sggNm",
  "lctnRoadNm",
  "lctnLotnoAddr",
  "lat",
  "lot",
  "actlPstn",
  "mngInstNm",
  "mngInstTelno",
  "crtrYmd",
  "insttCode",
  "insttNm"
];

/** 포털에서 내려받은 표준데이터 파일(JSON·CSV)의 한글 열 이름 → API 필드명. */
export const STANDARD_COLUMN_FIELDS = {
  설치장소명: "instlPlcNm",
  시도명: "ctpvNm",
  시군구명: "sggNm",
  소재지도로명주소: "lctnRoadNm",
  소재지지번주소: "lctnLotnoAddr",
  위도: "lat",
  경도: "lot",
  세부위치: "actlPstn",
  관리기관명: "mngInstNm",
  관리기관전화번호: "mngInstTelno",
  데이터기준일자: "crtrYmd",
  제공기관코드: "insttCode",
  제공기관명: "insttNm",
  제공기관기관명: "insttNm"
};

/**
 * 법정동 시도코드 2자리(행정안전부 jscode20260701 기준 16개). 원본에는 시도 코드가 없고 시도명(ctpvNm)만 있어 이름으로 맞춘다.
 * 별칭은 원본에 남아 있는 옛 이름(강원도·전라북도)과 줄임말이다.
 * 광주광역시(29)·전라남도(46)는 2026-07-01 전남광주통합특별시(12)로 합쳐졌다. 2026-10 원본에도
 * 시도명이 ‘전라남도’인 행이 446건 남아 있어 두 옛 이름을 12의 별칭으로 둔다.
 * ‘광주시’는 경기도 광주시와 겹쳐 별칭에 넣지 않는다.
 */
export const SIDOS = [
  { code: "11", name: "서울특별시", aliases: ["서울시", "서울"] },
  { code: "12", name: "전남광주통합특별시", aliases: ["광주광역시", "광주", "전라남도", "전남"] },
  { code: "26", name: "부산광역시", aliases: ["부산시", "부산"] },
  { code: "27", name: "대구광역시", aliases: ["대구시", "대구"] },
  { code: "28", name: "인천광역시", aliases: ["인천시", "인천"] },
  { code: "30", name: "대전광역시", aliases: ["대전시", "대전"] },
  { code: "31", name: "울산광역시", aliases: ["울산시", "울산"] },
  { code: "36", name: "세종특별자치시", aliases: ["세종시", "세종"] },
  { code: "41", name: "경기도", aliases: ["경기"] },
  { code: "51", name: "강원특별자치도", aliases: ["강원도", "강원"] },
  { code: "43", name: "충청북도", aliases: ["충북"] },
  { code: "44", name: "충청남도", aliases: ["충남"] },
  { code: "52", name: "전북특별자치도", aliases: ["전라북도", "전북"] },
  { code: "47", name: "경상북도", aliases: ["경북"] },
  { code: "48", name: "경상남도", aliases: ["경남"] },
  { code: "50", name: "제주특별자치도", aliases: ["제주도", "제주"] }
];

const SIDO_BY_ALIAS = new Map(SIDOS.flatMap((sido) => [sido.name, ...sido.aliases].map((alias) => [alias, sido.code])));

/** 독도(131.87)·마라도(33.11)까지 들어가는 대한민국 범위. 밖이면 좌표가 틀린 것으로 본다. */
const KOREA_BOUNDS = { minLat: 33.0, maxLat: 38.7, minLon: 124.5, maxLon: 132.0 };

/** Encoding 키(%2F 등)를 넣어도 한 번만 디코딩한다. URLSearchParams 가 다시 인코딩한다. */
export function normalizeServiceKey(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed || !/%[0-9A-Fa-f]{2}/.test(trimmed)) {
    return trimmed;
  }
  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

/** item 이 1건이면 객체, 여러 건이면 배열, 0건이면 빈 문자열인 data.go.kr 응답을 배열로 맞춘다. */
export function asItemArray(items) {
  if (items == null || items === "") {
    return [];
  }
  if (Array.isArray(items)) {
    return items;
  }
  if (typeof items !== "object" || items.item == null || items.item === "") {
    return [];
  }
  return Array.isArray(items.item) ? items.item : [items.item];
}

export function isSuccessCode(code) {
  const normalized = String(code ?? "").trim();
  return normalized === "00" || normalized === "0000" || normalized === "0" || normalized === "200";
}

/** 표준데이터 API의 ‘데이터 없음’. 마지막 쪽 너머를 부르면 이 코드가 온다. */
export function isNoDataCode(code) {
  return String(code ?? "").trim() === "03";
}

/**
 * 재시도해도 소용없는 게이트웨이 오류. 20/30/31/32/33 인증·승인, 22 일일 한도 초과.
 */
export function isFatalGatewayCode(code) {
  return ["20", "22", "30", "31", "32", "33"].includes(String(code ?? "").trim());
}

export class ApiResponseError extends Error {
  constructor(message, code, fatal = false) {
    super(message);
    this.name = "ApiResponseError";
    this.code = code;
    this.fatal = fatal;
  }
}

/**
 * 게이트웨이 오류의 사유 코드. 정상 응답이면 null.
 * 이 API는 키 오류를 JSON(OpenAPI_ServiceResponse)으로 주지만, 다른 게이트웨이처럼 XML로 줄 때도 있다.
 */
export function gatewayReasonCode(body) {
  const text = String(body ?? "").trimStart();
  if (text.startsWith("<")) {
    if (!/<OpenAPI_ServiceResponse|<cmmMsgHeader/i.test(text)) {
      return null;
    }
    return text.match(/<returnReasonCode>([^<]*)<\/returnReasonCode>/i)?.[1]?.trim() || "UNKNOWN";
  }
  if (!text.includes("OpenAPI_ServiceResponse")) {
    return null;
  }
  try {
    const code = JSON.parse(text)?.OpenAPI_ServiceResponse?.cmmMsgHeader?.returnReasonCode;
    return code == null ? "UNKNOWN" : String(code).trim();
  } catch {
    return "UNKNOWN";
  }
}

/**
 * 응답의 {header, body}. 이 API는 최상위에 바로 두지만(2026-10-13 확인), 포털 문서와 다른 표준데이터 API처럼
 * response 로 한 번 감싸 올 때도 같은 결과가 되게 한다.
 */
function responseRoot(parsed) {
  return parsed?.response ?? parsed;
}

/**
 * 한 쪽의 응답 본문을 행 배열과 전체 건수로 바꾼다. 오류면 ApiResponseError.
 * 오류 메시지에는 요청 URL(인증키 포함)을 넣지 않는다.
 */
export function parseApiPage(body) {
  const reason = gatewayReasonCode(body);
  if (reason) {
    throw new ApiResponseError(
      `게이트웨이 오류 ${reason}${isFatalGatewayCode(reason) ? " (인증키·활용신청·일일 한도 확인)" : ""}`,
      reason,
      isFatalGatewayCode(reason)
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new ApiResponseError("응답이 JSON이 아닙니다.", "PARSE");
  }
  const header = responseRoot(parsed)?.header;
  if (header && isNoDataCode(header.resultCode)) {
    return { items: [], totalCount: 0 };
  }
  if (header && !isSuccessCode(header.resultCode)) {
    throw new ApiResponseError(`resultCode ${header.resultCode} ${header.resultMsg ?? ""}`.trim(), String(header.resultCode));
  }
  const responseBody = responseRoot(parsed)?.body;
  if (!responseBody) {
    throw new ApiResponseError("응답에 body가 없습니다.", "FORMAT");
  }
  return { items: asItemArray(responseBody.items), totalCount: Number(responseBody.totalCount ?? 0) };
}

/** 포털 표준데이터 파일의 한 행(한글 열 이름)을 API 필드명으로 바꾼다. 이미 API 필드명이면 그대로 둔다. */
export function fromStandardRecord(record) {
  const row = {};
  for (const [key, value] of Object.entries(record ?? {})) {
    const field = STANDARD_COLUMN_FIELDS[String(key).trim()] ?? (BIN_FIELDS.includes(key) ? key : null);
    if (field && row[field] == null) {
      row[field] = value;
    }
  }
  return row;
}

/**
 * 포털에서 받은 표준데이터 파일 내용. JSON은 {fields, records}·배열·API 응답 모양을, 나머지는 CSV로 읽는다.
 */
export function parseStandardFile(text) {
  const trimmed = String(text ?? "").replace(/^﻿/, "").trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);
    const records = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.records)
        ? parsed.records
        : asItemArray(responseRoot(parsed)?.body?.items);
    return records.map(fromStandardRecord);
  }
  const [header, ...rows] = parseCsv(trimmed);
  if (!header) {
    return [];
  }
  return rows
    .filter((cells) => cells.some((cell) => cell.trim() !== ""))
    .map((cells) => fromStandardRecord(Object.fromEntries(header.map((name, index) => [name, cells[index] ?? ""]))));
}

/** RFC 4180 CSV. 따옴표 안의 쉼표·줄바꿈과 "" 이스케이프를 처리한다. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** 포털 CSV는 EUC-KR(CP949)인 경우가 많다. BOM이나 올바른 UTF-8이 아니면 EUC-KR로 읽는다. */
export function decodeText(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("euc-kr").decode(bytes);
  }
}

export function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

/** 시도명이 비었거나 낯선 이름이면 주소의 첫 낱말로 시도를 찾는다. 못 찾으면 "". */
export function resolveSidoCode(row) {
  const byName = SIDO_BY_ALIAS.get(cleanText(row?.ctpvNm).replace(/\s+/g, ""));
  if (byName) {
    return byName;
  }
  for (const address of [row?.lctnRoadNm, row?.lctnLotnoAddr]) {
    const first = cleanText(address).split(" ")[0];
    const code = first ? SIDO_BY_ALIAS.get(first) : undefined;
    if (code) {
      return code;
    }
  }
  return "";
}

/** 시군구가 없는 세종은 원본 시군구명이 이 값이다(2026-10, 231건). 앱의 시·군·구 목록에 ‘없음’이 뜨지 않게 빈 값으로 본다. */
const NO_DISTRICT = "없음";

/** 시군구명이 비어 있으면 주소의 두 번째 낱말(…시·군·구)로 채운다. 세종처럼 시군구가 없으면 "". */
export function resolveDistrict(row) {
  const district = cleanText(row?.sggNm);
  if (district && district !== NO_DISTRICT) {
    return district;
  }
  for (const address of [row?.lctnRoadNm, row?.lctnLotnoAddr]) {
    const second = cleanText(address).split(" ")[1] ?? "";
    if (/[시군구]$/.test(second)) {
      return second;
    }
  }
  return "";
}

function inKorea(lat, lon) {
  return lat >= KOREA_BOUNDS.minLat && lat <= KOREA_BOUNDS.maxLat && lon >= KOREA_BOUNDS.minLon && lon <= KOREA_BOUNDS.maxLon;
}

function toNumber(value) {
  if (typeof value === "number") {
    return value;
  }
  const text = cleanText(value);
  return text === "" ? Number.NaN : Number(text);
}

/**
 * 위경도를 숫자로 맞춘다. 위도·경도가 뒤바뀐 행은 바로잡고, 대한민국 밖이면 버린다(null).
 * 소수 6자리(약 0.1m)로 자른다.
 */
export function normalizeCoordinates(latValue, lonValue) {
  const lat = toNumber(latValue);
  const lon = toNumber(lonValue);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  const round = (value) => Math.round(value * 1e6) / 1e6;
  if (inKorea(lat, lon)) {
    return { lat: round(lat), lon: round(lon), swapped: false };
  }
  if (inKorea(lon, lat)) {
    return { lat: round(lon), lon: round(lat), swapped: true };
  }
  return null;
}

/** 2026-03-15, 20260315, 2026.3.15, 2026/03/15 → 2026-03-15. 못 읽으면 "". */
export function normalizeDate(value) {
  const text = cleanText(value);
  const match = text.match(/^(\d{4})[-./]?(\d{1,2})[-./]?(\d{1,2})/);
  if (!match) {
    return "";
  }
  const [, year, month, day] = match;
  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso ? "" : iso;
}

/**
 * cyrb53. 같은 수거함이 매달 같은 id를 받도록 내용으로 만든다(앱의 ‘여기 없었어요’ 표시가 이 id에 붙는다).
 * 53비트라 1만 건에서 충돌 확률은 1e-8 수준이다.
 */
export function hash53(text, seed = 0) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** 같은 기관·장소·주소·세부위치면 같은 수거함이다. 좌표는 지자체가 고쳐도 같은 수거함이라 넣지 않는다. */
export function binIdentity(row) {
  return [row.insttCode, row.instlPlcNm, row.lctnRoadNm || row.lctnLotnoAddr, row.actlPstn]
    .map((value) => cleanText(value))
    .join("|");
}

/** 원본 한 행을 스냅샷 행으로 다듬는다. 빈 값은 빼고, 좌표가 틀리면 lat/lot을 뺀다. */
export function normalizeRow(raw) {
  const row = {};
  for (const field of ["instlPlcNm", "ctpvNm", "lctnRoadNm", "lctnLotnoAddr", "actlPstn", "mngInstNm", "mngInstTelno", "insttCode", "insttNm"]) {
    const value = cleanText(raw?.[field]);
    if (value) {
      row[field] = value;
    }
  }
  const district = resolveDistrict(raw);
  if (district) {
    row.sggNm = district;
  }
  const date = normalizeDate(raw?.crtrYmd);
  if (date) {
    row.crtrYmd = date;
  }
  const coordinates = normalizeCoordinates(raw?.lat, raw?.lot);
  if (coordinates) {
    row.lat = coordinates.lat;
    row.lot = coordinates.lon;
  }
  return { row, sidoCode: resolveSidoCode(row), swapped: coordinates?.swapped === true, invalidCoordinates: !coordinates };
}

/** 위도 1도의 길이(m). 수십 km 안의 거리 비교라 평면 근사로 충분하다. */
const METERS_PER_DEGREE = 111_195;
/** 같은 시도의 다른 수거함이 이 거리 안에 하나도 없으면 외딴 점이다. */
const MISPLACED_OWN_RADIUS_M = 30_000;
/** 외딴 점인데 다른 시도 수거함이 이 거리 안에 있으면 그 시도에 잘못 찍힌 것으로 본다. */
const MISPLACED_OTHER_RADIUS_M = 3_000;

function approxMeters(a, b) {
  const x = (b.lon - a.lon) * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  const y = b.lat - a.lat;
  return Math.sqrt(x * x + y * y) * METERS_PER_DEGREE;
}

/**
 * 주소와 다른 시도에 찍힌 좌표의 위치(배열 인덱스). 원본의 지오코딩 오류다(2026-10: 대구 남구 주소의 약국이 부산 좌표).
 * 그대로 두면 그 시도 사용자에게 ‘가까운 수거함’으로 뜨고, 앱이 엉뚱한 시도 파일까지 받는다.
 * 같은 시도의 다른 수거함이 30km 안에 없고 다른 시도 수거함이 3km 안에 있을 때만 고른다.
 * 섬(신안 가거도 등)은 다른 시도도 멀어 고르지 않는다. 좌표가 똑같은 같은 시도 행(같은 건물)은 근거로 치지 않는다.
 */
export function findMisplacedPoints(points) {
  const misplaced = new Set();
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    let ownNearby = false;
    let otherNearby = false;
    for (let other = 0; other < points.length && !ownNearby; other += 1) {
      if (other === index) {
        continue;
      }
      const candidate = points[other];
      const meters = approxMeters(point, candidate);
      if (candidate.sidoCode === point.sidoCode) {
        ownNearby = meters > 0 && meters <= MISPLACED_OWN_RADIUS_M;
      } else if (meters <= MISPLACED_OTHER_RADIUS_M) {
        otherNearby = true;
      }
    }
    if (!ownNearby && otherNearby) {
      misplaced.add(index);
    }
  }
  return misplaced;
}

function orderFields(row) {
  const ordered = {};
  for (const field of BIN_FIELDS) {
    if (row[field] != null) {
      ordered[field] = row[field];
    }
  }
  return ordered;
}

/**
 * 시도별로 나눈다. 장소명이나 시도를 알 수 없는 행은 앱에서 찾을 수 없어 버린다.
 * 같은 수거함이 두 번 나오면(지자체 병합 중 중복) 하나만 남긴다.
 * 다른 시도에 잘못 찍힌 좌표는 빼고 수거함은 남긴다(지역 선택으로는 찾을 수 있다).
 */
export function groupBinsBySido(rawRows) {
  const bySido = new Map();
  const seen = new Set();
  const usedIds = new Set();
  const stats = {
    input: rawRows.length,
    noName: 0,
    noSido: 0,
    duplicates: 0,
    swappedCoordinates: 0,
    withoutCoordinates: 0,
    misplacedCoordinates: 0
  };

  const normalized = rawRows
    .map((raw) => normalizeRow(raw))
    .map((entry) => ({ ...entry, identity: binIdentity(entry.row) }))
    // 원본 순서와 관계없이 같은 id를 주려고 내용 순으로 처리한다. ICU 버전에 흔들리지 않게 코드포인트로 비교한다.
    .sort((a, b) => (a.identity < b.identity ? -1 : a.identity > b.identity ? 1 : 0));

  for (const { row, sidoCode, swapped, invalidCoordinates, identity } of normalized) {
    if (!row.instlPlcNm) {
      stats.noName += 1;
      continue;
    }
    if (!sidoCode) {
      stats.noSido += 1;
      continue;
    }
    if (seen.has(identity)) {
      stats.duplicates += 1;
      continue;
    }
    seen.add(identity);
    if (swapped) {
      stats.swappedCoordinates += 1;
    }
    if (invalidCoordinates) {
      stats.withoutCoordinates += 1;
    }
    let id = hash53(identity).toString(36);
    for (let salt = 1; usedIds.has(id); salt += 1) {
      id = hash53(identity, salt).toString(36);
    }
    usedIds.add(id);
    if (!bySido.has(sidoCode)) {
      bySido.set(sidoCode, []);
    }
    bySido.get(sidoCode).push(orderFields({ ...row, binId: id }));
  }

  const located = [...bySido].flatMap(([sidoCode, items]) => items
    .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lot))
    .map((item) => ({ sidoCode, lat: item.lat, lon: item.lot, item })));
  for (const index of findMisplacedPoints(located)) {
    delete located[index].item.lat;
    delete located[index].item.lot;
    stats.misplacedCoordinates += 1;
    stats.withoutCoordinates += 1;
  }

  const byName = (a, b) => (a.sggNm ?? "").localeCompare(b.sggNm ?? "", "ko")
    || a.instlPlcNm.localeCompare(b.instlPlcNm, "ko")
    || a.binId.localeCompare(b.binId);
  for (const list of bySido.values()) {
    list.sort(byName);
  }
  return { bySido: new Map([...bySido].sort(([a], [b]) => a.localeCompare(b))), stats };
}

/** 시군구별 건수. 앱이 ‘이 시·도에서 공공데이터에 있는 시·군·구’를 보여 주는 데 쓴다. */
export function districtCounts(items) {
  const counts = new Map();
  for (const item of items) {
    const name = item.sggNm || "";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return Object.fromEntries([...counts].sort(([a], [b]) => a.localeCompare(b, "ko")));
}

/** 좌표 있는 수거함의 시도별 [위도, 경도]. 소수 5자리(약 1m). 앱이 위치를 보내지 않고 가까운 시도를 고른다. */
export function buildPointsFile(bySido, generatedAt) {
  const sidos = {};
  for (const [sidoCode, items] of bySido) {
    const points = items
      .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lot))
      .map((item) => [Math.round(item.lat * 1e5) / 1e5, Math.round(item.lot * 1e5) / 1e5]);
    if (points.length > 0) {
      sidos[sidoCode] = points;
    }
  }
  return { schema: SCHEMA_VERSION, generatedAt, sidos };
}

/** 원본 내용이 같으면 같은 값. 생성 시각은 넣지 않아, 내용이 바뀐 날에만 배포하는 데 쓴다. */
export function contentHash(bySido) {
  const hash = createHash("sha256");
  for (const [sidoCode, items] of bySido) {
    hash.update(sidoCode);
    hash.update(JSON.stringify(items));
  }
  return hash.digest("hex");
}

export function latestDataDate(bySido) {
  let latest = "";
  for (const items of bySido.values()) {
    for (const item of items) {
      if (item.crtrYmd && item.crtrYmd > latest) {
        latest = item.crtrYmd;
      }
    }
  }
  return latest;
}

export function buildMeta(bySido, stats, { generatedAt, sourceMode }) {
  const sidos = {};
  let count = 0;
  let withCoordinates = 0;
  for (const [sidoCode, items] of bySido) {
    const located = items.filter((item) => Number.isFinite(item.lat)).length;
    sidos[sidoCode] = { count: items.length, withCoordinates: located, districts: districtCounts(items) };
    count += items.length;
    withCoordinates += located;
  }
  return {
    schema: SCHEMA_VERSION,
    generatedAt,
    source: SOURCE_URL,
    sourceMode,
    contentHash: contentHash(bySido),
    bins: {
      count,
      withCoordinates,
      latestDataDate: latestDataDate(bySido),
      dropped: { noName: stats.noName, noSido: stats.noSido },
      duplicates: stats.duplicates,
      swappedCoordinates: stats.swappedCoordinates,
      misplacedCoordinates: stats.misplacedCoordinates,
      sidos
    }
  };
}

/**
 * 반쯤 받은 데이터를 배포하지 않기 위한 하한선. 직전 배포의 90% 미만이면 실패로 본다.
 */
export function assertPlausibleCount(label, count, { minimum, previous } = {}) {
  if (minimum != null && count < minimum) {
    throw new Error(`${label} ${count}건은 하한 ${minimum}건보다 적습니다.`);
  }
  if (previous != null && previous > 0 && count < previous * 0.9) {
    throw new Error(`${label} ${count}건은 직전 배포 ${previous}건의 90% 미만입니다.`);
  }
}
