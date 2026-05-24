/**
 * seed-meeting-combos.mjs
 *
 * Run from project root:
 *   node scripts/seed-meeting-combos.mjs
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccountPath = resolve(__dirname, "../apps/pos/secrets/raizygrano-admin.json");
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf-8"));

if (getApps().length === 0) {
  initializeApp({ credential: cert(serviceAccount) });
}

const db = getFirestore();

const MEETING_COMBOS = [
  {
    name: "Combo Café Reunión Pequeña",
    name_en: "Small Meeting Coffee Combo",
    description: "Perfecto para reuniones de equipo de 4-6 personas. Incluye cafés variados y bollería.",
    description_en: "Perfect for team meetings of 4-6 people. Includes assorted coffees and pastries.",
    price: 18.50,
    servesUpTo: 6,
    items: [
      { name: "Café americano", quantity: 3, category: "beverage" },
      { name: "Café con leche", quantity: 3, category: "beverage" },
      { name: "Croissant", quantity: 4, category: "food" },
      { name: "Galletas artesanas", quantity: 6, category: "snack" },
    ],
    available: true,
    popular: true,
    order: 1,
  },
  {
    name: "Combo Reunión Departamento",
    name_en: "Department Meeting Combo",
    description: "Ideal para reuniones de departamento de 8-12 personas. Bebidas calientes y snacks variados.",
    description_en: "Ideal for department meetings of 8-12 people. Hot drinks and assorted snacks.",
    price: 35.00,
    servesUpTo: 12,
    items: [
      { name: "Café americano", quantity: 5, category: "beverage" },
      { name: "Café con leche", quantity: 5, category: "beverage" },
      { name: "Té / Infusión", quantity: 2, category: "beverage" },
      { name: "Croissant", quantity: 6, category: "food" },
      { name: "Tostada con tomate", quantity: 4, category: "food" },
      { name: "Galletas artesanas", quantity: 12, category: "snack" },
    ],
    available: true,
    popular: true,
    order: 2,
  },
  {
    name: "Combo Desayuno Claustro",
    name_en: "Faculty Breakfast Combo",
    description: "Para reuniones grandes de claustro o jornadas. Hasta 20 personas con bebidas y desayuno completo.",
    description_en: "For large faculty meetings or conferences. Up to 20 people with drinks and full breakfast.",
    price: 65.00,
    servesUpTo: 20,
    items: [
      { name: "Café americano", quantity: 8, category: "beverage" },
      { name: "Café con leche", quantity: 8, category: "beverage" },
      { name: "Té / Infusión", quantity: 4, category: "beverage" },
      { name: "Croissant", quantity: 10, category: "food" },
      { name: "Tostada con tomate", quantity: 8, category: "food" },
      { name: "Zumo natural", quantity: 6, category: "beverage" },
      { name: "Galletas artesanas", quantity: 20, category: "snack" },
    ],
    available: true,
    popular: false,
    order: 3,
  },
  {
    name: "Combo Solo Bebidas",
    name_en: "Drinks Only Combo",
    description: "Solo bebidas calientes para una reunión rápida. Perfecto para 5-8 personas.",
    description_en: "Hot drinks only for a quick meeting. Perfect for 5-8 people.",
    price: 15.00,
    servesUpTo: 8,
    items: [
      { name: "Café americano", quantity: 4, category: "beverage" },
      { name: "Café con leche", quantity: 3, category: "beverage" },
      { name: "Té / Infusión", quantity: 1, category: "beverage" },
    ],
    available: true,
    popular: false,
    order: 4,
  },
  {
    name: "Combo Premium Dirección",
    name_en: "Premium Executive Combo",
    description: "Combo especial para reuniones de dirección. Cafés de especialidad y bollería premium.",
    description_en: "Special combo for executive meetings. Specialty coffees and premium pastries.",
    price: 28.00,
    servesUpTo: 6,
    items: [
      { name: "Café de especialidad", quantity: 4, category: "beverage" },
      { name: "Cappuccino", quantity: 2, category: "beverage" },
      { name: "Croissant de mantequilla", quantity: 4, category: "food" },
      { name: "Brownie artesano", quantity: 3, category: "food" },
      { name: "Agua mineral", quantity: 6, category: "beverage" },
    ],
    available: true,
    popular: false,
    order: 5,
  },
];

async function seedCombos() {
  console.log("🌱 Seeding meeting combos...\n");

  const batch = db.batch();
  const combosRef = db.collection("meeting_combos");

  for (const combo of MEETING_COMBOS) {
    const docRef = combosRef.doc();
    batch.set(docRef, {
      ...combo,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    console.log(`  ✅ ${combo.name} (${combo.price}€, hasta ${combo.servesUpTo} personas)`);
  }

  await batch.commit();
  console.log(`\n🎉 Successfully seeded ${MEETING_COMBOS.length} meeting combos!`);
}

seedCombos()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Error seeding:", err);
    process.exit(1);
  });
