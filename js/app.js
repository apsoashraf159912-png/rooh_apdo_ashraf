/**
 * ROOH – Main Website JavaScript (app.js)
 * Handles homepage interactions, language toggle, AI chat, forms
 */

// ── Language System ───────────────────────────────────────────
let currentLang = localStorage.getItem('rooh_lang') || 'ar';

function applyLanguage(lang) {
  currentLang = lang;
  localStorage.setItem('rooh_lang', lang);
  const isAr = lang === 'ar';
  document.documentElement.lang = lang;
  document.documentElement.dir = isAr ? 'rtl' : 'ltr';
  document.getElementById('langToggle').textContent = isAr ? 'EN' : 'ع';

  document.querySelectorAll('[data-en][data-ar]').forEach(el => {
    el.textContent = isAr ? el.dataset.ar : el.dataset.en;
  });
  document.querySelectorAll('[placeholder]').forEach(el => {
    const ar = el.dataset.arPlaceholder, en = el.dataset.enPlaceholder;
    if (ar || en) el.placeholder = isAr ? ar : en;
  });
}

function toggleLanguage() {
  applyLanguage(currentLang === 'ar' ? 'en' : 'ar');
}

// ── Navbar Scroll ─────────────────────────────────────────────
window.addEventListener('scroll', () => {
  const nav = document.getElementById('mainNav');
  if (nav) nav.classList.toggle('scrolled', window.scrollY > 50);
  updateActiveNavLink();
});

function updateActiveNavLink() {
  const sections = ['home', 'products', 'about', 'services', 'reviews', 'contact'];
  let current = '';
  sections.forEach(id => {
    const el = document.getElementById(id);
    if (el && window.scrollY >= el.offsetTop - 100) current = id;
  });
  document.querySelectorAll('.nav-link').forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === '#' + current);
  });
}

// ── Mobile Menu ───────────────────────────────────────────────
function openMobileMenu() {
  document.getElementById('mobileNav').classList.add('open');
  document.getElementById('mobileOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeMobileMenu() {
  document.getElementById('mobileNav').classList.remove('open');
  document.getElementById('mobileOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

// ── Toast Notifications ───────────────────────────────────────
function showToast(title, message = '', type = 'info', duration = 3500) {
  const icons = { success: '✅', danger: '❌', warning: '⚠️', info: 'ℹ️' };
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <div class="toast-icon">${icons[type] || icons.info}</div>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      ${message ? `<div class="toast-message">${message}</div>` : ''}
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()">✕</button>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

// ── Counter Animation ─────────────────────────────────────────
function animateCounter(el, target, suffix = '') {
  let start = 0;
  const step = Math.ceil(target / 60);
  const timer = setInterval(() => {
    start += step;
    if (start >= target) { start = target; clearInterval(timer); }
    el.textContent = start.toLocaleString('ar-EG') + suffix;
  }, 25);
}

// ── Category Preview Grid ─────────────────────────────────────
function renderCategoryPreview() {
  const grid = document.getElementById('catPreviewGrid');
  if (!grid) return;
  const cats = DB.categories.where(c => c.status === 'active' && !c.isVirtual).slice(0, 8);
  grid.innerHTML = cats.map(c => `
    <a href="store.html#${c.slug}" class="cat-preview-card animate-fadeIn">
      <div class="cat-preview-icon">${c.icon || '🌸'}</div>
      <div class="cat-preview-name">${currentLang === 'ar' ? (c.nameAr || c.name) : c.name}</div>
      <div class="cat-preview-name-ar" style="font-size:0.75rem;color:var(--text-light);margin-top:2px">${currentLang === 'ar' ? c.name : (c.nameAr || '')}</div>
    </a>`).join('');
}

// ── Reviews ───────────────────────────────────────────────────
function renderReviews() {
  const grid = document.getElementById('reviewsGrid');
  if (!grid) return;
  const reviews = DB.reviews.where(r => r.status === 'approved').slice(0, 3);
  if (!reviews.length) {
    grid.innerHTML = '<p class="text-center text-light" style="grid-column:1/-1">لا توجد تقييمات بعد.</p>';
    return;
  }
  grid.innerHTML = reviews.map(r => `
    <div class="review-card animate-fadeIn">
      <div class="review-stars stars">
        ${'★'.repeat(Math.round(r.rating || 5))}${'☆'.repeat(5 - Math.round(r.rating || 5))}
      </div>
      <div class="review-text">"${r.body || ''}"</div>
      <div class="reviewer">
        <div class="avatar avatar-sm">${(r.customerName || 'E')[0]}</div>
        <div>
          <div class="reviewer-name">${r.customerName || 'عميلة'}</div>
          <div class="reviewer-verified"><i class="fas fa-check-circle"></i> عملية شراء موثّقة</div>
        </div>
        <div style="margin-right:auto;font-size:0.78rem;color:var(--text-light)">${formatDate(r.date)}</div>
      </div>
    </div>`).join('');
}

// ── Stats ─────────────────────────────────────────────────────
function renderHeroStats() {
  const pCount = DB.products.count(p => p.status === 'published');
  const cCount = DB.customers.count() + 1200; // add base
  const el1 = document.getElementById('stat-products');
  const el2 = document.getElementById('stat-customers');
  if (el1) animateCounter(el1, pCount, '+');
  if (el2) animateCounter(el2, cCount, '+');
}

// ── AI Chatbot ────────────────────────────────────────────────
const chatKnowledge = {
  'منتجات': 'نقدم مجموعة واسعة من منتجات التجميل الفاخرة تشمل: العناية بالبشرة، الشعر، الجسم، المكياج، العطور، ومنتجات الرجال. 🌸 يمكنك التسوق من سوق روح على موقعنا.',
  'منتجاتكم': 'نقدم مجموعة واسعة من منتجات التجميل الفاخرة تشمل: العناية بالبشرة، الشعر، الجسم، المكياج، العطور، ومنتجات الرجال. 🌸',
  'توصيل': 'نوصل لجميع محافظات مصر! 🚚\n• القاهرة والجيزة: 1-2 يوم (50 ج.م)\n• الدلتا والوجه البحري: 2-3 أيام (60-65 ج.م)\n• الصعيد: 3-5 أيام (70-90 ج.م)\n• شحن مجاني عند الطلبات فوق 500 ج.م',
  'شحن': 'نوصل لجميع محافظات مصر! 🚚 أسعار الشحن تبدأ من 50 ج.م وتختلف حسب المحافظة.',
  'دفع': 'نقبل طرق دفع متعددة: 💳\n• فودافون كاش\n• إنستاباي\n• أورنج كاش\n• الدفع عند الاستلام\n• بطاقات Visa / Mastercard',
  'طريقة الدفع': 'نقبل طرق دفع متعددة: 💳\n• فودافون كاش\n• إنستاباي\n• أورنج كاش\n• الدفع عند الاستلام\n• بطاقات Visa / Mastercard',
  'تخصيص': 'يمكنك تصميم منتجك الخاص! 🎨\nاختاري نوع المنتج، القاعدة، المكونات، العطر، الحجم، والتغليف. السعر يُحسب تلقائياً. زوري قسم "صمّمي منتجك" في سوق روح.',
  'شكوى': `لتقديم شكوى يمكنك:\n📞 الاتصال: 01227208589\n💬 واتساب: 01227208589\nأو استخدام نموذج الشكاوى على الموقع.`,
  'تواصل': `يمكن التواصل معنا:\n📞 هاتف: 01227208589\n💬 واتساب: wa.me/201227208589\n📧 info@rooh.com`,
  'سعر': 'أسعارنا مناسبة وتعكس جودة المنتجات. تجدين كامل الأسعار في سوق روح. 💛',
  'مكونات': 'نستخدم مكونات طبيعية عالية الجودة مختارة بعناية من موردين موثوقين حول العالم. 🌿',
  'عروض': 'تجدين أحدث العروض في قسم "العروض الخاصة" بسوق روح. تابعي صفحتنا على السوشيال ميديا لمعرفة أحدث الخصومات! 🎁',
  'وصل حديثا': 'تجدين أحدث المنتجات في قسم "وصل حديثاً" بسوق روح. ✨',
  'طلب': 'لمتابعة طلبك، ادخلي رقم الطلب في صفحة تتبع الطلبات بسوق روح، أو تواصلي معنا على 01227208589.',
  'default': 'شكراً لتواصلك مع روح! 🌸 يسعدني مساعدتك. يمكنك سؤالي عن المنتجات، التوصيل، الدفع، أو التواصل مع فريقنا على واتساب: 01227208589'
};

function getAIResponse(input) {
  const lower = input.toLowerCase().trim();
  for (const key of Object.keys(chatKnowledge)) {
    if (key !== 'default' && lower.includes(key)) return chatKnowledge[key];
  }

  // Check products by name
  const products = DB.products.where(p => p.status === 'published');
  for (const p of products) {
    if (lower.includes(p.name.toLowerCase()) || (p.nameAr && lower.includes(p.nameAr))) {
      return `${p.nameAr || p.name} 🌸\nالسعر: ${p.price} ج.م\n${p.descriptionAr || p.description || ''}\nيمكن الطلب من سوق روح.`;
    }
  }

  return chatKnowledge.default;
}

function toggleChat() {
  const panel = document.getElementById('chatPanel');
  panel.classList.toggle('open');
}

function addChatMessage(text, sender) {
  const msgs = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = `chat-msg ${sender}`;
  div.innerHTML = `<div class="chat-bubble-msg">${text.replace(/\n/g, '<br>')}</div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function sendQuickReply(text) {
  document.getElementById('chatInput').value = text;
  sendChat();
}

function sendChat() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;
  addChatMessage(text, 'user');
  input.value = '';
  document.getElementById('quickReplies').style.display = 'none';

  setTimeout(() => {
    const response = getAIResponse(text);
    addChatMessage(response, 'bot');
  }, 600);
}

// ── Contact Form ──────────────────────────────────────────────
function submitContact(e) {
  e.preventDefault();
  const msg = DB.messages.insert({
    name: document.getElementById('cName').value,
    phone: document.getElementById('cPhone').value,
    email: document.getElementById('cEmail').value,
    subject: document.getElementById('cSubject').value,
    message: document.getElementById('cMessage').value,
    status: 'new',
  });
  DB.createNotification('message', `رسالة جديدة من ${msg.name}`, 'admin');
  showToast('تم الإرسال!', 'سنتواصل معك في أقرب وقت ممكن.', 'success');
  document.getElementById('contactForm').reset();
}

// ── Complaint Form ────────────────────────────────────────────
function openComplaintForm() {
  document.getElementById('complaintModal').classList.remove('d-none');
}
function closeComplaintForm() {
  document.getElementById('complaintModal').classList.add('d-none');
}
function submitComplaint(e) {
  e.preventDefault();
  const c = DB.complaints.insert({
    customerName: document.getElementById('compName').value,
    phone: document.getElementById('compPhone').value,
    orderId: document.getElementById('compOrder').value,
    category: document.getElementById('compCategory').value,
    details: document.getElementById('compDetails').value,
    status: 'new',
    date: new Date().toISOString(),
  });
  DB.createNotification('complaint', `شكوى جديدة من ${c.customerName}`, 'admin');
  showToast('تم استلام شكواك!', 'سنراجع شكواك وسنتواصل معك خلال 24 ساعة.', 'success');
  closeComplaintForm();
  document.getElementById('complaintForm').reset();
}

// ── Utility ───────────────────────────────────────────────────
function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
}

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  applyLanguage(currentLang);
  renderCategoryPreview();
  renderReviews();
  renderHeroStats();

  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const target = document.querySelector(a.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // Intersection Observer for animations
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) e.target.style.opacity = '1'; });
  }, { threshold: 0.1 });
  document.querySelectorAll('.animate-fadeIn, .animate-slideUp').forEach(el => {
    el.style.opacity = '0';
    observer.observe(el);
  });
});

