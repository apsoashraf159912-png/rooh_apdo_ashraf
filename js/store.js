/**
 * ROOH – Store JavaScript (store.js)
 * Full e-commerce functionality: products, cart, checkout, customizer
 */

// ── State ─────────────────────────────────────────────────────
let cart = JSON.parse(localStorage.getItem('rooh_cart') || '[]');
let currentView = 'grid';
let currentCategory = 'all';
let currentPage = 1;
const PAGE_SIZE = 12;
let allProducts = [];
let filteredProducts = [];
let currentRating = 0;
let currentUser = JSON.parse(localStorage.getItem('rooh_current_user') || 'null');

// Customizer state
let custState = { productType: null, base: null, fragrance: null, size: null, packaging: null, qty: 1 };

// ── Helpers ───────────────────────────────────────────────────
function fmtPrice(n) { return parseFloat(n || 0).toLocaleString('ar-EG') + ' ج.م'; }
function formatDate(iso) { return iso ? new Date(iso).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }) : ''; }

function showToast(title, msg = '', type = 'info', dur = 3500) {
  const icons = { success: '✅', danger: '❌', warning: '⚠️', info: 'ℹ️' };
  const ct = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = `<div class="toast-icon">${icons[type]||'ℹ️'}</div><div class="toast-body"><div class="toast-title">${title}</div>${msg?`<div class="toast-message">${msg}</div>`:''}</div><button class="toast-close" onclick="this.parentElement.remove()">✕</button>`;
  ct.appendChild(t);
  setTimeout(() => t.remove(), dur);
}

function stars(n) { n = Math.round(n || 0); return '★'.repeat(n) + '☆'.repeat(5 - n); }

// ── Category Nav & Filters ────────────────────────────────────
function buildCategoryNav() {
  const cats = DB.categories.where(c => c.status === 'active');
  const nav = document.getElementById('catNav');
  const filterDiv = document.getElementById('filterCats');

  const allLink = `<a class="cat-nav-item active" href="#" id="catAll" onclick="filterCategory('all',this);return false"><span class="cat-icon">🌟</span> الكل</a>`;
  nav.innerHTML = allLink + cats.map(c =>
    `<a class="cat-nav-item" href="#" data-cat="${c.id}" onclick="filterCategory('${c.id}',this);return false"><span class="cat-icon">${c.icon||'🌸'}</span> ${c.nameAr||c.name}</a>`
  ).join('');

  filterDiv.innerHTML = `<label class="filter-option"><input type="radio" name="fcat" value="" checked onchange="filterCategory('all',null)"> الكل</label>` +
    cats.map(c => `<label class="filter-option"><input type="radio" name="fcat" value="${c.id}" onchange="filterCategory('${c.id}',null)"> ${c.icon||''} ${c.nameAr||c.name}</label>`).join('');
}

function filterCategory(catId, el) {
  currentCategory = catId;
  currentPage = 1;
  // Update nav highlighting
  document.querySelectorAll('.cat-nav-item').forEach(a => a.classList.remove('active'));
  if (el) el.classList.add('active');
  applyFilters();
}

// ── Products ──────────────────────────────────────────────────
function loadProducts() {
  allProducts = DB.products.where(p => p.status === 'published');
  applyFilters();
}

function applyFilters() {
  let prods = [...allProducts];

  // Category
  if (currentCategory === 'new') prods = prods.filter(p => p.isNew);
  else if (currentCategory === 'bestsellers') prods = prods.filter(p => p.isBestSeller);
  else if (currentCategory === 'offers') prods = prods.filter(p => p.salePrice);
  else if (currentCategory !== 'all') prods = prods.filter(p => p.categoryId === currentCategory);

  // Search
  const sq = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
  if (sq) prods = prods.filter(p => (p.name + ' ' + (p.nameAr || '') + ' ' + (p.description || '')).toLowerCase().includes(sq));

  // Price
  const minP = parseFloat(document.getElementById('minPrice')?.value || 0);
  const maxP = parseFloat(document.getElementById('maxPrice')?.value || Infinity);
  if (minP) prods = prods.filter(p => (p.salePrice || p.price) >= minP);
  if (maxP < Infinity) prods = prods.filter(p => (p.salePrice || p.price) <= maxP);

  // Rating
  const ratingFilter = document.querySelector('input[name="rating"]:checked')?.value;
  if (ratingFilter) prods = prods.filter(p => (p.rating || 0) >= parseFloat(ratingFilter));

  // Checkboxes
  if (document.getElementById('filterNew')?.checked) prods = prods.filter(p => p.isNew);
  if (document.getElementById('filterSale')?.checked) prods = prods.filter(p => p.salePrice);
  if (document.getElementById('filterBest')?.checked) prods = prods.filter(p => p.isBestSeller);
  if (document.getElementById('filterStock')?.checked) prods = prods.filter(p => DB.getStock(p.id) > 0);

  // Sort
  const sort = document.getElementById('sortSelect')?.value || 'default';
  if (sort === 'price_asc') prods.sort((a, b) => (a.salePrice || a.price) - (b.salePrice || b.price));
  else if (sort === 'price_desc') prods.sort((a, b) => (b.salePrice || b.price) - (a.salePrice || a.price));
  else if (sort === 'rating') prods.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  else if (sort === 'bestseller') prods.sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0));
  else if (sort === 'newest') prods.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  filteredProducts = prods;
  renderProducts();
}

function renderProducts() {
  const grid = document.getElementById('productsGrid');
  const countEl = document.getElementById('productsCount');
  const total = filteredProducts.length;
  const start = (currentPage - 1) * PAGE_SIZE;
  const page = filteredProducts.slice(start, start + PAGE_SIZE);

  countEl.textContent = `${total} منتج`;

  if (!page.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:var(--space-3xl);color:var(--text-light)"><div style="font-size:4rem;margin-bottom:var(--space-md)">🔍</div><p>لا توجد منتجات تطابق البحث</p></div>`;
    document.getElementById('pagination').innerHTML = '';
    return;
  }

  if (currentView === 'list') {
    grid.style.gridTemplateColumns = '1fr';
  } else {
    grid.style.gridTemplateColumns = 'repeat(auto-fill,minmax(220px,1fr))';
  }

  grid.innerHTML = page.map(p => renderProductCard(p, currentView)).join('');
  renderPagination(total);
}

function renderProductCard(p, view = 'grid') {
  const price = p.salePrice ? p.salePrice : p.price;
  const hasDiscount = p.salePrice && p.salePrice < p.price;
  const discount = hasDiscount ? Math.round((1 - p.salePrice / p.price) * 100) : 0;
  const stock = DB.getStock(p.id);
  const stockLabel = stock <= 0 ? '<span class="product-stock-badge stock-out">❌ نفد المخزون</span>' :
    stock <= 5 ? `<span class="product-stock-badge stock-low">⚠️ كمية محدودة (${stock})</span>` :
    '<span class="product-stock-badge stock-in">✅ متوفر</span>';

  if (view === 'list') return `
    <div class="product-card" style="display:flex;flex-direction:row;border-radius:var(--radius-lg)" onclick="openProduct('${p.id}')">
      <div style="width:120px;height:120px;background:linear-gradient(135deg,var(--ivory),var(--beige));display:flex;align-items:center;justify-content:center;font-size:3rem;flex-shrink:0">${p.emoji||'🌸'}</div>
      <div style="flex:1;padding:var(--space-md);display:flex;align-items:center;gap:var(--space-lg)">
        <div style="flex:1">
          <div class="product-category-tag">${getCatName(p.categoryId)}</div>
          <div class="product-name">${p.nameAr || p.name}</div>
          <div class="product-rating"><span class="stars stars-sm">${stars(p.rating)}</span><span class="count">(${p.reviewCount||0})</span></div>
          ${stockLabel}
        </div>
        <div style="text-align:left;min-width:140px">
          <div class="product-price" style="margin-bottom:var(--space-sm)">
            <span class="current">${fmtPrice(price)}</span>
            ${hasDiscount ? `<span class="original">${fmtPrice(p.price)}</span><span class="discount">-${discount}%</span>` : ''}
          </div>
          <button class="btn btn-primary btn-sm" onclick="event.stopPropagation();addToCart('${p.id}')" ${stock <= 0 ? 'disabled' : ''}><i class="fas fa-cart-plus"></i> أضف للسلة</button>
        </div>
      </div>
    </div>`;

  return `
    <div class="product-card card-hover" onclick="openProduct('${p.id}')">
      <div class="product-image-wrap">
        <div class="product-image-placeholder">${p.emoji || '🌸'}</div>
        <div class="product-badges">
          ${p.isNew ? '<span class="badge badge-gold product-badge-new">جديد</span>' : ''}
          ${hasDiscount ? `<span class="badge badge-danger product-badge-sale">-${discount}%</span>` : ''}
          ${p.isBestSeller ? '<span class="badge product-badge-bestseller">⭐ الأكثر مبيعاً</span>' : ''}
        </div>
        <div class="product-wishlist" onclick="event.stopPropagation();toggleWishlist('${p.id}',this)" id="wish-${p.id}">🤍</div>
        <div class="product-quick-add" onclick="event.stopPropagation();addToCart('${p.id}')">
          <i class="fas fa-cart-plus"></i> أضف للسلة
        </div>
      </div>
      <div class="product-info">
        <div class="product-category-tag">${getCatName(p.categoryId)}</div>
        <div class="product-name">${p.nameAr || p.name}</div>
        <div class="product-rating"><span class="stars stars-sm">${stars(p.rating)}</span><span class="count">(${p.reviewCount||0})</span></div>
        <div class="product-price">
          <span class="current">${fmtPrice(price)}</span>
          ${hasDiscount ? `<span class="original">${fmtPrice(p.price)}</span><span class="discount">-${discount}%</span>` : ''}
        </div>
        ${stockLabel}
      </div>
    </div>`;
}

function getCatName(catId) {
  const c = DB.categories.find(catId);
  return c ? (c.nameAr || c.name) : '';
}

function renderPagination(total) {
  const pages = Math.ceil(total / PAGE_SIZE);
  const el = document.getElementById('pagination');
  if (pages <= 1) { el.innerHTML = ''; return; }
  let html = '';
  if (currentPage > 1) html += `<button class="page-btn" onclick="goPage(${currentPage-1})">›</button>`;
  for (let i = 1; i <= pages; i++) {
    html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="goPage(${i})">${i}</button>`;
  }
  if (currentPage < pages) html += `<button class="page-btn" onclick="goPage(${currentPage+1})">‹</button>`;
  el.innerHTML = html;
}
function goPage(n) { currentPage = n; renderProducts(); window.scrollTo({ top: 200, behavior: 'smooth' }); }

// ── Product Detail ────────────────────────────────────────────
function openProduct(id) {
  const p = DB.products.find(id);
  if (!p) return;
  const price = p.salePrice || p.price;
  const stock = DB.getStock(id);
  const sizes = p.sizes || [];
  const variants = DB.product_variants.where(v => v.productId === id);
  const modal = document.getElementById('productModalContent');

  modal.innerHTML = `
    <div class="modal-header">
      <h3>${p.nameAr || p.name}</h3>
      <span class="modal-close" onclick="document.getElementById('productModal').classList.add('d-none')">✕</span>
    </div>
    <div class="modal-body">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2xl)" class="product-detail-grid">
        <!-- Images -->
        <div>
          <div style="background:linear-gradient(135deg,var(--ivory),var(--beige));border-radius:var(--radius-xl);aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-size:8rem;margin-bottom:var(--space-md)">${p.emoji||'🌸'}</div>
        </div>
        <!-- Info -->
        <div class="product-info-panel">
          <div class="product-brand">${getCatName(p.categoryId)}</div>
          <h2 class="product-title">${p.nameAr || p.name}</h2>
          <div style="font-size:0.85rem;color:var(--text-light);margin-bottom:var(--space-sm)">${p.name}</div>
          <div class="product-rating mb-2"><span class="stars">${stars(p.rating)}</span><span style="margin-right:var(--space-sm);color:var(--text-light)">${p.reviewCount||0} تقييم</span></div>
          <div style="display:flex;align-items:baseline;gap:var(--space-md);margin-bottom:var(--space-lg)">
            <div class="product-price-large">${fmtPrice(price)}</div>
            ${p.salePrice ? `<div class="product-price-original">${fmtPrice(p.price)}</div>` : ''}
          </div>
          ${stock <= 0 ? '<div class="badge badge-danger mb-2">نفد المخزون</div>' : stock <= 5 ? `<div class="badge badge-warning mb-2">كمية محدودة: ${stock} فقط</div>` : '<div class="badge badge-success mb-2">متوفر في المخزون</div>'}
          ${sizes.length ? `
          <div class="mb-2"><div class="variation-label">الحجم:</div>
          <div class="variation-options">${sizes.map(s => `<button class="variation-btn" onclick="this.parentElement.querySelectorAll('.variation-btn').forEach(b=>b.classList.remove('active'));this.classList.add('active')">${s}</button>`).join('')}</div></div>` : ''}
          <div class="mb-2"><div class="variation-label">الكمية:</div>
          <div class="qty-control">
            <div class="qty-btn" onclick="changeQty(-1,'mdlQty')">−</div>
            <div class="qty-value" id="mdlQty">1</div>
            <div class="qty-btn" onclick="changeQty(1,'mdlQty')">+</div>
          </div></div>
          <div class="add-to-cart-section">
            <button class="btn btn-primary btn-lg" ${stock<=0?'disabled':''} onclick="addToCartFromModal('${id}')"><i class="fas fa-cart-plus"></i> أضف للسلة</button>
            <button class="btn btn-light btn-lg" onclick="toggleWishlist('${id}',this)">🤍 قائمة الرغبات</button>
          </div>
          ${p.descriptionAr || p.description ? `<div class="divider-h mt-2 mb-2"></div><p style="font-size:0.9rem;color:var(--text-medium)">${p.descriptionAr || p.description}</p>` : ''}
          ${p.ingredients ? `<div style="margin-top:var(--space-md)"><span style="font-weight:700;font-size:0.85rem">المكونات:</span><p style="font-size:0.82rem;color:var(--text-light);margin-top:4px">${p.ingredients}</p></div>` : ''}
          ${p.usage ? `<div style="margin-top:var(--space-sm)"><span style="font-weight:700;font-size:0.85rem">طريقة الاستخدام:</span><p style="font-size:0.82rem;color:var(--text-light);margin-top:4px">${p.usage}</p></div>` : ''}
        </div>
      </div>
    </div>`;

  document.getElementById('productModal').classList.remove('d-none');
}

function changeQty(delta, elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  let v = parseInt(el.textContent) + delta;
  if (v < 1) v = 1;
  if (v > 99) v = 99;
  el.textContent = v;
}

function addToCartFromModal(productId) {
  const qty = parseInt(document.getElementById('mdlQty')?.textContent || 1);
  addToCart(productId, qty);
  document.getElementById('productModal').classList.add('d-none');
}

// ── Cart ──────────────────────────────────────────────────────
function addToCart(productId, qty = 1, customData = null) {
  const p = DB.products.find(productId);
  if (!p) return;
  const stock = DB.getStock(productId);
  if (stock <= 0) { showToast('نفد المخزون', 'هذا المنتج غير متوفر حالياً', 'warning'); return; }

  const existing = cart.find(i => i.productId === productId && !i.isCustom);
  if (existing) {
    const newQty = existing.qty + qty;
    if (newQty > stock) { showToast('الكمية غير متوفرة', `الكمية المتوفرة: ${stock}`, 'warning'); return; }
    existing.qty = newQty;
  } else {
    cart.push({
      id: Date.now().toString(),
      productId, qty,
      name: p.nameAr || p.name,
      price: p.salePrice || p.price,
      costPrice: p.costPrice || 0,
      emoji: p.emoji || '🌸',
      isCustom: false,
      customData,
    });
  }
  saveCart();
  updateCartUI();
  showToast('أُضيف للسلة ✅', `${p.nameAr || p.name} (${qty})`, 'success');
  openCart();
}

function removeFromCart(itemId) {
  cart = cart.filter(i => i.id !== itemId);
  saveCart();
  updateCartUI();
}

function saveCart() { localStorage.setItem('rooh_cart', JSON.stringify(cart)); }

function getCartTotal() { return cart.reduce((s, i) => s + i.price * i.qty, 0); }
function getCartCount() { return cart.reduce((s, i) => s + i.qty, 0); }

function updateCartUI() {
  const count = getCartCount();
  const total = getCartTotal();
  document.getElementById('cartCount').textContent = count;
  document.getElementById('cartTotalDisplay').textContent = fmtPrice(total);

  const itemsEl = document.getElementById('cartItems');
  if (!cart.length) {
    itemsEl.innerHTML = '<p class="text-center text-light p-3">سلتك فارغة 🛒</p>';
  } else {
    itemsEl.innerHTML = cart.map(i => `
      <div class="cart-item">
        <div class="cart-item-img">${i.emoji || '🌸'}</div>
        <div class="cart-item-info">
          <div class="cart-item-name">${i.name}${i.isCustom ? ' 🎨' : ''}</div>
          <div class="cart-item-variant">الكمية: ${i.qty}</div>
          <div class="cart-item-price">${fmtPrice(i.price * i.qty)}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;align-items:center">
          <button class="qty-btn" onclick="updateCartQty('${i.id}',-1)" style="width:26px;height:26px;background:var(--ivory);border-radius:4px;font-size:1rem">−</button>
          <span style="font-size:0.85rem;font-weight:600">${i.qty}</span>
          <button class="qty-btn" onclick="updateCartQty('${i.id}',1)" style="width:26px;height:26px;background:var(--ivory);border-radius:4px;font-size:1rem">+</button>
        </div>
        <button class="cart-item-remove" onclick="removeFromCart('${i.id}')">🗑️</button>
      </div>`).join('');
  }
}

function updateCartQty(itemId, delta) {
  const item = cart.find(i => i.id === itemId);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) removeFromCart(itemId);
  else { saveCart(); updateCartUI(); }
}

function openCart() { document.getElementById('cartSidebar').classList.add('open'); document.getElementById('cartOverlay').classList.add('open'); }
function closeCart() { document.getElementById('cartSidebar').classList.remove('open'); document.getElementById('cartOverlay').classList.remove('open'); }

// ── Wishlist ──────────────────────────────────────────────────
function toggleWishlist(productId, el) {
  let wl = JSON.parse(localStorage.getItem('rooh_wishlist') || '[]');
  const idx = wl.indexOf(productId);
  if (idx > -1) { wl.splice(idx, 1); if (el) { el.textContent = '🤍'; el.classList.remove('active'); } showToast('أُزيل من قائمة الرغبات'); }
  else { wl.push(productId); if (el) { el.textContent = '❤️'; el.classList.add('active'); } showToast('أُضيف لقائمة الرغبات ❤️'); }
  localStorage.setItem('rooh_wishlist', JSON.stringify(wl));
}

// ── Search ────────────────────────────────────────────────────
function handleSearch(val) {
  currentPage = 1;
  const banner = document.getElementById('searchBanner');
  if (val.trim()) {
    banner.classList.remove('d-none');
    banner.style.display = 'flex';
    document.getElementById('searchBannerText').textContent = `نتائج البحث عن: "${val}"`;
  } else {
    banner.classList.add('d-none');
  }
  applyFilters();
}

function clearSearch() {
  document.getElementById('searchInput').value = '';
  document.getElementById('searchBanner').classList.add('d-none');
  applyFilters();
}

function clearFilters() {
  document.getElementById('minPrice').value = '';
  document.getElementById('maxPrice').value = '';
  document.querySelectorAll('input[name="rating"]')[0].checked = true;
  document.getElementById('filterNew').checked = false;
  document.getElementById('filterSale').checked = false;
  document.getElementById('filterBest').checked = false;
  document.getElementById('filterStock').checked = false;
  currentCategory = 'all';
  document.querySelectorAll('.cat-nav-item').forEach(a => a.classList.remove('active'));
  document.getElementById('catAll')?.classList.add('active');
  applyFilters();
}

function setView(type, btn) {
  currentView = type;
  document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderProducts();
}

// ── Checkout ──────────────────────────────────────────────────
function goToCheckout() {
  if (!cart.length) { showToast('السلة فارغة!', 'أضف منتجات أولاً', 'warning'); return; }
  closeCart();
  showPage('checkout');
  renderCheckout();
}

function renderCheckout() {
  const layout = document.getElementById('checkoutLayout');
  const settings = DB.getSettings();
  const govs = DB.shipping_zones.all().sort((a, b) => (a.nameAr || a.name).localeCompare(b.nameAr || b.name, 'ar'));
  const payMethods = [
    { id: 'cod', icon: '💵', name: 'الدفع عند الاستلام', nameAr: 'الدفع عند الاستلام' },
    { id: 'vodafone', icon: '📱', name: 'Vodafone Cash', nameAr: 'فودافون كاش' },
    { id: 'instapay', icon: '💳', name: 'InstaPay', nameAr: 'إنستاباي' },
    { id: 'orange', icon: '🟠', name: 'Orange Cash', nameAr: 'أورنج كاش' },
    { id: 'etisalat', icon: '🔵', name: 'Etisalat Cash', nameAr: 'اتصالات كاش' },
    { id: 'bank', icon: '🏦', name: 'Visa / Mastercard', nameAr: 'فيزا / ماستركارد' },
  ];

  const subtotal = getCartTotal();
  const freeShipThreshold = settings.freeShippingThreshold || 500;

  layout.innerHTML = `
    <div>
      <!-- Customer Info -->
      <div class="checkout-section">
        <div class="checkout-section-header"><div class="checkout-step-num">1</div><h3>بيانات العميل</h3></div>
        <div class="checkout-section-body">
          <div class="form-row">
            <div class="form-group"><label class="form-label">الاسم الكامل *</label><input class="form-control" id="chkName" required placeholder="اسمك الكريم" value="${currentUser ? currentUser.name : ''}"></div>
            <div class="form-group"><label class="form-label">رقم الهاتف *</label><input class="form-control" id="chkPhone" required placeholder="01xxxxxxxxx" value="${currentUser ? (currentUser.phone || '') : ''}"></div>
          </div>
          <div class="form-group"><label class="form-label">البريد الإلكتروني</label><input type="email" class="form-control" id="chkEmail" placeholder="email@example.com" value="${currentUser ? (currentUser.email || '') : ''}"></div>
        </div>
      </div>
      <!-- Shipping Address -->
      <div class="checkout-section">
        <div class="checkout-section-header"><div class="checkout-step-num">2</div><h3>عنوان التوصيل</h3></div>
        <div class="checkout-section-body">
          <div class="form-group"><label class="form-label">المحافظة *</label>
            <select class="form-control" id="chkGov" required onchange="updateShipping()">
              <option value="">اختري المحافظة</option>
              ${govs.map(g => `<option value="${g.id}" data-price="${g.price}" data-days="${g.days}">${g.nameAr || g.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label class="form-label">المدينة / الحي</label><input class="form-control" id="chkCity" placeholder="المدينة أو الحي"></div>
          <div class="form-group"><label class="form-label">العنوان التفصيلي *</label><textarea class="form-control" id="chkAddress" rows="2" required placeholder="الشارع، رقم المبنى، الطابق..."></textarea></div>
          <div id="shippingInfo" style="background:var(--ivory);border-radius:var(--radius-md);padding:var(--space-md);font-size:0.88rem;color:var(--text-medium);display:none">
            <i class="fas fa-truck"></i> <span id="shippingInfoText"></span>
          </div>
          ${subtotal >= freeShipThreshold ? '<div class="badge badge-success mt-1"><i class="fas fa-check"></i> شحن مجاني! طلبك تجاوز ' + fmtPrice(freeShipThreshold) + '</div>' : ''}
        </div>
      </div>
      <!-- Payment -->
      <div class="checkout-section">
        <div class="checkout-section-header"><div class="checkout-step-num">3</div><h3>طريقة الدفع</h3></div>
        <div class="checkout-section-body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-md)">
            ${payMethods.map((m, i) => `
              <div class="payment-method-card ${i === 0 ? 'selected' : ''}" onclick="selectPayment('${m.id}',this)">
                <input type="radio" name="payMethod" value="${m.id}" ${i === 0 ? 'checked' : ''} style="display:none">
                <span class="payment-icon">${m.icon}</span>
                <span style="font-size:0.9rem;font-weight:600">${m.nameAr}</span>
              </div>`).join('')}
          </div>
          <div id="paymentDetails" style="margin-top:var(--space-lg)"></div>
        </div>
      </div>
      <!-- Notes -->
      <div class="checkout-section">
        <div class="checkout-section-header"><div class="checkout-step-num">4</div><h3>ملاحظات</h3></div>
        <div class="checkout-section-body">
          <textarea class="form-control" id="chkNotes" rows="2" placeholder="أي ملاحظات خاصة للطلب..."></textarea>
        </div>
      </div>
    </div>
    <!-- Order Summary -->
    <div class="order-summary">
      <div class="order-summary-card">
        <h3 style="margin-bottom:var(--space-lg)">ملخص الطلب</h3>
        ${cart.map(i => `
          <div class="summary-row">
            <span>${i.name} × ${i.qty}</span>
            <span>${fmtPrice(i.price * i.qty)}</span>
          </div>`).join('')}
        <div class="divider-h mt-1 mb-1"></div>
        <div class="summary-row"><span>المجموع الفرعي</span><span>${fmtPrice(subtotal)}</span></div>
        <div class="summary-row"><span>الشحن</span><span id="shippingCostDisplay">${subtotal >= freeShipThreshold ? 'مجاني' : '—'}</span></div>
        <div class="summary-row"><span>الخصم</span><span id="discountDisplay">—</span></div>
        <!-- Coupon -->
        <div class="coupon-input mt-1 mb-1">
          <input type="text" class="form-control" id="couponInput" placeholder="كود الخصم">
          <button class="btn btn-secondary btn-sm" onclick="applyCoupon()">تطبيق</button>
        </div>
        <div class="summary-row total"><span>الإجمالي</span><span id="checkoutTotal">${fmtPrice(subtotal)}</span></div>
        <button class="btn btn-primary w-full" style="margin-top:var(--space-lg)" onclick="placeOrder()">
          <i class="fas fa-check-circle"></i> تأكيد الطلب
        </button>
        <p style="font-size:0.78rem;color:var(--text-light);text-align:center;margin-top:var(--space-sm)">بالضغط على تأكيد الطلب توافقين على شروط الاستخدام</p>
      </div>
    </div>`;
}

let selectedPayMethod = 'cod';
let appliedCoupon = null;
let shippingCost = 0;

function selectPayment(id, el) {
  selectedPayMethod = id;
  document.querySelectorAll('.payment-method-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  const details = document.getElementById('paymentDetails');
  if (id === 'vodafone') details.innerHTML = '<div style="background:var(--info-light);border-radius:var(--radius-md);padding:var(--space-md);font-size:0.88rem">📱 حوّل المبلغ على فودافون كاش: <strong>01227208589</strong><br>ثم أرسل صورة الإيصال على واتساب</div>';
  else if (id === 'instapay') details.innerHTML = '<div style="background:var(--info-light);border-radius:var(--radius-md);padding:var(--space-md);font-size:0.88rem">💳 حوّل على إنستاباي: <strong>01227208589</strong><br>ثم أرسل صورة الإيصال على واتساب</div>';
  else if (id === 'cod') details.innerHTML = '<div style="background:var(--success-light);border-radius:var(--radius-md);padding:var(--space-md);font-size:0.88rem">✅ ستدفعين عند الاستلام. يُرجى التأكد من توفر المبلغ كاملاً.</div>';
  else details.innerHTML = '<div style="background:var(--info-light);border-radius:var(--radius-md);padding:var(--space-md);font-size:0.88sm">سنتواصل معك لإتمام عملية الدفع.</div>';
}

function updateShipping() {
  const sel = document.getElementById('chkGov');
  const opt = sel.options[sel.selectedIndex];
  const price = parseInt(opt.dataset.price || 0);
  const days = opt.dataset.days || '';
  const settings = DB.getSettings();
  const subtotal = getCartTotal();

  shippingCost = subtotal >= (settings.freeShippingThreshold || 500) ? 0 : price;

  document.getElementById('shippingCostDisplay').textContent = shippingCost === 0 ? 'مجاني 🎉' : fmtPrice(shippingCost);
  if (days) {
    document.getElementById('shippingInfo').style.display = 'block';
    document.getElementById('shippingInfoText').textContent = `التوصيل خلال ${days} أيام عمل – ${shippingCost === 0 ? 'شحن مجاني!' : fmtPrice(shippingCost)}`;
  }
  recalcTotal();
}

function applyCoupon() {
  const code = document.getElementById('couponInput')?.value.trim().toUpperCase();
  const coupon = DB.coupons.where(c => c.code === code && c.status === 'active')[0];
  if (!coupon) { showToast('كود غير صالح', 'الكود غير موجود أو منتهي الصلاحية', 'danger'); return; }
  appliedCoupon = coupon;
  showToast('تم تطبيق الكود! 🎉', `خصم ${coupon.type === 'percent' ? coupon.value + '%' : fmtPrice(coupon.value)}`, 'success');
  recalcTotal();
}

function recalcTotal() {
  const subtotal = getCartTotal();
  let discount = 0;
  if (appliedCoupon) {
    discount = appliedCoupon.type === 'percent' ? subtotal * appliedCoupon.value / 100 : appliedCoupon.value;
    document.getElementById('discountDisplay').textContent = '-' + fmtPrice(discount);
  }
  const total = subtotal - discount + shippingCost;
  document.getElementById('checkoutTotal').textContent = fmtPrice(total);
}

function placeOrder() {
  const name = document.getElementById('chkName')?.value.trim();
  const phone = document.getElementById('chkPhone')?.value.trim();
  const address = document.getElementById('chkAddress')?.value.trim();
  const govEl = document.getElementById('chkGov');

  if (!name || !phone || !address || !govEl?.value) {
    showToast('بيانات ناقصة', 'يرجى تعبئة جميع الحقول المطلوبة', 'danger'); return;
  }
  if (!/^01[0-9]{9}$/.test(phone)) {
    showToast('رقم هاتف غير صحيح', 'يرجى إدخال رقم هاتف مصري صحيح', 'danger'); return;
  }

  const govOpt = govEl.options[govEl.selectedIndex];
  const govZone = DB.shipping_zones.find(govEl.value);
  const subtotal = getCartTotal();
  let discount = 0;
  if (appliedCoupon) discount = appliedCoupon.type === 'percent' ? subtotal * appliedCoupon.value / 100 : appliedCoupon.value;
  const total = subtotal - discount + shippingCost;

  // Find or create customer
  let customer = DB.customers.where(c => c.phone === phone)[0];
  if (!customer) {
    customer = DB.customers.insert({
      name, phone,
      email: document.getElementById('chkEmail')?.value || '',
      address, governorate: govOpt.text,
    });
  }

  const orderItems = cart.map(i => ({
    productId: i.productId,
    name: i.name,
    qty: i.qty,
    salePrice: i.price,
    costPrice: i.costPrice || 0,
    isCustom: i.isCustom,
    customData: i.customData,
  }));

  const order = DB.createOrder({
    customerId: customer.id,
    customerName: name,
    customerPhone: phone,
    customerEmail: document.getElementById('chkEmail')?.value || '',
    address: address + ', ' + document.getElementById('chkCity')?.value,
    governorate: govOpt.text,
    shippingZoneId: govEl.value,
    subtotal, discount, shippingFee: shippingCost, total,
    paymentMethod: selectedPayMethod,
    paymentStatus: selectedPayMethod === 'cod' ? 'unpaid' : 'pending_verification',
    couponId: appliedCoupon?.id,
    notes: document.getElementById('chkNotes')?.value || '',
  }, orderItems);

  // Create shipment
  DB.shipments.insert({
    orderId: order.id, customerId: customer.id,
    governorate: govOpt.text,
    shippingCost: shippingCost,
    collectionAmount: total,
    status: 'pending',
  });

  // Clear cart
  cart = [];
  saveCart();
  updateCartUI();
  appliedCoupon = null;
  shippingCost = 0;

  document.getElementById('successOrderId').textContent = '#' + order.id.slice(-8).toUpperCase();
  showPage('success');
  showToast('تم تأكيد طلبك! 🎉', `رقم الطلب: #${order.id.slice(-8).toUpperCase()}`, 'success', 8000);
}

// ── Tab / Page Routing ────────────────────────────────────────
function showStoreTab(tab, el) {
  const tabs = ['shop', 'customize', 'reviews', 'track', 'complaints'];
  tabs.forEach(t => {
    const el = document.getElementById('tab-' + t);
    if (el) el.classList.add('d-none');
  });
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + tab)?.classList.remove('d-none');
  if (el) el.classList.add('active');

  if (tab === 'reviews') renderStoreReviews();
  if (tab === 'customize') renderCustomizer();

  // Show/hide store layout parts
  const mainLayout = document.querySelector('.store-layout');
  const hero = document.getElementById('storeHero');
  if (tab === 'shop') { mainLayout.style.display = ''; hero.style.display = ''; }
  else { hero.style.display = 'none'; }
}

function showPage(page) {
  const pages = ['storeMain', 'checkout', 'success'];
  document.querySelector('.store-layout').style.display = page === 'storeMain' ? '' : 'none';
  document.getElementById('checkoutPage').classList.toggle('d-none', page !== 'checkout');
  document.getElementById('orderSuccessPage').classList.toggle('d-none', page !== 'success');
  document.getElementById('storeHero').style.display = page === 'storeMain' ? '' : 'none';
  document.getElementById('storeFooter').style.display = page === 'success' ? 'none' : '';
}

function backToShop() { showPage('storeMain'); }
function goToCheckout() {
  if (!cart.length) { showToast('السلة فارغة!', 'أضف منتجات أولاً', 'warning'); return; }
  closeCart();
  showPage('checkout');
  renderCheckout();
  selectPayment('cod', document.querySelector('.payment-method-card'));
}

// ── Track Order ───────────────────────────────────────────────
function trackOrder() {
  const input = document.getElementById('trackInput').value.trim();
  const result = document.getElementById('trackResult');
  if (!input) { result.innerHTML = '<p class="text-danger">يرجى إدخال رقم الطلب أو الهاتف</p>'; return; }

  let orders = [];
  if (/^01/.test(input)) {
    const cust = DB.customers.where(c => c.phone === input)[0];
    if (cust) orders = DB.orders.where(o => o.customerId === cust.id);
  } else {
    orders = DB.orders.where(o => o.id.includes(input.toUpperCase().replace('#', '')));
  }

  if (!orders.length) { result.innerHTML = '<div class="badge badge-danger">لا توجد طلبات بهذه البيانات</div>'; return; }

  const statusMap = { pending: 'قيد الانتظار', confirmed: 'مؤكد', processing: 'جاري التجهيز', shipped: 'تم الشحن', delivered: 'تم التوصيل', cancelled: 'ملغي' };
  result.innerHTML = orders.map(o => `
    <div class="card mt-2"><div class="card-body">
      <div class="flex-between mb-2">
        <strong>#${o.id.slice(-8).toUpperCase()}</strong>
        <span class="status-badge status-${o.status}">${statusMap[o.status] || o.status}</span>
      </div>
      <div style="font-size:0.85rem;color:var(--text-light)">
        <div>التاريخ: ${formatDate(o.createdAt)}</div>
        <div>الإجمالي: ${fmtPrice(o.total)}</div>
        <div>طريقة الدفع: ${o.paymentMethod}</div>
      </div>
    </div></div>`).join('');
}

// ── Customizer ────────────────────────────────────────────────
function renderCustomizer() {
  const opts = DB.customizer_opts.all()[0] || {};
  const layout = document.getElementById('customizerLayout');
  if (!opts.productTypes) { layout.innerHTML = '<p class="text-center text-light p-3">خيارات التخصيص غير متوفرة حالياً</p>'; return; }

  layout.innerHTML = `
    <div class="customizer-steps">
      <!-- Step 1: Type -->
      <div class="customizer-step">
        <div class="customizer-step-header"><h4>1. نوع المنتج</h4><i class="fas fa-chevron-down"></i></div>
        <div class="customizer-step-body">
          <div class="option-grid">${(opts.productTypes||[]).map(t => `
            <div class="option-card" onclick="setCustOption('productType',${JSON.stringify(t)},this)">
              <div class="opt-icon">${t.icon}</div>
              <div class="opt-name">${t.nameAr||t.name}</div>
              <div class="opt-price">من ${fmtPrice(t.basePrice)}</div>
            </div>`).join('')}</div>
        </div>
      </div>
      <!-- Step 2: Base -->
      <div class="customizer-step">
        <div class="customizer-step-header"><h4>2. القاعدة</h4><i class="fas fa-chevron-down"></i></div>
        <div class="customizer-step-body">
          <div class="option-grid">${(opts.bases||[]).map(b => `
            <div class="option-card" onclick="setCustOption('base',${JSON.stringify(b)},this)">
              <div class="opt-icon">🌿</div>
              <div class="opt-name">${b.nameAr||b.name}</div>
              <div class="opt-price">${b.price > 0 ? '+' + fmtPrice(b.price) : 'مجاني'}</div>
            </div>`).join('')}</div>
        </div>
      </div>
      <!-- Step 3: Fragrance -->
      <div class="customizer-step">
        <div class="customizer-step-header"><h4>3. العطر</h4><i class="fas fa-chevron-down"></i></div>
        <div class="customizer-step-body">
          <div class="option-grid">${(opts.fragrances||[]).map(f => `
            <div class="option-card" onclick="setCustOption('fragrance',${JSON.stringify(f)},this)">
              <div class="opt-icon">${f.icon}</div>
              <div class="opt-name">${f.nameAr||f.name}</div>
              <div class="opt-price">${f.price > 0 ? '+' + fmtPrice(f.price) : 'مجاني'}</div>
            </div>`).join('')}</div>
        </div>
      </div>
      <!-- Step 4: Size -->
      <div class="customizer-step">
        <div class="customizer-step-header"><h4>4. الحجم</h4><i class="fas fa-chevron-down"></i></div>
        <div class="customizer-step-body">
          <div class="option-grid">${(opts.sizes||[]).map(s => `
            <div class="option-card" onclick="setCustOption('size',${JSON.stringify(s)},this)">
              <div class="opt-icon">📦</div>
              <div class="opt-name">${s.name}</div>
              <div class="opt-price">${s.price > 0 ? '+' + fmtPrice(s.price) : 'مجاني'}</div>
            </div>`).join('')}</div>
        </div>
      </div>
      <!-- Step 5: Packaging -->
      <div class="customizer-step">
        <div class="customizer-step-header"><h4>5. التغليف</h4><i class="fas fa-chevron-down"></i></div>
        <div class="customizer-step-body">
          <div class="option-grid">${(opts.packaging||[]).map(p => `
            <div class="option-card" onclick="setCustOption('packaging',${JSON.stringify(p)},this)">
              <div class="opt-icon">${p.icon}</div>
              <div class="opt-name">${p.nameAr||p.name}</div>
              <div class="opt-price">${p.price > 0 ? '+' + fmtPrice(p.price) : 'مجاني'}</div>
            </div>`).join('')}</div>
        </div>
      </div>
    </div>
    <!-- Preview -->
    <div class="customizer-preview">
      <div class="preview-card">
        <h3 style="margin-bottom:var(--space-lg)">معاينة منتجك 🎨</h3>
        <div class="preview-visual" id="custPreviewVisual">🌸</div>
        <div id="custPreviewItems">
          <div style="text-align:center;color:var(--text-light);font-size:0.9rem;padding:var(--space-md)">اختاري خياراتك لتظهر هنا</div>
        </div>
        <div class="preview-total">
          <span>السعر الإجمالي:</span>
          <span id="custPrice" style="color:var(--gold-dark);font-size:1.3rem;font-weight:700">0 ج.م</span>
        </div>
        <div class="form-group mt-2">
          <label class="form-label">الكمية:</label>
          <div class="qty-control"><div class="qty-btn" onclick="changeCustQty(-1)">−</div><div class="qty-value" id="custQty">1</div><div class="qty-btn" onclick="changeCustQty(1)">+</div></div>
        </div>
        <div class="form-group">
          <label class="form-label">ملاحظات خاصة:</label>
          <textarea class="form-control" id="custNotes" rows="2" placeholder="أي رغبات خاصة..."></textarea>
        </div>
        <button class="btn btn-primary w-full mt-2" onclick="addCustomToCart()"><i class="fas fa-cart-plus"></i> أضف للسلة</button>
      </div>
    </div>`;
}

function setCustOption(key, val, el) {
  custState[key] = val;
  // Update visual
  el.closest('.option-grid').querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  updateCustPreview();
}

function updateCustPreview() {
  const opts = custState;
  const basePrice = opts.productType?.basePrice || 0;
  const extras = (opts.base?.price || 0) + (opts.fragrance?.price || 0) + (opts.size?.price || 0) + (opts.packaging?.price || 0);
  const qty = parseInt(document.getElementById('custQty')?.textContent || 1);
  const total = (basePrice + extras) * qty;

  document.getElementById('custPrice').textContent = fmtPrice(total);
  if (opts.productType) document.getElementById('custPreviewVisual').textContent = opts.productType.icon || '🌸';

  const items = [
    opts.productType ? ['نوع المنتج', opts.productType.nameAr || opts.productType.name] : null,
    opts.base ? ['القاعدة', opts.base.nameAr || opts.base.name] : null,
    opts.fragrance ? ['العطر', opts.fragrance.nameAr || opts.fragrance.name] : null,
    opts.size ? ['الحجم', opts.size.name] : null,
    opts.packaging ? ['التغليف', opts.packaging.nameAr || opts.packaging.name] : null,
  ].filter(Boolean);

  document.getElementById('custPreviewItems').innerHTML = items.length ?
    items.map(([k, v]) => `<div class="preview-summary-item"><span style="color:var(--text-light)">${k}</span><span style="font-weight:600">${v}</span></div>`).join('') :
    '<div style="text-align:center;color:var(--text-light);font-size:0.9rem;padding:var(--space-md)">اختاري خياراتك لتظهر هنا</div>';
}

function changeCustQty(delta) {
  const el = document.getElementById('custQty');
  let v = parseInt(el.textContent) + delta;
  if (v < 1) v = 1;
  el.textContent = v;
  updateCustPreview();
}

function addCustomToCart() {
  if (!custState.productType) { showToast('اختاري نوع المنتج أولاً', '', 'warning'); return; }
  const basePrice = custState.productType.basePrice || 0;
  const extras = (custState.base?.price || 0) + (custState.fragrance?.price || 0) + (custState.size?.price || 0) + (custState.packaging?.price || 0);
  const price = basePrice + extras;
  const qty = parseInt(document.getElementById('custQty')?.textContent || 1);
  const notes = document.getElementById('custNotes')?.value || '';

  cart.push({
    id: Date.now().toString(),
    productId: 'custom_' + Date.now(),
    qty,
    name: `منتج مخصص – ${custState.productType.nameAr || custState.productType.name}`,
    price,
    costPrice: Math.round(price * 0.4),
    emoji: custState.productType.icon || '🎨',
    isCustom: true,
    customData: { ...custState, notes },
  });

  saveCart();
  updateCartUI();
  showToast('أُضيف منتجك المخصص! 🎨', `السعر: ${fmtPrice(price * qty)}`, 'success');
  openCart();
}

// ── Reviews ───────────────────────────────────────────────────
let reviewRating = 5;
function setRating(n) {
  reviewRating = n;
  const stars = document.getElementById('starSelector').children;
  for (let i = 0; i < 5; i++) stars[i].textContent = i < n ? '★' : '☆';
}
function openReviewForm() { document.getElementById('reviewModal').classList.remove('d-none'); }
function submitReview(e) {
  e.preventDefault();
  DB.reviews.insert({
    customerName: document.getElementById('revName').value,
    rating: reviewRating,
    title: document.getElementById('revTitle').value,
    body: document.getElementById('revBody').value,
    status: 'pending',
    date: new Date().toISOString(),
  });
  DB.createNotification('review', 'تقييم جديد بانتظار المراجعة', 'admin');
  showToast('تم إرسال تقييمك!', 'سيظهر بعد المراجعة', 'success');
  document.getElementById('reviewModal').classList.add('d-none');
  e.target.reset();
}

function renderStoreReviews() {
  const grid = document.getElementById('storeReviews');
  const reviews = DB.reviews.where(r => r.status === 'approved');
  if (!reviews.length) { grid.innerHTML = '<p class="text-center text-light" style="grid-column:1/-1">لا توجد تقييمات بعد. كوني أول من يقيّم!</p>'; return; }
  grid.innerHTML = reviews.map(r => `
    <div class="review-card">
      <div class="review-stars stars">${'★'.repeat(r.rating||5)}${'☆'.repeat(5-(r.rating||5))}</div>
      ${r.title ? `<div style="font-weight:700;margin-bottom:var(--space-sm)">${r.title}</div>` : ''}
      <div class="review-text">"${r.body}"</div>
      <div class="reviewer">
        <div class="avatar avatar-sm">${(r.customerName||'E')[0]}</div>
        <div><div class="reviewer-name">${r.customerName||'عميلة'}</div><div class="reviewer-verified"><i class="fas fa-check-circle"></i> موثّق</div></div>
        <div style="margin-right:auto;font-size:0.75rem;color:var(--text-light)">${formatDate(r.date)}</div>
      </div>
    </div>`).join('');
}

// ── Complaints ────────────────────────────────────────────────
function submitStoreComplaint(e) {
  e.preventDefault();
  DB.complaints.insert({
    customerName: document.getElementById('sCompName').value,
    phone: document.getElementById('sCompPhone').value,
    orderId: document.getElementById('sCompOrder').value,
    category: document.getElementById('sCompCat').value,
    details: document.getElementById('sCompDetail').value,
    status: 'new', date: new Date().toISOString(),
  });
  DB.createNotification('complaint', 'شكوى جديدة', 'admin');
  showToast('تم استلام شكواك!', 'سنرد عليك خلال 24 ساعة', 'success');
  e.target.reset();
}

// ── Auth ──────────────────────────────────────────────────────
function openAuth() {
  if (currentUser) { showUserMenu(); return; }
  document.getElementById('authModal').classList.remove('d-none');
  renderLoginForm();
}
function closeAuth() { document.getElementById('authModal').classList.add('d-none'); }
function renderLoginForm() {
  document.getElementById('authTitle').textContent = 'تسجيل الدخول';
  document.getElementById('authBody').innerHTML = `
    <form onsubmit="doLogin(event)">
      <div class="form-group"><label class="form-label">رقم الهاتف</label><input class="form-control" id="loginPhone" placeholder="01xxxxxxxxx" required></div>
      <div class="form-group"><label class="form-label">كلمة المرور</label><input type="password" class="form-control" id="loginPass" required></div>
      <button class="btn btn-primary w-full" type="submit">دخول</button>
      <div class="text-center mt-2" style="font-size:0.88rem">ليس لديك حساب؟ <a onclick="renderRegisterForm()" style="color:var(--gold-dark);cursor:pointer">سجلي الآن</a></div>
    </form>`;
}
function renderRegisterForm() {
  document.getElementById('authTitle').textContent = 'إنشاء حساب';
  document.getElementById('authBody').innerHTML = `
    <form onsubmit="doRegister(event)">
      <div class="form-group"><label class="form-label">الاسم الكامل *</label><input class="form-control" id="regName" required></div>
      <div class="form-group"><label class="form-label">رقم الهاتف *</label><input class="form-control" id="regPhone" required placeholder="01xxxxxxxxx"></div>
      <div class="form-group"><label class="form-label">البريد الإلكتروني</label><input type="email" class="form-control" id="regEmail"></div>
      <div class="form-group"><label class="form-label">كلمة المرور *</label><input type="password" class="form-control" id="regPass" required minlength="6"></div>
      <button class="btn btn-primary w-full" type="submit">إنشاء حساب</button>
      <div class="text-center mt-2" style="font-size:0.88rem">لديك حساب؟ <a onclick="renderLoginForm()" style="color:var(--gold-dark);cursor:pointer">سجلي دخولك</a></div>
    </form>`;
}
function doLogin(e) {
  e.preventDefault();
  const phone = document.getElementById('loginPhone').value.trim();
  const pass = document.getElementById('loginPass').value;
  const user = DB.customers.where(c => c.phone === phone)[0];
  if (!user || user.password !== pass) { showToast('بيانات خاطئة', 'الهاتف أو كلمة المرور غير صحيحة', 'danger'); return; }
  currentUser = user;
  localStorage.setItem('rooh_current_user', JSON.stringify(user));
  closeAuth();
  document.getElementById('authBtnText').textContent = user.name.split(' ')[0];
  showToast('مرحباً ' + user.name + '! 🌸', '', 'success');
}
function doRegister(e) {
  e.preventDefault();
  const phone = document.getElementById('regPhone').value.trim();
  if (DB.customers.where(c => c.phone === phone).length) { showToast('الهاتف مسجل مسبقاً', 'سجلي دخولك', 'warning'); return; }
  const cust = DB.customers.insert({
    name: document.getElementById('regName').value,
    phone, email: document.getElementById('regEmail').value,
    password: document.getElementById('regPass').value,
    status: 'active',
  });
  currentUser = cust;
  localStorage.setItem('rooh_current_user', JSON.stringify(cust));
  closeAuth();
  document.getElementById('authBtnText').textContent = cust.name.split(' ')[0];
  showToast('تم إنشاء حسابك بنجاح! 🌸', '', 'success');
}
function showUserMenu() {
  showToast('مرحباً ' + currentUser.name, 'يمكنك تتبع طلباتك من تبويب "تتبع الطلب"', 'info');
}

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  buildCategoryNav();
  loadProducts();
  updateCartUI();

  // Check login state
  if (currentUser) document.getElementById('authBtnText').textContent = currentUser.name.split(' ')[0];

  // Hash routing
  const hash = location.hash.slice(1);
  if (hash === 'customize') showStoreTab('customize', null);
  else if (hash === 'reviews') showStoreTab('reviews', null);
  else if (hash === 'track') showStoreTab('track', null);

  // Navbar scroll
  window.addEventListener('scroll', () => {
    document.getElementById('mainNav').classList.toggle('scrolled', window.scrollY > 50);
  });
});

