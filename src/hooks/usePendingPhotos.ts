import { useState } from 'react';
import { PlacePhotoKind } from '../types';
import { promptPhotoSource } from '../lib/photoPicker';
import { makePhotoRenditions, uploadPlacePhoto } from '../lib/placePhotos';

/**
 * Henüz YÜKLENMEMİŞ, yalnızca seçilmiş fotoğraf. Yükleme her zaman kaydetmeden
 * SONRA yapılıyor: ziyaret yolunda `place_photos.entry_id` bir FK, yani giriş
 * satırı önce var olmalı; puan yolunda ise yükleme zaten kaydın ardından
 * anlamlı (kullanıcı vazgeçerse boşuna nesne yüklenmesin).
 */
export interface PendingPhoto {
  /** Yerel liste anahtarı; sunucudaki id ile ilgisi yok. */
  id: string;
  uri: string;
  width: number;
  height: number;
  kind: PlacePhotoKind;
}

/** Tür seçicinin hedefi: yeni bir seçim mi, listedeki bir fotoğraf mı. */
type KindTarget =
  | { mode: 'new'; asset: Omit<PendingPhoto, 'kind' | 'id'> }
  | { mode: 'edit'; id: string; kind: PlacePhotoKind }
  | null;

/** Tür seçilmemişken seçicide işaretli duran değer. */
const DEFAULT_KIND: PlacePhotoKind = 'food';

/**
 * "Ziyaret ekle" ve "Puanı Kaydet" formlarının PAYLAŞTIĞI fotoğraf mantığı.
 *
 * ── NEDEN HOOK + AYRI BİLEŞEN ────────────────────────────────────────────────
 * Bu mantık önce `DiaryEntrySheet`'in içinde yazılmıştı. Puan formuna da
 * gerekince kopyalamak ~150 satır tekrar ve iki kopyanın zamanla ayrışması
 * demekti. Ama tek bir bileşene toplamak da OLMUYOR: `PhotoKindSheet` bir
 * `Modal` DEĞİL (gerekçe o dosyanın başında), yani ekranı kaplamak için
 * ÇAĞIRANIN KÖKÜNDE render edilmesi gerekiyor — bir ScrollView'ın içinde
 * çizilirse ekranı kaplayamaz.
 *
 * Bu yüzden iş üçe bölündü:
 *   · `usePendingPhotos`  → durum + seçme + yükleme (burası)
 *   · `PendingPhotoStrip` → şeridin görünümü, form içinde
 *   · `PhotoKindSheet`    → ÇAĞIRAN kendi kökünde çiziyor
 *
 * ── TÜR HER FOTOĞRAFA AYRI SORULUYOR ─────────────────────────────────────────
 * Seçim doğrudan listeye eklenmiyor: önce tür soruluyor, seçici kapatılırsa
 * fotoğraf da eklenmiyor. Sessizce varsayılan atamak, kullanıcının açıkça
 * istediği adımı atlamak olurdu (ürün kararı, 2026-08-11).
 */
export function usePendingPhotos() {
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [kindTarget, setKindTarget] = useState<KindTarget>(null);
  const [uploading, setUploading] = useState(false);

  /**
   * "+" menüsü.
   *
   * Kaynak seçimi (izin + picker + iptal) `src/lib/photoPicker.ts`'e taşındı:
   * mekan sayfasının fotoğraf ızgarası da AYNI menüyü kullanıyor ama bu hook'u
   * kullanamıyor (yükleme modelleri farklı — gerekçe o dosyanın başında).
   * Buradaki davranış değişmedi; yalnızca ortak parça dışarı alındı.
   *
   * Seçim doğrudan listeye EKLENMİYOR: önce tür soruluyor (`kindTarget`),
   * seçici kapatılırsa fotoğraf da eklenmiyor.
   */
  const promptAdd = () => {
    promptPhotoSource((asset) => {
      setKindTarget({
        mode: 'new',
        asset: { uri: asset.uri, width: asset.width, height: asset.height },
      });
    });
  };

  const selectKind = (kind: PlacePhotoKind) => {
    if (!kindTarget) return;

    if (kindTarget.mode === 'new') {
      setPhotos((prev) => [
        ...prev,
        { id: `${Date.now()}-${prev.length}`, ...kindTarget.asset, kind },
      ]);
    } else {
      const targetId = kindTarget.id;
      setPhotos((prev) =>
        prev.map((p) => (p.id === targetId ? { ...p, kind } : p))
      );
    }

    setKindTarget(null);
  };

  const editKind = (photo: PendingPhoto) =>
    setKindTarget({ mode: 'edit', id: photo.id, kind: photo.kind });

  const remove = (id: string) =>
    setPhotos((prev) => prev.filter((p) => p.id !== id));

  /** Form kapanınca/kaydedilince çağrılmalı: seçilenler sonraki forma sızmasın. */
  const reset = () => {
    setPhotos([]);
    setKindTarget(null);
  };

  /**
   * Seçilenleri yükler. Dönen sayı BAŞARISIZ olanların sayısı.
   *
   * ── HATA YUTULMUYOR AMA GERİ DE ALINMIYOR ────────────────────────────────
   * Çağrıldığı anda asıl kayıt (ziyaret ya da puan) çoktan yazılmış oluyor.
   * Yükleme patlarsa onu geri almıyoruz — kullanıcının kaydettiği şey o,
   * fotoğraf yan bilgi. Ama kaç tanesinin gitmediğini çağırana söylüyoruz;
   * sessiz kalmak bu projenin en çok ceza kestiği şey.
   *
   * `entryId` verilmezse `null` gidiyor: "Puanı Kaydet" yolundan gelen
   * fotoğrafların bağlı olduğu bir ziyaret YOK. O fotoğraflar dokunulduğunda
   * kişinin `user_rankings` kaydına çözümleniyor — `unique(user_id, place_id)`
   * sayesinde o satır zaten tek olarak belirli, bu yüzden `ranking_id` diye
   * bir kolon EKLENMEDİ.
   */
  const upload = async (params: {
    placeId: string;
    userId: string;
    entryId?: string | null;
  }): Promise<number> => {
    if (photos.length === 0) return 0;

    setUploading(true);
    let failed = 0;

    for (const photo of photos) {
      try {
        const { fullUri, thumbUri } = await makePhotoRenditions({
          uri: photo.uri,
          width: photo.width,
          height: photo.height,
        });

        const { error } = await uploadPlacePhoto({
          placeId: params.placeId,
          userId: params.userId,
          kind: photo.kind,
          fullUri,
          thumbUri,
          entryId: params.entryId ?? null,
        });

        if (error) failed += 1;
      } catch (e) {
        console.error('[usePendingPhotos] fotoğraf yüklenemedi:', e);
        failed += 1;
      }
    }

    setUploading(false);
    return failed;
  };

  return {
    photos,
    uploading,
    promptAdd,
    editKind,
    remove,
    reset,
    upload,
    selectKind,
    /** `PhotoKindSheet`'in `value`'su — `null` iken seçici kapalı. */
    kindSheetValue: kindTarget
      ? kindTarget.mode === 'edit'
        ? kindTarget.kind
        : DEFAULT_KIND
      : null,
    closeKindSheet: () => setKindTarget(null),
    /** Geri tuşu: seçici açıksa formu değil onu kapatmalı. */
    kindSheetOpen: kindTarget !== null,
  };
}
