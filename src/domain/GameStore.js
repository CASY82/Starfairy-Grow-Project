// 게임 진행 상태 + 규칙 전체(가챠/전투/정령 성장/파티 편성/마을/던전/미션/저장)를 캡슐화한 도메인 모델.
// unimplemented-features-design-spec.md §01~11을 이식했다. 기존 검증된 수치(가챠 확률·천장·
// 성급 배율·합치기 비용·재화 강화 상한)는 절대 바꾸지 않는다.
import {
  POOL, RARITY_BUDGET, ROLE_FRONT_PRIORITY, CHAPTER_ELEMENT,
  heroRarityOf, heroRoleOf, heroElementOf, chapterOfStage
} from './heroCatalog.js';
import { roleCompletionMultiplier, elementAdvantageMultiplier, partyDominantElement } from './combatFormulas.js';

const SAVE_VERSION = 3;
const SAVE_KEY = 'starlight-spirit-product-v1';

const MERGE_COSTS = [0, 1, 2, 3, 5, 8];
const STAR_MULTIPLIERS = [0, 1, 1.3, 1.7, 2.25, 3, 4];
const WEAPON_STAR_MUL = [0, 1.0, 1.1, 1.22, 1.36, 1.52];
const WEAPON_CAP = { normal: 0.18, elite: 0.12, boss: 0.08 };
const BLUEPRINT_COST = { 2: 1, 3: 1, 4: 2, 5: 3 };
// §05-5: 기존 데모 초기 파티(레전더리 3인+일반 2인, Lv1★1)로 역산해 이전 체감 전투력과 이어지게 맞춘 튜닝값.
const PARTY_ATTACK_BASE = 2044.03;
const PARTY_HP_BASE = 4175.37;

const BUILDING_BASE = {
  observatory: { wood: 100, stone: 60, starIron: 0 },
  lumbermill: { wood: 90, stone: 50, starIron: 0 },
  quarry: { wood: 90, stone: 50, starIron: 0 },
  forge: { wood: 110, stone: 70, starIron: 15 },
  hall: { wood: 100, stone: 60, starIron: 0 },
  camp: { wood: 120, stone: 80, starIron: 0 }
};

const DEX_MILESTONES = {
  5: { starBond: 100 },
  10: { starBond: 200, gold: 5000000n },
  15: { starBond: 300 },
  20: { starBond: 1000, memoryStars: 50 }
};

const LABYRINTH_BUFFS = [
  { id: 'frontAtk', label: '전열 공격 +15%' },
  { id: 'ultimateCharge', label: '궁극기 게이지 +20% 충전 속도' },
  { id: 'elementBonus', label: '속성 상성 보정 +5%p' }
];

const DEFAULT_PARTY = [
  { name: '루나리아', row: 'front' },
  { name: '이그니스', row: 'front' },
  { name: '실바나', row: 'back' },
  { name: '버블', row: 'back' },
  { name: '클로버', row: 'back' }
];

function localDateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function localWeekKey(d = new Date()) {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (date.getDay() + 6) % 7; // 0=월요일
  date.setDate(date.getDate() - dow);
  return localDateKey(date);
}
function localMonthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function requiredExp(level) {
  if (level <= 20) return 80 * Math.pow(1.09, level - 1);
  if (level <= 40) return 80 * Math.pow(1.09, 19) * Math.pow(1.06, level - 21);
  return 80 * Math.pow(1.09, 19) * Math.pow(1.06, 19) * Math.pow(1.04, level - 41);
}

function createHeroRecord() {
  return { level: 1, star: 1, ownShards: 0, bond: 0, bondExp: 0, bondGiftsToday: 0, locked: false, favorite: false, weaponLevel: 0, weaponStar: 1 };
}

function defaultDailyMissions() {
  return {
    stageClears: { progress: 0, target: 5, claimed: false },
    heroLevelUp: { progress: 0, target: 1, claimed: false },
    summonOnce: { progress: 0, target: 1, claimed: false }
  };
}
function defaultWeeklyMissions() {
  return {
    stageClears: { progress: 0, target: 100, claimed: false },
    heroLevelUps: { progress: 0, target: 10, claimed: false },
    merges: { progress: 0, target: 5, claimed: false },
    bountyWins: { progress: 0, target: 5, claimed: false },
    towerFloors: { progress: 0, target: 5, claimed: false },
    labyrinthRuns: { progress: 0, target: 1, claimed: false }
  };
}

// 파티 5슬롯이 순서대로 돌아가며 궁극기를 쏘는 개인 쿨타임. 한 슬롯의 주기는
// ULTIMATE_COOLDOWN_TICKS이고, 슬롯별 시작값을 1/5씩 어긋나게 둬서 항상 누군가의 궁극기가
// 골고루 돌아가며 준비되게 한다(전부 동시에 차서 한꺼번에 쏘지 않도록).
const ULTIMATE_COOLDOWN_TICKS = 65;
const ULTIMATE_MANUAL_GRACE_TICKS = 10;

const INITIAL_BATTLE = {
  stage: 18,
  attack: 1250000n,
  attackLevel: 1,
  enemyHp: 48000000n,
  enemyMaxHp: 48000000n,
  reward: 30000000n,
  upgradeCost: 1000000000n,
  partyIndex: 0,
  partyMaxHp: 2000000n,
  partyHp: 2000000n,
  elapsedMs: 0,
  maxStageCleared: 18,
  consecutiveLosses: 0,
  // 슬롯 0~4의 궁극기 준비까지 남은 틱. 0 이하면 준비 완료, 음수는 수동 모드에서 대기 중인
  // 유예 틱(-ULTIMATE_MANUAL_GRACE_TICKS에 닿으면 자동으로 발동).
  ultimateCooldowns: [65, 52, 39, 26, 13]
};

function cloneInitialState() {
  const heroes = {};
  ['루나리아', '이그니스', '실바나', '버블', '클로버'].forEach(name => { heroes[name] = createHeroRecord(); });
  return {
    gems: 12840n,
    gold: 2480000000n,
    pity: 72,
    pickupGuaranteed: false,
    materials: { wood: 120, stone: 80, starDew: 45, starIron: 60, starPowder: 0 },
    starBond: 0,
    memoryStars: 0,
    weaponBlueprint: 0,
    bondGifts: 5,
    account: { level: 1, exp: 0, nickname: '별지기', profileIcon: null },
    heroes,
    shardPool: { legendary: 0, epic: 0, rare: 0, magic: 0, common: 0 },
    clearedStages: [],
    claimedDexMilestones: [],
    party: DEFAULT_PARTY.map(s => ({ ...s })),
    partyPresets: [null, null, null],
    battleSpeed: 1,
    ultimateMode: 'auto',
    buildings: { observatory: 1, lumbermill: 1, quarry: 1, forge: 1, hall: 1, camp: 1 },
    buildingQueue: null,
    dungeons: {
      expedition: { usesToday: 2, selected: 'wood' },
      sanctuary: { usesWeek: 3 },
      armory: { usesWeek: 3 }
    },
    unlocked: { ultimate: false, speed2x: false, bounty: false, tower: false, labyrinth: false, hardMode: false },
    hardModeActive: false,
    bounty: { gold: { usesToday: 2 }, exp: { usesToday: 2 }, starIron: { usesToday: 2 } },
    tower: { floor: 1, weeklyClaimedFloor: 0 },
    labyrinth: { active: false, room: 0, buffs: [], weeklyDone: false },
    missions: { daily: defaultDailyMissions(), weekly: defaultWeeklyMissions() },
    attendance: { month: null, days: [] },
    seasonTrack: { cycleStart: null, claimedTier: 0 },
    monthlyEventClaimed: false,
    dailyResetDate: null,
    weeklyResetKey: null,
    monthKey: null,
    settings: { textSize: 'md' }
  };
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

export default class GameStore {
  #state = cloneInitialState();
  #battle = { ...INITIAL_BATTLE, ultimateCooldowns: [...INITIAL_BATTLE.ultimateCooldowns] };
  #currentResults = [];
  #busy = false;

  constructor() {
    this.loadLocalSave();
    this.#rolloverIfNeeded();
    this.recomputePartyStats();
  }

  get state() { return this.#state; }
  get battle() { return this.#battle; }
  get busy() { return this.#busy; }
  set busy(value) { this.#busy = value; }

  // ---------------------------------------------------------- 저장/불러오기
  #snapshot() {
    return { version: SAVE_VERSION, savedAt: new Date().toISOString(), state: this.#state, battle: this.#battle };
  }

  #stringify(data) {
    return JSON.stringify(data, (_, value) => (typeof value === 'bigint' ? { __bigint: value.toString() } : value), 2);
  }

  #parse(text) {
    const data = JSON.parse(text, (_, value) => (value && typeof value === 'object' && /^-?\d+$/.test(value.__bigint || '') ? BigInt(value.__bigint) : value));
    if (!data || !data.state || !data.battle) throw new Error('지원하지 않는 저장 파일입니다.');
    if (typeof data.state.gems !== 'bigint' || typeof data.state.gold !== 'bigint') throw new Error('재화 데이터가 손상되었습니다.');
    if (data.state.gems < 0n || data.state.gold < 0n) throw new Error('재화 값이 올바르지 않습니다.');
    if (!Number.isInteger(data.battle.stage) || data.battle.stage < 1 || data.battle.stage > 50) throw new Error('스테이지 값이 올바르지 않습니다.');
    return data;
  }

  /** v2(§04 이전) 저장을 새 heroes{}/party[] 구조로 이관한다. */
  #migrateLegacy(data) {
    if (data.version >= 3) return data;
    const legacyMerge = data.mergeState;
    const legacyWeapon = data.state?.weapon;
    if (legacyMerge && data.state && !data.state.heroes) {
      data.state.heroes = { 루나리아: { ...createHeroRecord(), star: legacyMerge.star || 1, weaponLevel: legacyWeapon?.level || 0 } };
    }
    return data;
  }

  #apply(rawData) {
    const data = this.#migrateLegacy(rawData);
    const base = cloneInitialState();
    const s = data.state || {};
    this.#state = {
      ...base,
      ...s,
      materials: { ...base.materials, ...(s.materials || {}) },
      account: { ...base.account, ...(s.account || {}) },
      heroes: { ...base.heroes, ...(s.heroes || {}) },
      shardPool: { ...base.shardPool, ...(s.shardPool || {}) },
      party: Array.isArray(s.party) && s.party.length === 5 ? s.party : base.party,
      partyPresets: Array.isArray(s.partyPresets) ? s.partyPresets : base.partyPresets,
      buildings: { ...base.buildings, ...(s.buildings || {}) },
      dungeons: {
        expedition: { ...base.dungeons.expedition, ...(s.dungeons?.expedition || {}) },
        sanctuary: { ...base.dungeons.sanctuary, ...(s.dungeons?.sanctuary || {}) },
        armory: { ...base.dungeons.armory, ...(s.dungeons?.armory || {}) }
      },
      unlocked: { ...base.unlocked, ...(s.unlocked || {}) },
      bounty: {
        gold: { ...base.bounty.gold, ...(s.bounty?.gold || {}) },
        exp: { ...base.bounty.exp, ...(s.bounty?.exp || {}) },
        starIron: { ...base.bounty.starIron, ...(s.bounty?.starIron || {}) }
      },
      tower: { ...base.tower, ...(s.tower || {}) },
      labyrinth: { ...base.labyrinth, ...(s.labyrinth || {}) },
      missions: {
        daily: { ...base.missions.daily, ...(s.missions?.daily || {}) },
        weekly: { ...base.missions.weekly, ...(s.missions?.weekly || {}) }
      },
      attendance: { ...base.attendance, ...(s.attendance || {}) },
      seasonTrack: { ...base.seasonTrack, ...(s.seasonTrack || {}) },
      settings: { ...base.settings, ...(s.settings || {}) },
      clearedStages: Array.isArray(s.clearedStages) ? s.clearedStages : [],
      claimedDexMilestones: Array.isArray(s.claimedDexMilestones) ? s.claimedDexMilestones : []
    };
    const savedCooldowns = data.battle.ultimateCooldowns;
    this.#battle = {
      ...INITIAL_BATTLE,
      ...data.battle,
      ultimateCooldowns: Array.isArray(savedCooldowns) && savedCooldowns.length === 5
        ? [...savedCooldowns]
        : [...INITIAL_BATTLE.ultimateCooldowns]
    };
    this.#currentResults = [];
    this.#rolloverIfNeeded();
    this.recomputePartyStats();
  }

  loadLocalSave() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    try {
      this.#apply(this.#parse(raw));
      return true;
    } catch (error) {
      console.warn('저장 데이터 복구 실패', error);
      return false;
    }
  }

  saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, this.#stringify(this.#snapshot()));
      return { ok: true, at: new Date() };
    } catch (error) {
      return { ok: false, error };
    }
  }

  exportSaveText() {
    return this.#stringify(this.#snapshot());
  }

  importSaveText(text) {
    if (text.length > 1024 * 1024) throw new Error('저장 파일은 1MB 이하여야 합니다.');
    this.#apply(this.#parse(text));
    this.saveGame();
  }

  resetGame() {
    this.#state = cloneInitialState();
    this.#battle = { ...INITIAL_BATTLE, ultimateCooldowns: [...INITIAL_BATTLE.ultimateCooldowns] };
    this.#currentResults = [];
    localStorage.removeItem(SAVE_KEY);
    this.#rolloverIfNeeded();
    this.recomputePartyStats();
  }

  // -------------------------------------------------------- 일간/주간/월간 리셋
  #rolloverIfNeeded() {
    const day = localDateKey();
    if (this.#state.dailyResetDate !== day) {
      this.#state.dailyResetDate = day;
      this.#state.missions.daily = defaultDailyMissions();
      this.#state.dungeons.expedition.usesToday = 2;
      this.#state.bounty.gold.usesToday = 2;
      this.#state.bounty.exp.usesToday = 2;
      this.#state.bounty.starIron.usesToday = 2;
      Object.values(this.#state.heroes).forEach(h => { h.bondGiftsToday = 0; });
    }
    const week = localWeekKey();
    if (this.#state.weeklyResetKey !== week) {
      this.#state.weeklyResetKey = week;
      this.#state.missions.weekly = defaultWeeklyMissions();
      this.#state.dungeons.sanctuary.usesWeek = 3;
      this.#state.dungeons.armory.usesWeek = 3;
      this.#state.tower.weeklyClaimedFloor = 0;
      this.#state.labyrinth = { active: false, room: 0, buffs: [], weeklyDone: false };
    }
    const month = localMonthKey();
    if (this.#state.monthKey !== month) {
      this.#state.monthKey = month;
      this.#state.attendance = { month, days: [] };
      this.#state.monthlyEventClaimed = false;
    }
    if (!this.#state.seasonTrack.cycleStart || Date.now() - new Date(this.#state.seasonTrack.cycleStart).getTime() >= 28 * 86400000) {
      this.#state.seasonTrack = { cycleStart: new Date().toISOString(), claimedTier: 0 };
    }
  }

  /** app.js가 주기적으로(자동저장 타이머 등) 호출해 자정을 넘겼는지 재확인한다. */
  checkResets() {
    this.#rolloverIfNeeded();
  }

  #trackMission(key, amount) {
    const d = this.#state.missions.daily[key];
    if (d && !d.claimed) d.progress = Math.min(d.target, d.progress + amount);
    const w = this.#state.missions.weekly[key];
    if (w && !w.claimed) w.progress = Math.min(w.target, w.progress + amount);
  }

  #addAccountExp(amount) {
    const acc = this.#state.account;
    if (acc.level >= 60) return;
    acc.exp += amount;
    while (acc.level < 60) {
      const need = requiredExp(acc.level);
      if (acc.exp < need) break;
      acc.exp -= need;
      acc.level += 1;
      if (acc.level >= 60) { acc.exp = 0; break; }
    }
  }

  // -------------------------------------------------------------- 가챠
  #applyObtain(base, rarity) {
    const isNew = !(base.name in this.#state.heroes);
    if (isNew) {
      this.#state.heroes[base.name] = createHeroRecord();
    } else {
      const hero = this.#state.heroes[base.name];
      if (hero.star >= 6) this.#state.memoryStars += 10;
      else { this.#state.shardPool[rarity] += 1; hero.ownShards += 1; }
    }
    return { ...base, rarity, isNew };
  }

  #revertObtain(result) {
    if (result.isNew) {
      delete this.#state.heroes[result.name];
      return;
    }
    const hero = this.#state.heroes[result.name];
    if (!hero) return;
    if (hero.star >= 6) this.#state.memoryStars -= 10;
    else { this.#state.shardPool[result.rarity] -= 1; hero.ownShards -= 1; }
  }

  #rollOne(usePickup) {
    this.#state.pity += 1;
    let legendaryChance = 0.03;
    if (this.#state.pity >= 61) legendaryChance = Math.min(1, 0.03 + (this.#state.pity - 60) * 0.05);
    const roll = Math.random();
    let rarity;
    if (roll < legendaryChance || this.#state.pity >= 80) {
      rarity = 'legendary';
      this.#state.pity = 0;
    } else if (roll < legendaryChance + 0.12) {
      rarity = 'epic';
    } else if (roll < legendaryChance + 0.32) {
      rarity = 'rare';
    } else if (roll < legendaryChance + 0.62) {
      rarity = 'magic';
    } else {
      rarity = 'common';
    }
    let base;
    if (rarity === 'legendary') {
      const pickup = POOL.legendary[0];
      if (usePickup) {
        let hitPickup;
        if (this.#state.pickupGuaranteed) {
          hitPickup = true;
          this.#state.pickupGuaranteed = false;
        } else {
          hitPickup = Math.random() < 0.5;
          if (!hitPickup) this.#state.pickupGuaranteed = true;
        }
        base = hitPickup ? pickup : randomItem(POOL.legendary.filter(h => h.name !== pickup.name));
      } else {
        base = randomItem(POOL.legendary);
      }
    } else {
      base = randomItem(POOL[rarity]);
    }
    return this.#applyObtain(base, rarity);
  }

  #rollBatch(count, usePickup) {
    this.#currentResults = [];
    for (let i = 0; i < count; i++) this.#currentResults.push(this.#rollOne(usePickup));
    if (count === 10 && this.#currentResults.every(r => !['legendary', 'epic'].includes(r.rarity))) {
      this.#revertObtain(this.#currentResults[9]);
      const epicBase = randomItem(POOL.epic);
      const replaced = this.#applyObtain(epicBase, 'epic');
      this.#currentResults[9] = { ...replaced, correctedFrom: this.#currentResults[9].name };
    }
    this.#trackMission('summonOnce', 1);
    return this.#currentResults;
  }

  pullCost(count) {
    return BigInt(count * 300);
  }

  canAffordPull(count) {
    return this.#state.gems >= this.pullCost(count);
  }

  /** 픽업 배너, 보석 소모. 재화 차감 후 count개 결과를 확정한다(10회 보정 포함). */
  pull(count) {
    const cost = this.pullCost(count);
    if (this.#state.gems < cost) return null;
    this.#state.gems -= cost;
    return this.#rollBatch(count, true);
  }

  /** 일반 배너 — 동일 풀·확률·천장이지만 픽업 50:50이 적용되지 않는다(§08-2). */
  pullNormal(count) {
    const cost = this.pullCost(count);
    if (this.#state.gems < cost) return null;
    this.#state.gems -= cost;
    return this.#rollBatch(count, false);
  }

  starBondPullCost(count) {
    return count * 300;
  }

  canAffordBondPull(count) {
    return this.#state.starBond >= this.starBondPullCost(count);
  }

  /** 별의 인연 재화로 픽업 배너를 당긴다(§01-2 교환소). */
  pullWithBond(count) {
    const cost = this.starBondPullCost(count);
    if (this.#state.starBond < cost) return null;
    this.#state.starBond -= cost;
    return this.#rollBatch(count, true);
  }

  // -------------------------------------------------------------- 전투 공식
  #stageType(stage) {
    if (stage % 10 === 0) return 'boss';
    if (stage % 5 === 0) return 'elite';
    return 'normal';
  }

  #weaponContribution(hero, stageType) {
    if (!hero.weaponLevel) return 0;
    const raw = hero.weaponLevel * 0.02 * WEAPON_STAR_MUL[hero.weaponStar];
    return Math.min(WEAPON_CAP[stageType], raw);
  }

  #attackBonusTenths() {
    const currencyLevels = Math.max(0, this.#battle.attackLevel - 1);
    const stageType = this.#stageType(this.#battle.stage);
    const isBoss = stageType === 'boss';
    const isElite = stageType === 'elite';
    const enhance = Math.min(isBoss ? 150 : isElite ? 300 : 600, currencyLevels * (isBoss ? 5 : isElite ? 10 : 20));
    const campLevels = Math.max(0, this.#state.buildings.camp - 1);
    const camp = stageType === 'normal' ? Math.min(95, campLevels * 5) : 0;
    return enhance + camp;
  }

  /** §05-5: 편성 5인을 합산해 battle.attack/partyMaxHp를 다시 계산한다. 부작용 없는 재호출 안전 함수. */
  recomputePartyStats() {
    const accountLevelMul = 1 + 0.006 * (this.#state.account.level - 1);
    const stageType = this.#stageType(this.#battle.stage);
    const consecutiveBonus = this.#battle.consecutiveLosses >= 6 ? 1.08 : this.#battle.consecutiveLosses >= 3 ? 1.05 : 1;
    let attack = 0;
    let hp = 0;
    for (const slot of this.#state.party) {
      const hero = this.#state.heroes[slot.name];
      if (!hero) continue;
      const rarity = heroRarityOf(slot.name);
      const budget = RARITY_BUDGET[rarity] ?? RARITY_BUDGET.common;
      const levelMul = 1 + 0.01 * (hero.level - 1);
      const hpLevelMul = 1 + 0.012 * (hero.level - 1);
      const starMul = STAR_MULTIPLIERS[hero.star];
      const weaponMul = this.#weaponContribution(hero, stageType);
      const rowMul = slot.row === 'back' ? 1.05 : 1.0;
      attack += budget * levelMul * starMul * (1 + weaponMul) * rowMul;
      hp += budget * hpLevelMul * starMul;
    }
    const memberNames = this.#state.party.map(s => s.name);
    const roleMul = roleCompletionMultiplier(memberNames);
    const chapterElement = CHAPTER_ELEMENT[chapterOfStage(this.#battle.stage)];
    const elementMul = elementAdvantageMultiplier(partyDominantElement(memberNames), chapterElement);
    attack *= roleMul * elementMul * accountLevelMul;
    this.#battle.attack = BigInt(Math.max(1, Math.round(attack * PARTY_ATTACK_BASE)));
    const newMaxHp = BigInt(Math.max(1, Math.round(hp * PARTY_HP_BASE * consecutiveBonus)));
    this.#battle.partyMaxHp = newMaxHp;
    if (this.#battle.partyHp === undefined || this.#battle.partyHp > newMaxHp) this.#battle.partyHp = newMaxHp;
  }

  effectiveAttack() {
    this.recomputePartyStats();
    return (this.#battle.attack * BigInt(1000 + this.#attackBonusTenths())) / 1000n;
  }

  dpsValue() {
    return (this.effectiveAttack() * 5n) / 4n;
  }

  /** §06-5 사전 판정 배지. enemyHpOverride를 주면(탑/미궁 등) 그 값 기준으로 계산한다. */
  #battleForecast(enemyHpOverride) {
    const enemyHp = enemyHpOverride ?? this.#battle.enemyMaxHp;
    const attack = this.effectiveAttack();
    const expectedDamage = attack * 5n * 90n;
    const requiredDamage = (enemyHp * 105n) / 100n;
    const enemyAttackPerTick = enemyHp / 6000n;
    const expectedIncoming = enemyAttackPerTick * 112n;
    const survivalThreshold = (expectedIncoming * 110n) / 100n;
    const partyMaxHp = this.#battle.partyMaxHp;
    let verdict;
    if (expectedDamage < requiredDamage) verdict = '공격력 부족';
    else if (partyMaxHp < survivalThreshold) verdict = '생존력 부족';
    else verdict = '예상 승리';
    return { expectedDamage, requiredDamage, expectedIncoming, survivalThreshold, partyMaxHp, verdict };
  }

  battleForecast() {
    return this.#battleForecast();
  }

  #bossScale(stage) {
    return { 10: 30n, 20: 30n, 30: 32n, 40: 33n, 50: 36n }[stage] || 10n;
  }

  #checkUnlocks() {
    const m = this.#battle.maxStageCleared;
    const u = this.#state.unlocked;
    if (m >= 5) u.ultimate = true;
    if (m >= 10) u.speed2x = true;
    if (m >= 20) u.bounty = true;
    if (m >= 30) u.tower = true;
    if (m >= 40) u.labyrinth = true;
    if (m >= 50) u.hardMode = true;
  }

  /** 적 처치 후 보상 지급, 재료 획득, 계정 경험치, 다음 스테이지 산정. */
  #nextEnemy() {
    const b = this.#battle;
    const bld = this.#state.buildings;
    const earnedReward = b.reward;
    this.#state.gold += earnedReward;
    const previousStage = b.stage;
    this.#state.materials.wood += Math.round((8 + previousStage * 2) * (1 + 0.05 * (bld.lumbermill - 1)));
    this.#state.materials.stone += Math.round((5 + previousStage) * (1 + 0.05 * (bld.quarry - 1)));
    this.#state.materials.starPowder += 6 + previousStage * 3;
    if (previousStage % 5 === 0) this.#state.materials.starDew += previousStage % 10 === 0 ? 12 : 4;
    if (previousStage % 10 === 0) this.#state.materials.starIron += Math.round(5 * (1 + 0.03 * (bld.forge - 1)));

    if (previousStage > b.maxStageCleared) b.maxStageCleared = previousStage;
    const firstClear = !this.#state.clearedStages.includes(previousStage);
    if (firstClear) {
      this.#state.clearedStages.push(previousStage);
      this.#addAccountExp(20 * previousStage);
    } else {
      this.#addAccountExp(1 * previousStage);
    }
    this.#checkUnlocks();
    this.#trackMission('stageClears', 1);

    b.stage += 1;
    let looped = false;
    if (b.stage > 50) {
      b.stage = 1;
      looped = true;
    }
    b.enemyMaxHp = (b.enemyMaxHp * 10n) / this.#bossScale(previousStage);
    b.enemyMaxHp = (b.enemyMaxHp * 118n) / 100n * this.#bossScale(b.stage) / 10n;
    b.reward = b.reward / (previousStage % 10 === 0 ? 4n : 1n);
    b.reward = (b.reward * 115n) / 100n * (b.stage % 10 === 0 ? 4n : 1n);
    if (this.#state.hardModeActive) {
      b.enemyMaxHp = (b.enemyMaxHp * 15n) / 10n;
      b.reward = (b.reward * 13n) / 10n;
    }
    b.enemyHp = b.enemyMaxHp;
    b.consecutiveLosses = 0;
    return { earnedReward, looped, isBoss: b.stage % 10 === 0 };
  }

  /** slotIndex 자리의 정령이 궁극기를 쏜다. 초상화/이름은 호출부에서 state.party[slotIndex]로 표시한다. */
  #fireUltimate(slotIndex) {
    const bonus = (this.effectiveAttack() * 35n) / 10n;
    this.#battle.enemyHp -= bonus;
    this.#battle.ultimateCooldowns[slotIndex] = ULTIMATE_COOLDOWN_TICKS;
    return { slotIndex, heroName: this.#state.party[slotIndex]?.name, bonus };
  }

  /** 궁극기 바에서 준비된(쿨타임 0 이하) 정령의 초상화를 직접 탭해 그 정령의 궁극기를 쏜다. */
  fireUltimateForSlot(slotIndex) {
    if (!this.#state.unlocked.ultimate) return { ok: false };
    if ((this.#battle.ultimateCooldowns[slotIndex] ?? 1) > 0) return { ok: false };
    const fired = this.#fireUltimate(slotIndex);
    let killResult = null;
    if (this.#battle.enemyHp <= 0n) killResult = this.#nextEnemy();
    return { ok: true, ...fired, killed: !!killResult, killResult };
  }

  /** 파티 5슬롯의 궁극기 준비 상태(0~100 진행률/준비 여부/정령 이름). 뷰가 쿨타임 상수를
   * 직접 알 필요 없이 표시만 하도록 GameStore가 계산해서 내려준다. */
  ultimateStatus() {
    return this.#battle.ultimateCooldowns.map((cd, i) => ({
      slotIndex: i,
      name: this.#state.party[i]?.name,
      ready: cd <= 0,
      progress: Math.max(0, Math.min(100, Math.round(((ULTIMATE_COOLDOWN_TICKS - cd) / ULTIMATE_COOLDOWN_TICKS) * 100)))
    }));
  }

  setUltimateMode(mode) {
    this.#state.ultimateMode = mode === 'manual' ? 'manual' : 'auto';
  }

  setBattleSpeed(speed) {
    if (speed === 2 && !this.#state.unlocked.speed2x) return { ok: false };
    this.#state.battleSpeed = speed === 2 ? 2 : 1;
    return { ok: true };
  }

  toggleHardMode() {
    if (!this.#state.unlocked.hardMode) return { ok: false };
    this.#state.hardModeActive = !this.#state.hardModeActive;
    return { ok: true, active: this.#state.hardModeActive };
  }

  /** #nextEnemy()의 스테이지별 성장 공식을 그대로 순방향/역방향으로 재생해 임의의 스테이지의
   * enemyMaxHp/reward를 구한다. INITIAL_BATTLE(스테이지 18)을 고정 기준점으로 삼아 튜닝된
   * 곡선을 그대로 따라간다 — 새 공식을 만들지 않는다. */
  #statsAtStage(target) {
    let stage = INITIAL_BATTLE.stage;
    let hp = INITIAL_BATTLE.enemyMaxHp;
    let reward = INITIAL_BATTLE.reward;
    while (stage < target) {
      const next = stage + 1;
      hp = (hp * 10n) / this.#bossScale(stage);
      hp = (hp * 118n) / 100n * this.#bossScale(next) / 10n;
      reward = reward / (stage % 10 === 0 ? 4n : 1n);
      reward = (reward * 115n) / 100n * (next % 10 === 0 ? 4n : 1n);
      stage = next;
    }
    while (stage > target) {
      const prev = stage - 1;
      hp = (hp * 10n) / this.#bossScale(stage);
      hp = (hp * 100n) / 118n;
      hp = (hp * this.#bossScale(prev)) / 10n;
      reward = reward / (stage % 10 === 0 ? 4n : 1n);
      reward = (reward * 100n) / 115n;
      reward = reward * (prev % 10 === 0 ? 4n : 1n);
      stage = prev;
    }
    return { hp, reward };
  }

  #handleDefeat() {
    this.#battle.consecutiveLosses += 1;
    const forecast = this.#battleForecast();
    const survivedSec = Math.round(this.#battle.elapsedMs / 1000);
    let reasonText;
    if (forecast.verdict === '공격력 부족') {
      const pct = Number(((forecast.requiredDamage - forecast.expectedDamage) * 100n) / forecast.requiredDamage);
      reasonText = `공격력 부족 · 약 ${Math.max(1, pct)}% 더 필요`;
    } else if (forecast.verdict === '생존력 부족') {
      reasonText = '생존력 부족';
    } else {
      reasonText = '시간 초과(공격력·생존력 모두 근소 부족)';
    }

    // 실패하면 돈을 벌 수 있도록 현재 10스테이지 구간의 시작으로 되돌린다
    // (1~10 → 1, 11~20 → 11, 21~30 → 21, ...), 이미 구간 시작이면 그대로 둔다.
    const tierStart = Math.floor((this.#battle.stage - 1) / 10) * 10 + 1;
    const stageDropped = this.#battle.stage !== tierStart;
    if (stageDropped) {
      const { hp, reward } = this.#statsAtStage(tierStart);
      this.#battle.stage = tierStart;
      this.#battle.enemyMaxHp = hp;
      this.#battle.reward = reward;
      if (this.#state.hardModeActive) {
        this.#battle.enemyMaxHp = (this.#battle.enemyMaxHp * 15n) / 10n;
        this.#battle.reward = (this.#battle.reward * 13n) / 10n;
      }
    }

    this.#battle.elapsedMs = 0;
    this.#battle.partyHp = this.#battle.partyMaxHp;
    this.#battle.enemyHp = this.#battle.enemyMaxHp;
    return {
      survivedSec, reasonText, consecutiveLosses: this.#battle.consecutiveLosses,
      stageDropped, stage: this.#battle.stage
    };
  }

  /** 0.8초(또는 2배속 시 0.4초) 전투 틱. */
  performAutoAttack() {
    this.recomputePartyStats();
    const partySize = this.#state.party.length;
    const critical = Math.random() < 0.18;
    const variance = BigInt(90 + Math.floor(Math.random() * 21));
    let damage = (this.effectiveAttack() * variance) / 100n;
    if (critical) damage *= 2n;
    this.#battle.enemyHp -= damage;
    const attackerIndex = this.#battle.partyIndex % partySize;
    this.#battle.partyIndex += 1;

    const enemyAttackPerTick = this.#battle.enemyMaxHp / 6000n;
    const incomingVariance = BigInt(90 + Math.floor(Math.random() * 21));
    const incoming = (enemyAttackPerTick * incomingVariance) / 100n;
    this.#battle.partyHp -= incoming;
    this.#battle.elapsedMs += 800;

    // 파티 5슬롯이 각자 자기 쿨타임으로 돌아가며 궁극기를 쏜다(자동 모드는 준비되는 즉시,
    // 수동 모드는 준비 후 ULTIMATE_MANUAL_GRACE_TICKS틱 동안 플레이어의 탭을 기다렸다가 그래도
    // 안 누르면 자동 발동). 한 틱에 여러 슬롯이 동시에 준비될 수도 있어 배열로 모은다.
    const ultimatesFired = [];
    if (this.#state.unlocked.ultimate) {
      const cds = this.#battle.ultimateCooldowns;
      for (let i = 0; i < cds.length; i++) cds[i] -= 1;
      for (let i = 0; i < cds.length; i++) {
        if (cds[i] > 0) continue;
        if (this.#state.ultimateMode === 'auto' || cds[i] <= -ULTIMATE_MANUAL_GRACE_TICKS) {
          ultimatesFired.push(this.#fireUltimate(i));
        }
      }
    }

    let killResult = null;
    let defeatInfo = null;
    if (this.#battle.enemyHp <= 0n) {
      killResult = this.#nextEnemy();
    } else if (this.#battle.elapsedMs >= 90000 || this.#battle.partyHp <= 0n) {
      defeatInfo = this.#handleDefeat();
    }
    return { damage, critical, attackerIndex, incoming, killed: !!killResult, killResult, defeated: !!defeatInfo, defeatInfo, ultimatesFired };
  }

  upgradeCapForStage() {
    return Math.min(30, Math.ceil(this.#battle.stage / 2) + 5);
  }

  upgradeAttack() {
    const cap = this.upgradeCapForStage();
    if (this.#battle.attackLevel >= cap) return { ok: false, reason: 'cap', cap };
    if (this.#state.gold < this.#battle.upgradeCost) return { ok: false, reason: 'gold', shortfall: this.#battle.upgradeCost - this.#state.gold };
    this.#state.gold -= this.#battle.upgradeCost;
    this.#battle.upgradeCost = (this.#battle.upgradeCost * 135n) / 100n;
    this.#battle.attackLevel += 1;
    return { ok: true, level: this.#battle.attackLevel };
  }

  // -------------------------------------------------------------- 파티 편성
  #heroPower(name) {
    const hero = this.#state.heroes[name];
    if (!hero) return 0;
    const budget = RARITY_BUDGET[heroRarityOf(name)] ?? RARITY_BUDGET.common;
    return budget * STAR_MULTIPLIERS[hero.star] * (1 + 0.01 * (hero.level - 1));
  }

  #autoAssignRows(names) {
    const withRole = names.map(name => ({ name, role: heroRoleOf(name) }));
    withRole.sort((a, b) => ROLE_FRONT_PRIORITY.indexOf(a.role) - ROLE_FRONT_PRIORITY.indexOf(b.role));
    return withRole.map((h, i) => ({ name: h.name, row: i < 2 ? 'front' : 'back' }));
  }

  assignPartySlot(slotIndex, heroName) {
    if (!(heroName in this.#state.heroes)) return { ok: false, reason: 'not-owned' };
    const party = this.#state.party;
    const countInParty = party.filter((s, i) => i !== slotIndex && s.name === heroName).length;
    if (countInParty >= 2) return { ok: false, reason: 'max-copies' };
    party[slotIndex] = { name: heroName, row: party[slotIndex]?.row || 'back' };
    this.recomputePartyStats();
    return { ok: true };
  }

  toggleSlotRow(slotIndex) {
    const slot = this.#state.party[slotIndex];
    if (!slot) return { ok: false };
    if (slot.row === 'back') {
      const frontCount = this.#state.party.filter(s => s.row === 'front').length;
      if (frontCount >= 2) return { ok: false, reason: 'front-full' };
      slot.row = 'front';
    } else {
      slot.row = 'back';
    }
    this.recomputePartyStats();
    return { ok: true };
  }

  autoFormLegendary() {
    const owned = Object.keys(this.#state.heroes);
    const legendaries = owned.filter(n => heroRarityOf(n) === 'legendary')
      .map(n => ({ name: n, power: this.#heroPower(n) }))
      .sort((a, b) => b.power - a.power)
      .slice(0, 3)
      .map(h => h.name);
    const rest = owned.filter(n => !legendaries.includes(n))
      .map(n => ({ name: n, power: this.#heroPower(n) }))
      .sort((a, b) => b.power - a.power);
    const picks = [...legendaries];
    for (const h of rest) {
      if (picks.length >= 5) break;
      picks.push(h.name);
    }
    while (picks.length < 5 && picks.length > 0) picks.push(picks[0]);
    if (picks.length === 0) return { ok: false };
    this.#state.party = this.#autoAssignRows(picks.slice(0, 5));
    this.recomputePartyStats();
    return { ok: true };
  }

  autoFormGrowth() {
    const owned = Object.keys(this.#state.heroes);
    const ranked = owned
      .map(n => ({ name: n, invest: this.#state.heroes[n].level * this.#state.heroes[n].star }))
      .sort((a, b) => b.invest - a.invest)
      .slice(0, 5)
      .map(h => h.name);
    while (ranked.length < 5 && ranked.length > 0) ranked.push(ranked[0]);
    if (ranked.length === 0) return { ok: false };
    this.#state.party = this.#autoAssignRows(ranked);
    this.recomputePartyStats();
    return { ok: true };
  }

  savePreset(slotIndex, label) {
    this.#state.partyPresets[slotIndex] = { label, party: this.#state.party.map(s => ({ ...s })) };
  }

  applyPreset(slotIndex) {
    const preset = this.#state.partyPresets[slotIndex];
    if (!preset) return { ok: false };
    this.#state.party = preset.party.map(s => ({ ...s }));
    this.recomputePartyStats();
    return { ok: true };
  }

  // -------------------------------------------------------------- 정령 개별 성장
  levelUpHero(name) {
    const hero = this.#state.heroes[name];
    if (!hero) return { ok: false, reason: 'not-owned' };
    const cap = Math.min(60, this.#state.account.level);
    if (hero.level >= cap) return { ok: false, reason: 'cap', cap };
    const starPowderCost = 10 + hero.level * 4;
    const goldCost = 800n * BigInt(hero.level);
    if (this.#state.materials.starPowder < starPowderCost) return { ok: false, reason: 'starPowder', shortfall: starPowderCost - this.#state.materials.starPowder };
    if (this.#state.gold < goldCost) return { ok: false, reason: 'gold', shortfall: goldCost - this.#state.gold };
    this.#state.materials.starPowder -= starPowderCost;
    this.#state.gold -= goldCost;
    hero.level += 1;
    this.#trackMission('heroLevelUp', 1);
    this.#trackMission('heroLevelUps', 1);
    this.recomputePartyStats();
    return { ok: true, level: hero.level };
  }

  levelUpHeroCost(name) {
    const hero = this.#state.heroes[name];
    if (!hero) return null;
    return { starPowder: 10 + hero.level * 4, gold: 800n * BigInt(hero.level), cap: Math.min(60, this.#state.account.level) };
  }

  mergeInfoFor(name) {
    const hero = this.#state.heroes[name];
    if (!hero) return null;
    const next = Math.min(6, hero.star + 1);
    const cost = MERGE_COSTS[next];
    const rarity = heroRarityOf(name);
    return {
      star: hero.star, next, cost, pool: this.#state.shardPool[rarity], ownShards: hero.ownShards,
      needOwnShard: next === 4 || next === 6, maxed: hero.star >= 6,
      multiplier: STAR_MULTIPLIERS[hero.star], nextMultiplier: STAR_MULTIPLIERS[next]
    };
  }

  mergeHeroNamed(name) {
    const hero = this.#state.heroes[name];
    if (!hero) return { ok: false, reason: 'not-owned' };
    if (hero.star >= 6) return { ok: false, reason: 'maxed' };
    const next = hero.star + 1;
    const cost = MERGE_COSTS[next];
    const rarity = heroRarityOf(name);
    const pool = this.#state.shardPool[rarity];
    const needOwnShard = next === 4 || next === 6;
    if (pool < cost) return { ok: false, reason: 'shards', shortfall: cost - pool };
    if (needOwnShard && hero.ownShards < 1) return { ok: false, reason: 'ownShard' };
    this.#state.shardPool[rarity] -= cost;
    if (needOwnShard) hero.ownShards -= 1;
    hero.star = next;
    this.#trackMission('merges', 1);
    this.recomputePartyStats();
    return { ok: true, star: next, multiplier: STAR_MULTIPLIERS[next] };
  }

  giftBond(name) {
    const hero = this.#state.heroes[name];
    if (!hero) return { ok: false, reason: 'not-owned' };
    if (hero.bond >= 10) return { ok: false, reason: 'maxed' };
    if (hero.bondGiftsToday >= 3) return { ok: false, reason: 'daily-limit' };
    if (this.#state.bondGifts <= 0) return { ok: false, reason: 'no-gifts' };
    this.#state.bondGifts -= 1;
    hero.bondGiftsToday += 1;
    hero.bondExp += 20;
    const need = 100 * (hero.bond + 1);
    let leveledUp = false;
    if (hero.bondExp >= need) {
      hero.bondExp -= need;
      hero.bond += 1;
      leveledUp = true;
      if ([1, 3, 5, 7, 9].includes(hero.bond)) {
        this.#state.gold += 200000n;
        this.#state.materials.starPowder += 50;
      }
      if (hero.bond === 10) this.#state.starBond += 50;
    }
    return { ok: true, bond: hero.bond, leveledUp };
  }

  weaponUpgradeCostFor(name) {
    const hero = this.#state.heroes[name];
    return hero ? hero.weaponLevel * 20 : 0;
  }

  upgradeWeaponFor(name) {
    const hero = this.#state.heroes[name];
    if (!hero) return { ok: false, reason: 'not-owned' };
    if (hero.weaponLevel >= 20) return { ok: false, reason: 'cap' };
    const cost = hero.weaponLevel * 20;
    if (this.#state.materials.starIron < cost) return { ok: false, reason: 'materials', shortfall: cost - this.#state.materials.starIron };
    this.#state.materials.starIron -= cost;
    hero.weaponLevel += 1;
    this.recomputePartyStats();
    return { ok: true, level: hero.weaponLevel };
  }

  promoteWeaponFor(name) {
    const hero = this.#state.heroes[name];
    if (!hero) return { ok: false, reason: 'not-owned' };
    if (hero.weaponStar >= 5) return { ok: false, reason: 'maxed' };
    const next = hero.weaponStar + 1;
    const cost = BLUEPRINT_COST[next];
    if (this.#state.weaponBlueprint < cost) return { ok: false, reason: 'blueprint', shortfall: cost - this.#state.weaponBlueprint };
    this.#state.weaponBlueprint -= cost;
    hero.weaponStar = next;
    this.recomputePartyStats();
    return { ok: true, star: next };
  }

  claimDexMilestone(count) {
    const reward = DEX_MILESTONES[count];
    if (!reward) return { ok: false };
    if (this.#state.claimedDexMilestones.includes(count)) return { ok: false, reason: 'claimed' };
    const owned = Object.keys(this.#state.heroes).length;
    if (owned < count) return { ok: false, reason: 'not-enough' };
    if (reward.starBond) this.#state.starBond += reward.starBond;
    if (reward.gold) this.#state.gold += reward.gold;
    if (reward.memoryStars) this.#state.memoryStars += reward.memoryStars;
    this.#state.claimedDexMilestones.push(count);
    return { ok: true, reward };
  }

  exchangeMemoryStarsForShard(rarity) {
    const cost = 100;
    if (this.#state.memoryStars < cost) return { ok: false, shortfall: cost - this.#state.memoryStars };
    this.#state.memoryStars -= cost;
    this.#state.shardPool[rarity] += 1;
    return { ok: true };
  }

  exchangeMemoryStarsForStarPowder() {
    const cost = 30;
    if (this.#state.memoryStars < cost) return { ok: false, shortfall: cost - this.#state.memoryStars };
    this.#state.memoryStars -= cost;
    this.#state.materials.starPowder += 500;
    return { ok: true };
  }

  exchangeMemoryStarsForGold() {
    const cost = 10;
    if (this.#state.memoryStars < cost) return { ok: false, shortfall: cost - this.#state.memoryStars };
    this.#state.memoryStars -= cost;
    this.#state.gold += 500000n;
    return { ok: true };
  }

  // -------------------------------------------------------------- 마을 건물
  buildingUpgradeCost(building) {
    const level = this.#state.buildings[building];
    const base = BUILDING_BASE[building];
    const mul = Math.pow(1.32, level - 1);
    const starIron = level >= 5 ? Math.round(base.starIron * mul) : 0;
    return { wood: Math.round(base.wood * mul), stone: Math.round(base.stone * mul), starIron };
  }

  buildingUpgradeTimeMs(building) {
    const level = this.#state.buildings[building];
    return Math.round(5 * 60 * 1000 * Math.pow(1.32, level - 1));
  }

  startBuildingUpgrade(building) {
    if (this.#state.buildingQueue) return { ok: false, reason: 'busy' };
    if (this.#state.buildings[building] >= 20) return { ok: false, reason: 'cap' };
    const cost = this.buildingUpgradeCost(building);
    const m = this.#state.materials;
    if (m.wood < cost.wood || m.stone < cost.stone || m.starIron < cost.starIron) return { ok: false, reason: 'materials', cost };
    m.wood -= cost.wood; m.stone -= cost.stone; m.starIron -= cost.starIron;
    const completeAt = Date.now() + this.buildingUpgradeTimeMs(building);
    this.#state.buildingQueue = { building, completeAt };
    return { ok: true, completeAt };
  }

  collectBuildingUpgrade() {
    const q = this.#state.buildingQueue;
    if (!q) return { ok: false, reason: 'none' };
    if (Date.now() < q.completeAt) return { ok: false, reason: 'pending', remainingMs: q.completeAt - Date.now() };
    this.#state.buildings[q.building] += 1;
    this.#state.buildingQueue = null;
    this.recomputePartyStats();
    return { ok: true, building: q.building, level: this.#state.buildings[q.building] };
  }

  idleCapHours() {
    return 12 + 0.5 * (this.#state.buildings.observatory - 1);
  }

  // -------------------------------------------------------------- 특수 던전
  setExpeditionSelection(material) {
    this.#state.dungeons.expedition.selected = material;
  }

  runExpedition() {
    const d = this.#state.dungeons.expedition;
    if (d.usesToday <= 0) return { ok: false, reason: 'uses' };
    d.usesToday -= 1;
    const tier = Math.min(5, Math.ceil(this.#state.buildings.observatory / 4));
    const amount = Math.round(120 * Math.pow(1.55, tier - 1));
    const materials = this.#state.materials;
    const selected = d.selected;
    ['wood', 'stone', 'starIron', 'starDew'].forEach(mat => {
      materials[mat] += mat === selected ? amount : Math.round(amount * 0.25);
    });
    return { ok: true, amount, selected };
  }

  runSanctuary() {
    const d = this.#state.dungeons.sanctuary;
    if (d.usesWeek <= 0) return { ok: false, reason: 'uses' };
    d.usesWeek -= 1;
    const tier = Math.min(5, Math.ceil(this.#state.buildings.observatory / 4));
    const gain = [0, 6, 9, 13, 18, 24][tier];
    this.#state.materials.starDew += gain;
    return { ok: true, gain };
  }

  runArmory() {
    const d = this.#state.dungeons.armory;
    if (d.usesWeek <= 0) return { ok: false, reason: 'uses' };
    d.usesWeek -= 1;
    const gain = 80 + Math.floor(Math.random() * 346);
    this.#state.materials.starIron += gain;
    this.#state.weaponBlueprint += 1;
    const legendaryBonus = Math.random() < 0.01;
    return { ok: true, gain, blueprint: 1, legendaryBonus };
  }

  // -------------------------------------------------------------- 현상 수배
  attemptBounty(type) {
    if (!this.#state.unlocked.bounty) return { ok: false, reason: 'locked' };
    const b = this.#state.bounty[type];
    if (b.usesToday <= 0) return { ok: false, reason: 'uses' };
    b.usesToday -= 1;
    const forecast = this.#battleForecast();
    if (forecast.verdict !== '예상 승리') return { ok: true, success: false };
    let reward = {};
    if (type === 'gold') {
      const g = this.#battle.reward * 3n;
      this.#state.gold += g;
      reward = { gold: g };
    } else if (type === 'exp') {
      const e = this.#battle.stage * 15;
      this.#addAccountExp(e);
      reward = { exp: e };
    } else if (type === 'starIron') {
      const s = 20 + Math.floor(this.#battle.stage / 2);
      this.#state.materials.starIron += s;
      reward = { starIron: s };
    }
    this.#trackMission('bountyWins', 1);
    return { ok: true, success: true, reward };
  }

  // -------------------------------------------------------------- 별자리 탑
  towerElementRequirement(floor) {
    const band = Math.floor((floor - 1) / 10);
    if (band === 0) return null;
    const cycle = ['불꽃', '물결', '숲', '빛', '어둠'];
    return cycle[(band - 1) % cycle.length];
  }

  attemptTower() {
    if (!this.#state.unlocked.tower) return { ok: false, reason: 'locked' };
    const floor = this.#state.tower.floor;
    const req = this.towerElementRequirement(floor);
    if (req) {
      const allMatch = this.#state.party.every(s => heroElementOf(s.name) === req);
      if (!allMatch) return { ok: false, reason: 'element', required: req };
    }
    const hp = BigInt(Math.round(20000000 * Math.pow(1.09, floor - 1)));
    const forecast = this.#battleForecast(hp);
    if (forecast.verdict !== '예상 승리') return { ok: true, success: false };
    this.#state.tower.floor += 1;
    let reward = null;
    if (floor % 10 === 0 && this.#state.tower.weeklyClaimedFloor < floor) {
      this.#state.memoryStars += 5;
      this.#state.weaponBlueprint += 1;
      this.#state.tower.weeklyClaimedFloor = floor;
      reward = { memoryStars: 5, weaponBlueprint: 1 };
    }
    this.#trackMission('towerFloors', 1);
    return { ok: true, success: true, floor: this.#state.tower.floor, reward };
  }

  // -------------------------------------------------------------- 꿈의 미궁
  startLabyrinth() {
    if (!this.#state.unlocked.labyrinth) return { ok: false, reason: 'locked' };
    if (this.#state.labyrinth.weeklyDone) return { ok: false, reason: 'done' };
    this.#state.labyrinth = { active: true, room: 0, buffs: [], weeklyDone: false };
    return { ok: true };
  }

  labyrinthBuffChoices() {
    return [...LABYRINTH_BUFFS].sort(() => Math.random() - 0.5).slice(0, 3);
  }

  attemptLabyrinthRoom(chosenBuffId) {
    const l = this.#state.labyrinth;
    if (!l.active) return { ok: false, reason: 'inactive' };
    const forecast = this.#battleForecast(this.#battle.enemyMaxHp);
    if (forecast.verdict !== '예상 승리') {
      l.active = false;
      l.weeklyDone = true;
      const gained = l.room * 40;
      this.#state.materials.starPowder += gained;
      return { ok: true, success: false, room: l.room, reward: { starPowder: gained } };
    }
    if (chosenBuffId) l.buffs.push(chosenBuffId);
    l.room += 1;
    if (l.room >= 5) {
      l.active = false;
      l.weeklyDone = true;
      this.#state.starBond += 75;
      this.#trackMission('labyrinthRuns', 1);
      return { ok: true, success: true, completed: true, reward: { starBond: 75 } };
    }
    return { ok: true, success: true, completed: false, room: l.room };
  }

  // -------------------------------------------------------------- 미션·수급
  claimDailyMission(key) {
    const m = this.#state.missions.daily[key];
    if (!m || m.claimed || m.progress < m.target) return { ok: false };
    m.claimed = true;
    this.#state.gold += 200000n;
    this.#addAccountExp(50);
    if (key === 'summonOnce') this.#state.gems += 20n;
    if (key === 'heroLevelUp') this.#state.materials.starPowder += 30;
    return { ok: true };
  }

  claimWeeklyMission(key) {
    const m = this.#state.missions.weekly[key];
    if (!m || m.claimed || m.progress < m.target) return { ok: false };
    m.claimed = true;
    this.#addAccountExp(100);
    this.#state.starBond += 50;
    return { ok: true };
  }

  checkIn() {
    const today = localDateKey();
    if (this.#state.attendance.days.includes(today)) return { ok: false, already: true };
    this.#state.attendance.days.push(today);
    const count = this.#state.attendance.days.length;
    this.#state.gems += 10n;
    if (count % 5 === 0) this.#state.materials.starPowder += 100;
    return { ok: true, count };
  }

  claimMonthlyEvent() {
    if (this.#state.monthlyEventClaimed) return { ok: false };
    this.#state.monthlyEventClaimed = true;
    this.#state.starBond += 600;
    return { ok: true };
  }

  claimSeasonTier(tier) {
    const days = Math.floor((Date.now() - new Date(this.#state.seasonTrack.cycleStart).getTime()) / 86400000);
    const requiredDay = tier * 4;
    if (days < requiredDay) return { ok: false, reason: 'locked' };
    if (this.#state.seasonTrack.claimedTier >= tier) return { ok: false, reason: 'claimed' };
    this.#state.seasonTrack.claimedTier = tier;
    this.#state.gems += 40n;
    return { ok: true };
  }

  accountExpPercent() {
    const acc = this.#state.account;
    if (acc.level >= 60) return 100;
    return Math.floor((acc.exp / requiredExp(acc.level)) * 100);
  }

  // -------------------------------------------------------------- 설정
  setTextSize(size) {
    this.#state.settings.textSize = ['sm', 'md', 'lg'].includes(size) ? size : 'md';
  }

  /** 닉네임 변경. 빈 문자열/공백만 있는 값은 거부, 12자로 자른다. */
  setNickname(name) {
    const trimmed = (name ?? '').trim();
    if (!trimmed) return { ok: false, reason: 'empty' };
    this.#state.account.nickname = trimmed.slice(0, 12);
    return { ok: true };
  }

  /** 프로필 아이콘을 보유한 정령의 SD 초상화로 지정한다. null이면 기본 아이콘으로 되돌린다. */
  setProfileIcon(heroName) {
    if (heroName === null) { this.#state.account.profileIcon = null; return { ok: true }; }
    if (!(heroName in this.#state.heroes)) return { ok: false, reason: 'not-owned' };
    this.#state.account.profileIcon = heroName;
    return { ok: true };
  }
}
