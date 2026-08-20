import { $ } from '../dom/dom.js';
import { track } from '../dom/analytics.js';
import { formatUnit } from '../domain/units.js';
import { rarityLabel, heroArtPath } from '../domain/heroCatalog.js';
import { flushPendingDefeat } from './adventureView.js';

const MEGA_HIGHLIGHT_MS = 2000;  // 레전더리 하이라이트 길이(legendary-mode CSS가 1.85초에 끝남)

/**
 * 소환 뽑기 → 레전더리 영상/파티클 연출 → 결과 화면까지 이어지는 시퀀스.
 * plan/index.html의 pull/revealNext/showResults/startParticles 로직을 그대로 이식했다.
 */
export function initCinematic({ store, audio, toast, onDone }) {
  const summonScene = $('#summonScene');
  const summonVideo = $('#summonVideo');
  const revealCard = $('#revealCard');
  const resultGrid = $('#resultGrid');
  const resultsOverlay = $('#resultsOverlay');
  const canvas = $('#fxCanvas');
  const ctx = canvas.getContext('2d');

  let currentResults = [];
  let revealIndex = 0;
  let timers = [];
  let particleFrame = null;
  let lastBannerType = 'pickup';

  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function later(fn, ms) { const id = setTimeout(fn, ms); timers.push(id); }

  function pull(count, bannerType = 'pickup') {
    if (store.busy) return;
    lastBannerType = bannerType;
    if (bannerType === 'bond') {
      if (!store.canAffordBondPull(count)) {
        toast.show(`별의 인연이 ${store.starBondPullCost(count) - store.state.starBond}개 부족해요.`);
        return;
      }
    } else if (!store.canAffordPull(count)) {
      toast.show(`보석이 ${formatUnit(store.pullCost(count) - store.state.gems)}개 부족해요.`);
      return;
    }
    store.busy = true;
    track('summon_start', { count, bannerType, balanceBefore: store.state.gems.toString() });
    if (bannerType === 'bond') currentResults = store.pullWithBond(count);
    else if (bannerType === 'normal') currentResults = store.pullNormal(count);
    else currentResults = store.pull(count);
    currentResults.forEach(r => track('summon_result', { rarity: r.rarity, unit: r.name, isNew: r.isNew }));
    onDone();
    store.saveGame();
    revealIndex = 0;
    resultsOverlay.classList.remove('open');
    if (count > 10) { startMegaPull(); return; } // 신규: 100연차 등 그룹 리빌 분기
    summonScene.className = 'summon-scene active';
    summonScene.setAttribute('aria-hidden', 'false');
    $('#revealCount').textContent = count > 1 ? `1 / ${count}` : '';
    revealNext();
  }

  function cardMarkup(result) {
    const art = `<img class="card-art" src="${heroArtPath(result.name)}" alt="">`;
    return `${art}<div class="card-shade"></div><div class="card-info"><div class="rarity">${rarityLabel(result.rarity)} · ${result.rarity.toUpperCase()}</div><h2>${result.name}</h2><p>${result.element} · ${result.role}${result.isNew ? ' · NEW' : ' · 기억의 별 +10'}</p></div>`;
  }

  function stopSummonVideo(reset) {
    summonVideo.pause();
    if (reset) {
      try { summonVideo.currentTime = 0; } catch (error) { /* 메타데이터가 아직 준비되지 않았을 수 있음 */ }
    }
  }

  function playSummonVideo() {
    stopSummonVideo(true);
    summonVideo.muted = !audio.enabled;
    const playback = summonVideo.play();
    if (playback) playback.catch(() => {
      summonVideo.muted = true;
      summonVideo.play().catch(() => {});
    });
  }

  function revealNext() {
    clearTimers();
    stopParticles();
    stopSummonVideo(true);
    const result = currentResults[revealIndex];
    if (!result) { showResults(); return; }
    $('#revealCount').textContent = currentResults.length > 1 ? `${revealIndex + 1} / ${currentResults.length}` : '';
    revealCard.className = `reveal-card ${result.rarity}`;
    revealCard.innerHTML = cardMarkup(result);
    summonScene.className = 'summon-scene active';
    void summonScene.offsetWidth;

    const isLegendary = result.rarity === 'legendary';
    if (isLegendary) {
      summonScene.classList.add('video-mode');
      playSummonVideo();
      later(() => {
        revealCard.classList.add('show');
        if (navigator.vibrate) navigator.vibrate([40, 40, 90]);
      }, 9100);
      later(advanceReveal, 12200);
    } else if (store.state.settings.autoSkipCinematic) {
      revealCard.classList.add('show');
      later(advanceReveal, 0); // 신규: 자동 건너뛰기 — 즉시 다음 카드로(레전더리는 위 분기로 예외)
    } else {
      if (audio.enabled) audio.playSoft(result.rarity);
      startParticles(false);
      later(() => revealCard.classList.add('show'), 330);
      later(advanceReveal, currentResults.length === 1 ? 1800 : 1050);
    }
  }

  function advanceReveal() {
    revealIndex += 1;
    if (revealIndex >= currentResults.length) showResults();
    else revealNext();
  }

  function skipCinematic() {
    if (!store.busy) return;
    track('cinematic_skip', {
      rarity: currentResults.length > 10 ? undefined : currentResults[revealIndex]?.rarity,
      count: currentResults.length
    });
    clearTimers();
    stopParticles();
    stopSummonVideo(true);
    showResults();
  }

  /** 100연차 등 10회 초과 뽑기 — 모바일에서 문제가 됐던 슬라이드 스트립 연출은 제거하고,
   * 레전더리가 있으면 그 카드만 순서대로 하이라이트한 뒤(항목4 요구사항 유지) 곧장 결과
   * 리스트로 넘어간다. 레전더리가 하나도 없으면 중간 화면 없이 즉시 결과로 이동한다. */
  function startMegaPull() {
    const legendaries = currentResults.map((r, i) => ({ r, i })).filter(x => x.r.rarity === 'legendary');
    if (legendaries.length === 0) { showResults(); return; }
    summonScene.className = 'summon-scene active';
    summonScene.setAttribute('aria-hidden', 'false');
    revealMegaLegendaries(legendaries, 0, showResults);
  }

  function revealMegaLegendaries(list, idx, done) {
    if (idx >= list.length) { done(); return; } // 자동 건너뛰기 설정과 무관 — 레전더리는 항상 재생
    const { r } = list[idx];
    revealCard.className = 'reveal-card legendary';
    revealCard.innerHTML = cardMarkup(r);
    summonScene.classList.add('legendary-mode'); // 죽어있던 CSS를 재사용(영상 없음)
    void summonScene.offsetWidth;
    startParticles(true);
    if (audio.enabled) audio.playSoft('legendary');
    if (navigator.vibrate) navigator.vibrate([40, 40, 90]);
    $('#revealCount').textContent = list.length > 1 ? `레전더리 ${idx + 1} / ${list.length}` : '';
    later(() => revealCard.classList.add('show'), 60);
    later(() => {
      revealCard.classList.remove('show');
      summonScene.classList.remove('legendary-mode');
      stopParticles();
      revealMegaLegendaries(list, idx + 1, done);
    }, MEGA_HIGHLIGHT_MS);
  }

  function rarityCountSummary(results) {
    const order = ['legendary', 'epic', 'rare', 'magic', 'common'];
    const counts = order.reduce((acc, r) => { acc[r] = 0; return acc; }, {});
    results.forEach(r => { counts[r.rarity] += 1; });
    return order.filter(r => counts[r] > 0).map(r => `<span class="summary-chip ${r}">${rarityLabel(r)} ×${counts[r]}</span>`).join('');
  }

  function showResults() {
    clearTimers();
    stopParticles();
    stopSummonVideo(true);
    summonScene.className = 'summon-scene';
    summonScene.setAttribute('aria-hidden', 'true');
    const count = currentResults.length;
    $('#resultSummary').innerHTML = count >= 10 ? rarityCountSummary(currentResults) : '';
    resultGrid.innerHTML = currentResults.map((item, index) => {
      const portrait = `<img src="${heroArtPath(item.name)}" alt="">`;
      return `<article class="result-item ${item.rarity}" style="animation-delay:${Math.min(index, 20) * 45}ms">
        ${item.isNew ? '<span class="new-badge">NEW</span>' : ''}
        <div class="result-portrait">${portrait}</div>
        <div class="result-copy"><small>${rarityLabel(item.rarity)} · ${item.rarity.toUpperCase()}</small><strong>${item.name}</strong><span>${item.isNew ? `${item.element} · ${item.role}` : '중복 · 기억의 별 +10'}</span></div>
      </article>`;
    }).join('');
    if (lastBannerType === 'bond') {
      $('#againBtn').textContent = count > 1 ? `다시 ${count}회 · 인연 ${(count * 300).toLocaleString('ko-KR')}` : '다시 1회 · 인연 300';
    } else {
      $('#againBtn').textContent = count > 1 ? `다시 ${count}회 · 💎 ${formatUnit(store.pullCost(count))}` : '다시 1회 · 💎 300';
    }
    resultsOverlay.classList.add('open');
    store.busy = false;
    onDone();
  }

  function randomItem(items) { return items[Math.floor(Math.random() * items.length)]; }

  function startParticles(legendary) {
    resizeCanvas();
    const count = legendary ? 76 : 34;
    const colors = legendary ? ['#fff1f2', '#ff4d5f', '#ff9b68', '#ffd96d', '#a779ff'] : ['#a779ff', '#4fa8ff', '#9499a8', '#ffffff'];
    const particles = Array.from({ length: count }, () => ({
      x: canvas.width / 2,
      y: canvas.height * 0.46,
      vx: (Math.random() - 0.5) * (legendary ? 10 : 5),
      vy: (Math.random() - 0.5) * (legendary ? 12 : 7),
      gravity: legendary ? 0.035 : 0.015,
      size: 1 + Math.random() * (legendary ? 4 : 2.5),
      life: 1,
      decay: 0.004 + Math.random() * 0.012,
      color: randomItem(colors),
      spin: Math.random() * Math.PI
    }));
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      particles.forEach(p => {
        if (p.life <= 0) return;
        alive = true;
        p.x += p.vx; p.y += p.vy; p.vy += p.gravity; p.vx *= 0.997; p.life -= p.decay; p.spin += 0.08;
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.spin);
        ctx.fillStyle = p.color;
        if (legendary && Math.random() > 0.62) {
          ctx.fillRect(-p.size * 3, -0.7, p.size * 6, 1.4);
          ctx.fillRect(-0.7, -p.size * 3, 1.4, p.size * 6);
        } else {
          ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      });
      if (alive) particleFrame = requestAnimationFrame(draw);
    };
    draw();
  }

  function stopParticles() {
    if (particleFrame) cancelAnimationFrame(particleFrame);
    particleFrame = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function resizeCanvas() {
    canvas.width = innerWidth;
    canvas.height = innerHeight;
    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;
  }

  window.addEventListener('resize', resizeCanvas);
  $('#skipBtn').addEventListener('click', skipCinematic);
  $('#confirmBtn').addEventListener('click', () => { resultsOverlay.classList.remove('open'); flushPendingDefeat(store); });
  $('#againBtn').addEventListener('click', () => {
    const count = currentResults.length;
    resultsOverlay.classList.remove('open');
    pull(count, lastBannerType);
  });

  return { pull };
}
