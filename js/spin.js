/* ==========================================================================
   VÒNG QUAY MÓN NGON
   Chọn ngẫu nhiên 1 món trong TOÀN BỘ công thức hợp lệ. 6 ô trên vòng quay
   chỉ mang tính minh hoạ: món trúng được chọn trước, rồi mới đặt vào một ô.
   File này phải được nạp trước app.js (chỉ khai báo hàm, dùng chung State).
   ========================================================================== */

const SPIN_SLOTS = 6;
const SPIN_TURNS = 6;
const SPIN_DURATION_MS = 4500;

const Spin = {
  spinning: false,
  rotation: 0,
  slots: [],      // id các món đang hiển thị trên vòng quay
  lastWinnerKey: '',
  timer: null
};

/* ---------------------------- LOGIC CHỌN MÓN ---------------------------- */

// Khoá so trùng: bỏ hậu tố "(bản sao)", gộp khoảng trắng, không phân biệt hoa/thường.
// Vẫn phân biệt dấu tiếng Việt ("Bò" khác "Bơ").
function spinDishKey(name) {
  return String(name || '')
    .normalize('NFC')
    .toLocaleLowerCase('vi')
    .replace(/(\s*\(bản sao\))+\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Món hợp lệ: có tên và không phải bản nháp. Mỗi tên món chỉ giữ 1 bản ghi.
// Khi trùng, ưu tiên bản gốc (không phải "bản sao"), sau đó là bản cập nhật gần nhất.
function spinEligibleRecipes(recipes) {
  const isCopy = r => /\(bản sao\)\s*$/i.test(String(r.name).normalize('NFC').trim());
  const updated = r => r.updatedAt?.seconds || 0;
  const byKey = new Map();
  recipes.forEach(r => {
    if (r.status === 'draft') return;
    const key = spinDishKey(r.name);
    if (!key) return;
    const kept = byKey.get(key);
    const better = !kept || (isCopy(kept) && !isCopy(r)) || (isCopy(kept) === isCopy(r) && updated(r) > updated(kept));
    if (better) byKey.set(key, r);
  });
  return [...byKey.values()];
}

// Số nguyên ngẫu nhiên trong [0, n), mọi giá trị có xác suất bằng nhau
function spinRandomInt(n) {
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
  return buf[0] % n;
}

function spinShuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = spinRandomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Tạo 6 ô minh hoạ. Nếu truyền món trúng, món đó nằm ở ô winnerSlot.
function spinBuildSlots(pool, winner, winnerSlot) {
  if (!pool.length) return [];
  const others = spinShuffle(winner ? pool.filter(r => r.id !== winner.id) : pool);
  const source = others.length ? others : pool;
  const slots = Array.from({ length: SPIN_SLOTS }, (_, i) => source[i % source.length].id);
  if (winner) slots[winnerSlot] = winner.id;
  return slots;
}

/* ---------------------------- GIAO DIỆN ---------------------------- */

function spinBannerHtml() {
  return `
  <button class="spin-banner" data-action="go" data-id="spin">
    <span class="spin-banner-icon">🎁</span>
    <span class="spin-banner-text"><b>Vòng quay món ngon</b><small>Chưa biết nấu gì? Quay để chọn món!</small></span>
    <span class="spin-banner-arrow">→</span>
  </button>`;
}

function renderSpin() {
  // Dữ liệu realtime đổi trong lúc đang quay thì không vẽ lại, tránh giật hiệu ứng
  if (Spin.spinning && byId('spinWheel')) return;
  renderHeaderDefault();

  if (!byId('spinWheel')) {
    const lights = Array.from({ length: 18 }, (_, i) => `<i style="--a:${i * 20}deg; animation-delay:${(i % 2) * 0.6}s"></i>`).join('');
    byId('mainContent').innerHTML = `
      <div class="spin-page">
        <div class="spin-gift">🎁</div>
        <h1 class="spin-title">Vòng quay <span>món ngon</span></h1>
        <p class="spin-desc">Quay ngay để khám phá món ăn ngẫu nhiên<br>từ bộ sưu tập công thức hấp dẫn!</p>
        <div class="spin-stage">
          <div class="spin-pointer"></div>
          <div class="spin-rim">
            ${lights}
            <div class="spin-wheel" id="spinWheel"></div>
            <div class="spin-hub">👨‍🍳</div>
          </div>
        </div>
        <button class="spin-btn" id="spinBtn" data-action="spin-start"></button>
        <p class="spin-note" id="spinNote" aria-live="polite"></p>
        <div class="spin-chef-card">
          <img src="img/IMG_3634-Photoroom.png" alt="Đầu bếp">
          <p>Hãy quay để khám phá món ăn bất ngờ nhé! 💗</p>
        </div>
      </div>`;
  }

  const pool = spinEligibleRecipes(State.recipes);
  // Giữ nguyên 6 ô đang hiển thị nếu chúng vẫn hợp lệ
  const ids = new Set(pool.map(r => r.id));
  const stale = Spin.slots.length !== (pool.length ? SPIN_SLOTS : 0)
    || Spin.slots.some(id => !ids.has(id))
    || new Set(Spin.slots).size < Math.min(pool.length, SPIN_SLOTS);
  if (stale) Spin.slots = spinBuildSlots(pool);
  spinDrawWheel();
  spinUpdateControls(pool.length);
}

function spinDrawWheel() {
  const wheel = byId('spinWheel');
  wheel.style.transition = 'none';
  wheel.style.transform = `rotate(${Spin.rotation}deg)`;
  wheel.innerHTML = Spin.slots.map((id, i) => {
    const r = recipeById(id);
    const angle = i * (360 / SPIN_SLOTS);
    // Nội dung xoay ngược lại để ảnh và tên món luôn đứng thẳng
    return `
    <div class="spin-slot" style="transform: rotate(${angle}deg)">
      <div class="spin-item" style="transform: rotate(${-(angle + Spin.rotation)}deg)" data-angle="${angle}">
        <img src="${esc(resolveImageSrc(r))}" alt="">
        <span>${esc(r.name)}</span>
      </div>
    </div>`;
  }).join('');
}

function spinUpdateControls(total) {
  const btn = byId('spinBtn');
  btn.disabled = Spin.spinning || !total;
  btn.textContent = Spin.spinning ? '⏳ Đang quay...' : '▶ Quay ngay';
  byId('spinNote').textContent = total
    ? `🔄 Mỗi lần quay chọn ngẫu nhiên 1 trong ${total} món`
    : 'Chưa có món hợp lệ. Hãy lưu ít nhất 1 công thức (không phải bản nháp).';
}

/* ---------------------------- QUAY ---------------------------- */

function startSpin() {
  if (Spin.spinning || !byId('spinWheel')) return;
  const pool = spinEligibleRecipes(State.recipes);
  if (!pool.length) return;

  // 1) Chọn món trúng từ TOÀN BỘ danh sách hợp lệ
  const winner = pool[spinRandomInt(pool.length)];
  // 2) Đặt món trúng vào 1 ô bất kỳ của vòng quay
  const winnerSlot = spinRandomInt(SPIN_SLOTS);
  Spin.slots = spinBuildSlots(pool, winner, winnerSlot);
  spinDrawWheel();

  Spin.spinning = true;
  spinUpdateControls(pool.length);

  // 3) Quay thêm vài vòng rồi dừng sao cho ô trúng nằm ngay dưới kim
  const slotAngle = 360 / SPIN_SLOTS;
  const target = (360 - winnerSlot * slotAngle) % 360;
  const jitter = spinRandomInt(25) - 12; // lệch nhẹ trong phạm vi ô cho tự nhiên
  const base = Math.round(Spin.rotation / 360) * 360;
  let next = base + SPIN_TURNS * 360 + target + jitter;
  if (next - Spin.rotation < SPIN_TURNS * 360 - 180) next += 360;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const duration = reduced ? 300 : SPIN_DURATION_MS;
  const easing = `transform ${duration}ms cubic-bezier(.12,.68,.12,1)`;
  const wheel = byId('spinWheel');
  void wheel.offsetWidth; // buộc trình duyệt ghi nhận vị trí bắt đầu
  wheel.style.transition = easing;
  wheel.style.transform = `rotate(${next}deg)`;
  qsa('.spin-item', wheel).forEach(el => {
    el.style.transition = easing;
    el.style.transform = `rotate(${-(Number(el.dataset.angle) + next)}deg)`;
  });
  Spin.rotation = next;

  // 4) Dừng xong thì công bố kết quả
  Spin.timer = setTimeout(() => finishSpin(winner.id), duration + 250);
}

function finishSpin(winnerId) {
  Spin.spinning = false;
  Spin.timer = null;
  const winner = recipeById(winnerId);
  const total = spinEligibleRecipes(State.recipes).length;
  if (!winner) { toast('Món vừa chọn đã bị xoá, hãy quay lại nhé'); renderSpin(); return; }
  spinUpdateControls(total);
  openModal(`
    <div class="spin-result">
      <div class="spin-ribbon">🎉 Chúc mừng bạn!</div>
      <img class="spin-result-img" src="${esc(resolveImageSrc(winner))}" alt="${esc(winner.name)}">
      <h3>${esc(winner.name)}</h3>
      <span class="spin-badge">✅ Món được chọn ngẫu nhiên</span>
      ${winner.description ? `<p>${esc(winner.description)}</p>` : ''}
      <div class="spin-info">
        <div>🍴<span>Nguồn chọn</span><b>Toàn bộ món hợp lệ</b></div>
        <div>⭐<span>Số món trong kho</span><b>${total} món</b></div>
      </div>
      <button class="btn-primary full" data-action="spin-view" data-id="${esc(winnerId)}">📖 Xem công thức</button>
      <button class="btn-outline full" data-action="close-modal">🔄 Quay lại</button>
    </div>
  `);
}

function viewSpinResult(id) {
  closeModal();
  location.hash = '#/recipe/' + id;
}

// Rời trang (kể cả nút Back) thì huỷ lượt quay và đóng bảng kết quả
window.addEventListener('hashchange', () => {
  if (location.hash === '#/spin') return;
  clearTimeout(Spin.timer);
  Spin.timer = null;
  Spin.spinning = false;
  if (qs('.spin-result')) closeModal();
});
