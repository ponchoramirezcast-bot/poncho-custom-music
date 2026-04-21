// ============================================================
// PONCHO CUSTOM MUSIC — Edge Function: notificar_audio_listo v21
// Called by admin after uploading audio.
// FIX: usa token_escucha (no token_descarga) en el link de escucha
// FIX: guarda audio_path_2 y nombre_cancion
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
    const { pedido_id, audio_path, audio_path_2, nombre_cancion, precio } = await req.json();
    if (!pedido_id || !audio_path) {
      return new Response(JSON.stringify({ error: "pedido_id y audio_path requeridos." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Generate signed URL for listen page (72 hours) ---
    const { data: signedData, error: signErr } = await supabase.storage
      .from("audios")
      .createSignedUrl(audio_path, 259200);

    if (signErr) throw signErr;

    // --- Build update fields ---
    const updateFields: Record<string, unknown> = {
      estado:    "completado",
      audio_url: signedData.signedUrl,
      audio_path,
      completado_en: new Date().toISOString(),
    };
    if (precio)          updateFields.precio         = precio;
    if (audio_path_2)    updateFields.audio_path_2   = audio_path_2;
    if (nombre_cancion)  updateFields.nombre_cancion = nombre_cancion;

    // --- Update pedido ---
    const { data: pedido, error: updateErr } = await supabase
      .from("pedidos")
      .update(updateFields)
      .eq("id", pedido_id)
      .select("id, cliente_nombre, cliente_email, cliente_telefono, tipo_tema, mood, token_escucha, precio")
      .single();

    if (updateErr) throw updateErr;

    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("FROM_EMAIL") || "Poncho Custom Music <noreply@ponchorecords.com.mx>";
    // FIX: usa ponchorecords.com.mx como default
    const siteUrl   = Deno.env.get("SITE_URL") || "https://ponchorecords.com.mx";
    // FIX: usa token_escucha (no token_descarga)
    const listenUrl = `${siteUrl}/escuchar.html?token=${pedido.token_escucha}`;

    // --- WhatsApp al dueño con datos del cliente para reenviar ---
    const ownerPhone   = Deno.env.get("OWNER_WHATSAPP");
    const callMeBotKey = Deno.env.get("CALLMEBOT_KEY");
    if (ownerPhone && callMeBotKey) {
      const waMsg = encodeURIComponent(
        `🎵 Audio listo — Poncho Custom Music\n` +
        `Cliente: ${pedido.cliente_nombre}\n` +
        `Email: ${pedido.cliente_email}\n` +
        `Cel: ${pedido.cliente_telefono || "—"}\n` +
        `Tipo: ${pedido.tipo_tema}\n` +
        `Precio: $${pedido.precio || "—"} MXN\n` +
        `Link escucha: ${listenUrl}`
      );
      fetch(
        `https://api.callmebot.com/whatsapp.php?phone=${ownerPhone}&text=${waMsg}&apikey=${callMeBotKey}`
      ).catch(console.error);
    }

    // --- Email al cliente ---
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
          subject: "🎵 Tu canción está lista — Poncho Custom Music",
          html: `
            <div style="background:#020408;color:#e0e0e0;font-family:sans-serif;max-width:560px;margin:0 auto;padding:2rem">
              <h1 style="color:#00f5ff;font-size:1.2rem;letter-spacing:0.1em">PONCHO CUSTOM MUSIC</h1>
              <h2 style="color:#fff">¡Tu canción está lista, ${pedido.cliente_nombre}!</h2>
              <p>Tu tema de <strong>${pedido.tipo_tema}</strong>${pedido.mood ? ` con mood <strong>${pedido.mood}</strong>` : ''} ya está listo para escuchar.</p>
              <p style="color:#aaa">Haz clic abajo para escucharla. Cuando confirmes el pago por WhatsApp, activamos tu descarga.</p>
              <a href="${listenUrl}" style="display:inline-block;margin:1.5rem 0;padding:0.85rem 2rem;background:transparent;border:1.5px solid #00f5ff;color:#00f5ff;text-decoration:none;font-family:monospace;font-size:0.8rem;letter-spacing:0.15em;text-transform:uppercase">
                ▶ ESCUCHAR MI CANCIÓN
              </a>
              <p style="color:#aaa;font-size:0.8rem">Precio: <strong>$${pedido.precio || "—"} MXN</strong></p>
              <p style="color:#555;font-size:0.75rem">Este link es privado y personal. No lo compartas.</p>
              <p style="color:#aaa;font-size:0.85rem;margin-top:2rem">— Poncho Custom Music</p>
            </div>
          `,
        }),
      }).catch(console.error);
    }

    return new Response(
      JSON.stringify({ success: true, pedido_id: pedido.id }),
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
