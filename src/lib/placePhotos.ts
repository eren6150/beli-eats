import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { PostgrestError } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { PlacePhotoKind } from '../types';

/**
 * Mekan fotoğrafları — Storage'a yazma ve public URL üretme.
 *
 * Baytlar `place-photos` bucket'ında, üstveri `place_photos` tablosunda
 * (migration 013 + 014). Bu dosya ikisini birleştiren katman —
 * `placeCache.ts`'in `places.ts` ile Supabase'i birleştirmesiyle aynı rol.
 *
 * ── YOL DÜZENİ ───────────────────────────────────────────────────────────────
 *   {place_id}/{user_id}/{stamp}.jpg          → tam boy (uzun kenar 1280)
 *   {place_id}/{user_id}/{stamp}_thumb.jpg    → küçük  (uzun kenar 400)
 *
 * `user_id`'nin YOLDA olması Storage politikalarının gereği: sahiplik yol
 * parçasından doğrulanıyor (`(storage.foldername(name))[2]`), ayrı bir tablo
 * okumasına gerek kalmıyor.
 */

const BUCKET = 'place-photos';

type MutationError = PostgrestError | Error;

/** Hangi taşıma yolunun işe yaradığı — test ekranı bunu gösteriyor. */
export type UploadTransport = 'file-arraybuffer' | 'fetch-arraybuffer';

/**
 * Dosya adı — `crypto.randomUUID` KULLANILMIYOR.
 * Hermes'te varlığı sürüme bağlı ve bu iş için garanti gerekmiyor: ad yalnızca
 * TEK BİR kullanıcının TEK BİR mekan klasöründe benzersiz olmalı. Zaman damgası
 * + rastgele sonek bunu fazlasıyla karşılıyor ve yeni bağımlılık getirmiyor.
 */
function newStamp(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function buildPhotoPaths(placeId: string, userId: string) {
  const stamp = newStamp();
  const dir = `${placeId}/${userId}`;
  return {
    full: `${dir}/${stamp}.jpg`,
    thumb: `${dir}/${stamp}_thumb.jpg`,
  };
}

/** Storage yolundan gösterilebilir URL. Bucket public olduğu için imza yok. */
export function photoPublicUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// ─── İki kopya üretimi ────────────────────────────────────────────────────────
//
// Ücretsiz katmanda asıl darboğaz DEPOLAMA DEĞİL EGRESS. Hesap: listelerde tam
// boy servis edilirse aylık ~11 GB (sınır 5 GB), küçük kopyayla ~1,6 GB.
// Supabase'in sunucu tarafı görsel dönüştürmesi Free planda YOK (panelde
// "Unavailable in plan" olarak doğrulandı) — bu yüzden iki kopya İSTEMCİDE
// üretiliyor ve ikisi de yükleniyor.

/** Tam boy: detay/görüntüleyici. */
const FULL_MAX_EDGE = 1280;
const FULL_QUALITY = 0.7;
/** Küçük kopya: ızgara. Egress hesabının dayandığı boyut. */
const THUMB_MAX_EDGE = 400;
const THUMB_QUALITY = 0.6;

/**
 * Tek bir kopya üretir.
 *
 * ── ⚠️ UZUN KENARA GÖRE ÖLÇEKLEME ────────────────────────────────────────────
 * `resize({ width: 1280 })` yazmak YANLIŞ olurdu: `resize` tek değer verilince
 * diğerini oranı koruyarak hesaplıyor, yani DİKEY bir fotoğrafta genişlik 1280
 * olur ve yükseklik ~2270'e çıkar — hedeflenenden çok daha büyük bir dosya.
 * Doğrusu hangi kenarın uzun olduğuna bakıp sınırı ONA uygulamak.
 *
 * ── ASLA BÜYÜTMÜYOR ──────────────────────────────────────────────────────────
 * Kaynak zaten sınırdan küçükse hedef kaynağın boyutuna çekiliyor. Aksi halde
 * 300px'lik bir görsel 1280'e ŞİŞİRİLİRDİ: dosya büyür, kalite artmaz.
 */
async function renderRendition(
  uri: string,
  srcWidth: number,
  srcHeight: number,
  maxEdge: number,
  compress: number
): Promise<string> {
  const known = srcWidth > 0 && srcHeight > 0;
  const longEdge = known ? Math.max(srcWidth, srcHeight) : maxEdge;
  const target = Math.min(maxEdge, longEdge);

  // Boyut bilinmiyorsa genişlikten ölçekle: ImagePicker pratikte her zaman
  // veriyor, bu yalnızca savunma dalı.
  const size =
    !known || srcWidth >= srcHeight ? { width: target } : { height: target };

  // HER KOPYA İÇİN AYRI BAĞLAM. Context'in `reset()`'i var ve tek bağlamı
  // yeniden kullanmak biraz daha ucuz olurdu; paylaşılan durum üzerinden
  // zincirlemek yerine bağımsız iki bağlam tercih edildi — cihazda test
  // edemediğim bir yolda en az sürprizli olan bu.
  const ref = await ImageManipulator.manipulate(uri).resize(size).renderAsync();
  const out = await ref.saveAsync({ compress, format: SaveFormat.JPEG });
  return out.uri;
}

/**
 * Galeriden seçilen fotoğraftan yüklenecek iki kopyayı üretir.
 *
 * `width`/`height` çağırandan geliyor (ImagePicker asset'i veriyor) çünkü uzun
 * kenar kararı için kaynağın boyutlarını RENDER ETMEDEN bilmek gerekiyor.
 */
export async function makePhotoRenditions(params: {
  uri: string;
  width: number;
  height: number;
}): Promise<{ fullUri: string; thumbUri: string }> {
  const { uri, width, height } = params;

  const fullUri = await renderRendition(
    uri,
    width,
    height,
    FULL_MAX_EDGE,
    FULL_QUALITY
  );
  const thumbUri = await renderRendition(
    uri,
    width,
    height,
    THUMB_MAX_EDGE,
    THUMB_QUALITY
  );

  return { fullUri, thumbUri };
}

/**
 * Yerel bir dosyayı baytlara çevirir.
 *
 * ── NEDEN İKİ YOL ────────────────────────────────────────────────────────────
 * BİRİNCİL: `expo-file-system`'in `File` sınıfı (SDK 54'te gelen yeni API).
 * `File implements Blob` ve **native bir `arrayBuffer()`** metodu var —
 * yani okuma RN'in JS `fetch` polyfill'ine hiç uğramıyor. Sağlam olan bu.
 *
 * YEDEK: `fetch(uri).arrayBuffer()`. Planın ilk halinde birincil yol buydu;
 * `expo-file-system@19`'un yeni API'si görülünce ikinci sıraya düştü, çünkü
 * `Response.arrayBuffer()` RN'de polyfill üzerinden çalışıyor ve sürüme göre
 * davranışı değişebiliyor.
 *
 * ⚠️ `readAsStringAsync` (base64) KULLANILMIYOR: SDK 54'te o fonksiyon
 * `expo-file-system/legacy`'ye taşındı ve zaten base64 ara adımı belleği
 * ~%33 şişiriyor. İki `arrayBuffer` yolundan biri tutmazsa üçüncü çare olarak
 * değerlendirilir.
 *
 * Hangi yolun çalıştığı `transport` ile dönüyor — bilinmeden ilerlenmemeli.
 */
async function readBytes(
  localUri: string
): Promise<{ bytes: ArrayBuffer; transport: UploadTransport }> {
  try {
    const bytes = await new File(localUri).arrayBuffer();
    return { bytes, transport: 'file-arraybuffer' };
  } catch (e) {
    console.warn(
      '[placePhotos] expo-file-system File.arrayBuffer() başarısız, ' +
        'fetch yoluna düşülüyor:',
      e
    );
    const res = await fetch(localUri);
    const bytes = await res.arrayBuffer();
    return { bytes, transport: 'fetch-arraybuffer' };
  }
}

/**
 * TEK bir nesneyi Storage'a yükler.
 *
 * Ayrı ve dışa açık, çünkü test ekranı politikaları bunun üzerinden deniyor
 * (başkasının klasörüne yazma, boyut limiti). Normal akış `uploadPlacePhoto`
 * kullanmalı — o satırı da yazıyor.
 */
export async function uploadObject(
  path: string,
  localUri: string
): Promise<{ transport: UploadTransport | null; error: MutationError | null }> {
  try {
    const { bytes, transport } = await readBytes(localUri);

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });

    if (error) {
      console.error('[placePhotos] yükleme reddedildi:', path, error);
      return { transport, error };
    }
    return { transport, error: null };
  } catch (e) {
    console.error('[placePhotos] yükleme sırasında beklenmeyen hata:', e);
    return { transport: null, error: e as Error };
  }
}

export interface UploadPlacePhotoInput {
  placeId: string;
  userId: string;
  kind: PlacePhotoKind;
  /** Tam boy yerel dosya (adım 5'te 1280px'e küçültülmüş olacak). */
  fullUri: string;
  /** Küçük kopya yerel dosyası (adım 5'te 400px). */
  thumbUri: string;
  caption?: string | null;
}

/**
 * Tam akış: iki nesneyi yükler, SONRA `place_photos` satırını yazar.
 *
 * ── SIRA BİLİNÇLİ ────────────────────────────────────────────────────────────
 * Önce satır yazılsaydı, yükleme patladığında dosyası olmayan bir satır
 * kalırdı — ızgarada kırık kare olarak görünür. Bu sırada ise en kötü ihtimalle
 * ÖKSÜZ NESNE kalıyor: görünmez, küçük, kimseyi bozmuyor. Kabul edilen takas;
 * temizlik işi ileriye bırakıldı.
 *
 * ÖN KOŞUL: mekanın `places` cache satırı OLMALI (FK). Çağıran ekran sheet'i
 * açmadan önce `ensurePlaceCached()` çağırmalı — `AddToListSheet`'te kurulan
 * desenin aynısı. `23503` hatası bunun atlandığını söyler.
 */
export async function uploadPlacePhoto(
  input: UploadPlacePhotoInput
): Promise<{ transport: UploadTransport | null; error: MutationError | null }> {
  const paths = buildPhotoPaths(input.placeId, input.userId);

  const full = await uploadObject(paths.full, input.fullUri);
  if (full.error) return full;

  const thumb = await uploadObject(paths.thumb, input.thumbUri);
  if (thumb.error) {
    // Tam boy yüklendi ama küçük kopya olmadı. Satır YAZILMIYOR (iki yol da
    // `not null`), yani tam boy öksüz kalıyor — yukarıdaki takasın aynısı.
    return thumb;
  }

  const { error: insertError } = await supabase.from('place_photos').insert({
    user_id: input.userId,
    place_id: input.placeId,
    kind: input.kind,
    storage_path: paths.full,
    thumb_path: paths.thumb,
    caption: input.caption?.trim() || null,
  });

  if (insertError) {
    // Postgres hata KODLARI ayrıştırılıyor — bu, reddettiğimiz "ağ hatası
    // metnini regex'leme"den farklı: kodlar belgeli ve kararlı bir sözleşme.
    if (insertError.code === '23503') {
      console.error('[placePhotos] FK: places satırı yok:', insertError);
      return { transport: full.transport, error: insertError };
    }
    console.error('[placePhotos] satır yazılamadı:', insertError);
    return { transport: full.transport, error: insertError };
  }

  return { transport: full.transport, error: null };
}
