/* ============================================================
   PONCHO CUSTOM MUSIC — Order Form Logic
   Multi-step: datos → canción → resumen → submit
   ============================================================ */

const ADDON_PRICES = { cover_art: 80, letra_pdf: 50, instrumental: 80 };
const PLAN_PRICES  = { basico: 200, plus: 299 };
const ADDON_LABELS = { cover_art: 'Cover Art', letra_pdf: 'Letra en PDF', instrumental: 'Instrumental' };

let currentStep = 1;
let selectedMood = '';
let selectedPlan = 'basico';
let selectedAddons = [];

/* ---- Step navigation ------------------------------------- */
function goToStep(n) {
  document.querySelectorAll('.form-step').forEach(s => s.classList.remove('active'));
  document.getElementById(`step${n}`)?.classList.add('active');

  // Update step indicator
  for (let i = 1; i <= 3; i++) {
    const item = document.getElementById(`si-${i}`);
    const line = document.getElementById(`sl-${i}`);
    item?.classList.remove('active', 'done');
    line?.classList.remove('done');
    if (i < n)  { item?.classList.add('done'); line?.classList.add('done'); }
    if (i === n) item?.classList.add('active');
  }

  currentStep = n;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---- Validation helpers ---------------------------------- */
function showErr(id, show = true) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('visible', show);
}

function validateStep1() {
  const nombre   = document.getElementById('nombre').value.trim();
  const email    = document.getElementById('email').value.trim();
  const telefono = document.getElementById('telefono').value.trim();
  const emailRe  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const telRe    = /^\+?[\d\s\-]{10,15}$/;
  let ok = true;

  // Nombre: obligatorio
  showErr('err-nombre', !nombre); if (!nombre) ok = false;

  // Email: opcional, pero si lo pone debe ser válido
  const emailInvalid = email.length > 0 && !emailRe.test(email);
  showErr('err-email', emailInvalid); if (emailInvalid) ok = false;

  // Teléfono: obligatorio
  showErr('err-telefono', !telRe.test(telefono)); if (!telRe.test(telefono)) ok = false;

  return ok;
}

function getTipoFinal() {
  const tipo  = document.getElementById('tipoTema').value;
  const otro  = document.getElementById('otroTipo').value.trim();
  return tipo === 'Otro' && otro ? otro : tipo;
}

function validateStep2() {
  const tipo  = document.getElementById('tipoTema').value;
  const otro  = document.getElementById('otroTipo').value.trim();
  const desc  = document.getElementById('descripcion').value.trim();
  let ok = true;

  showErr('err-tipo', !tipo);                   if (!tipo)          ok = false;
  // Si eligió "Otro", debe escribir el estilo
  const otroInvalid = tipo === 'Otro' && !otro;
  showErr('err-otro-tipo', otroInvalid);         if (otroInvalid)    ok = false;
  showErr('err-mood', !selectedMood);            if (!selectedMood)  ok = false;
  showErr('err-desc', desc.length < 80);         if (desc.length < 80) ok = false;

  return ok;
}

/* ---- Build summary --------------------------------------- */
function buildSummary() {
  const nombre   = document.getElementById('nombre').value.trim();
  const email    = document.getElementById('email').value.trim();
  const telefono = document.getElementById('telefono').value.trim();
  const tipo     = getTipoFinal();
  const desc     = document.getElementById('descripcion').value.trim();

  const planLabel = selectedPlan === 'plus' ? 'Plan Plus' : 'Plan Básico';
  const addonLabels = selectedAddons.map(a => ADDON_LABELS[a]).join(', ') || 'Ninguno';

  document.getElementById('summaryBlock').innerHTML = `
    <div class="summary-row"><span class="summary-label">Nombre</span><span class="summary-value">${nombre}</span></div>
    <div class="summary-row"><span class="summary-label">Email</span><span class="summary-value" style="color:${email ? 'inherit' : 'var(--text-dim)'}">${email || 'Sin correo — se notificará por WhatsApp'}</span></div>
    <div class="summary-row"><span class="summary-label">Celular</span><span class="summary-value">${telefono}</span></div>
    <div class="summary-row"><span class="summary-label">Género</span><span class="summary-value">${tipo}</span></div>
    <div class="summary-row"><span class="summary-label">Mood</span><span class="summary-value">${selectedMood}</span></div>
    <div class="summary-row"><span class="summary-label">Plan</span><span class="summary-value">${planLabel}</span></div>
    <div class="summary-row"><span class="summary-label">Extras</span><span class="summary-value">${addonLabels}</span></div>
    <div class="summary-row"><span class="summary-label">Contexto</span><span class="summary-value" style="max-width:300px;text-align:right;font-size:0.85rem;color:var(--text-dim)">${desc.slice(0, 120)}${desc.length > 120 ? '…' : ''}</span></div>
  `;

  // Price breakdown
  let base  = PLAN_PRICES[selectedPlan];
  let extra = selectedAddons.reduce((sum, a) => sum + (ADDON_PRICES[a] || 0), 0);
  let total = base + extra;

  let priceHtml = `
    <div class="price-row"><span class="summary-label">${planLabel}</span><span>${formatMXN(base)}</span></div>
  `;
  selectedAddons.forEach(a => {
    priceHtml += `<div class="price-row"><span class="summary-label">${ADDON_LABELS[a]}</span><span>+${formatMXN(ADDON_PRICES[a])}</span></div>`;
  });
  priceHtml += `<div class="price-row"><span>Total</span><span>${formatMXN(total)}</span></div>`;
  document.getElementById('priceSummary').innerHTML = priceHtml;
}

/* ---- Submit ---------------------------------------------- */
async function submitPedido() {
  const submitBtn     = document.getElementById('submitBtn');
  const submitText    = document.getElementById('submitText');
  const submitSpinner = document.getElementById('submitSpinner');

  submitBtn.disabled = true;
  submitText.classList.add('hidden');
  submitSpinner.classList.remove('hidden');

  const payload = {
    cliente_nombre:   document.getElementById('nombre').value.trim(),
    cliente_email:    document.getElementById('email').value.trim(),
    cliente_telefono: document.getElementById('telefono').value.trim(),
    tipo_tema:        getTipoFinal(),
    mood:             selectedMood,
    descripcion:      document.getElementById('descripcion').value.trim(),
    plan:             selectedPlan,
    addons:           selectedAddons,
    precio:           PLAN_PRICES[selectedPlan] + selectedAddons.reduce((s, a) => s + (ADDON_PRICES[a] || 0), 0),
  };

  try {
    const result = await callFunction('crear_pedido', payload);

    // Mostrar pantalla de pago
    document.querySelector('.step-indicator').style.display = 'none';
    document.querySelectorAll('.form-step').forEach(s => s.classList.remove('active'));
    const success = document.getElementById('successScreen');
    success.classList.add('active');
    document.getElementById('pedidoId').textContent = result.pedido_id || '—';

    // Botón Conekta
    const conektaBtn = document.getElementById('conektaPayLink');
    if (result.link_pago && conektaBtn) {
      conektaBtn.href = result.link_pago;
      conektaBtn.style.display = 'flex';
      conektaBtn.style.alignItems = 'center';
      conektaBtn.style.justifyContent = 'center';
    }

    // Botón WhatsApp
    const waBtn = document.getElementById('waPayLink');
    if (waBtn) {
      const versionStr = payload.addons?.length ? ` | Extras: ${payload.addons.join(', ')}` : '';
      const waMsg = encodeURIComponent(
        `Hola Poncho, quiero pagar mi canción personalizada.\n` +
        `ID: ${result.pedido_id}\n` +
        `Tipo: ${payload.tipo_tema} | Plan: ${payload.plan}${versionStr}\n` +
        `Precio: $${payload.precio} MXN`
      );
      waBtn.href = `https://wa.me/5214497573058?text=${waMsg}`;
    }

  } catch (err) {
    console.error(err);
    showToast('Error al enviar el pedido. Intenta de nuevo.', 'error');
    submitBtn.disabled = false;
    submitText.classList.remove('hidden');
    submitSpinner.classList.add('hidden');
  }
}

/* ---- Cargar géneros dinámico ----------------------------- */
async function loadGenerosIntoForm() {
  const sel = document.getElementById('tipoTema');
  if (!sel) return;
  try {
    const { data } = await sb.from('generos').select('nombre').eq('activo', true).order('orden', { ascending: true });
    sel.innerHTML = `<option value="" disabled selected>— Elige el género —</option>`;
    (data || []).forEach(g => {
      const opt = document.createElement('option');
      opt.value = g.nombre === 'Otro' ? 'Otro' : g.nombre;
      opt.textContent = g.nombre === 'Otro' ? 'Otro (especifica abajo)' : g.nombre;
      sel.appendChild(opt);
    });
  } catch (e) {
    console.error('Error cargando géneros:', e);
  }
}

/* ---- Init ------------------------------------------------ */
document.addEventListener('DOMContentLoaded', () => {
  loadGenerosIntoForm();
  // Pre-select plan from URL param
  const urlPlan = getParam('plan');
  if (urlPlan === 'plus') {
    selectedPlan = 'plus';
    document.querySelector('[data-plan="basico"]')?.classList.remove('selected');
    document.querySelector('[data-plan="plus"]')?.classList.add('selected');
    document.querySelector('[data-plan="plus"] input')?.setAttribute('checked', 'true');
  }

  /* Mostrar campo "Otro estilo" cuando lo seleccionan */
  document.getElementById('tipoTema')?.addEventListener('change', e => {
    const wrap = document.getElementById('otroTipoWrap');
    if (e.target.value === 'Otro') {
      wrap.classList.remove('hidden');
      document.getElementById('otroTipo').focus();
    } else {
      wrap.classList.add('hidden');
      document.getElementById('otroTipo').value = '';
    }
  });

  /* Step 1 → 2 */
  document.getElementById('next1')?.addEventListener('click', () => {
    if (validateStep1()) goToStep(2);
  });

  /* Step 2 → 3 */
  document.getElementById('next2')?.addEventListener('click', () => {
    if (validateStep2()) { buildSummary(); goToStep(3); }
  });

  /* Back buttons */
  document.getElementById('back2')?.addEventListener('click', () => goToStep(1));
  document.getElementById('back3')?.addEventListener('click', () => goToStep(2));

  /* Submit */
  document.getElementById('submitBtn')?.addEventListener('click', submitPedido);

  /* Plan cards */
  document.querySelectorAll('.plan-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.plan-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedPlan = card.dataset.plan;
      // Actualizar precio en tiempo real
      const extra = selectedAddons.reduce((s, a) => s + (ADDON_PRICES[a] || 0), 0);
      const priceEl = document.getElementById('livePrecio');
      if (priceEl) priceEl.textContent = formatMXN(PLAN_PRICES[selectedPlan] + extra);
    });
  });

  /* Mood chips */
  document.getElementById('moodGrid')?.addEventListener('click', e => {
    const chip = e.target.closest('.mood-chip');
    if (!chip) return;
    document.querySelectorAll('.mood-chip').forEach(c => c.classList.remove('selected'));
    chip.classList.add('selected');
    selectedMood = chip.dataset.mood;
    showErr('err-mood', false);
  });

  /* Add-on checkboxes */
  document.querySelectorAll('.addon-check').forEach(label => {
    label.addEventListener('click', (e) => {
      e.preventDefault(); // evita doble disparo label→input
      label.classList.toggle('selected');
      const val = label.dataset.addon;
      if (label.classList.contains('selected')) {
        if (!selectedAddons.includes(val)) selectedAddons.push(val);
      } else {
        selectedAddons = selectedAddons.filter(a => a !== val);
      }
      // Actualizar precio visible en tiempo real
      const base  = PLAN_PRICES[selectedPlan];
      const extra = selectedAddons.reduce((s, a) => s + (ADDON_PRICES[a] || 0), 0);
      const total = base + extra;
      const priceEl = document.getElementById('livePrecio');
      if (priceEl) priceEl.textContent = formatMXN(total);
    });
  });

  /* Char counter for descripcion */
  const desc    = document.getElementById('descripcion');
  const counter = document.getElementById('charCounter');
  const MIN     = 80;

  desc?.addEventListener('input', () => {
    const len = desc.value.trim().length;
    counter.textContent = `${len} / ${MIN}`;
    counter.className = 'char-counter' + (len >= MIN ? ' ok' : len > 40 ? ' warn' : '');
    if (len >= MIN) showErr('err-desc', false);
  });
});
