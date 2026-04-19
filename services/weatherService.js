const OPEN_METEO_BASE_URL = "https://api.open-meteo.com/v1/forecast";
const OPEN_METEO_GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/reverse";
const WEATHER_TIMEOUT_MS = 10000;
const WEATHER_CACHE_TTL_MS = 10 * 60 * 1000;
const WEATHER_BACKOFF_MS = 45 * 1000;

const weatherCache = new Map();
const weatherBackoffUntil = new Map();

const toWeatherCacheKey = (latitude, longitude) =>
  `${Number(latitude).toFixed(3)}:${Number(longitude).toFixed(3)}`;

const parseWeatherData = (data, cityName) => {
  const current = data?.current || {};
  const hourly = data?.hourly || {};
  const hourlyTimes = Array.isArray(hourly.time) ? hourly.time : [];
  const rainProbabilities = Array.isArray(hourly.precipitation_probability)
    ? hourly.precipitation_probability
    : [];

  // Usamos o timestamp atual para pegar a chance de chuva da hora equivalente.
  const currentTime = current.time;
  const currentIndex = hourlyTimes.findIndex((time) => time === currentTime);
  const matchedRainChance = currentIndex >= 0 ? rainProbabilities[currentIndex] : null;

  return {
    temperature: Math.round(current.temperature_2m ?? 0),
    rainChance: Math.round(matchedRainChance ?? rainProbabilities[0] ?? 0),
    windSpeed: Math.round(current.wind_speed_10m ?? 0),
    weatherCode: current.weather_code ?? 0,
    cityName: cityName || "Local atual",
  };
};

const getCityNameByCoordinates = async (latitude, longitude) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WEATHER_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${OPEN_METEO_GEOCODING_URL}?latitude=${latitude}&longitude=${longitude}&language=pt&count=1`,
      { signal: controller.signal }
    );

    if (!response.ok) return null;
    const data = await response.json();
    const first = Array.isArray(data?.results) ? data.results[0] : null;
    if (!first) return null;

    const city = typeof first.name === "string" ? first.name.trim() : "";
    const admin = typeof first.admin1 === "string" ? first.admin1.trim() : "";

    if (city && admin) return `${city}, ${admin}`;
    if (city) return city;
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
};

export const getWeatherByCoordinates = async (latitude, longitude) => {
  if (latitude == null || longitude == null) {
    throw new Error("Latitude e longitude são obrigatórias para buscar o clima.");
  }

  const cacheKey = toWeatherCacheKey(latitude, longitude);
  const now = Date.now();
  const cached = weatherCache.get(cacheKey);

  if (cached && now - cached.cachedAt <= WEATHER_CACHE_TTL_MS) {
    return cached.data;
  }

  const blockedUntil = weatherBackoffUntil.get(cacheKey) || 0;
  if (blockedUntil > now) {
    if (cached?.data) {
      return cached.data;
    }
    throw new Error("Consulta de clima temporariamente em espera. Tente novamente em instantes.");
  }

  const query =
    `latitude=${latitude}&longitude=${longitude}` +
    "&current=temperature_2m,wind_speed_10m,weather_code" +
    "&hourly=precipitation_probability" +
    "&wind_speed_unit=kmh&timezone=auto";

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WEATHER_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(`${OPEN_METEO_BASE_URL}?${query}`, {
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Tempo de espera excedido ao consultar o clima.");
    }
    weatherBackoffUntil.set(cacheKey, Date.now() + WEATHER_BACKOFF_MS);
    if (cached?.data) return cached.data;
    throw new Error("Falha de rede ao consultar o clima.");
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    weatherBackoffUntil.set(cacheKey, Date.now() + WEATHER_BACKOFF_MS);
    if (cached?.data) return cached.data;
    throw new Error("Falha ao consultar a API de clima.");
  }

  try {
    const data = await response.json();
    const cityName = await getCityNameByCoordinates(latitude, longitude);
    const parsed = parseWeatherData(data, cityName);
    weatherCache.set(cacheKey, { data: parsed, cachedAt: Date.now() });
    weatherBackoffUntil.delete(cacheKey);
    return parsed;
  } catch {
    weatherBackoffUntil.set(cacheKey, Date.now() + WEATHER_BACKOFF_MS);
    if (cached?.data) return cached.data;
    throw new Error("Falha ao processar a resposta do clima.");
  }
};
