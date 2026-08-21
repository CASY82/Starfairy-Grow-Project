import { $ } from '../dom/dom.js';
import { confirmAction } from '../dom/confirm.js';
import { formatUnit } from '../domain/units.js';
import { heroSdImagePath, weaponImagePath, RARITY_COLOR, rarityLabel, heroRarityOf, heroElementOf, heroRoleOf } from '../domain/heroCatalog.js';
import { flushPendingDefeat } from './adventureView.js';

const STAR_MULTIPLIER_TEXT = [0, 1, 2, 4, 10, 35, 170]; // GameStore.js STAR_MULTIPLIERS와 값을 맞춘 표시 전용 사본
const WEAPON_STAR_TEXT = [0, 1.0, 1.1, 1.22, 1.36, 1.52];
const BOND_STORY = {
  1: '"이 여정에 함께해줘서 고마워요."',
  5: '"당신과 함께라면 어떤 별자리도 두렵지 않아요."',
  10: '"우리의 인연은 이제 별빛 속에 새겨졌어요."'
};

let sortMode = 'power';
let openHeroName = null;
let deps = null;

function heroPower(store, name) {
  const hero = store.state.heroes[name];
  if (!hero) return 0;
  const budget = { legendary: 105, epic: 100, rare: 94, magic: 88, common: 82 }[heroRarityOf(name)] || 82;
  return budget * STAR_MULTIPLIER_TEXT[hero.star] * (1 + 0.01 * (hero.level - 1));
}

export function initGrowthView(context) {
  deps = context;
  const { store, toast, onChange } = context;

  $('#growthPanel').addEventListener('click', event => {
    const sortBtn = event.target.closest('button[data-sort]');
    if (sortBtn) { sortMode = sortBtn.dataset.sort; refreshGrowthView(store); return; }
    const item = event.target.closest('.growth-item');
    if (item) openHeroDetail(item.dataset.name);
  });

  $('#heroDetailSheet').addEventListener('click', e => { if (e.target.id === 'heroDetailSheet') closeHeroDetail(); });

  $('#heroDetailContent').addEventListener('click', async event => {
    const name = openHeroName;
    if (!name) return;
    const action = event.target.closest('button[data-action]')?.dataset.action;
    if (!action) return;
    if (action === 'close-detail') { closeHeroDetail(); return; }
    if (action === 'level-up') {
      const result = store.levelUpHero(name);
      if (!result.ok) {
        if (result.reason === 'cap') toast.show(`정령 레벨은 계정 레벨과 연동됩니다 · 지금은 Lv.${formatUnit(result.cap)}까지.`);
        else if (result.reason === 'starPowder') toast.show(`별가루가 ${result.shortfall}개 부족해요.`);
        else toast.show(`골드가 ${formatUnit(result.shortfall)} 부족해요.`);
      } else {
        toast.show(`${name} Lv.${result.level}`);
      }
    } else if (action === 'level-up-bulk') {
      const result = store.bulkLevelUpHero(name);
      if (result.ok) toast.show(`${name} Lv.${result.from} → Lv.${result.to} · ${result.count}회 레벨업`);
    } else if (action === 'merge') {
      const result = store.mergeHeroNamed(name);
      if (!result.ok) {
        if (result.reason === 'maxed') toast.show('이미 최대 성급입니다.');
        else if (result.reason === 'ownShard') toast.show('이 승급은 동일 정령 조각이 최소 1개 필요해요.');
        else toast.show(`조각이 ${result.shortfall}개 부족해요.`);
      } else {
        toast.show(`${name}이(가) ${result.star}성이 되었습니다 · 능력치 ×${result.multiplier.toFixed(2)}`);
      }
    } else if (action === 'merge-bulk') {
      const preview = store.previewBulkMergeHero(name);
      if (!preview.ok || !await confirmAction({ title: '성급 일괄 합치기', message: `${name} ★${preview.from} → ★${preview.to}\n능력치 ×${preview.multiplierFrom.toFixed(2)} → ×${preview.multiplierTo.toFixed(2)}\n동급 조각 ${preview.costs.shards} · 전용 조각 ${preview.costs.ownShards}`, confirmLabel: '합치기' })) return;
      const result = store.bulkMergeHero(name);
      if (result.ok) toast.show(`${name} ★${result.from} → ★${result.to} · ${result.count}회 합치기`);
    } else if (action === 'gift-bond') {
      const result = store.giftBond(name);
      if (!result.ok) {
        if (result.reason === 'no-gifts') toast.show('인연 선물이 부족해요(미션·던전에서 획득).');
        else if (result.reason === 'daily-limit') toast.show('오늘은 이 정령에게 더 선물할 수 없어요.');
        else if (result.reason === 'maxed') toast.show('이미 인연 10단계입니다.');
        else toast.show('선물을 줄 수 없습니다.');
      } else {
        toast.show(result.leveledUp ? `${name}과(와)의 인연이 ${result.bond}단계가 되었습니다!` : '선물을 전했습니다.');
      }
    } else if (action === 'gift-bond-bulk') {
      const result = store.bulkGiftBond(name);
      if (result.ok) toast.show(`${name}에게 선물 ${result.count}개 전달 · 인연 ${result.to}단계`);
    } else if (action === 'weapon-upgrade') {
      const result = store.upgradeWeaponFor(name);
      if (!result.ok) {
        if (result.reason === 'cap') toast.show('무기 강화 상한입니다.');
        else toast.show(`별철이 ${result.shortfall}개 부족해요.`);
      } else {
        toast.show(`무기 강화 Lv.${result.level}`);
      }
    } else if (action === 'weapon-upgrade-bulk') {
      const result = store.bulkUpgradeWeapon(name);
      if (result.ok) toast.show(`무기 강화 Lv.${result.from} → Lv.${result.to} · 별철 ${result.costs.starIron} 사용`);
    } else if (action === 'weapon-promote') {
      const result = store.promoteWeaponFor(name);
      if (!result.ok) {
        if (result.reason === 'maxed') toast.show('이미 최대 승급입니다.');
        else toast.show(`무기 도면이 ${result.shortfall}개 부족해요.`);
      } else {
        toast.show(`무기 ★${result.star} 승급!`);
      }
    } else if (action === 'weapon-promote-bulk') {
      const preview = store.previewBulkPromoteWeapon(name);
      if (!preview.ok || !await confirmAction({ title: '무기 일괄 승급', message: `${name} 무기 ★${preview.from} → ★${preview.to}\n배율 ×${preview.multiplierFrom.toFixed(2)} → ×${preview.multiplierTo.toFixed(2)}\n도면 ${preview.costs.blueprints}개 사용`, confirmLabel: '승급하기' })) return;
      const result = store.bulkPromoteWeapon(name);
      if (result.ok) toast.show(`무기 ★${result.from} → ★${result.to} · 도면 ${result.costs.blueprints}개 사용`);
    }
    store.saveGame();
    onChange();
  });
}

export function openHeroDetail(name) {
  openHeroName = name;
  renderHeroDetail();
  $('#heroDetailSheet').classList.add('open');
}
function closeHeroDetail() {
  $('#heroDetailSheet').classList.remove('open');
  openHeroName = null;
  if (deps) flushPendingDefeat(deps.store);
}

function renderHeroDetail() {
  if (!openHeroName || !deps) return;
  const { store } = deps;
  const name = openHeroName;
  const hero = store.state.heroes[name];
  if (!hero) { closeHeroDetail(); return; }
  const rarity = heroRarityOf(name);
  const color = RARITY_COLOR[rarity];
  const levelCost = store.levelUpHeroCost(name);
  const mergeInfo = store.mergeInfoFor(name);
  const weaponCost = store.weaponUpgradeCostFor(name);
  const weaponPromoteCost = store.weaponPromotionCostFor(name);
  const bulkLevel = store.previewBulkLevelUpHero(name);
  const bulkMerge = store.previewBulkMergeHero(name);
  const bulkBond = store.previewBulkGiftBond(name);
  const bulkWeapon = store.previewBulkUpgradeWeapon(name);
  const bulkPromote = store.previewBulkPromoteWeapon(name);
  const bondNeed = 100 * (hero.bond + 1);
  const bondStoryKeys = [1, 5, 10].filter(k => hero.bond >= k);

  $('#heroDetailContent').innerHTML = `
    <div class="sheet-head"><h3>${name}</h3><button class="icon-btn" data-action="close-detail" aria-label="닫기">✕</button></div>
    <div class="hero-detail-head">
      <img src="${heroSdImagePath(name)}" alt="${name}" style="border:2px solid ${color}">
      <div>
        <strong style="font-size:16px">${name}</strong>
        <div style="color:${color};font-size:10px;font-weight:800">${rarityLabel(rarity)} · ${heroElementOf(name)} · ${heroRoleOf(name)}</div>
        <div style="color:var(--muted);font-size:10px;margin-top:2px">Lv.${formatUnit(hero.level)} · ★${hero.star} · 인연 ${hero.bond}단계</div>
      </div>
    </div>

    <div class="hero-detail-section">
      <h4>레벨업</h4>
      <div class="hero-detail-row">
        <span style="font-size:10px;color:var(--muted)">${hero.level >= levelCost.cap ? `계정 레벨과 연동 · 지금은 Lv.${formatUnit(levelCost.cap)}까지` : `별가루 ${levelCost.starPowder} · 골드 ${formatUnit(levelCost.gold)}`}</span>
        <div class="hero-detail-actions">
          <button data-action="level-up" ${hero.level >= levelCost.cap || store.state.materials.starPowder < levelCost.starPowder || store.state.gold < levelCost.gold ? 'disabled' : ''}>레벨업</button>
          <button class="bulk-action-btn" data-action="level-up-bulk" ${!bulkLevel.ok ? 'disabled' : ''}>최대 ${bulkLevel.count}회</button>
        </div>
      </div>
    </div>

    <div class="hero-detail-section">
      <h4>합치기</h4>
      <div class="hero-detail-row">
        <span style="font-size:10px;color:var(--muted)">${mergeInfo.maxed ? '최대 성급' : `${mergeInfo.next}성 · 조각 ${mergeInfo.pool}/${mergeInfo.cost}${mergeInfo.needOwnShard ? ` · 전용조각 ${mergeInfo.ownShards}/1` : ''}`}</span>
        <div class="hero-detail-actions">
          <button data-action="merge" ${mergeInfo.maxed || mergeInfo.pool < mergeInfo.cost || (mergeInfo.needOwnShard && mergeInfo.ownShards < 1) ? 'disabled' : ''}>${mergeInfo.maxed ? '완료' : '1번 강화'}</button>
          <button class="bulk-action-btn" data-action="merge-bulk" ${!bulkMerge.ok ? 'disabled' : ''}>일괄 강화</button>
        </div>
      </div>
    </div>

    <div class="hero-detail-section">
      <h4>정령 인연</h4>
      <div class="hero-detail-row">
        <span style="font-size:10px;color:var(--muted)">${hero.bond >= 10 ? '최대 단계' : `${hero.bondExp}/${bondNeed} · 오늘 선물 ${hero.bondGiftsToday}/3 · 보유 선물 ${store.state.bondGifts}`}</span>
        <div class="hero-detail-actions">
          <button data-action="gift-bond" ${hero.bond >= 10 || hero.bondGiftsToday >= 3 || store.state.bondGifts <= 0 ? 'disabled' : ''}>선물하기</button>
          <button class="bulk-action-btn" data-action="gift-bond-bulk" ${!bulkBond.ok ? 'disabled' : ''}>모두 ${bulkBond.count}개</button>
        </div>
      </div>
      ${bondStoryKeys.map(k => `<div class="bond-story">${BOND_STORY[k]}</div>`).join('')}
    </div>

    <div class="hero-detail-section">
      <img src="${weaponImagePath(name)}" alt="" style="width:56px;height:56px;border-radius:12px;object-fit:contain;float:right;margin-left:10px;background:rgba(255,255,255,.05)">
      <h4>전용 무기</h4>
      <div style="font-size:10px;color:var(--muted)">강화 Lv.${hero.weaponLevel}/20 · 승급 ★${hero.weaponStar}(×${WEAPON_STAR_TEXT[hero.weaponStar].toFixed(2)})</div>
      <div class="hero-detail-row">
        <span style="font-size:10px;color:var(--muted)">${hero.weaponLevel >= 20 ? '강화 상한' : `별철 ${weaponCost}`}</span>
        <div class="hero-detail-actions">
          <button data-action="weapon-upgrade" ${hero.weaponLevel >= 20 || store.state.materials.starIron < weaponCost ? 'disabled' : ''}>1번 강화</button>
          <button class="bulk-action-btn" data-action="weapon-upgrade-bulk" ${!bulkWeapon.ok ? 'disabled' : ''}>일괄 강화</button>
        </div>
      </div>
      <div class="hero-detail-row">
        <span style="font-size:10px;color:var(--muted)">${hero.weaponStar >= 5 ? '승급 상한' : `도면 ${weaponPromoteCost} 필요 / ${store.state.weaponBlueprint} 보유`}</span>
        <div class="hero-detail-actions">
          <button data-action="weapon-promote" ${hero.weaponStar >= 5 || store.state.weaponBlueprint < weaponPromoteCost ? 'disabled' : ''}>${hero.weaponStar >= 5 ? '완료' : '1번 승급'}</button>
          <button class="bulk-action-btn" data-action="weapon-promote-bulk" ${!bulkPromote.ok ? 'disabled' : ''}>일괄 승급</button>
        </div>
      </div>
    </div>
  `;
}

export function refreshGrowthView(store) {
  const names = Object.keys(store.state.heroes);
  const sorted = [...names].sort((a, b) => {
    const ha = store.state.heroes[a];
    const hb = store.state.heroes[b];
    if (sortMode === 'level') return hb.level - ha.level;
    if (sortMode === 'star') return hb.star - ha.star;
    return heroPower(store, b) - heroPower(store, a);
  });

  const list = sorted.map(name => {
    const hero = store.state.heroes[name];
    const color = RARITY_COLOR[heroRarityOf(name)];
    return `<div class="growth-item" data-name="${name}">
      <img src="${heroSdImagePath(name)}" alt="${name}" style="border:1px solid ${color}">
      <div><strong>${name}</strong><span>Lv.${formatUnit(hero.level)} · ★${hero.star} · 전투력 ${Math.round(heroPower(store, name) * 100) / 100}</span></div>
    </div>`;
  }).join('') || '<p style="color:var(--muted);font-size:11px;margin-top:10px">아직 보유한 정령이 없습니다. 소환 탭에서 정령을 얻어보세요.</p>';

  $('#growthPanel').innerHTML = `
    <div class="growth-sort-row">
      <button data-sort="power" class="${sortMode === 'power' ? 'active' : ''}">전투력순</button>
      <button data-sort="level" class="${sortMode === 'level' ? 'active' : ''}">레벨순</button>
      <button data-sort="star" class="${sortMode === 'star' ? 'active' : ''}">성급순</button>
    </div>
    <div class="growth-list">${list}</div>
  `;

  if (openHeroName) renderHeroDetail();
}
