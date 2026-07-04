/* ==========================================================================
   YUMMY RECIPES - app.js
   Vanilla JS SPA + Firebase (Firestore, Storage) - KHÔNG dùng Authentication
   ========================================================================== */

/* ---------------------------- STATE ---------------------------- */
const State = {
  recipes: [],
  categories: [],
  logs: [],
  settings: { appName: 'Yummy Recipes', logoEmoji: '👩‍🍳', theme: 'light' },
  filters: { query: '', categoryId: '', difficulty: '', favoriteOnly: false, sort: 'newest', maxTime: '' },
  images: {},
  checkedIngredients: new Set(),
  formImageDataUrl: null,
  formImagePreview: null,
  formImageChanged: false,
  unsubscribers: []
};

const DIFFICULTY_LABEL = { easy: 'Dễ', medium: 'Trung bình', hard: 'Khó' };
const CAT_ICON_CLASS = ['v1', 'v2', 'v3'];
const SAMPLE_IMAGES = {
  pasta: 'https://images.unsplash.com/photo-1621996346565-e3dbc353d2e5?w=500&q=80',
  flan: 'https://images.unsplash.com/photo-1470324161839-ce2bb6fa6bc3?w=500&q=80',
  thitkho: 'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=500&q=80',
  pho: 'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?w=500&q=80',
  salad: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=500&q=80'
};

/* ---------------------------- HELPERS ---------------------------- */
const qs = (s, ctx = document) => ctx.querySelector(s);
const qsa = (s, ctx = document) => Array.from(ctx.querySelectorAll(s));
const byId = id => document.getElementById(id);
const esc = str => (str || '').toString().replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

function toast(msg) {
  const t = byId('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 2400);
}
function showLoading() { byId('loadingOverlay').classList.remove('hidden'); }
function hideLoading() { byId('loadingOverlay').classList.add('hidden'); }
function openModal(html) {
  byId('modalBox').innerHTML = html;
  byId('modalOverlay').classList.remove('hidden');
}
function closeModal() { byId('modalOverlay').classList.add('hidden'); byId('modalBox').innerHTML = ''; }
byId('modalOverlay').addEventListener('click', e => { if (e.target.id === 'modalOverlay') closeModal(); });

function resolveImageSrc(r) {
  if (r.imageId && State.images[r.imageId]) return State.images[r.imageId];
  if (r.imageUrl) return r.imageUrl;
  return SAMPLE_IMAGES.pasta;
}

/* --------- Nén ảnh phía client trước khi lưu vào Firestore (bảng recipe_images) --------- */
function compressImageFile(file, maxDim = 900, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không đọc được file ảnh'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('File không phải ảnh hợp lệ'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) { height = Math.round(height * (maxDim / width)); width = maxDim; }
          else { width = Math.round(width * (maxDim / height)); height = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        let q = quality;
        let dataUrl = canvas.toDataURL('image/jpeg', q);
        // Firestore giới hạn 1 document ~1MB -> giảm chất lượng dần nếu ảnh còn quá nặng
        while (dataUrl.length > 700000 && q > 0.3) {
          q -= 0.12;
          dataUrl = canvas.toDataURL('image/jpeg', q);
        }
        if (dataUrl.length > 900000) { reject(new Error('Ảnh vẫn quá nặng sau khi nén, vui lòng chọn ảnh khác nhỏ hơn.')); return; }
        resolve(dataUrl);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}


function categoryById(id) { return State.categories.find(c => c.id === id); }
function recipeById(id) { return State.recipes.find(r => r.id === id); }
function timeAgoOk(recipe) {
  if (!recipe.createdAt) return false;
  const d = recipe.createdAt.toDate ? recipe.createdAt.toDate() : new Date(recipe.createdAt);
  return (Date.now() - d.getTime()) < 1000 * 60 * 60 * 24 * 14; // 14 ngày = "Mới"
}

/* ---------------------------- KHỞI ĐỘNG APP (không cần đăng nhập) ---------------------------- */
const SETTINGS_DOC_ID = 'main';

async function bootApp() {
  showLoading();
  await attachListeners();
  await seedIfEmpty();
  hideLoading();
  if (!location.hash) location.hash = '#/dashboard';
  router();
}
bootApp();

/* ---------------------------- FIRESTORE LISTENERS ---------------------------- */
function attachListeners() {
  return new Promise(resolve => {
    let loaded = 0;
    const done = () => { loaded++; if (loaded >= 5) resolve(); };

    const unsubImg = db.collection('recipe_images').onSnapshot(snap => {
      const map = {};
      snap.docs.forEach(d => { map[d.id] = d.data().data; });
      State.images = map;
      done();
      router(true);
    }, err => { console.error(err); done(); });

    const unsubR = db.collection('recipes').orderBy('createdAt', 'desc')
      .onSnapshot(snap => {
        State.recipes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        done();
        router(true);
      }, err => { console.error(err); done(); });

    const unsubC = db.collection('categories').orderBy('createdAt', 'asc')
      .onSnapshot(snap => {
        State.categories = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        done();
        router(true);
      }, err => { console.error(err); done(); });

    const unsubL = db.collection('cooking_logs').orderBy('createdAt', 'desc')
      .onSnapshot(snap => {
        State.logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        done();
        router(true);
      }, err => { console.error(err); done(); });

    const unsubS = db.collection('app_settings').doc(SETTINGS_DOC_ID).onSnapshot(doc => {
      if (doc.exists) {
        State.settings = { ...State.settings, ...doc.data() };
        applyTheme();
      }
      done();
      router(true);
    }, err => { console.error(err); done(); });

    State.unsubscribers.push(unsubImg, unsubR, unsubC, unsubL, unsubS);
    setTimeout(resolve, 3000); // an toàn nếu mạng chậm
  });
}

async function seedIfEmpty() {
  if (State.categories.length > 0 || State.recipes.length > 0) return;
  try {
    const batch = db.batch();
    const cats = [
      { name: 'Món Việt', icon: '🍜' }, { name: 'Món Hàn', icon: '👧' }, { name: 'Bánh', icon: '🍰' },
      { name: 'Món Nhật', icon: '🍣' }, { name: 'Món Âu', icon: '🍾' }, { name: 'Ăn chay', icon: '🌱' },
      { name: 'Đồ uống', icon: '🥤' }, { name: 'Món tráng miệng', icon: '🧁' }
    ];
    const catRefs = {};
    cats.forEach(c => {
      const ref = db.collection('categories').doc();
      catRefs[c.name] = ref.id;
      batch.set(ref, { ...c, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    });

    const recipes = [
      { name: 'Bánh Flan Caramel', imageUrl: SAMPLE_IMAGES.flan, categoryName: 'Món tráng miệng', description: 'Món tráng miệng mềm mịn, thơm vị caramel đắng nhẹ.', prepTime: 20, cookTime: 25, servings: 4, difficulty: 'easy', ingredients: [{ name: 'Trứng gà', amount: '4', unit: 'quả' }, { name: 'Sữa tươi', amount: '500', unit: 'ml' }, { name: 'Đường', amount: '120', unit: 'g' }], steps: ['Thắng đường làm caramel, đổ vào khuôn.', 'Đánh tan trứng với sữa và đường, lọc mịn.', 'Hấp cách thủy 25 phút đến khi đông.'], tips: 'Hấp lửa nhỏ để mặt bánh không bị rỗ.', notes: '' },
      { name: 'Thịt Kho Tàu', imageUrl: SAMPLE_IMAGES.thitkho, categoryName: 'Món Việt', description: 'Thịt kho trứng đậm đà, béo ngậy kiểu ngày Tết.', prepTime: 15, cookTime: 60, servings: 4, difficulty: 'medium', ingredients: [{ name: 'Thịt ba chỉ', amount: '600', unit: 'g' }, { name: 'Trứng vịt', amount: '6', unit: 'quả' }, { name: 'Nước dừa', amount: '400', unit: 'ml' }], steps: ['Thịt cắt miếng, ướp với nước mắm, đường.', 'Kho cùng trứng luộc và nước dừa trên lửa nhỏ.', 'Kho đến khi nước sánh lại, thịt mềm.'], tips: 'Thắng nước hàng vừa tới để màu đẹp, không đắng.', notes: '' },
      { name: 'Phở Bò Hà Nội', imageUrl: SAMPLE_IMAGES.pho, categoryName: 'Món Việt', description: 'Nước dùng trong, thơm quế hồi, bánh phở mềm.', prepTime: 30, cookTime: 180, servings: 4, difficulty: 'easy', ingredients: [{ name: 'Xương bò', amount: '1.5', unit: 'kg' }, { name: 'Bánh phở', amount: '500', unit: 'g' }, { name: 'Thịt bò', amount: '300', unit: 'g' }], steps: ['Hầm xương bò cùng gừng, hành nướng.', 'Nêm nước dùng với quế, hồi, nước mắm.', 'Trụng bánh phở, xếp thịt bò, chan nước dùng.'], tips: 'Hớt bọt thường xuyên để nước dùng trong.', notes: '' },
      { name: 'Salad', imageUrl: SAMPLE_IMAGES.salad, categoryName: 'Ăn chay', description: 'Salad rau củ tươi mát, sốt chua ngọt nhẹ.', prepTime: 15, cookTime: 0, servings: 2, difficulty: 'easy', ingredients: [{ name: 'Xà lách', amount: '1', unit: 'bó' }, { name: 'Cà chua bi', amount: '10', unit: 'quả' }, { name: 'Dầu olive', amount: '2', unit: 'tbsp' }], steps: ['Rửa sạch rau, để ráo.', 'Trộn đều rau củ với sốt.', 'Bày ra đĩa, dùng ngay.'], tips: 'Trộn sốt ngay trước khi ăn để rau giòn lâu.', notes: '' }
    ];
    recipes.forEach(r => {
      const ref = db.collection('recipes').doc();
      batch.set(ref, {
        name: r.name, imageUrl: r.imageUrl, categoryId: catRefs[r.categoryName] || '', description: r.description,
        prepTime: r.prepTime, cookTime: r.cookTime, servings: r.servings, difficulty: r.difficulty,
        ingredients: r.ingredients, steps: r.steps.map((s, i) => ({ order: i + 1, content: s })),
        tips: r.tips, notes: r.notes, videoLink: '', status: 'saved', isFavorite: false, cookCount: 0,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(), updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });

    batch.set(db.collection('app_settings').doc(SETTINGS_DOC_ID), {
      appName: 'Yummy Recipes', logoEmoji: '👩‍🍳', theme: 'light',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();
  } catch (err) { console.error('Seed error', err); }
}

/* ---------------------------- THEME ---------------------------- */
function applyTheme() {
  document.body.classList.toggle('theme-dark', State.settings.theme === 'dark');
  document.body.classList.toggle('theme-light', State.settings.theme !== 'dark');
}
async function toggleTheme() {
  const next = State.settings.theme === 'dark' ? 'light' : 'dark';
  State.settings.theme = next;
  applyTheme();
  await db.collection('app_settings').doc(SETTINGS_DOC_ID).set({ theme: next }, { merge: true });
}

/* ---------------------------- ROUTER ---------------------------- */
function parseHash() {
  const raw = location.hash.replace(/^#\//, '') || 'dashboard';
  const parts = raw.split('/');
  return { route: parts[0], id: parts[1] || null };
}

window.addEventListener('hashchange', () => router());

function router(silentIfSameRoute) {
  const { route, id } = parseHash();
  qsa('.nav-item').forEach(a => a.classList.toggle('active', a.dataset.route === route));
  byId('dashMascot').classList.toggle('hidden', route !== 'dashboard');

  const renderers = {
    dashboard: renderDashboard,
    recipes: renderRecipesView,
    favorites: () => renderRecipesView(true),
    recipe: () => renderRecipeDetail(id),
    'recipe-form': () => renderRecipeForm(id),
    categories: renderCategories,
    settings: renderSettings,
    log: renderGlobalLog
  };
  (renderers[route] || renderDashboard)();
}

/* ---------------------------- HEADER RENDER ---------------------------- */
function renderHeaderDefault() {
  byId('appHeader').innerHTML = `
    <div class="header-row">
      <div class="header-left">
        <div class="avatar-chef">${esc(State.settings.logoEmoji || '👩‍🍳')}</div>
        <div class="brand"><span class="yummy">${esc((State.settings.appName || 'Yummy Recipes').split(' ')[0])}</span> <span class="recipes">${esc((State.settings.appName || 'Yummy Recipes').split(' ').slice(1).join(' '))}</span></div>
      </div>
      <div class="header-right">
        <button class="icon-btn" data-action="open-log">🔔</button>
        <div class="avatar-user">🐰</div>
      </div>
    </div>`;
}
function renderHeaderPage(title, backRoute) {
  byId('appHeader').innerHTML = `
    <div class="header-row">
      <button class="back-btn" data-action="go" data-id="${backRoute}">←</button>
      <div class="page-title">${esc(title)}</div>
      <div style="width:42px;"></div>
    </div>`;
}

/* ---------------------------- DASHBOARD ---------------------------- */
function renderDashboard() {
  renderHeaderDefault();
  const total = State.recipes.length;
  const newCount = State.recipes.filter(timeAgoOk).length;
  const favCount = State.recipes.filter(r => r.isFavorite).length;
  const catCount = State.categories.length;
  const latest = [...State.recipes].slice(0, 8);
  const popularCats = [...State.categories].slice(0, 8);

  byId('mainContent').innerHTML = `
    <div class="search-row">
      <div class="search-box">🔍<input id="dashSearch" placeholder="Tìm kiếm món ăn, nguyên liệu..." /></div>
      <button class="filter-btn" data-action="open-filter">⚙️ Bộ lọc</button>
    </div>

    <div class="hero">
      <span class="hero-badge">👋 Chào bạn!</span>
      <h1>Nấu ăn là <span class="accent">yêu thương</span><br>Lưu giữ khoảnh khắc ngọt ngào trong bếp</h1>
      <p>Lưu công thức, nấu những món ngon và tận hưởng niềm vui mỗi ngày! 🍳❤️</p>
      <button class="hero-cta" data-action="go" data-id="recipe-form">＋ Thêm công thức mới</button>
      <div class="hero-visual">
        <img src="img/mon-an.png" class="hero-photo" alt="Món ăn">
        <img src="img/IMG_3634-Photoroom.png" class="hero-chef" alt="Đầu bếp">
      </div>
    </div>

    <div class="stats">
      <div class="stat-card c1" data-action="go" data-id="recipes"><span class="stat-icon">📕</span><div class="stat-label">Tổng công thức</div><div class="stat-value">${total}</div></div>
      <div class="stat-card c2" data-action="go" data-id="recipes"><span class="stat-icon">🍲</span><div class="stat-label">Công thức mới</div><div class="stat-value">${newCount}</div></div>
      <div class="stat-card c3" data-action="go" data-id="favorites"><span class="stat-icon">❤️</span><div class="stat-label">Món yêu thích</div><div class="stat-value">${favCount}</div></div>
      <div class="stat-card c4" data-action="go" data-id="categories"><span class="stat-icon">🧁</span><div class="stat-label">Danh mục</div><div class="stat-value">${catCount}</div></div>
    </div>

    <div class="section">
      <div class="section-head">
        <div class="section-title">👨‍🍳 Công thức mới nhất</div>
        <button class="section-link" data-action="go" data-id="recipes">Xem tất cả →</button>
      </div>
      ${latest.length ? `<div class="recipe-scroll">${latest.map(cardHtml).join('')}</div>` : emptyStateHtml('recipe')}
    </div>

    <div class="section">
      <div class="section-head"><div class="section-title">🧁 Danh mục phổ biến</div>
      <button class="section-link" data-action="go" data-id="categories">Quản lý →</button></div>
      ${popularCats.length ? `<div class="cat-grid">${popularCats.map(catCardHtml).join('')}</div>` : emptyStateHtml('category')}
      
    </div>
  `;
  byId('dashSearch').addEventListener('input', e => { State.filters.query = e.target.value; location.hash = '#/recipes'; });
}

function cardHtml(r) {
  const cat = categoryById(r.categoryId);
  return `
  <div class="recipe-card" data-action="go" data-id="recipe/${r.id}">
    <div class="recipe-img">
      <img src="${esc(resolveImageSrc(r))}" alt="${esc(r.name)}">
      ${r.status === 'draft' ? '<span class="badge-draft">Nháp</span>' : (timeAgoOk(r) ? '<span class="badge-new">Mới</span>' : '')}
      <button class="fav-dot" data-action="toggle-fav" data-id="${r.id}">${r.isFavorite ? '❤️' : '🤍'}</button>
    </div>
    <div class="recipe-name">${esc(r.name)}</div>
    <div class="recipe-meta">
      <span>⭐ ${DIFFICULTY_LABEL[r.difficulty] || 'Dễ'}</span>
      <span>⏱ ${(Number(r.prepTime || 0) + Number(r.cookTime || 0))} phút</span>
    </div>
  </div>`;
}

function catCardHtml(c, i) {
  const count = State.recipes.filter(r => r.categoryId === c.id).length;
  const cls = CAT_ICON_CLASS[(i || 0) % 3];
  return `
  <div class="cat-card" data-action="filter-category" data-id="${c.id}">
    <div class="cat-icon ${cls}">${esc(c.icon || '🍽️')}</div>
    <div class="cat-name">${esc(c.name)}</div>
    <div class="cat-count">${count} món</div>
  </div>`;
}

function emptyStateHtml(kind) {
  const map = {
    recipe: { emoji: '🍳', title: 'Chưa có công thức nào', desc: 'Thêm công thức đầu tiên để bắt đầu sổ tay nấu ăn của bạn.', action: 'recipe-form', btn: '＋ Thêm công thức' },
    category: { emoji: '🗂️', title: 'Chưa có danh mục', desc: 'Tạo danh mục để sắp xếp công thức gọn gàng hơn.', action: 'categories', btn: '＋ Thêm danh mục' },
    favorite: { emoji: '🤍', title: 'Chưa có món yêu thích', desc: 'Bấm biểu tượng trái tim trên món ăn để lưu vào đây.', action: 'recipes', btn: 'Khám phá công thức' },
    log: { emoji: '📓', title: 'Chưa có nhật ký nấu ăn', desc: 'Ghi lại mỗi lần bạn nấu để theo dõi món yêu thích.', action: 'recipes', btn: 'Xem công thức' }
  };
  const c = map[kind] || map.recipe;
  return `<div class="empty-state"><div class="emoji">${c.emoji}</div><h3>${c.title}</h3><p>${c.desc}</p>
    <button class="btn-primary" data-action="go" data-id="${c.action}">${c.btn}</button></div>`;
}

/* ---------------------------- RECIPES LIST / FAVORITES ---------------------------- */
function renderRecipesView(favOnly) {
  renderHeaderPage(favOnly ? 'Món yêu thích' : 'Tất cả công thức', 'dashboard');
  const list = applyFilters(favOnly);
  byId('mainContent').innerHTML = `
    <div class="search-row">
      <div class="search-box">🔍<input id="listSearch" value="${esc(State.filters.query)}" placeholder="Tìm kiếm món ăn, nguyên liệu..." /></div>
      <button class="filter-btn" data-action="open-filter">⚙️ Bộ lọc</button>
    </div>
    <div class="chip-row">
      <button class="chip ${State.filters.sort === 'newest' ? 'active' : ''}" data-action="set-sort" data-id="newest">Mới nhất</button>
      <button class="chip ${State.filters.sort === 'name' ? 'active' : ''}" data-action="set-sort" data-id="name">Tên A-Z</button>
      <button class="chip ${State.filters.favoriteOnly ? 'active' : ''}" data-action="toggle-fav-filter">❤️ Yêu thích</button>
      ${State.categories.map(c => `<button class="chip ${State.filters.categoryId === c.id ? 'active' : ''}" data-action="filter-category" data-id="${c.id}">${esc(c.icon)} ${esc(c.name)}</button>`).join('')}
    </div>
    <div class="section" style="padding-top:4px;">
      ${list.length ? `<div class="recipe-grid">${list.map(cardHtml).join('')}</div>` : emptyStateHtml(favOnly ? 'favorite' : 'recipe')}
    </div>
    <div class="fab-space"></div>
  `;
  byId('listSearch').addEventListener('input', e => { State.filters.query = e.target.value; renderRecipesView(favOnly); });
}

function applyFilters(favOnly) {
  let list = [...State.recipes];
  const f = State.filters;
  if (favOnly || f.favoriteOnly) list = list.filter(r => r.isFavorite);
  if (f.query) {
    const q = f.query.toLowerCase();
    list = list.filter(r => r.name.toLowerCase().includes(q) || (r.ingredients || []).some(i => (i.name || '').toLowerCase().includes(q)));
  }
  if (f.categoryId) list = list.filter(r => r.categoryId === f.categoryId);
  if (f.difficulty) list = list.filter(r => r.difficulty === f.difficulty);
  if (f.maxTime) list = list.filter(r => (Number(r.prepTime || 0) + Number(r.cookTime || 0)) <= Number(f.maxTime));
  if (f.sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
  else if (f.sort === 'oldest') list.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
  else list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  return list;
}

function openFilterModal() {
  const f = State.filters;
  openModal(`
    <h3>Bộ lọc công thức</h3>
    <div class="form-group"><label>Danh mục</label>
      <select id="fCategory"><option value="">Tất cả</option>${State.categories.map(c => `<option value="${c.id}" ${f.categoryId === c.id ? 'selected' : ''}>${esc(c.icon)} ${esc(c.name)}</option>`).join('')}</select>
    </div>
    <div class="form-group"><label>Độ khó</label>
      <select id="fDifficulty"><option value="">Tất cả</option>
        <option value="easy" ${f.difficulty === 'easy' ? 'selected' : ''}>Dễ</option>
        <option value="medium" ${f.difficulty === 'medium' ? 'selected' : ''}>Trung bình</option>
        <option value="hard" ${f.difficulty === 'hard' ? 'selected' : ''}>Khó</option>
      </select>
    </div>
    <div class="form-group"><label>Tổng thời gian tối đa (phút)</label><input type="number" id="fMaxTime" value="${f.maxTime || ''}" placeholder="Ví dụ: 60"></div>
    <div class="form-group"><label>Sắp xếp</label>
      <select id="fSort">
        <option value="newest" ${f.sort === 'newest' ? 'selected' : ''}>Mới nhất</option>
        <option value="oldest" ${f.sort === 'oldest' ? 'selected' : ''}>Cũ nhất</option>
        <option value="name" ${f.sort === 'name' ? 'selected' : ''}>Tên A-Z</option>
      </select>
    </div>
    <div class="settings-row" style="padding:0; margin-bottom:16px;">
      <span class="label">Chỉ hiện món yêu thích</span>
      <div class="toggle ${f.favoriteOnly ? 'on' : ''}" id="fFavToggle"></div>
    </div>
    <div class="btn-row" style="padding:0;">
      <button class="btn-outline" data-action="reset-filter">Xoá lọc</button>
      <button class="btn-primary" data-action="apply-filter">Áp dụng</button>
    </div>
  `);
  byId('fFavToggle').addEventListener('click', () => byId('fFavToggle').classList.toggle('on'));
}
function applyFilterFromModal() {
  State.filters.categoryId = byId('fCategory').value;
  State.filters.difficulty = byId('fDifficulty').value;
  State.filters.maxTime = byId('fMaxTime').value;
  State.filters.sort = byId('fSort').value;
  State.filters.favoriteOnly = byId('fFavToggle').classList.contains('on');
  closeModal();
  location.hash = '#/recipes';
  router();
}
function resetFilters() {
  State.filters = { query: State.filters.query, categoryId: '', difficulty: '', favoriteOnly: false, sort: 'newest', maxTime: '' };
  closeModal();
  router();
}

/* ---------------------------- RECIPE DETAIL ---------------------------- */
State.detailTab = 'ingredients';
function renderRecipeDetail(id) {
  const r = recipeById(id);
  if (!r) { location.hash = '#/recipes'; return; }
  const cat = categoryById(r.categoryId);
  byId('appHeader').innerHTML = '';
  byId('mainContent').innerHTML = `
    <div class="detail-hero">
      <img src="${esc(resolveImageSrc(r))}" alt="${esc(r.name)}">
      <div class="detail-hero-overlay">
        <button class="back-btn" data-action="go" data-id="recipes">←</button>
        <button class="back-btn" data-action="toggle-fav" data-id="${r.id}">${r.isFavorite ? '❤️' : '🤍'}</button>
      </div>
    </div>
    <div class="detail-body">
      <div class="detail-title">${esc(r.name)}</div>
      <div class="detail-meta-row">
        <span class="meta-pill">🗂️ ${esc(cat ? cat.name : 'Chưa phân loại')}</span>
        <span class="meta-pill">⭐ ${DIFFICULTY_LABEL[r.difficulty] || 'Dễ'}</span>
        <span class="meta-pill">⏱ ${Number(r.prepTime || 0) + Number(r.cookTime || 0)} phút</span>
        <span class="meta-pill">🍽️ ${r.servings || 1} khẩu phần</span>
        ${r.cookCount ? `<span class="meta-pill">🔥 Đã nấu ${r.cookCount} lần</span>` : ''}
      </div>
      <p style="font-size:13.5px; color:var(--text-grey); font-weight:600; line-height:1.6; margin-bottom:6px;">${esc(r.description || '')}</p>
    </div>
    <div class="tab-strip">
      <button class="tab-btn ${State.detailTab === 'ingredients' ? 'active' : ''}" data-action="detail-tab" data-id="ingredients">Nguyên liệu</button>
      <button class="tab-btn ${State.detailTab === 'steps' ? 'active' : ''}" data-action="detail-tab" data-id="steps">Các bước</button>
      <button class="tab-btn ${State.detailTab === 'more' ? 'active' : ''}" data-action="detail-tab" data-id="more">Mẹo &amp; Ghi chú</button>
      <button class="tab-btn ${State.detailTab === 'log' ? 'active' : ''}" data-action="detail-tab" data-id="log">Nhật ký</button>
    </div>
    <div class="detail-body" id="detailTabContent"></div>

    <div class="btn-row">
      <button class="btn-secondary full" data-action="duplicate-recipe" data-id="${r.id}">📄 Sao chép</button>
      <button class="btn-secondary full" data-action="go" data-id="recipe-form/${r.id}">✏️ Sửa</button>
    </div>
    <div class="btn-row" style="padding-top:0;">
      <button class="btn-primary full" data-action="log-cook" data-id="${r.id}">🍳 Đánh dấu đã nấu</button>
      <button class="btn-danger full" data-action="delete-recipe" data-id="${r.id}">🗑️ Xoá</button>
    </div>
    <div class="fab-space"></div>
  `;
  renderDetailTab(r);
}

function renderDetailTab(r) {
  const box = byId('detailTabContent');
  if (State.detailTab === 'ingredients') {
    box.innerHTML = (r.ingredients || []).map((ing, i) => `
      <label class="ingredient-row ${State.checkedIngredients.has(i) ? 'checked' : ''}">
        <input type="checkbox" data-action="check-ing" data-id="${i}" ${State.checkedIngredients.has(i) ? 'checked' : ''}>
        <span>${esc(ing.amount || '')} ${esc(ing.unit || '')} ${esc(ing.name)}</span>
      </label>`).join('') || '<p style="color:var(--text-grey); font-size:13px;">Chưa có nguyên liệu.</p>';
  } else if (State.detailTab === 'steps') {
    box.innerHTML = (r.steps || []).map((s, i) => `
      <div class="step-item"><div class="step-num">${i + 1}</div><div style="font-size:13.5px; font-weight:600; line-height:1.6; padding-top:3px;">${esc(s.content || s)}</div></div>
    `).join('') || '<p style="color:var(--text-grey); font-size:13px;">Chưa có bước thực hiện.</p>';
  } else if (State.detailTab === 'more') {
    box.innerHTML = `
      ${r.tips ? `<div style="margin-bottom:12px;"><div class="section-title" style="font-size:13px; margin-bottom:8px;">💡 Mẹo nấu ăn</div><div class="tip-box">${esc(r.tips)}</div></div>` : ''}
      ${r.notes ? `<div style="margin-bottom:12px;"><div class="section-title" style="font-size:13px; margin-bottom:8px;">📝 Ghi chú riêng</div><div class="note-box">${esc(r.notes)}</div></div>` : ''}
      ${r.videoLink ? `<a href="${esc(r.videoLink)}" target="_blank" class="btn-secondary full" style="text-align:center; display:block;">▶️ Xem video hướng dẫn</a>` : ''}
      ${!r.tips && !r.notes && !r.videoLink ? '<p style="color:var(--text-grey); font-size:13px;">Chưa có mẹo hay ghi chú nào.</p>' : ''}
    `;
  } else if (State.detailTab === 'log') {
    const logs = State.logs.filter(l => l.recipeId === r.id);
    box.innerHTML = logs.length ? logs.map(l => `
      <div class="log-entry">
        <div class="log-entry-head"><span>📅 ${esc(l.date)}</span><span class="stars">${'⭐'.repeat(l.rating || 0)}</span></div>
        <div style="font-size:13px; font-weight:600;">${esc(l.note || '')}</div>
      </div>`).join('') : '<p style="color:var(--text-grey); font-size:13px;">Chưa có nhật ký nấu ăn cho món này.</p>';
  }
}
function setDetailTab(tab, r) { State.detailTab = tab; renderRecipeDetail(r); }

function openLogModal(recipeId) {
  const today = new Date().toISOString().slice(0, 10);
  openModal(`
    <h3>Ghi nhật ký nấu ăn</h3>
    <div class="form-group"><label>Ngày nấu</label><input type="text" id="logDate" value="${today}" placeholder="YYYY-MM-DD"></div>
    <div class="form-group"><label>Đánh giá</label>
      <select id="logRating"><option value="5">⭐⭐⭐⭐⭐</option><option value="4">⭐⭐⭐⭐</option><option value="3">⭐⭐⭐</option><option value="2">⭐⭐</option><option value="1">⭐</option></select>
    </div>
    <div class="form-group"><label>Ghi chú</label><textarea id="logNote" placeholder="Món hôm nay thế nào..."></textarea></div>
    <button class="btn-primary full" data-action="save-log" data-id="${recipeId}">Lưu nhật ký</button>
  `);
}
async function saveLog(recipeId) {
  const date = byId('logDate').value.trim();
  const rating = Number(byId('logRating').value);
  const note = byId('logNote').value.trim();
  try {
    showLoading();
    await db.collection('cooking_logs').add({ recipeId, date, rating, note, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    await db.collection('recipes').doc(recipeId).set({ cookCount: firebase.firestore.FieldValue.increment(1) }, { merge: true });
    closeModal();
    toast('Đã lưu nhật ký nấu ăn 🍳');
  } catch (e) { toast('Lỗi: ' + e.message); } finally { hideLoading(); }
}

function renderGlobalLog() {
  renderHeaderPage('Nhật ký nấu ăn', 'settings');
  const logs = State.logs;
  byId('mainContent').innerHTML = `<div class="section">${logs.length ? logs.map(l => {
    const r = recipeById(l.recipeId);
    return `<div class="log-entry"><div class="log-entry-head"><span>${esc(r ? r.name : 'Món đã xoá')}</span><span class="stars">${'⭐'.repeat(l.rating || 0)}</span></div>
      <div style="font-size:12px; color:var(--text-grey); font-weight:700; margin-bottom:4px;">📅 ${esc(l.date)}</div>
      <div style="font-size:13px; font-weight:600;">${esc(l.note || '')}</div></div>`;
  }).join('') : emptyStateHtml('log')}</div><div class="fab-space"></div>`;
}

/* ---------------------------- FAVORITE / DELETE / DUPLICATE ---------------------------- */
async function toggleFavorite(id) {
  const r = recipeById(id);
  if (!r) return;
  try { await db.collection('recipes').doc(id).set({ isFavorite: !r.isFavorite }, { merge: true }); }
  catch (e) { toast('Lỗi: ' + e.message); }
}
function confirmDelete(id) {
  const r = recipeById(id);
  openModal(`
    <h3>Xoá công thức?</h3>
    <p style="font-size:13.5px; color:var(--text-grey); margin-bottom:18px;">Bạn có chắc muốn xoá "<b>${esc(r?.name || '')}</b>"? Hành động này không thể hoàn tác.</p>
    <div class="btn-row" style="padding:0;">
      <button class="btn-outline" data-action="close-modal">Huỷ</button>
      <button class="btn-danger" data-action="do-delete" data-id="${id}">Xoá</button>
    </div>
  `);
}
async function doDelete(id) {
  try {
    showLoading();
    const r = recipeById(id);
    await db.collection('recipes').doc(id).delete();
    if (r && r.imageId) {
      const stillUsed = State.recipes.some(x => x.id !== id && x.imageId === r.imageId);
      if (!stillUsed) db.collection('recipe_images').doc(r.imageId).delete().catch(() => { });
    }
    closeModal();
    toast('Đã xoá công thức');
    location.hash = '#/recipes';
  } catch (e) { toast('Lỗi: ' + e.message); } finally { hideLoading(); }
}
async function duplicateRecipe(id) {
  const r = recipeById(id);
  if (!r) return;
  try {
    showLoading();
    const copy = { ...r };
    delete copy.id;
    copy.name = r.name + ' (bản sao)';
    copy.isFavorite = false;
    copy.cookCount = 0;
    copy.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    copy.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
    const ref = await db.collection('recipes').add(copy);
    toast('Đã sao chép công thức');
    location.hash = '#/recipe/' + ref.id;
  } catch (e) { toast('Lỗi: ' + e.message); } finally { hideLoading(); }
}

/* ---------------------------- RECIPE FORM (ADD/EDIT) ---------------------------- */
State.formState = null;
function blankFormState() {
  return { id: null, name: '', imageUrl: '', imageId: '', categoryId: '', description: '', prepTime: '', cookTime: '', servings: 4, difficulty: 'easy', ingredients: [{ name: '', amount: '', unit: '' }], steps: [''], tips: '', notes: '', videoLink: '', status: 'saved', isFavorite: false };
}
function renderRecipeForm(id) {
  const editing = !!id;
  if (!State.formState || State.formState.id !== id) {
    if (editing) {
      const r = recipeById(id);
      if (!r) { location.hash = '#/recipes'; return; }
      State.formState = { ...blankFormState(), ...r, id, ingredients: (r.ingredients && r.ingredients.length ? r.ingredients.map(i => ({ ...i })) : [{ name: '', amount: '', unit: '' }]), steps: (r.steps && r.steps.length ? r.steps.map(s => s.content || s) : ['']) };
    } else {
      State.formState = blankFormState();
    }
    State.formImageDataUrl = null;
    State.formImagePreview = null;
    State.formImageChanged = false;
  }
  const f = State.formState;
  renderHeaderPage(editing ? 'Sửa công thức' : 'Thêm công thức mới', editing ? 'recipe/' + id : 'dashboard');

  byId('mainContent').innerHTML = `
    <div class="form-wrap">
      <div class="form-group">
        <label>Ảnh món ăn</label>
        <div class="image-upload" data-action="pick-image">
          ${(State.formImagePreview || (f.imageId && State.images[f.imageId]) || f.imageUrl) ? `<img src="${esc(State.formImagePreview || State.images[f.imageId] || f.imageUrl)}">` : '<span>📷</span><span>Chọn ảnh món ăn</span>'}
        </div>
        <input type="file" id="imageInput" accept="image/*" class="hidden">
      </div>

      <div class="form-group"><label>Tên món *</label><input type="text" id="fName" value="${esc(f.name)}" placeholder="Ví dụ: Phở Bò Hà Nội"></div>

      <div class="form-group"><label>Danh mục</label>
        <select id="fCat"><option value="">-- Chọn danh mục --</option>${State.categories.map(c => `<option value="${c.id}" ${f.categoryId === c.id ? 'selected' : ''}>${esc(c.icon)} ${esc(c.name)}</option>`).join('')}</select>
      </div>

      <div class="form-group"><label>Mô tả ngắn</label><textarea id="fDesc" placeholder="Mô tả ngắn gọn về món ăn...">${esc(f.description)}</textarea></div>

      <div class="form-row-3">
        <div class="form-group"><label>Chuẩn bị (phút)</label><input type="number" id="fPrep" value="${esc(f.prepTime)}"></div>
        <div class="form-group"><label>Nấu (phút)</label><input type="number" id="fCook" value="${esc(f.cookTime)}"></div>
        <div class="form-group"><label>Khẩu phần</label><input type="number" id="fServ" value="${esc(f.servings)}"></div>
      </div>

      <div class="form-group"><label>Độ khó</label>
        <div class="difficulty-group">
          ${['easy', 'medium', 'hard'].map(d => `<div class="difficulty-opt ${f.difficulty === d ? 'active' : ''}" data-action="set-difficulty" data-id="${d}">${DIFFICULTY_LABEL[d]}</div>`).join('')}
        </div>
      </div>

      <div class="form-group">
        <label>Nguyên liệu</label>
        <div id="ingList">${f.ingredients.map((ing, i) => ingredientRowHtml(ing, i)).join('')}</div>
        <button type="button" class="add-item-btn" data-action="add-ingredient">＋ Thêm nguyên liệu</button>
      </div>

      <div class="form-group">
        <label>Các bước thực hiện</label>
        <div id="stepList">${f.steps.map((s, i) => stepRowHtml(s, i)).join('')}</div>
        <button type="button" class="add-item-btn" data-action="add-step">＋ Thêm bước</button>
      </div>

      <div class="form-group"><label>Mẹo nấu ăn</label><textarea id="fTips" placeholder="Chia sẻ mẹo giúp món ăn ngon hơn...">${esc(f.tips)}</textarea></div>
      <div class="form-group"><label>Ghi chú riêng</label><textarea id="fNotes" placeholder="Ghi chú cá nhân...">${esc(f.notes)}</textarea></div>
      <div class="form-group"><label>Link video (tuỳ chọn)</label><input type="url" id="fVideo" value="${esc(f.videoLink)}" placeholder="https://..."></div>

      <div class="btn-row" style="padding:6px 0;">
        <button class="btn-secondary full" data-action="save-recipe" data-id="draft">💾 Lưu nháp</button>
        <button class="btn-primary full" data-action="save-recipe" data-id="saved">${editing ? 'Cập nhật' : 'Lưu công thức'}</button>
      </div>
    </div>
    <div class="fab-space"></div>
  `;

  byId('fName').addEventListener('input', e => f.name = e.target.value);
  byId('fCat').addEventListener('change', e => f.categoryId = e.target.value);
  byId('fDesc').addEventListener('input', e => f.description = e.target.value);
  byId('fPrep').addEventListener('input', e => f.prepTime = e.target.value);
  byId('fCook').addEventListener('input', e => f.cookTime = e.target.value);
  byId('fServ').addEventListener('input', e => f.servings = e.target.value);
  byId('fTips').addEventListener('input', e => f.tips = e.target.value);
  byId('fNotes').addEventListener('input', e => f.notes = e.target.value);
  byId('fVideo').addEventListener('input', e => f.videoLink = e.target.value);
  byId('imageInput').addEventListener('change', onImagePicked);
  bindIngredientStepInputs();
}
function ingredientRowHtml(ing, i) {
  return `<div class="dynamic-list-item" data-idx="${i}">
    <input type="text" placeholder="Số lượng" data-field="amount" value="${esc(ing.amount)}" style="max-width:70px;">
    <input type="text" placeholder="Đơn vị" data-field="unit" value="${esc(ing.unit)}" style="max-width:80px;">
    <input type="text" placeholder="Tên nguyên liệu" data-field="name" value="${esc(ing.name)}">
    <button type="button" class="remove-item-btn" data-action="remove-ingredient" data-id="${i}">✕</button>
  </div>`;
}
function stepRowHtml(s, i) {
  return `<div class="dynamic-list-item" data-idx="${i}">
    <div class="step-num">${i + 1}</div>
    <textarea placeholder="Mô tả bước ${i + 1}..." data-field="step" rows="2">${esc(s)}</textarea>
    <button type="button" class="remove-item-btn" data-action="remove-step" data-id="${i}">✕</button>
  </div>`;
}
function bindIngredientStepInputs() {
  qsa('#ingList .dynamic-list-item').forEach(row => {
    const idx = Number(row.dataset.idx);
    qsa('input', row).forEach(inp => inp.addEventListener('input', () => {
      State.formState.ingredients[idx][inp.dataset.field] = inp.value;
    }));
  });
  qsa('#stepList .dynamic-list-item').forEach(row => {
    const idx = Number(row.dataset.idx);
    const ta = qs('textarea', row);
    ta.addEventListener('input', () => { State.formState.steps[idx] = ta.value; });
  });
}
function addIngredient() { State.formState.ingredients.push({ name: '', amount: '', unit: '' }); refreshDynamicLists(); }
function removeIngredient(i) { State.formState.ingredients.splice(i, 1); if (!State.formState.ingredients.length) State.formState.ingredients.push({ name: '', amount: '', unit: '' }); refreshDynamicLists(); }
function addStep() { State.formState.steps.push(''); refreshDynamicLists(); }
function removeStep(i) { State.formState.steps.splice(i, 1); if (!State.formState.steps.length) State.formState.steps.push(''); refreshDynamicLists(); }
function refreshDynamicLists() {
  byId('ingList').innerHTML = State.formState.ingredients.map((ing, i) => ingredientRowHtml(ing, i)).join('');
  byId('stepList').innerHTML = State.formState.steps.map((s, i) => stepRowHtml(s, i)).join('');
  bindIngredientStepInputs();
}
function setDifficulty(d) { State.formState.difficulty = d; qsa('.difficulty-opt').forEach(el2 => el2.classList.toggle('active', el2.dataset.id === d)); }
function pickImage() { byId('imageInput').click(); }
async function onImagePicked(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    qs('.image-upload').innerHTML = '<span>⏳</span><span>Đang xử lý ảnh...</span>';
    const dataUrl = await compressImageFile(file);
    State.formImageDataUrl = dataUrl;
    State.formImagePreview = dataUrl;
    State.formImageChanged = true;
    qs('.image-upload').innerHTML = `<img src="${dataUrl}">`;
  } catch (err) {
    toast('Lỗi ảnh: ' + err.message);
    qs('.image-upload').innerHTML = '<span>📷</span><span>Chọn ảnh món ăn</span>';
  }
}

async function saveRecipe(status) {
  const f = State.formState;
  if (!f.name || !f.name.trim()) { toast('Vui lòng nhập tên món ăn'); return; }
  try {
    showLoading();
    let imageId = f.imageId || '';
    const oldImageId = f.imageId || '';
    if (State.formImageChanged && State.formImageDataUrl) {
      // Lưu ảnh đã nén vào "bảng" recipe_images riêng, recipe chỉ giữ imageId trỏ tới
      const imgRef = await db.collection('recipe_images').add({
        data: State.formImageDataUrl,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      imageId = imgRef.id;
      // Xoá ảnh cũ (nếu có) để không tồn kho ảnh rác
      if (oldImageId && oldImageId !== imageId) {
        db.collection('recipe_images').doc(oldImageId).delete().catch(() => { });
      }
    }
    const payload = {
      name: f.name.trim(), imageId, imageUrl: f.imageUrl || '', categoryId: f.categoryId || '', description: f.description || '',
      prepTime: Number(f.prepTime) || 0, cookTime: Number(f.cookTime) || 0, servings: Number(f.servings) || 1,
      difficulty: f.difficulty || 'easy',
      ingredients: f.ingredients.filter(i => i.name && i.name.trim()),
      steps: f.steps.filter(s => s && s.trim()).map((s, i) => ({ order: i + 1, content: s })),
      tips: f.tips || '', notes: f.notes || '', videoLink: f.videoLink || '',
      status, isFavorite: !!f.isFavorite,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (f.id) {
      await db.collection('recipes').doc(f.id).set(payload, { merge: true });
      toast('Đã cập nhật công thức');
      location.hash = '#/recipe/' + f.id;
    } else {
      payload.cookCount = 0;
      payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      const ref = await db.collection('recipes').add(payload);
      toast(status === 'draft' ? 'Đã lưu nháp' : 'Đã thêm công thức mới 🎉');
      State.formState = null;
      location.hash = '#/recipe/' + ref.id;
    }
  } catch (e) { toast('Lỗi: ' + e.message); } finally { hideLoading(); }
}

/* ---------------------------- CATEGORIES ---------------------------- */
function renderCategories() {
  renderHeaderPage('Danh mục', 'dashboard');
  byId('mainContent').innerHTML = `
    <div class="section">
      <button class="btn-primary full" data-action="add-category" style="margin-bottom:16px;">＋ Thêm danh mục mới</button>
      ${State.categories.length ? State.categories.map(c => {
    const count = State.recipes.filter(r => r.categoryId === c.id).length;
    return `<div class="cat-manage-row">
          <div style="display:flex; align-items:center; gap:10px;"><span style="font-size:20px;">${esc(c.icon)}</span><div><div style="font-weight:800; font-size:14px;">${esc(c.name)}</div><div style="font-size:11.5px; color:var(--text-grey); font-weight:700;">${count} món</div></div></div>
          <div class="cat-manage-actions">
            <button class="icon-sm-btn" data-action="edit-category" data-id="${c.id}">✏️</button>
            <button class="icon-sm-btn" data-action="delete-category" data-id="${c.id}">🗑️</button>
          </div>
        </div>`;
  }).join('') : emptyStateHtml('category')}
    </div>
    <div class="fab-space"></div>
  `;
}
function categoryModalHtml(c) {
  return `
    <h3>${c ? 'Sửa danh mục' : 'Thêm danh mục mới'}</h3>
    <div class="form-group"><label>Tên danh mục</label><input type="text" id="catName" value="${esc(c?.name || '')}" placeholder="Ví dụ: Món chay"></div>
    <div class="form-group"><label>Icon (emoji)</label><input type="text" id="catIcon" value="${esc(c?.icon || '🍽️')}" placeholder="🍽️"></div>
    <button class="btn-primary full" data-action="save-category" data-id="${c?.id || ''}">Lưu danh mục</button>
  `;
}
function addCategoryModal() { openModal(categoryModalHtml(null)); }
function editCategoryModal(id) { openModal(categoryModalHtml(categoryById(id))); }
async function saveCategory(id) {
  const name = byId('catName').value.trim();
  const icon = byId('catIcon').value.trim() || '🍽️';
  if (!name) { toast('Vui lòng nhập tên danh mục'); return; }
  try {
    showLoading();
    if (id) await db.collection('categories').doc(id).set({ name, icon }, { merge: true });
    else await db.collection('categories').add({ name, icon, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    closeModal(); toast('Đã lưu danh mục');
  } catch (e) { toast('Lỗi: ' + e.message); } finally { hideLoading(); }
}
function confirmDeleteCategory(id) {
  const c = categoryById(id);
  openModal(`<h3>Xoá danh mục?</h3><p style="font-size:13.5px; color:var(--text-grey); margin-bottom:18px;">Xoá "<b>${esc(c?.name || '')}</b>"? Công thức thuộc danh mục này sẽ chuyển về "Chưa phân loại".</p>
    <div class="btn-row" style="padding:0;"><button class="btn-outline" data-action="close-modal">Huỷ</button><button class="btn-danger" data-action="do-delete-category" data-id="${id}">Xoá</button></div>`);
}
async function doDeleteCategory(id) {
  try {
    showLoading();
    const batch = db.batch();
    State.recipes.filter(r => r.categoryId === id).forEach(r => batch.update(db.collection('recipes').doc(r.id), { categoryId: '' }));
    batch.delete(db.collection('categories').doc(id));
    await batch.commit();
    closeModal(); toast('Đã xoá danh mục');
  } catch (e) { toast('Lỗi: ' + e.message); } finally { hideLoading(); }
}
function filterByCategory(id) { State.filters.categoryId = id; location.hash = '#/recipes'; }

/* ---------------------------- SETTINGS ---------------------------- */
function renderSettings() {
  renderHeaderPage('Cài đặt', 'dashboard');
  const s = State.settings;
  byId('mainContent').innerHTML = `
    <div class="section">
      <div class="settings-group">
        <div class="settings-row"><span class="label">🏷️ Tên ứng dụng</span><input class="settings-input" id="setAppName" value="${esc(s.appName)}"></div>
        <div class="settings-row"><span class="label">😊 Logo (emoji)</span><input class="settings-input" id="setLogo" value="${esc(s.logoEmoji)}"></div>
        <div class="settings-row"><span class="label">🌙 Chế độ tối</span><div class="toggle ${s.theme === 'dark' ? 'on' : ''}" data-action="toggle-theme"></div></div>
      </div>

      <div class="settings-group">
        <div class="settings-row" data-action="go" data-id="categories" style="cursor:pointer;"><span class="label">🗂️ Quản lý danh mục</span><span>›</span></div>
        <div class="settings-row" data-action="go" data-id="log" style="cursor:pointer;"><span class="label">📓 Nhật ký nấu ăn</span><span>›</span></div>
      </div>

      <div class="settings-group">
        <div class="settings-row" data-action="export-data" style="cursor:pointer;"><span class="label">⬇️ Xuất dữ liệu (JSON)</span><span>›</span></div>
        <div class="settings-row" data-action="trigger-import" style="cursor:pointer;"><span class="label">⬆️ Nhập dữ liệu (JSON)</span><span>›</span></div>
        <input type="file" id="importFileInput" accept="application/json" class="hidden">
      </div>

      <button class="btn-primary full" data-action="save-settings" style="margin-bottom:12px;">💾 Lưu cài đặt</button>
    </div>
    <div class="fab-space"></div>
  `;
  byId('importFileInput').addEventListener('change', onImportFile);
}
async function saveSettingsFromUI() {
  const appName = byId('setAppName').value.trim() || 'Yummy Recipes';
  const logoEmoji = byId('setLogo').value.trim() || '👩‍🍳';
  try {
    showLoading();
    State.settings.appName = appName; State.settings.logoEmoji = logoEmoji;
    await db.collection('app_settings').doc(SETTINGS_DOC_ID).set({ appName, logoEmoji }, { merge: true });
    toast('Đã lưu cài đặt');
  } catch (e) { toast('Lỗi: ' + e.message); } finally { hideLoading(); }
}
function exportData() {
  const data = { recipes: State.recipes, categories: State.categories, logs: State.logs, settings: State.settings, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `yummy-recipes-backup-${Date.now()}.json`;
  a.click();
  toast('Đã xuất file JSON');
}
function triggerImport() { byId('importFileInput').click(); }
async function onImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    showLoading();
    const batch = db.batch();
    (data.categories || []).forEach(c => {
      const ref = db.collection('categories').doc();
      batch.set(ref, { name: c.name, icon: c.icon || '🍽️', createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    });
    (data.recipes || []).forEach(r => {
      const ref = db.collection('recipes').doc();
      const clean = { ...r }; delete clean.id;
      batch.set(ref, { ...clean, createdAt: firebase.firestore.FieldValue.serverTimestamp(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    });
    await batch.commit();
    toast('Đã nhập dữ liệu thành công');
  } catch (err) { toast('File không hợp lệ: ' + err.message); } finally { hideLoading(); }
}

/* ---------------------------- EVENT DELEGATION ---------------------------- */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-action]');
  if (!t) return;
  const action = t.dataset.action;
  const id = t.dataset.id;
  const r = recipeById((parseHash().id) || '');

  const map = {
    'go': () => { location.hash = '#/' + id; },
    'toggle-fav': () => toggleFavorite(id),
    'toggle-fav-filter': () => { State.filters.favoriteOnly = !State.filters.favoriteOnly; router(); },
    'set-sort': () => { State.filters.sort = id; router(); },
    'filter-category': () => filterByCategory(id),
    'open-filter': () => openFilterModal(),
    'apply-filter': () => applyFilterFromModal(),
    'reset-filter': () => resetFilters(),
    'close-modal': () => closeModal(),
    'delete-recipe': () => confirmDelete(id),
    'do-delete': () => doDelete(id),
    'duplicate-recipe': () => duplicateRecipe(id),
    'detail-tab': () => setDetailTab(id, parseHash().id),
    'check-ing': () => { const i = Number(id); State.checkedIngredients.has(i) ? State.checkedIngredients.delete(i) : State.checkedIngredients.add(i); renderDetailTab(recipeById(parseHash().id)); },
    'log-cook': () => openLogModal(id),
    'save-log': () => saveLog(id),
    'open-log': () => { location.hash = '#/log'; },
    'pick-image': () => pickImage(),
    'add-ingredient': () => addIngredient(),
    'remove-ingredient': () => removeIngredient(Number(id)),
    'add-step': () => addStep(),
    'remove-step': () => removeStep(Number(id)),
    'set-difficulty': () => setDifficulty(id),
    'save-recipe': () => saveRecipe(id),
    'add-category': () => addCategoryModal(),
    'edit-category': () => editCategoryModal(id),
    'delete-category': () => confirmDeleteCategory(id),
    'do-delete-category': () => doDeleteCategory(id),
    'save-category': () => saveCategory(id),
    'toggle-theme': () => toggleTheme(),
    'export-data': () => exportData(),
    'trigger-import': () => triggerImport(),
    'save-settings': () => saveSettingsFromUI()
  };
  if (map[action]) map[action]();
});
