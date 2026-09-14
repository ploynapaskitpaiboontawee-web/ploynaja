const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyjjrbj-8p7C9MTLw4iUGA_JXOFq08Tt1QjB17o62fPz5qNEN0B3QblB_lcTZ5gQTLfBQ/exec';

const CSV_URL = 'YOUR_CSV_URL';

document.addEventListener('DOMContentLoaded', () => {

  const urlParams = new URLSearchParams(window.location.search);

  // ==========================================
  // ส่วนหน้าแสดงสินค้า
  // ==========================================

  const productList = document.getElementById('product-list');

  if (productList) {

    fetch('products.json')
      .then(res => {
        if (!res.ok) {
          throw new Error('ไม่สามารถโหลด products.json ได้');
        }
        return res.json();
      })
      .then(products => {

        const moodFilter = urlParams.get('mood') || 'all';

        renderProducts(products, moodFilter);

        const filterBar = document.getElementById('filter-bar');

        if (filterBar) {

          const activeBtn = filterBar.querySelector(
            `[data-mood="${moodFilter}"]`
          );

          if (activeBtn) {
            activeBtn.classList.add('active');
          }

          filterBar.addEventListener('click', (e) => {

            if (e.target.tagName === 'BUTTON') {

              filterBar
                .querySelectorAll('button')
                .forEach(b => b.classList.remove('active'));

              e.target.classList.add('active');

              renderProducts(
                products,
                e.target.dataset.mood
              );
            }

          });
        }

      })
      .catch(err => {
        console.error(err);

        productList.innerHTML = `
          <p style="text-align:center;">
            ไม่สามารถโหลดสินค้าได้ กรุณาลองใหม่อีกครั้ง
          </p>
        `;
      });
  }


  // ==========================================
  // แสดงสินค้า
  // ==========================================

  function renderProducts(products, filter) {

    productList.innerHTML = '';

    const filtered =
      filter === 'all'
        ? products
        : products.filter(p => p.mood === filter);

    if (filtered.length === 0) {

      productList.innerHTML = `
        <p style="text-align:center;">
          ไม่พบสินค้าในหมวดหมู่นี้
        </p>
      `;

      return;
    }

    filtered.forEach(p => {

      productList.innerHTML += `
        <div class="card">

          <span class="card-tag tag-${p.mood}">
            ${p.type}
          </span>

          <img src="${p.image}" alt="${p.name}">

          <h3>${p.name}</h3>

          <p>${p.description}</p>

          <div class="price">
            ฿${Number(p.price).toLocaleString()}
          </div>

          <a
            href="order.html?item=${encodeURIComponent(p.name)}&price=${p.price}"
            class="btn"
            style="text-align:center;"
          >
            สั่งซื้อสินค้า
          </a>

        </div>
      `;
    });
  }


  // ==========================================
  // ส่วนหน้าสั่งซื้อ
  // ==========================================

  const orderForm = document.getElementById('orderForm');

  if (orderForm) {

    const itemInput = document.getElementById('items');
    const totalInput = document.getElementById('total');

    if (urlParams.has('item') && itemInput) {
      itemInput.value = urlParams.get('item');
    }

    if (urlParams.has('price') && totalInput) {
      totalInput.value = urlParams.get('price');
    }


    orderForm.addEventListener('submit', (e) => {

      e.preventDefault();

      // ==========================================
      // ตรวจสอบข้อมูลก่อนส่ง
      // ==========================================

      const customerName =
        document.getElementById('customerName')?.value || '';

      const contact =
        document.getElementById('contact')?.value || '';

      const address =
        document.getElementById('address')?.value || '';

      const note =
        document.getElementById('note')?.value || '';

      if (!customerName || !contact || !address) {

        alert('กรุณากรอกชื่อ เบอร์โทร/LINE และที่อยู่ให้ครบ');

        return;
      }


      // ==========================================
      // เตรียมข้อมูลส่ง Google Sheet
      // ==========================================

      const payload = new URLSearchParams();

      payload.append(
        'ชื่อ-นามสกุล ผู้รับ',
        customerName
      );

      payload.append(
        'เบอร์โทรศัพท์ / LINE ID',
        contact
      );

      payload.append(
        'ที่อยู่',
        address
      );

      payload.append(
        'รายการสินค้า',
        itemInput ? itemInput.value : ''
      );

      payload.append(
        'ยอดรวมทั้งสิ้น (บาท)',
        totalInput ? totalInput.value : ''
      );

      payload.append(
        'ไซส์ที่ต้องการ / หมายเหตุเพิ่มเติม',
        note
      );


      // ==========================================
      // ปุ่มส่ง
      // ==========================================

      const submitBtn =
        orderForm.querySelector('button[type="submit"]');

      const originalText =
        submitBtn ? submitBtn.innerText : '';

      if (submitBtn) {
        submitBtn.innerText = 'กำลังส่งคำสั่งซื้อ...';
        submitBtn.disabled = true;
      }


      // ==========================================
      // ส่งไป Google Apps Script
      // ==========================================

      fetch(APPS_SCRIPT_URL, {

        method: 'POST',

        mode: 'no-cors',

        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },

        body: payload.toString()

      })
      .then(() => {

        window.location.href = 'thankyou.html';

      })
      .catch(err => {

        console.error(err);

        alert(
          'เกิดข้อผิดพลาดในการส่งข้อมูล กรุณาลองใหม่อีกครั้ง'
        );

        if (submitBtn) {
          submitBtn.innerText = originalText;
          submitBtn.disabled = false;
        }

      });

    });
  }


  // ==========================================
  // ส่วน Admin
  // ==========================================

  const ordersTableBody =
    document.querySelector('#ordersTable tbody');

  if (ordersTableBody && CSV_URL !== 'YOUR_CSV_URL') {

    fetch(CSV_URL)

      .then(res => {

        if (!res.ok) {
          throw new Error('ไม่สามารถโหลดข้อมูล CSV ได้');
        }

        return res.text();

      })

      .then(csv => {

        const rows = csv
          .split('\n')
          .slice(1);

        rows.reverse().forEach(row => {

          if (!row.trim()) return;

          const cols = row.split(',');

          ordersTableBody.innerHTML += `
            <tr>
              ${cols.map(c => `<td>${c}</td>`).join('')}
            </tr>
          `;

        });

      })

      .catch(err => {

        console.error(err);

        ordersTableBody.innerHTML = `
          <tr>
            <td colspan="10">
              ไม่สามารถโหลดข้อมูลคำสั่งซื้อได้
            </td>
          </tr>
        `;

      });
  }

});
