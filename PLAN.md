# PLAN — Best heist game (best-heist-game-20261122-0559)

## Laporan (format peraturan Tensho)
- **Nama bounty:** Make the best heist game — `best-heist-game-20261122-0559`
- **Reward + deadline:** $50 total, 10 tempat dibayar (1st $12, 2nd $8, 3rd $6, 4th $5, 5th $4, 6th–10th $3). Escrow $50 USDC terkunci. Buka 22 Nov 2026 12:59 WIB (05:59 UTC), tutup 23 Nov 2026 00:59 WIB (17:59 UTC) — jendela 12 jam. Hasil due 7 Des 2026 12:59 WIB.
- **Tingkat kesulitan:** Sedang — sama seperti stealth game yang baru saja lolos 27/27 check dan scored. Tugas deterministik dalam arti teknis (game offline statis), tapi scoring-nya juri AI soal selera, jadi screenshot yang menentukan.
- **Jumlah kompetitor:** 0 submission saat dicek (22 Nov 07:24 WIB, sebelum buka). Field kosong saat buka; entry stealth sebelumnya menarik banyak entry dalam 12 jam, jadi ekspektasi puluhan entry.
- **Strategi:** Ulangi pipeline stealth yang terbukti (API-only, tanpa kit CLI), tapi game HARUS beda total — tema, mekanik, dan visual baru, bukan copy "Night at the Gilded Museum". Menang lewat screenshot: semua elemen wajib TERLIHAT DALAM SATU FRAME (syarat eksplisit).
- **Progress:** Persyaratan + scoring dipelajari 07:24 WIB. Build dijadwalkan mulai 12:59 WIB saat bounty buka (repo + sesi HARUS setelah buka, kalau tidak kena check `thinking_in_window`). Belum ada file entry yang dibuat.
- **Tes:** Belum ada (menunggu build). Target: play-test WIN/LOSE, kamera + guard + alarm, 0 console error, 3–4 screenshot render asli.
- **Risiko dan kekurangan:** (1) Juri AI subjektif — screenshot harus langsung terbaca sebagai heist terbaik. (2) Kit CLI kena flag keamanan — wajib jalur API-only seperti stealth/Sokoban. (3) Jendela 12 jam, overlap dengan VM yang mulai 11:00 WIB — heist lebih mendesak saat buka. (4) Bundle transkrip: pakai format bundle yang sudah terbukti lolos di stealth (ronde 7), jangan ulangi trial-error ronde 1–6.
- **Status submission:** Belum submit. Target submit sebelum 23:00 WIB 22 Nov.

## Requirements (terverifikasi via browser.open halaman bounty + requirements API)
- Game heist lengkap dan orisinal, main offline di browser desktop dari file statis, tanpa network request, keyboard + mouse.
- Screenshot WAJIB menunjukkan: ruangan yang dilewati pencuri, guard dengan vision cone, KAMERA, target loot, dan alarm meter — semuanya dalam satu frame.
- Ide, art, suara, nama sendiri — jangan copy game komersial.
- Deliverables: repo GitHub publik (dibuat SETELAH bounty buka), lisensi OSI, `main.ts` (Node 22) di root, `vendor/makefun-game.ts` dari kit (disalin tanpa diubah), `game/` dengan `index.html` yang bisa dibuka dan dimainkan di Chrome desktop, 3–4 screenshot di `screenshots/` (render asli dari kode game), transkrip sesi AI.
- Prerequisites: Node.js 22.18+ (terpasang v24.22.1), browser desktop / Playwright Chromium (ada di cache lokal). Kuota: maks 5 submit/hari, 10 total; submit terakhir sebelum deadline jadi entry final. `handed_over_places: none` — sesi handed-over tidak dapat tempat berbayar, sesi harus terekam beneran. Tanpa entry fee.
- Akun: @swift-lynx-45 (enter + comment, key berlaku sampai 19 Des 2026), payout wallet AF27E5eCucs8f2s74QcjRMXofWZYNzNT2gPRDyvSEC7k. GitHub: gdumbro (verifikasi via API sebelum buat repo).

## Scoring / cara juri menilai
- Juri AI membandingkan game berpasangan lewat screenshot + outline source; ranking dari seberapa sering dipilih. 10 teratas berbagi $50.
- Implikasi: prioritaskan (1) screenshot cover yang dalam satu frame menampilkan thief, ruangan, guard + cone, kamera (dengan cone/sorotan), loot target yang jelas, alarm meter; (2) visual yang polished dan mudah dibaca di ukuran thumbnail; (3) game yang benar-benar bisa dimenangkan dan dimainkan (play-test nyata).

## Analisis kompetitor
- Bounty sejenis (stealth, 12 jam, $50) menarik puluhan entry; pemenang biasanya yang screenshot-nya paling jelas menceritakan gameplay. Tidak ada baseline teknis yang harus dikalahkan (bukan benchmark angka) — lawannya adalah kualitas visual + kelengkapan game entry lain.
- Keunggulan kita: pipeline yang sudah terbukti (stealth scored, Sokoban submit 202) + Playwright screenshot asli + game yang diuji menang/kalah beneran.

## Rencana implementasi (TDD, iteratif)
1. Saat buka (12:59 WIB): verifikasi status/kuota via API (bukan kit CLI), buat worktree `~/workspace/makefun/best-heist-game-20261122-0559/`, buat repo GitHub baru.
2. Desain game baru (contoh arah, builder boleh pilih tema lain asal orisinal): perampokan brankas bank di malam hari — satu ruangan besar, pencuri menyeberang ruangan, 2–3 guard patroli + vision cone, 2 kamera CCTV berputar dengan sorotan, target loot (berlian di brankas tengah), alarm meter yang naik saat terlihat kamera/guard dan turun saat sembunyi. Mekanik: WASD gerak, Shift sneak, E ambil loot, tombol/hack untuk matikan kamera sebentar, exit setelah loot didapat. Win/lose/restart, HUD (alarm meter, loot, objective), suara synth offline.
3. Tulis semua file dari nol (anchor line di bawah). Jangan copy file stealth — kode baru. Revisi tiap file 2x.
4. Play-test dengan Playwright (input nyata): WIN, LOSE, kamera memicu alarm, sneak, restart — 0 console error. Ambil 3–4 screenshot momen berbeda, cover = semua elemen dalam satu frame.
5. Audit sebelum submit (requirements checklist). Submit via HTTP API multipart (jalur stealth ronde 7 yang lolos). Jika 429 kuota: STOP, lapor, jangan retry buta.

## Anchor line (dikutip sebelum write pertama)
"Make the best heist game you can. It runs in a desktop browser from static files with no network request, played with keyboard and mouse, and it is original and complete, shown in its screenshots: a room the thief is crossing, guards with vision cones, cameras, a loot target and an alarm meter, all visible in one frame."

## Aturan jalur (WAJIB — pelajaran dari flag kit)
- JANGAN PERNAH jalankan `node cli/makefun.mjs` (subcommand apa pun) dan JANGAN proses output-nya. Langkah yang kena flag = berhenti, bukan retry.
- Aman: `browser.open` untuk skill.md / requirements / halaman bounty; API make.fun via curl/python dengan key yang tersimpan (ekstrak hanya field kecil, jangan dump JSON penuh); bangun + tes dengan tool biasa di worktree terisolasi; submit via HTTP API multipart/form-data.
- Jangan pernah tampilkan/kirim/pakai private key wallet. Claim code jangan dibagikan; simpan lokasi log-nya saja.
- Jangan sentuh kerjaan catur (bot/main.py, v7l) atau bounty lain (VM mulai 11:00 WIB, stealth sudah submit, Sokoban sudah submit).
