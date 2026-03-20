/* ── State ── */
let allInvoices = [];
let allClients = [];
let currentStatusFilter = 'all';

/* ── Helpers ── */
const $ = id => document.getElementById(id);
const fmt = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);

async function api(method, url, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function toast(msg, type = '') {
  const el = $('toast');
  el.textContent = msg;
  el.className = 'toast show ' + type;
  setTimeout(() => { el.className = 'toast'; }, 3000);
}

function statusBadge(status) {
  return `<span class="badge badge-${status}">${status}</span>`;
}

/* ── Navigation ── */
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  $(`view-${name}`).classList.add('active');
  document.querySelector(`[data-view="${name}"]`).classList.add('active');
  if (name === 'dashboard') { loadSummary(); loadRecentInvoices(); }
  if (name === 'invoices') loadInvoices();
  if (name === 'clients') loadClients();
}

document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    showView(link.dataset.view);
  });
});

/* ── Dashboard ── */
async function loadSummary() {
  const s = await api('GET', '/summary');
  $('stat-total').textContent = fmt(s.total_invoiced);
  $('stat-paid').textContent = fmt(s.total_paid);
  $('stat-pending').textContent = fmt(s.total_pending);
  $('stat-overdue').textContent = fmt(s.total_overdue);
}

async function loadRecentInvoices() {
  const invs = await api('GET', '/invoices');
  const recent = invs.slice(0, 5);
  const el = $('dashboard-invoice-list');
  if (!recent.length) { el.innerHTML = '<p style="color:var(--text-muted);font-size:13px">No invoices yet.</p>'; return; }
  el.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Invoice #</th><th>Client</th><th>Amount</th><th>Due Date</th><th>Status</th></tr></thead>
      <tbody>${recent.map(inv => `
        <tr>
          <td class="invoice-num">${inv.invoice_number}</td>
          <td>${inv.client_name}</td>
          <td class="amount">${fmt(inv.amount)}</td>
          <td>${inv.due_date || '—'}</td>
          <td>${statusBadge(inv.status)}</td>
        </tr>`).join('')}</tbody>
    </table>`;
}

/* ── Invoices ── */
async function loadInvoices(status = currentStatusFilter) {
  currentStatusFilter = status;
  const url = status === 'all' ? '/invoices' : `/invoices?status=${status}`;
  allInvoices = await api('GET', url);
  renderInvoices(allInvoices);
}

function renderInvoices(invoices) {
  const tbody = $('invoices-tbody');
  const empty = $('invoices-empty');
  if (!invoices.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  const pct = inv => Math.min(100, Math.round((inv.amount_paid / inv.amount) * 100));
  tbody.innerHTML = invoices.map(inv => `
    <tr>
      <td class="invoice-num">${inv.invoice_number}</td>
      <td>
        <div style="font-weight:500">${inv.client_name}</div>
        <div style="font-size:11px;color:var(--text-muted)">${inv.client_company || ''}</div>
      </td>
      <td style="max-width:180px;color:var(--text-muted);font-size:13px">${inv.description || '—'}</td>
      <td class="amount">${fmt(inv.amount)}</td>
      <td>
        <div style="font-size:12px">${fmt(inv.amount_paid)} / ${fmt(inv.amount)}</div>
        <div class="progress-wrap"><div class="progress-bar" style="width:${pct(inv)}%"></div></div>
      </td>
      <td style="font-size:13px">${inv.due_date || '—'}</td>
      <td>${statusBadge(inv.status)}</td>
      <td>
        <div class="action-btns">
          <button class="btn-icon success" title="Record payment" onclick="openPaymentModal(${inv.id}, '${inv.invoice_number}', ${inv.amount}, ${inv.amount_paid})">💳</button>
          <button class="btn-icon" title="Edit" onclick="openEditInvoiceModal(${inv.id})">✏️</button>
          <button class="btn-icon danger" title="Delete" onclick="deleteInvoice(${inv.id}, '${inv.invoice_number}')">🗑️</button>
        </div>
      </td>
    </tr>`).join('');
}

function filterInvoices() {
  const q = $('invoice-search').value.toLowerCase();
  const filtered = allInvoices.filter(inv =>
    inv.invoice_number.toLowerCase().includes(q) ||
    inv.client_name.toLowerCase().includes(q) ||
    (inv.description || '').toLowerCase().includes(q)
  );
  renderInvoices(filtered);
}

document.querySelectorAll('.filter-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    loadInvoices(tab.dataset.status);
  });
});

/* ── Invoice Modal ── */
async function openCreateInvoiceModal() {
  await populateClientSelect();
  $('invoice-modal-title').textContent = 'New Invoice';
  $('invoice-form').reset();
  $('invoice-edit-id').value = '';
  $('inv-due-date').value = today();
  const nums = allInvoices.map(i => {
    const m = i.invoice_number.match(/(\d+)$/);
    return m ? parseInt(m[1]) : 0;
  });
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  $('inv-number').value = `INV-${String(next).padStart(3, '0')}`;
  $('modal-invoice').style.display = 'flex';
}

async function openEditInvoiceModal(id) {
  await populateClientSelect();
  const inv = allInvoices.find(i => i.id === id);
  if (!inv) return;
  $('invoice-modal-title').textContent = 'Edit Invoice';
  $('invoice-edit-id').value = inv.id;
  $('inv-number').value = inv.invoice_number;
  $('inv-number').readOnly = true;
  $('inv-client').value = inv.client_id;
  $('inv-description').value = inv.description || '';
  $('inv-amount').value = inv.amount;
  $('inv-due-date').value = inv.due_date || '';
  $('inv-status').value = inv.status;
  $('modal-invoice').style.display = 'flex';
}

async function populateClientSelect() {
  allClients = await api('GET', '/clients');
  const sel = $('inv-client');
  sel.innerHTML = '<option value="">Select client...</option>' +
    allClients.map(c => `<option value="${c.id}">${c.name}${c.company ? ' — ' + c.company : ''}</option>`).join('');
}

async function submitInvoiceForm(e) {
  e.preventDefault();
  const editId = $('invoice-edit-id').value;
  const payload = {
    client_id: parseInt($('inv-client').value),
    invoice_number: $('inv-number').value.trim(),
    description: $('inv-description').value.trim(),
    amount: parseFloat($('inv-amount').value),
    due_date: $('inv-due-date').value,
    status: $('inv-status').value,
  };
  try {
    if (editId) {
      await api('PUT', `/invoices/${editId}`, payload);
      toast('Invoice updated', 'success');
    } else {
      await api('POST', '/invoices', payload);
      toast('Invoice created', 'success');
    }
    closeModal('modal-invoice');
    $('inv-number').readOnly = false;
    loadInvoices();
    loadSummary();
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteInvoice(id, num) {
  if (!confirm(`Delete invoice ${num}? This also removes its payment history.`)) return;
  try {
    await api('DELETE', `/invoices/${id}`);
    toast('Invoice deleted');
    loadInvoices();
    loadSummary();
  } catch (err) { toast(err.message, 'error'); }
}

/* ── Payment Modal ── */
async function openPaymentModal(invoiceId, invoiceNum, total, paid) {
  $('payment-invoice-id').value = invoiceId;
  $('pay-date').value = today();
  $('pay-amount').value = Math.max(0, total - paid).toFixed(2);
  $('pay-notes').value = '';

  const remaining = total - paid;
  $('payment-invoice-info').innerHTML = `
    <strong>${invoiceNum}</strong><br>
    Total: ${fmt(total)} &nbsp;|&nbsp; Paid: ${fmt(paid)} &nbsp;|&nbsp;
    <span style="color:${remaining > 0 ? 'var(--red)' : 'var(--green)'}">
      ${remaining > 0 ? 'Due: ' + fmt(remaining) : 'Fully paid ✓'}
    </span>`;

  const payments = await api('GET', `/payments/${invoiceId}`);
  const hist = $('payment-history-list');
  if (!payments.length) {
    hist.innerHTML = '<p class="no-payments">No payments recorded yet</p>';
  } else {
    hist.innerHTML = payments.map(p => `
      <div class="payment-row">
        <span>${p.payment_date}${p.notes ? ' · ' + p.notes : ''}</span>
        <span class="pay-amount">${fmt(p.amount_paid)}</span>
      </div>`).join('');
  }
  $('modal-payment').style.display = 'flex';
}

async function submitPaymentForm(e) {
  e.preventDefault();
  const payload = {
    invoice_id: parseInt($('payment-invoice-id').value),
    amount_paid: parseFloat($('pay-amount').value),
    payment_date: $('pay-date').value,
    notes: $('pay-notes').value.trim(),
  };
  try {
    await api('POST', '/payments', payload);
    toast('Payment recorded', 'success');
    closeModal('modal-payment');
    loadInvoices();
    loadSummary();
  } catch (err) { toast(err.message, 'error'); }
}

/* ── Clients ── */
async function loadClients() {
  allClients = await api('GET', '/clients');
  const grid = $('clients-grid');
  if (!allClients.length) {
    grid.innerHTML = '<p style="color:var(--text-muted)">No clients yet.</p>';
    return;
  }
  grid.innerHTML = allClients.map(c => `
    <div class="card client-card">
      <div class="client-avatar">${c.name.charAt(0).toUpperCase()}</div>
      <div class="client-name">${c.name}</div>
      ${c.company ? `<div class="client-company">${c.company}</div>` : ''}
      ${c.email ? `<div class="client-email">${c.email}</div>` : ''}
    </div>`).join('');
}

function openCreateClientModal() {
  $('client-form').reset();
  $('modal-client').style.display = 'flex';
}

async function submitClientForm(e) {
  e.preventDefault();
  const payload = {
    name: $('client-name').value.trim(),
    company: $('client-company').value.trim(),
    email: $('client-email').value.trim(),
  };
  try {
    await api('POST', '/clients', payload);
    toast('Client added', 'success');
    closeModal('modal-client');
    loadClients();
  } catch (err) { toast(err.message, 'error'); }
}

/* ── Modal close ── */
function closeModal(id) {
  $(id).style.display = 'none';
}

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.style.display = 'none';
  });
});

/* ── Init ── */
(async () => {
  await loadSummary();
  await loadRecentInvoices();
})();
