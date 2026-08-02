import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Keyboard,
} from 'react-native';
// react-native'in SafeAreaView'ı Android'de no-op — daima bu paketten al.
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { PlacePrediction, SearchStackParamList } from '../types';
import { Colors, Radius, Spacing, Type } from '../constants/theme';
import { SkeletonSearchRow } from '../components/ui/SkeletonLoader';
import EmptyState from '../components/ui/EmptyState';
import Chip from '../components/ui/Chip';
import Icon from '../components/ui/Icon';
import { useLocation } from '../hooks/useLocation';

const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Google Places main_text bazen şehir / ülke adı ya da özel karakterler içerir.
 * Bu fonksiyon metni başlık formuna getirir ve parantez içi ek bilgileri temizler.
 */
function cleanPlaceName(raw: string): string {
  return raw
    .replace(/\s*\(.*?\)/g, '')   // parantez içi içerik kaldır
    .replace(/["'`]/g, '')         // tırnak artefaktları kaldır
    .trim();
}

/**
 * Places türlerini (ör: "fast_food", "cafe") insan dostu Türkçe etikete çevirir.
 */
const CUISINE_TR: Record<string, string> = {
  restaurant: 'Restoran',
  cafe: 'Kafe',
  bar: 'Bar',
  bakery: 'Fırın',
  meal_takeaway: 'Paket Servis',
  meal_delivery: 'Delivery',
  food: 'Yemek',
  fast_food: 'Fast Food',
  pizza: 'Pizza',
  night_club: 'Gece Kulübü',
  liquor_store: 'İçki Mağazası',
};

function formatCategory(types: string[]): string {
  for (const t of types) {
    if (CUISINE_TR[t]) return CUISINE_TR[t];
    if (!['establishment', 'point_of_interest', 'food', 'premise'].includes(t)) {
      // snake_case → Title Case
      return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }
  return 'Mekan';
}

export default function SearchScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<SearchStackParamList>>();
  const { location } = useLocation();
  const [query, setQuery] = useState('');
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPredictions = async (text: string) => {
    if (!text || text.length < 2) {
      setPredictions([]);
      return;
    }
    setLoading(true);
    try {
      // Konum bias: kullanıcının 50 km çevresini önceliklendir
      const biasPart = location
        ? `&locationbias=circle:50000@${location.latitude},${location.longitude}`
        : '';

      const url =
        `https://maps.googleapis.com/maps/api/place/autocomplete/json` +
        `?input=${encodeURIComponent(text)}` +
        `&types=restaurant|food|cafe|bar` +
        `&language=tr` +
        biasPart +
        `&key=${GOOGLE_API_KEY}`;

      const res = await fetch(url);
      const json = await res.json();
      if (json.predictions) setPredictions(json.predictions);
    } catch (e) {
      console.error('Places autocomplete error:', e);
    }
    setLoading(false);
  };

  const handleTextChange = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchPredictions(text), 400);
  };

  const handleSelect = (prediction: PlacePrediction) => {
    Keyboard.dismiss();
    const cleanName = cleanPlaceName(prediction.structured_formatting.main_text);
    setQuery(cleanName);
    setPredictions([]);
    // Kendi stack'imizdeki rotaya push ediyoruz; geri tuşu arama sonuçlarına döner.
    navigation.navigate('RestaurantDetail', {
      placeId: prediction.place_id,
      placeName: cleanName,
    });
  };

  const handleClear = () => {
    setQuery('');
    setPredictions([]);
  };

  // ── Skeleton rows while fetching ───────────────────────────────────────────
  const renderSkeletonRows = () => (
    <View style={{ paddingHorizontal: Spacing.lg, paddingTop: Spacing.xs }}>
      {[1, 2, 3, 4].map((i) => (
        <SkeletonSearchRow key={i} style={{ marginBottom: Spacing.sm }} />
      ))}
    </View>
  );

  // ── Determine body content ─────────────────────────────────────────────────
  const renderBody = () => {
    if (loading && predictions.length === 0) {
      return renderSkeletonRows();
    }

    if (predictions.length > 0) {
      return (
        <FlatList
          data={predictions}
          keyExtractor={(item) => item.place_id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.resultsList}
          renderItem={({ item, index }) => {
            const cleanName = cleanPlaceName(item.structured_formatting.main_text);
            // types alanı autocomplete response'unda da gelir
            const types: string[] = (item as any).types ?? [];
            const category = formatCategory(types);

            return (
              <TouchableOpacity
                style={[
                  styles.resultItem,
                  index < predictions.length - 1 && styles.resultItemBorder,
                ]}
                onPress={() => handleSelect(item)}
                activeOpacity={0.7}
              >
                <View style={styles.resultIcon}>
                  <Icon name="location" size={18} color={Colors.brandStrong} />
                </View>
                <View style={styles.resultBody}>
                  <Text style={styles.resultMain} numberOfLines={1}>
                    {cleanName}
                  </Text>
                  <View style={styles.resultMetaRow}>
                    {types.length > 0 && <Chip label={category} variant="brand" />}
                    <Text style={styles.resultSub} numberOfLines={1}>
                      {item.structured_formatting.secondary_text}
                    </Text>
                  </View>
                </View>
                <Icon name="forward" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            );
          }}
        />
      );
    }

    if (query.length === 0) {
      return (
        <View style={styles.emptyWrapper}>
          <EmptyState
            icon="search"
            title="Bir mekan ara"
            subtitle="Restoran, kafe veya bar arayıp puan verebilirsin."
          />
        </View>
      );
    }

    if (!loading && query.length > 1) {
      return (
        <View style={styles.emptyWrapper}>
          <EmptyState
            icon="restaurant"
            title="Sonuç bulunamadı"
            subtitle={`"${query}" için bir sonuç yok.`}
          />
        </View>
      );
    }

    return null;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Mekan Ara</Text>
        <Text style={styles.headerSub}>Restoran, kafe, bar...</Text>
      </View>

      {/* ── Search bar ── */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Icon name="search" size={18} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Mekan adı veya adres..."
            placeholderTextColor={Colors.textMuted}
            value={query}
            onChangeText={handleTextChange}
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity
              onPress={handleClear}
              style={styles.clearButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name="close" size={13} color={Colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Body ── */}
      {renderBody()}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.canvas,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.xs,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  headerTitle: {
    ...Type.title,
    color: Colors.textPrimary,
  },
  headerSub: {
    ...Type.caption,
    color: Colors.textSecondary,
    marginTop: 2,
    marginBottom: Spacing.xs,
  },

  // Midas kararı: arama çubuğu bloğunun gölgesi kaldırıldı, ince kenarlık yeter.
  searchContainer: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.canvasAlt,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  searchInput: {
    ...Type.body,
    flex: 1,
    color: Colors.textPrimary,
    // Android TextInput'un varsayılan iç boşluğu satırı şişiriyor.
    padding: 0,
  },
  clearButton: {
    width: 22,
    height: 22,
    borderRadius: Radius.full,
    backgroundColor: Colors.borderStrong,
    justifyContent: 'center',
    alignItems: 'center',
  },

  resultsList: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing['2xl'],
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
  },
  resultItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  resultIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: Colors.brandSubtle,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultBody: { flex: 1, gap: Spacing.xxs },
  resultMain: {
    ...Type.bodyStrong,
    color: Colors.textPrimary,
  },
  resultMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xxs,
    flexWrap: 'wrap',
  },
  resultSub: {
    ...Type.caption,
    color: Colors.textMuted,
    flexShrink: 1,
  },
  emptyWrapper: {
    flex: 1,
    justifyContent: 'center',
  },
});
