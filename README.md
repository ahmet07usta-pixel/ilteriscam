# Dijital Cam Proje

Bu workspace, bir cam sektörüne yönelik B2B platformun ön yüzü ve NestJS tabanlı arka uç servisini içerir.

## Çalıştırma

### Ön yüz

```bash
cd apps/web
npm install
npm run dev
```

### Arka uç

```bash
cd apps/platform-core-api
npm install
npm run prisma:generate
npm run start:dev
```

## Varsayılan girişler

- Admin: admin@dijitalcam.com / 12345678
- Üretici: uretici@firma.com / 12345678
- Alıcı: alici@musteri.com / 12345678

## Doğrulanmış akışlar

- Rol bazlı rota erişimi
- Teklif / sipariş / üretim / sevkiyat iş akışı
- Mesaj ve bildirim okuma/duplicate prevention davranışları
- Arka uç derleme ve ön yüz build doğrulaması
