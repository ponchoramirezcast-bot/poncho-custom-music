/* ============================================================
   PONCHO CUSTOM MUSIC — Download Page
   Only accessible when estado = 'pagado'
   ============================================================ */

function fmtTime(s) {
  if (isNaN(s) || !isFinite(s)) return '0:00';
  return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
}

function show(id) { document.getElementById(id)?.classList.remove('hidden'); }
function hide(id) { document.getElementById(id)?.classList.add('hidden'); }

function initPlayer(audio_url) {
  const audio   = document.getElementById('dlAudio');
  const playBtn = document.getElementById('dlPlayBtn');
  const bar     = document.getElementById('dlBar');
  const fill    = document.getElementById('dlFill');
  const cur     = document.getElementById('dlCur');
  const dur     = document.getElementById('dlDur');

  audio.src = audio_url;
  show('playerWrap');

  const playIcon  = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
  const pauseIcon = `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;

  playBtn.addEventListener('click', () => {
    if (audio.paused) {
      audio.play().catch(() => showToast('No se pudo reproducir.', 'error'));
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

  audio.addEventListener('loadedmetadata', () => { dur.textContent = fmtTime(audio.duration); });
  audio.addEventListener('ended', () => { playBtn.innerHTML = playIcon; fill.style.width = '0%'; });

  bar.addEventListener('click', e => {
    if (!audio.duration) return;
    const rect = bar.getBoundingClientRect();
    audio.currentTime = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * audio.duration;
  });
}

async function loadPage() {
  const token = getParam('token');
  const card  = document.getElementById('downloadCard');
  const content = document.getElementById('cardContent');

  hide('stateLoading');
  show('downloadCard');

  if (!token) {
    card.classList.add('blocked-card');
    content.innerHTML = `
      <div class="download-icon">🔒</div>
      <div class="download-title" style="color:var(--neon-pink)">Acceso Inválido</div>
      <p class="download-sub">Este enlace no es válido. Revisa el correo que recibiste.</p>
      <div class="download-actions"><a href="index.html" class="btn-ghost">Volver al inicio</a></div>
    `;
    return;
  }

  // Show loading inside card
  content.innerHTML = `<div style="padding:2rem;display:flex;justify-content:center"><div class="spinner"></div></div>`;

  try {
    const { data, error } = await sb
      .from('pedidos')
      .select('id, cliente_nombre, tipo_tema, mood, estado, audio_url, token_descarga')
      .eq('token_descarga', token)
      .single();

    if (error || !data) {
      card.classList.add('blocked-card');
      content.innerHTML = `
        <div class="download-icon">🔒</div>
        <div class="download-title" style="color:var(--neon-pink)">Enlace No Encontrado</div>
        <p class="download-sub">No encontramos este pedido. Verifica el enlace de tu correo.</p>
        <div class="download-actions"><a href="index.html" class="btn-ghost">Volver al inicio</a></div>
      `;
      return;
    }

    if (data.estado !== 'pagado') {
      card.classList.add('blocked-card');
      content.innerHTML = `
        <div class="download-icon">⏳</div>
        <div class="download-title" style="color:var(--neon-yellow)">Pago Pendiente</div>
        <p class="download-sub">Tu pedido aún no ha sido marcado como pagado. Una vez confirmado el pago, recibirás el link de descarga por correo.</p>
        <div class="download-actions">
          <a href="escuchar.html?token=${token}" class="btn-ghost">← Volver a escuchar</a>
        </div>
      `;
      return;
    }

    // ✅ Pagado — show download
    initPlayer(data.audio_url);

    const filename = `${data.tipo_tema.replace(/\s+/g,'-')}-${data.id.slice(0,8)}.mp3`;

    content.innerHTML = `
      <div class="download-icon">🎵</div>
      <div class="download-title">¡Listo para Descargar!</div>
      <p class="download-sub">Pago confirmado. Tu canción personalizada está lista.</p>

      <div class="download-meta">
        <span class="player-tag">${data.tipo_tema}</span>
        <span class="player-tag" style="border-color:rgba(191,0,255,0.4);color:var(--neon-purple)">${data.mood || ''}</span>
        <span class="badge badge-pagado">Pagado</span>
      </div>

      <div class="download-actions">
        <button class="btn-primary" id="dlBtn" style="min-width:220px">⬇ Descargar Audio</button>
        <div style="display:flex;gap:0.75rem;flex-wrap:wrap;justify-content:center">
          <a href="demos.html" class="btn-ghost">Ver más demos</a>
          <a href="solicitar.html" class="btn-ghost">Pedir otra canción</a>
        </div>
      </div>
    `;

    document.getElementById('dlBtn').addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = data.audio_url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('Descarga iniciada.', 'success');
    });

  } catch (err) {
    console.error(err);
    content.innerHTML = `
      <div class="download-icon">⚠️</div>
      <div class="download-title" style="color:var(--neon-pink)">Error</div>
      <p class="download-sub">Ocurrió un error. Intenta de nuevo o contacta a Poncho.</p>
    `;
  }
}

document.addEventListener('DOMContentLoaded', loadPage);
