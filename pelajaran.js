// pelajaran.js

const MAPEL_CONFIG = {
    'UB': 'Upacara Bendera 🇮🇩',
    'PAIBP': 'Agama 🌟',
    'BING': 'Bahasa Inggris 💂',
    'IPA': 'Ipa 🔬',
    'BIND': 'Bahasa Indonesia 🐦‍🔥',
    'PJOK': 'Pjok 🏃',
    'MTK': 'Matematika 🧮',
    'IPS': 'Ips 🌍',
    'TIK': 'Informatika 📡',
    'BSUN': 'Bahasa Sunda 🦚',
    'PANCASILA': 'Pancasila 🦅',
    'SBK': 'Sbk 🎨',
    'YASINAN': 'Yasinan 📖',
    'JUMSIH': 'Jumat Bersih 🧹',
    'BCRB': 'Bahasa Cirebon ☁️༄.°'
};

const STRUKTUR_JADWAL = {
    'senin': ['UB', 'PAIBP', 'BING', 'IPA', 'BIND'],
    'selasa': ['PJOK', 'MTK', 'IPS', 'TIK'],
    'rabu': ['BIND', 'BSUN', 'IPS', 'MTK'],
    'kamis': ['IPA', 'PANCASILA', 'SBK'],
    'jumat': ['YASINAN', 'JUMSIH', 'BING', 'BCRB']
};

const LABELS = {
    'ulangan': '🏷️ 📝 Ulangan harian',
    'biasa': '🏷️ 📒 Tugas biasa',
    'lks': '🏷️ 📕 Tugas lks',
    'hafalan': '🏷️ 📃 Tugas afalan',
    'kelompok': '🏷️ 🤼 Tugas Kelompok',
    'berenang': '🏷️ 🏊🏻 Berenang / praktek',
    'pdf': '🏷️ 📂 Tugas PDF Atau Gambar',
    'gambar': '🏷️ 📂 Tugas PDF Atau Gambar'
};

module.exports = { MAPEL_CONFIG, STRUKTUR_JADWAL, LABELS };
