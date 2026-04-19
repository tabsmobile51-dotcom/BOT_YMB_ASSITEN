const JADWAL_PELAJARAN = {
    1: "🕌 PAI\n💂 Bahasa Inggris\n🔬 Ipa\n🐦‍🔥 Bahasa Indonesia", // Senin
    2: "🏃 Pjok\n🧮 Matematika\n🌍 Ips\n📡 Informatika", // Selasa
    3: "🐦‍🔥 Bahasa Indonesia\n🦚 Bahasa Sunda\n🌍 Ips\n🧮 Matematika", // Rabu
    4: "🔬 Ipa\n🦅 Pancasila\n🎨 Sbk", // Kamis
    5: "💂 Bahasa Inggris\n☁️ Bahasa Cirebon" // Jumat
};

// FIX: JADWAL_PRAKTEK default (dipakai getStoredPraktek() sebagai fallback)
const JADWAL_PRAKTEK = {
    1: "Tidak ada jadwal praktek",
    2: "Tidak ada jadwal praktek",
    3: "Tidak ada jadwal praktek",
    4: "Tidak ada jadwal praktek",
    5: "Tidak ada jadwal praktek"
};

const MOTIVASI_SEKOLAH = [
    "Semangat belajarnya ya! Masa depan cerah menantimu. ✨",
    "Jangan malas hari ini, kesuksesan butuh kerja keras. 💪",
    "Satu langkah kecil hari ini adalah awal dari kesuksesan besar besok. 🚀",
    "Belajar memang melelahkan, tapi lebih lelah lagi jika tidak berilmu. 😊",
    "Gaspol terus belajarnya, jangan lupa istirahat yang cukup ya! 💤",
    "Fokus pada tujuanmu, hasil tidak akan mengkhianati usaha. 🔥"
];

const ADMIN_RAW = ['6289531549103', '171425214255294', '6285158738155', '241849843351688', '254326740103190', '8474121494667'];
const ID_GRUP_TUJUAN = '120363403625197368@g.us';

// FIX: KISI_FILES_PATH wajib ada, sesuaikan path dengan struktur server kamu
const KISI_FILES_PATH = '/app/auth_info/kisi_ujian';

module.exports = { JADWAL_PELAJARAN, JADWAL_PRAKTEK, MOTIVASI_SEKOLAH, ADMIN_RAW, ID_GRUP_TUJUAN, KISI_FILES_PATH };
