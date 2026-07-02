const state = {
  marka: [],
  altKategori: [],
  segment: [],
  lifestyleGrup: [],
  parameters: []
};

function toast(message, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = `toast show ${type}`;
  setTimeout(() => { el.className = 'toast'; }, 3000);
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

function fillSelect(select, items, valueKey, labelKey, includeEmpty) {
  select.innerHTML = '';
  if (includeEmpty) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Tümü';
    select.appendChild(opt);
  }
  items.forEach((item) => {
    const opt = document.createElement('option');
    opt.value = item[valueKey];
    opt.textContent = `${item.ad} (#${item[valueKey]})`;
    select.appendChild(opt);
  });
}

async function loadRefData() {
  const [marka, altKategori, segment, lifestyleGrup] = await Promise.all([
    api('/api/ref/marka'),
    api('/api/ref/alt-kategori'),
    api('/api/ref/segment'),
    api('/api/ref/lifestyle-grup')
  ]);
  state.marka = marka;
  state.altKategori = altKategori;
  state.segment = segment;
  state.lifestyleGrup = lifestyleGrup;

  fillSelect(document.getElementById('marka'), marka, 'marka_id', 'ad', false);
  fillSelect(document.getElementById('altKategori'), altKategori, 'alt_kategori_id', 'ad', false);
  fillSelect(document.getElementById('segment'), segment, 'segment_id', 'ad', false);
  fillSelect(document.getElementById('lifestyleGrup'), lifestyleGrup, 'lifestyle_grup_id', 'ad', false);

  fillSelect(document.getElementById('filter-marka'), marka, 'marka_id', 'ad', true);
  fillSelect(document.getElementById('filter-alt-kategori'), altKategori, 'alt_kategori_id', 'ad', true);
}

async function loadSettings() {
  const settings = await api('/api/settings');
  const container = document.getElementById('settings-list');
  container.innerHTML = '';
  settings.forEach((s) => {
    const field = document.createElement('div');
    field.className = 'form-field';
    field.innerHTML = `
      <label>${s.key}</label>
      <div style="display:flex; gap:6px;">
        <input type="text" value="${s.value}" data-key="${s.key}" class="setting-input">
        <button class="btn btn-secondary btn-small" data-save-key="${s.key}">Kaydet</button>
      </div>
    `;
    container.appendChild(field);
  });

  container.querySelectorAll('[data-save-key]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const key = btn.getAttribute('data-save-key');
      const input = container.querySelector(`.setting-input[data-key="${key}"]`);
      try {
        await api(`/api/settings/${encodeURIComponent(key)}`, {
          method: 'PUT',
          body: JSON.stringify({ value: input.value })
        });
        toast(`${key} güncellendi.`);
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
}

function renderParameters() {
  const tbody = document.getElementById('parameter-table-body');
  const emptyState = document.getElementById('empty-state');
  tbody.innerHTML = '';

  if (!state.parameters.length) {
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  state.parameters.forEach((p) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${p.marka_ad || p.marka_id}</td>
      <td>${p.alt_kategori_ad || p.alt_kategori_id}</td>
      <td>${p.segment_ad || p.segment_id}</td>
      <td>${p.lifestyle_grup_ad || p.lifestyle_grup_id}</td>
      <td>${Number(p.mu).toFixed(2)}</td>
      <td>${Number(p.sarf).toFixed(3)}</td>
      <td>${new Date(p.updated_at).toLocaleString('tr-TR')}</td>
      <td class="actions-cell">
        <button class="btn btn-secondary btn-small" data-edit="${p.id}">Düzenle</button>
        <button class="btn btn-danger btn-small" data-delete="${p.id}">Sil</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => startEdit(Number(btn.getAttribute('data-edit'))));
  });
  tbody.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', () => deleteParameter(Number(btn.getAttribute('data-delete'))));
  });
}

async function loadParameters() {
  const markaId = document.getElementById('filter-marka').value;
  const altKategoriId = document.getElementById('filter-alt-kategori').value;
  const qs = new URLSearchParams();
  if (markaId) qs.set('markaId', markaId);
  if (altKategoriId) qs.set('altKategoriId', altKategoriId);

  state.parameters = await api(`/api/parameters${qs.toString() ? '?' + qs.toString() : ''}`);
  renderParameters();
}

function startEdit(id) {
  const p = state.parameters.find((x) => x.id === id);
  if (!p) return;

  document.getElementById('parameter-id').value = p.id;
  document.getElementById('marka').value = p.marka_id;
  document.getElementById('altKategori').value = p.alt_kategori_id;
  document.getElementById('segment').value = p.segment_id;
  document.getElementById('lifestyleGrup').value = p.lifestyle_grup_id;
  document.getElementById('mu').value = p.mu;
  document.getElementById('sarf').value = p.sarf;

  document.getElementById('form-title').textContent = `Parametre Düzenle (#${p.id})`;
  document.getElementById('submit-btn').textContent = 'Güncelle';
  document.getElementById('cancel-edit-btn').style.display = 'inline-block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetForm() {
  document.getElementById('parameter-form').reset();
  document.getElementById('parameter-id').value = '';
  document.getElementById('form-title').textContent = 'Yeni Parametre Ekle';
  document.getElementById('submit-btn').textContent = 'Kaydet';
  document.getElementById('cancel-edit-btn').style.display = 'none';
}

async function deleteParameter(id) {
  if (!confirm('Bu parametreyi silmek istediğinize emin misiniz?')) return;
  try {
    await api(`/api/parameters/${id}`, { method: 'DELETE' });
    toast('Kayıt silindi.');
    await loadParameters();
  } catch (err) {
    toast(err.message, 'error');
  }
}

document.getElementById('parameter-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const id = document.getElementById('parameter-id').value;
  const payload = {
    markaId: Number(document.getElementById('marka').value),
    altKategoriId: Number(document.getElementById('altKategori').value),
    segmentId: Number(document.getElementById('segment').value),
    lifestyleGrupId: Number(document.getElementById('lifestyleGrup').value),
    mu: Number(document.getElementById('mu').value),
    sarf: Number(document.getElementById('sarf').value)
  };

  try {
    if (id) {
      await api(`/api/parameters/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      toast('Kayıt güncellendi.');
    } else {
      await api('/api/parameters', { method: 'POST', body: JSON.stringify(payload) });
      toast('Kayıt eklendi.');
    }
    resetForm();
    await loadParameters();
  } catch (err) {
    toast(err.message, 'error');
  }
});

document.getElementById('cancel-edit-btn').addEventListener('click', resetForm);
document.getElementById('filter-marka').addEventListener('change', loadParameters);
document.getElementById('filter-alt-kategori').addEventListener('change', loadParameters);

document.getElementById('sync-plm-btn').addEventListener('click', async () => {
  const btn = document.getElementById('sync-plm-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Senkronize ediliyor...';
  try {
    const result = await api('/api/ref/sync-from-plm', { method: 'POST' });
    const s = result.synced;
    toast(`PLM senkronizasyonu tamam: Marka ${s.marka}, Alt Kategori ${s.altKategori}, Segment ${s.segment}, LifeStyle ${s.lifestyleGrup}`);
    await loadRefData();
    await loadParameters();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = "🔄 PLM'den İsim Listelerini Senkronize Et";
  }
});

(async function init() {
  try {
    await loadRefData();
    await loadParameters();
    await loadSettings();
  } catch (err) {
    toast(err.message, 'error');
  }
})();
