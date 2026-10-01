// ==========================================
// ตั้งค่า
// ==========================================
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyjjrbj-8p7C9MTLw4iUGA_JXOFq08Tt1QjB17o62fPz5qNEN0B3QblB_lcTZ5gQTLfBQ/exec';
const CSV_URL = 'YOUR_CSV_URL';

// Supabase (anon key เปิดเผยในหน้าเว็บได้ แต่ห้ามใส่ Bot Token / service role key)
const SUPABASE_URL = 'https://YOUR_PROJECT_REF.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/place-order`;

document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);

  // ==========================================
  // ส่วนหน้าแสดงสินค้า
  // ==========================================
  const productList = document.getElementById('product-list');
  if (productList) {
    // ดึงรายการสินค้าจาก products.json และสต๊อกจาก Supabase พร้อมกัน
    const stockPromise = fetch(`${SUPABASE_URL}/rest/v1/products?select=name,stock`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`
      }
    })
      .then(res => (res.ok ? res.json() : null))
      .catch(() => null); // ถ้าดึงสต๊อกไม่ได้ ก็ยังแสดงสินค้าตามปกติ

    Promise.all([fetch('products.json').then(res => res.json()), stockPromise])
      .then(([products, stocks]) => {
        if (Array.isArray(stocks)) {
          const stockMap = {};
          stocks.forEach(s => { stockMap[s.name] = s.stock; });
          products.forEach(p => { p.stock = stockMap[p.name] ?? 0; });
        }

        const moodFilter = urlParams.get('mood') || 'all';
        renderProducts(products, moodFilter);

        const filterBar = document.getElementById('filter-bar');
        if (filterBar) {
          const activeBtn = filterBar.querySelector(`[data-mood="${moodFilter}"]`);
          if (activeBtn) activeBtn.classList.add('active');

          filterBar.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON') {
              filterBar.querySelectorAll('button').forEach(b => b.classList.remove('active'));
              e.target.classList.add('active');
              renderProducts(products, e.target.dataset.mood);
            }
          });
        }
      });
  }

  function renderProducts(products, filter) {
    productList.innerHTML = '';
    const filtered = filter === 'all' ? products : products.filter(p => p.mood === filter);
    filtered.forEach(p => {
      // p.stock จะเป็น undefined ถ้าดึงสต๊อกไม่ได้ -> ให้สั่งได้ตามปกติ (ฝั่ง server ตรวจซ้ำอีกที)
      const soldOut = p.stock !== undefined && p.stock <= 0;
      const buyButton = soldOut
        ? `<span class="btn" style="text-align:center; opacity:.5; pointer-events:none;">สินค้าหมด</span>`
        : `<a href="order.html?item=${encodeURIComponent(p.name)}&price=${p.price}" class="btn" style="text-align:center;">สั่งซื้อสินค้า</a>`;

      productList.innerHTML += `
        <div class="card">
          <span class="card-tag tag-${p.mood}">${p.mood}</span>
          <img src="${p.image}" alt="${p.name}">
          <h3>${p.name}</h3>
          <p>${p.description}</p>
          <div class="price">฿${p.price}</div>
          ${buyButton}
        </div>
      `;
    });
  }

  // ==========================================
  // ส่วนหน้าสั่งซื้อ
  // 1) Supabase: ตัดสต๊อก + ส่ง Telegram
  // 2) Apps Script: บันทึกลง Google Sheet
  // ==========================================
  const orderForm = document.getElementById('orderForm');
  if (orderForm) {
    const itemInput = document.getElementById('items');
    const totalInput = document.getElementById('total');
    if (urlParams.has('item')) itemInput.value = urlParams.get('item');
    if (urlParams.has('price')) totalInput.value = urlParams.get('price');

    orderForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const name = document.getElementById('customerName').value;
      const contact = document.getElementById('contact').value;
      const address = document.getElementById('address').value; // order.html ต้องมี id="address"
      const item = itemInput.value;
      const total = totalInput.value;
      const note = document.getElementById('note').value;

      const submitBtn = orderForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerText;
      submitBtn.innerText = 'กำลังส่งคำสั่งซื้อ...';
      submitBtn.disabled = true;

      try {
        // --- 1) Supabase ---
        const res = await fetch(FUNCTION_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({ name, contact, address, item, note })
        });
        const result = await res.json();

        if (!result.ok) {
          // สินค้าหมด หรือสั่งไม่สำเร็จ -> ไม่ส่งเข้า Sheet
          alert(result.message || 'สั่งซื้อไม่สำเร็จ');
          submitBtn.innerText = originalText;
          submitBtn.disabled = false;
          return;
        }

        // --- 2) Apps Script (Google Sheet) ---
        // ถ้าขั้นนี้พัง ออเดอร์ก็ยังสำเร็จ (ตัดสต๊อกไปแล้ว)
        try {
          const payload = new URLSearchParams();
          payload.append('ชื่อ-นามสกุล ผู้รับ', name);
          payload.append('เบอร์โทรศัพท์ / LINE ID', contact);
          payload.append('ที่อยู่', address);
          payload.append('รายการสินค้า', item);
          payload.append('ยอดรวมทั้งสิ้น (บาท)', total);
          payload.append('ไซส์ที่ต้องการ / หมายเหตุเพิ่มเติม', note);

          await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: payload.toString()
          });
        } catch (sheetErr) {
          console.error('Apps Script error', sheetErr);
        }

        window.location.href = 'thankyou.html';
      } catch (err) {
        console.error(err);
        alert('เกิดข้อผิดพลาดในการส่งข้อมูล กรุณาลองใหม่อีกครั้ง');
        submitBtn.innerText = originalText;
        submitBtn.disabled = false;
      }
    });
  }

  // ==========================================
  // ส่วน Admin
  // ==========================================
  const ordersTableBody = document.querySelector('#ordersTable tbody');
  if (ordersTableBody) {
    fetch(CSV_URL).then(res => res.text()).then(csv => {
      const rows = parseCSV(csv).slice(1);
      rows.reverse().forEach(cols => {
        if (cols.join('').trim() === '') return;
        ordersTableBody.innerHTML += `<tr>${cols.map(c => `<td>${escapeHTML(c)}</td>`).join('')}</tr>`;
      });
    });
  }
});

// อ่าน CSV ที่มีเครื่องหมายคอมมา/ขึ้นบรรทัดใหม่อยู่ในช่องที่ครอบด้วย "..." (เช่น ที่อยู่)
function parseCSV(text) {
  const rows = [];
  let row = [], cur = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cur += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(cur); cur = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else {
      cur += c;
    }
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

// กันข้อมูลลูกค้าที่มีอักขระ HTML ไม่ให้ทำงานเป็นโค้ดในหน้า Admin
function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}
