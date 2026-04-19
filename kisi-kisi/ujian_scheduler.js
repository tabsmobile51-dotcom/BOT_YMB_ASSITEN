const fs = require('fs');
const { buatTeksKisi, buatTeksKisiFull, buatTeksPraktek, getStoredPraktek } = require('./ujian_logic');
const { ID_GRUP_TUJUAN } = require('./kisi_constants');

/**
 * SCHEDULER OTOMATIS KISI-KISI & PRAKTEK
 */
async function initUjianScheduler(sock, ID_PRIBADI, botConfig) {
    console.log("✅ Scheduler Kisi-Kisi & Praktek Aktif (Group Only)");
    
    const LINK_UTAMA = "https://botymbassiten-production.up.railway.app/kisi-kisi";

    setInterval(async () => {
        const now = new Date();
        const hari = now.getDay(); // 0=Minggu, 1=Senin, ..., 6=Sabtu
        const jam = now.getHours();
        const menit = now.getMinutes();

        // --- 1. LOGIKA KISI-KISI ---
        if (botConfig && botConfig.kisiUjian) {
            // Sabtu Jam 08:00 (Full Rekap)
            if (hari === 6 && jam === 8 && menit === 0) {
                const teksFull = await buatTeksKisiFull();
                await sock.sendMessage(ID_GRUP_TUJUAN, { 
                    text: "🚀 *REKAP KISI-KISI MINGGUAN*\n_Khusus persiapan satu minggu ke depan_\n\n" + teksFull + `\n\n🌐 *Detail & PDF:* ${LINK_UTAMA}`
                });
                console.log("Log: Kisi-kisi Full terkirim (Sabtu)");
            }
            // Minggu-Kamis Jam 12:00 (Harian)
            if (hari >= 0 && hari <= 4 && jam === 12 && menit === 0) {
                const teksHarian = await buatTeksKisi();
                await sock.sendMessage(ID_GRUP_TUJUAN, { 
                    text: "📖 *PENGINGAT KISI-KISI HARIAN*\n\n" + teksHarian + `\n\n🌐 *Detail & PDF:* ${LINK_UTAMA}`
                });
                console.log("Log: Kisi-kisi Harian terkirim (Minggu-Kamis)");
            }
        }

        // --- 2. LOGIKA PRAKTEK ---
        if (botConfig && botConfig.praktekUjian) {
            // Minggu-Kamis Jam 12:00
            if (hari >= 0 && hari <= 4 && jam === 12 && menit === 0) {
                const teksPraktek = await buatTeksPraktek();
                
                // Ambil info tambahan dari data_praktek.json
                let extraInfo = "";
                try {
                    const dataPraktekRaw = fs.readFileSync('/app/auth_info/data_praktek.json', 'utf-8');
                    const jsonPraktek = JSON.parse(dataPraktekRaw);
                    const besok = hari + 1;
                    if (jsonPraktek[besok] && jsonPraktek[besok].penjelasan) {
                        extraInfo = `\n\n📝 *Penjelasan:* ${jsonPraktek[besok].penjelasan}`;
                    }
                } catch (e) {
                    console.log("Skip info tambahan: file tidak ada atau error.");
                }

                if (teksPraktek && teksPraktek.trim().length > 0) {
                    // Jika ada jadwal praktek untuk besok
                    await sock.sendMessage(ID_GRUP_TUJUAN, { 
                        text: teksPraktek + extraInfo + `\n\n🔗 *Link:* ${LINK_UTAMA}` 
                    });
                    console.log("Log: Jadwal Praktek terkirim");
                } else {
                    const dataPraktek = getStoredPraktek();
                    let infoNext = "";
                    const dayNames = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'];
                    const hariBerikutnya = hari + 2; 
                    for (let i = hariBerikutnya; i <= 5; i++) {
                        if (dataPraktek[i] && !dataPraktek[i].includes("Tidak ada")) {
                            infoNext = `\n\nBesok tidak ada praktek. Ujian praktek berikutnya ada di hari *${dayNames[i]}*.`;
                            break;
                        }
                    }
                    
                    if (infoNext) {
                        await sock.sendMessage(ID_GRUP_TUJUAN, { 
                            text: `🔔 *INFO PRAKTEK*\nBesok tidak ada ujian praktek. Tetap fokus belajar materi lainnya ya!${infoNext}` 
                        });
                    }
                }
            }
        }
    }, 60000); 
}

module.exports = { initUjianScheduler };
