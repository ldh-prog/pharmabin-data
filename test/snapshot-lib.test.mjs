import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ApiResponseError,
  asItemArray,
  assertPlausibleCount,
  binIdentity,
  buildMeta,
  buildPointsFile,
  contentHash,
  decodeText,
  findMisplacedPoints,
  fromStandardRecord,
  gatewayReasonCode,
  groupBinsBySido,
  hash53,
  isFatalGatewayCode,
  normalizeCoordinates,
  normalizeDate,
  normalizeServiceKey,
  parseApiPage,
  parseCsv,
  parseStandardFile,
  resolveDistrict,
  resolveSidoCode
} from "../scripts/snapshot-lib.mjs";

function apiRow(overrides = {}) {
  return {
    instlPlcNm: "삼산동 행정복지센터",
    ctpvNm: "울산광역시",
    sggNm: "남구",
    lctnRoadNm: "울산광역시 남구 삼산로 1",
    lctnLotnoAddr: "",
    lat: "35.5395",
    lot: "129.3381",
    actlPstn: "1층",
    mngInstNm: "남구 보건소",
    mngInstTelno: "052-000-0001",
    crtrYmd: "2026-09-30",
    insttCode: "3700000",
    insttNm: "울산광역시 남구",
    ...overrides
  };
}

describe("normalizeServiceKey", () => {
  it("Encoding 키를 한 번만 디코딩한다", () => {
    assert.equal(normalizeServiceKey(" abc%2Bdef%3D%3D "), "abc+def==");
    assert.equal(normalizeServiceKey("abc+def=="), "abc+def==");
    assert.equal(normalizeServiceKey(undefined), "");
  });
});

describe("asItemArray", () => {
  it("배열·단건 객체·빈 값을 배열로 맞춘다", () => {
    assert.deepEqual(asItemArray([{ a: 1 }]), [{ a: 1 }]);
    assert.deepEqual(asItemArray({ item: { a: 1 } }), [{ a: 1 }]);
    assert.deepEqual(asItemArray({ item: [{ a: 1 }, { a: 2 }] }), [{ a: 1 }, { a: 2 }]);
    assert.deepEqual(asItemArray(""), []);
    assert.deepEqual(asItemArray(null), []);
  });
});

describe("gatewayReasonCode / parseApiPage", () => {
  it("JSON 게이트웨이 오류의 사유 코드를 읽는다(2026-10-13 실제 응답 모양)", () => {
    const body = JSON.stringify({
      OpenAPI_ServiceResponse: {
        cmmMsgHeader: { errMsg: "SERVICE_KEY_IS_NOT_REGISTERED_ERROR", returnAuthMsg: "등록되지 않은 서비스키", returnReasonCode: "30" }
      }
    });
    assert.equal(gatewayReasonCode(body), "30");
    assert.throws(() => parseApiPage(body), (error) => error instanceof ApiResponseError && error.fatal && error.code === "30");
  });

  it("XML 게이트웨이 오류도 읽는다", () => {
    const body = "<OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>22</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>";
    assert.equal(gatewayReasonCode(body), "22");
    assert.equal(isFatalGatewayCode("22"), true);
    assert.equal(isFatalGatewayCode("01"), false);
  });

  it("정상 응답은 null이고 행과 전체 건수를 돌려준다(2026-10-13 실제 응답 모양: 최상위 header·body)", () => {
    const body = JSON.stringify({
      header: { resultCode: "00", resultMsg: "NORMAL SERVICE." },
      body: { items: { item: [apiRow(), apiRow({ instlPlcNm: "달동" })] }, numOfRows: 2, pageNo: 1, totalCount: 7696 }
    });
    assert.equal(gatewayReasonCode(body), null);
    const page = parseApiPage(body);
    assert.equal(page.totalCount, 7696);
    assert.equal(page.items.length, 2);
  });

  it("response 로 감싼 응답도 같게 읽는다", () => {
    const body = JSON.stringify({
      response: {
        header: { resultCode: "00", resultMsg: "NORMAL_SERVICE" },
        body: { items: [apiRow()], totalCount: "7696", numOfRows: "1000", pageNo: "1" }
      }
    });
    const page = parseApiPage(body);
    assert.equal(page.totalCount, 7696);
    assert.equal(page.items.length, 1);
  });

  it("데이터 없음(03)은 빈 쪽으로 본다", () => {
    // 마지막 쪽 너머(9쪽)의 2026-10-13 실제 응답 모양
    const body = JSON.stringify({ header: { resultCode: "03", resultMsg: "NODATA_ERROR" }, body: { items: "", totalCount: 7696 } });
    assert.deepEqual(parseApiPage(body), { items: [], totalCount: 0 });
    const wrapped = JSON.stringify({ response: { header: { resultCode: "03", resultMsg: "NODATA_ERROR" } } });
    assert.deepEqual(parseApiPage(wrapped), { items: [], totalCount: 0 });
  });

  it("다른 resultCode·JSON 아님은 재시도 가능한 오류다", () => {
    const body = JSON.stringify({ response: { header: { resultCode: "01", resultMsg: "APPLICATION_ERROR" } } });
    assert.throws(() => parseApiPage(body), (error) => error instanceof ApiResponseError && !error.fatal);
    assert.throws(() => parseApiPage("<html>오류</html>"), (error) => error.code === "PARSE");
  });
});

describe("resolveSidoCode", () => {
  it("시도명과 옛 이름·줄임말을 법정 시도코드로 바꾼다", () => {
    assert.equal(resolveSidoCode({ ctpvNm: "울산광역시" }), "31");
    assert.equal(resolveSidoCode({ ctpvNm: "강원도" }), "51");
    assert.equal(resolveSidoCode({ ctpvNm: "전라북도" }), "52");
    assert.equal(resolveSidoCode({ ctpvNm: " 서울 특별시 " }), "11");
  });

  it("시도명이 없으면 주소의 첫 낱말로 찾는다", () => {
    assert.equal(resolveSidoCode({ ctpvNm: "", lctnRoadNm: "경기도 광주시 경충대로 1" }), "41");
    assert.equal(resolveSidoCode({ lctnLotnoAddr: "제주특별자치도 제주시 1" }), "50");
  });

  it("전남광주통합특별시(2026-07-01)와 옛 광주광역시·전라남도 표기를 모두 12로 맞춘다", () => {
    assert.equal(resolveSidoCode({ ctpvNm: "전남광주통합특별시" }), "12");
    assert.equal(resolveSidoCode({ ctpvNm: "전라남도", lctnRoadNm: "전라남도 순천시 신월큰길 7" }), "12");
    assert.equal(resolveSidoCode({ ctpvNm: "광주광역시" }), "12");
    assert.equal(resolveSidoCode({ ctpvNm: "", lctnRoadNm: "전남광주통합특별시 광산구 침산길 3" }), "12");
  });

  it("경기도 광주시를 광주광역시로 착각하지 않는다", () => {
    assert.equal(resolveSidoCode({ ctpvNm: "광주시", lctnRoadNm: "광주시 경안로 1" }), "");
  });
});

describe("resolveDistrict", () => {
  it("시군구명이 비면 주소의 두 번째 낱말로 채운다", () => {
    assert.equal(resolveDistrict({ sggNm: " 남구 " }), "남구");
    assert.equal(resolveDistrict({ sggNm: "", lctnRoadNm: "울산광역시 울주군 언양읍 1" }), "울주군");
    assert.equal(resolveDistrict({ sggNm: "", lctnRoadNm: "세종특별자치시 한누리대로 2130" }), "");
  });

  it("세종의 시군구명 ‘없음’은 빈 값으로 본다(2026-10 원본)", () => {
    assert.equal(resolveDistrict({ sggNm: "없음", lctnRoadNm: "세종특별자치시 한누리대로 2130" }), "");
  });
});

describe("normalizeCoordinates", () => {
  it("문자열 좌표를 숫자로 맞추고 소수 6자리로 자른다", () => {
    assert.deepEqual(normalizeCoordinates(" 35.53951234 ", "129.3381"), { lat: 35.539512, lon: 129.3381, swapped: false });
  });

  it("위도·경도가 뒤바뀌면 바로잡는다", () => {
    assert.deepEqual(normalizeCoordinates("129.3326", "35.5694"), { lat: 35.5694, lon: 129.3326, swapped: true });
  });

  it("빈 값·0·대한민국 밖 좌표는 버린다", () => {
    assert.equal(normalizeCoordinates("", ""), null);
    assert.equal(normalizeCoordinates("0", "0"), null);
    assert.equal(normalizeCoordinates("40.1", "127.0"), null);
  });

  it("독도·마라도는 범위 안이다", () => {
    assert.ok(normalizeCoordinates(37.2411, 131.8644));
    assert.ok(normalizeCoordinates(33.1157, 126.2669));
  });
});

describe("normalizeDate", () => {
  it("여러 날짜 표기를 YYYY-MM-DD로 맞춘다", () => {
    assert.equal(normalizeDate("2026-09-30"), "2026-09-30");
    assert.equal(normalizeDate("20260915"), "2026-09-15");
    assert.equal(normalizeDate("2026.9.1"), "2026-09-01");
    assert.equal(normalizeDate("2026/03/05 00:00:00"), "2026-03-05");
  });

  it("없는 날짜·형식 오류는 빈 문자열이다", () => {
    assert.equal(normalizeDate("2026-02-30"), "");
    assert.equal(normalizeDate("미상"), "");
    assert.equal(normalizeDate(undefined), "");
  });
});

describe("parseCsv / decodeText / parseStandardFile", () => {
  it("따옴표 안의 쉼표·줄바꿈·이스케이프를 처리한다", () => {
    assert.deepEqual(parseCsv('a,b\r\n"1,2","say ""hi""\nthere"\n'), [["a", "b"], ["1,2", 'say "hi"\nthere']]);
  });

  it("EUC-KR CSV를 읽는다", () => {
    // "설치장소명\n가" 를 EUC-KR로 인코딩한 바이트
    const eucKr = Uint8Array.from([0xbc, 0xb3, 0xc4, 0xa1, 0xc0, 0xe5, 0xbc, 0xd2, 0xb8, 0xed, 0x0a, 0xb0, 0xa1]);
    assert.equal(decodeText(eucKr), "설치장소명\n가");
  });

  it("UTF-8 BOM을 뗀다", () => {
    assert.equal(decodeText(Uint8Array.from([0xef, 0xbb, 0xbf, 0x41])), "A");
  });

  it("한글 열 이름의 CSV·JSON을 API 필드명으로 바꾼다", () => {
    const csv = "설치장소명,시도명,위도,경도,모르는열\n삼산동,울산광역시,35.5,129.3,x\n,,,,\n";
    assert.deepEqual(parseStandardFile(csv), [{ instlPlcNm: "삼산동", ctpvNm: "울산광역시", lat: "35.5", lot: "129.3" }]);
    const json = JSON.stringify({ fields: [], records: [{ 설치장소명: "달동", 제공기관기관명: "남구" }] });
    assert.deepEqual(parseStandardFile(json), [{ instlPlcNm: "달동", insttNm: "남구" }]);
    assert.deepEqual(fromStandardRecord({ instlPlcNm: "그대로" }), { instlPlcNm: "그대로" });
  });
});

describe("groupBinsBySido", () => {
  it("시도별로 나누고, 장소명·시도 없는 행과 중복을 뺀다", () => {
    const rows = [
      apiRow(),
      apiRow(),
      apiRow({ instlPlcNm: "" }),
      apiRow({ ctpvNm: "", lctnRoadNm: "어딘가 1" }),
      apiRow({ instlPlcNm: "달동", lat: "129.33", lot: "35.53" }),
      apiRow({ instlPlcNm: "역삼1동", ctpvNm: "서울특별시", sggNm: "강남구", lctnRoadNm: "서울특별시 강남구 1", lat: "", lot: "" })
    ];
    const { bySido, stats } = groupBinsBySido(rows);
    assert.deepEqual([...bySido.keys()], ["11", "31"]);
    assert.equal(bySido.get("31").length, 2);
    assert.deepEqual(stats, {
      input: 6,
      noName: 1,
      noSido: 1,
      duplicates: 1,
      swappedCoordinates: 1,
      withoutCoordinates: 1,
      misplacedCoordinates: 0
    });
    const seoul = bySido.get("11")[0];
    assert.equal("lat" in seoul, false);
    assert.equal(typeof bySido.get("31")[0].lat, "number");
  });

  it("빈 필드는 빼고 앱이 읽는 필드 순서로 둔다", () => {
    const [item] = groupBinsBySido([apiRow({ lctnLotnoAddr: "  ", extra: "버림" })]).bySido.get("31");
    assert.deepEqual(Object.keys(item), [
      "binId", "instlPlcNm", "ctpvNm", "sggNm", "lctnRoadNm", "lat", "lot", "actlPstn",
      "mngInstNm", "mngInstTelno", "crtrYmd", "insttCode", "insttNm"
    ]);
  });

  it("원본 순서가 바뀌어도 같은 수거함은 같은 id를 받는다", () => {
    const rows = [apiRow(), apiRow({ instlPlcNm: "달동" }), apiRow({ instlPlcNm: "신정동" })];
    const ids = (input) => Object.fromEntries(groupBinsBySido(input).bySido.get("31").map((item) => [item.instlPlcNm, item.binId]));
    assert.deepEqual(ids(rows), ids([...rows].reverse()));
  });

  it("좌표만 고쳐도 id가 그대로다", () => {
    const before = groupBinsBySido([apiRow()]).bySido.get("31")[0].binId;
    const after = groupBinsBySido([apiRow({ lat: "35.54", lot: "129.34" })]).bySido.get("31")[0].binId;
    assert.equal(before, after);
  });

  it("시군구, 장소명 순으로 정렬한다", () => {
    const rows = [
      apiRow({ instlPlcNm: "나", sggNm: "중구" }),
      apiRow({ instlPlcNm: "다", sggNm: "남구" }),
      apiRow({ instlPlcNm: "가", sggNm: "남구" })
    ];
    assert.deepEqual(groupBinsBySido(rows).bySido.get("31").map((item) => item.instlPlcNm), ["가", "다", "나"]);
  });

  it("다른 시도에 찍힌 좌표는 빼고 수거함은 남긴다", () => {
    const rows = [
      apiRow({ instlPlcNm: "대연1동", ctpvNm: "부산광역시", sggNm: "남구", lctnRoadNm: "부산광역시 남구 유엔평화로 24", lat: "35.1336", lot: "129.0912" }),
      apiRow({ instlPlcNm: "대연4동", ctpvNm: "부산광역시", sggNm: "남구", lctnRoadNm: "부산광역시 남구 석포로 96", lat: "35.1290", lot: "129.0850" }),
      apiRow({ instlPlcNm: "대명동", ctpvNm: "대구광역시", sggNm: "남구", lctnRoadNm: "대구광역시 남구 대명로 1", lat: "35.8460", lot: "128.5830" }),
      apiRow({ instlPlcNm: "다담약국", ctpvNm: "대구광역시", sggNm: "남구", lctnRoadNm: "대구광역시 남구 중앙대로 151", lat: "35.125614", lot: "129.08786" })
    ];
    const { bySido, stats } = groupBinsBySido(rows);
    const wrong = bySido.get("27").find((item) => item.instlPlcNm === "다담약국");
    assert.equal("lat" in wrong, false);
    assert.equal("lot" in wrong, false);
    assert.equal(stats.misplacedCoordinates, 1);
    assert.equal(stats.withoutCoordinates, 1);
    assert.equal(typeof bySido.get("27").find((item) => item.instlPlcNm === "대명동").lat, "number");
  });

  it("통합 전 표기(전라남도)와 통합 후 표기가 섞여도 한 시도 파일에 모은다", () => {
    const rows = [
      apiRow({ instlPlcNm: "유계동", ctpvNm: "전남광주통합특별시", sggNm: "광산구", lctnRoadNm: "전남광주통합특별시 광산구 동곡본촌길 36", lat: "35.1", lot: "126.7" }),
      apiRow({ instlPlcNm: "조례동 약국", ctpvNm: "전라남도", sggNm: "순천시", lctnRoadNm: "전라남도 순천시 신월큰길 7", lat: "34.96", lot: "127.52" })
    ];
    const { bySido } = groupBinsBySido(rows);
    assert.deepEqual([...bySido.keys()], ["12"]);
    assert.deepEqual(bySido.get("12").map((item) => item.sggNm), ["광산구", "순천시"]);
  });
});

describe("findMisplacedPoints", () => {
  // 부산 남구 대연동 주변 수거함들
  const busan = [
    { sidoCode: "26", lat: 35.1336, lon: 129.0912 },
    { sidoCode: "26", lat: 35.1360, lon: 129.0950 },
    { sidoCode: "26", lat: 35.1290, lon: 129.0850 }
  ];
  // 대구 남구 대명동 주변
  const daegu = [
    { sidoCode: "27", lat: 35.8460, lon: 128.5830 },
    { sidoCode: "27", lat: 35.8500, lon: 128.5900 }
  ];

  it("다른 시도 한가운데 찍힌 외딴 점을 고른다(2026-10 대구 주소·부산 좌표 행)", () => {
    const wrong = { sidoCode: "27", lat: 35.125614, lon: 129.08786 };
    const points = [...busan, ...daegu, wrong];
    assert.deepEqual([...findMisplacedPoints(points)], [points.length - 1]);
  });

  it("같은 좌표에 같은 시도 행이 둘 있어도 잘못 찍힌 것으로 본다", () => {
    const wrong = { sidoCode: "27", lat: 35.125614, lon: 129.08786 };
    const points = [...busan, ...daegu, wrong, { ...wrong }];
    assert.deepEqual([...findMisplacedPoints(points)].sort(), [points.length - 2, points.length - 1]);
  });

  it("다른 시도도 먼 섬, 같은 시도 이웃이 있는 경계 지역은 고르지 않는다", () => {
    const island = { sidoCode: "12", lat: 34.052374, lon: 125.126635 };
    // 부산과 맞닿은 양산(경남) 수거함: 부산 점이 3km 안에 있어도 같은 시도 이웃이 30km 안에 있다
    const yangsan = [{ sidoCode: "48", lat: 35.1500, lon: 129.1000 }, { sidoCode: "48", lat: 35.3350, lon: 129.0370 }];
    assert.equal(findMisplacedPoints([...busan, ...daegu, island, ...yangsan]).size, 0);
  });
});

describe("hash53 / binIdentity", () => {
  it("같은 입력은 같은 값, 씨앗이 다르면 다른 값", () => {
    assert.equal(hash53("a|b"), hash53("a|b"));
    assert.notEqual(hash53("a|b"), hash53("a|b", 1));
    assert.ok(Number.isSafeInteger(hash53("가나다")));
  });

  it("도로명주소가 없으면 지번주소로 같은 수거함을 가린다", () => {
    assert.equal(binIdentity({ insttCode: "1", instlPlcNm: "가", lctnLotnoAddr: "지번 1" }), "1|가|지번 1|");
  });
});

describe("buildPointsFile / buildMeta / contentHash", () => {
  const { bySido, stats } = groupBinsBySido([
    apiRow(),
    apiRow({ instlPlcNm: "온양", sggNm: "울주군", lat: "", lot: "", crtrYmd: "2026-10-01" }),
    apiRow({ instlPlcNm: "역삼", ctpvNm: "서울특별시", sggNm: "강남구", lat: "37.123456", lot: "127.123456" })
  ]);

  it("좌표 있는 수거함만 소수 5자리로 담는다", () => {
    const points = buildPointsFile(bySido, "2026-10-13T00:00:00.000Z");
    assert.deepEqual(points.sidos, { "11": [[37.12346, 127.12346]], "31": [[35.5395, 129.3381]] });
  });

  it("시도별 건수·좌표 수·시군구 건수와 최신 기준일을 담는다", () => {
    const meta = buildMeta(bySido, stats, { generatedAt: "2026-10-13T00:00:00.000Z", sourceMode: "api" });
    assert.equal(meta.bins.count, 3);
    assert.equal(meta.bins.withCoordinates, 2);
    assert.equal(meta.bins.latestDataDate, "2026-10-01");
    assert.deepEqual(
      [meta.bins.dropped, meta.bins.duplicates, meta.bins.swappedCoordinates, meta.bins.misplacedCoordinates],
      [{ noName: 0, noSido: 0 }, 0, 0, 0]
    );
    assert.deepEqual(meta.bins.sidos["31"], { count: 2, withCoordinates: 1, districts: { 남구: 1, 울주군: 1 } });
    assert.match(meta.contentHash, /^[0-9a-f]{64}$/);
  });

  it("내용이 같으면 생성 시각과 관계없이 해시가 같다", () => {
    const again = groupBinsBySido([
      apiRow({ instlPlcNm: "역삼", ctpvNm: "서울특별시", sggNm: "강남구", lat: "37.123456", lot: "127.123456" }),
      apiRow(),
      apiRow({ instlPlcNm: "온양", sggNm: "울주군", lat: "", lot: "", crtrYmd: "2026-10-01" })
    ]).bySido;
    assert.equal(contentHash(again), contentHash(bySido));
    const changed = groupBinsBySido([apiRow({ actlPstn: "2층" })]).bySido;
    assert.notEqual(contentHash(changed), contentHash(bySido));
  });
});

describe("assertPlausibleCount", () => {
  it("하한과 직전 배포 90%를 지킨다", () => {
    assert.doesNotThrow(() => assertPlausibleCount("수거함", 7000, { minimum: 3000, previous: 7696 }));
    assert.throws(() => assertPlausibleCount("수거함", 2000, { minimum: 3000 }), /하한/);
    assert.throws(() => assertPlausibleCount("수거함", 6000, { minimum: 3000, previous: 7696 }), /90%/);
    assert.doesNotThrow(() => assertPlausibleCount("수거함", 10, { minimum: 0, previous: undefined }));
  });
});
