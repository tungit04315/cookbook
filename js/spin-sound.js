/* ==========================================================================
   ÂM THANH VÒNG QUAY
   Tạo trực tiếp bằng Web Audio API (không cần file âm thanh).
   ========================================================================== */

const SpinSound = (() => {
  const STORAGE_KEY = 'spinSoundMuted';
  let ctx = null;
  let master = null;
  let frame = null;
  let muted = false;
  try { muted = localStorage.getItem(STORAGE_KEY) === '1'; } catch (e) { /* bỏ qua */ }

  // Phải gọi trong sự kiện bấm nút thì trình duyệt (nhất là trên điện thoại) mới cho phát tiếng
  function unlock() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return false;
    try {
      if (!ctx) ctx = new AudioCtx();
      if (ctx.state !== 'running') ctx.resume().catch(() => { });
      if (!master) {
        master = ctx.createGain();
        master.gain.value = 0.35;
        master.connect(ctx.destination);
      }
      return true;
    } catch (e) { return false; }
  }

  // Một nốt, có thể trượt cao độ (from -> to) và rung giọng (wobble) cho hài hước
  function tone({ from, to = from, at = 0, dur = 0.15, type = 'sine', vol = 0.5, wobble = 0 }) {
    if (muted || !master) return;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    if (wobble) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = 18;
      depth.gain.value = wobble;
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + dur);
    }
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // Lúc bắt đầu: "boing" rồi còi trượt vút lên
  function start() {
    tone({ from: 150, to: 420, dur: 0.35, type: 'triangle', vol: 0.7, wobble: 60 });
    tone({ from: 350, to: 1500, at: 0.18, dur: 0.45, vol: 0.35 });
  }

  // Mỗi lần kim lướt qua một ô: tiếng "póc", cao độ đổi luân phiên như đang nhảy nhót
  const POPS = [520, 660, 590, 780, 620, 880];
  let popIndex = 0;
  function tick() {
    const f = POPS[popIndex++ % POPS.length];
    tone({ from: f * 1.6, to: f, dur: 0.07, type: 'square', vol: 0.22 });
  }

  // Theo dõi góc thật của vòng quay để tiếng tích tắc chậm dần cùng hiệu ứng
  function follow(wheel, slotAngle) {
    cancelAnimationFrame(frame);
    let lastSlot = null;
    let lastTick = 0;
    const step = now => {
      if (!wheel.isConnected) return;
      const m = getComputedStyle(wheel).transform.match(/matrix\(([^,]+),\s*([^,]+)/);
      if (m) {
        const angle = (Math.atan2(Number(m[2]), Number(m[1])) * 180 / Math.PI + 360) % 360;
        const slot = Math.floor(((angle + slotAngle / 2) % 360) / slotAngle);
        if (lastSlot !== null && slot !== lastSlot && now - lastTick > 45) { tick(); lastTick = now; }
        lastSlot = slot;
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  }

  // Trúng thưởng: kèn "ta-da" vui tai, kết bằng tiếng "boing" tinh nghịch
  function win() {
    cancelAnimationFrame(frame);
    [523, 659, 784].forEach((f, i) => tone({ from: f, at: i * 0.11, dur: 0.14, type: 'triangle', vol: 0.6 }));
    [1047, 1319, 1568].forEach(f => tone({ from: f, at: 0.36, dur: 0.55, type: 'triangle', vol: 0.3 }));
    tone({ from: 700, to: 180, at: 0.95, dur: 0.22, type: 'sawtooth', vol: 0.2 });
    tone({ from: 200, to: 640, at: 1.17, dur: 0.4, type: 'triangle', vol: 0.5, wobble: 80 });
  }

  // Ngắt mọi âm đang phát hoặc đã hẹn giờ
  function stop() {
    cancelAnimationFrame(frame);
    if (master) { master.disconnect(); master = null; }
  }

  function toggleMute() {
    muted = !muted;
    try { localStorage.setItem(STORAGE_KEY, muted ? '1' : '0'); } catch (e) { /* bỏ qua */ }
    if (muted) { if (master) master.gain.value = 0; }
    else if (unlock()) { master.gain.value = 0.35; tick(); }
    return muted;
  }

  return { unlock, start, follow, win, stop, toggleMute, isMuted: () => muted };
})();
