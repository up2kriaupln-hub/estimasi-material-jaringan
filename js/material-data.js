// Data referensi material konstruksi, sumber: buku standar konstruksi PLN
// "Konstruksi Disjatim" (PT PLN Distribusi Jawa Timur), diverifikasi lewat
// ekstraksi tabel per halaman (JTM/SUTM/001-018, JTR/TC/001-003).
// Item dengan qty 'menyesuaikan' (Aluminium Binding Wire, Aluminium Tape)
// panjangnya tergantung kondisi lapangan, tidak dijumlah numerik.

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

// Material utama per kategori: qty dihitung deterministik dari jarak (bukan rasio statistik).
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

// Kode konstruksi: judul + BOM (bill of material) per 1 titik/tiang.
const CONSTRUCTION_CODES = {
  'TM-1': {
    title: 'Tiang Penyangga (0°-15°)',
    materials: [
      { nama: 'Cross Arm NP-10 tebal min 5,0 2000 (type tumpu)', satuan: 'Pcs', qty: 1 },
      { nama: 'Arm Tie Type 750 Pipe O 3/4"', satuan: 'Pcs', qty: 1 },
      { nama: 'Bolt & Nut M16x400 + Washer (Double Arm)', satuan: 'Set', qty: 2 },
      { nama: 'Bolt & Nut M16x50 + Washer', satuan: 'Set', qty: 1 },
      { nama: '20 KV Pin Post Insulator', satuan: 'Set', qty: 3 },
      { nama: 'Alluminium Binding Wire 3,2 mm', satuan: 'Mtr', qty: 'menyesuaikan' },
      { nama: 'Alluminium Tape 4,0 mm', satuan: 'Mtr', qty: 'menyesuaikan' },
      { nama: 'Preformed Top Tie 240/150/70/35', satuan: 'Pcs', qty: 3 },
      { nama: 'Ground Wire Clamp type A + Bolt, Wire Clip', satuan: 'Set', qty: 1 },
    ],
  },
  'TM-2': {
    title: 'Tiang Penyangga Ganda (15°-30°)',
    materials: [
      { nama: 'Cross Arm NP-10 tebal min 5,0 2000 (type tumpu)', satuan: 'Pcs', qty: 2 },
      { nama: 'Arm Tie Type 750 Pipe O 3/4"', satuan: 'Pcs', qty: 2 },
      { nama: 'Bolt & Nut M16x400 + Washer (Double Arm)', satuan: 'Set', qty: 3 },
      { nama: '20 KV Pin (Pin Post) Insulator + Steel Pin', satuan: 'Pcs', qty: 6 },
      { nama: 'Alluminium Binding Wire 3,2 mm', satuan: 'Mtr', qty: 'menyesuaikan' },
      { nama: 'Alluminium Tape 4,0 mm', satuan: 'Mtr', qty: 'menyesuaikan' },
      { nama: 'Preformed Side Tie 240/150/70/35', satuan: 'Pcs', qty: 6 },
      { nama: 'Ground Wire Clamp type B + bolt, Preformed, cousen', satuan: 'Set', qty: 1 },
    ],
  },
  'TM-3': {
    title: 'Sambungan ke Tiang Existing (Tarik Akhir, Tanpa Perluasan)',
    materials: [
      { nama: 'Long Rod Insulator 20 KV', satuan: 'Set', qty: 3 },
      { nama: 'Cross Arm NP-10 tebal min 5,0 2000 (type tarik)', satuan: 'Pcs', qty: 1 },
      { nama: 'Arm Tie Type 750 Pipe O 3/4"', satuan: 'Pcs', qty: 1 },
      { nama: 'Bolt & Nut M16x400 + Washer (Double Arm)', satuan: 'Set', qty: 1 },
      { nama: 'U Strap', satuan: 'Pcs', qty: 1 },
      { nama: 'Cross Arm Clevis', satuan: 'Pcs', qty: 3 },
      { nama: 'Bolt & Nut M16x120 + Washer', satuan: 'Set', qty: 3 },
      { nama: 'Dead End Clamp (Strain Clamp)', satuan: 'Set', qty: 3 },
      { nama: 'Ground Wire Clamp type B + bolt, Preformed, cousen', satuan: 'Set', qty: 1 },
    ],
  },
  'TM-4': {
    title: 'Tarik Akhir (Untuk Perluasan)',
    materials: [
      { nama: 'Long Rod Insulator 20 KV', satuan: 'Set', qty: 3 },
      { nama: 'Cross Arm NP-10 tebal min 5,0 2000 (type tarik)', satuan: 'Pcs', qty: 2 },
      { nama: 'Arm Tie Type 750 Pipe O 3/4"', satuan: 'Pcs', qty: 2 },
      { nama: 'Bolt & Nut M16x400 + Washer (Double Arm)', satuan: 'Set', qty: 4 },
      { nama: 'U Strap', satuan: 'Pcs', qty: 1 },
      { nama: 'Cross Arm Clevis', satuan: 'Pcs', qty: 3 },
      { nama: 'Bolt & Nut M16x120 + Washer', satuan: 'Set', qty: 3 },
      { nama: 'Dead End Clamp (Strain Clamp)', satuan: 'Set', qty: 3 },
      { nama: 'Ground Wire Clamp type B + bolt, Preformed, cousen', satuan: 'Set', qty: 1 },
    ],
  },
  'TM-5': {
    title: 'Tiang Peneganan (30°-60°)',
    materials: [
      { nama: '20 KV Pin Post Insulator', satuan: 'Pcs', qty: 1 },
      { nama: 'Long Rod Insulator 20 KV', satuan: 'Set', qty: 6 },
      { nama: 'Cross Arm NP-10 tebal min 5,0 2000 (type tarik)', satuan: 'Pcs', qty: 2 },
      { nama: 'Arm Tie Type 750 (Pipe 3/4")', satuan: 'Set', qty: 2 },
      { nama: 'Bolt & Nuts M16x140 + Washer', satuan: 'Set', qty: 6 },
      { nama: 'Susp.VEE / Cross Arm Clevis / Band Strap', satuan: 'Pcs', qty: 6 },
      { nama: 'Line Tap Connector', satuan: 'Pcs', qty: 3 },
      { nama: 'Dead End Clamp / Preformed Term + Thimble', satuan: 'Pcs', qty: 6 },
      { nama: 'Bolt & Nut M16x400 + Washer (Double Arm)', satuan: 'Set', qty: 4 },
      { nama: 'U Strap', satuan: 'Pcs', qty: 2 },
      { nama: 'Alluminium Binding Wire 3,2 mm', satuan: 'Mtr', qty: 'menyesuaikan' },
      { nama: 'Alluminium Tape 4,0 mm', satuan: 'Mtr', qty: 'menyesuaikan' },
      { nama: 'Preformed Top Tie 240/150/70/35', satuan: 'Pcs', qty: 1 },
      { nama: 'Ground Wire Clamp type B + bolt, Preformed, cousen', satuan: 'Set', qty: 1 },
    ],
  },
  'TM-10': {
    title: 'Tiang Sudut (60°-90°)',
    materials: [
      { nama: '20 KV Pin Post Insulator', satuan: 'Pcs', qty: 2 },
      { nama: 'Long Rod Insulator 20 KV', satuan: 'Pcs', qty: 6 },
      { nama: 'Bolt & Nut M16x400 + Washer (Double Arm)', satuan: 'Pcs', qty: 6 },
      { nama: 'Arm Tie Type 750 Pipe O 3/4"', satuan: 'Pcs', qty: 4 },
      { nama: 'Arm Tie Band, Nut M16 + Washer', satuan: 'Pcs', qty: 1 },
      { nama: 'U Strap', satuan: 'Pcs', qty: 1 },
      { nama: 'Cross Arm NP-10 tebal min 5,0 2000 (type tarik)', satuan: 'Pcs', qty: 4 },
      { nama: 'Line Tap Connector / HH Connector', satuan: 'Pcs', qty: 3 },
      { nama: 'Band Strap / Cross Arm Clevis / Susp. VEE', satuan: 'Pcs', qty: 6 },
      { nama: 'Bolt & Nut M16x140 + Washer', satuan: 'Pcs', qty: 6 },
      { nama: 'Double Arm Band + Bolt & Nuts + Washer', satuan: 'Set', qty: 1 },
      { nama: 'Dead End / Strain Clamp / Preformed Termination', satuan: 'Set', qty: 6 },
      { nama: 'Alluminium Binding Wire 3,2 mm', satuan: 'Mtr', qty: 'menyesuaikan' },
      { nama: 'Alluminium Tape 4,0 mm', satuan: 'Mtr', qty: 'menyesuaikan' },
      { nama: 'Preformed Top Tie 150/70/35 Sqmm', satuan: 'Pcs', qty: 2 },
      { nama: 'Ground Wire Clamp type C + bolt, Preformed, cousen', satuan: 'Set', qty: 1 },
      { nama: 'Wire Clip M.6', satuan: 'Pcs', qty: 4 },
    ],
  },
  'TR-1': {
    title: 'Tiang Penyangga (0°-15°)',
    materials: [
      { nama: 'Suspension Clamp Bracket', satuan: 'Set', qty: 1 },
      { nama: 'Suspension Clamp', satuan: 'Set', qty: 1 },
      { nama: 'Stainless Steel Strip 0,75 Mtr', satuan: 'Pcs', qty: 2 },
      { nama: 'Stopping Buckle', satuan: 'Pcs', qty: 2 },
      { nama: 'Plastic Strap', satuan: 'Pcs', qty: 3 },
      { nama: 'Bundled 35mm - 50cm (kumisan) + Tanda Phasa', satuan: 'Set', qty: 4 },
      { nama: 'Line Tap Connector 70-50 + Heatshrink', satuan: 'Set', qty: 4 },
    ],
  },
  'TR-2': {
    title: 'Tiang Penyangga / Sudut (15°-90°)',
    materials: [
      { nama: 'Tension Bracket', satuan: 'Set', qty: 1 },
      { nama: 'Strain Clamp', satuan: 'Set', qty: 2 },
      { nama: 'Stainless Steel Strip 0,75 Mtr', satuan: 'Pcs', qty: 2 },
      { nama: 'Stopping Buckle', satuan: 'Pcs', qty: 2 },
      { nama: 'Plastic Strap', satuan: 'Pcs', qty: 3 },
      { nama: 'Bundled 35mm - 50cm (kumisan) + Tanda Phasa', satuan: 'Set', qty: 4 },
      { nama: 'Line Tap Connector 70-50 + Heatshrink', satuan: 'Set', qty: 4 },
    ],
  },
  'TR-3': {
    title: 'Tiang Akhir',
    materials: [
      { nama: 'Tension Bracket', satuan: 'Set', qty: 1 },
      { nama: 'Strain Clamp', satuan: 'Set', qty: 1 },
      { nama: 'Stainless Steel Strip 0,75 Mtr', satuan: 'Pcs', qty: 4 },
      { nama: 'Stopping Buckle', satuan: 'Pcs', qty: 4 },
      { nama: 'Plastic Strap', satuan: 'Pcs', qty: 2 },
      { nama: 'PVC 2" - 50 Cm', satuan: 'Pcs', qty: 1 },
      { nama: 'Link', satuan: 'Pcs', qty: 2 },
      { nama: 'Dead End Tubes', satuan: 'Pcs', qty: 4 },
      { nama: 'Bundled 35mm - 50cm (kumisan) + Tanda Phasa', satuan: 'Set', qty: 4 },
      { nama: 'Line Tap Connector 70-50 + Heatshrink', satuan: 'Set', qty: 4 },
    ],
  },
};

const CATEGORY_LABELS = {
  JTM: 'JTM',
  JTR_MURNI: 'JTR Murni',
  NUMPANG: 'JTM & JTR Numpang',
};

// Set kode konstruksi yang dipakai tiap kategori (untuk klasifikasi sudut).
const CODE_SET = {
  JTM: { straight: 'TM-1', double: 'TM-2', tension: 'TM-5', corner: 'TM-10', end: 'TM-4', existing: 'TM-3' },
  NUMPANG: { straight: 'TM-1', double: 'TM-2', tension: 'TM-5', corner: 'TM-10', end: 'TM-4', existing: 'TM-3' },
  JTR_MURNI: { straight: 'TR-1', double: null, tension: null, corner: 'TR-2', end: 'TR-3', existing: null },
};
