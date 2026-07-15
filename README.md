# Estimasi Material Jaringan Distribusi (JTM/JTR)

Alat bantu klik-di-peta untuk memperkirakan jumlah tiang dan material jaringan
distribusi (JTM, JTR Murni, JTM & JTR Numpang) berdasarkan jarak rute.

## Cara menjalankan

**Opsi 1 — buka langsung (paling simpel)**

Klik dua kali `index.html`, akan terbuka di browser. Cocok untuk pemakaian di
laptop sendiri.

**Opsi 2 — server lokal (bisa diakses dari HP)**

Di folder ini, jalankan:

```
python -m http.server 8000
```

Lalu buka `http://localhost:8000` di laptop, atau `http://<IP-laptop>:8000`
dari HP yang terhubung ke WiFi yang sama (cek IP laptop dengan `ipconfig`).

## Cara pakai

1. (Opsional) Klik **📍 Lokasi Saya** untuk memusatkan peta ke posisi GPS saat
   ini — berguna kalau sedang di lapangan.
2. Klik titik di peta mengikuti rute jaringan (titik A, B, C, dst). Jarak
   kumulatif muncul otomatis.
3. Klik **Selesai Menitik**, lalu pilih kategori: **JTM**, **JTR Murni**, atau
   **JTM & JTR Numpang**.
4. Klik **Hitung Material** untuk melihat estimasi jumlah tiang, material, dan
   jarak transportasi, atau **Ulangi Penitikan** untuk menggambar ulang.
5. Klik **Export ke Excel** untuk mengunduh hasilnya sebagai file `.xlsx`.

## Jarak transportasi

Titik akhir rute yang kamu klik dianggap sebagai lokasi tujuan. Aplikasi
otomatis menghitung jarak jalan darat dari **Gudang PLN Garuda Sakti
Pekanbaru** (titik merah di peta) ke lokasi itu, memakai layanan routing
gratis OSRM (`router.project-osrm.org`) — butuh koneksi internet. Rute lewat
sungai (seperti beberapa lokasi UP2K yang butuh transportasi darat + sungai)
tidak diperhitungkan otomatis; verifikasi manual untuk lokasi seperti itu.

## Catatan tentang angka estimasi

- Jumlah tiang dan material utama (conductor/kabel) dihitung langsung dari
  jarak rute: span 50m untuk JTM & Numpang, 45m untuk JTR Murni.
- Daftar Jenis Konstruksi (isolator, cross arm, dll di `js/material-data.js`) adalah
  **rasio rata-rata (median) per km** dari 77 lokasi historis di sheet `DB KR`
  (`UP2K RIAU MDU JASA 2026 Vol.16...xlsx`) — bukan hitungan presisi per
  konfigurasi tiang, jadi anggap sebagai perkiraan awal yang bisa disesuaikan
  di lapangan.
- Item yang sangat tergantung kondisi tanah (misal pancang khusus
  gambut/lumpur) sengaja tidak dimasukkan karena tidak berlaku umum.
