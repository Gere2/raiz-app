/**
 * lib/treasury/seed-rules.ts
 *
 * Reglas semilla del Treasury Truth Layer.
 *
 * Cada regla tiene un id estable `seed_*` para que el seeding sea idempotente.
 * Si el usuario edita una regla manualmente desde la UI futura, su `source`
 * pasa a `"manual"` y deja de sobrescribirse en upgrades de seed.
 *
 * Prioridades (mayor = se evalúa primero):
 *   200  ventas TPV
 *   180  AEAT, Seguridad Social
 *   150  proveedores específicos (café, IA, gestoría, zumos, packaging, UFV)
 *   130  proveedores genéricos (Amazon, Makro, IKEA/ECI)
 *   120  transporte
 *   110  tarjetas pendientes (9415, 2288)
 *   100  retiradas socio
 */

import type { TreasuryRule } from "./types";

export const SEED_RULES: TreasuryRule[] = [
  /* ─── Ingresos TPV ──────────────────────────────────────────── */
  {
    id: "seed_tpv_redsys",
    name: "TPV / Redsys / liquidación tarjeta (multi-formato)",
    priority: 200,
    version: 3,
    active: true,
    amountSign: "positive",
    matchers: [
      {
        field: "concept",
        // v3 (PR1.4): añadido "Liquidacion Efectuada" — formato Santander
        // cuenta principal ("Liquidacion Efectuada El X A Raiz Y Grano …").
        // BBVA mete "COMERC <id> REM <ref>" (v2). Otros bancos pueden usar
        // "REDSYS", "TPV", "comercio santander", "abono comercio".
        regex:
          "\\bredsys\\b" +
          "|\\btpv\\b" +
          "|liquidaci[oó]n\\s+tarjeta" +
          "|liquidaci[oó]n\\s+efectuada" +
          "|liquid\\.?\\s*tarjetas?" +
          "|comercio\\s+santander" +
          "|abono\\s+comercio" +
          "|abono\\s+tpv" +
          "|liquidaci[oó]n\\s+comercio" +
          "|\\bcomerc\\s+\\d{6,}\\b",
      },
    ],
    action: {
      category: "ventas_tpv",
      subcategory: "tpv",
      flowKind: "income_sales_tpv",
      supplierName: "TPV / Redsys",
      confidence: 0.95,
    },
    source: "seed",
    notes:
      "Liquidaciones diarias del datáfono — ingreso operativo principal. " +
      "BBVA: 'COMERC <id> REM <ref>'. Santander: 'Liquidacion Efectuada El X A …'.",
  },

  /* ─── Impuestos / cotizaciones ──────────────────────────────── */
  {
    id: "seed_aeat",
    name: "AEAT / Agencia Tributaria (NRC + cargo de impuestos)",
    priority: 180,
    version: 3,
    active: true,
    amountSign: "negative",
    matchers: [
      {
        field: "concept_or_supplier",
        // v2 (PR1.1): patrón NRC — pagos a Hacienda en BBVA como "NRC. <ref>".
        // v3 (2026-06): "CARGO POR PAGO DE IMPUESTOS - TRIBUTOS" (BBVA código
        // 00326) cuando la referencia NO trae el prefijo "NRC." en el concepto.
        regex:
          "\\baeat\\b|agencia\\s+tributaria|hacienda\\s+p[uú]blica|\\bnrc[\\s.]" +
          "|cargo\\s+por\\s+pago\\s+de\\s+impuestos|pago\\s+de\\s+(impuestos|tributos)",
      },
    ],
    action: {
      category: "impuestos",
      subcategory: "aeat",
      flowKind: "expense_operating",
      supplierName: "AEAT",
      confidence: 0.9,
    },
    source: "seed",
    notes:
      "NRC = Número de Referencia Completo, identifica pagos a la AEAT en el concepto bancario.",
  },
  {
    id: "seed_seguridad_social",
    name: "Seguridad Social / TGSS / Cuota autónomo",
    priority: 180,
    version: 2,
    active: true,
    amountSign: "negative",
    matchers: [
      {
        field: "concept_or_supplier",
        // v2 (PR1.5): añadido "cuota autonomo" — formato manual que el banco
        // muestra cuando se domicilia bajo concepto libre.
        keywordsAny: [
          "seguridad social",
          "tgss",
          "t.g.s.s",
          "tesoreria gral",
          "tesorería gral",
          "tesoreria general seg",
          "tesorería general seg",
          "cuota autonomo",
          "cuota autónomo",
          "pago cuota autonomo",
          "pago cuota autónomo",
        ],
      },
    ],
    action: {
      category: "personal",
      subcategory: "autonomo_ss",
      flowKind: "expense_operating",
      supplierName: "Seguridad Social",
      confidence: 0.95,
    },
    source: "seed",
  },

  /* ─── Comisiones / gastos del propio banco (v1, 2026-06) ────── */
  {
    id: "seed_bank_fees",
    name: "Comisiones y gastos bancarios",
    priority: 140,
    version: 1,
    active: true,
    amountSign: "negative",
    matchers: [
      {
        field: "concept_or_supplier",
        // Cargos del banco, NO de un proveedor. Frases distintivas para no
        // colisionar con "Liquidacion Efectuada" (TPV, priority 200, positivo).
        regex:
          "tarifa\\s+plana" +
          "|liquidaci[oó]n\\s+de\\s+intereses" +
          "|intereses[\\s-]+comisiones" +
          "|comisiones[\\s-]+gastos" +
          "|liquidaci[oó]n\\s+del\\s+contrato" +
          "|regularizaci[oó]n\\s+cuenta\\s+de\\s+incidencias" +
          "|comisi[oó]n\\s+(de\\s+)?mantenimiento" +
          "|mantenimiento\\s+(de\\s+)?cuenta",
      },
    ],
    action: {
      category: "servicios",
      subcategory: "comisiones_bancarias",
      flowKind: "expense_operating",
      supplierName: "Comisión bancaria",
      confidence: 0.85,
    },
    source: "seed",
    notes:
      "Comisiones, tarifas y gastos que cobra el propio banco (tarifa plana, " +
      "intereses-comisiones-gastos, liquidación del contrato, regularización de " +
      "incidencias, mantenimiento). Gasto operativo inequívoco — no es proveedor.",
  },

  /* ─── Proveedores específicos ───────────────────────────────── */
  {
    id: "seed_amor_perfecto",
    name: "Amor Perfecto (café)",
    priority: 150,
    version: 1,
    active: true,
    amountSign: "negative",
    matchers: [
      {
        field: "concept_or_supplier",
        keywordsAny: ["amor perfecto", "amorperfecto"],
      },
    ],
    action: {
      category: "materia_prima",
      subcategory: "cafe",
      flowKind: "expense_operating",
      supplierName: "Amor Perfecto",
      confidence: 0.95,
    },
    source: "seed",
  },
  {
    id: "seed_ufv",
    name: "UFV / Fundación Francisco de Vitoria (luz / gas)",
    priority: 150,
    version: 1,
    active: true,
    amountSign: "negative",
    matchers: [
      {
        field: "concept_or_supplier",
        regex:
          "(francisco\\s+de\\s+vitoria|fund\\.?\\s*fco\\.?\\s*(de\\s+)?vitoria|\\bufv\\b)",
      },
    ],
    action: {
      category: "suministros",
      subcategory: "luz_gas",
      flowKind: "expense_operating",
      supplierName: "UFV / Fundación Francisco de Vitoria",
      confidence: 0.9,
    },
    source: "seed",
    notes:
      "Por defecto la UFV emite suministros básicos del campus (luz/gas). Revisar si en algún mes incluye alquiler o servicios distintos.",
  },
  {
    id: "seed_anthropic",
    name: "Anthropic / Claude (IA)",
    priority: 150,
    version: 1,
    active: true,
    amountSign: "negative",
    matchers: [
      {
        field: "concept_or_supplier",
        keywordsAny: ["anthropic", "claude.ai", "claude ai"],
      },
    ],
    action: {
      category: "tecnologia",
      subcategory: "ia",
      flowKind: "expense_operating",
      supplierName: "Anthropic",
      confidence: 0.95,
    },
    source: "seed",
  },
  {
    id: "seed_openai",
    name: "OpenAI / ChatGPT (IA)",
    priority: 150,
    version: 1,
    active: true,
    amountSign: "negative",
    matchers: [
      {
        field: "concept_or_supplier",
        keywordsAny: ["openai", "chatgpt"],
      },
    ],
    action: {
      category: "tecnologia",
      subcategory: "ia",
      flowKind: "expense_operating",
      supplierName: "OpenAI",
      confidence: 0.95,
    },
    source: "seed",
  },
  {
    id: "seed_zumit",
    name: "Zumit / Squeeze (zumos reventa)",
    priority: 150,
    version: 1,
    active: true,
    amountSign: "negative",
    matchers: [
      {
        field: "concept_or_supplier",
        keywordsAny: ["zumit", "squeeze", "squezze"],
      },
    ],
    action: {
      category: "materia_prima",
      subcategory: "zumos_reventa",
      flowKind: "expense_operating",
      supplierName: "Zumit / Squeeze",
      confidence: 0.9,
    },
    source: "seed",
  },
  {
    id: "seed_reimpulsa",
    name: "Reimpulsa (gestoría)",
    priority: 150,
    version: 1,
    active: true,
    amountSign: "negative",
    matchers: [
      {
        field: "concept_or_supplier",
        keywordsAny: ["reimpulsa"],
      },
    ],
    action: {
      category: "servicios",
      subcategory: "gestoria",
      flowKind: "expense_operating",
      supplierName: "Reimpulsa",
      confidence: 0.95,
    },
    source: "seed",
  },
  {
    id: "seed_envapro_gloop",
    name: "Envapro / Gloop (packaging consumibles)",
    priority: 150,
    version: 1,
    active: true,
    amountSign: "negative",
    matchers: [
      {
        field: "concept_or_supplier",
        keywordsAny: ["envapro", "gloop"],
      },
    ],
    action: {
      category: "packaging",
      subcategory: "consumibles",
      flowKind: "expense_operating",
      confidence: 0.85,
    },
    source: "seed",
  },

  /* ─── Personal / nóminas (v1, PR1.5) ────────────────────────── */
  {
    id: "seed_nomina",
    name: "Nómina personal",
    priority: 145,
    version: 1,
    active: true,
    amountSign: "negative",
    matchers: [
      {
        field: "concept_or_supplier",
        regex: "\\bn[oó]mina\\b|\\bsalario\\b|\\bpaga\\s+extra\\b",
      },
    ],
    action: {
      category: "personal",
      subcategory: "nomina",
      flowKind: "expense_operating",
      confidence: 0.85,
    },
    source: "seed",
    notes:
      "Marca economicMonth manualmente a 'mes nominal de la nómina' (no el mes de pago) para que el devengo cuadre.",
  },

  /* ─── Seguros (v1, PR1.5) ───────────────────────────────────── */
  {
    id: "seed_seguros",
    name: "Seguros (Generali, mutua, prevención riesgos)",
    priority: 150,
    version: 1,
    active: true,
    amountSign: "negative",
    matchers: [
      {
        field: "concept_or_supplier",
        keywordsAny: [
          "generali",
          "mapfre",
          "axa seguros",
          "allianz",
          "mutua",
          "general risk prevention",
          "seguros y reaseguros",
        ],
      },
    ],
    action: {
      category: "seguros",
      subcategory: "general",
      flowKind: "expense_operating",
      confidence: 0.85,
    },
    source: "seed",
    notes: "Seguros de RC, mutua de prevención, etc.",
  },

  /* ─── Telefonía / internet (v1, PR1.5) ──────────────────────── */
  {
    id: "seed_telefonia",
    name: "Telefonía / Internet (DIGI, Movistar, Vodafone…)",
    priority: 145,
    version: 1,
    active: true,
    amountSign: "negative",
    matchers: [
      {
        field: "concept_or_supplier",
        keywordsAny: [
          "digi spain",
          "digi mobil",
          "movistar",
          "vodafone",
          "orange esp",
          "masmovil",
          "yoigo",
          "pepephone",
          "lowi",
          "o2 telefonia",
        ],
      },
    ],
    action: {
      category: "suministros",
      subcategory: "telefonia_internet",
      flowKind: "expense_operating",
      confidence: 0.9,
    },
    source: "seed",
  },

  /* ─── Apple subscriptions (v1, PR1.5) ───────────────────────── */
  {
    id: "seed_apple",
    name: "Apple iCloud / App Store / iTunes",
    priority: 145,
    version: 1,
    active: true,
    amountSign: "negative",
    matchers: [
      {
        field: "concept_or_supplier",
        regex: "apple\\.com\\/bill|itunes\\.com|apple\\s*itunes|apple\\s*store",
      },
    ],
    action: {
      category: "tecnologia",
      subcategory: "apple_subscriptions",
      flowKind: "expense_operating",
      supplierName: "Apple",
      confidence: 0.9,
    },
    source: "seed",
    notes: "Suscripciones Apple recurrentes (iCloud, Apple One, etc.).",
  },

  /* ─── Café genérico / proveedores con typo (v1, PR1.5) ───────── */
  {
    id: "seed_cafe_generic",
    name: "Café (proveedor genérico, typos)",
    priority: 140,
    version: 1,
    active: true,
    amountSign: "negative",
    matchers: [
      {
        field: "concept_or_supplier",
        keywordsAny: [
          "proveedor cafe",
          "proveedor café",
          "provedor cafe",
          "provedor café",
          "tostadores",
          "torrefacto",
        ],
      },
    ],
    action: {
      category: "materia_prima",
      subcategory: "cafe",
      flowKind: "expense_operating",
      confidence: 0.8,
    },
    source: "seed",
    notes:
      "Captura proveedores de café que no son Amor Perfecto (la regla específica gana por mayor priority).",
  },

  /* ─── Proveedor de açaí (v1, PR1.5) ─────────────────────────── */
  {
    id: "seed_acai",
    name: "Proveedor de açaí",
    priority: 145,
    version: 1,
    active: true,
    amountSign: "negative",
    matchers: [
      {
        field: "concept_or_supplier",
        keywordsAny: ["acai", "açai", "almalibre acai"],
      },
    ],
    action: {
      category: "materia_prima",
      subcategory: "acai",
      flowKind: "expense_operating",
      confidence: 0.85,
    },
    source: "seed",
  },

  /* ─── Proveedores genéricos ─────────────────────────────────── */
  {
    id: "seed_amazon",
    name: "Amazon (leche / suministros)",
    priority: 130,
    version: 1,
    active: true,
    amountSign: "negative",
    matchers: [
      {
        field: "concept_or_supplier",
        keywordsAny: ["amazon", "amzn", "amazon.es", "amazon eu"],
      },
    ],
    action: {
      category: "materia_prima",
      subcategory: "leche_suministros_amazon",
      flowKind: "expense_operating",
      supplierName: "Amazon",
      confidence: 0.8,
    },
    source: "seed",
    notes:
      "Por defecto Amazon = leche/suministros operativos. Si una factura concreta es equipamiento, corregir manualmente y el sistema aprenderá.",
  },
  {
    id: "seed_makro",
    name: "Makro (compras generales)",
    priority: 130,
    version: 1,
    active: true,
    amountSign: "negative",
    matchers: [
      {
        field: "concept_or_supplier",
        keywordsAny: ["makro"],
      },
    ],
    action: {
      category: "materia_prima",
      subcategory: "compras_generales",
      flowKind: "expense_operating",
      supplierName: "Makro",
      confidence: 0.8,
    },
    source: "seed",
  },
  {
    id: "seed_ikea_eci",
    name: "IKEA / El Corte Inglés (equipamiento — revisar)",
    priority: 130,
    version: 1,
    active: true,
    amountSign: "negative",
    matchers: [
      {
        field: "concept_or_supplier",
        keywordsAny: [
          "ikea",
          "el corte ingles",
          "el corte inglés",
          "corte ingles",
          "corte inglés",
        ],
      },
    ],
    action: {
      category: "equipamiento",
      subcategory: "revisar",
      flowKind: "expense_operating",
      confidence: 0.7,
    },
    source: "seed",
    notes:
      "Confidence baja a propósito: puede ser menaje, mobiliario o consumible. Revisar uno por uno.",
  },

  /* ─── Transporte ────────────────────────────────────────────── */
  {
    id: "seed_transport",
    name: "Uber / Bolt / Cabify (transporte)",
    priority: 120,
    version: 1,
    active: true,
    amountSign: "negative",
    matchers: [
      {
        field: "concept_or_supplier",
        regex: "\\buber\\b|\\bbolt\\b|cabify",
      },
    ],
    action: {
      category: "logistica",
      subcategory: "transporte",
      flowKind: "expense_operating",
      confidence: 0.8,
    },
    source: "seed",
    notes:
      "Revisar deducibilidad: trayectos personales no son gasto del negocio.",
  },

  /* ─── Tarjetas pendientes de extracto detallado ─────────────── */
  {
    id: "seed_card_9415",
    name: "Tarjeta *9415 (pendiente extracto)",
    priority: 110,
    version: 2,
    active: true,
    // v2 (PR1.1): "any" porque las devoluciones (importe positivo) sobre la
    // misma tarjeta también son card_pending hasta que se suba el extracto.
    amountSign: "any",
    matchers: [
      {
        field: "concept",
        // v2: añadido `\b\d{12}9415\b` — BBVA muestra liquidaciones de tarjeta
        // como el PAN completo de 16 dígitos sin la palabra "TARJETA".
        regex:
          "\\b\\d{12}9415\\b|tarjeta.{0,20}9415|\\*\\s*9415|x{2,}\\s*9415",
      },
    ],
    action: {
      category: "tarjeta_pendiente",
      subcategory: "tarjeta_9415",
      flowKind: "card_pending",
      supplierName: "Tarjeta *9415",
      confidence: 0.9,
    },
    source: "seed",
    notes:
      "NO se imputa como gasto operativo definitivo. Pendiente subir extracto detallado de la tarjeta para desglose real.",
  },
  {
    id: "seed_card_2288",
    name: "Tarjeta *2288 (pendiente extracto)",
    priority: 110,
    version: 2,
    active: true,
    amountSign: "any",
    matchers: [
      {
        field: "concept",
        regex:
          "\\b\\d{12}2288\\b|tarjeta.{0,20}2288|\\*\\s*2288|x{2,}\\s*2288",
      },
    ],
    action: {
      category: "tarjeta_pendiente",
      subcategory: "tarjeta_2288",
      flowKind: "card_pending",
      supplierName: "Tarjeta *2288",
      confidence: 0.9,
    },
    source: "seed",
    notes:
      "NO se imputa como gasto operativo definitivo. Pendiente subir extracto detallado de la tarjeta para desglose real.",
  },

  /* ─── Retirada socio ────────────────────────────────────────── */
  {
    id: "seed_partner_drawing",
    name: "Retirada cajero / disposición socio",
    priority: 100,
    version: 1,
    active: true,
    amountSign: "negative",
    matchers: [
      {
        field: "concept",
        keywordsAny: [
          "retirada",
          "reintegro",
          "cajero",
          "disposicion efectivo",
          "disposición efectivo",
          "extraccion cajero",
          "extracción cajero",
        ],
      },
    ],
    action: {
      category: "disposicion_socio",
      subcategory: "retirada_socio",
      flowKind: "partner_drawing",
      supplierName: "Disposición socio",
      confidence: 0.85,
    },
    source: "seed",
    notes:
      "NO es gasto operativo. Es una disposición del socio/propietario. Afecta al sueldo posible, no al P&L.",
  },
];

/**
 * Reglas específicas de la CASA (Raíz y Grano): proveedores y tarjetas propios.
 *
 * NO deben sembrarse en cafés cliente — contaminarían su clasificación. El caso
 * grave son las tarjetas: un PAN ajeno acabado en 9415/2288 entraría como
 * "tarjeta pendiente" y falsearía su P&L y el sueldo posible. Los nombres de
 * proveedor (Amor Perfecto, UFV, Zumit, Reimpulsa, Envapro/Gloop) además
 * ensucian su lista de reglas con vendors que no conocen.
 *
 * Solo la org canónica (la que NO nace del funnel enverde) recibe este set.
 * Ver `bootstrapTreasury` en store.ts.
 */
const OWNER_RULE_IDS = new Set<string>([
  "seed_amor_perfecto",
  "seed_ufv",
  "seed_zumit",
  "seed_reimpulsa",
  "seed_envapro_gloop",
  "seed_card_9415",
  "seed_card_2288",
]);

/** Reglas universales para cualquier cafetería española — seguras de sembrar. */
export const GENERIC_SEED_RULES: TreasuryRule[] = SEED_RULES.filter(
  (r) => !OWNER_RULE_IDS.has(r.id)
);

/** Reglas propias de Raíz y Grano — solo para la org de la casa. */
export const OWNER_SEED_RULES: TreasuryRule[] = SEED_RULES.filter((r) =>
  OWNER_RULE_IDS.has(r.id)
);

/** Versión global del ruleset semilla — útil para invalidar caché futura. */
export const SEED_RULES_VERSION = 6;
