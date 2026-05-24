/**
 * seed-meeting-combos.ts  (v2 – Mini combos with customizable slots)
 *
 * Run with: npx ts-node scripts/seed-meeting-combos.ts
 *
 * Seeds the `meeting_combos` collection with mini-combo data.
 * Each combo serves 2-3 people and lets the teacher choose
 * which drink / snack goes in each slot.
 */

import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const MEETING_COMBOS = [
  // ── 1. Café + Snack (2 personas) ──
  {
    name: "Café & Snack",
    name_en: "Coffee & Snack",
    description: "2 bebidas + 2 snacks a elegir. Perfecto para una charla rápida.",
    description_en: "2 drinks + 2 snacks of your choice. Perfect for a quick chat.",
    basePrice: 7.50,
    servesUpTo: 2,
    slots: [
      {
        label: "Bebida",
        label_en: "Drink",
        category: "beverage",
        quantity: 2,
        options: [
          { name: "Café americano", name_en: "Americano" },
          { name: "Café con leche", name_en: "Latte" },
          { name: "Cappuccino", name_en: "Cappuccino" },
          { name: "Té / Infusión", name_en: "Tea / Infusion" },
          { name: "Cortado", name_en: "Cortado" },
          { name: "Café con leche de avena", name_en: "Oat milk latte", extraPrice: 0.40 },
        ],
      },
      {
        label: "Snack",
        label_en: "Snack",
        category: "snack",
        quantity: 2,
        options: [
          { name: "Galleta artesana", name_en: "Artisan cookie" },
          { name: "Muffin", name_en: "Muffin" },
          { name: "Brownie", name_en: "Brownie" },
          { name: "Barrita de cereales", name_en: "Cereal bar" },
        ],
      },
    ],
    available: true,
    popular: true,
    order: 1,
  },

  // ── 2. Desayuno Ligero (2-3 personas) ──
  {
    name: "Desayuno Ligero",
    name_en: "Light Breakfast",
    description: "3 bebidas + 3 piezas de bollería. Ideal para empezar la mañana.",
    description_en: "3 drinks + 3 pastries. Ideal to start the morning.",
    basePrice: 12.00,
    servesUpTo: 3,
    slots: [
      {
        label: "Bebida",
        label_en: "Drink",
        category: "beverage",
        quantity: 3,
        options: [
          { name: "Café americano", name_en: "Americano" },
          { name: "Café con leche", name_en: "Latte" },
          { name: "Cappuccino", name_en: "Cappuccino" },
          { name: "Té / Infusión", name_en: "Tea / Infusion" },
          { name: "Zumo natural", name_en: "Fresh juice", extraPrice: 0.50 },
          { name: "Café con leche de avena", name_en: "Oat milk latte", extraPrice: 0.40 },
        ],
      },
      {
        label: "Bollería",
        label_en: "Pastry",
        category: "food",
        quantity: 3,
        options: [
          { name: "Croissant", name_en: "Croissant" },
          { name: "Croissant integral", name_en: "Whole wheat croissant" },
          { name: "Tostada con tomate", name_en: "Toast with tomato" },
          { name: "Napolitana de chocolate", name_en: "Chocolate pastry", extraPrice: 0.30 },
        ],
      },
    ],
    available: true,
    popular: true,
    order: 2,
  },

  // ── 3. Solo Bebidas (3 personas) ──
  {
    name: "Solo Bebidas",
    name_en: "Drinks Only",
    description: "3 bebidas a elegir. Rápido y sencillo.",
    description_en: "3 drinks of your choice. Quick and simple.",
    basePrice: 6.50,
    servesUpTo: 3,
    slots: [
      {
        label: "Bebida",
        label_en: "Drink",
        category: "beverage",
        quantity: 3,
        options: [
          { name: "Café americano", name_en: "Americano" },
          { name: "Café con leche", name_en: "Latte" },
          { name: "Cappuccino", name_en: "Cappuccino" },
          { name: "Cortado", name_en: "Cortado" },
          { name: "Té / Infusión", name_en: "Tea / Infusion" },
          { name: "Chocolate caliente", name_en: "Hot chocolate" },
          { name: "Zumo natural", name_en: "Fresh juice", extraPrice: 0.50 },
          { name: "Café con leche de avena", name_en: "Oat milk latte", extraPrice: 0.40 },
        ],
      },
    ],
    available: true,
    popular: false,
    order: 3,
  },

  // ── 4. Merienda Dulce (2 personas) ──
  {
    name: "Merienda Dulce",
    name_en: "Sweet Break",
    description: "2 bebidas + 2 dulces. Para una pausa con algo rico.",
    description_en: "2 drinks + 2 sweets. For a tasty break.",
    basePrice: 8.00,
    servesUpTo: 2,
    slots: [
      {
        label: "Bebida",
        label_en: "Drink",
        category: "beverage",
        quantity: 2,
        options: [
          { name: "Café con leche", name_en: "Latte" },
          { name: "Cappuccino", name_en: "Cappuccino" },
          { name: "Chocolate caliente", name_en: "Hot chocolate" },
          { name: "Té / Infusión", name_en: "Tea / Infusion" },
        ],
      },
      {
        label: "Dulce",
        label_en: "Sweet",
        category: "food",
        quantity: 2,
        options: [
          { name: "Brownie", name_en: "Brownie" },
          { name: "Tarta de zanahoria", name_en: "Carrot cake" },
          { name: "Cookie de chocolate", name_en: "Chocolate chip cookie" },
          { name: "Napolitana de chocolate", name_en: "Chocolate pastry" },
        ],
      },
    ],
    available: true,
    popular: false,
    order: 4,
  },
];

async function seedCombos() {
  console.log("🌱 Seeding mini meeting combos (v2)...");

  // Clear old combos first
  const existing = await db.collection("meeting_combos").get();
  if (!existing.empty) {
    const deleteBatch = db.batch();
    existing.docs.forEach((d) => deleteBatch.delete(d.ref));
    await deleteBatch.commit();
    console.log(`  🗑️  Deleted ${existing.size} old combos`);
  }

  const batch = db.batch();
  const combosRef = db.collection("meeting_combos");

  for (const combo of MEETING_COMBOS) {
    const docRef = combosRef.doc();
    batch.set(docRef, {
      ...combo,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`  ✅ ${combo.name} (${combo.basePrice}€, hasta ${combo.servesUpTo} pers.)`);
  }

  await batch.commit();
  console.log(`\n🎉 Seeded ${MEETING_COMBOS.length} mini combos!`);
}

seedCombos()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Error seeding:", err);
    process.exit(1);
  });
