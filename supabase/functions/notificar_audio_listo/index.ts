// ============================================================
// PONCHO CUSTOM MUSIC — Edge Function: notificar_audio_listo
// Called by admin after uploading audio.
// Updates estado to "completado", generates signed URL, emails client.
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

  // Verify the JWT belongs to a valid user
  const jwt = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt);
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Token inválido." }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { pedido_id, audio_path, precio } = await req.json();
    if (!pedido_id || !audio_path) {
      return new Response(JSON.stringify({ error: "pedido_id y audio_path requeridos." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Generate signed URL (72 hours = 259200 seconds) ---
    const { data: signedData, error: signErr } = await supabase.storage
      .from("audios")
      .createSignedUrl(audio_path, 259200);

    if (signErr) throw signErr;

    const signedUrl = signedData.signedUrl;

    // --- Update pedido ---
    const { data: pedido, error: updateErr } = await supabase
      .from("pedidos")
      .update({
        estado:    "completado",
        audio_url: signedUrl,
        audio_path,
        precio:    precio || null,
      })
      .eq("id", pedido_id)
      .select("id, cliente_nombre, cliente_email, tipo_tema, mood, token_descarga, precio")
      .single();

    if (updateErr) throw updateErr;

    // --- Email client ---
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("FROM_EMAIL") || "Poncho Custom Music <noreply@ponchorecords.com>";
    const siteUrl   = Deno.env.get("SITE_URL") || "https://ponchoramirezcast-bot.github.io/poncho-records";
    const listenUrl = `${siteUrl}/escuchar.html?token=${pedido.token_descarga}`;

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
              <p>Tu tema de <strong>${pedido.tipo_tema}</strong> con mood <strong>${pedido.mood || ""}</strong> ya está listo para escuchar.</p>
              <p style="color:#aaa">Haz clic abajo para escucharla. Cuando estés listo para pagar, contáctanos por WhatsApp y activamos tu descarga.</p>
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
      JSON.stringify({ error: "Error interno." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
