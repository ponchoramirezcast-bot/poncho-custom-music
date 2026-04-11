// ============================================================
// PONCHO CUSTOM MUSIC — Edge Function: crear_pedido
// Validates order, inserts to DB, sends WhatsApp + email
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

  try {
    const body = await req.json();
    const {
      cliente_nombre,
      cliente_email,
      cliente_telefono,
      tipo_tema,
      mood,
      descripcion,
      plan = "basico",
      addons = [],
      precio,
    } = body;

    // --- Validation ---
    if (!cliente_nombre || !cliente_email || !tipo_tema || !mood || !descripcion) {
      return new Response(
        JSON.stringify({ error: "Faltan campos requeridos." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (descripcion.length < 80) {
      return new Response(
        JSON.stringify({ error: "La descripción debe tener mínimo 80 caracteres." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(cliente_email)) {
      return new Response(
        JSON.stringify({ error: "Correo electrónico inválido." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Supabase client (service_role bypasses RLS) ---
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // --- Insert pedido ---
    const { data: pedido, error: insertErr } = await supabase
      .from("pedidos")
      .insert({
        cliente_nombre,
        cliente_email,
        cliente_telefono: cliente_telefono || null,
        tipo_tema,
        mood,
        descripcion,
        plan,
        addons,
        precio: precio || null,
        estado: "pendiente",
      })
      .select("id, token_descarga")
      .single();

    if (insertErr) throw insertErr;

    // --- WhatsApp via CallMeBot (non-blocking) ---
    const ownerPhone = Deno.env.get("OWNER_WHATSAPP");
    const callMeBotKey = Deno.env.get("CALLMEBOT_KEY");

    if (ownerPhone && callMeBotKey) {
      const waMsg = encodeURIComponent(
        `🎵 Nuevo pedido en Poncho Custom Music!\n` +
        `Cliente: ${cliente_nombre}\n` +
        `Email: ${cliente_email}\n` +
        `Cel: ${cliente_telefono || "—"}\n` +
        `Tipo: ${tipo_tema} | Mood: ${mood}\n` +
        `Plan: ${plan} | Precio: $${precio || "—"} MXN\n` +
        `ID: ${pedido.id}`
      );

      fetch(
        `https://api.callmebot.com/whatsapp.php?phone=${ownerPhone}&text=${waMsg}&apikey=${callMeBotKey}`
      ).catch(console.error);
    }

    // --- Email confirmation to client via Resend ---
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("FROM_EMAIL") || "Poncho Custom Music <noreply@ponchorecords.com>";
    const siteUrl   = Deno.env.get("SITE_URL") || "https://ponchoramirezcast-bot.github.io/poncho-records";

    if (resendKey) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: cliente_email,
          subject: "✅ Recibimos tu solicitud — Poncho Custom Music",
          html: `
            <div style="background:#020408;color:#e0e0e0;font-family:sans-serif;max-width:560px;margin:0 auto;padding:2rem">
              <h1 style="color:#00f5ff;font-size:1.2rem;letter-spacing:0.1em">PONCHO CUSTOM MUSIC</h1>
              <h2 style="color:#fff;font-size:1rem">¡Recibimos tu pedido, ${cliente_nombre}!</h2>
              <p>Estamos produciendo tu canción de <strong>${tipo_tema}</strong> con mood <strong>${mood}</strong>.</p>
              <p style="color:#aaa">Te notificaremos por correo cuando esté lista para escuchar. Normalmente tomamos 24-48 horas.</p>
              <p style="background:#060d14;border:1px solid rgba(0,245,255,0.2);padding:1rem;font-family:monospace;font-size:0.85rem">
                ID de pedido: <strong style="color:#00f5ff">${pedido.id}</strong>
              </p>
              <p style="color:#aaa;font-size:0.85rem">Plan: <strong>${plan}</strong> | Precio: <strong>$${precio || "—"} MXN</strong></p>
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
      JSON.stringify({ error: "Error interno del servidor." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
