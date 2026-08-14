// 전투력 공식에 쓰이는 순수 계산 함수. GameStore의 상태(state/battle)를 직접 건드리지 않고
// 입력값만으로 계수를 계산한다 — unimplemented-features-design-spec.md §06 그대로 이식.
import { heroRoleOf, heroElementOf, elementBeats } from './heroCatalog.js';

/** §06-3 역할 완성도 계수. members는 정령 이름 배열(파티 5인). */
export function roleCompletionMultiplier(members) {
  const roles = new Set(members.map(name => heroRoleOf(name)).filter(Boolean));
  if (roles.size >= 3) return 1.08;
  if (roles.size === 2) return 0.98;
  return 0.9;
}

/** 파티 5인의 속성 다수결(과반) — 동률이면 첫 번째로 많이 나온 속성을 사용. */
export function partyDominantElement(members) {
  const counts = new Map();
  members.forEach(name => {
    const el = heroElementOf(name);
    if (!el) return;
    counts.set(el, (counts.get(el) || 0) + 1);
  });
  let best = null;
  let bestCount = 0;
  for (const [el, count] of counts) {
    if (count > bestCount) { best = el; bestCount = count; }
  }
  return best;
}

/** §06-4 속성 상성 계수. */
export function elementAdvantageMultiplier(partyElement, chapterElement) {
  if (!partyElement || !chapterElement) return 1;
  if (elementBeats(partyElement, chapterElement)) return 1.15;
  if (elementBeats(chapterElement, partyElement)) return 0.85;
  return 1;
}
