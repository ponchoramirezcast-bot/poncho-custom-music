/* ============================================================
   PONCHO CUSTOM MUSIC — Private Listen Page
   Loads pedido by token from URL ?token=UUID
   ============================================================ */

// WhatsApp number — replace with your actual number
const OWNER_WHATSAPP = '5214497573058';

function fmtTime(s) {
  if (isNaN(s) || !isFinite(s)) return '0:00';
  return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
}

function show(id)  { document.getElementById(id)?.classList.remove('hidden'); }
function hide(id)  { document.getElementById(id)?.classList.add('hidden'); }

function showState(state) {
  hide('stateLoading');
  show('listenCard');
  hide('statePendiente');
  hide('statePlayer');
  hide('stateError');
  show(state);
}

async function loadPedido() {
  const token = getParam('token');

  if (!token) { showState('stateError'); return; }

  try {
    const { data, error } = await sb
      .from('pedidos')
      .select('id, cliente_nombre, tipo_tema, mood, estado, audio_url, token_descarga, precio')
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

    // completado or pagado → show player
    showState('statePlayer');

    // Setup audio
    const audio = document.getElementById('mainAudio');
    audio.src = data.audio_url || '';

    const playBtn = document.getElementById('mainPlayBtn');
    const bar     = document.getElementById('mainBar');
    const fill    = document.getElementById('mainFill');
    const cur     = document.getElementById('mainCur');
    const dur     = document.getElementById('mainDur');

    const playIcon  = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
    const pauseIcon = `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;

    playBtn.addEventListener('click', () => {
      if (audio.paused) {
        audio.play().catch(() => showToast('No se pudo reproducir el audio.', 'error'));
        playBtn.innerHTML = pauseIcon;
      } else {
        audio.pause();
        playBtn.innerHTML = playIcon;
      }
    });

    audio.addEventListener('timeupdate', () => {
      if (!audio.duration) return;
      fill.style.width = (audio.currentTime / audio.duration * 100) + '%';
      cur.textContent  = fmtTime(audio.currentTime);
    });

    audio.addEventListener('loadedmetadata', () => {
      dur.textContent = fmtTime(audio.duration);
    });

    audio.addEventListener('ended', () => {
      playBtn.innerHTML = playIcon;
      fill.style.width  = '0%';
    });

    bar.addEventListener('click', e => {
      if (!audio.duration) return;
      const rect = bar.getBoundingClientRect();
      audio.currentTime = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * audio.duration;
    });

    // Show correct action block
    if (data.estado === 'pagado') {
      hide('actionsPay');
      show('actionsPaid');
      const dlBtn = document.getElementById('downloadPageBtn');
      dlBtn.href = `descargar.html?token=${data.token_descarga}`;
    } else {
      // completado — show pay button
      const waMsg = encodeURIComponent(
        `Hola Poncho, quiero pagar mi tema personalizado.\nID: ${data.id}\nPlan: ${data.estado}\nPrecio: $${data.precio || '—'} MXN`
      );
      document.getElementById('waPayBtn').href = `https://wa.me/${OWNER_WHATSAPP}?text=${waMsg}`;
    }

  } catch (err) {
    console.error(err);
    showState('stateError');
  }
}

document.addEventListener('DOMContentLoaded', loadPedido);
