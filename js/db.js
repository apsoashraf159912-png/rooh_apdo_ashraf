/**
 * ROOH – Database Layer (LocalStorage ORM)
 * Simulates a relational database with proper CRUD operations,
 * relationships, and transaction integrity.
 */

const DB = (() => {
  // ── Core Storage ──────────────────────────────────────────
  const PREFIX = 'rooh_';
  const get = (key) => { try { return JSON.parse(localStorage.getItem(PREFIX + key)) || []; } catch { return []; } };
  const set = (key, val) => localStorage.setItem(PREFIX + key, JSON.stringify(val));
  const getSingle = (key) => { try { return JSON.parse(localStorage.getItem(PREFIX + key)) || {}; } catch { return {}; } };
  const setSingle = (key, val) => localStorage.setItem(PREFIX + key, JSON.stringify(val));

  // ID generator
  const newId = (prefix = '') => prefix + Date.now() + Math.random().toString(36).slice(2, 7).toUpperCase();
  const now = () => new Date().toISOString();

  // ── Generic CRUD ──────────────────────────────────────────
  const collection = (name) => ({
    all: () => get(name),
    find: (id) => get(name).find(r => r.id === id),
    where: (pred) => get(name).filter(pred),
    insert: (data) => {
      const records = get(name);
      const record = { id: newId(), createdAt: now(), updatedAt: now(), ...data };
      records.push(record);
      set(name, records);
      return record;
    },
    update: (id, data) => {
      const records = get(name);
      const idx = records.findIndex(r => r.id === id);
      if (idx === -1) return null;
      records[idx] = { ...records[idx], ...data, updatedAt: now() };
      set(name, records);
      return records[idx];
    },
    delete: (id) => {
      const records = get(name);
      const idx = records.findIndex(r => r.id === id);
      if (idx === -1) return false;
      records.splice(idx, 1);
      set(name, records);
      return true;
    },
    count: (pred) => pred ? get(name).filter(pred).length : get(name).length,
    sum: (field, pred) => get(name).filter(pred || (() => true)).reduce((s, r) => s + (parseFloat(r[field]) || 0), 0),
  });

  // ── Collections ───────────────────────────────────────────
  const tables = {
    settings:          'settings',
    website_content:   'website_content',
    users:             'users',
    customers:         'customers',
    categories:        'categories',
    products:          'products',
    product_variants:  'product_variants',
    product_images:    'product_images',
    ingredients:       'ingredients',
    customizer_opts:   'customizer_opts',
    orders:            'orders',
    order_items:       'order_items',
    order_notes:       'order_notes',
    payments:          'payments',
    refunds:           'refunds',
    shipments:         'shipments',
    shipping_zones:    'shipping_zones',
    inventory:         'inventory',
    stock_movements:   'stock_movements',
    suppliers:         'suppliers',
    purchase_orders:   'purchase_orders',
    purchase_items:    'purchase_items',
    expenses:          'expenses',
    income:            'income',
    accounts:          'accounts',           // Chart of Accounts
    journal_entries:   'journal_entries',
    ledger_lines:      'ledger_lines',
    reviews:           'reviews',
    complaints:        'complaints',
    notifications:     'notifications',
    audit_logs:        'audit_logs',
    messages:          'messages',
    employees:         'employees',
    roles:             'roles',
    permissions:       'permissions',
    coupons:           'coupons',
    wishlists:         'wishlists',
    sessions:          'sessions',
  };

  const db = {};
  Object.entries(tables).forEach(([alias, name]) => { db[alias] = collection(name); });

  // ── Settings Helpers ──────────────────────────────────────
  db.getSettings = () => getSingle('rooh_site_settings');
  db.saveSettings = (data) => setSingle('rooh_site_settings', { ...db.getSettings(), ...data, updatedAt: now() });
  db.getContent = (page, section) => {
    const all = get('website_content');
    return all.find(c => c.page === page && c.section === section) || null;
  };

  // ── Order Helpers ─────────────────────────────────────────
  db.createOrder = (orderData, items) => {
    const order = db.orders.insert({
      ...orderData,
      status: orderData.status || 'pending',
      paymentStatus: orderData.paymentStatus || 'unpaid',
    });
    items.forEach(item => db.order_items.insert({ ...item, orderId: order.id }));

    // Deduct inventory
    items.forEach(item => {
      db.deductStock(item.productId, item.qty, `Sale - Order ${order.id}`, 'system');
    });

    // Accounting: create sales journal entry
    if (order.total > 0) {
      db.postJournalEntry({
        date: order.createdAt,
        description: `Sale - Order ${order.id}`,
        reference: order.id,
        type: 'sale',
        lines: [
          { accountCode: '1100', debit: order.total, credit: 0 },  // Accounts Receivable
          { accountCode: '4100', debit: 0, credit: order.total },  // Sales Revenue
        ]
      });
    }

    // Income record
    db.income.insert({
      type: 'sale', orderId: order.id, amount: order.total,
      method: order.paymentMethod, status: order.paymentStatus,
      description: `Order ${order.id}`, date: order.createdAt,
    });

    db.logAudit('order_created', `Order ${order.id} created`, { orderId: order.id });
    db.createNotification('new_order', `طلب جديد #${order.id.slice(-6)}`, 'admin');
    return order;
  };

  db.updateOrderStatus = (orderId, status, userId = 'system') => {
    const order = db.orders.update(orderId, { status });
    db.order_notes.insert({ orderId, note: `Status changed to ${status}`, createdBy: userId, type: 'system' });
    db.logAudit('order_status_change', `Order ${orderId} status → ${status}`, { orderId, status }, userId);
    return order;
  };

  db.recordPayment = (orderId, amount, method, notes = '') => {
    const order = db.orders.find(orderId);
    if (!order) return null;

    const payment = db.payments.insert({
      orderId, amount: parseFloat(amount), method, notes,
      status: 'confirmed', date: now(),
    });

    // Update order payment status
    const totalPaid = db.payments.sum('amount', p => p.orderId === orderId && p.status === 'confirmed');
    const newPayStatus = totalPaid >= order.total ? 'paid' : (totalPaid > 0 ? 'partial' : 'unpaid');
    db.orders.update(orderId, { paymentStatus: newPayStatus, amountPaid: totalPaid });

    // Accounting
    db.postJournalEntry({
      date: now(), description: `Payment for Order ${orderId}`,
      reference: payment.id, type: 'payment',
      lines: [
        { accountCode: '1000', debit: amount, credit: 0 },  // Cash/Bank
        { accountCode: '1100', debit: 0, credit: amount },  // Accounts Receivable
      ]
    });

    db.income.update(db.income.where(i => i.orderId === orderId)[0]?.id, { status: newPayStatus });
    return payment;
  };

  // ── Inventory Helpers ─────────────────────────────────────
  db.getStock = (productId) => {
    const inv = db.inventory.where(i => i.productId === productId)[0];
    return inv ? inv.quantity : 0;
  };

  db.addStock = (productId, qty, reason = '', userId = 'system') => {
    let inv = db.inventory.where(i => i.productId === productId)[0];
    if (inv) {
      db.inventory.update(inv.id, { quantity: (inv.quantity || 0) + qty });
    } else {
      inv = db.inventory.insert({ productId, quantity: qty });
    }
    db.stock_movements.insert({ productId, type: 'add', qty, reason, userId, date: now() });
    return inv;
  };

  db.deductStock = (productId, qty, reason = '', userId = 'system') => {
    let inv = db.inventory.where(i => i.productId === productId)[0];
    const current = inv ? inv.quantity : 0;
    const newQty = Math.max(0, current - qty);
    if (inv) {
      db.inventory.update(inv.id, { quantity: newQty });
    } else {
      inv = db.inventory.insert({ productId, quantity: 0 });
    }
    db.stock_movements.insert({ productId, type: 'deduct', qty, reason, userId, date: now() });
    if (newQty <= (db.products.find(productId)?.minStock || 5)) {
      db.createNotification('low_stock', `مخزون منخفض: ${db.products.find(productId)?.name || productId}`, 'admin');
    }
    return inv;
  };

  // ── Accounting Helpers ────────────────────────────────────
  db.postJournalEntry = (entry) => {
    const totalDebits = entry.lines.reduce((s, l) => s + (l.debit || 0), 0);
    const totalCredits = entry.lines.reduce((s, l) => s + (l.credit || 0), 0);
    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      console.warn('[ROOH Accounting] Unbalanced journal entry:', entry);
      return null;
    }
    const je = db.journal_entries.insert({
      date: entry.date || now(),
      description: entry.description,
      reference: entry.reference,
      type: entry.type,
      totalAmount: totalDebits,
      status: 'posted',
    });
    entry.lines.forEach(line => {
      db.ledger_lines.insert({
        journalEntryId: je.id,
        accountCode: line.accountCode,
        debit: line.debit || 0,
        credit: line.credit || 0,
        date: je.date,
      });
    });
    return je;
  };

  db.getAccountBalance = (accountCode) => {
    const lines = db.ledger_lines.where(l => l.accountCode === accountCode);
    const debits = lines.reduce((s, l) => s + (l.debit || 0), 0);
    const credits = lines.reduce((s, l) => s + (l.credit || 0), 0);
    return { debits, credits, balance: debits - credits };
  };

  // ── Financial Reports ─────────────────────────────────────
  db.getProfitLoss = (startDate, endDate) => {
    const filter = (date) => {
      if (!startDate && !endDate) return true;
      const d = new Date(date);
      if (startDate && d < new Date(startDate)) return false;
      if (endDate && d > new Date(endDate)) return false;
      return true;
    };

    const orders = db.orders.where(o => o.status !== 'cancelled' && filter(o.createdAt));
    const grossSales = orders.reduce((s, o) => s + (o.subtotal || 0), 0);
    const discounts = orders.reduce((s, o) => s + (o.discount || 0), 0);
    const netSales = grossSales - discounts;
    const cogs = db.order_items.all()
      .filter(i => orders.find(o => o.id === i.orderId))
      .reduce((s, i) => s + ((i.costPrice || 0) * (i.qty || 1)), 0);
    const grossProfit = netSales - cogs;
    const expenses = db.expenses.where(e => filter(e.date)).reduce((s, e) => s + (e.amount || 0), 0);
    const shippingExp = db.expenses.where(e => filter(e.date) && e.category === 'shipping').reduce((s, e) => s + e.amount, 0);
    const marketingExp = db.expenses.where(e => filter(e.date) && e.category === 'marketing').reduce((s, e) => s + e.amount, 0);
    const operatingProfit = grossProfit - expenses;
    const refunds = db.refunds.where(r => filter(r.date)).reduce((s, r) => s + (r.amount || 0), 0);
    const netProfit = operatingProfit - refunds;

    return {
      grossSales, discounts, netSales, cogs, grossProfit,
      expenses, shippingExp, marketingExp, operatingProfit,
      refunds, netProfit,
      grossMargin: netSales > 0 ? ((grossProfit / netSales) * 100).toFixed(1) : 0,
      netMargin: netSales > 0 ? ((netProfit / netSales) * 100).toFixed(1) : 0,
    };
  };

  db.getProductProfitability = (productId) => {
    const product = db.products.find(productId);
    if (!product) return null;
    const items = db.order_items.where(i => i.productId === productId);
    const deliveredOrderIds = db.orders.where(o => o.status === 'delivered').map(o => o.id);
    const soldItems = items.filter(i => deliveredOrderIds.includes(i.orderId));
    const totalSold = soldItems.reduce((s, i) => s + (i.qty || 1), 0);
    const totalRevenue = soldItems.reduce((s, i) => s + ((i.salePrice || 0) * (i.qty || 1)), 0);
    const totalCost = soldItems.reduce((s, i) => s + ((i.costPrice || 0) * (i.qty || 1)), 0);
    const totalProfit = totalRevenue - totalCost;
    const margin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : 0;
    const stock = db.getStock(productId);
    return {
      product, totalSold, totalRevenue, totalCost, totalProfit, margin,
      inventoryValue: stock * (product.costPrice || 0),
    };
  };

  db.getCashFlow = (period = 'month') => {
    const now_d = new Date();
    let startDate;
    switch (period) {
      case 'day': startDate = new Date(now_d.setHours(0,0,0,0)); break;
      case 'week': startDate = new Date(now_d.setDate(now_d.getDate() - 7)); break;
      case 'year': startDate = new Date(now_d.setFullYear(now_d.getFullYear(), 0, 1)); break;
      default: startDate = new Date(now_d.setDate(1)); // month
    }
    const filter = (date) => new Date(date) >= startDate;
    const inflow = db.payments.where(p => p.status === 'confirmed' && filter(p.date)).reduce((s, p) => s + p.amount, 0);
    const outflow = db.expenses.where(e => filter(e.date)).reduce((s, e) => s + e.amount, 0);
    return { inflow, outflow, net: inflow - outflow };
  };

  // ── Audit Log ─────────────────────────────────────────────
  db.logAudit = (action, description, meta = {}, userId = 'system') => {
    db.audit_logs.insert({ action, description, meta, userId, date: now() });
  };

  // ── Notifications ─────────────────────────────────────────
  db.createNotification = (type, message, userId = 'admin') => {
    db.notifications.insert({ type, message, userId, read: false, date: now() });
  };

  // ── Customer Helpers ──────────────────────────────────────
  db.getCustomerStats = (customerId) => {
    const orders = db.orders.where(o => o.customerId === customerId && o.status !== 'cancelled');
    const totalOrders = orders.length;
    const totalPurchases = orders.reduce((s, o) => s + (o.total || 0), 0);
    const totalPaid = db.payments.where(p => {
      const order = db.orders.find(p.orderId);
      return order && order.customerId === customerId && p.status === 'confirmed';
    }).reduce((s, p) => s + p.amount, 0);
    const lastOrder = orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    return { totalOrders, totalPurchases, totalPaid, outstanding: totalPurchases - totalPaid, lastOrder };
  };

  db.categorizeCustomer = (customerId) => {
    const stats = db.getCustomerStats(customerId);
    if (stats.totalOrders === 0) return 'new';
    if (stats.totalPurchases > 5000) return 'vip';
    if (stats.outstanding > 0) return 'pending_payment';
    const last = stats.lastOrder ? new Date(stats.lastOrder.createdAt) : null;
    const daysSince = last ? (Date.now() - last.getTime()) / 86400000 : 999;
    if (daysSince > 90) return 'inactive';
    return 'returning';
  };

  // ── Seed Data ─────────────────────────────────────────────
  db.initialize = () => {
    // Only seed if empty
    if (db.categories.count() > 0) return;

    // Site settings
    db.saveSettings({
      siteName: 'ROOH', siteNameAr: 'روح',
      storeName: 'Souq ROOH', storeNameAr: 'سوق روح للمستحضرات التجميل',
      owner: 'Abdulrahman', phone: '01227208589',
      currency: 'EGP', currencySymbol: 'ج.م',
      language: 'ar', rtl: true,
      email: 'info@rooh.com',
      whatsapp: '01227208589',
      address: 'القاهرة، مصر',
      socialFacebook: '#', socialInstagram: '#', socialTiktok: '#',
      freeShippingThreshold: 500,
      taxRate: 0,
    });

    // Chart of Accounts
    const accounts = [
      { code: '1000', name: 'Cash & Bank', nameAr: 'النقد والبنك', type: 'asset', normal: 'debit' },
      { code: '1100', name: 'Accounts Receivable', nameAr: 'ذمم مدينة', type: 'asset', normal: 'debit' },
      { code: '1200', name: 'Inventory', nameAr: 'المخزون', type: 'asset', normal: 'debit' },
      { code: '2000', name: 'Accounts Payable', nameAr: 'ذمم دائنة', type: 'liability', normal: 'credit' },
      { code: '3000', name: 'Owner Equity', nameAr: 'حقوق الملكية', type: 'equity', normal: 'credit' },
      { code: '4100', name: 'Sales Revenue', nameAr: 'إيرادات المبيعات', type: 'revenue', normal: 'credit' },
      { code: '5100', name: 'Cost of Goods Sold', nameAr: 'تكلفة البضاعة المباعة', type: 'expense', normal: 'debit' },
      { code: '6100', name: 'Shipping Expense', nameAr: 'مصاريف الشحن', type: 'expense', normal: 'debit' },
      { code: '6200', name: 'Marketing Expense', nameAr: 'مصاريف التسويق', type: 'expense', normal: 'debit' },
      { code: '6300', name: 'Salaries', nameAr: 'المرتبات', type: 'expense', normal: 'debit' },
      { code: '6400', name: 'General Expenses', nameAr: 'مصاريف عامة', type: 'expense', normal: 'debit' },
    ];
    accounts.forEach(a => db.accounts.insert(a));

    // Shipping zones (Egyptian governorates)
    const govs = [
      { name: 'Cairo', nameAr: 'القاهرة', price: 50, days: '1-2' },
      { name: 'Giza', nameAr: 'الجيزة', price: 50, days: '1-2' },
      { name: 'Alexandria', nameAr: 'الإسكندرية', price: 65, days: '2-3' },
      { name: 'Qalyubia', nameAr: 'القليوبية', price: 55, days: '1-2' },
      { name: 'Sharqia', nameAr: 'الشرقية', price: 60, days: '2-3' },
      { name: 'Gharbia', nameAr: 'الغربية', price: 60, days: '2-3' },
      { name: 'Dakahlia', nameAr: 'الدقهلية', price: 65, days: '2-3' },
      { name: 'Beheira', nameAr: 'البحيرة', price: 65, days: '2-3' },
      { name: 'Kafr el-Sheikh', nameAr: 'كفر الشيخ', price: 65, days: '2-3' },
      { name: 'Monufia', nameAr: 'المنوفية', price: 60, days: '2-3' },
      { name: 'Faiyum', nameAr: 'الفيوم', price: 70, days: '2-3' },
      { name: 'Beni Suef', nameAr: 'بني سويف', price: 70, days: '2-3' },
      { name: 'Minya', nameAr: 'المنيا', price: 75, days: '3-4' },
      { name: 'Asyut', nameAr: 'أسيوط', price: 80, days: '3-4' },
      { name: 'Sohag', nameAr: 'سوهاج', price: 85, days: '3-5' },
      { name: 'Qena', nameAr: 'قنا', price: 85, days: '3-5' },
      { name: 'Luxor', nameAr: 'الأقصر', price: 90, days: '3-5' },
      { name: 'Aswan', nameAr: 'أسوان', price: 90, days: '4-5' },
      { name: 'Ismailia', nameAr: 'الإسماعيلية', price: 60, days: '2-3' },
      { name: 'Suez', nameAr: 'السويس', price: 65, days: '2-3' },
      { name: 'Port Said', nameAr: 'بور سعيد', price: 65, days: '2-3' },
      { name: 'Damietta', nameAr: 'دمياط', price: 65, days: '2-3' },
      { name: 'North Sinai', nameAr: 'شمال سيناء', price: 80, days: '3-5' },
      { name: 'South Sinai', nameAr: 'جنوب سيناء', price: 90, days: '4-6' },
      { name: 'Red Sea', nameAr: 'البحر الأحمر', price: 90, days: '4-6' },
      { name: 'Matrouh', nameAr: 'مطروح', price: 85, days: '3-5' },
      { name: 'New Valley', nameAr: 'الوادي الجديد', price: 90, days: '4-6' },
    ];
    govs.forEach(g => db.shipping_zones.insert(g));

    // Categories
    const cats = [
      { name: 'Skincare', nameAr: 'العناية بالبشرة', icon: '🌸', slug: 'skincare', order: 1 },
      { name: 'Haircare', nameAr: 'العناية بالشعر', icon: '💆', slug: 'haircare', order: 2 },
      { name: 'Body Care', nameAr: 'العناية بالجسم', icon: '🧴', slug: 'bodycare', order: 3 },
      { name: 'Makeup', nameAr: 'المكياج', icon: '💄', slug: 'makeup', order: 4 },
      { name: 'Perfumes', nameAr: 'العطور والعبير', icon: '🌺', slug: 'perfumes', order: 5 },
      { name: "Men's Care", nameAr: 'العناية بالرجال', icon: '🧔', slug: 'mens', order: 6 },
      { name: 'Personal Hygiene', nameAr: 'النظافة الشخصية', icon: '🧼', slug: 'hygiene', order: 7 },
      { name: 'Special Offers', nameAr: 'العروض الخاصة', icon: '🎁', slug: 'offers', order: 8, isVirtual: true },
      { name: 'New Arrivals', nameAr: 'وصل حديثاً', icon: '✨', slug: 'new', order: 9, isVirtual: true },
      { name: 'Best Sellers', nameAr: 'الأكثر مبيعاً', icon: '⭐', slug: 'bestsellers', order: 10, isVirtual: true },
    ];
    cats.forEach(c => db.categories.insert({ ...c, status: 'active' }));

    // Sample Products
    const skincareCatId = db.categories.where(c => c.slug === 'skincare')[0]?.id;
    const haircatId = db.categories.where(c => c.slug === 'haircare')[0]?.id;
    const bodyCatId = db.categories.where(c => c.slug === 'bodycare')[0]?.id;
    const perfCatId = db.categories.where(c => c.slug === 'perfumes')[0]?.id;

    const sampleProducts = [
      {
        name: 'Rose Glow Face Cream', nameAr: 'كريم الوجه ببتلات الورد',
        categoryId: skincareCatId, sku: 'SC-001', barcode: '6900001001',
        price: 350, costPrice: 120, salePrice: null,
        description: 'A luxurious daily moisturizer enriched with rose extract and hyaluronic acid.',
        descriptionAr: 'مرطب يومي فاخر غني بمستخلص الورد وحمض الهيالورونيك.',
        ingredients: 'Aqua, Rosa Damascena, Hyaluronic Acid, Glycerin, Niacinamide',
        usage: 'Apply morning and evening to cleansed skin.',
        minStock: 10, status: 'published', isNew: true, isBestSeller: false,
        rating: 4.8, reviewCount: 124, emoji: '🌹',
        sizes: ['30ml', '50ml', '100ml'],
      },
      {
        name: 'Gold Radiance Serum', nameAr: 'سيروم توهج الذهب',
        categoryId: skincareCatId, sku: 'SC-002', barcode: '6900001002',
        price: 480, costPrice: 160, salePrice: 420,
        description: 'Anti-aging serum with 24K gold particles and Vitamin C.',
        descriptionAr: 'سيروم مضاد للشيخوخة بجزيئات الذهب عيار 24 وفيتامين سي.',
        ingredients: '24K Gold, Vitamin C, Retinol, Peptides',
        usage: 'Apply 3-4 drops on clean face before moisturizer.',
        minStock: 8, status: 'published', isNew: false, isBestSeller: true,
        rating: 4.9, reviewCount: 89, emoji: '✨',
        sizes: ['30ml', '50ml'],
      },
      {
        name: 'Argan Oil Hair Mask', nameAr: 'ماسك الشعر بزيت الأركان',
        categoryId: haircatId, sku: 'HC-001', barcode: '6900002001',
        price: 280, costPrice: 90, salePrice: null,
        description: 'Deep conditioning hair mask with pure Moroccan argan oil.',
        descriptionAr: 'ماسك مرطب عميق للشعر بزيت الأركان المغربي النقي.',
        ingredients: 'Argania Spinosa Kernel Oil, Keratin, Panthenol',
        usage: 'Apply to damp hair, leave 15-30 mins, rinse.',
        minStock: 15, status: 'published', isNew: true, isBestSeller: false,
        rating: 4.7, reviewCount: 63, emoji: '💆',
        sizes: ['200ml', '500ml'],
      },
      {
        name: 'Oud Royal Parfum', nameAr: 'عطر العود الملكي',
        categoryId: perfCatId, sku: 'PF-001', barcode: '6900005001',
        price: 890, costPrice: 300, salePrice: null,
        description: 'A majestic oriental fragrance with rare oud, amber and musk.',
        descriptionAr: 'عطر شرقي مهيب بالعود النادر والعنبر والمسك.',
        ingredients: 'Aquilaria Malaccensis, Ambergris, Musk, Rose',
        usage: 'Spray on pulse points.',
        minStock: 5, status: 'published', isNew: false, isBestSeller: true,
        rating: 4.9, reviewCount: 215, emoji: '🌺',
        sizes: ['50ml', '100ml'],
      },
      {
        name: 'Shea Butter Body Lotion', nameAr: 'لوشن الجسم بزبدة الشيا',
        categoryId: bodyCatId, sku: 'BC-001', barcode: '6900003001',
        price: 195, costPrice: 65, salePrice: null,
        description: 'Rich body lotion with raw shea butter for intense hydration.',
        descriptionAr: 'لوشن جسم غني بزبدة الشيا الخام للترطيب العميق.',
        ingredients: 'Butyrospermum Parkii, Glycerin, Aloe Vera',
        usage: 'Apply generously after shower.',
        minStock: 20, status: 'published', isNew: false, isBestSeller: true,
        rating: 4.6, reviewCount: 178, emoji: '🧴',
        sizes: ['200ml', '400ml'],
      },
      {
        name: 'Natural Lip Gloss Set', nameAr: 'مجموعة ليب جلوس طبيعي',
        categoryId: db.categories.where(c => c.slug === 'makeup')[0]?.id, sku: 'MK-001', barcode: '6900004001',
        price: 220, costPrice: 70, salePrice: 180,
        description: 'Set of 6 natural lip glosses in stunning shades.',
        descriptionAr: 'مجموعة من 6 ليب جلوس طبيعية بألوان رائعة.',
        ingredients: 'Castor Oil, Vitamin E, Natural Pigments',
        usage: 'Apply to lips with applicator.',
        minStock: 12, status: 'published', isNew: true, isBestSeller: false,
        rating: 4.5, reviewCount: 47, emoji: '💄',
        sizes: ['Set of 6'],
      },
    ];
    sampleProducts.forEach(p => {
      const product = db.products.insert({ ...p, type: 'standard' });
      db.addStock(product.id, 50, 'Initial stock');
    });

    // Admin user
    db.users.insert({
      name: 'Abdulrahman', nameAr: 'عبدالرحمن',
      email: 'admin@rooh.com', phone: '01227208589',
      role: 'owner', status: 'active',
      passwordHash: 'admin123', // In real app: bcrypt hash
    });

    // Customizer Options
    const custOptions = {
      productTypes: [
        { name: 'Face Cream', nameAr: 'كريم الوجه', icon: '🌸', basePrice: 150 },
        { name: 'Body Scrub', nameAr: 'سكراب الجسم', icon: '✨', basePrice: 120 },
        { name: 'Hair Mask', nameAr: 'ماسك الشعر', icon: '💆', basePrice: 130 },
        { name: 'Lip Balm', nameAr: 'مرطب الشفاه', icon: '💋', basePrice: 80 },
        { name: 'Body Oil', nameAr: 'زيت الجسم', icon: '🧴', basePrice: 160 },
      ],
      bases: [
        { name: 'Shea Butter Base', nameAr: 'قاعدة زبدة الشيا', price: 0, safe: true },
        { name: 'Argan Oil Base', nameAr: 'قاعدة زيت الأركان', price: 20, safe: true },
        { name: 'Aloe Vera Base', nameAr: 'قاعدة الألوفيرا', price: 0, safe: true },
        { name: 'Coconut Oil Base', nameAr: 'قاعدة زيت جوز الهند', price: 10, safe: true },
      ],
      fragrances: [
        { name: 'Rose', nameAr: 'ورد', icon: '🌹', price: 30 },
        { name: 'Jasmine', nameAr: 'ياسمين', icon: '🌼', price: 30 },
        { name: 'Oud', nameAr: 'عود', icon: '🌺', price: 50 },
        { name: 'Vanilla', nameAr: 'فانيليا', icon: '🍦', price: 25 },
        { name: 'Unscented', nameAr: 'بدون عطر', icon: '✓', price: 0 },
      ],
      sizes: [
        { name: '50ml', price: 0 }, { name: '100ml', price: 40 },
        { name: '200ml', price: 80 }, { name: '500ml', price: 180 },
      ],
      packaging: [
        { name: 'Classic Jar', nameAr: 'برطمان كلاسيك', icon: '🫙', price: 0 },
        { name: 'Luxury Gold Jar', nameAr: 'برطمان ذهبي فاخر', icon: '🥇', price: 50 },
        { name: 'Pump Bottle', nameAr: 'زجاجة بمضخة', icon: '🧴', price: 30 },
        { name: 'Gift Box', nameAr: 'صندوق هدايا', icon: '🎁', price: 70 },
      ],
    };
    db.customizer_opts.insert(custOptions);

    // Sample reviews
    const reviews_data = [
      { customerName: 'سارة محمد', rating: 5, title: 'منتج رائع!', body: 'استخدمت كريم الورد وكانت النتيجة رائعة، بشرتي أصبحت ناعمة ومشرقة.', productId: null, status: 'approved', date: new Date(Date.now() - 86400000 * 3).toISOString() },
      { customerName: 'فاطمة علي', rating: 5, title: 'أفضل عطر جربته', body: 'عطر العود الملكي من روح هو الأفضل على الإطلاق، يدوم طويلاً.', productId: null, status: 'approved', date: new Date(Date.now() - 86400000 * 7).toISOString() },
      { customerName: 'نور خالد', rating: 4, title: 'جودة عالية', body: 'المنتجات ذات جودة عالية وتستحق سعرها. التوصيل كان سريعاً.', productId: null, status: 'approved', date: new Date(Date.now() - 86400000 * 14).toISOString() },
    ];
    reviews_data.forEach(r => db.reviews.insert(r));

    console.log('[ROOH DB] Database initialized with seed data.');
  };

  return db;
})();

// Initialize on load
DB.initialize();

