const fs = require('fs');
const path = require('path');

// Diarahkan ke Mount Path volume kamu di Railway
const DATA_FILE = '/app/auth_info/data.json';

const defaultData = {
    senin: "Belum ada tugas.",
    selasa: "Belum ada tugas.",
    rabu: "Belum ada tugas.",
    kamis: "Belum ada tugas.",
    jumat: "Belum ada tugas.",
    deadline: "Belum ada info tugas.",
    terakhir_update: "-"
};

const database = {
    init: () => {
        try {
            const dir = path.dirname(DATA_FILE);
            // Memastikan folder /app/auth_info ada
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            if (!fs.existsSync(DATA_FILE)) {
                fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2));
                console.log("📁 Database JSON baru berhasil dibuat di Volume.");
            }
        } catch (error) {
            console.error("❌ Gagal inisialisasi database:", error);
        }
    },

    getAll: () => {
        try {
            if (!fs.existsSync(DATA_FILE)) return defaultData;
            const content = fs.readFileSync(DATA_FILE, 'utf-8');
            
            // Pengaman: Jika file kosong, kembalikan defaultData
            if (!content.trim()) return defaultData;
            
            const parsed = JSON.parse(content);
            
            // Pengaman: Gabungkan data yang ada dengan defaultData agar tidak ada property yang undefined
            return { ...defaultData, ...parsed };
        } catch (error) {
            console.error("⚠️ Error saat membaca database, menggunakan data default.");
            return defaultData;
        }
    },

    updateTugas: (hari, isi) => {
        try {
            const data = database.getAll();
            const key = hari.toLowerCase();
            
            // Tetap menggunakan hasOwnProperty sesuai struktur asli Anda
            if (data.hasOwnProperty(key) || key === 'deadline') {
                data[key] = isi;
                data.terakhir_update = new Date().toLocaleString('id-ID', { 
                    timeZone: 'Asia/Jakarta',
                    dateStyle: 'medium',
                    timeStyle: 'short'
                });
                fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
                return true;
            }
            return false;
        } catch (error) {
            console.error("❌ Gagal update tugas:", error);
            return false;
        }
    },

    resetSemua: () => {
        try {
            fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2));
            return true;
        } catch (error) {
            console.error("❌ Gagal reset database:", error);
            return false;
        }
    }
};

database.init();
module.exports = database;
