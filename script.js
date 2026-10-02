// ต้องใส่ <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
// ไว้ในทุกหน้า HTML "ก่อน" script.js
const SUPABASE_URL = 'https://srhknjgzowbmjpaebmds.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_N0w6k30nuEeY_dSNcsNptg_45ggyL9a'; // anon key ใส่ฝั่งหน้าเว็บได้ (ความปลอดภัยอยู่ที่ RLS)

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// กัน HTML/XSS จากข้อมูลลูกค้าและข้อมูลสินค้า
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);

  // ==========================================
  // ส่วนหน้าแสดงสินค้า
  // ==========================================
  const productList = document.getElementById('product-list');

  // แสดงเตือนเมื่อสินค้าเหลือ <= LOW_STOCK_THRESHOLD ชิ้น
  const LOW_STOCK_THRESHOLD = 3;

  function renderProducts(products, filter) {
    const filtered = filter === 'all' ? products : products.filter(p => p.mood === filter);
    productList.innerHTML = filtered.map(p => {
      const stock = p.stock === undefined || p.stock === null ? NaN : Number(p.stock);
      const hasStock = Number.isFinite(stock);
      const soldOut = hasStock && stock <= 0;
      const low = hasStock && stock > 0 && stock <= LOW_STOCK_THRESHOLD;

      const stockLabel = soldOut
        ? '<p style="color:#c00;font-weight:600;">สินค้าหมด</p>'
        : low
        ? `<p style="color:#e67e00;font-weight:600;">เหลือเพียง ${esc(stock)} ชิ้น</p>`
        : '';

      const button = soldOut
        ? '<span class="btn" style="text-align:center;opacity:.5;pointer-events:none;">สินค้าหมด</span>'
        : `<a href="order.html?item=${encodeURIComponent(p.name)}&price=${encodeURIComponent(p.price)}"
             class="btn" style="text-align:center;">สั่งซื้อสินค้า</a>`;

      return `
        <div class="card">
          <span class="card-tag tag-${esc(p.mood)}">${esc(p.mood)}</span>
          <img src="${esc(p.image)}" alt="${esc(p.name)}">
          <h3>${esc(p.name)}</h3>
          <p>${esc(p.description)}</p>
          <div class="price">฿${esc(p.price)}</div>
          ${stockLabel}
          ${button}
        </div>
      `;
    }).join('');
  }

  async function loadProducts() {
    // รูป/หมวด/คำอธิบาย อยู่ใน products.json
    let local = [];
    try {
      const res = await fetch('products.json');
      if (res.ok) local = await res.json();
    } catch (e) {
      console.warn('โหลด products.json ไม่สำเร็จ', e);
    }

    // ราคา/สต็อกล่าสุด อยู่ใน Supabase
    const { data, error } = await sb
      .from('products')
      .select('*')
      .order('id', { ascending: true });

    if (error || !data || data.length === 0) {
      console.warn('โหลดจาก Supabase ไม่สำเร็จ ใช้ products.json แทน', error);
      if (local.length === 0) throw new Error('โหลดสินค้าไม่สำเร็จ');
      return local;
    }

    // รวมข้อมูลโดยจับคู่ด้วยชื่อสินค้า (Supabase ทับค่าที่ซ้ำกัน)
    const key = (v) => String(v ?? '').trim().toLowerCase();
    const localByName = new Map(local.map(p => [key(p.name), p]));
    return data.map(row => {
      const base = localByName.get(key(row.name)) || {};
      const clean = Object.fromEntries(
        Object.entries(row).filter(([, v]) => v !== null && v !== '')
      );
      return { ...base, ...clean };
    });
  }

  if (productList) {
    loadProducts()
      .then(products => {
        const moodFilter = urlParams.get('mood') || 'all';
        renderProducts(products, moodFilter);

        const filterBar = document.getElementById('filter-bar');
        if (filterBar) {
          const activeBtn = filterBar.querySelector(`[data-mood="${CSS.escape(moodFilter)}"]`);
          if (activeBtn) activeBtn.classList.add('active');

          filterBar.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON') {
              filterBar.querySelectorAll('button').forEach(b => b.classList.remove('active'));
              e.target.classList.add('active');
              renderProducts(products, e.target.dataset.mood);
            }
          });
        }
      })
      .catch(err => {
        console.error(err);
        productList.innerHTML = '<p>โหลดสินค้าไม่สำเร็จ กรุณารีเฟรชหน้า</p>';
      });
  }

  // ==========================================
  // ส่วนหน้าสั่งซื้อ (บันทึกลง Supabase)
  // ==========================================
  const orderForm = document.getElementById('orderForm');
  if (orderForm) {
    const itemInput = document.getElementById('items');
    const totalInput = document.getElementById('total');
    if (urlParams.has('item')) itemInput.value = urlParams.get('item');
    if (urlParams.has('price')) totalInput.value = urlParams.get('price');

    orderForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const val = (id) => document.getElementById(id)?.value.trim() || '-';

      const order = {
        customer_name: val('customerName'),
        contact: val('contact'),
        address: val('address'),
        items: itemInput?.value || '-',
        total: Number(totalInput?.value) || 0,
        note: val('note'),
      };

      const submitBtn = orderForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerText;
      submitBtn.innerText = 'กำลังส่งคำสั่งซื้อ...';
      submitBtn.disabled = true;

      // หมายเหตุ: ไม่ใส่ .select() ต่อท้าย เพราะ anon ไม่มีสิทธิ์อ่านตาราง orders
      const { error } = await sb.from('orders').insert(order);

      if (error) {
        console.error(error);
        alert('เกิดข้อผิดพลาดในการส่งข้อมูล กรุณาลองใหม่อีกครั้ง (สินค้าอาจหมดแล้ว)');
        submitBtn.innerText = originalText;
        submitBtn.disabled = false;
        return;
      }
      window.location.href = 'thankyou.html';
    });
  }

  // ==========================================
  // ส่วน Admin (ต้องล็อกอินก่อน)
  // ==========================================
  const ordersTableBody = document.querySelector('#ordersTable tbody');
  if (ordersTableBody) {
    (async () => {
      let { data: { session } } = await sb.auth.getSession();

      if (!session) {
        const email = prompt('อีเมลแอดมิน');
        const password = email ? prompt('รหัสผ่าน') : null;
        if (!email || !password) {
          ordersTableBody.innerHTML = '<tr><td colspan="8">กรุณาล็อกอินเพื่อดูออเดอร์</td></tr>';
          return;
        }
        const { error: authError } = await sb.auth.signInWithPassword({ email, password });
        if (authError) {
          alert('ล็อกอินไม่สำเร็จ: ' + authError.message);
          return;
        }
      }

      const { data, error } = await sb
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error(error);
        ordersTableBody.innerHTML = '<tr><td colspan="8">โหลดออเดอร์ไม่สำเร็จ</td></tr>';
        return;
      }

      // ลำดับคอลัมน์ต้องตรงกับหัวตารางใน admin.html
      ordersTableBody.innerHTML = data.map(o => `
        <tr>
          <td>${esc(new Date(o.created_at).toLocaleString('th-TH'))}</td>
          <td>${esc(o.customer_name)}</td>
          <td>${esc(o.contact)}</td>
          <td>${esc(o.address)}</td>
          <td>${esc(o.items)}</td>
          <td>${esc(o.total)}</td>
          <td>${esc(o.note)}</td>
        </tr>
      `).join('');
    })();
  }
});
