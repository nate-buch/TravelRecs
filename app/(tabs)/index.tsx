import MapboxGL from '@rnmapbox/maps';
import { StyleSheet, View } from 'react-native';

MapboxGL.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN!);

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <MapboxGL.MapView style={styles.map} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
});