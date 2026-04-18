const QUIZ_BANK = {
    // 1. SENIN: PJOK (PRAKTEK RENANG), PAIBP, BING, IPA, BIND
    1: [
        { 
            question: "Gimana praktek renangnya tadi? Seru gak di kolam?", 
            options: ["Seru Banget", "Capek Tapi Asik", "Lancar Jaya", "Kedinginan"], 
            feedbacks: ["Mantap! Olahraga air emang paling seger buat mulai hari. 🏊‍♂️", "Wajar kok, nanti istirahat yang cukup ya! 🔋", "Keren, teknik renang kamu makin oke nih. 🌊", "Langsung mandi air anget dan minum yang manis ya! ☕"] 
        },
        { 
            question: "Tadi setelah renang, pelajaran IPA sama B. Inggris aman?", 
            options: ["Aman", "Ngantuk Dikit", "Bisa Fokus", "Lumayan"], 
            feedbacks: ["Bagus kalau aman, tetap semangat! ✨", "Habis renang emang biasanya bikin rileks banget. 💤", "Fokus yang keren, lanjut terus belajarnya! 🎯", "Mantap, pelan-pelan asal paham materinya. 📖"] 
        }
    ],

    // 2. SELASA: PJOK, MTK, IPS, TIK (DI KELAS)
    2: [
        { 
            question: "Hari ini ada pelajaran TIK sama MTK. Materi TIK di kelas tadi bahas apa?", 
            options: ["Teori Komputer", "Sistem Digital", "Logika Pemrograman", "Materi Umum"], 
            feedbacks: ["Keren! Teori dasar itu fondasi penting buat ke depannya. 💻", "Materi digital emang luas banget ya pengetahuannya. 📚", "Logika itu skill paling kepake, mantap! 🧠", "Bagus, yang penting dicatat poin utamanya. ✍️"] 
        },
        { 
            question: "Gimana sama MTK dan IPS? Aman semua kan tugasnya?", 
            options: ["Aman", "Lumayan Banyak", "Bisa Ngerjain", "Lancar"], 
            feedbacks: ["Mantap! Logika kamu emang juara. 📐", "Dicicil aja, yang penting selesai tepat waktu. ✅", "Bagus, fokus kamu hari ini keren! 🎯", "Alhamdulillah kalau lancar semua. ✨"] 
        }
    ],

    // 3. RABU: BIND, BSUN, IPS, MTK
    3: [
        { 
            question: "Hari Rabu nih! Tadi belajar Bahasa Sunda sama IPS gimana?", 
            options: ["Asik", "Lumayan", "Banyak Catatan", "Ngerti Kok"], 
            feedbacks: ["Mantap! Melestarikan bahasa daerah itu keren. 🗣️", "Pelan-pelan aja belajarnya. 📖", "Catatan itu investasi buat ujian nanti! ✍️", "Bagus, penguasaan materi kamu oke. ✨"] 
        }
    ],

    // 4. KAMIS: IPA, PANCASILA, SBK
    4: [
        { 
            question: "Hari Kamis! Tadi ada Seni Budaya (SBK) kan? Garap proyek apa?", 
            options: ["Musik", "Gambar/Seni Rupa", "Teori Seni", "Latihan Performance"], 
            feedbacks: ["Asik! Kreativitas emang cara terbaik buat refresh otak. 🎸", "Seni itu ekspresi jiwa, keren! 🎨", "Wawasan seni itu luas banget ya. 📚", "Semangat latihannya, pasti keren hasilnya! 🎭"] 
        }
    ],

    // 5. JUMAT: PERSIAPAN UAS (MINGGU DEPAN UJIAN)
    5: [
        { 
            question: "Jumat Berkah! Minggu depan udah mulai UAS nih, udah siap belum?", 
            options: ["Siap Dong", "Lagi Nyicil Materi", "Bismillah Aja", "Butuh Belajar Lagi"], 
            feedbacks: ["Mantap! Percaya diri itu modal utama. Semangat! 🔥", "Bagus, dicicil biar gak sistem kebut semalam. ✍️", "Usaha + Doa = Hasil Terbaik. Semangat ya! 🙏", "Masih ada waktu weekend buat review materi. Kamu pasti bisa! 📚"] 
        }
    ]
};

module.exports = { QUIZ_BANK };
