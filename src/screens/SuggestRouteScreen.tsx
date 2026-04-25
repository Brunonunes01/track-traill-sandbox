import { Ionicons } from '@expo/vector-icons';
import { useIsFocused, useNavigation } from '@react-navigation/native'; // <-- MÁGICA
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { onValue, push, ref, set } from 'firebase/database';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import MapView, { MapPressEvent, Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth, database } from '../../services/connectionFirebase';
import {
  fetchGoogleDirections,
  fetchGraphHopperDirections,
  fetchRoundTripByDistance,
  GraphHopperProfile,
  RoundTripResult,
  travelModeFromActivity
} from "../services/directionsService";
import { FALLBACK_REGION, toCoordinate, toCoordinateArray } from '../utils/geo';

type Coordinate = { latitude: number; longitude: number; };
export default function SuggestRouteScreen() {
  const isFocused = useIsFocused(); // Destrói o mapa quando não está na tela

  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const dragRecalcTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [startPoint, setStartPoint] = useState<Coordinate | null>(null);
  const [endPoint, setEndPoint] = useState<Coordinate | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<Coordinate[]>([]);
  const [routeAlternatives, setRouteAlternatives] = useState<RoundTripResult[]>([]);
  const [selectedAlternativeIndex, setSelectedAlternativeIndex] = useState(0);
  const [isCalculating, setIsCalculating] = useState(false);
  const [rotasOficiais, setRotasOficiais] = useState<any[]>([]);
  
  const [nomeRota, setNomeRota] = useState('');
  const [descricao, setDescricao] = useState('');
  const [tipoRota, setTipoRota] = useState('Ciclismo');
  const [provedorRota, setProvedorRota] = useState<'google' | 'bike' | 'hike'>('google');
  const [dificuldade, setDificuldade] = useState('Média');
  const [terreno, setTerreno] = useState('Misto');
  const [distanciaCalculada, setDistanciaCalculada] = useState<string | null>(null);
  const [tempoCalculado, setTempoCalculado] = useState<string | null>(null);
  const [unpavedRatio, setUnpavedRatio] = useState<number | null>(null);
  const [tempoEstimadoManual, setTempoEstimadoManual] = useState('');
  const [duracaoSegundos, setDuracaoSegundos] = useState<number | null>(null);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [visibility, setVisibility] = useState<"public" | "friends" | "private">("public");
  const [distanceGoalKm, setDistanceGoalKm] = useState("70");
  const [isGoalMode, setIsGoalMode] = useState(false);

  const categorias = ['Ciclismo', 'Corrida', 'Caminhada'];
  const dificuldades = ['Fácil', 'Média', 'Difícil', 'Extrema'];
  const terrenos = ['Asfalto', 'Terra', 'Trilha técnica', 'Misto'];
  const selectedGoalRoute = routeAlternatives[selectedAlternativeIndex] || null;
  const activeGoalCoordinates = selectedGoalRoute
    ? toCoordinateArray(selectedGoalRoute.coordinates)
    : routeCoordinates;

  useEffect(() => {
    let mounted = true;
    let cameraTimeout: ReturnType<typeof setTimeout> | null = null;

    if (isFocused) {
      (async () => {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') return;
          const currentLocation = await Location.getCurrentPositionAsync({});
          if (!mounted) return;
          const safeCurrent = toCoordinate(currentLocation.coords);
          if (!safeCurrent) return;
          cameraTimeout = setTimeout(() => {
            mapRef.current?.animateCamera({ center: safeCurrent, zoom: 15 });
          }, 300);
        } catch (error: any) {
          console.warn("[map] SuggestRoute initial location failed:", error?.message || String(error));
        }
      })();
    }

    return () => {
      mounted = false;
      if (cameraTimeout) {
        clearTimeout(cameraTimeout);
      }
    };
  }, [isFocused]);

  useEffect(() => {
    const oficiaisRef = ref(database, 'rotas_oficiais');
    const unsubscribe = onValue(
      oficiaisRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          const listaRotas = Object.keys(data).map((key) => ({
            id: key,
            ...data[key],
            rotaCompleta: toCoordinateArray(data[key]?.rotaCompleta),
          }));
          setRotasOficiais(listaRotas);
        } else {
          setRotasOficiais([]);
        }
      },
      (error) => {
        console.warn("[map] SuggestRoute official routes listener failed:", error?.message || String(error));
      }
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    return () => {
      if (dragRecalcTimeoutRef.current) {
        clearTimeout(dragRecalcTimeoutRef.current);
      }
    };
  }, []);

  const calcularRotaAcompanhandoEstrada = async (start: Coordinate, end: Coordinate) => {
    if (isCalculating) return; // Evita múltiplas chamadas simultâneas
    setIsCalculating(true);
    try {
      let result;
      // ... (resto da lógica de escolha de provedor)
      
      if (provedorRota === 'bike') {
        result = await fetchGraphHopperDirections({
          origin: start,
          destination: end,
          profile: 'mtb',
        });
      } else if (provedorRota === 'hike') {
        // Usamos 'foot' porque a chave gratuita suporta apenas [car, bike, foot]
        // No GraphHopper, 'foot' é o perfil que segue trilhas de pedestres.
        result = await fetchGraphHopperDirections({
          origin: start,
          destination: end,
          profile: 'foot',
        });
      } else {
        result = await fetchGoogleDirections({
          origin: start,
          destination: end,
          mode: travelModeFromActivity(tipoRota),
        });
      }

      setRouteCoordinates(toCoordinateArray(result.coordinates));
      setDistanciaCalculada(result.distanceText);
      setTempoCalculado(result.durationText);
      setDuracaoSegundos(result.durationSeconds);
      setUnpavedRatio(result.unpavedRatio ?? null);
      setRouteAlternatives([]);
      setSelectedAlternativeIndex(0);
    } catch (error: any) {
      console.error("[RouteCalc] Erro detalhado:", error.message || error);
      setRouteCoordinates([]);
      setDistanciaCalculada(null);
      setTempoCalculado(null);
      setDuracaoSegundos(null);
      setUnpavedRatio(null);
      
      const isApiKeyError = error.message?.includes("API key");
      Alert.alert(
        "Falha ao calcular rota", 
        isApiKeyError 
          ? "Erro na Chave da API. Verifique o seu arquivo .env" 
          : error.message || "Tente selecionar pontos diferentes no mapa."
      );
    } finally {
      setIsCalculating(false);
    }
  };

  useEffect(() => {
    if (isGoalMode || !startPoint || !endPoint) return;
    calcularRotaAcompanhandoEstrada(startPoint, endPoint);
  }, [tipoRota, provedorRota, isGoalMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const getProfileFromProvider = (): GraphHopperProfile => {
    if (provedorRota === "hike") return "foot";
    if (provedorRota === "google") return "car";
    return "mtb";
  };

  const handleGenerateGoalRoute = async (origin: Coordinate) => {
    const goal = Number(String(distanceGoalKm).replace(",", "."));
    if (!Number.isFinite(goal) || goal < 5) {
      Alert.alert("Meta inválida", "Informe uma meta em km (mínimo 5 km).");
      return;
    }

    setIsCalculating(true);
    try {
      const shouldUseGoogleEngine = provedorRota === "google" || terreno === "Asfalto";
      const result = await fetchRoundTripByDistance({
        origin,
        targetDistanceKm: goal,
        profile: getProfileFromProvider(),
        engine: shouldUseGoogleEngine ? "google" : "graphhopper",
        alternatives: 3,
      });

      setRouteCoordinates(toCoordinateArray(result.best.coordinates));
      setRouteAlternatives(result.alternatives);
      setSelectedAlternativeIndex(0);
      setStartPoint(origin);
      setEndPoint(origin);
      setDistanciaCalculada(result.best.distanceText);
      setTempoCalculado(result.best.durationText);
      setDuracaoSegundos(result.best.durationSeconds);
      setUnpavedRatio(result.best.unpavedRatio ?? null);
    } catch (error: any) {
      console.error("[RoundTrip] Erro ao gerar rota por meta:", error?.message || String(error));
      const message = String(error?.message || "");
      const isRateLimit =
        message.toLowerCase().includes("limite de requisições") ||
        message.toLowerCase().includes("minutely api limit");
      Alert.alert(
        isRateLimit ? "Limite temporário da API" : "Falha ao gerar rota",
        isRateLimit
          ? "Muitas buscas em sequência. Aguarde cerca de 1 minuto e toque em Gerar novamente."
          : message || "Tente novamente com outra meta."
      );
    } finally {
      setIsCalculating(false);
    }
  };

  const handleMapPress = (e: MapPressEvent) => {
    const coords = toCoordinate(e.nativeEvent.coordinate);
    if (!coords) {
      console.warn("[map] SuggestRoute ignored invalid coordinate from map press");
      return;
    }
    if (isGoalMode) {
      setStartPoint(coords);
      setEndPoint(coords);
      setRouteCoordinates([]);
      setRouteAlternatives([]);
      setSelectedAlternativeIndex(0);
      setDistanciaCalculada(null);
      setTempoCalculado(null);
      setDuracaoSegundos(null);
      setUnpavedRatio(null);
      handleGenerateGoalRoute(coords);
      return;
    }

    if (!startPoint) {
      setStartPoint(coords);
    } else if (!endPoint) {
      setEndPoint(coords);
      calcularRotaAcompanhandoEstrada(startPoint, coords);
    } else {
      setEndPoint(coords);
      calcularRotaAcompanhandoEstrada(startPoint, coords);
    }
  };

  const scheduleDragRouteRecalc = (nextEndPoint: Coordinate, immediate = false) => {
    if (!startPoint) return;
    if (dragRecalcTimeoutRef.current) {
      clearTimeout(dragRecalcTimeoutRef.current);
      dragRecalcTimeoutRef.current = null;
    }

    if (immediate) {
      calcularRotaAcompanhandoEstrada(startPoint, nextEndPoint);
      return;
    }

    dragRecalcTimeoutRef.current = setTimeout(() => {
      calcularRotaAcompanhandoEstrada(startPoint, nextEndPoint);
    }, 800);
  };

  const handleClearPoints = () => {
    setStartPoint(null);
    setEndPoint(null);
    setRouteCoordinates([]);
    setDistanciaCalculada(null);
    setTempoCalculado(null);
    setDuracaoSegundos(null);
    setUnpavedRatio(null);
    setRouteAlternatives([]);
    setSelectedAlternativeIndex(0);
    setIsFormVisible(false);
  };

  const selectAlternative = (index: number) => {
    const selected = routeAlternatives[index];
    if (!selected) return;
    setSelectedAlternativeIndex(index);
    setRouteCoordinates(toCoordinateArray(selected.coordinates));
    setDistanciaCalculada(selected.distanceText);
    setTempoCalculado(selected.durationText);
    setDuracaoSegundos(selected.durationSeconds);
    setUnpavedRatio(selected.unpavedRatio ?? null);
    setEndPoint(startPoint);
  };

  const handleEnviarSugestao = async () => {
    if (!startPoint || (!endPoint && !isGoalMode)) { Alert.alert('Atenção', 'Marque Início e Fim no mapa.'); return; }
    if (routeCoordinates.length < 2) { Alert.alert('Atenção', 'Gere a rota antes de salvar.'); return; }
    if (!nomeRota) { Alert.alert('Atenção', 'Preencha o nome da rota.'); return; }
    const user = auth.currentUser;
    if (!user) { Alert.alert('Erro', 'Você precisa estar logado.'); return; }

    try {
      const payload = {
        nome: nomeRota,
        titulo: nomeRota,
        tipo: tipoRota,
        dificuldade,
        distancia: distanciaCalculada || '0 km',
        tempoEstimado: tempoEstimadoManual.trim() || tempoCalculado || null,
        duracaoSegundos: duracaoSegundos || null,
        terreno,
        descricao: descricao || 'Sem descrição.',
        startPoint,
        endPoint: endPoint || startPoint,
        rotaCompleta: routeCoordinates,
        sugeridoPor: user.uid,
        emailAutor: user.email,
        criadoEm: new Date().toISOString(),
        visibility,
      };

      if (visibility === "public") {
        const pendentesRef = ref(database, 'rotas_pendentes');
        await set(push(pendentesRef), {
          ...payload,
          status: 'pendente',
        });
        Alert.alert('Sucesso!', 'A sua rota foi enviada para análise pública.', [{ text: 'Voltar', onPress: () => navigation.goBack() }]);
      } else {
        const userRoutesRef = ref(database, `users/${user.uid}/rotas_tracadas`);
        await set(push(userRoutesRef), {
          ...payload,
          userId: user.uid,
          userEmail: user.email || null,
          status: visibility === "private" ? "privada" : "friends_only",
        });
        Alert.alert(
          'Sucesso!',
          visibility === "private"
            ? 'A sua rota foi salva somente para você.'
            : 'A sua rota foi salva com visibilidade para amigos.',
          [{ text: 'Voltar', onPress: () => navigation.goBack() }]
        );
      }
    } catch (error: any) {
      Alert.alert('Erro', error.message);
    }
  };

  return (
    <View style={styles.container}>
      {isFocused && (
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_DEFAULT}
          initialRegion={FALLBACK_REGION}
          showsUserLocation={true}
          showsMyLocationButton={false}
          onPress={handleMapPress}
        >
            {rotasOficiais.map(rota => rota.rotaCompleta && (
                <Polyline key={`oficial-${rota.id}`} coordinates={rota.rotaCompleta} strokeColor="rgba(37, 99, 235, 0.5)" strokeWidth={5} />
            ))}
            {startPoint && (
              <Marker coordinate={startPoint} title={isGoalMode ? "Início/Fim" : "Início"}>
                <Ionicons name={isGoalMode ? "refresh-circle" : "location"} size={40} color={isGoalMode ? "#22d3ee" : "#22c55e"} />
              </Marker>
            )}
            {endPoint && !isGoalMode && (
              <Marker
                coordinate={endPoint}
                title="Fim"
                draggable
                onDrag={(event) => {
                  const coords = toCoordinate(event.nativeEvent.coordinate);
                  if (!coords) return;
                  setEndPoint(coords);
                  scheduleDragRouteRecalc(coords, false);
                }}
                onDragEnd={(event) => {
                  const coords = toCoordinate(event.nativeEvent.coordinate);
                  if (!coords) return;
                  setEndPoint(coords);
                  scheduleDragRouteRecalc(coords, true);
                }}
              >
                <Ionicons name="flag" size={40} color="#ef4444" />
              </Marker>
            )}
            {isGoalMode ? (
              activeGoalCoordinates.length > 0 ? (
                <Polyline coordinates={activeGoalCoordinates} strokeColor="#ffd700" strokeWidth={5} />
              ) : null
            ) : routeCoordinates.length > 0 ? (
              <Polyline coordinates={routeCoordinates} strokeColor="#ffd700" strokeWidth={5} />
            ) : null}
        </MapView>
      )}

      <View style={styles.topBar}>
        <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()}><Ionicons name="arrow-back" size={28} color="#fff" /></TouchableOpacity>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {startPoint && endPoint ? (
            <TouchableOpacity style={styles.iconButton} onPress={() => setIsFormVisible((current) => !current)}>
              <Ionicons name={isFormVisible ? "eye-off-outline" : "eye-outline"} size={24} color="#fff" />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.iconButton} onPress={handleClearPoints}><Ionicons name="trash-outline" size={28} color="#fff" /></TouchableOpacity>
        </View>
      </View>

      <View style={styles.instructionBox}>
        {isCalculating ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <ActivityIndicator size="small" color="#000" /><Text style={styles.instructionText}>Calculando rota...</Text>
          </View>
        ) : (
          <Text style={styles.instructionText}>
            {isGoalMode
              ? !startPoint
                ? "1. Marque o INÍCIO para gerar rota circular por meta de km."
                : "2. Ajuste a meta e gere novamente para novas opções."
              : !startPoint
              ? "1. Marque o INÍCIO (cálculo automático de rota real)"
              : !endPoint
              ? "2. Marque o FIM para calcular por ruas/trilhas"
              : "3. Toque no mapa ou arraste o FIM para ajustar a rota em tempo real."}
          </Text>
        )}
      </View>

      <View style={styles.goalModeBox}>
        <TouchableOpacity
          style={[styles.goalModeBtn, isGoalMode ? styles.goalModeBtnActive : null]}
          onPress={() => {
            setIsGoalMode((current) => !current);
            handleClearPoints();
          }}
        >
          <Ionicons name="repeat" size={18} color={isGoalMode ? "#000" : "#fff"} />
          <Text style={[styles.goalModeBtnText, isGoalMode ? styles.goalModeBtnTextActive : null]}>
            Meta ida+volta
          </Text>
        </TouchableOpacity>
        {isGoalMode ? (
          <View style={styles.goalInputWrap}>
            <TextInput
              style={styles.goalInput}
              value={distanceGoalKm}
              onChangeText={setDistanceGoalKm}
              keyboardType="numeric"
              placeholder="70"
              placeholderTextColor="#8a8a8a"
            />
            <Text style={styles.goalInputUnit}>km</Text>
            <TouchableOpacity
              style={[styles.goalGenerateBtn, (!startPoint || isCalculating) ? styles.submitBtnDisabled : null]}
              onPress={() => startPoint && handleGenerateGoalRoute(startPoint)}
              disabled={!startPoint || isCalculating}
            >
              <Text style={styles.goalGenerateBtnText}>Gerar</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      <View style={[styles.providerFloatingBar, isGoalMode ? styles.providerFloatingBarGoal : null]}>
        <TouchableOpacity 
          style={[styles.providerBtn, provedorRota === 'google' && styles.providerBtnActive]} 
          onPress={() => setProvedorRota('google')}
        >
          <Ionicons name="car" size={18} color={provedorRota === 'google' ? "#000" : "#fff"} />
          <Text style={[styles.providerBtnText, provedorRota === 'google' && styles.providerBtnTextActive]}>Asfalto</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.providerBtn, provedorRota === 'bike' && styles.providerBtnActive]} 
          onPress={() => setProvedorRota('bike')}
        >
          <Ionicons name="bicycle" size={18} color={provedorRota === 'bike' ? "#000" : "#fff"} />
          <Text style={[styles.providerBtnText, provedorRota === 'bike' && styles.providerBtnTextActive]}>Trilha Bike</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.providerBtn, provedorRota === 'hike' && styles.providerBtnActive]} 
          onPress={() => setProvedorRota('hike')}
        >
          <Ionicons name="footsteps" size={18} color={provedorRota === 'hike' ? "#000" : "#fff"} />
          <Text style={[styles.providerBtnText, provedorRota === 'hike' && styles.providerBtnTextActive]}>Trilha Hike</Text>
        </TouchableOpacity>
      </View>

      {isGoalMode && routeAlternatives.length > 0 ? (
        <View style={styles.alternativesBox}>
          <Text style={styles.alternativesTitle}>Rotas encontradas. Escolha 1 opção:</Text>
          <View style={styles.alternativesRow}>
            {routeAlternatives.map((item, index) => (
              <TouchableOpacity
                key={`option-${index}`}
                style={[styles.altChip, index === selectedAlternativeIndex ? styles.altChipActive : null]}
                onPress={() => selectAlternative(index)}
              >
                <Text style={[styles.altChipText, index === selectedAlternativeIndex ? styles.altChipTextActive : null]}>
                  {`${(item.distanceMeters / 1000).toFixed(1)}km`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}

      {(isGoalMode ? routeCoordinates.length > 1 : startPoint && endPoint) && !isFormVisible ? (
        <View style={[styles.confirmBox, { bottom: Math.max(insets.bottom + 26, 40) }]}>
          <TouchableOpacity style={styles.confirmBtn} onPress={() => setIsFormVisible(true)}>
            <Ionicons name="checkmark-circle-outline" size={20} color="#000" />
            <Text style={styles.confirmBtnText}>Confirmar pontos e abrir cadastro</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {isFormVisible ? (
        <View style={styles.bottomSheet}>
          <ImageBackground source={require('../../assets/images/Azulao.png')} style={styles.sheetBg} imageStyle={{ borderTopLeftRadius: 30, borderTopRightRadius: 30 }}>
            <LinearGradient colors={['rgba(0,0,0,0.85)', 'rgba(0,0,0,0.98)']} style={styles.sheetOverlay}>
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom + 72, 96) }]}
                >
                  <View style={styles.dragIndicator} />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                      <Text style={styles.sheetTitle}>Detalhes da Rota</Text>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        {distanciaCalculada ? (
                          <View style={styles.distBadge}>
                            <Ionicons name="analytics" size={16} color="#000" />
                            <Text style={styles.distText}>{distanciaCalculada}</Text>
                          </View>
                        ) : null}
                        {tempoCalculado ? (
                          <View style={styles.distBadge}>
                            <Ionicons name="time-outline" size={16} color="#000" />
                            <Text style={styles.distText}>{tempoCalculado}</Text>
                          </View>
                        ) : null}
                        {typeof unpavedRatio === "number" ? (
                          <View style={styles.distBadge}>
                            <Ionicons name="leaf-outline" size={16} color="#000" />
                            <Text style={styles.distText}>{`${Math.round(unpavedRatio * 100)}% terra`}</Text>
                          </View>
                        ) : null}
                      </View>
                  </View>
                  
                  <Text style={styles.label}>Nome da Trilha</Text>
                  <TextInput style={styles.input} placeholder="Ex: Trilha da Pedra Grande" placeholderTextColor="#666" value={nomeRota} onChangeText={setNomeRota} />

                  <Text style={styles.label}>Desporto Principal</Text>
                  <View style={styles.chipsContainer}>
                      {categorias.map(cat => (
                          <TouchableOpacity key={cat} style={[styles.chip, tipoRota === cat && styles.chipActive]} onPress={() => setTipoRota(cat)}>
                              <Text style={[styles.chipText, tipoRota === cat && styles.chipTextActive]}>{cat}</Text>
                          </TouchableOpacity>
                      ))}
                  </View>

                  <Text style={styles.label}>Dificuldade</Text>
                  <View style={styles.chipsContainer}>
                      {dificuldades.map(dif => (
                          <TouchableOpacity key={dif} style={[styles.chip, dificuldade === dif && styles.chipActive]} onPress={() => setDificuldade(dif)}>
                              <Text style={[styles.chipText, dificuldade === dif && styles.chipTextActive]}>{dif}</Text>
                          </TouchableOpacity>
                      ))}
                  </View>

                  <Text style={styles.label}>Terreno</Text>
                  <View style={styles.chipsContainer}>
                      {terrenos.map(item => (
                          <TouchableOpacity key={item} style={[styles.chip, terreno === item && styles.chipActive]} onPress={() => setTerreno(item)}>
                              <Text style={[styles.chipText, terreno === item && styles.chipTextActive]}>{item}</Text>
                          </TouchableOpacity>
                      ))}
                  </View>

                  <Text style={styles.label}>Tempo estimado (opcional)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder={tempoCalculado ? `Sugerido: ${tempoCalculado}` : "Ex: 1h 20min"}
                    placeholderTextColor="#666"
                  value={tempoEstimadoManual}
                  onChangeText={setTempoEstimadoManual}
                />

                <Text style={styles.label}>Visibilidade da rota</Text>
                <View style={styles.chipsContainer}>
                  {[
                    { value: "public", label: "App inteiro" },
                    { value: "friends", label: "Somente amigos" },
                    { value: "private", label: "Só para mim" },
                  ].map((item) => (
                    <TouchableOpacity
                      key={item.value}
                      style={[styles.chip, visibility === item.value ? styles.chipActive : null]}
                      onPress={() => setVisibility(item.value as "public" | "friends" | "private")}
                    >
                      <Text style={[styles.chipText, visibility === item.value ? styles.chipTextActive : null]}>
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                  <Text style={styles.label}>Dicas</Text>
                  <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]} placeholder="Tem muita subida?" placeholderTextColor="#666" multiline value={descricao} onChangeText={setDescricao} />

                  <TouchableOpacity
                    style={[styles.submitBtn, (!startPoint || routeCoordinates.length < 2 || isCalculating) && styles.submitBtnDisabled]}
                    onPress={handleEnviarSugestao}
                    disabled={isCalculating}
                  >
                    <Text style={styles.submitBtnText}>
                      {visibility === "public" ? "ENVIAR PARA ANÁLISE" : "SALVAR ROTA"}
                    </Text>
                    <Ionicons name="paper-plane-outline" size={20} color="#000" style={{ marginLeft: 8 }} />
                  </TouchableOpacity>
                </ScrollView>
              </KeyboardAvoidingView>
            </LinearGradient>
          </ImageBackground>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  map: { ...StyleSheet.absoluteFillObject },
  topBar: { position: 'absolute', top: 50, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between' },
  iconButton: { backgroundColor: 'rgba(0,0,0,0.6)', padding: 10, borderRadius: 50, borderWidth: 1, borderColor: '#333' },
  instructionBox: { position: 'absolute', top: 110, alignSelf: 'center', backgroundColor: '#ffd700', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 20, elevation: 5 },
  instructionText: { color: '#000', fontWeight: 'bold', fontSize: 14 },
  goalModeBox: {
    position: 'absolute',
    top: 228,
    left: 16,
    right: 16,
    alignItems: 'center',
    gap: 8,
  },
  goalModeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderColor: '#333',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 6,
  },
  goalModeBtnActive: {
    backgroundColor: '#ffd700',
    borderColor: '#ffd700',
  },
  goalModeBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  goalModeBtnTextActive: {
    color: '#000',
  },
  goalInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  goalInput: {
    backgroundColor: '#1A1A1A',
    color: '#fff',
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    minWidth: 70,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  goalInputUnit: {
    color: '#fff',
    fontWeight: 'bold',
  },
  goalGenerateBtn: {
    backgroundColor: '#ffd700',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  goalGenerateBtnText: {
    color: '#000',
    fontWeight: 'bold',
  },
  providerFloatingBar: {
    position: 'absolute',
    top: 170,
    alignSelf: 'center',
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: 25,
    padding: 4,
    borderWidth: 1,
    borderColor: '#333',
    elevation: 6,
    gap: 4
  },
  providerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6
  },
  providerBtnActive: {
    backgroundColor: '#ffd700',
  },
  providerBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13
  },
  providerBtnTextActive: {
    color: '#000',
  },
  providerFloatingBarGoal: {
    top: 340,
  },
  alternativesBox: {
    position: 'absolute',
    top: 410,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.78)',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 220,
  },
  alternativesTitle: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
    marginBottom: 6,
  },
  alternativesRow: {
    flexDirection: 'row',
    gap: 8,
  },
  altChip: {
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#444',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  altChipActive: {
    backgroundColor: '#ffd700',
    borderColor: '#ffd700',
  },
  altChipText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  altChipTextActive: {
    color: '#000',
  },
  confirmBox: { position: 'absolute', bottom: 24, left: 16, right: 16 },
  confirmBtn: {
    backgroundColor: '#ffd700',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    elevation: 8,
  },
  confirmBtnText: { color: '#000', fontWeight: 'bold', fontSize: 15 },
  bottomSheet: { position: 'absolute', bottom: 0, width: '100%', height: '55%', borderTopLeftRadius: 30, borderTopRightRadius: 30, elevation: 20 },
  sheetBg: { flex: 1 },
  sheetOverlay: { flex: 1, borderTopLeftRadius: 30, borderTopRightRadius: 30 },
  scrollContent: { padding: 25, paddingBottom: 40 },
  dragIndicator: { width: 40, height: 5, backgroundColor: '#555', borderRadius: 5, alignSelf: 'center', marginBottom: 15 },
  sheetTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  distBadge: { backgroundColor: '#ffd700', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15, gap: 5 },
  distText: { color: '#000', fontWeight: 'bold', fontSize: 14 },
  label: { color: '#bbb', fontSize: 13, marginBottom: 8, marginLeft: 5, marginTop: 10 },
  input: { backgroundColor: '#1A1A1A', color: '#fff', borderRadius: 12, padding: 15, fontSize: 16, marginBottom: 10, borderWidth: 1, borderColor: '#444' },
  chipsContainer: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  chip: { flex: 1, backgroundColor: '#1A1A1A', paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#444', flexDirection: 'row', gap: 6 },
  chipActive: { backgroundColor: '#ffd700', borderColor: '#ffd700' },
  chipText: { color: '#aaa', fontWeight: 'bold', fontSize: 13 },
  chipTextActive: { color: '#000' },
  submitBtn: { backgroundColor: '#ffd700', flexDirection: 'row', borderRadius: 15, paddingVertical: 16, justifyContent: 'center', alignItems: 'center', marginTop: 20 },
  submitBtnDisabled: { backgroundColor: '#555' },
  submitBtnText: { color: '#000', fontSize: 16, fontWeight: 'bold' },
});
