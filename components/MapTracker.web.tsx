import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function MapTracker({ onCancel }: any) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Modo Web Detetado</Text>
      <Text style={styles.text}>
        O rastreio por GPS em tempo real requer hardware móvel e não funciona no navegador.
      </Text>
      <Text style={styles.text}>
        Por favor, utilize a app Expo Go no seu telemóvel para gravar as rotas!
      </Text>
      
      <TouchableOpacity onPress={onCancel} style={styles.cancelButton}>
        <Text style={styles.buttonText}>Voltar</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212', padding: 20 },
  title: { color: '#fff', fontSize: 22, fontWeight: 'bold', marginBottom: 15 },
  text: { color: '#aaa', textAlign: 'center', marginBottom: 10, fontSize: 16 },
  cancelButton: { backgroundColor: '#ef4444', padding: 15, borderRadius: 12, marginTop: 30, width: '80%', alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});