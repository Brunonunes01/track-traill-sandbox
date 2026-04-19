import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import WeatherCard from '../components/WeatherCard';

export default function ActivityViewScreen() {
    const route = useRoute();
    const navigation = useNavigation();
    const { atividade }: any = route.params;
    const hasRoute = atividade?.rota && atividade.rota.length > 0;

    return (
        <View style={styles.container}>
            <View style={styles.warningBox}>
                <Ionicons name="map-outline" size={60} color="#fff" />
                <Text style={styles.warningText}>
                    O mapa com a rota percorrida só está disponível para visualização na versão Mobile (iOS/Android).
                </Text>
            </View>
            
            <View style={styles.details}>
                <Text style={styles.title}>{atividade.tipo} em {atividade.cidade}</Text>
                <Text style={styles.stat}>Distância: {atividade.distancia} km</Text>
                <Text style={styles.stat}>Duração: {atividade.duracao} min</Text>
            </View>

            {hasRoute && (
                <View style={styles.weatherContainer}>
                    <WeatherCard
                        latitude={atividade.rota[0].latitude}
                        longitude={atividade.rota[0].longitude}
                    />
                </View>
            )}

            <TouchableOpacity style={styles.btn} onPress={() => navigation.goBack()}>
                <Text style={styles.btnText}>Voltar</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#121212', padding: 20, justifyContent: 'center', alignItems: 'center' },
    warningBox: { backgroundColor: 'rgba(255,255,255,0.1)', padding: 30, borderRadius: 20, alignItems: 'center', marginBottom: 30 },
    warningText: { color: '#fff', textAlign: 'center', marginTop: 15, fontSize: 16 },
    details: { alignItems: 'center', marginBottom: 30 },
    weatherContainer: { width: '100%', marginBottom: 20 },
    title: { color: '#2563eb', fontSize: 24, fontWeight: 'bold', marginBottom: 10 },
    stat: { color: '#ccc', fontSize: 18 },
    btn: { backgroundColor: '#444', padding: 15, borderRadius: 10, width: '100%', alignItems: 'center' },
    btnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});
