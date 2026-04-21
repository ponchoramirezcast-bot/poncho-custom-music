/* ============================================================
   PONCHO CUSTOM MUSIC — Demos Gallery
   Custom audio player, filter by tipo_tema, no-download policy
   FIX: audio ruteado por stream_audio proxy (modo demo)
   ============================================================ */

const STREAM_URL = 'https://vtbifrcnjrvqgwtjdood.supabase.co/functions/v1/stream_audio';

let currentAudioId = null;
let allDemos = [];

const playIcon  = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
const pauseIcon = `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;

function fmtTime(s) {
  if (isNaN(s) || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/* ---- Render a single demo card --------------------------- */
function renderDemoCard(demo) {
  const card = document.createElement('div');
  card.className = 'demo-card audio-card';
  card.dataset.tipo = demo.tipo_tema;

  // FIX: usar proxy stream_audio en modo demo (nunca exponer URL real)
  const demoStreamUrl = `${STREAM_URL}?mode=demo&demo_id=${demo.id}`;

  card.innerHTML = `
    <audio
      id="aud-${demo.id}"
      src="${demoStreamUrl}"
      preload="none"
      controlsList="nodownload"
      oncontextmenu="return false">
    </audio>

    <div class="player-header">
      <div>
        <div class="player-title">${demo.nombre}</div>
      </div>
      <span class="player-tag">${demo.tipo_tema}</span>
    </div>

    <div class="player-controls">
      <button class="player-btn" id="btn-${demo.id}" aria-label="Reproducir/Pausar">
        ${playIcon}
      </button>
      <div class="player-progress-wrap">
        <div class="player-bar" id="bar-${demo.id}" role="progressbar" aria-label="Progreso">
          <div class="player-bar-fill" id="fill-${demo.id}"></div>
        </div>
        <div class="player-times">
          <span id="cur-${demo.id}">0:00</span>
          <span id="dur-${demo.id}">0:00</span>
        </div>
      </div>
    </div>
  `;

  return card;
}

/* ---- Init player logic for a card ----------------------- */
function initPlayer(id) {
  const aud  = document.getElementById(`aud-${id}`);
  const btn  = document.getElementById(`btn-${id}`);
  const bar  = document.getElementById(`bar-${id}`);
  const fill = document.getElementById(`fill-${id}`);
  const cur  = document.getElementById(`cur-${id}`);
  const dur  = document.getElementById(`dur-${id}`);
  if (!aud || !btn) return;

  btn.addEventListener('click', () => {
    // Pause previous
    if (currentAudioId && currentAudioId !== id) {
      const prevAud = document.getElementById(`aud-${currentAudioId}`);
      const prevBtn = document.getElementById(`btn-${currentAudioId}`);
      const prevFill = document.getElementById(`fill-${currentAudioId}`);
      if (prevAud) { prevAud.pause(); prevAud.currentTime = 0; }
      if (prevBtn) prevBtn.innerHTML = playIcon;
      if (prevFill) prevFill.style.width = '0%';
    }

    if (aud.paused) {
      aud.play().catch(() => showToast('No se pudo reproducir el audio.', 'error'));
      btn.innerHTML = pauseIcon;
      currentAudioId = id;
    } else {
      aud.pause();
      btn.innerHTML = playIcon;
      currentAudioId = null;
    }
  });

  aud.addEventListener('timeupdate', () => {
    if (!aud.duration) return;
    const pct = (aud.currentTime / aud.duration) * 100;
    fill.style.width = pct + '%';
    cur.textContent = fmtTime(aud.currentTime);
  });

  aud.addEventListener('loadedmetadata', () => {
    dur.textContent = fmtTime(aud.duration);
  });

  aud.addEventListener('ended', () => {
    btn.innerHTML = playIcon;
    fill.style.width = '0%';
    cur.textContent = '0:00';
    currentAudioId = null;
  });

  aud.addEventListener('error', () => {
    btn.innerHTML = playIcon;
    showToast('Error al cargar el audio.', 'error');
  });

  // Click on progress bar to seek
  bar.addEventListener('click', e => {
    if (!aud.duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    aud.currentTime = ratio * aud.duration;
  });
}

/* ---- Filter logic ---------------------------------------- */
function applyFilter(tipo) {
  const cards = document.querySelectorAll('.demo-card');
  cards.forEach(card => {
    if (tipo === 'all' || card.dataset.tipo === tipo) {
      card.classList.remove('hidden');
    } else {
      card.classList.add('hidden');
    }
  });

  // Stop any playing audio when filter changes
  if (currentAudioId) {
    const aud = document.getElementById(`aud-${currentAudioId}`);
    const btn = document.getElementById(`btn-${currentAudioId}`);
    if (aud) aud.pause();
    if (btn) btn.innerHTML = playIcon;
    currentAudioId = null;
  }
}

/* ---- Load demos from Supabase ---------------------------- */
async function loadDemos() {
  const grid = document.getElementById('demosGrid');

  try {
    const { data, error } = await sb
      .from('demos')
      .select('id, nombre, tipo_tema, audio_url, orden')
      .order('orden', { ascending: true });

    if (error) throw error;

    if (!data || data.length === 0) {
      grid.innerHTML = `<div class="demos-empty">
        <p>Demos próximamente — vuelve pronto.</p>
      </div>`;
      return;
    }

    allDemos = data;
    grid.innerHTML = '';

    data.forEach(demo => {
      const card = renderDemoCard(demo);
      grid.appendChild(card);
      initPlayer(demo.id);
    });

  } catch (err) {
    console.error(err);
    grid.innerHTML = `<div class="demos-empty" style="color:var(--neon-pink)">
      <p>Error al cargar los demos. Intenta de nuevo más tarde.</p>
    </div>`;
  }
}

/* ---- Filter bar events ----------------------------------- */
async function loadFilterButtons() {
  const bar = document.getElementById('filterBar');
  if (!bar) return;
  try {
    const { data } = await sb.from('generos').select('nombre').eq('activo', true).order('orden', { ascending: true });
    (data || []).forEach(g => {
      if (g.nombre === 'Otro') return; // no mostrar "Otro" como filtro
      const btn = document.createElement('button');
      btn.className = 'filter-btn';
      btn.dataset.filter = g.nombre;
      btn.textContent = g.nombre;
      bar.appendChild(btn);
    });
  } catch (e) {
    console.error('Error cargando filtros:', e);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadFilterButtons();
  loadDemos();

  document.getElementById('filterBar')?.addEventListener('click', e => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;

    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    applyFilter(btn.dataset.filter);
  });
});
