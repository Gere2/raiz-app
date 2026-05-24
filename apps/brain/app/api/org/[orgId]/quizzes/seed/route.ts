/**
 * POST /api/org/:orgId/quizzes/seed — Seed default quizzes
 * Seeds the 10 hardcoded quizzes from the App into Firestore.
 * Safe to call multiple times (uses merge with doc ID = quiz.id).
 */
import { NextRequest, NextResponse } from "next/server"
import { db as adminDb } from "@/lib/firebase-admin"
import { requireOrgMember } from "@/lib/require-auth"

// ── Default quiz data (extracted from App hardcoded constants) ──
// Only metadata here; questions are included inline for completeness.
// In production, Brain admins can edit these after seeding.

const DEFAULT_QUIZZES = [
  {
    id: "welcome-profile",
    moduleId: "bienvenida",
    cadence: "once",
    title: "Tu perfil cafetero en Raíz y Grano",
    titleEn: "Your coffee profile at Raíz y Grano",
    description: "Entiende cómo funcionan los puntos y personaliza tu experiencia",
    descriptionEn: "Understand how points work and personalize your experience",
    emoji: "👋",
    points: 300,
    sortOrder: 1,
    enabled: true,
    questions: [
      {
        question: "En Raíz y Grano, ¿qué acción te da más puntos de forma constante?",
        questionEn: "At Raíz y Grano, what action earns you the most points consistently?",
        options: ["Completar quizzes todos los días", "Comprar (acumular por € gastado)", "Compartir en redes sociales", "Ver vídeos en la app"],
        optionsEn: ["Completing quizzes every day", "Buying (accumulate per € spent)", "Sharing on social media", "Watching videos in the app"],
        correctIndex: 1,
        explanation: "Cada euro que gastas te da 100 puntos. Es la forma más constante de acumular.",
        explanationEn: "Every euro you spend gives you 100 points. It's the most consistent way to accumulate.",
      },
      {
        question: "¿Para qué quieres usar los puntos principalmente?",
        questionEn: "What would you mainly use your points for?",
        options: ["Cafés gratis", "Snacks", "Experiencias exclusivas", "Todavía no lo sé"],
        optionsEn: ["Free coffees", "Snacks", "Exclusive experiences", "I don't know yet"],
        correctIndex: 0,
        explanation: "No hay respuesta incorrecta. Los cafés gratis son el favorito de la mayoría.",
        explanationEn: "There's no wrong answer. Free coffees are most people's favorite.",
      },
      {
        question: "¿Cuántas variedades de café de especialidad tiene Raíz y Grano?",
        questionEn: "How many specialty coffee varieties does Raíz y Grano have?",
        options: ["1 (solo espresso)", "2-3", "1 café base + rotación de temporada", "Más de 10"],
        optionsEn: ["1 (just espresso)", "2-3", "1 base coffee + seasonal rotation", "More than 10"],
        correctIndex: 2,
        explanation: "Tenemos un café base de Amor Perfecto y rotamos cafés de temporada.",
        explanationEn: "We have a base coffee from Amor Perfecto and rotate seasonal coffees.",
      },
    ],
  },
  {
    id: "welcome-specialty",
    moduleId: "bienvenida",
    cadence: "once",
    title: "¿Qué hace especial un café de especialidad?",
    titleEn: "What makes specialty coffee special?",
    description: "Descubre por qué Amor Perfecto no es un café cualquiera",
    descriptionEn: "Discover why Amor Perfecto is not just any coffee",
    emoji: "⭐",
    points: 300,
    sortOrder: 2,
    enabled: true,
    questions: [
      {
        question: "¿Qué puntuación mínima necesita un café para llamarse 'de especialidad'?",
        questionEn: "What minimum score does a coffee need to be called 'specialty'?",
        options: ["60/100", "70/100", "80/100", "90/100"],
        optionsEn: ["60/100", "70/100", "80/100", "90/100"],
        correctIndex: 2,
        explanation: "Un café de especialidad puntúa 80+ en la escala SCA.",
        explanationEn: "A specialty coffee scores 80+ on the SCA scale.",
      },
      {
        question: "¿Qué significa que Amor Perfecto tenga 'trazabilidad'?",
        questionEn: "What does it mean that Amor Perfecto has 'traceability'?",
        options: ["Que es orgánico", "Que puedes saber de qué finca viene cada lote", "Que tiene código QR", "Que lo reparten rápido"],
        optionsEn: ["It's organic", "You can know which farm each batch comes from", "It has a QR code", "They deliver quickly"],
        correctIndex: 1,
        explanation: "Trazabilidad = saber finca, variedad, altitud, proceso y quién lo cultivó.",
        explanationEn: "Traceability = knowing the farm, variety, altitude, process and who grew it.",
      },
      {
        question: "¿Qué diferencia al café de especialidad del comercial?",
        questionEn: "What differentiates specialty from commercial coffee?",
        options: ["El precio", "La calidad del grano, el origen y el tueste", "La marca", "El envase"],
        optionsEn: ["The price", "Bean quality, origin and roast", "The brand", "The packaging"],
        correctIndex: 1,
        explanation: "Es la suma de grano seleccionado, origen trazable y tueste artesanal.",
        explanationEn: "It's the combination of selected beans, traceable origin and artisanal roasting.",
      },
    ],
  },
  {
    id: "amor-perfecto-origin",
    moduleId: "cafe-actual",
    cadence: "once",
    title: "Amor Perfecto: el origen",
    titleEn: "Amor Perfecto: the origin",
    description: "Conoce la historia detrás de tu café diario",
    descriptionEn: "Learn the story behind your daily coffee",
    emoji: "🇨🇴",
    points: 200,
    sortOrder: 10,
    enabled: true,
    questions: [
      {
        question: "¿De qué país viene Amor Perfecto?",
        questionEn: "What country does Amor Perfecto come from?",
        options: ["Brasil", "Colombia", "Etiopía", "Costa Rica"],
        optionsEn: ["Brazil", "Colombia", "Ethiopia", "Costa Rica"],
        correctIndex: 1,
        explanation: "Amor Perfecto es un tostador colombiano de Bogotá.",
        explanationEn: "Amor Perfecto is a Colombian roaster from Bogotá.",
      },
      {
        question: "¿Qué hace Amor Perfecto directamente con los caficultores?",
        questionEn: "What does Amor Perfecto do directly with farmers?",
        options: ["Nada, compra en subasta", "Comercio directo: relación finca-a-taza", "Solo compra café orgánico", "Usa intermediarios europeos"],
        optionsEn: ["Nothing, buys at auction", "Direct trade: farm-to-cup relationship", "Only buys organic coffee", "Uses European intermediaries"],
        correctIndex: 1,
        explanation: "Amor Perfecto trabaja directamente con fincas colombianas.",
        explanationEn: "Amor Perfecto works directly with Colombian farms.",
      },
    ],
  },
  {
    id: "weekly-espresso",
    moduleId: "semanal",
    cadence: "weekly",
    title: "Mundo espresso",
    titleEn: "Espresso world",
    description: "Todo sobre la base de la mayoría de tus bebidas",
    descriptionEn: "Everything about the base of most of your drinks",
    emoji: "☕",
    points: 100,
    sortOrder: 50,
    enabled: true,
    questions: [
      {
        question: "¿Cuántos segundos dura un shot de espresso bien extraído?",
        questionEn: "How many seconds does a well-extracted espresso shot take?",
        options: ["10-15s", "25-30s", "45-60s", "Más de 90s"],
        optionsEn: ["10-15s", "25-30s", "45-60s", "More than 90s"],
        correctIndex: 1,
        explanation: "El estándar es 25-30 segundos para 30ml de espresso.",
        explanationEn: "The standard is 25-30 seconds for 30ml of espresso.",
      },
      {
        question: "¿Qué es la crema del espresso?",
        questionEn: "What is espresso crema?",
        options: ["Nata añadida", "Emulsión de aceites, CO₂ y agua", "Leche vaporizada", "Azúcar caramelizada"],
        optionsEn: ["Added cream", "Emulsion of oils, CO₂ and water", "Steamed milk", "Caramelized sugar"],
        correctIndex: 1,
        explanation: "La crema es una emulsión natural que se forma por la presión de extracción.",
        explanationEn: "Crema is a natural emulsion formed by the extraction pressure.",
      },
    ],
  },
  {
    id: "weekly-milk",
    moduleId: "semanal",
    cadence: "weekly",
    title: "Arte con leche",
    titleEn: "Milk art",
    description: "El secreto detrás del flat white perfecto",
    descriptionEn: "The secret behind the perfect flat white",
    emoji: "🥛",
    points: 100,
    sortOrder: 51,
    enabled: true,
    questions: [
      {
        question: "¿Cuál es la temperatura ideal para vaporizar leche?",
        questionEn: "What is the ideal temperature for steaming milk?",
        options: ["50°C", "60-65°C", "75-80°C", "90°C"],
        optionsEn: ["50°C", "60-65°C", "75-80°C", "90°C"],
        correctIndex: 1,
        explanation: "60-65°C conserva la dulzura natural de la lactosa.",
        explanationEn: "60-65°C preserves the natural sweetness of lactose.",
      },
      {
        question: "¿Qué leche vegetal forma mejor microespuma?",
        questionEn: "Which plant milk makes the best microfoam?",
        options: ["Almendra", "Avena barista", "Coco", "Arroz"],
        optionsEn: ["Almond", "Barista oat", "Coconut", "Rice"],
        correctIndex: 1,
        explanation: "La avena barista tiene grasas y proteínas que emulan la leche de vaca.",
        explanationEn: "Barista oat has fats and proteins that emulate cow's milk.",
      },
    ],
  },
  {
    id: "weekly-tasting",
    moduleId: "semanal",
    cadence: "weekly",
    title: "Cata para novatos",
    titleEn: "Tasting for beginners",
    description: "Aprende a describir lo que pruebas como un pro",
    descriptionEn: "Learn to describe what you taste like a pro",
    emoji: "👃",
    points: 100,
    sortOrder: 52,
    enabled: true,
    questions: [
      {
        question: "¿Cuáles son los 3 pilares de la cata de café?",
        questionEn: "What are the 3 pillars of coffee tasting?",
        options: ["Color, olor, sabor", "Aroma, acidez, cuerpo", "Temperatura, tamaño, marca", "Dulce, amargo, ácido"],
        optionsEn: ["Color, smell, taste", "Aroma, acidity, body", "Temperature, size, brand", "Sweet, bitter, acidic"],
        correctIndex: 1,
        explanation: "Aroma (nariz), acidez (brillo) y cuerpo (textura) son la tríada de la cata.",
        explanationEn: "Aroma (nose), acidity (brightness) and body (texture) are the tasting triad.",
      },
    ],
  },
  {
    id: "weekly-sustainability",
    moduleId: "semanal",
    cadence: "weekly",
    title: "Café y planeta",
    titleEn: "Coffee and planet",
    description: "El impacto ambiental de tu taza diaria",
    descriptionEn: "The environmental impact of your daily cup",
    emoji: "🌍",
    points: 100,
    sortOrder: 53,
    enabled: true,
    questions: [
      {
        question: "¿Cuánta agua se necesita para producir 1 taza de café?",
        questionEn: "How much water is needed to produce 1 cup of coffee?",
        options: ["1 litro", "10 litros", "~140 litros", "500 litros"],
        optionsEn: ["1 liter", "10 liters", "~140 liters", "500 liters"],
        correctIndex: 2,
        explanation: "Se necesitan ~140L incluyendo cultivo, procesamiento y preparación.",
        explanationEn: "~140L are needed including farming, processing and preparation.",
      },
    ],
  },
  {
    id: "weekly-myths",
    moduleId: "semanal",
    cadence: "weekly",
    title: "Mitos del café",
    titleEn: "Coffee myths",
    description: "Separemos hechos de ficción cafetera",
    descriptionEn: "Let's separate coffee facts from fiction",
    emoji: "🤔",
    points: 100,
    sortOrder: 54,
    enabled: true,
    questions: [
      {
        question: "MITO O REALIDAD: 'El espresso tiene más cafeína que un café filtrado'",
        questionEn: "MYTH OR FACT: 'Espresso has more caffeine than filter coffee'",
        options: ["Realidad", "Mito — el filtrado tiene más cafeína total"],
        optionsEn: ["Fact", "Myth — filter coffee has more total caffeine"],
        correctIndex: 1,
        explanation: "Un espresso tiene ~63mg de cafeína vs ~95-120mg en un filtrado de 240ml.",
        explanationEn: "An espresso has ~63mg caffeine vs ~95-120mg in a 240ml filter coffee.",
      },
      {
        question: "MITO O REALIDAD: 'El café descafeinado no tiene cafeína'",
        questionEn: "MYTH OR FACT: 'Decaf coffee has no caffeine'",
        options: ["Realidad, 0% cafeína", "Mito — tiene 2-12mg por taza"],
        optionsEn: ["Fact, 0% caffeine", "Myth — it has 2-12mg per cup"],
        correctIndex: 1,
        explanation: "El descafeinado conserva 2-12mg de cafeína por taza.",
        explanationEn: "Decaf retains 2-12mg of caffeine per cup.",
      },
    ],
  },
]

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  try {
    const { orgId } = await params
    await requireOrgMember(_req, orgId)

    const batch = adminDb.batch()
    const now = new Date().toISOString()

    for (const quiz of DEFAULT_QUIZZES) {
      const ref = adminDb.doc(`orgs/${orgId}/quizzes/${quiz.id}`)
      batch.set(ref, { ...quiz, createdAt: now, updatedAt: now }, { merge: true })
    }

    await batch.commit()
    return NextResponse.json({ seeded: DEFAULT_QUIZZES.length })
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string }
    return NextResponse.json(
      { error: err.message ?? "Server error" },
      { status: err.status || 500 }
    )
  }
}
