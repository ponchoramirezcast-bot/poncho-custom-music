// ============================================================
// PONCHO CUSTOM MUSIC — Edge Function: confirmar_pago v13
// Called by admin to confirm payment.
// FIX: SITE_URL hardcodeado como ponchorecords.com.mx
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // --- Verify admin JWT ---
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "No autorizado." }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const jwt = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt);
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Token inválido." }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { pedido_id } = await req.json();
    if (!pedido_id) {
      return new Response(JSON.stringify({ error: "pedido_id requerido." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Fetch pedido ---
    const { data: pedido, error: fetchErr } = await supabase
      .from("pedidos")
      .select("id, cliente_nombre, cliente_email, tipo_tema, mood, audio_path, token_descarga, precio, estado")
      .eq("id", pedido_id)
      .single();

    if (fetchErr || !pedido) throw fetchErr || new Error("Pedido no encontrado.");
    if (pedido.estado === "pagado") {
      return new Response(JSON.stringify({ error: "Este pedido ya fue marcado como pagado." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!pedido.audio_path) throw new Error("El pedido no tiene audio subido.");

    // --- Update pedido a "pagado" con timestamp ---
    const { error: updateErr } = await supabase
      .from("pedidos")
      .update({
        estado:    "pagado",
        pagado_en: new Date().toISOString(),
      })
      .eq("id", pedido_id);

    if (updateErr) throw updateErr;

    // --- Email al cliente con link de descarga ---
    const resendKey  = Deno.env.get("RESEND_API_KEY");
    const fromEmail  = Deno.env.get("FROM_EMAIL") || "Poncho Custom Music <noreply@ponchorecords.com.mx>";
    // FIX: URL correcta
    const siteUrl    = Deno.env.get("SITE_URL") || "https://ponchorecords.com.mx";
    const downloadUrl = `${siteUrl}/descargar.html?token=${pedido.token_descarga}`;

    if (resendKey) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: pedido.cliente_email,
          subject: "⬇️ Pago recibido — Descarga tu canción · Poncho Custom Music",
          html: `
            <div style="background:#020408;color:#e0e0e0;font-family:sans-serif;max-width:560px;margin:0 auto;padding:2rem">
              <h1 style="color:#00f5ff;font-size:1.2rem;letter-spacing:0.1em">PONCHO CUSTOM MUSIC</h1>
              <h2 style="color:#39ff14">¡Pago confirmado, ${pedido.cliente_nombre}!</h2>
              <p>Hemos recibido tu pago de <strong>$${pedido.precio || "—"} MXN</strong>. Tu descarga está activa.</p>
              <p style="color:#aaa">Haz clic en el botón para descargar tu canción personalizada:</p>
              <a href="${downloadUrl}" style="display:inline-block;margin:1.5rem 0;padding:0.85rem 2rem;background:transparent;border:1.5px solid #39ff14;color:#39ff14;text-decoration:none;font-family:monospace;font-size:0.8rem;letter-spacing:0.15em;text-transform:uppercase">
                ⬇ DESCARGAR MI CANCIÓN
              </a>
              <p style="color:#555;font-size:0.75rem">Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
              <p style="color:#00f5ff;font-size:0.75rem;word-break:break-all">${downloadUrl}</p>
              <p style="color:#555;font-size:0.75rem;margin-top:1rem">Este link de descarga es válido por 10 días. Guarda tu archivo una vez descargado.</p>
              <p style="color:#aaa;font-size:0.85rem">Tema: <strong>${pedido.tipo_tema}</strong>${pedido.mood ? ` | Mood: <strong>${pedido.mood}</strong>` : ''}</p>
              <p style="color:#aaa;font-size:0.85rem;margin-top:2rem">Gracias por tu compra. — Poncho Custom Music</p>
            </div>
          `,
        }),
      }).catch(console.error);
    }

    // --- WhatsApp al dueño confirmando el pago ---
    const ownerPhone   = Deno.env.get("OWNER_WHATSAPP");
    const callMeBotKey = Deno.env.get("CALLMEBOT_KEY");
    if (ownerPhone && callMeBotKey) {
      const waMsg = encodeURIComponent(
        `✅ Pago confirmado — Poncho Custom Music\n` +
        `Cliente: ${pedido.cliente_nombre}\n` +
        `Tipo: ${pedido.tipo_tema}\n` +
        `Precio: $${pedido.precio || "—"} MXN\n` +
        `Link descarga enviado a: ${pedido.cliente_email}`
      );
      fetch(
        `https://api.callmebot.com/whatsapp.php?phone=${ownerPhone}&text=${waMsg}&apikey=${callMeBotKey}`
      ).catch(console.error);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
