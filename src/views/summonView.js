import { $, $$ } from '../dom/dom.js';

export function initSummonView({ store, toast, onPull }) {
  $$('.banner-tab').forEach(btn => btn.addEventListener('click', () => {
    if (btn.id === 'normalBanner') {
      $$('.banner-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      toast.show('일반 소환 배너로 전환했습니다 · 픽업 보장 없이 4명 중 균등 확률');
    } else {
      $$('.banner-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }
  }));

  $$('.summon-btn').forEach(btn => btn.addEventListener('click', () => {
    const bannerType = document.getElementById('normalBanner').classList.contains('active') ? 'normal' : 'pickup';
    onPull(Number(btn.dataset.pull), bannerType);
  }));

  $$('[data-bond-pull]').forEach(btn => btn.addEventListener('click', () => {
    const count = Number(btn.dataset.bondPull);
    if (!store.canAffordBondPull(count)) {
      toast.show(`별의 인연이 ${store.starBondPullCost(count) - store.state.starBond}개 부족해요.`);
      return;
    }
    onPull(count, 'bond');
  }));
}

function activeBannerType() {
  return document.getElementById('normalBanner')?.classList.contains('active') ? 'normal' : 'pickup';
}

export function refreshSummonView(store) {
  const s = store.state;
  $('#pityCount').textContent = s.pity;
  $('#pityLeft').textContent = Math.max(0, 80 - s.pity);
  $('#pityFill').style.width = `${Math.min(100, (s.pity / 80) * 100)}%`;
  $('#starBondCount').textContent = `보유 인연 ${s.starBond}`;
  const infoText = $('#pickupInfoText');
  if (activeBannerType() === 'normal') {
    infoText.textContent = '일반 소환 · 픽업 보장 없이 레전더리 4명 중 균등 확률';
  } else if (s.pickupGuaranteed) {
    infoText.innerHTML = '<strong style="color:var(--gold)">다음 LEGENDARY는 픽업 확정!</strong>';
  } else {
    infoText.textContent = '픽업 획득 확률 50% · 빗나갈 시 다음 확정';
  }
  $$('.summon-btn[data-pull]').forEach(btn => {
    const count = Number(btn.dataset.pull);
    const affordable = store.canAffordPull(count);
    btn.disabled = !affordable;
    btn.classList.toggle('disabled', !affordable);
  });
  $$('[data-bond-pull]').forEach(btn => {
    const count = Number(btn.dataset.bondPull);
    const affordable = store.canAffordBondPull(count);
    btn.disabled = !affordable;
    btn.classList.toggle('disabled', !affordable);
  });
}
