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

/**
 * ⚠️ Places REST anahtarı — native harita anahtarından AYRI.
 * Gerekçe `places.ts`'in başında tam olarak yazılı: bu ekrandaki autocomplete
 * çağrısı düz HTTPS, yani paket adı/imza taşımıyor ve Android uygulama
 * kısıtlaması onu tanıyamaz.
 *
 * NOT: bu dosya hâlâ ham `fetch` kullanıyor ve `json.status`'ü KONTROL
 * ETMİYOR (açık iş). Somut sonucu: anahtar yanlışsa `REQUEST_DENIED` döner,
 * `json.predictions` hiç gelmez ve ekranda yalnızca "Sonuç bulunamadı"
 * görünür — yani anahtar bölmesi yanlış yapılırsa hata SESSİZ olur.
 */
const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ?? '';

/**
 * Bu uzunluğun altında Google'a HİÇ gidilmiyor.
 * Eskiden aynı eşik iki yerde iki farklı yazımla duruyordu (`text.length < 2`
 * ve `query.length > 1`); ikisi de artık bu sabiti okuyor.
 */
const MIN_QUERY_LENGTH = 2;

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
  // `location` DEĞİL `effectiveLocation`: gerekçe `fetchPredictions` içinde.
  const { effectiveLocation } = useLocation();
  const [query, setQuery] = useState('');
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [loading, setLoading] = useState(false);
  /**
   * Son TAMAMLANAN aramanın metni (hiç arama yapılmadıysa null).
   *
   * "Sonuç bulunamadı" demeye ancak `searchedFor === query` olduğunda hakkımız
   * var. Öncesinde ekran yalnızca `!loading && query.length > 1`e bakıyordu ve
   * bu, birbirinden çok farklı üç durumu tek dala topluyordu:
   *   (a) yazıldı ama debounce daha dolmadı → arama HENÜZ BAŞLAMADI
   *   (b) başka ekrandan dönüldü, kutu dolu ama arama hiç yapılmadı
   *   (c) arandı ve gerçekten sonuç yok
   * Yalnızca (c) "Sonuç bulunamadı". (a) yüzünden her aramada 400ms'lik bir
   * yanıp sönme vardı; (b) ise `handleSelect` bug'ının görünen yüzüydü.
   */
  const [searchedFor, setSearchedFor] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Yanıt sırası koruması: yalnızca EN SON başlatılan istek state'e yazabilir.
   * Debounce çakışmayı azaltır ama bitirmez — yavaş bir istek, kendisinden
   * sonra başlayan bir isteğin yanıtından SONRA dönebiliyor. Guard olmadan geç
   * gelen boş bir yanıt `searchedFor`'u güncel olmayan bir metne çeker ve ekranı
   * iskelette asılı bırakırdı. (`MapScreen`'in `lastPoiTapRef`'iyle aynı desen.)
   */
  const requestSeqRef = useRef(0);

  const fetchPredictions = async (raw: string) => {
    const input = raw.trim();
    if (input.length < MIN_QUERY_LENGTH) {
      setPredictions([]);
      // Arama yapılmadı — "arandı, boş döndü" iddiasını da geri al.
      setSearchedFor(null);
      return;
    }

    const seq = ++requestSeqRef.current;
    setLoading(true);
    try {
      /**
       * Konum bias: kullanıcının 50 km çevresini önceliklendir.
       *
       * ⚠️ `effectiveLocation` KULLANILIYOR, `location` DEĞİL — bu bir hata
       * düzeltmesi. Öncesinde `location` null olduğunda bias parametresi
       * TAMAMEN düşüyordu ve Google dünya genelinden sonuç döndürüyordu
       * ("mcdonald" → başka ülkelerdeki şubeler). Null iki durumda oluyor:
       * izin yokken (kalıcı) ve konum HENÜZ ÇÖZÜLMEMİŞKEN (geçici) — ikincisi
       * izin verilmiş cihazlarda da yaşanıyordu, çünkü `useLocation` asenkron
       * ve konum geldiğinde arama tekrarlanmıyor.
       *
       * `effectiveLocation` hiçbir zaman null olmuyor, yani bias her istekte
       * var. Bias sıralıyor, daraltmıyor; yanlış varsayılan bile global
       * sonuçtan iyi.
       */
      const biasPart =
        `&locationbias=circle:50000@` +
        `${effectiveLocation.latitude},${effectiveLocation.longitude}`;

      const url =
        `https://maps.googleapis.com/maps/api/place/autocomplete/json` +
        `?input=${encodeURIComponent(input)}` +
        `&types=restaurant|food|cafe|bar` +
        `&language=tr` +
        biasPart +
        `&key=${GOOGLE_API_KEY}`;

      const res = await fetch(url);
      const json = await res.json();
      // Araya yeni bir istek girdiyse bu yanıt bayat — hiçbir şeye yazma.
      // `loading`'e de dokunma: onun sahibi artık yeni istek.
      if (seq !== requestSeqRef.current) return;

      /**
       * `json.status` hâlâ ARAYÜZE yansıtılmıyor (açık iş: `places.ts`'teki
       * `autocomplete()`'e geçiş) ama artık KONSOLA düşüyor.
       *
       * Sebep: bu ekran sessizce bozulabilen tek Google yolu. Anahtar yanlış,
       * kota dolu veya API kısıtı hatalıysa `predictions` hiç gelmiyor ve
       * ekranda yalnızca "Sonuç bulunamadı" görünüyor — yani teşhis edilemez
       * hale geliyor. Bu satır davranışı DEĞİŞTİRMİYOR (kural gereği ayrı bir
       * diff'e ait), yalnızca körlüğü kaldırıyor. SHA-1 Android kısıtlaması
       * denendiğinde ilk bakılacak yer burası olacak.
       */
      if (json.status && json.status !== 'OK' && json.status !== 'ZERO_RESULTS') {
        console.warn(
          `[SearchScreen] Places autocomplete status=${json.status}`,
          json.error_message ?? ''
        );
      }

      if (json.predictions) setPredictions(json.predictions);
      // Arama bu metin için TAMAMLANDI; "sonuç yok" demeye ancak şimdi hak var.
      setSearchedFor(input);
    } catch (e) {
      console.error('Places autocomplete error:', e);
      if (seq !== requestSeqRef.current) return;
    }
    setLoading(false);
  };

  const handleTextChange = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchPredictions(text), 400);
  };

  /**
   * Arama kutusuna ve sonuç listesine DOKUNMUYOR — bilinçli.
   *
   * Bir dönem burada `setQuery(cleanName)` + `setPredictions([])` vardı:
   * "tarayıcı adres çubuğu" deseni (seçileni kutuya yaz, listeyi kapat). O desen
   * ekranda KALINAN seçicilere ait; burada hemen detay ekranına gidiliyor, yani
   * geri bildirim hiç görünmüyor — mekanın adı zaten detay ekranında yazıyor.
   * Sıfır fayda, karşılığında şu bozuk durum:
   *
   *   Sonuca dokun → detay → geri. `SearchScreen` stack'in kökü olduğu için
   *   unmount olmuyor, state hayatta kalıyor. Dönüşte kutuda seçilen mekanın
   *   TAM adı, liste boş, `loading` false → ekran "Sonuç bulunamadı" diyordu.
   *   Bu bir arama sonucu DEĞİLDİ: dönüşte hiçbir istek atılmıyor (fetch'in tek
   *   çağıranı `handleTextChange`'in debounce timer'ı). Hiç yapılmamış bir
   *   aramanın varsayılan ekranıydı.
   *
   * Artık geri dönüşte kullanıcı bıraktığı yerde: yazdığı metin ve sonuç listesi
   * duruyor, başka bir sonuca dokunabiliyor — üstelik ek istek/fatura yok.
   * Projenin `backBehavior="history"` ve `reopenSummaryRef` kararlarındaki kural:
   * geri her zaman bir önceki duruma döner.
   */
  const handleSelect = (prediction: PlacePrediction) => {
    Keyboard.dismiss();
    const cleanName = cleanPlaceName(prediction.structured_formatting.main_text);
    // Kendi stack'imizdeki rotaya push ediyoruz; geri tuşu arama sonuçlarına döner.
    navigation.navigate('RestaurantDetail', {
      placeId: prediction.place_id,
      placeName: cleanName,
    });
  };

  const handleClear = () => {
    // Bekleyen debounce'u da iptal et: yoksa temizlemeden hemen önce yazılan
    // metnin isteği 400ms sonra ateşlenip listeyi geri dolduruyordu.
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // Uçuştaki yanıtı da geçersiz kıl; o yanıt artık `loading`'i kapatmayacağı
    // için bayrağı burada elle indiriyoruz.
    requestSeqRef.current++;
    setQuery('');
    setPredictions([]);
    setSearchedFor(null);
    setLoading(false);
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
  //
  // Dalların SIRASI anlamlı ve daralarak gidiyor. Kritik olan, en sonda duran
  // "Sonuç bulunamadı"nın artık bir CATCH-ALL olmaması: ona ulaşmak için o metin
  // için gerçekten tamamlanmış bir arama gerekiyor.
  const renderBody = () => {
    const trimmed = query.trim();

    // 1. Elde sonuç varsa her şeyden önce o. Yeni bir arama uçuştayken bile
    //    mevcut listeyi iskelete çevirmiyoruz (eski davranış da böyleydi).
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

    // 2. Hiç yazılmadı.
    if (trimmed.length === 0) {
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

    // 3. Yazıldı ama Google'a gidecek kadar uzun değil. Arama yok, iddia da yok.
    if (trimmed.length < MIN_QUERY_LENGTH) {
      return null;
    }

    // 4. Bu metin için arama TAMAMLANDI ve gerçekten boş döndü — tek dürüst
    //    "Sonuç bulunamadı" durumu bu.
    if (searchedFor === trimmed && !loading) {
      return (
        <View style={styles.emptyWrapper}>
          <EmptyState
            icon="restaurant"
            title="Sonuç bulunamadı"
            subtitle={`"${trimmed}" için bir sonuç yok.`}
          />
        </View>
      );
    }

    // 5. Geriye kalan tek durum: arama debounce'ta bekliyor ya da uçuşta.
    //    Eskiden buraya `null` düşüyordu ve arada "Sonuç bulunamadı" yanıp
    //    sönüyordu; artık bekleme her zaman iskelet olarak görünüyor.
    return renderSkeletonRows();
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
