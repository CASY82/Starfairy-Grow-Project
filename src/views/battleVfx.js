import { heroVfxProfileOf } from '../domain/heroCatalog.js';

const PALETTES = {
  fire: ['#ff5a36', '#ffc247'], water: ['#38bdf8', '#b8f3ff'],
  forest: ['#5bd66f', '#d8f59a'], light: ['#ffe27a', '#fff8d6'],
  dark: ['#8b5cf6', '#29184f'], moonlight: ['#b9c8ff', '#f6efff']
};
const RARITY = {
  common: { particles: 6, layers: 1 }, magic: { particles: 9, layers: 1 },
  rare: { particles: 12, layers: 2 }, epic: { particles: 16, layers: 2 },
  legendary: { particles: 22, layers: 3 }
};
const QUALITY = new Set(['high', 'low', 'minimal']);
const cap = (value, min, max) => Math.max(min, Math.min(max, value));
const hash = value => [...value].reduce((n, char) => ((n * 31) + char.charCodeAt(0)) >>> 0, 2166136261);

class BattleVfx {
  constructor() {
    this.canvas = document.getElementById('battleVfxCanvas');
    this.tint = document.getElementById('battleVfxTint');
    this.scene = document.getElementById('battleScene');
    this.ctx = this.canvas?.getContext?.('2d') || null;
    this.effects = [];
    this.timers = new Set();
    this.frame = 0;
    this.quality = this.motionReduced() ? 'minimal' : 'high';
    this.frameSamples = [];
    this.lastFrame = 0;
    this.resizeObserver = null;
    if (!this.ctx || !this.scene) return;
    this.resize = this.resize.bind(this);
    this.drawFrame = this.drawFrame.bind(this);
    this.resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(this.resize) : null;
    this.resizeObserver?.observe(this.scene);
    window.addEventListener('resize', this.resize, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stop();
      else if (this.effects.length) this.start();
    });
    this.resize();
  }

  motionReduced() {
    return document.body.classList.contains('reduce-motion') ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }

  setQuality(value) {
    if (!QUALITY.has(value)) return false;
    this.quality = this.motionReduced() ? 'minimal' : value;
    this.resize();
    return true;
  }

  effectiveQuality() { return this.motionReduced() ? 'minimal' : this.quality; }

  resize() {
    if (!this.ctx || !this.scene) return;
    const rect = this.scene.getBoundingClientRect();
    const dpr = this.effectiveQuality() === 'high' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.width = rect.width;
    this.height = rect.height;
    this.dpr = dpr;
  }

  points(attackerElement, targetElement) {
    const scene = this.scene.getBoundingClientRect();
    const attacker = attackerElement?.getBoundingClientRect?.();
    const target = targetElement?.getBoundingClientRect?.();
    return {
      from: attacker ? { x: attacker.left - scene.left + attacker.width / 2, y: attacker.top - scene.top + attacker.height / 2 } : { x: scene.width * .25, y: scene.height * .68 },
      to: target ? { x: target.left - scene.left + target.width * .55, y: target.top - scene.top + target.height * .48 } : { x: scene.width * .78, y: scene.height * .58 }
    };
  }

  playBasicAttack({ heroName, attackerElement, targetElement, critical = false, speed = 1 }) {
    const profile = heroVfxProfileOf(heroName);
    if (!this.ctx || !profile) return false;
    const points = this.points(attackerElement, targetElement);
    const minimal = this.effectiveQuality() === 'minimal';
    this.add({ type: 'basic', profile, ...points, critical, duration: minimal ? 180 : speed === 2 ? 240 : 360 });
    window.dispatchEvent(new CustomEvent('battle-vfx-play', { detail: { type: 'basic', heroName, preset: profile.basicPreset } }));
    return true;
  }

  playUltimate({ heroName, attackerElement, targetElement, speed = 1, queueIndex = 0 }) {
    const profile = heroVfxProfileOf(heroName);
    if (!this.ctx || !profile) return false;
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      const points = this.points(attackerElement, targetElement);
      this.add({ type: 'ultimate', profile, ...points, compact: queueIndex >= 3,
        duration: this.effectiveQuality() === 'minimal' ? 300 : speed === 2 ? 620 : 900 });
      window.dispatchEvent(new CustomEvent('battle-vfx-play', { detail: { type: 'ultimate', heroName, preset: profile.ultimatePreset } }));
    }, queueIndex * 120);
    this.timers.add(timer);
    return true;
  }

  add(effect) {
    const now = performance.now();
    if (this.effects.length >= 8) this.effects.shift();
    effect.started = now;
    effect.seed = hash(`${effect.profile.hero}:${effect.profile.basicPreset}:${effect.profile.ultimatePreset}`);
    this.effects.push(effect);
    if (effect.type === 'ultimate') this.flashTint(effect.profile.element);
    this.start();
  }

  flashTint(element) {
    if (!this.tint) return;
    this.tint.style.setProperty('--vfx-tint', PALETTES[element][0]);
    this.tint.classList.remove('show');
    void this.tint.offsetWidth;
    this.tint.classList.add('show');
    const timer = setTimeout(() => { this.tint.classList.remove('show'); this.timers.delete(timer); }, this.effectiveQuality() === 'minimal' ? 120 : 420);
    this.timers.add(timer);
  }

  start() {
    if (this.frame || document.hidden || this.scene?.offsetParent === null || !this.effects.length) return;
    this.lastFrame = performance.now();
    this.frame = requestAnimationFrame(this.drawFrame);
  }

  stop() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  clear() {
    this.stop();
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    this.effects.length = 0;
    this.tint?.classList.remove('show');
    this.ctx?.clearRect(0, 0, this.width || 0, this.height || 0);
  }

  drawFrame(now) {
    this.frame = 0;
    if (document.hidden || this.scene.offsetParent === null) { this.stop(); return; }
    const delta = now - this.lastFrame;
    this.lastFrame = now;
    if (delta < 200) {
      this.frameSamples.push(delta);
      if (this.frameSamples.length > 30) this.frameSamples.shift();
      if (this.quality === 'high' && this.frameSamples.length === 30 && this.frameSamples.reduce((a, b) => a + b, 0) / 30 > 41.7) this.setQuality('low');
    }
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.effects = this.effects.filter(effect => {
      const progress = cap((now - effect.started) / effect.duration, 0, 1);
      this.drawEffect(effect, progress);
      return progress < 1;
    });
    if (this.effects.length) this.frame = requestAnimationFrame(this.drawFrame);
  }

  drawEffect(effect, t) {
    const ctx = this.ctx;
    const [primary, secondary] = PALETTES[effect.profile.element];
    const minimal = this.effectiveQuality() === 'minimal';
    const ultimate = effect.type === 'ultimate';
    const travelEnd = minimal ? 0 : ultimate ? .54 : .52;
    const travel = travelEnd ? cap(t / travelEnd, 0, 1) : 1;
    const eased = 1 - ((1 - travel) ** 3);
    const bend = ['mage', 'support'].includes(effect.profile.role) ? Math.sin(travel * Math.PI) * (effect.profile.role === 'mage' ? -28 : 20) : 0;
    const x = effect.from.x + (effect.to.x - effect.from.x) * eased;
    const y = effect.from.y + (effect.to.y - effect.from.y) * eased + bend;
    const fade = 1 - cap((t - .62) / .38, 0, 1);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = fade;
    ctx.lineCap = 'round';
    if (!minimal && travel < 1 && !effect.compact) this.drawProjectile(effect, x, y, primary, secondary, ultimate);
    if (minimal || travel >= .78) this.drawGlyph(effect.profile.glyph, effect.to.x, effect.to.y, (ultimate ? 42 : 17) * (1 + t * .45), primary, secondary, t, ultimate);
    if (travel >= 1 || minimal) this.drawImpact(effect, t, primary, secondary);
    ctx.restore();
  }

  drawProjectile(effect, x, y, primary, secondary, ultimate) {
    const ctx = this.ctx;
    const role = effect.profile.role;
    const size = ultimate ? 10 : 6;
    ctx.fillStyle = primary;
    if (this.effectiveQuality() === 'high' && ultimate) { ctx.shadowColor = primary; ctx.shadowBlur = 8; }
    if (role === 'ranger') {
      ctx.beginPath();
      ctx.moveTo(x + size * 1.4, y);
      ctx.lineTo(x - size, y - size * .65);
      ctx.lineTo(x - size, y + size * .65);
      ctx.closePath(); ctx.fill();
    } else if (role === 'warrior') {
      ctx.beginPath(); ctx.ellipse(x, y, size * 1.5, size * .65, -.35, 0, Math.PI * 2); ctx.fill();
    } else if (role === 'guardian') {
      ctx.fillStyle = secondary; ctx.fillRect(x - size * .6, y - size, size * 1.2, size * 2);
    } else {
      ctx.beginPath(); ctx.arc(x, y, role === 'support' ? size * .8 : size, 0, Math.PI * 2); ctx.fill();
    }
  }

  drawGlyph(glyph, x, y, radius, primary, secondary, t, ultimate) {
    const ctx = this.ctx;
    const sides = glyph.includes('clover') ? 4 : glyph.includes('star') ? 8 : glyph.includes('triangle') ? 3 : glyph.includes('diamond') ? 4 : glyph.includes('shield') ? 6 : 0;
    ctx.save(); ctx.translate(x, y); ctx.rotate((hash(glyph) % 7 - 3) * .08 + (ultimate ? t * .45 : 0));
    ctx.strokeStyle = primary; ctx.fillStyle = `${secondary}33`; ctx.lineWidth = ultimate ? 4 : 2;
    ctx.beginPath();
    if (glyph.includes('crescent')) {
      ctx.arc(0, 0, radius, -.7 * Math.PI, .7 * Math.PI); ctx.arc(radius * .38, 0, radius * .72, .7 * Math.PI, -.7 * Math.PI, true);
    } else if (glyph.includes('bubble') || glyph.includes('ring') || glyph.includes('drop')) {
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
    } else if (glyph.includes('tree') || glyph.includes('leaf') || glyph.includes('moss')) {
      ctx.ellipse(0, -radius * .2, radius * .72, radius, Math.PI / 4, 0, Math.PI * 2); ctx.moveTo(0, 0); ctx.lineTo(0, radius);
    } else if (sides) {
      for (let i = 0; i <= sides; i += 1) { const a = i * Math.PI * 2 / sides - Math.PI / 2; const r = i % 2 && sides === 8 ? radius * .42 : radius; i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    } else {
      ctx.moveTo(-radius, radius); ctx.lineTo(radius, -radius); ctx.moveTo(-radius * .7, -radius); ctx.lineTo(radius * .7, radius);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }

  drawImpact(effect, t, primary, secondary) {
    const ctx = this.ctx;
    const ultimate = effect.type === 'ultimate';
    const local = cap((t - (this.effectiveQuality() === 'minimal' ? 0 : .48)) / .52, 0, 1);
    const rarity = RARITY[effect.profile.rarity] || RARITY.common;
    const bossScale = document.getElementById('enemySprite')?.classList.contains('boss') ? 1.1 : 1;
    const radius = (ultimate ? 63 : 28) * bossScale * (.3 + local);
    ctx.strokeStyle = secondary; ctx.lineWidth = ultimate ? 5 : effect.critical ? 4 : 2;
    ctx.globalAlpha *= 1 - local;
    for (let layer = 0; layer < (effect.compact ? 1 : rarity.layers); layer += 1) {
      ctx.beginPath(); ctx.arc(effect.to.x, effect.to.y, radius * (1 - layer * .24), 0, Math.PI * 2); ctx.stroke();
    }
    const qualityFactor = this.effectiveQuality() === 'high' ? 1 : .5;
    const count = Math.min(ultimate ? Math.floor(rarity.particles * qualityFactor) : Math.min(12, Math.floor(rarity.particles * qualityFactor)), this.effectiveQuality() === 'high' ? 22 : 11);
    ctx.fillStyle = primary;
    for (let i = 0; i < count; i += 1) {
      const a = ((effect.seed + i * 137) % 360) * Math.PI / 180;
      const distance = radius * (.4 + ((effect.seed + i * 17) % 60) / 100);
      ctx.beginPath(); ctx.arc(effect.to.x + Math.cos(a) * distance, effect.to.y + Math.sin(a) * distance, ultimate ? 2.4 : 1.7, 0, Math.PI * 2); ctx.fill();
    }
  }
}

export const battleVfx = new BattleVfx();
