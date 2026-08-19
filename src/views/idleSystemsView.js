import { $ } from '../dom/dom.js';
import { formatUnit } from '../domain/units.js';
import { DISPATCH_TYPES } from '../domain/GameStore.js';
import { track } from '../dom/analytics.js';

const rewardText = reward => [
  reward.gold ? `💰 ${formatUnit(BigInt(reward.gold))}` : '',
  reward.starPowder ? `✨ ${reward.starPowder}` : '', reward.wood ? `🌲 ${reward.wood}` : '',
  reward.stone ? `🪨 ${reward.stone}` : '', reward.starIron ? `⭐ ${reward.starIron}` : '',
  reward.bondGifts ? `🎁 ${reward.bondGifts}` : '', reward.accountExp ? `EXP ${reward.accountExp}` : '',
  reward.starBond ? `🌌 ${reward.starBond}` : ''
].filter(Boolean).join(' · ');

function growthRecommendation(store) {
  for (const slot of store.state.party) {
    const merge = store.previewBulkMergeHero?.(slot.name);
    if (merge?.ok) return `최우선 추천: ${slot.name} 성급 합치기`;
  }
  for (const slot of store.state.party) {
    if (store.previewBulkLevelUpHero(slot.name)?.ok) return `추천: ${slot.name} 정령 레벨업`;
  }
  if (store.previewBulkUpgradeAttack()?.ok) return '추천: 현재 상한 내 별빛 강화';
  for (const slot of store.state.party) {
    if (store.previewBulkUpgradeWeapon(slot.name)?.ok) return `추천: ${slot.name} 무기 강화`;
  }
  return '현재 즉시 실행 가능한 성장이 없어요. 순찰지를 확인해 보세요.';
}

function renderIdleSheet(store) {
  const p = store.state.idle.pending;
  if (!p) return;
  $('#idleRewardContent').innerHTML = `
    <p>실제 미접속 ${p.elapsedMinutes}분 · 인정 ${p.creditedMinutes}분 / 상한 ${p.capMinutes}분</p>
    <p>안전 순찰지 STAGE ${p.stage}${p.capReached ? ' · 상한 이후 시간은 적립되지 않았어요.' : ''}</p>
    <div class="reward-grid">${Object.entries(p.reward).map(([key,value]) => `<div><strong>${key}</strong><br>${key === 'gold' ? formatUnit(BigInt(value)) : value}</div>`).join('')}</div>
    <p>${growthRecommendation(store)}</p>
    <div class="idle-actions"><button data-idle-action="claim">모두 수령</button><button data-idle-action="claim-growth">성장 추천 보기</button></div>`;
}

function renderPatrol(store) {
  const stages = store.availablePatrolStages();
  const selected = store.state.idle.idleStage || stages.at(-1) || 1;
  const preview = [60, 480, Math.floor(store.idleCapHours() * 60)].map(minutes => ({ minutes, reward: store.previewIdleReward(minutes, selected) }));
  $('#patrolContent').innerHTML = `
    <select class="idle-select" id="patrolStageSelect">${stages.map(stage => `<option value="${stage}" ${stage === selected ? 'selected' : ''}>STAGE ${stage}</option>`).join('')}</select>
    ${preview.map(p => `<div class="idle-card"><strong>${p.minutes / 60}시간 예상</strong><p>${rewardText(p.reward)}</p></div>`).join('')}
    <button class="idle-action" id="patrolConfirmBtn" style="width:100%;margin-top:10px">순찰지 지정</button>`;
}

function renderDispatch(store) {
  const unlocked = store.battle.maxStageCleared >= 20;
  const heroNames = Object.keys(store.state.heroes);
  const options = selected => heroNames.map((n,i) => `<option value="${n}" ${i === selected ? 'selected' : ''}>${n}</option>`).join('');
  const slots = Array.from({ length: store.dispatchSlots() }, (_, slot) => {
    const d = store.state.dispatch.slots[slot];
    if (d) {
      const left = Math.max(0, Math.ceil((d.completeAt - Date.now()) / 60000));
      return `<div class="idle-card"><h3>파견 ${slot + 1} · ${DISPATCH_TYPES[d.type].label}</h3><p>${d.heroes.join(' · ')} · ${left ? `${left}분 남음` : '완료'}</p><div class="idle-actions"><button data-dispatch-claim="${slot}" ${left ? 'disabled' : ''}>수령</button><button data-dispatch-cancel="${slot}">취소</button></div></div>`;
    }
    const initial = store.dispatchPreview('powder', [heroNames[0], heroNames[1]]);
    return `<div class="idle-card"><h3>파견 ${slot + 1}</h3><select class="idle-select" data-dispatch-type="${slot}">${Object.entries(DISPATCH_TYPES).map(([k,v]) => `<option value="${k}">${v.label} · ${v.hours}시간</option>`).join('')}</select><div class="idle-actions"><select class="idle-select" data-dispatch-hero-a="${slot}">${options(0)}</select><select class="idle-select" data-dispatch-hero-b="${slot}">${options(1)}</select></div><p data-dispatch-preview="${slot}">${initial.conditionMet ? '권장 조건 충족 · 100%' : '권장 조건 미충족 · 80%'} · ${rewardText(initial.reward)}</p><button class="idle-action" data-dispatch-start="${slot}" style="width:100%;margin-top:8px">파견 시작</button></div>`;
  }).join('');
  $('#dispatchPanel').innerHTML = `<div class="idle-card"><h3>정령 파견대</h3><p>${unlocked ? `오늘 수령 ${store.state.dispatch.claimsToday}/4` : 'STAGE 20 클리어 시 해금'}</p></div>${unlocked ? slots : ''}`;
}

function renderBossMemory(store) {
  const bosses = store.unlockedBossMemories();
  $('#bossMemoryPanel').innerHTML = `<div class="idle-card"><h3>보스 회상전</h3><p>주간 보상 ${store.state.bossMemory.weekly.rewardClaims}/3 · 연습 무제한</p></div>${bosses.length ? bosses.map(stage => `<div class="idle-card"><h3>STAGE ${stage} 보스</h3><p>최고 기록 ${store.state.bossMemory.lifetimeBest[stage] ? `${store.state.bossMemory.lifetimeBest[stage]}초` : '없음'}</p><div class="idle-actions"><button data-memory-stage="${stage}" data-choice="gold">보상 도전 · 골드</button><button data-memory-stage="${stage}" data-choice="powder">보상 도전 · 별가루</button><button data-memory-practice="${stage}">연습 도전</button></div></div>`).join('') : '<div class="idle-card"><p>챕터 보스를 클리어하면 해금됩니다.</p></div>'}`;
}

function renderRecords(store) {
  $('#growthRecordList').innerHTML = store.growthRecords().map(r => `<div class="quest"><div class="quest-icon">${r.done ? '🏆' : '🌟'}</div><div><strong>${r.label}</strong><span>${r.claimed ? '보상 수령 완료' : rewardText(r.reward)}</span></div><button class="idle-action" data-record="${r.id}" ${!r.done || r.claimed ? 'disabled' : ''}>수령</button></div>`).join('');
  const j = store.returnJournalStatus();
  const labels = { idleClaim: '방치 보상', heroGrowth: '정령 성장', stageKill: '스테이지', bounty: '현상 수배', building: '건설 완공', dispatch: '파견 수령', bossMemory: '보스 회상' };
  $('#returnJournalCard').hidden = !j.active;
  $('#returnJournalList').innerHTML = j.active ? `${Object.entries(j.targets).map(([k,v]) => `<p>${labels[k]} ${Math.min(v,j.progress[k] || 0)} / ${v}</p>`).join('')}<button class="idle-action" id="returnJournalClaim" ${j.complete ? '' : 'disabled'}>최종 보상 · 별의 인연 300</button>` : '';
}

export function initIdleSystemsView({ store, toast, onChange, onNavigate }) {
  $('#idleSystemPanel').addEventListener('click', event => {
    if (event.target.closest('[data-open-idle]')) { renderIdleSheet(store); $('#idleRewardSheet').classList.add('open'); }
    if (event.target.closest('[data-open-patrol]')) { renderPatrol(store); $('#patrolSheet').classList.add('open'); }
  });
  $('#idleRewardContent').addEventListener('click', event => {
    const action = event.target.closest('[data-idle-action]')?.dataset.idleAction;
    if (!action) return;
    const result = store.claimIdleReward();
    if (!result.ok) return;
    store.saveGame(); track('idle_reward_claimed', { minutes: result.creditedMinutes, stage: result.stage, cta: action });
    $('#idleRewardSheet').classList.remove('open'); toast.show('방치 보상을 모두 수령했습니다.');
    if (action === 'claim-growth') onNavigate('spirits', 'growth');
    onChange();
  });
  $('#patrolContent').addEventListener('click', event => {
    if (event.target.id !== 'patrolConfirmBtn') return;
    const result = store.setIdleStage(Number($('#patrolStageSelect').value));
    if (!result.ok) { toast.show(result.reason === 'pending' ? '먼저 쌓인 방치 보상을 수령해주세요.' : '지정할 수 없는 스테이지입니다.'); return; }
    store.saveGame(); track('patrol_stage_changed', { from: result.from, stage: result.stage }); $('#patrolSheet').classList.remove('open'); onChange();
  });
  $('#dispatchPanel').addEventListener('click', event => {
    const start = event.target.closest('[data-dispatch-start]');
    const claim = event.target.closest('[data-dispatch-claim]');
    const cancel = event.target.closest('[data-dispatch-cancel]');
    let result;
    if (start) { const slot = Number(start.dataset.dispatchStart); result = store.startDispatch(slot, $(`[data-dispatch-type="${slot}"]`).value, [$(`[data-dispatch-hero-a="${slot}"]`).value, $(`[data-dispatch-hero-b="${slot}"]`).value]); }
    else if (claim) result = store.claimDispatch(Number(claim.dataset.dispatchClaim));
    else if (cancel) result = store.cancelDispatch(Number(cancel.dataset.dispatchCancel)); else return;
    if (!result.ok) toast.show(result.reason === 'duplicate' || result.reason === 'heroes' ? '서로 다른 미배치 정령 2명을 선택하세요.' : '현재 파견 작업을 실행할 수 없어요.');
    else { store.saveGame(); if (claim) track('dispatch_claimed', { slot: Number(claim.dataset.dispatchClaim), type: result.type }); else if (start) track('dispatch_started', { slot: Number(start.dataset.dispatchStart), type: result.dispatch.type, conditionMet: result.dispatch.preview.conditionMet }); toast.show(claim ? `파견 보상 수령 · ${rewardText(result.reward)}` : cancel ? '파견을 취소했습니다.' : '파견을 시작했습니다.'); onChange(); }
  });
  $('#dispatchPanel').addEventListener('change', event => {
    const select = event.target.closest('[data-dispatch-type],[data-dispatch-hero-a],[data-dispatch-hero-b]');
    if (!select) return;
    const slot = Number(select.dataset.dispatchType ?? select.dataset.dispatchHeroA ?? select.dataset.dispatchHeroB);
    const preview = store.dispatchPreview($(`[data-dispatch-type="${slot}"]`).value, [$(`[data-dispatch-hero-a="${slot}"]`).value, $(`[data-dispatch-hero-b="${slot}"]`).value]);
    $(`[data-dispatch-preview="${slot}"]`).textContent = `${preview.conditionMet ? '권장 조건 충족 · 100%' : '권장 조건 미충족 · 80%'} · ${rewardText(preview.reward)}`;
  });
  $('#bossMemoryPanel').addEventListener('click', event => {
    const reward = event.target.closest('[data-memory-stage]'); const practice = event.target.closest('[data-memory-practice]');
    if (!reward && !practice) return;
    const result = store.attemptBossMemory(Number(reward?.dataset.memoryStage || practice.dataset.memoryPractice), { practice: !!practice, rewardChoice: reward?.dataset.choice });
    track('boss_memory_attempt', { stage: Number(reward?.dataset.memoryStage || practice.dataset.memoryPractice), success: !!result.success, practice: !!practice, clearTime: result.clearTime || null });
    if (!result.ok) toast.show('주간 보상 횟수를 모두 사용했습니다.'); else if (!result.success) toast.show('패배 · 성급과 계정 레벨, 속성, 생존력을 확인하세요.'); else { store.saveGame(); toast.show(`회상전 승리 · ${result.clearTime}초`); onChange(); }
  });
  $('#growthRecordList').addEventListener('click', event => { const id = event.target.closest('[data-record]')?.dataset.record; if (id && store.claimGrowthRecord(id).ok) { store.saveGame(); onChange(); } });
  $('#returnJournalList').addEventListener('click', event => { if (event.target.id === 'returnJournalClaim' && store.claimReturnJournal().ok) { store.saveGame(); track('return_journal_completed'); toast.show('복귀 일지 완주 · 별의 인연 300'); onChange(); } });
}

export function refreshIdleSystemsView(store, { present = false } = {}) {
  const pending = store.state.idle.pending;
  const villageNav = document.querySelector('.nav-btn[data-target="village"]');
  let navBadge = villageNav?.querySelector('.nav-idle-badge');
  if (pending && villageNav && !navBadge) { navBadge = document.createElement('span'); navBadge.className = 'nav-idle-badge'; navBadge.setAttribute('aria-label', '방치 보상 수령 가능'); villageNav.appendChild(navBadge); }
  if (!pending) navBadge?.remove();
  $('#idleSystemPanel').innerHTML = `<div class="idle-card"><h3>별빛 방치 보상 ${pending ? '<span class="notice-badge">!</span>' : ''}</h3><p>${store.battle.maxStageCleared >= 10 ? `순찰 STAGE ${store.state.idle.idleStage || store.availablePatrolStages().at(-1)} · 상한 ${store.idleCapHours().toFixed(1)}시간` : 'STAGE 10 클리어 시 해금'}</p><div class="idle-actions"><button data-open-idle ${pending ? '' : 'disabled'}>${pending ? '보상 확인' : '적립 중'}</button><button data-open-patrol ${store.battle.maxStageCleared >= 10 ? '' : 'disabled'}>안전 순찰지</button></div></div>`;
  renderDispatch(store); renderBossMemory(store); renderRecords(store);
  if (present && pending) { renderIdleSheet(store); $('#idleRewardSheet').classList.add('open'); track('idle_reward_presented', { minutes: pending.creditedMinutes, stage: pending.stage, capReached: pending.capReached }); }
}
