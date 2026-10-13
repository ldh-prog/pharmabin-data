/**
 * 전국폐의약품수거함 표준데이터 → GitHub Pages 정적 JSON.
 *
 * 앱에 인증키를 넣지 않으려고 만든 스냅샷이다. 원본은 지자체 데이터를 월 1회 병합하므로
 * 하루 1회 받아 두면 앱이 직접 부르는 것과 정보가 같다. 전체가 8쪽(1,000건/쪽)이라 API 부담도 작다.
 *
 * 환경변수
 *   DATA_GO_KR_SERVICE_KEY  API로 받을 때 필수. 로그에 남기지 않는다.
 *   INPUT_FILE              포털에서 내려받은 표준데이터 파일(JSON·CSV). 있으면 API 대신 이 파일을 읽는다.
 *                           API가 막혔을 때의 비상 경로이고, 샘플 빌드(npm run build:sample)에도 쓴다.
 *   PAGES_BASE_URL          직전 배포본 주소. 건수 하한 비교에 쓴다.
 *   MIN_ROWS                건수 하한(기본 3000). 샘플 빌드에서만 0으로 낮춘다.
 *   OUT_DIR                 기본 site
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  API_URL,
  MAX_ROWS,
  SCHEMA_VERSION,
  SIDOS,
  SOURCE_URL,
  assertPlausibleCount,
  buildMeta,
  buildPointsFile,
  decodeText,
  groupBinsBySido,
  normalizeServiceKey,
  parseApiPage,
  parseStandardFile
} from "./snapshot-lib.mjs";

const serviceKey = normalizeServiceKey(process.env.DATA_GO_KR_SERVICE_KEY);
const inputFile = (process.env.INPUT_FILE || "").trim();
const outDir = resolve(process.env.OUT_DIR || "site");
const pagesBaseUrl = (process.env.PAGES_BASE_URL || "").replace(/\/+$/, "");
const minimumRows = process.env.MIN_ROWS != null && process.env.MIN_ROWS !== "" ? Number(process.env.MIN_ROWS) : 3000;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 4;

/**
 * 직전 배포본을 네트워크 문제로 못 읽었다. ‘없음(404)’과 달리 이번 실행을 접는다.
 * 첫 실행처럼 처리하면 건수 하한 비교가 빠져, 반쯤 받은 데이터가 배포될 수 있다.
 */
class PreviousUnavailableError extends Error {}

function log(message) {
  console.log(message);
}

function sleep(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

/** 오류 설명에 요청 URL(인증키 포함)을 넣지 않는다. */
function describe(error) {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const cause = error.cause && typeof error.cause === "object" && "code" in error.cause ? ` (${error.cause.code})` : "";
  return `${error.name}: ${error.message}${cause}`;
}

async function fetchPage(pageNo) {
  const url = new URL(API_URL);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("pageNo", String(pageNo));
  url.searchParams.set("numOfRows", String(MAX_ROWS));
  url.searchParams.set("type", "json");

  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
      const text = await response.text();
      // 게이트웨이 오류는 HTTP 200으로도 온다. 상태 코드보다 본문을 먼저 본다.
      const page = parseApiPage(text);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return page;
    } catch (error) {
      if (error?.fatal) {
        throw new Error(`${pageNo}쪽: ${error.message}`);
      }
      lastError = error;
      if (attempt < MAX_ATTEMPTS) {
        await sleep(1000 * 2 ** (attempt - 1));
      }
    }
  }
  throw new Error(`${pageNo}쪽을 ${MAX_ATTEMPTS}번 시도했지만 실패했습니다: ${describe(lastError)}`);
}

/** 1쪽에서 전체 건수를 보고 나머지 쪽을 차례로 받는다. 8쪽뿐이라 병렬로 받지 않는다. */
async function fetchAll() {
  const first = await fetchPage(1);
  const totalPages = Math.max(1, Math.ceil(first.totalCount / MAX_ROWS));
  const rows = [...first.items];
  for (let pageNo = 2; pageNo <= totalPages; pageNo += 1) {
    rows.push(...(await fetchPage(pageNo)).items);
  }
  if (rows.length < first.totalCount * 0.99) {
    throw new Error(`${first.totalCount}건 중 ${rows.length}건만 받았습니다.`);
  }
  log(`API ${totalPages}쪽, ${rows.length}행 (totalCount ${first.totalCount})`);
  return rows;
}

function readInput(path) {
  const rows = parseStandardFile(decodeText(readFileSync(resolve(path))));
  log(`파일 ${path}: ${rows.length}행`);
  return rows;
}

function writeJson(relativePath, value) {
  const file = resolve(outDir, relativePath);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value), "utf8");
}

function writeText(relativePath, text) {
  const file = resolve(outDir, relativePath);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text, "utf8");
}

/** 직전 배포본 meta. 없으면(404·첫 실행) null, 네트워크·서버 오류가 이어지면 PreviousUnavailableError. */
async function loadPreviousMeta() {
  if (!pagesBaseUrl) {
    return null;
  }
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`${pagesBaseUrl}/v1/meta.json`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const meta = JSON.parse(await response.text());
      return meta?.schema === SCHEMA_VERSION ? meta : null;
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await sleep(3000 * attempt);
      }
    }
  }
  throw new PreviousUnavailableError(`직전 배포본 meta.json 을 읽지 못했습니다: ${describe(lastError)}`);
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function indexHtml(meta) {
  const sidoLinks = SIDOS
    .filter((sido) => meta.bins.sidos[sido.code])
    .map((sido) => {
      const entry = meta.bins.sidos[sido.code];
      return `<li><a href="v1/bins/${sido.code}.json">${escapeHtml(sido.name)}</a> ${entry.count}건 · 시·군·구 ${Object.keys(entry.districts).length}곳</li>`;
    })
    .join("\n      ");
  const missing = SIDOS.filter((sido) => !meta.bins.sidos[sido.code]).map((sido) => escapeHtml(sido.name)).join(", ");
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>폐의약품 수거함 데이터</title>
    <style>body{font-family:system-ui,sans-serif;max-width:720px;margin:2rem auto;padding:0 16px;line-height:1.6}code{background:#f2f2f2;padding:0 4px}</style>
  </head>
  <body>
    <h1>폐의약품 수거함 데이터 스냅샷</h1>
    <p>「폐의약품 수거함 찾기」 앱(kr.ulsan.ldh.pharmabin)이 읽는 정적 파일입니다. 원본 내용이 바뀐 날에만 새로 올립니다.</p>
    <p>출처: 공공데이터포털 <a href="${SOURCE_URL}">전국폐의약품수거함표준데이터</a>(각 지자체 제공, 월 1회 병합). 이설·철거가 늦게 반영될 수 있으니 방문 전 현장을 확인하세요.</p>
    <p>생성: <code>${meta.generatedAt}</code> · 수거함 ${meta.bins.count}곳(좌표 ${meta.bins.withCoordinates}곳) · 최신 데이터 기준일 <code>${meta.bins.latestDataDate || "-"}</code></p>
    <p><a href="v1/meta.json">v1/meta.json</a> · <a href="v1/points.json">v1/points.json</a></p>
    <ul>
      ${sidoLinks}
    </ul>
    ${missing ? `<p>데이터 없음: ${missing}</p>` : ""}
  </body>
</html>
`;
}

async function main() {
  if (!inputFile && !serviceKey) {
    throw new Error("DATA_GO_KR_SERVICE_KEY 가 비어 있습니다. (파일로 만들려면 INPUT_FILE)");
  }
  const generatedAt = new Date().toISOString();
  const previousMeta = await loadPreviousMeta();
  log(previousMeta ? `직전 배포: ${previousMeta.generatedAt} (${previousMeta.bins?.count}건)` : "직전 배포 없음");

  const rows = inputFile ? readInput(inputFile) : await fetchAll();
  const { bySido, stats } = groupBinsBySido(rows);
  const meta = buildMeta(bySido, stats, { generatedAt, sourceMode: inputFile ? "file" : "api" });
  assertPlausibleCount("수거함", meta.bins.count, { minimum: minimumRows, previous: previousMeta?.bins?.count });

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  for (const [sidoCode, items] of bySido) {
    writeJson(`v1/bins/${sidoCode}.json`, { schema: SCHEMA_VERSION, generatedAt, sidoCode, count: items.length, items });
  }
  writeJson("v1/points.json", buildPointsFile(bySido, generatedAt));
  writeJson("v1/meta.json", meta);
  writeText("index.html", indexHtml(meta));

  log(
    `수거함 ${meta.bins.count}곳 (${bySido.size}개 시도, 좌표 ${meta.bins.withCoordinates}곳, 위경도 뒤바뀜 보정 ${stats.swappedCoordinates}건, `
      + `다른 시도에 찍힌 좌표 ${stats.misplacedCoordinates}건 제거, `
      + `중복 ${stats.duplicates}건·장소명 없음 ${stats.noName}건·시도 불명 ${stats.noSido}건 제외)`
  );
  log(`최신 데이터 기준일 ${meta.bins.latestDataDate || "-"} · contentHash ${meta.contentHash.slice(0, 12)}`);
  log(`완료: ${outDir}`);
}

main().catch((error) => {
  console.log(`::error::${describe(error)}`);
  process.exit(1);
});
