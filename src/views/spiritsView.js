import { $, $$ } from '../dom/dom.js';
import { initDexView, refreshDexView } from './dexView.js';
import { initPartyView, refreshPartyView } from './partyView.js';
import { initGrowthView, refreshGrowthView, openHeroDetail } from './growthView.js';

export function initSpiritsView({ store, toast, onChange }) {
  $$('#spiritsSegment .seg-btn').forEach(btn => btn.addEventListener('click', () => {
    $$('#spiritsSegment .seg-btn').forEach(b => b.classList.toggle('active', b === btn));
    $$('[data-page="spirits"] .segment-panel').forEach(panel => {
      panel.classList.toggle('active', panel.dataset.segmentPanel === btn.dataset.segment);
    });
  }));

  initDexView({ store, toast, onChange, openHeroDetail });
  initPartyView({ store, toast, onChange });
  initGrowthView({ store, toast, onChange });
}

export function refreshSpiritsView(store) {
  refreshDexView(store);
  refreshPartyView(store);
  refreshGrowthView(store);
}
