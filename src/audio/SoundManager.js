// Web Audio 오실레이터 합성음을 캡슐화한 클래스.
// plan/index.html의 audioContext/tone/playSoftSound/playLegendarySound(1360~1390행) 이식.
// Phaser Scene이 기본으로 갖는 `this.sound`(SoundManager 플러그인)와 이름이 겹치지 않도록
// 씬에서는 이 클래스의 인스턴스를 `this.audio`처럼 별도 이름으로 보관해서 쓴다.
export default class SoundManager {
  #enabled = true;

  get enabled() { return this.#enabled; }
  setEnabled(value) { this.#enabled = value; }

  #context() {
    if (!this.#enabled) return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    return new AC();
  }

  #tone(context, frequency, start, duration, volume = 0.06, type = 'sine') {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, context.currentTime + start);
    gain.gain.setValueAtTime(0, context.currentTime + start);
    gain.gain.linearRampToValueAtTime(volume, context.currentTime + start + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + start + duration);
    osc.connect(gain).connect(context.destination);
    osc.start(context.currentTime + start);
    osc.stop(context.currentTime + start + duration);
  }

  playSoft(rarity) {
    const ac = this.#context();
    if (!ac) return;
    this.#tone(ac, rarity === 'epic' ? 523 : 392, 0, 0.45, 0.035);
    this.#tone(ac, rarity === 'epic' ? 659 : 494, 0.12, 0.5, 0.025);
    setTimeout(() => ac.close(), 900);
  }

  playLegendary() {
    const ac = this.#context();
    if (!ac) return;
    [261.6, 329.6, 392, 523.3, 659.3, 784].forEach((f, i) => this.#tone(ac, f, i * 0.11, 1.2, 0.045, i < 3 ? 'sine' : 'triangle'));
    this.#tone(ac, 1046.5, 0.9, 1.4, 0.035, 'sine');
    setTimeout(() => ac.close(), 2700);
  }
}
