/* ============================================================
   PONCHO CUSTOM MUSIC — Admin Dashboard
   Auth, pedidos table, upload audio, confirm payment
   ============================================================ */

const STORAGE_BUCKET = 'audios';
let allPedidos = [];
let currentTab = 'all';
let uploadPedidoId = null;
let isReplaceMode  = false;  // true = reemplazar audio sin renotificar

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
  // Verificar recordatorios de pago pendientes (silencioso)
  callFunction('recordatorio_pago', {}).catch(console.error);
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
  const pend       = allPedidos.filter(p => p.estado === 'pendiente').length;
  const comp       = allPedidos.filter(p => p.estado === 'completado').length;
  const ingresosComp = allPedidos
    .filter(p => p.estado === 'completado' && p.precio)
    .reduce((sum, p) => sum + parseFloat(p.precio), 0);
  const ingresos   = allPedidos
    .filter(p => (p.estado === 'pagado' || p.estado === 'completado') && p.precio)
    .reduce((sum, p) => sum + parseFloat(p.precio), 0);

  document.getElementById('statTotal').textContent = allPedidos.length;
  document.getElementById('statPend').textContent  = pend;
  document.getElementById('statComp').textContent  = comp;
  const compIngEl = document.getElementById('statCompIngresos');
  if (compIngEl) compIngEl.textContent = '$' + ingresosComp.toLocaleString('es-MX');
  const ingEl = document.getElementById('statIngresos');
  if (ingEl) ingEl.textContent = '$' + ingresos.toLocaleString('es-MX');

  // Mini bar chart: géneros más solicitados
  const genres = {};
  allPedidos.forEach(p => { if (p.tipo_tema) genres[p.tipo_tema] = (genres[p.tipo_tema] || 0) + 1; });
  const sorted   = Object.entries(genres).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxCount = sorted[0]?.[1] || 1;
  const genreEl   = document.getElementById('genreBars');
  const genreWrap = document.getElementById('genreStats');
  if (genreEl && sorted.length > 0) {
    genreWrap.style.display = 'block';
    genreEl.innerHTML = sorted.map(([name, count]) => `
      <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.45rem">
        <span style="font-family:var(--font-label);font-size:0.6rem;color:var(--text-dim);width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:0" title="${escHtml(name)}">${escHtml(name)}</span>
        <div style="flex:1;height:5px;background:rgba(255,255,255,0.05)">
          <div style="height:100%;width:${Math.round(count / maxCount * 100)}%;background:linear-gradient(90deg,var(--neon-cyan),var(--neon-purple));transition:width 0.6s ease"></div>
        </div>
        <span style="font-family:var(--font-label);font-size:0.6rem;color:var(--neon-cyan);min-width:16px;text-align:right">${count}</span>
      </div>
    `).join('');
  }
}

function renderTable(tab) {
  const tbody = document.getElementById('pedidosTbody');
  const list  = tab === 'all' ? allPedidos : allPedidos.filter(p => p.estado === tab);

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="12" class="no-pedidos">No hay pedidos${tab !== 'all' ? ` con estado "${tab}"` : ''}.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(p => {
    const actions   = buildActions(p);
    const addons    = Array.isArray(p.addons) && p.addons.length ? p.addons.join(', ') : '—';
    const descCorta = p.descripcion ? escHtml(p.descripcion.slice(0, 80)) + (p.descripcion.length > 80 ? '…' : '') : '—';

    // Detectar link vencido: completado hace más de 72h
    const vencido = p.estado === 'completado' && p.completado_en &&
      (Date.now() - new Date(p.completado_en).getTime()) > 72 * 60 * 60 * 1000;

    const estadoBadge = vencido
      ? `<span class="badge badge-${p.estado}">${p.estado}</span> <span style="font-family:var(--font-label);font-size:0.52rem;letter-spacing:0.08em;color:var(--neon-yellow);border:1px solid rgba(255,230,0,0.4);padding:0.1rem 0.4rem">⏰ VENCIDO</span>`
      : `<span class="badge badge-${p.estado}">${p.estado}</span>`;

    return `
      <tr style="${vencido ? 'background:rgba(255,230,0,0.03)' : ''}">
        <td class="id-cell">${p.id.slice(0, 8)}…</td>
        <td><strong>${escHtml(p.cliente_nombre)}</strong><br><span style="font-size:0.78rem;color:var(--text-dim)">${addons}</span></td>
        <td class="col-email" style="font-size:0.82rem">${escHtml(p.cliente_email || '—')}</td>
        <td class="col-telefono" style="font-size:0.82rem">${escHtml(p.cliente_telefono || '—')}</td>
        <td style="font-size:0.82rem">${escHtml(p.tipo_tema)}</td>
        <td class="col-mood" style="font-size:0.82rem">${escHtml(p.mood || '—')}</td>
        <td><span style="font-family:var(--font-label);font-size:0.62rem;color:var(--text-dim)">${p.plan || 'basico'}</span></td>
        <td>${estadoBadge}</td>
        <td style="font-family:var(--font-label);font-size:0.78rem;color:var(--neon-cyan)">${p.precio ? '$' + p.precio : '—'}</td>
        <td style="font-size:0.78rem;color:var(--text-dim);white-space:nowrap">${formatDate(p.creado_en)}</td>
        <td>
          <span class="desc-preview" data-action="desc" data-id="${p.id}" style="font-size:0.78rem;color:var(--neon-cyan);display:block;max-width:200px;cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px">${descCorta}</span>
        </td>
        <td style="white-space:normal;vertical-align:top;padding:0.5rem 0.4rem"><div class="action-btns" style="display:flex;flex-direction:column;gap:0.35rem;min-width:130px">${actions}</div></td>
      </tr>
    `;
  }).join('');

  // Attach action listeners
  tbody.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const { action, id } = btn.dataset;
      if (action === 'upload')   openUploadModal(id);
      if (action === 'replace')  openReplaceModal(id);
      if (action === 'pago')     confirmarPago(id);
      if (action === 'desc')     openDescModal(id);
      if (action === 'delete')   eliminarPedido(id);
      if (action === 'regen')    regenerarLink(id);
      if (action === 'reenviar') reenviarLink(id);
      if (action === 'revocar')  revocarAcceso(id);
      if (action === 'escuchar') {
        const p = allPedidos.find(x => x.id === id);
        if (p) window.open(`escuchar.html?token=${p.token_escucha || p.token_descarga}`, '_blank');
      }
    });
  });
}

function buildActions(p) {
  let html = '';
  if (p.estado === 'pendiente') {
    // Esperando pago (WhatsApp/transferencia)
    html += `<button class="btn-xs btn-xs-green"  data-action="pago"     data-id="${p.id}">✓ Confirmar Pago</button>`;
  }
  if (p.estado === 'pagado') {
    // Pago confirmado — listo para producir
    html += `<button class="btn-xs btn-xs-cyan"   data-action="upload"   data-id="${p.id}">↑ Subir Audio</button>`;
  }
  if (p.estado === 'completado') {
    // Audio entregado
    const vencido = p.completado_en && (Date.now() - new Date(p.completado_en).getTime()) > 72 * 60 * 60 * 1000;
    html += `<button class="btn-xs btn-xs-cyan"   data-action="escuchar" data-id="${p.id}">▶ Ver Link</button>`;
    html += `<button class="btn-xs btn-xs-yellow" data-action="replace"  data-id="${p.id}">🔄 Reemplazar Audio</button>`;
    if (vencido) {
      html += `<button class="btn-xs btn-xs-yellow" data-action="reenviar" data-id="${p.id}">📲 Reenviar Link</button>`;
    }
    html += `<button class="btn-xs btn-xs-yellow" data-action="regen"    data-id="${p.id}">🔄 Regenerar Link</button>`;
    html += `<button class="btn-xs btn-xs-pink"   data-action="revocar"  data-id="${p.id}">🚫 Revocar Acceso</button>`;
  }
  html += `<button class="btn-xs btn-xs-pink"     data-action="delete"   data-id="${p.id}">✕ Eliminar</button>`;
  return html;
}

/* ---- Upload Modal ---------------------------------------- */
function openReplaceModal(pedidoId) {
  isReplaceMode = true;
  uploadPedidoId = pedidoId;
  const p = allPedidos.find(x => x.id === pedidoId);
  if (p) {
    document.getElementById('uploadPedidoInfo').textContent =
      `⚠️ REEMPLAZAR AUDIO — ${p.cliente_nombre} | ${p.tipo_tema} | ${p.mood || ''}`;
    document.getElementById('finalPrecio').value = p.precio || '';
    document.getElementById('nombreCancion').value = p.nombre_cancion || '';
  }
  document.getElementById('selectedFileName').textContent = '';
  document.getElementById('selectedFileName2').textContent = '';
  document.getElementById('audioFile').value = '';
  document.getElementById('audioFile2').value = '';
  document.getElementById('uploadProgress').classList.add('hidden');
  document.getElementById('uploadProgressFill').style.width = '0%';
  // Cambiar texto del botón para indicar modo reemplazo
  document.getElementById('uploadText').textContent = 'Reemplazar Audio';
  document.getElementById('uploadModal').classList.add('open');
}

function openUploadModal(pedidoId) {
  isReplaceMode = false;
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
  document.getElementById('uploadText').textContent = 'Subir Audio';
  document.getElementById('uploadModal').classList.add('open');
}

function closeUploadModal() {
  document.getElementById('uploadModal').classList.remove('open');
  uploadPedidoId = null;
  isReplaceMode  = false;
  document.getElementById('uploadText').textContent = 'Subir Audio';
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

    if (isReplaceMode) {
      // Solo reemplazar archivos en BD, sin notificar al cliente
      const updateFields = { audio_path: path1, estado: 'completado' };
      if (path2) updateFields.audio_path_2 = path2;
      if (nombre) updateFields.nombre_cancion = nombre;
      const { error: replErr } = await sb.from('pedidos').update(updateFields).eq('id', uploadPedidoId);
      if (replErr) throw replErr;
      progressFill.style.width = '100%';
      showToast('Audio reemplazado correctamente. El cliente escuchará la nueva versión.', 'success');
    } else {
      // Flujo normal: notificar al cliente
      await callFunction('notificar_audio_listo', {
        pedido_id:      uploadPedidoId,
        audio_path:     path1,
        audio_path_2:   path2,
        nombre_cancion: nombre || null,
        precio,
      });
      progressFill.style.width = '100%';
      showToast(file2 ? 'Dos versiones subidas. Cliente notificado.' : 'Audio subido. Cliente notificado.', 'success');
    }

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

async function fillGeneroSelect(selectId, placeholderText = '— Elige —') {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const { data } = await sb.from('generos').select('nombre').eq('activo', true).order('orden', { ascending: true });
  sel.innerHTML = `<option value="" disabled selected>${placeholderText}</option>`;
  (data || []).forEach(g => {
    const opt = document.createElement('option');
    opt.value = g.nombre;
    opt.textContent = g.nombre;
    sel.appendChild(opt);
  });
}

async function openAddDemoModal() {
  document.getElementById('demoNombre').value   = '';
  document.getElementById('demoOrden').value    = '0';
  document.getElementById('demoFileName').textContent = '';
  document.getElementById('demoAudioFile').value = '';
  document.getElementById('demoUploadProgress').classList.add('hidden');
  document.getElementById('demoUploadFill').style.width = '0%';
  await fillGeneroSelect('demoTipo');
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
  ['pedidos', 'demos', 'clientes', 'generos'].forEach(s => {
    document.getElementById(`section${s.charAt(0).toUpperCase() + s.slice(1)}`)?.classList.toggle('hidden', s !== section);
    document.getElementById(`sec${s.charAt(0).toUpperCase() + s.slice(1)}`)?.classList.toggle('active', s === section);
  });
  if (section === 'demos')    loadDemos();
  if (section === 'clientes') loadClientes();
  if (section === 'generos')  loadGeneros();
}

/* ---- Géneros -------------------------------------------- */
async function loadGeneros() {
  const tbody = document.getElementById('generosTbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="5" class="no-pedidos"><div class="spinner spinner-sm" style="margin:0 auto"></div></td></tr>`;

  try {
    const { data, error } = await sb
      .from('generos')
      .select('*')
      .order('orden', { ascending: true });
    if (error) throw error;

    if (!data || data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="no-pedidos">No hay géneros aún.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map((g, i) => `
      <tr>
        <td class="id-cell">${i + 1}</td>
        <td><strong>${g.nombre}</strong></td>
        <td>${g.orden}</td>
        <td><span class="badge ${g.activo ? 'badge-pagado' : 'badge-pendiente'}">${g.activo ? 'Activo' : 'Inactivo'}</span></td>
        <td style="display:flex;gap:0.5rem;flex-wrap:wrap">
          <button class="btn-xs ${g.activo ? 'btn-xs-yellow' : 'btn-xs-green'}" data-genre-toggle="${g.id}" data-activo="${g.activo}">
            ${g.activo ? '⏸ Desactivar' : '▶ Activar'}
          </button>
          <button class="btn-xs btn-xs-pink" data-genre-delete="${g.id}" data-nombre="${g.nombre}">✕ Eliminar</button>
        </td>
      </tr>
    `).join('');

    // Toggle activo
    tbody.querySelectorAll('[data-genre-toggle]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id     = btn.dataset.genreToggle;
        const activo = btn.dataset.activo === 'true';
        const { error } = await sb.from('generos').update({ activo: !activo }).eq('id', id);
        if (error) { showToast('Error al actualizar.', 'error'); return; }
        loadGeneros();
      });
    });

    // Delete
    tbody.querySelectorAll('[data-genre-delete]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm(`¿Eliminar el género "${btn.dataset.nombre}"? Los pedidos existentes con este género no se verán afectados.`)) return;
        const { error } = await sb.from('generos').delete().eq('id', btn.dataset.genreDelete);
        if (error) { showToast('Error al eliminar.', 'error'); return; }
        showToast('Género eliminado.', 'success');
        loadGeneros();
      });
    });

  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="5" class="no-pedidos" style="color:var(--neon-pink)">Error al cargar géneros.</td></tr>`;
  }
}

async function saveGenero() {
  const nombre = document.getElementById('newGeneroNombre').value.trim();
  const orden  = parseInt(document.getElementById('newGeneroOrden').value) || 10;
  if (!nombre) { showToast('Escribe el nombre del género.', 'error'); return; }

  const { error } = await sb.from('generos').insert({ nombre, orden, activo: true });
  if (error) {
    showToast(error.message.includes('unique') ? 'Ese género ya existe.' : 'Error al guardar.', 'error');
    return;
  }
  showToast(`Género "${nombre}" agregado.`, 'success');
  document.getElementById('newGeneroNombre').value = '';
  document.getElementById('newGeneroOrden').value  = '10';
  document.getElementById('addGeneroForm').classList.add('hidden');
  loadGeneros();
}

/* ---- Clientes pagados ------------------------------------ */
async function loadClientes() {
  const tbody = document.getElementById('clientesTbody');
  tbody.innerHTML = `<tr><td colspan="9" class="no-pedidos"><div class="spinner spinner-sm" style="margin:0 auto"></div></td></tr>`;

  try {
    const { data, error } = await sb
      .from('pedidos')
      .select('id, cliente_nombre, cliente_telefono, cliente_email, tipo_tema, nombre_cancion, pagado_en, precio')
      .in('estado', ['pagado', 'completado'])
      .order('pagado_en', { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="no-pedidos">Aún no hay clientes pagados.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map((p, i) => {
      const digits  = (p.cliente_telefono || '').replace(/\D/g, '');
      const waPhone = digits.length === 10 ? `52${digits}` : digits;
      const promoMsg = encodeURIComponent(
        `¡Hola ${p.cliente_nombre}! 🎵 Tenemos nuevas canciones personalizadas disponibles en Poncho Custom Music. ¿Te interesa otra? Aquí puedes ver los demos: https://ponchoramirezcast-bot.github.io/poncho-custom-music/demos.html`
      );
      const waUrl = waPhone ? `https://wa.me/${waPhone}?text=${promoMsg}` : '';

      return `
        <tr>
          <td class="id-cell">${i + 1}</td>
          <td><strong>${escHtml(p.cliente_nombre)}</strong></td>
          <td style="font-family:var(--font-label);font-size:0.72rem">
            ${p.cliente_telefono
              ? `<a href="tel:${escHtml(p.cliente_telefono)}" style="color:var(--neon-cyan)">${escHtml(p.cliente_telefono)}</a>`
              : '<span style="color:var(--text-dim)">—</span>'
            }
          </td>
          <td style="font-size:0.78rem">
            ${p.cliente_email
              ? `<a href="mailto:${escHtml(p.cliente_email)}" style="color:var(--neon-cyan)">${escHtml(p.cliente_email)}</a>`
              : '<span style="color:var(--text-dim)">—</span>'
            }
          </td>
          <td style="font-size:0.82rem">${escHtml(p.tipo_tema || '—')}</td>
          <td style="font-size:0.82rem;color:var(--text-dim)">${escHtml(p.nombre_cancion || '—')}</td>
          <td style="font-family:var(--font-label);font-size:0.7rem;color:var(--text-dim);white-space:nowrap">${formatDate(p.pagado_en)}</td>
          <td style="font-family:var(--font-label);font-size:0.78rem;color:var(--neon-cyan)">${p.precio ? '$' + p.precio : '—'}</td>
          <td>
            ${waUrl
              ? `<a href="${waUrl}" target="_blank" class="btn-xs btn-xs-green" style="text-decoration:none;display:inline-block;padding:0.38rem 0.7rem">📲 Promo WA</a>`
              : `<span class="btn-xs btn-xs-dim">Sin WA</span>`
            }
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="9" class="no-pedidos" style="color:var(--neon-pink)">Error al cargar clientes.</td></tr>`;
  }
}

function exportClientesCSV() {
  const pagados = allPedidos.filter(p => p.estado === 'pagado' || p.estado === 'completado');
  if (!pagados.length) { showToast('No hay clientes pagados para exportar.', 'info'); return; }

  const header = ['Nombre', 'WhatsApp', 'Email', 'Tipo de Canción', 'Nombre Canción', 'Precio', 'Pagado el'];
  const rows = pagados.map(p => [
    p.cliente_nombre || '',
    p.cliente_telefono || '',
    p.cliente_email || '',
    p.tipo_tema || '',
    p.nombre_cancion || '',
    p.precio || '',
    p.pagado_en ? new Date(p.pagado_en).toLocaleDateString('es-MX') : '',
  ].map(v => `"${String(v).replace(/"/g, '""')}"`));

  const csvContent = [header, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' }); // BOM for Excel
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `clientes-poncho-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('CSV exportado.', 'success');
}

/* ---- Reenviar Link vencido ------------------------------- */
async function reenviarLink(pedidoId) {
  const p = allPedidos.find(x => x.id === pedidoId);
  if (!p) return;

  // Generar nuevo token_escucha
  const newToken = crypto.randomUUID();
  try {
    const { error } = await sb.from('pedidos')
      .update({ token_escucha: newToken, completado_en: new Date().toISOString() })
      .eq('id', pedidoId);
    if (error) throw error;

    const siteUrl   = 'https://ponchoramirezcast-bot.github.io/poncho-custom-music';
    const listenUrl = `${siteUrl}/escuchar.html?token=${newToken}`;

    if (p.cliente_telefono) {
      const digits     = p.cliente_telefono.replace(/\D/g, '');
      const waPhone    = digits.length === 10 ? `52${digits}` : digits;
      const clientMsg  = encodeURIComponent(
        `¡Hola ${p.cliente_nombre}! 🎵 Te reenvío el link de tu canción personalizada.\n\n` +
        `Escúchala aquí:\n${listenUrl}\n\n¿Tienes alguna duda? Con gusto te ayudo.`
      );
      const waUrl = `https://wa.me/${waPhone}?text=${clientMsg}`;
      window.open(waUrl, '_blank');
    } else {
      showToast('Link renovado. El cliente no tiene WhatsApp registrado.', 'info');
    }

    await loadPedidos();
    showToast('Link renovado y listo para reenviar.', 'success');
  } catch (err) {
    console.error(err);
    showToast('Error al reenviar: ' + (err.message || err), 'error');
  }
}

/* ---- Regenerar Link de Descarga -------------------------- */
async function regenerarLink(pedidoId) {
  const p = allPedidos.find(x => x.id === pedidoId);
  if (!confirm(`¿Regenerar el link de descarga de ${p?.cliente_nombre || pedidoId.slice(0,8)}?\n\nEl link anterior quedará inválido.`)) return;

  try {
    // Generar nuevo token_descarga
    const { error } = await sb.from('pedidos')
      .update({ token_descarga: crypto.randomUUID() })
      .eq('id', pedidoId);
    if (error) throw error;

    showToast('Link regenerado. Recarga para ver el nuevo link.', 'success');
    await loadPedidos();
  } catch (err) {
    console.error(err);
    showToast('Error al regenerar: ' + (err.message || err), 'error');
  }
}

/* ---- Revocar Acceso de Descarga -------------------------- */
async function revocarAcceso(pedidoId) {
  const p = allPedidos.find(x => x.id === pedidoId);
  if (!confirm(`¿Revocar el acceso de descarga de ${p?.cliente_nombre || pedidoId.slice(0,8)}?\n\nEl pedido volverá a estado "completado" y el link de descarga dejará de funcionar.`)) return;

  try {
    const { error } = await sb.from('pedidos')
      .update({ estado: 'completado', token_descarga: crypto.randomUUID() })
      .eq('id', pedidoId);
    if (error) throw error;

    showToast('Acceso revocado. Pedido vuelve a "completado".', 'success');
    await loadPedidos();
  } catch (err) {
    console.error(err);
    showToast('Error al revocar: ' + (err.message || err), 'error');
  }
}

/* ---- Eliminar Pedido ------------------------------------- */
async function eliminarPedido(pedidoId) {
  const p = allPedidos.find(x => x.id === pedidoId);
  const nombre = p ? p.cliente_nombre : pedidoId.slice(0, 8);
  if (!confirm(`¿Eliminar el pedido de ${nombre}?\n\nEsta acción no se puede deshacer.`)) return;

  try {
    // Eliminar archivos de audio si existen
    const paths = [p?.audio_path, p?.audio_path_2].filter(Boolean);
    if (paths.length) {
      await sb.storage.from(STORAGE_BUCKET).remove(paths).catch(console.error);
    }
    // Eliminar de la tabla
    const { error } = await sb.from('pedidos').delete().eq('id', pedidoId);
    if (error) throw error;

    showToast('Pedido eliminado.', 'success');
    await loadPedidos();
  } catch (err) {
    console.error(err);
    showToast('Error al eliminar: ' + (err.message || err), 'error');
  }
}

/* ---- Descripción Modal ----------------------------------- */
function openDescModal(pedidoId) {
  const p = allPedidos.find(x => x.id === pedidoId);
  if (!p) return;
  document.getElementById('descModalMeta').textContent =
    `${p.cliente_nombre} · ${p.tipo_tema} · ${p.mood || ''} · Plan ${p.plan || 'básico'}`;
  document.getElementById('descModalText').textContent = p.descripcion || '(sin descripción)';
  document.getElementById('copyDescText').textContent = '📋 Copiar';
  document.getElementById('descModal').classList.add('open');
}

function closeDescModal() {
  document.getElementById('descModal').classList.remove('open');
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
  document.getElementById('secPedidos')?.addEventListener('click',   () => switchSection('pedidos'));
  document.getElementById('secDemos')?.addEventListener('click',     () => switchSection('demos'));
  document.getElementById('secClientes')?.addEventListener('click',  () => switchSection('clientes'));
  document.getElementById('secGeneros')?.addEventListener('click',   () => switchSection('generos'));

  // Géneros form
  document.getElementById('addGeneroBtn')?.addEventListener('click', () => {
    document.getElementById('addGeneroForm').classList.remove('hidden');
    document.getElementById('newGeneroNombre').focus();
  });
  document.getElementById('cancelGeneroBtn')?.addEventListener('click', () => {
    document.getElementById('addGeneroForm').classList.add('hidden');
  });
  document.getElementById('saveGeneroBtn')?.addEventListener('click', saveGenero);

  // Export CSV
  document.getElementById('exportCsvBtn')?.addEventListener('click', exportClientesCSV);

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

  // Descripción modal
  document.getElementById('closeDescModal')?.addEventListener('click', closeDescModal);
  document.getElementById('closeDescModal2')?.addEventListener('click', closeDescModal);
  document.getElementById('descModal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('descModal')) closeDescModal();
  });
  document.getElementById('copyDescBtn')?.addEventListener('click', () => {
    const text = document.getElementById('descModalText').textContent;
    navigator.clipboard.writeText(text).then(() => {
      document.getElementById('copyDescText').textContent = '✅ Copiado';
      setTimeout(() => { document.getElementById('copyDescText').textContent = '📋 Copiar'; }, 2000);
    }).catch(() => showToast('No se pudo copiar.', 'error'));
  });
});
