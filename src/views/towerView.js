import { $ } from '../dom/dom.js';

export function initTowerView({ store, toast, onChange }) {
  $('#towerPanel').addEventListener('click', event => {
    if (!event.target.closest('button[data-tower-attempt]')) return;
    const result = store.attemptTower();
    if (!result.ok) {
      if (result.reason === 'element') toast.show(`이 구간은 ${result.required} 속성 정령으로만 편성해야 도전할 수 있어요.`);
      else toast.show('아직 해금되지 않았어요.');
      return;
    }
    if (!result.success) { toast.show('전투력이 부족해 등반에 실패했어요.'); onChange(); return; }
    toast.show(result.reward ? `${result.floor - 1}층 클리어! 기억의 별 +${result.reward.memoryStars} · 무기 도면 +${result.reward.weaponBlueprint}` : `${result.floor - 1}층 클리어!`);
    store.saveGame();
    onChange();
  });
}

export function refreshTowerView(store) {
  const panel = $('#towerPanel');
  if (!store.state.unlocked.tower) {
    panel.innerHTML = '<div class="content-locked">스테이지 30을 클리어하면 별자리 탑이 열립니다.</div>';
    return;
  }
  const floor = store.state.tower.floor;
  const req = store.towerElementRequirement(floor);
  panel.innerHTML = `
    <div class="content-card">
      <h3>🗼 별자리 탑 · ${floor}층</h3>
      <p>10층마다 편성 속성 제한이 걸립니다.${req ? ` 이번 구간은 <strong style="color:var(--gold)">${req}</strong> 속성 전원 편성 필요.` : ' 이번 구간은 속성 제한이 없습니다.'} 10층 단위 클리어마다 기억의 별과 무기 도면을 받습니다.</p>
      <button data-tower-attempt>${floor}층 도전</button>
    </div>
    <p style="margin-top:10px;color:var(--muted);font-size:10px">주간 최고 도달 보상 수령 층: ${store.state.tower.weeklyClaimedFloor}층 · 매주 초기화됩니다(도달 층수는 유지).</p>
  `;
}
