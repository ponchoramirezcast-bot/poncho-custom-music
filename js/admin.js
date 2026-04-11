/* ============================================================
   PONCHO CUSTOM MUSIC — Admin Dashboard
   Auth, pedidos table, upload audio, confirm payment
   ============================================================ */

const STORAGE_BUCKET = 'audios';
let allPedidos = [];
let currentTab = 'all';
let uploadPedidoId = null;

/* ---- Auth ------------------------------------------------ */
async function checkAuth() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    showDashboard();
  } else {
    // Already showing login by default
  }
}

async function login() {
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const btn      = document.getElementById('loginBtn');
  const text     = document.getElementById('loginText');
  const spinner  = document.getElementById('loginSpinner');
  const errEl    = document.getElementById('loginError');

  if (!email || !password) {
    errEl.textContent = 'Ingresa correo y contraseña.';
    errEl.classList.remove('hidden');
    return;
  }

  btn.disabled = true;
  text.classList.add('hidden');
  spinner.classList.remove('hidden');
  errEl.classList.add('hidden');

  const { error } = await sb.auth.signInWithPassword({ email, password });

  if (error) {
    errEl.textContent = 'Correo o contraseña incorrectos.';
    errEl.classList.remove('hidden');
    btn.disabled = false;
    text.classList.remove('hidden');
    spinner.classList.add('hidden');
  } else {
    showDashboard();
  }
}

async function logout() {
  await sb.auth.signOut();
  document.getElementById('dashboard').classList.remove('visible');
  document.getElementById('mainNav').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
}

function showDashboard() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('mainNav').style.display = 'flex';
  document.getElementById('dashboard').classList.add('visible');
  loadPedidos();
}

/* ---- Load pedidos ---------------------------------------- */
async function loadPedidos() {
  const tbody = document.getElementById('pedidosTbody');
  tbody.innerHTML = `<tr><td colspan="12" class="no-pedidos"><div class="spinner spinner-sm" style="margin:0 auto"></div></td></tr>`;

  try {
    const { data, error } = await sb
      .from('pedidos')
      .select('*')
      .order('creado_en', { ascending: false });

    if (error) throw error;

    allPedidos = data || [];
    updateStats();
    renderTable(currentTab);

  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="12" class="no-pedidos" style="color:var(--neon-pink)">Error al cargar pedidos.</td></tr>`;
    showToast('Error al cargar pedidos.', 'error');
  }
}

function updateStats() {
  const pend = allPedidos.filter(p => p.estado === 'pendiente').length;
  const comp = allPedidos.filter(p => p.estado === 'completado').length;
  const pag  = allPedidos.filter(p => p.estado === 'pagado').length;

  document.getElementById('statTotal').textContent = allPedidos.length;
  document.getElementById('statPend').textContent  = pend;
  document.getElementById('statComp').textContent  = comp;
  document.getElementById('statPag').textContent   = pag;
}

function renderTable(tab) {
  const tbody = document.getElementById('pedidosTbody');
  const list  = tab === 'all' ? allPedidos : allPedidos.filter(p => p.estado === tab);

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="12" class="no-pedidos">No hay pedidos${tab !== 'all' ? ` con estado "${tab}"` : ''}.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(p => {
    const actions = buildActions(p);
    const addons  = Array.isArray(p.addons) && p.addons.length ? p.addons.join(', ') : '—';
    const descCorta = p.descripcion ? escHtml(p.descripcion.slice(0, 80)) + (p.descripcion.length > 80 ? '…' : '') : '—';
    return `
      <tr>
        <td class="id-cell">${p.id.slice(0, 8)}…</td>
        <td><strong>${escHtml(p.cliente_nombre)}</strong><br><span style="font-size:0.78rem;color:var(--text-dim)">${addons}</span></td>
        <td class="col-email" style="font-size:0.82rem">${escHtml(p.cliente_email)}</td>
        <td class="col-telefono" style="font-size:0.82rem">${escHtml(p.cliente_telefono || '—')}</td>
        <td style="font-size:0.82rem">${escHtml(p.tipo_tema)}</td>
        <td class="col-mood" style="font-size:0.82rem">${escHtml(p.mood || '—')}</td>
        <td><span style="font-family:var(--font-label);font-size:0.62rem;color:var(--text-dim)">${p.plan || 'basico'}</span></td>
        <td><span class="badge badge-${p.estado}">${p.estado}</span></td>
        <td style="font-family:var(--font-label);font-size:0.78rem;color:var(--neon-cyan)">${p.precio ? '$' + p.precio : '—'}</td>
        <td style="font-size:0.78rem;color:var(--text-dim);white-space:nowrap">${formatDate(p.creado_en)}</td>
        <td>
          <span class="desc-preview" title="${escHtml(p.descripcion || '')}" style="font-size:0.78rem;color:var(--text-dim);display:block;max-width:200px;cursor:help">${descCorta}</span>
        </td>
        <td><div class="action-btns">${actions}</div></td>
      </tr>
    `;
  }).join('');

  // Attach action listeners
  tbody.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const { action, id } = btn.dataset;
      if (action === 'upload')  openUploadModal(id);
      if (action === 'pago')    confirmarPago(id);
      if (action === 'escuchar') {
        const p = allPedidos.find(x => x.id === id);
        if (p) window.open(`escuchar.html?token=${p.token_descarga}`, '_blank');
      }
    });
  });
}

function buildActions(p) {
  let html = '';
  if (p.estado === 'pendiente') {
    html += `<button class="btn-xs btn-xs-cyan" data-action="upload" data-id="${p.id}">↑ Subir Audio</button>`;
  }
  if (p.estado === 'completado') {
    html += `<button class="btn-xs btn-xs-green" data-action="pago" data-id="${p.id}">✓ Confirmar Pago</button>`;
    html += `<button class="btn-xs btn-xs-cyan" data-action="escuchar" data-id="${p.id}">▶ Ver Link</button>`;
  }
  if (p.estado === 'pagado') {
    html += `<button class="btn-xs btn-xs-cyan" data-action="escuchar" data-id="${p.id}">▶ Ver Link</button>`;
  }
  return html || '<span class="btn-xs btn-xs-dim">—</span>';
}

/* ---- Upload Modal ---------------------------------------- */
function openUploadModal(pedidoId) {
  uploadPedidoId = pedidoId;
  const p = allPedidos.find(x => x.id === pedidoId);
  if (p) {
    document.getElementById('uploadPedidoInfo').textContent =
      `Cliente: ${p.cliente_nombre} | ${p.tipo_tema} | ${p.mood || ''} | Plan: ${p.plan}`;
    document.getElementById('finalPrecio').value = p.precio || (p.plan === 'plus' ? 299 : 200);
    document.getElementById('nombreCancion').value = p.nombre_cancion || '';
  }
  document.getElementById('selectedFileName').textContent = '';
  document.getElementById('selectedFileName2').textContent = '';
  document.getElementById('audioFile').value = '';
  document.getElementById('audioFile2').value = '';
  document.getElementById('uploadProgress').classList.add('hidden');
  document.getElementById('uploadProgressFill').style.width = '0%';
  document.getElementById('uploadModal').classList.add('open');
}

function closeUploadModal() {
  document.getElementById('uploadModal').classList.remove('open');
  uploadPedidoId = null;
}

async function doUpload() {
  const file    = document.getElementById('audioFile').files[0];
  const file2   = document.getElementById('audioFile2').files[0];
  const precio  = parseFloat(document.getElementById('finalPrecio').value) || 0;
  const nombre  = document.getElementById('nombreCancion').value.trim();

  if (!file) { showToast('Selecciona al menos el archivo de Versión 1.', 'error'); return; }
  if (!uploadPedidoId) return;

  const uploadText    = document.getElementById('uploadText');
  const uploadSpinner = document.getElementById('uploadSpinner');
  const confirmBtn    = document.getElementById('confirmUpload');
  const progressWrap  = document.getElementById('uploadProgress');
  const progressFill  = document.getElementById('uploadProgressFill');

  confirmBtn.disabled = true;
  uploadText.classList.add('hidden');
  uploadSpinner.classList.remove('hidden');
  progressWrap.classList.remove('hidden');

  try {
    // 1. Upload version 1
    const ext1  = file.name.split('.').pop();
    const path1 = `pedidos/${uploadPedidoId}/audio.${ext1}`;
    const { error: upErr1 } = await sb.storage
      .from(STORAGE_BUCKET).upload(path1, file, { upsert: true });
    if (upErr1) throw upErr1;
    progressFill.style.width = '40%';

    // 2. Upload version 2 if provided
    let path2 = null;
    if (file2) {
      const ext2 = file2.name.split('.').pop();
      path2 = `pedidos/${uploadPedidoId}/audio2.${ext2}`;
      const { error: upErr2 } = await sb.storage
        .from(STORAGE_BUCKET).upload(path2, file2, { upsert: true });
      if (upErr2) throw upErr2;
    }
    progressFill.style.width = '70%';

    // 3. Call edge function
    await callFunction('notificar_audio_listo', {
      pedido_id:      uploadPedidoId,
      audio_path:     path1,
      audio_path_2:   path2,
      nombre_cancion: nombre || null,
      precio,
    });

    progressFill.style.width = '100%';
    showToast(file2 ? 'Dos versiones subidas. Cliente notificado.' : 'Audio subido. Cliente notificado.', 'success');
    closeUploadModal();
    await loadPedidos();

  } catch (err) {
    console.error(err);
    showToast('Error al subir el audio: ' + (err.message || err), 'error');
    confirmBtn.disabled = false;
    uploadText.classList.remove('hidden');
    uploadSpinner.classList.add('hidden');
  }
}

/* ---- Confirm payment ------------------------------------- */
async function confirmarPago(pedidoId) {
  if (!confirm('¿Confirmar el pago de este pedido? Se notificará al cliente.')) return;

  try {
    await callFunction('confirmar_pago', { pedido_id: pedidoId });
    showToast('Pago confirmado. Cliente notificado.', 'success');
    await loadPedidos();
  } catch (err) {
    console.error(err);
    showToast('Error al confirmar pago: ' + (err.message || err), 'error');
  }
}

/* ---- Demos Management ------------------------------------ */
async function loadDemos() {
  const tbody = document.getElementById('demosTbody');
  tbody.innerHTML = `<tr><td colspan="6" class="no-pedidos"><div class="spinner spinner-sm" style="margin:0 auto"></div></td></tr>`;

  try {
    const { data, error } = await sb
      .from('demos')
      .select('*')
      .order('orden', { ascending: true });

    if (error) throw error;

    if (!data || data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="no-pedidos">No hay demos aún. Agrega la primera.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map((d, i) => `
      <tr>
        <td class="id-cell">${i + 1}</td>
        <td><strong>${escHtml(d.nombre)}</strong></td>
        <td><span class="badge badge-completado" style="font-size:0.58rem">${escHtml(d.tipo_tema)}</span></td>
        <td style="font-size:0.78rem;color:var(--text-dim);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          <a href="${escHtml(d.audio_url)}" target="_blank" style="color:var(--neon-cyan)">ver URL</a>
        </td>
        <td style="font-family:var(--font-label);font-size:0.7rem">${d.orden}</td>
        <td>
          <button class="btn-xs btn-xs-cyan" data-demo-action="delete" data-demo-id="${d.id}" data-demo-path="${escHtml(d.audio_path || '')}">
            🗑 Eliminar
          </button>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('[data-demo-action="delete"]').forEach(btn => {
      btn.addEventListener('click', () => deleteDemo(btn.dataset.demoId, btn.dataset.demoPath));
    });

  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="6" class="no-pedidos" style="color:var(--neon-pink)">Error al cargar demos.</td></tr>`;
  }
}

function openAddDemoModal() {
  document.getElementById('demoNombre').value   = '';
  document.getElementById('demoTipo').value     = '';
  document.getElementById('demoOrden').value    = '0';
  document.getElementById('demoFileName').textContent = '';
  document.getElementById('demoAudioFile').value = '';
  document.getElementById('demoUploadProgress').classList.add('hidden');
  document.getElementById('demoUploadFill').style.width = '0%';
  document.getElementById('addDemoModal').classList.add('open');
}

function closeAddDemoModal() {
  document.getElementById('addDemoModal').classList.remove('open');
}

async function doAddDemo() {
  const nombre = document.getElementById('demoNombre').value.trim();
  const tipo   = document.getElementById('demoTipo').value;
  const orden  = parseInt(document.getElementById('demoOrden').value) || 0;
  const file   = document.getElementById('demoAudioFile').files[0];

  if (!nombre) { showToast('Ingresa el nombre de la demo.', 'error'); return; }
  if (!tipo)   { showToast('Selecciona el tipo de música.', 'error'); return; }
  if (!file)   { showToast('Selecciona un archivo de audio.', 'error'); return; }

  const addDemoText    = document.getElementById('addDemoText');
  const addDemoSpinner = document.getElementById('addDemoSpinner');
  const confirmBtn     = document.getElementById('confirmAddDemo');
  const progressWrap   = document.getElementById('demoUploadProgress');
  const progressFill   = document.getElementById('demoUploadFill');

  confirmBtn.disabled = true;
  addDemoText.classList.add('hidden');
  addDemoSpinner.classList.remove('hidden');
  progressWrap.classList.remove('hidden');

  try {
    // Upload to Storage demos/
    const ext       = file.name.split('.').pop();
    const safeName  = nombre
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita acentos y ñ→n
      .replace(/[^a-zA-Z0-9\s-]/g, '')                  // solo letras, números, guiones
      .trim().replace(/\s+/g, '-').toLowerCase();
    const path = `demos/${Date.now()}-${safeName}.${ext}`;

    const { error: upErr } = await sb.storage
      .from(STORAGE_BUCKET)
      .upload(path, file, { upsert: false });

    if (upErr) throw upErr;
    progressFill.style.width = '60%';

    // Signed URL de 10 años para demos (bucket privado)
    const { data: signedData, error: signErr } = await sb.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(path, 315360000);
    if (signErr) throw signErr;
    const audio_url = signedData.signedUrl;

    // Insert to demos table
    const { error: insertErr } = await sb.from('demos').insert({
      nombre, tipo_tema: tipo, audio_url, audio_path: path, orden
    });

    if (insertErr) throw insertErr;

    progressFill.style.width = '100%';
    showToast('Demo agregada exitosamente.', 'success');
    closeAddDemoModal();
    await loadDemos();

  } catch (err) {
    console.error(err);
    showToast('Error al subir la demo: ' + (err.message || err), 'error');
    confirmBtn.disabled = false;
    addDemoText.classList.remove('hidden');
    addDemoSpinner.classList.add('hidden');
  }
}

async function deleteDemo(demoId, audioPath) {
  if (!confirm('¿Eliminar esta demo? Se borrará el archivo de audio permanentemente.')) return;

  try {
    // Delete from Storage if path exists
    if (audioPath) {
      await sb.storage.from(STORAGE_BUCKET).remove([audioPath]).catch(console.error);
    }
    // Delete from table
    const { error } = await sb.from('demos').delete().eq('id', demoId);
    if (error) throw error;

    showToast('Demo eliminada.', 'success');
    await loadDemos();
  } catch (err) {
    console.error(err);
    showToast('Error al eliminar: ' + (err.message || err), 'error');
  }
}

/* ---- Section switching ----------------------------------- */
function switchSection(section) {
  const isPedidos = section === 'pedidos';
  document.getElementById('sectionPedidos').classList.toggle('hidden', !isPedidos);
  document.getElementById('sectionDemos').classList.toggle('hidden', isPedidos);
  document.getElementById('secPedidos').classList.toggle('active', isPedidos);
  document.getElementById('secDemos').classList.toggle('active', !isPedidos);

  if (!isPedidos) loadDemos();
}

/* ---- Helpers --------------------------------------------- */
function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ---- Init ------------------------------------------------ */
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();

  // Login
  document.getElementById('loginBtn')?.addEventListener('click', login);
  document.getElementById('loginPassword')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') login();
  });

  // Logout
  document.getElementById('logoutBtn')?.addEventListener('click', logout);

  // Refresh
  document.getElementById('refreshBtn')?.addEventListener('click', loadPedidos);

  // Section switcher
  document.getElementById('secPedidos')?.addEventListener('click', () => switchSection('pedidos'));
  document.getElementById('secDemos')?.addEventListener('click',   () => switchSection('demos'));

  // Pedido status tabs
  document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn[data-tab]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.tab;
      renderTable(currentTab);
    });
  });

  // Upload audio modal
  document.getElementById('closeUpload')?.addEventListener('click', closeUploadModal);
  document.getElementById('cancelUpload')?.addEventListener('click', closeUploadModal);
  document.getElementById('confirmUpload')?.addEventListener('click', doUpload);

  // File name preview (pedido audio v1)
  document.getElementById('audioFile')?.addEventListener('change', e => {
    const f = e.target.files[0];
    document.getElementById('selectedFileName').textContent = f ? f.name : '';
  });

  // File name preview (pedido audio v2)
  document.getElementById('audioFile2')?.addEventListener('change', e => {
    const f = e.target.files[0];
    document.getElementById('selectedFileName2').textContent = f ? f.name : '';
  });

  // Drag & drop on upload zone v2
  const zone2 = document.getElementById('uploadZone2');
  zone2?.addEventListener('dragover', e => { e.preventDefault(); zone2.classList.add('drag-over'); });
  zone2?.addEventListener('dragleave', () => zone2.classList.remove('drag-over'));
  zone2?.addEventListener('drop', e => {
    e.preventDefault();
    zone2.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith('audio/')) {
      document.getElementById('audioFile2').files = e.dataTransfer.files;
      document.getElementById('selectedFileName2').textContent = f.name;
    } else {
      showToast('Solo se permiten archivos de audio.', 'error');
    }
  });

  // Drag & drop on upload zone (pedido audio)
  const zone = document.getElementById('uploadZone');
  zone?.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone?.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone?.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith('audio/')) {
      document.getElementById('audioFile').files = e.dataTransfer.files;
      document.getElementById('selectedFileName').textContent = f.name;
    } else {
      showToast('Solo se permiten archivos de audio.', 'error');
    }
  });

  // Add demo modal
  document.getElementById('addDemoBtn')?.addEventListener('click', openAddDemoModal);
  document.getElementById('closeAddDemo')?.addEventListener('click', closeAddDemoModal);
  document.getElementById('cancelAddDemo')?.addEventListener('click', closeAddDemoModal);
  document.getElementById('confirmAddDemo')?.addEventListener('click', doAddDemo);

  // Demo file name preview
  document.getElementById('demoAudioFile')?.addEventListener('change', e => {
    const f = e.target.files[0];
    document.getElementById('demoFileName').textContent = f ? f.name : '';
  });

  // Drag & drop on demo upload zone
  const demoZone = document.getElementById('demoUploadZone');
  demoZone?.addEventListener('dragover', e => { e.preventDefault(); demoZone.classList.add('drag-over'); });
  demoZone?.addEventListener('dragleave', () => demoZone.classList.remove('drag-over'));
  demoZone?.addEventListener('drop', e => {
    e.preventDefault();
    demoZone.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith('audio/')) {
      document.getElementById('demoAudioFile').files = e.dataTransfer.files;
      document.getElementById('demoFileName').textContent = f.name;
    } else {
      showToast('Solo se permiten archivos de audio.', 'error');
    }
  });

  // Close modals on overlay click
  document.getElementById('addDemoModal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('addDemoModal')) closeAddDemoModal();
  });

  // Close modal on overlay click
  document.getElementById('uploadModal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('uploadModal')) closeUploadModal();
  });
});
