// Synthesizes a clear examination security alert alarm using Web Audio API
// Unlocked during the student's "START EXAM" click gesture to comply with browser autoplay rules

class ExamAlarmEngine {
  private ctx: AudioContext | null = null;
  private unlocked = false;

  unlock() {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return false;
      if (!this.ctx) {
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      // Play silent 1ms pulse to unlock iOS/Chrome autoplay policy
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.01);
      this.unlocked = true;
      return true;
    } catch {
      return false;
    }
  }

  isUnlocked() {
    return this.unlocked;
  }

  playWarningAlarm(critical = false) {
    try {
      if (!this.ctx) {
        this.unlock();
      }
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }

      const now = this.ctx.currentTime;
      const beeps = critical ? 4 : 2;
      for (let i = 0; i < beeps; i++) {
        const start = now + i * 0.24;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = critical ? 'sawtooth' : 'triangle';
        osc.frequency.setValueAtTime(critical ? 880 : 660, start);
        osc.frequency.setValueAtTime(critical ? 660 : 520, start + 0.1);

        gain.gain.setValueAtTime(0.001, start);
        gain.gain.exponentialRampToValueAtTime(0.22, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.2);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(start);
        osc.stop(start + 0.21);
      }
    } catch {
      // Ignore audio errors when device is muted or blocked
    }
  }
}

export const examAlarm = new ExamAlarmEngine();
