import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

function build(env) {
  const outDir = mkdtempSync(join(tmpdir(), "pharmabin-site-"));
  const result = spawnSync(process.execPath, ["scripts/build-snapshot.mjs"], {
    cwd: root,
    encoding: "utf8",
    env: { PATH: process.env.PATH, OUT_DIR: outDir, ...env }
  });
  return { ...result, outDir };
}

const readJson = (dir, path) => JSON.parse(readFileSync(join(dir, path), "utf8"));

describe("build-snapshot (샘플 파일)", () => {
  it("표준데이터 파일로 시도별 파일·좌표·meta·index를 만든다", () => {
    const { status, stdout, outDir } = build({ INPUT_FILE: "test/fixtures/standard-sample.json", MIN_ROWS: "0" });
    try {
      assert.equal(status, 0, stdout);
      const meta = readJson(outDir, "v1/meta.json");
      assert.equal(meta.schema, 1);
      assert.equal(meta.sourceMode, "file");
      // 22행 - 중복 1 - 장소명 없음 1
      assert.equal(meta.bins.count, 20);
      // 좌표 없음 1, (0,0) 1
      assert.equal(meta.bins.withCoordinates, 18);
      assert.equal(meta.bins.swappedCoordinates, 1);
      assert.deepEqual(Object.keys(meta.bins.sidos).sort(), ["11", "31", "48", "51"]);
      assert.deepEqual(meta.bins.sidos["31"].districts, { 남구: 6, 동구: 2, 북구: 2, 울주군: 3, 중구: 3 });

      const ulsan = readJson(outDir, "v1/bins/31.json");
      assert.equal(ulsan.count, 16);
      const seosaeng = ulsan.items.find((item) => item.instlPlcNm === "샘플 서생면 행정복지센터");
      assert.equal(seosaeng.sggNm, "울주군", "시도명·시군구명이 빈 행은 주소로 채운다");
      const swapped = ulsan.items.find((item) => item.instlPlcNm === "샘플 중구 보건소");
      assert.deepEqual([swapped.lat, swapped.lot], [35.5694, 129.3326]);

      const points = readJson(outDir, "v1/points.json");
      assert.equal(points.sidos["31"].length, 14);
      const index = readFileSync(join(outDir, "index.html"), "utf8");
      assert.match(index, /데이터 없음: .*제주특별자치도/);
      assert.match(index, /href="privacy.html"/);
      const privacy = readFileSync(join(outDir, "privacy.html"), "utf8");
      assert.match(privacy, /kr\.ulsan\.ldh\.pharmabin\) 개인정보처리방침/);
      assert.doesNotMatch(privacy, /앱으로 돌아가기/, "웹 사본에는 앱 안에서만 쓰는 돌아가기 링크가 없다");
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("건수 하한보다 적으면 실패하고 site를 만들지 않는다", () => {
    const { status, stdout, outDir } = build({ INPUT_FILE: "test/fixtures/standard-sample.json" });
    try {
      assert.equal(status, 1);
      assert.match(stdout, /하한 3000건/);
      assert.equal(existsSync(join(outDir, "v1/meta.json")), false);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("인증키도 파일도 없으면 실패한다", () => {
    const { status, stdout, outDir } = build({});
    rmSync(outDir, { recursive: true, force: true });
    assert.equal(status, 1);
    assert.match(stdout, /DATA_GO_KR_SERVICE_KEY/);
  });
});
