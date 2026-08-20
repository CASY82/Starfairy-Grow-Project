import { $ } from '../dom/dom.js';
import { formatUnit } from '../domain/units.js';

const BUILDING_META = {
  observatory: { icon: '🏛️', name: '천문대', effect: '방치 보상 상한 +0.5시간/Lv' },
  lumbermill: { icon: '🌲', name: '벌목소', effect: '목재 획득 +5%/Lv' },
  quarry: { icon: '⛏️', name: '채석장', effect: '석재 획득 +5%/Lv' },
  forge: { icon: '🔨', name: '대장간', effect: '별철 획득 +3%/Lv' },
  hall: { icon: '🏘️', name: '회관', effect: '특수 던전 보상 +2%/Lv' },
  camp: { icon: '🎯', name: '훈련소', effect: '일반 스테이지 공격·HP +0.5%/Lv(최대 +9.5%)' }
};
const DUNGEON_MATERIAL_LABEL = { wood: '목재', stone: '석재', starIron: '별철', starDew: '별이슬' };
const BUILDING_POSITIONS = {
  observatory: [50, 21], lumbermill: [22, 39], quarry: [80, 40],
  hall: [51, 58], forge: [22, 78], camp: [78, 78]
};
let selectedBuilding = null;

function openBuildingSheet(building, store) {
  selectedBuilding = building;
  renderBuildingSheet(store);
  $('#buildingUpgradeSheet').classList.add('open');
}

function renderBuildingSheet(store) {
  if (!selectedBuilding) return;
  const key = selectedBuilding;
  const meta = BUILDING_META[key];
  const s = store.state;
  const level = s.buildings[key];
  const queue = s.buildingQueue;
  const cost = store.buildingUpgradeCost(key);
  const ownQueue = queue?.building === key;
  const remainingMs = ownQueue ? Math.max(0, queue.completeAt - Date.now()) : 0;
  const ready = ownQueue && remainingMs <= 0;
  const maxed = level >= 20;
  const busy = queue && !ownQueue;
  const canAfford = s.materials.wood >= cost.wood && s.materials.stone >= cost.stone && s.materials.starIron >= cost.starIron;
  const instantQuote = ownQueue ? store.buildingInstantFinishCost() : null;
  const bulkPreview = !queue && !maxed ? store.previewBulkUpgradeBuilding(key) : null;
  let actionLabel = `Lv.${level + 1} 업그레이드 시작`;
  let action = 'upgrade';
  let disabled = false;
  if (maxed) { actionLabel = '최대 레벨 달성'; disabled = true; }
  else if (ready) { actionLabel = '완공 보상 수령'; action = 'collect'; }
  else if (ownQueue) { actionLabel = `건설 중 · 약 ${Math.ceil(remainingMs / 60000)}분`; disabled = true; }
  else if (busy) { actionLabel = `${BUILDING_META[queue.building].name} 건설 중`; disabled = true; }
  else if (!canAfford) { actionLabel = '재료가 부족합니다'; disabled = true; }
  $('#buildingUpgradeContent').innerHTML = `
    <div class="building-sheet-hero"><div class="building-sheet-icon">${meta.icon}</div><div><strong>${meta.name} · Lv.${level}</strong><span>${meta.effect}</span></div></div>
    <div class="building-level-track"><div class="building-level-fill" style="width:${level / 20 * 100}%"></div></div>
    <p class="sheet-note">최대 Lv.20 · 다음 건설 시간 약 ${Math.ceil(store.buildingUpgradeTimeMs(key) / 60000)}분</p>
    <div class="building-cost-grid">
      <div><strong>🌲 ${cost.wood}</strong><span>보유 ${s.materials.wood}</span></div>
      <div><strong>🗿 ${cost.stone}</strong><span>보유 ${s.materials.stone}</span></div>
      <div><strong>⭐ ${cost.starIron}</strong><span>별철 ${s.materials.starIron}</span></div>
    </div>
    ${ownQueue && !ready ? `<div class="building-bulk-summary">남은 시간 ${formatRemaining(remainingMs)} · 즉시 완료 💎 ${formatUnit(instantQuote.gems)}</div>` : ''}
    ${bulkPreview?.ok ? `<div class="building-bulk-summary">일괄 즉시 강화 Lv.${bulkPreview.from} → Lv.${bulkPreview.to}<br>🌲 ${bulkPreview.costs.wood} · 🗿 ${bulkPreview.costs.stone} · ⭐ ${bulkPreview.costs.starIron} · 💎 ${formatUnit(bulkPreview.costs.gems)}</div>` : ''}
    <div class="building-action-stack">
      <button class="building-upgrade-btn" id="buildingUpgradeAction" data-action="${action}" ${disabled ? 'disabled' : ''}>${actionLabel}</button>
      ${ownQueue && !ready ? `<button class="building-upgrade-btn bulk-action-btn" data-action="instant-finish" ${s.gems < instantQuote.gems ? 'disabled' : ''}>💎 ${formatUnit(instantQuote.gems)} 즉시 완료</button>` : ''}
      ${!queue && !maxed ? `<button class="building-upgrade-btn bulk-action-btn" data-action="building-bulk" ${!bulkPreview?.ok ? 'disabled' : ''}>일괄 즉시 강화${bulkPreview?.ok ? ` · ${bulkPreview.count}회` : ''}</button>` : ''}
    </div>`;
}

function formatRemaining(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function initVillageView({ store, toast, onChange }) {
  setInterval(() => {
    if ($('#buildingUpgradeSheet').classList.contains('open') && selectedBuilding) renderBuildingSheet(store);
  }, 1000);

  $('#buildingList').addEventListener('click', event => {
    const btn = event.target.closest('button[data-building]');
    if (!btn) return;
    const building = btn.dataset.building;
    if (btn.dataset.action === 'open') {
      openBuildingSheet(building, store);
      return;
    }
    if (btn.dataset.action === 'collect') {
      const result = store.collectBuildingUpgrade();
      if (!result.ok) { if (result.reason === 'pending') toast.show('아직 건설 중입니다.'); return; }
      toast.show(`${BUILDING_META[result.building].name} Lv.${result.level} 완공!`);
      store.saveGame();
      onChange();
      return;
    }
    const result = store.startBuildingUpgrade(building);
    if (!result.ok) {
      if (result.reason === 'cap') toast.show('이미 최대 레벨입니다.');
      else if (result.reason === 'busy') toast.show('다른 건물이 건설 중입니다. 완공 후 다시 시도하세요.');
      else toast.show(`필요: 목재 ${result.cost.wood} · 석재 ${result.cost.stone}${result.cost.starIron ? ` · 별철 ${result.cost.starIron}` : ''}`);
      return;
    }
    toast.show(`${BUILDING_META[building].name} 건설을 시작했습니다.`);
    store.saveGame();
    onChange();
  });

  $('#buildingUpgradeContent').addEventListener('click', event => {
    const btn = event.target.closest('button[data-action]');
    if (!btn || !selectedBuilding) return;
    if (btn.dataset.action === 'instant-finish') {
      const result = store.instantFinishBuilding();
      if (!result.ok) {
        toast.show(result.reason === 'ready' ? '건설이 완료됐습니다. 무료로 수령하세요.' : '즉시 완료할 보석이 부족합니다.');
        renderBuildingSheet(store);
        return;
      }
      toast.show(`${BUILDING_META[result.building].name} Lv.${result.level} 즉시 완공 · 보석 ${formatUnit(result.cost)} 사용`);
    } else if (btn.dataset.action === 'building-bulk') {
      const preview = store.previewBulkUpgradeBuilding(selectedBuilding);
      if (!preview.ok) return;
      const result = store.bulkUpgradeBuilding(selectedBuilding);
      if (!result.ok) { toast.show('재화 또는 건설 상태가 변경되어 실행하지 못했습니다.'); return; }
      toast.show(`${BUILDING_META[selectedBuilding].name} Lv.${result.from} → Lv.${result.to} · ${result.count}회 즉시 강화`);
    } else if (btn.dataset.action === 'collect') {
      const result = store.collectBuildingUpgrade();
      if (!result.ok) { toast.show('아직 건설 중입니다.'); return; }
      toast.show(`${BUILDING_META[result.building].name} Lv.${result.level} 완공!`);
    } else if (btn.dataset.action === 'upgrade') {
      const result = store.startBuildingUpgrade(selectedBuilding);
      if (!result.ok) { toast.show(result.reason === 'materials' ? '업그레이드 재료가 부족합니다.' : '현재 건설을 시작할 수 없습니다.'); return; }
      toast.show(`${BUILDING_META[selectedBuilding].name} 건설을 시작했습니다.`);
    }
    store.saveGame();
    onChange();
    renderBuildingSheet(store);
  });

  $('#dungeonList').addEventListener('click', event => {
    const btn = event.target.closest('button[data-dungeon]');
    if (!btn) return;
    const key = btn.dataset.dungeon;
    if (key === 'expedition-select') {
      store.setExpeditionSelection(btn.dataset.material);
      onChange();
      return;
    }
    let result;
    if (key === 'expedition') result = store.runExpedition();
    else if (key === 'sanctuary') result = store.runSanctuary();
    else if (key === 'armory') result = store.runArmory();
    if (!result.ok) { toast.show('오늘 남은 횟수가 없습니다.'); return; }
    if (key === 'expedition') toast.show(`탐사 완료 · 선택 재료 +${result.amount}`);
    else if (key === 'sanctuary') toast.show(`별이슬 성소 완료 · 별이슬 +${result.gain}`);
    else toast.show(`고대 무구고 완료 · 별철 +${result.gain} · 무기 도면 +1${result.legendaryBonus ? ' · 레전더리 도면 획득!' : ''}`);
    store.saveGame();
    onChange();
  });
}

export function refreshVillageView(store) {
  const s = store.state;
  $('#idleCapText').textContent = `방치 보상 상한 ${store.idleCapHours().toFixed(1)}시간 — 재료를 모아 마을 건물을 키워보세요.`;

  const queue = s.buildingQueue;
  $('#buildingList').innerHTML = `<div class="village-map-card">
    <img class="village-map-art" src="assets/images/village/starlight-village-map.jpg" alt="별빛 마을 지도" draggable="false">
    ${Object.entries(BUILDING_META).map(([key, meta]) => {
    const level = s.buildings[key];
    const [x, y] = BUILDING_POSITIONS[key];
    let stateClass = '';
    let stateText = `Lv.${level}`;
    if (queue && queue.building === key) {
      const remainingMs = Math.max(0, queue.completeAt - Date.now());
      const ready = remainingMs <= 0;
      stateClass = ready ? 'is-ready' : 'is-building';
      stateText = ready ? '완공!' : '건설 중';
    }
    return `<button class="village-building ${stateClass}" data-building="${key}" data-action="open" style="--x:${x}%;--y:${y}%" aria-label="${meta.name} ${stateText}"><span>${meta.name} · ${stateText}</span></button>`;
  }).join('')}
    <div class="village-map-tip">건물을 눌러 관리하세요</div>
  </div>`;

  if ($('#buildingUpgradeSheet').classList.contains('open')) renderBuildingSheet(store);

  const exp = s.dungeons.expedition;
  const materialButtons = ['wood', 'stone', 'starIron', 'starDew'].map(mat =>
    `<button data-dungeon="expedition-select" data-material="${mat}" style="min-height:30px;padding:2px 8px;border-radius:8px;border:1px solid var(--line);background:${exp.selected === mat ? '#6550ba' : 'transparent'};color:inherit;font-size:9px;margin-right:4px;cursor:pointer">${DUNGEON_MATERIAL_LABEL[mat]}</button>`
  ).join('');
  $('#dungeonList').innerHTML = `
    <div class="quest">
      <div class="quest-icon">🎒</div>
      <div style="flex:1"><strong>자재 원정</strong><span>오늘 ${exp.usesToday}회 남음 · 선택: ${materialButtons}</span></div>
      <button data-dungeon="expedition" style="min-height:40px;padding:0 12px;border:0;border-radius:10px;background:#6550ba;color:inherit;font-size:10px;font-weight:800" ${exp.usesToday <= 0 ? 'disabled' : ''}>탐사</button>
    </div>
    <div class="quest">
      <div class="quest-icon">💧</div>
      <div style="flex:1"><strong>별이슬 성소</strong><span>이번 주 ${s.dungeons.sanctuary.usesWeek}회 남음</span></div>
      <button data-dungeon="sanctuary" style="min-height:40px;padding:0 12px;border:0;border-radius:10px;background:#6550ba;color:inherit;font-size:10px;font-weight:800" ${s.dungeons.sanctuary.usesWeek <= 0 ? 'disabled' : ''}>도전</button>
    </div>
    <div class="quest">
      <div class="quest-icon">⚒️</div>
      <div style="flex:1"><strong>고대 무구고</strong><span>이번 주 ${s.dungeons.armory.usesWeek}회 남음 · 무기 도면 획득</span></div>
      <button data-dungeon="armory" style="min-height:40px;padding:0 12px;border:0;border-radius:10px;background:#6550ba;color:inherit;font-size:10px;font-weight:800" ${s.dungeons.armory.usesWeek <= 0 ? 'disabled' : ''}>탐사</button>
    </div>
  `;
}
