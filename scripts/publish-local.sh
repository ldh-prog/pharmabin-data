#!/bin/zsh
# 이 MacBook에서 스냅샷을 만들어 gh-pages 브랜치로 배포한다.
#
# GitHub Actions 러너(미국)에서는 data.go.kr 연결이 막혀(kiosk-data에서 확인) 국내 IP인 이 맥에서 받는다.
# launchd(kr.ulsan.ldh.pharmabin-data)가 하루 여러 번(04·10·13·16·19·22시) 부르고,
# 오늘(KST) 이미 성공했으면 건너뛴다. 맥이 잠깐 깨었다가 다시 잠들어 한 번 끊겨도 다음 시간대에 채운다.
#
# 원본은 지자체 데이터를 월 1회 병합하므로 대부분의 날은 내용이 같다. 내용(contentHash)이 직전 배포와 같으면
# push하지 않는다. 그래서 ‘배포본 나이’로는 실패를 알 수 없어, 마지막 성공 시각을 로컬 파일에 남긴다.
#
# 인증키는 로그인 키체인 항목(서비스 kr.ulsan.ldh.pharmabin-data, 계정 DATA_GO_KR_SERVICE_KEY)에서 읽는다.
# 환경변수 DATA_GO_KR_SERVICE_KEY 가 있으면 그것을 먼저 쓴다. FORCE=1 이면 오늘 성공했거나 내용이 같아도 다시 배포한다.
set -euo pipefail

REPO_DIR="${0:A:h:h}"
LABEL="kr.ulsan.ldh.pharmabin-data"
PAGES_BASE_URL="https://ldh-prog.github.io/pharmabin-data"
KEYCHAIN_SERVICE="$LABEL"
KEYCHAIN_ACCOUNT="DATA_GO_KR_SERVICE_KEY"
STATE_DIR="$HOME/Library/Application Support/$LABEL"
SUCCESS_STAMP="$STATE_DIR/last-success"
STALE_HOURS=30
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

log() { print -r -- "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# 마지막 성공 후 지난 시간(시간 단위, 정수). 기록이 없으면 빈 문자열.
success_age_hours() {
  [[ -f "$SUCCESS_STAMP" ]] || return 0
  print -r -- $(( ($(date +%s) - $(<"$SUCCESS_STAMP")) / 3600 ))
}

# 오늘(KST) 이미 성공했으면 0
succeeded_today_kst() {
  [[ -f "$SUCCESS_STAMP" ]] || return 1
  [[ "$(TZ=Asia/Seoul date -r "$(<"$SUCCESS_STAMP")" +%F)" == "$(TZ=Asia/Seoul date +%F)" ]]
}

mark_success() {
  mkdir -p "$STATE_DIR"
  date +%s > "$SUCCESS_STAMP"
}

# 배포된 meta.json 의 contentHash. 못 읽으면 빈 문자열.
published_content_hash() {
  curl -s --max-time 15 "$PAGES_BASE_URL/v1/meta.json" 2>/dev/null \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String(JSON.parse(s).contentHash??""))}catch{}})' 2>/dev/null \
    || true
}

# 실패해도 다음 시간대에 다시 돈다. 마지막 성공이 오래됐을 때만 알린다.
on_failure() {
  local age; age="$(success_age_hours)"
  if [[ -z "$age" || "$age" -ge "$STALE_HOURS" ]]; then
    /usr/bin/osascript -e "display notification \"마지막 성공이 ${age:-?}시간 전입니다. 로그: ~/Library/Logs/$LABEL.log\" with title \"폐의약품 수거함 데이터 갱신 실패\"" >/dev/null 2>&1 || true
  fi
  log "실패 (마지막 성공 ${age:-?}시간 전)"
}
trap on_failure ERR

# 깨어난 직후에는 네트워크가 늦게 붙는다. 최대 10분 기다린다.
wait_for_network() {
  for attempt in {1..20}; do
    if curl -s -o /dev/null --max-time 10 https://github.com; then
      return 0
    fi
    sleep 30
  done
  log "네트워크가 연결되지 않았습니다."
  return 1
}

log "시작"
cd "$REPO_DIR"
wait_for_network

if [[ "${FORCE:-0}" != "1" ]] && succeeded_today_kst; then
  log "오늘 이미 성공해 건너뜁니다."
  exit 0
fi

# INPUT_FILE(포털에서 내려받은 표준데이터 파일)이 있으면 API 대신 그 파일로 만든다. API가 막혔을 때의 비상 경로다.
if [[ -n "${INPUT_FILE:-}" ]]; then
  INPUT_FILE="${INPUT_FILE:A}"
  export INPUT_FILE
  log "파일로 만듭니다: $INPUT_FILE"
elif [[ -z "${DATA_GO_KR_SERVICE_KEY:-}" ]]; then
  DATA_GO_KR_SERVICE_KEY="$(security find-generic-password -s "$KEYCHAIN_SERVICE" -a "$KEYCHAIN_ACCOUNT" -w)"
fi
export DATA_GO_KR_SERVICE_KEY="${DATA_GO_KR_SERVICE_KEY:-}" PAGES_BASE_URL

# 스크립트 수정분을 받는다. 로컬에서 고친 내용이 있으면 덮지 않고 실패한다.
git pull --ff-only --quiet origin main

node scripts/build-snapshot.mjs

new_hash="$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync("site/v1/meta.json","utf8")).contentHash)')"
old_hash="$(published_content_hash)"
if [[ "${FORCE:-0}" != "1" && -n "$old_hash" && "$new_hash" == "$old_hash" ]]; then
  mark_success
  log "원본 내용이 직전 배포와 같아 올리지 않습니다 (${new_hash:0:12})."
  exit 0
fi

# 배포본은 한 커밋짜리 고아 브랜치로 강제 push한다. 매번 커밋을 쌓지 않으려는 것이다.
generated_at="$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync("site/v1/meta.json","utf8")).generatedAt)')"
publish_dir="$(mktemp -d)"
trap 'rm -rf "$publish_dir"' EXIT
cp -R site/. "$publish_dir/"
touch "$publish_dir/.nojekyll"
git -C "$publish_dir" init -q -b gh-pages
git -C "$publish_dir" add -A
git -C "$publish_dir" -c user.name="ldh-prog" -c user.email="deuckho@gmail.com" commit -q -m "snapshot ${generated_at}"
git -C "$publish_dir" push -q -f "$(git remote get-url origin)" gh-pages
mark_success
log "배포 완료: ${generated_at} (${new_hash:0:12})"
