import {
  ORDER_STAGES,
  type Demand,
  type Order,
  type OrderStage,
  type Quote,
  type Stat,
  type TimelineEvent,
} from '../../entities/domain'
import type { ToastItem } from '../ui/toast'

export const statsByRole: Record<string, Stat[]> = {
  BUYER: [
    { label: 'Acik Talep', value: '12', trend: '+3 son 7 gun' },
    { label: 'Bekleyen Teklif', value: '27', trend: '+11 yeni teklif' },
    { label: 'Aktif Siparis', value: '9', trend: '2 kritik teslimat' },
    { label: 'Zamaninda Teslim', value: '96%', trend: '+2.1 puan' },
  ],
  MANUFACTURER: [
    { label: 'Yeni Talep', value: '18', trend: '4 oncelikli talep' },
    { label: 'Acil Teklif', value: '7', trend: 'ortalama 2.4 saat' },
    { label: 'Uretimde Is', value: '31', trend: 'kapasite %82' },
    { label: 'Hat Verimliligi', value: '93%', trend: '+1.8 puan' },
  ],
  ADMIN: [
    { label: 'Toplam Firma', value: '248', trend: '+14 bu ay' },
    { label: 'Aktif Kullanici', value: '1,842', trend: '+8.4% haftalik' },
    { label: 'Acil Olay', value: '3', trend: '-2 dunden iyi' },
    { label: 'SLA Uyum', value: '99.2%', trend: '+0.4 puan' },
  ],
}

export const demands: Demand[] = [
  {
    id: 'DM-9134',
    title: 'Lamine Cephe Camlari - Ankara Plaza',
    glassType: 'Lamine',
    quantity: '1,200 m2',
    dueDate: '2026-08-22',
    status: 'quoting',
  },
  {
    id: 'DM-9107',
    title: 'Temperli Vitrin Seti - Zincir Magaza',
    glassType: 'Temperli',
    quantity: '460 m2',
    dueDate: '2026-08-15',
    status: 'open',
  },
  {
    id: 'DM-9098',
    title: 'Isicam Konut Projesi - Etap 3',
    glassType: 'Isicam',
    quantity: '2,800 m2',
    dueDate: '2026-09-05',
    status: 'closed',
  },
]

export const quotes: Quote[] = [
  {
    id: 'QT-501',
    supplier: 'Eksen Cam Sanayi',
    amount: 'TRY 1,248,000',
    leadTime: '11 gun',
    validity: '2026-08-12',
    status: 'submitted',
  },
  {
    id: 'QT-487',
    supplier: 'Marmara Isicam',
    amount: 'TRY 1,311,500',
    leadTime: '9 gun',
    validity: '2026-08-11',
    status: 'revised',
  },
  {
    id: 'QT-455',
    supplier: 'Nova Temper',
    amount: 'TRY 1,286,000',
    leadTime: '10 gun',
    validity: '2026-08-14',
    status: 'accepted',
  },
]

export const orders: Order[] = [
  {
    id: 'OR-7042',
    product: 'Lamine Cephe Camlari',
    buyer: 'Arkline Aluminyum',
    manufacturer: 'Eksen Cam Sanayi',
    eta: '2026-08-18',
    stage: 'ISLEME',
  },
  {
    id: 'OR-7009',
    product: 'Temperli Vitrin Seti',
    buyer: 'Pergo Mobilya',
    manufacturer: 'Nova Temper',
    eta: '2026-08-12',
    stage: 'SEVKE_HAZIR',
  },
]

const actorByStage: Partial<Record<OrderStage, string>> = {
  TALEP_ALINDI: 'Sistem',
  TEKLIF_HAZIRLANIYOR: 'Satis Uzmani',
  SIPARIS_ONAYLANDI: 'Alici',
  URETIME_ALINDI: 'Planlama',
  KESIM: 'Kesim Hatti',
  ISLEME: 'Isleme Hatti',
  TEMPER: 'Temper Firini',
  LAMINASYON: 'Laminasyon Ekibi',
  KALITE_KONTROL: 'Kalite Muhendisi',
  PAKETLEME: 'Paketleme Ekibi',
  SEVKE_HAZIR: 'Lojistik',
  YOLDA: 'Nakliye Operasyonu',
  TESLIM_EDILDI: 'Alici Teslim Alimi',
}

export const timeline: TimelineEvent[] = ORDER_STAGES.slice(0, 6).map((stage, index) => {
  const day = String(index + 1).padStart(2, '0')
  return {
    stage,
    timestamp: `2026-08-${day} 09:${String(index).padStart(2, '0')}`,
    actor: actorByStage[stage] ?? 'Operasyon',
    note: 'Asama kaydi basariyla tamamlandi.',
  }
})

export const notifications: ToastItem[] = [
  {
    id: 'NT-1',
    type: 'success',
    title: 'Teklif kabul edildi',
    description: 'QT-455 teklifi siparise donustu.',
  },
  {
    id: 'NT-2',
    type: 'warning',
    title: 'Termin riski',
    description: 'OR-7042 siparisinde isleme adimi hedefe yakin.',
  },
  {
    id: 'NT-3',
    type: 'info',
    title: 'Yeni talep atandi',
    description: 'DM-9134 talebi teklif havuzuna eklendi.',
  },
]
