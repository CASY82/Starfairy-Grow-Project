import { RELICS } from '../domain/contentCatalog.js';
import { $ } from '../dom/dom.js';

export function initLabyrinthView({ store, toast, onChange, onNavigateSegment }) {
  $('#labyrinthPanel').addEventListener('click', event => {
    if (event.target.closest('button[data-labyrinth-return]')) { onNavigateSegment('adventure', 'path'); return; }
    if (event.target.closest('button[data-labyrinth-start]')) {
      const result = store.startLabyrinth({ practice: event.target.closest('button').dataset.practice === 'true' });
      if (!result.ok) { toast.show(result.reason === 'done' ? '이번 주는 이미 도전했어요.' : '아직 해금되지 않았어요.'); return; }
      toast.show('꿈의 미궁 진입!');
      onChange();
      return;
    }
    if (event.target.closest('button[data-labyrinth-bank]')) {
      const result = store.bankLabyrinthProgress();
      if (!result.ok) return;
      toast.show(`${result.room}방까지 클리어 · 별가루 +${result.reward.starPowder} 획득하고 종료했어요.`);
      onChange();
      return;
    }
    if (event.target.closest('button[data-labyrinth-advance]')) {
      openBuffChoice(store, toast, onChange, onNavigateSegment);
    }
  });

  $('#labyrinthBuffChoices').addEventListener('click', event => {
    const btn = event.target.closest('button[data-buff]');
    if (!btn) return;
    const chosen = btn.dataset.buff || null;
    $('#labyrinthBuffSheet').classList.remove('open');
    const result = store.startLabyrinthBattle(chosen);
    if (!result.ok) { toast.show('전투를 시작할 수 없어요.'); return; }
    onNavigateSegment('adventure', 'path');
    onChange();
  });
}

function openBuffChoice(store, toast, onChange, onNavigateSegment) {
  const choices = store.labyrinthBuffChoices();
  $('#labyrinthBuffChoices').innerHTML = choices.map(c => `<button data-buff="${c.id}">${c.label}</button>`).join('') +
    `<button data-buff="">버프 없이 진행</button>`;
  $('#labyrinthBuffSheet').classList.add('open');
}

export function refreshLabyrinthView(store) {
  const panel = $('#labyrinthPanel');
  if (!store.state.unlocked.labyrinth) {
    panel.innerHTML = '<div class="content-locked">스테이지 40을 클리어하면 꿈의 미궁이 열립니다.</div>';
    return;
  }
  if (store.subBattle) {
    const label = store.subBattle.mode === 'tower' ? '별자리 탑' : '꿈의 미궁';
    panel.innerHTML = `<div class="content-card"><h3>⚔ 전투 진행 중</h3><p>${label} 전투가 진행 중이에요.</p><button data-labyrinth-return>전투로 돌아가기</button></div>`;
    return;
  }
  const l = store.state.labyrinth;
  if (!l.active) {
    panel.innerHTML = `
      <div class="content-card">
        <h3>🌙 꿈의 미궁</h3>
        <p>5개 방을 순서대로 통과하며 버프 카드를 골라 강해집니다. 실패해도 도달한 방 수만큼 별가루를 받습니다. 주 1회 정산할 수 있으며 연습은 언제든 가능합니다. 유물은 선택한 방부터 적용됩니다.</p>
        <button data-labyrinth-start ${l.weeklyDone ? 'disabled' : ''}>${l.weeklyDone ? '이번 주 정산 완료' : '보상 도전 입장'}</button><button data-labyrinth-start data-practice="true">보상 없는 연습</button>
      </div>`;
    return;
  }
  panel.innerHTML = `
    <div class="content-card">
      <h3>🌙 ${l.room + 1}번째 방 ${l.practice ? '· 연습' : ''}</h3>
      <p>획득한 버프: ${l.buffs.length ? l.buffs.map(id => RELICS.find(r => r.id === id)?.label || '알 수 없는 유물').join(', ') : '없음'}</p>
      <p>유물 효과는 이 도전에만 적용됩니다. 최대 5개의 서로 다른 유물을 선택할 수 있어요.</p>
      <button data-labyrinth-advance>도전</button>
      ${l.room > 0 ? `<button data-labyrinth-bank class="secondary">여기서 멈추고 보상 받기(별가루 +${l.practice ? 0 : l.room * 40})</button>` : ''}
    </div>
  `;
}
