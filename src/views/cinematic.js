import { $ } from '../dom/dom.js';
import { track } from '../dom/analytics.js';
import { formatUnit } from '../domain/units.js';
import { rarityLabel, heroArtPath } from '../domain/heroCatalog.js';

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
    track('cinematic_skip', { rarity: currentResults[revealIndex]?.rarity });
    clearTimers();
    stopParticles();
    stopSummonVideo(true);
    showResults();
  }

  function showResults() {
    clearTimers();
    stopParticles();
    stopSummonVideo(true);
    summonScene.className = 'summon-scene';
    summonScene.setAttribute('aria-hidden', 'true');
    resultGrid.innerHTML = currentResults.map((item, index) => {
      const portrait = `<img src="${heroArtPath(item.name)}" alt="">`;
      return `<article class="result-item ${item.rarity}" style="animation-delay:${index * 45}ms">
        ${item.isNew ? '<span class="new-badge">NEW</span>' : ''}
        <div class="result-portrait">${portrait}</div>
        <div class="result-copy"><small>${rarityLabel(item.rarity)} · ${item.rarity.toUpperCase()}</small><strong>${item.name}</strong><span>${item.isNew ? `${item.element} · ${item.role}` : '중복 · 기억의 별 +10'}</span></div>
      </article>`;
    }).join('');
    const isTen = currentResults.length === 10;
    if (lastBannerType === 'bond') $('#againBtn').textContent = isTen ? '다시 10회 · 인연 3,000' : '다시 1회 · 인연 300';
    else $('#againBtn').textContent = isTen ? '다시 10회 · 💎 3a' : '다시 1회 · 💎 300';
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
  $('#confirmBtn').addEventListener('click', () => resultsOverlay.classList.remove('open'));
  $('#againBtn').addEventListener('click', () => {
    const count = currentResults.length;
    resultsOverlay.classList.remove('open');
    pull(count, lastBannerType);
  });

  return { pull };
}
