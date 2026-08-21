import { $, $$ } from '../dom/dom.js';
import { formatUnit } from '../domain/units.js';
import { STAGE_NAMES, chapterBackgroundPath, enemyImagePath, heroSdImagePath, heroRoleOf } from '../domain/heroCatalog.js';
import { battleVfx } from './battleVfx.js';

const ULT_HIT_BASE_MS = { 1: 480, 2: 320, 3: 220 };
const LUNGE_REMOVE_MS = { 1: 340, 2: 240, 3: 170 };
const BASIC_HIT_MS = { 1: 180, 2: 110, 3: 80 };

let travelling = false;
let travelTimers = [];
let presentationTimers = [];
let ultimateBannerQueue = [];
let ultimateBannerActive = false;

function presentationTimeout(callback, delay) {
  const timer = setTimeout(() => {
    presentationTimers = presentationTimers.filter(item => item !== timer);
    callback();
  }, delay);
  presentationTimers.push(timer);
  return timer;
}

function clearBattlePresentation() {
  presentationTimers.forEach(clearTimeout);
  presentationTimers = [];
  ultimateBannerQueue = [];
  ultimateBannerActive = false;
  $('#ultCast').classList.remove('show');
  $('#damageLayer').replaceChildren();
  battleVfx.clear();
}

// 첫 궁극기 준비 시 "탭하면 바로 발동" 힌트를 1회만 보여준다. 세이브 진행도가 아니라 순수
// UI 온보딩 표시 여부라 GameStore 세이브에 넣지 않고 별도 localStorage 키로 가볍게 관리한다.
const ULT_TAP_HINT_KEY = 'sv_ult_tap_hint_seen';
let ultTapHintShown = false;
try { ultTapHintShown = localStorage.getItem(ULT_TAP_HINT_KEY) === '1'; } catch { /* 저장소 접근 불가 시 매번 세션 내 1회만 표시 */ }

function maybeShowUltTapHint(store, toast) {
  if (ultTapHintShown || !toast) return;
  if (!store.state.unlocked.ultimate) return;
  if (!store.ultimateStatus().some(s => s.ready)) return;
  ultTapHintShown = true;
  try { localStorage.setItem(ULT_TAP_HINT_KEY, '1'); } catch { /* 무시 */ }
  toast.show('하단 궁극기 칸에서 빛나는 초상화를 탭하면 바로 발동할 수 있어요!');
}

function clearTravelState() {
  travelTimers.forEach(clearTimeout);
  travelTimers = [];
  travelling = false;
  const scene = $('#battleScene');
  scene.classList.remove('enemy-down', 'travelling');
  $('#enemySprite').classList.remove('defeated');
}

function beginAreaTravel(store) {
  clearTravelState();
  // Keep a short final hit trace, then guarantee that no old-enemy VFX reaches
  // the next stage. Combat state has already been resolved by GameStore.
  presentationTimeout(() => battleVfx.clear(), 180);
  travelling = true;
  const scene = $('#battleScene');
  const enemy = $('#enemySprite');
  $('#travelCopy').textContent = `STAGE ${store.battle.stage} 이동 중`;
  scene.classList.add('enemy-down');
  enemy.classList.add('defeated');

  travelTimers.push(setTimeout(() => scene.classList.add('travelling'), 180));
  travelTimers.push(setTimeout(() => {
    updateEnemyDisplay(store);
    enemy.classList.remove('defeated');
  }, 760));
  travelTimers.push(setTimeout(() => {
    scene.classList.remove('enemy-down', 'travelling');
    travelling = false;
    travelTimers = [];
  }, 940));
}

function renderParty(store) {
  const unitHtml = (slot, index) => `
    <div class="unit" data-slot-index="${index}" title="${slot.name}"><img src="${heroSdImagePath(slot.name)}" alt="${slot.name}"></div>
  `;
  const indexed = store.state.party.map((slot, index) => ({ slot, index })).filter(x => x.slot); // 변경: .filter(x => x.slot) 추가
  const back = indexed.filter(s => s.slot.row !== 'front');
  const front = indexed.filter(s => s.slot.row === 'front');
  $('#partyRow').innerHTML = `
    <div class="party-row party-back">${back.map(s => unitHtml(s.slot, s.index)).join('')}</div>
    <div class="party-row party-front">${front.map(s => unitHtml(s.slot, s.index)).join('')}</div>
  `;
}

/** 화면 하단 궁극기 바: 파티 구성이 바뀔 때만 다시 그린다(전투 씬의 소형 유닛과 별개로,
 * 여기서 탭/자동회전 궁극기를 다룬다). */
function renderUltSkillBar(store) {
  const bar = $('#ultSkillBar');
  const unlocked = store.state.unlocked.ultimate;
  bar.dataset.locked = unlocked ? '0' : '1';
  if (!unlocked) {
    bar.innerHTML = `<p class="ult-locked-msg">🔒 스테이지 5 클리어 시 해금</p>`;
    return;
  }
  const status = store.ultimateStatus();
  bar.innerHTML = status.map(s => `
    <button type="button" class="ult-slot${s.ready ? ' ult-ready' : ''}" data-slot-index="${s.slotIndex}" title="${s.name}" style="--progress:${s.progress}">
      <span class="ult-slot-portrait"><img src="${heroSdImagePath(s.name)}" alt="${s.name}"><span class="ult-slot-veil" aria-hidden="true"></span></span>
      <span class="ult-slot-name">${s.name}</span>
    </button>
  `).join('');
}

/** 매 틱 쿨타임 진행률/준비 상태만 가볍게 갱신(바를 통째로 다시 그리지 않음).
 * 잠금 해제 상태가 바뀌면(스테이지 5 클리어 등) 그때만 renderUltSkillBar로 다시 그린다. */
function updateUltSkillBar(store) {
  const bar = $('#ultSkillBar');
  const unlocked = store.state.unlocked.ultimate;
  if (bar.dataset.locked !== (unlocked ? '0' : '1')) renderUltSkillBar(store);
  if (!unlocked) { $('#ultimateText').textContent = '잠김'; return; }

  const status = store.ultimateStatus();
  $$('#ultSkillBar .ult-slot').forEach(el => {
    const s = status[Number(el.dataset.slotIndex)];
    if (!s) return;
    el.classList.toggle('ult-ready', s.ready);
    el.style.setProperty('--progress', s.progress);
  });
  const readyOne = status.find(s => s.ready);
  const soonest = status.reduce((a, s) => (s.progress > a.progress ? s : a), status[0]);
  if (readyOne) $('#ultimateText').textContent = `${readyOne.name} 발동 준비!`;
  else if (soonest) $('#ultimateText').textContent = `${soonest.name} · ${soonest.progress}%`;
}

function drainUltimateBannerQueue() {
  if (ultimateBannerActive || !ultimateBannerQueue.length) return;
  ultimateBannerActive = true;
  const fired = ultimateBannerQueue.shift();
  if (!fired?.heroName) {
    ultimateBannerActive = false;
    drainUltimateBannerQueue();
    return;
  }
  const img = $('#ultCastImg');
  img.src = heroSdImagePath(fired.heroName);
  img.alt = fired.heroName;
  $('#ultCastName').textContent = `${fired.heroName} 궁극기!`;
  const banner = $('#ultCast');
  banner.classList.remove('show');
  void banner.offsetWidth;
  banner.classList.add('show');
  presentationTimeout(() => {
    banner.classList.remove('show');
    ultimateBannerActive = false;
    drainUltimateBannerQueue();
  }, battleVfx.effectiveQuality() === 'minimal' ? 300 : 260);
}

function queueUltimateCast(store, fired, queueIndex = 0) {
  if (!fired?.heroName) return;
  ultimateBannerQueue.push(fired);
  drainUltimateBannerQueue();

  const attacker = $(`.unit[data-slot-index="${fired.slotIndex}"]`);
  const enemy = $('#enemySprite');
  battleVfx.playUltimate({
    heroName: fired.heroName,
    attackerElement: attacker,
    targetElement: enemy,
    speed: store.state.battleSpeed,
    queueIndex,
    kind: fired.kind
  });

  const hitDelay = (ULT_HIT_BASE_MS[store.state.battleSpeed] ?? ULT_HIT_BASE_MS[1]) + queueIndex * 120;
  presentationTimeout(() => {
    if (fired.bonus > 0n) spawnDamage(fired.bonus, false, 'ult');
    if (fired.healed > 0n) spawnDamage(fired.healed, false, 'heal');
    if (fired.shielded > 0n) spawnDamage(fired.shielded, false, 'shield');
    if (fired.reflected > 0n) spawnDamage(fired.reflected, false, 'reflect');
  }, hitDelay);
}

function applyUltimateResult(store, toast, result) {
  queueUltimateCast(store, result, 0);
  if (result.killResult) {
    toast.show(`${result.killResult.isBoss ? 'BOSS ' : ''}STAGE ${store.battle.stage} / 50 · 💰 ${formatUnit(result.killResult.earnedReward)} 획득`);
    beginAreaTravel(store);
  }
}

export function initAdventureView({ store, toast, onChange, onNavigateToParty, onNavigateToSummon }) {
  renderParty(store);
  renderUltSkillBar(store);
  updateEnemyDisplay(store);

  // Navigation is owned by app.js, so observe this page's existing active flag
  // and release all presentation work as soon as the adventure tab is hidden.
  const adventurePage = document.querySelector('[data-page="adventure"]');
  if (adventurePage && typeof MutationObserver === 'function') {
    new MutationObserver(() => {
      if (!adventurePage.classList.contains('active')) clearBattlePresentation();
    }).observe(adventurePage, { attributes: true, attributeFilter: ['class'] });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearBattlePresentation();
  });

  $$('#adventureSegment .seg-btn').forEach(btn => btn.addEventListener('click', () => {
    $$('#adventureSegment .seg-btn').forEach(b => b.classList.toggle('active', b === btn));
    $$('[data-page="adventure"] .segment-panel').forEach(panel => {
      panel.classList.toggle('active', panel.dataset.segmentPanel === btn.dataset.segment);
    });
  }));

  $('#upgradeAttack').addEventListener('click', () => {
    const result = store.upgradeAttack();
    if (!result.ok) {
      if (result.reason === 'cap') toast.show(`현재 진행도 강화 상한은 LV.${result.cap}입니다.`);
      else toast.show(`골드가 ${formatUnit(result.shortfall)} 부족해요.`);
      return;
    }
    onChange();
  });

  $('#bulkUpgradeAttack').addEventListener('click', () => {
    const result = store.bulkUpgradeAttack();
    if (!result.ok) return;
    toast.show(`별빛 강화 Lv.${result.from} → Lv.${result.to} · 골드 ${formatUnit(result.costs.gold)} 사용`);
    onChange();
  });

  $('#gotoParty').addEventListener('click', () => onNavigateToParty());

  $('#noPartyPanel').addEventListener('click', e => {
    if (e.target.id !== 'noPartyCta') return;
    if (e.target.dataset.action === 'summon') onNavigateToSummon();
    else onNavigateToParty();
  });

  $('#ultSkillBar').addEventListener('click', e => {
    const slot = e.target.closest('.ult-slot');
    if (!slot) return;
    const slotIndex = Number(slot.dataset.slotIndex);
    const result = store.fireUltimateForSlot(slotIndex);
    if (!result.ok) return;
    applyUltimateResult(store, toast, result);
    onChange();
  });

  $('#ultimateAutoBtn').addEventListener('click', () => { store.setUltimateMode('auto'); onChange(); });
  $('#ultimateManualBtn').addEventListener('click', () => { store.setUltimateMode('manual'); onChange(); });

  $('#speedToggleGroup').addEventListener('click', e => {
    const btn = e.target.closest('.speed-btn');
    if (!btn) return;
    const next = Number(btn.dataset.speed);
    if (next === store.state.battleSpeed) return;
    const result = store.setBattleSpeed(next);
    if (!result.ok) {
      toast.show(next === 3 ? '스테이지 50을 먼저 클리어해야 3배속이 열립니다.' : '스테이지 10을 먼저 클리어해야 2배속이 열립니다.');
      return;
    }
    toast.show(`${next}배속으로 전환했습니다.`);
    onChange();
    window.dispatchEvent(new CustomEvent('battle-speed-changed'));
  });

  $('#difficultyTierGroup').addEventListener('click', e => {
    const btn = e.target.closest('.tier-btn');
    if (!btn) return;
    const tier = btn.dataset.tier;
    if (tier === store.state.difficultyTier) return;
    const result = store.setDifficultyTier(tier);
    if (!result.ok) {
      toast.show(result.reason === 'locked' ? '이전 난이도를 50단계까지 클리어해야 열립니다.' : '전환할 수 없습니다.');
      return;
    }
    const label = { easy: '쉬움', normal: '보통', hard: '어려움' }[tier];
    toast.show(`난이도 ${label}(으)로 전환했습니다.`);
    onChange();
  });

  $('#recommendTableBtn').addEventListener('click', () => {
    renderRecommendTable(store);
    $('#recommendTableSheet').classList.add('open');
  });
  $('#recommendTableSheet .sheet-close').addEventListener('click', () => $('#recommendTableSheet').classList.remove('open'));
  $('#recommendTableSheet').addEventListener('click', e => { if (e.target.id === 'recommendTableSheet') $('#recommendTableSheet').classList.remove('open'); });

  $('#defeatConfirmBtn').addEventListener('click', () => $('#defeatOverlay').classList.remove('open'));
  $('#defeatGrowthBtn').addEventListener('click', () => {
    $('#defeatOverlay').classList.remove('open');
    onNavigateToParty();
  });
}

/** 탭이 다시 보일 때 그동안 쌓인 상태 변화를 화면에 맞춘다(파티 구성은 이미 실시간으로 반영됨). */
export function showAdventureView(store) {
  clearTravelState();
  clearBattlePresentation();
  renderParty(store);
  renderUltSkillBar(store);
  updateEnemyDisplay(store);
  refreshAdventureView(store);
}

/** 체험 데이터 초기화 시 파티 표시를 기본 덱으로 되돌린다. */
export function resetAdventureView(store) {
  clearTravelState();
  clearBattlePresentation();
  renderParty(store);
  renderUltSkillBar(store);
  updateEnemyDisplay(store);
}

function updateEnemyDisplay(store) {
  const stage = store.battle.stage;
  const isBoss = stage % 10 === 0;
  $('#enemyName').textContent = STAGE_NAMES[stage - 1];
  const enemySprite = $('#enemySprite');
  enemySprite.classList.toggle('boss', isBoss);
  enemySprite.innerHTML = `<img src="${enemyImagePath(stage)}" alt="${STAGE_NAMES[stage - 1]}" draggable="false">`;
  $('#battleScene').style.setProperty('--battle-bg', `url('${chapterBackgroundPath(stage)}')`);
  // 같은 챕터 안에서도 시작 지점을 달리해 10개 스테이지가 서로 다른 구간처럼 보이게 한다.
  $('#battleScene').style.setProperty('--battle-offset', `${-((stage - 1) % 10) * 93}px`);
}

function spawnDamage(damage, critical, kind = '') {
  if (damage <= 0n) return;
  const pop = document.createElement('span');
  pop.className = `damage-pop${critical ? ' crit' : ''}${kind ? ` ${kind}` : ''}`;
  const positive = ['heal', 'shield'].includes(kind);
  pop.textContent = `${kind === 'ult' ? 'ULT ' : critical ? 'CRIT ' : kind === 'shield' ? 'SHIELD ' : kind === 'reflect' ? 'REFLECT ' : ''}${positive ? '+' : '-'}${formatUnit(damage)}`;
  pop.style.marginLeft = `${Math.round((Math.random() - 0.5) * 54)}px`;
  $('#damageLayer').appendChild(pop);
  presentationTimeout(() => pop.remove(), kind === 'ult' ? 900 : 780);
}

function presentCombatFeedback(store, result, attacker, attackerName, enemySprite) {
  const healing = heroRoleOf(attackerName) === '지원';
  battleVfx.playBasicAttack({ heroName: attackerName, attackerElement: attacker,
    targetElement: healing ? attacker : enemySprite, critical: result.critical, speed: store.state.battleSpeed });
  const activeBattle = store.subBattle || store.battle;
  $$('.unit').forEach(unit => {
    unit.classList.toggle('shielded', activeBattle.shield > 0n);
    unit.classList.toggle('reflecting', activeBattle.shield > 0n && activeBattle.reflectPct > 0);
  });
  if (healing && attacker) { attacker.classList.add('healing'); presentationTimeout(() => attacker.classList.remove('healing'), 520); }
  const delay = battleVfx.effectiveQuality() === 'minimal' ? 80 : (BASIC_HIT_MS[store.state.battleSpeed] ?? BASIC_HIT_MS[1]);
  presentationTimeout(() => {
    if (result.damage > 0n) { enemySprite.classList.add('hit'); presentationTimeout(() => enemySprite.classList.remove('hit'), 180); spawnDamage(result.damage, result.critical); }
    if (result.healed > 0n) spawnDamage(result.healed, false, 'heal');
    if (result.absorbed > 0n) spawnDamage(result.absorbed, false, 'shield');
    if (result.reflected > 0n) spawnDamage(result.reflected, false, 'reflect');
  }, delay);
}

function showDefeatOverlay(defeatInfo) {
  const mode = defeatInfo.mode || 'stage';
  const dropLine = mode === 'stage'
    ? (defeatInfo.stageDropped ? `<p style="color:var(--cyan);font-size:11px;margin-top:8px">STAGE ${defeatInfo.stage}로 후퇴 · 여기서 자금을 모아 다시 도전하세요</p>` : '')
    : mode === 'tower'
      ? `<p style="color:var(--cyan);font-size:11px;margin-top:8px">${defeatInfo.floor}층에서 바로 다시 도전할 수 있어요 · 소모되는 자원이 없습니다</p>`
      : `<p style="color:var(--cyan);font-size:11px;margin-top:8px">${defeatInfo.room}번째 방까지 도달 · 별가루 +${defeatInfo.reward.starPowder} 획득 · 이번 주 미궁은 종료되었습니다</p>`;
  $('#defeatContent').innerHTML = `
    <p style="font-size:13px">생존 시간 <strong>${defeatInfo.survivedSec}초</strong></p>
    <p style="color:var(--muted);font-size:11px;margin-top:4px">${defeatInfo.reasonText}</p>
    ${dropLine}
    ${mode === 'stage' && defeatInfo.consecutiveLosses >= 3 ? `<p style="color:var(--gold);font-size:10px;margin-top:8px">연속 ${defeatInfo.consecutiveLosses}회 실패 · 다음 도전에 파티 체력 보정이 적용됩니다.</p>` : ''}
  `;
  $('#defeatOverlay').classList.add('open');
}

// 다른 오버레이(가챠 연출, 결과 화면, 바텀시트)가 열려 있는 동안 패배 화면이 그 위에
// 겹쳐 뜨는 것을 막기 위한 큐. 막혀 있으면 최신 패배 정보만 보관했다가, 막는 화면이
// 닫히는 즉시(또는 늦어도 다음 전투 틱에) 띄운다.
let pendingDefeatInfo = null;

function isDefeatBlocked(store) {
  return !!store.busy
    || !!document.querySelector('.sheet-backdrop.open')
    || $('#resultsOverlay').classList.contains('open');
}

function presentDefeat(store, defeatInfo) {
  if (isDefeatBlocked(store)) { pendingDefeatInfo = defeatInfo; return; }
  showDefeatOverlay(defeatInfo);
}

/** 가챠 연출/바텀시트가 닫힐 때 호출해 대기 중인 패배 화면을 바로 띄운다.
 * (호출을 놓쳐도 tickAdventure가 매 틱마다 같은 검사를 반복하므로 최악의 경우
 * 다음 전투 틱—0.8초, 2배속이면 0.4초—안에는 항상 표시된다.) */
export function flushPendingDefeat(store) {
  if (!pendingDefeatInfo || isDefeatBlocked(store)) return;
  const info = pendingDefeatInfo;
  pendingDefeatInfo = null;
  showDefeatOverlay(info);
}

/** 0.8초(또는 2배속 시 0.4초) 전투 틱. app.js가 호출한다. */
export function tickAdventure(store, toast) {
  flushPendingDefeat(store);
  if (!store.hasFormedParty()) { refreshAdventureView(store); return; } // 신규(§3-2)
  if (store.subBattle) return tickSubBattle(store, toast);
  if (travelling) {
    refreshAdventureView(store);
    return;
  }
  const result = store.performAutoAttack();
  if (!result) { refreshAdventureView(store); return; } // 방어: 위 게이트를 우회해 도달해도 안전
  const enemySprite = $('#enemySprite');
  const attacker = $(`.unit[data-slot-index="${result.attackerIndex}"]`);
  const attackerName = store.state.party[result.attackerIndex]?.name;
  const isMeleeAttacker = ['수호', '전사'].includes(heroRoleOf(attackerName));
  if (attacker && isMeleeAttacker) {
    const scene = $('#battleScene');
    if (scene.offsetParent !== null) {
      const unitRect = attacker.getBoundingClientRect();
      const enemyRect = enemySprite.getBoundingClientRect();
      const targetX = enemyRect.left + enemyRect.width * 0.32;
      const unitCenterX = unitRect.left + unitRect.width / 2;
      attacker.style.setProperty('--lunge-x', `${Math.max(12, targetX - unitCenterX)}px`);
    }
    if (battleVfx.effectiveQuality() !== 'minimal') attacker.classList.add('attack');
    presentationTimeout(() => attacker.classList.remove('attack'), LUNGE_REMOVE_MS[store.state.battleSpeed] ?? LUNGE_REMOVE_MS[1]);
  }
  presentCombatFeedback(store, result, attacker, attackerName, enemySprite);
  result.ultimatesFired.forEach((fired, index) => queueUltimateCast(store, fired, index));

  if (result.killed) {
    beginAreaTravel(store);
    if (toast) {
      toast.show(`${result.killResult.isBoss ? 'BOSS ' : ''}STAGE ${store.battle.stage} / 50 · 💰 ${formatUnit(result.killResult.earnedReward)} 획득`);
      if (result.killResult.looped) toast.show('별의 길 50 스테이지 클리어! 1단계부터 반복합니다.');
    }
  } else if (result.defeated) {
    presentDefeat(store, result.defeatInfo);
  } else {
    maybeShowUltTapHint(store, toast);
  }
  refreshAdventureView(store);
}

function tickSubBattle(store, toast) {
  const result = store.tickSubBattle();
  if (!result) { refreshAdventureView(store); return undefined; }
  const enemySprite = $('#enemySprite');
  const attacker = $(`.unit[data-slot-index="${result.attackerIndex}"]`);
  const attackerName = store.state.party[result.attackerIndex]?.name;
  const isMeleeAttacker = ['수호', '전사'].includes(heroRoleOf(attackerName));
  if (attacker && isMeleeAttacker) {
    const scene = $('#battleScene');
    if (scene.offsetParent !== null) {
      const unitRect = attacker.getBoundingClientRect();
      const enemyRect = enemySprite.getBoundingClientRect();
      const targetX = enemyRect.left + enemyRect.width * 0.32;
      const unitCenterX = unitRect.left + unitRect.width / 2;
      attacker.style.setProperty('--lunge-x', `${Math.max(12, targetX - unitCenterX)}px`);
    }
    if (battleVfx.effectiveQuality() !== 'minimal') attacker.classList.add('attack');
    presentationTimeout(() => attacker.classList.remove('attack'), LUNGE_REMOVE_MS[store.state.battleSpeed] ?? LUNGE_REMOVE_MS[1]);
  }
  presentCombatFeedback(store, result, attacker, attackerName, enemySprite);
  result.ultimatesFired.forEach((fired, index) => queueUltimateCast(store, fired, index));

  if (result.resolved) {
    const r = result.resolveResult;
    if (toast) {
      if (r.mode === 'tower') {
        toast.show(r.reward ? `${r.clearedFloor}층 클리어! 기억의 별 +${r.reward.memoryStars} · 무기 도면 +${r.reward.weaponBlueprint}` : `${r.clearedFloor}층 클리어!`);
      } else if (r.completed) {
        toast.show(`완주! 별의 인연 +${r.reward.starBond}`);
      } else {
        toast.show(`${r.room}방 클리어 · 계속 도전할 수 있어요`);
      }
    }
    refreshAdventureView(store);
    return { subBattleResolvedTo: r.mode };
  }
  if (result.defeated) {
    presentDefeat(store, result.defeatInfo);
    refreshAdventureView(store);
    return { subBattleResolvedTo: result.defeatInfo.mode };
  }
  refreshAdventureView(store);
  return undefined;
}

function renderRecommendTable(store) {
  const rows = [
    ['1~9 일반', '1성', 'Lv.1~15'],
    ['10 보스', '2성', 'Lv.10 / 50'],
    ['11~19 일반', '2성', 'Lv.15~35'],
    ['20 보스', '2성', 'Lv.25 / 65'],
    ['21~29 일반', '3성', 'Lv.30~50'],
    ['30 보스', '3성', 'Lv.40 / 80'],
    ['31~39 일반', '4성', 'Lv.45~65'],
    ['40 보스', '4성', 'Lv.55 / 95'],
    ['41~49 일반', '5성', 'Lv.60~85'],
    ['50 보스', '5성', 'Lv.70 / 110']
  ];
  const heroes = Object.values(store.state.heroes);
  const avgStar = heroes.length ? (heroes.reduce((sum, h) => sum + h.star, 0) / heroes.length).toFixed(1) : '0';
  const avgLevel = heroes.length ? Math.round(heroes.reduce((sum, h) => sum + h.level, 0) / heroes.length) : 0;
  $('#recommendTableContent').innerHTML = `
    <p style="color:var(--muted);margin:0 0 10px">현재 내 파티: 평균 ★${avgStar} · Lv.${avgLevel}</p>
    <table style="width:100%;border-collapse:collapse">
      <thead><tr style="color:var(--cyan)"><th style="text-align:left;padding:4px">구간</th><th style="text-align:left;padding:4px">권장 성급</th><th style="text-align:left;padding:4px">권장 레벨</th></tr></thead>
      <tbody>${rows.map(r => `<tr style="border-top:1px solid var(--line)"><td style="padding:5px 4px">${r[0]}</td><td style="padding:5px 4px">${r[1]}</td><td style="padding:5px 4px">${r[2]}</td></tr>`).join('')}</tbody>
    </table>
  `;
}

function subBattleLabel(sub) {
  return sub.mode === 'tower'
    ? { title: '별자리 탑', stageText: `${sub.floor}층`, name: `별자리 탑 ${sub.floor}층` }
    : { title: '꿈의 미궁', stageText: `${sub.room + 1}번째 방`, name: `꿈의 미궁 ${sub.room + 1}번째 방` };
}
function subBattleArtStage(sub) {
  // 전용 아트가 없으므로(CLAUDE.md: 새 몬스터 아트 미제작) 기존 1~50 챕터 아트를 재사용한다.
  // 탑은 50스테이지 주기로 순환, 미궁은 5개 방을 기존 보스 스테이지(10/20/30/40/50) 아트에
  // 매핑해 "5개의 기억 속 보스"라는 컨셉과 맞춘다.
  return sub.mode === 'tower' ? (((sub.floor - 1) % 50) + 1) : (sub.room + 1) * 10;
}
function renderSubBattleHud(store) {
  const sub = store.subBattle;
  const label = subBattleLabel(sub);
  const artStage = subBattleArtStage(sub);
  $('#stageRowLabel').textContent = label.title;
  $('#stagePrefixLabel').textContent = '';
  $('#battleStage').textContent = label.stageText;
  $('#enemyName').textContent = label.name;
  const enemySprite = $('#enemySprite');
  enemySprite.classList.toggle('boss', sub.mode === 'labyrinth');
  enemySprite.innerHTML = `<img src="${enemyImagePath(artStage)}" alt="${label.name}" draggable="false">`;
  $('#battleScene').style.setProperty('--battle-bg', `url('${chapterBackgroundPath(artStage)}')`);
  $('#battleScene').style.setProperty('--battle-offset', '0px');
  $('#forecastBadge').innerHTML = '';
  $('#enemyHp').textContent = formatUnit(sub.enemyHp > 0n ? sub.enemyHp : 0n);
  $('#enemyMaxHp').textContent = formatUnit(sub.enemyMaxHp);
  const hpRatio = sub.enemyHp <= 0n ? 0 : Number((sub.enemyHp * 10000n) / sub.enemyMaxHp) / 100;
  $('#enemyHpFill').style.width = `${Math.max(0, Math.min(100, hpRatio))}%`;
  const partyHp = sub.partyHp > 0n ? sub.partyHp : 0n;
  $('#partyHpText').textContent = `${formatUnit(partyHp)} / ${formatUnit(sub.partyMaxHp)}`;
  const partyHpRatio = sub.partyMaxHp > 0n ? Number((partyHp * 10000n) / sub.partyMaxHp) / 100 : 0;
  $('#partyHpFill').style.width = `${Math.max(0, Math.min(100, partyHpRatio))}%`;
}

function renderNoPartyState(store) {
  const t = store.state.tutorial;
  const ownedCount = Object.keys(store.state.heroes).length;
  let title, body, ctaLabel, ctaAction;
  if (!t.completed && t.step === 1) {
    title = '별빛 정령 키우기에 오신 걸 환영합니다';
    body = '아직 정령이 없어요. 소환 탭에서 첫 정령을 만나보세요.';
    ctaLabel = '소환하러 가기'; ctaAction = 'summon';
  } else if (!t.completed && t.step === 2) {
    title = '정령을 얻었어요!';
    body = '이제 파티를 편성하면 사냥을 시작할 수 있어요.';
    ctaLabel = '파티 편성하러 가기'; ctaAction = 'party';
  } else {
    title = '편성된 정령이 없습니다';
    body = ownedCount > 0
      ? '정령 탭에서 파티를 편성해야 전투를 진행할 수 있어요.'
      : '정령 탭에서 파티를 편성해야 전투를 진행할 수 있어요. 소환 탭에서 정령을 먼저 얻어보세요.';
    ctaLabel = '파티 편성하러 가기'; ctaAction = 'party';
  }
  $('#noPartyPanel').innerHTML = `
    <div class="content-card">
      <h3>${title}</h3>
      <p>${body}</p>
      <button type="button" id="noPartyCta" data-action="${ctaAction}">${ctaLabel}</button>
    </div>`;
}

export function refreshAdventureView(store) {
  const page = document.querySelector('[data-page="adventure"]');
  const formed = store.hasFormedParty();
  page?.classList.toggle('no-party-mode', !formed); // 신규
  if (!formed) { renderNoPartyState(store); return; } // 신규 — sub-battle-mode 분기보다 먼저 검사
  const sub = store.subBattle;
  page?.classList.toggle('sub-battle-mode', !!sub);
  if (sub) { renderSubBattleHud(store); return; }
  const b = store.battle;
  // renderSubBattleHud()가 이 두 라벨을 "별자리 탑"/""로 덮어쓰므로, 서브 배틀이 끝나고 메인
  // 스테이지로 돌아온 뒤에는(정상 경로) 매번 기본값으로 되돌려야 한다.
  $('#stageRowLabel').textContent = '별의 길 · 50 STAGES';
  $('#stagePrefixLabel').textContent = 'STAGE ';
  $('#battleStage').textContent = `${b.stage} / 50`;
  $('#userLevel').textContent = formatUnit(store.state.account.level);
  $('#enemyHp').textContent = formatUnit(b.enemyHp > 0n ? b.enemyHp : 0n);
  $('#enemyMaxHp').textContent = formatUnit(b.enemyMaxHp);
  $('#attackPower').textContent = formatUnit(store.effectiveAttack());
  $('#dpsValue').textContent = formatUnit(store.dpsValue());
  $('#rewardValue').textContent = formatUnit(b.reward);
  $('#attackLevel').textContent = b.attackLevel;
  $('#upgradeCost').textContent = formatUnit(b.upgradeCost);
  const upgradeCap = store.upgradeCapForStage();
  const bulkUpgrade = store.previewBulkUpgradeAttack();
  $('#upgradeAttack').disabled = b.attackLevel >= upgradeCap || store.state.gold < b.upgradeCost;
  $('#bulkUpgradeAttack').disabled = !bulkUpgrade.ok;
  $('#bulkUpgradeAttack').textContent = bulkUpgrade.ok
    ? `일괄 ${bulkUpgrade.count}회 · 💰 ${formatUnit(bulkUpgrade.costs.gold)}`
    : bulkUpgrade.stopReason === 'cap' ? '현재 상한 도달' : '일괄 · 골드 부족';
  const hpRatio = b.enemyHp <= 0n ? 0 : Number((b.enemyHp * 10000n) / b.enemyMaxHp) / 100;
  $('#enemyHpFill').style.width = `${Math.max(0, Math.min(100, hpRatio))}%`;

  const partyHp = b.partyHp > 0n ? b.partyHp : 0n;
  $('#partyHpText').textContent = `${formatUnit(partyHp)} / ${formatUnit(b.partyMaxHp)}`;
  const partyHpRatio = b.partyMaxHp > 0n ? Number((partyHp * 10000n) / b.partyMaxHp) / 100 : 0;
  $('#partyHpFill').style.width = `${Math.max(0, Math.min(100, partyHpRatio))}%`;

  updateUltSkillBar(store);

  $('#speedLabel').textContent = `×${store.state.battleSpeed} SPEED`;
  $('#ultimateAutoBtn').classList.toggle('active', store.state.ultimateMode === 'auto');
  $('#ultimateManualBtn').classList.toggle('active', store.state.ultimateMode === 'manual');
  $('#ultimateAutoBtn').disabled = !store.state.unlocked.ultimate;
  $('#ultimateManualBtn').disabled = !store.state.unlocked.ultimate;
  $$('#speedToggleGroup .speed-btn').forEach(btn => {
    const speed = Number(btn.dataset.speed);
    btn.classList.toggle('active', speed === store.state.battleSpeed);
    const locked = speed === 2 ? !store.state.unlocked.speed2x : speed === 3 ? !store.state.unlocked.speed3x : false;
    btn.classList.toggle('locked', locked);
  });
  const activeTier = store.state.difficultyTier;
  $$('#difficultyTierGroup .tier-btn').forEach(btn => {
    const tier = btn.dataset.tier;
    btn.classList.toggle('active', tier === activeTier);
    const locked = tier === 'normal' ? !store.state.unlocked.normalTier
      : tier === 'hard' ? !store.state.unlocked.hardTier : false;
    btn.classList.toggle('locked', locked);
  });

  const forecast = store.battleForecast();
  const badgeClass = forecast.verdict === '예상 승리' ? 'win' : forecast.verdict === '공격력 부족' ? 'atk' : 'hp';
  $('#forecastBadge').innerHTML = `<span class="forecast-badge ${badgeClass}">${forecast.verdict}</span>`;
}
