import React from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors } from '../../constants/theme';

/**
 * İkon sarmalayıcısı.
 *
 * NEDEN SARMALAYICI, doğrudan Ionicons değil:
 *  1. Ekranlar ANLAMSAL isim kullanır (`location`, `rating`), glif ismi değil
 *     (`location-outline`). İkon seti değişirse tek dosya değişir.
 *  2. Emoji ikonların yerini alıyor. Emoji cihaza göre farklı çiziliyor,
 *     renklendirilemiyor ve aktif/pasif durumu olamıyor — "Midas kalitesi"
 *     hedefiyle uyumsuzdu.
 *  3. Varsayılan renk/boyut tek yerden geliyor.
 *
 * Yeni ikon eklerken: aşağıdaki haritaya anlamsal isim ekle, ekranda glif
 * ismi YAZMA.
 */

type IoniconName = keyof typeof Ionicons.glyphMap;

const ICONS = {
  // Navigasyon
  back: 'chevron-back',
  forward: 'chevron-forward',
  up: 'chevron-up',
  down: 'chevron-down',
  close: 'close',

  // İçerik
  location: 'location-outline',
  rating: 'star',
  ratingOutline: 'star-outline',
  note: 'create-outline',
  photo: 'image-outline',
  restaurant: 'restaurant-outline',
  /** Listeler / koleksiyonlar */
  list: 'list-outline',
  /** Günlük (diary) girişleri */
  diary: 'calendar-outline',

  // Seçim (çoklu seçim modu)
  /** Seçili öğe — dolu daire içinde tik */
  checkCircle: 'checkmark-circle',
  /** Seçilebilir ama seçilmemiş öğe */
  circleOutline: 'ellipse-outline',

  // Aksiyon
  check: 'checkmark',
  add: 'add',
  trash: 'trash-outline',
  settings: 'settings-outline',
  share: 'share-outline',
  /** Ziyaret beğenisi — boş hal. Dolu/boş ayrımı sekme ikonlarıyla aynı
   *  desen (`home`/`homeActive`): aktiflik dolu glif + renkle anlatılıyor. */
  heart: 'heart-outline',
  heartActive: 'heart',

  // Durum
  alert: 'alert-circle-outline',

  // Sekmeler
  home: 'home-outline',
  homeActive: 'home',
  search: 'search-outline',
  searchActive: 'search',
  map: 'map-outline',
  mapActive: 'map',
  person: 'person-outline',
  personActive: 'person',
} satisfies Record<string, IoniconName>;

export type IconName = keyof typeof ICONS;

export interface IconProps {
  name: IconName;
  /** Varsayılan 18 — `Type.body` ile aynı optik ağırlıkta durur. */
  size?: number;
  /** Varsayılan `textSecondary`; ikon çoğunlukla yardımcı öğe. */
  color?: string;
  style?: StyleProp<TextStyle>;
}

export default function Icon({
  name,
  size = 18,
  color = Colors.textSecondary,
  style,
}: IconProps) {
  return (
    <Ionicons
      name={ICONS[name]}
      size={size}
      color={color}
      style={style}
      // İkon dekoratif; ekran okuyucu metni komşu Text'ten alıyor.
      accessible={false}
    />
  );
}
