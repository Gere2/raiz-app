import { RAIZ_ORG_ID } from "@/lib/tenant";
/**
 * quiz-service.ts
 *
 * Sistema de quizzes gamificados sobre café Amor Perfecto en Raíz y Grano.
 * 3 cadencias: Bienvenida (una sola vez), Café actual (mensual), Semanal.
 * Puntos solo en el primer intento puntuable del periodo.
 * Límite antifraude: máx 250–350 pts/semana de quizzes.
 */

import {
  doc,
  getDoc,
  setDoc,
  increment,
  arrayUnion,
  Timestamp,
} from "firebase/firestore"
import { db } from "./firebase"

// ── Tipos ──

export interface QuizQuestion {
  question: string
  questionEn: string
  options: string[]
  optionsEn: string[]
  correctIndex: number
  explanation: string
  explanationEn: string
}

export interface Quiz {
  id: string
  title: string
  titleEn: string
  description: string
  descriptionEn: string
  emoji: string
  points: number
  questions: QuizQuestion[]
  moduleId: "bienvenida" | "cafe-actual" | "semanal"
  /** "once" = solo una vez, "monthly" = 1 vez/mes, "weekly" = 1 vez/semana */
  cadence: "once" | "monthly" | "weekly"
}

export interface QuizModule {
  id: string
  title: string
  titleEn: string
  emoji: string
  description: string
  descriptionEn: string
  quizzes: Quiz[]
}

// ── Contenido de los quizzes ──
// Basado en el documento "Serie completa de quizzes gamificados para
// el café Amor Perfecto en Raíz y Grano"

const quizzes: Quiz[] = [
  // ═══════════════════════════════════════════════════════════════════
  // BIENVENIDA — Una sola vez por cuenta
  // ═══════════════════════════════════════════════════════════════════

  {
    id: "welcome-profile",
    moduleId: "bienvenida",
    cadence: "once",
    title: "Tu perfil cafetero en Raíz y Grano",
    titleEn: "Your coffee profile at Raíz y Grano",
    description: "Entiende cómo funcionan los puntos y personaliza tu experiencia",
    descriptionEn: "Understand how points work and personalize your experience",
    emoji: "👋",
    points: 150,
    questions: [
      {
        question: "En Raíz y Grano, ¿qué acción te da más puntos de forma constante?",
        questionEn: "At Raíz y Grano, what action earns you the most points consistently?",
        options: [
          "Completar quizzes todos los días",
          "Comprar (acumular por € gastado)",
          "Compartir en redes sociales",
          "Ver vídeos en la app",
        ],
        optionsEn: [
          "Completing quizzes every day",
          "Buying (accumulate per € spent)",
          "Sharing on social media",
          "Watching videos in the app",
        ],
        correctIndex: 1,
        explanation: "Cada euro que gastas te da 100 puntos. Es la forma más constante de acumular: un café de 2,50€ = 250 pts cada vez.",
        explanationEn: "Every euro you spend gives you 100 points. It's the most consistent way to accumulate: a 2.50€ coffee = 250 pts each time.",
      },
      {
        question: "¿Para qué quieres usar los puntos principalmente?",
        questionEn: "What would you mainly use your points for?",
        options: [
          "Cafés gratis",
          "Snacks",
          "Merch (taza, vaso reutilizable)",
          "Experiencias (cata)",
        ],
        optionsEn: [
          "Free coffees",
          "Snacks",
          "Merch (mug, reusable cup)",
          "Experiences (tasting)",
        ],
        correctIndex: 0,
        explanation: "¡Todas son buenas opciones! Con 1.500 pts puedes canjear una bebida gratis — eso son unas 6 visitas. Los quizzes te ayudan a llegar antes.",
        explanationEn: "All great options! With 1,500 pts you can redeem a free drink — that's about 6 visits. Quizzes help you get there faster.",
      },
      {
        question: "Si un quiz semanal te enseña algo que aplicas al pedir café, ¿qué mejora más?",
        questionEn: "If a weekly quiz teaches you something you apply when ordering, what improves most?",
        options: [
          "Tu 'suerte' con el café",
          "La consistencia de lo que pides",
          "Que el café tenga más azúcar",
          "Que siempre sea más barato",
        ],
        optionsEn: [
          "Your 'luck' with coffee",
          "The consistency of what you order",
          "That coffee has more sugar",
          "That it's always cheaper",
        ],
        correctIndex: 1,
        explanation: "Saber qué te gusta (tipo de bebida, intensidad, leche) te ayuda a repetir lo que funciona y explorar con confianza.",
        explanationEn: "Knowing what you like (drink type, intensity, milk) helps you repeat what works and explore confidently.",
      },
      {
        question: "¿Qué preferirías recibir en un mensaje de la app?",
        questionEn: "What would you prefer to receive from the app?",
        options: [
          "Promos diarias sin parar",
          "Recordatorios solo cuando haya nuevo quiz o recompensa cerca",
          "Mensajes a cualquier hora por rachas",
          "Nada, nunca (pero seguir usando puntos)",
        ],
        optionsEn: [
          "Daily non-stop promos",
          "Reminders only when there's a new quiz or reward nearby",
          "Messages at any time for streaks",
          "Nothing, ever (but keep using points)",
        ],
        correctIndex: 1,
        explanation: "Preferimos no saturarte. Recibirás solo lo útil: un quiz nuevo o cuando estés cerca de canjear algo.",
        explanationEn: "We prefer not to overwhelm you. You'll only get useful stuff: a new quiz or when you're close to redeeming something.",
      },
    ],
  },
  {
    id: "welcome-specialty",
    moduleId: "bienvenida",
    cadence: "once",
    title: "Café de especialidad en 90 segundos",
    titleEn: "Specialty coffee in 90 seconds",
    description: "Qué es y por qué importa — lo básico en 4 preguntas",
    descriptionEn: "What it is and why it matters — the basics in 4 questions",
    emoji: "⭐",
    points: 120,
    questions: [
      {
        question: "Según la definición de la SCA, 'specialty coffee' se entiende como...",
        questionEn: "According to the SCA definition, 'specialty coffee' is understood as...",
        options: [
          "Café siempre tostado oscuro",
          "Café o experiencia reconocida por atributos distintivos",
          "Café con azúcar de caña",
          "Café servido solo en cafeterías grandes",
        ],
        optionsEn: [
          "Coffee that's always dark roasted",
          "Coffee or experience recognized for distinctive attributes",
          "Coffee with cane sugar",
          "Coffee served only in big chains",
        ],
        correctIndex: 1,
        explanation: "La SCA define specialty coffee como café con atributos distintivos de calidad, evaluado profesionalmente. No depende del tueste ni del tamaño de la cafetería.",
        explanationEn: "The SCA defines specialty coffee as coffee with distinctive quality attributes, professionally evaluated. It doesn't depend on roast or café size.",
      },
      {
        question: "Un criterio muy extendido para que un lote sea 'de especialidad' es que alcance...",
        questionEn: "A widely used criterion for a lot to be 'specialty' is that it scores...",
        options: [
          "50/100",
          "70/100",
          "80/100",
          "100/100 siempre",
        ],
        optionsEn: [
          "50/100",
          "70/100",
          "80/100",
          "100/100 always",
        ],
        correctIndex: 2,
        explanation: "El umbral de 80/100 en escala SCA es la referencia más aceptada. Solo el 3–5% del café mundial alcanza esta puntuación.",
        explanationEn: "The 80/100 threshold on the SCA scale is the most accepted standard. Only 3-5% of the world's coffee reaches this score.",
      },
      {
        question: "¿Qué etiqueta te permite 'trazar' mejor el café?",
        questionEn: "Which label lets you best 'trace' the coffee?",
        options: [
          "'Café premium' sin más datos",
          "'100% café'",
          "Etiqueta con origen, proceso, fecha de tueste y productor",
          "Etiqueta con 'extra fuerte'",
        ],
        optionsEn: [
          "'Premium coffee' with no more data",
          "'100% coffee'",
          "Label with origin, process, roast date, and producer",
          "Label with 'extra strong'",
        ],
        correctIndex: 2,
        explanation: "La trazabilidad completa (finca, proceso, fecha de tueste) es lo que distingue al café de especialidad. Es como conocer la historia detrás de tu taza.",
        explanationEn: "Full traceability (farm, process, roast date) is what distinguishes specialty coffee. It's like knowing the story behind your cup.",
      },
      {
        question: "¿Por qué la trazabilidad suele ser un valor en café de especialidad?",
        questionEn: "Why is traceability usually valued in specialty coffee?",
        options: [
          "Porque hace el café más salado",
          "Porque conecta calidad y origen, y permite transparencia",
          "Porque evita usar molinos",
          "Porque elimina la cafeína",
        ],
        optionsEn: [
          "Because it makes coffee saltier",
          "Because it connects quality and origin, and enables transparency",
          "Because it avoids using grinders",
          "Because it eliminates caffeine",
        ],
        correctIndex: 1,
        explanation: "Saber de dónde viene tu café, quién lo cultivó y cómo se procesó permite valorar la calidad y apoyar a los productores de forma más justa.",
        explanationEn: "Knowing where your coffee comes from, who grew it, and how it was processed lets you appreciate quality and support producers more fairly.",
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════
  // CAFÉ ACTUAL — Rotación mensual, 1 intento puntuable/mes
  // ═══════════════════════════════════════════════════════════════════

  {
    id: "amor-perfecto-origin",
    moduleId: "cafe-actual",
    cadence: "monthly",
    title: "Amor Perfecto: tueste en origen y propósito",
    titleEn: "Amor Perfecto: origin roasting and purpose",
    description: "Conoce la marca detrás de nuestro café de especialidad",
    descriptionEn: "Get to know the brand behind our specialty coffee",
    emoji: "❤️",
    points: 100,
    questions: [
      {
        question: "Amor Perfecto se presenta en España como café de especialidad...",
        questionEn: "Amor Perfecto presents itself in Spain as specialty coffee...",
        options: [
          "Tostado en España",
          "Tostado en Colombia",
          "Tostado en Italia",
          "Tostado en origen desconocido",
        ],
        optionsEn: [
          "Roasted in Spain",
          "Roasted in Colombia",
          "Roasted in Italy",
          "Roasted at unknown origin",
        ],
        correctIndex: 1,
        explanation: "El 'tueste en origen' es parte central de la propuesta de Amor Perfecto: el café se tuesta en Colombia, cerca de donde se cultiva.",
        explanationEn: "'Origin roasting' is central to Amor Perfecto's proposition: the coffee is roasted in Colombia, close to where it's grown.",
      },
      {
        question: "Según su narrativa, Amor Perfecto enfatiza especialmente...",
        questionEn: "According to its narrative, Amor Perfecto especially emphasizes...",
        options: [
          "Comprar café sin conocer nada",
          "Conectar con caficultores y mejorar calidad/trazabilidad",
          "Mezclar café con refresco",
          "Tostar siempre muy oscuro",
        ],
        optionsEn: [
          "Buying coffee without knowing anything",
          "Connecting with farmers and improving quality/traceability",
          "Mixing coffee with soda",
          "Always roasting very dark",
        ],
        correctIndex: 1,
        explanation: "Amor Perfecto busca conectar directamente con los caficultores colombianos para asegurar calidad, trazabilidad y un precio justo.",
        explanationEn: "Amor Perfecto seeks to connect directly with Colombian coffee farmers to ensure quality, traceability, and a fair price.",
      },
      {
        question: "¿Qué herramienta menciona Amor Perfecto para que conozcas la historia y origen?",
        questionEn: "What tool does Amor Perfecto use so you can learn the story and origin?",
        options: [
          "Un código QR",
          "Un cupón de papel",
          "Un sello de tinta sin datos",
          "Una llamada telefónica obligatoria",
        ],
        optionsEn: [
          "A QR code",
          "A paper coupon",
          "An ink stamp without data",
          "A mandatory phone call",
        ],
        correctIndex: 0,
        explanation: "Los códigos QR de Amor Perfecto te permiten ver toda la trazabilidad: finca, productor, variedad, proceso... Es su puente entre el café y tú.",
        explanationEn: "Amor Perfecto's QR codes let you see full traceability: farm, producer, variety, process... It's their bridge between the coffee and you.",
      },
      {
        question: "¿Desde qué año comunica Amor Perfecto que perfecciona etapas del proceso?",
        questionEn: "Since what year does Amor Perfecto say they've been perfecting the process?",
        options: [
          "1977",
          "1997",
          "2007",
          "2017",
        ],
        optionsEn: [
          "1977",
          "1997",
          "2007",
          "2017",
        ],
        correctIndex: 1,
        explanation: "Amor Perfecto declara actividad desde 1997. Más de 25 años perfeccionando la cadena del café de especialidad colombiano.",
        explanationEn: "Amor Perfecto has been active since 1997. Over 25 years perfecting the Colombian specialty coffee chain.",
      },
      {
        question: "¿Qué institución confirmó el hito del campeón mundial 2021 relacionado con Amor Perfecto?",
        questionEn: "Which institution confirmed the 2021 world champion milestone related to Amor Perfecto?",
        options: [
          "Una cadena de comida rápida",
          "La Federación Nacional de Cafeteros de Colombia",
          "Una app de mapas",
          "Un foro anónimo",
        ],
        optionsEn: [
          "A fast food chain",
          "The National Federation of Coffee Growers of Colombia",
          "A maps app",
          "An anonymous forum",
        ],
        correctIndex: 1,
        explanation: "La FNC publicó la nota sobre Diego Campos, campeón mundial de barismo 2021, vinculado a café Amor Perfecto.",
        explanationEn: "The FNC published the note about Diego Campos, 2021 World Barista Champion, linked to Amor Perfecto coffee.",
      },
    ],
  },
  {
    id: "traceability-card",
    moduleId: "cafe-actual",
    cadence: "monthly",
    title: "Trazabilidad práctica: lee la ficha del café",
    titleEn: "Practical traceability: read the coffee card",
    description: "Aprende a interpretar origen, proceso, variedad y notas",
    descriptionEn: "Learn to interpret origin, process, variety, and notes",
    emoji: "📋",
    points: 120,
    questions: [
      {
        question: "En una ficha de café, 'origen' suele referirse principalmente a...",
        questionEn: "On a coffee card, 'origin' usually refers mainly to...",
        options: [
          "El tipo de taza",
          "País/región/finca de donde viene el café",
          "La marca del azúcar",
          "La temperatura del agua",
        ],
        optionsEn: [
          "The type of cup",
          "Country/region/farm where the coffee comes from",
          "The sugar brand",
          "The water temperature",
        ],
        correctIndex: 1,
        explanation: "El 'origen' te dice exactamente de dónde viene tu café: país, región, e idealmente la finca. Es el primer dato para entender su carácter.",
        explanationEn: "'Origin' tells you exactly where your coffee comes from: country, region, and ideally the farm. It's the first clue to understanding its character.",
      },
      {
        question: "¿Dónde mirarías para saber si el café es 'lavado' o 'natural'?",
        questionEn: "Where would you look to know if the coffee is 'washed' or 'natural'?",
        options: [
          "En 'Variedad'",
          "En 'Proceso'",
          "En 'Notas'",
          "En 'Fecha'",
        ],
        optionsEn: [
          "In 'Variety'",
          "In 'Process'",
          "In 'Notes'",
          "In 'Date'",
        ],
        correctIndex: 1,
        explanation: "El campo 'Proceso' indica cómo se trató la cereza tras la cosecha: lavado, natural, honey... Esto afecta muchísimo al sabor final.",
        explanationEn: "The 'Process' field indicates how the cherry was treated after harvest: washed, natural, honey... This hugely affects the final flavor.",
      },
      {
        question: "¿Qué campo te ayuda más a saber si el café está 'fresco' de tueste?",
        questionEn: "Which field helps you most to know if the coffee is 'freshly' roasted?",
        options: [
          "Fecha de tueste",
          "País",
          "Notas",
          "Color del paquete",
        ],
        optionsEn: [
          "Roast date",
          "Country",
          "Notes",
          "Package color",
        ],
        correctIndex: 0,
        explanation: "La fecha de tueste es clave. El café de especialidad se disfruta mejor en las primeras semanas tras el tueste, no meses después.",
        explanationEn: "Roast date is key. Specialty coffee is best enjoyed in the first weeks after roasting, not months later.",
      },
      {
        question: "Si el café cambia por lotes, ¿qué parte conviene actualizar primero en la app?",
        questionEn: "If the coffee changes by lots, what should be updated first in the app?",
        options: [
          "Nada, nunca",
          "La ficha del 'café actual' (origen/proceso/notas)",
          "Solo el logo",
          "El idioma del móvil",
        ],
        optionsEn: [
          "Nothing, ever",
          "The 'current coffee' card (origin/process/notes)",
          "Just the logo",
          "The phone's language",
        ],
        correctIndex: 1,
        explanation: "Cuando cambia el lote, la ficha actualizada con origen, proceso y notas te ayuda a saber qué esperar de tu próxima taza.",
        explanationEn: "When the lot changes, the updated card with origin, process, and notes helps you know what to expect from your next cup.",
      },
      {
        question: "Si hay QR de trazabilidad, ¿qué experiencia debes priorizar en móvil?",
        questionEn: "If there's a traceability QR, what experience should you prioritize on mobile?",
        options: [
          "Un PDF largo sin buscador",
          "Una ficha corta + 'saber más' por capas",
          "Solo un vídeo autoplays",
          "Registrar localización obligatoriamente",
        ],
        optionsEn: [
          "A long PDF without search",
          "A short card + 'learn more' in layers",
          "Just an autoplay video",
          "Mandatory location registration",
        ],
        correctIndex: 1,
        explanation: "En móvil, menos es más. Una ficha breve con opción de profundizar respeta tu tiempo y te deja elegir cuánto quieres saber.",
        explanationEn: "On mobile, less is more. A brief card with the option to dive deeper respects your time and lets you choose how much you want to know.",
      },
    ],
  },
  {
    id: "ideal-drink",
    moduleId: "cafe-actual",
    cadence: "monthly",
    title: "Tu bebida ideal con Amor Perfecto",
    titleEn: "Your ideal drink with Amor Perfecto",
    description: "Descubre cómo pedir mejor y personalizar tu café",
    descriptionEn: "Discover how to order better and customize your coffee",
    emoji: "☕",
    points: 90,
    questions: [
      {
        question: "Quieres un café 'más intenso' sin hacerlo más grande. ¿Qué ajuste suele tener más sentido?",
        questionEn: "You want 'more intense' coffee without making it bigger. What adjustment makes most sense?",
        options: [
          "Añadir agua",
          "Pedir extra shot (si está disponible)",
          "Pedir hielo",
          "Pedir más espuma",
        ],
        optionsEn: [
          "Add water",
          "Ask for an extra shot (if available)",
          "Ask for ice",
          "Ask for more foam",
        ],
        correctIndex: 1,
        explanation: "Un extra shot concentra más sabor sin aumentar el volumen. Es la forma más directa de intensificar tu bebida.",
        explanationEn: "An extra shot concentrates more flavor without increasing volume. It's the most direct way to intensify your drink.",
      },
      {
        question: "Si te cuesta la lactosa, ¿qué mejora tu experiencia sin cambiar el café?",
        questionEn: "If you're lactose intolerant, what improves your experience without changing the coffee?",
        options: [
          "No beber café nunca",
          "Cambiar a leche sin lactosa o vegetal (si hay)",
          "Subir el azúcar",
          "Bajar la temperatura a fría siempre",
        ],
        optionsEn: [
          "Never drink coffee",
          "Switch to lactose-free or plant milk (if available)",
          "Add more sugar",
          "Always lower the temperature to cold",
        ],
        correctIndex: 1,
        explanation: "En Raíz y Grano la leche vegetal es gratis. Cambiar el tipo de leche mantiene tu bebida intacta y tu estómago feliz.",
        explanationEn: "At Raíz y Grano, plant milk is free. Switching milk type keeps your drink intact and your stomach happy.",
      },
      {
        question: "Tienes 4 minutos antes de entrar a clase. ¿Qué flujo debería priorizar la app?",
        questionEn: "You have 4 minutes before class. What flow should the app prioritize?",
        options: [
          "Navegar 6 pantallas",
          "'Repetir mi pedido' con 1 toque",
          "Un juego largo antes de pedir",
          "Leer términos legales primero",
        ],
        optionsEn: [
          "Navigate 6 screens",
          "'Repeat my order' with 1 tap",
          "A long game before ordering",
          "Read legal terms first",
        ],
        correctIndex: 1,
        explanation: "Cuando tienes prisa, repetir tu pedido favorito con un solo toque ahorra tiempo. La app debe adaptarse a tu ritmo.",
        explanationEn: "When you're in a hurry, repeating your favorite order with one tap saves time. The app should adapt to your pace.",
      },
      {
        question: "¿Qué upsell es más 'ético' en campus?",
        questionEn: "What's the most 'ethical' upsell on campus?",
        options: [
          "Sugerir algo que encaje con tu perfil declarado",
          "Ocultar el precio hasta el final",
          "Forzar el upsell para pagar",
          "Cambiar tu pedido automáticamente",
        ],
        optionsEn: [
          "Suggest something that matches your stated profile",
          "Hide the price until the end",
          "Force the upsell to pay",
          "Change your order automatically",
        ],
        correctIndex: 0,
        explanation: "Un buen upsell es una sugerencia personalizada, transparente y fácil de rechazar. Así todos ganan.",
        explanationEn: "A good upsell is a personalized, transparent suggestion that's easy to decline. That way everyone wins.",
      },
      {
        question: "Para no saturarte, ¿cada cuánto deberían llegar notificaciones de quizzes?",
        questionEn: "To avoid overwhelming you, how often should quiz notifications arrive?",
        options: [
          "Varias al día",
          "1–2 a la semana como máximo",
          "Cada hora",
          "Nunca, pero exigir completar quizzes",
        ],
        optionsEn: [
          "Several a day",
          "1-2 per week maximum",
          "Every hour",
          "Never, but require completing quizzes",
        ],
        correctIndex: 1,
        explanation: "1–2 notificaciones semanales es el punto óptimo: suficiente para recordarte sin agobiar. Calidad sobre cantidad.",
        explanationEn: "1-2 weekly notifications is the sweet spot: enough to remind you without being annoying. Quality over quantity.",
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════
  // SEMANALES — 1 quiz nuevo/semana, puntos 1 vez
  // ═══════════════════════════════════════════════════════════════════

  {
    id: "weekly-espresso",
    moduleId: "semanal",
    cadence: "weekly",
    title: "Reto espresso: ratio y extracción",
    titleEn: "Espresso challenge: ratio & extraction",
    description: "Entiende por qué tu espresso sabe como sabe",
    descriptionEn: "Understand why your espresso tastes the way it does",
    emoji: "☕",
    points: 70,
    questions: [
      {
        question: "El 'ratio' en espresso suele referirse a...",
        questionEn: "The 'ratio' in espresso usually refers to...",
        options: [
          "Temperatura/tiempo",
          "Café molido (entrada) vs bebida final (salida)",
          "Leche/café",
          "Hielo/agua",
        ],
        optionsEn: [
          "Temperature/time",
          "Ground coffee (input) vs final drink (output)",
          "Milk/coffee",
          "Ice/water",
        ],
        correctIndex: 1,
        explanation: "El ratio compara los gramos de café molido con los gramos de bebida extraída. Un ratio 1:2 (18g café → 36g bebida) es clásico.",
        explanationEn: "The ratio compares grams of ground coffee to grams of extracted beverage. A 1:2 ratio (18g coffee → 36g drink) is classic.",
      },
      {
        question: "De más concentrado a menos concentrado, el orden general es...",
        questionEn: "From most concentrated to least, the general order is...",
        options: [
          "Americano → Espresso → Lungo → Ristretto",
          "Ristretto → Espresso → Lungo → Americano",
          "Lungo → Ristretto → Americano → Espresso",
          "Espresso → Americano → Ristretto → Lungo",
        ],
        optionsEn: [
          "Americano → Espresso → Lungo → Ristretto",
          "Ristretto → Espresso → Lungo → Americano",
          "Lungo → Ristretto → Americano → Espresso",
          "Espresso → Americano → Ristretto → Lungo",
        ],
        correctIndex: 1,
        explanation: "Ristretto es el más concentrado (menos agua), seguido del espresso estándar, lungo (más agua) y americano (espresso + agua).",
        explanationEn: "Ristretto is the most concentrated (less water), followed by standard espresso, lungo (more water), and americano (espresso + water).",
      },
      {
        question: "Si tu espresso sale demasiado 'aguado', una hipótesis razonable es...",
        questionEn: "If your espresso comes out too 'watery', a reasonable hypothesis is...",
        options: [
          "Exceso de dilución o extracción desequilibrada",
          "Que el café no tenga cafeína",
          "Que el vaso sea pequeño",
          "Que el agua sea 'muy fría' siempre",
        ],
        optionsEn: [
          "Excess dilution or unbalanced extraction",
          "That the coffee has no caffeine",
          "That the cup is small",
          "That the water is 'too cold' always",
        ],
        correctIndex: 0,
        explanation: "Un espresso aguado suele indicar demasiada agua para la cantidad de café, o una extracción que no sacó suficiente sabor del grano.",
        explanationEn: "A watery espresso usually indicates too much water for the amount of coffee, or an extraction that didn't pull enough flavor from the bean.",
      },
      {
        question: "¿Qué feedback es más educativo tras el quiz?",
        questionEn: "What feedback is most educational after the quiz?",
        options: [
          "'Mal'",
          "'Ok'",
          "'Por qué: el ratio guía concentración y balance'",
          "'Compra más'",
        ],
        optionsEn: [
          "'Wrong'",
          "'Ok'",
          "'Here's why: the ratio guides concentration and balance'",
          "'Buy more'",
        ],
        correctIndex: 2,
        explanation: "El mejor feedback explica el porqué. Saber que el ratio guía la concentración te ayuda a entender y pedir mejor.",
        explanationEn: "The best feedback explains the why. Knowing that the ratio guides concentration helps you understand and order better.",
      },
    ],
  },
  {
    id: "weekly-milk",
    moduleId: "semanal",
    cadence: "weekly",
    title: "Reto leche: microespuma y textura",
    titleEn: "Milk challenge: microfoam & texture",
    description: "Cómo pedir bebidas con leche con más consistencia",
    descriptionEn: "How to order milk drinks more consistently",
    emoji: "🥛",
    points: 60,
    questions: [
      {
        question: "La 'microespuma' se asocia a...",
        questionEn: "'Microfoam' is associated with...",
        options: [
          "Burbuja grande tipo baño",
          "Textura fina y brillante",
          "Leche cortada",
          "Más azúcar",
        ],
        optionsEn: [
          "Big bubble like a bath",
          "Fine, glossy texture",
          "Curdled milk",
          "More sugar",
        ],
        correctIndex: 1,
        explanation: "La microespuma tiene burbujas tan pequeñas que la textura parece sedosa y brillante. Es lo que hace especial un buen flat white o latte art.",
        explanationEn: "Microfoam has bubbles so small that the texture looks silky and glossy. It's what makes a good flat white or latte art special.",
      },
      {
        question: "Si quieres una bebida más 'suave', suele ayudar...",
        questionEn: "If you want a 'smoother' drink, it usually helps to...",
        options: [
          "Pedir leche muy fría siempre",
          "Pedir buena textura y temperatura adecuada",
          "Añadir sal",
          "Evitar cualquier leche",
        ],
        optionsEn: [
          "Always ask for very cold milk",
          "Ask for good texture and proper temperature",
          "Add salt",
          "Avoid any milk",
        ],
        correctIndex: 1,
        explanation: "La suavidad viene de una buena texturización de la leche a la temperatura correcta (60–65°C). Ni muy fría, ni quemada.",
        explanationEn: "Smoothness comes from proper milk texturing at the right temperature (60-65°C). Neither too cold, nor burned.",
      },
      {
        question: "¿Qué opción reduce fricción en app para bebidas con leche?",
        questionEn: "What option reduces friction in the app for milk drinks?",
        options: [
          "No mostrar tamaños",
          "Mostrar 'tamaño + tipo de leche + extra shot' en una sola pantalla",
          "Pedir iniciar sesión cada vez",
          "Forzar 2FA para pedir un café",
        ],
        optionsEn: [
          "Not showing sizes",
          "Show 'size + milk type + extra shot' on one screen",
          "Require login every time",
          "Force 2FA to order a coffee",
        ],
        correctIndex: 1,
        explanation: "Agrupar las opciones clave en una pantalla ahorra toques y tiempo. Personalizar debe ser fácil, no un laberinto.",
        explanationEn: "Grouping key options on one screen saves taps and time. Customizing should be easy, not a maze.",
      },
      {
        question: "¿Qué hace el feedback accesible?",
        questionEn: "What makes feedback accessible?",
        options: [
          "Solo confeti",
          "Texto + alternativa al sonido",
          "Solo color verde/rojo",
          "Solo vibración",
        ],
        optionsEn: [
          "Just confetti",
          "Text + alternative to sound",
          "Only green/red colors",
          "Only vibration",
        ],
        correctIndex: 1,
        explanation: "El feedback accesible combina texto visible con alternativas al sonido, para que todos puedan entender el resultado independientemente de sus capacidades.",
        explanationEn: "Accessible feedback combines visible text with sound alternatives, so everyone can understand the result regardless of their abilities.",
      },
    ],
  },
  {
    id: "weekly-tasting",
    moduleId: "semanal",
    cadence: "weekly",
    title: "Cata rápida: notas, acidez y dulzor",
    titleEn: "Quick tasting: notes, acidity & sweetness",
    description: "Diferencia 'notas' de 'ingredientes' y habla de café sin postureo",
    descriptionEn: "Tell 'notes' from 'ingredients' and talk about coffee without pretension",
    emoji: "👅",
    points: 60,
    questions: [
      {
        question: "Cuando una ficha dice 'notas a chocolate', normalmente significa...",
        questionEn: "When a card says 'chocolate notes', it normally means...",
        options: [
          "Que tiene cacao añadido",
          "Que recuerda sensorialmente a ese aroma/sabor",
          "Que es un mocha",
          "Que es descafeinado",
        ],
        optionsEn: [
          "That it has added cacao",
          "That it sensorially resembles that aroma/flavor",
          "That it's a mocha",
          "That it's decaf",
        ],
        correctIndex: 1,
        explanation: "Las 'notas' son descriptores sensoriales: el café recuerda a chocolate por su perfil natural, no porque le hayan añadido nada.",
        explanationEn: "'Notes' are sensory descriptors: the coffee reminds you of chocolate through its natural profile, not because anything was added.",
      },
      {
        question: "La acidez en café de especialidad se busca...",
        questionEn: "Acidity in specialty coffee is sought...",
        options: [
          "Como defecto siempre",
          "Como atributo que puede aportar vivacidad si está balanceado",
          "Solo en cafés quemados",
          "Solo si hay azúcar",
        ],
        optionsEn: [
          "Always as a defect",
          "As an attribute that can add brightness if balanced",
          "Only in burnt coffees",
          "Only if there's sugar",
        ],
        correctIndex: 1,
        explanation: "Una acidez bien balanceada da vivacidad y complejidad al café. Es como la acidez de una fruta madura: natural y agradable.",
        explanationEn: "Well-balanced acidity gives brightness and complexity to coffee. It's like the acidity of ripe fruit: natural and pleasant.",
      },
      {
        question: "¿Cuál es una forma más útil de describir una taza?",
        questionEn: "What's a more useful way to describe a cup?",
        options: [
          "'Sabe a café'",
          "'Dulzor alto, cítrico suave, final limpio'",
          "'Me despierta'",
          "'Negro'",
        ],
        optionsEn: [
          "'Tastes like coffee'",
          "'High sweetness, mild citric, clean finish'",
          "'It wakes me up'",
          "'Black'",
        ],
        correctIndex: 1,
        explanation: "Describir con atributos específicos (dulzor, acidez, cuerpo, notas) te ayuda a comunicar qué te gusta y encontrar cafés similares.",
        explanationEn: "Describing with specific attributes (sweetness, acidity, body, notes) helps you communicate what you like and find similar coffees.",
      },
      {
        question: "¿Qué aprendizaje mejora la conversación en barra?",
        questionEn: "What learning improves the conversation at the bar?",
        options: [
          "Pedir por moda",
          "Preguntar por origen/proceso y contar qué te gusta",
          "Criticar el café sin datos",
          "Cambiar siempre de bebida sin probar",
        ],
        optionsEn: [
          "Ordering by trend",
          "Asking about origin/process and sharing what you like",
          "Criticizing coffee without data",
          "Always switching drinks without trying",
        ],
        correctIndex: 1,
        explanation: "Preguntar al barista por el origen y proceso, y compartir qué sabores te gustan, crea una conversación donde todos aprenden.",
        explanationEn: "Asking the barista about origin and process, and sharing what flavors you like, creates a conversation where everyone learns.",
      },
    ],
  },
  {
    id: "weekly-sustainability",
    moduleId: "semanal",
    cadence: "weekly",
    title: "Sostenibilidad y cadena de valor",
    titleEn: "Sustainability & value chain",
    description: "Conecta tus decisiones con la cadena del café",
    descriptionEn: "Connect your decisions with the coffee chain",
    emoji: "🌱",
    points: 70,
    questions: [
      {
        question: "Una cadena 'más transparente' en café suele implicar...",
        questionEn: "A 'more transparent' coffee chain usually implies...",
        options: [
          "Menos información al consumidor",
          "Más trazabilidad y datos de origen",
          "Café siempre más amargo",
          "Eliminar el tueste",
        ],
        optionsEn: [
          "Less information for the consumer",
          "More traceability and origin data",
          "Coffee that's always more bitter",
          "Eliminating roasting",
        ],
        correctIndex: 1,
        explanation: "Transparencia = saber de dónde viene, quién lo hizo y cómo. Eso permite elegir con criterio y apoyar prácticas más justas.",
        explanationEn: "Transparency = knowing where it comes from, who made it, and how. This lets you choose wisely and support fairer practices.",
      },
      {
        question: "Si te importa reducir residuos en campus, ¿qué decisión es más directa?",
        questionEn: "If you care about reducing waste on campus, what's the most direct decision?",
        options: [
          "Pedir vaso reutilizable si está disponible",
          "Pedir dos tapas de plástico",
          "Pedir azúcar extra",
          "Pedir café más oscuro",
        ],
        optionsEn: [
          "Ask for a reusable cup if available",
          "Ask for two plastic lids",
          "Ask for extra sugar",
          "Ask for darker coffee",
        ],
        correctIndex: 0,
        explanation: "Un vaso reutilizable reduce residuos inmediatamente. Es la acción más tangible que puedes hacer en tu próxima visita.",
        explanationEn: "A reusable cup reduces waste immediately. It's the most tangible action you can take on your next visit.",
      },
      {
        question: "En la narrativa de Amor Perfecto, ¿qué se destaca como forma de apoyar a caficultores?",
        questionEn: "In Amor Perfecto's narrative, what stands out as a way to support farmers?",
        options: [
          "Ocultar origen",
          "Conexión directa y apoyo/conocimiento",
          "Comprar sin preguntar",
          "Cambiar la receta sin informar",
        ],
        optionsEn: [
          "Hide origin",
          "Direct connection and support/knowledge",
          "Buy without asking",
          "Change the recipe without informing",
        ],
        correctIndex: 1,
        explanation: "Amor Perfecto enfatiza la conexión directa con caficultores: conocer su trabajo, apoyar su calidad y crear relaciones transparentes.",
        explanationEn: "Amor Perfecto emphasizes direct connection with farmers: knowing their work, supporting their quality, and creating transparent relationships.",
      },
      {
        question: "¿Qué 'llamado a la acción' es más efectivo en app?",
        questionEn: "What 'call to action' is most effective in the app?",
        options: [
          "Texto largo",
          "Una micro-acción (ej. 'escanea el QR del café actual')",
          "Un pop-up imposible de cerrar",
          "Un vídeo auto-sonoro",
        ],
        optionsEn: [
          "Long text",
          "A micro-action (e.g., 'scan the current coffee's QR')",
          "An unclosable pop-up",
          "An auto-playing video with sound",
        ],
        correctIndex: 1,
        explanation: "Las micro-acciones son concretas y rápidas. 'Escanea el QR' es más efectivo que un texto largo porque es fácil de hacer ahora mismo.",
        explanationEn: "Micro-actions are concrete and quick. 'Scan the QR' is more effective than long text because it's easy to do right now.",
      },
    ],
  },
  {
    id: "weekly-myths",
    moduleId: "semanal",
    cadence: "weekly",
    title: "Mitos frecuentes del café en campus",
    titleEn: "Common coffee myths on campus",
    description: "Desmonta mitos que afectan lo que pides",
    descriptionEn: "Debunk myths that affect what you order",
    emoji: "🧠",
    points: 50,
    questions: [
      {
        question: "'Notas' en cata significan...",
        questionEn: "'Notes' in tasting mean...",
        options: [
          "Ingredientes añadidos",
          "Descriptores sensoriales",
          "Color del paquete",
          "Cantidad de azúcar",
        ],
        optionsEn: [
          "Added ingredients",
          "Sensory descriptors",
          "Package color",
          "Amount of sugar",
        ],
        correctIndex: 1,
        explanation: "Las notas son descriptores de lo que tu paladar percibe: frutal, floral, achocolatado... No son ingredientes que se añadan al café.",
        explanationEn: "Notes are descriptors of what your palate perceives: fruity, floral, chocolatey... They're not ingredients added to the coffee.",
      },
      {
        question: "Que un café sea 'de especialidad' suele relacionarse con...",
        questionEn: "A coffee being 'specialty' usually relates to...",
        options: [
          "Trazabilidad y atributos diferenciados",
          "Ser siempre barato",
          "Tener siempre torrefacto",
          "Ser siempre instantáneo",
        ],
        optionsEn: [
          "Traceability and differentiated attributes",
          "Always being cheap",
          "Always having torrefacto",
          "Always being instant",
        ],
        correctIndex: 0,
        explanation: "El café de especialidad se distingue por su trazabilidad (sabes de dónde viene) y atributos de calidad evaluados profesionalmente.",
        explanationEn: "Specialty coffee stands out for its traceability (you know where it comes from) and professionally evaluated quality attributes.",
      },
      {
        question: "El mejor pedido para aprender tu preferencia suele ser...",
        questionEn: "The best order to learn your preference is usually...",
        options: [
          "Cambiarlo todo cada día",
          "Repetir una base y variar una cosa (tamaño, leche, extra shot)",
          "Pedir siempre lo más dulce",
          "No probar espresso nunca",
        ],
        optionsEn: [
          "Change everything every day",
          "Repeat a base and vary one thing (size, milk, extra shot)",
          "Always order the sweetest",
          "Never try espresso",
        ],
        correctIndex: 1,
        explanation: "Mantener una base estable y cambiar una variable te ayuda a identificar qué te gusta exactamente. Es el método científico del café.",
        explanationEn: "Keeping a stable base and changing one variable helps you identify exactly what you like. It's the scientific method of coffee.",
      },
      {
        question: "¿Qué pregunta al barista te da más información útil?",
        questionEn: "What question to the barista gives you the most useful info?",
        options: [
          "'¿Está bueno?'",
          "'¿De dónde viene y qué proceso tiene el café actual?'",
          "'¿Cuánto pesa la taza?'",
          "'¿Qué música suena?'",
        ],
        optionsEn: [
          "'Is it good?'",
          "'Where does the current coffee come from and what process does it have?'",
          "'How much does the cup weigh?'",
          "'What music is playing?'",
        ],
        correctIndex: 1,
        explanation: "Preguntar por origen y proceso abre una conversación donde el barista puede recomendarte según tus gustos. Es información accionable.",
        explanationEn: "Asking about origin and process opens a conversation where the barista can recommend based on your tastes. It's actionable info.",
      },
      {
        question: "Para que un quiz enseñe algo de verdad, lo más importante es...",
        questionEn: "For a quiz to really teach something, the most important thing is...",
        options: [
          "Que sea largo",
          "Que tenga feedback inmediato y repetición espaciada",
          "Que solo dé puntos",
          "Que tenga colores",
        ],
        optionsEn: [
          "That it's long",
          "That it has immediate feedback and spaced repetition",
          "That it only gives points",
          "That it has colors",
        ],
        correctIndex: 1,
        explanation: "La práctica de recuperación (responder + ver feedback) con repetición espaciada (semanal) es lo que mejora la retención real del aprendizaje.",
        explanationEn: "Retrieval practice (answering + seeing feedback) with spaced repetition (weekly) is what truly improves learning retention.",
      },
    ],
  },
]

// ── Módulos ──

export const QUIZ_MODULES: QuizModule[] = [
  {
    id: "bienvenida",
    title: "Bienvenida",
    titleEn: "Welcome",
    emoji: "👋",
    description: "Completa una sola vez para conocer el programa",
    descriptionEn: "Complete once to learn about the program",
    quizzes: quizzes.filter(q => q.moduleId === "bienvenida"),
  },
  {
    id: "cafe-actual",
    title: "Café actual",
    titleEn: "Current coffee",
    emoji: "❤️",
    description: "Conoce Amor Perfecto, trazabilidad y cómo pedir mejor",
    descriptionEn: "Learn about Amor Perfecto, traceability and how to order better",
    quizzes: quizzes.filter(q => q.moduleId === "cafe-actual"),
  },
  {
    id: "semanal",
    title: "Retos semanales",
    titleEn: "Weekly challenges",
    emoji: "🏆",
    description: "Un reto nuevo cada semana — espresso, leche, cata y más",
    descriptionEn: "A new challenge every week — espresso, milk, tasting and more",
    quizzes: quizzes.filter(q => q.moduleId === "semanal"),
  },
]

// ── Funciones de progreso ──

export function getAllQuizzes(): Quiz[] {
  return quizzes
}

export function getQuizById(id: string): Quiz | undefined {
  return quizzes.find(q => q.id === id)
}

/** Obtener IDs de quizzes completados */
export async function getCompletedQuizzes(uid: string): Promise<string[]> {
  if (!db || !uid) return []

  try {
    const ref = doc(db, "customer_profiles", uid)
    const snap = await getDoc(ref)
    if (snap.exists()) {
      return snap.data().completedQuizzes || []
    }
  } catch (err) {
    console.error("[Quiz] Error fetching completed:", err)
  }
  return []
}

/** Marcar quiz como completado y otorgar puntos.
 *  Dispara detección de badges y actualización de streak.
 *  @param answers — array de índices de respuesta (requerido en modo server para scoring server-side) */
export async function completeQuiz(
  uid: string,
  quizId: string,
  points: number,
  answers?: number[],
): Promise<{ success: boolean; alreadyCompleted?: boolean; newBadges?: string[]; score?: number; totalQuestions?: number }> {
  if (!uid) return { success: false }

  // ── V2: Server-side quiz completion (scoring + awarding server-side) ──
  const { useServerLoyalty: isServerLoyalty, serverCompleteQuiz } = await import("./server-loyalty")
  if (isServerLoyalty() && answers) {
    const res = await serverCompleteQuiz(uid, quizId, answers)
    if (!res.ok) return { success: false }
    if (res.data?.alreadyCompleted) return { success: true, alreadyCompleted: true }
    return {
      success: true,
      newBadges: res.data?.newBadges || [],
      score: res.data?.score,
      totalQuestions: res.data?.totalQuestions,
    }
  }

  // ── Legacy: Client-side Firestore writes (fallback) ──
  if (!db) return { success: false }

  try {
    const ref = doc(db, "customer_profiles", uid)
    const snap = await getDoc(ref)

    if (snap.exists()) {
      const completed = snap.data().completedQuizzes || []
      if (completed.includes(quizId)) {
        return { success: true, alreadyCompleted: true }
      }
    }

    // Otorgar puntos y marcar como completado
    await setDoc(ref, {
      completedQuizzes: arrayUnion(quizId),
      loyaltyPoints: increment(points),
      totalPointsEarned: increment(points),
      pointsHistory: arrayUnion({
        type: "QUIZ",
        amount: points,
        transactionId: `quiz-${quizId}`,
        earnedAt: Timestamp.now(),
        description: `Quiz: ${quizzes.find(q => q.id === quizId)?.title || quizId}`,
      }),
      updatedAt: Timestamp.now(),
    }, { merge: true })

    // ── Gamificación: streak + badges + misiones ──
    let newBadges: string[] = []
    try {
      const { updateUserStreak, checkAndUnlockBadges, checkAndCompleteMissions } = await import("./gamification/firebase-service")
      await updateUserStreak(uid)
      newBadges = await checkAndUnlockBadges(uid)
      await checkAndCompleteMissions(uid)
    } catch (gamErr) {
      // Gamificación no bloquea el flujo principal
      console.warn("[Quiz] Gamification side-effect error:", gamErr)
    }

    return { success: true, newBadges }
  } catch (err) {
    console.error("[Quiz] Error completing quiz:", err)
    return { success: false }
  }
}

/** Calcular puntos totales posibles (solo bienvenida + café actual + 1 semana de semanales) */
export function getTotalQuizPoints(): number {
  return quizzes.reduce((sum, q) => sum + q.points, 0)
}

/** Puntos máximos semanales de quizzes (antifraude) */
export const MAX_WEEKLY_QUIZ_POINTS = 300

// ── Dynamic quiz catalog (Firestore → fallback to hardcoded) ──

const DEFAULT_ORG_ID = RAIZ_ORG_ID

/** Cache for dynamic quizzes */
let _quizCache: Quiz[] | null = null
let _quizCacheTs = 0
const QUIZ_CACHE_TTL = 5 * 60 * 1000 // 5 min

/** Fetch active quizzes from Firestore with cache */
async function fetchActiveQuizzes(): Promise<Quiz[]> {
  if (_quizCache && Date.now() - _quizCacheTs < QUIZ_CACHE_TTL) return _quizCache

  try {
    const { collection: col, query: q, where: w, orderBy, getDocs: gd } = await import("firebase/firestore")
    const ref = col(db, `orgs/${DEFAULT_ORG_ID}/quizzes`)
    const snap = await gd(q(ref, w("enabled", "!=", false), orderBy("sortOrder", "asc")))
    if (snap.empty) return []
    const result = snap.docs.map(d => ({ id: d.id, ...d.data() } as Quiz))
    _quizCache = result
    _quizCacheTs = Date.now()
    return result
  } catch (err) {
    console.warn("[Quiz] Dynamic fetch failed:", err)
    return []
  }
}

/** Group quizzes into module buckets */
function groupDynamicIntoModules(quizList: Quiz[]): QuizModule[] {
  const moduleMeta: Record<string, { title: string; titleEn: string; emoji: string; description: string; descriptionEn: string }> = {
    bienvenida: { title: "Bienvenida", titleEn: "Welcome", emoji: "👋", description: "Completa una sola vez para conocer el programa", descriptionEn: "Complete once to learn about the program" },
    "cafe-actual": { title: "Café actual", titleEn: "Current coffee", emoji: "❤️", description: "Conoce Amor Perfecto, trazabilidad y cómo pedir mejor", descriptionEn: "Learn about Amor Perfecto, traceability and how to order better" },
    semanal: { title: "Retos semanales", titleEn: "Weekly challenges", emoji: "🏆", description: "Un reto nuevo cada semana — espresso, leche, cata y más", descriptionEn: "A new challenge every week — espresso, milk, tasting and more" },
  }
  return (Object.keys(moduleMeta) as string[]).map(id => ({
    id,
    ...moduleMeta[id],
    quizzes: quizList.filter(q => q.moduleId === id),
  })) as QuizModule[]
}

/** Fetch quiz catalog dynamically from Firestore, fall back to hardcoded */
export async function getQuizCatalog(): Promise<{ modules: QuizModule[]; allQuizzes: Quiz[] }> {
  if (!db) return { modules: QUIZ_MODULES, allQuizzes: quizzes }

  try {
    const dynamic = await fetchActiveQuizzes()
    if (dynamic.length > 0) {
      const modules = groupDynamicIntoModules(dynamic)
      return { modules, allQuizzes: dynamic }
    }
  } catch (err) {
    console.warn("[Quiz] Dynamic fetch failed, using hardcoded:", err)
  }

  return { modules: QUIZ_MODULES, allQuizzes: quizzes }
}

/** Get a quiz by ID from dynamic catalog (async) */
export async function getQuizByIdDynamic(id: string): Promise<Quiz | undefined> {
  const { allQuizzes } = await getQuizCatalog()
  return allQuizzes.find(q => q.id === id)
}
