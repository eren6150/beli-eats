/**
 * Tarih yardımcıları — YALNIZCA `diary_entries.visited_at` için.
 *
 * O kolon Postgres'te `date` (saat yok) ve istemciye `YYYY-MM-DD` string'i
 * olarak geliyor.
 *
 * KURAL: bu string `new Date(...)`'a VERİLMEZ ve `toISOString()` ile
 * ÜRETİLMEZ. İkisi de UTC üzerinden çalışıyor:
 *   - `new Date('2026-08-01')` UTC gece yarısı demek; negatif ofsetli bir
 *     zaman diliminde 31 Temmuz'a düşer.
 *   - `toISOString()` yerel gece yarısını UTC'ye çevirir; pozitif ofsette
 *     (Türkiye +03) 1 Ağustos 00:00 → 31 Temmuz 21:00 olur ve tarih geri kayar.
 * Ziyaret tarihinin bir gün kayması sessiz bir veri hatası olurdu, o yüzden
 * dönüşümler string parçalanarak / yerel alanlardan kurularak yapılıyor.
 */

const MONTHS_SHORT = [
  'Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz',
  'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara',
] as const;

const MONTHS_LONG = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
] as const;

/** `Date` → `YYYY-MM-DD`, YEREL alanlardan (UTC dönüşümü yok). */
export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** `YYYY-MM-DD` → `Date` (yerel gece yarısı). Seçicinin başlangıç değeri için. */
export function fromDateString(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** `YYYY-MM-DD` → `{ day: '01', month: 'Ağu' }` — günlük satırının tarih sütunu. */
export function splitDateParts(value: string): { day: string; month: string } {
  const [, m, d] = value.split('-');
  const monthIndex = Number(m) - 1;
  return {
    day: d ?? '--',
    month: MONTHS_SHORT[monthIndex] ?? '',
  };
}

/**
 * `YYYY-MM-DD` → "1 Ağustos 2026". Bugün/dün için özel metin döner:
 * ziyaret girerken en sık seçilen iki değer bunlar.
 */
export function formatVisitDate(value: string): string {
  const today = toDateString(new Date());
  if (value === today) return 'Bugün';

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (value === toDateString(yesterday)) return 'Dün';

  const [y, m, d] = value.split('-');
  const monthIndex = Number(m) - 1;
  return `${Number(d)} ${MONTHS_LONG[monthIndex] ?? ''} ${y}`;
}
