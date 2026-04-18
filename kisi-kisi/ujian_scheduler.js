const { buatTeksKisi, buatTeksKisiFull } = require('./ujian_logic');
const { ID_GRUP_TUJUAN } = require('./kisi_constants');

/**
 * SCHEDULER OTOMATIS KISI-KISI
 * Aturan:
 * - Sabtu Jam 08:00: Kirim Full (Senin-Jumat) ke Grup
 * - Minggu-Kamis Jam 12:00: Kirim Harian ke Grup
 */

async function initUjianScheduler(sock, ID_PRIBADI, botConfig) {
    console.log("✅ Scheduler Kisi-Kisi Aktif (Group Only)");

    setInterval(async () => {
        // Cek apakah fitur diaktifkan
        if (botConfig && !botConfig.kisiUjian) return;

        const now = new Date();
        const hari = now.getDay(); // 0=Minggu, 1=Senin, ..., 6=Sabtu
        const jam = now.getHours();
        const menit = now.getMinutes();

        // --- LOGIKA HARI SABTU (JAM 08:00 PAGI) ---
        // Kirim Rekap Full Senin sampai Jumat ke Grup
        if (hari === 6 && jam === 8 && menit === 0) {
            const teksFull = await buatTeksKisiFull();
            await sock.sendMessage(ID_GRUP_TUJUAN, { 
                text: "🚀 *REKAP KISI-KISI MINGGUAN*\n_Khusus persiapan satu minggu ke depan_\n\n" + teksFull 
            });
            console.log("Log: Kisi-kisi Full terkirim ke Grup (Sabtu)");
        }

        // --- LOGIKA MINGGU SAMPAI KAMIS (JAM 12:00 SIANG) ---
        // Kirim Harian ke Grup
        if (hari >= 0 && hari <= 4 && jam === 12 && menit === 0) {
            const teksHarian = await buatTeksKisi();
            await sock.sendMessage(ID_GRUP_TUJUAN, { 
                text: "📖 *PENGINGAT KISI-KISI HARIAN*\n\n" + teksHarian 
            });
            console.log("Log: Kisi-kisi Harian terkirim ke Grup (Minggu-Kamis)");
        }

    }, 60000); // Cek setiap 1 menit
}

module.exports = { initUjianScheduler };
