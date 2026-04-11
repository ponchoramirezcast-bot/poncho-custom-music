/* ============================================================
   PONCHO CUSTOM MUSIC — Private Listen Page
   Supports 1 or 2 audio versions with client version choice
   ============================================================ */

const OWNER_WHATSAPP = '5214497573058';

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

function setupPlayer(audioEl, playBtn, bar, fill, cur, dur) {
  const playIcon  = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
  const pauseIcon = `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;

  playBtn.addEventListener('click', () => {
    // Pause the other player
    document.querySelectorAll('#statePlayer audio').forEach(a => {
      if (a !== audioEl) { a.pause(); }
    });
    document.querySelectorAll('.player-btn').forEach(b => {
      if (b !== playBtn) b.innerHTML = playIcon;
    });

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
    fill.style.width = (audioEl.currentTime / audioEl.duration * 100) + '%';
    cur.textContent  = fmtTime(audioEl.currentTime);
  });

  audioEl.addEventListener('loadedmetadata', () => {
    dur.textContent = fmtTime(audioEl.duration);
  });

  audioEl.addEventListener('ended', () => {
    playBtn.innerHTML = playIcon;
    fill.style.width  = '0%';
  });

  bar.addEventListener('click', e => {
    if (!audioEl.duration) return;
    const rect = bar.getBoundingClientRect();
    audioEl.currentTime = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * audioEl.duration;
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

  try {
    await callFunction('elegir_version', { token, version });
  } catch (err) {
    console.error('Error guardando versión:', err);
  }

  // Update WhatsApp pay button message
  const waBtn = document.getElementById('waPayBtn');
  if (waBtn) {
    const waMsg = encodeURIComponent(
      `Hola Poncho, quiero pagar mi tema personalizado.\nID: ${pedidoData.id}\nPrecio: $${pedidoData.precio || '—'} MXN\nVersión elegida: ${version === 1 ? 'A' : 'B'}`
    );
    waBtn.href = `https://wa.me/${OWNER_WHATSAPP}?text=${waMsg}`;
  }
}

async function loadPedido() {
  const token = getParam('token');
  if (!token) { showState('stateError'); return; }

  try {
    const { data, error } = await sb
      .from('pedidos')
      .select('id, cliente_nombre, tipo_tema, mood, estado, audio_url, audio_url_2, token_descarga, precio, version_elegida')
      .eq('token_descarga', token)
      .single();

    if (error || !data) { showState('stateError'); return; }

    // Fill meta
    document.getElementById('clientName').textContent = `Tema de ${data.cliente_nombre}`;
    document.getElementById('tipoTag').textContent    = data.tipo_tema || '';
    document.getElementById('moodTag').textContent    = data.mood || '';

    const badge = document.getElementById('estadoBadge');
    badge.className = `badge badge-${data.estado}`;
    badge.textContent = data.estado.charAt(0).toUpperCase() + data.estado.slice(1);

    if (data.estado === 'pendiente') {
      showState('statePendiente');
      return;
    }

    showState('statePlayer');

    // --- Setup Version A ---
    setupPlayer(
      document.getElementById('audioA'),
      document.getElementById('playBtnA'),
      document.getElementById('barA'),
      document.getElementById('fillA'),
      document.getElementById('curA'),
      document.getElementById('durA')
    );
    document.getElementById('audioA').src = data.audio_url || '';

    // --- Setup Version B if exists ---
    if (data.audio_url_2) {
      show('versionCardB');
      show('versionHint');
      show('chooseABtn');
      show('chooseBBtn');

      document.getElementById('audioB').src = data.audio_url_2;
      setupPlayer(
        document.getElementById('audioB'),
        document.getElementById('playBtnB'),
        document.getElementById('barB'),
        document.getElementById('fillB'),
        document.getElementById('curB'),
        document.getElementById('durB')
      );

      // Show current choice
      updateVersionUI(data.version_elegida || 1);

      // Choice buttons
      document.getElementById('chooseABtn').addEventListener('click', () => elegirVersion(token, 1, data));
      document.getElementById('chooseBBtn').addEventListener('click', () => elegirVersion(token, 2, data));
    }

    // --- Show action block ---
    if (data.estado === 'pagado') {
      hide('actionsPay');
      show('actionsPaid');
      document.getElementById('downloadPageBtn').href = `descargar.html?token=${data.token_descarga}`;
    } else {
      // completado — show pay button
      const versionStr = data.audio_url_2
        ? ` | Versión elegida: ${(data.version_elegida || 1) === 1 ? 'A' : 'B'}`
        : '';
      const waMsg = encodeURIComponent(
        `Hola Poncho, quiero pagar mi tema personalizado.\nID: ${data.id}\nPrecio: $${data.precio || '—'} MXN${versionStr}`
      );
      document.getElementById('waPayBtn').href = `https://wa.me/${OWNER_WHATSAPP}?text=${waMsg}`;
    }

  } catch (err) {
    console.error(err);
    showState('stateError');
  }
}

document.addEventListener('DOMContentLoaded', loadPedido);
