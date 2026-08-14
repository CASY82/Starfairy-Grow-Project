import { $ } from '../dom/dom.js';
import { formatUnit } from '../domain/units.js';

const BOUNTY_META = {
  gold: { icon: '💰', name: '골드 수배', desc: '성공 시 현재 처치 보상 × 3' },
  exp: { icon: '⭐', name: '경험치 수배', desc: '성공 시 계정 경험치 획득' },
  starIron: { icon: '⛓️', name: '별철 수배', desc: '성공 시 별철 획득' }
};

export function initBountyView({ store, toast, onChange }) {
  $('#bountyPanel').addEventListener('click', event => {
    const btn = event.target.closest('button[data-bounty]');
    if (!btn) return;
    const result = store.attemptBounty(btn.dataset.bounty);
    if (!result.ok) { toast.show(result.reason === 'uses' ? '오늘 남은 도전 횟수가 없어요.' : '아직 해금되지 않았어요.'); return; }
    if (!result.success) { toast.show('전투력이 부족해 실패했어요. 정령을 더 성장시켜 보세요.'); onChange(); return; }
    const rewardText = result.reward.gold ? `골드 +${formatUnit(result.reward.gold)}` : result.reward.exp ? `경험치 +${result.reward.exp}` : `별철 +${result.reward.starIron}`;
    toast.show(`현상 수배 성공! ${rewardText}`);
    store.saveGame();
    onChange();
  });
}

export function refreshBountyView(store) {
  const panel = $('#bountyPanel');
  if (!store.state.unlocked.bounty) {
    panel.innerHTML = '<div class="content-locked">스테이지 20을 클리어하면 현상 수배가 열립니다.</div>';
    return;
  }
  panel.innerHTML = `<div class="content-list">${Object.entries(BOUNTY_META).map(([key, meta]) => {
    const uses = store.state.bounty[key].usesToday;
    return `<div class="content-card">
      <h3>${meta.icon} ${meta.name}</h3>
      <p>${meta.desc} · 오늘 ${uses}회 남음</p>
      <button data-bounty="${key}" ${uses <= 0 ? 'disabled' : ''}>도전</button>
    </div>`;
  }).join('')}</div>`;
}
