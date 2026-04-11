# Poncho Custom Music — Guía de Configuración

## 1. Supabase — Crear Tablas

Corre este SQL en Supabase Dashboard → SQL Editor:

```sql
-- DEMOS
CREATE TABLE public.demos (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     TEXT NOT NULL,
  tipo_tema  TEXT NOT NULL,
  audio_url  TEXT NOT NULL,
  audio_path TEXT,
  orden      INTEGER DEFAULT 0,
  creado_en  TIMESTAMPTZ DEFAULT NOW()
);

-- PEDIDOS
CREATE TABLE public.pedidos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_nombre    TEXT NOT NULL,
  cliente_email     TEXT NOT NULL,
  cliente_telefono  TEXT,
  tipo_tema         TEXT NOT NULL,
  mood              TEXT,
  descripcion       TEXT NOT NULL,
  plan              TEXT NOT NULL DEFAULT 'basico',
  addons            JSONB DEFAULT '[]',
  estado            TEXT NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente','completado','pagado')),
  audio_url         TEXT,
  audio_path        TEXT,
  token_descarga    UUID UNIQUE DEFAULT gen_random_uuid(),
  precio            NUMERIC(10,2),
  pagado_en         TIMESTAMPTZ,
  creado_en         TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en    TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-update trigger
CREATE OR REPLACE FUNCTION update_actualizado_en()
RETURNS TRIGGER AS $$
BEGIN
  NEW.actualizado_en = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pedidos_actualizado_en
  BEFORE UPDATE ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION update_actualizado_en();

-- RLS
ALTER TABLE public.demos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;

-- demos: public read
CREATE POLICY "demos_public_read" ON public.demos
  FOR SELECT USING (true);

-- pedidos: public read (token = access control)
CREATE POLICY "pedidos_public_read" ON public.pedidos
  FOR SELECT USING (true);
```

## 2. Supabase — Storage

1. Dashboard → Storage → New bucket
2. Nombre: `audios`
3. Public: **NO** (privado)

## 3. Supabase — Usuario Admin

Dashboard → Authentication → Users → Add user  
- Email: tu correo personal  
- Password: contraseña segura

## 4. js/supabase-config.js

Reemplaza en `js/supabase-config.js`:
```
SUPABASE_URL     = 'https://TU_PROYECTO.supabase.co'
SUPABASE_ANON_KEY = 'eyJ...'   ← Dashboard → Settings → API → anon key
```

## 5. Edge Functions — Deploy

Instala Supabase CLI y corre:
```bash
supabase login
supabase link --project-ref TU_PROJECT_REF
supabase functions deploy crear_pedido
supabase functions deploy notificar_audio_listo
supabase functions deploy confirmar_pago
```

## 6. Edge Functions — Secrets

Dashboard → Edge Functions → Manage secrets:

| Secret               | Valor                                        |
|----------------------|----------------------------------------------|
| RESEND_API_KEY       | Obtén en resend.com (gratis)                 |
| FROM_EMAIL           | Poncho Custom Music <tu@dominio.com>         |
| OWNER_WHATSAPP       | 521XXXXXXXXXX (con código país, sin +)       |
| CALLMEBOT_KEY        | Obtén enviando "I allow callmebot..." al +34 644 60 49 48 |
| SITE_URL             | https://TU_USUARIO.github.io/TU_REPO         |

## 7. escuchar.js — Tu número de WhatsApp

En `js/escuchar.js` línea 8:
```js
const OWNER_WHATSAPP = '521XXXXXXXXXX'; // Tu número real
```

## 8. GitHub Pages

```bash
git init
git add .
git commit -m "Initial deploy"
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
git push -u origin main
```
GitHub → Settings → Pages → Source: main / root

## 9. Resend — Dominio (opcional pero recomendado)

Si tienes dominio propio, agrégalo en resend.com para que los correos no caigan en spam.  
Si no, usa el dominio de prueba de Resend que ya incluye en tu cuenta.

## 10. CallMeBot — Activar WhatsApp

Envía el mensaje exacto desde tu WhatsApp al número **+34 644 60 49 48**:
```
I allow callmebot to send me messages
```
Recibirás tu API key en minutos.
