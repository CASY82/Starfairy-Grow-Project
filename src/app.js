import GameStore from './domain/GameStore.js';
import SoundManager from './audio/SoundManager.js';
import { formatUnit } from './domain/units.js';
import { heroSdImagePath } from './domain/heroCatalog.js';
import { $, $$, createToast } from './dom/dom.js';
import { track } from './dom/analytics.js';
import { initConfirmAction, confirmAction } from './dom/confirm.js';

import { initVillageView, refreshVillageView } from './views/villageView.js';
import { initSpiritsView, refreshSpiritsView } from './views/spiritsView.js';
import { initAdventureView, refreshAdventureView, tickAdventure, showAdventureView, resetAdventureView, flushPendingDefeat } from './views/adventureView.js';
import { initBountyView, refreshBountyView } from './views/bountyView.js';
import { initTowerView, refreshTowerView } from './views/towerView.js';
import { initLabyrinthView, refreshLabyrinthView } from './views/labyrinthView.js';
import { initSummonView, refreshSummonView } from './views/summonView.js';
import { initMenuView, refreshMenuView } from './views/menuView.js';
import { initCinematic } from './views/cinematic.js';
import { initIdleSystemsView, refreshIdleSystemsView } from './views/idleSystemsView.js';

const store = new GameStore();
const audio = new SoundManager();
const toast = createToast();
initConfirmAction();

let lastTutorialState = { step: store.state.tutorial.step, completed: store.state.tutorial.completed };
function checkTutorialProgress() {
  const t = store.state.tutorial;
  if (t.completed === lastTutorialState.completed && t.step === lastTutorialState.step) return;
  if (!lastTutorialState.completed && !t.completed && lastTutorialState.step === 1 && t.step === 2) {
    toast.show('첫 정령을 얻었어요! 이제 파티를 편성해보세요.');
  } else if (!lastTutorialState.completed && t.completed) {
    toast.show('파티 편성 완료! 사냥을 시작합니다.');
  }
  lastTutorialState = { step: t.step, completed: t.completed };
}

function refreshAll() {
  $('#goldCount').textContent = formatUnit(store.state.gold);
  $('#gemCount').textContent = formatUnit(store.state.gems);
  $('#accountLevelText').textContent = `LV. ${store.state.account.level} · ${store.accountExpPercent()}%`;
  $('#headerNickname').textContent = store.state.account.nickname || '별지기';
  $('#headerAvatar').innerHTML = store.state.account.profileIcon
    ? `<img src="${heroSdImagePath(store.state.account.profileIcon)}" alt="${store.state.account.profileIcon}">`
    : '🌙';
  refreshVillageView(store);
  refreshSpiritsView(store);
  refreshAdventureView(store);
  refreshBountyView(store);
  refreshTowerView(store);
  refreshLabyrinthView(store);
  refreshSummonView(store);
  refreshMenuView(store);
  refreshIdleSystemsView(store);
  checkTutorialProgress(); // 신규, 함수 맨 끝
}

function navigateTo(pageName, segment = null) {
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.target === pageName));
  $$('.page').forEach(page => page.classList.toggle('active', page.dataset.page === pageName));
  if (segment) {
    const root = pageName === 'spirits' ? '#spiritsSegment' : pageName === 'adventure' ? '#adventureSegment' : null;
    if (root) {
      $$(`${root} .seg-btn`).forEach(b => b.classList.toggle('active', b.dataset.segment === segment));
      $$(`[data-page="${pageName}"] .segment-panel`).forEach(panel => panel.classList.toggle('active', panel.dataset.segmentPanel === segment));
    }
  }
  if (pageName === 'adventure') showAdventureView(store);
  refreshAll();
}

function goToSpiritsParty() {
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.target === 'spirits'));
  $$('.page').forEach(page => page.classList.toggle('active', page.dataset.page === 'spirits'));
  $$('#spiritsSegment .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.segment === 'party'));
  $$('[data-page="spirits"] .segment-panel').forEach(panel => panel.classList.toggle('active', panel.dataset.segmentPanel === 'party'));
  refreshAll();
}

const cinematic = initCinematic({ store, audio, toast, onDone: refreshAll });

initVillageView({ store, toast, onChange: refreshAll });
initSpiritsView({ store, toast, onChange: refreshAll });
initAdventureView({ store, toast, onChange: refreshAll, onNavigateToParty: goToSpiritsParty, onNavigateToSummon: () => navigateTo('summon') });
initBountyView({ store, toast, onChange: refreshAll });
initTowerView({ store, toast, onChange: refreshAll, onNavigateSegment: navigateTo });
initLabyrinthView({ store, toast, onChange: refreshAll, onNavigateSegment: navigateTo });
initSummonView({ store, toast, onPull: (count, bannerType) => cinematic.pull(count, bannerType) });
initMenuView({ store, toast, onChange: refreshAll });
initIdleSystemsView({ store, toast, onChange: refreshAll, onNavigate: navigateTo });

// ------------------------------------------------------------------ 하단 탭
$$('.nav-btn').forEach(btn => btn.addEventListener('click', () => {
  const target = btn.dataset.target;
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b === btn));
  $$('.page').forEach(page => page.classList.toggle('active', page.dataset.page === target));
  if (target === 'adventure') showAdventureView(store);
  if (target === 'summon') track('banner_view', { pity: store.state.pity, guarantee: store.state.pickupGuaranteed });
}));

// -------------------------------------------------------------- 바텀시트
const sheets = $$('.sheet-backdrop');
function openSheet(sheet) { sheet.classList.add('open'); }
function closeSheets() { sheets.forEach(sheet => sheet.classList.remove('open')); flushPendingDefeat(store); }
$('#rateBtn').addEventListener('click', () => openSheet($('#rateSheet')));
$('#settingsBtn').addEventListener('click', () => openSheet($('#settingsSheet')));
$('#patchNotesBtn').addEventListener('click', () => openSheet($('#patchNotesSheet')));
$$('.sheet-close').forEach(btn => btn.addEventListener('click', closeSheets));
sheets.forEach(sheet => sheet.addEventListener('click', e => { if (e.target === sheet) closeSheets(); }));

$('#soundToggle').addEventListener('click', e => {
  audio.setEnabled(!audio.enabled);
  e.currentTarget.classList.toggle('on', audio.enabled);
  e.currentTarget.setAttribute('aria-label', `연출 사운드 ${audio.enabled ? '켜짐' : '꺼짐'}`);
});
$('#motionToggle').addEventListener('click', e => {
  const reduced = document.body.classList.toggle('reduce-motion');
  e.currentTarget.classList.toggle('on', reduced);
  e.currentTarget.setAttribute('aria-label', `모션 감소 ${reduced ? '켜짐' : '꺼짐'}`);
});
$$('#textSizeControl .seg-btn').forEach(btn => btn.addEventListener('click', () => {
  store.setTextSize(btn.dataset.size);
  $$('#textSizeControl .seg-btn').forEach(b => b.classList.toggle('active', b === btn));
  document.documentElement.dataset.textSize = btn.dataset.size;
  store.saveGame();
}));
$('#autoSkipToggle').addEventListener('click', e => {
  const next = !store.state.settings.autoSkipCinematic;
  store.setAutoSkipCinematic(next);
  e.currentTarget.classList.toggle('on', next);
  e.currentTarget.setAttribute('aria-label', `연출 자동 건너뛰기 ${next ? '켜짐' : '꺼짐'}`);
  store.saveGame();
});
$('#resetBtn').addEventListener('click', async () => {
  const ok = await confirmAction({
    title: '데이터 초기화',
    message: '보유한 골드·보석·정령·파티 편성이 모두 삭제되고 처음부터 다시 시작합니다. 이 작업은 되돌릴 수 없어요. 계속할까요?',
    confirmLabel: '초기화하기'
  });
  if (!ok) return;
  store.resetGame();
  resetAdventureView(store);
  closeSheets();
  refreshAll();
  toast.show('초기화 완료! 소환 탭에서 정령을 얻고 파티를 편성해보세요.');
});

// -------------------------------------------------------------- 저장/전투
window.addEventListener('beforeunload', () => store.saveGame());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) store.saveGame();
  else {
    store.prepareIdleReward();
    refreshAll();
    refreshIdleSystemsView(store, { present: true });
  }
});

const BATTLE_TICK_MS = { 1: 800, 2: 400, 3: 267 };
let battleTimer = null;
function startBattleTimer() {
  if (battleTimer) clearInterval(battleTimer);
  const interval = BATTLE_TICK_MS[store.state.battleSpeed] ?? 800;
  battleTimer = setInterval(() => {
    if (!document.hidden) {
      const outcome = tickAdventure(store, toast);
      if (outcome?.subBattleResolvedTo) navigateTo('adventure', outcome.subBattleResolvedTo);
    }
  }, interval);
}
window.addEventListener('battle-speed-changed', startBattleTimer);

// 초기 텍스트 크기 반영(저장된 설정 복원)
document.documentElement.dataset.textSize = store.state.settings.textSize;
$$('#textSizeControl .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.size === store.state.settings.textSize));
$('#autoSkipToggle').classList.toggle('on', store.state.settings.autoSkipCinematic);
$('#autoSkipToggle').setAttribute('aria-label', `연출 자동 건너뛰기 ${store.state.settings.autoSkipCinematic ? '켜짐' : '꺼짐'}`);

refreshAll();
refreshIdleSystemsView(store, { present: true });
startBattleTimer();
if (!store.state.tutorial.completed && store.state.tutorial.step === 1) {
  toast.show('🌟 별빛 정령 키우기에 오신 걸 환영합니다! 소환 탭에서 첫 정령을 만나보세요.');
}
setInterval(() => { if (!document.hidden) { store.checkResets(); store.saveGame(); refreshAll(); } }, 5000);
