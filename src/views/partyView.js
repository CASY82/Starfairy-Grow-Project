import { $ } from '../dom/dom.js';
import { heroSdImagePath, RARITY_COLOR, heroRarityOf } from '../domain/heroCatalog.js';

const SLOT_DEFAULT_ROW = ['front', 'front', 'back', 'back', 'back']; // §3-3, GameStore.js와 동일

let pickerTargetSlot = null;

export function initPartyView({ store, toast, onChange }) {
  $('#partyPanel').addEventListener('click', event => {
    const rowToggleBtn = event.target.closest('.slot-row-toggle');
    if (rowToggleBtn) {
      const slotIndex = Number(rowToggleBtn.dataset.slot);
      const result = store.toggleSlotRow(slotIndex);
      if (!result.ok) toast.show('해당 열이 이미 가득 찼어요.');
      onChange();
      return;
    }
    const slotEl = event.target.closest('.party-slot');
    if (slotEl) {
      openPicker(Number(slotEl.dataset.slot));
      return;
    }
    const action = event.target.closest('button[data-party-action]')?.dataset.partyAction;
    if (action === 'auto-legendary') {
      const result = store.autoFormLegendary();
      if (!result.ok) { toast.show('편성할 보유 정령이 없습니다.'); return; }
      toast.show('레전더리 추천 편성을 적용했습니다.');
      onChange();
    } else if (action === 'auto-growth') {
      const result = store.autoFormGrowth();
      if (!result.ok) { toast.show('편성할 보유 정령이 없습니다.'); return; }
      toast.show('무과금 성장 추천 편성을 적용했습니다.');
      onChange();
    }
    const presetBtn = event.target.closest('button[data-preset]');
    if (presetBtn) {
      const idx = Number(presetBtn.dataset.preset);
      if (presetBtn.dataset.presetAction === 'save') {
        store.savePreset(idx, `프리셋 ${idx + 1}`);
        toast.show(`프리셋 ${idx + 1}에 현재 편성을 저장했습니다.`);
      } else {
        const result = store.applyPreset(idx);
        if (!result.ok) { toast.show('저장된 프리셋이 없습니다.'); return; }
        toast.show(`프리셋 ${idx + 1}을 적용했습니다.`);
      }
      onChange();
    }
  });

  $('#heroPickerGrid').addEventListener('click', event => {
    const item = event.target.closest('.hero-picker-item');
    if (!item || pickerTargetSlot === null) return;
    const result = store.assignPartySlot(pickerTargetSlot, item.dataset.name);
    if (!result.ok) {
      toast.show(result.reason === 'max-copies' ? '같은 정령은 최대 2명까지만 편성할 수 있어요.' : '편성할 수 없습니다.');
      return;
    }
    closePicker();
    onChange();
  });
  $('#heroPickerSheet .sheet-close').addEventListener('click', closePicker);
  $('#heroPickerSheet').addEventListener('click', e => { if (e.target.id === 'heroPickerSheet') closePicker(); });
}

function openPicker(slotIndex) {
  pickerTargetSlot = slotIndex;
  $('#heroPickerSheet').classList.add('open');
}
function closePicker() {
  $('#heroPickerSheet').classList.remove('open');
  pickerTargetSlot = null;
}

function slotMarkup(store, slot, index) {
  if (!slot) {
    return `<div class="party-slot" data-slot="${index}" data-filled="0">＋</div>`;
  }
  const color = RARITY_COLOR[heroRarityOf(slot.name)] || '#9499a8';
  const hero = store.state.heroes[slot.name];
  return `<div class="party-slot" data-slot="${index}" data-filled="1" style="border:2px solid ${color}">
    <img src="${heroSdImagePath(slot.name)}" alt="${slot.name}">
    <strong>${slot.name} Lv.${hero ? hero.level : 1}</strong>
    <button class="slot-row-toggle" data-slot="${index}" style="position:absolute;top:3px;right:3px;width:20px;height:20px;border:0;border-radius:6px;background:rgba(0,0,0,.55);color:#fff;font-size:10px;cursor:pointer">⇅</button>
  </div>`;
}

export function refreshPartyView(store) {
  const party = store.state.party; // 길이 5 고정, 원소는 {name,row} 또는 null
  const indexed = party.map((slot, i) => ({ slot, i, row: slot ? slot.row : SLOT_DEFAULT_ROW[i] })); // 변경
  const front = indexed.filter(x => x.row === 'front'); // 변경: .row 직접 필터 → 파생 row 필터
  const back = indexed.filter(x => x.row === 'back'); // 변경

  $('#partyPanel').innerHTML = `
    <div class="party-rows">
      <div>
        <div class="party-row-label">전열 (2)</div>
        <div class="party-slots front">${front.map(x => slotMarkup(store, x.slot, x.i)).join('')}</div>
      </div>
      <div>
        <div class="party-row-label">후열 (3)</div>
        <div class="party-slots back">${back.map(x => slotMarkup(store, x.slot, x.i)).join('')}</div>
      </div>
    </div>
    <p style="margin:10px 2px 0;color:var(--muted);font-size:9.5px">슬롯을 탭해서 정령을 배치하고, 배치된 슬롯을 다시 탭하면 전열/후열이 바뀝니다. 동일 정령은 최대 2명까지 편성할 수 있어요.</p>
    <div class="party-quick-actions">
      <button data-party-action="auto-legendary">레전더리 추천</button>
      <button data-party-action="auto-growth">무과금 성장 추천</button>
    </div>
    <div class="party-preset-row">
      ${[0, 1, 2].map(i => `<button data-preset="${i}" data-preset-action="apply">${store.state.partyPresets[i]?.label || `빈 프리셋 ${i + 1}`}</button>`).join('')}
    </div>
    <div class="party-preset-row">
      ${[0, 1, 2].map(i => `<button data-preset="${i}" data-preset-action="save">여기에 저장 ${i + 1}</button>`).join('')}
    </div>
  `;

  $('#heroPickerGrid').innerHTML = Object.keys(store.state.heroes).map(name => `
    <div class="hero-picker-item" data-name="${name}" style="border-color:${RARITY_COLOR[heroRarityOf(name)]}">
      <img src="${heroSdImagePath(name)}" alt="${name}">
    </div>
  `).join('') || '<p style="color:var(--muted);font-size:11px">아직 보유한 정령이 없습니다.</p>';
}
