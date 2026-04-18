const db = require('../data');
const { MOTIVASI_SEKOLAH } = require('../constants');
const { MAPEL_CONFIG, STRUKTUR_JADWAL } = require('../pelajaran'); 

const ADMIN_NUMBER = '6289531549103@s.whatsapp.net'; 
const HARI_VALID = ['senin', 'selasa', 'rabu', 'kamis', 'jumat'];

async function handleUserCommands(sock, msg, cmd, args, utils) {
    await sock.readMessages([msg.key]);
    const sender = msg.key.remoteJid;
    const pushName = msg.pushName || 'User';
    const senderNumber = sender.split('@')[0];
    const { dates, periode } = utils.getWeekDates();

    const formatRekap = () => {
        const currentData = db.getAll() || {};
        const motivasi = MOTIVASI_SEKOLAH[Math.floor(Math.random() * MOTIVASI_SEKOLAH.length)];
        let rekap = `📌 *DAFTAR LIST TUGAS PR* 📢\n🗓️ Periode: ${periode}\n\n━━━━━━━━━━━━━━━━━━━━\n\n`;
        
        HARI_VALID.forEach((day, i) => {
            const dayLabelsFull = ['SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT'];
            const dayLabelsSmall = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'];
            rekap += `📅 *${dayLabelsFull[i]}* (${dates[i]})\n`;
            let tugas = currentData[day];
            
            if (!tugas || tugas.trim() === "" || tugas.toLowerCase().includes("belum ada")) {
                rekap += `└─ ✅ _Tidak ada PR_\n\n`;
            } else { 
                let cleanTugas = tugas.split('\n').filter(line => !line.includes('⏰ Deadline:')).join('\n').trim();
                rekap += `${cleanTugas}\n⏰ Deadline: ${dayLabelsSmall[i]}, ${dates[i]}\n\n`; 
            }
        });

        // ✅ Fix: parse deadline JSON dengan benar
        let deadlineText = "_Semua tugas selesai_.";
        try {
            const dlRaw = currentData.deadline;
            if (dlRaw) {
                const dlList = JSON.parse(dlRaw);
                if (Array.isArray(dlList) && dlList.length > 0) {
                    deadlineText = dlList.map((item, i) => {
                        // Format tanggal deadline jadi lebih readable jika format ISO
                        let tglDeadline = item.deadline;
                        try {
                            const d = new Date(item.deadline);
                            if (!isNaN(d)) {
                                tglDeadline = d.toLocaleDateString('id-ID', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric'
                                });
                            }
                        } catch (_) {}
                        return `${i + 1}. 📌 ${item.task}\n   📅 Deadline: ${tglDeadline}`;
                    }).join('\n\n');
                }
            }
        } catch {
            // Format lama (string biasa), tampilkan apa adanya
            if (currentData.deadline && currentData.deadline.trim()) {
                deadlineText = currentData.deadline;
            }
        }
        
        rekap += `━━━━━━━━━━━━━━━━━━━━\n⏳ *BELUM DIKUMPULKAN:*\n${deadlineText}\n\n💡 _${motivasi}_\n\n⚠️ *Salah/Tambah PR?* Ketik: *!lapor [isi]*`;
        return rekap;
    };

    const cleanCmd = cmd.replace('!', '').toLowerCase();

    switch (true) {
        // !p / !cekbot
        case ['cekbot', 'p', 'tes'].includes(cleanCmd):
            await sock.sendMessage(sender, { text: '✅ *Bot Syteam Aktif!*\nKetik *!bantuan* untuk melihat menu.' }); 
            break;

        // !pr / !list_pr
        case ['list_pr', 'pr'].includes(cleanCmd):
            await sock.sendMessage(sender, { text: formatRekap() }); 
            break;

        // !jadwal / !jwl
        case ['jadwal', 'jwl'].includes(cleanCmd): {
            const inputHari = args[0]?.toLowerCase();
            let teksJadwal = `📅 *JADWAL PELAJARAN* 📅\n━━━━━━━━━━━━━━━━━━━━\n\n`;
            
            const susunJadwal = (hari) => {
                const listKode = STRUKTUR_JADWAL[hari];
                if (!listKode || listKode.length === 0) return `*${hari.toUpperCase()}*\n_Libur / Tidak ada jadwal._\n\n`;
                
                let hasil = `*${hari.toUpperCase()}*\n`;
                listKode.forEach((kode, index) => {
                    const namaMapel = MAPEL_CONFIG[kode] || kode;
                    hasil += `${index + 1}. ${namaMapel}\n`;
                });
                return hasil + `\n`;
            };

            if (inputHari && HARI_VALID.includes(inputHari)) {
                teksJadwal += susunJadwal(inputHari);
            } else {
                HARI_VALID.forEach((day) => { teksJadwal += susunJadwal(day); });
                teksJadwal += `_Tips: Ketik *!jadwal [hari]* untuk satu hari saja._\n`;
            }
            
            teksJadwal += `━━━━━━━━━━━━━━━━━━━━`;
            await sock.sendMessage(sender, { text: teksJadwal });
            break;
        }

        // !lapor
        case ['lapor', 'lapor_pr'].includes(cleanCmd): {
            const isiLaporan = args.join(" ").trim();
            if (!isiLaporan) {
                return await sock.sendMessage(sender, { 
                    text: "❌ *Format Salah!*\n\nContoh:\n*!lapor Senin ada PR MTK*\natau\n*!lapor hapus PR hari Selasa*" 
                });
            }

            const pesanLaporan = 
                `┏━━━ « *LAPORAN USER* » ━━━┓\n` +
                `┃\n` +
                `┃ 👤 *Dari:* ${pushName}\n` +
                `┃ 📱 *WA:* ${senderNumber}\n` +
                `┃\n` +
                `┣━━━━━━━━━━━━━━━━━━━━━━\n` +
                `┃ 📝 *ISI PESAN:*\n` +
                `┃ _"${isiLaporan}"_\n` +
                `┃\n` +
                `┗━━━━━━━━━━━━━━━━━━━━━━┛`;

            await sock.sendMessage(ADMIN_NUMBER, { text: pesanLaporan, mentions: [sender] });
            await sock.sendMessage(sender, { text: `✅ *Laporan Terkirim!*\nMakasih *${pushName}*, Admin bakal segera cek pesanmu.` });
            break;
        }

        // !deadline / !dl / !tugas_lama
        case ['tugas_lama', 'deadline', 'dl'].includes(cleanCmd): {
            const rawDl = (db.getAll() || {}).deadline;
            let teksDeadline = `⏳ *DAFTAR TUGAS BELUM DIKUMPULKAN*\n━━━━━━━━━━━━━━━━━━━━\n\n`;

            try {
                const list = JSON.parse(rawDl || "[]");
                if (!Array.isArray(list) || !list.length) {
                    teksDeadline += `✅ _Semua tugas sudah selesai!_`;
                } else {
                    list.forEach((item, i) => {
                        // Format tanggal deadline jadi lebih readable jika format ISO
                        let tglDeadline = item.deadline;
                        try {
                            const d = new Date(item.deadline);
                            if (!isNaN(d)) {
                                tglDeadline = d.toLocaleDateString('id-ID', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric'
                                });
                            }
                        } catch (_) {}
                        teksDeadline += `${i + 1}. 📌 ${item.task}\n   📅 Deadline: ${tglDeadline}\n\n`;
                    });
                }
            } catch {
                // Format lama (string biasa)
                teksDeadline += rawDl || `✅ _Semua tugas sudah selesai!_`;
            }

            teksDeadline += `\n━━━━━━━━━━━━━━━━━━━━`;
            await sock.sendMessage(sender, { text: teksDeadline });
            break;
        }
    }
}

module.exports = { handleUserCommands };
