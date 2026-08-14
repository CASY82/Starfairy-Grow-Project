import { $, $$ } from '../dom/dom.js';
import { formatUnit } from '../domain/units.js';
import { STAGE_NAMES, chapterBackgroundPath, enemyImagePath, heroSdImagePath } from '../domain/heroCatalog.js';

let travelling = false;
let travelTimers = [];

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
  const indexed = store.state.party.map((slot, index) => ({ slot, index }));
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

let ultCastHideTimer = null;
function showUltimateCast(store, fired) {
  if (!fired?.heroName) return;
  const img = $('#ultCastImg');
  img.src = heroSdImagePath(fired.heroName);
  img.alt = fired.heroName;
  $('#ultCastName').textContent = `${fired.heroName} 궁극기!`;
  const banner = $('#ultCast');
  banner.classList.remove('show');
  void banner.offsetWidth;
  banner.classList.add('show');
  clearTimeout(ultCastHideTimer);
  ultCastHideTimer = setTimeout(() => banner.classList.remove('show'), 900);

  const pop = document.createElement('span');
  pop.className = 'damage-pop ult';
  pop.textContent = `ULT -${formatUnit(fired.bonus)}`;
  pop.style.marginLeft = `${Math.round((Math.random() - 0.5) * 40)}px`;
  $('#damageLayer').appendChild(pop);
  setTimeout(() => pop.remove(), 900);
}

function applyUltimateResult(store, toast, result) {
  showUltimateCast(store, result);
  if (result.killResult) {
    toast.show(`${result.killResult.isBoss ? 'BOSS ' : ''}STAGE ${store.battle.stage} / 50 · 💰 ${formatUnit(result.killResult.earnedReward)} 획득`);
    beginAreaTravel(store);
  }
}

export function initAdventureView({ store, toast, onChange, onNavigateToParty }) {
  renderParty(store);
  renderUltSkillBar(store);
  updateEnemyDisplay(store);

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

  $('#gotoParty').addEventListener('click', () => onNavigateToParty());

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

  $('#speedToggleBtn').addEventListener('click', () => {
    const next = store.state.battleSpeed === 2 ? 1 : 2;
    const result = store.setBattleSpeed(next);
    if (!result.ok) { toast.show('30단계를 먼저 클리어해야 2배속이 열립니다.'); return; }
    toast.show(`${next}배속으로 전환했습니다.`);
    onChange();
    window.dispatchEvent(new CustomEvent('battle-speed-changed'));
  });

  $('#hardModeBtn').addEventListener('click', () => {
    const result = store.toggleHardMode();
    if (!result.ok) { toast.show('50단계를 먼저 클리어해야 하드 모드가 열립니다.'); return; }
    toast.show(result.active ? '하드 모드 활성화 · 적 체력 ×1.5, 보상 ×1.3' : '하드 모드를 해제했습니다.');
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
  renderParty(store);
  renderUltSkillBar(store);
  updateEnemyDisplay(store);
  refreshAdventureView(store);
}

/** 체험 데이터 초기화 시 파티 표시를 기본 덱으로 되돌린다. */
export function resetAdventureView(store) {
  clearTravelState();
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

function spawnDamage(damage, critical) {
  const pop = document.createElement('span');
  pop.className = `damage-pop${critical ? ' crit' : ''}`;
  pop.textContent = `${critical ? 'CRIT ' : ''}-${formatUnit(damage)}`;
  pop.style.marginLeft = `${Math.round((Math.random() - 0.5) * 54)}px`;
  $('#damageLayer').appendChild(pop);
  setTimeout(() => pop.remove(), 780);
}

function showDefeatOverlay(defeatInfo) {
  $('#defeatContent').innerHTML = `
    <p style="font-size:13px">생존 시간 <strong>${defeatInfo.survivedSec}초</strong></p>
    <p style="color:var(--muted);font-size:11px;margin-top:4px">${defeatInfo.reasonText}</p>
    ${defeatInfo.stageDropped ? `<p style="color:var(--cyan);font-size:11px;margin-top:8px">STAGE ${defeatInfo.stage}로 후퇴 · 여기서 자금을 모아 다시 도전하세요</p>` : ''}
    ${defeatInfo.consecutiveLosses >= 3 ? `<p style="color:var(--gold);font-size:10px;margin-top:8px">연속 ${defeatInfo.consecutiveLosses}회 실패 · 다음 도전에 파티 체력 보정이 적용됩니다.</p>` : ''}
  `;
  $('#defeatOverlay').classList.add('open');
}

/** 0.8초(또는 2배속 시 0.4초) 전투 틱. app.js가 호출한다. */
export function tickAdventure(store, toast) {
  if (travelling) {
    refreshAdventureView(store);
    return;
  }
  const result = store.performAutoAttack();
  const enemySprite = $('#enemySprite');
  const attacker = $(`.unit[data-slot-index="${result.attackerIndex}"]`);
  if (attacker) {
    const scene = $('#battleScene');
    if (scene.offsetParent !== null) {
      const unitRect = attacker.getBoundingClientRect();
      const enemyRect = enemySprite.getBoundingClientRect();
      const targetX = enemyRect.left + enemyRect.width * 0.32;
      const unitCenterX = unitRect.left + unitRect.width / 2;
      attacker.style.setProperty('--lunge-x', `${Math.max(12, targetX - unitCenterX)}px`);
    }
    attacker.classList.add('attack');
    setTimeout(() => attacker.classList.remove('attack'), 340);
  }
  enemySprite.classList.add('hit');
  setTimeout(() => enemySprite.classList.remove('hit'), 180);
  spawnDamage(result.damage, result.critical);
  result.ultimatesFired.forEach(fired => showUltimateCast(store, fired));

  if (result.killed) {
    beginAreaTravel(store);
    if (toast) {
      toast.show(`${result.killResult.isBoss ? 'BOSS ' : ''}STAGE ${store.battle.stage} / 50 · 💰 ${formatUnit(result.killResult.earnedReward)} 획득`);
      if (result.killResult.looped) toast.show('별의 길 50 스테이지 클리어! 1단계부터 반복합니다.');
    }
  } else if (result.defeated) {
    showDefeatOverlay(result.defeatInfo);
  } else {
    maybeShowUltTapHint(store, toast);
  }
  refreshAdventureView(store);
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

export function refreshAdventureView(store) {
  const b = store.battle;
  $('#battleStage').textContent = `${b.stage} / 50`;
  $('#userLevel').textContent = store.state.account.level;
  $('#enemyHp').textContent = formatUnit(b.enemyHp > 0n ? b.enemyHp : 0n);
  $('#enemyMaxHp').textContent = formatUnit(b.enemyMaxHp);
  $('#attackPower').textContent = formatUnit(store.effectiveAttack());
  $('#dpsValue').textContent = formatUnit(store.dpsValue());
  $('#rewardValue').textContent = formatUnit(b.reward);
  $('#attackLevel').textContent = b.attackLevel;
  $('#upgradeCost').textContent = formatUnit(b.upgradeCost);
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
  $('#speedToggleBtn').classList.toggle('active', store.state.battleSpeed === 2);
  $('#speedToggleBtn').classList.toggle('locked', !store.state.unlocked.speed2x);
  $('#hardModeBtn').classList.toggle('active', store.state.hardModeActive);
  $('#hardModeBtn').classList.toggle('locked', !store.state.unlocked.hardMode);

  const forecast = store.battleForecast();
  const badgeClass = forecast.verdict === '예상 승리' ? 'win' : forecast.verdict === '공격력 부족' ? 'atk' : 'hp';
  $('#forecastBadge').innerHTML = `<span class="forecast-badge ${badgeClass}">${forecast.verdict}</span>`;
}
