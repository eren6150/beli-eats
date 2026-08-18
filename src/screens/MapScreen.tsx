import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import MapView, {
  Marker,
  PROVIDER_GOOGLE,
  Region,
  PoiClickEvent,
} from 'react-native-maps';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useAuth } from '../hooks/useAuth';
import { useLocation } from '../hooks/useLocation';
import { supabase } from '../lib/supabaseClient';
import { GOOGLE_API_KEY, isFoodPlace, parseCoord } from '../lib/places';
import { peekPlace, resolvePlace } from '../lib/placeCache';
import {
  Place,
  UserRanking,
  ListWithItemCount,
  MapStackParamList,
  TabParamList,
} from '../types';
import { Colors, Type, Spacing, Radius, Elevation } from '../constants/theme';
import { DEFAULT_COORDS } from '../constants/location';
import Icon from '../components/ui/Icon';
import MapSummarySheet from '../components/map/MapSummarySheet';
import RestaurantBottomSheet, {
  RestaurantSheetData,
} from '../components/map/RestaurantBottomSheet';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Ankara merkezi — konum izni olmadığında veya koordinat geçersizse fallback.
 * Koordinatlar `constants/location.ts`'ten geliyor: bir dönem yalnızca burada
 * duruyorlardı ve `SearchScreen`'in fallback'i hiç yoktu, o yüzden aynı eksik
 * konum haritada görünmezken aramada global sonuç olarak patlıyordu. Tek kaynak.
 * Delta'lar haritaya özgü, o yüzden burada kalıyor.
 */
const ANKARA_COORDS = {
  ...DEFAULT_COORDS,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

/** fitToCoordinates kenar boşluğu — bilgi kartı ve tab bar'ın altında kalmasın. */
const FIT_PADDING = { top: 160, right: 60, bottom: 120, left: 60 };

/** Geçici POI bildiriminin ekranda kalma süresi. */
const POI_NOTICE_MS = 2500;

// ─── Types ────────────────────────────────────────────────────────────────────

interface RankedPlace extends UserRanking {
  lat: number;
  lng: number;
  cuisine?: string;
  address?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Google `types` dizisinden gösterilecek birincil kategoriyi seçer.
 * Bu üç tür her işletmede var, ayırt edici değil — atlanıyor.
 */
function primaryCuisine(types: string[] | null | undefined): string | undefined {
  return (types ?? []).find(
    (t) => !['establishment', 'point_of_interest', 'food'].includes(t)
  );
}

/** `places` cache satırını Bottom Sheet'in beklediği şekle çevirir. */
function sheetDataFromPlace(place: Place): RestaurantSheetData {
  return {
    id: place.place_id,
    restaurant_name: place.name,
    // Kullanıcının kendi puanı yok — bu yola yalnızca kademe 1'de
    // yakalanmayan, yani puanlanmamış mekanlar düşüyor.
    rating: null,
    googleRating: place.google_rating,
    photo_reference: place.photo_refs?.[0] ?? null,
    place_id: place.place_id,
    cuisine: primaryCuisine(place.types),
    address: place.formatted_address ?? undefined,
    source: 'poi',
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MapScreen() {
  const { location, errorMsg: locationError, loading: locationLoading, retry } =
    useLocation();
  // Harita tam ekran; bilgi kartı status bar'ın altına inmesin diye inset.
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<MapStackParamList>>();
  const mapRef = useRef<MapView>(null);
  const { user } = useAuth();
  const userId = user?.id;

  const [rankedPlaces, setRankedPlaces] = useState<RankedPlace[]>([]);
  const [fetching, setFetching] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  /** Harita native tarafta hazır olmadan kamera komutları sessizce düşer. */
  const [mapReady, setMapReady] = useState(false);
  const [selectedRestaurant, setSelectedRestaurant] =
    useState<RestaurantSheetData | null>(null);
  /** Bilinmeyen bir POI'nin türü sorgulanıyor — bilgi kartında spinner. */
  const [poiChecking, setPoiChecking] = useState(false);
  /** Geçici nötr bildirim (ör. "yeme-içme kategorisinde değil"). */
  const [poiNotice, setPoiNotice] = useState<string | null>(null);
  /** Bilgi kartına dokununca açılan özet. */
  const [summaryVisible, setSummaryVisible] = useState(false);

  /** Otomatik kadrajı yalnızca bir kez uygula — kullanıcı sonra haritayı serbest gezsin. */
  const hasFittedRef = useRef(false);

  /**
   * L1 cache artık BURADA DEĞİL — `placeCache`'in modül seviyesi belleğinde.
   *
   * Eskiden bu ekranda `poiCacheRef` adında ikinci bir bellek katmanı vardı ve
   * `RestaurantSheetData` saklıyordu. İki sorunu vardı: (a) `placeCache`'in L1'i
   * eklendikten sonra gereksiz bir ikinci katman oldu, (b) sakladığı tipte
   * `types` YOK — yalnızca `cuisine` (diziden türetilmiş tek string) var, yani
   * yeme-içme filtresi o veriyle kayıplı çalışırdı. `peekPlace()` tam `Place`
   * nesnesini senkron döndürüyor, `types` dahil.
   */

  /** En son dokunulan POI — geç gelen yanıt güncel seçimi ezmesin. */
  const lastPoiTapRef = useRef<string | null>(null);

  /** Şu an detayı çekilen POI; aynısına tekrar dokunma yok sayılsın. */
  const pendingPoiRef = useRef<string | null>(null);

  /** Geçici bildirimin temizleme zamanlayıcısı. */
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Özet AÇIKKEN mi buradan ayrıldık?
   *
   * Sheet, başka bir ekrana giderken kapatılmak ZORUNDA: RN `Modal`
   * uygulamanın görünüm hiyerarşisinin üstünde ayrı bir katman, açık kalırsa
   * hedef ekran onun ARKASINDA kalır. Bu işaret, geri dönüldüğünde sheet'i
   * geri açmak için.
   *
   * ÜÇ ÇIKIŞIN ÜÇÜ DE işareti koyuyor (satır, liste kartı, "Tümünü gör") —
   * kural tek: geri her zaman bir önceki duruma döner. "Tümünü gör" bir dönem
   * hariç tutulmuştu, 2026-08-01'de kullanıcı kararıyla o istisna kalktı.
   *
   * BİLİNEN YAN ETKİ: işaret "geri ile döndüm" değil "harita tekrar odaklandı"
   * anlamına geliyor. Kullanıcı Profil'den sekme çubuğuyla başka bir sekmeye,
   * oradan yine sekme çubuğuyla Harita'ya geçerse özet yine açılır — haritayı
   * bilerek açmışken üstüne sheet gelir. Ayırt etmenin yolu `tabPress`
   * olayını dinleyip işareti temizlemek (geri tuşu o olayı üretmez); pratikte
   * rahatsız ederse eklenecek.
   */
  const reopenSummaryRef = useRef(false);

  // ── Puanlanmış mekanlar (tek Supabase sorgusu, Google'a HİÇ gitmiyor) ────────
  //
  // Eskiden burada koordinatı olmayan her satır için ayrı bir Place Details
  // isteği atılıp sonuç user_rankings'e geri yazılıyordu (N+1 + backfill).
  // Artık mekan bilgisi `places` cache'inden gömülü sorguyla geliyor.
  //
  // `places(*)` gömülü kaynağını PostgREST FK üzerinden çözüyor — migration 003
  // çalışmadan bu select "Could not find a relationship" döner.
  //
  // `.not('place_id','is',null)` filtresi kaldırıldı: place_id kolonu şemada
  // zaten `not null`, filtre baştan beri no-op'tu.
  //
  // `user_id` FİLTRESİ (2026-08-01): sorgu baştan beri filtresizdi, yani
  // haritada VERİTABANINDAKİ HERKESİN puanladığı mekanlar çiziliyordu (tek
  // kullanıcı olduğu için fark edilmiyordu). Bilgi kartı "Puanladıklarım"
  // adını alınca isim ile veri ayrışacaktı. Harita artık kişisel: arkadaş
  // verisi Faz 3'ün sosyal katmanında KENDİ anahtarıyla gelecek.
  const fetchRankedPlaces = useCallback(async () => {
    // Oturum henüz çözülmediyse burada duruyoruz — `loadAll` userId
    // değiştiğinde kimliğini değiştirdiği için sorgu kendiliğinden tekrarlanır.
    if (!userId) {
      setRankedPlaces([]);
      return;
    }

    const { data, error } = await supabase
      .from('user_rankings')
      .select('*, places(*)')
      .eq('user_id', userId)
      .limit(50);

    if (error) {
      // Ham `error.message` EKRANA ÇIKMIYOR — teknik detay (kod, hint, ağ
      // katmanı mesajı) burada kalır, kullanıcı ne yapacağını söyleyen kısa
      // metni görür. Yanlış teşhis koymuyoruz: "bağlantı yok" demek yerine
      // "kontrol et" diyoruz, çünkü hata türünü ayrıştırmıyoruz.
      console.error('[MapScreen] Supabase user_rankings hatası:', error);
      throw new Error('Mekanlar yüklenemedi. Bağlantını kontrol et.');
    }
    if (!data || data.length === 0) {
      setRankedPlaces([]);
      return;
    }

    const mapped: RankedPlace[] = [];
    const withoutCoords: string[] = [];

    for (const ranking of data as UserRanking[]) {
      const place = ranking.places ?? null;

      // `places` kanonik kaynak; user_rankings'teki denormalize kopyalar
      // (restaurant_name / photo_reference / latitude / longitude) yalnızca
      // fallback. O kolonlar bir faz daha duruyor, sonra düşürülecek.
      const lat = parseCoord(place?.latitude ?? ranking.latitude, 'lat');
      const lng = parseCoord(place?.longitude ?? ranking.longitude, 'lng');

      if (lat === null || lng === null) {
        withoutCoords.push(place?.name ?? ranking.restaurant_name);
        continue;
      }

      mapped.push({
        ...ranking,
        restaurant_name: place?.name ?? ranking.restaurant_name,
        photo_reference: place?.photo_refs?.[0] ?? ranking.photo_reference,
        lat,
        lng,
        cuisine: primaryCuisine(place?.types),
        address: place?.formatted_address ?? undefined,
      });
    }

    // Koordinatsız satır artık bir hata değil, yalnızca çizilemeyen bir pin.
    // (Place Details'e düşüp koordinat aramıyoruz — o yol maliyetliydi ve
    // mekan detay ekranında açıldığında cache zaten dolacak.)
    if (withoutCoords.length > 0) {
      console.warn(
        '[MapScreen] koordinatı olmayan mekanlar pin olarak çizilmedi:',
        withoutCoords
      );
    }

    setRankedPlaces(mapped);
  }, [userId]);

  // ── Veri yükleme ─────────────────────────────────────────────────────────────
  //
  // Nearby Search katmanı kaldırıldı: Google zaten aynı işletmeleri native POI
  // olarak çiziyor ve onPoiClick ile tıklanabilir hale geldiler. İki katman
  // üst üste binip aynı restoranı iki kez gösteriyordu.
  const loadAll = useCallback(async () => {
    setFetching(true);
    setDataError(null);

    try {
      // Pinler artık tamamen Supabase'den geliyor; eksik API key bu yolu
      // ETKİLEMİYOR. Eskiden burada erken return vardı ve key yoksa harita
      // bomboş kalıyordu — artık yalnızca POI detayları ve fotoğraflar bozulur,
      // o yüzden uyarı gösterip pinleri yüklemeye devam ediyoruz.
      if (!GOOGLE_API_KEY) {
        // Bu bir KURULUM hatası, kullanıcının çözebileceği bir şey değil —
        // çözüm adımları (.env, Metro) geliştiriciye, konsola.
        // Buradaki `GOOGLE_API_KEY` `places.ts`'ten geliyor, yani PLACES
        // anahtarı — haritanın kendisini çizen native anahtar AYRI
        // (`EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`, AndroidManifest'ten). Bu yüzden
        // uyarı yalnızca POI detayları ve fotoğraflar için geçerli; pinler ve
        // harita karoları bundan etkilenmiyor.
        console.warn(
          '[MapScreen] EXPO_PUBLIC_GOOGLE_PLACES_API_KEY tanımsız — mekan ' +
            'detayları ve fotoğraflar çalışmaz (harita karoları ayrı ' +
            'anahtarla çiziliyor, onlar etkilenmez). .env dosyasını kontrol ' +
            'edip Metro\'yu yeniden başlat.'
        );
        setDataError('Mekan detayları şu an kullanılamıyor.');
      }

      await fetchRankedPlaces();
    } catch (e) {
      console.error('[MapScreen] veri yükleme hatası:', e);
      setDataError(e instanceof Error ? e.message : String(e));
    } finally {
      setFetching(false);
    }
  }, [fetchRankedPlaces]);

  // Konum çözülünce (veya izin reddedilince) veriyi çek.
  useEffect(() => {
    if (locationLoading) return;
    loadAll();
  }, [locationLoading, loadAll]);

  // ── Kadraj: pinler geldiğinde hepsini sığdır ─────────────────────────────────
  useEffect(() => {
    // mapReady beklenmezse fitToCoordinates/animateToRegion native tarafa
    // ulaşmadan kaybolur ve kamera initialRegion'da takılı kalır.
    if (hasFittedRef.current || fetching || !mapReady || !mapRef.current) return;

    // Yalnızca puanlanan mekanlar + kullanıcı konumu. Tek pin varsa aşağıdaki
    // dal sabit delta ile gidiyor; hiç pin yoksa konum tek başına kalıyor ve
    // yine tek-nokta dalına düşüyor, kadraj bozulmuyor.
    const coords = rankedPlaces.map((p) => ({
      latitude: p.lat,
      longitude: p.lng,
    }));
    if (location) coords.push(location);

    if (coords.length === 0) return;

    hasFittedRef.current = true;

    if (coords.length === 1) {
      // Tek nokta: fitToCoordinates aşırı yakınlaşır, sabit delta ile git.
      mapRef.current.animateToRegion(
        { ...coords[0], latitudeDelta: 0.02, longitudeDelta: 0.02 },
        800
      );
    } else {
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: FIT_PADDING,
        animated: true,
      });
    }
  }, [fetching, mapReady, rankedPlaces, location]);

  // ── Marker press handlers ────────────────────────────────────────────────────
  const handleRankedPress = useCallback((place: RankedPlace) => {
    setSelectedRestaurant({
      id: place.id,
      restaurant_name: place.restaurant_name,
      rating: place.rating,
      photo_reference: place.photo_reference,
      place_id: place.place_id,
      cuisine: place.cuisine,
      address: place.address,
      source: 'ranked',
    });
  }, []);

  const handleCloseSheet = useCallback(() => setSelectedRestaurant(null), []);

  /** Geçici nötr bildirim göster; öncekini iptal edip süreyi sıfırdan başlatır. */
  const showPoiNotice = useCallback((message: string) => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setPoiNotice(message);
    noticeTimerRef.current = setTimeout(() => setPoiNotice(null), POI_NOTICE_MS);
  }, []);

  // Ekran kapanırken bekleyen zamanlayıcı kalmasın.
  useEffect(
    () => () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    },
    []
  );

  /**
   * Mekan yeme-içme kategorisindeyse sheet'i açar, değilse geçici bildirim
   * gösterip hiçbir şey yapmaz.
   */
  const openIfFood = useCallback(
    (place: Place) => {
      if (isFoodPlace(place.types)) {
        setSelectedRestaurant(sheetDataFromPlace(place));
        return;
      }
      console.debug(
        `[MapScreen] POI yeme-içme değil, atlandı: "${place.name}"`,
        place.types
      );
      showPoiNotice('Bu mekan yeme-içme kategorisinde değil');
    },
    [showPoiNotice]
  );

  // ── Native Google POI dokunuşu ───────────────────────────────────────────────
  //
  // Üç kademeli çözümleme:
  //   1) Kullanıcının puanladığı mekan mı? → kendi puanını göster, hiç istek yok
  //   2) L1 — placeCache belleği (senkron) → gecikme ve spinner YOK
  //   3) resolvePlace → L2 `places` tablosu (KALICI), miss ise L3 Google
  //
  // YEME-İÇME FİLTRESİ: Google haritada parkı, müzeyi, mağazayı da POI olarak
  // çiziyor ve hepsi tıklanabilir. `onPoiClick` payload'ında `types` YOK
  // ({ placeId, name, coordinate }), yani tür ancak cache'ten veya Place
  // Details'ten öğrenilebiliyor. `types` alan maskesinde zaten var → ek maliyet
  // yok. İlk dokunuşta çağrı yine yapılıyor (türü öğrenmenin başka yolu yok);
  // filtre parayı TEKRAR dokunuşlarda kurtarıyor, çünkü reddedilen POI de
  // cache'e yazılıyor ve ikinci dokunuş sıfır çağrıyla reddediliyor.
  //
  // SIRA DEĞİŞTİ: eskiden sheet HEMEN açılıp içi sonradan doluyordu. Filtreyi
  // çekimden sonra uygulayınca sheet'i kapatmak gerekirdi → gözle görülür flash.
  // Artık önce karar veriliyor, sonra açılıyor. Bedeli: bilinmeyen POI'de ilk
  // dokunuşta sheet ~birkaç yüz ms sonra açılıyor — ama bir kez, DOLU olarak;
  // içerik zıplaması yok. Cache'lenmiş POI'lerde anında.
  //
  // Kademe 1'e FİLTRE UYGULANMIYOR, üç sebeple: (a) kullanıcı o mekanı kendisi
  // eklemiş, niyet beyanı var; (b) `handleRankedPress` `<Marker onPress>`'ten de
  // çağrılıyor — filtre kullanıcının kendi pin'ini tıklanamaz yapar, yani kendi
  // verisi erişilemez olur; (c) meşru sebeple yeme-içme dışı bir yer eklemiş
  // olabilir, kendi listesini sansürlemek bize düşmez.
  const handlePoiClick = useCallback(
    async (event: PoiClickEvent) => {
      const { placeId, name } = event.nativeEvent;
      if (!placeId) return;

      // 1) Puanlanmış mekan — filtresiz
      const ranked = rankedPlaces.find((p) => p.place_id === placeId);
      if (ranked) {
        handleRankedPress(ranked);
        return;
      }

      // Aynı POI'nin detayı zaten yolda; çift dokunma yeni istek açmasın.
      if (pendingPoiRef.current === placeId) return;

      lastPoiTapRef.current = placeId;

      // 2) L1 — senkron bellek okuması. Hit ise karar aynı karede veriliyor.
      const warm = peekPlace(placeId);
      if (warm) {
        openIfFood(warm);
        return;
      }

      // 3) L2 tablo → miss ise L3 Google. Tür bilinmediği için beklemek şart.
      pendingPoiRef.current = placeId;
      setPoiChecking(true);

      try {
        const place = await resolvePlace(placeId, {
          fallbackName: name,
          // Bayat satır arka planda yenilenirse AÇIK sheet'i tazele.
          onRevalidated: (fresh) =>
            setSelectedRestaurant((current) =>
              current?.place_id === fresh.place_id
                ? sheetDataFromPlace(fresh)
                : current
            ),
        });

        // Son dokunuş kazanır: bu istek dönerken kullanıcı başka bir POI'ye
        // dokunmuşsa sonucu yok say.
        if (lastPoiTapRef.current !== placeId) return;

        if (place) openIfFood(place);
      } catch (e) {
        // Teknik teşhis (Edge Function hata kodu, ağ hatası) yalnızca burada. Bildirim 2.5 sn'de kayboluyor ve retry butonu yok,
        // o yüzden mesaj kullanıcıya bir sonraki adımı söylüyor.
        console.error('[MapScreen] POI detayları alınamadı:', e);
        if (lastPoiTapRef.current === placeId) {
          showPoiNotice('Bağlantı sorunu, tekrar dokun');
        }
      } finally {
        // Yalnızca kendi işaretini temizle — araya giren başka bir dokunuşun
        // işaretini silmesin.
        if (pendingPoiRef.current === placeId) pendingPoiRef.current = null;
        if (lastPoiTapRef.current === placeId) setPoiChecking(false);
      }
    },
    [rankedPlaces, handleRankedPress, openIfFood, showPoiNotice]
  );

  // MapStack'teki kardeş rotaya push ediyoruz; geri tuşu haritaya döner.
  const handleOpenDetail = useCallback(() => {
    if (!selectedRestaurant) return;

    const { place_id, restaurant_name, photo_reference } = selectedRestaurant;
    setSelectedRestaurant(null); // sheet kapanış animasyonunu başlat

    navigation.navigate('RestaurantDetail', {
      placeId: place_id,
      placeName: restaurant_name,
      photoReference: photo_reference ?? undefined,
    });
  }, [selectedRestaurant, navigation]);

  const handleRetry = useCallback(() => {
    hasFittedRef.current = false;
    if (locationError) retry();
    else loadAll();
  }, [locationError, retry, loadAll]);

  // ── Özet sheet'inin yönlendirmeleri ─────────────────────────────────────────
  //
  // Mekan ve liste detayı BU stack'te açılıyor (`ListDetail` bu yüzden
  // `MapStack`'e de kaydedildi): projenin kuralı "geri tuşu gelinen sekmeye
  // döner". Sekme atlatan tek yer "Tümünü gör" — o zaten profile gitmek demek.

  const handleSummaryRanking = useCallback(
    (ranking: UserRanking) => {
      reopenSummaryRef.current = true;
      setSummaryVisible(false);
      navigation.navigate('RestaurantDetail', {
        placeId: ranking.place_id,
        placeName: ranking.restaurant_name,
        photoReference: ranking.photo_reference ?? undefined,
      });
    },
    [navigation]
  );

  const handleSummaryList = useCallback(
    (list: ListWithItemCount) => {
      reopenSummaryRef.current = true;
      setSummaryVisible(false);
      navigation.navigate('ListDetail', {
        listId: list.id,
        title: list.title,
        isOrdered: list.is_ordered,
        description: list.description,
      });
    },
    [navigation]
  );

  /**
   * Profil sekmesine, istenen sekme açık olarak atlar.
   *
   * `getParent()` sekme navigator'ı — `MapStack` onun içinde. Tip
   * `TabParamList`'ten geliyor; `ProfileTab` `NavigatorScreenParams` aldığı için
   * iç ekranı ve parametresini birlikte verebiliyoruz.
   */
  const openProfileTab = useCallback(
    (tab: 'rankings' | 'lists') => {
      // Diğer iki çıkışla aynı: profilden geri dönüldüğünde özet geri açılsın.
      reopenSummaryRef.current = true;
      setSummaryVisible(false);
      navigation
        .getParent<BottomTabNavigationProp<TabParamList>>()
        ?.navigate('ProfileTab', { screen: 'MyProfile', params: { tab } });
    },
    [navigation]
  );

  /**
   * Detaydan haritaya dönüldüğünde özeti geri aç.
   *
   * `useFocusEffect` ekran her odaklandığında çalışıyor (ilk mount dahil);
   * işaret olmadan hiçbir şey yapmıyor, yani harita normal açılışta temiz
   * geliyor. İşaret burada TÜKETİLİYOR — temizlenmezse sonraki her dönüşte
   * sheet kendiliğinden açılırdı.
   */
  useFocusEffect(
    useCallback(() => {
      if (!reopenSummaryRef.current) return;
      reopenSummaryRef.current = false;
      setSummaryVisible(true);
    }, [])
  );

  /**
   * Sekmeye ELLE dokunulduğunda işareti temizle.
   *
   * `useFocusEffect` "geri ile döndüm" ile "sekmeye dokundum"u ayıramıyor;
   * ikisi de odaklanma. `tabPress` bu ayrımı veriyor — geri tuşu bu olayı
   * ÜRETMİYOR. Olay, sekme geçişinden ÖNCE yayınlanıyor (bu yüzden
   * `preventDefault` ile kullanılabiliyor), yani işaret odak effect'i
   * çalışmadan önce temizleniyor.
   */
  useEffect(() => {
    const parent = navigation.getParent<BottomTabNavigationProp<TabParamList>>();
    if (!parent) return;

    return parent.addListener('tabPress', () => {
      reopenSummaryRef.current = false;
    });
  }, [navigation]);

  // ── Loading state ────────────────────────────────────────────────────────────
  if (locationLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.brand} />
        <Text style={styles.loadingText}>Konum alınıyor...</Text>
      </View>
    );
  }

  // ── Initial region (kullanıcı konumu veya Ankara fallback) ───────────────────
  const initialRegion: Region = location
    ? {
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }
    : ANKARA_COORDS;

  const isAnkaraFallback = !location;

  return (
    <GestureHandlerRootView style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={initialRegion}
        showsUserLocation={!!location}
        showsMyLocationButton={!!location}
        onMapReady={() => setMapReady(true)}
        // Google'ın native çizdiği işletme POI'lerini de tıklanabilir yapar.
        // (poiClickEnabled Android'de zaten varsayılan true.)
        onPoiClick={handlePoiClick}
      >
        {/* Puanlanmış mekanlar — çevredekiler Google'ın native POI'leri olarak
            zaten haritada, onlara onPoiClick ile erişiliyor. */}
        {rankedPlaces.map((place) => (
          // Özel view YOK — bilinçli. Marker'a çocuk eklenince native taraf
          // hasCustomMarkerView'a geçip içeriği bitmap'e kopyalıyor
          // (createDrawable); o kod yolu bu kurulumda içeriği kırpıyordu.
          // Çocuksuz Marker, Google'ın hazır pin varlığını kullanıyor.
          // Puan haritada değil, dokununca açılan Bottom Sheet'te gösteriliyor.
          //
          // title/description bilinçli olarak verilmiyor: verilirse Android
          // kendi bilgi balonunu açar ve Bottom Sheet ile çakışır.
          <Marker
            key={`ranked-${place.id}-${place.place_id}`}
            coordinate={{ latitude: place.lat, longitude: place.lng }}
            onPress={() => handleRankedPress(place)}
            // Bu dosyadaki TEK ham hex — bilinçli. Android yalnızca hue'yu
            // kullanıyor (Color.colorToHSV → hsv[0]), yani standart pin
            // varlığından bir ton seçiliyor; token'a bağlamak görünümü birebir
            // yansıtmaz. ⚠️ AMA MARKA RAMP'İYLE BİRLİKTE ELLE GÜNCELLENMELİ:
            // 2026-08-13'te marka zeytin yeşiline döndü (#5F7527, hue ≈ 77°)
            // ve bu satır eski parlak yeşilde kalsaydı haritadaki pinler tek
            // başına eski markayı taşırdı.
            pinColor="#5F7527"
          />
        ))}
      </MapView>

      {/* Overlay info card — dokununca özet sheet'i açılıyor */}
      <Pressable
        onPress={() => setSummaryVisible(true)}
        style={({ pressed }) => [
          styles.infoCard,
          { top: insets.top + Spacing.sm },
          pressed && styles.infoCardPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Puanladıklarımın ve listelerimin özetini aç"
      >
        <View style={styles.infoLeft}>
          {/* Emoji yerine Icon: emoji cihaza göre farklı çiziliyor ve
              renklendirilemiyordu. İkon nötr renkte — Midas kararı gereği
              dekoratif renk yok, durum bilgisini altındaki metin taşıyor. */}
          <View style={styles.infoTitleRow}>
            <Icon
              name={isAnkaraFallback ? 'location' : 'map'}
              size={16}
              color={Colors.textMuted}
            />
            {/* Başlık ARTIK DURUMA GÖRE DEĞİŞMİYOR: bir dönem konum izni
                yokken "Ankara (Fallback)" yazıyordu, yani aynı satır iki farklı
                işi anlatıyordu. Fallback bilgisi zaten hemen altındaki
                satırda duruyor.
                "Etrafındaki Mekanlar" da kaldırıldı — Nearby Search katmanı
                kaldırıldığından beri bu kart etraftaki mekanları değil
                kullanıcının kendi puanladıklarını sayıyor. */}
            <Text style={styles.infoTitle} numberOfLines={1}>
              Puanladıklarım
            </Text>
            <Icon name="forward" size={16} color={Colors.textMuted} />
          </View>
          {isAnkaraFallback && (
            <Text style={styles.infoFallback}>
              {locationError ?? 'Konum izni verilmedi'}
            </Text>
          )}
          {dataError && (
            <Text style={styles.infoError} numberOfLines={2}>
              {dataError}
            </Text>
          )}
          {/* Nötr geçici bildirim — hata DEĞİL, o yüzden kırmızı değil.
              Filtrelenen POI dokunuşları buraya düşüyor. */}
          {poiNotice && (
            <Text style={styles.infoNotice} numberOfLines={2}>
              {poiNotice}
            </Text>
          )}
        </View>
        <View style={styles.infoRight}>
          {fetching || poiChecking ? (
            <ActivityIndicator size="small" color={Colors.brand} />
          ) : dataError || (isAnkaraFallback && locationError) ? (
            <Pressable
              onPress={handleRetry}
              style={({ pressed }) => [
                styles.retryButton,
                pressed && styles.retryButtonPressed,
              ]}
              // Buton dolgusu küçük; dokunma hedefi hitSlop ile büyütülüyor
              // (ErrorBanner'daki "Tekrar dene" ile aynı desen).
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Tekrar dene"
            >
              <Text style={styles.retryText}>Tekrar dene</Text>
            </Pressable>
          ) : (
            <Text style={styles.infoSub}>{rankedPlaces.length} puanlanan</Text>
          )}
        </View>
      </Pressable>

      {/* Özet — kartın kendisinden açılıyor */}
      <MapSummarySheet
        visible={summaryVisible}
        onClose={() => setSummaryVisible(false)}
        onPressRanking={handleSummaryRanking}
        onPressList={handleSummaryList}
        onSeeAllRankings={() => openProfileTab('rankings')}
        onSeeAllLists={() => openProfileTab('lists')}
      />

      {/* Bottom Sheet */}
      <RestaurantBottomSheet
        restaurant={selectedRestaurant}
        onClose={handleCloseSheet}
        onPressDetail={handleOpenDetail}
        googleApiKey={GOOGLE_API_KEY}
      />
    </GestureHandlerRootView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.canvas,
    padding: Spacing['2xl'],
  },
  loadingText: {
    ...Type.body,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },

  // Marker stili yok — standart pinColor kullanılıyor, özel view çizilmiyor.

  // ─── Harita üstü bilgi kartı ───────────────────────────────────────────────
  infoCard: {
    position: 'absolute',
    // top runtime'da insets.top ile veriliyor
    left: Spacing.lg,
    right: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
    // `floating` tam bu kullanım için tanımlı ("harita üstü bilgi kartı").
    // Kart havada durduğu için gölge KALIYOR — tab bar'dan farkı bu.
    ...Elevation.floating,
  },
  // iOS'ta ripple yok; basılı geri bildirimi buradan.
  infoCardPressed: { backgroundColor: Colors.canvas },
  infoLeft: { flex: 1 },
  infoTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xxs,
  },
  infoTitle: {
    ...Type.bodyStrong,
    color: Colors.textPrimary,
    flexShrink: 1,
  },
  infoFallback: {
    ...Type.micro,
    color: Colors.danger,
    marginTop: Spacing.xxs,
  },
  infoError: {
    ...Type.micro,
    color: Colors.danger,
    marginTop: Spacing.xxs,
  },
  // Nötr bildirim — hata değil, o yüzden danger değil.
  infoNotice: {
    ...Type.micro,
    color: Colors.textSecondary,
    marginTop: Spacing.xxs,
  },
  infoRight: { alignItems: 'flex-end' },
  infoSub: {
    ...Type.captionStrong,
    color: Colors.brand,
  },
  retryButton: {
    backgroundColor: Colors.brandSurface,
    borderWidth: 1,
    borderColor: Colors.brandBorder,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.xxs,
  },
  // iOS'ta ripple yok; basılı geri bildirimi buradan geliyor.
  retryButtonPressed: { backgroundColor: Colors.brandSubtle },
  retryText: {
    ...Type.micro,
    color: Colors.brandStrong,
  },
});
