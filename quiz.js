const QUIZ_BANK = {
    // 1.PAIBP, BING, IPA, BIND
    1: [
        { 
            question: "Gimana pelajaran PAIBP sama B.Inggris tadi? Ada materi yang susah?", 
            options: ["Aman Semua", "Banyak Nyatet", "Lumayan Pusing", "Lancar Jaya"], 
            feedbacks: ["Mantap! Kalau aman berarti persiapan kamu udah oke banget. 🔥", "Catatan itu penting, buat bekal belajar pas ujian nanti! 📚", "Wajar kok, nanti pelan-pelan diulas lagi ya materi yang sulit. 💪", "Keren! Pertahankan terus kefokusan kamu di kelas. 🎯"] 
        },
    ],

    // 2. SELASA: PJOK, MTK, IPS, TIK (DI KELAS)
    2: [
        { 
            question: "Hari ini ada pelajaran TIK sama MTK. Materi TIK di kelas tadi bahas apa?", 
            options: ["Teori Komputer", "Sistem Digital", "Logika Pemrograman", "Materi Umum"], 
            feedbacks: ["Keren! Teori dasar itu fondasi penting buat jadi IT Specialist. 💻", "Materi digital emang luas banget ya pengetahuannya. 📚", "Logika itu skill paling kepake buat developer, mantap! 🧠", "Bagus, yang penting poin utamanya ketangkep semua. ✍️"] 
        },
        { 
            question: "Gimana sama MTK dan IPS? Aman semua kan tugas-tugasnya?", 
            options: ["Aman", "Lumayan Banyak", "Bisa Ngerjain", "Lancar"], 
            feedbacks: ["Mantap! Logika MTK kamu emang juara. 📐", "Dicicil aja pelan-pelan, yang penting selesai tepat waktu. ✅", "Bagus, fokus kamu hari ini keren banget! 🎯", "Alhamdulillah kalau lancar semua tanpa kendala. ✨"] 
        }
    ],

    // 3. RABU: BIND, BSUN, IPS, MTK
    3: [
        { 
            question: "Hari Rabu nih! Tadi belajar Bahasa Sunda sama IPS gimana?", 
            options: ["Asik", "Lumayan", "Banyak Catatan", "Ngerti Kok"], 
            feedbacks: ["Mantap! Melestarikan bahasa daerah itu keren. 🗣️", "Pelan-pelan aja belajarnya, lama-lama juga lancar. 📖", "Catatan itu investasi berharga buat ujian nanti! ✍️", "Bagus, penguasaan materi kamu hari ini oke banget. ✨"] 
        }
    ],

    // 4. KAMIS: IPA, PANCASILA, SBK
    4: [
        { 
            question: "Besok Jumat libur nih! Tadi di sekolah udah dapet kisi-kisi buat ulangan Senin?", 
            options: ["Udah Lengkap", "Dikit Lagi", "Lagi Dicatat", "Belum Semua"], 
            feedbacks: ["Bagus! Jadi besok pas libur bisa mulai dicicil belajarnya. 📚", "Oke, manfaatin waktu senggang buat ngelengkapin ya. ✍️", "Mantap, persiapan matang itu kunci sukses ulangan! ✨", "Tenang, masih ada waktu buat tanya temen atau guru. Semangat! 🎯"] 
        },
        { 
            question: "Pelajaran SBK tadi seru? Garap proyek seni apa?", 
            options: ["Musik", "Gambar/Seni Rupa", "Teori Seni", "Latihan Performance"], 
            feedbacks: ["Asik! Kreativitas emang cara terbaik buat refresh otak. 🎸", "Seni itu ekspresi jiwa, hasil gambarnya pasti keren! 🎨", "Wawasan seni itu luas banget ya, nambah ilmu baru. 📚", "Semangat latihannya, pasti hasilnya memuaskan! 🎭"] 
        }
    ],

    // 5. JUMAT: LIBUR & PERSIAPAN ULANGAN SENIN
    5: [
        { 
            question: "Jumat Libur! Udah mulai nyicil belajar buat persiapan ulangan Senin?", 
            options: ["Lagi Belajar", "Bentar Lagi", "Udah Selesai", "Nanti Sore"], 
            feedbacks: ["Keren! Manfaatin hari libur buat curi start emang ide bagus. 🔥", "Oke, jangan lupa istirahat juga ya biar gak gampang capek. 🔋", "Wah, ambis banget! Mantap, tinggal santai dikit deh nanti. 🏆", "Sip, enjoy dulu liburnya, tapi tetep inget jadwal belajarnya ya! ✨"] 
        }
    ]
};

module.exports = { QUIZ_BANK };
