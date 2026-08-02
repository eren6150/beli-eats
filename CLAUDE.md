@AGENTS.md

# Beli-Eats

## Ürün Vizyonu
Konum tabanlı restoran keşif ve sosyal puanlama uygulaması. Kullanıcı çevresindeki
restoranları harita üzerinden keşfeder, puanlar, listeler ve takip ettiği kişilerle paylaşır.

**Letterboxd'un filmler için yaptığını restoranlar için yapmak.** Kullanıcının sıralı bir
"puanladıklarım" listesi, kendi oluşturduğu koleksiyonları, ziyaret günlüğü (diary) ve
takip ettiği kişilerin aktivite akışı olacak.

### Görsel/UX referansları
| Referans | Ne için |
|---|---|
| **Midas** | Arayüz kalitesi, sadelik, tipografi hiyerarşisi, boşluk kullanımı |
| **Instagram** | Profil header yapısı, kart tasarımı |
| **Letterboxd** | Listeler, diary, puanlama estetiği |
| **Beli** | Mekan sayfasında kullanıcı çekimi menü fotoğrafları, leaderboard |

"Beli-Eats" ismi **geçici** — marka kimliği bilinçli olarak en sona bırakıldı (Faz 4).

## Tech Stack
- Frontend: React Native + Expo SDK 54, TypeScript
- Backend & DB: Supabase (PostgreSQL + Auth; Storage ileride, fotoğraflar için)
- Harita/Lokasyon: Google Maps API + Places API, react-native-maps 1.20.1
- Animasyon: react-native-reanimated ~4.1.1 + react-native-worklets 0.5.1
- Navigasyon: @react-navigation v7 (bottom-tabs + native-stack)
- Tarih seçici: @react-native-community/datetimepicker 8.4.4 (günlük girişi)
- Proje kök dizini: C:\proje\kodlama\beli-eats

## Ortam Notları (önemli)
- **`node` PATH'te değil.** Bu oturumda doğrulandı: `node --version` → command not found.
  Binary: `C:\tmp\node22_extract\node-v22.17.0-win-x64\node.exe`
  Typecheck komutu (PowerShell):
  ```
  $node = "C:\tmp\node22_extract\node-v22.17.0-win-x64\node.exe"; & $node ".\node_modules\typescript\lib\tsc.js" --noEmit
  ```
  (Kullanıcı PATH'e eklediğini belirtti ama Claude'un shell'inde görünmüyor — tam yolu kullan.)
- **Her kod değişikliğinden sonra typecheck çalıştır.**
- Supabase anahtarları `.env` içinde, `.gitignore`'da. `app.config.ts` dinamik config
  (API key enjeksiyonu burada), `app.json` statik kısım.
- Expo Go SDK 54 yalnızca New Architecture destekliyor.
- **Claude uygulamayı çalıştıramıyor** — fiziksel Android cihaz kullanıcıda. Görsel/davranışsal
  doğrulamayı kullanıcıdan iste ve neye bakması gerektiğini açıkça söyle.

## Mimari Notlar

### Veri / Backend
- Auth: kayıt/giriş aktif; test amaçlı zorunlu e-posta onayı Supabase panelinden kapatıldı
- Takip sistemi: `follows` tablosu (`follower_id`, `following_id`)
- **Migration'lar elle çalıştırılıyor** (Supabase SQL Editor). Sıfırdan kurulum sırası
  `supabase_schema.sql` başında yazılı:
  `schema` → `001_coords` → `002_places` → `003_places_fk` → `004_profile_fields` →
  `005_lists` → `006_reorder_list_items` → `007_move_list_items` →
  `008_move_list_items_copy` → `009_diary_entries` → `010_log_diary_entry` →
  `011_update_diary_entry`.
  Migration DDL'i schema.sql'e kopyalanmıyor — iki kopya RLS/fonksiyon tanımlarında
  sessiz drift demek.
- **SQL Editor'da `auth.uid()` null döner** (orada oturum yok), yani RLS'e veya
  `auth.uid()`'e dayanan her kontrol bloğu boşa çalışır. Çözüm, işlemin başında
  geçici oturum simüle etmek:
  `set local request.jwt.claim.sub = '<kullanıcı-uuid>';`
  Migration 009/010 bu şekilde doğrulandı. **"Başkasının verisi" senaryoları yine
  test EDİLEMEZ** — bunun için ikinci bir gerçek hesapla uygulamadan denemek gerekiyor.
- **`profiles` kolonları migration 004'te tamamlandı**: `full_name`, `bio` (nullable,
  CHECK ile 100/300 karakter sınırı), `updated_at` (not null + trigger). Öncesinde
  bu üçü **şemada yoktu** ama kod var sayıyordu: `Profile` tipi `full_name?`/`bio?`
  ilan ediyordu (opsiyonel oldukları için tsc susuyordu, sessizce hep `undefined`
  geliyordu) ve `useProfile.updateProfile` var olmayan `updated_at`'e yazıyordu —
  ilk çağrıldığında patlayacaktı. `updated_at` mevcut satırlara `created_at`'ten
  dolduruldu; `default now()` ile eklemek "bugün güncellendi" yalanı olurdu.
- `user_rankings.latitude`/`longitude` (migration 001) **artık okuma yolunda
  kullanılmıyor**; `places` kanonik kaynak. Kolonlar fallback olarak duruyor,
  bir faz sonra düşürülecek. Aynı şey `restaurant_name` ve `photo_reference` için de
  geçerli.
- `addOrUpdateRanking` `rank_index`'i yerel state'ten değil **veritabanından** hesaplıyor.
  Mevcut kayıt güncellenirken sıra korunur, yeni kayıt sona eklenir. (Eskiden liste boşken
  `rank_index` sessizce 0'a düşüyor, sıralama bozuluyordu — veri kaybıydı.)
- Hatalar yüzeye çıkıyor: hook'lar `error` döndürüyor, ekranlar kırmızı uyarı şeridi /
  "Tekrar dene" gösteriyor.
- **Hata mesajı kuralı (adım 7'de kondu): ekrana kısa ve eyleme dönük metin, konsola tam
  nesne.** Ham `error.message` bir kullanıcı metnine ŞABLONLANMAZ. İki yerde bu ihlal
  ediliyordu ve ikisi de ham ağ/native mesajını ekrana sızdırıyordu:
  `MapScreen`'in `Puanlanan mekanlar okunamadı: ${error.message}`'ı ve `useLocation`'ın
  `Konum hatası: ${e.message}`'ı. Şimdi ikisi de sabit kısa metin gösteriyor, teknik
  detay zaten var olan `console.error`/`console.warn` satırında duruyor.
  - **`PlacesError` hiçbir zaman ekrana ulaşmıyordu** — o zincir baştan doğruydu:
    `places.ts` uzun teknik metni fırlatıyor, `MapScreen`'in `catch`'i logluyor ve
    sabit kısa bildirim gösteriyor.
  - Kurulum hataları (API key yok) da aynı kurala tabi: `.env`/Metro adımları
    geliştiriciye ait, `console.warn`'a gider; kullanıcı "Mekan detayları şu an
    kullanılamıyor." görür.
  - **Konsol seviyesi de ayrışıyor: beklenen durumlar `console.warn`, gerçek
    hatalar `console.error`.** `addPlaceToList`'in `23505`'i (mekan listede zaten
    var) ele alınmış bir senaryo — çağıran onu bilgi olarak kullanıp satırı
    "Eklendi" yapıyor. `console.error` ile loglamak geliştirme modunda LogBox'ın
    kırmızı ekranını gereksiz yere tetikliyordu. Aynı ayrım `useLocation`'da da
    var. Ağ / FK / bilinmeyen Postgres hataları `console.error` olarak kalıyor.
  - **Hata türü AYRIŞTIRILMIYOR.** "Bağlantı yok" ile "sunucu hatası"nı ayırmak
    `error.message`'ı regex'lemek veya `error.code`'un varlığına bakmak demek — ikisi de
    kırılgan. Tek kısa mesaj + "Tekrar dene" ikisini de doğru karşılıyor. Metinler bu
    yüzden teşhis koymuyor: "Bağlantını kontrol et", "Bağlantı yok" değil.

### `places` cache tablosu (Faz 1a — TAMAMLANDI)
Google'dan çekilen mekan bilgisinin paylaşılan cache'i. Migration 002 + 003.
Faz 2'nin `diary_entries` / `lists` / `list_items` / `place_photos` tablolarının hepsi
buna bağlanacak.

- **PK `place_id text`** (ayrı uuid değil): her yazma/okuma yolunda `place_id` zaten
  elimizde, uuid ara katmanı her yazma öncesi bir çözümleme sorgusu demekti.
  Place ID'lerin değişme riski çocuk FK'daki `on update cascade` ile karşılanıyor.
- **Üç katmanlı cache** — hepsi `src/lib/placeCache.ts` içinde:
  `L1 modül belleği` → `L2 places tablosu (kalıcı)` → `L3 Google`
  - L1 bir modül seviyesi `Map<string, Place>`, 200 kayıtta FIFO tahliye.
    `peekPlace(placeId)` onu **senkron** okur — hiç I/O yapmaz.
  - `peekPlace` iki işe yarıyor: (a) ekranlar `useState(() => peekPlace(id))` ile
    doğru veriyle başlıyor, cache hit'te spinner hiç görünmüyor; (b) `MapScreen`
    POI türünü aynı karede öğrenip yeme-içme filtresini gecikmesiz uyguluyor.
  - `MapScreen`'de bir dönem `poiCacheRef` adında **ikinci** bir bellek katmanı vardı;
    L1 eklendikten sonra gereksizleşti ve sakladığı `RestaurantSheetData` tipinde
    `types` olmadığı için filtreye de yetmiyordu. Silindi.
- **TTL** (`placeCache.ts`): `fetched_at`'e göre
  - `< 7 gün` **fresh** → Google'a hiç gidilmez
  - `7–30 gün` **stale** → cache HEMEN gösterilir, arka planda yenilenir
    (`onRevalidated` callback'i ile ekran kendini tazeler)
  - `> 30 gün` **expired** → cache miss gibi davranılır, gösterimden ÖNCE yenilenir
- **30 gün sert sınırın sebebi lisans, performans değil.** Google Maps Platform hizmet
  şartları `place_id` dışındaki içeriğin süresiz saklanmasına izin vermiyor (place_id
  açık istisna, diğerleri ~30 gün). `user_rankings` koordinatları bu kuralın dışındaydı;
  `places` + `fetched_at` o boşluğu da kapattı.
- **Yazma yolu YALNIZCA `upsert_place()` RPC'si.** Tabloda INSERT/UPDATE için RLS
  politikası **yok** — istemci doğrudan yazamıyor. Sebep: anon key JS bundle'ında,
  "authenticated herkes UPDATE edebilir" bir mekanın adını çöple değiştirmeye açık yüzey
  olurdu. RPC `security definer` + `set search_path` (bu satır atlanmamalı, search_path
  hijacking'e karşı), girdiyi doğruluyor, `fetched_at`'i istemciye bıraktırmıyor.
  SELECT serbest (`using (true)`) — profiles/user_rankings ile tutarlı.
- **`fetched_at` ile `updated_at` ayrı.** `updated_at` bizim satırımızın son değişimi;
  TTL kararı `fetched_at`'e bakar. Bindirmek, alakasız bir kolon güncellemesinin cache'i
  "taze" göstermesine yol açardı.
- **`city` kolonu var ama her satırda null.** Faz 3 (şehir değiştirici + şehir
  leaderboard) için ayrılmış slot. Doğru kaynağı `address_components`;
  `formatted_address` parse etmek güvenilmez.
- Nihai doğru çözüm (bu fazda değil): Google çağrılarını Supabase Edge Function
  arkasına almak — hem yazmayı tamamen sunucuya taşır hem "API key bundle'da" açık
  işini kökten çözer.

### Google Places
- Tüm çağrılar `src/lib/places.ts` üzerinden. Her çağrıda `json.status` kontrol ediliyor;
  `REQUEST_DENIED` / `OVER_QUERY_LIMIT` gibi durumlar Türkçe açıklamalı `PlacesError`
  fırlatıyor. (Daha önce hatalar üç ayrı yerde sessizce yutuluyordu.)
- **`getPlaceDetails` artık YALNIZCA `placeCache.ts`'ten çağrılıyor.** Tüm Place Details
  trafiği tek noktadan geçiyor; TTL/cache mantığını atlayan bir yol yok. Yeni bir ekran
  mekan bilgisi istediğinde `resolvePlace()` kullanmalı, `getPlaceDetails` doğrudan değil.
- **Tek alan maskesi: `PLACE_DETAIL_FIELDS`** (`placeCache.ts`). Eskiden POI dokunuşu ve
  detay ekranı farklı maske kullanıyordu → ortak cache yok → aynı mekan iki kez
  çekiliyordu. Artık ikisi aynı cache satırını paylaşıyor.
- **SKU:** `rating`, `user_ratings_total`, `price_level` **Atmosphere Data** katmanı
  (en pahalı, Basic'in üzerine eklenir). `geometry`/`types`/`formatted_address`/`photos`
  Basic. Maskede tek bir Atmosphere alanı varsa çağrının tamamı o katmandan faturalanır —
  yani üçünü birlikte almanın tek birine göre **ek maliyeti yok**. `opening_hours` /
  `website` / telefon bilinçli olarak alınmıyor (Contact SKU'su, hiçbir ekran göstermiyor).
  Places Photo ayrı bir SKU ve `places` tablosu onu azaltmıyor — biz referansı saklıyoruz,
  baytları değil.
- `src/lib/places.ts` Supabase'i **tanımıyor** (saf Google istemcisi); `placeCache.ts`
  ikisini birleştiren katman. Bu ayrım korunmalı.
- Sorgulara `locationbias` eklendi (sonuçlar Türkiye/Ankara'ya öncelikli)
- API'den dönen ham metinler/anlamsız karakterler filtreleniyor
- `nearbySearch()` fonksiyonu duruyor ama **çağrılmıyor** — ileride "bu bölgede ara" için bırakıldı

### Tasarım sistemi (Faz 1b)
`src/constants/theme.ts` — **iki katmanlı**: `Palette` (ham ramp'ler) → `Colors`
(anlamsal token'lar) → ekranlar.

- **Ekranlar YALNIZCA `Colors` / `Type` / `Spacing` / `Radius` / `Elevation` import eder.**
  `Palette`'e doğrudan erişmek yasak — o zaman marka rengini değiştirmek tekrar dosya
  taramasına döner.
- Ramp'ler Tailwind ölçeğinden: `green`, `gray`, `amber`, `red`. Kodda kullanılan
  renklerin neredeyse tamamı zaten bu ramp'lerin üyesiydi, biz onları isimlendirmemişiz.
  Üç kaçak düzeltildi: `#D1FAE5` (emerald-100 → green-100), `#FEF9C3` (yellow-100 →
  amber-100), `#F0F0F0` (hiçbir ramp'te yoktu → gray-100).
- **Marka rengi tek nokta**: `Palette.green` ramp'i değişince `brand` / `brandStrong` /
  `brandSubtle` / `brandSurface` / `brandBorder` birlikte döner. Öncesinde kodda dört
  ayrı açık yeşil vardı ve `Colors.primary` değişse üçü yeşil kalıyordu.
- **Dark mode İNŞA EDİLMİYOR.** Token isimleri anlamsal (`surface`, `textPrimary`,
  `canvas`) ki kapı açık kalsın; eski `card`/`background`/`text` isimleri bunu kapatıyordu.
- **`Type` — 8 rol**: `display` / `title` / `heading` / `body` / `bodyStrong` / `caption` /
  `captionStrong` / `micro`. Her rol `fontSize + lineHeight + fontWeight` üçlüsünü
  **birlikte** taşıyor; tutarlılık kademe sayısından değil bu eşleşmenin her yerde aynı
  olmasından geliyor.
  - `captionStrong` (13/18/600) **adım 7'de eklendi**. Üç ayrı yer (iki auth ekranının
    form etiketleri, `MapScreen`'in "N puanlanan" sayacı) 13px + 600 istedi; `caption`
    13/400, `micro` 11/600 — ikisi de karşılamıyordu ve üçü de kalınlığını kaybediyordu.
    **Rol eklemek, ekranda `fontWeight` override yazmaktan iyi**: override'lar
    "üçlü birlikte gelir" ilkesini deler ve tek tek kayar. Yeni bir rol ihtiyacı
    doğduğunda ölçüt bu: **ikiden fazla yerde** aynı eşleşme isteniyorsa rol olur.
- **`Elevation` kullanım adlı**: `card` / `floating` / `sheet` / `modal` / `brand`.
  `sheet` gölgeyi **yukarı** atıyor (offset -4, elevation 20) — bottom sheet aşağıdan
  geliyor.
- **LEGACY blokları SİLİNDİ (adım 7).** `FontSize`, `FontWeight`, `Shadow` ve 15
  deprecated renk (`primary`, `card`, `background`, `text`, `border`, `textTertiary`, …)
  artık yok. Bir token'ın iki adı olması, ikisinin zamanla ayrışması demekti.
  Geçişin son dört dosyası: `RootNavigator`, `SkeletonLoader`, `detailStackOptions`,
  `SearchScreen` (hepsi birebir aynı değere sahip yeni token'lara taşındı → görsel
  değişiklik sıfır).
- **Midas kararları**: kart ayrımı gölge yerine ince kenarlık + yüzey kontrastı;
  dekoratif renk yok (renk yalnızca marka, puanlama, durum); header gölgeleri kaldırıldı.
  Adım 7'de bu karar üç yere daha uygulandı: tab bar gölgesi kaldırıldı (`borderTopWidth: 1`
  kaldı), iki auth ekranının `formCard` gölgesi 1px kenarlığa döndü.
  **Kalan gölgeler bilinçli:** harita üstü bilgi kartı (`Elevation.floating` — havada
  duruyor), birincil buton (`Elevation.brand`), bottom sheet (`Elevation.sheet`).
- **Spacing kuralı**: layout ölçüsü ham sayı olarak yazılmaz. Tek istisna `StarRating`'in
  glif matematiği (optik hizalama, gerekçesi o dosyanın yorumunda) ve 1px kenarlıklar.
- **`TextInput`'a `...Type.X` SPREAD ETME.** `lineHeight` bir `TextInput`'a verildiğinde
  Android'de metni dikeyde kırpabiliyor (`StarRating`'de aynı sınıf sorun yaşanmıştı).
  İki auth ekranının `input` stili `fontSize`/`fontWeight`'i token'dan **tek tek** okuyor;
  değer yine tek kaynaktan geliyor, riskli özellik dışarıda kalıyor.

**İkonlar**: `@expo/vector-icons` (Ionicons), `src/components/ui/Icon.tsx` sarmalayıcısı
üzerinden. Ekranlar **anlamsal isim** kullanır (`location`, `rating`), glif ismi değil
(`location-outline`) — ikon seti değişirse tek dosya değişir. Yeni ikon eklerken haritaya
anlamsal isim ekle, ekranda glif ismi yazma.
- `@expo/vector-icons` `expo`'nun bağımlılığı ama **hoist edilmemiş** olarak kurulabiliyor
  (`node_modules/expo/node_modules/@expo/vector-icons`), o durumda uygulama kodundan
  import edilemez. `npx expo install @expo/vector-icons` ile doğrudan bağımlılık yapıldı.
- `StarRating`'deki `★` glifi **bilinçli olarak kalıyor**: yarım yıldız, dolu yıldızın
  kırpılmış kopyasıyla çiziliyor (fonttan bağımsız). İkon setine geçmek o çözümü bozar.

**Paylaşılan primitive'ler** (`src/components/ui/`): `Icon`, `Chip` (4 variant + opsiyonel
ikon), `ErrorBanner` (mesaj + opsiyonel `onRetry`), `SectionHeader` (başlık + alt yazı +
`badge` bilgi metni **veya** `actionLabel` butonu), `SegmentedTabs` (generic; Faz 2'de
fotoğraf türü sekmeleri aynısını kullanacak), `EmptyState` (`icon` tercih edilen,
`emoji` deprecated), `SkeletonLoader`, `StarRating`, `RestaurantCard`.
`src/components/profile/`: `ProfileHeader`, `RankRow`.

**İlke: bugün kullanılanı inşa et, geleceği spec'e yaz.** Faz 2 kompozitleri
(`ListCard`, `DiaryRow`, `PhotoGrid`) kod olarak yazılmadı — kullanılmayan bileşen ölü
kod olur. `RankRow` ve `SegmentedTabs` inşa edildi çünkü bugün kullanılıyorlar.

### Konum
- `useLocation`: try/catch/finally + 10sn timeout + `getLastKnownPositionAsync` ile hızlı
  ilk fix + `retry()`. Eskiden hata yakalanmadığı için sonsuz "Konum alınıyor..." spinner'ında
  kilitlenebiliyordu.
- `fitToCoordinates` ile tüm pinler kadraja sığdırılıyor

### Navigasyon
Her sekme kendi stack'ine sahip; geri tuşu her zaman gelinen sekmeye döner.

```
TabNavigator
├─ HomeTab   → HomeStack   (Home,   RestaurantDetail)
├─ SearchTab → SearchStack (Search, RestaurantDetail)
├─ MapTab    → MapStack    (Map,    RestaurantDetail)
└─ ProfileTab→ ProfileStack (MyProfile, ListForm, ListDetail, RestaurantDetail)
```
`ListDetail` ayrıca `MapStack`'te, `RestaurantDetail` dört stack'in hepsinde kayıtlı.
- `src/navigation/detailStackOptions.ts` — üç stack'in ortak `screenOptions`'ı
  (kopyala-yapıştır kaymasını önlemek için)
- **Sekmeler arası geri davranışı: `backBehavior="history"`** (2026-08-01'de değişti).
  Geri (tuş veya Android sistem geri jesti) **bir önce fiziksel olarak bulunulan yere**
  dönüyor, sekmeler arası dahil; kullanıcı geldiği yolu geri yürüyüp en sonunda Ana
  Sayfa'ya ulaşıyor ve oradan bir geri daha uygulamadan çıkarıyor.
  - **Öncesinde `TabRouter`'ın varsayılanı `firstRoute` idi** (`@react-navigation/routers/src/TabRouter.tsx:197`):
    odaklanmış sekmenin indeksi 0 değilse geçmişe ilk sekme konuyor, yani hangi sekmede
    olursan ol geri **doğrudan Ana Sayfa'ya** atlıyordu. Bu bir dönem **Instagram deseni**
    (sekme → Ana → çıkış) gerekçesiyle bilinçli olarak korunmuştu.
  - **Gerekçe değişti**: harita özetinden Profil'e atlayıp geri dönmek gibi sekmeler
    arası akışlar çoğaldıkça, "beklenen doğal geri gezinme" Instagram taklidine tercih
    edildi. Kullanıcı kararı, ürün kararı — teknik bir zorunluluk değil.
  - **Bu ayar YALNIZCA sekme seviyesini belirler.** Sekmenin içindeki stack'ten pop
    etmek her zaman önce gelir; `history` bir ekranın geri tuşunu değiştirmez.
  - Davranış dört sekmede de aynı ve `ProfileStack` eklenmeden önce de öyleydi —
    sekmenin içinde stack olup olmaması router'ı ilgilendirmiyor.
  - **Android'de native-stack'in swipe-back'i YOKTUR** (`gestureEnabled` `@platform ios`,
    "Only supported on iOS"). Kenardan kaydırma = Android sistem geri jesti = geri tuşu.
    Bu ikisini karıştırmak bir tur kaybettirdi.
- **`RestaurantDetail` header'ı tamamen kapalı** (`headerShown: false`); hero fotoğraf
  tam kanamalı ve geri butonunu ekranın kendisi çiziyor.
  **Tuzak:** burada bir dönem `headerTransparent: true` + `title: ''` vardı.
  `headerTransparent` header'ı **gizlemez** — arka planını saydamlaştırıp içeriğin
  üstünde yüzdürür, native geri butonu durmaya devam eder. Sonuç: ekranda iki geri
  butonu. Header'ı kapatan property yalnızca `headerShown`.
- `RestaurantDetailParams` ortak tip; `RestaurantDetailStackParamList` ekranın route tipi
  (tek stack'e bağlı değil)
- Safe area: `SafeAreaProvider` kökte, ekranlar `react-native-safe-area-context`'ten
  `SafeAreaView` kullanıyor (RN çekirdeğininki Android'de no-op'tu), tab bar gerçek alt
  inset'i hesaba katıyor
- `app.json` → `app.config.ts` geçişi yapıldı: statik JSON'da `${EXPO_PUBLIC_...}`
  interpolate edilmiyordu, Google Maps key artık doğru enjekte ediliyor.
  `newArchEnabled: false` kaldırıldı (SDK 54'te New Arch zaten varsayılan)
- **`ProfileStack.tsx` bir kez SİLİNMİŞTİ** (ölü kod: var olmayan ekranları import
  ediyordu), Faz 2 / Diff A'da **gerçek ekranlarla geri geldi**. Kural aynı kaldı:
  hem `ProfileStack.tsx`'e hem `ProfileStackParamList`'e YALNIZCA yazılmış ekranlar
  girer. Tipte var olmayan bir rota ilan etmek `navigate('X')` çağrısını **derletir**
  ve çalışma anında patlatır — o yüzden `EditProfile` / `UserProfile` / `FollowersList`
  hâlâ yok, Faz 3 onları ekranlarıyla birlikte getirecek.
- `CreateList` `presentation: 'modal'` ile sunuluyor ama **native header açmıyor**
  (`headerShown: false`); ekran kendi "İptal / Yeni Liste / Oluştur" şeridini çiziyor —
  uygulamadaki hiçbir ekran header göstermiyor.

### Harita / Marker — KAPALI, TEKRAR AÇMA
- **Puanlanan mekanlar**: standart `<Marker pinColor="#22C55E" />`. Özel marker view'ı
  **bilinçli olarak kullanılmıyor** — Marker'a çocuk eklenince native taraf içeriği bitmap'e
  kopyalıyor (`MapMarker.createDrawable`) ve o kod yolu içeriği kırpıyordu. Çocuksuz Marker
  Google'ın hazır pin varlığını kullanır, o yolu hiç çalıştırmaz (`hasCustomMarkerView`,
  `createDrawable()`, `SizeReportingShadowNode`, `ViewChangesTracker` devre dışı).
  `TrackedMarker.tsx` silindi. Puan haritada değil, Bottom Sheet'te gösteriliyor.
  - Beş tur teşhis yapıldı, hepsi başarısız: (1) `alignItems: stretch`, (2) `tracksViewChanges`
    zamanlaması, (3) dp/px yoğunluk uyuşmazlığı, (4) metin ölçüm toleransı — 2. ve 3. kanıt
    testiyle çürütüldü, 4. durumu kötüleştirdi.
  - İleride puan haritada gösterilmek istenirse **sağlıklı yol özel view değil, `icon`
    prop'u ile önceden üretilmiş PNG** — o da `createDrawable()`'a uğramaz.
- **Çevredeki mekanlar**: Nearby Search katmanı kaldırıldı. Google zaten aynı işletmeleri
  native POI olarak çiziyor; turuncu noktalarımız üstüne biniyordu.
- **POI tıklama**: `onPoiClick` aktif. Üç kademeli çözümleme — (1) mekan kullanıcının
  puanladıklarındaysa kendi puanı gösterilir, hiç istek yok; (2) `peekPlace()` ile L1
  bellek (senkron); (3) `resolvePlace()` → L2 `places` tablosu → miss ise L3 Google.
- **Yeme-içme filtresi** — `isFoodPlace(types)`, `src/lib/places.ts`:
  - **`onPoiClick` payload'ında `types` YOK** (`{ placeId, name, coordinate }`), yani
    dokunma anında sınıflandırma imkansız. Tür ancak cache'ten veya Place Details'ten
    öğrenilebiliyor. `types` alan maskesinde zaten var → **ek maliyet yok**.
  - Kural iki kademeli: güçlü listeden biri varsa (`restaurant`, `cafe`, `bar`, `bakery`,
    `meal_takeaway`, `meal_delivery`, `night_club`) → evet; `food` var **ve** mağaza türü
    yoksa (`supermarket`, `grocery_or_supermarket`, `convenience_store`, `store`,
    `liquor_store`, `gas_station`, `department_store`, `shopping_mall`) → evet; aksi
    halde hayır. `food` tek başına yetmiyor çünkü süpermarketler de onu döndürüyor.
  - 2. kademe bilinçli gevşek: **gerçek bir restoranı reddetmek, marketi kabul etmekten
    kötü** — ana eylemi (puanlama) engelliyor. Yanlış reddetme olursa `console.debug`
    satırında mekanın adı ve `types` dizisi loglanıyor, liste ona göre genişletilir.
  - **Kademe 1'e filtre UYGULANMIYOR**: kullanıcı o mekanı kendisi eklemiş; ayrıca
    `handleRankedPress` `<Marker onPress>`'ten de çağrılıyor, filtre koymak kullanıcının
    kendi pin'ini tıklanamaz yapardı.
  - **Akış sırası bu yüzden değişti**: eskiden sheet HEMEN açılıp içi sonradan doluyordu.
    Filtreyi çekimden sonra uygulamak sheet'i kapatmayı gerektirirdi → gözle görülür
    flash. Artık **önce karar, sonra aç**. Bilinmeyen POI'de ilk dokunuşta sheet birkaç
    yüz ms sonra ama **dolu** açılıyor; cache'lenmişte anında.
  - Reddedilen POI de cache'e **yazılıyor** — ikinci dokunuş sıfır çağrıyla, anında
    reddediliyor. Filtre zamanla ucuzluyor.
  - Reddedilince haritanın mevcut overlay bilgi kartında 2.5 saniyelik **nötr** satır
    çıkıyor ("Bu mekan yeme-içme kategorisinde değil") — hata değil, o yüzden kırmızı
    değil. Yeni bileşen yazılmadı. Bekleme sırasında da aynı kartın spinner yuvası
    kullanılıyor (`poiChecking`).
- **Üç yarış koruması**: `pendingPoiRef` aynı POI'ye çift dokunmayı yok sayıyor,
  `lastPoiTapRef` son dokunuşu kazandırıyor (araya giren dokunuş varsa geç gelen yanıt
  atılıyor), `finally` bloğu yalnızca kendi işaretini temizliyor.
- **Sorgu `user_id` ile FİLTRELİ** (2026-08-01). Baştan beri filtresizdi, yani haritada
  **veritabanındaki herkesin** puanladığı mekanlar çiziliyordu; tek kullanıcı olduğu
  için fark edilmemişti. Bilgi kartı "Puanladıklarım" adını alınca isim ile veri
  ayrışacaktı. **Harita artık kişisel bir araç**; arkadaş verisi Faz 3'ün sosyal
  katmanında kendi anahtarıyla gelecek. Yan etki: sorgu oturum çözülene kadar
  beklediği için pinler açılışta bir kare geç gelebiliyor (`loadAll` `userId`
  değişince kimliğini değiştirip kendini tekrarlıyor).
- **Puanlanan mekanlar tek Supabase sorgusuyla geliyor**: `select '*, places(*)'`.
  Gömülü kaynağı PostgREST **FK üzerinden** çözüyor — migration 003 çalışmadan bu select
  `Could not find a relationship` döner. Şema cache'i gecikirse
  `notify pgrst, 'reload schema';`. Bu yolda Google'a **hiç** gidilmiyor; koordinatsız
  satır hata değil, yalnızca çizilemeyen bir pin.
- **Eksik Google API key haritayı bloklamıyor.** Pinler tamamen Supabase'den geldiği için
  key eksikliği yalnızca POI detaylarını ve fotoğrafları bozuyor; uyarı gösterilip pinler
  yüklenmeye devam ediyor.
- **Bottom Sheet**: hem kendi pin'lerimizden hem native POI'lerden açılıyor. Kendi puanım
  varsa o, yoksa Google ortalaması (`googleRating` ayrı alan, "Google ortalaması" etiketiyle),
  o da yoksa "Henüz puanlanmamış". Atmosphere SKU maliyeti bilerek kabul edildi.
  Panelin yalnızca "Detayları gör ›" şeridi tıklanabilir (görsele/isme dokunmak bir şey yapmaz).
- **Pin ucu ile Google POI ikonu arasındaki minimal optik fark bizim bug'ımız değil.**
  Doğrulandı: DB'deki koordinatlar Place Details `geometry.location` ile birebir aynı
  (yuvarlama dahil). Fark iki sebepten: Google'ın harita üzerinde çizdiği POI noktası
  `geometry.location`'dan birkaç metre farklı olabiliyor, ayrıca standart pin **ucundan**,
  POI ikonu **merkezinden** çapalanıyor.

### Harita özeti (`MapSummarySheet`) — Faz 2
Harita üstündeki bilgi kartına dokununca açılan kompakt özet: **Puanladıklarım**
(en fazla 5 `RankRow`) + **Listelerim** (en fazla 4 kompakt `ListCard`), her bölümde
"Tümünü gör".

- **Kartın başlığı "Etrafındaki Mekanlar" DEĞİL, "Puanladıklarım"** (2026-08-01).
  Eski isim Nearby Search katmanı kaldırıldığından beri yanlıştı — kart etraftaki
  mekanları değil kullanıcının kendi puanladıklarını sayıyor. Başlık artık **duruma
  göre de değişmiyor**: bir dönem konum izni yokken "Ankara (Fallback)" yazıyordu,
  yani aynı satır iki farklı işi anlatıyordu; fallback bilgisi zaten altındaki satırda.
- **Yeni tasarım dili YOK**: satırlar `RankRow`, kartlar `ListCard`'ın `compact` hali.
  `RankRow` burada ok tuşu ve çöp kutusu almıyor — üçü de opsiyonel olduğu için o
  sütunlar hiç render edilmiyor (Diff B2'de tam bunun için genişletilmişti).
  `ListCard` `onLongPress` almıyor: özet ekranında yıkıcı eylem olmaz.
- **Mekanik `AddToListSheet` ile aynı** (RN `Modal` + `animationType="slide"`),
  `RestaurantBottomSheet` ile DEĞİL — o bileşenin kapanış animasyonu yalnızca
  sürüklemede oynuyor (bilinen açık iş), aynı kusuru ikinci bir yere taşımanın anlamı
  yoktu.
- **Veri `MapScreen`'in `rankedPlaces` state'inden GELMİYOR**; sheet kendi
  `useRankings` + `useLists` örneklerini kuruyor. `rankedPlaces` haritaya çizilebilen
  (koordinatı olan) satırlarla sınırlı ve `RankedPlace` tipinde — özet için yanlış küme.
- **Hata boş listeden ayrı gösteriliyor**: fetch hatası "Henüz mekan puanlamadın"
  olarak görünseydi yalan olurdu. `useRankings` ham `error.message` yazdığı için
  (bilinen teknik borç) ekrana kendi kısa metnimiz çıkıyor.
- `EmptyState` KULLANILMIYOR: 72px rozet + geniş padding iki bölümlü bir özete
  sığmıyor. Tek satır soluk metin yeterli.

#### Sheet'in yeniden açılması (`reopenSummaryRef`)
Sheet, başka bir ekrana giderken kapatılmak **zorunda**: RN `Modal` uygulamanın
görünüm hiyerarşisinin üstünde ayrı bir katman, açık kalırsa hedef ekran onun
**arkasında** kalır. Bu yüzden geri dönüşte açmak için bir işaret tutuluyor.

- **Üç çıkışın üçü de işareti koyuyor** (satır, liste kartı, "Tümünü gör"). "Tümünü
  gör" bir dönem hariç tutulmuştu; 2026-08-01'de kullanıcı kararıyla o istisna kalktı —
  kural tek: **geri her zaman bir önceki duruma döner**.
- İşaret **odak effect'inde tüketiliyor**; temizlenmezse sonraki her dönüşte sheet
  kendiliğinden açılırdı.
- **`tabPress` dinleyicisi işareti temizliyor.** `useFocusEffect` "geri ile döndüm" ile
  "sekmeye dokundum"u ayıramıyor — ikisi de odaklanma. `tabPress` bu ayrımı veriyor:
  geri tuşu o olayı üretmiyor ve olay sekme geçişinden **önce** yayınlanıyor, yani
  işaret odak effect'i çalışmadan temizleniyor. Olmadan şu akış özeti sürpriz biçimde
  açıyordu: Profil → (sekme çubuğuyla) Ara → (sekme çubuğuyla) Harita.
- Sheet `visible` false→true olduğunda veriyi **yeniden çekiyor** — Profil'de puan
  verip dönüldüğünde özet bayat gelmiyor.

### Çoklu seçim modu (`ListDetailScreen`) — C1
Bir mekana uzun basınca açılan, Android galerisi tarzı seçim modu + toplu çıkarma
(2026-08-01, cihazda 12 testle doğrulandı).

- **AYRI bir `selectionMode` bayrağı YOK** — mod `selectedIds.length > 0` demek.
  Son seçim kalkınca mod kendiliğinden kapanıyor; "boş seçim modunda takılı kalma"
  durumu hiç doğmuyor.
- **Seçim işareti sıra numarasının YERİNE çiziliyor**, aynı `RANK_COLUMN_WIDTH`
  sütununda — moda girerken satırlar yatayda kaymıyor. Modda ok tuşları ve çöp
  kutusu **gizleniyor** (karışık affordance olmasın), satıra dokunmak seçiyor,
  mekan detayına gitmiyor.
- **`RankRow`'un ÜÇÜNCÜ genişlemesi**: `selectionMode` / `selected` / `onLongPress`.
  Bileşen artık üç bağlamda çalışıyor (profil sıralaması, liste detayı, harita
  özeti) ve her seferinde çözüm aynı oldu: yeni parça **opsiyonel**, verilmezse
  render edilmiyor.
- **Geri tuşu modda EKRANDAN DEĞİL MODDAN çıkarıyor** — `BackHandler` aboneliği
  `useFocusEffect` içinde ve **yalnızca modda** kuruluyor. Odak dışındayken yaşayan
  bir abonelik başka ekranın geri tuşunu yutardı. Cihazda iki yönlü doğrulandı:
  modda yakalıyor, mod bitince bırakıyor.
- **`removeItems(ids)` tek sorgu** (`.in('id', ids)`), N tur değil; `removeItem`
  ona delege oluyor (`addPlaceToList` refactor'ünün aynısı). Kalan `position`
  değerleri yeniden numaralandırılmıyor (mevcut karar).
- **Hata halinde seçim KORUNUYOR** ki kullanıcı tekrar deneyebilsin.
- Profil → "Sıralamam" satırlarında seçim modu **YOK**: orada silmek
  `user_rankings`'ten silmek demek — farklı tablo, farklı anlam.

### Toplu taşıma ve kopyalama — C2 (cihazda DOĞRULANDI)

- **Migration 007 — `move_list_items(p_source, p_target, p_item_ids)`.** Hedefe
  INSERT + kaynaktan DELETE **tek transaction'da**. İki ayrı istemci çağrısı, arada
  kopan bağlantıda mekanları iki listede birden veya hiçbirinde bırakırdı.
  - **Hedefte zaten var olanlar** `on conflict do nothing` ile atlanıyor, kaynaktan
    yine de siliniyor: kullanıcının istediği "bu mekanlar şu listede olsun".
  - Bu, migration 006'da **reddedilen toplu upsert ile aynı şey DEĞİL**: orada sorun
    hatalı bir id'nin yeni satır yaratmasıydı; burada `insert ... select` gerçek
    satırlardan okuyor ve uydurma id sayım kontrolüne takılıyor.
  - `security definer` DEĞİL (006 ile aynı gerekçe). Hedef listenin sahipliği ayrıca
    kontrol edilmiyor — INSERT politikası zaten reddeder, hata işlemi geri alır.
  - **Kendi üstüne taşıma açıkça yasak**: `unique` kısıtı her şeyi atlar, sonra
    kaynaktan silerdi — sessizce toplu silmeye dönüşürdü.
- **`ListPicker` ayrıştırıldı** (`src/components/lists/ListPicker.tsx`): liste
  satırları + "Eklendi/Taşındı" animasyonu + tek satırlık "yeni liste" kısayolu +
  `useLists`. `AddToListSheet` ve `MoveToListSheet` ikisi de onu kullanıyor.
  **`AddToListSheet`'in sözleşmesi DEĞİŞMEDİ** (`visible`/`placeId`/`placeName`/
  `onClose`) — cihazda doğrulanmış bir akışı genelleştirmek yerine ortak parça
  dışarı alındı. Modal kabuğu, başlık ve yazma mantığı her sheet'te kendi yerinde.
- **`ListPicker` sanal liste KULLANMIYOR (`ScrollView`, `FlatList` değil).**
  Ayrıştırmadan sonra cihazda bir regresyon çıktı: mevcut bir listeye dokununca
  ekleme Supabase'e **yazılıyor ve hatasız dönüyor** ama satırda ne spinner ne
  "Eklendi" beliriyordu. Beş noktalı geçici log zinciriyle bulundu — dokunuş
  `Pressable`'a ulaşıyor, guard yutmuyor, `insert` başarılı; **satır yeniden
  çizilmiyor**. `busyListId` ve `addedListIds` iki AYRI state güncellemesi ve
  ikisi de satıra ulaşmıyordu.
  - Sebep sınıfı: `FlatList` bir `PureComponent` ve hücrelerini memoize ediyor;
    `renderItem` `data` DIŞINDAKİ state'e bağlıysa hücreler bayat kalabiliyor
    (RN dokümanı bu durum için `extraData` öneriyor).
  - `extraData` eklemek yerine **sanallaştırma kaldırıldı**: veri kullanıcının
    kendi listeleri, birkaç düzine satır. Sanallaştırma sıfır fayda sağlıyor,
    karşılığında bütün bir "bayat hücre" hata sınıfı getiriyordu. Düz çocuklar
    ebeveynle birlikte her zaman yeniden çiziliyor.
  - Dürüst not: mekanizma statik okumayla KANITLANAMADI (aynı yapı ayrıştırma
    öncesinde çalışıyordu). Düzeltme mekanizmayı ayarlamak yerine ortadan
    kaldırıyor.
- **`excludeListId`** kaynak listeyi seçeneklerden gizliyor; RPC zaten reddediyor
  ama seçilemeyecek bir satırı göstermek kullanıcıyı hataya davet etmek olurdu.
  Tek listesi olan kullanıcı "Başka listen yok" görüyor, "Henüz listen yok" değil.
- **`MoveToListSheet` başarıda KAPANIYOR**, `AddToListSheet`'in tersine: ekleme
  tekrarlanabilir (bir mekan birden çok listeye girer), taşıma tek seferlik.
- **Taşıma ONAYSIZ** (silme onaylı): yıkıcı değil, mekanlar kaybolmuyor.
  Şeritte çöp kutusunun solunda, nötr renkte `list` ikonu.

#### Kopyalama — migration 008
"Kaynak listeden de kaldır" anahtarı (varsayılan **AÇIK**) kapatılınca aynı RPC
DELETE adımını atlıyor, yani mekan iki listede birden kalıyor.

- **İstemci döngüsü (`addPlaceToList` × N) REDDEDİLDİ.** Üç gerekçe: (a) hedefte
  zaten var olan mekanlar `23505` döndürür ve toplu kopyalamada bu hata değil —
  RPC'de `on conflict do nothing` ile zaten çözülmüş; (b) N ayrı istek mobil
  bağlantıda kısmen başarısız olmaya açık; (c) kullanıcının tek anahtarla
  değiştirdiği şey kodda iki ayrı mekanizmaya dallanmamalı. Dürüst not:
  kopyalama toplamalı bir işlem, atomiklik burada taşımadaki kadar kritik değil.
- **`create or replace` YETMEZ, önce `drop` gerekiyor**: yeni parametre eklemek
  fonksiyonu değiştirmez, **aşırı yükleme** yaratır (Postgres farklı argüman
  listesini farklı fonksiyon sayar) ve PostgREST hangisini çağıracağını
  şaşırabilir.
- **Varsayılan `true`**: parametreyi göndermeyi unutan bir çağrı bugünkü
  davranışı korur.
- **Fonksiyon artık EKLENEN satır sayısını döndürüyor** (007'de silinen sayıydı) —
  kopyalama modunda silinen sayı diye bir şey yok.
- **Başlık anahtara göre değişiyor**: "Başka listeye taşı" ↔ "Başka listeye
  kopyala". Kaldırmayan bir ekranda "taşı" yazmak, bu projede üç kez pahalıya
  patlamış isim/davranış uyumsuzluğunun dördüncüsü olurdu.
- **Sheet'in yaşam döngüsü İKİ MODDA DA AYNI** (başarıda kapanıyor, seçim
  temizleniyor): anahtarın yalnızca kaldırma eksenini değiştirmesi tahmin
  edilebilir.
- **Kopyalama modunda kaynak liste üzerinde sahiplik kontrolü yok** (o kontrol
  DELETE'in satır sayısından geliyordu). Yeni bir açık değil: `list_items`
  SELECT politikası zaten `using (true)`, hedefteki INSERT politikası hâlâ
  sahiplik istiyor.

### Liste formu (`ListFormScreen`) — oluşturma + düzenleme
TEK ekran iki işi yapıyor; modu `listId` parametresi belirliyor (2026-08-01).

- **İkinci bir `EditListScreen` YAZILMADI**: aynı üç alanın (~200 satır) kopyası ve
  iki formun zamanla ayrışması demekti. Rota adı da `CreateList`'ten **`ListForm`**'a
  döndü — `navigate('CreateList', { listId })` yaptığı işi yanlış anlatırdı.
- **Düzenleme verisi route parametresinden**, ekran ayrı sorgu atmıyor: çağıran
  (`ProfileScreen`) elinde zaten tam satır var.
- **Uzun basış artık MENÜ**: İptal / Düzenle / Sil. Silme **iki adımlı** kaldı —
  menüdeki "Sil" doğrudan silmiyor, mekan sayılı onay diyaloğunu açıyor.
  Android `Alert` üç düğmeyi kendi neutral/negative/positive sırasına yerleştiriyor;
  dizilim iOS'takiyle birebir aynı değil, davranış doğru.
- **Düzenlemede `autoFocus` YOK** (oluşturmada var): mevcut bir listeyi düzenlerken
  kullanıcı önce metni okumak isteyebilir, klavye ekranın yarısını kapatmasın.
- **Çıkışta `goBack`**, oluşturmadaki gibi `replace('ListDetail')` değil — düzenleme
  geldiği yere döner.
- **Düzenleme YALNIZCA profilden başlatılıyor, `ListDetailScreen`'den değil.** O ekran
  başlık/açıklama/`isOrdered`'ı route parametresinden okuyor; kendi içinden
  düzenlenirse ekrandaki veri anında bayatlar ve `setParams` ile senkron tutmak
  gerekir. Profilde böyle bir sorun yok, ekran odakta yeniden fetch ediyor.
- **`useLists.updateList` ilk gerçek çağıranını buldu** — yazılalı beri hiçbir arayüz
  onu çağırmamıştı; cihazda doğrulandı (başlık, açıklama ve `is_ordered` değişimi,
  boş patch'te erken dönüş).

### Liste açıklaması (`ListDetailScreen`)
Letterboxd'un liste sayfasındaki açıklama vurgusu (2026-08-01).

- **Şeridin İÇİNDE değil, `FlatList`'in `ListHeaderComponent`'inde.** Şeride koymak
  uzun bir açıklamada ekranın yarısını KALICI olarak yerdi; burada içerikle birlikte
  kayıp gidiyor (`ProfileScreen`'de `ProfileHeader` aynı sebeple liste başlığı).
- **`Type.body` + `Colors.textStrong`.** `caption` "küçük gri not" demek olurdu, oysa
  istenen vurgu okunur bir gövde metni. Yeni bir `Type` rolü AÇILMADI — ölçüt
  "ikiden fazla yerde aynı eşleşme" ve mevcut rol tam oturuyor.
- **Zemin / sol kenarlık / alıntı bloğu YOK**; ağırlık boyut ve boşluktan geliyor.
  Ayrım satırların kendi 1px çizgisiyle aynı dilde (Midas kararı).
- **Kısaltma ("Devamını gör") YOK**: alan DB'de 500 karakterle sınırlı (~8-10 satır)
  ve blok zaten kaydırılabilir. Ölçüm için `onTextLayout` + ek state gerekirdi,
  sınırlı bir metin için orantısız.
- Açıklama boşsa blok **hiç render edilmiyor**.
- **Veri route parametresinden**, ayrı sorgu yok: üç çağrı yerinin (Profil, harita
  özeti, yeni liste) üçünde de veri zaten elde. `title`/`isOrdered` ile aynı anlık
  görüntü kuralına ve aynı `EditList` uyarısına tabi.

#### Profil sekmesine parametreyle atlama
"Tümünü gör" `ProfileTab`'e **istenen sekme açık** olarak atlıyor:
`navigate('ProfileTab', { screen: 'MyProfile', params: { tab } })`.

- `TabParamList.ProfileTab` bu yüzden `NavigatorScreenParams<ProfileStackParamList>`.
- `MyProfile`'ın `tab` parametresi bir **kerelik istek**: `ProfileScreen` uyguladıktan
  sonra `setParams({ tab: undefined })` ile **temizliyor**. Temizlenmezse kullanıcı
  sekmeyi elle değiştirip (ör. mekan detayına gidip geri dönerek) ekrana döndüğünde
  eski istek tekrar uygulanır ve sekme kendiliğinden zıplar.
- Mekan ve liste detayı ise **sekme atlatmadan** `MapStack` içinde açılıyor —
  `ListDetail` bu yüzden `MapStack`'e de kaydedildi ve route tipi
  `ListDetailStackParamList`'e taşındı (`RestaurantDetail`'in dört stack'teki
  durumuyla aynı desen).

### Günlük (diary) — Faz 2'nin ikinci ayağı
Letterboxd'un diary'si: "ne zaman gittim, ne düşündüm". Migration 009 (tablo),
010 (`log_diary_entry` + `upsert_user_ranking`), 011 (`update_diary_entry`).

**Neden ayrı tablo:** `diary_entries` mekan başına **sınırsız** satır (her ziyaret
bir satır), `user_rankings` mekan başına **tek** satır (kanonik puan + sıra).
İkisi farklı soruları cevaplıyor: "geçen ay nerelere gittim" ile "en sevdiğim
mekanlar hangileri". Restoranlar filmlerden farklı olarak tekrar tekrar ziyaret
edilir — `list_items`'taki gibi bir unique kısıt burada YANLIŞ olurdu.

#### Şema kararları (migration 009)
- **`visited_at` `date`, `timestamptz` DEĞİL.** Kullanıcı "1 Ağustos'ta gittim"
  diyor; saat gürültü. Üstelik `timestamptz`'de zaman dilimi kayması ziyareti bir
  gün öteleyebilirdi (23:30'da girilen kayıt UTC'ye çevrilince ertesi gün görünür).
- **`rating` NULLABLE** — diary'nin ana kararı. Puansız log yalnızca günlükte
  görünür, "Puanladıklarım" sıralamasına girmez.
- **RLS'te BİLİNÇLİ SAPMA: SELECT de sahiplik istiyor** (`auth.uid() = user_id`).
  Şemadaki diğer her tabloda okuma `using (true)`. Sebep: `note` bugüne kadarki en
  kişisel veri. Faz 3 arkadaş günlüğünü göstermek isterse politikayı gevşetmek tek
  satır; sızmış bir notu geri almak mümkün değil. Asimetrik risk, kapalı taraf
  varsayılan.
- **Gelecek tarih CHECK ile ENGELLENEMİYOR**: Postgres CHECK içinde non-immutable
  fonksiyon (`current_date`) kabul etmiyor. Kontrol RPC gövdelerinde (010 ve 011),
  ayrıca istemcide tarih seçici bugünden ilerisini kapatıyor.
- **`(user_id, place_id)` indeksi YOK**: onu isteyen tek ekran ("bu mekana N kez
  gittin") v1'de yapılmadı. Kullanılmayan indeks her yazmada güncellenen ölü yük.

#### Yazma yolu: RPC (migration 010 + 011)
Puanlı bir giriş **iki tabloya** yazıyor, bu yüzden istemciden iki ayrı çağrı
değil tek RPC — `move_list_items`'ı doğuran argümanın aynısı. İkinci ve daha
önemli sebep: **`rank_index` istemcide hesaplanmaz** (bu projenin iki kez
öğrendiği ders).

- **`upsert_user_ranking(place_id, rating)` AYRI bir fonksiyon** ki `rank_index`
  kuralının tek SQL kaynağı olsun; `log_diary_entry` ve `update_diary_entry`
  ikisi de onu çağırıyor. Denormalize kolonları (`restaurant_name`, foto,
  koordinat) **`places`'ten** dolduruyor — kanonik kaynaktan, istemcinin bayat
  kopyasından değil.
- **Düzenlemede puan YALNIZCA gerçekten değiştiyse** sıralamaya yansıyor
  (`is distinct from`; `<>` kullanılsaydı eski puan null iken karşılaştırma null
  döner ve puansız bir girişe puan vermek sıralamaya HİÇ yansımazdı). Not veya
  tarih düzeltmek sıralamaya dokunmuyor.
  - **Kabul edilen tuzak:** eski bir girişin puanını değiştirmek güncel kanonik
    puanı EZER — kural "son ziyaret kazanır" değil, **"son düzenleme kazanır"**.
    Letterboxd'un modeli bu. Reddedilen alternatif: "yalnızca bu giriş o mekanın
    en yeni puanlı girişiyse güncelle" — daha doğru ama kullanıcıya
    açıklanamaz (bazen günceller bazen güncellemez).
- **Puanı kaldırmak veya girişi silmek sıralamayı GERİ ALMAZ.** Sıralama "bu
  mekan hakkında ne düşünüyorum"un kanonik cevabı, tek bir ziyaretin türevi
  değil; geri almak "hangi ziyaretin puanına dönmeli" gibi cevabı olmayan bir
  soru doğururdu. `removeEntry` ve `update_diary_entry` bu konuda simetrik.
- **`place_id` düzenlenemez**: bir ziyaret mekanına bağlıdır; mekanı değiştirmek
  o ziyareti silip yenisini yazmak demek.

#### Tarih dönüşümleri (`src/lib/date.ts`)
**`new Date(string)` ve `toISOString()` bu projede `visited_at` için YASAK.**
İkisi de UTC üzerinden çalışıyor: `new Date('2026-08-01')` UTC gece yarısı demek
(negatif ofsette 31 Temmuz'a düşer), `toISOString()` ise yerel gece yarısını
UTC'ye çevirir (Türkiye +03'te tarih bir gün geri kayar). Ziyaret tarihinin
kayması sessiz bir veri hatası olurdu; dönüşümler string parçalanarak veya yerel
alanlardan kurularak yapılıyor.

#### Arayüz
- **`DiaryRow` AYRI bileşen, `RankRow` genişletilmedi.** `RankRow`'un üç
  genişlemesi hep "aynı satır, eksik parça"ydı; burada EKSEN değişiyor: satırın
  kimliği tarih, sıra numarası yok, aynı mekan listede defalarca tekrar ediyor.
  Dördüncü bir opsiyonel parça onu "her şeyi yapan satır"a çevirirdi. Tarih
  sütunu yine de `RankRow`'un sıra sütunuyla aynı hizada — sekmeler arası
  geçerken göz kaymıyor.
- **`DiaryEntrySheet` İKİ MODLU** (`ListFormScreen` deseni): `entry` verilirse
  düzenleme, verilmezse ekleme. Rota değil bileşen olduğu için iki ekranda
  birden render ediliyor — `RestaurantDetail` (ekleme) ve `ProfileScreen`
  (düzenleme).
- **Düzenlemede `ensurePlaceCached` gerekmiyor**: satır zaten var, FK o gün
  tutmuş. Eklemede gerekli (`diary_entries.place_id` → `places`).
- Giriş noktası **mekan detayı**: ayrı bir "log ekle" ekranı yapılmadı, çünkü
  giriş her zaman bir mekana bağlı ve ayrı ekran mekan seçtirmek için
  `SearchScreen`'in kopyasını gerektirirdi. Alt kısımda artık üç buton:
  **Puanı Kaydet** (birincil) / **Ziyaret Ekle** / **Listeye Ekle**.
- Profil → "Günlük" sekmesinde uzun basış menüsü: **İptal / Düzenle / Sil**
  (silme yine iki adımlı, `ListCard` ile aynı desen).
- **Bağımlılık: `@react-native-community/datetimepicker`** (SDK 54 uyumlu 8.4.4).
  `npx expo install` dinamik config'e (`app.config.ts`) yazamıyor — plugin kaydı
  `app.json`'a **elle** eklendi, `app.config.ts` onu taban alıyor.

## Mevcut Durum
Uygulama fiziksel Android cihazda çalışıyor; her adım cihazda doğrulandı.

- Harita açılıyor, puanlanan mekanlar yeşil standart pin olarak görünüyor
- Native POI'lere dokunulabiliyor ama **yalnızca yeme-içme mekanlarında** panel açılıyor;
  park/müze/mağaza dokunuşları nötr bir bildirimle geçiliyor
- "Detayları gör" ile detay sayfasına gidiliyor, geri tuşu doğru sekmeye dönüyor
- Profil: Instagram tarzı header (avatar + 3 sayaç + isim/bio) + üç sekme
  (Sıralamam / Günlük / Listeler) + Letterboxd tarzı satırlar. **"Listeler" sekmesi
  uçtan uca çalışıyor** (Diff A + B1 + B2): liste oluşturma, mekan ekleme, liste
  detayı, ok tuşlarıyla sıralama, çıkarma, silme. **"Günlük" sekmesi de doldu**:
  ziyaret ekleme/düzenleme/silme, puanlı girişin sıralamaya işlenmesi.
- Her iki profil sekmesinin satırları ve liste kartları tıklanabilir; mekan detayı
  Profil sekmesinden de açılıyor ve geri tuşu geldiği yere dönüyor.
- Harita üstündeki kart **"Puanladıklarım"** adını taşıyor, tıklanabilir ve kompakt
  bir özet sheet'i açıyor (5 mekan + 4 liste + "Tümünü gör"). Detaya gidip geri
  dönünce sheet **açık geliyor**; sekmeye elle dokunulduğunda açılmıyor.
- Sekmeler arası geri artık **`history`**: geri her zaman bir önce bulunulan yere
  dönüyor, zincirin sonunda Ana Sayfa'ya ulaşıp uygulamadan çıkıyor.
- Liste açıklaması üç yerde de yerinde: `ListDetailScreen`'de başlığın altında
  (Letterboxd tarzı vurgu), `ListCard`'da 2 satır, harita özetinde bilinçli gizli.
- Listeler **düzenlenebiliyor**: kartta uzun basış → İptal / Düzenle / Sil.
  Başlık, açıklama ve "sıralı mı" değiştirilebiliyor.
- Liste detayında **çoklu seçim modu** var: mekana uzun basış → seçim, şeritte
  "N seçili" + toplu çıkarma, geri tuşu moddan çıkarıyor.
- Seçili mekanlar başka bir listeye **taşınabiliyor veya kopyalanabiliyor**
  ("Kaynak listeden de kaldır" anahtarı); ekleme/taşıma/kopyalama seçicisi
  paylaşılan `ListPicker`.
- Ana Sayfa sekmesinin adı **"Ana Sayfa"** (eskiden "Keşfet").
- Puan güncellemesi `rank_index`'i bozmuyor
- `user_rankings`'te 4 kayıt, `places` cache'i dolu ve çalışıyor
- Sekme çubuğu Ionicons; aktif sekme dolu glif + marka yeşili, pasifler outline + gri
- Splash, Login ve Register aynı logo lockup'ını kullanıyor (80px daire + `restaurant`
  ikonu) — üçünde de emoji yok
- Typecheck temiz, debug kalıntısı yok
- **Uygulama kodunda ham hex KALMADI.** Tek istisna `MapScreen`'in `pinColor="#22C55E"`'i
  (gerekçesi aşağıda). `theme.ts`'in `Palette` tanımı doğal olarak hariç.

**Faz 1a bitti** (2026-07-31): `places` tablosu, `upsert_place` RPC'si, FK, üç katmanlı
cache. Ölçülen sonuç — uygulama tamamen kapatılıp açıldıktan sonra aynı POI'nin ikinci
açılışı **önceki sürenin onda birine** düştü; detay ekranı spinner göstermeden doluyor.

**Faz 1b bitti** (2026-07-31): 7 adımın hepsi tamam, üstüne legacy temizliği (adım 8).
Tasarım sistemi artık tek isim setine sahip — `theme.ts`'te deprecated token kalmadı,
uygulama kodunda ham hex kalmadı.

**Faz 1 TAMAMLANDI.**

**Faz 2 BAŞLADI** (2026-07-31). Veri katmanı hazır:

- **Migration 005 (`lists` + `list_items`) — uygulandı ve doğrulandı.** Dört davranış
  panelde test edildi: `position` trigger'ı sırayı 0/1/2 olarak dolduruyor · geçersiz
  `place_id` FK'ya takılıyor · aynı mekanı listeye iki kez eklemek unique kısıta
  takılıyor · liste silinince öğeleri cascade ile gidiyor.
- **Migration 006 (`reorder_list_items()` RPC) — uygulandı ve tam doğrulandı.**
  Mutlu yol: üç mekanlı test listesi ters sırayla gönderildi, tam ters sırada döndü.
  Koruma bantlarının üçü de beklenen hatayı verdi: eksik id · mükerrer id · boş dizi.
  "Başkasının listesi" senaryosu SQL Editor'dan test EDİLEMEZ (orada `auth.uid()`
  hep aynı kullanıcı) — RLS + satır sayısı kontrolüne dayanıyor, ikinci bir test
  hesabıyla uygulamada denenebilir.
- **`List` / `ListItem` / `ListWithItemCount` tipleri + `useLists` / `useListItems`
  hook'ları yazıldı.**
- **Diff A (listelerin arayüzü) — cihazda DOĞRULANDI** (2026-08-01, 10 testin hepsi
  geçti). Kapsam: `ProfileStack` geri geldi (`MyProfile` + `CreateList`), `ProfileTab`
  artık doğrudan `ProfileScreen` değil bu stack'i gösteriyor, `ListCard` bileşeni,
  `CreateListScreen` modal'ı ve `ProfileScreen`'in "Listeler" sekmesi `useLists`'e
  bağlandı. Liste **oluşturma / listeleme / silme** uçtan uca çalışıyor.
  - Bilinçli iki eksik, Diff B'nin işi: `ListCard`'ın `onPress`'i **yok** (liste detay
    ekranı henüz yok — tıklanabilir görünüp tepki vermemek, hiç tıklanabilir
    görünmemekten kötü) ve `CreateListScreen` kaydettikten sonra `goBack()` yapıyor,
    yeni listeye `replace` etmiyor.
  - Liste silme yalnızca **uzun basışla** ve onaylı: her satıra çöp kutusu ikonu koymak
    "Listeler" sekmesini gürültülendirirdi.
  - Modal kapanınca liste iki kez fetch ediliyor (modal'ın kendi `useLists` örneği +
    `ProfileScreen`'in `useFocusEffect`'i). Zararsız ama `useAuth`'un Context olmamasının
    bir başka yan etkisi — `AuthProvider` refactor'ü bunu da kapatır.
- **Diff B1 ("Listeye ekle" akışı) — cihazda DOĞRULANDI** (2026-08-01, 10 test).
  Artık `list_items`'a arayüzden satır girebiliyor.
  - **Seçici ROTA DEĞİL, BİLEŞEN** (`src/components/lists/AddToListSheet.tsx`).
    `RestaurantDetail` üç stack'te birden kayıtlı ve hiçbiri `ProfileStack` değil;
    seçiciyi ekran yapmak onu üç param listesine + üç stack'e eklemek, içindeki
    "yeni liste" kısayolu için `CreateList`'i de üç yere daha eklemek demekti.
  - **`addPlaceToList(listId, placeId)` hook DIŞINDA, modül seviyesi fonksiyon**
    (`useListItems.ts`). Seçici hangi listeye yazılacağını önceden bilmiyor; hook'la
    yapmak liste başına bir `useListItems` örneği kurmak ya da `23505`/`23503`
    çevirisini seçicide kopyalamak olurdu. `addItem` artık onu çağırıp yalnızca
    yerel state'i güncelliyor.
  - **`ensurePlaceCached()` seçiciyi açmadan ÖNCE çalışıyor.** `user_rankings` ve
    `list_items` ikisi de `places`'e FK; cache satırı garanti edilemiyorsa seçici
    hiç açılmıyor. Sonradan denemek, kullanıcı bir listeye dokunduktan sonra FK
    hatası göstermek demekti — hatanın yeri seçilen liste değil, mekanın kendisi.
    `handleSave`'in içinde gömülü duran aynı mantık oradan çıkarıldı, iki yazma
    yolu da bu yardımcıyı kullanıyor.
  - **Sheet ekledikten sonra KAPANMIYOR**: bir mekan birden çok listeye girebilir.
    Eklenen satır onay işaretine dönüyor. `23505` ("zaten var") hatası da satırı
    işaretliyor — o hata bir başarısızlık değil, mekanın o listede olduğu bilgisi.
  - **Puan ZORUNLU DEĞİL**: "gidilecekler" listesi tam olarak gidilmemiş yerler için.
  - **Birincil butonun metni değişti**: "Listeme Ekle" → **"Puanı Kaydet" / "Puanı
    Güncelle"**. Eski metin yaptığı işi (puan yazmak) yanlış anlatıyordu ve yanına
    "Listeye Ekle" gelince iki buton neredeyse aynı şeyi vaat ediyordu. Kaydetme
    sonrası bildirimi de "Puanın sıralamana işlendi" oldu.
- **Diff B2 (`ListDetailScreen` + `RankRow` genişletmesi) — cihazda DOĞRULANDI**
  (2026-08-01, 11 test).
  - **`RankRow` artık iki yerde**: "Sıralamam" sekmesi ve `ListDetailScreen`. İsim
    korundu ama **sıra zorunlu değil**: `rank` / `rating` / ok tuşları (grup olarak)
    opsiyonel ve verilmeyen parça **render edilmiyor**, boş yer tutmuyor. Ayrı bir
    `ListItemRow` yazmak %90'ı kopya bir bileşen olurdu.
  - **`onPress` yoksa `Pressable` HİÇ kurulmuyor**, `View` render ediliyor.
    `disabled` bir Pressable bırakmak "tıklanabilir görünüp tepki vermeme" olurdu.
    İç `Pressable`'lar (ok/çöp kutusu) dıştakini eziyor — RN iç içe dokunmada en
    içteki hedefi seçiyor, cihazda doğrulandı.
  - **Sıralama satırları da tıklanabilir oldu.** Aynı ekranda bir sekmenin satırı
    tıklanabilirken diğerininkinin olmaması tutarsızlıktı.
  - **`RestaurantDetail` artık DÖRT stack'te** kayıtlı (Ana Sayfa/Ara/Harita/Profil).
    `RestaurantDetailParams`'ın paylaşılan tip olmasının sebebi tam olarak buydu.
  - **`ListDetail` başlığı ve `is_ordered`'ı route parametresiyle taşınıyor**, ekran
    liste satırı için ayrı sorgu atmıyor — başlık ilk karede doğru yazsın ve satırlar
    iki kez (önce numarasız, sonra numaralı) çizilmesin diye. Bu bir ANLIK GÖRÜNTÜ;
    `EditList` geldiğinde ya `setParams` ile güncellenmeli ya tek-liste fetch'ine
    geçilmeli.
  - **`CreateListScreen` `replace` kullanıyor, `navigate` değil**: modal geçmişte
    kalmamalı, yeni listenin detayından geri basınca profile dönülüyor.

**Faz 2 — listeler ayağı TAMAMEN KAPANDI** (2026-08-01). Hepsi cihazda doğrulandı:
liste **oluştur / düzenle / sil** → mekan detayından **listeye ekle** → liste
detayında **gör / sırala / çıkar** → **çoklu seçim** ile toplu çıkar, başka listeye
**taşı veya kopyala**.

**Faz 2 — diary ayağı TAMAMLANDI** (2026-08-01). Migration 009/010/011 SQL
Editor'da, arayüz cihazda doğrulandı: mekan detayından **ziyaret ekle** (tarih +
opsiyonel puan + opsiyonel not) → Profil'in **"Günlük"** sekmesinde gör → uzun
basışla **düzenle / sil**. Puanlı giriş `user_rankings`'i güncelliyor, `rank_index`
korunuyor; puansız giriş sıralamaya hiç girmiyor. Sırada **fotoğraflar** var
(Supabase Storage + `place_photos`).

Proje "Proof of Concept" aşamasını geçti; ürün kimliği ve tasarım fazında.

## Yol Haritası

### Faz 1 — Temel
**a) ~~`places` tablosu~~ — TAMAMLANDI.** Detay için Mimari Notlar → `places` cache tablosu.
Kapsam: migration 002 (tablo + RLS + `upsert_place` RPC + backfill), migration 003 (FK +
`idx_user_rankings_place_id`), `src/lib/placeCache.ts`, `RestaurantDetailScreen` ve
`MapScreen` cache-first'e geçirildi.

**b) ~~Tasarım sistemi~~ — TAMAMLANDI.** Renk paleti, tipografi, spacing, köşe yuvarlaklığı,
elevation standardı + emoji ikonların `@expo/vector-icons`'a geçişi.

Kararlar (onaylandı): ikonlar `@expo/vector-icons` (Ionicons) · dark mode **inşa edilmiyor**,
yalnızca token isimleri anlamsal tutuluyor ki kapı açık kalsın · tipografi 8 role indirildi
(`captionStrong` adım 7'de eklendi), eski `FontSize` **silindi** · profil sekmeleri
Sıralamam/Günlük/Listeler, sayaçlar bu fazda tıklanamaz.

Adım durumu:

| # | İş | Durum |
|---|---|---|
| 1 | `theme.ts` v2 — `Palette` → `Colors` iki katman, `Type` 7 rol, `Elevation` | ✅ |
| 2 | Primitive'ler: `ErrorBanner`, `SectionHeader`, `Chip`, `Icon` | ✅ |
| 3 | `RestaurantDetailScreen` (27→0 literal) + iki cilalama işi | ✅ |
| 4 | `RestaurantBottomSheet` (27→0 literal) + sabit yükseklik kaldırıldı | ✅ |
| 5 | `ProfileScreen` — `ProfileHeader` + `RankRow` + `SegmentedTabs`, `useProfile` bağlandı | ✅ |
| 6 | `HomeScreen` + `SearchScreen` + `RestaurantCard` | ✅ |
| 7 | `StarRating` + `TabNavigator` ikonları → `MapScreen` overlay → `LoginScreen` + `RegisterScreen` (üç ayrı diff) | ✅ |
| 8 | Legacy temizliği: son 4 dosya + `theme.ts`'in LEGACY bloklarının silinmesi | ✅ |

Adım 7 üç ayrı diff olarak yapıldı ve her diff cihazda doğrulandıktan sonra bir sonrakine
geçildi. Adım 8 plana sonradan eklendi: adım 7 biterken legacy token'ların yalnızca 4
dosyada kaldığı görüldü, o yüzden temizlik aynı oturumda kapatıldı.

Adım 5–6'da alınan kararlar:
- **`useFollow` `ProfileScreen`'e BAĞLANMADI, bağlanmamalı.** O hook başka bir kullanıcıyı
  takip etme durumunu yönetiyor ve `currentUserId === targetUserId` olduğunda erken
  çıkıyor — kendi profilinde takip edilecek kimse yok. Takipçi/takip **sayıları**
  `useProfile` içinde zaten var. `useFollow` / `useFollowList`, Faz 3'ün `UserProfile` ve
  `FollowersList` ekranlarının hook'ları.
- **Sayaçlar tıklanamaz** ve basılı geri bildirimi/chevron da yok — tıklanabilir görünüp
  tepki vermemek, hiç tıklanabilir görünmemekten kötü. Tıklanabilir yapmak 3 ekran +
  `ProfileStack` demek (Faz 3).
- **"Profili düzenle" / "Paylaş" butonları konulmadı**: `EditProfile` ekranı yok, paylaşma
  işlevi yok. Hiçbir şey yapmayan buton dead UI.
- **Çıkış butonu header'dan çıktı** → sağ üstte ayarlar ikonu. En sık girilen ekranın en
  görünür köşesinde "Çıkış" olması yanlış hiyerarşiydi.
- **`RankRow` kart değil satır**: gölge/kart/satır arası boşluk kaldırıldı, ayrım tek alt
  çizgiden geliyor; sıra numarası renkli daire değil düz metin, ilk üç yalnızca renkle
  ayrışıyor. Sıralı listede önemli olan sıranın kendisini görmek — ekranda belirgin
  şekilde daha çok mekan sığıyor. `HomeScreen`'in "En Çok Puanlayanlar" satırları da
  aynı dile geçti.
- **`HomeScreen`'in "Popüler Listeler" bölümü "En Çok Puanlayanlar" olarak yeniden
  adlandırıldı.** Gösterdiği veri `user_rankings`'ten hesaplanan kullanıcı başına mekan
  sayısı — liste değil. Faz 2 gerçek `lists` tablosunu getireceği için isim çakışması
  şimdi çözüldü. "Listeyi Gör →" etiketi de kaldırıldı: `onPress`'i yoktu, dead UI.
- **`getPhotoUrl` kopyaları birleştirildi.** `HomeScreen` ve `ProfileScreen` kendi fotoğraf
  URL kurucularını ve kendi `GOOGLE_API_KEY` okumalarını taşıyordu; ikisi de artık
  `places.ts`'teki `photoUrl()` kullanıyor.
- **`HomeScreen`'in yerel `SectionHeader` kopyası silindi**, paylaşılan primitive'e geçti;
  primitive'e `badge` prop'u eklendi (tıklanamaz bilgi metni, "3 yeni" gibi).

Adım 7–8'de alınan kararlar:
- **Sekme ikonu boyutu aktif/pasifte AYNI (24).** Emoji döneminde 22↔24 arası değişiyordu
  ve sekme değişiminde ikon zıplıyordu. Aktiflik iki eksenden anlatılıyor: **dolu/outline
  glif + renk**. Renk `tabBarActiveTintColor`/`InactiveTintColor`'dan `tabBarIcon`'un
  `color` parametresine geçiyor — emoji renk alamıyordu, bu yeni davranış.
- **Tab bar gölgesi kaldırıldı**, ayrım `borderTopWidth: 1`'den geliyor. `Elevation` setinde
  bu kullanımın karşılığı yoktu (`sheet` çok güçlü); doğru cevap yeni token eklemek değil,
  Midas kararını uygulamaktı.
- **Auth ekranlarına `AuthLayout`/`Button`/`TextField` primitive'i ÇIKARILMADI.** İki ekran
  neredeyse aynı stil bloğunu taşıyor ve bu tekrar bilinçli olarak duruyor: adım 7'nin
  hedefi token geçişiydi, primitive çıkarmak ayrı bir iş. Faz 2'de üçüncü bir form ekranı
  (`EditProfile`) gelirse o zaman gerçek bir gerekçe oluşur.
- **`MapScreen`'in overlay kartı `ErrorBanner`'a GEÇMEDİ — ertelendi, açık iş.** Butonun
  **stili** primitive'inkiyle aynı token'lara bağlandı (görsel drift yok) ama **yapı** ayrı
  kaldı: o kartta hata metni sol sütunda, buton sağ yuvada ve aynı yuvayı spinner ile
  "N puanlanan" sayacı paylaşıyor. Geçiş, kartın düzenini yeniden kurmak demek — tasarım
  değil yapı değişikliği. Gerekçe `ErrorBanner.tsx`'in yorumunda da yazılı.
- **Logo lockup'ı üç ekranda birleşti**: Splash (`RootNavigator`), Login, Register — hepsi
  80px `brandSubtle` daire + `restaurant` ikonu (40px, `brandStrong`), gölgesiz. Öncesinde
  üç farklı çap (88/80/72), üç `🍽️` emoji ve yalnızca splash'te yeşil parıltı gölgesi vardı.
- **Auth ekranlarında `appName` 32→28** (`Type.display`). İki ekran farklı boyuttaydı,
  rol tek olduğu için kendiliğinden birleşti.
- **`ActivityIndicator` renkleri token'a bağlandı** — `color={Colors.brand}` /
  `Colors.textOnBrand`. Bunlar `StyleSheet` dışında olduğu için ilk taramalarda gözden
  kaçıyordu; ham hex avında prop'lara da bakmak gerekiyor.

- **Kritik:** Listeler, diary ve fotoğraf ekranlarının nasıl görüneceği de plana dahil edilmeli —
  sonradan uydurmak yerine yeri baştan hazır olsun. Karar: **bugün kullanılanı inşa et,
  Faz 2 kompozitlerini (`ListCard`, `DiaryRow`, `PhotoGrid`) spec olarak yaz.** Kullanılmayan
  bileşen yazmak ölü kod olur.
- **Kritik:** Marka rengi tek token'a bağlı. Artık `Palette.green` ramp'i değişince
  `brand`/`brandStrong`/`brandSubtle`/`brandSurface`/`brandBorder` birlikte döner.
  Kalan istisna: `MapScreen`'deki `pinColor="#22C55E"` — Android yalnızca hue'yu
  kullandığı için token'a bağlamak görünümü birebir düzeltmez.
- ~~`RestaurantDetailScreen` cache hit'te spinner~~ — **çözüldü** (adım 3):
  `placeCache`'e L1 bellek katmanı + `peekPlace()` senkron okuma.
- ~~"Tekrar dene" butonu eksikliği~~ — **çözüldü** (adım 3): `ErrorBanner` primitive'i.

**Kalan cilalama işi — animasyon detayları:**
- `RestaurantBottomSheet`'in **kapanış animasyonu yalnızca sürüklemede oynuyor.**
  Sürükleme `dismissSheet()` çağırıp animasyonu bekliyor, ama "Kapat" butonu ve
  karartmaya dokunma doğrudan `onClose()` çağırıyor → `MapScreen` `selectedRestaurant`'ı
  null yapıyor → bileşen `if (!restaurant) return null` ile anında kayboluyor.
  Düzeltmek için bileşenin kapanış animasyonu boyunca son veriyi tutması gerekiyor
  (`restaurant` null olsa bile render etmeye devam etmesi). Üç kapatma yolu da
  işlevsel olarak çalışıyor, yalnızca ikisi ani.

### Faz 2 — Ürün kimliği
Sırayla: **listeler → diary → fotoğraflar.**

Veri modeli kararları (verildi):

| Tablo | Rol |
|---|---|
| `places` | **Hazır (Faz 1a).** Mekan başına tek satır, paylaşılan Google cache'i. Aşağıdaki üç tablonun `place_id`'si buna FK olacak — `on update cascade`, `on delete restrict` |
| `user_rankings` | Mevcut haliyle kalıyor. Mekan başına **tek satır**: kanonik puan + `rank_index` sırası |
| `diary_entries` | **Hazır (migration 009).** Mekan başına **sınırsız satır**: `visited_at`, nullable `rating`, `note` |
| `lists` | **Hazır (migration 005).** Kullanıcının koleksiyonları, `is_ordered` bayrağı ile sıralı/sırasız |
| `list_items` | **Hazır (migration 005).** `list_id`, `place_id`, `position` |

#### `lists` / `list_items` (migration 005 — UYGULANDI)

- **`position`'ın `default`'u YOK, bir `before insert` trigger'ı dolduruyor**
  (`set_list_item_position`). `default 0` koymak `rank_index`'te yaşanan sessiz veri
  kaybının aynısını kurardı: istemci kolonu göndermeyi unuttuğunda her öğe 0 olur ve
  sıra hatasız biçimde yok olur. Trigger `max(position) + 1` yazıyor; istemci `position`
  kolonunu **hiç göndermiyor**. `not null` kolona null yazılabilmesinin sebebi:
  Postgres'te BEFORE trigger'lar kısıt kontrollerinden önce çalışır.
- **`position` üzerinde `unique` kısıtı YOK — bilinçli.** Cazip ama yeniden sıralamayı
  felç eder: iki öğenin yerini değiştirmek çakışan bir ara duruma girer ve
  `deferrable initially deferred` gerektirir. Okuma `order by position, created_at`
  yapıyor; çift değer görsel olarak zararsız, ikinci anahtar kararı veriyor.
  Aynı sebeple trigger'daki yarış durumu da kabul edildi (tek kullanıcının kendi listesi).
- **`list_items`'ta `user_id` YOK.** RLS sahipliği **ebeveyn liste üzerinden** doğruluyor
  (`exists (select 1 from lists l where l.id = list_id and l.user_id = auth.uid())`).
  Denormalize etmek RLS'i hızlandırırdı ama bu projede denormalize kolonlar zaten
  pişmanlık kaynağı. `lists.id` PK olduğu için alt sorgu satır başına tek indeks araması.
- **UPDATE politikalarında `with check` de var**, yalnızca `using` değil. `using` hangi
  satırın güncellenebileceğini, `with check` satırın YENİ halini denetliyor. Olmadan
  kullanıcı kendi listesindeki bir öğeyi başkasının listesine taşıyabilirdi
  (`using` eski satıra bakar, o kendi listesidir).
- **`is_ordered` veritabanı tarafında hiçbir şeyi değiştirmiyor.** `position` her iki
  durumda da doluyor. Yalnızca arayüzün sözleşmesi: `true` → sıra numarası + yeniden
  sıralama, `false` → eklenme sırasına göre numarasız. Listenin kalıcı özelliği olduğu
  için kolonda duruyor, görüntüleme tercihi değil.
  - **Yeniden sıralama SÜRÜKLE-BIRAK DEĞİL, yukarı/aşağı ok** (Diff B kararı). Sürükle-bırak
    yeni bir bağımlılık (`react-native-draggable-flatlist`) demekti; oklar hem `Sıralamam`
    sekmesiyle aynı dil hem `reorder_list_items()` RPC'sine birebir oturuyor — takas edilen
    iki öğenin yeni id dizisi tek çağrıyla gidiyor.
- **`list_items.updated_at` YOK.** Değişebilen tek alan `position` ve yeniden sıralama
  tek seferde onlarca satırı güncelliyor — her birine damga vurmak anlamsız yazma yükü.
  `lists.updated_at` zaten değişimi izliyor.
- **`is_public` ve `list_items.note` bilinçli olarak EKLENMEDİ.** Gizlilik Faz 3'ün sosyal
  katmanıyla iç içe bir UI+RLS kararı; sonradan eklemek ucuz (`add column` + iki politika,
  veri migration'ı yok). `note` ise `diary_entries.note` ile rol çakışması riski taşıyor.
- FK'lar ve unique kısıtı `create table` içinde **inline değil**, ayrı `ALTER`'larda ve
  açık isimli (`list_items_list_fk`, `list_items_place_fk`, `list_items_unique_place`) —
  `create table if not exists` tabloyu bulursa inline tanımları uygulamaz.
- `idx_list_items_place_id` **migration 003'ün dersi**: Postgres FK'nın referans eden
  tarafına indeks açmaz; `on delete restrict` kontrolü ve `places(*)` gömülü sorgusu
  onsuz tablo taraması yapar.

#### `reorder_list_items()` RPC (migration 006 — UYGULANDI)

- **Sıra istemcide hesaplanmaz.** İstemci yalnızca **sıralı id dizisi** gönderiyor,
  `position` sunucuda `with ordinality` ile yazılıyor. Tek statement, ya hepsi ya hiçbiri.
- **Toplu `upsert` REDDEDİLDİ.** `upsert` bir `INSERT ... ON CONFLICT`: hatalı bir `id`
  hata vermek yerine **yeni satır yaratır**. Ayrıca `list_id`/`place_id` `not null`
  olduğu için istemcinin onları bayat kopyasından geri göndermesi gerekirdi.
- **`security definer` DEĞİL** — `upsert_place`'ten farkı bu. `upsert_place` RLS'i
  bypass etmek zorundaydı (`places`'te yazma politikası yok); burada `list_items`'ın
  UPDATE politikası zaten sahipliği doğruluyor. Çağıranın haklarıyla çalışmak ek bir
  güvenlik katmanı: başkasının listesi 0 satır günceller, satır sayısı kontrolü onu
  hataya çevirir.
- Dört doğrulama: boş dizi · mükerrer id · eksik/fazla id · güncellenen satır sayısı
  uyuşmazlığı. Hepsi `raise exception` → işlem geri alınır, kısmi sıralama kalmaz.

#### `useLists` / `useListItems` konvansiyonları

- **İkiye bölündü.** `useLists` listelerin kendisi (`ProfileScreen`'in sekmesi),
  `useListItems` TEK listenin içeriği (liste detay ekranı). Tek hook'ta birleştirmek
  "Listeler" sekmesinde hangi listenin öğelerinin yükleneceği sorusunu doğururdu —
  cevap "hiçbirinin", yani o kod yolu orada ölü dururdu.
- `useLists` öğe sayısını `select('*, list_items(count)')` ile alıyor — N ek sorgu yok.
  Okuması için `itemCountOf(list)` yardımcısı var.
- **`addItem` `position` GÖNDERMİYOR** (trigger yazıyor), `updateList` `updated_at`
  göndermiyor (trigger yazıyor).
- **`removeItem` kalan `position`'ları yeniden numaralandırmıyor.** Silme sonrası
  0,1,3 gibi boşluklu dizi kalabilir — sorun değil, sıra `order by position` ile
  okunuyor, mutlak değerlerin anlamı yok. Yeniden numaralandırmak N satırlık gereksiz
  yazma olurdu.
- **`reorderItems` iyimser güncelleme yapıyor ama hata halinde GERİ ALIYOR.** Ekranda
  yeni sıra, veritabanında eski sıra kalması sessiz bir yalan olurdu.
- **Postgres hata KODLARI ayrıştırılıyor** (`23505` unique, `23503` FK) →
  "Bu mekan listede zaten var" / "Mekan bilgisi bulunamadı". Bu, reddettiğimiz "hata
  türü ayrıştırma"dan FARKLI: ağ hatası metnini regex'lemek kırılgan, Postgres hata
  kodu belgeli ve kararlı bir sözleşme.
- `addItem`'ın ÖN KOŞULU: mekanın `places` cache satırı olmalı (FK). Çağıran ekran
  önce `resolvePlace(placeId)` çağırmalı; `23503` hatası bunun atlandığını söyler.

Kararlaştırılan davranışlar:
- Diary'ye log girerken puan **zorunlu değil** (Letterboxd gibi)
- Puansız log sadece diary'de görünür, "Puanladıklarım" sıralamasına girmez
- Puanlı log `user_rankings`'teki rating'i günceller, `rank_index`'i korur
- Listeler sıralı veya sırasız olabilir, kullanıcı seçer
- Özel/otomatik "watchlist" **yok** — kullanıcı "gidilecekler" listesini kendi oluşturur
- Restoranlar filmlerden farklı olarak tekrar tekrar ziyaret edilir — diary bu yüzden mekan
  başına çok satır, `user_rankings` tek satır tutar

**Fotoğraflar:** Supabase Storage kurulumu gerekiyor (şu ana kadar her şey Postgres'teydi).
Yeni tablo `place_photos` (mekan, kullanıcı, dosya yolu, açıklama, tür). Tür alanı
`menu` / `yemek` / `mekan` / `diğer` olmalı — Beli'deki en beğenilen özellik kullanıcı çekimi
menü fotoğrafları; mekan sayfasında ayrı "Menü" sekmesi gösterilebilsin. Moderasyon ihtiyacı
ileride doğacak, bugün sorun değil.

### Faz 3 — Sosyal katman
- **Leaderboard:** kapsam arkadaş + şehir, **global YOK** (büyük kullanıcı kütlesinde global
  sıralama motive edici olmaktan çıkıp caydırıcı oluyor). `follows` tablosu zaten var.
  Metrik kararı **henüz verilmedi** — "gidilen mekan sayısı" en basit ama en kolay suistimal
  edilen (kimse doğrulamıyor). Alternatifler: diary girişi sayısı, veya fotoğraflı girişlere
  ağırlık. Bu faza gelindiğinde hangi verinin gerçekten biriktiği görülüp karar verilecek.
- **Kişiselleşmiş öneriler:** ana sayfada öneri satırı. Kullanıcının yüksek puanladığı
  mekanların Google `types` alanlarına bakıp benzer tür mekanlar önerme (içerik tabanlı).
  İşbirlikçi filtreleme kritik kullanıcı kütlesi gerektiriyor, bugün yapılamaz.
- **Şehir değiştirici:** öneri satırındaki şehir tek tıkla değişebilmeli (Ankara → İstanbul).
  Tatil senaryosu için değerli. **Dikkat:** her şehir değişimi yeni Places sorgusu demek —
  `places` tablosunda şehir bazlı cache tutulmazsa maliyet hızla artar.

### Faz 4 — Marka
İsim ve logo. Bilinçli olarak en sona bırakıldı: ürün netleştikten sonra isim bulmak,
boşluğa isim uydurmaktan kolay.

## Bilinen Açık İşler (teknik borç)
- **`useAuth` Context'e çevrilmeli — asıl mimari sorun bu.** `useAuth` bir Context değil;
  her çağıran kendi `useState` + `getSession()` + `onAuthStateChange` örneğini kuruyor.
  Mount anında `user` henüz null iken sorgu atılıp effect bir daha tetiklenmiyordu.
  `ProfileScreen`, `HomeScreen`, `RestaurantDetailScreen` tek tek
  `useFocusEffect(useCallback(..., [fetchX]))` kalıbıyla yamalandı; `HomeScreen`'de ayrıca
  `follower_id=eq.` (boş string uuid) yüzünden her açılışta sessiz HTTP 400 gidiyordu, düzeltildi.
  **Kök neden hâlâ duruyor** — aynı yarış sınıfı yeni ekranlarda tekrar edecek.
  `AuthProvider` refactor'ü ~5-6 dosyaya dokunur.
- **`src/screens/SearchScreen.tsx:87` hâlâ ham `fetch` ile autocomplete çağırıyor**,
  `json.status` kontrol etmiyor. `places.ts`'teki `autocomplete()` hazır ama kullanılmıyor.
  Faz 1b adım 6'da bu dosyanın stilleri elden geçirildi ama bu **bilinçli olarak
  dokunulmadı** — tasarım değil davranış değişikliği, ayrı diff olmalı.
- **Google API key'inde kısıtlama yok.** Cloud Console'dan Android package name + SHA-1
  kısıtlaması konmalı. `EXPO_PUBLIC_` değişkenleri JS bundle'a gömüldüğü için key
  uygulamadan çıkarılabilir. **Kod tarafında yapılacak bir şey yok — kullanıcının Console'dan
  yapması gerekiyor.**
- POI `place_id` ile autocomplete `place_id` bazı kenar durumlarda farklı olabiliyor;
  ileride kontrol edilmeli.
- ~~Kalıcı POI cache'i~~ — **KAPANDI** (Faz 1a). L2 `places` tablosunda, L1 ise
  `placeCache`'in modül belleğinde. `MapScreen`'in `poiCacheRef`'i silindi.
- **Yeme-içme filtresinin tür listesi kesin değil.** `isFoodPlace` gerçek kullanımda
  yanlış reddederse `console.debug` satırından (`POI yeme-içme değil, atlandı`) mekanın
  `types` dizisi okunup listeye eklenecek. Türkiye'de küçük esnaf lokantalarının Google
  etiketlemesi tutarsız — bu bir mekanizma, garanti değil.
- **Place ID değişimi otomatik ele alınmıyor.** `resolvePlace` Place Details boş dönerse
  hata fırlatıyor (`place_id` değişmiş olabilir) ama yeni ID'yi bulup `places` üzerinde
  güncelleme yapmıyor. FK'daki `on update cascade` bu güncellemeyi tek satıra indirecek
  şekilde hazır — eksik olan tespit + yeni ID'yi bulma adımı.
- **`SearchScreen` autocomplete cache'lenmiyor** ve cache'lenmemesi doğru (sorguya özel,
  ToS açısından da tartışmalı). Ama her 400ms debounce'ta faturalanan bir istek gidiyor;
  session token kullanımı ileride incelenmeli.
- **`MapScreen`'in overlay kartı `ErrorBanner`'a geçmedi** (adım 7'de bilinçli ertelendi).
  Stil aynı token'lara bağlı, yapı ayrı. Geçiş kartın sol sütun / sağ yuva düzeninin
  yeniden kurulmasını gerektiriyor — sağ yuvayı spinner ve "N puanlanan" sayacı da
  paylaşıyor. Ayrı bir diff olmalı.
- **Auth ekranlarındaki stil tekrarı duruyor** (`formCard` / `input` / `primaryButton`
  blokları iki dosyada neredeyse birebir). Bilinçli: üçüncü bir form ekranı gelmeden
  primitive çıkarmak erken soyutlama olur. Tetikleyici: Faz 2'nin `EditProfile` ekranı.
- **TEK SEFERLİK gözlem, TEKRARLANMADI (2026-08-01):** Profil → Günlük → bir girişe
  dokun → mekan detayı → geri → **Günlük yerine aynı mekan detayına dönüldü** (döngü
  gibi). İkinci denemede sorun çıkmadı, peşine düşülmedi. Tekrarlarsa yakalanacaklar:
  kaç kez geri basıldığı · aynı mekana günlükte birden çok giriş olup olmadığı
  (iki satır aynı `placeId` ile aynı rotayı push ediyor olabilir) · `ProfileStack`'in
  o andaki derinliği. Şüpheli: aynı rotaya art arda iki push.
- ~~`rank_index` kuralının istemci/SQL ikiliği~~ — **KAPANDI** (2026-08-01).
  `addOrUpdateRanking` artık `upsert_user_ranking()` RPC'sini çağırıyor; kural tek
  kaynakta (SQL). `restaurant_name`/foto/koordinat parametreleri de kalktı — RPC
  onları `places`'ten okuyor.
  - **`review_text` RPC'ye GİRMEDİ, ayrı bir UPDATE olarak kaldı.** RPC'yi diary
    yolu da çağırıyor ve ziyaret kaydetmek mevcut yorumu silmemeli; yorumu oraya
    koymak "parametre gelmediğinde dokunma / temizle" ayrımı için fazladan bir
    bayrak parametresi gerektirirdi. Bedeli: iki tur ve atomik olmama (puan
    yazılıp yorum yazılamazsa kullanıcı bunu söyleyen bir mesaj görüyor, puan
    yazması idempotent). Sıra kuralı bu yazmaya hiç dahil değil, yani asıl amaç
    korunuyor.
- ~~Üç eski hook'un ham `error.message`'ı~~ — **KAPANDI** (2026-08-01).
  `useRankings` ve `useProfile` artık kısa Türkçe metin veriyor, ham hata
  `console.error`'da. İki ekrandaki `` `... okunamadı: ${error}` `` şablonları da
  kaldırıldı (hook tam cümle döndürdüğü için tekrarlı metin üretiyorlardı).
  `useProfile`'da ayrıca **"satır yok" ile "sorgu patladı" ayrıştırıldı**: ilki
  `console.warn` + "Profil bilgin bulunamadı", ikincisi `console.error` +
  "Bağlantını kontrol et".

## Konuşulacak (kullanıcı isteği, karar VERİLMEDİ)
- **Bir listeye dokununca haritadaki pin'lerin o listeye göre filtrelenmesi/vurgulanması**
  — Letterboxd'un "koleksiyonu haritada gez" hissi (istek: 2026-08-01, **kapsam dışı,
  ayrı ve daha büyük bir iş**). Karar verilecekler: filtre mi vurgu mu (diğer pin'ler
  kaybolsun mu, soluklaşsın mı) · aktif filtrenin nasıl gösterileceği ve nasıl
  temizleneceği · `pinColor` yalnızca hue kullandığı için renkle ayrıştırmanın sınırı
  (ikinci renk isteniyorsa yol `icon` prop'u + önceden üretilmiş PNG, özel view DEĞİL —
  bkz. Harita/Marker bölümü) · liste öğelerinin koordinatı `places(*)` join'inden
  geliyor, koordinatsız satırlar çizilemez.

## Çalışma Kuralları
- **Büyük değişikliklerden önce plan sun, onay bekle.** Kullanıcı onaylamadan kod yazmaya başlama.
- **Kod değiştirmeden önce teşhis et.** Sorun varsa önce kök nedeni bul, raporla, sonra düzelt.
- **Küçük, test edilebilir adımlarla ilerle.** Birbirine bağımlı işleri tek diff'te birleştirme.
- **Her değişiklikten sonra typecheck** (yukarıdaki tam yollu komut).
- **Uygulamayı çalıştıramıyorsun.** Görsel/davranışsal doğrulamayı kullanıcıdan iste, ne
  bakması gerektiğini açıkça söyle.
- **Hipotezini kanıtla.** Bu projede korelasyonu nedensellik sanmak beş tur kaybettirdi
  (marker olayı). Emin değilsen ayırt edici bir test öner.
- Kullanıcı Claude Code'da yeni, adım adım rehberlik bekliyor. Terminal komutlarını ve
  Supabase panel adımlarını açıkça yaz.
