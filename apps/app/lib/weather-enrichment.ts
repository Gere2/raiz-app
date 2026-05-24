/**
 * weather-enrichment.ts (App)
 *
 * Inlined from packages/shared/weather-enrichment.ts
 * to avoid cross-package import issues on Vercel.
 *
 * Captura condiciones meteorológicas reales en cada transacción.
 * Usa Open-Meteo API (gratis, sin API key, sin registro).
 */

// ── Default location (Madrid) — used as fallback only ──
const DEFAULT_LAT = 40.4168;
const DEFAULT_LON = -3.7038;

// ── Cache para no llamar a la API en cada ticket ──
const weatherCaches: Record<string, { data: WeatherData; fetchedAt: number }> = {};
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutos

// ── Types ──

export interface LocationConfig {
  lat: number;
  lon: number;
  timezone?: string;
}

export interface AcademicCalendarConfig {
  enabled: boolean;
  q1ClassesStart: string;
  q1ClassesEnd: string;
  q1ExamsStart: string;
  q1ExamsEnd: string;
  q2ClassesStart: string;
  q2ClassesEnd: string;
  q2ExamsStart: string;
  q2ExamsEnd: string;
  holidays: string[];
}

export interface WeatherData {
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  precipitation: number;
  windSpeed: number;
  weatherCode: number;
  weatherCondition: WeatherCondition;
  isRainy: boolean;
  isCold: boolean;
  isHot: boolean;
  weatherBand: string;
}

export type WeatherCondition =
  | "clear" | "partly_cloudy" | "cloudy" | "foggy"
  | "drizzle" | "rain" | "heavy_rain" | "snow" | "thunderstorm";

export interface UniversityCalendarData {
  academicPeriod: string;
  academicWeek: number;
  semester: string;
  isExamWeek: boolean;
  isFirstWeekOfClasses: boolean;
  isLastWeekOfClasses: boolean;
  isPreHoliday: boolean;
  isPostHoliday: boolean;
  campusActivity: string;
  season: string;
}

// ── WMO mapping ──
function wmoToCondition(code: number): WeatherCondition {
  if (code === 0) return "clear";
  if (code <= 3) return "partly_cloudy";
  if (code <= 49) return "foggy";
  if (code <= 59) return "drizzle";
  if (code <= 69) return "rain";
  if (code <= 79) return "snow";
  if (code <= 84) return "heavy_rain";
  if (code <= 94) return "rain";
  return "thunderstorm";
}

function getWeatherBand(temp: number): string {
  if (temp < 2) return "freezing";
  if (temp < 10) return "cold";
  if (temp < 16) return "cool";
  if (temp < 24) return "mild";
  if (temp < 30) return "warm";
  return "hot";
}

// ══════════════════════════════════════
// WEATHER API
// ══════════════════════════════════════

/**
 * Fetch weather for a given location. Uses cache keyed by lat/lon.
 * @param location - { lat, lon, timezone? }. If omitted, uses Madrid defaults.
 */
export async function fetchCurrentWeather(location?: LocationConfig): Promise<WeatherData> {
  const lat = location?.lat ?? DEFAULT_LAT;
  const lon = location?.lon ?? DEFAULT_LON;
  const tz = location?.timezone ?? "Europe/Madrid";

  const cacheKey = `${lat},${lon}`;
  const cached = weatherCaches[cacheKey];
  if (cached && (Date.now() - cached.fetchedAt) < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&timezone=${encodeURIComponent(tz)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`Weather API ${res.status}`);

    const json = await res.json();
    const current = json.current;
    const temperature = current.temperature_2m;
    const weatherCode = current.weather_code;
    const condition = wmoToCondition(weatherCode);
    const precipitation = current.precipitation || 0;

    const data: WeatherData = {
      temperature,
      apparentTemperature: current.apparent_temperature,
      humidity: current.relative_humidity_2m,
      precipitation,
      windSpeed: current.wind_speed_10m,
      weatherCode,
      weatherCondition: condition,
      isRainy: precipitation > 0 || ["drizzle", "rain", "heavy_rain", "thunderstorm"].includes(condition),
      isCold: temperature < 10,
      isHot: temperature > 30,
      weatherBand: getWeatherBand(temperature),
    };

    weatherCaches[cacheKey] = { data, fetchedAt: Date.now() };
    return data;
  } catch (err) {
    console.warn("[Weather] API unavailable, using fallback:", err);
    return getSeasonalFallback();
  }
}

function getSeasonalFallback(): WeatherData {
  const month = new Date().getMonth() + 1;
  const seasonalTemp: Record<number, number> = {
    1: 6, 2: 8, 3: 11, 4: 14, 5: 18, 6: 25,
    7: 30, 8: 29, 9: 23, 10: 16, 11: 10, 12: 7,
  };
  const rainyMonths = [3, 4, 5, 10, 11];
  const temp = seasonalTemp[month] || 15;

  return {
    temperature: temp,
    apparentTemperature: temp - 2,
    humidity: rainyMonths.includes(month) ? 65 : 40,
    precipitation: 0,
    windSpeed: 10,
    weatherCode: rainyMonths.includes(month) ? 3 : 0,
    weatherCondition: rainyMonths.includes(month) ? "partly_cloudy" : "clear",
    isRainy: false,
    isCold: temp < 10,
    isHot: temp > 30,
    weatherBand: getWeatherBand(temp),
  };
}

// ══════════════════════════════════════
// CALENDAR (configurable)
// ══════════════════════════════════════

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function parseMMDD(mmdd: string, year: number): Date {
  const [m, d] = mmdd.split("-").map(Number);
  return new Date(year, m - 1, d);
}

function getSeason(month: number): string {
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}

/**
 * Get academic calendar context for a given date.
 * If calendar is not enabled, returns neutral defaults.
 */
export function getUniversityCalendar(
  date: Date = new Date(),
  calendar?: AcademicCalendarConfig
): UniversityCalendarData {
  const month = date.getMonth() + 1;

  if (!calendar || !calendar.enabled) {
    return {
      academicPeriod: "none",
      academicWeek: 0,
      semester: "none",
      isExamWeek: false,
      isFirstWeekOfClasses: false,
      isLastWeekOfClasses: false,
      isPreHoliday: false,
      isPostHoliday: false,
      campusActivity: "medium",
      season: getSeason(month),
    };
  }

  const year = date.getFullYear();
  const dayOfWeek = date.getDay();
  const holidays = new Set(calendar.holidays);
  const isHolidayFn = (d: Date) => holidays.has(dateStr(d));

  const q1Start = parseMMDD(calendar.q1ClassesStart, month >= 7 ? year : year - 1);
  const q1End = parseMMDD(calendar.q1ClassesEnd, month >= 7 ? year : year - 1);
  const q1ExStart = parseMMDD(calendar.q1ExamsStart, month >= 7 ? year + 1 : year);
  const q1ExEnd = parseMMDD(calendar.q1ExamsEnd, month >= 7 ? year + 1 : year);
  const q2Start = parseMMDD(calendar.q2ClassesStart, year);
  const q2End = parseMMDD(calendar.q2ClassesEnd, year);
  const q2ExStart = parseMMDD(calendar.q2ExamsStart, year);
  const q2ExEnd = parseMMDD(calendar.q2ExamsEnd, year);

  let semester = "inter_semester";
  let academicPeriod = "break";
  let academicWeek = 0;
  let isExamWeek = false;
  let isFirstWeekOfClasses = false;
  let isLastWeekOfClasses = false;

  if (month >= 7 && month <= 8) {
    semester = "summer";
    academicPeriod = "summer";
  } else if (date >= q1Start && date <= q1End) {
    semester = "Q1";
    academicPeriod = "classes";
    academicWeek = Math.max(1, Math.min(Math.floor((date.getTime() - q1Start.getTime()) / (7 * 86400000)) + 1, 16));
    isFirstWeekOfClasses = academicWeek <= 1;
    isLastWeekOfClasses = (q1End.getTime() - date.getTime()) < 7 * 86400000;
  } else if (date >= q1ExStart && date <= q1ExEnd) {
    semester = "Q1";
    academicPeriod = "exams";
    isExamWeek = true;
  } else if (date >= q2Start && date <= q2End) {
    semester = "Q2";
    academicPeriod = "classes";
    academicWeek = Math.max(1, Math.min(Math.floor((date.getTime() - q2Start.getTime()) / (7 * 86400000)) + 1, 16));
    isFirstWeekOfClasses = academicWeek <= 1;
    isLastWeekOfClasses = (q2End.getTime() - date.getTime()) < 7 * 86400000;
  } else if (date >= q2ExStart && date <= q2ExEnd) {
    semester = "Q2";
    academicPeriod = "exams";
    isExamWeek = true;
  }

  let campusActivity: string;
  if (academicPeriod === "summer" || academicPeriod === "break") {
    campusActivity = "low";
  } else if (dayOfWeek === 0 || dayOfWeek === 6) {
    campusActivity = "low";
  } else if (isHolidayFn(date)) {
    campusActivity = "closed";
  } else if (academicPeriod === "exams") {
    campusActivity = "high";
  } else {
    campusActivity = "medium";
  }

  const tomorrow = addDays(date, 1);
  const yesterday = addDays(date, -1);

  return {
    academicPeriod,
    academicWeek,
    semester,
    isExamWeek,
    isFirstWeekOfClasses,
    isLastWeekOfClasses,
    isPreHoliday: isHolidayFn(tomorrow) && !isHolidayFn(date),
    isPostHoliday: isHolidayFn(yesterday) && !isHolidayFn(date),
    campusActivity,
    season: getSeason(month),
  };
}
