// ============================================================
// PONCHO CUSTOM MUSIC — Edge Function: confirmar_pago
// Called by admin to confirm payment.
// Updates estado to "pagado", generates long-lived signed URL, emails client.
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

    // --- Fetch pedido to get audio_path and token ---
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

    // --- Generate long-lived signed URL (7 days = 604800 seconds) ---
    const { data: signedData, error: signErr } = await supabase.storage
      .from("audios")
      .createSignedUrl(pedido.audio_path, 604800);

    if (signErr) throw signErr;

    // --- Update pedido ---
    const { error: updateErr } = await supabase
      .from("pedidos")
      .update({
        estado:    "pagado",
        pagado_en: new Date().toISOString(),
        audio_url: signedData.signedUrl,
      })
      .eq("id", pedido_id);

    if (updateErr) throw updateErr;

    // --- Email client ---
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("FROM_EMAIL") || "Poncho Custom Music <noreply@ponchorecords.com>";
    const siteUrl   = Deno.env.get("SITE_URL") || "https://ponchoramirezcast-bot.github.io/poncho-records";
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
          subject: "⬇️ Pago recibido — Descarga tu canción",
          html: `
            <div style="background:#020408;color:#e0e0e0;font-family:sans-serif;max-width:560px;margin:0 auto;padding:2rem">
              <h1 style="color:#00f5ff;font-size:1.2rem;letter-spacing:0.1em">PONCHO CUSTOM MUSIC</h1>
              <h2 style="color:#39ff14">¡Pago confirmado, ${pedido.cliente_nombre}!</h2>
              <p>Hemos recibido tu pago de <strong>$${pedido.precio || "—"} MXN</strong>. Tu descarga está activa.</p>
              <a href="${downloadUrl}" style="display:inline-block;margin:1.5rem 0;padding:0.85rem 2rem;background:transparent;border:1.5px solid #39ff14;color:#39ff14;text-decoration:none;font-family:monospace;font-size:0.8rem;letter-spacing:0.15em;text-transform:uppercase">
                ⬇ DESCARGAR MI CANCIÓN
              </a>
              <p style="color:#555;font-size:0.75rem">Este link de descarga es válido por 7 días. Guarda tu archivo una vez descargado.</p>
              <p style="color:#aaa;font-size:0.85rem">Tema: <strong>${pedido.tipo_tema}</strong> | Mood: <strong>${pedido.mood || "—"}</strong></p>
              <p style="color:#aaa;font-size:0.85rem;margin-top:2rem">Gracias por tu compra. — Poncho Custom Music</p>
            </div>
          `,
        }),
      }).catch(console.error);
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
