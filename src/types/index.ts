// Supabase Type Definitions for Beli Eats

import type { NavigatorScreenParams } from '@react-navigation/native';

export interface Profile {
  id: string;
  username: string;
  /** migration 004. Daraltılmış select'lerde gelmeyebilir → opsiyonel. */
  full_name?: string | null;
  /** migration 004. En çok 300 karakter (DB CHECK). */
  bio?: string | null;
  avatar_url: string | null;
  created_at: string;
  /** migration 004 + trigger. Daraltılmış select'lerde gelmeyebilir. */
  updated_at?: string;
}

/**
 * `places` tablosu — Google'dan çekilen mekan bilgisinin paylaşılan cache'i
 * (migration 002). Kolonlar birebir DB ile aynı isimde; ara dönüşüm katmanı yok.
 *
 * Yazma yolu YALNIZCA `upsert_place()` RPC'si — tabloda INSERT/UPDATE için RLS
 * politikası yok. Okuma/yazma yardımcıları: `src/lib/placeCache.ts`.
 */
export interface Place {
  place_id: string;
  name: string;
  formatted_address: string | null;
  latitude: number | null;
  longitude: number | null;
  types: string[] | null;
  /** Google'ın ortalaması — kullanıcının kendi puanı değil. */
  google_rating: number | null;
  user_ratings_total: number | null;
  price_level: number | null;
  /** Fotoğraf referansları; kapak = photo_refs[0]. */
  photo_refs: string[] | null;
  /** Faz 3 için ayrılmış; şu an her satırda null. */
  city: string | null;
  /** Google verisinin çekilme anı — TTL kararı buna bakar, updated_at'e değil. */
  fetched_at: string;
  created_at: string;
  updated_at: string;
}

export interface UserRanking {
  id: string;
  user_id: string;
  place_id: string;
  restaurant_name: string;
  rating: number; // 0.5 - 5.0
  rank_index: number;
  review_text: string | null;
  photo_reference: string | null;
  /** Place Details koordinat cache'i — eski satırlarda null olabilir. */
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  profiles?: Profile;
  /**
   * `select '*, places(*)'` ile gelen join. Supabase gömülü kaydı tablo adıyla
   * adlandırır.
   *
   * DİKKAT: PostgREST gömülü kaynağı FK üzerinden çözer. Migration 003 (FK)
   * çalışmadan bu select "Could not find a relationship" hatası verir.
   * O zamana kadar mekan bilgisi ayrı sorguyla alınıyor —
   * `placeCache.getPlaces()`.
   */
  places?: Place | null;
}

/**
 * `lists` tablosu — kullanıcının koleksiyonu (migration 005).
 * Kolonlar birebir DB ile aynı isimde; ara dönüşüm katmanı yok.
 */
export interface List {
  id: string;
  user_id: string;
  /** DB CHECK: 1–100 karakter, boşluk kırpılmış halde. */
  title: string;
  /** DB CHECK: en çok 500 karakter. */
  description: string | null;
  /**
   * Sıralı liste mi? VERİTABANI TARAFINDA HİÇBİR ŞEYİ DEĞİŞTİRMEZ — `position`
   * her iki durumda da dolu. Bu yalnızca arayüzün sözleşmesi: `true` ise sıra
   * numarası gösterilir ve yeniden sıralama açılır.
   */
  is_ordered: boolean;
  created_at: string;
  updated_at: string;
  // Joined fields
  profiles?: Profile;
  /** `select '*, list_items(*)'` ile gelen join. */
  list_items?: ListItem[];
}

/**
 * `list_items` tablosu — bir listedeki tek mekan (migration 005).
 *
 * `user_id` YOK, bilinçli: sahiplik ebeveyn liste üzerinden doğrulanıyor
 * (RLS politikaları `lists.user_id`'ye bakıyor).
 */
export interface ListItem {
  id: string;
  list_id: string;
  place_id: string;
  /**
   * 0 tabanlı sıra. **İSTEMCİ BU ALANI YAZMAZ** — `set_list_item_position`
   * trigger'ı insert'te dolduruyor, yeniden sıralamayı `reorder_list_items()`
   * RPC'si yapıyor (migration 006). `rank_index`'te yaşanan sessiz sıra kaybı
   * bu yüzden burada tekrarlanamıyor.
   */
  position: number;
  created_at: string;
  /** `select '*, places(*)'` ile gelen join. */
  places?: Place | null;
}

/**
 * "Listelerim" ekranının satırı: içeriğin kendisi değil, SAYISI geliyor
 * (`select '*, list_items(count)'`).
 *
 * `List` ile birleştirilmedi çünkü PostgREST aynı alan adını (`list_items`)
 * farklı bir şekille döndürüyor — `[{ count: 3 }]`. Tek tipte toplamak
 * `list_items[0].place_id`'nin derlenip çalışma anında `undefined` olması
 * demekti.
 */
export interface ListWithItemCount extends Omit<List, 'list_items'> {
  list_items: Array<{ count: number }>;
}

/**
 * `diary_entries` tablosu — bir ziyaret (migration 009).
 *
 * `user_rankings` mekan başına TEK satır (kanonik puan + sıra), burası mekan
 * başına SINIRSIZ satır: restoranlar tekrar tekrar ziyaret edilir.
 */
export interface DiaryEntry {
  id: string;
  user_id: string;
  place_id: string;
  /**
   * `date` kolonu — saat YOK, `YYYY-MM-DD` formatında string gelir.
   * `timestamptz` bilinçli olarak seçilmedi: zaman dilimi kayması ziyareti
   * bir gün ötelerdi.
   */
  visited_at: string;
  /**
   * NULLABLE — diary'nin ana kararı. Puansız log yalnızca günlükte görünür,
   * "Puanladıklarım" sıralamasına girmez.
   */
  rating: number | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  /** `select '*, places(*)'` ile gelen join. */
  places?: Place | null;
}

/**
 * Fotoğraf türü — mekan sayfasındaki sekmelerin sözleşmesi.
 * Değerler İNGİLİZCE (şemanın geri kalanı gibi); Türkçe etiketler arayüzde.
 * DB tarafında `place_photos_kind_valid` CHECK kısıtı ile aynı küme
 * (migration 013) — buraya yeni tür eklemek SQL kısıtını da güncellemek demek.
 */
export type PlacePhotoKind = 'menu' | 'food' | 'venue' | 'other';

export interface PlacePhoto {
  id: string;
  user_id: string;
  place_id: string;
  kind: PlacePhotoKind;
  /** Storage yolu — uzun kenar 1280. Public URL'e `photoPublicUrl()` çeviriyor. */
  storage_path: string;
  /**
   * Storage yolu — uzun kenar 400. AYRI kolon, `storage_path`'ten türetilmiyor
   * (gerekçe migration 013'te). Listeler/ızgaralar YALNIZCA bunu kullanmalı:
   * ücretsiz katmanda egress hesabı buna dayanıyor.
   */
  thumb_path: string;
  caption: string | null;
  created_at: string;
  /** `select '*, profiles(*)'` ile gelen join — "kim yükledi" için. */
  profiles?: Profile | null;
}

export interface Follow {
  follower_id: string;
  following_id: string;
  created_at: string;
}

export interface FollowStats {
  followersCount: number;
  followingCount: number;
}


// Google Places Types
export interface PlacePrediction {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

export interface PlaceDetails {
  place_id: string;
  name: string;
  formatted_address: string;
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
  photos?: Array<{
    photo_reference: string;
    height: number;
    width: number;
  }>;
  rating?: number;
  price_level?: number;
  types?: string[];
}

// Activity feed item (friend's rating)
export interface ActivityItem {
  id: string;
  user: Profile;
  ranking: UserRanking;
}

// Navigation Param List Types

/**
 * Profil sekmelerinin anahtarları. `ProfileScreen`'in yerel tipiydi; harita
 * özetindeki "Tümünü gör" doğrudan "Listeler" sekmesini açabilsin diye
 * navigasyon parametresine girdi ve buraya taşındı.
 */
export type ProfileTabKey = 'rankings' | 'diary' | 'lists';

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type TabParamList = {
  HomeTab: undefined;
  SearchTab: undefined;
  MapTab: undefined;
  /**
   * `NavigatorScreenParams` — sekmeye ATLARKEN içindeki ekranı ve onun
   * parametrelerini de verebilmek için. Tek kullanıcısı harita özetindeki
   * "Tümünü gör": `navigate('ProfileTab', { screen: 'MyProfile',
   * params: { tab: 'lists' } })`.
   */
  ProfileTab: NavigatorScreenParams<ProfileStackParamList> | undefined;
};

/**
 * RestaurantDetail üç sekmenin stack'inde birden kayıtlı (Ana Sayfa, Ara, Harita)
 * ve hepsinde aynı parametreleri alıyor. Böylece geri tuşu kullanıcıyı
 * geldiği sekmede tutuyor.
 */
export type RestaurantDetailParams = {
  placeId: string;
  placeName: string;
  photoReference?: string;
};

/**
 * RestaurantDetailScreen'in route tipi — hangi stack'ten açıldığından bağımsız.
 * Ekranı tek bir stack'in param listesine bağlamamak için ayrı tutuluyor.
 */
export type RestaurantDetailStackParamList = {
  RestaurantDetail: RestaurantDetailParams;
};

/**
 * ListDetail de artık İKİ stack'te kayıtlı (Profil, Harita) — `RestaurantDetail`
 * ile aynı durum, aynı çözüm: parametreler tek yerde tanımlı.
 */
export type ListDetailParams = {
  listId: string;
  /**
   * Başlık ve `isOrdered` parametreyle taşınıyor, ekran liste satırı için AYRI
   * SORGU ATMIYOR: başlık ilk karede doğru yazsın ve satırlar iki kez (önce
   * numarasız, sonra numaralı) çizilmesin diye.
   *
   * Bu bir ANLIK GÖRÜNTÜ. Bugün güvenli — listeyi düzenleyen ekran yok.
   * `EditList` geldiğinde ya `setParams` ile burası güncellenmeli ya ekran
   * tek-liste fetch'ine geçmeli; aksi halde başlık düzenlendikten sonra bayat
   * kalır.
   */
  title: string;
  isOrdered: boolean;
  /**
   * Liste açıklaması — başlığın altında gösteriliyor. `title`/`isOrdered` ile
   * aynı anlık görüntü kuralına tabi: üç çağrı yerinin (Profil, harita özeti,
   * yeni liste) üçünde de veri zaten elde, ekran bunun için sorgu ATMIYOR.
   */
  description?: string | null;
};

/**
 * ListDetailScreen'in route/navigation tipi — hangi stack'ten açıldığından
 * bağımsız. Ekranın ihtiyacı iki rota: kendisi ve mekan detayı; ikisi de her
 * iki stack'te kayıtlı.
 */
export type ListDetailStackParamList = {
  ListDetail: ListDetailParams;
  RestaurantDetail: RestaurantDetailParams;
};

/**
 * Başka bir kullanıcının profili.
 *
 * `username` PARAMETREYLE taşınıyor: başlık şeridi ilk karede doğru yazsın,
 * profil sorgusu dönene kadar "—" görünmesin. `ListDetail`'in `title`'ı ve
 * `EditProfile`'ın alanlarıyla aynı ANLIK GÖRÜNTÜ kararı — çağıranın elinde
 * zaten var, ikinci bir sorgu atmaya gerek yok.
 *
 * Bayatlama riski YOK: kullanıcı adı bu ekrandan değiştirilemiyor (kendi
 * profilinde bile kilitli, bkz. `EditProfileScreen`).
 */
export type UserProfileParams = {
  userId: string;
  username: string;
};

/**
 * Takipçi / takip edilen listesi — Faz 3 / Diff C.
 *
 * TEK EKRAN, İKİ SEKME (`ListFormScreen`'in "tek ekran iki mod" kararıyla aynı
 * aile). `initialType` hangi sekmeyle açılacağını söylüyor: kullanıcı
 * "Takipçi" sayacına bastıysa takipçiler, "Takip"e bastıysa takip edilenler.
 *
 * ⚠️ `ProfileScreen`'in `tab` parametresinden FARKLI: orası sekmenin KÖKÜ
 * olduğu için parametre bir kerelik istek ve uygulandıktan sonra
 * `setParams({ tab: undefined })` ile TEMİZLENMEK ZORUNDA. Burası her seferinde
 * push edilip geri dönüşte unmount olduğundan öyle bir sorun doğmuyor —
 * temizlemeye gerek yok.
 */
export type FollowersListParams = {
  userId: string;
  /** Başlıkta gösteriliyor: kimin listesine bakıyoruz. */
  username: string;
  initialType: 'followers' | 'following';
};

/**
 * Tek bir günlük girişinin ("ziyaret") detay ekranı — Faz 3 / Diff E.
 *
 * ── NEDEN ANLIK GÖRÜNTÜ, NEDEN AYRI SORGU YOK ────────────────────────────────
 * Çağıran (günlük satırı) elinde ZATEN tam `DiaryEntry` var ve o liste az önce
 * çekildi. Alanları parametreyle taşımak ekranı ilk karede eksiksiz çiziyor;
 * `ListDetail` ve `EditProfile` ile aynı karar. Yalnızca BEĞENİ bilgisi
 * sunucudan okunuyor — o gerçekten tazelenmesi gereken tek şey.
 *
 * ⚠️ BAYATLAMA RİSKİ VAR VE KABUL EDİLDİ: giriş sahibi tarafından
 * düzenlenebiliyor. Ama düzenleme yolu kendi profilindeki uzun basış menüsü,
 * yani bu ekran açıkken erişilemiyor; kullanıcı listeye döndüğünde liste
 * yeniden çekiliyor. `ListDetail`'in `title`'ıyla aynı sınıf, aynı kabul.
 *
 * `DiaryEntry` nesnesinin TAMAMI geçilmiyor, alanlar tek tek: rota tipini
 * veritabanı satırının şekline bağlamak, kolon değişince navigasyonu da
 * kırardı.
 */
export type DiaryEntryDetailParams = {
  entryId: string;
  /** Yazar — profiline gitmek ve "kendi girişim mi" kontrolü için. */
  authorId: string;
  authorUsername: string;
  /** Mekan — sayfasına gitmek ve fotoğrafları süzmek için. */
  placeId: string;
  placeName: string;
  photoReference?: string;
  /** `YYYY-MM-DD`. Bkz. src/lib/date.ts — bu alan hiçbir zaman UTC'ye çevrilmez. */
  visitedAt: string;
  rating: number | null;
  note: string | null;
};

export type HomeStackParamList = {
  Home: undefined;
  RestaurantDetail: RestaurantDetailParams;
  /**
   * "En Çok Puanlayanlar" satırlarından açılıyor. `ProfileStack`'teki kayıtla
   * AYNI ekran, ayrı kayıt — `RestaurantDetail`'in dört stack'teki durumuyla
   * aynı desen ve aynı gerekçe: geri tuşu gelinen sekmede tutuyor.
   */
  UserProfile: UserProfileParams;
  /**
   * `UserProfile`'ın "Listeler" sekmesinden açılıyor — yani bu kayıt
   * `UserProfile`'ın ZORUNLU EŞLİKÇİSİ. Olmadan liste kartına dokunmak
   * çalışma anında patlardı; bu dosyanın en başındaki uyarının tam tersi
   * yönde aynı tuzak (rota ilan edilmemiş ama `navigate` çağrılıyor).
   * `ListDetail` artık ÜÇ stack'te: Profil, Harita, Ana Sayfa.
   */
  ListDetail: ListDetailParams;
  /**
   * `UserProfile`'ın "Günlük" sekmesinden açılıyor — `UserProfile`'ın ikinci
   * zorunlu eşlikçisi (`ListDetail` gibi). Faz 3 / Diff D'de aktivite akışı da
   * buraya gelecek.
   */
  DiaryEntryDetail: DiaryEntryDetailParams;
  /** `UserProfile`'ın takipçi/takip sayaçlarından açılıyor. */
  FollowersList: FollowersListParams;
};

export type SearchStackParamList = {
  Search: undefined;
  RestaurantDetail: RestaurantDetailParams;
};

export type MapStackParamList = {
  Map: undefined;
  RestaurantDetail: RestaurantDetailParams;
  /**
   * Harita özetinden bir listeye dokunulunca açılıyor. `ProfileStack`'teki
   * kayıtla AYNI ekran, ayrı kayıt: projenin kuralı "geri tuşu gelinen sekmeye
   * döner" — sekme atlatmak yerine ekranı ikinci stack'e kaydetmek
   * (`RestaurantDetail`'in dört stack'teki durumuyla aynı desen).
   */
  ListDetail: ListDetailParams;
};

/**
 * Profil sekmesinin stack'i.
 *
 * BURADA YALNIZCA GERÇEKTEN KAYITLI EKRANLAR İLAN EDİLİR. Bu tip bir dönem
 * `EditProfile` / `UserProfile` / `FollowersList` / `FollowingList` ilan
 * ediyordu ve dördünün de ekranı yoktu — `ProfileStack.tsx` tam olarak bu
 * yüzden silinmişti (var olmayan ekranları import ediyordu). Tip tarafında aynı
 * yalanı sürdürmek `navigation.navigate('EditProfile')` çağrısını DERLETİR ve
 * çalışma anında patlatır. Faz 3 o rotaları EKRANLARIYLA BİRLİKTE geri getirir.
 */
export type ProfileStackParamList = {
  /**
   * Kendi profil sayfası.
   *
   * `tab` opsiyonel bir AÇILIŞ İSTEĞİ: verilirse ekran o sekmeyle açılıyor,
   * sonra ekran parametreyi TEMİZLİYOR (`setParams`). Temizlenmezse kullanıcı
   * sekmeyi elle değiştirip ekrana geri döndüğünde eski istek tekrar uygulanır.
   */
  MyProfile: { tab?: ProfileTabKey } | undefined;
  /**
   * Profil düzenleme — modal.
   *
   * Mevcut değerler PARAMETREYLE taşınıyor (`ListForm` ile aynı karar):
   * çağıran `ProfileScreen`'in elinde zaten tam profil satırı var, ekranın
   * ayrı sorgu atmasına gerek yok ve alanlar ilk karede dolu geliyor.
   *
   * `username` düzenlenebilir DEĞİL — yalnızca kilitli olarak gösteriliyor;
   * gerekçesi `EditProfileScreen`'in başında (unique kısıt + migration 012'nin
   * sonek mantığı yalnızca kayıt anında çalışıyor).
   */
  EditProfile: {
    username: string;
    fullName: string | null;
    bio: string | null;
  };
  /**
   * Liste formu — modal. TEK ekran iki iş yapıyor:
   *   parametresiz  → yeni liste
   *   `listId` ile  → o listeyi düzenle (alanlar dolu gelir)
   *
   * Rota adı bilinçli olarak `CreateList` DEĞİL: `navigate('CreateList',
   * { listId })` yaptığı işi yanlış anlatan bir çağrı olurdu. Bu projede tip
   * ve isim yalanları (bkz. `ProfileStack`'in hayalet rotaları) daha önce
   * pahalıya patladı.
   *
   * Düzenleme verisi parametreyle taşınıyor, ekran ayrı sorgu atmıyor —
   * çağıran (Profil) elinde zaten tam satır var.
   */
  ListForm:
    | {
        listId: string;
        title: string;
        description: string | null;
        isOrdered: boolean;
      }
    | undefined;
  /** Tek bir listenin içeriği — parametreleri `ListDetailParams`'ta. */
  ListDetail: ListDetailParams;
  /**
   * Mekan detayı — ekran artık DÖRT stack'te kayıtlı (Ana Sayfa/Ara/Harita/Profil).
   * `RestaurantDetailParams`'ın paylaşılan tip olmasının sebebi tam olarak bu.
   * Profil tarafında iki giriş noktası var: sıralama satırı ve liste öğesi.
   */
  RestaurantDetail: RestaurantDetailParams;
  /**
   * Başka bir kullanıcının profili. Bugün buraya `HomeStack`'ten değil, ileride
   * `FollowersList`'ten gelinecek; `ProfileStack`'e şimdiden kaydedilmesinin
   * sebebi profil sekmesinden açılan her yolun kendi stack'inde kalması.
   *
   * ⚠️ Kural hatırlatması: bu listeye YALNIZCA gerçekten yazılmış ekranlar
   * girer. Var olmayan bir rota ilan etmek `navigate()` çağrısını DERLETİR ve
   * çalışma anında patlatır — bu dosya bir kez tam bu yüzden budanmıştı.
   * `FollowersList` hâlâ yok, o yüzden hâlâ burada değil.
   */
  UserProfile: UserProfileParams;
  /**
   * Tek bir ziyaretin detayı. Profil sekmesinde İKİ çağıranı var: kendi
   * "Günlük" sekmen ve `UserProfile`'ınki.
   */
  DiaryEntryDetail: DiaryEntryDetailParams;
  /**
   * Takipçi / takip edilen listesi. Burada da İKİ çağıranı var: kendi profil
   * başlığındaki sayaçlar ve `UserProfile`'ınkiler.
   *
   * ⚠️ Bu rota bir dönem "var olmayan ekranı ilan etme" örneği olarak bu
   * dosyadan SİLİNMİŞTİ. Artık ekranıyla birlikte geri geldi — kural aynı:
   * yalnızca gerçekten yazılmış ekranlar burada durur.
   */
  FollowersList: FollowersListParams;
};
