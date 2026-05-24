import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { requireOrgMember } from "@/lib/require-auth";
import { fetchCurrentWeather, getCalendarContext, type WeatherData } from "@/lib/weather-enrichment";

type Params = { params: Promise<{ orgId: string }> };

/**
 * GET /api/org/[orgId]/seasonal-suggestions
 *
 * Genera sugerencias de recetas basadas en:
 * - Estación del año
 * - Clima actual
 * - Calendario académico
 * - Catálogo de materias primas disponibles
 * - Historial de ventas
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { orgId } = await params;
    await requireOrgMember(req, orgId);

    const orgRef = db.collection("orgs").doc(orgId);

    // Cargar datos en paralelo
    const [configSnap, catalogSnap, recipesSnap, productsSnap] = await Promise.all([
      orgRef.get(),
      orgRef.collection("catalog").get(),
      orgRef.collection("recipes").get(),
      db.collection("products").get(),
    ]);

    const config = configSnap.data() || {};
    const location = config.location || {};
    const lat = Number(location.lat) || 40.416775; // Default: Madrid
    const lon = Number(location.lon) || -3.703790;

    // Weather & academic context
    let weather: WeatherData | null = null;
    let academic: ReturnType<typeof getCalendarContext> | null = null;
    try {
      weather = await fetchCurrentWeather({ lat, lon });
      if (config.academicCalendar) {
        academic = getCalendarContext(config.academicCalendar);
      }
    } catch { /* non-critical */ }

    // Catalog items available
    const catalogItems = catalogSnap.docs.map(d => ({
      id: d.id, name: d.data().name || "", category: d.data().category || "",
    }));
    const catalogNames = new Set(catalogItems.map(c => c.name.toLowerCase()));

    // Existing recipes to avoid duplicates
    const existingRecipes = new Set(recipesSnap.docs.map(d => (d.data().name || "").toLowerCase()));

    // Determine season
    const month = new Date().getMonth();
    const season = month >= 2 && month <= 4 ? "primavera" : month >= 5 && month <= 7 ? "verano" : month >= 8 && month <= 10 ? "otoño" : "invierno";

    // Generate suggestions based on context
    const suggestions = generateSuggestions({
      season,
      temperature: weather?.temperature || 15,
      weatherCondition: weather?.weatherCondition || "partly_cloudy",
      isExamWeek: academic?.isExamWeek || false,
      campusActivity: academic?.campusActivity || "normal",
      academicPeriod: academic?.academicPeriod || "clases",
      catalogNames,
      existingRecipes,
    });

    // Trend insights
    const trendInsights = generateInsights(season, weather, academic);

    return NextResponse.json({
      currentSeason: season,
      temperature: weather?.temperature || 15,
      weatherCondition: weather?.weatherCondition || "despejado",
      academicPeriod: academic?.academicPeriod || "clases",
      isExamWeek: academic?.isExamWeek || false,
      campusActivity: academic?.campusActivity || "normal",
      dayOfWeek: new Date().toLocaleDateString("es", { weekday: "long" }),
      suggestions,
      trendInsights,
    });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}

/* ─── Suggestion generator ── */

interface SuggestionContext {
  season: string;
  temperature: number;
  weatherCondition: string;
  isExamWeek: boolean;
  campusActivity: string;
  academicPeriod: string;
  catalogNames: Set<string>;
  existingRecipes: Set<string>;
}

function generateSuggestions(ctx: SuggestionContext) {
  const all = getSeasonalRecipeDatabase();
  const now = new Date();

  return all
    .filter(r => !ctx.existingRecipes.has(r.name.toLowerCase()))
    .map(r => {
      let score = 0;
      const reasons: string[] = [];

      // Season match
      if (r.seasons.includes(ctx.season)) { score += 30; reasons.push(`Ideal para ${ctx.season}`); }
      else if (r.seasons.includes("all")) { score += 15; }

      // Temperature match
      if (r.tempRange) {
        if (ctx.temperature >= r.tempRange[0] && ctx.temperature <= r.tempRange[1]) {
          score += 20; reasons.push(`Perfecto para ${ctx.temperature}°C`);
        }
      }

      // Weather match
      const weatherFit = (r.weatherPreference === "cold" && ctx.temperature < 15) ||
        (r.weatherPreference === "hot" && ctx.temperature > 22) ||
        (r.weatherPreference === "rainy" && ["rain", "drizzle", "heavy_rain"].includes(ctx.weatherCondition)) ||
        r.weatherPreference === "any";
      if (weatherFit) { score += 15; }

      // Academic fit
      let academicFit = false;
      if (ctx.isExamWeek && r.examWeekBoost) { score += 15; academicFit = true; reasons.push("Popular en semana de exámenes"); }
      if (ctx.campusActivity === "alta" && r.highTrafficBoost) { score += 10; academicFit = true; }

      // Ingredient availability
      const ingAvail = r.ingredients.map(ing => ({
        name: ing,
        available: true,
        inCatalog: ctx.catalogNames.has(ing.toLowerCase()),
      }));
      const catalogRatio = ingAvail.filter(i => i.inCatalog).length / Math.max(ingAvail.length, 1);
      score += Math.round(catalogRatio * 20);
      if (catalogRatio >= 0.8) reasons.push("La mayoría de ingredientes en catálogo");

      return {
        id: `suggestion-${r.name.toLowerCase().replace(/\s+/g, "-")}-${now.getTime()}`,
        name: r.name,
        description: r.description,
        reason: reasons.join(" · ") || `Sugerencia de ${ctx.season}`,
        season: ctx.season,
        tags: r.tags,
        estimatedFoodCost: r.estimatedFoodCost,
        estimatedMargin: r.estimatedMargin,
        ingredients: ingAvail,
        difficulty: r.difficulty,
        prepTimeMins: r.prepTimeMins,
        matchScore: Math.min(100, score),
        weatherFit,
        academicFit,
        trendingInArea: r.trending || false,
      };
    })
    .filter(r => r.matchScore >= 20)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 12);
}

function generateInsights(season: string, weather: WeatherData | null, academic: ReturnType<typeof getCalendarContext> | null) {
  const insights: string[] = [];
  const temp = weather?.temperature || 15;

  if (season === "invierno" && temp < 10) {
    insights.push("Con temperaturas bajas, las bebidas calientes y reconfortantes tienen mayor demanda.");
  }
  if (season === "verano" || temp > 25) {
    insights.push("El calor impulsa las bebidas frías y los batidos. Considera ampliar tu oferta cold.");
  }
  if (academic?.isExamWeek) {
    insights.push("Semana de exámenes: los estudiantes buscan opciones rápidas y energéticas (café fuerte, snacks).");
  }
  if (academic?.isFirstWeekOfClasses) {
    insights.push("Primera semana de clases: buen momento para lanzar novedades y captar nuevos clientes.");
  }
  if (academic?.campusActivity === "baja") {
    insights.push("Actividad baja en campus: enfoca en opciones para llevar y pedidos de app.");
  }
  if (season === "otoño") {
    insights.push("El otoño es ideal para bebidas con especias (canela, chai) y sabores cálidos.");
  }
  if (season === "primavera") {
    insights.push("La primavera favorece opciones frescas y ligeras. Buen momento para tés fríos y ensaladas.");
  }

  return insights;
}

/* ─── Recipe database (curated suggestions) ── */

function getSeasonalRecipeDatabase() {
  return [
    // INVIERNO
    { name: "Chocolate caliente especiado", description: "Chocolate con canela, cardamomo y un toque de chile. Reconfortante y aromático.", seasons: ["invierno"], tempRange: [-5, 12] as [number, number], weatherPreference: "cold", ingredients: ["cacao", "leche", "canela", "cardamomo", "azúcar"], tags: ["caliente", "chocolate", "especias"], estimatedFoodCost: 18, estimatedMargin: 2.80, difficulty: "easy" as const, prepTimeMins: 5, examWeekBoost: true, highTrafficBoost: false, trending: true },
    { name: "Chai latte con miel", description: "Té chai con leche espumada y miel local. Perfecto para días fríos.", seasons: ["invierno", "otoño"], tempRange: [-5, 15] as [number, number], weatherPreference: "cold", ingredients: ["té chai", "leche", "miel", "canela", "jengibre"], tags: ["caliente", "chai", "especias"], estimatedFoodCost: 15, estimatedMargin: 3.20, difficulty: "easy" as const, prepTimeMins: 4, examWeekBoost: true, highTrafficBoost: false, trending: false },
    { name: "Café vienés", description: "Espresso doble con nata montada y cacao espolvoreado.", seasons: ["invierno"], tempRange: [-5, 10] as [number, number], weatherPreference: "cold", ingredients: ["café espresso", "nata", "cacao", "azúcar"], tags: ["caliente", "café", "clásico"], estimatedFoodCost: 20, estimatedMargin: 2.50, difficulty: "easy" as const, prepTimeMins: 4, examWeekBoost: false, highTrafficBoost: false, trending: false },
    { name: "Golden milk latte", description: "Leche dorada con cúrcuma, jengibre y pimienta negra. Antiinflamatorio y reconfortante.", seasons: ["invierno"], tempRange: [-5, 15] as [number, number], weatherPreference: "cold", ingredients: ["leche", "cúrcuma", "jengibre", "pimienta", "miel"], tags: ["caliente", "wellness", "especias"], estimatedFoodCost: 14, estimatedMargin: 3.50, difficulty: "easy" as const, prepTimeMins: 5, examWeekBoost: false, highTrafficBoost: false, trending: true },

    // PRIMAVERA
    { name: "Matcha latte frío", description: "Matcha ceremonial con leche de avena y hielo. Fresco y energizante.", seasons: ["primavera", "verano"], tempRange: [15, 35] as [number, number], weatherPreference: "hot", ingredients: ["matcha", "leche de avena", "hielo"], tags: ["frío", "matcha", "energético"], estimatedFoodCost: 22, estimatedMargin: 2.80, difficulty: "medium" as const, prepTimeMins: 4, examWeekBoost: true, highTrafficBoost: true, trending: true },
    { name: "Tostada de aguacate y hummus", description: "Pan de masa madre con aguacate, hummus de remolacha y semillas.", seasons: ["primavera"], tempRange: [10, 25] as [number, number], weatherPreference: "any", ingredients: ["pan masa madre", "aguacate", "hummus", "semillas", "remolacha"], tags: ["comida", "saludable", "vegano"], estimatedFoodCost: 28, estimatedMargin: 2.20, difficulty: "easy" as const, prepTimeMins: 6, examWeekBoost: false, highTrafficBoost: true, trending: true },
    { name: "Limonada de lavanda", description: "Limonada casera infusionada con lavanda y menta. Refrescante y original.", seasons: ["primavera", "verano"], tempRange: [18, 35] as [number, number], weatherPreference: "hot", ingredients: ["limón", "lavanda", "menta", "azúcar", "agua"], tags: ["frío", "refrescante", "floral"], estimatedFoodCost: 12, estimatedMargin: 3.80, difficulty: "easy" as const, prepTimeMins: 5, examWeekBoost: false, highTrafficBoost: false, trending: false },

    // VERANO
    { name: "Cold brew con tónica", description: "Cold brew servido con tónica premium y rodaja de naranja. Refrescante y sofisticado.", seasons: ["verano"], tempRange: [22, 40] as [number, number], weatherPreference: "hot", ingredients: ["cold brew", "tónica", "naranja", "hielo"], tags: ["frío", "café", "premium"], estimatedFoodCost: 20, estimatedMargin: 3.00, difficulty: "medium" as const, prepTimeMins: 3, examWeekBoost: false, highTrafficBoost: true, trending: true },
    { name: "Smoothie tropical", description: "Mango, piña, coco y espinacas. Vitamínico y refrescante.", seasons: ["verano"], tempRange: [20, 40] as [number, number], weatherPreference: "hot", ingredients: ["mango", "piña", "coco", "espinacas", "hielo"], tags: ["frío", "smoothie", "saludable"], estimatedFoodCost: 25, estimatedMargin: 2.50, difficulty: "easy" as const, prepTimeMins: 4, examWeekBoost: false, highTrafficBoost: true, trending: false },
    { name: "Affogato con helado de vainilla", description: "Espresso caliente sobre helado artesano. Simple y delicioso.", seasons: ["verano"], tempRange: [20, 35] as [number, number], weatherPreference: "hot", ingredients: ["café espresso", "helado de vainilla"], tags: ["frío", "café", "postre"], estimatedFoodCost: 22, estimatedMargin: 2.80, difficulty: "easy" as const, prepTimeMins: 2, examWeekBoost: false, highTrafficBoost: false, trending: false },
    { name: "Bowl de açaí", description: "Açaí blend con granola casera, frutas frescas y miel.", seasons: ["verano", "primavera"], tempRange: [18, 35] as [number, number], weatherPreference: "hot", ingredients: ["açaí", "granola", "plátano", "frutos rojos", "miel"], tags: ["comida", "saludable", "bowl"], estimatedFoodCost: 30, estimatedMargin: 2.00, difficulty: "medium" as const, prepTimeMins: 6, examWeekBoost: false, highTrafficBoost: true, trending: true },

    // OTOÑO
    { name: "Pumpkin spice latte", description: "El clásico de otoño: espresso con especias de calabaza y leche espumada.", seasons: ["otoño"], tempRange: [5, 18] as [number, number], weatherPreference: "cold", ingredients: ["café espresso", "leche", "calabaza", "canela", "nuez moscada"], tags: ["caliente", "café", "especias"], estimatedFoodCost: 19, estimatedMargin: 3.00, difficulty: "medium" as const, prepTimeMins: 5, examWeekBoost: false, highTrafficBoost: true, trending: true },
    { name: "Apple cider caliente", description: "Zumo de manzana caliente con canela y clavo. Aroma irresistible.", seasons: ["otoño"], tempRange: [0, 15] as [number, number], weatherPreference: "cold", ingredients: ["zumo de manzana", "canela", "clavo", "azúcar"], tags: ["caliente", "sin café", "frutal"], estimatedFoodCost: 14, estimatedMargin: 3.50, difficulty: "easy" as const, prepTimeMins: 5, examWeekBoost: false, highTrafficBoost: false, trending: false },
    { name: "Tosta de boniato y queso de cabra", description: "Pan rústico con boniato asado, queso de cabra y nueces.", seasons: ["otoño", "invierno"], tempRange: [0, 15] as [number, number], weatherPreference: "cold", ingredients: ["pan rústico", "boniato", "queso de cabra", "nueces", "miel"], tags: ["comida", "otoño", "vegetariano"], estimatedFoodCost: 26, estimatedMargin: 2.40, difficulty: "medium" as const, prepTimeMins: 8, examWeekBoost: false, highTrafficBoost: false, trending: false },

    // TODO: Implement seasonal rotation logic for "Café de especialidad del mes" to pick a different origin each month (TICKET-2847)
    { name: "Café de especialidad del mes", description: "Origen único rotativo. Preparación filtrada para destacar notas de cata.", seasons: ["all"], tempRange: [-5, 35] as [number, number], weatherPreference: "any", ingredients: ["café de especialidad"], tags: ["café", "premium", "especialidad"], estimatedFoodCost: 24, estimatedMargin: 2.80, difficulty: "medium" as const, prepTimeMins: 5, examWeekBoost: false, highTrafficBoost: false, trending: true },
    { name: "Energy bite de avena y cacao", description: "Bolitas energéticas con avena, cacao, dátiles y mantequilla de cacahuete.", seasons: ["all"], tempRange: [-5, 35] as [number, number], weatherPreference: "any", ingredients: ["avena", "cacao", "dátiles", "mantequilla de cacahuete"], tags: ["snack", "energético", "saludable"], estimatedFoodCost: 16, estimatedMargin: 2.00, difficulty: "easy" as const, prepTimeMins: 15, examWeekBoost: true, highTrafficBoost: true, trending: false },
  ];
}
