const axios = require('axios');
const { JADWAL_PELAJARAN, MOTIVASI_SEKOLAH } = require('./constants');

const daftarJadwal = Object.entries(JADWAL_PELAJARAN)
    .map(([hari, mapel]) => `Hari ke-${hari}: ${mapel.replace(/\n/g, ', ')}`)
    .join('\n');

async function askAI(query) {
    try {
        // Menggunakan API Itzpire (Jalur Cadangan yang lebih stabil)
        const response = await axios.get(`https://itzpire.com/ai/gpt-4o`, {
            params: {
                prompt: `Kamu adalah Asisten kelas yang cerdas (nama extension sistem: ridfot). 
                Panggil dirimu 'Asisten'. Jawablah dengan ramah, santai, dan gunakan emoji.
                
                DATA JADWAL:
                ${daftarJadwal}
                
                DATA MOTIVASI:
                ${MOTIVASI_SEKOLAH.join(' | ')}
                
                Pertanyaan User: ${query}`
            }
        });

        // Mengambil jawaban (struktur data Itzpire biasanya response.data.data atau response.data.result)
        const reply = response.data.data || response.data.result || response.data.reply;
        
        return reply ? reply : "Maaf, Asisten lagi bingung menyusun kata-kata.";
        
    } catch (error) {
        console.error("LOG ERROR ASISTEN AI:", error);
        
        // Pesan cadangan jika API Itzpire pun down
        return "⚠️ Asisten sedang istirahat sebentar (Server AI Down). Coba tanya jadwal pakai !pr dulu ya!";
    }
}

module.exports = { askAI };
