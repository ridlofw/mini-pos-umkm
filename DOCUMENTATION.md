# Dokumentasi Proyek Mini POS UMKM (WarungKu)

## 1. Deskripsi Proyek
**WarungKu** adalah aplikasi Point of Sales (POS) berbasis web yang dirancang khusus untuk UMKM. Aplikasi ini menggunakan pendekatan **Offline-First**, artinya aplikasi dapat berfungsi sepenuhnya tanpa koneksi internet. Data disimpan secara lokal di browser dan akan disinkronisasi ke cloud (Supabase) secara otomatis ketika koneksi internet tersedia.

## 2. Teknologi yang Digunakan
*   **Frontend Framework**: Next.js 16 (App Router)
*   **Bahasa Pemrograman**: TypeScript / React 19
*   **Styling**: Tailwind CSS 4
*   **Database Lokal (Offline)**: Dexie.js (IndexedDB Wrapper)
*   **Database Cloud (Online)**: Supabase (PostgreSQL)
*   **Fitur Tambahan**:
    *   `react-zxing`: Untuk scan barcode menggunakan kamera.
    *   `chart.js`: Visualisasi data penjualan.
    *   `jspdf`: Mencetak struk belanja.

## 3. Arsitektur & Alur Data (Offline-First)
Aplikasi ini memprioritaskan database lokal untuk kecepatan dan ketahanan.

1.  **Baca Data**: Semua data produk dan riwayat penjualan diambil langsung dari **Dexie (IndexedDB)** di browser pengguna. Ini membuat aplikasi sangat cepat dan bisa dibuka tanpa internet.
2.  **Tulis Data**: Saat kasir melakukan transaksi atau update stok, perubahan disimpan ke **Dexie** terlebih dahulu.
3.  **Sinkronisasi (`lib/sync.ts`)**:
    *   **Upload**: Sistem secara berkala mengecek data yang belum tersinkron (`synced: 0`) di tabel `pending_sales` dan `pending_product_changes`, lalu mengunggahnya ke Supabase.
    *   **Download**: Sistem mengambil data produk terbaru dari Supabase. Jika ada konflik (misal: data di server lebih baru), data lokal akan diperbarui, KECUALI jika ada perubahan lokal yang belum terupload.

## 4. Struktur Database

### A. Database Lokal (Dexie.js)
Didefinisikan di `lib/db.ts`.

1.  **`products`**: Menyimpan data produk untuk akses cepat.
    *   Columns: `barcode` (PK), `name`, `price`, `stock`, `updated_at`, `is_active`.
2.  **`pending_sales`**: Menyimpan transaksi yang terjadi saat offline/online sebelum masuk ke server.
    *   Columns: `local_sale_id` (PK), `items`, `total_amount`, `paid_at`, `synced` (0/1).
3.  **`pending_product_changes`**: Antrian perubahan produk (tambah/edit/hapus) untuk disinkronkan.
    *   Columns: `id` (PK), `barcode`, `action`, `product_data`, `synced`.

### B. Database Cloud (Supabase)
Tabel yang perlu dibuat di Supabase:

**1. Tabel `products`**
```sql
create table public.products (
  barcode text not null primary key,
  name text not null,
  price numeric not null default 0,
  stock integer not null default 0,
  is_active boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  deleted_at timestamp with time zone
);
```

**2. Tabel `sales`**
```sql
create table public.sales (
  id uuid not null default gen_random_uuid() primary key,
  total_amount numeric not null,
  paid_at timestamp with time zone default now(),
  created_at timestamp with time zone default now()
);
```

**3. Tabel `sale_items`**
```sql
create table public.sale_items (
  id uuid not null default gen_random_uuid() primary key,
  sale_id uuid references public.sales(id),
  product_barcode text references public.products(barcode),
  quantity integer not null,
  price_each numeric not null,
  subtotal numeric not null
);
```

## 5. Struktur Folder Penting

*   **`app/`**: Halaman-halaman aplikasi (Next.js App Router).
    *   `cashier/`: Halaman Kasir (Scan barcode, keranjang belanja).
    *   `inventory/`: Halaman Manajemen Stok (Tambah/Edit/Hapus produk).
    *   `dashboard/`: Halaman Laporan Penjualan.
*   **`lib/`**: Logika inti aplikasi.
    *   `db.ts`: Konfigurasi database lokal (Dexie).
    *   `sync.ts`: Logika sinkronisasi dua arah (Local <-> Cloud).
    *   `supabase.ts`: Client koneksi ke Supabase.
*   **`components/`**: Komponen UI yang digunakan ulang (Navbar, BarcodeScanner, dll).

## 6. Cara Instalasi & Menjalankan

1.  **Install Dependencies**:
    ```bash
    npm install
    ```

2.  **Setup Environment Variables**:
    Buat file `.env.local` dan isi dengan kredensial Supabase Anda:
    ```env
    NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
    NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
    ```

3.  **Jalankan Server Development**:
    ```bash
    npm run dev
    ```
    Buka [http://localhost:3000](http://localhost:3000) di browser.

## 7. Catatan Penting
*   Aplikasi ini membutuhkan browser modern yang mendukung **IndexedDB**.
*   Untuk fitur scan barcode, pastikan izin kamera diberikan pada browser.
