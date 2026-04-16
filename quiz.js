const QUIZ_BANK = {
    // 1. SENIN: UP, PAIBP, BING, IPA, BIND
    1: [
        { 
            question: "Gimana sekolah hari ini? Tadi ada pelajaran IPA sama B. Inggris kan?", 
            options: ["Seru Banget", "Lumayan Capek", "Materi Aman", "Banyak Tugas"], 
            feedbacks: ["Mantap! Semangat terus belajarnya ya. 🚀", "Wajar kok, Senin emang padat. Istirahat ya! 🔋", "Keren, penguasaan materi kamu emang oke. 🧠", "Cicil pelan-pelan, pasti selesai kok! ✍️"] 
        },
        { 
            question: "Tadi materi PAI sama B. Indo gimana? Ada yang susah gak?", 
            options: ["Aman", "Lumayan", "Banyak Catatan", "Bisa Dipahami"], 
            feedbacks: ["Bagus kalau aman, lanjut terus! ✨", "Pelan-pelan aja belajarnya. 📖", "Catatan itu investasi buat ujian nanti! ✍️", "Mantap, fokus kamu keren hari ini. 🎯"] 
        }
    ],

    // 2. SELASA: PJOK, MTK, IPS, TIK
    2: [
        { 
            question: "Hari ini ada PJOK sama MTK. Tadi sempat olahraga apa di lapangan?", 
            options: ["Basket/Bola", "Senam/Atletik", "Teori Saja", "Seru-seruan"], 
            feedbacks: ["Sehat dan bugar itu penting buat otak! 🏀", "Gerak badan bikin mood jadi bagus. 🏃", "Teori juga penting buat pemahaman teknik. 📋", "Yang penting happy ya olahraganya! 😄"] 
        },
        { 
            question: "Gimana pelajaran MTK tadi? Angka-angkanya bikin pusing gak?", 
            options: ["Lancar", "Agak Pusing", "Bisa Ngerjain", "Bismillah"], 
            feedbacks: ["Logika kamu emang juara! 📐", "Gak apa-apa, MTK emang butuh proses. 🔢", "Mantap! Selesai tepat waktu ya. ✅", "Amin, yang penting sudah usaha maksimal! 🙏"] 
        }
    ],

    // 3. RABU: EVALUASI TKA MINGGU LALU (BIND, BSUN, IPS, MTK)
    3: [
        { 
            question: "Hari Rabu nih! Ngomong-ngomong, TKA minggu kemarin menurutmu gampang atau susah?", 
            options: ["Gampang Kok", "Lumayan Susah", "Bisa Dilewati", "Banyak Jebakan"], 
            feedbacks: ["Keren! Berarti persiapanmu matang banget. 🏆", "Yang penting sudah usaha, hasilnya pasti terbaik. 💪", "Mantap, satu rintangan sudah terlewati! ✅", "TKA emang suka gitu, yang teliti ya lain kali. 🧐"] 
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

    // 5. JUMAT: YASINAN, JUMSIH, BING, BCRB
    5: [
        { 
            question: "Jumat Berkah! Tadi ikut Yasinan sama Jumsih di sekolah kan?", 
            options: ["Ikut Dong", "Bersih-bersih", "Ngaji Bareng", "Lancar Semua"], 
            feedbacks: ["Alhamdulillah, berkah buat hari ini! ✨", "Sekolah bersih, belajar jadi nyaman. 🧹", "Hati tenang, pikiran jadi jernih. 📖", "Semangat menyambut weekend! 🏁"] 
        }
    ]
};

module.exports = { QUIZ_BANK };
