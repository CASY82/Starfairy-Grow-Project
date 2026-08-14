// 정적 도메인 참조 데이터: 정령 로스터, 스테이지 마스터, 이미지 경로 규칙.
// 상태를 갖지 않는 순수 데이터·조회 함수만 둔다 — 가변 진행 상태는 GameStore가 담당한다.

export const RARITY_ORDER = ['legendary', 'epic', 'rare', 'magic', 'common'];

export const RARITY_LABEL = {
  legendary: '레전더리',
  epic: '에픽',
  rare: '레어',
  magic: '매직',
  common: '일반'
};

export function rarityLabel(rarity) {
  return RARITY_LABEL[rarity] || rarity;
}

// plan/index.html :root 의 --legendary/--epic/--rare/--magic/--common 값 그대로.
export const RARITY_COLOR = {
  legendary: '#ff4d5f',
  epic: '#a779ff',
  rare: '#ffd84d',
  magic: '#4fa8ff',
  common: '#9499a8'
};

// unimplemented-features-design-spec.md §06-A. Common(82) 기준으로 정규화해 등급 계수로 쓴다.
export const RARITY_BUDGET = { legendary: 105, epic: 100, rare: 94, magic: 88, common: 82 };
export function rarityBudgetMultiplier(rarity) {
  return RARITY_BUDGET[rarity] / RARITY_BUDGET.common;
}

export function heroImagePath(name) {
  return `assets/images/${name}.jpg`;
}

// 루나리아만 원본 프로토타입과 동일하게 애니메이션 GIF 전신 일러스트를 쓴다(배너·소환 카드·결과 카드).
// 그 외 정령은 정적 JPG(heroImagePath)를 그대로 쓴다.
export function heroArtPath(name) {
  return name === '루나리아' ? 'assets/images/루나리아.gif' : heroImagePath(name);
}
// SD 초상화는 배경을 제거한 투명 PNG(원본 JPG에서 흰 배경 플러드필 제거로 생성)를 쓴다.
export function heroSdImagePath(name) {
  return `assets/images/${name}SD.png`;
}

export const WEAPON_OWNERS = ['루나리아', '이그니스', '실바나', '녹티스', '피로', '네레이', '솔레아', '아스트라', '코멧'];

// §04-6: 전용 무기 아트가 없는 11종은 동일 등급 대표 정령의 무기 아트를 재사용한다.
const WEAPON_ART_FALLBACK = { rare: '코멧', magic: '코멧', common: '코멧' };

export function weaponImagePath(name) {
  const owner = WEAPON_OWNERS.includes(name) ? name : WEAPON_ART_FALLBACK[heroRarityOf(name)] || '코멧';
  return `assets/images/무기/${owner}_무기.jpg`;
}
export function weaponSdImagePath(name) {
  const owner = WEAPON_OWNERS.includes(name) ? name : WEAPON_ART_FALLBACK[heroRarityOf(name)] || '코멧';
  return `assets/images/무기/${owner}_무기SD.jpg`;
}

export const POOL = {
  legendary: [
    { name: '루나리아', icon: '🌙', element: '달빛', role: '술사' },
    { name: '이그니스', icon: '🔥', element: '불꽃', role: '전사' },
    { name: '실바나', icon: '🌳', element: '숲', role: '지원' },
    { name: '녹티스', icon: '🌌', element: '어둠', role: '사수' }
  ],
  epic: [
    { name: '피로', icon: '🔥', element: '불꽃', role: '전사' },
    { name: '네레이', icon: '💧', element: '물결', role: '수호' },
    { name: '솔레아', icon: '☀️', element: '빛', role: '지원' },
    { name: '아스트라', icon: '💫', element: '빛', role: '사수' }
  ],
  rare: [
    { name: '코멧', icon: '☄️', element: '불꽃', role: '사수' },
    { name: '모스', icon: '🌿', element: '숲', role: '지원' },
    { name: '마리나', icon: '🐚', element: '물결', role: '술사' },
    { name: '브램', icon: '🛡️', element: '어둠', role: '수호' }
  ],
  magic: [
    { name: '스파크', icon: '🔸', element: '불꽃', role: '사수' },
    { name: '듀', icon: '💠', element: '물결', role: '지원' },
    { name: '리프', icon: '🍃', element: '숲', role: '전사' },
    { name: '글림', icon: '✧', element: '빛', role: '술사' }
  ],
  common: [
    { name: '애쉬', icon: '🗡️', element: '불꽃', role: '전사' },
    { name: '버블', icon: '🌊', element: '물결', role: '수호' },
    { name: '클로버', icon: '🍀', element: '숲', role: '지원' },
    { name: '더스크', icon: '◆', element: '어둠', role: '사수' }
  ]
};

RARITY_ORDER.forEach(rarity => {
  POOL[rarity].forEach(hero => {
    hero.rarity = rarity;
  });
});

export const ALL_HEROES = RARITY_ORDER.flatMap(rarity => POOL[rarity]);
const HERO_BY_NAME = Object.fromEntries(ALL_HEROES.map(h => [h.name, h]));

export function heroRarityOf(name) {
  return HERO_BY_NAME[name]?.rarity;
}
export function heroRoleOf(name) {
  return HERO_BY_NAME[name]?.role;
}
export function heroElementOf(name) {
  return HERO_BY_NAME[name]?.element;
}
export function heroIconOf(name) {
  return HERO_BY_NAME[name]?.icon || '✦';
}

// §06-3 역할 완성도: 수호 > 전사 > 사수 > 술사 > 지원 순으로 전열 우선 배치(자동 편성용).
export const ROLE_FRONT_PRIORITY = ['수호', '전사', '사수', '술사', '지원'];

// 5챕터 × 10스테이지 이름 — game-design-document.html §06-A 표를 그대로 사용
export const STAGE_NAMES = [
  '슬라임 길', '꽃가루 언덕', '고블린 야영지', '바람개울', '버섯 숲', '벌떼 둥지', '무너진 다리', '정찰대 길목', '초원 수호석', '가시왕 브램블',
  '안개 나루', '물방울 군락', '독개구리 늪', '침수 유적', '갈대 미로', '치유 토템', '늪지 추적자', '달빛 웅덩이', '심연 입구', '수렁마녀 모르가',
  '탄재 평원', '화염 임프', '용암 징검길', '붉은 광산', '폭발 수정', '협곡 매복', '불도마뱀 둥지', '재의 기사', '용광로 문', '화염거인 볼칸',
  '설원 초입', '얼음정령 길', '동결 회랑', '수정 감옥', '눈보라 탑', '수호기사단', '거울 방', '서리 마도진', '왕좌 전실', '빙관여왕 프리시아',
  '부서진 별길', '그림자 복제체', '중력 회랑', '공허 미믹', '역행 시계', '타락한 별지기', '무중력 정원', '일식 관측실', '별의 문', '공허룡 아비스'
];

export const CHAPTER_ICONS = ['🌿', '🐸', '🔥', '❄️', '🐉'];
export const CHAPTER_NAMES = ['별바람 초원', '푸른달 습지', '잿불 협곡', '별서리 성채', '공허의 천문대'];
export const CHAPTER_BACKGROUNDS = [
  '별바람_초원.jpg',
  '푸른달_습지.jpg',
  '잿불_협곡.jpg',
  '별서리_성채.jpg',
  '공허의_천문대.jpg'
];

// 각 챕터의 대표 일반 몬스터와 10단위 보스 전투 이미지.
export const CHAPTER_ENEMY_IMAGES = [
  '초원_새싹슬라임.png',
  '습지_달개구리.png',
  '협곡_화염임프.png',
  '성채_얼음정령.png',
  '천문대_공허미믹.png'
];

export const BOSS_ENEMY_IMAGES = {
  10: '가시왕_브램블.png',
  20: '수렁마녀_모르가.png',
  30: '화염거인_볼칸.png',
  40: '빙관여왕_프리시아.png',
  50: '공허룡_아비스.png'
};

export function enemyImagePath(stage) {
  const fileName = BOSS_ENEMY_IMAGES[stage] || CHAPTER_ENEMY_IMAGES[chapterOfStage(stage)];
  return `assets/images/monsters/${fileName}`;
}

export function chapterBackgroundPath(stage) {
  return `assets/images/backgrounds/${CHAPTER_BACKGROUNDS[chapterOfStage(stage)]}`;
}

// §06-4 챕터별 대표 속성(스토리 테마와 연결) — 속성 상성 판정에 쓴다.
export const CHAPTER_ELEMENT = ['숲', '물결', '불꽃', '빛', '어둠'];

// GDD 순환 상성: 불→숲→물→불, 빛↔어둠 상호 우위. attacker가 defender를 이기면 true.
export function elementBeats(attacker, defender) {
  const cycle = { 불꽃: '숲', 숲: '물결', 물결: '불꽃' };
  if (cycle[attacker] === defender) return true;
  if (attacker === '빛' && defender === '어둠') return true;
  if (attacker === '어둠' && defender === '빛') return true;
  return false;
}

export function chapterOfStage(stage) {
  return Math.min(4, Math.floor((stage - 1) / 10));
}

export const BOSS_LEGENDARY_LEVELS = [10, 25, 40, 55, 70];
export const BOSS_COMMON_LEVELS = [50, 65, 80, 95, 110];
