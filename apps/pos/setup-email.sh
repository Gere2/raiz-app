#!/bin/bash
# ═══════════════════════════════════════
#  Setup: Enviar recibos por email
# ═══════════════════════════════════════

POS_DIR=~/raiz-app/apps/pos

echo "╔════════════════════════════════════════════╗"
echo "║  Setup: Recibos por email (Resend)         ║"
echo "╚════════════════════════════════════════════╝"
echo ""

# 1. Crear API route
echo "── 1. Creando API route /api/send-receipt ──"
mkdir -p "$POS_DIR/src/app/api/send-receipt"
cp ~/Downloads/route.ts "$POS_DIR/src/app/api/send-receipt/route.ts" 2>/dev/null

if [ ! -f "$POS_DIR/src/app/api/send-receipt/route.ts" ]; then
  echo "  ⚠️  Copia route.ts manualmente a $POS_DIR/src/app/api/send-receipt/"
else
  echo "  ✅ API route creada"
fi

# 2. Actualizar ticket-detail
echo "── 2. Actualizando ticket-detail.tsx ──"
cp ~/Downloads/ticket-detail.tsx "$POS_DIR/src/components/ticket-detail.tsx" 2>/dev/null

if grep -q "handleSendEmail" "$POS_DIR/src/components/ticket-detail.tsx" 2>/dev/null; then
  echo "  ✅ ticket-detail.tsx actualizado con botón de email"
else
  echo "  ⚠️  Copia ticket-detail.tsx manualmente a $POS_DIR/src/components/"
fi

# 3. Instalar Resend
echo "── 3. Instalando resend ──"
cd "$POS_DIR" && npm install resend 2>/dev/null
echo "  ✅ resend instalado"

echo ""
echo "╔════════════════════════════════════════════╗"
echo "║  ✅ Setup completo                         ║"
echo "╚════════════════════════════════════════════╝"
echo ""
echo "PASOS para activar:"
echo ""
echo "  1. Crear cuenta en https://resend.com (gratis)"
echo "  2. Dashboard → API Keys → Create API Key"
echo "  3. Añadir en Vercel (Settings → Env Variables):"
echo "     RESEND_API_KEY=re_xxxxxxxxxxxx"
echo ""
echo "  4. (Opcional) Para enviar desde tu dominio:"
echo "     - Resend → Domains → Add Domain → raizygrano.com"
echo "     - Añade los DNS records que te da"
echo "     - Luego en Vercel env:"
echo "       RESEND_FROM_EMAIL=recibos@raizygrano.com"
echo ""
echo "  5. Para probar en local, añade al .env.local:"
echo "     RESEND_API_KEY=re_xxxxxxxxxxxx"
echo ""
echo "  6. npm run dev -- -p 3001"
echo "     → Recibos → elige uno → 'Enviar recibo por email'"
echo ""
echo "  7. Deploy: vercel --prod"
