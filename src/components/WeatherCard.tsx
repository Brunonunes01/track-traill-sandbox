import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { getWeatherByCoordinates } from "../../services/weatherService";

type WeatherCardProps = {
  latitude: number;
  longitude: number;
};

type WeatherData = {
  temperature: number;
  rainChance: number;
  windSpeed: number;
  weatherCode: number;
  cityName?: string;
};

const getWeatherEmoji = (weatherCode?: number) => {
  if (weatherCode == null) return "☀️";
  if (weatherCode >= 95) return "⛈️";
  if ((weatherCode >= 51 && weatherCode <= 67) || (weatherCode >= 80 && weatherCode <= 82)) return "🌧️";
  if (weatherCode >= 71 && weatherCode <= 77) return "❄️";
  if (weatherCode >= 45 && weatherCode <= 48) return "🌫️";
  if (weatherCode >= 1 && weatherCode <= 3) return "☁️";
  return "☀️";
};

export default function WeatherCard({ latitude, longitude }: WeatherCardProps) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    // Busca os dados automaticamente quando as coordenadas mudam.
    const loadWeather = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getWeatherByCoordinates(latitude, longitude);
        if (isMounted) setWeather(data);
      } catch (err: any) {
        if (isMounted) {
          setError(err?.message || "Não foi possível carregar o clima agora.");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadWeather();

    return () => {
      isMounted = false;
    };
  }, [latitude, longitude]);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Clima hoje</Text>

      {loading && (
        <View style={styles.centerRow}>
          <ActivityIndicator size="small" color="#ffd700" />
          <Text style={styles.loadingText}>Carregando clima...</Text>
        </View>
      )}

      {!loading && error && (
        <Text style={styles.errorText}>
          Não foi possível atualizar o clima. {error}
        </Text>
      )}

      {!loading && !error && weather && (
        <>
          <Text style={styles.cityText}>Clima em {weather.cityName || "Local atual"}</Text>
          <Text style={styles.tempText}>
            {getWeatherEmoji(weather.weatherCode)} {weather.temperature}°C
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Chance de chuva:</Text>
            <Text style={styles.metaValue}>{weather.rainChance}%</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Vento:</Text>
            <Text style={styles.metaValue}>{weather.windSpeed} km/h</Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#1e1e1e",
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#333",
    padding: 16,
    marginBottom: 24,
  },
  title: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 10,
  },
  centerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  loadingText: {
    color: "#aaa",
    fontSize: 14,
  },
  tempText: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 10,
  },
  cityText: {
    color: "#9ca3af",
    fontSize: 13,
    marginBottom: 4,
    fontWeight: "600",
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#161616",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  metaLabel: {
    color: "#ccc",
    fontSize: 15,
  },
  metaValue: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  errorText: {
    color: "#f87171",
    fontSize: 14,
  },
});
