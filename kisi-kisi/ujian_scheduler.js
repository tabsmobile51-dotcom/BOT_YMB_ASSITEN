const fs = require('fs');
const { buatTeksKisi, buatTeksKisiFull, buatTeksPraktek, getStoredPraktek } = require('./ujian_logic');
const { ID_GRUP_TUJUAN } = require('./kisi_constants');

/**
 * SCHEDULER OTOMATIS KISI-KISI & PRAKTEK
 * - Kisi-kisi hanya dikirim kalau ada data
 * - Praktek hanya dikirim kalau ada jadwal
 * - Keduanya dicek terpisah — tidak saling blok
 */
async function initUjianScheduler(sock, ID_PRIBADI, botConfig) {
    console.log("✅ Scheduler Kisi-Kisi & Praktek Aktif (Group Only)");

    const LINK_UTAMA = "https://botymbassiten-production.up.railway.app/kisi-kisi";

    setInterval(async () => {
        const now  = new Date();
        const hari  = now.getDay();   // 0=Minggu, 1=Senin, ..., 6=Sabtu
        const jam   = now.getHours();
        const menit = now.getMinutes();

        const hariAktif    = hari >= 0 && hari <= 4; // Minggu–Kamis
        const jamHarian    = jam === 12 && menit === 0;
        const jamFullSabtu = hari === 6 && jam === 8 && menit === 0;

        // ══════════════════════════════════════════════
        // 1. KISI-KISI
        // ══════════════════════════════════════════════
        if (botConfig?.kisiUjian) {

            // Sabtu 08:00 — Rekap mingguan
            if (jamFullSabtu) {
                try {
                    const teksFull = await buatTeksKisiFull();
                    if (teksFull && teksFull.trim().length > 0) {
                        await sock.sendMessage(ID_GRUP_TUJUAN, {
                            text:
                                `🚀 *REKAP KISI-KISI MINGGUAN*\n` +
                                `_Khusus persiapan satu minggu ke depan_\n\n` +
                                teksFull +
                                `\n\n🌐 *Detail & PDF:* ${LINK_UTAMA}`
                        });
                        console.log("Log: Kisi-kisi Full terkirim (Sabtu 08:00)");
                    } else {
                        console.log("Log: Kisi-kisi Full — data kosong, tidak dikirim.");
                    }
                } catch (err) {
                    console.error("Error scheduler kisi-kisi full:", err);
                }
            }

            // Minggu–Kamis 12:00 — Rekap harian
            if (hariAktif && jamHarian) {
                try {
                    const teksHarian = await buatTeksKisi();
                    if (teksHarian && teksHarian.trim().length > 0) {
                        await sock.sendMessage(ID_GRUP_TUJUAN, {
                            text:
                                `📖 *PENGINGAT KISI-KISI HARIAN*\n\n` +
                                teksHarian +
                                `\n\n🌐 *Detail & PDF:* ${LINK_UTAMA}`
                        });
                        console.log("Log: Kisi-kisi Harian terkirim (Minggu–Kamis 12:00)");
                    } else {
                        console.log("Log: Kisi-kisi Harian — data kosong, tidak dikirim.");
                    }
                } catch (err) {
                    console.error("Error scheduler kisi-kisi harian:", err);
                }
            }
        }

        // ══════════════════════════════════════════════
        // 2. PRAKTEK
        // ══════════════════════════════════════════════
        if (botConfig?.praktekUjian) {

            // Minggu–Kamis 12:00 — Info praktek besok
            if (hariAktif && jamHarian) {
                try {
                    const teksPraktek = await buatTeksPraktek();
                    const adaPraktek  = teksPraktek && teksPraktek.trim().length > 5;

                    if (adaPraktek) {
                        // Ada jadwal praktek — ambil penjelasan tambahan jika ada
                        let extraInfo = "";
                        try {
                            const dataPraktekRaw = fs.readFileSync('/app/auth_info/data_praktek.json', 'utf-8');
                            const jsonPraktek    = JSON.parse(dataPraktekRaw);
                            const hariBerikutnya = hari + 1;

                            if (jsonPraktek[hariBerikutnya]?.penjelasan) {
                                extraInfo = `\n\n📝 *Penjelasan:* ${jsonPraktek[hariBerikutnya].penjelasan}`;
                            }
                        } catch (e) {
                            console.log("Skip info tambahan praktek: file tidak ada atau error.");
                        }

                        await sock.sendMessage(ID_GRUP_TUJUAN, {
                            text: teksPraktek + extraInfo + `\n\n🔗 *Link:* ${LINK_UTAMA}`
                        });
                        console.log("Log: Jadwal Praktek terkirim");

                    } else {
                        // Tidak ada praktek besok — cek apakah ada di hari berikutnya
                        const dataPraktek  = getStoredPraktek();
                        const dayNames     = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
                        let   infoNext     = "";
                        const mulaiCari    = hari + 2; // mulai dari 2 hari ke depan

                        for (let i = mulaiCari; i <= 5; i++) {
                            const jadwal = dataPraktek[i];
                            // Skip kalau kosong atau eksplisit "Tidak ada"
                            if (jadwal && typeof jadwal === 'string' && !jadwal.toLowerCase().includes("tidak ada")) {
                                infoNext = `\n\nUjian praktek berikutnya ada di hari *${dayNames[i]}*.`;
                                break;
                            }
                            // Format object: { mapel, penjelasan }
                            if (jadwal && typeof jadwal === 'object' && jadwal.mapel && !jadwal.mapel.toLowerCase().includes("tidak ada")) {
                                infoNext = `\n\nUjian praktek berikutnya ada di hari *${dayNames[i]}* (${jadwal.mapel}).`;
                                break;
                            }
                        }

                        if (infoNext) {
                            await sock.sendMessage(ID_GRUP_TUJUAN, {
                                text:
                                    `🔔 *INFO PRAKTEK*\n` +
                                    `Besok tidak ada ujian praktek.\n` +
                                    `Tetap fokus belajar materi lainnya ya!` +
                                    infoNext
                            });
                            console.log("Log: Info 'tidak ada praktek besok' terkirim");
                        } else {
                            console.log("Log: Tidak ada praktek & tidak ada jadwal berikutnya — skip kirim.");
                        }
                    }
                } catch (err) {
                    console.error("Error scheduler praktek:", err);
                }
            }
        }

    }, 60000); // cek setiap 1 menit
}

module.exports = { initUjianScheduler };
