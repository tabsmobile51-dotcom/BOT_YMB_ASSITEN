const { buatTeksKisi, buatTeksKisiFull, buatTeksPraktek, getStoredPraktek } = require('./ujian_logic');
const { ID_GRUP_TUJUAN } = require('./kisi_constants');
/**
 * SCHEDULER OTOMATIS KISI-KISI & PRAKTEK
 * Aturan Kisi-Kisi:
 * - Sabtu Jam 08:00: Kirim Full (Senin-Jumat)
 * - Minggu-Kamis Jam 12:00: Kirim Harian
 * * Aturan Praktek:
 * - Minggu-Kamis Jam 12:00: Kirim Harian (Jika ada)
 */
async function initUjianScheduler(sock, ID_PRIBADI, botConfig) {
    console.log("✅ Scheduler Kisi-Kisi & Praktek Aktif (Group Only)");
    setInterval(async () => {
        const now = new Date();
        const hari = now.getDay(); // 0=Minggu, 1=Senin, ..., 6=Sabtu
        const jam = now.getHours();
        const menit = now.getMinutes();
        // --- 1. LOGIKA KISI-KISI (Bisa di ON/OFF lewat botConfig.kisiUjian) ---
        if (botConfig && botConfig.kisiUjian) {
            
            // Sabtu Jam 08:00 (Full Rekap)
            if (hari === 6 && jam === 8 && menit === 0) {
                const teksFull = await buatTeksKisiFull();
                await sock.sendMessage(ID_GRUP_TUJUAN, { 
                    text: "🚀 *REKAP KISI-KISI MINGGUAN*\n_Khusus persiapan satu minggu ke depan_\n\n" + teksFull 
                });
                console.log("Log: Kisi-kisi Full terkirim (Sabtu)");
            }
            // Minggu-Kamis Jam 12:00 (Harian)
            if (hari >= 0 && hari <= 4 && jam === 12 && menit === 0) {
                const teksHarian = await buatTeksKisi();
                await sock.sendMessage(ID_GRUP_TUJUAN, { 
                    text: "📖 *PENGINGAT KISI-KISI HARIAN*\n\n" + teksHarian 
                });
                console.log("Log: Kisi-kisi Harian terkirim (Minggu-Kamis)");
            }
        }
        // --- 2. LOGIKA PRAKTEK (Bisa di ON/OFF lewat botConfig.praktekUjian) ---
        if (botConfig && botConfig.praktekUjian) {
            
            // Minggu-Kamis Jam 12:00
            if (hari >= 0 && hari <= 4 && jam === 12 && menit === 0) {
                const teksPraktek = await buatTeksPraktek();
                
                // FIX: cek string kosong, bukan null (buatTeksPraktek sekarang return "" bukan null)
                if (teksPraktek && teksPraktek.trim().length > 0) {
                    // Jika ada jadwal praktek untuk besok
                    await sock.sendMessage(ID_GRUP_TUJUAN, { text: teksPraktek });
                    console.log("Log: Jadwal Praktek terkirim");
                } else {
                    // FIX: hitung hariBesoK dengan benar sesuai logika buatTeksPraktek
                    // buatTeksPraktek jam >= 12 → hari + 1, jadi besok = hari + 1
                    // loop cari praktek berikutnya mulai dari hari+2 (lusa dst)
                    const dataPraktek = getStoredPraktek();
                    let infoNext = "";
                    const dayNames = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'];
                    const hariBerikutnya = hari + 2; // hari+1 = besok (sudah dicek kosong), mulai dari hari+2
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
    }, 60000); // Cek setiap 1 menit
}
module.exports = { initUjianScheduler };
