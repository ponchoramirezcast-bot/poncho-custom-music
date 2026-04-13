/* ============================================================
   PONCHO CUSTOM MUSIC — Private Listen Page
   - Usa token_escucha (separado de token_descarga)
   - Audio servido via proxy stream_audio (URL real nunca expuesta)
   - Preview limitado a 45 segundos
   ============================================================ */

const OWNER_WHATSAPP = '5214497573058';
const PREVIEW_LIMIT  = 45;
const STREAM_URL     = 'https://vtbifrcnjrvqgwtjdood.supabase.co/functions/v1/stream_audio';

function fmtTime(s) {
  if (isNaN(s) || !isFinite(s)) return '0:00';
  return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
}

function show(id) { document.getElementById(id)?.classList.remove('hidden'); }
function hide(id) { document.getElementById(id)?.classList.add('hidden'); }

function showState(state) {
  hide('stateLoading');
  show('listenCard');
  hide('statePendiente');
  hide('statePlayer');
  hide('stateError');
  show(state);
}

function showPreviewWall() {
  document.querySelectorAll('#statePlayer audio').forEach(a => a.pause());
  document.querySelectorAll('.player-btn').forEach(b => {
    b.innerHTML = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
  });
  const wall = document.getElementById('previewWall');
  if (wall && !wall.classList.contains('visible')) {
    wall.classList.add('visible');
    showToast('Preview de 45 seg terminado — paga para escuchar completo 🎵', 'info');
  }
}

function setupPlayer(audioEl, playBtn, bar, fill, cur, dur, isPaid) {
  const playIcon  = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
  const pauseIcon = `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;

  playBtn.addEventListener('click', () => {
    if (!isPaid && audioEl.currentTime >= PREVIEW_LIMIT) {
      showPreviewWall(); return;
    }
    document.querySelectorAll('#statePlayer audio').forEach(a => { if (a !== audioEl) a.pause(); });
    document.querySelectorAll('.player-btn').forEach(b => { if (b !== playBtn) b.innerHTML = playIcon; });

    if (audioEl.paused) {
      audioEl.play().catch(() => showToast('No se pudo reproducir el audio.', 'error'));
      playBtn.innerHTML = pauseIcon;
    } else {
      audioEl.pause();
      playBtn.innerHTML = playIcon;
    }
  });

  audioEl.addEventListener('timeupdate', () => {
    if (!audioEl.duration) return;
    if (!isPaid && audioEl.currentTime >= PREVIEW_LIMIT) {
      audioEl.pause();
      fill.style.width = (PREVIEW_LIMIT / audioEl.duration * 100) + '%';
      cur.textContent  = fmtTime(PREVIEW_LIMIT);
      showPreviewWall(); return;
    }
    fill.style.width = (audioEl.currentTime / audioEl.duration * 100) + '%';
    cur.textContent  = fmtTime(audioEl.currentTime);
  });

  audioEl.addEventListener('loadedmetadata', () => {
    dur.textContent = isPaid ? fmtTime(audioEl.duration) : `0:45 / ${fmtTime(audioEl.duration)}`;
  });

  audioEl.addEventListener('ended', () => {
    playBtn.innerHTML = playIcon;
    fill.style.width  = '0%';
  });

  bar.addEventListener('click', e => {
    if (!audioEl.duration) return;
    const ratio  = Math.max(0, Math.min(1, (e.clientX - bar.getBoundingClientRect().left) / bar.offsetWidth));
    const target = ratio * audioEl.duration;
    if (!isPaid && target > PREVIEW_LIMIT) { showPreviewWall(); return; }
    audioEl.currentTime = target;
  });
}

function updateVersionUI(chosen) {
  const isA = chosen === 1;
  document.getElementById('versionCardA').classList.toggle('selected', isA);
  document.getElementById('versionCardB').classList.toggle('selected', !isA);
  document.getElementById('chosenBadgeA').classList.toggle('hidden', !isA);
  document.getElementById('chosenBadgeB').classList.toggle('hidden', isA);
}

async function elegirVersion(token, version, pedidoData) {
  updateVersionUI(version);
  showToast(`Versión ${version === 1 ? 'A' : 'B'} elegida.`, 'success');
  try { await callFunction('elegir_version', { token, version }); } catch(e) { console.error(e); }

  const waBtn = document.getElementById('waPayBtn');
  const wallBtn = document.getElementById('wallPayBtn');
  const waMsg = encodeURIComponent(
    `Hola Poncho, quiero pagar mi tema personalizado.\nID: ${pedidoData.id}\nPrecio: $${pedidoData.precio || '—'} MXN\nVersión elegida: ${version === 1 ? 'A' : 'B'}`
  );
  const waUrl = `https://wa.me/${OWNER_WHATSAPP}?text=${waMsg}`;
  if (waBtn)  waBtn.href  = waUrl;
  if (wallBtn) wallBtn.href = waUrl;
}

async function loadPedido() {
  const token = getParam('token');
  if (!token) { showState('stateError'); return; }

  try {
    const { data, error } = await sb
      .from('pedidos')
      .select('id, cliente_nombre, tipo_tema, mood, estado, audio_path, audio_path_2, token_escucha, token_descarga, precio, version_elegida')
      .eq('token_escucha', token)
      .single();

    if (error || !data) { showState('stateError'); return; }

    document.getElementById('clientName').textContent = `Tema de ${data.cliente_nombre}`;
    document.getElementById('tipoTag').textContent    = data.tipo_tema || '';
    document.getElementById('moodTag').textContent    = data.mood || '';
    const badge = document.getElementById('estadoBadge');
    badge.className   = `badge badge-${data.estado}`;
    badge.textContent = data.estado.charAt(0).toUpperCase() + data.estado.slice(1);

    if (data.estado === 'pendiente') { showState('statePendiente'); return; }

    showState('statePlayer');

    const isPaid = data.estado === 'pagado';

    // URLs del proxy — nunca exponen el archivo real
    const streamA = `${STREAM_URL}?token=${token}&mode=escucha&v=1`;
    const streamB = `${STREAM_URL}?token=${token}&mode=escucha&v=2`;

    document.getElementById('audioA').src = streamA;
    setupPlayer(
      document.getElementById('audioA'), document.getElementById('playBtnA'),
      document.getElementById('barA'),   document.getElementById('fillA'),
      document.getElementById('curA'),   document.getElementById('durA'), isPaid
    );

    if (data.audio_path_2) {
      show('versionCardB'); show('versionHint'); show('chooseABtn'); show('chooseBBtn');
      document.getElementById('audioB').src = streamB;
      setupPlayer(
        document.getElementById('audioB'), document.getElementById('playBtnB'),
        document.getElementById('barB'),   document.getElementById('fillB'),
        document.getElementById('curB'),   document.getElementById('durB'), isPaid
      );
      updateVersionUI(data.version_elegida || 1);
      document.getElementById('chooseABtn').addEventListener('click', () => elegirVersion(token, 1, data));
      document.getElementById('chooseBBtn').addEventListener('click', () => elegirVersion(token, 2, data));
    }

    if (isPaid) {
      hide('actionsPay'); hide('previewWall'); show('actionsPaid');
      // Para descarga usamos token_descarga
      document.getElementById('downloadPageBtn').href = `descargar.html?token=${data.token_descarga}`;
    } else {
      show('previewHint');
      const versionStr = data.audio_path_2 ? ` | Versión elegida: ${(data.version_elegida||1)===1?'A':'B'}` : '';
      const waMsg = encodeURIComponent(
        `Hola Poncho, quiero pagar mi tema personalizado.\nID: ${data.id}\nPrecio: $${data.precio || '—'} MXN${versionStr}`
      );
      const waUrl = `https://wa.me/${OWNER_WHATSAPP}?text=${waMsg}`;
      document.getElementById('waPayBtn').href  = waUrl;
      const wallBtn = document.getElementById('wallPayBtn');
      if (wallBtn) wallBtn.href = waUrl;
    }

  } catch (err) {
    console.error(err);
    showState('stateError');
  }
}

document.addEventListener('DOMContentLoaded', loadPedido);
