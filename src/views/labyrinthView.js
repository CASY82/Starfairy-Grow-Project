import { $ } from '../dom/dom.js';

export function initLabyrinthView({ store, toast, onChange }) {
  $('#labyrinthPanel').addEventListener('click', event => {
    if (event.target.closest('button[data-labyrinth-start]')) {
      const result = store.startLabyrinth();
      if (!result.ok) { toast.show(result.reason === 'done' ? '이번 주는 이미 도전했어요.' : '아직 해금되지 않았어요.'); return; }
      toast.show('꿈의 미궁 진입!');
      onChange();
      return;
    }
    if (event.target.closest('button[data-labyrinth-advance]')) {
      openBuffChoice(store, toast, onChange);
    }
  });

  $('#labyrinthBuffChoices').addEventListener('click', event => {
    const btn = event.target.closest('button[data-buff]');
    if (!btn) return;
    const result = store.attemptLabyrinthRoom(btn.dataset.buff);
    $('#labyrinthBuffSheet').classList.remove('open');
    if (!result.ok) return;
    if (!result.success) {
      toast.show(`실패 · ${result.room}방까지 도달 · 별가루 +${result.reward.starPowder}`);
    } else if (result.completed) {
      toast.show(`완주! 별의 인연 +${result.reward.starBond}`);
    } else {
      toast.show(`${result.room}방 클리어`);
    }
    store.saveGame();
    onChange();
  });
}

function openBuffChoice(store, toast, onChange) {
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
  const l = store.state.labyrinth;
  if (!l.active) {
    panel.innerHTML = `
      <div class="content-card">
        <h3>🌙 꿈의 미궁</h3>
        <p>5개 방을 순서대로 통과하며 버프 카드를 골라 강해집니다. 실패해도 도달한 방 수만큼 별가루를 받습니다. 주 1회만 도전할 수 있어요.</p>
        <button data-labyrinth-start ${l.weeklyDone ? 'disabled' : ''}>${l.weeklyDone ? '이번 주 완료' : '입장'}</button>
      </div>`;
    return;
  }
  panel.innerHTML = `
    <div class="content-card">
      <h3>🌙 ${l.room + 1}번째 방</h3>
      <p>획득한 버프: ${l.buffs.length ? l.buffs.join(', ') : '없음'}</p>
      <button data-labyrinth-advance>도전</button>
    </div>
  `;
}
