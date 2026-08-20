import { $ } from '../dom/dom.js';

export function initTowerView({ store, toast, onChange, onNavigateSegment }) {
  $('#towerPanel').addEventListener('click', event => {
    if (event.target.closest('button[data-tower-return]')) { onNavigateSegment('adventure', 'path'); return; }
    if (!event.target.closest('button[data-tower-attempt]')) return;
    const result = store.startTowerBattle();
    if (!result.ok) {
      if (result.reason === 'element') toast.show(`이 구간은 ${result.required} 속성 정령으로만 편성해야 도전할 수 있어요.`);
      else if (result.reason === 'busy') toast.show('이미 다른 전투가 진행 중이에요.');
      else toast.show('아직 해금되지 않았어요.');
      return;
    }
    onNavigateSegment('adventure', 'path');
    onChange();
  });
}

export function refreshTowerView(store) {
  const panel = $('#towerPanel');
  if (!store.state.unlocked.tower) {
    panel.innerHTML = '<div class="content-locked">스테이지 30을 클리어하면 별자리 탑이 열립니다.</div>';
    return;
  }
  if (store.subBattle) {
    const label = store.subBattle.mode === 'tower' ? '별자리 탑' : '꿈의 미궁';
    panel.innerHTML = `<div class="content-card"><h3>⚔ 전투 진행 중</h3><p>${label} 전투가 진행 중이에요.</p><button data-tower-return>전투로 돌아가기</button></div>`;
    return;
  }
  const floor = store.state.tower.floor;
  const req = store.towerElementRequirement(floor);
  const forecast = store.towerForecast();
  const badgeClass = forecast.verdict === '예상 승리' ? 'win' : forecast.verdict === '공격력 부족' ? 'atk' : 'hp';
  panel.innerHTML = `
    <div class="content-card">
      <h3>🗼 별자리 탑 · ${floor}층</h3>
      <p>10층마다 편성 속성 제한이 걸립니다.${req ? ` 이번 구간은 <strong style="color:var(--gold)">${req}</strong> 속성 전원 편성 필요.` : ' 이번 구간은 속성 제한이 없습니다.'} 10층 단위 클리어마다 기억의 별과 무기 도면을 받습니다.</p>
      <span class="forecast-badge ${badgeClass}">${forecast.verdict}</span>
      <button data-tower-attempt>${floor}층 도전</button>
    </div>
    <p style="margin-top:10px;color:var(--muted);font-size:10px">주간 최고 도달 보상 수령 층: ${store.state.tower.weeklyClaimedFloor}층 · 매주 초기화됩니다(도달 층수는 유지). 도전에 소모되는 자원은 없습니다.</p>
  `;
}
