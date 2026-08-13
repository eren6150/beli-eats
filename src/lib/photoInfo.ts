import { PlacePhoto, UserRanking } from '../types';
// TİP-ONLY import: bu modülün bileşene çalışma anı bağımlılığı YOK.
// `PhotoViewerInfo` bir SUNUM sözleşmesi, alan adları şeritlerin yerleşimini
// anlatıyor — o yüzden evi bileşenin yanı, `types/index.ts` değil (orası
// veritabanı satırlarının şeklini tutuyor).
import type { PhotoViewerInfo } from '../components/photos/PhotoViewer';

/**
 * Bir fotoğrafın tam ekran görüntüleyicideki şeritlerinde NE YAZACAĞI.
 *
 * ── NEDEN PAYLAŞILAN YARDIMCI ────────────────────────────────────────────────
 * İki ekran aynı kararı veriyor: mekan sayfasının fotoğraf ızgarası ve ziyaret
 * detayının yatay fotoğraf şeridi. İkinci kopya yazmak, kuralın zamanla
 * ayrışması demekti — bu projede `getPhotoUrl` bir kez tam olarak böyle iki
 * ekrana dağılmış ve birleştirilmişti.
 *
 * ── İKİ KAYNAK, SIRAYLA ──────────────────────────────────────────────────────
 * 1. `entry_id` DOLU → kare bir Ziyaret'e ait: tarih + puan + not. Alanlar
 *    fotoğraf sorgusunda gömülü geliyor (`diary_entries!place_photos_entry_fk`),
 *    yani ek tur YOK. Yazar = fotoğrafın yükleyicisi, çünkü migration 020'nin
 *    INSERT politikası bir kişinin fotoğrafını BAŞKASININ ziyaretine
 *    bağlamasına izin vermiyor.
 * 2. `entry_id` BOŞ + yükleyicinin bu mekanda puanı VAR → puan + yorum.
 *    Bağ bir kolondan değil `user_rankings`'in `unique(user_id, place_id)`
 *    kısıtından TÜRETİLİYOR ("Karar E": yeni kolon yok, migration yok).
 * 3. Hiçbiri → `null`: şeritler hiç açılmıyor, fotoğraf yalnız görünüyor.
 *
 * ⚠️ 2. DAL ESKİ FOTOĞRAFLARI DA KAPSIYOR. Izgaranın kendi "Menü/Yemek ekle"
 * butonundan yüklenen her karenin `entry_id`'si boş; yükleyicisinin puanı varsa
 * o karelerde de puan/yorum şeridi çıkıyor. Bilinçli sonuç ve zararsız:
 * kullanıcı yanlış bir sayfaya GÖTÜRÜLMÜYOR, fotoğrafın üstünde bir bilgi
 * şeridi görüyor.
 *
 * ⚠️ PUAN DALINDA TARİH YOK ve olmamalı: bir puanın ziyaret tarihi yoktur
 * (`user_rankings` bir DURUM, `diary_entries` bir OLAY). Uydurma bir tarih
 * göstermek, projenin dört kez pahalıya patlattığı isim/davranış
 * uyumsuzluğunun bir örneği daha olurdu.
 *
 * @param rankingOf Yükleyicinin bu mekandaki puan kaydını döndürür — ÇAĞIRANIN
 *   işi. Mekan sayfası burada kendi kaydı için taze state'ini önceliyor
 *   (gerekçe orada), ziyaret detayında böyle bir tazelik sorunu yok. Kural
 *   ortak, kaynak çağıranın.
 */
export function buildPhotoInfo(
  photo: PlacePhoto,
  rankingOf: (userId: string) => UserRanking | null
): PhotoViewerInfo | null {
  const authorLabel = photo.profiles?.username
    ? `@${photo.profiles.username}`
    : undefined;

  const entry = photo.diary_entries;
  if (photo.entry_id && entry) {
    return {
      authorLabel,
      visitedAt: entry.visited_at,
      rating: entry.rating,
      text: entry.note,
    };
  }

  const ranking = rankingOf(photo.user_id);
  if (ranking) {
    return {
      authorLabel,
      rating: ranking.rating,
      text: ranking.review_text,
    };
  }

  return null;
}
