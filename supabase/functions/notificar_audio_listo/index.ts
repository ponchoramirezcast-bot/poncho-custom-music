// ============================================================
// PONCHO CUSTOM MUSIC — Edge Function: notificar_audio_listo v24
// FLUJO DEFINITIVO: pendiente → pagado → completado (FINAL)
//
// Si el pedido ya estaba pagado antes de subir el audio:
//   → estado = 'completado', email con link de DESCARGA directa
// Si el pedido aún no estaba pagado (flujo clásico):
//   → estado = 'completado', email con link de ESCUCHA + pagar
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
    const { pedido_id, audio_path, audio_path_2, nombre_cancion, precio } = await req.json();
    if (!pedido_id || !audio_path) {
      return new Response(JSON.stringify({ error: "pedido_id y audio_path requeridos." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Leer estado previo para saber qué email enviar ---
    const { data: prevPedido, error: prevErr } = await supabase
      .from("pedidos")
      .select("estado, pagado_en")
      .eq("id", pedido_id)
      .single();

    if (prevErr || !prevPedido) throw prevErr || new Error("Pedido no encontrado.");

    // ¿Ya había pagado antes de subir el audio?
    const yaEstabaPagado = prevPedido.estado === "pagado" || prevPedido.pagado_en !== null;

    // --- Signed URL para el player (72 horas) ---
    const { data: signedData, error: signErr } = await supabase.storage
      .from("audios")
      .createSignedUrl(audio_path, 259200);
    if (signErr) throw signErr;

    // --- Siempre pasa a 'completado' — estado final del ciclo ---
    const updateFields: Record<string, unknown> = {
      estado:        "completado",
      audio_url:     signedData.signedUrl,
      audio_path,
      completado_en: new Date().toISOString(),
    };
    if (precio)         updateFields.precio         = precio;
    if (audio_path_2)   updateFields.audio_path_2   = audio_path_2;
    if (nombre_cancion) updateFields.nombre_cancion = nombre_cancion;
    // Conservar pagado_en si ya existía
    if (yaEstabaPagado && prevPedido.pagado_en) {
      updateFields.pagado_en = prevPedido.pagado_en;
    }

    const { data: pedido, error: updateErr } = await supabase
      .from("pedidos")
      .update(updateFields)
      .eq("id", pedido_id)
      .select("id, cliente_nombre, cliente_email, cliente_telefono, tipo_tema, mood, token_escucha, token_descarga, precio")
      .single();

    if (updateErr) throw updateErr;

    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("FROM_EMAIL") || "Poncho Custom Music <noreply@ponchorecords.com.mx>";
    const siteUrl   = Deno.env.get("SITE_URL") || "https://ponchorecords.com.mx";

    const listenUrl   = `${siteUrl}/escuchar.html?token=${pedido.token_escucha}`;
    const downloadUrl = `${siteUrl}/descargar.html?token=${pedido.token_descarga}`;

    // --- WhatsApp al dueño ---
    const ownerPhone   = Deno.env.get("OWNER_WHATSAPP");
    const callMeBotKey = Deno.env.get("CALLMEBOT_KEY");
    if (ownerPhone && callMeBotKey) {
      const linkInfo = yaEstabaPagado
        ? `Link descarga: ${downloadUrl}`
        : `Link escucha: ${listenUrl}`;
      const waMsg = encodeURIComponent(
        `🎵 Audio listo — Poncho Custom Music\n` +
        `Cliente: ${pedido.cliente_nombre}\n` +
        `Email: ${pedido.cliente_email || "—"}\n` +
        `Cel: ${pedido.cliente_telefono || "—"}\n` +
        `Tipo: ${pedido.tipo_tema}\n` +
        `Precio: $${pedido.precio || "—"} MXN\n` +
        `${linkInfo}`
      );
      fetch(
        `https://api.callmebot.com/whatsapp.php?phone=${ownerPhone}&text=${waMsg}&apikey=${callMeBotKey}`
      ).catch(console.error);
    }

    // --- Email al cliente ---
    if (resendKey && pedido.cliente_email) {
      let emailSubject: string;
      let emailHtml: string;

      if (yaEstabaPagado) {
        // Flujo pago-primero: descarga directa
        emailSubject = "⬇️ Tu canción está lista para descargar · Poncho Custom Music";
        emailHtml = `
          <div style="background:#020408;color:#e0e0e0;font-family:sans-serif;max-width:560px;margin:0 auto;padding:2rem">
            <h1 style="color:#00f5ff;font-size:1.2rem;letter-spacing:0.1em">PONCHO CUSTOM MUSIC</h1>
            <h2 style="color:#39ff14">¡Tu canción ya está lista, ${pedido.cliente_nombre}!</h2>
            <p>Tu tema de <strong>${pedido.tipo_tema}</strong>${pedido.mood ? ` con mood <strong>${pedido.mood}</strong>` : ''} fue producido y está listo para descargar.</p>
            <p style="color:#aaa">Como tu pago ya está confirmado, puedes descargarla directamente aquí:</p>
            <a href="${downloadUrl}" style="display:inline-block;margin:1.5rem 0;padding:0.85rem 2rem;background:transparent;border:1.5px solid #39ff14;color:#39ff14;text-decoration:none;font-family:monospace;font-size:0.8rem;letter-spacing:0.15em;text-transform:uppercase">
              ⬇ DESCARGAR MI CANCIÓN
            </a>
            <p style="color:#555;font-size:0.75rem">Este link es privado y personal. Válido por 10 días.</p>
            <p style="color:#aaa;font-size:0.75rem">Si el botón no funciona, copia este enlace:<br><span style="color:#00f5ff">${downloadUrl}</span></p>
            <p style="color:#aaa;font-size:0.85rem;margin-top:2rem">Gracias por tu compra. — Poncho Custom Music</p>
          </div>
        `;
      } else {
        // Flujo clásico: escucha primero, luego paga
        emailSubject = "🎵 Tu canción está lista para escuchar — Poncho Custom Music";
        emailHtml = `
          <div style="background:#020408;color:#e0e0e0;font-family:sans-serif;max-width:560px;margin:0 auto;padding:2rem">
            <h1 style="color:#00f5ff;font-size:1.2rem;letter-spacing:0.1em">PONCHO CUSTOM MUSIC</h1>
            <h2 style="color:#fff">¡Tu canción está lista, ${pedido.cliente_nombre}!</h2>
            <p>Tu tema de <strong>${pedido.tipo_tema}</strong>${pedido.mood ? ` con mood <strong>${pedido.mood}</strong>` : ''} ya está listo para escuchar.</p>
            <p style="color:#aaa">Escúchala aquí (preview 45 seg). Cuando confirmes el pago, activamos tu descarga completa.</p>
            <a href="${listenUrl}" style="display:inline-block;margin:1.5rem 0;padding:0.85rem 2rem;background:transparent;border:1.5px solid #00f5ff;color:#00f5ff;text-decoration:none;font-family:monospace;font-size:0.8rem;letter-spacing:0.15em;text-transform:uppercase">
              ▶ ESCUCHAR MI CANCIÓN
            </a>
            <p style="color:#aaa;font-size:0.8rem">Precio: <strong>$${pedido.precio || "—"} MXN</strong></p>
            <p style="color:#555;font-size:0.75rem">Este link es privado. No lo compartas.</p>
            <p style="color:#aaa;font-size:0.85rem;margin-top:2rem">— Poncho Custom Music</p>
          </div>
        `;
      }

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from: fromEmail, to: pedido.cliente_email, subject: emailSubject, html: emailHtml }),
      }).catch(console.error);
    }

    return new Response(
      JSON.stringify({ success: true, pedido_id: pedido.id, flujo: yaEstabaPagado ? "pago-primero" : "audio-primero" }),
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
