import { $ } from '../dom/dom.js';
import { heroSdImagePath, heroRoleOf, enemyImagePath } from '../domain/heroCatalog.js';
import { formatUnit } from '../domain/units.js';
import { RELICS, LESSONS, LOAN_HEROES, EPISODES, PROLOGUE, CHAPTERS, DISCOVERIES, SIDE_STORY, DECORATIONS, CONTENT_ART } from '../domain/contentCatalog.js';
const esc = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
let selectedLesson = LESSONS[0].id;
let loan = LOAN_HEROES.map((name, i) => ({ name: i < 3 ? name : '', row: i < 2 ? 'front' : 'back' }));
let relay = Array.from({ length: 10 }, (_, i) => ({ name: '', row: i % 5 < 2 ? 'front' : 'back' }));
let reader = null, previousSignature = '', villageDirty = false;
const button = (label, action, id = '', disabled = false) => `<button data-cx="${action}" data-id="${esc(id)}" ${disabled ? 'disabled' : ''}>${esc(label)}</button>`;
function partyForm(kind, values, names) {
  return values.map((slot, i) => `<div class="cx-form-row"><label>${kind === 'relay' ? `${Math.floor(i / 5) + 1}팀 · ` : ''}${i % 5 + 1}번<select aria-label="${kind === 'loan' ? '대여' : '원정'} ${i + 1}번 정령" data-cx-form="${kind}" data-index="${i}" data-field="name"><option value="">비움</option>${names.map(name => `<option value="${esc(name)}" ${slot.name === name ? 'selected' : ''}>${esc(name)} · ${heroRoleOf(name)}</option>`).join('')}</select></label><label>배치<select aria-label="${i + 1}번 전후열" data-cx-form="${kind}" data-index="${i}" data-field="row"><option value="front" ${slot.row === 'front' ? 'selected' : ''}>전열</option><option value="back" ${slot.row === 'back' ? 'selected' : ''}>후열</option></select></label></div>`).join('');
}
function renderReader() {
  const host = $('#cxStoryReader');
  if (!reader) { host.innerHTML = ''; return; }
  const { story, index } = reader;
  host.innerHTML = `<div class="cx-reader" role="region" aria-label="이야기 감상"><span class="cx-tag">${index + 1} / ${story.lines.length}</span><h3>${esc(story.title)}</h3>${story.hero ? `<img class="cx-portrait" src="${heroSdImagePath(story.hero)}" alt="${esc(story.hero)}">` : ''}<p aria-live="polite">${esc(story.lines[index])}</p><progress value="${index + 1}" max="${story.lines.length}" aria-label="이야기 진행"></progress><div class="cx-actions">${button(index + 1 === story.lines.length ? '감상 완료' : '다음', 'reader-next')}${button('건너뛰고 완료', 'reader-skip')}${button('닫기', 'reader-close')}</div></div>`;
}
export function initContentView({ store, toast, onChange, onNavigate }) {
  document.addEventListener('change', event => {
    const input = event.target;
    if (input.closest('#cxVillage')) villageDirty = true;
    if (input.matches('[data-cx-form]')) {
      const list = input.dataset.cxForm === 'loan' ? loan : relay;
      list[Number(input.dataset.index)][input.dataset.field] = input.value;
    }
    if (input.id === 'cxLessonSelect') { selectedLesson = input.value; previousSignature = ''; refreshContentView(store); }
  });
  document.addEventListener('click', event => {
    const btn = event.target.closest('[data-cx]'); if (!btn) return;
    const action = btn.dataset.cx, id = btn.dataset.id; let result;
    if (action === 'story' || action === 'prologue' || action === 'side-story') {
      const story = action === 'prologue' ? PROLOGUE : action === 'side-story' ? SIDE_STORY[Number(id)] : EPISODES.find(e => e.id === id);
      if (!story) return;
      if (story.hero && (store.state.heroes[story.hero]?.bond ?? -1) < story.bond) return;
      if (action === 'side-story' && store.state.content.sideProgress < [0, 3, 5][Number(id)]) return;
      reader = { story, index: 0 }; onNavigate('spirits', 'stories'); renderReader(); $('#cxStoryReader').scrollIntoView({ block: 'nearest' }); return;
    }
    if (action.startsWith('reader-')) {
      if (!reader) return;
      if (action === 'reader-close') reader = null;
      else if (action === 'reader-skip' || reader.index + 1 === reader.story.lines.length) {
        if (reader.story.id) { result = store.finishEpisode(reader.story.id); toast.show(result.first ? '이야기를 기록했어요. 프로필 배지가 열렸습니다.' : '다시 만나 반가운 이야기였어요.'); }
        reader = null;
      } else reader.index += 1;
      renderReader(); onChange(); return;
    }
    if (action === 'lesson') result = store.startContentBattle('lesson', selectedLesson, { party: loan.map(s => s.name ? { ...s } : null) });
    if (action === 'boss' || action === 'weekly' || action === 'side') result = store.startContentBattle(action, id);
    if (action === 'relay') result = store.startContentBattle('relay', '', { teams: [relay.slice(0, 5), relay.slice(5)].map(team => team.map(s => s.name ? { ...s } : null)) });
    if (action === 'abandon') result = store.abandonContentBattle();
    if (action === 'ultimate') { result = store.fireContentUltimate(Number(id)); refreshContentArena(store); }
    if (action === 'discovery') result = store.claimDiscovery(id);
    if (action === 'badge') result = store.equipContentBadge(id || null);
    if (action === 'decorate') result = store.decorateVillage({ theme: $('#cxTheme').value, representative: $('#cxRepresentative').value || null, slots: [0, 1, 2].map(i => $(`#cxDecor${i}`).value || null) });
    if (action === 'return-content') { onNavigate('adventure', 'content'); $('#cxArena').scrollIntoView({ block: 'start' }); return; }
    if (result) {
      if (!result.ok) toast.show(({ locked: '해금 조건을 먼저 완료해주세요.', party: '필요한 인원을 중복 없이 편성해주세요.', busy: '진행 중인 전투를 먼저 마쳐주세요.', duplicate: '같은 장식을 두 곳에 놓을 수 없어요.' })[result.reason] || '지금은 사용할 수 없어요.');
      else if (['lesson', 'boss', 'weekly', 'side', 'relay'].includes(action)) { toast.show('도전 시작! 본편 진행은 잠시 쉬어갑니다.'); onNavigate('adventure', 'content'); }
      else if (action === 'decorate') { villageDirty = false; toast.show('정령의 쉼터를 꾸몄어요.'); }
      else if (action === 'discovery') toast.show(result.first ? '탐험 수첩에 기록했어요.' : '이미 기록한 발견이에요.');
      previousSignature = ''; onChange();
      if (result.ok && ['lesson', 'boss', 'weekly', 'side', 'relay', 'return-content'].includes(action)) $('#cxArena').scrollIntoView({ block: 'start' });
    }
  });
}
export function refreshContentArena(store) {
  const host = $('#cxArena'), b = store.contentBattle;
  const active = host.contains(document.activeElement) ? document.activeElement : null;
  const focusAction = active?.dataset.cx, focusId = active?.dataset.id;
  if (!b) { host.innerHTML = store.contentResult ? `<div class="cx-feedback" role="status">${esc(store.contentResult.message)}${store.contentResult.elapsedMs ? `<br>전투 기준 ${(store.contentResult.elapsedMs / 1000).toFixed(1)}초` : ''}</div>` : ''; return; }
  const titles = { lesson: b.lesson?.title, boss: `보스 ${b.id} 관측`, weekly: b.weekly?.title, relay: `원정대 ${b.leg + 1} / 2팀`, side: `별이 잠든 숲 · ${Number(b.id) + 1} / 5` };
  const percent = (n, d) => d > 0n ? Math.max(0, Number(n * 10000n / d) / 100) : 0;
  const enemy = b.mode === 'side' && b.id === '4' ? CONTENT_ART.guardian : enemyImagePath(b.stage);
  host.innerHTML = `<div class="cx-battle"><span class="cx-tag">독립 도전 · ${(b.elapsedMs / 1000).toFixed(1)}초</span><h3>${esc(titles[b.mode])}</h3><img class="cx-enemy" src="${enemy}" alt="${b.mode === 'side' && b.id === '4' ? '숲의 수호자' : '도전 상대'}"><p>적 HP ${formatUnit(b.enemyHp > 0n ? b.enemyHp : 0n)} / ${formatUnit(b.enemyMaxHp)}</p><div class="cx-bar"><i style="width:${percent(b.enemyHp, b.enemyMaxHp)}%"></i></div><div class="cx-party">${b.combat.party.map((s, i) => s ? `<div><img src="${heroSdImagePath(s.name)}" alt="${esc(s.name)}"><span>${esc(s.name)} · ${s.row === 'front' ? '전열' : '후열'}</span>${b.ultimateCooldowns ? button(b.ultimateCooldowns[i] <= 0 ? '궁극기' : `${Math.max(0, b.ultimateCooldowns[i])}틱`, 'ultimate', i, b.ultimateCooldowns[i] > 0) : ''}</div>` : '<div></div>').join('')}</div><p>파티 HP ${formatUnit(b.partyHp > 0n ? b.partyHp : 0n)} / ${formatUnit(b.partyMaxHp)}</p><div class="cx-bar cx-party-health"><i style="width:${percent(b.partyHp, b.partyMaxHp)}%"></i></div><div class="cx-actions">${button('도전 중단', 'abandon')}</div><p>새로고침 시 전투는 종료됩니다. 참가 비용은 없으며, 완료 기록만 저장됩니다.</p></div>`;
  if (focusAction) [...host.querySelectorAll('[data-cx]')].find(el => el.dataset.cx === focusAction && el.dataset.id === focusId)?.focus({ preventScroll: true });
}
export function refreshContentView(store) {
  const c = store.state.content, stage = store.contentUnlockStage(), busy = !!(store.contentBattle || store.subBattle);
  const signature = JSON.stringify([c, Object.entries(store.state.heroes).map(([n, h]) => [n, h.bond]), stage, busy, selectedLesson, store.weeklyContentInfo()]);
  $('#cxHeaderBadge').textContent = c.equippedBadge ? store.contentBadgeLabel(c.equippedBadge) : '';
  $('#cxResume').innerHTML = store.contentBattle ? `<div class="cx-feedback">콘텐츠 도전 진행 중 ${button('전투 보기', 'return-content')}</div>` : '';
  refreshContentArena(store);
  if (signature === previousSignature) return; previousSignature = signature;
  const opened = [...document.querySelectorAll('#cxChallenges details, #cxJournal details')].map(d => d.open);
  const drafts = villageDirty ? [...document.querySelectorAll('#cxVillage select')].map(el => [el.id, el.value]) : [];
  const focused = document.activeElement?.id;
  const done = id => c.completed.includes(id);
  $('#cxStories').innerHTML = `<div class="cx-card"><span class="cx-tag">인연극장</span><h3>정령이 들려주는 작은 이야기</h3><p>인연 1 · 3 · 5에서 이야기가 열려요. 건너뛰어도 같은 배지를 얻고 언제든 다시 볼 수 있어요.</p>${button('공통 프롤로그', 'prologue')}</div>` + ['애쉬', '버블', '클로버'].map(hero => `<div class="cx-card"><img class="cx-portrait" src="${heroSdImagePath(hero)}" alt="${hero}"><h3>${hero}</h3><p>현재 인연 ${store.state.heroes[hero]?.bond ?? '미보유'}</p><div class="cx-actions">${EPISODES.filter(e => e.hero === hero).map(e => button(`${done(e.id) ? '✓ ' : ''}${e.title} · 인연 ${e.bond}`, 'story', e.id, (store.state.heroes[hero]?.bond ?? -1) < e.bond)).join('')}</div></div>`).join('');
  const lesson = LESSONS.find(l => l.id === selectedLesson);
  const week = store.weeklyContentInfo();
  $('#cxChallenges').innerHTML = `<div class="cx-hero"><span class="cx-tag">함께할 이유를 더하다</span><h3>별빛 도전 수첩</h3><p>무료 도전 · 영구 배지 · 본편과 분리된 전투</p></div>
  <details class="cx-card" open><summary>별빛 전술교실 · 쉬움 10단계 해금</summary><p>대여 정령 Lv.20 · ★2 · 계정 Lv.20. 보유 정령과 재화는 변하지 않아요.</p><label>문제 선택<select id="cxLessonSelect">${LESSONS.map(l => `<option value="${l.id}" ${l.id === selectedLesson ? 'selected' : ''}>${done(`lesson-${l.id}`) ? '✓ ' : ''}${l.title}</option>`).join('')}</select></label><p>${lesson.hint}<br>정확히 ${lesson.members}명을 배치하세요.</p>${partyForm('loan', loan, LOAN_HEROES)}<div class="cx-actions">${button('대여 파티로 도전', 'lesson', '', stage < 10 || busy)}</div></details>
  <div class="cx-card"><span class="cx-tag">이번 주 · ${week.week}</span><h3>${week.title}</h3><p>${week.description}<br>쉬움 30단계 해금 · 고정 30단계 난이도 · 무제한 연습<br>${week.bestMs ? `개인 최고 ${(week.bestMs / 1000).toFixed(1)}초` : '아직 완료 기록이 없어요.'}</p>${button('별자리 도전', 'weekly', '', stage < 30 || busy)}</div>
  <details class="cx-card"><summary>두 파티 원정대 · 쉬움 50단계 · 보유 10종</summary><p>중복 없는 두 팀이 같은 30단계 상대를 이어서 공략합니다. 교대 시 체력과 효과가 초기화됩니다.</p>${partyForm('relay', relay, Object.keys(store.state.heroes))}${button('두 팀으로 출발', 'relay', '', stage < 50 || Object.keys(store.state.heroes).length < 10 || busy)}</details>
  <div class="cx-card"><span class="cx-tag">상시 외전</span><h3>별이 잠든 숲</h3><p>쉬움 50단계 해금 · ${c.sideProgress} / 5전 완료<br>최종 완료 시 별숲 테마와 영구 배지를 얻습니다.</p><div class="cx-actions">${SIDE_STORY.map((s, i) => button(s.title, 'side-story', i, stage < 50 || c.sideProgress < [0, 3, 5][i])).join('')}</div><div class="cx-actions">${[0, 1, 2, 3, 4].map(i => button(`${i < c.sideProgress ? '✓ ' : ''}${['숲의 입구', '별빛 발자국', '덩굴의 문', '관측소 앞', '잠의 수호자'][i]}`, 'side', i, stage < 50 || i > c.sideProgress || busy)).join('')}</div></div>
  <div class="cx-card"><h3>길드 공동 관측</h3><p>준비 중 · 계정과 온라인 협동 기반이 마련되면 열립니다.</p></div>`;
  $('#cxBossTasks').innerHTML = `<div class="cx-card"><h3>보스 관측 과제 · 실시간 도전</h3><p>기존 회상 보상과 별개로 진행합니다. 서로 다른 역할 3종 / 지원 없이 승리하면 영구 배지를 얻어요.</p>${[10, 20].map(n => `<p>${n}단계 · 다채로운 관측 ${done(`boss-${n}-roles`) ? '✓' : '미완료'} · 자립하는 관측 ${done(`boss-${n}-solo`) ? '✓' : '미완료'}</p>${button(`${n}단계 보스 도전`, 'boss', n, stage < n || busy)}`).join('')}</div>`;
  $('#cxJournal').innerHTML = `<div class="cx-card cx-journal"><h3>탐험 수첩</h3><p>쉬움 10단계 이후 기록 가능 · 과거 클리어 소급 인정<br>${DISCOVERIES.filter(d => done(d.id)).length} / 15개 발견</p>${CHAPTERS.map((name, i) => `<details><summary>${name}</summary>${DISCOVERIES.filter(d => d.chapter === i).map(d => `<p><strong>${d.label}</strong> · ${d.stage}단계 클리어<br>${d.text}</p>${button(done(d.id) ? '기록 완료' : '수첩에 기록', 'discovery', d.id, done(d.id) || !store.discoveryAvailable(d.id))}`).join('')}</details>`).join('')}</div><div class="cx-card"><h3>프로필 배지 보관함</h3><p>배지는 능력치에 영향을 주지 않습니다.</p><div class="cx-actions">${button('배지 해제', 'badge')}${c.completed.map(id => button(`${c.equippedBadge === id ? '● ' : ''}${store.contentBadgeLabel(id)}`, 'badge', id)).join('')}</div></div>`;
  const available = store.availableDecorations(), themes = [['night', '별밤'], ['dawn', '새벽'], ...(done('side') ? [['forest', '별숲']] : [])];
  $('#cxVillage').innerHTML = `<div class="cx-card"><h3>정령의 쉼터</h3><div class="cx-village" data-theme="${c.theme}">${c.decorationSlots.map(id => `<span class="cx-prop" title="${esc(DECORATIONS.find(d => d.id === id)?.label)}">${DECORATIONS.find(d => d.id === id)?.glyph || '·'}</span>`).join('')}${c.representative && store.state.heroes[c.representative] ? `<img src="${heroSdImagePath(c.representative)}" alt="${esc(c.representative)}">` : ''}</div><p>외형만 바뀝니다. 생산량과 전투력은 그대로예요.</p><label>테마<select id="cxTheme">${themes.map(([id, name]) => `<option value="${id}" ${c.theme === id ? 'selected' : ''}>${name}</option>`).join('')}</select></label><label>대표 정령<select id="cxRepresentative"><option value="">없음</option>${Object.keys(store.state.heroes).map(n => `<option value="${n}" ${c.representative === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>${[0, 1, 2].map(i => `<label>장식 ${i + 1}<select id="cxDecor${i}"><option value="">비움</option>${DECORATIONS.filter(d => available.includes(d.id)).map(d => `<option value="${d.id}" ${c.decorationSlots[i] === d.id ? 'selected' : ''}>${d.glyph} ${d.label}</option>`).join('')}</select></label>`).join('')}<div class="cx-actions">${button('꾸미기 저장', 'decorate')}</div><details><summary>장식 획득 방법</summary>${DECORATIONS.map(d => `<p>${d.glyph} ${d.label} · ${d.source} ${available.includes(d.id) ? '✓' : ''}</p>`).join('')}</details></div>`;
  document.querySelectorAll('#cxChallenges details, #cxJournal details').forEach((d, i) => { if (i < opened.length) d.open = opened[i]; });
  for (const [id, value] of drafts) { const el = document.getElementById(id); if (el && [...el.options].some(o => o.value === value)) el.value = value; }
  if (drafts.length && focused) document.getElementById(focused)?.focus({ preventScroll: true });
}
