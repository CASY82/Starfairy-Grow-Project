// 2026-10 콘텐츠 확장. 보상은 영구 외형이며 기존 성장 경제와 분리한다.
export const RELICS = [
  { id: 'frontAtk', label: '선봉의 별 · 전열 기본 공격 +15%', kind: 'front', value: 150 },
  { id: 'ultimateCharge', label: '빠른 궤도 · 궁극기 재사용 5틱 단축', kind: 'cooldown', value: 5 },
  { id: 'elementBonus', label: '오색 렌즈 · 기본 공격 +5%', kind: 'attack', value: 50 },
  { id: 'moonShell', label: '달의 껍질 · 받는 피해 8% 감소', kind: 'guard', value: 80 },
  { id: 'starWell', label: '별의 샘 · 회복 예산 최대 HP의 10% 추가', kind: 'heal', value: 100 },
  { id: 'firstShield', label: '새벽 방패 · 시작 보호막 최대 HP의 10%', kind: 'shield', value: 100 }
];
export function relicEffects(ids = []) {
  const totals = { front: 0, cooldown: 0, attack: 0, guard: 0, heal: 0, shield: 0 };
  for (const id of new Set(ids)) { const r = RELICS.find(x => x.id === id); if (r) totals[r.kind] += r.value; }
  return totals; // 중복 유물 불가: 각 효과는 카탈로그 값이 상한.
}
export const LOAN_HEROES = ['버블', '애쉬', '더스크', '미스트', '클로버'];
export const LESSONS = [
  { id: 'front', title: '01 전열을 세우는 법', hint: '버블을 전열에 두고 공격 역할을 함께 넣어보세요.', rule: 'front', stage: 1, enemyHp: 1400000n, members: 3 },
  { id: 'support', title: '02 회복과 공격의 균형', hint: '클로버의 회복에는 예산이 있어요. 공격 정령도 필요합니다.', rule: 'support', stage: 2, enemyHp: 1700000n, members: 3 },
  { id: 'roles', title: '03 서로 다른 세 역할', hint: '세 정령의 역할을 다르게 조합해보세요.', rule: 'roles', stage: 3, enemyHp: 1800000n, members: 3 },
  { id: 'magic', title: '04 물리 방어를 넘어서', hint: '물리 피해는 40%만 적용됩니다. 미스트의 마법 공격을 활용하세요.', rule: 'magic', stage: 11, enemyHp: 1900000n, members: 3, resist: { phys: 400, mag: 1000 } },
  { id: 'physical', title: '05 마법 방어를 넘어서', hint: '마법 피해는 40%만 적용됩니다. 애쉬나 더스크를 활용하세요.', rule: 'physical', stage: 21, enemyHp: 1900000n, members: 3, resist: { phys: 1000, mag: 400 } },
  { id: 'team', title: '06 별빛 종합 실습', hint: '수호·지원·공격 역할을 함께 배치하세요. 궁극기도 사용할 수 있어요.', rule: 'team', stage: 10, enemyHp: 3000000n, members: 4 }
];
export function lessonSatisfied(rule, party, roleOf) {
  const members = party.filter(Boolean), roles = members.map(s => roleOf(s.name));
  if (rule === 'front') return members.some(s => roleOf(s.name) === '수호' && s.row === 'front');
  if (rule === 'support') return roles.includes('지원') && roles.some(r => r !== '지원');
  if (rule === 'roles') return new Set(roles).size >= 3;
  if (rule === 'magic') return roles.includes('술사');
  if (rule === 'physical') return roles.some(r => ['전사', '사수'].includes(r));
  return roles.includes('수호') && roles.includes('지원') && roles.some(r => ['전사', '사수', '술사'].includes(r));
}
const scripts = {
  애쉬: [
    ['꺼지지 않는 불씨', '오늘은 내가 맨 앞에 설게.', '칼끝이 떨리는데 괜찮겠어?', '무서운 건 맞아. 그래도 길은 열어야지.', '혼자 다 막을 필요는 없어.', '그럼 세 걸음만 먼저 갈게. 그다음은 함께야.', '작은 불씨 하나가 일행의 발밑을 밝혔다.'],
    ['검을 내려놓는 시간', '검을 닦다가 작은 흠집을 찾았어.', '싸움의 흔적이네.', '처음에는 지우고 싶었는데, 이제는 기억하고 싶어.', '누구를 지켰는지?', '응. 그리고 누가 내 뒤를 지켜줬는지도.', '애쉬는 칼집에 작은 별 모양 실을 묶었다.'],
    ['돌아올 곳의 등불', '저 불빛 보여? 우리가 돌아갈 마을이야.', '오늘도 길을 잘 열어줬어.', '다음에는 누군가의 뒤에서 걸어보고 싶어.', '뒤를 지키는 것도 중요한 일이니까.', '그럼 마지막 등불은 내가 끌게. 모두 돌아온 다음에.', '등불 아래 애쉬의 검이 조용히 쉬었다.']
  ],
  버블: [
    ['물방울의 방패', '방패가 너무 커 보인다고?', '네 얼굴이 거의 안 보여.', '괜찮아. 친구들은 잘 보이거든.', '무엇을 보고 있어?', '누가 숨이 찬지, 누가 조금 쉬어야 하는지.', '방패 가장자리에 맺힌 물방울이 작은 거울처럼 빛났다.'],
    ['비가 쉬어 가는 곳', '오늘은 빗소리가 유난히 커.', '소풍을 미뤄야 할까?', '방패 아래는 아직 자리가 있어.', '정말 모두 들어갈 수 있을까?', '조금 붙어 앉으면 돼. 따뜻하기도 하잖아.', '작은 방패 아래서 가장 긴 이야기가 시작됐다.'],
    ['먼저 내민 손', '오늘은 내가 넘어졌네.', '손을 잡아. 일으켜 줄게.', '늘 지켜주고 싶었는데.', '지켜주는 친구도 기댈 곳은 필요해.', '그럼 다음 웅덩이는 같이 건너자.', '두 발자국 사이로 맑은 물결이 번졌다.']
  ],
  클로버: [
    ['세 잎의 약속', '행운을 찾고 있어?', '네 잎 클로버가 있으면 좋겠어.', '세 잎도 햇빛을 잘 받아. 여길 봐.', '작은 새싹이 자라고 있네.', '행운이 오기 전에도 돌볼 것은 많아.', '클로버는 새싹 옆에 작은 표식을 세웠다.'],
    ['조금 느린 치유', '오늘 꽃은 어제보다 덜 피었어.', '물을 더 주면 될까?', '너무 많이 주면 뿌리가 힘들어져.', '기다리는 것도 돌봄이구나.', '응. 친구에게도 쉴 시간이 필요해.', '둘은 물뿌리개를 내려놓고 나란히 햇볕을 쬐었다.'],
    ['모두의 작은 정원', '마을에 빈 화분이 하나 남았어.', '어떤 꽃을 심을까?', '각자 좋아하는 씨앗을 조금씩 가져오자.', '꽃이 피는 때가 모두 다를 텐데?', '그래서 언제 돌아와도 반겨줄 꽃이 있을 거야.', '정원 한쪽에 아직 이름 없는 자리가 마련됐다.']
  ]
};
export const EPISODES = Object.entries(scripts).flatMap(([hero, chapters]) => chapters.map(([title, ...lines], i) => ({ id: `bond-${hero}-${i + 1}`, hero, bond: [1, 3, 5][i], title, lines })));
export const PROLOGUE = { title: '별빛 아래 첫 만남', lines: ['작은 마을의 천문대가 오랜 잠에서 깨어났다.', '흩어진 정령들은 저마다의 이유로 별빛을 따라왔다.', '누군가는 길을 열고, 누군가는 돌아갈 곳을 지켰다.', '별지기인 당신은 그 이야기를 하나씩 기록하기로 했다.', '정령에게 선물을 주고 인연을 쌓으면 새로운 이야기가 열린다.', '오늘은 누구의 이야기를 들어볼까?'] };
export const CHAPTERS = ['별빛 초원', '푸른달 습지', '고대 숲', '황혼 유적', '별의 정상'];
export const DISCOVERIES = CHAPTERS.flatMap((name, i) => [
  { id: `journal-${i}-path`, chapter: i, label: `${name}의 길`, text: '별빛을 따라 걸은 길에 작은 발자국이 남았다.', stage: i * 10 + 1 },
  { id: `journal-${i}-life`, chapter: i, label: `${name}의 생명`, text: '전투가 멎자 풀잎 사이에서 숲의 소리가 돌아왔다.', stage: i * 10 + 5 },
  { id: `journal-${i}-memory`, chapter: i, label: `${name}의 기억`, text: '강한 적을 넘어선 자리에는 오래된 별의 문양이 있었다.', stage: (i + 1) * 10 }
]);
export const WEEKLY_RULES = [
  { id: 'armor', title: '강철 궤도', description: '물리 피해 70% · 마법 피해 100%', resist: { phys: 700, mag: 1000 } },
  { id: 'veil', title: '안개의 궤도', description: '물리 피해 100% · 마법 피해 70%', resist: { phys: 1000, mag: 700 } },
  { id: 'drought', title: '고요한 궤도', description: '회복 예산 50% · 보호막은 그대로', healPermille: 500 }
];
export const SIDE_STORY = [
  { title: '프롤로그 · 잠든 별', lines: ['숲으로 떨어진 별들이 눈을 뜨지 않았다.', '클로버는 풀잎을 살피고 버블은 조심스럽게 길을 열었다.', '애쉬가 속삭였다. 깨우기보다 먼저 지켜주자.', '오래된 관측소에서 희미한 노랫소리가 들려왔다.'] },
  { title: '막간 · 관측소의 노래', lines: ['덩굴 아래 묻힌 관측소의 바늘이 멈춰 있었다.', '바늘은 힘으로 움직이는 것이 아니었다.', '정령들이 서로의 빛을 비추자 낡은 금속에 온기가 돌았다.', '마지막 문 앞에서 잠의 수호자가 눈을 떴다.'] },
  { title: '결말 · 다시 뜨는 별', lines: ['수호자는 길을 비켜주고 조용히 고개를 숙였다.', '별들은 잠에서 깨어 밤하늘로 하나씩 떠올랐다.', '클로버는 빈 뿌리 사이에 작은 꽃을 심었다.', '돌아오는 길에도 숲에는 별빛이 남아 있었다.'] }
];
export const DECORATIONS = [
  { id: 'lantern', label: '길잡이 등불', glyph: '🏮', source: '기본 제공' },
  { id: 'seed', label: '별꽃 화분', glyph: '🌱', source: '기본 제공' },
  { id: 'book', label: '이야기 책장', glyph: '📖', source: '인연극장 1화 완료' },
  { id: 'telescope', label: '작은 망원경', glyph: '🔭', source: '탐험 수첩 1챕터 완성' },
  { id: 'shield', label: '관측 기념패', glyph: '🛡️', source: '보스 관측 과제 1개 완료' },
  { id: 'flag', label: '원정대 깃발', glyph: '🚩', source: '두 파티 원정대 완료' }
];
export const CONTENT_ART = { forest: 'assets/images/content/sleeping-forest.jpg', guardian: 'assets/images/content/forest-guardian.png' };
export function newContentState() {
  return { completed: [], equippedBadge: null, theme: 'night', decorationSlots: ['lantern', 'seed', null], representative: null, dispatches: 0, weeklyRecords: {}, latestWeek: '', sideProgress: 0 };
}
export function normalizeContentState(raw = {}) {
  const s = newContentState();
  if (!raw || typeof raw !== 'object') return s;
  const validId = id => typeof id === 'string' && /^(bond-|lesson-|boss-|journal-|weekly-|relay$|side$|relic$)/.test(id) && id.length < 100;
  s.completed = [...new Set(Array.isArray(raw.completed) ? raw.completed.filter(validId) : [])].slice(0, 500);
  s.equippedBadge = s.completed.includes(raw.equippedBadge) ? raw.equippedBadge : null;
  s.theme = ['night', 'dawn', 'forest'].includes(raw.theme) ? raw.theme : 'night';
  s.decorationSlots = Array.from({ length: 3 }, (_, i) => DECORATIONS.some(d => d.id === raw.decorationSlots?.[i]) ? raw.decorationSlots[i] : null);
  if (!Array.isArray(raw.decorationSlots)) s.decorationSlots = ['lantern', 'seed', null];
  s.representative = typeof raw.representative === 'string' ? raw.representative : null;
  s.dispatches = Number.isSafeInteger(raw.dispatches) ? Math.max(0, raw.dispatches) : 0;
  s.sideProgress = Number.isInteger(raw.sideProgress) ? Math.max(0, Math.min(5, raw.sideProgress)) : 0;
  const validDate = key => typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key) && Number.isFinite(Date.parse(`${key}T00:00:00Z`)) && new Date(`${key}T00:00:00Z`).toISOString().slice(0, 10) === key;
  s.latestWeek = validDate(raw.latestWeek) ? raw.latestWeek : '';
  for (const [key, val] of Object.entries(raw.weeklyRecords || {}).slice(-156)) {
    if (validDate(key) && Number.isSafeInteger(val) && val > 0) s.weeklyRecords[key] = val;
  }
  return s;
}
