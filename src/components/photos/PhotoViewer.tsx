import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlacePhoto } from '../../types';
import { photoPublicUrl } from '../../lib/placePhotos';
import { formatVisitDate } from '../../lib/date';
import { Colors, Spacing, Type } from '../../constants/theme';
import Icon from '../ui/Icon';
import StarRating from '../ui/StarRating';

/**
 * Tam ekran fotoğraf görüntüleyici — ÜÇ KATMANLI.
 *
 *   1. Dokunuş → fotoğraf tam ekran açılır (fotoğraf baskın, üstünde hiçbir şey
 *      yok).
 *   2. Fotoğrafa dokunuş → üst/alt yarı saydam şeritler belirir (ziyaret
 *      tarihi, puan, not/yorum). Fotoğraf arkada görünmeye devam eder.
 *   3. Tekrar dokunuş → şeritler söner.
 *
 * ── NEDEN AYRI BİLEŞEN (PhotoGrid'den ÇIKARILDI) ────────────────────────────
 * Görüntüleyici artık üç katmanlı gerçek bir özellik; `PhotoGrid`'in işi ise
 * "kareleri çiz". İkincisi: ziyaret detayındaki yatay fotoğraf şeridi de bir
 * gün aynı görüntüleyiciyi açacak ve o yüzey ızgara DEĞİL — bileşen
 * `PhotoGrid`'in içinde kaldıkça oradan kullanılamazdı.
 *
 * Açık/kapalı state'i ÇAĞIRANDA duruyor (`photo` prop'u), burada değil:
 * `RankingReviewSheet`'in "ayrı `visible` bayrağı yok" kararının aynısı — tek
 * kaynak = tek gerçek, "açık ama fotoğrafı yok" ara durumu doğmuyor.
 *
 * ── ⚠️ JEST DAĞILIMI DEĞİŞTİ, BU BİR DAVRANIŞ KIRILMASI ─────────────────────
 * Önceki halde görüntüleyicinin TAMAMI tek bir `Pressable` ile sarılıydı ve
 * her yere dokunmak KAPATIYORDU. İstenen "dokun → şeritler" tam olarak aynı
 * jest, yani jestin yeniden dağıtılması zorunluydu:
 *
 *   | Jest              | Eski     | Yeni                          |
 *   |-------------------|----------|-------------------------------|
 *   | Fotoğrafa/boşluğa | Kapatır  | Şeritleri aç/kapat            |
 *   | Sağ üst çarpı     | (sahte)  | GERÇEK buton — kapatır        |
 *   | Android geri      | Kapatır  | Kapatır (değişmedi)           |
 *
 * ⚠️ Çarpı eskiden bir `View`'dı; kendi `onPress`'i YOKTU ve yalnızca kökteki
 * Pressable dokunuşu yuttuğu için çalışıyor görünüyordu. Kökün işi değişince
 * ölü bir ikona dönerdi — bu yüzden gerçek `Pressable` oldu.
 *
 * ÇARPI ŞERİTLERE BAĞLI DEĞİL, HER ZAMAN GÖRÜNÜR. Şeritlerle birlikte
 * gizlenseydi, şeritler kapalıyken tek çıkış Android geri tuşu olurdu ve
 * kullanıcı "sıkıştım" hissederdi.
 *
 * ── ŞERİTLER DOKUNUŞA KAPALI (`pointerEvents="none"`) ───────────────────────
 * Şeridin üstüne dokunmak da onları kapatıyor (Twitter davranışı) ve "hangi
 * dokunuş nereye gidiyor" belirsizliği hiç doğmuyor. Şeride bir gün
 * tıklanabilir bir satır ("Ziyareti gör ›") eklenirse burası `box-none`
 * olmalı — bugün öyle bir satır YOK, o yüzden en basit hali seçildi.
 *
 * ── ⚠️ IZGARA `thumb_path`, BURASI `storage_path` ───────────────────────────
 * Tam boy görsel YALNIZCA burada indiriliyor. Ücretsiz katmanın egress hesabı
 * buna dayanıyor: ızgarada tam boy servis etmek aylık ~11 GB (sınır 5 GB),
 * küçük kopyayla ~1,6 GB.
 */

/**
 * Şeritlerin göstereceği bilgi — SUNUM İÇİN, ham veri değil.
 *
 * Bileşen `diary_entries` ile `user_rankings` ayrımını BİLMİYOR; hangi kaynağın
 * hangi alanı doldurduğuna çağıran karar veriyor. Böylece görüntüleyici veri
 * modeline bağlanmıyor ve ikinci bir yüzeyden (ziyaret detayı) çağrılabiliyor.
 */
export interface PhotoViewerInfo {
  /** "@kullanici" — üst şeritte. */
  authorLabel?: string;
  /**
   * `YYYY-MM-DD` ziyaret tarihi.
   *
   * PUAN KAYNAKLI fotoğraflarda BOŞ ve boş kalmalı: bir puanın ziyaret tarihi
   * yoktur (`user_rankings` bir DURUM, `diary_entries` bir OLAY). Uydurma bir
   * tarih göstermek, projenin dört kez pahalıya patlattığı isim/davranış
   * uyumsuzluğunun beşincisi olurdu.
   */
  visitedAt?: string;
  rating?: number | null;
  /** Ziyaret notu ya da mekan yorumu — kaynağı çağıran biliyor. */
  text?: string | null;
}

export interface PhotoViewerProps {
  /** Gösterilecek fotoğraf. `null` → görüntüleyici kapalı. */
  photo: PlacePhoto | null;
  /** Şeritlerin içeriği. Yoksa şeritler HİÇ açılmıyor (bkz. `hasInfo`). */
  info?: PhotoViewerInfo | null;
  onClose: () => void;
  /**
   * Kullanıcı adına dokunulunca — çağıran kendi stack'inde push ediyor
   * (`RankingReviewSheet.onPressPlace`'in aynı gerekçesi: bileşen hangi
   * stack'te olduğunu bilmiyor).
   *
   * VERİLMEZSE ad DÜZ METİN olarak çiziliyor, tıklanabilir görünmüyor. İki
   * durum bu tek yola düşüyor ve ikisi de doğru:
   *   • Kendi fotoğrafın → `UserProfile` salt okunur, kendi profilinde
   *     ayarlar/düzenleme beklenir (`DiaryEntryDetailScreen.goToAuthor`'ın
   *     kararı, "en az sürpriz").
   *   • Profil bilgisi gelmemişse → gidilecek bir yer zaten yok.
   * "Tıklanabilir görünüp tepki vermemek, hiç tıklanabilir görünmemekten
   * kötü" — bu yüzden `disabled` bir Pressable BIRAKILMIYOR.
   *
   * ⚠️ ÇAĞIRAN ÖNCE `onClose` ÇAĞIRMALI: açık bir RN `Modal` hedef ekranın
   * ÖNÜNDE kalır (`MapSummarySheet` ve `RankingReviewSheet` aynı sebeple önce
   * kapanıyor). Bunun sonucu kabul edildi: profilden geri gelince ızgaraya
   * dönülüyor, tam ekran fotoğrafa değil.
   */
  onPressAuthor?: () => void;
}

/**
 * Açılışta şeritlerin ekranda kalma süresi.
 *
 * KEŞFEDİLEBİLİRLİK İÇİN: şeritler varsayılan gizli olsaydı kullanıcı bilginin
 * VARLIĞINI hiç fark etmeyebilirdi — "dokununca bir şey çıkıyor" öğrenilecek
 * bir şey ve kimse öğretmiyor. Açılışta kısa süre görünüp sönmeleri hem bilgiyi
 * duyuruyor hem istenen "fotoğraf baskın" halini bozmuyor.
 */
const AUTO_HIDE_MS = 2000;

export default function PhotoViewer({
  photo,
  info,
  onClose,
  onPressAuthor,
}: PhotoViewerProps) {
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(false);
  /**
   * Tam boy görsel indirilemedi mi.
   *
   * ⚠️ BU DURUM BİR DÖNEM SONSUZ SPINNER ÜRETİYORDU: spinner'ı kapatan tek şey
   * `onLoadEnd`'di ve `onError` HİÇ YOKTU; görsel 404 dönünce `onLoadEnd`
   * Android'de güvenilir tetiklenmiyor. Sahada görüldü (Storage'daki dosyalar
   * silinip satırlar kalınca). Durum geçici bir veri kazasına özgü değil:
   * moderasyonla silinen dosya, elle temizlik ve kopan ağ aynı sonucu veriyor.
   */
  const [failed, setFailed] = useState(false);
  const [barsVisible, setBarsVisible] = useState(false);

  /**
   * Otomatik sönme zamanlayıcısı.
   *
   * REF'TE TUTULUYOR ki kullanıcı o iki saniye içinde elle dokunduğunda İPTAL
   * edilebilsin. Onsuz şu olurdu: kullanıcı açılışta şeritleri kapatıp hemen
   * tekrar açıyor, ilk zamanlayıcı hâlâ yaşıyor ve şeritleri altından
   * kapatıyor — kullanıcının açık isteğini ezen bir zamanlayıcı.
   */
  const autoHideRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const caption = photo?.caption?.trim() || null;
  const text = info?.text?.trim() || null;

  /**
   * Gösterilecek EN AZ BİR şey var mı.
   *
   * Yoksa şeritler HİÇ AÇILMIYOR — boş bir şerit çizmek yerine. Boş şerit
   * "bilgi yüklenemedi" izlenimi verirdi ve fotoğrafın önünü kapatırdı;
   * projenin `EmptyState`'i sekmeli bölümlerde kullanmama kararıyla aynı
   * gerekçe. Kullanıcı çıkışsız kalmıyor: çarpı her koşulda görünür.
   */
  const hasInfo = Boolean(
    info?.authorLabel ||
      info?.visitedAt ||
      typeof info?.rating === 'number' ||
      text ||
      caption
  );

  /**
   * Görsel durumu — YALNIZCA fotoğraf değişince sıfırlanıyor.
   *
   * ⚠️ BU EFFECT `hasInfo`'YA BAĞLANMAMALI. Bir dönem tek effect hem burayı hem
   * şeritleri yönetiyordu ve şu hatayı üretiyordu: şeritlerin bilgisi GEÇ
   * gelirse (`usePlaceRankings` görüntüleyici açıldıktan sonra çözülürse)
   * effect tekrar çalışıp `loading`'i `true`'ya çekiyor — ama görsel ZATEN
   * yüklü, bileşen yeniden kurulmuyor, yani `onLoadEnd` bir daha ATEŞLENMİYOR
   * ve spinner sonsuza kadar dönüyor. Bu projenin iki kez ısırdığı "sonsuz
   * spinner" sınıfının aynısı, sadece başka bir tetikleyiciyle.
   */
  useEffect(() => {
    if (!photo) return;
    setLoading(true);
    // Önceki fotoğrafın hatası yenisinde asılı kalmamalı.
    setFailed(false);
  }, [photo?.id]);

  /**
   * Şeritlerin açılışta kısa süre görünmesi.
   *
   * `hasInfo` bağımlılıkta ÇÜNKÜ bilgi geç gelebiliyor: fotoğraf açıkken
   * puanlar çözülürse şeritler o an duyurulmalı, yoksa kullanıcı bilginin
   * varlığını hiç öğrenemezdi.
   */
  useEffect(() => {
    if (autoHideRef.current) clearTimeout(autoHideRef.current);

    if (!photo || !hasInfo) {
      setBarsVisible(false);
      return;
    }

    setBarsVisible(true);
    autoHideRef.current = setTimeout(() => setBarsVisible(false), AUTO_HIDE_MS);

    return () => {
      if (autoHideRef.current) clearTimeout(autoHideRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo?.id, hasInfo]);

  const toggleBars = () => {
    // Elle dokunuş otomatik sönmeyi İPTAL EDER — kullanıcının kararı
    // zamanlayıcıyı yener.
    if (autoHideRef.current) {
      clearTimeout(autoHideRef.current);
      autoHideRef.current = null;
    }
    if (!hasInfo) return;
    setBarsVisible((v) => !v);
  };

  const showBars = barsVisible && hasInfo;

  return (
    <Modal
      visible={photo !== null}
      transparent
      animationType="fade"
      // Android donanım/jest geri tuşu — Modal'da bu olmadan kapanmaz.
      // Şeritler AÇIKKEN de doğrudan kapatıyor: şeritler bir gezinme durumu
      // değil, fotoğrafın üstündeki bir katman.
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Kök artık KAPATMIYOR, şeritleri aç/kapat ediyor. */}
      <Pressable style={styles.root} onPress={toggleBars}>
        {loading && !failed && <ActivityIndicator color={Colors.textOnBrand} />}

        {failed ? (
          <View style={styles.error}>
            <Icon name="alert" size={32} color={Colors.textOnBrand} />
            <Text style={styles.errorText}>Fotoğraf yüklenemedi.</Text>
            <Text style={styles.errorHint}>Dosya kaldırılmış olabilir.</Text>
          </View>
        ) : (
          photo && (
            <Image
              source={{ uri: photoPublicUrl(photo.storage_path) ?? undefined }}
              style={styles.full}
              resizeMode="contain"
              onLoadEnd={() => setLoading(false)}
              // ⚠️ ONSUZ SPINNER SONSUZA KADAR DÖNÜYOR (yukarıdaki not).
              onError={() => {
                setLoading(false);
                setFailed(true);
              }}
            />
          )
        )}

        {/* ── Üst şerit ── */}
        {showBars && (
          <Pressable
            /**
             * ── ⚠️ ŞERİT NEDEN `View` DEĞİL `Pressable` ─────────────────────
             * Burada bir dönem `<View pointerEvents="box-none">` vardı ve
             * SAHADA ÇALIŞMADI: kullanıcı adına dokunmak hiçbir şey yapmıyordu
             * — basılı tutunca solma bile görünmüyordu, yani iç `Pressable`
             * dokunuşu HİÇ ALMIYORDU. Dokunuş kök katmana düşüp şeritleri
             * kapatıyordu.
             *
             * AYIRT EDİCİ KANIT: aynı ekrandaki ÇARPI butonu çalışıyordu ve o,
             * kök `Pressable`'ın DOĞRUDAN çocuğu. Kullanıcı adı ise `box-none`
             * ilan etmiş bir View'ın içindeydi. İkisi arasındaki tek yapısal
             * fark buydu.
             *
             * Yani şüpheli "iç içe Pressable" DEĞİL — o deseni proje
             * `RankRow`'da (satırın içindeki ok/çöp kutusu) cihazda
             * doğrulamıştı. Şüpheli, kendini "hedef değilim" ilan eden bir
             * katmanın çocuklarını hedef yapabilmesiydi.
             *
             * DÜZELTME MEKANİZMAYI AYARLAMIYOR, DEĞİŞKENİ KALDIRIYOR
             * (`ListPicker`'ın sanallaştırmayı kaldırma kararının aynı şekli):
             * `pointerEvents` tamamen gitti, şerit artık kendi `onPress`'i olan
             * gerçek bir dokunma hedefi. Sonuç `RankRow`'un birebir aynısı —
             * dış Pressable (şerit → kapat) + iç Pressable (ad → profil), ve
             * RN iç içe dokunmada en İÇTEKİ hedefi seçiyor.
             *
             * Davranış korunuyor: adın ÜSTÜ → profile git · şeridin GERİ KALANI
             * (tarih dahil) → şeritleri kapat. "Hem gidip hem kapatma" mümkün
             * değil, tek bir hedef kazanıyor.
             *
             * Alt şerit `pointerEvents="none"` KALIYOR: orada tıklanacak bir şey
             * yok ve o yol sahada çalıştığı doğrulandı (dokunuş kök katmana
             * düşüp şeridi kapatıyor).
             */
            onPress={toggleBars}
            style={[
              styles.bar,
              styles.topBar,
              // Modal `statusBarTranslucent`, yani şerit durum çubuğunun
              // ALTINA uzanıyor. Pay TOPLAMA ile ekleniyor, `max()` ile değil —
              // sekme çubuğu dersinin aynısı.
              { paddingTop: insets.top + Spacing.sm },
            ]}
          >
            {info?.authorLabel ? (
              onPressAuthor ? (
                <Pressable
                  onPress={onPressAuthor}
                  // `hitSlop` BİLİNÇLİ OLARAK KÜÇÜK (8). Projenin standardı 44px
                  // ama burada hedefi büyütmek BİRİNCİL JESTİ yiyor: ada
                  // eklenen her piksel, "şeridi kapatmak için dokun"un
                  // çalışmadığı bir piksel. Ayrıca tarih satırı hemen altında.
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={({ pressed }) => [
                    // ⚠️ `alignSelf` ŞART: `Pressable` sütun içinde varsayılan
                    // olarak TAM GENİŞLİĞE yayılır ve üst şeridin bütün satırı
                    // "profile git" olurdu — yani şeridi kapatma jesti orada
                    // sessizce ölürdü.
                    styles.authorPress,
                    pressed && styles.authorPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`${info.authorLabel} profiline git`}
                >
                  <Text style={styles.author}>{info.authorLabel}</Text>
                </Pressable>
              ) : (
                // Kendi fotoğrafın ya da profil bilgisi yok → DÜZ METİN.
                <Text style={styles.author}>{info.authorLabel}</Text>
              )
            ) : null}
            {info?.visitedAt ? (
              // `formatVisitDate` — `new Date(string)` bu projede `visited_at`
              // için YASAK (UTC kayması ziyareti bir gün öteliyor).
              <Text style={styles.date}>{formatVisitDate(info.visitedAt)}</Text>
            ) : null}
          </Pressable>
        )}

        {/* ── Alt şerit ── */}
        {showBars && (
          <View
            pointerEvents="none"
            style={[
              styles.bar,
              styles.bottomBar,
              { paddingBottom: insets.bottom + Spacing.sm },
            ]}
          >
            {typeof info?.rating === 'number' && info.rating > 0 && (
              <View style={styles.ratingRow}>
                {/* `showValue` KULLANILMIYOR: bileşenin kendi sayı metni
                    `textSecondary` (koyu gri) ve bu zeminde okunmuyor. */}
                <StarRating rating={info.rating} size={14} />
                <Text style={styles.ratingValue}>{info.rating.toFixed(1)}</Text>
              </View>
            )}

            {text ? (
              // Şerit fotoğrafın önünü kapatmasın: uzun metin kırpılıyor.
              // Tam metnin evi ziyaret detayı / puan yorumu — burası bir
              // ÖNİZLEME.
              <Text style={styles.text} numberOfLines={4}>
                {text}
              </Text>
            ) : null}

            {caption ? <Text style={styles.caption}>{caption}</Text> : null}
          </View>
        )}

        {/* ── Kapat ──
            ŞERİTLERDEN BAĞIMSIZ, her zaman görünür (gerekçe başlıkta).
            `hitSlop` küçük ikonu parmak boyutuna çıkarıyor. */}
        <Pressable
          onPress={onClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={({ pressed }) => [
            styles.close,
            { top: insets.top + Spacing.sm },
            pressed && styles.closePressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Kapat"
        >
          <Icon name="close" size={24} color={Colors.textOnBrand} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.scrimStrong,
    justifyContent: 'center',
    alignItems: 'center',
  },
  full: { width: '100%', height: '80%' },

  error: {
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.xl,
  },
  errorText: {
    ...Type.bodyStrong,
    color: Colors.textOnBrand,
    textAlign: 'center',
  },
  errorHint: {
    ...Type.caption,
    color: Colors.textOnBrand,
    opacity: 0.7,
    textAlign: 'center',
  },

  /**
   * Şeritlerin ortak zemini. YARI SAYDAM: fotoğraf arkada görünmeye devam
   * ediyor — istenen his bu.
   *
   * SABİT YÜKSEKLİK YOK, yükseklik içerikten geliyor. Bu projede sabit yükseklik
   * varsayımı iki kez sahada kırıldı (diary sabit yükseklik, yıldız glif kutusu)
   * ve ikisinin de değişkeni sistem yazı tipi ölçeğiydi — burada da metin
   * ölçekle büyüyor.
   */
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: Colors.scrimMedium,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.xxs,
  },
  topBar: {
    top: 0,
    // Sağ üstteki çarpının altına girmesin.
    paddingRight: Spacing['4xl'],
    paddingBottom: Spacing.sm,
  },
  bottomBar: {
    bottom: 0,
    paddingTop: Spacing.md,
  },

  author: {
    ...Type.bodyStrong,
    color: Colors.textOnBrand,
  },
  /** Dokunma alanı metne SARILI kalsın — gerekçesi kullanım yerinde. */
  authorPress: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.xxs,
  },
  authorPressed: { opacity: 0.6 },
  date: {
    ...Type.caption,
    color: Colors.textOnBrand,
    opacity: 0.85,
  },

  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  ratingValue: {
    ...Type.captionStrong,
    color: Colors.textOnBrand,
  },
  text: {
    ...Type.body,
    color: Colors.textOnBrand,
  },
  caption: {
    ...Type.caption,
    color: Colors.textOnBrand,
    opacity: 0.85,
  },

  close: {
    position: 'absolute',
    right: Spacing.lg,
  },
  closePressed: { opacity: 0.6 },
});
