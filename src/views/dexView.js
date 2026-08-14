import { $ } from '../dom/dom.js';
import { ALL_HEROES, RARITY_COLOR, heroSdImagePath } from '../domain/heroCatalog.js';

const RARITY_TAG = { legendary: 'L', epic: 'E', rare: 'R', magic: 'M', common: 'C' };
const MILESTONES = [5, 10, 15, 20];

export function initDexView({ store, toast, onChange, openHeroDetail }) {
  $('#dexPanel').addEventListener('click', event => {
    const card = event.target.closest('.dex-card');
    if (card && card.dataset.owned === '1') { openHeroDetail(card.dataset.name); return; }
    const btn = event.target.closest('button[data-milestone]');
    if (btn) {
      const result = store.claimDexMilestone(Number(btn.dataset.milestone));
      if (!result.ok) {
        if (result.reason === 'not-enough') toast.show('아직 수집 종수가 부족해요.');
        else if (result.reason === 'claimed') toast.show('이미 수령했어요.');
        return;
      }
      toast.show('수집 마일스톤 보상을 받았습니다.');
      store.saveGame();
      onChange();
    }
  });
}

export function refreshDexView(store) {
  const owned = store.state.heroes;
  const ownedCount = Object.keys(owned).length;
  const cards = ALL_HEROES.map(hero => {
    const isOwned = hero.name in owned;
    const heroState = owned[hero.name];
    const color = RARITY_COLOR[hero.rarity];
    return `<div class="dex-card" data-name="${hero.name}" data-owned="${isOwned ? 1 : 0}" style="border-color:${isOwned ? color : 'var(--line)'}${isOwned ? '' : ';cursor:default'}">
      <img src="${heroSdImagePath(hero.name)}" alt="${hero.name}" ${isOwned ? '' : 'class="locked"'}>
      <span class="dex-rarity-tag" style="background:${color}">${RARITY_TAG[hero.rarity]}</span>
      ${isOwned ? `<span class="dex-badge">Lv.${heroState.level} ★${heroState.star}</span>` : `<span class="dex-badge">미보유</span>`}
    </div>`;
  }).join('');

  const milestoneButtons = MILESTONES.map(count => {
    const claimed = store.state.claimedDexMilestones.includes(count);
    const reachable = ownedCount >= count;
    return `<button data-milestone="${count}" ${claimed || !reachable ? 'disabled' : ''}>${count}종${claimed ? ' 완료' : reachable ? ' 수령가능' : ''}</button>`;
  }).join('');

  $('#dexPanel').innerHTML = `
    <div class="dex-header"><span>수집 ${ownedCount} / ${ALL_HEROES.length}</span><span>${Math.round((ownedCount / ALL_HEROES.length) * 100)}%</span></div>
    <div class="dex-grid">${cards}</div>
    <div class="dex-milestones">${milestoneButtons}</div>
  `;
}
