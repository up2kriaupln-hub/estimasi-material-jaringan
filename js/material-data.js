// Data referensi material & harga, sumber: sheet "RAB KR JASA" dan
// "Perbandingan Harga MDU" pada file UP2K RIAU MDU JASA 2026 Vol.16 Penerbitan
// KHS v7.xlsx. Harga Jasa per kode konstruksi dan resep Material Non Utama
// diambil dari formula asli sheet (mode dropdown "LENGKAP" di cell R10),
// bukan estimasi statistik.

const SPAN = {
  JTM: 50,
  JTR_MURNI: 45,
  NUMPANG: 50,
};

const WAREHOUSE = {
  lat: 0.466918,
  lng: 101.367498,
  nama: 'Gudang PLN Garuda Sakti Pekanbaru',
};

// Harga satuan Material Utama 2026 (sheet "Perbandingan Harga MDU").
const MATERIAL_UTAMA_PRICES = {
  'Conductor AAAC-S 150mm2': 37544,
  'Tiang Besi TM 12m': 4383957,
  'Tiang Besi TR 09m': 2973790,
  'Kabel Twisted (SUTR)': 84115, // LVTC 3x70+1x70mm2
  'Kabel SKUTR (Numpang)': 84115,
};

const TRAFO_PRICES = {
  50: 31341650,
  100: 41094370,
  160: 60471950,
};

const MAIN_MATERIALS = {
  JTM: [
    { nama: 'Tiang Besi TM 12m', satuan: 'Btg', qtyFrom: 'poles' },
    { nama: 'Conductor AAAC-S 150mm2', satuan: 'M', qtyFrom: 'distance' },
  ],
  JTR_MURNI: [
    { nama: 'Tiang Besi TR 09m', satuan: 'Btg', qtyFrom: 'poles' },
    { nama: 'Kabel Twisted (SUTR)', satuan: 'M', qtyFrom: 'distance' },
  ],
  NUMPANG: [
    { nama: 'Tiang Besi TM 12m', satuan: 'Btg', qtyFrom: 'poles' },
    { nama: 'Conductor AAAC-S 150mm2', satuan: 'M', qtyFrom: 'distance' },
    { nama: 'Kabel SKUTR (Numpang)', satuan: 'M', qtyFrom: 'distance' },
  ],
};

// Kode konstruksi: judul + harga Jasa (RAB I.2/II.2). Kode TR juga punya
// harga Material sendiri (selain Material Utama tiang/kabel).
const CONSTRUCTION_CODES = {
  'TM-1': { title: 'Tiang Penyangga (0°-15°)', jasaHarga: 195745, materialHarga: 0 },
  'TM-2': { title: 'Tiang Penyangga Ganda (15°-30°)', jasaHarga: 260703, materialHarga: 0 },
  'TM-3': { title: 'Sambungan ke Tiang Existing (Tiang Awal)', jasaHarga: 155747, materialHarga: 0 },
  'TM-4': { title: 'Tarik Akhir (Tiang Akhir)', jasaHarga: 156447, materialHarga: 0 },
  'TM-5': { title: 'Tiang Peneganan (Tarik Ganda, 30°-60°)', jasaHarga: 389956, materialHarga: 0 },
  'TM-10': { title: 'Tiang Sudut (60°-90°)', jasaHarga: 527285, materialHarga: 0 },
  'TR-1': { title: 'Tiang Penyangga (0°-15°)', jasaHarga: 74815, materialHarga: 9812 },
  'TR-2': { title: 'Tiang Belokan (15°-90°)', jasaHarga: 121370, materialHarga: 9812 },
  'TR-3': { title: 'Tiang Awal / Akhir', jasaHarga: 79778, materialHarga: 118559 },
};

// Resep Material Non Utama per kode (qty per titik), hasil parse formula
// kolom Volume RAB I.4 (JTM) / II.4 (JTR). Harga satuan dari kolom Harga
// Satuan Material RAB pada mode "LENGKAP".
const NON_UTAMA_RECIPE = {
  JTM: [
    { nama: 'Arm Brace Besi L 50.50.50 x 750mm (Galvanis)', satuan: 'Bh', harga: 126374, per_code: { 'TM-1': 2, 'TM-2': 2, 'TM-3': 2, 'TM-4': 2, 'TM-5': 2, 'TM-10': 4 } },
    { nama: 'Band For Arm Brace (Galvanized)', satuan: 'Bh', harga: 57492, per_code: { 'TM-1': 1, 'TM-2': 1, 'TM-3': 1, 'TM-4': 1, 'TM-5': 1, 'TM-10': 2 } },
    { nama: 'Bolt & Nut M16x50 + Washer Galvanis', satuan: 'Set', harga: 13042, per_code: { 'TM-1': 6, 'TM-2': 5, 'TM-3': 5, 'TM-4': 4, 'TM-5': 5, 'TM-10': 10 } },
    { nama: 'Cross Arm UNP 100x50x5x2000mm (Hot dip galvanis)', satuan: 'Bh', harga: 660000, per_code: { 'TM-1': 1, 'TM-2': 2, 'TM-3': 2, 'TM-4': 2, 'TM-5': 2, 'TM-10': 4 } },
    { nama: 'Double Arm Bolt & Nut M16x250mm + Washer Galvanis', satuan: 'Set', harga: 24200, per_code: { 'TM-3': 4, 'TM-4': 4, 'TM-5': 4, 'TM-10': 10 } },
    { nama: 'Double Ties 150mm', satuan: 'Bh', harga: 205426, per_code: { 'TM-2': 6 } },
    { nama: 'F-neck Plastik Top Ties 150mm', satuan: 'Bh', harga: 115000, per_code: { 'TM-1': 3, 'TM-5': 1, 'TM-10': 2 } },
    { nama: 'Joint Sleeve AL 150mm', satuan: 'Bh', harga: 63200, per_code: { 'TM-5': 3, 'TM-10': 3 } },
    { nama: 'Klem Beugel', satuan: 'Set', harga: 51750, per_code: { 'TM-1': 1 } },
  ],
  JTR_MURNI: [
    { nama: 'Dead End Assembly (komplit Plastic Strap)', satuan: 'Set', harga: 127307, per_code: { 'TR-3': 1 } },
    { nama: 'Large Angle Assembly (komplit + Plastic Strap)', satuan: 'Set', harga: 127307, per_code: { 'TR-2': 2 } },
    { nama: 'Link', satuan: 'Bh', harga: 4167, per_code: { 'TR-3': 2 } },
    { nama: 'Stainless Steel Strap', satuan: 'Mtr', harga: 14711, per_code: { 'TR-1': 1.2, 'TR-2': 1.2, 'TR-3': 2.7 } },
    { nama: 'Suspension / Small Angle Assembly (komplit Plastic Strap)', satuan: 'Set', harga: 84341, per_code: { 'TR-1': 1 } },
  ],
};
// JTM & JTR Numpang memakai tiang TM, jadi pakai resep JTM yang sama.
NON_UTAMA_RECIPE.NUMPANG = NON_UTAMA_RECIPE.JTM;

const CATEGORY_LABELS = {
  JTM: 'JTM',
  JTR_MURNI: 'JTR Murni',
  NUMPANG: 'JTM & JTR Numpang',
};

// Set kode konstruksi yang dipakai tiap kategori (untuk klasifikasi sudut).
const CODE_SET = {
  JTM: { straight: 'TM-1', double: 'TM-2', tension: 'TM-5', corner: 'TM-10', end: 'TM-4', existing: 'TM-3' },
  NUMPANG: { straight: 'TM-1', double: 'TM-2', tension: 'TM-5', corner: 'TM-10', end: 'TM-4', existing: 'TM-3' },
  JTR_MURNI: { straight: 'TR-1', double: null, tension: null, corner: 'TR-2', end: 'TR-3', existing: 'TR-3' },
};
