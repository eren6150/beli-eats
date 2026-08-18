import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Keyboard,
  Alert,
} from 'react-native';
// react-native'in SafeAreaView'ı Android'de no-op — daima bu paketten al.
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { PlacePrediction, SearchStackParamList } from '../types';
import { Colors, Radius, Spacing, Type } from '../constants/theme';
import { SkeletonSearchRow } from '../components/ui/SkeletonLoader';
import EmptyState from '../components/ui/EmptyState';
import ErrorBanner from '../components/ui/ErrorBanner';
import Chip from '../components/ui/Chip';
import Icon from '../components/ui/Icon';
import { useLocation } from '../hooks/useLocation';
import { useAuth } from '../hooks/useAuth';
import { useSearchHistory } from '../hooks/useSearchHistory';
import { supabase } from '../lib/supabaseClient';

/**
 * Bu uzunluğun altında Google'a HİÇ gidilmiyor.
 * Eskiden aynı eşik iki yerde iki farklı yazımla duruyordu (`text.length < 2`
 * ve `query.length > 1`); ikisi de artık bu sabiti okuyor.
 */
const MIN_QUERY_LENGTH = 2;

/** Konum bias yarıçapı (metre). Edge Function'a parametre olarak gidiyor. */
const SEARCH_BIAS_RADIUS_M = 50000;

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
  /**
   * Aramanın kendisi başarısız oldu mu — kullanıcıya GÖSTERİLEN kısa metin.
   *
   * ── NEYİ KAPATIYOR ────────────────────────────────────────────────────────
   * `json.status` bir dönem yalnızca konsola yazılıyordu ve ekran bu durumları
   * "Sonuç bulunamadı" diye gösteriyordu. Yani anahtar reddedildiğinde
   * (`REQUEST_DENIED`), günlük kota dolduğunda (`OVER_QUERY_LIMIT`) veya ağ
   * koptuğunda kullanıcı **"burada restoran yok"** sanıyordu. Sessizce yanlış
   * bilgi veren tek yol buydu; günlük kota 2.000'e çekildikten sonra
   * `OVER_QUERY_LIMIT` gerçek bir ihtimal.
   *
   * ── NEDEN TEK MESAJ, DURUM KODUNA GÖRE AYRI METİN DEĞİL ───────────────────
   * Kullanıcı `REQUEST_DENIED` ile `OVER_QUERY_LIMIT` karşısında FARKLI bir
   * şey yapamaz — ikisi de "arama şu an çalışmıyor, sonra dene". Ayrım
   * geliştiriciyi ilgilendiriyor ve o zaten `console.warn`'da. Projenin kuralı:
   * ekrana kısa ve eyleme dönük metin, konsola tam nesne.
   */
  const [searchError, setSearchError] = useState<string | null>(null);

  /**
   * Arama geçmişi — cihazda, kullanıcıya bağlı anahtarla (gerekçe hook'ta).
   * `user?.id` verilmesi şart: aynı telefonda hesap değiştiren iki kişi
   * birbirinin geçmişini görmemeli.
   */
  const { user } = useAuth();
  const history = useSearchHistory(user?.id);
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
    // Yeni deneme, eski hatayı taşımasın.
    setSearchError(null);
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
      /**
       * ── AŞAMA 2: GOOGLE'A ARTIK DOĞRUDAN GİDİLMİYOR ──────────────────────
       * Burada bir dönem ham `fetch` vardı ve API anahtarını URL'e gömüyordu.
       * Çağrı `google-places` Edge Function'ına taşındı: anahtar sunucuda ve
       * `functions.invoke` Supabase JWT'sini kendisi ekliyor, yani arama artık
       * anonim değil.
       *
       * Yan fayda: `places.ts`'te kullanılmadan duran `autocomplete()` ile bu
       * ham fetch'in ikiliği de kapandı — listedeki en eski maddelerden biri.
       */
      const { data, error } = await supabase.functions.invoke<{
        predictions?: unknown[];
      }>('google-places', {
        body: {
          action: 'autocomplete',
          input,
          latitude: effectiveLocation.latitude,
          longitude: effectiveLocation.longitude,
          radius: SEARCH_BIAS_RADIUS_M,
        },
      });

      // Araya yeni bir istek girdiyse bu yanıt bayat — hiçbir şeye yazma.
      // `loading`'e de dokunma: onun sahibi artık yeni istek.
      if (seq !== requestSeqRef.current) return;

      /**
       * Hata ARAYÜZE YANSIYOR (2026-08-13'te eklendi, Aşama 2'de korundu).
       *
       * `ZERO_RESULTS` bir hata DEĞİL ve EF onu zaten boş `predictions` olarak
       * döndürüyor — o durumda "Sonuç bulunamadı" doğru cevap. Buraya düşen
       * her şey aramanın YAPILAMADIĞI anlamına geliyor (Google durum kodu,
       * yapılandırma hatası, EF'in kendisi).
       *
       * ⚠️ BU DALDA `setSearchedFor` ÇAĞRILMIYOR — kritik nokta bu. O bayrak
       * "bu metin için arama tamamlandı" demek ve "Sonuç bulunamadı" ekranının
       * tek anahtarı. Hatalı bir yanıtta set edilseydi kullanıcı yine
       * "burada restoran yok" görürdü, yani düzeltme hiçbir işe yaramazdı.
       */
      if (error) {
        console.warn('[SearchScreen] google-places autocomplete hatası:', error);
        setSearchError('Arama şu an yapılamıyor. Biraz sonra tekrar dene.');
        setLoading(false);
        return;
      }

      if (data?.predictions) {
        setPredictions(data.predictions as PlacePrediction[]);
      }
      // Arama bu metin için TAMAMLANDI; "sonuç yok" demeye ancak şimdi hak var.
      setSearchedFor(input);
    } catch (e) {
      // Ağ hatası da aynı sınıf: arama YAPILAMADI. Öncesinde yalnızca
      // loglanıyordu ve ekran yine "Sonuç bulunamadı" diyordu.
      console.error('Places autocomplete error:', e);
      if (seq !== requestSeqRef.current) return;
      setSearchError('Bağlantını kontrol et.');
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

    /**
     * Geçmişe kayıt BURADA — her tamamlanan aramada DEĞİL.
     *
     * ⚠️ TUZAK: `fetchPredictions` içinde kaydetmek cazip ama geçmişi çöpe
     * çevirirdi. Debounce 400 ms ve kullanıcı yazarken duraklıyor; "mcd",
     * "mcdo", "mcdonal" ayrı ayrı tamamlanmış aramalar olarak kaydedilirdi.
     * Bir sonuca dokunmak ise gerçek bir NİYET ve arama başına tek kayıt.
     *
     * Bedeli kabul edildi: sonuç bulunamayan aramalar geçmişe girmiyor —
     * başarısız bir aramayı tekrar önermenin faydası yok.
     */
    history.record(query);

    const cleanName = cleanPlaceName(prediction.structured_formatting.main_text);
    // Kendi stack'imizdeki rotaya push ediyoruz; geri tuşu arama sonuçlarına döner.
    navigation.navigate('RestaurantDetail', {
      placeId: prediction.place_id,
      placeName: cleanName,
    });
  };

  /**
   * Geçmişteki bir terime dokunma → o aramayı TEKRAR yap.
   *
   * `fetchPredictions` DOĞRUDAN çağrılıyor, debounce'a girilmiyor: kullanıcı
   * yazmıyor, hazır bir terim seçiyor — 400 ms beklemenin karşılığı yok.
   * Bekleyen bir debounce varsa iptal ediliyor, yoksa az önce yazılmış bir
   * metnin isteği bunun üstüne binebilirdi (`handleClear`'ın dersi).
   */
  const handleHistoryPress = (term: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQuery(term);
    fetchPredictions(term);
  };

  /** Yıkıcı ve tek hamlede geri gelmiyor → onaylı. Tek tek silme onaysız. */
  const handleClearHistory = () => {
    Alert.alert(
      'Arama geçmişini temizle',
      'Son aramaların silinecek. Bu işlem geri alınamaz.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Temizle', style: 'destructive', onPress: history.clear },
      ]
    );
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
    setSearchError(null);
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
      /**
       * Geçmiş YALNIZCA kutu boşken görünüyor.
       *
       * Yazarken de göstermek, tahmin listesiyle AYNI alanı paylaşmak demekti:
       * iki liste arasında hangisinin ne zaman kazanacağı yeni bir kural
       * gerektirir ve `renderBody`'nin beş dalı zaten bir hata düzeltmesinin
       * sonucu ("Sonuç bulunamadı" bir dönem CATCH-ALL'dı). Boş kutu, geçmişin
       * doğal ve tek yeri.
       */
      if (history.terms.length > 0) {
        return (
          <View style={styles.historyWrapper}>
            <View style={styles.historyHeader}>
              <Text style={styles.historyTitle}>Son aramaların</Text>
              <TouchableOpacity
                onPress={handleClearHistory}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.historyClear}>Tümünü temizle</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={history.terms}
              keyExtractor={(term) => term}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item, index }) => (
                <TouchableOpacity
                  style={[
                    styles.historyItem,
                    index < history.terms.length - 1 && styles.resultItemBorder,
                  ]}
                  onPress={() => handleHistoryPress(item)}
                  activeOpacity={0.7}
                >
                  <Icon name="search" size={16} color={Colors.textMuted} />
                  <Text style={styles.historyTerm} numberOfLines={1}>
                    {item}
                  </Text>
                  {/* İç dokunma hedefi: satırı ezip yalnızca bu terimi siliyor.
                      RN iç içe dokunmada en içteki hedefi seçiyor (`RankRow`'un
                      cihazda doğrulanmış deseni). Onay YOK — yıkıcı değil. */}
                  <TouchableOpacity
                    onPress={() => history.remove(item)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel={`${item} aramasını geçmişten kaldır`}
                  >
                    <Icon name="close" size={16} color={Colors.textMuted} />
                  </TouchableOpacity>
                </TouchableOpacity>
              )}
            />
          </View>
        );
      }

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

      {/* ── Hata şeridi ──
          `renderBody`'nin İÇİNDE değil, ÜSTÜNDE: elde eski sonuçlar varken de
          görünmesi gerekiyor. `renderBody`'nin ilk dalı sonuç varsa listeyi
          döndürüyor, yani banner oraya konsaydı tam da "arama bozuldu ama
          ekranda eski liste duruyor" durumunda gizli kalırdı. */}
      {searchError && (
        <ErrorBanner
          message={searchError}
          onRetry={() => fetchPredictions(query)}
          style={styles.errorBanner}
        />
      )}

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
  errorBanner: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },

  historyWrapper: { flex: 1 },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  historyTitle: {
    ...Type.captionStrong,
    color: Colors.textSecondary,
  },
  historyClear: {
    ...Type.captionStrong,
    color: Colors.brandStrong,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  historyTerm: {
    ...Type.body,
    color: Colors.textPrimary,
    flex: 1,
  },
});
