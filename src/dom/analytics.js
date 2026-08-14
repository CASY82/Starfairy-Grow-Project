// §12 로컬 분석 로그 — 서버가 없으므로 GDD §13 이벤트 스키마를 localStorage 링버퍼에 남기기만 한다.
// 실제 집계·대시보드는 서버 몫이라 여기서는 "나중에 내보낼 수 있는 형태로 쌓아두는 것"까지만 한다.
const KEY = 'starlight-spirit-analytics-v1';
const MAX_EVENTS = 500;

export function track(name, props = {}) {
  try {
    const raw = localStorage.getItem(KEY);
    const events = raw ? JSON.parse(raw) : [];
    events.push({ name, props, at: new Date().toISOString() });
    while (events.length > MAX_EVENTS) events.shift();
    localStorage.setItem(KEY, JSON.stringify(events));
  } catch {
    // 저장 실패는 게임 진행에 영향을 주지 않는다 — 조용히 무시한다.
  }
}

export function exportEvents() {
  return localStorage.getItem(KEY) || '[]';
}
