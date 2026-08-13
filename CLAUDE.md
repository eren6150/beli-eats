@AGENTS.md

# Beli-Eats

## 📍 Nerede kaldık — 2026-08-13

**Fotoğraf akışının yeniden tasarımı BİTTİ ve sahada** (hepsi OTA, migration
020 dışında yeni migration yok, native değişiklik yok). Sırayla:

1. ✅ `usePendingPhotos` + `PendingPhotoStrip` çıkarıldı (`37f4343`)
2. ✅ "Puanı Kaydet" akışından da fotoğraf eklenebiliyor (`c0a5163`)
3. ✅ **Dokunma çözümlemesi** — sonra **tersine çevrildi** (aşağıda)
4. ✅ **`PhotoViewer`**: tam ekran fotoğraf + üst/alt bilgi şeritleri, üç
   katmanlı jest yapısı, açılışta 2 sn görünüp sönme
5. ✅ Ziyaret detayındaki fotoğraf şeridi de tam ekran açıyor
6. ✅ Şeritteki **kullanıcı adı profile gidiyor** — dört sekmede de doğrulandı

Bu turun iki kalıcı dersi: **`pointerEvents="box-none"` iç `Pressable`'ın
dokunuşunu yutuyor** (çözüm: katmanı `Pressable` yap) ve **`UserProfile` dört
stack'in ikisinde kayıtlı değildi** (Ara/Harita'da uyuyan bir çökme).
İkisi de Mimari Notlar → **`PhotoViewer`** bölümünde.

**Beş commit atıldı** (`c0a5163` üstüne), çalışma ağacı temiz, üç ara
commit'in her biri tek başına typecheck'ten geçiyor:

| Commit | Kapsam |
|---|---|
| `88c795b` | Veri katmanı — gömülü ziyaret + `usePlaceRankings` |
| `e77ea60` | `UserProfile`'ın eksik rota kayıtları (Ara + Harita) |
| `016c690` | `PhotoViewer` — tam ekran + bilgi şeritleri + ziyaret şeridi |
| `3bab756` | docs — `box-none` dersi ve eksik rota dersi |
| `c942109` | Ziyaret detayı yalnızca o ziyaretin fotoğraflarını gösteriyor |

Sıra derlenebilirliğe göre: **veri → rota → görüntüleyici**. Görüntüleyici
`UserProfile`'a `navigate` ettiği için rota commit'i ondan önce gelmek
zorundaydı. ⚠️ **Push edilmedi** — içerikler OTA ile zaten sahada ve
doğrulandı, push yalnızca tarihsel kaydı senkronlar.

**Faz 3'ün sosyal katmanı KAPANDI ve tamamen sahada.** Döngünün tamamı
push + OTA + gerçek APK'da doğrulandı, arkadaşla çapraz hesap testi de geçti:

takip et → profil → günlük → ziyaret detayı → beğeni → takipçi listesi →
**aktivite akışı** (Ana Sayfa)

Migration'lar panelde çalıştırıldı ve doğrulandı: **015** (günlük herkese
açıldı) · **016** (`entry_likes`) · **017** (sıralama güncellemesi kullanıcı
onaylı).

Sosyal döngüden sonra dört iş daha yapıldı ve hepsi cihazda doğrulandı:
**"Senin Ziyaretlerin"** (mekan sayfası) · **"Sıralamamı da güncelle"
anahtarı** · **yıldızların büyük yazı tipinde kırpılma düzeltmesi** ·
**`RankingReviewSheet`** (yorumun okuma görünümü).

Böylece `user_rankings` ↔ `diary_entries` arasındaki **iki boşluk da kapandı**.

**Kademe 2 hazırlığı başladı (2026-08-09).** E-posta onayı **açıldı** ve akış
uçtan uca doğrulandı: onay maili → iniş sayfası → giriş. Kullanıcı adı
çakışması artık önden uyarıyor ve profilden düzeltilebiliyor. Custom SMTP
(**SendGrid**) bağlandı — bu koşul plan yapılırken atlanmıştı, sahada çıktı.
Kalan iki koşul: **fotoğraf moderasyonu** ve **kendi alan adı**.

**Bir sonraki build'in planı YAPILDI ve Aşama 0 KAPANDI (2026-08-10).**
İş ikiye ayrıldı: **Aşama 0** = build gerektirmeyen, bugün OTA ile gidebilen
işler · **Build 1** = native değişiklik isteyen paket.

- ✅ **Aşama 0 — şifre sıfırlama (OTP).** Giriş ekranında "Şifreni mi
  unuttun?" → e-posta → mailde gelen kod → yeni şifre. Saf JS, OTA ile
  sahada. Detay ve iki kalıcı ders: Mimari Notlar → **Şifre sıfırlama**.
- ✅ **Build 1 TAMAMLANDI ve SAHADA (2026-08-11).** `version` **1.2.0** /
  versionCode **5**, `scheme: "belieats"`. **16 testin hepsi gerçek APK'da
  geçti.**

  | # | İş | Durum |
  |---|---|---|
  | 1 | scheme + sürüm ritüeli + `expo`→54.0.36 + deep link paketleri | ✅ |
  | 2 | **Deep link** (onay maili uygulamayı açıyor) + PKCE | ✅ **doğrulandı** |
  | 3 | **Google ile giriş** (tarayıcı tabanlı) | ✅ **doğrulandı** |
  | 4 | **Kaydırmalı sekmeler** | ✅ *yalnızca* `FollowersList` |
  | 5 | `react-native-keyboard-controller` | ✅ **yalnızca sağlayıcı** |
  | — | `fingerprint` `runtimeVersion` | ⏸️ **Build 1'DEN ÇIKARILDI** (karar A) |

  ⚠️ **OTA RUNTIME'I ARTIK 1.2.0.** Kendi cihazında yeni APK kurulu, yani OTA
  akıyor. **Arkadaşındaki APK hâlâ versionCode 4 / runtime 1.1.0** — ona
  gönderilecek OTA'lar ulaşmaz, **yeni APK'yı kurması gerekiyor.**
  - **keyboard-controller'ın ekranlara UYGULANMASI yapılmadı** — yalnızca
    sağlayıcı kuruldu. Ekran taşımaları **saf JS, yani OTA ile gidebilir**;
    build'e girmesi gereken tek şey paketin native tarafıydı.
  - **Karar: `fingerprint` Build 1'e ALINMADI.** §9'da bir kez build'i
    patlatmıştı; kanıtlanmamış "Fark 2" **New Architecture codegen kullanan
    RN kütüphanelerinden** geliyor ve bu build tam o kategoriden iki paket
    ekliyor (keyboard-controller, pager-view). Teşhis edilmemiş bir değişkeni,
    onu besleyen değişkeni değiştirirken çözmeye çalışmak olurdu. Arkadaş
    testi bitince kendi başına ele alınacak.
  - **Karar (2026-08-10): Google girişi TARAYICI TABANLI yol** olacak
    (`expo-web-browser` + `scheme` + `Linking` dinleyicisi), native seçici
    değil — altyapıyı **deep link ile paylaşıyor**, yani iki iş aynı
    build'de doğal olarak birleşiyor.
  - **Karar: ilk Google girişinde kullanıcı adı OTOMATİK atanacak**
    (e-postanın @ öncesi + gerekirse migration 012'nin soneki), kullanıcı
    sonradan `EditProfile`'dan düzeltir. **Yeni ekran / soru akışı YOK** —
    kullanıcı kararı.

**Build 1 sonrası ilk OTA turu da sahada (2026-08-11).** İki iş, ikisi de
cihazda doğrulandı:
- ✅ **Takipçi çıkarma** (migration 019) — takipçi listesinde uzun basış →
  onay. "Takip Edilenler" sekmesinde aynı jest takibi bırakıyor. Detay ve
  kalıcı ders (*RLS reddi hata değil, sessiz 0 satır*): Mimari Notlar →
  **Takipçi çıkarma**.
- ✅ **`ForgotPasswordScreen` → `KeyboardAwareScrollView`.** Klavye açıkken
  "Kod gönder" alttan kırpılıyordu. keyboard-controller'ın **ilk gerçek
  uygulaması**; sağlayıcı Build 1'de binary'ye girmişti, bu adaptasyon saf JS
  olduğu için OTA ile gitti. **Diğer form ekranları bilinçli olarak
  taşınmadı** — gerekçe Bilinen Açık İşler'de.

**Engelleyici açık iş yok.** Sıradakiler için üç yere bak: Yol Haritası →
**Faz 3'ün ertelenen dört maddesi** (üçü ölçek/veri koşulu bekliyor) ·
**Bilinen Açık İşler** (bir sonraki build'in paketi orada, en üstte — Faz 4'ün
native tarafı da o listede) · **Faz 4 — Marka** (neyin OTA neyin build
istediği çıkarıldı, tablo build paketinin altında).

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
- Supabase anahtarları `.env` içinde, `.gitignore`'da. **`app.config.js`** dinamik
  config (API key enjeksiyonu burada), `app.json` statik kısım.
  **Bu dosya bir dönem `app.config.ts` idi ve EAS CLI onu okuyamadı** — gerekçe
  ve tam teşhis: Dağıtım / EAS Build §1.
- Expo Go SDK 54 yalnızca New Architecture destekliyor.
- **Claude uygulamayı çalıştıramıyor** — fiziksel Android cihaz kullanıcıda. Görsel/davranışsal
  doğrulamayı kullanıcıdan iste ve neye bakması gerektiğini açıkça söyle.

## Mimari Notlar

### Veri / Backend
- Auth: kayıt/giriş aktif. **Zorunlu e-posta onayı AÇIK** (2026-08-09) ve
  akış uçtan uca doğrulandı. Önündeki altı sorunun hepsi kapandı; altyapının
  üç panel parçası (**custom SMTP / Site URL / Redirect URLs**) ve alan adı
  uyarısı: Mimari Notlar → **Auth / kayıt akışı**.
- Takip sistemi: `follows` tablosu (`follower_id`, `following_id`)
- **Migration'lar elle çalıştırılıyor** (Supabase SQL Editor). Sıfırdan kurulum sırası
  `supabase_schema.sql` başında yazılı:
  `schema` → `001_coords` → `002_places` → `003_places_fk` → `004_profile_fields` →
  `005_lists` → `006_reorder_list_items` → `007_move_list_items` →
  `008_move_list_items_copy` → `009_diary_entries` → `010_log_diary_entry` →
  `011_update_diary_entry` → `012_username_conflict` → `013_place_photos` →
  `014_place_photos_storage` → `015_public_diary` → `016_entry_likes` →
  `017_optional_ranking_update` → `018_photo_moderation` →
  `019_remove_follower`.
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

### Auth / kayıt akışı — ✅ E-POSTA ONAYI AÇIK, ALTI MADDE DE KAPANDI
> **2026-08-09'da tamamlandı ve uçtan uca doğrulandı.** Onay panelden AÇILDI.
> (e) ve (f) 2026-08-04'te kapanmıştı; (b) ile (a)/(c)/(d) 1a paketinin üç
> diff'iyle kapandı. Aşağıdaki analiz **tarihsel kayıt** olarak duruyor —
> her maddenin ne olduğu ve nasıl çözüldüğü kendi başlığında yazılı.

**Çalışan akış:** `RegisterScreen.handleRegister` → `useAuth.signUp`
(`options.data.username` ile) → `auth.users` insert → **trigger**
`on_auth_user_created` profil satırını yazıyor (çakışmada sonek üretiyor) →
onay maili gidiyor → kullanıcı bağlantıya dokunuyor → **iniş sayfası**
(`docs/index.html`, GitHub Pages) → uygulamaya dönüp giriş yapıyor.

#### ⚠️ Onay akışının ÜÇ altyapı parçası — üçü de panelde
Kodda değil, **panelde** yaşıyorlar; unutulursa akış sessizce kırılır.

1. **Custom SMTP — ZORUNLU, opsiyonel değil.** Supabase'in dahili mail
   sunucusu *"yalnızca test için"* ve **proje genelinde saatte birkaç
   e-posta** ile sınırlı. Sahada bulundu: 3-4 kayıt denemesi kotayı bitirdi
   ve sonraki her deneme `over_email_send_rate_limit` verdi; 10 dakika
   beklemek yetmedi çünkü **pencere saatlik ve limit IP/e-posta başına
   değil, PROJE genelinde**.
   - **Kullanılan sağlayıcı: SendGrid.** Önce Brevo denendi, hesap
     açma/giriş sorunları çözülemedi ve vazgeçildi.
   - ⚠️ **Custom SMTP bağlamak kotayı OTOMATİK YÜKSELTMİYOR** —
     Authentication → Rate Limits'teki değer elle artırılmalı, yoksa aynı
     duvara toslanır.
2. **Site URL** — Supabase onay bağlantısında e-postayı ÖNCE sunucuda
   onaylıyor, SONRA tarayıcıyı buraya yönlendiriyor. Fabrika varsayılanı
   `http://localhost:3000` olduğu için kullanıcı `ERR_CONNECTION_REFUSED`
   görüyordu — **hesap onaylanmış olmasına rağmen** "kayıt olamadım"
   izlenimi veriyordu. Artık GitHub Pages'teki iniş sayfasına bakıyor.
3. **Redirect URLs** — bugün BOŞ olabilir; o liste yalnızca kodda
   `emailRedirectTo` gönderilirse devreye giriyor ve göndermiyoruz. Deep
   link geldiğinde doldurulacak (bir sonraki build'in paketi).

⚠️ **ALAN ADI YOK, SPAM RİSKİ GERÇEK.** SPF/DKIM imzası olmadığı için onay
mailleri Gmail/Outlook'ta spam'e düşebilir. Arkadaş testinde tolere edilir;
**davetli çevreye açmadan önce kendi alan adı bağlanmalı.** Faz 4'le doğal
olarak birleşiyor: marka adı kararlaşınca alan adı alınır, mail altyapısı
onun üstüne kurulur.

#### Kapanan maddeler — tarihsel kayıt

**Eski akış:** `RegisterScreen.handleRegister` → `useAuth.signUp` →
`supabase.auth.signUp({ email, password })` → `auth.users` insert → **trigger**
`on_auth_user_created` profil satırını yazıyor (`supabase_schema.sql:29-46`) →
istemci ayrıca `profiles.insert` deniyor.

#### Onay açılınca kırılacaklardı — ÜÇÜ DE KAPANDI (2026-08-09)

**~~(a) Başarı mesajı doğrudan yalan olur.~~ → KAPANDI.** Eskiden
`Alert('Başarılı! … Giriş yapabilirsin')` + `navigate('Login')` yapıyordu;
onay açıkken giriş YAPILAMAZ, yani kullanıcı Login'e atılıp reddediliyordu ve
e-postasına bakması gerektiğini söyleyen hiçbir şey yoktu.

Artık `RegisterScreen` **Login'e atmıyor**; formun yerine bir durum görünümü
geliyor: mail ikonu + *"{email} adresine onay bağlantısı gönderdik"* + spam
hatırlatması + "Tekrar gönder" + "Giriş ekranına dön".
- **Ayrı ekran/rota YAPILMADI** — yeni rota + `AuthStack` değişikliği demekti,
  oysa gösterilecek tek bir bilgi var. Mevcut parçalarla (`Icon` + `Button`)
  kuruldu, yeni tasarım dili gerekmedi.
- Yan fayda: yönlendirme kalktı. Onay KAPALIYKEN `RootNavigator` zaten oturumu
  görüp uygulamaya geçiriyordu — iki taraf yarışıyordu.

**~~(b) Reddedilme mesajı ham ve İngilizce.~~ → KAPANDI (2026-08-09, cihazda
DOĞRULANDI).** Ham `error.message` ekrana basılıyordu (`Email not confirmed`,
`Invalid login credentials`) — "ham `error.message` bir kullanıcı metnine
ŞABLONLANMAZ" kuralının ihlaliydi ve onay açılınca en sık görülen hata bu
olacağı için görünürlüğü tavan yapacaktı.

Düzeltme **`useAuth.tsx`'te, ekranlarda DEĞİL** — projenin kuralı *"hook kısa
Türkçe metin döndürür, ham hata konsola"* (`useRankings`/`useProfile` bir kez
böyle düzeltilmişti). `toDisplayError` hata **KODUNU** eşliyor, iki auth ekranı
**hiç değişmedi** (ikisi de zaten `error.message` gösteriyordu).
- Kod eşlemesi mesaj regex'lemekten farklı ve projenin zaten onayladığı ayrım:
  `code` belgeli ve kararlı bir sözleşme (`useListItems`'ın `23505`/`23503`
  ayrıştırmasıyla aynı gerekçe).
- Eşlenen üç kod: `email_not_confirmed` · `invalid_credentials` ·
  `user_already_exists`. Sonuncusu onay KAPALIYKEN de canlıydı.
- Bilinmeyen kod → tek genel metin. Ham nesne **ve kodun kendisi** ayrı
  satırlarda `console.error`'a gidiyor, yani eşlenmemiş bir kod testte görünür
  ve listeye eklenir.

**~~(c) Zaten kayıtlı e-posta → sessiz SAHTE başarı.~~ → KAPANDI.** Supabase
onay açıkken e-posta sayımını (enumeration) engellemek için var olan bir adrese
`signUp` çağrısında **hata döndürmüyor**; sahte bir user nesnesi dönüyor ve tek
ayırt edici işaret `data.user.identities` dizisinin **boş** olması. Kod yalnızca
`error`'a baktığı için ekranda "Başarılı!" yazıyor, mail hiç gelmiyor, kullanıcı
bekliyordu. Artık `signUp` `alreadyRegistered` döndürüyor.

**~~(d) "E-posta gelmedi" için çıkış yok.~~ → KAPANDI.** `auth.resend` mevcuttu
ama hiçbir yerden çağrılmıyordu. Artık onay görünümünde **"Tekrar gönder"** var:
60 saniyelik istemci kilidi + geri sayım. Supabase'in kendi hız sınırı bundan
BAĞIMSIZ (başka cihazdan da denenebilir), o yüzden
`over_email_send_rate_limit` de metin tablosunda.

#### 🔑 ÜÇ SONUCU AYIRAN TEK KAYNAK — panel ayarı OKUNMUYOR
(a) ve (c)'nin çözümü aynı iki alandan çıkıyor ve bu, tasarımın en kayda değer
yanı:

| `session` | `identities` | Anlamı |
|---|---|---|
| **var** | — | Oturum açıldı (onay KAPALI). `RootNavigator` devralıyor, ekran hiçbir şey yapmıyor. |
| yok | **boş** | **Zaten kayıtlı e-posta** → (c) |
| yok | **dolu** | **Onay bekleniyor** → (a) |

**Aynı kod onay açıkken de kapalıyken de doğru davranıyor.** Yapılandırmaya
dallanmak, bu projede üç kez pahalıya patlamış *"belirli bir yapılandırma için
doğru formül"* sınıfının auth tarafındaki karşılığı olurdu. Supabase detayı
(`data.user.identities`) **hook'ta** kalıyor; ekran onu bilmiyor.

#### Onaydan BAĞIMSIZ, bugün de bozuk

**(e) Kullanıcının yazdığı kullanıcı adı ATILIYOR** → **KOD DÜZELTİLDİ
(2026-08-04), CİHAZDA DOĞRULANMADI — versionCode 2 APK'sını bekliyor.**

Neydi: trigger metadata okumak üzere yazılmıştı (`supabase_schema.sql:33-38`)
ama `useAuth.signUp` `options.data` **göndermiyordu**. Metadata boş kaldığı için
`coalesce` hep ikinci dala düşüyor ve kullanıcı adı **e-postanın @ öncesi**
oluyordu.
- Ardından istemciden `profiles.insert` yapılıyordu; satırı trigger zaten yazdığı
  için PK çakışması (`23505`) dönüyor ve **o çağrının sonucu hiç kontrol
  edilmiyordu** (`await` var, `error` yakalanmıyor) → hata sessizce yutuluyordu.
  Yani ölü koddu: hiç çalışmadı, sadece bir tur ağ yaktı.
- Onay açılsaydı bu ikinci yazma ayrıca **anon olarak** çalışacak (`signUp`
  `session: null` döner) ve RLS'e de takılacaktı.

Düzeltme: `signUp` artık `options: { data: { username } }` gönderiyor ve
istemcideki `profiles.insert` **silindi**. **Profil yazmanın tek kaynağı trigger
oldu** — onay açıldığı gün doğacak anon-yazma sorunu da kökten kalktı.
- `RegisterScreen` kullanıcı adını `trim()`liyor. Bu, ad gerçekten
  KULLANILMAYA başladığı için anlamlı hale geldi: `"   "` mevcut `!username`
  kontrolünü geçer, sunucuda btrim'lenip boşalır ve kullanıcı sebebini
  anlamadan `kullanici` adını alırdı (migration 012'nin boş-taban savunması).
- Çakışma artık kaydı patlatmıyor: migration 012 trigger'da sonek üretiyor,
  yani iki kişinin aynı kullanıcı adını **elle yazması** da `eren2`'ye düşüyor.

**~~(f) Aynı @ öncesine sahip iki kullanıcı KAYIT OLAMAZ.~~ → KAPANDI
(2026-08-04, migration 012, uçtan uca DOĞRULANDI).**

Neydi: `profiles.username` `unique not null` (`supabase_schema.sql:24`),
`eren@gmail.com` ve `eren@outlook.com` ikisi de `eren` üretiyordu. Trigger'ın
`on conflict (id) do nothing` klozu yalnızca **id** çakışmasını karşılıyor,
**username'i değil** → unique ihlali → trigger patlar → `auth.users` insert'i
geri alınır → kullanıcı `Database error saving new user` görür ve **hiç kayıt
olamazdı**. Onay kapalıyken de canlıydı ve arkadaş testi büyüdükçe olasılığı
artıyordu.

Çözüm — **migration 012** (`supabase_migration_012_username_conflict.sql`),
sonek yaklaşımı: `eren` → `eren2` → `eren3`.
- **Neden sonek (i), nullable username (ii) DEĞİL:** (ii) daha doğru ürün kararı
  ama yeni ekran + "profilim tamamlanmadı" durumu + `not null` kaldırma demekti.
  Arkadaş testinin ORTASINDAYDIK ve düzeltmenin o gün canlıya çıkması
  gerekiyordu. (i) **saf SQL: APK gerektirmiyor**, mevcut kurulumdaki herkes
  için anında geçerli oldu. Listedeki tek "anında canlıya çıkan" düzeltmeydi.
  (ii) Faz 3'ün profil işiyle yeniden değerlendirilebilir.
- **`next_available_username(base)` AYRI fonksiyon**, trigger gövdesine gömülü
  değil. Sebep test edilebilirlik: trigger'ı denemek `auth.users`'a insert
  atmayı gerektiriyor ve yarım auth kaydı bırakıyor; bu fonksiyon SQL
  Editor'dan doğrudan çağrılabiliyor (`select public.next_available_username('eren');`).
  Bu projede "SQL Editor'dan test EDİLEMEZ" notu birden çok kez düşüldü —
  burada test edilebilirlik tasarıma katıldı. İkincil fayda: kural tek yerde
  (`upsert_user_ranking`'in `rank_index` için yaptığının aynısı).
- **Ön kontrol TEK BAŞINA YETMİYOR, döngü de var.** Aday üretimi ile insert
  arasında başka bir kayıt aynı adı alabilir (iki kişi aynı anda kaydolursa).
  Yalnızca ön kontrol, düzeltilen hatanın daha nadir bir sürümünü bırakırdı.
  Trigger `unique_violation` yakalayıp yeni adayla tekrar deniyor; iş bölümü
  net: **id çakışmasını `on conflict (id)` yutuyor, username çakışması
  exception'a düşüyor.**
- **50 denemeden sonra son çare** kullanıcının uuid parçasını ekliyor. Estetik
  değil **garanti**: bu fonksiyondan çıkan hiçbir yol kullanıcıyı
  "kaydolamadın" ekranında bırakmamalı — migration'ın varlık sebebi buydu.
- **YAN DÜZELTME — `set search_path` eklendi.** Mevcut `handle_new_user`
  `security definer` ama `set search_path` **yoktu**; projenin `upsert_place`
  için açıkça koyduğu kuralın ("bu satır atlanmamalı, search_path hijacking'e
  karşı") ihlaliydi. Fonksiyon zaten baştan yazıldığı için kapatıldı.
  `next_available_username`'e de uygulandı. Panelde doğrulandı: ikisinde de
  `proconfig = {"search_path=public, pg_temp"}`.
- **`create or replace` yeterliydi, `drop` gerekmedi:** migration 008'in "önce
  drop" dersi **parametre listesi** değiştiğinde geçerli (aşırı yükleme riski);
  burada imza birebir aynı (argümansız, `returns trigger`).
- **(e) ile ilişkisi:** (f) kapandığı için CLAUDE.md'nin eski
  *"(e) düzeltilirse çakışma ihtimali düşer ama BİTMEZ"* uyarısı da kapandı.
  Trigger artık **her iki kaynağı da** (metadata'daki kullanıcı adı ve e-posta
  @ öncesi) aynı yoldan geçiriyor; (e) geldiğinde iki kişinin aynı kullanıcı
  adını **elle yazması** da otomatik olarak `eren2`'ye düşecek.
- **Doğrulama:** SQL adımları (boşta ad · dolu ad → sonek · boş/null taban →
  `kullanici` · `proconfig`) geçti. Sahte UUID ile geçici satır testi
  `profiles.id → auth.users` FK'sına takıldı — **beklenen**, migration
  dosyasında da bu ihtimal not düşülmüştü. **Uçtan uca uygulamadan doğrulandı:**
  aynı @ öncesine sahip yeni e-postayla kayıt önce `Database error saving new
  user` veriyordu, migration sonrası başarılı ve `eren2` olarak kaydoldu.

#### Sonek mekanizmasının ÇEVRESİ — kapandı (2026-08-09)
Migration 012 çakışmayı sunucuda çözüyor ve **doğru çalışıyor**: `eren61502`
adında biri gelirse ve o ad doluysa `eren615022` üretiliyor, kayıt asla
patlamıyor. Soru soruldu, izlendi, mekanizma sağlam çıktı.

**Sorun mekanizmada değil ÇEVRESİNDEYDİ, ve üçü üst üste biniyordu:**
1. **Yeniden adlandırma tamamen sessiz** — ekranda "Başarılı!" yazıyor,
   adının değiştiği hiçbir yerde söylenmiyor.
2. **(e) düzeltildikten sonra KÖTÜLEŞTİ.** Eskiden metadata boştu ve taban
   e-postanın @ öncesiydi (kimsenin seçmediği bir ad). Artık `useAuth`
   kullanıcının YAZDIĞI adı gönderiyor — sistem bilinçli bir tercihi eziyor.
3. **Kaçış yolu yoktu:** `EditProfile` kullanıcı adını kilitli gösteriyordu,
   yani kişi istemediği bir adla **kalıcı olarak** sıkışıyordu.

Ayrıca haksızlık boyutu: o adı İSTEMEYEN kişi kalıcı sahibi oluyor ve
gerçekten isteyeni engelliyor.

**Düzeltme — `src/lib/username.ts` + iki ekran, saf JS:**
- Kayıtta ve düzenlemede **önden müsaitlik kontrolü**, tek ortak metin.
- `EditProfile`'daki **kilit açıldı**; çakışma `23505` ile de yakalanıyor ve
  aynı metni gösteriyor (ön kontrol yarışı çözmüyor, kısıt çözüyor).
- **Kontrol başarısız olursa kayıt BLOKLANMIYOR** (`checked: false`) — bir
  kolaylık kontrolünün patlaması kimsenin hesap açmasını engellememeli.
- **Düzenlemede ad YALNIZCA değiştiyse doğrulanıyor:** mevcut adların bir
  kısmı @ öncesinden türedi ve yeni biçim kurallarını sağlamayabilir; aksi
  halde kullanıcı sadece biyografisini düzeltmek isterken kilitlenirdi.
- **Biçim kuralları minimal** (3–30 karakter, boşluk yok). Karakter kümesi ve
  büyük/küçük harf normalleştirmesi EKLENMEDİ — mevcut adlar nokta/tire/büyük
  harf taşıyabilir, daha sıkısı ayrı bir karar + veri göçü demek.

⚠️ **BAYAT YORUM UYARISI:** `supabase_migration_012_username_conflict.sql`
satır 125-128 hâlâ *"istemci bugün `options.data` GÖNDERMİYOR"* diyor.
**Gönderiyor** (`useAuth.tsx`). Migration dosyası çalıştırılmış bir kayıt
olduğu için içeriği DEĞİŞTİRİLMEDİ; doğrusu burada.

⚠️ **`profiles.username`'in şemada uzunluk sınırı YOK** (`text unique not
null`). `review_text` ile aynı tutarsızlık. İstemcideki 30 karakter bir
savunma, gerçek tavan değil — CHECK kısıtı ayrı bir migration işi.

#### Düzeltme sırası (öneri)
**1 → 3 → 2**, çünkü ilk ikisi küçük ve tek dosyalık, sonuncusu ekran işi:

1. **`signUp`'a username'i metadata olarak geçir + ölü insert'i sil.**
   `options: { data: { username } }` eklenince trigger doğru ismi alır; istemcideki
   `profiles.insert` gereksizleşir (zaten çalışmıyor) ve onay açıkken anon-yazma
   sorunu kökten kalkar. Profil yazmanın tek kaynağı trigger olur. → **(e)**
3. **İki auth ekranında hata metinlerini kurala uydur.** Ham `error.message` yerine
   **hata koduna** göre kısa Türkçe metin — bu, projenin zaten onayladığı ayrım
   ("hata kodu belgeli ve kararlı bir sözleşme", ağ mesajını regex'lemekten farklı):
   `email_not_confirmed` → "E-postanı onaylaman gerekiyor. Gelen kutunu kontrol et."
   · `invalid_credentials` → "E-posta veya şifre hatalı." · diğerleri → "Bir şeyler
   ters gitti, tekrar dene." + tam nesne `console.error`'a. Kayıtta ayrıca
   `data.user.identities?.length === 0` kontrolü → "Bu e-posta zaten kayıtlı, giriş
   yapmayı dene." → **(b)** ve **(c)**
2. **Kayıt sonrası "onay bekleniyor" durumu.** **Ayrı ekran ÖNERİLMİYOR** — yeni
   rota + `AuthStack` değişikliği demek, oysa gösterilecek tek bir bilgi.
   `RegisterScreen` başarılı kayıttan sonra Login'e atmak yerine formun yerine sade
   bir durum göstersin: e-posta ikonu + "**{email}** adresine onay bağlantısı
   gönderdik…" + **"Tekrar gönder"** (`auth.resend`, 60 sn kilitli) + "Giriş
   ekranına dön". Mevcut parçalarla kurulabilir (`EmptyState` deseni + `Icon`),
   yeni tasarım dili gerekmiyor. → **(a)** ve **(d)**

**(f) ayrı bir karardı ve SQL değişikliğiydi** — yukarıdaki üçünün hiçbiri
çözmüyordu. **2026-08-04'te (i) seçilip migration 012 ile KAPANDI**; gerekçe ve
tasarım kararları (f) maddesinde. Sıra (a)–(e)'ye kaldı, hepsi hâlâ açık.

**Doğrulama notu — GÜNCELLENDİ (2026-08-04):** trigger'ın panelde ayakta olduğu
o güne kadar hiç doğrulanmamıştı; migration 012 öncesinde **doğrulandı**
(`tgenabled = 'O'`, gövde `supabase_schema.sql`'deki tanımla aynı, drift yok,
`profiles_username_key` yerinde, profilsiz `auth.users` satırı yok). Trigger
artık migration 012'nin yazdığı gövdeyi çalıştırıyor. Kontrol sorgusu:
```sql
select t.tgname, t.tgenabled, p.proname
from pg_trigger t join pg_proc p on p.oid = t.tgfoid
where t.tgname = 'on_auth_user_created';
```
**(e) hâlâ `supabase_schema.sql`'deki tanıma değil, `useAuth.ts`'e dayanıyor ve
açık:** istemci `options.data` göndermediği için kullanıcının yazdığı ad hâlâ
atılıyor, @ öncesi kullanılıyor. Sonraki APK'ya planlandı.

### Şifre sıfırlama (OTP) — Aşama 0, 2026-08-10, cihazda DOĞRULANDI
Giriş ekranı → **"Şifreni mi unuttun?"** → `ForgotPasswordScreen` (tek ekran,
iki adım: e-posta → kod + yeni şifre) → "şifren güncellendi" → Login.

Öncesinde şifresini unutan kullanıcının **hiçbir çıkış yolu yoktu**; kod
tabanında `resetPasswordForEmail` tek bir yerde bile geçmiyordu.

- **Panel şartı — kod olmadan çalışmaz:** Authentication → Emails →
  **Reset Password** şablonu `{{ .Token }}` kullanmalı. Fabrika şablonu
  **bağlantı** gönderiyor; bağlantı Site URL'e (GitHub Pages iniş sayfası)
  gider ve **deep link olmadığı için hiçbir şey yapmaz**. Bağlantı şablondan
  tamamen çıkarıldı — kod ile bağlantı zaten **aynı OTP'yi** temsil ediyor,
  kaybedilen bir şey yok. Deep link geldiğinde (build paketinin 6. maddesi)
  burası yeniden değerlendirilir.
- **Var olmayan e-posta HATA DÖNDÜRMÜYOR** (Supabase e-posta sayımını
  engelliyor) ve ayırt edici bir işaret de yok — `signUp`'ın `identities`
  ayrımının aksine burada ayrım **yapılamaz**. Ekran bu yüzden "gönderdik"
  değil **"kayıtlıysa gönderdik"** diyor.
- **"Kodu tekrar gönder"** 60 sn kilitli, `RegisterScreen`'in deseninin
  aynısı; Supabase'in kendi hız sınırı bundan bağımsız.
- Adımı `sentToEmail` belirliyor, **ayrı bir `step` bayrağı YOK**
  (`RankingReviewSheet`'in kararı): iki state'i senkron tutmak "kod
  adımındayım ama hangi adrese gönderdiğimi bilmiyorum" durumunu doğururdu.

#### 🔑 AYRI SUPABASE İSTEMCİSİ (`supabaseRecovery`) — sadeleştirilemez
`verifyOtp({ type: 'recovery' })` **oturum AÇAR**. Ana istemcide çağrılsaydı
`onAuthStateChange` tetiklenir, `RootNavigator`'ın `session ? <Main/> :
<Auth/>` anahtarı döner ve kullanıcı **yeni şifresini girmeden uygulamanın
içine düşerdi**.

- **Asıl zarar navigasyon değil SESSİZ YANLIŞ DURUM:** ardından gelen
  `updateUser` patlarsa (ağ, `weak_password`) kullanıcı içeridedir, şifresi
  DEĞİŞMEMİŞTİR ve bunu söyleyen hiçbir şey yoktur. Yanlışı ancak bir sonraki
  girişte, yeni şifresi reddedildiğinde fark ederdi.
- **Reddedilen alternatif:** ana istemcide `verifyOtp` → hemen `updateUser`.
  Mutlu yolda çalışır; hata yolunda "içeri al, sonra `signOut` + Alert ile
  dışarı at" gerekirdi — kullanıcının gözünde uygulamaya girip anında
  atılmak.
- **Üç ayar da zorunlu:** `persistSession: false` (oturum yalnızca bellekte) ·
  **farklı `storageKey`** (supabase-js anahtarı proje URL'inden türetiyor, yani
  iki istemci varsayılanda AYNI anahtarı kullanır; `persistSession` bir gün
  yanlışlıkla açılırsa bu istemci kullanıcının GERÇEK oturumunu ezerdi) ·
  `autoRefreshToken: false`.
- **`signOut` `scope: 'local'` ŞART:** varsayılan `'global'` kullanıcının
  **diğer cihazlardaki oturumlarını da** kapatırdı.
- **Yan fayda — "şifreni tekrar gir" alanı GEREKMEDİ:** akış "giriş yap" ile
  bittiği için yeni şifre anında kanıtlanıyor, yazım hatası orada yakalanıyor.

#### ⚠️ OTP UZUNLUĞU SABİT DEĞİL — "yapılandırmaya gömülü varsayım"ın 4. yüzü
İlk halde `CODE_LENGTH = 6` sabiti vardı (hem `maxLength` hem "tam 6 olmalı"
kontrolü). Supabase'de OTP uzunluğu **panelden ayarlanıyor**
(Authentication → Sign In / Providers → Email → **Email OTP Length**, 6–10) ve
bu projede **8**. Mail 8 haneli kod getiriyor, kutu 6 hanede doluyor,
kullanıcı **geçerli kodunu giremiyordu**.

- **Bu, CLAUDE.md'nin üç kez ısırdığını yazdığı sınıfın DÖRDÜNCÜSÜ**
  (nav bar `insets.bottom` · diary sabit yükseklik · `StarRating` yazı tipi
  ölçeği). Ortak imza aynı: *"formül belirli bir yapılandırma için doğru"*.
- **Yeni olan yanı:** önceki üçünde değişken **cihazdaydı** (navigasyon türü,
  ekran boyutu, yazı tipi ölçeği). Burada değişken **sunucu panelinde** —
  yani hata sınıfı cihaz ayarlarıyla sınırlı değil, **her dış yapılandırma**
  aynı riski taşıyor.
- **Düzeltme yine "6'yı 8 yapmak" DEĞİL**, o sayıya olan bağımlılığı
  kaldırmak: tavan/taban Supabase'in sınırları (`CODE_MIN/MAX_LENGTH`),
  gerçek doğrulama sunucunun işi, **ekrandaki metinler sayı vermiyor**
  ("Doğrulama kodu", "Kod eksik görünüyor"). Panel değeri değişirse uygulama
  değişmeden çalışmaya devam eder.
- Panel değeri **bilinçli olarak 8'de bırakıldı**: kod artık bağımsız olduğu
  için bir güvenlik ayarını kozmetik sebeple zayıflatmanın gerekçesi yok.

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

### Arama ekranı — durum ayrımı (2026-08-04, cihazda DOĞRULANDI)
Arkadaş testi sırasında çıkan bir davranış hatasının teşhisi ve düzeltmesi.
9 testin hepsi geçti.

**Semptom:** `mcdonald` ara → bir sonuca dokun → detay → geri. Arama kutusunda
**seçilen mekanın tam adı** yazılı (`McDonalds Ankara Bilkent`), altında
**"Sonuç bulunamadı"**.

**Kök neden — tamamen yerel state, ağ hiç devrede değil.**
`handleSelect` iki satır yazıyordu: `setQuery(cleanName)` + `setPredictions([])`
("tarayıcı adres çubuğu" deseni). `SearchScreen` `SearchStack`'in **kökü**,
`RestaurantDetail` üstüne push ediliyor → ekran unmount olmuyor → state hayatta
kalıyor. Dönüşte durum: kutu dolu, liste boş, `loading` false.
- **Dönüşte YENİ İSTEK ATILMIYOR**: dosyada tek bir `useEffect`/`useFocusEffect`
  yok, `fetchPredictions`'ın tek çağıranı `handleTextChange`'in debounce timer'ı.
  Yani **"Sonuç bulunamadı" bir arama sonucu değil, hiç yapılmamış bir aramanın
  varsayılan ekranıydı.** Fatura da yok, ağ da yok.
- **Google'ın uzun adlarda boş dönmesi bu bug'ın sebebi DEĞİLDİ** (bir aday
  olarak incelendi ve elendi). `locationbias` de sebep olamaz — adı üstünde
  *bias*, kümeyi daraltmaz sıralar; daraltan `locationrestriction` kullanılmıyor.
  Not: `cleanPlaceName` kesme işaretini siliyor (`McDonald's` → `McDonalds`).

**Asıl yapısal kusur: "Sonuç bulunamadı" bir CATCH-ALL'dı.** Tek koşulu
`!loading && query.length > 1` idi ve bu, çok farklı üç durumu aynı dala
topluyordu: (a) yazıldı ama debounce dolmadı, (b) başka ekrandan dönüldü,
(c) arandı ve gerçekten sonuç yok. Yalnızca (c) doğru. (a) yüzünden **her
aramada 400ms'lik bir yanıp sönme** vardı — bug'ın ikinci, fark edilmemiş yüzü.

**Düzeltme:**
- `handleSelect` artık **query'ye de predictions'a da dokunmuyor** — sadece
  `Keyboard.dismiss()` + `navigate`. Geri dönünce kullanıcı bıraktığı yerde:
  yazdığı metin ve sonuç listesi duruyor, başka bir sonuca dokunabiliyor,
  **ek istek yok**. Reddedilen alternatif: kutuyu temizlemek — bug'ı çözerdi
  ama listeyi de silip kullanıcıya aramayı baştan yazdırırdı (üstelik faturalı).
  Kural, projenin `backBehavior="history"` ve `reopenSummaryRef` kararlarıyla
  aynı: **geri her zaman bir önceki duruma döner.**
- **Yeni state `searchedFor`**: son TAMAMLANAN aramanın metni. "Sonuç bulunamadı"
  ancak `searchedFor === query.trim()` iken gösteriliyor. `renderBody` daralan
  5 dala ayrıldı; bekleme durumu artık `null` yerine **iskelet** döndürüyor,
  yanıp sönme bu yüzden bitiyor.
- `MIN_QUERY_LENGTH = 2` sabiti — eşik iki yerde iki farklı yazımla duruyordu
  (`text.length < 2` ve `query.length > 1`).

**Kapsam dışıyken eklenen iki parça (ikisi de gerekliydi):**
- **`handleClear` bekleyen debounce'u iptal etmiyordu** — yazıp 400ms dolmadan
  çarpıya basınca istek yine ateşlenip listeyi geri dolduruyordu. Ayrı bir bug.
- **Yanıt sırası koruması (`requestSeqRef`)**: `searchedFor` ancak yanıtlar
  sırasız gelemiyorsa güvenilir. Guard olmadan geç gelen boş bir yanıt
  `searchedFor`'u güncel olmayan bir metne çeker ve ekranı **iskelette asılı**
  bırakırdı — yani düzeltme yeni bir hata sınıfı doğururdu. `MapScreen`'in
  `lastPoiTapRef`'iyle aynı desen.

**Bilinçli olarak DOKUNULMADI:** `json.status`'ün ARAYÜZE yansıtılması ve
`places.ts`'teki hazır `autocomplete()`'e geçiş. Açık iş listesinde duruyor.
(2026-08-06'da `json.status` **konsola** loglanmaya başlandı — davranış
değişikliği değil, yalnızca körlüğü kaldırıyor; gerekçe aşağıda.)

### Arama sonuçları YERELLİĞİNİ kaybediyordu (2026-08-06)
versionCode 4 APK'sında `mcdonald` araması **başka ülkelerden** sonuç
döndürmeye başladı; harita ise doğru konumu gösteriyordu.

**Kök neden — konum bias'ının TAMAMEN düşmesi.** `SearchScreen`:
```ts
const biasPart = location ? `&locationbias=...` : '';   // null → bias YOK
```
`useLocation` konum bilinmediğinde `location`'ı **null** bırakıyor. Null iki
ayrı durumda oluşuyor ve ikincisi gözden kaçmıştı:
1. **İzin yok / konum alınamadı** → kalıcı null
2. **İzin VAR ama konum HENÜZ ÇÖZÜLMEDİ** → geçici null. `resolve()` asenkron
   ve konum geldiğinde arama **tekrarlanmıyor**; o pencerede yapılan her arama
   bias'sız gidiyor. Vakada izin açıktı, yani canlı olan buydu.

**Asıl yapısal kusur bir TUTARSIZLIKTI:** `MapScreen`'in eksik konum için
fallback'i **vardı** (Ankara), `SearchScreen`'in **yoktu**. Aynı eksik konum
bir ekranda görünmezken diğerinde global sonuç olarak patlıyordu. Ankara
koordinatları da yalnızca `MapScreen`'de duruyordu.

**API anahtarı bölmesi SEBEP DEĞİLDİ — elendi.** `locationbias` bir URL sorgu
parametresi, hangi anahtarın kullanıldığıyla ilgisi yok. Belirleyici kanıt:
**sonuçlar geliyordu.** Anahtar yanlış olsaydı `REQUEST_DENIED` alınır ve
(`json.status` kontrol edilmediği için) ekranda "Sonuç bulunamadı" görünürdü.

**Düzeltme:**
- `DEFAULT_COORDS` → `src/constants/location.ts`, iki ekranın tek kaynağı.
- `useLocation` artık **`effectiveLocation`** de döndürüyor (`location ?? DEFAULT_COORDS`).
  `location` AYRI kalıyor çünkü "gerçekten biliyor muyuz" bilgisi hâlâ gerekli —
  `MapScreen` ona bakıp "konumun alınamadı" satırını gösteriyor.
- `SearchScreen` `effectiveLocation` kullanıyor → **bias her istekte var**,
  iki senaryo da kapanıyor. Ölçülen değeri bilmeye ihtiyaç duymayan düzeltme
  (nav bar ve diary derslerinin aynısı).
- **`json.status` konsola loglanıyor.** Bu ekran sessizce bozulabilen tek
  Google yoluydu; SHA-1 Android kısıtlaması denendiğinde ilk bakılacak yer
  burası. Arayüze yansıtma hâlâ ayrı bir iş.
- **Bias sıralar, DARALTMAZ:** yanlış varsayılan bile global sonuçtan iyi;
  kullanıcı başka şehirdeyse açık arama ("kadıköy kahve") yine doğru çalışır.

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
- `app.json` → dinamik config geçişi yapıldı (o gün `app.config.ts`, 2026-08-02'de
  `app.config.js`'e çevrildi — bkz. Dağıtım / EAS Build §1): statik JSON'da `${EXPO_PUBLIC_...}`
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

### Puanlama ile günlük arasındaki İŞ BÖLÜMÜ (ürün kararı, 2026-08-07)
İki kavramın neden ayrı olduğu ve **ayrı kalması gerektiği**. Bu karar Diff D
sırasında netleşti ve birkaç yerdeki gerilimi aynı anda çözüyor.

| | **Mekan sayfası** | **Günlük / "Ziyaret Ekle"** |
|---|---|---|
| Asıl işi | **Puanlama** — kanonik ev | **Deneyim/anı kaydı** — ne zaman gittim, ne düşündüm |
| Puan | Birincil eylem | **Opsiyonel yan bilgi** |
| Metin alanı | `user_rankings.review_text` | `diary_entries.note` |
| Akışta görünür mü | **Hayır** | **Evet** |

- **Kullanıcı bir mekana puan vermek istiyorsa asıl yol mekan sayfası.**
  Günlük puanlamayı birincil amaç edinmiyor; orada da puan verilebiliyor ama
  ekranın işi bu değil.
- **"SESSİZ PUANLAMA" BİR EKSİKLİK DEĞİL.** Mekan sayfasından puan verip
  ziyaret kaydetmeyen biri aktivite akışında görünmüyor — ve bu **doğru**,
  çünkü **akışın konusu puanlama değil, deneyim.** Diff D'de bu bilinçli
  olarak kabul edildi; iki kaynağı birleştirmek ayrıca çift kayıt üretirdi
  (puanlı ziyaret hem giriş hem sıralama yazıyor).
- **"İKİ YORUM ALANI" GERİLİMİNİ KISMEN ÇÖZÜYOR.** Açık işler listesinde
  `review_text` ↔ `note` ikiliği bir belirsizlik olarak duruyordu. Bu iş
  bölümüyle ikisi **kasıtlı olarak farklı amaçlara** hizmet ediyor:
  `review_text` = "bu mekan hakkında genel görüşüm" (kalıcı, mekana ait),
  `note` = "bu ziyarette olanlar" (ana, o güne ait). **Birleştirilmeleri
  gerekmiyor.** Kalan tek soru arayüzün bu ayrımı yeterince anlatıp
  anlatmadığı — bugün somut bir hata üretmiyor.

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
- **Kaydet butonu SABİT FOOTER, ScrollView'ın İÇİNDE DEĞİL** (2026-08-05'te
  düzeltildi, arkadaş testinden gelen ikinci geri bildirim, 9 senaryo cihazda
  doğrulandı — büyük sistem yazı tipi ölçeğiyle tekrar dahil).
  - **Bug:** buton formun son elemanı olarak ScrollView'ın içindeydi. Form
    içeriğinin doğal yüksekliği neredeyse sabit (tarih + puan + ipucu + 88px
    not alanı + buton), sheet ise `maxHeight: '85%'` ile sınırlı. Ekran KISAYSA
    ya da sistem YAZI TİPİ ÖLÇEĞİ BÜYÜKSE o %85 yetmiyor ve kırpılan ilk şey en
    alttaki buton oluyordu → kullanıcı kaydetmek için aşağı kaydırmak zorunda.
  - **`flexShrink: 1` ScrollView'da ŞART.** RN'de varsayılan `flexShrink` **0**
    (web'in tersine): onsuz ScrollView içeriği kadar yer kaplar ve `maxHeight`
    sınırında kırpılan şey yine footer olurdu — aynı bug, başka kılıkta.
  - **`KeyboardAvoidingView`'a `style={{flex:1, justifyContent:'flex-end'}}`.**
    Öncesinde KAV'ın hiç `style`'ı yoktu, yani içeriğine göre boyutlanıyordu ve
    sheet'in `maxHeight: '85%'`'i **belirsiz bir ebeveyn yüksekliğinden**
    hesaplanıyordu. `behavior="height"` ile çakışmıyor: RN o override'ı
    (`{height, flex:0}`) YALNIZCA klavye açıkken uyguluyor
    (`KeyboardAvoidingView.js:237-248`, `state.bottom > 0` koşulu).
  - **`pointerEvents="box-none"` KAV'da ZORUNLU.** KAV artık tüm ekranı
    kapladığı için onsuz arkadaki karartma `Pressable`'ını yutar ve **dışarı
    dokunup kapatma sessizce kaybolurdu**. Düzeltmenin doğurabileceği tek
    regresyon buydu; test listesinde ayrıca işaretlendi.
  - **Android'de `behavior` `undefined` → `'height'`.** Eski gerekçe *"Android'de
    klavye pencereyi zaten yeniden boyutluyor (adjustResize)"* idi — edge-to-edge
    altında güvenilemeyecek bir varsayım (bkz. aşağıdaki ders). Bu dosya projedeki
    TEK aykırı yerdi: `LoginScreen:45`, `RegisterScreen:56`, `ListFormScreen:166`
    üçü de `'height'` kullanıyor ve üçü de cihazda çalışıyor. **`'padding'`
    DEĞİL** — pencere gerçekten yeniden boyutlanıyorsa sheet'i iki kez iterdi;
    eski yorumun haklı olduğu tek nokta buydu.
  - **Safe area burada BAŞTAN DOĞRUYDU:** sheet zaten `insets.bottom + Spacing.sm`
    yazıyordu, yani toplama formu. Nav bar'daki `Math.max()` hatasının bu dosyada
    karşılığı yoktu; formül olduğu gibi footer'a taşındı.
  - Yan kazanç: buton ScrollView'ın dışında olduğu için klavye açıkken ilk
    dokunuş klavyeyi kapatmakla harcanmıyor, doğrudan kaydediyor.
- **Düzenlemede `ensurePlaceCached` gerekmiyor**: satır zaten var, FK o gün
  tutmuş. Eklemede gerekli (`diary_entries.place_id` → `places`).
- Giriş noktası **mekan detayı**: ayrı bir "log ekle" ekranı yapılmadı, çünkü
  giriş her zaman bir mekana bağlı ve ayrı ekran mekan seçtirmek için
  `SearchScreen`'in kopyasını gerektirirdi. Alt kısımda artık üç buton:
  **Puanı Kaydet** (birincil) / **Ziyaret Ekle** / **Listeye Ekle**.
- Profil → "Günlük" sekmesinde uzun basış menüsü: **İptal / Düzenle / Sil**
  (silme yine iki adımlı, `ListCard` ile aynı desen).
- **Bağımlılık: `@react-native-community/datetimepicker`** (SDK 54 uyumlu 8.4.4).
  `npx expo install` dinamik config'e yazamıyor — plugin kaydı `app.json`'a
  **elle** eklendi, dinamik config (`app.config.js`) onu taban alıyor.

### `RankingReviewSheet` — yorumun okuma görünümü (2026-08-08, DOĞRULANDI)
Bir sıralama kaydının puanı + **tam yorum metni**. Bilinen Açık İşler'deki
**BOŞLUK 1**'i kapatıyor.

- **Neydi:** sıralama satırına dokununca mekan sayfası açılıyordu ve o ekran
  **her zaman oturum sahibinin** kaydını yüklüyor. Yani başkasının profilinde
  kullanıcı "onun yorumunu okuyorum" sanırken **kendi yorumunu** görüyordu; o
  kişinin yorumunun tam metnine ulaşan **hiçbir yol yoktu** (tek görüntüsü
  satırdaki `numberOfLines={1}` kırpması).
- **Günlük tarafında bir kez düzeltilen hatanın ikizi**, gerekçe birebir aynı:
  *"kullanıcı o kişinin ne düşündüğünü görmek istiyordu"*. Orası
  `DiaryEntryDetail` ile düzeltilmişti, sıralama tarafı atlanmıştı.
- **ROTA DEĞİL BİLEŞEN.** Sıralama satırları iki ekranda (`ProfileScreen`,
  `UserProfileScreen`) ve onlar iki ayrı stack'te; ekran yapmak iki param
  listesi + iki stack kaydı demekti. `AddToListSheet`'in aynı gerekçesi —
  üstelik "Senin Ziyaretlerin"de tam bu tuzak (eksik rota → çalışma anında
  çökme) yeni kapatılmıştı, ikincisini açmanın anlamı yoktu.
- **Ayrı `visible` bayrağı YOK**, tek kaynak `ranking: UserRanking | null`.
  İki state'i senkron tutmak "açık ama verisi yok" ara durumunu mümkün kılardı.
- **İKİ PROFİLDE DE AYNI DAVRANIŞ.** İhtiyaç başkasının profilindeydi ama
  görsel olarak ÖZDEŞ satırların iki ekranda farklı davranması, bu projede dört
  kez pahalıya patlamış isim/davranış uyumsuzluğunun kardeşi olurdu.
- **SALT OKUNUR.** Yorumun evi mekan sayfasındaki form; ikinci bir giriş noktası
  açmak aynı işi iki yerde tutmak olurdu (`DiaryEntryDetail`'in kararı).
  Mekan sayfası sheet'in içindeki satırdan bir dokunuş uzakta — ve oraya
  giderken **sheet önce kapanıyor**, çünkü açık bir RN `Modal` hedef ekranın
  önünde kalır (`MapSummarySheet`'in aynı kararı).
- **Yeni sorgu YOK:** `UserRanking` satırı `review_text` dahil zaten listede
  geliyor, sheet parametreyle besleniyor (anlık görüntü kuralı).
- **⚠️ `review_text`'in HİÇBİR YERDE uzunluk sınırı yok** — ne şemada
  (`review_text text`) ne istemcide (`maxLength` yok). Projedeki diğer serbest
  metinlerin hepsinin var (`note` 1000, `bio` 300, liste açıklaması 500). Bu bir
  **tutarsızlık ve ayrı bir iş**; pratik sonucu, "zaten kısa" varsayımının
  geçersiz olması ve metnin **kaydırılabilir** olmak zorunda kalması.
  `ScrollView`'da `flexShrink: 1` bu yüzden şart — onsuz uzun bir yorumda
  kırpılan ilk şey alttaki eylem satırı olurdu (`DiaryEntrySheet`'in dersi).
- **KAPSAM DIŞI, bilinçli:** `MapSummarySheet`'teki sıralama satırları eski
  davranışta kaldı, hâlâ doğrudan mekan sayfasına gidiyorlar. Orada `RankRow`
  `reviewText` **almıyor** (okunacak yorum zaten görünmüyor) ve haritadan
  bakarken istenen şey mekanın kendisi. Üçüncü bir yerde farklı davranış olduğu
  doğru; rahatsız ederse ayrı bir diff.

### "Senin Ziyaretlerin" — mekan sayfası (2026-08-08, cihazda DOĞRULANDI)
`user_rankings` ile `diary_entries` arayüzde **ilk kez buluşuyor**: ikisi
veritabanında `place_id` ile bağlıydı ama "bu mekana kaç kez gittin" bilgisi
hiçbir ekranda yoktu (Bilinen Açık İşler'deki **BOŞLUK 2**).

- **Yeri: üç butonun ALTINDA**, ekranın son bölümü. Butonlar tutarlı bir eylem
  bloğu, arasına bölüm sokmak onu bölerdi; ayrıca "Ziyaret Ekle"nin hemen
  altında olması kaydedilen ziyaretin listeye düştüğünü **aynı karede**
  gösteriyor (`handleDiarySaved` bölümü de tazeliyor).
- **`usePlaceVisits(userId, placeId)` AYRI hook, `useDiary` DEĞİL:** o hook
  günlüğün tamamını çekiyor, 1-3 satır için bütün günlüğü indirip istemcide
  süzmek olurdu. `addPlaceToList`'in `useListItems` yanında ayrı durmasıyla
  aynı gerekçe.
- **`places(*)` gömülmüyor** (mekan zaten ekranın konusu), ama
  **`profiles!diary_entries_user_id_fkey(username)` gömülüyor**:
  `DiaryEntryDetail` rotası `authorUsername` istiyor ve ekranın elinde yalnızca
  `useAuth` var. FK adı ŞART — gerekçe aşağıdaki PGRST201 bölümünde.
- **`DiaryRow`'un İLK GENİŞLEMESİ: `name` opsiyonel.** Verilmezse **mekan
  kimliği bloğunun tamamı** (küçük görsel + ad) render edilmiyor; ikisi birlikte
  gidiyor çünkü tek bir kavramın parçaları. Burada mekan zaten sayfanın konusu,
  her satırda aynı adı ve aynı jenerik ikonu tekrarlamak gürültü olurdu.
  `RankRow`'un üç genişlemesindeki desenin aynısı.
- **SALT OKUNUR — uzun basış yok.** Satır `DiaryEntryDetail`'e götürüyor;
  düzenleme/silme profil sekmesindeki menüde kalıyor. Bu ekran mekanın evi,
  günlüğün değil.
- **Boşsa HİÇ render edilmiyor**, `EmptyState` kullanılmadı (72px rozet ekranın
  dibinde orantısız). Yükleme durumunda da bir şey çizilmiyor — iskelet burada
  yalnızca layout zıplaması üretirdi.
- **Sayı sınırı ve "Tümünü gör" YOK:** bu ölçekte mekan başına 1-3 ziyaret
  bekleniyor, sınır koymak filtreli bir "tümü" ekranı gerektirirdi.
- **`(user_id, place_id)` indeksi HÂLÂ YOK ve gerekmedi.** Migration 009 onu
  "bu ekran v1'de yapılmıyor" diyerek atlamıştı; ekran geldi ama mevcut
  `idx_diary_entries_user_visited`'ın **ilk kolonu `user_id`**, sorgu onu
  kullanıp kalan birkaç satırda `place_id`'yi süzüyor. Eşik: kullanıcı başına
  giriş sayısının büyümesi.

#### ⚠️ ROTA TUZAĞI — `RestaurantDetail` DÖRT stack'te, hedefi de öyle olmalı
Bölüm `DiaryEntryDetail`'e gidiyor ama o rota yalnızca `HomeStack` ve
`ProfileStack`'te kayıtlıydı. **Ara ve Harita sekmelerinden gelen kullanıcıda
dokunma çalışma anında patlardı** — bu dosyanın birden çok yerde uyardığı tuzak
("tipte var olmayan bir rota `navigate()` çağrısını DERLETİR").

- Rota `SearchStack` + `MapStack`'e (hem `.tsx` hem param tipi) eklendi.
- **`RestaurantDetailStackParamList`'e de eklendi** ve ekranın navigasyon tipi
  `NativeStackNavigationProp<any>` yerine **o listeye bağlandı**. Böylece bir
  stack'te kayıt eksik kalırsa hata çalışma anında değil **derleme anında**
  çıkıyor. `any` bırakmak, bu diff'in varlık sebebi olan tuzağı açık tutmak
  olurdu.
- **Kural:** `RestaurantDetail`'e yeni bir `navigate` hedefi eklenirse o hedef
  **dört stack'in dördünde birden** kayıtlı olmalı.

### Sıralama güncellemesi artık KULLANICI ONAYLI (migration 017, 2026-08-08)
"Ziyaret Ekle"/"Ziyareti düzenle" formunda puan seçilince beliren anahtar:
**"Sıralamamı da güncelle"** (varsayılan AÇIK), altında *"Kapatırsan bu puan
yalnızca günlüğünde kalır."*

- **Neden doğdu:** kullanıcı fark etti ki mekan sayfasından puanı değiştirmek
  günlükteki puanı değiştirmiyor. Bu **kasıtlı** (aşağıda), ama tersi yön
  (günlük → sıralama) **sessizce** çalışıyordu ve kullanıcının sözü yoktu.
- **`MoveToListSheet`'in "Kaynak listeden de kaldır" anahtarıyla AYNI DESEN**:
  aynı token'lar, aynı varsayılan kuralı (migration 008) — *parametreyi
  göndermeyen çağrı bugünkü davranışı korur*.
- **Düzenleme modunda da var** ve orada CLAUDE.md'nin "kabul edilen tuzak" diye
  yazdığı davranışı kullanıcının kontrolüne veriyor: eski bir girişin puanını
  değiştirmek kanonik puanı EZİYORDU ve durdurmanın yolu yoktu.
- **Puan seçilmemişken anahtar RENDER EDİLMİYOR.** İki sebep: puansız log zaten
  sıralamaya girmiyor (olmayan bir kararı sormak olurdu) ve bu sheet'in
  yerleşimi yazı tipi ölçeğine duyarlı — satırı koşullu tutmak en sık kullanılan
  "puansız hızlı log" akışının yüksekliğini hiç değiştirmiyor.
- **Anahtar HER AÇILIŞTA varsayılana dönüyor**: kapatmak tek seferlik bir karar,
  kalıcı bir tercih değil.
- **İpucu metni anahtara bağlı**: kapalıyken "— sıralamana işlenecek" demek
  düpedüz yalan olurdu (isim/davranış uyumsuzluğu bu projede dört kez pahalıya
  patladı).
- **DOĞAN YENİ DURUM:** puanı olan ama sıralamada yeri olmayan bir ziyaret artık
  mümkün. İlk kez gidilen bir mekana anahtar kapalı puan verilirse o mekanın
  `user_rankings` satırı **hiç oluşmuyor**, yani "Sıralamam"da görünmüyor.
  Doğru davranış (kullanıcı açıkça istedi) ama sürpriz olabilir.
- **TERS YÖN (sıralama → günlük) YOK ve OLMAYACAK.** Mekan sayfasından puan
  değiştirmek geçmiş ziyaretlere dokunmuyor: `diary_entries.rating` = "o
  ziyarette ne verdim" (geçmiş bir olay), `user_rankings.rating` = "şu anki
  kanonik görüşüm" (bir durum). Bugünkü görüşü değiştirmek geçmişi yeniden
  yazmamalı; Letterboxd da böyle çalışıyor. Otomatik ters yayılım ayrıca "hangi
  ziyaret güncellenecek" sorusunu doğururdu — migration 011'in zaten reddettiği
  cevapsız soru. **Buradaki çözüm otomatik DEĞİL:** karar kayıt anında, TEK bir
  giriş için, kullanıcıdan açıkça alınıyor. Ayrım bu.
- **Dağıtım sırası:** migration ÖNCE, OTA SONRA. `default true` sayesinde
  migration çalıştıktan sonra sahadaki APK (parametreyi göndermiyor) bozulmuyor;
  ters sıra kırardı.

### Aktivite akışı (`useActivityFeed`) — Faz 3 / Diff D (2026-08-08, sahada)
Ana Sayfa'nın ana içeriği: takip edilenlerin ziyaretleri, en yeni üstte.

- **Öğeler `diary_entries`'ten, `user_rankings`'ten DEĞİL.** Sıralama bir
  DURUM ("bu mekan hakkında ne düşünüyorum"), akış ise OLAY listesi. Bir
  sıralama satırının tarihi ve notu yok, anlatacak hikâyesi de yok.
- **`created_at`'e göre sıralı, `visited_at`'e göre DEĞİL**: akış "ne zaman
  paylaşıldı" sorusunu cevaplıyor. Üç ay önceki bir ziyareti bugün kaydeden
  kişi en üstte çıkmalı. Letterboxd de böyle.
- **Sessiz puanlama akışa DÜŞMÜYOR** — eksiklik değil, ürün kararı; gerekçe
  "Puanlama ile günlük arasındaki İŞ BÖLÜMÜ" bölümünde.
- **RPC YOK.** Migration 015 günlüğü herkese açtığı için akış düz `select`
  atıyor. Dosyada bir dönem duran *"`diary_entries` tabanlı sosyal sorgular
  `security definer` RPC gerektirir"* notu bu yüzden geçersiz.
- **Beğeni SAYACI var, BUTON yok:** buton "ben beğendim mi" bilgisini
  gerektirir, yani satır başına bir sorgu daha (20 öğe = 20 istek). Sayaç
  gömülü sayımla (`entry_likes(count)`) geliyor, N+1 yok. Dokununca ziyaret
  detayına gidiliyor, buton orada.
- **Kabuk `ScrollView` → `FlatList`**: dikey bir `FlatList`'i `ScrollView`
  içine koymak iç içe sanallaştırma uyarısı üretirdi. "Trend Mekanlar" ve
  "En Çok Puanlayanlar" header/footer'a taşındı, davranışları değişmedi.
- **`ActivityRow` AYRI bileşen, `DiaryRow` genişletilmedi**: `DiaryRow`'un
  kimlik sütunu TARİH, akışta kimlik YAZAR. Eksen değişiyor — `DiaryRow`'un
  `RankRow`'dan ayrılma gerekçesinin aynısı.
- Üç ayrı boş durum: kimseyi takip etmiyorsun / takip ediyorsun ama paylaşım
  yok / sorgu patladı. Tek mesajla karşılamak üçünü birden yanlış anlatırdı.

#### ⚠️ PGRST201 — ARA TABLO EKLEMEK MEVCUT SORGULARI BOZAR (kalıcı ders)
Diff D ilk cihaz testinde hiç yüklenmedi. Kök neden teşhis edildi ve
**doğrulandı**; bu bir hata sınıfı, tekrar edecek.

**Neydi:** `diary_entries` ile `profiles` arasında PostgREST'in seçebileceği
**iki yol** vardı ve sorgu hangisini istediğini söylemiyordu → reddedildi.
1. Doğrudan FK → `diary_entries_user_id_fkey` (many-to-one, istediğimiz)
2. `entry_likes` üzerinden dolaylı (many-to-many)

**İkinci yol migration 016 ile DOĞDU ve kimse fark etmedi.** `entry_likes`'ın
birincil anahtarı `(entry_id, user_id)` ve ikisi de FK — yani PostgREST'in
**ara tablo (junction)** tanımına birebir uyuyor, ilişkiyi kendiliğinden ilan
ediyor. 016'dan önce tek yol vardı; akış sorgusu o tarihte henüz yazılmamıştı,
ilk çalıştırıldığı anda patladı.

**GENELLEŞTİRME — yeni tablo eklerken sorulacak soru:** *bu tablo mevcut iki
tablo arasında ara tablo mu?* (İki FK + bunlardan oluşan PK.) Öyleyse o iki
tablo arasındaki **her gömülü sorgu belirsizleşir** — yenisi de, çalışan
eskisi de. `follows` da aynı şekilde bir ara tablo; `useFollow` FK adıyla
ayrıştırmayı zaten bu yüzden yapıyor.

#### 🔁 AYNI HATA İKİNCİ KEZ OLDU (migration 018, 2026-08-09) — ve ders BU
Yukarıdaki kural yazıldıktan **sonra** `photo_reports` eklendi ve
`usePlacePhotos`'un `select('*, profiles(*)')` sorgusunu patlattı. Fotoğraflar
**sahada tamamen çalışmaz oldu** (migration panelde çalıştığı an, istemci
diff'inden bağımsız olarak).

**Kuralın yazılı olması yetmedi, çünkü YANLIŞ ZAMANDA duruyordu.** Kural
"yeni sorgu yazarken" hatırlanacak bir yerdeydi; oysa tehlike **migration
yazarken** doğuyor ve kırdığı şey **zaten çalışan eski sorgular**.

**SÜREÇ KURALI — ara tablo ekleyen her migration için ZORUNLU:**
> Migration bir ara tablo (iki FK + bunlardan oluşan PK) ekliyorsa, dosyaya
> **hangi mevcut sorguları belirsizleştirdiği tek tek yazılmalı.** Kontrol
> tek komut:
> ```
> # ⚠️ -A6 ŞART: .from(...) ile .select(...) AYRI SATIRLARDA.
> # Bağlamsız tek satırlık grep hiçbir şey bulmaz ve SAHTE BİR "TEMİZ"
> # raporu verir — 2026-08-11'de tam olarak bu oldu.
> grep -rn -A6 "from('<TABLO_A>')" src/ | grep "<TABLO_B>("
> ```
> Ara tabloyu eklemekle o sorguları ayrıştırmak **AYNI DİFF'TE** gitmeli;
> migration önce çalıştığı için arada kırık bir pencere kalıyor.

**Bugüne kadar ara tablo olan üç tablo:** `follows` (profiles↔profiles),
`entry_likes` (diary_entries↔profiles), `photo_reports`
(place_photos↔profiles). Dördüncüsü eklenirse bu listeye yazılmalı.

⚠️ **İKİNCİL ETKİ — yükleme "başarısız" görünürken BAŞARILI olabiliyor.**
Yükleme yolu (Storage + `insert`) bu sorguyu kullanmıyor; kırılan şey
yüklemeden sonraki **listeyi tazeleme**. Kullanıcı hata görüp tekrar
deniyor ve **mükerrer kayıt** oluşuyor. Bu sınıf bir kırılmadan sonra
`place_photos`'ta çift satır kontrolü yapılmalı.

**Düzeltme** tek satır — gömülü kaynağı FK adıyla ayrıştır:
```ts
profiles(id, username, avatar_url)
→ profiles!diary_entries_user_id_fkey(id, username, avatar_url)
```
`places(*)` ve `entry_likes(count)` ayrıştırma İSTEMİYOR: o ikisine giden tek
yol var. Kırılan tek gömülü kaynak `profiles`'tı. Ayrıştırınca PostgREST
tekil nesne döndürüyor — mevcut "nesne ya da dizi" normalizasyonu doğruydu,
değişmedi. Migration gerekmedi, saf JS, OTA ile gitti.

**⚠️ Sorgudaki FK adı SADELEŞTİRİLMEMELİ.** Gerekçesi kodun kendi yorumunda
da yazılı (`useActivityFeed.ts`), çünkü uzun görünüp kısaltılması hatayı
aynen geri getirir.

#### 📐 YÖNTEM DERSİ — LogBox uzun hatayı KIRPIYOR, alan alan logla
Hatanın tam metni ilk turda **görülemedi**: tek bir `console.error(error)`
çağrısı Expo Go'nun kırmızı ekranında kesiliyor ve kesilen kısım tam olarak
teşhis için gereken kısımdı.

- **Çözüm:** hatayı tek parça yerine **alan alan, her biri ayrı satırda**
  bas (`code` · `message` · `hint` · `details` dizisiyse her aday ayrı satır).
  LogBox ayrı satırları kırpmıyor. `npx expo start` terminali ise hiç
  kırpmıyor — **kırmızı ekrana değil terminale bakılmalı.**
- **`hint` alanı altın değerinde:** PostgREST belirsiz gömülü kaynak
  hatalarında çözümü kelimesi kelimesine oraya yazıyor. Bu vakada birebir
  şunu verdi ve hipotezi tek turda kesinleştirdi:
  > `Try changing 'profiles' to one of the following:`
  > `'profiles!diary_entries_user_id_fkey', 'profiles!entry_likes'`
- Teşhis yardımcısı **geçiciydi ve düzeltmeyle birlikte geri çekildi**; dosya
  tek `console.error` satırına döndü. Tekrar gerekirse deseni bu bölümden kur.

### Takipçi çıkarma (migration 019, 2026-08-11, sahada DOĞRULANDI)
Takipçi listesinde uzun basış → onay → o kişi artık seni takip etmiyor.
"Takip Edilenler" sekmesinde aynı jest **takibi bırakıyor**.

- **Neydi:** `follows` üzerindeki tek DELETE politikası
  `using (auth.uid() = follower_id)` idi, yani kullanıcı yalnızca **kendi
  takibini** silebiliyordu. Takipçi çıkarmak `following_id = auth.uid()` olan
  satırı silmek demek ve o satırda `follower_id` başkasının id'si → politika
  reddediyordu. Yani eksik arayüzde değil **veritabanındaydı**.
- **Migration 019 politikayı DEĞİŞTİRMİYOR, İKİNCİSİNİ EKLİYOR.** Postgres
  permissive politikaları OR'ladığı için sonuç aynı; ama değiştirmek
  `drop policy` demekti — çalışan bir korumayı bir an ortadan kaldırmak ve
  migration yarıda kalırsa `follows`'u delete'e tamamen kapatmak. Ekleme
  **saf toplamalı**. Yan fayda: iki farklı niyet ("takibi bırakmak" ≠
  "takipçiyi çıkarmak") ayrı isimlerle kayıtlı kalıyor.
- **🔑 RLS REDDİ HATA DEĞİL, SESSİZ 0 SATIR.** Supabase bir DELETE'i politika
  reddettiğinde **hata döndürmüyor** — yalnızca hiçbir satır etkilenmiyor.
  Sadece `error`'a bakan bir istemci, migration çalıştırılmamışsa her çıkarmayı
  **"başarılı"** gösterir ve kullanıcı çıkarmadığı birini çıkardım sanardı.
  `removeUser` bu yüzden `.select()` ile **silinen satırları geri istiyor** ve
  sayıya bakıyor.
  - **0 satır iki anlama gelebilir** (politika reddetti / satır zaten yoktu) ve
    ikisi istemciden **ayırt edilemez**. Çözüm iddiada bulunmamak: başarı
    denmiyor, ama `fetchList()` ile liste yeniden okunuyor — satır gerçekten
    gittiyse düşüyor, politika reddettiyse yerinde kalıyor. **Ekran her iki
    durumda da gerçeği gösteriyor.**
  - Bu, `useListItems`'ın Postgres hata kodlarını ayrıştırmasıyla aynı aile ama
    farklı mekanizma: orada hata **var**, burada hatanın kendisi **yok**.
- **Uzun basış → TEK ADIMLI onay**, `ListCard`'ın 3 seçenekli menüsü değil:
  burada tek eylem var, tek maddelik menü gürültü olurdu. Onay yine de duruyor
  (eylem yıkıcı), yani "silme iki adımlı" kuralı korunuyor — sadece ilk adım
  menü değil doğrudan onay.
- **Yalnızca `isSelf`.** Başkasının listesinde uzun basış hiçbir şey yapmıyor;
  RLS zaten reddederdi ve "tıklanabilir görünüp reddedilmek, hiç tepki
  vermemekten kötü".
- **İki sekmede de var.** "Takip Edilenler"de takibi bırakmak **bedava**: o
  kişiyi takip ettiğin zaten listede olmasından belli. CLAUDE.md'nin *"satırda
  takip butonu yok — N ek sorgu"* gerekçesi burada geçerli değil.
- ⚠️ **ÇIKARMAK ENGELLEMEK DEĞİL ve arayüz bunu SÖYLÜYOR** ("Dilerse tekrar
  takip edebilir"). INSERT politikası değişmedi, değişmemeli de — o kontrol
  herkesin kendi takibini kurmasının tek güvencesi. Instagram da böyle.

### `PhotoViewer` — tam ekran fotoğraf, üç katman (2026-08-13, sahada DOĞRULANDI)
Fotoğrafa dokunma akışının **yeniden tasarımı**. Bileşen:
`src/components/photos/PhotoViewer.tsx`, iki yüzeyden çağrılıyor
(`PhotoGrid` → mekan sayfası, `DiaryEntryDetailScreen` → yatay fotoğraf şeridi).

**Üç katman:** dokunuş → fotoğraf tam ekran · fotoğrafa dokunuş → üst/alt yarı
saydam şeritler (yazar, ziyaret tarihi, puan, not/yorum) · tekrar dokunuş →
şeritler söner. Şeritler **açılışta 2 sn görünüp sönüyor** — varsayılan gizli
olsalardı kullanıcı bilginin VARLIĞINI hiç öğrenemezdi.

#### ⚠️ BU BİR TASARIM KARARININ TERSİNE ÇEVRİLMESİ
Aynı gün önce **"dokunma çözümlemesi"** yazıldı: `entry_id` doluysa doğrudan
`DiaryEntryDetail`'e, puan varsa doğrudan `RankingReviewSheet`'e gidiliyordu —
**fotoğrafı büyütüp göstermeden bile**. Kullanıcı kararıyla tersine çevrildi.
- **Veri katmanı AYNEN KALDI**, yalnızca hedefi değişti: gömülü
  `diary_entries!place_photos_entry_fk` ve `usePlaceRankings`'in ikisi de
  kullanılıyor. Fonksiyonun işi "nereye gideyim" değil **"ne yazayım"** oldu.
- Kural tek yerde: **`src/lib/photoInfo.ts` → `buildPhotoInfo`**. İki ekran aynı
  kararı verdiği için ikinci kopya yazılmadı (`getPhotoUrl` bir kez tam olarak
  böyle iki ekrana dağılmıştı). Ekranlarda kalan tek fark **puanın kaynağı**:
  mekan sayfası kendi kaydı için taze `existingRanking`'i önceliyor (kaydetme
  akışının tazelik sorunu yalnızca orada var).
- **Puan kaynaklı fotoğrafta TARİH YOK ve olmamalı:** bir puanın ziyaret tarihi
  yoktur (`user_rankings` bir DURUM, `diary_entries` bir OLAY).
- Bilgisi olmayan fotoğrafta **şeritler hiç açılmıyor** (boş şerit çizmek
  yerine); çıkış her koşulda görünür çünkü çarpı şeritlerden bağımsız.

#### 🔑 `pointerEvents="box-none"` İÇ `Pressable`'IN DOKUNUŞUNU YUTUYOR (kalıcı ders)
**Sahada doğrulanan hata sınıfı — "iç öğe tıklanmıyor" şikayetinde İLK bakılacak yer.**

**Neydi:** üst şerit `<View pointerEvents="box-none">` idi ("kendim hedef
olmam, çocuklarım olabilir") ve içindeki kullanıcı adı `Pressable`'ı **hiç
dokunuş almıyordu**. Basılı tutunca **solma efekti bile görünmüyordu** — yani
sorun `onPress`'in yanlış çalışması değil, hedefin **hiç kurulmaması**.
Dokunuş kök katmana düşüp şeritleri kapatıyordu.

**AYIRT EDİCİ KANIT (teşhisi tek turda kapatan şey):** aynı ekrandaki **çarpı
butonu ÇALIŞIYORDU** ve o, kök `Pressable`'ın **doğrudan çocuğu**. Kullanıcı
adı ise `box-none` ilan etmiş bir View'ın **içindeydi**. İkisi arasındaki tek
yapısal fark buydu.
- **Şüpheli "iç içe `Pressable`" DEĞİLDİ** — o desen `RankRow`'da (satırın
  içindeki ok/çöp kutusu) bu projede zaten cihazda doğrulanmıştı. Şüpheli,
  kendini "hedef değilim" ilan eden bir katmanın çocuklarını hedef
  yapabilmesiydi.
- **Bayat OTA bundle'ı ihtimali ÖNCE elendi**, tahminle geçilmedi:
  `eas update:list --branch preview` ile güncellemenin yayınlandığı (doğru
  branch, runtime 1.2.0) doğrulandı; kullanıcının **şeritleri görüyor olması**
  da runtime uyuşmazlığını ve "arkadaşın eski APK'sı" ihtimalini eledi
  (şeritler zaten bir önceki OTA ile gelmişti).

**Düzeltme — mekanizmayı AYARLAMAK değil, değişkeni KALDIRMAK:**
`pointerEvents` tamamen silindi, **şerit `View` yerine `Pressable` oldu**
(`onPress={toggleBars}`). Yapı böylece `RankRow`'un birebir aynısına döndü —
dış `Pressable` (şerit → kapat) + iç `Pressable` (ad → profil) — ve RN iç içe
dokunmada **en içteki** hedefi seçiyor. `ListPicker`'da sanallaştırmanın
kaldırılmasıyla aynı şekildeki karar: mekanizmayı ayarlamak yerine ortadan
kaldırmak.
- Yerleşim, boşluklar, güvenli alan payları ve yazı tipi ölçeği davranışı
  **hiç değişmedi** — `Pressable` da bir `View`.
- **Alt şerit `pointerEvents="none"` KALDI:** orada tıklanacak bir şey yok ve o
  yol sahada çalışıyor (dokunuş ATAYA, yani kök `Pressable`'a düşüyor).
  ⚠️ Ayrım burada: `none` → **ata** yakalar, çalışıyor. `box-none` → **çocuk**
  yakalayacaktı, çalışmadı.
- **Kural:** bir katmanın içindeki öğe tıklanabilir olacaksa, o katmanı
  `box-none` ile "delmeye" çalışma — katmanın kendisini `Pressable` yap.

#### Jest dağılımı — eski "her yere dokun = kapat" gitti
Görüntüleyicinin tamamı bir dönem tek `Pressable` ile sarılıydı ve **her yere
dokunmak kapatıyordu**; istenen "dokun → şeritler" tam olarak aynı jestti.

| Jest | Eski | Yeni |
|---|---|---|
| Fotoğrafa / boşluğa | Kapatır | **Şeritleri aç/kapat** |
| Şeridin boş alanı, tarih | Kapatır | Şeritleri kapat |
| **Kullanıcı adı** | — | **Profile git** |
| Sağ üst çarpı | **Sahte** (kök yutuyordu) | **Gerçek buton**, hep görünür |
| Android geri | Kapatır | Kapatır (değişmedi) |

⚠️ Çarpı eskiden bir `View`'dı, kendi `onPress`'i YOKTU; yalnızca kök Pressable
dokunuşu yuttuğu için çalışıyor görünüyordu. Kökün işi değişince ölü bir ikona
dönerdi. **Şeritlere bağlı DEĞİL, hep görünür** — yoksa şeritler kapalıyken tek
çıkış geri tuşu olurdu.

#### ⚠️ Profile giderken görüntüleyici KAPANMAK ZORUNDA
Açık bir RN `Modal` hedef ekranın önünde kalır (`MapSummarySheet` ve
`RankingReviewSheet` aynı sebeple önce kapanıyor). Bu yüzden **önce
`setViewing(null)`, sonra `navigate`**. Sonucu kabul edildi: profilden geri
gelince ızgaraya dönülüyor, tam ekran fotoğrafa değil. `reopenSummaryRef`
deseni (işaretle, odakta yeniden aç) **bilinçli olarak yapılmadı** — iki ekrana
birden kurulması gerekirdi, kullanıcıya maliyeti tek dokunuş.

**Kendi fotoğrafında kullanıcı adı DÜZ METİN**, `disabled` bir `Pressable`
bırakılmadı: `UserProfile` salt okunur ve kendi profilinde ayarlar/düzenleme
beklenir (`DiaryEntryDetailScreen.goToAuthor`'ın kararı, "en az sürpriz").

#### 🔑 `UserProfile` DÖRT STACK'İN İKİSİNDE YOKTU — uyuyan çökme
Kullanıcı adına dokunma eklenirken çıktı ve **isteğin asıl maliyeti buydu**.
`RestaurantDetail` dört stack'te birden kayıtlı, `UserProfile` ise yalnızca
`HomeStack` + `ProfileStack`'te. Yani **Ara** veya **Harita** sekmesinden
girilen mekanda dokunuş **çalışma anında patlayacaktı**.
- **`UserProfile` bir stack'e YALNIZ GİRMİYOR:** kendi sekmeleri ve sayaçları
  `ListDetail` · `DiaryEntryDetail` · `FollowersList`'e gidiyor. Toplam **5
  rota kaydı** eklendi (SearchStack'e üçü, MapStack'e ikisi + iki param listesi).
- **Koruma artık tipte:** `RestaurantDetailStackParamList`'e `UserProfile`
  eklendi. O tipe yazılan her hedef dördünde de kayıtlı olmak zorunda ve ekranın
  navigasyon tipi bu listeye bağlı olduğu için eksik kayıt **derleme anında**
  yakalanıyor.
- **Reddedilen alternatif:** adı yalnızca rotanın kayıtlı olduğu sekmelerde
  tıklanabilir yapmak — aynı görünen şey iki sekmede farklı davranırdı
  (`RankingReviewSheet`'in "İKİ PROFİLDE DE AYNI DAVRANIŞ" kararına aykırı).

#### Ziyaret detayındaki fotoğraf şeridi de artık tıklanabilir
Kareler düz `<Image>`'dı, dokunuşun **hiçbir karşılığı yoktu** ve sahada
"dokunuyorum, hiçbir şey olmuyor" olarak bildirildi. Aynı `PhotoViewer`'a
bağlandı — görüntüleyicinin `PhotoGrid`'den ayrı bileşene çıkarılmasının ikinci
sebebi buydu (o yüzey ızgara değil, yatay şerit).
- ⚠️ **`authorPhotos` filtresi BAYAT ve bilinçli olarak dokunulmadı:**
  `user_id === authorId` ile süzüyor, yani **yazarın o mekana yüklediği tüm
  fotoğraflar** — o ziyaretinkiler değil. Ekranın kendi yorumu hâlâ *"doğru
  çözüm nullable bir giriş kolonu eklemek"* diyor; **migration 020 o kolonu
  ekledi.** Şeritler geldiği için tutarsızlık artık GÖRÜNÜR: başka bir
  ziyaretten gelen karede üstte farklı bir tarih yazıyor. Ayrı bir ürün kararı
  (yalnızca bu ziyaretinkiler mi, yoksa ikiye ayrılmış mı) — Bilinen Açık
  İşler'de.

## 📓 OTURUM KAYDI — klavye/edge-to-edge teşhisi (2026-08-06/07)

> **Bu bir "oturum devri" DEĞİL, tarihsel kayıt** — güncel durum dosyanın
> başındaki "📍 Nerede kaldık" bölümünde.
> Burası, o teşhisin tek tam kaydı olduğu için korunuyor: iki ortamın zıt
> davranışı ve çürüyen üç hipotez başka hiçbir yerde bu ayrıntıda yazılı
> değil. Silinirse aynı yollara tekrar girilir.

### ✅ KAPANDI: klavye/kaydırma zinciri (2026-08-07, cihazda DOĞRULANDI)

Aşağıdaki teşhis **tamamlandı ve commit edildi**. İki hipotez yanlış çıktı,
kayıt için ikisi de duruyor — bu bölümün amacı aynı yollara tekrar girilmemesi.

**Semptom (kullanıcı bildirdi):** `EditProfile`'daki "Hakkında" alanına yazarken
metin belli bir uzunluğu geçince **yazılan satır klavyenin altında kalıyor**,
elle kaydırmak gerekiyor.

**Üç ayrı sorun çıktı, üçü de ayrı ayrı düzeltildi:**

1. **Girdinin yükseklik tavanı yoktu** → `maxHeight` (aşağıdaki tablo).
2. **`KeyboardAvoidingView` — AÇIK KALIYOR.** Bu madde bir dönem
   *"KAV fazla yer açıyor → `enabled={false}`"* diye yazıldı ve **YANLIŞTI**;
   düzeltmenin tam hikâyesi aşağıdaki "iki ortam" bölümünde. Kısacası: o ölçüm
   Expo Go'ydu, gerçek APK'da geçerli değil, KAV production'da **doğru işi
   yapıyor** (cihazda doğrulandı: sayfa kayıyor, Kaydet tam görünüyor).
3. **Kaydırma payı yetmiyordu** → `Spacing['4xl']`. Ölçüm: paysız içerik 530,
   görünür alan 363, "Hakkında"yı tepeye almak ~220 istiyor. Pay 20 → 187
   (yetmiyor), 96 → 263 (fazla), **48 → 215** (ideale 5px).

#### ⚠️ EN ÖNEMLİ BULGU: İKİ ORTAM ZIT DAVRANIYOR

**Pencerenin klavye için küçülüp küçülmediği çalışma ortamına göre değişiyor.**
Bu tek gerçek, teşhisi iki tur boyunca yanlış yöne sürükledi:

| | Expo Go | Gerçek APK |
|---|---|---|
| Pencere küçülüyor mu | **EVET** (846 → 455 = klavyenin tam boyu) | **HAYIR** |
| Sekme çubuğu | Klavyenin üstüne çıkıyor | Klavyenin arkasında kalıyor |
| KAV'ın işi | Gereksiz — üstüne 68px FAZLA açıyor | **Gerekli** — telafiyi o yapıyor |

Sebep: `softwareKeyboardLayoutMode` **native manifest ayarı**. Expo Go kendi
Activity'siyle çalışıp pencereyi yeniden boyutluyor; bizim APK'mızda
edge-to-edge açık (SDK 54'te zorunlu) ve edge-to-edge altında `adjustResize`
pencereyi yeniden boyutlamıyor.

**Sonuç: KAV Android'de AÇIK kalıyor.** Bir ara Expo Go ölçümüne dayanarak
kapatıldı; production'da telafi eden hiçbir şey kalmadığı için sayfa hiç
kaydırılamaz oldu ve alttaki Kaydet klavyenin arkasında kaldı. Geri açıldı ve
gerçek APK'da doğrulandı: **sayfa kayıyor, Kaydet tamamen görünüyor.**
Beklenen 68px'lik sekme çubuğu kayması production'da **çıkmadı** — orada
pencere küçülmediği için o çifte sayım hiç oluşmuyor.

**ÜÇ ÇÜRÜYEN HİPOTEZ — tekrar denenmesin:**
1. *"Edge-to-edge altında pencere küçülmüyor"* → Expo Go'da **yanlış**
   (küçülüyor). Bu varsayımla koşulsuz `paddingBottom` eklemek **ekranı
   tamamen boşalttı** (363 − 391 < 0). **Pencere işi yapıyorsa üstüne bir şey
   EKLENMEZ** — telafi koşulsuz değil, ölçülmüş farka göre olmalı.
2. *"Pencere ZATEN küçülüyor, KAV fazlalık"* → gerçek APK'da **yanlış**.
   1 ve 2 birbirinin tersi ve **ikisi de doğru** — hangi ortamda olduğuna bağlı.
3. *"Klavye açık olmasa bozuk durum oluşmaz"* → arka plandan dönüşte yanlış
   çıktı; ama o belirti **Expo Go artefaktıydı** (bkz. Bilinen Açık İşler'in
   ilk maddesi), gerçek APK'da hiç oluşmuyor.

**Yöntem notu — iki ders:**
- Teşhis iki tur tahminle yürüdü ve ikisi de patladı. Çözen şey `onLayout` /
  `onContentSizeChange` / `onScrollEndDrag` ile **gerçek sayıları ölçmek** oldu.
- Ama ölçmek de yetmedi: **yanlış ortamda ölçmek yanlış sonuç verdi.**
  Klavye/pencere ekseninde **Expo Go'daki ölçüm kanıt değildir**; karar gerçek
  APK'da doğrulanmalı.

**Teşhis — `DiaryEntrySheet` vakasıyla AYNI AİLE ama FARKLI MEKANİZMA.**
Bu ayrım önemli, çünkü yanlış tarafı düzeltmek zaman kaybettirirdi:

| | `DiaryEntrySheet` (önce kapandı) | `TextField` |
|---|---|---|
| Semptom | Sabit buton görünmüyor | Yazılan satır klavyenin altında |
| Mekanizma | Sabit eleman **kırpılıyor** | Büyüyen elemanın **imleci kaçıyor** |
| Sebep | Buton ScrollView içindeydi | Girdinin **yükseklik tavanı yok** |
| Çözüm | Sabit footer + `flexShrink` | **`maxHeight`** |

- **`maxHeight` GEREKLİ ama TEK BAŞINA YETMEDİ.** Cihazda test edilince diary
  tarafı düzeldi, `EditProfile` düzelmedi — aynı düzeltme, farklı sonuç. Ayrımı
  yaratan şey girdi değil **etrafındaki iskelet**ti (sheet dibe çivili, form
  sayfası değil) ve asıl teşhis oradan çıktı (yukarıdaki 2. ve 3. madde).
- **Asıl mekanizma:** RN bir girdiyi görünür alana **YALNIZCA ODAKLANDIĞI ANDA**
  kaydırıyor, büyürken tekrar kaydırmıyor. Sınırsız bir `multiline` TextInput
  metin uzadıkça büyüyor, imleç onunla aşağı kayıyor ve klavyenin altına iniyor.
- **Düzeltme:** `MULTILINE_MIN_HEIGHT = 88` (~3 satır) + **`MULTILINE_MAX_HEIGHT
  = 160`** (~6 satır). Tavana ulaşınca kutu büyümeyi bırakıyor, `TextInput` kendi
  içinde kayıyor ve RN imleci kendi sınırları içinde görünür tutuyor.
- **Aynı eksik `DiaryEntrySheet`'in not alanında da vardı** (`:445`,
  `minHeight: 88`, tavan yok) → oraya da `maxHeight: 160` eklendi. Sheet'in
  `maxHeight: '85%'`'i büyümeyi dolaylı sınırladığı için geç fark ediliyordu,
  mekanizma aynıydı. Bilinen özdeş bir hatayı bırakmamak için birlikte düzeltildi
  — **ama bu, doğrulanmış bir ekrana dokunmak demek, regresyon testi şart.**

#### Doğrulama (Expo Go + gerçek APK)
`maxHeight`, KAV kapatma ve kaydırma payının hepsi cihazda tek tek test edildi;
diary regresyonları (sabit footer, karartmaya dokunma) de kontrol edildi ve
bozulmadı. **Arka plandan dönüş senaryosu ayrıca gerçek APK'da** ("Yeni Liste"
formuyla, versionCode 4) doğrulandı — orada sorun yok.

### 📦 Commit durumu — **6 commit atıldı, PUSH EDİLMEDİ**

`refactor(auth): useAuth Context'e cevrildi` üstüne (2026-08-07):

| # | Commit | Kapsam |
|---|---|---|
| 1 | `chore:` local settings takipten çıkarıldı | `.gitignore` + `git rm --cached` |
| 2 | `feat(ui):` TextField + Button | iki yeni primitive |
| 3 | `fix(diary):` not alanına `maxHeight` | `DiaryEntrySheet` |
| 4 | `fix(profil):` `updateProfile` düzeltmesi | `useProfile` |
| 5 | `feat(profil):` profil düzenleme ekranı | ekran + rota + tip + header + bağlantı |
| 6 | `docs:` klavye teşhisi ve açık işler | bu dosya |

**Klavye düzeltmesi neden AYRI commit DEĞİL:** `EditProfileScreen.tsx` hiç commit
edilmemiş yeni bir dosyaydı, yani "önceki hali" yok. Ayrı bir fix commit'i
uydurmak bilerek bozuk bir ara durumu tarihe gömmek olurdu. Ölçüm gerekçesi
5'in gövdesinde ve kodun yorumlarında.

✅ **Bu altı commit push edildi ve OTA ile sahaya çıktı** (2026-08-07).
Tablo tarihsel kayıt olarak duruyor.

### ✅ O oturumda tamamlananlar (2026-08-06)

Hepsi cihazda doğrulandı:

1. **SHA-1 Faz 2** — anahtar ikiye bölündü (native Maps ↔ Places REST), Android
   app kısıtlaması konuldu, gerçek APK'da harita ve arama ayrı ayrı doğrulandı
2. **Fotoğraf özelliği (Faz 2'nin son ayağı)** — migration 013 + 014, Storage
   bucket, iki kopya üretimi (1280/400), tür sekmeleri, ızgara, tam ekran
   görüntüleyici, silme, yükleme göstergesi + fade-in
3. **Arama yerelliği** — `locationbias` her istekte gönderiliyor
   (`effectiveLocation`), `json.status` konsola loglanıyor
4. **`useAuth` → Context** — Faz 3'ün ön koşulu, 13 testle doğrulandı
5. **`EditProfile` ekranı** + `TextField`/`Button` primitive'leri +
   `updateProfile` düzeltmesi (A–D testleri geçti)
6. **Klavye/kaydırma zinciri (2026-08-07)** — `maxHeight` + kaydırma payı;
   ikisi de **ölçümle** belirlendi ve **gerçek APK'da** doğrulandı. KAV
   Android'de açık kalıyor. Teşhisin tamamı, iki ortamın zıt davranışı ve
   çürüyen üç hipotez yukarıda, "KAPANDI" bölümünde.

Ayrıca: versionCode 4 / version 1.1.0 build'i üretildi ve arkadaşa gönderildi
(**henüz kurulum/dönüş yok**), 4 + 1 commit push edildi, gitleaks temiz.

### 🗺️ Roadmap'teki konum — ⚠️ BAYAT (2026-08-06 fotoğrafı)

Güncel hali dosyanın başındaki **"📍 Nerede kaldık"** bölümünde: Faz 3'ün
sosyal katmanı aktivite akışı dahil **kapandı**. Aşağısı o gün Faz 3 daha
yeni başlarken yazılmıştı, tarihsel kayıt olarak duruyor.

- **Faz 1 — TAMAMLANDI**
- **Faz 2 — TAMAMEN TAMAMLANDI** (listeler → diary → **fotoğraflar** ✅)
- ~~**Faz 3 — ERKEN AŞAMA.**~~ Ön koşul (`useAuth` Context) bitti, ilk ekran
  (`EditProfile`) yazıldı. Kalan: `UserProfile`, `FollowersList`, takip akışı,
  aktivite akışı, leaderboard. → **hepsi bitti; leaderboard ertelendi.**
- **Faz 4 (marka)** — dokunulmadı, bilinçli olarak en sonda

### ⏸️ Değerlendirilip ERTELENEN fikirler

- **Mekan bazlı leaderboard** — **veri yetersiz.** Kesişim sorgusu tek satır
  döndürdü: 1 mekanda 2 kullanıcı, 2 giriş, yani **tam beraberlik, henüz "kral"
  yok**. Tetikleyici sorgu ve yeşil eşik (`kesisen_mekan >= 5` VE
  `gercek_krali_olan >= 3`) Faz 3 bölümünde kayıtlı, **ayda bir çalıştırılacak**.
- **Genel (arkadaşlar arası) sıralama** — **zaten var**: `HomeScreen`'deki
  "En Çok Puanlayanlar" bölümü. Az kullanıcıyla yeni metrik eklemenin getirisi
  sınırlı olduğu için ertelendi.
  - ⚠️ **ESKİ GEREKÇE ARTIK GEÇERSİZ:** burada bir dönem *"`diary_entries`
    tabanlı olanlar `security definer` RPC gerektiriyor (SELECT sahiplik
    istiyor)"* yazıyordu. **Migration 015 günlüğü herkese açtı**, yani
    `diary_entries` üzerinden sosyal sorgu yazmak artık düz bir `select`.
    Aktivite akışı (Diff D) tam olarak bunu yapıyor, RPC'siz. Aynı düzeltme
    mekan bazlı leaderboard için de geçerli.
- **Kategori/etiket filtreleme** — **büyük iş.** Google legacy `types` mutfak
  türü vermiyor, zincir/butik ayrımı hiçbir Google alanında yok, ve bu aramaya
  filtre eklemek değil **ikinci bir arama sistemi** kurmak demek. Tam fizibilite
  Faz 3 bölümünün sonunda; **Places API (New) göçüyle birlikte** değerlendirilecek.

---

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
- **Sosyal döngü uçtan uca çalışıyor** (Faz 3): başka bir kullanıcıyı bul →
  profilini gör → takip et → günlüğünü oku → ziyaret detayına gir → beğen →
  takipçi/takip listesinden başka profillere geç. Arkadaşla **çapraz hesap
  testi** de geçti (görünürlük, beğeni, salt-okunurluk).
- **Ana Sayfa'nın ana içeriği aktivite akışı**: takip edilenlerin ziyaretleri,
  en yeni üstte, beğeni sayacıyla; satıra dokununca ziyaret detayı, yazara
  dokununca profili açılıyor. "Trend Mekanlar" ve "En Çok Puanlayanlar"
  akışın altında duruyor.
- **Profil düzenlenebiliyor** (`EditProfile`): ad, kullanıcı adı, hakkında.
- **Mekan sayfasında "Senin Ziyaretlerin" bölümü var**: o mekana yaptığın
  ziyaretler tarih + puan + notla listeleniyor, her satır ziyaret detayına
  gidiyor. Dört sekmeden de çalışıyor. Ziyaret yoksa bölüm hiç görünmüyor.
- **Ziyaret kaydederken puan verilirse "Sıralamamı da güncelle" anahtarı
  çıkıyor** (varsayılan açık): kapatılırsa puan yalnızca günlükte kalıyor,
  kanonik sıralamaya dokunulmuyor. Ekleme ve düzenleme modunda da var.
- **Yıldızlar büyük sistem yazı tipinde doğru çiziliyor** (2.0 ölçekte
  doğrulandı); önceden alt yarıları kırpılıyordu.
- **Sıralama satırına dokununca yorumun tam metni açılıyor** (`RankingReviewSheet`):
  kendi profilinde de, başkasınınkinde de. Başkasının profilinde artık **onun**
  puanı ve yorumu görünüyor — önceden mekan sayfası açılıyor ve orada kullanıcı
  kendi kaydını görüyordu.
- **"Ziyaret Ekle" sheet'inde Kaydet butonu sabit footer'da**: form ne kadar
  uzarsa uzasın ve klavye açıkken de her zaman görünür.
- **Arama ekranı durum ayrımı yapıyor**: bir sonuca dokunup geri dönünce yazılan
  metin ve sonuç listesi **korunuyor** (ek istek atmadan), "Sonuç bulunamadı"
  yalnızca gerçekten aranmış ve boş dönmüş metinler için çıkıyor, debounce
  penceresinde iskelet görünüyor.
- **Sekme çubuğu her iki Android navigasyon türünde de doğru**: jest ve üç
  butonlu modda sistem çubuğuyla arasında nefes payı var.
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

## Dağıtım / EAS Build (2026-08-02)
Arkadaş testi için APK üretme hazırlığı. **Kod tarafı bitti, EAS tarafı yarım kaldı —
kaldığımız yer §5.**

### 1. `app.config.ts` → `app.config.js` (ZORUNLU dönüşüm, tercih değil)
Dinamik config dosyası artık **düz JavaScript**. Eski TS sürümü silindi.

**Hata neydi:** `npx eas-cli@latest init` şunu verdi —
```
Error reading Expo config at ...\app.config.ts:
Cannot read properties of undefined (reading 'CommonJS')
```

**NEDEN:** `npx eas-cli@latest` projenin `node_modules`'ünün **DIŞINDA**, kendi npx
önbelleğinden çalışıyor. `app.config.ts`'i okumak için TypeScript'i transpile etmesi
gerekiyor; projede **`ts-node` yok** (doğrulandı) ve Expo'nun kendi `sucrase`'ini
(3.35.1, kurulu) kendi konumundan çözemiyor. TypeScript API'sine düşüyor, `ts` nesnesi
tanımsız kalıyor ve `ts.ModuleKind.CommonJS` okunamıyor. Hata mesajındaki `CommonJS`
tam olarak bu.

- **Bu YALNIZCA `eas init`'i değil `eas build`'i de etkilerdi** — o da config'i
  okuyor. Düzeltilmeseydi 20 dakikalık kuyruktan sonra aynı yerde düşerdi.
- **TUZAK — iki hata üst üste binmişti:** `app.json`'da `extra.eas.projectId`
  `"your-eas-project-id"` yer tutucusuyla dururken `eas init` daha erken bir adımda
  **"Invalid UUID appId"** ile patlıyordu; config okuma hatasına hiç ulaşılamıyordu.
  Yer tutucu silinince asıl hata ortaya çıktı. `extra` bloğunu kaldırmak hatanın
  SEBEBİ değil, görünmesinin sebebiydi.
- **Reddedilen alternatif:** `ts-node`'u devDependency olarak eklemek. Çalışırdı ama
  20 satırlık bir config dosyası için kalıcı bir bağımlılık taşımak gerekirdi. Düz
  JS'te transpile adımı HİÇ YOK — hata sınıfı ortadan kalkıyor.
- **KAYBEDİLEN:** `ExpoConfig` / `ConfigContext` tip kontrolü. Dosya artık tsc
  tarafından denetlenmiyor; alan adı yanlış yazılırsa derleme değil **çalışma anı**
  hatası olur. Dosyanın işi 20 satırlık düz config olduğu için kabul edildi.
- Davranış birebir korundu: `app.json` taban, Google Maps anahtarı iki platforma
  enjekte ediliyor, anahtar yoksa `console.warn`. Node ile çağırılıp çıktısı
  doğrulandı.

### 2. `android.package = com.eren.belieats`
**KALICI KARAR.** Uygulama bir kez Play Store'a yüklendiğinde paket adı
**değiştirilemez**; değiştirmek yeni bir uygulama yayınlamak demektir. Yükleme
öncesi olduğumuz için şimdi belirlendi.

- Öncesinde `com.belieats.app` idi (şablondan kalma). `ios.bundleIdentifier` de aynı
  eski değerdeydi, **hizalandı** — iki farklı kimlik bırakmak ileride tuzak olurdu.
- `versionCode: 1` eklendi (yoktu). Her yeni APK'da **elle artırılmalı**;
  `eas.json`'da `appVersionSource: "local"` seçildi, yani sürüm `app.json`'dan
  okunuyor, EAS uzaktan yönetmiyor. Bu aşamada öngörülebilirlik için bilinçli.

> ### ⚠️ SÜRÜM YÜKSELTME RİTÜELİ (her build'de, İSTİSNASIZ)
> **1. `android.versionCode` HER build'de +1.** Aynı `versionCode` ile ikinci bir
> APK, mevcut kurulumun üzerine yüklenmez.
> **2. `version` — NATIVE bir şey değiştiyse +1** (ör. `1.0.0` → `1.1.0`).
>
> İkincisi 2026-08-05'te **kritik** hale geldi: `runtimeVersion` politikası
> `appVersion`, yani **OTA runtime'ı doğrudan `version` alanı.** Native değişip
> `version` aynı kalırsa, `eas update` ile gönderilen JS **uyumsuz bir binary'ye
> iner** ve uygulama çöker. `fingerprint` politikası bunu otomatik yapıyordu ama
> build'i patlattı (gerekçe §9) — koruma bu yüzden ritüele bağlandı.
>
> **"Native değişiklik" sayılanlar:** native kodu olan yeni paket · SDK/RN
> yükseltmesi · `app.json`'ın native alanları (`plugins`, `permissions`,
> `package`, `adaptiveIcon`, `splash`) · config plugin değişikliği.
> **Sayılmayanlar:** `src/` altındaki her şey, saf JS bağımlılıkları — bunlar
> zaten OTA ile gidebilir, yeni build bile gerekmez.
>
> `version` bugün **1.0.0** ve versionCode 3'te öyle kalıyor: `expo-updates`
> native bir eklemeydi ama bu **ilk** OTA'lı build, yani uyumsuz kalacağı önceki
> bir runtime yok. Bir sonraki native değişiklikte yükseltilecek.
- **`splash.image` yolu KIRIKTI** (`./assets/splash-icon.png` — dosya yok).
  Expo Go bunu görmezden geliyordu (splash'ı JS tarafında biz çiziyoruz) ama
  `eas build` "asset not found" ile düşerdi. `./assets/splash.png` olarak düzeltildi.

### 3. `eas.json` — üç profil
| Profil | Çıktı | Kullanım |
|---|---|---|
| `development` | APK + dev client | Yerel geliştirme yapısı (bugün kullanılmıyor) |
| **`preview`** | **APK**, `distribution: internal` | **Arkadaş testi — kullanılacak olan bu** |
| `production` | AAB (app-bundle) | Play Store; bugün gerekmiyor |

Arkadaş testinin komutu: `npx eas-cli@latest build -p android --profile preview`.
APK seçilmesinin sebebi: AAB doğrudan telefona kurulamaz, Play Store gerektirir.

**Her profil ayrıca `environment` alanı taşımalı** (`preview` profilinde var, diğer
ikisinde YOK) — panelde değişken tanımlı olması tek başına yetmiyor, gerekçe §5.2.
(Bu, ilk APK'nın çökme sebebi DEĞİLDİ; o `expo-font` çakışmasıydı — §5.1.)

### 4. Marka görselleri — GEÇİCİ
`assets/` içindeki dört PNG **Expo şablonunun varsayılanlarıydı** (mavi "A" ikonu,
gri ızgara splash). Yerlerine projenin kendi dilinde görseller üretildi.

- **Üretim yöntemi:** tek seferlik bir Node script'i, `sharp`/`canvas` gibi bir
  bağımlılık EKLEMEDEN — Node'un yerleşik `zlib`'i ile doğrudan RGBA PNG yazıyor
  (yuvarlatılmış dikdörtgen + koni biçimli bıçak ağzı geometrisi, 3×3 süper
  örneklemeli kenar yumuşatma). Script scratchpad'de kaldı, **projeye girmedi**.
- **Renkler `theme.ts`'ten birebir:** `icon.png` = `brand` (#22C55E) zemin + beyaz
  çatal-bıçak · `adaptive-icon.png` = **şeffaf** zemin + beyaz glif (Android ön
  katmanı, güvenli bölgeye sığacak ölçüde) · `splash.png` = beyaz zemin +
  `brandSubtle` (#DCFCE7) daire + `brandStrong` (#16A34A) glif, yani uygulama
  içindeki logo lockup'ının aynısı · `favicon.png` = icon'un 196px hali.
- **TUZAK KAPATILDI:** `adaptiveIcon.backgroundColor` `#FFFFFF` idi. Ön katman artık
  **beyaz** glif olduğu için beyaz zeminde görünmez olurdu — marka yeşiline çevrildi.
- Başıboş `assets/splash-icon - Copy.png` silindi (hiçbir yerden referans yoktu).
- **Bunlar Faz 4'ün (marka) yerine geçmez.** Vektör kaynağı yok, şekiller kodla
  çizildi. Gerçek isim/logo geldiğinde dördü de değişecek. Bugünkü işi görüyorlar:
  arkadaşın telefonunda "hangi uygulamaydı bu" sorusu çıkmıyor.

### 5. EAS projesi ve ilk build — BAĞLANDI
- EAS projesi: `@eren6150/beli-eats`
  → https://expo.dev/accounts/eren6150/projects/beli-eats
- `app.json` → `extra.eas.projectId` **yazıldı**:
  `d77bc86b-c3e4-4f7b-8136-2a1e82c3c278`. (UUID panelden de alınabilir:
  expo.dev → proje → **Project settings → Project ID**.)
- Üç ortam değişkeni panelden **tanımlandı** (preview + production, Plain text).
- İlk `preview` APK'sı **üretildi ve cihaza kuruldu** — ama açılışta çöktü;
  teşhis ve düzeltme §5.1.
- **Keystore EAS'te üretildi ve saklanıyor.** Sonraki build'lerde "Generate a new
  Android Keystore?" çıkarsa cevap **Hayır / mevcudu kullan**: imza değişirse yeni
  APK mevcut kurulumun üzerine yüklenmez, kullanıcının önce uygulamayı kaldırması
  gerekir. Arkadaş testinde bu sessiz bir "güncelleme gelmiyor" şikayetine döner.
- `versionCode` hâlâ **1** (`app.json`). Aynı imzayla üzerine kurulum çalıştığı için
  build'i bloklamıyor, ama §2'deki "her yeni APK'da elle artır" kuralı duruyor.

### 5.1 İlk APK açılışta ÇÖKTÜ — sebep `expo-font` sürüm çakışması (2026-08-03)
**Semptom:** APK cihaza kuruldu, açılışta **hiç arayüz göstermeden** "Beli Eats
sürekli olarak duruyor". Expo Go'da (`npx expo start`) aynı kod sorunsuz
çalışıyordu — yani yalnızca bağımsız build'e özgü.

**Gerçek kök neden (logcat ile kanıtlandı):**
```
java.lang.NoSuchMethodError: No static method getDirectConverter(...)
  in class Lexpo.modules.kotlin.types.ReturnTypeKt;
  at expo.modules.font.FontLoaderModule.definition(FontLoaderModule.kt:98)
  at expo.modules.kotlin.ModuleRegistry.register(ModuleRegistry.kt:27)
```
`expo-font@57.0.1` kurulmuştu — SDK 54 hattına ait değil, **expo-modules-core 4.x'e
karşı derlenmiş**. `ReturnTypeKt.getDirectConverter` metodu kurulu core 3.0.30'da
**hiç yok**. Çökme JS'ten ÖNCE, native modül kaydı sırasında oluyor.

**Nasıl geldiği — asıl ders: `@expo/vector-icons`'ın SINIRSIZ peer aralığı.**
`@expo/vector-icons@15.1.1` → `peerDependencies: { "expo-font": ">=14.0.4" }`.
Üst sınır yok; npm 7+ eksik peer'ları otomatik kurduğu için `latest`'i (57.0.1)
çekip **üst seviyeye** yazmış (`"peer": true`). SDK 54'ün istediği sürüm
`~14.0.12` ve `expo`'nun kendi nested kopyası doğruydu — ama:
- **Autolinking `package.json`'a bakmaz, dosya sistemini tarar ve üst seviye
  kazanır.** `expo-modules-autolinking search -p android` çıktısı doğru kopyayı
  `duplicates` diye görüp **yok sayıyordu**:
  `expo-font: path=node_modules\expo-font 57.0.1, duplicates=[expo\node_modules\expo-font 14.0.12]`
- **`npm uninstall` ve `npm prune` İKİSİ DE İŞE YARAMAZ.** İlki paket
  `package.json`'da olmadığı için, ikincisi paket öksüz değil **meşru bir peer**
  olduğu için dokunmuyor. Doğru hamle silmek değil **çözümlemeyi sınırlamak**:
  `npx expo install expo-font` → `~14.0.12` doğrudan bağımlılık olarak yazıldı.
  (`overrides` de çalışırdı ama `expo install --check` onu denetlemez, sessizce
  bayatlardı. Aynı desen `@expo/vector-icons` için de uygulanmıştı.)
- **Build neden hatasız geçti:** `expo-font` içinde **önceden derlenmiş AAR**
  geliyor (`local-maven-repo/.../expo.modules.font-57.0.1.aar`). Gradle ikili
  dosyayı olduğu gibi linkliyor, yereldeki `.kt` kaynağını derlemiyor → derleme
  hatası yok, uyumsuzluk çalışma anına kalıyor.
- **Trace'teki `FontLoaderModule.kt:98` node_modules'teki dosyaya ait DEĞİL**
  (yerel kopyalar 82 ve 77 satır). Numara AAR'ın gömülü debug bilgisinden, yani
  Expo'nun CI'ında derlenen orijinal kaynaktan geliyor. Çalışan bytecode ile
  diskteki kaynak farklı — bu tür bir uyuşmazlık görülürse önce prebuilt AAR
  ihtimali düşünülmeli.

**Expo Go neden hiç göstermedi:** Expo Go SDK 54 için **kendi önceden derlenmiş
native modül setini** taşıyor ve projenin native kodunu hiç derlemez/linklemez.
Bozuk AAR orada hiç yüklenmiyor; JS tarafı 57.0.1'e çözülse de
`@expo/vector-icons`'ın kullandığı yüzey (`loadAsync`/`isLoaded`) stabil olduğu
için patlamıyor. **Bu hata sınıfı yalnızca native linkleme yapan build'de görünür.**

**Doğrulama (build ALMADAN yapıldı):** `expo-modules-autolinking search -p android`
→ `expo-font 14.0.12, duplicates=0`, tüm modüllerde duplicate sıfır.
20-25 dakikalık build'e bu görülmeden girilmedi.

**Kalan uyumsuzluk:** `npx expo install --check` → `expo@54.0.35`, beklenen
`~54.0.36`. Aynı SDK içinde patch farkı, bu hatanın sınıfından değil; çökme
düzeltmesinin kanıtını kirletmemek için **bilinçli olarak ertelendi**.

**`app.json`'a `expo-font` plugin kaydı EKLENMEDİ.** `npx expo install` öneriyor
(dinamik config'e kendisi yazamıyor — datetimepicker'daki durumun aynısı) ama o
plugin yalnızca `fonts: [...]` ile **özel font dosyası gömmek** için; biz font
gömmüyoruz, `@expo/vector-icons` fontlarını çalışma anında yüklüyor. Kayıt
öncesinde de yoktu. Gerekirse eklemek tek satır.

### 5.2 `environment` alanı — doğru düzeltme, ama ÇÖKMENİN SEBEBİ DEĞİLDİ
Bu bölüm bir dönem çökmenin kök nedeni olarak yazılmıştı; **§5.1 onu çürüttü.**
Çökme native modül kaydında, JS bundle hiç çalışmadan oluyordu — yani
`supabaseClient.ts` zincirine ulaşılmıyordu bile. Aşağıdaki iki değişiklik
**doğru ve kalıcı**, ama ikisi de o bug'ı çözmedi.

**Bulgu (geçerli):** değişkenlerin expo.dev panelinde tanımlı olması **YETMİYOR** —
panel değişkeni bir *ortama* (`development`/`preview`/`production`) yazar, profil
ise hangi ortamı kullanacağını `eas.json`'daki `environment` alanıyla ilan eder.
- Expo dokümanı alanı tanımlıyor ("The environment used to apply environment
  variables for the build process") ama **atlandığında ne olduğunu YAZMIYOR** —
  varsayılan ilan edilmemiş. Bu yüzden alanı açıkça yazmak doğru olan.
- **`EXPO_PUBLIC_*` çalışma anında okunmaz, BUNDLE'A GÖMÜLÜR.** Expo Go'da Metro
  yerel `.env`'den gömüyor; EAS'te `.env` `.gitignore`'da olduğu için sunucuya hiç
  gitmiyor ve tek kaynak panel.
- `npx eas-cli@latest env:list --environment preview` üç değişkeni de eksiksiz
  listeledi, yani panel tarafı zaten sağlamdı.

**Yapılan iki değişiklik (ikisi de kalıyor):**
1. `eas.json` → `preview` profiline `"environment": "preview"`. Açık ve doğru
   yapılandırma; dokümanda varsayılan ilan edilmediği için örtük davranışa
   güvenmemek gerekiyor.
2. **`supabaseClient.ts` artık FIRLATMIYOR.** Eksik değişkenler isimleriyle ve tam
   düzeltme adımlarıyla `console.error`'a gidiyor; `createClient`'a boş string
   yerine yer tutucu (`https://unconfigured.invalid`) veriliyor — boş string
   falsy olduğu için eski `?? ''` fallback'i korumuyordu ve modül import'unda
   `supabaseUrl is required.` fırlatılıyordu (`helpers.ts:110`). Artık uygulama
   açılıyor, hata ekranların **mevcut** kısa şeridine ("Bağlantını kontrol et" +
   Tekrar dene) düşüyor — "ekrana kısa metin, konsola tam nesne" kuralı.
   `console.error` seçildi (`warn` değil): uygulamanın tamamını çalışmaz kılan bir
   kurulum hatası, beklenen durum değil.
   - `isSupabaseConfigured` gibi bir bayrak **export EDİLMEDİ** — bugün onu okuyan
     ekran yok, ölü kod olurdu.
   - Bu değişiklik teşhis sırasında yapıldı ama **bağımsız olarak değerlidir**:
     eksik konfigürasyonu sessiz bir native çökmeye çeviren davranış zaten
     kuralın en kötü ihlaliydi.

**⚠️ HÂLÂ TEST EDİLMEDİ: `EXPO_PUBLIC_*` değerleri bundle'a gerçekten giriyor mu?**
Uygulama o koda hiç varmadığı için bu soru **cevapsız kaldı**. Bir sonraki APK'da
açıkça doğrulanmalı: uygulama açılıyor mu, **giriş yapılabiliyor mu** (Supabase),
**harita geliyor mu** (Google Maps key). Açılıp da giriş ekranında "Bağlantını
kontrol et" görülüyorsa sorun bu eksende demektir ve `supabaseClient.ts` artık
konsola eksik değişken isimlerini yazacak.

### 5.3 Cihazdan crash logu alma — bu vakayı ÇÖZEN adım
Statik analiz yanlış sonuca götürmüştü (§5.2); vakayı kapatan şey gerçek logdu.
**Bağımsız build çöküyorsa ilk iş logcat, tahmin değil.**
`winget install --id Google.PlatformTools` → telefonda Ayarlar → Telefon hakkında →
**Yapı numarası**'na 7 kez dokun → Geliştirici seçenekleri → **USB hata ayıklama**
aç → USB ile bağla, telefondaki izni onayla → `adb devices` ile doğrula →
`adb logcat -c` → uygulamayı aç, çöksün → `adb logcat -d > crash.txt`.
Aranacak desenler: `FATAL`, `AndroidRuntime`, `JavascriptException`, `ReactNativeJS`.

### 6. HENÜZ YAPILMAYANLAR — sıradaki oturumun yol haritası

**Tamamlananlar (2026-08-02/03):** `eas init` → `projectId` `app.json`'da (§5) ·
üç ortam değişkeni panelde tanımlı (preview + production, **Plain text** — bilinçli:
`EXPO_PUBLIC_` değişkenleri zaten JS bundle'ına gömülüyor, "secret" işaretlemek
yanlış bir güvenlik hissi verir; gerçek koruma Supabase'de RLS, Google'da 2.
maddedeki kısıtlama) · ilk `preview` APK'sı üretildi, açılış çökmesi teşhis edilip
düzeltildi (§5.1).

**⚠️ Sıradaki APK'da İLK doğrulanacak şey:** uygulama açılıyor mu · **giriş
yapılabiliyor mu** · **harita geliyor mu**. İlki `expo-font` düzeltmesini (§5.1),
son ikisi `EXPO_PUBLIC_*` değişkenlerinin bundle'a girip girmediğini (§5.2) test
eder — ikincisi çökme yüzünden **hiç test edilemedi**, hâlâ açık bir soru.

1. ~~`production` profilinde `environment` alanı yok~~ — **KAPANDI (2026-08-04).**
   `eas.json` → `"production": { "environment": "production", ... }`. Değişkenler
   panelde `production` ortamında zaten tanımlıydı, eksik olan profilin onları
   **istemesiydi**. Düzeltilmeseydi mağazadaki uygulama giriş yapamazdı.
   - **`development` profili BİLİNÇLİ OLARAK dokunulmadan bırakıldı.** Alanı
     oraya da eklemek cazip ama panelde `development` ortamında **hiç değişken
     tanımlı değil** (yalnızca preview + production var, §6 girişi). Alanı
     yazmak, bugünkü "tanımsız davranış"ı **kesin bir boşluğa** çevirirdi:
     dev build'i Supabase/Maps anahtarları olmadan çıkardı. Profil bugün
     kullanılmıyor; kullanılacağı gün **önce panelde `development` ortamına üç
     değişken tanımlanmalı, sonra** alan eklenmeli. Sırası bu.
2. **Google Cloud Console anahtar kısıtlaması — FAZ 1 YAPILDI (2026-08-05),
   FAZ 2 (Android app kısıtlaması) AÇIK.**

   **✅ Faz 1 — API kısıtlaması (kod değişikliği yok, build yok, test edildi):**
   Anahtarda artık **yalnızca `Maps SDK for Android` + `Places API`** işaretli.
   `Geocoding API` ve `Maps SDK for iOS` **kaldırıldı** — kodda kullanılmıyorlardı,
   gereksiz saldırı yüzeyi açıyorlardı. Çalınan bir anahtar artık Geocoding /
   Directions / Distance Matrix gibi pahalı API'lere kullanılamıyor. Application
   restrictions **None** olarak bırakıldı (Faz 2'nin işi).
   - ⚠️ **`Places API` seçilmeli, `Places API (New)` DEĞİL** — kod eski uçları
     (`/maps/api/place/...`) kullanıyor.
   - 🍎 **iOS İÇİN HATIRLATMA:** iOS bugün planda yok, ama bir gün eklenirse
     **Console'da anahtara `Maps SDK for iOS`'u geri eklemek gerekiyor.**
     Unutulursa iOS build'inde harita **sessizce** kırılır — uygulama açılır,
     her şey çalışır, yalnızca harita boş/gri gelir ve sebebi kodda görünmez.
     `app.config.js:91` zaten `ios.config.googleMapsApiKey`'i enjekte ediyor,
     yani kod tarafı hazır; eksik olan yalnızca Console'daki izin olur.

   **✅ Faz 2 — TAMAMLANDI (2026-08-06), gerçek APK'da (versionCode 4)
   DOĞRULANDI: harita ve arama ikisi de sağlam.**
   Anahtar ikiye bölündü ve beklenti doğrulandı — tek anahtara Android
   kısıtlaması koymak Places REST'i kıracaktı, iki anahtar bunu çözdü.
   Aşağıdaki analiz kayıt için duruyor; asıl ders **"iki farklı Google
   trafiği var ve kısıtlamaya tepkileri zıt"**.
   Buraya *"tek anahtara Application restrictions: Android apps (package + SHA-1)
   + API restrictions: Maps SDK for Android + Places API"* diye yazılmıştı. Sorun:
   bu projede **iki farklı Google trafiği var ve kısıtlamaya tepkileri zıt.**
   - **Native harita** → Maps SDK for Android üzerinden. SDK isteğe paket adını
     ve imzayı kendisi ekliyor → Android kısıtlaması **çalışır**.
   - **Places çağrıları** (`places.ts`, `SearchScreen`) → JS'ten düz `fetch` ile
     **REST**. Bu isteklerde paket adı/imza **yok**, dolayısıyla Android
     uygulama kısıtlaması onları tanıyamaz → beklenti: **`REQUEST_DENIED` ile
     arama ve mekan detaylarının kırılması.** Harita çalışmaya devam ettiği için
     bozukluk sinsi olur; üstelik `json.status` kontrol edilmediği için ekranda
     düzgün bir hata bile çıkmaz, sadece "sonuç yok" görünür.
   - **DOĞRULANMADI** ve **⚠️ EXPO GO'DA DOĞRULANAMAZ** — eski plan "Expo Go'da
     dene" diyordu, o plan GEÇERSİZ. Expo Go'nun paket adı `host.exp.exponent`
     ve imzası Expo'ya ait; bizim kısıtımıza zaten takılır. Android kısıtlaması
     **yalnızca gerçek APK ile** test edilebilir. Faz 2'nin bir build'e
     bindirilmesinin ikinci sebebi bu.
   - **Çözüm iki ayrı anahtar:**
     | Anahtar | Application restriction | API restriction |
     |---|---|---|
     | A — native harita | Android apps (`com.eren.belieats` + SHA-1) | Maps SDK for Android |
     | B — Places REST | **None** (kilitlenemiyor) | Places API |
     B kilitlenemiyor çünkü Google'ın mobil REST çağrıları için uygulama
     kısıtlaması yok (IP ve HTTP referrer var, ikisi de mobilde işe yaramaz).
     B'nin koruması: API kısıtı + günlük 2.000 kota + bütçe uyarısı.
   - **AYIRMA MALİYETİ — build gerektiriyor, JS değil:** A anahtarı
     `app.config.js` → AndroidManifest yoluyla **build anında** gömülüyor, yani
     yeni build **ve** `app.json`'ın native alanı değiştiği için **`version`
     yükseltmesi** gerekiyor (§2 ritüeli). B anahtarı yalnızca JS'te okunuyor
     (`places.ts:10`, `SearchScreen.tsx:23`) → OTA ile giderdi. İkisi birlikte
     değişmek zorunda olduğu için iş bir bütün olarak **build'e bağımlı**.
   - **SHA-1 nereden:** expo.dev → proje → **Credentials** → Android → Keystore
     kartında `SHA-1 Fingerprint`. Terminal alternatifi
     `npx eas-cli@latest credentials` (Android → preview).
   - Nihai çözüm zaten kayıtlı: Google çağrılarını **Supabase Edge Function**
     arkasına almak (bkz. `places` cache tablosu bölümünün sonu) — o gün B
     anahtarı istemciden tamamen kalkar ve bu madde kökten kapanır.
   - Bu yüzden madde "console'da 5 dakika" DEĞİL, kendi teşhisi olan bir iş.
     Bütçe uyarısının (3) ondan önce yapılmasının sebebi de bu: koruma
     boşluğunu o kapatıyor.
3. ~~Bütçe uyarısı~~ — **KAPANDI (2026-08-04), üstüne KOTA da kondu.**
   - **Bütçe uyarısı:** Console → Billing → Budgets & alerts, aylık periyot,
     %50/%90/%100 eşikleri.
   - **⚠️ Bütçe uyarısı harcamayı DURDURMAZ, yalnızca e-posta atar.** Eşik
     aşılsa bile API çalışmaya devam eder. Bu yüzden asıl koruma olarak
     **günlük kota** kondu: APIs & Services → ilgili API → Quotas →
     **Places API ve Maps SDK for Android için günlük 2.000 istek.**
     Kota ücretsiz, anında etkili ve limit dolunca istekler reddedilir — yani
     kontrolsüz maliyet fiilen imkânsız. İkisi birlikte çalışıyor: uyarı "ne
     oluyor" der, kota "daha fazlası olmasın" der.
   - **Kota dolduğunda semptom SessizDİR — bilerek kabul edildi.** Places
     çağrıları `OVER_QUERY_LIMIT` döner; `places.ts` üzerinden geçen yollarda
     (mekan detayı, harita POI) düzgün `PlacesError` var, ama `SearchScreen`
     `json.status`'ü kontrol etmediği için ekranda yalnızca **"Sonuç
     bulunamadı"** görünür, hata olduğu anlaşılmaz. `json.status` maddesinin
     neden açık iş listesinde durduğunun bir örneği daha; SHA-1 teşhisiyle (2)
     birlikte ele alınmaya değer, çünkü o kısıtlamanın yanlış uygulanması da
     tam olarak aynı sessiz semptomu üretiyor.
4. **Dağıtım ve geri bildirim — BAŞLADI (2026-08-03).** APK en az bir arkadaşın
   telefonuna kuruldu ve kullanılmaya başlandı; **2 haftalık geri bildirim toplama
   süreci devam ediyor.** (Android "bilinmeyen kaynaktan kurulum" izni istenebilir.)
   - **Gelen ilk geri bildirim:** sekme çubuğu ile sistem navigasyon çubuğu üç
     butonlu navigasyonda iç içe duruyor → **teşhis edildi ve düzeltildi
     (2026-08-04), iki navigasyon türünde de doğrulandı.** ⚠️ Arkadaştaki APK'da
     hâlâ BOZUK — düzeltme ona ancak yeni build'le ulaşır.
   - **⚠️ DERS — "cihaz YAPILANDIRMASINA bağlı bug sınıfı". ÜÇ KEZ ısırdı;
     ilk ikisi arkadaş testinden geldi, üçüncüsü artık bu ders sayesinde
     düzenli test edildiği için KENDİ cihazımızda yakalandı.**
     1. **Sekme çubuğu ↔ sistem navigasyon çubuğu** (2026-08-03 bildirildi,
        08-04 kapandı). Değişken: **navigasyon türü**. Jest navigasyonunda
        `insets.bottom`'ın büyük kısmı boş, üç butonluda tamamı buton →
        `paddingBottom === insets.bottom` bir modda boşluk gibi görünüp
        diğerinde bitişik çıkıyordu.
     2. **`DiaryEntrySheet`'in Kaydet butonu** (2026-08-05). Değişken: **ekran
        yüksekliği + sistem yazı tipi ölçeği**. Buton ScrollView'ın içindeydi;
        `maxHeight: '85%'` yetmediğinde kırpılan ilk şey oydu.
     3. **`StarRating`'in yıldızları** (2026-08-08). Değişken: **sistem yazı
        tipi ölçeği** (ölçüldü: Samsung'un en üst kademesi = **2.00**).
        Yıldızların **alt yarısı görünmüyordu**. Kutu `size × 1.3` ile
        hesaplanan SABİT bir sayı (44px, ölçümde de 44x44 çıktı) ama içindeki
        `★` bir `Text` ve RN'de metin varsayılan olarak ölçekle büyüyor:
        `fontSize: 32` fiilen 64px oluyor. 64px glif 44px kutuya sığmıyor.
        - **Düzeltme: `allowFontScaling={false}`** — yıldız bir İKON, okunacak
          metin değil. Dokunma hedefi `MIN_TOUCH_SIZE` (44) ile zaten korunuyor
          ve ölçeklemeden bağımsız. Yanındaki sayı (`showValue`) **bilinçli
          olarak ölçeklenmeye devam ediyor**: o gerçek metin.
        - **Kutuyu büyütmek REDDEDİLDİ, ölçüyle:** 5 yıldız bugün 220px,
          2.0 ölçekte 440px eder ve telefon genişliğini aşar.
        - Bu, `StarRating`'in kendi yorumunda anlatılan hata sınıfının
          **üçüncü yüzü**: kutu ile glif arasındaki oran bozulunca yıldız
          kırpılıyor. Öncekilerde oranı bozan satır yüksekliğiydi, burada
          sistem ölçeği.
     - **Ortak imza:** geliştiricinin cihazında %100 çalışıyor, kullanıcının
       cihazında bozuk; kodda görünür bir hata yok çünkü **formül belirli bir
       yapılandırma için doğru**. Kök neden hep aynı: koda gömülü, yazıldığı
       gün doğru olan ama artık evrensel olmayan bir varsayım.
     - **Çıkarım — düzeltme "ölçüp o değere göre ayarlamak" DEĞİL, formülü
       yapılandırmadan BAĞIMSIZ kılmak olmalı.** Nav bar'da `max()` → toplama;
       diary'de sabit yükseklik varsayımı → `flexShrink` + sabit footer;
       yıldızda ölçeğe tabi glif → ölçekten muaf glif. **Üçünde de doğru çözüm,
       ölçülen değeri bilmeye ihtiyaç duymuyor** — ölçüm yalnızca teşhis için
       gerekti, düzeltmenin içine girmedi.
     - **YÖNTEM NOTU (2026-08-08):** bu turda iki iddia geldi, biri gerçek biri
       değil. "Kaydırma çalışmıyor" **ölçümle çürütüldü**: içerik görünür alana
       tam oturuyordu (fark 0), yani kaydıracak bir şey yoktu; puan seçilip
       içerik büyüyünce (fark +76) kaydırma çalıştı. **Sabit footer zinciri
       2.0 ölçekte sağlam.** Ölçüm yapılmasaydı sağlam bir zincir "düzeltilmeye"
       çalışılacaktı. Dürüst not: ölçüm aletinin bir kısmı da işe yaramadı —
       glifin `onLayout`'u ebeveyn tarafından KISITLANMIŞ kutuyu ölçüyor,
       glifin gerçek boyutunu değil; taşmayı gösteremezdi.
     - **Gelen her görsel geri bildirimde sorulacaklar:** navigasyon türü ·
       Android sürümü · ekran oranı/boyutu · **sistem yazı tipi ölçeği** ·
       görüntü boyutu (display size) ayarı.
     - **Kendi cihazında ucuza test edilebilir:** Ayarlar → Sistem →
       Sistem navigasyonu (iki mod) ve Ayarlar → Ekran → Yazı tipi boyutu
       (en büyük). İkisi de APK gerektirmiyor, Expo Go yeterli.
   - ~~TRİYAJ: "kayıt olamıyorum" → `profiles.username` unique çakışması~~ →
     **KAPANDI (2026-08-04, migration 012).** Trigger artık çakışmada sonek
     üretiyor (`eren` → `eren2`) ve düzeltme **saf SQL olduğu için mevcut
     APK'daki herkes için anında geçerli** — build beklemeye gerek yoktu.
     Yine de "kayıt olamıyorum" şikayeti gelirse kontrol:
     `select username from profiles order by created_at desc;` ve
     `select public.next_available_username('<sikayet-eden-@-oncesi>');`
   - ~~E-posta onayı **kapalı** tutuluyor~~ → **AÇILDI (2026-08-09).** Artık
     yeni kayıtlar onay maili alıyor ve onaylamadan giriş yapamıyor. Spam
     klasörü uyarısı yapılmalı: alan adı bağlanana kadar mailler oraya
     düşebilir (gerekçe: Mimari Notlar → Auth / kayıt akışı).

### 7. GitHub deposu
`eren6150/beli-eats` olarak push edildi ve doğrulandı.

- **Güvenlik denetimi temiz:** kaynak kodda, `app.json`'da, `app.config.js`'te,
  migration'larda ve yorumlarda **hard-coded anahtar YOK** (`AIza…`, `eyJ…`,
  `service_role`, `sk_live` desenleri tarandı). Anahtarlar yalnızca `.env`'de;
  `supabaseClient.ts` ve `app.config.js` ikisi de `process.env`'den okuyor.
- **`.gitignore` genişletildi:** yalnızca `.env` vardı, `.env.local` /
  `.env.*.local` dışlanmıyordu. Artık `.env*` + `!.env.example`.
- `.env.example` zaten vardı ve temiz (yer tutucu değerler), commit ediliyor.
- **Geçmiş riski YOK:** depo bu iş sırasında ilk kez başlatıldı, öncesinde hiçbir
  şey commit edilmemişti — temizlenecek geçmiş yok.
- **`.expo/dev/logs/start.log` gerçek anahtarları düz metin içeriyor** ama `.expo/`
  `.gitignore`'da. Bu klasörü elle paylaşma/zipleme.
- Öneri: GitHub → Settings → Code security → **Secret scanning + Push protection**.

### 8. EAS Update (OTA) — kuruldu (2026-08-05), versionCode 3 ile devreye giriyor

**Neden şimdi:** iki günde iki geri bildirim turu geldi (nav bar, diary Kaydet
butonu) ve **ikisi de saf JS düzeltmesiydi** — yani ikisi de OTA ile gidebilirdi.
Asıl kazanç 20-25 dakikalık build süresi değil, arkadaşa her seferinde
*"şunu tekrar kur"* dememek; testi yavaşlatan sosyal maliyet o.

- **⚠️ MEVCUT APK'YA OTA GÖNDERİLEMEZ — kurulum bunu geriye dönük çözmüyor.**
  OTA, `expo-updates`'in native modül olarak **binary'ye derlenmiş olmasını**
  gerektiriyor. versionCode 2 APK'sı onsuz build edildi, o binary güncelleme
  sunucusunu sorgulamayı bilmiyor. Yani diary düzeltmesi için yeni build
  zorunluydu; OTA ancak **bundan sonraki** turları kurtarıyor.
- **Kurulan:** `expo-updates@29.0.19` (+ 6 transitive: `expo-eas-client`,
  `expo-manifests`, `expo-structured-headers`, `expo-updates-interface`,
  `expo-json-utils`). `npx expo install --check` bunu **işaretlemedi**, yani
  SDK 54'ün beklediği sürüm.
- **Autolinking build ÖNCESİ doğrulandı** (§5.1'in dersi): 16 modülün hepsinde
  `duplicates: []`. Özellikle `expo-font` hâlâ 14.0.12 ve tek kopya — 7 yeni
  paket ilk APK'yı çökerten çözümlemeyi bozmamış.
- **`updates.url` `projectId`'den TÜRETİLİYOR**, elle yazılmadı (`app.config.js`).
  İki yere kopyalamak, birini değiştirip diğerini unutmanın sessiz yolu olurdu —
  Google anahtarındaki gerekçenin aynısı.
- **Kanallar:** `eas.json`'da `preview` ve `production` profillerine `channel`
  eklendi. `production`'a da eklendi çünkü kanalsız bir build güncelleme alamaz,
  yani mağaza build'i sessizce OTA'sız kalırdı. **Bu, `environment` alanında
  `development` profiline DOKUNMAMA kararıyla çelişmiyor:** orada gerçek tehlike
  vardı (panelde tanımlı değişken yok → build anahtarsız çıkardı), kanallar ise
  EAS tarafında talep üzerine oluşuyor, boş kanala işaret etmenin zararı yok.
  `development` profiline yine dokunulmadı.
- **Güncelleme davranışı (varsayılan, açıkça yazılmadı çünkü Expo dokümanı ilan
  ediyor):** uygulama cache'teki bundle ile HEMEN açılır, güncellemeyi arka planda
  indirir, **bir sonraki açılışta** uygular. Açılış hiçbir zaman ağ beklemez;
  kullanıcı değişikliği ikinci açılışta görür.
- **Yayınlama — `--environment preview` ŞART, opsiyonel değil:**
  ```
  npx eas-cli@latest update --branch preview --environment preview --message "…"
  ```

#### ⚠️ DERS — ortam değişkeninin KAYNAĞI build ile update arasında FARKLI
İlk `eas update` çalıştırıldığında `app.config.js`'in
*"EXPO_PUBLIC_GOOGLE_MAPS_API_KEY tanımsız"* uyarısı çıktı, oysa `.env` doluydu
ve `eas build` hiç şikayet etmemişti. Teşhis:

- **Bundle SAĞLAM, uyarı gürültüydü — kanıtlandı.** `npx expo export --platform
  android` ile aynı bundle yerelde üretilip Hermes çıktısı arandı: üç
  `EXPO_PUBLIC_*` değeri de gömülü, `supabaseClient`'ın `unconfigured.invalid`
  yer tutucusu bundle'da yok. Yani gönderilen güncelleme harita/arama'yı
  bozmadı. (Değerler ekrana yazdırılmadan, yalnızca var/yok olarak kontrol
  edildi.)
- **Sebep sıralama:** Expo CLI app config'i **`.env` yüklenmeden ÖNCE**
  değerlendiriyor. Çıktı sırası bunu birebir gösteriyor:
  `[app.config] … tanımsız` → `env: load .env` → `Starting Metro Bundler`.
  Config eval uyarıyı basıyor, `.env` sonra yükleniyor, Metro anahtarla
  bundle'lıyor.
- **ASIL BULGU — iki komut değişkeni İKİ FARKLI YERDEN okuyor:**
  | Komut | Bundle nerede üretiliyor | Değişken kaynağı |
  |---|---|---|
  | `eas build` | EAS sunucusunda | **EAS ortamı** (`.env` gitignore'da, sunucuya hiç gitmiyor) |
  | `eas update` | **yerel makinede** | varsayılan olarak **yerel `.env`** |
  Bu, sessiz bir ıraksama kapısı: yerel `.env` ile paneldeki `preview` ortamı
  ayrışırsa (anahtar döndürülür, biri güncellenip diğeri unutulur) aynı JS iki
  farklı değerle sahaya çıkar. Daha kötüsü: **`.env`'i olmayan bir makinede
  `eas update` çalıştırmak, boş anahtarlı bir bundle'ı herkese gönderir** ve
  hata ekranda "sonuç bulunamadı" diye görünür.
- **Çözüm `--environment preview`:** EAS CLI değişkenleri sunucudaki ortamdan
  çekiyor, yani update de build ile **aynı tek kaynağı** kullanıyor. Bu bayrak
  olmadan update yayınlanmamalı.
- **İki anahtar yolu birbirine karıştırılmamalı** (bu vakada karıştırılmıştı):
  1. **Native harita anahtarı** → `app.config.js` → AndroidManifest → **build
     anında sabitleniyor.** OTA onu değiştiremez, değiştirmesi de gerekmiyor.
  2. **JS tarafındaki Places REST anahtarı** → Metro bundle'a gömüyor → **her
     OTA ile yeniden gidiyor.** Riskli olan yol bu.
  Uyarı 1. yolun değerlendirme anında çıkıyor, ama update için önemli olan 2.
  yol. İkisi bağımsız.
- `app.config.js`'teki uyarı metni de bu ayrımı söyleyecek şekilde güncellendi
  (yerelde zararsız olabilir, `eas build` sırasında gerçek).
- **`expo` patch farkı (54.0.35 ↔ ~54.0.36) bu build'de BİLİNÇLİ ertelendi.**
  Erteleme gerekçesi değişti: eskiden "çökme kanıtını kirletmemek"ti, artık
  "bu build zaten bir native değişiklik (`expo-updates`) taşıyor, ikinci bir
  değişken eklenmemeli". Sahada çalıştığı kanıtlanmış kombinasyon korunuyor.
- **`npm audit` ÇALIŞTIRILMIYOR** (16 uyarı duruyor). Expo'da bağımlılıklar SDK
  ile uyumlu aralıklara sabitli; `npm audit fix` transitive'leri semver'e göre
  yukarı iter ve **native/JS uyumsuzluğu üretmenin tam yolu** — `expo-font@57`
  vakası bu sınıftandı. Uyarıların çoğu build zamanı araçlarında; cihaza giden
  şey JS bundle'ı. Doğru araç `npx expo install --check` ve `npx expo-doctor`.

### 9. `runtimeVersion`: fingerprint DENENDİ ve BUILD PATLATTI → `appVersion`

İlk versionCode 3 build'i **"Configure expo-updates" aşamasında** düştü:
```
Runtime version calculated on local machine: 798d1817…
Runtime version calculated on EAS:           68f17529…
```

**Kök neden: EAS, `expo prebuild` ile native ağacı ürettikten SONRA fingerprint
hesaplıyor; yerelde o ağaç hiç yok.** (CNG projesi, `android/` yerelde yok.)

Fingerprint diff'i **İKİ BAĞIMSIZ fark** gösterdi — tek kök neden değil:

**Fark 1 — `bareNativeDir` (`android` dizini). ÇÖZÜMÜ KANITLANDI.**
- `resolveProjectWorkflowAsync` (`@expo/fingerprint/build/ProjectWorkflow.js:41-49`)
  projeyi `generic` sayıyor ancak marker dosyası **varsa ve gitignore'lanmamışsa**.
- **⚠️ `.gitignore`'a `/android` EKLEMEK ÇÖZÜM DEĞİL** — ilk akla gelen buydu ve
  **yanlış**. Workflow'u `managed`'a döndürüyor ama hash'i tabana döndürmüyor,
  çünkü `sourcer/Bare.js:24-33` `bareNativeDir` kaynağını **workflow'a değil
  dizinin varlığına** bakarak ekliyor.
- **Çözüm `.fingerprintignore`** (içine `android/` + `ios/`). Kaynak listede
  kalıyor ama null hash'liyor, fingerprint'e girmiyor.
- **Build ALMADAN kanıtlandı:** sahte bir `android/app/build.gradle` +
  `AndroidManifest.xml` üretilip fingerprint üç senaryoda ölçüldü. Taban
  `798d1817…` (hata logundaki "local machine" değeriyle **birebir aynı**,
  yani reprodüksiyon sadık) · `android/` var + ignore yok → hash değişiyor ·
  `android/` var + `.fingerprintignore` → **tam olarak tabana dönüyor**.
  `.fingerprintignore` tek başına tabanı bozmuyor (kendisi `DEFAULT_IGNORE_PATHS`'te).

**Fark 2 — 7 `node_modules` dizininin `rncoreAutolinkingAndroid` hash'i. AÇIK.**
- Testte `rncoreAutolinking` kaynakları üç senaryoda da 10 adet ve hash'leri
  **hiç değişmedi** → bu fark workflow'dan GELMİYOR. "Tek kök neden" teorisi
  çürüdü.
- Değişen 7 paketin hepsi **New Architecture codegen kullanan RN kütüphaneleri**
  (async-storage, gesture-handler, maps, reanimated, safe-area-context, screens,
  worklets). Hipotez: EAS'te gradle codegen bu paketlerin içine dosya üretiyor;
  `DEFAULT_IGNORE_PATHS` `android/build` ve `.cxx`'i eliyor ama codegen çıktısının
  tamamını elemiyor. Expo paketlerinin listede olmaması destekliyor — onlar
  önceden derlenmiş AAR ile geliyor.
- **KANITLANMADI ve yerelde kanıtlanamaz:** doğrulamak prebuild + gradle
  çalıştırmayı, yani build almayı gerektiriyor.

**Karar: `appVersion`.** Fark 1'i kapatıp Fark 2 için bahse girmek yerine
fingerprint hesabı tamamen devre dışı bırakıldı; runtime = `version` alanı,
yerelde ve EAS'te birebir aynı, ıraksama sınıfı kökten yok oldu. Arkadaş
testinin ortasında olduğumuz için önce **çalışan bir OTA** tercih edildi.
- **Bedeli ve panzehiri:** native değişiklikte runtime artık otomatik dönmüyor →
  **§2'deki sürüm yükseltme ritüeli** bunu karşılıyor.
- **Fingerprint'e dönmek istenirse** gereken iş: `.fingerprintignore` (Fark 1,
  hazır ve kanıtlı) + Fark 2'nin bir build ile teşhisi. Test bittikten sonra
  sakin kafayla ele alınabilir. **Dikkat:** politikayı değiştirmek runtime'ı
  değiştirir ve sahadaki kurulumları OTA'dan koparır — yeni build gerektirir.

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
- **Auth ekranlarına `Button`/`TextField` primitive'i ÇIKARILMADI** (adım 7'de).
  Gerekçe: adım 7'nin hedefi token geçişiydi, primitive çıkarmak ayrı bir iş; tetikleyici
  **üçüncü bir form ekranı** olarak belirlenmişti. **O tetikleyici 2026-08-06'da
  gerçekleşti** (`EditProfile`) ve taşıma 08-07'de tamamlandı — bkz. Bilinen Açık İşler.
  `AuthLayout` ise hâlâ çıkarılmadı: `formCard` + logo lockup'ı iki ekranda tekrar ediyor
  ama ikisi de küçük ve tek kullanımlık; bugün gerçek bir gerekçe yok.
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

**✅ ÇEKİRDEK DÖNGÜ TAMAMLANDI (2026-08-08).** Sırayla inşa edildi, her adım
push + OTA + **gerçek APK'da** doğrulandı, ayrıca arkadaşla **çapraz hesap
testi** geçti:

`EditProfile` → `UserProfile` (+ takip et/bırak) → **ziyaret detayı + beğeni**
→ `FollowersList` → **aktivite akışı** (Ana Sayfa)

Ön koşulu `useAuth`'un Context'e çevrilmesiydi (2026-08-06) — üç yeni ekranın
her birinin aynı yamayı gerektirmemesi için. Veri tarafında iki migration:
**015** (günlük herkese açıldı, sosyal sorguları RPC'siz mümkün kıldı) ve
**016** (`entry_likes`). Akışın mimari kararları ve onu bir kez patlatan
PGRST201 dersi: Mimari Notlar → **Aktivite akışı**.

**Aşağıdaki dört madde ERTELENDİ** — üçü ölçek/veri koşulu bekliyor, biri
(kategori/etiket) kendi başına büyük bir iş. Hiçbiri engelleyici değil.

- **Leaderboard: MEKAN BAZLI ("mekanın kralı") — YÖN DEĞİŞTİ (2026-08-04).**
  Kapsam artık kullanıcı ekseninde (arkadaş/şehir) değil **mekan ekseninde**: her
  mekanın kendi detay sayfasında **"bu mekana en çok gelenler"** sıralaması.
  Foursquare'in *mayor* (belediye başkanı) konsepti — *"Bahçeli McDonald's'ın Kralı"*.
  - **Metrik: `diary_entries`'teki ziyaret sayısı.** `count(*) group by user_id`
    where `place_id = ?`. **Yeni tablo GEREKMİYOR** — veri Faz 2'de zaten birikmeye
    başladı (migration 009).
  - **NEDEN DEĞİŞTİ — eski karar silinmedi, aşağıda duruyor.** Belirleyici sebep
    **kritik kullanıcı kütlesi**: arkadaş/şehir leaderboard'u anlamlı olmak için
    kalabalık ister, oysa mekan bazlısı **iki kişi aynı mekana gittiyse bile**
    anlamlı bir sonuç üretiyor. Bugünkü kullanıcı sayımızda (arkadaş testi, bir
    avuç kişi) şehir/arkadaş modeli boş bir ekran demekti; mekan bazlısı **çok
    daha erken işe yarıyor**. Ayrıca ölçek büyüdükçe bozulmuyor: her mekan kendi
    küçük yarışını taşıyor, yani "global sıralama caydırıcı olur" endişesi
    yapısal olarak hiç doğmuyor.
  - **Doğal yeri `RestaurantDetailScreen`** — ayrı bir ekran/sekme gerekmiyor.
    Bu aynı zamanda referans listesindeki **Beli**'nin mekan sayfası
    leaderboard'uyla birebir örtüşüyor.
  - Metrik suistimale hâlâ açık (kimse ziyareti doğrulamıyor) ama **eskisinden az**:
    yarış tek bir mekanla sınırlı olduğu için şişirmenin getirisi de o mekanla
    sınırlı. Fotoğraflı girişlere ağırlık verme fikri duruyor, Faz 2'nin fotoğraf
    ayağı bitince yeniden değerlendirilecek.
  - **Karar VERİLMEYENLER** (implementasyon başlarken konuşulacak): kaç kişi
    gösterilecek (ilk 3 mi, ilk 5 mi) · beraberlik nasıl bozulacak (ilk ziyaret
    tarihi mi, son ziyaret mi) · `diary_entries` RLS'i **SELECT'te sahiplik
    istiyor** (bilinçli sapma, bkz. Günlük bölümü) — leaderboard başkalarının
    satırlarını saymak zorunda olduğu için **ya politika gevşetilecek ya da
    sayım `security definer` bir RPC'ye alınacak; ikincisi `note` alanını hiç
    sızdırmadığı için tercih edilen yol** · kendi profilinden "kralı olduğum
    mekanlar" gösterilecek mi.
  - **⏸️ ERTELENDİ (2026-08-06) — VERİ YETERSİZ.** Arkadaş testinin birkaç
    günü sonunda kesişim sorgusu **tek satır** döndürdü: 1 mekanda 2 kullanıcı,
    2 giriş — yani **tam beraberlik, henüz bir "kral" bile doğmamış**. Ders:
    birkaç kişinin AYNI mekanda buluşması sanılandan çok daha nadir; 4 kişi 30
    farklı restorana 50 giriş yapıp kesişim sıfır üretebilir. Bu bir
    başarısızlık değil, ölçek meselesi.
  - **🔔 TEKRAR DEĞERLENDİRME TETİKLEYİCİSİ — ayda bir çalıştır:**
    ```sql
    select count(*) as kesisen_mekan,
           count(*) filter (where lider_giris > ikinci_giris) as gercek_krali_olan
    from (
      select place_id,
             max(n) as lider_giris,
             coalesce((array_agg(n order by n desc))[2], 0) as ikinci_giris
      from (select place_id, user_id, count(*) n from diary_entries group by 1,2) t
      group by place_id
      having count(*) > 1
    ) x;
    ```
    **Yeşil eşik: `kesisen_mekan >= 5` VE `gercek_krali_olan >= 3`.**
    İkinci koşul şart: bugünkü tek kesişim tam beraberlik olduğu için
    "beraberlik nasıl bozulacak" sorusu gerçek dağılım görülmeden
    cevaplanamaz — eşiğin amacı tam olarak o dağılımın oluşmasını beklemek.
  - **ESKİ KARAR (2026-07-31 — artık geçerli DEĞİL, kayıt için duruyor):**
    kapsam arkadaş + şehir, global YOK (büyük kullanıcı kütlesinde global sıralama
    motive edici olmaktan çıkıp caydırıcı oluyor); `follows` tablosu zaten var;
    metrik kararı ertelenmişti — "gidilen mekan sayısı" en basit ama en kolay
    suistimal edilen, alternatifleri diary girişi sayısı veya fotoğraflı girişlere
    ağırlık. **Tamamen ölü değil:** arkadaş/şehir leaderboard'u kullanıcı sayısı
    büyüdüğünde mekan bazlının **yanına** eklenebilir; bugün öncelik değil.
- **Kişiselleşmiş öneriler:** ana sayfada öneri satırı. Kullanıcının yüksek puanladığı
  mekanların Google `types` alanlarına bakıp benzer tür mekanlar önerme (içerik tabanlı).
  İşbirlikçi filtreleme kritik kullanıcı kütlesi gerektiriyor, bugün yapılamaz.
- **Şehir değiştirici:** öneri satırındaki şehir tek tıkla değişebilmeli (Ankara → İstanbul).
  Tatil senaryosu için değerli. **Dikkat:** her şehir değişimi yeni Places sorgusu demek —
  `places` tablosunda şehir bazlı cache tutulmazsa maliyet hızla artar.
- **Kategori/etiket bazlı filtreleme — BÜYÜK İŞ, İLERİDE** (fizibilite: 2026-08-06).
  İstek: "burger" araması hem zincirleri hem butik yerleri getirsin, "butik burger"
  yalnızca butikleri. Değerlendirme sonucu **ertelendi**; gerekçeler:
  - **Google verisi YETMİYOR, iki kat.** Kullandığımız **legacy** Places API'nin
    `types` değerleri kaba (`restaurant`/`cafe`/`bar`/`bakery`/`meal_takeaway`/
    `food`) — **mutfak türü yok**, "burger" diye bir tür yok. **Zincir ↔ butik
    ayrımı ise Google'ın HİÇBİR alanında yok**, türetilmesi gerekiyor.
    `places.types` (text[], GIN indeksli, migration 002) var ama bu iş için kaba.
  - **Places API (New)** ~100 granüler tür getiriyor (`hamburger_restaurant` vb.),
    yani mutfak türü sorununu API göçü çözüyor — ama farklı uçlar, farklı yanıt
    şekli, farklı faturalama ve **anahtar kısıtımız legacy'ye ayarlı**. Kendi
    başına orta-büyük bir iş. Etiketleme gündeme geldiğinde **bu göç birlikte
    değerlendirilmeli**.
  - **Zincir tespiti veriden türetilebilir:** aynı ad birden çok `place_id`'de
    tekrar ediyorsa zincirdir. Ama cache'imiz küçük, örneklem yetersiz.
  - **Şema: `places`'e KOLON EKLENMEZ, ayrı `place_tags` tablosu.** `places` bir
    Google cache'i ve `upsert_place` TTL dolunca satırı ÜZERİNE YAZIYOR — kullanıcı
    verisini oraya koymak, düzenli silinen bir yere koymak demek.
  - **⚠️ ARAMAYA "FİLTRE EKLEMEK" DEĞİL, İKİNCİ BİR ARAMA SİSTEMİ.** Bugünkü arama
    Google autocomplete (uzak); etiketler Supabase'de ve yalnızca **daha önce
    görülmüş** mekanlar için var. Google'ın bizim etiketlerimizden haberi yok, yani
    filtrelemek için kendi veritabanımızda aramak gerekir — ve `places` yalnızca
    birinin açtığı mekanları içerdiği için kapsam çok dar olur. Daha az yıkıcı orta
    yol: aramayı olduğu gibi bırakıp **ayrı bir "Kategoriler" gezinme yüzeyi**.
  - **Moderasyon riski fotoğraflardan KESKİN:** kötü bir etiket yalnızca kötü
    görünmez, **arama sonuçlarını herkes için bozar**. Moderasyon mekanizması yok
    (bkz. Genel yayın öncesi düşünülecekler).
  - **İki bağımlılığı var:** kullanıcı kütlesi (etiketleri kim girecek) ve mekan
    kapsamı (cache dolmadan filtre boş görünür). Sırası: sosyal katman → kapsam
    büyüsün → etiketleme + API göçü birlikte.

### Faz 4 — Marka
İsim ve logo. Bilinçli olarak en sona bırakıldı: ürün netleştikten sonra isim bulmak,
boşluğa isim uydurmaktan kolay.

#### 📌 BACKLOG — görsel kimlik için FireVibe (not: 2026-08-07, ŞU AN YAPILMIYOR)
Kullanıcının değerlendirdiği araç: **FireVibe** (firevibe.ai) — prompttan mobil
uygulama ekranı / marka / renk / font üretiyor, React Native'e export edebiliyor.
Not buraya, sırası geldiğinde sıfırdan bağlam kurmak gerekmesin diye düşüldü.

- **Öncelik DEĞİL.** Mevcut işlevsellik tamamlandıktan **sonra** ele alınacak.
- **Kod AKTARILMAYACAK — yalnızca görsel referans.** FireVibe'ın ürettiği
  bileşenler bizim Supabase/navigasyon/state mantığımızı bilmiyor; kodu olduğu
  gibi almak anlamsız. Alınacak şey ekran görüntüsü, renk kodları ve font
  isimleri.
- **Bizim avantajımız hazır:** proje zaten merkezi bir tasarım sistemi kullanıyor
  (`Colors`/`Type`/`Spacing`/`Radius`/`Elevation`, `theme.ts`) ve paylaşılan
  primitive'ler var (`TextField`, `Button`, `Chip`, `SectionHeader`, `RankRow`…).
  Auth ekranları da bu primitive'lere taşındı. Bu yüzden görsel kimlik
  değişikliği büyük ihtimalle **"her ekranı tek tek elden geçirmek" değil,
  çoğunlukla merkezi token dosyalarını güncellemek** olacak — `Palette.green`
  ramp'ini değiştirince beş marka token'ının birlikte dönmesi tam bu amaçla
  kurulmuştu.
- **Yöntem (sırası geldiğinde):** FireVibe'da önce **1-2 ekran için pilot**
  tasarım üret → ekran görüntüsü + varsa renk kodları / font isimleri Claude
  Code'a ver → uygula → **cihazda görsel karşılaştırma** yapıp farkı bildir →
  birkaç turda yakınsa. **Tek seferde birebir eşleşme beklenmiyor**, iteratif
  bir süreç.
- **⚠️ NEYİN OTA GİTTİĞİ, NEYİN BUILD İSTEDİĞİ ÖNCEDEN ÇIKARILDI (2026-08-08).**
  Tam tablo **Bilinen Açık İşler → "Bir sonraki build'in paketi"** altında.
  Özeti: `theme.ts`'in tamamı (renk/tipografi/boşluk) ve uygulama içi splash
  **OTA**; ikon, native splash, **uygulama adı** ve `adaptiveIcon` rengi
  **build**. Fontlar ikiye ayrılıyor — `useFonts` ile çalışma anında yüklenirse
  OTA, config plugin'iyle gömülürse build. Yani bu faz doğal olarak **birkaç
  OTA turu + tek bir build** şeklinde ilerleyecek.

## Bilinen Açık İşler (teknik borç)

> ### ✅ KAPANDI — deep link + Google girişi (2026-08-11, gerçek APK'da DOĞRULANDI)
> **`belieats://auth-callback` ilk denemede çalıştı** (versionCode 5): onay
> maili uygulamayı açıyor ve oturum kendiliğinden kuruluyor, Google girişi de
> uçtan uca çalışıyor. Aşağısı **tarihsel kayıt** — hipotez doğrulandığı için
> siliniyor değil, aynı üç turun tekrar edilmemesi için duruyor.
>
> **🔑 ONAYLANAN HİPOTEZ:** sorun kodda ya da allowlist deseninde değil,
> **Expo Go'nun ürettiği URL BİÇİMİNDEYDİ.** `exp://IP:PORT/--/yol` (portlu,
> `--` segmentli) Supabase tarafından hiçbir desenle kabul edilmedi;
> `belieats://auth-callback` (portsuz, sade — Supabase'in mobil örnekleriyle
> aynı biçim) sorunsuz geçti.
>
> **⚠️ ÇIKARIM:** auth yönlendirme ekseninde **Expo Go ile doğrulama
> YAPILAMAZ**. Bu, "Expo Go'daki ölçüm kanıt değildir" dersinin **üçüncü**
> tekrarı (öncekiler: klavye/pencere davranışı ve arka plandan dönüş).
>
> **Semptom (o gün):** onay bağlantısı da Google girişi de Supabase'in
> **Site URL'ine** (GitHub Pages iniş sayfası) düşüyor, uygulamaya hiç
> dönmüyordu.
>
> **TEŞHİS — kanıtlanan ve elenen:**
> - Site URL'e düşmek, Supabase'in `redirect_to`'yu **kullanmadığı** anlamına
>   geliyor: ya adres mailde yok ya da allowlist reddediyor.
> - **AYIRT EDİCİ TEST (işe yarayan yöntem):** Google girişi **aynı allowlist'i**
>   kullanıyor ama adresi tamamen farklı bir yoldan iletiyor (mail değil,
>   doğrudan istek). Google da düştü → **mail şablonu ve e-posta yolu ELENDİ**,
>   sorun allowlist'te.
> - Üç desen denendi, **üçü de** başarısız: `exp://*/--/auth-callback` ·
>   `exp://**` · ve **jokersiz birebir adres**
>   (`exp://192.168.1.21:8081/--/auth-callback`). Sonuncusunun da tutmaması
>   sorunun **joker sözdiziminde olmadığını** gösteriyor.
> - **Muhtemel sebep (kanıtlanmadı):** Supabase'in Expo Go'nun ürettiği URL
>   biçimini kabul etmemesi — `exp://IP:PORT/--/yol`'da hem port hem tuhaf
>   `--` segmenti var. Supabase'in mobil örnekleri `com.example.app://yol`
>   biçiminde: **portsuz, sade** — yani bizim gerçek adresimizle (
>   `belieats://auth-callback`) aynı şekilde.
> - **Bu yüzden durduk:** doğrulamaya çalıştığımız şey **üretimde hiç
>   karşımıza çıkmayacak bir URL biçimiydi.** CLAUDE.md'nin iki kez yazdığı
>   ders ("Expo Go'daki ölçüm kanıt değildir") üçüncü kez geçerli oldu.
>
> **Geçici teşhis logu** (`src/lib/authRedirect.ts`) doğrulamadan sonra
> **silindi**; dosyada yalnızca bulgunun yorumu kaldı.
>
> ### 🧹 YAPILACAK (küçük, panel işi): `exp://` satırlarını sil
> Supabase → Authentication → URL Configuration → Redirect URLs'te
> **`exp://…` ile başlayan satırlar** duruyor. Artık **tamamen ölü**:
> hiçbiri çalışmadı ve `react-native-keyboard-controller` eklendiğinden beri
> proje Expo Go'da zaten açılmıyor. Silinmeli — geliştirmeye özel bir
> allowlist deliğini açık bırakmanın karşılığı yok.
> **Kalması gereken tek satır:** `belieats://auth-callback`.
>
> **YAN BULGU — PKCE `plain`'e düşüyor.** Konsolda her auth çağrısında:
> `WebCrypto API is not supported. Code challenge method will default to use
> plain instead of sha256.` RN'de `crypto.subtle` yok. **Akışı bozmuyor** ve
> asıl korumayı da kaldırmıyor (yönlendirmeyi yakalayanın eline yalnızca
> `code` geçiyor, doğrulayıcı o kanaldan hiç geçmiyor); zayıflattığı senaryo
> saldırganın **ilk isteği de** görebildiği durum. `expo-crypto` ile polyfill
> edilebilir — **ayrı ve düşük öncelikli** bir iş.
>
> ### ⏸️ ProfileScreen'de kaydırmalı sekme — ERTELENDİ (2026-08-11)
> `FollowersList` kaydırmalı oldu (`react-native-pager-view` 6.9.1, **Expo
> Go'da var**). `ProfileScreen` bugünkü haliyle kaldı.
> - **Sebep, ekranların yapısal farkı:** `FollowersList`'te başlık ve sekmeler
>   zaten listenin dışında sabit. `ProfileScreen`'de TEK bir `FlatList` var ve
>   `ProfileHeader` `ListHeaderComponent` olarak **içerikle birlikte kayıyor**
>   (bilinçli Instagram davranışı) — yan yana üç bağımsız liste "çöken başlık"
>   problemini doğuruyor.
> - **Yeni bilgi:** o problemin kütüphanesi `react-native-collapsible-tab-view`
>   ve **ana deponun Reanimated 4 desteği DOĞRULANAMADI** (bizde `~4.1.1`).
>   v4'ü açıkça destekleyen tek şey tek kişilik bir topluluk fork'u
>   (`@mstfmedeni/collapsible-tab-view`).
> - **Karar:** build'in hemen öncesinde, zaten doğrulanmamış iki özellik
>   varken en çok kullanılan ekranı riske atmıyoruz. Build'den sonra kendi işi
>   olarak, Reanimated 4 uyumluluğu düzgün araştırılarak ele alınacak.
> - Bugün **iki ekranda his farklı** — bilinen ve kabul edilen bedel.
>
> ### ✅ KAMERA İZNİ — build'e bağlı DEĞİLMİŞ (düzeltme, 2026-08-11)
> Bir dönem burada *"kamera CAMERA izni ister → manifest → ayrı build"*
> yazıyordu. **YANLIŞ.** `expo-image-picker` **kendi AndroidManifest'inde**
> `android.permission.CAMERA`'yı ilan ediyor
> (`node_modules/expo-image-picker/android/src/main/AndroidManifest.xml`) ve
> kütüphane autolink edildiği için izin **versionCode 4'ten beri APK'da**.
> - **Sonuç:** kamera + galeri **"+" menüsü** (istek: 2026-08-11) tamamen
>   **OTA ile gidebilir**, park edilen fotoğraf işinin parçası.
> - **Yöntem notu:** izin ekleme bir **prebuild mod'u**, yani
>   `npx expo config` çıktısında GÖRÜNMÜYOR. `expo config`'e bakıp "izin yok"
>   sonucuna varmak yanlış olur — kanıt kütüphanenin kendi manifest'inde.
> - `app.json`'a `expo-image-picker` plugin'i yine de kaydedildi, ama
>   **kamera için değil**: kütüphane `RECORD_AUDIO`'yu ilan etmiyor ancak
>   plugin `microphonePermission` verilmezse onu **ekliyor**. `false` yazmak
>   `blockedPermissions`'a koyuyor — kütüphane sürümü değişse bile mikrofon
>   izni sızmıyor. Yanında iOS izin metinleri Türkçe olarak yerleşiyor.
>
> ### 📦 PARK EDİLDİ: kullanıcı engelleme (2026-08-11)
> **Takipçi çıkarma kısmı KAPANDI** (migration 019, sahada doğrulandı) —
> detay: Mimari Notlar → **Takipçi çıkarma**. Kalan iş engelleme.
> - **BUILD GEREKMİYOR** — migration + RLS + arayüz, OTA ile gider.
> - **Maliyeti tabloda değil**, `blocks`'tan haberdar edilmesi gereken **her
>   okuma yolunda**: aktivite akışı, profil, takipçi listeleri, beğeniler,
>   fotoğraflar, leaderboard. Artı ürün kararları (engellenen profili
>   görebilir mi · mevcut takip ne olacak · çift taraflı mı).
> - 🚩 **`blocks` DÖRDÜNCÜ ARA TABLO olur** (`follows`, `entry_likes`,
>   `photo_reports` ile birlikte): iki FK, ikisi de `profiles`'a, bileşik PK —
>   tanıma birebir uyuyor. PGRST201 kuralı geçerli, ayrıştırma **aynı diff'te**.
> - ⚠️ **Takipçi çıkarma engellemenin YERİNE GEÇMİYOR** ve arayüz bunu açıkça
>   söylüyor ("Dilerse tekrar takip edebilir"). Engelleme geldiğinde o metin
>   yeniden değerlendirilmeli.
>
> ### ✅ KAPANDI: fotoğrafların incelemeye bağlanması (2026-08-13)
> Aşağıdaki park kaydı **tarihsel**; iş bitti ve sahada. Sonuç ilk istekten
> FARKLI ve daha iyi: dokunuş "ilgili incelemeyi açmak" yerine **fotoğrafı tam
> ekran açıyor, bilgi fotoğrafın üstündeki şeritlerde** duruyor (kullanıcı
> kararıyla tersine çevrildi). Detay: Mimari Notlar → **`PhotoViewer`**.
>
> **✅ `authorPhotos` filtresi de KAPANDI (2026-08-13).** Ziyaret detayı artık
> `entry_id === entryId` ile süzüyor, başlık **"Bu ziyaretten fotoğraflar"**,
> boşsa bölüm hiç çizilmiyor, `usePlaceRankings` o ekrandan kalktı (ziyaret
> detayı başına bir sorgu eksildi). Migration gerekmedi.
>
> **🔑 KARARIN GEREKÇESİ SAYIYA DEĞİL ÜRÜN NİYETİNE DAYANDI — ve bu bir
> yöntem dersi.** Önce "bağsız fotoğraf oranı yüksekse iki grup göster"
> şeklinde sayı bazlı bir kural önerilmişti; kullanıcı veritabanındaki 14
> fotoğrafın neredeyse tamamının **test verisi** olduğunu söyleyince kural
> geçersiz kaldı — dayanağı gerçek kullanım oranıydı ve eldeki veri onu
> temsil etmiyordu. Daha kötüsü, kural **iki yorumda zıt sonuç veriyordu**:
> bağsız fotoğraflar *eski veri* ise oran yükseldikçe "iki grup" doğrulanır,
> ama *kalıcı bir kategori* ise oran yükseldikçe "iki grup" KÖTÜLEŞİR.
> - **Belirleyici oldu: bağsız fotoğraf KALICI bir kategori.** "Puanı Kaydet"
>   ve ızgaranın "Menü/Yemek ekle" yolları onu üretmeye devam ediyor ve
>   etmeli. Menü fotoğrafı bir ziyaret anısı değil **mekana yapılan katkı** —
>   fotoğraf özelliğinin varlık sebebi de bu (Faz 2: *"Beli'deki en beğenilen
>   özellik kullanıcı çekimi menü fotoğrafları"*). Tür taksonomisi de söylüyor:
>   `food`/`venue` bir ziyarete oturur, **`menu` oturmaz**.
> - Ayrıca "Puanlama ile günlük arasındaki iş bölümü" kararı puanlamayı **asıl
>   ve daha sık** yol ilan ediyor; bu oturumda "Puanı Kaydet"e fotoğraf
>   eklenmesi de bağsız yolu bilerek genişletti.
> - **Reddedilen "Bu ziyaretten / Bu mekandan diğerleri" ikili gruplaması:**
>   yanlış değil, **yanlış ekran**. İkinci grubun evi mekan sayfasının dört
>   sekmeli ızgarası; ziyaret sayfasına sekmesiz bir kopya olarak taşımak o
>   sayfanın tek konusunu boğardı ve oran yükseldikçe kötüleşirdi.
> - **Reddedilen kaçış yolu:** *"bu ziyaretin fotoğrafı varsa onları göster,
>   yoksa mekandakilere düş."* Aynı bölüm bazen bir şeyi bazen başkasını
>   gösterirdi — migration 011'de "kullanıcıya açıklanamaz" diye reddedilen
>   sınıfın aynısı.
> - **Backfill YAPILMADI ve yapılmamalı:** hangi eski fotoğrafın hangi
>   ziyarete ait olduğu bilinemez; `created_at` yakınlığı tahmin olurdu (aynı
>   güne birden çok ziyaret girilebiliyor).
>
> **⬜ YENİ AÇIK İŞ — puan kaydının fotoğrafları hiçbir okuma görünümünde yok.**
> "Puanı Kaydet" ile yüklenen kareler (`entry_id` boş) yalnızca mekan
> sayfasının ızgarasında yaşıyor; puanın okuma görünümü olan
> `RankingReviewSheet` **fotoğraf göstermiyor**. Ziyaret tarafında simetrisi
> var (ziyaret detayı kendi fotoğraflarını gösteriyor), puan tarafında yok.
> - **Bugün bir hata üretmiyor** — fotoğraflar kayıp değil, mekan sayfasında
>   duruyorlar. Bu yüzden kapsam dışı bırakıldı.
> - Yapılırsa: sheet'e `place_photos`'tan `user_id + place_id` eşleşen ve
>   `entry_id`'si BOŞ kareler; `usePlacePhotos` zaten bu veriyi getiriyor ama
>   sheet'in elinde yok (parametreyle besleniyor, sorgu atmıyor) — yani asıl
>   soru "sheet sorgu atmalı mı" ve bu onun **anlık görüntü kuralını** deler.
>   Küçük ama düşünülmesi gereken bir tasarım kararı.
>
> ---
> **(Tarihsel) 📦 PARK EDİLDİ: fotoğrafların incelemeye bağlanması (2026-08-11)**
> İstek: fotoğraflar mekan sayfasından değil, **ziyaret/inceleme yazarken**
> eklensin; mekanın fotoğraf sekmesinde görünsün, dokununca ilgili inceleme
> açılsın (Hepsiburada deseni).
> - **BUILD GEREKMİYOR** — doğrulandı: `expo-image-picker` (17.0.11),
>   `expo-image-manipulator` (14.0.8), `expo-file-system` (19.0.23) **zaten
>   kurulu ve binary'de**. İş = migration (`place_photos`'a `entry_id`) + JS
>   yeniden bağlama. OTA ile gider.
> - 🚩 **Planlarken İLK bakılacak yer PGRST201.** `entry_id` eklemek `places`
>   ile `diary_entries` arasında ikinci bir yol açıyor. `place_photos`'ın kendi
>   `id` PK'sı olduğu için "ara tablo" tanımına birebir uymuyor (muhtemelen
>   tetiklenmez) ama bu sınıf sahada **iki kez** kırdı — kontrol zorunlu:
>   `grep -rn -A6 "from('diary_entries')" src/ | grep "places("`
>   (**`-A6` şart** — bağlamsız grep sahte "temiz" verir, bkz. PGRST201 bölümü)
>   Şüpheliler: `useDiary`, `useActivityFeed`, `usePlaceVisits`. Migration ile
>   istemci düzeltmesi **aynı diff'te** gitmeli.

> ### 📦 BUILD 2'NİN PAKETİ — Build 1 ile altı maddenin dördü kapandı
> Build 1'de gitti: **keyboard-controller** (native taraf) · **kaydırmalı
> sekmeler** · **`expo` yama farkı** · **deep link + Google girişi**.
>
> **Kalan iki madde, ikisi de acil değil:**
> 1. **`fingerprint` `runtimeVersion`'a dönüş** (Dağıtım §9). `.fingerprintignore`
>    hazır ve kanıtlı (Fark 1); kalan iş **Fark 2'nin bir build ile teşhisi**.
>    Build 1'e bilinçli alınmadı — o build Fark 2'yi besleyen kategoriden
>    (New Architecture codegen) **iki paket ekliyordu**. Arkadaş testi bitince
>    kendi başına ele alınacak.
> 2. **Faz 4 marka görsellerinin NATIVE tarafı** — aşağıdaki tabloda
>    (ikon, native splash, uygulama adı, `adaptiveIcon` rengi).
>
> ⚠️ Build alınırken **§2'deki sürüm yükseltme ritüeli** ihmal edilmemeli:
> `versionCode` +1 her zaman, `version` +1 native değişiklik varsa. Kalan iki
> maddenin **ikisi de** native değişiklik. Ayrıca 1. madde `runtimeVersion`
> politikasını değiştirdiği için sahadaki kurulumları OTA'dan koparır.
>
> ### 🚀 OTA İLE GİDEBİLECEK BİRİKMİŞ İŞLER (build beklemiyor)
> Sıradakilerin hepsi saf JS ve/veya migration:
> - **Fotoğraf akışının yeniden tasarımı + kamera/galeri "+" menüsü**
>   (bu listede, park edilmiş). **Sıradaki en büyük kullanıcı değeri.**
> - **Kullanıcı engelleme** (bu listede, park edilmiş — kendi planını istiyor).
> - **`ProfileScreen`'de kaydırmalı sekme** (bu listede, ertelenmiş).
> - **keyboard-controller'ın KALAN ekranlara uygulanması** — ⚠️ *ölçülmüş
>   sorunu olan ekran kalmadı.* `ForgotPassword` taşındı çünkü orada gerçek
>   bir kırpılma vardı; `Login`/`Register`/`EditProfile`/`ListForm`/
>   `DiaryEntrySheet` gerçek APK'da tek tek kontrol edildi ve **sağlamdı**.
>   Sorunu olmayan ekrana dokunmak bu projede bir kez ekranı tamamen
>   boşaltmıştı — **tetikleyici yeni bir ölçüm olmalı**, tutarlılık isteği
>   değil.
> - **PKCE `plain` polyfill'i** (`expo-crypto`), düşük öncelik.
>
> ### 🎨 Marka işi: neyin OTA gittiği, neyin build istediği (tespit: 2026-08-08)
> `app.json` ve `app.config.js` okunarak çıkarıldı, tahmin değil. Faz 4'e
> girmeden bu ayrım bilinmeli — yoksa "renkleri değiştirdik ama ikon eski
> kaldı" sürprizi çıkar.
>
> **OTA ile gider (saf JS):** `theme.ts`'in tamamı — `Palette`/`Colors`,
> `Type`'ın 8 rolü, `Spacing`, `Radius`, `Elevation` · tüm ekran düzenleri ·
> **uygulama içi splash** (`RootNavigator.tsx`'teki `SplashScreen` bileşeni,
> oturum çözülürken görünen logo lockup'ı).
>
> **Build ister (`expo prebuild` native projeye gömüyor):**
> | `app.json` alanı | Ne |
> |---|---|
> | `icon` | Launcher ikonu |
> | `android.adaptiveIcon.foregroundImage` | Uyarlanabilir ikon ön katmanı |
> | `android.adaptiveIcon.backgroundColor` | **`#22C55E` — marka yeşili BURADA DA sabit** |
> | `splash.image` / `splash.backgroundColor` | **Native** açılış ekranı |
> | `name` | **"Beli Eats" — launcher'daki ad, Faz 4'ün göbeği** |
> | `userInterfaceStyle` | `light` |
>
> ⚠️ **TUZAK — marka rengi İKİ yerde yaşıyor.** `theme.ts`'ten OTA ile
> değiştirirsen `adaptiveIcon.backgroundColor` eski yeşilde kalır. Biri OTA'ya
> açık, diğeri değil.
>
> **⚠️ ÖZEL FONTLAR — cevap "duruma göre", seçim bize ait:**
> | Yol | OTA? |
> |---|---|
> | Çalışma anında `useFonts` (`.ttf` bir Metro asset'i) | ✅ Evet |
> | `plugins: [["expo-font", { fonts: [...] }]]` ile native'e gömme | ❌ Build |
>
> Bugün **hiçbiri kullanılmıyor**: `expo-font@~14.0.12` bağımlılık olarak
> duruyor (§5.1'deki çökme düzeltmesinden kalma) ama kodda tek bir
> `useFonts`/`loadAsync` yok ve `plugins` listesinde `expo-font` yok. Font
> eklemek sıfırdan bir karar. Bedeli: çalışma anında yükleme bir yükleme
> durumu getiriyor — doğal yeri mevcut JS splash'i.
>
> **PRATİK SONUÇ — marka işi doğal olarak İKİ AŞAMALI:** (1) renk/tipografi/
> boşluk OTA turlarıyla, FireVibe iterasyonu tam buraya oturuyor; (2) ikon +
> native splash + uygulama adı tek bir build'de. ⚠️ Arada **görünür bir
> uyumsuzluk penceresi** var: yalnızca OTA gidilirse kullanıcı eski marka
> splash'inden yeni marka uygulamaya düşer. Kısa süre katlanılır, kalıcı
> bırakılmaz.

- **Kaydırmalı sekme geçişi (swipe) — BİR SONRAKİ BUILD'E ERTELENDİ
  (araştırma: 2026-08-07).** İstek: profil sekmeleri (Sıralamam/Günlük/
  Listeler) ve takipçi sekmeleri arasında sağa/sola kaydırarak geçiş.
  **`react-native-pager-view` veya benzeri (`react-native-tab-view`,
  `react-native-collapsible-tab-view`) — bir sonraki build'de
  `react-native-keyboard-controller` ile BİRLİKTE değerlendirilecek.**
  Araştırma yapıldı, sıfırdan tekrarlanmasın:
  - **`SegmentedTabs`'e EKLENEMEZ.** O bileşen yalnızca sekme ŞERİDİNİ
    çiziyor; içeriği ebeveyn render ediyor. Kaydırma içeriği hareket ettirmek
    demek, dolayısıyla jest içeriğin yaşadığı yerde olmak zorunda. Şeride
    koyulsa şerit kayardı, listeler değil.
  - **Native bağımlılık ŞART DEĞİLDİ:** `react-native-gesture-handler`
    (2.28.0) ve `react-native-reanimated` (4.1.1) **zaten kurulu ve
    binary'de**. Yani "kaydır → sekme değiştir" (parmağı takip etmeyen fling)
    saf JS ile yazılabilir ve **OTA ile gidebilirdi**. **Bilinçli olarak
    REDDEDİLDİ:** kullanıcı gerçek sayfa kaydırma hissini istiyor, fling
    davranışı veriyor ama hissi vermiyor.
  - **ASIL MALİYET `ProfileScreen`'in KAYAN BAŞLIĞI.** `ProfileHeader`
    `ListHeaderComponent` olarak veriliyor, yani içerikle birlikte dikey
    kayıyor (Instagram davranışı, bilinçli). Gerçek sayfa kaydırma için yan
    yana üç bağımsız dikey liste gerekiyor ama hepsinin TEK başlığı
    paylaşması lazım — bu "çöken başlık + sekme görünümü" problemi, o
    kütüphanelerin var olma sebebi. Elle çözmenin üç yolu da bedelli: başlığı
    sabitle (doğrulanmış kararı bozar), her sayfada başlığı tekrarla (sekme
    değişince başlık zıplar), ya da kütüphane ekle (build).
  - **`FollowersListScreen` UCUZ** — başlık ve sekmeler zaten sabit, altında
    tek liste. İstenirse tek başına daha erken yapılabilir; iki ekranda iki
    farklı his oluşacağı için önerilmedi.
  - **Tetikleyici:** bir sonraki build. Tek bir özellik için build almak
    yerine `keyboard-controller` ile aynı build'e binmesi bekleniyor.
- **`user_rankings` ile `diary_entries` arayüzde HİÇ BULUŞMUYOR — iki boşluk
  (analiz: 2026-08-07).** Tetikleyici soru: *"Sıralamam satırı da Ziyaret
  detayına gitsin mi?"* Cevap **hayır** ve gerekçesi kayda değer.
  - **İKİSİ AYRI KAVRAM, EŞLEŞME YOK.** `user_rankings` mekan başına TEK satır
    (`unique(user_id, place_id)`), `diary_entries` sınırsız. Aralarında **bağ
    kolonu yok** ve `upsert_user_ranking` `diary_entries`'e hiç dokunmuyor.
  - **Belirleyici nokta:** sıralama kaydı **günlük girişi olmadan**
    oluşabiliyor — mekan sayfasındaki "Puanı Kaydet" yalnızca `user_rankings`
    yazıyor. Yani bir sıralama satırının karşılığı **0, 1 veya N** giriş.
    "En yenisine git" keyfi olurdu; bu proje aynı belirsizliği bir kez
    reddetti (migration 011, *"bazen günceller bazen güncellemez —
    kullanıcıya açıklanamaz"*).
  - **Mevcut hal DOĞRU:** `RestaurantDetailScreen` sıralama kaydını zaten
    yüklüyor, puanı ve `review_text`'i forma dolduruyor. Yani sıralamanın
    doğal detay sayfası **zaten mekan sayfası**. Günlük girişi ayrı ekran
    gerektirdi çünkü onun yaşadığı yer hiçbir ekranda yoktu.
  - **BOŞLUK 1 — `review_text`'in okuma görünümü yok.** Yazılan yorum yalnızca
    satırdaki kırpılmış halde ve düzenleme formunun içinde görünüyor; tam
    metni okumak için forma girmek gerekiyor. Başkasının profilinde de aynı.
  - **BOŞLUK 2 — mekan sayfası kullanıcının O MEKANA ait ziyaretlerini
    göstermiyor.** "Bu mekana 3 kez gitmişsin" bilgisi hiçbir yerde yok; iki
    kavram veritabanında `place_id` ile bağlı ama arayüzde hiç buluşmuyor.
  - ✅ **BOŞLUK 2 KAPANDI (2026-08-08, cihazda doğrulandı):** mekan sayfasına
    **"Senin Ziyaretlerin"** bölümü eklendi. Detay: Mimari Notlar → aynı adlı
    bölüm.
  - ✅ **BOŞLUK 1 DE KAPANDI (2026-08-08, cihazda doğrulandı)** — ama
    **buradaki eski "ikisini birden kapatır" notu YİNE DE YANLIŞTI** ve bu
    kayda değer: "Senin Ziyaretlerin" onu kapatmadı, **ayrı bir iş** kapattı.
    İkisi farklı kolonlar (`note` ↔ `review_text`), farklı işler.
    - **Teşhis, tahmin edilenden büyüktü:** başkasının sıralama satırına
      dokununca mekan sayfası açılıyordu ve o ekran **HER ZAMAN oturum
      sahibinin** kaydını yüklüyor (`useRankings(user?.id)`). Yani kullanıcı
      "onun yorumunu okuyorum" sanırken **kendi yorumunu** görüyordu.
    - **Projenin bir kez düzelttiği hatanın ikiziydi:** günlük satırları da
      bir dönem mekan sayfasına gidiyordu, gerekçe birebir aynıydı
      (*"kullanıcı o kişinin ne düşündüğünü görmek istiyordu"*) ve
      `DiaryEntryDetail` ile düzeltilmişti. Sıralama tarafı atlanmıştı.
    - **Çözüm: `RankingReviewSheet`** — puan + TAM yorum + "Mekan sayfasına
      git". Detay: Mimari Notlar → aynı adlı bölüm.
- ~~İSİMLENDİRME GERİLİMİ: iki ayrı "yorum" alanı var~~ — **BÜYÜK ÖLÇÜDE
  ÇÖZÜLDÜ (2026-08-07).** `user_rankings.review_text` ve `diary_entries.note`
  ikiliği bir belirsizlik sanılıyordu; ürün kararıyla **kasıtlı bir iş
  bölümü** olduğu netleşti (bkz. Mimari Notlar → "Puanlama ile günlük
  arasındaki İŞ BÖLÜMÜ"): `review_text` = mekan hakkındaki genel görüş,
  `note` = o ziyarette olanlar. **Birleştirilmeleri gerekmiyor**, yani veri
  migration'ı da gerekmiyor. Kalan tek soru arayüzün bu ayrımı yeterince
  anlatıp anlatmadığı — bugün somut bir hata üretmiyor.
- **⚠️ EXPO GO ARTEFAKTI — BU BELİRTİYİ TEKRAR KOVALAMA (2026-08-06).**
  Belirti: form ekranında klavye açıkken uygulamayı arka plana atıp geri
  dönünce **sekme çubuğu kayboluyor, kaydırma hiç çalışmıyor, yazılan satır
  klavyenin altında kalıyor.** Expo Go'da **her seferinde** tekrar üretildi.
  - **GERÇEK APK'DA HİÇ OLUŞMUYOR** — kurulu versionCode 4 üzerinde "Yeni
    Liste" formuyla 3 kez denendi, hiçbir sorun yok. Belirti Expo Go'nun
    penceresine özgü.
  - **Sebep sınıfı:** Expo Go **bizim Activity'miz değil.**
    `softwareKeyboardLayoutMode` native manifest ayarı ve Expo Go kendi
    manifest'iyle çalışıyor, yani `app.json`'daki değer Expo Go'da **hiç
    uygulanmıyor**. Ayrıca uygulama Expo Go'nun içinde çalıştığı için ana
    ekrandan ikonla dönülemiyor, yalnızca görev değiştiriciden dönülüyor —
    Android'in pencere durumunu geri kurma yolu farklı.
  - **DERS: klavye/pencere davranışı Expo Go'da KANITLANMAZ.** Bu eksende bir
    şey doğrulanacaksa **gerçek APK** gerekiyor. Bu tur, bir belirtiyi Expo
    Go'da ölçüp gerçek sanmak yüzünden iki tur kaybettirdi.
  - Bunu önlemek için yazılan `useDismissKeyboardOnResume` hook'u (dönüşte
    `Keyboard.dismiss()`) **SİLİNDİ**: var olmayan bir hatayı önlüyordu ve
    karşılığında her dönüşte klavyeyi kapatan gerçek bir davranış değişikliği
    getiriyordu.
- **Klavye/edge-to-edge katmanı — üç açık iş (2026-08-06).** Tam teşhis
  `EditProfileScreen`'in `KeyboardAvoidingView` ve `content` yorumlarında;
  buradaki liste yalnızca kalanı hatırlatıyor.
  1. **`react-native-keyboard-controller`'a geçiş — BU SINIFIN DOĞRU CEVABI.**
     IME ölçülerini `WindowInsets`'ten doğrudan okuyor; hem `KeyboardAvoidingView`'ın
     edge-to-edge altında yanlış hesaplamasını hem arka plandan dönüş senaryosunu
     kökten çözüyor. **Bugün YAPILMADI çünkü native bağımlılık: OTA ile gidemez,
     yeni build + `version` yükseltme ritüeli gerektirir** ve arkadaş testinin
     ortasındayız. **Tetikleyici: bir sonraki build gerektiğinde birlikte
     değerlendir.** Geçilirse bugünkü iki yama da (KAV'ın Android'de açık
     bırakılması, kaydırma payı) yeniden değerlendirilmeli — o kütüphane iki
     ortam farkını da ortadan kaldırıyor.
  2. ~~`ListFormScreen`, `LoginScreen`, `RegisterScreen` kaydırma payı
     istiyor~~ — **KAPANDI (2026-08-07): gerek OLMADIĞI doğrulandı, kod
     değişmedi.** Planlanmış bir "Diff 3" vardı, **iptal edildi**:
     - `RegisterScreen` zaten `paddingVertical: Spacing['3xl']` taşıyor, yani
       altta 40px pay var (`EditProfile`'ın 48'inin pratik eşdeğeri) + `ScrollView`'ı var.
     - `ListFormScreen` kısa (başlık + açıklama + anahtar); klavye açıkken
       içerik görünür alandan kısa kalıyor, kaydırma gerekmiyor.
     - `LoginScreen`'de **`ScrollView` yok** ve tek gerçek risk buydu →
       **gerçek APK'da kontrol edildi**: klavye açıkken iki alan da ve "Giriş
       Yap" butonu **tam görünüyor**. Yalnızca logonun en üstü hafif kırpılıyor,
       kullanımı etkilemiyor.
     - **Auth ekranlarında sekme çubuğu YOK** (auth stack tab navigator'ın
       dışında), yani `EditProfile`'daki 68px'lik mesele orada hiç doğmuyor.
     **Karar yöntemi kayda değer:** ölçüm aleti eklemek yerine **gerçek APK'da
     gözle kontrol** edildi — production'daki giriş ekranı yeni haliyle görsel
     olarak birebir aynıydı (stiller byte-byte aynı), yani kontrol geçerliydi.
     Ölçülmüş bir sorun yokken dolgu eklemek, bu turda bir kez ekranı tamamen
     boşaltan hatanın aynısı olurdu.
  3. **Form ekranlarında sekme çubuğu gizlensin mi — KARAR VERİLMEDİ.**
     `EditProfile`/`ListForm` `presentation: 'modal'` ama Android'de bu yeni
     pencere açmıyor, yalnızca stack içi sunumu değiştiriyor → sekme çubuğu
     görünmeye devam ediyor ve kullanıcı yarım formu bırakıp sekme değiştirebiliyor.
     Gizlemek forma ~68px de kazandırır (ölçüldü: sekme çubuğu tam o kadar).
     Ayarın iç içe navigatörde **tab tarafına** yazılması gerekiyor, yani kendi
     regresyon yüzeyi var. **Tek başına kaydırma sorununu ÇÖZMÜYOR** — ölçüm:
     +68px kaydırma payını 195'e çıkarır, gereken ~220.
- ~~Sekme çubuğu ile sistem navigasyon çubuğu iç içe~~ — **KAPANDI (2026-08-04),
  cihazda DOĞRULANDI** (iki navigasyon türünde de kontrol edildi). Arkadaş
  testinden gelen ilk geri bildirimdi (2026-08-03). Teşhis kayıt için duruyor;
  özellikle "eski hipotez tam ters yöndeydi" notu tekrar aranmasın diye.
  Alt sekme çubuğu (Ana Sayfa/Ara/Harita/Profil)
  ile telefonun **üç butonlu klasik Android navigasyonu** arasında boşluk yoktu.
  - **Geliştirme cihazında HİÇ görülmedi** — o telefon **jest tabanlı (kaydırmalı)
    navigasyon** kullanıyor. Sorun cihaza değil **navigasyon türüne** bağlıydı;
    bu ayrım teşhisin can alıcı noktası oldu.
  - **⚠️ ESKİ HİPOTEZ YANLIŞTI — hem de tam TERSİ yönde.** Buraya
    *"üç butonlu navigasyonda `insets.bottom` 0 geliyor, taban `Spacing.sm`
    yetmiyor"* diye yazılmıştı. Gerçek bunun tersi: `insets.bottom` 3 tuşlu
    navigasyonda **en BÜYÜK** değeri alıyor (~48dp). Kodda o varsayımı taşıyan
    `TAB_BAR_MIN_BOTTOM_PADDING` yorumu **edge-to-edge ÖNCESİ bir dünyadan**
    kalmaydı ve SDK 54'te geçerliliğini yitirmişti.
  - **Kanıt (statik, build almadan):** Expo SDK 54'te edge-to-edge **varsayılan
    olarak açık** ve Android 16 / API 36 artık kapatılmasına izin vermiyor.
    Projede `android.edgeToEdgeEnabled` hiç yazılmadığı için prebuild-config onu
    `raw !== false` ile **true** yapıyor —
    `@expo/prebuild-config/build/plugins/unversioned/edge-to-edge/withEdgeToEdge.js`
    (`node_modules` içinde okundu; `@expo/config-types` alanı zaten
    *"Default to true"* + `@deprecated` işaretli). Edge-to-edge'te pencere sistem
    çubuklarının ALTINA uzanıyor, yani `insets.bottom` sıfır değil sistem
    çubuğunun **gerçek yüksekliği**: 3 tuşlu ~48dp, jest ~16-24dp.
  - **Asıl mekanizma:** `Math.max(insets.bottom, 12)` tabanı bu yüzden **hiç
    devreye girmiyordu** — iki modda da sonuç düpedüz `insets.bottom` oluyordu.
    `paddingBottom === insets.bottom` ise sekme içeriğini sistem çubuğunun tam
    tepesine, **sıfır boşlukla** oturtuyor. Jest navigasyonunda o 24dp'nin
    neredeyse tamamı boş olduğu için boşluk varmış gibi görünüyor; 3 tuşlu
    navigasyonda o 48dp'nin tamamı buton olduğu için etiketler butonlara bitişik
    çıkıyor. Semptomun navigasyon türüne bağlı olmasının sebebi tam olarak bu.
  - **`@react-navigation/bottom-tabs@7` kendi varsayılanında da aynı formülü
    kullanıyor** (`BottomTabBar.tsx:378` → `paddingBottom: insets.bottom`,
    `getTabBarHeight` → `TABBAR_HEIGHT_UIKIT + inset`). Yani `tabBarStyle`
    override'ını **silmek bug'ı ÇÖZMEZ**, aynı formüle geri döner. Eksik olan
    şey inset'in kendisi değil, üstüne eklenecek nefes payı.
  - **Düzeltme: `max()` değil TOPLAMA** →
    `bottomPadding = insets.bottom + TAB_BAR_BOTTOM_GAP` (`Spacing.xs` = 8).
    Ölçülen inset ne olursa olsun doğru, yani "önce ölç" uyarısının istediği
    güvenceyi formülün kendisi veriyor: jest 24→32, 3 tuşlu 48→56, inset 0 ise 8.
    Bir türe yaranıp diğerini bozmuyor.
  - **Kod tabanının geri kalanı zaten bu deseni kullanıyordu**: `MapScreen:630`
    ve `RestaurantDetailScreen:328` ikisi de `insets.top + Spacing.sm` yazıyor.
    `max()` kullanan tek yer sekme çubuğuydu — tutarsızlık da oradaydı.
  - **Doğrulama notu:** hipotez `node_modules`'teki gerçek kaynaklardan
    okunarak kuruldu, tahminle değil. Görsel doğrulama kullanıcıda: **aynı
    cihazda** Ayarlar → Sistem → Sistem navigasyonu ile iki mod arasında geçilip
    ikisi de kontrol edilmeli (APK build'i gerekmiyor, Expo Go yeterli).
    **Ders: navigasyon türü artık her görsel geri bildirimde sorulacak bir
    değişken** — tek modda test etmek bu sınıfı yakalamıyor.
- ~~**Auth / kayıt akışında dört açık iş (a–d).**~~ → **HEPSİ KAPANDI
  (2026-08-09)** ve e-posta onayı **açıldı**. Altı maddenin tamamı, üç panel
  altyapı parçası (SMTP/Site URL/Redirect URLs) ve **alan adı → spam** uyarısı:
  Mimari Notlar → **Auth / kayıt akışı**.
  - ⚠️ **Kalan tek iş oradan doğuyor:** onay bağlantısı uygulamayı AÇMIYOR,
    web sayfasına iniyor. Deep link + otomatik giriş **build gerektiriyor** ve
    build paketinin 6. maddesi.
- ~~`useAuth` Context'e çevrilmeli~~ — **KAPANDI (2026-08-06), Expo Go'da
  13 testle DOĞRULANDI.** Faz 3'ün ÖN KOŞULU olarak yapıldı: o faz en az üç
  yeni ekran getiriyor (`UserProfile`, `FollowersList`, `EditProfile`) ve
  refactor olmadan her biri aynı yamayı gerektirecekti.
  - **Neydi:** `useAuth` düz bir hook'tu, her çağıran kendi `useState` +
    `getSession()` + `onAuthStateChange` örneğini kuruyordu. **10 çağrı
    noktası** vardı (dört ekran, iki modal bileşeni, iki auth ekranı,
    `RootNavigator`, liste formu), yani açılışta 10'a kadar ayrı oturum
    sorgusu ve 10 abonelik.
  - **Asıl zarar performans değil YARIŞTI:** her örnek `user = null` ile
    başlıyor, ekran `user?.id` ile sorgu atıyor, oturum çözülünce sorgu
    tekrarlanmıyordu. Dört ekran tek tek
    `useFocusEffect(useCallback(..., [fetchX]))` ile yamalanmıştı.
  - **Çözüm:** `useAuth.ts` → `useAuth.tsx`; `AuthProvider` bir kez
    (`App.tsx`, `RootNavigator`'ın üstünde — o da tüketici). **Diff yalnızca
    2 DOSYA.**
  - **Dönüş şekli BİREBİR korundu** (`{ session, user, loading, signIn,
    signUp, signOut }`), bu yüzden 10 çağrı noktasının hiçbiri değişmedi,
    importları bile aynı kaldı. Refactor'ün riskini düşük tutan şey buydu:
    değişen tek şey değerin nereden geldiği.
  - **`useFocusEffect` yamaları SİLİNMEDİ — bilinçli.** O kalıp iki iş
    görüyor: (a) oturum çözülünce sorguyu tekrarlamak (Context bunu
    gereksizleştirdi), (b) ekrana her dönüşte veriyi TAZELEMEK (hâlâ
    isteniyor). Silmek ayrı bir davranış değişikliği olurdu.
  - **`useMemo` + `useCallback` süs değil:** tek örnek olduğu için provider'ın
    her render'ında yeni nesne üretmenin maliyeti uygulama geneline yayılır ve
    tüketicilerin bağımlılık dizilerini durmadan geçersiz kılardı.
  - **Provider yoksa `useAuth` açıkça FIRLATIYOR**, sessiz varsayılan
    döndürmüyor: sessiz bir "kullanıcı yok" değeri herkesi giriş ekranına atar
    ve sebebi kodda görünmezdi.
  - **Modal sınırı ayrıca test edildi** (`ListPicker`, `MapSummarySheet`):
    React Context RN `Modal`'ı geçiyor — varsayılmadı, doğrulandı.
  - **Saf JS, build gerektirmedi**, OTA ile gitti. Ama gönderilen en riskli
    OTA'ydı: bozsaydı kullanıcı giriş yapamaz, uygulamaya hiç ulaşamazdı.
    Bu yüzden Expo Go'da tam doğrulama yapılmadan gönderilmedi.
- **`src/screens/SearchScreen.tsx:127` hâlâ ham `fetch` ile autocomplete çağırıyor**,
  `json.status` kontrol etmiyor. `places.ts`'teki `autocomplete()` hazır ama kullanılmıyor.
  Faz 1b adım 6'da bu dosyanın stilleri elden geçirildi ama bu **bilinçli olarak
  dokunulmadı** — tasarım değil davranış değişikliği, ayrı diff olmalı.
  (Satır numarası 2026-08-04'te `:87`den güncellendi; o gün arama ekranındaki
  durum ayrımı düzeltildi ama bu madde yine kapsam dışı bırakıldı. Somut sonucu:
  `REQUEST_DENIED`/`INVALID_REQUEST` gibi durumlarda `json.predictions` anahtarı
  hiç gelmediği için liste **eski haliyle ekranda kalıyor**, hata görünmüyor.)
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
- ~~Auth ekranlarındaki stil tekrarı~~ — **KAPANDI (2026-08-07), önce Expo
  Go'da sonra GERÇEK APK'da (OTA sonrası) DOĞRULANDI.** İkisinin ayrı ayrı
  yazılması bilinçli: bu oturumun en pahalı dersi "hangi ortamda doğrulandığı"
  ayrımıydı. Giriş yolu ekranları olduğu için uçtan uca giriş, hata yolları ve
  klavye açıkken form kullanılabilirliği production'da tek tek kontrol edildi. Tetikleyici (üçüncü form ekranı = `EditProfile`) gerçekleşti;
  `TextField` + `Button` çıkarıldı, önce `EditProfile`'da oturdu, sonra
  **Register → Login sırasıyla** taşındı. `inputGroup`/`label`/`input`/
  `buttonDisabled`/`primaryButtonText` iki dosyadan da silindi; ikisinde
  `primaryButton` yalnızca `marginTop: Spacing.xs`. Toplam 124 satır eksildi.
  - **Görsel olarak NÖTR** çünkü silinen stiller primitive'lerdekilerle birebir
    aynı değerleri taşıyordu — primitive'ler zaten bu ekranlardan çıkarılmıştı.
  - **Tek bilinen fark:** basılı geri bildirimi. `TouchableOpacity`'nin
    varsayılan opaklığı yerine `Pressable` + `0.7` — uygulamanın geri kalanıyla
    tutarlı hale geldi, cihazda kontrol edildi.
  - **Sıra bilinçliydi:** Register önce (bozulursa yalnızca yeni kayıtlar
    etkilenir), Login sonra (bozulursa **kimse giremez**).
  - **Taşınmayan parça:** "Hesabın yok mu? Kayıt Ol" / "Zaten hesabın var mı?
    Giriş Yap" satırları — satır içi renkli metin içeriyorlar, `Button`'ın
    `label`'ı düz string alıyor.
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

## Genel yayın öncesi düşünülecekler
> Arkadaş testi ölçeğinde **engelleyici değil**, ama uygulama tanımadığın
> kişilere açılmadan önce çözülmesi gereken şeyler. Bugün bilinçli olarak
> ertelendiler; buradaki amaç "unutulmasın" demek.

### 🪜 KADEME ÇERÇEVESİ — "uygulamayı kullanılabilir hale getirmek" ne demek
Soru birden çok kez soruldu ve cevabı hedef kitleye göre değişiyor. Üç kademe,
her biri bir öncekinin üstüne biniyor:

| Kademe | Kim kullanıyor | Ne gerekiyor |
|---|---|---|
| **1 — arkadaş testi** | Tanıdığın birkaç kişi | **Bugün çalışıyor.** Ek koşul yok. |
| **2 — davetli çevre** | Tanımadığın ama davetli kişiler | ~~E-posta onayı~~ ✅ · ~~**custom SMTP**~~ ✅ · ~~**fotoğraf moderasyonu**~~ ✅ · **kendi alan adı** (spam) ⬜ — *son kalan koşul, Faz 4'e bağlı* |
| **3 — genel yayın** | Herkes | Faz 4 (marka) + Google çağrıları **Edge Function** arkasına + Play Store için **AAB** |

- **Kademe 2'nin koşulları DÖRDE ÇIKTI, ikisi kapandı (2026-08-09):**
  - ✅ **E-posta onayı akışı** — açıldı ve uçtan uca doğrulandı.
  - ✅ **Custom SMTP (SendGrid)** — ⚠️ **bu koşul plan yapılırken ATLANMIŞTI
    ve sahada ortaya çıktı.** Supabase'in dahili mail sunucusu proje genelinde
    saatte birkaç e-postayla sınırlı; onu bilmeden davetli çevreye açılsaydı
    davetlilerin çoğu onay mailini **hiç alamayacaktı** ve sebebini kimse
    bilmeyecekti. Ders: *e-posta onayını açmak, mail ALTYAPISI kararını da
    beraberinde getiriyor.* (Önce Brevo denendi, hesap sorunları çözülemedi.)
  - ✅ **Fotoğraf moderasyonu** — migration 018 + istemci sahada (2026-08-10,
    iki hesapla ve gerçek APK'da doğrulandı). Kullanıcı başkasının
    fotoğrafını uzun basıp bildirebiliyor, moderasyon panelden yapılıyor,
    gizlenen fotoğraf yükleyicisinde "Gizlendi" etiketiyle duruyor.
  - ⬜ **Kendi alan adı** — SPF/DKIM olmadan onay mailleri spam'e düşebilir.
    Faz 4'le birleşiyor: marka adı kararlaşınca alan adı alınır.
- **Kademe 3'ün Edge Function maddesi çift işe yarıyor:** hem Places anahtarını
  istemciden tamamen kaldırıyor (Dağıtım §6/2'nin kökten çözümü) hem `places`
  yazma yolunu sunucuya taşıyor.

- **Fotoğraf moderasyonu — VERİ KATMANI HAZIR (migration 018, 2026-08-09),
  İSTEMCİ SIRADA.** Tetikleyici gerçekleşti: uygulama arkadaş çevresi dışına
  açılıyor.
  - **Neydi:** `place_photos` SELECT `using (true)`, silme yalnızca sahibine.
    Başkasının uygunsuz içeriğini bildirmenin, gizlemenin veya sildirmenin
    hiçbir yolu yoktu. Fotoğrafların herkese açık olması bilinçli bir
    takastı (menü fotoğrafının varlık sebebi paylaşılmak) ve o karar duruyor.
  - **Migration 018 ne getirdi:** `place_photos.hidden` · SELECT politikası
    `not hidden or auth.uid() = user_id` · `photo_reports` tablosu (bileşik
    PK, dört sabit kategori, **yalnızca INSERT politikası**) · ve bir
    **güvenlik düzeltmesi**: migration 013'ün kullanılmayan UPDATE politikası
    düşürüldü — RLS kolon bazlı olmadığı için o politika, moderasyon edilen
    kullanıcının `hidden`'ı kendi `false`'a çekmesine izin veriyordu.
  - **Yönetici arayüzü YOK ve olmayacak (bu ölçekte):** rol sistemi
    kurulmadı, moderasyon Supabase panelinden yapılıyor (`service_role` RLS'i
    baypas ediyor). Panelde kullanılacak sorgular migration dosyasının 5.
    bölümünde hazır.
  - **"Kendi fotoğrafını şikayet edememe" RLS'te GERÇEKTEN zorlanıyor** —
    `entry_likes`'ta yapılamamıştı (tablo CHECK'i başka tabloya bakamıyor),
    burada `with check` alt sorgu kabul ettiği için mümkün oldu.
  - ⚠️ **YUMUŞAK GİZLEME DOSYAYI İNTERNETTEN KALDIRMIYOR.** Bucket public
    (migration 014, gerekçe egress). `hidden` fotoğrafı UYGULAMADAN gizler;
    doğrudan URL'i bilen görmeye devam eder. Gerçekten yasa dışı içerik için
    Storage'dan **iki nesneyi de** (`storage_path` + `thumb_path`) elle silmek
    gerekiyor — adımlar ve sıra uyarısı ("önce yolları oku, sonra satırı sil")
    migration dosyasında.
  - **Bilinçli olarak YOK:** yükleyiciye yaptırım · şikayet edene sonuç
    bildirimi · otomatik gizleme eşiği (bu ölçekte tek kötü niyetli kullanıcı
    meşru fotoğrafları gizletebilirdi) · serbest metin şikayet açıklaması
    (kendisi moderasyon gerektiren yeni bir kötüye kullanım yüzeyi olurdu).
  - ✅ **İSTEMCİ DE TAMAM (2026-08-10).** Uzun basış tek jest iki anlam:
    kendi fotoğrafında **sil**, başkasınınkinde **bildir** — o dal zaten
    boştu, yeni yüzey açılmadı. Dört kategori bir sheet'te (`Alert` Android'de
    en fazla üç buton destekliyor). `23505` "zaten bildirdin"e çevriliyor,
    yani "bildirdim mi" için ayrı sorgu yok. Gizlenen fotoğraf yükleyicisinde
    "Gizlendi" etiketiyle duruyor.
  - **Yanında çıkan ayrı bir düzeltme:** dosyası eksik bir fotoğraf tam ekranda
    **sonsuz spinner** üretiyordu (`onError` yoktu, `onLoadEnd` 404'te
    Android'de güvenilir tetiklenmiyor) ve ızgarada **boş gri kare**
    bırakıyordu (opaklık `onLoad` beklerken 0'da kalıyordu). İkisi de artık
    durumunu söylüyor.
    - ⚠️ **TEST YÖNTEMİ:** gerçek silme ile test EDİLEMEZ — iki önbellek
      katmanı var ve JS reload ikisini de temizlemiyor (cihazda RN `Image`'ın
      native disk önbelleği, Supabase tarafında CDN). Doğru yol: SQL ile
      **var olmayan bir yola** işaret eden bir satır yazmak; 404 garanti,
      önbellek devre dışı.
    - **Cache-busting REDDEDİLDİ:** her görseli her render'da yeniden
      indirtir ve bu projenin ücretsiz katmandaki asıl darboğazı egress.
      Üstelik önbellekleme burada doğru: her yükleme benzersiz bir yola
      gidiyor, yani bir yoldaki içerik asla değişmiyor.

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
