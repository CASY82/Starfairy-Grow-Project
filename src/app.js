import GameStore from './domain/GameStore.js';
import SoundManager from './audio/SoundManager.js';
import { formatUnit } from './domain/units.js';
import { heroSdImagePath } from './domain/heroCatalog.js';
import { $, $$, createToast } from './dom/dom.js';
import { track } from './dom/analytics.js';
import { initConfirmAction } from './dom/confirm.js';

import { initVillageView, refreshVillageView } from './views/villageView.js';
import { initSpiritsView, refreshSpiritsView } from './views/spiritsView.js';
import { initAdventureView, refreshAdventureView, tickAdventure, showAdventureView, resetAdventureView } from './views/adventureView.js';
import { initBountyView, refreshBountyView } from './views/bountyView.js';
import { initTowerView, refreshTowerView } from './views/towerView.js';
import { initLabyrinthView, refreshLabyrinthView } from './views/labyrinthView.js';
import { initSummonView, refreshSummonView } from './views/summonView.js';
import { initMenuView, refreshMenuView } from './views/menuView.js';
import { initCinematic } from './views/cinematic.js';

const store = new GameStore();
const audio = new SoundManager();
const toast = createToast();
initConfirmAction();

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
initAdventureView({ store, toast, onChange: refreshAll, onNavigateToParty: goToSpiritsParty });
initBountyView({ store, toast, onChange: refreshAll });
initTowerView({ store, toast, onChange: refreshAll });
initLabyrinthView({ store, toast, onChange: refreshAll });
initSummonView({ store, toast, onPull: (count, bannerType) => cinematic.pull(count, bannerType) });
initMenuView({ store, toast, onChange: refreshAll });

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
function closeSheets() { sheets.forEach(sheet => sheet.classList.remove('open')); }
$('#rateBtn').addEventListener('click', () => openSheet($('#rateSheet')));
$('#settingsBtn').addEventListener('click', () => openSheet($('#settingsSheet')));
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
$('#resetBtn').addEventListener('click', () => {
  store.resetGame();
  resetAdventureView(store);
  closeSheets();
  refreshAll();
  toast.show('체험 데이터가 초기화됐어요. 10회 소환으로 전설을 확인해 보세요!');
});

// -------------------------------------------------------------- 저장/전투
window.addEventListener('beforeunload', () => store.saveGame());
document.addEventListener('visibilitychange', () => { if (document.hidden) store.saveGame(); });

let battleTimer = null;
function startBattleTimer() {
  if (battleTimer) clearInterval(battleTimer);
  const interval = store.state.battleSpeed === 2 ? 400 : 800;
  battleTimer = setInterval(() => tickAdventure(store, toast), interval);
}
window.addEventListener('battle-speed-changed', startBattleTimer);

// 초기 텍스트 크기 반영(저장된 설정 복원)
document.documentElement.dataset.textSize = store.state.settings.textSize;
$$('#textSizeControl .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.size === store.state.settings.textSize));

refreshAll();
startBattleTimer();
setInterval(() => { store.checkResets(); store.saveGame(); refreshAll(); }, 5000);
