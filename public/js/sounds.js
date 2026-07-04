(function () {
  function beep(freq, duration) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = freq;
      gain.gain.value = 0.05;
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      oscillator.stop(ctx.currentTime + duration);
    } catch (e) {
      // Web Audio unavailable or blocked by the browser — fail silently, sound is optional
    }
  }

  window.igowiaSounds = {
    playSend: () => beep(440, 0.1),
    playReceive: () => beep(660, 0.15),
  };
})();
