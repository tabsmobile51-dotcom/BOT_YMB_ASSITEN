/**
 * SYTEAM-BOT MAIN SERVER
 * Versi: 1.4.0
 * Perbaikan: Auto-Fix Session, Trash Cleaner, Safe Shutdown
 * + Auto-Reject Panggilan (Voice & Video Call)
 * + Bug Fix: reconnect loop, graceful shutdown, zombie detection
 */

const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion, 
    makeCacheableSignalKeyStore 
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const express = require("express");
const QRCode = require("qrcode");
const path = require("path");
const fs = require("fs");
const url = require("url");

// --- IMPORT HANDLER & SCHEDULER ---
const { handleMessages } = require('./handler'); 
const { handleEmergency } = require('./features/safety'); 
const { 
    initQuizScheduler, 
    initJadwalBesokScheduler, 
    initSmartFeedbackScheduler, 
    initListPrMingguanScheduler, 
    initSahurScheduler,
    getWeekDates, 
    sendJadwalBesokManual 
} = require('./scheduler'); 

const { renderDashboard } = require('./views/dashboard'); 
const { renderMediaView } = require('./views/mediaView'); 

// ─────────────────────────────────────────────────────────────
// WAKTU BOT START — untuk filter pesan lama saat reconnect
// Semua pesan yang timestamp-nya SEBELUM waktu ini akan di-skip
// ─────────────────────────────────────────────────────────────
const BOT_START_TIME = Math.floor(Date.now() / 1000); // Unix timestamp detik

// ─────────────────────────────────────────────────────────────
// CACHE MESSAGE ID — cegah pesan diproses 2x saat reconnect
// ─────────────────────────────────────────────────────────────
const processedMsgIds = new Set();
const MAX_CACHE_SIZE = 500; // Batas cache agar RAM tidak bocor

function isAlreadyProcessed(msgId) {
    if (processedMsgIds.has(msgId)) return true;
    processedMsgIds.add(msgId);
    // Auto-bersih kalau cache terlalu besar
    if (processedMsgIds.size > MAX_CACHE_SIZE) {
        const firstItem = processedMsgIds.values().next().value;
        processedMsgIds.delete(firstItem);
    }
    return false;
}

// ─────────────────────────────────────────────────────────────
// KONFIGURASI PATH DINAMIS ---
const VOLUME_PATH = '/app/auth_info';
const CONFIG_PATH = path.join(VOLUME_PATH, 'config.ridfot'); 
const PUBLIC_FILES_PATH = path.join(VOLUME_PATH, 'public_files');

if (!fs.existsSync(VOLUME_PATH)) fs.mkdirSync(VOLUME_PATH, { recursive: true });
if (!fs.existsSync(PUBLIC_FILES_PATH)) fs.mkdirSync(PUBLIC_FILES_PATH, { recursive: true });

// --- KONFIGURASI DEFAULT BOT ---
let botConfig = { 
    quiz: true, 
    jadwalBesok: true, 
    smartFeedback: true, 
    prMingguan: true, 
    sahur: true,
    autoRejectCall: true,
};

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
            const parsed = JSON.parse(data);
            // [BUG FIX] Merge dengan default agar key baru tidak hilang
            botConfig = Object.assign({}, botConfig, parsed);
            console.log("✅ Config Berhasil Dimuat dari Volume");
        } else {
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(botConfig, null, 2));
            console.log("ℹ️ Membuat file konfigurasi baru...");
        }
    } catch (e) { 
        console.error("❌ Gagal memuat config:", e.message); 
    }
}
loadConfig();

const saveConfig = () => {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(botConfig, null, 2));
    } catch (e) { 
        console.error("❌ Gagal menyimpan config:", e.message); 
    }
};

// ─────────────────────────────────────────────────────────────
// FUNGSI PENGAMANAN & PEMBERSIH (SELF-HEALING)
// ─────────────────────────────────────────────────────────────
function cleanSessionTrash() {
    try {
        const files = fs.readdirSync(VOLUME_PATH);
        let count = 0;
        files.forEach(file => {
            // Hapus file sampah pre-key, session, dan sender-key yang menumpuk
            // JANGAN hapus creds.json supaya tidak scan ulang
            if (
                file.startsWith('pre-key-') || 
                file.startsWith('session-') || 
                file.startsWith('sender-key-')
            ) {
                fs.unlinkSync(path.join(VOLUME_PATH, file));
                count++;
            }
        });
        addLog(`🧹 Sampah sesi dibersihkan: ${count} file (Login tetap aman)`);
    } catch (e) {
        console.error("Gagal bersih-bersih sesi:", e.message);
    }
}

// ─────────────────────────────────────────────────────────────
// INISIALISASI EXPRESS SERVER
// ─────────────────────────────────────────────────────────────
const app = express();
const port = process.env.PORT || 8080;
let qrCodeData = "";
let isConnected = false;
let sock;
let logs = [];
let stats = { pesanMasuk: 0, totalLog: 0, teleponDitolak: 0 };
let schedulerInitialized = false;
let adminNotified = false;

// [BUG FIX] Flag agar reconnect tidak double-trigger
let isReconnecting = false;

// ─────────────────────────────────────────────────────────────
// SAFE SEND MESSAGE WRAPPER
// ─────────────────────────────────────────────────────────────
const safeSend = async (jid, content, options = {}, retries = 2) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            // [BUG FIX] Pastikan sock masih valid sebelum kirim
            if (!sock || !isConnected) {
                addLog("⚠️ safeSend dibatalkan: bot tidak terkoneksi");
                return null;
            }
            const result = await Promise.race([
                sock.sendMessage(jid, content, options),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error("sendMessage timeout")), 20000)
                )
            ]);
            try { await sock.sendPresenceUpdate('paused', jid); } catch (_) {}
            return result;
        } catch (err) {
            addLog(`⚠️ Gagal kirim pesan (percobaan ${attempt}/${retries}): ${err.message}`);
            if (attempt < retries) await new Promise(r => setTimeout(r, 3000));
        }
    }
    addLog(`❌ Pesan gagal terkirim setelah ${retries}x percobaan.`);
    return null;
};

const botUtils = { safeSend, getWeekDates, sendJadwalBesokManual };

// ─────────────────────────────────────────────────────────────
// KEEPALIVE PING
// ─────────────────────────────────────────────────────────────
let keepAliveInterval = null;
const startKeepAlive = () => {
    if (keepAliveInterval) clearInterval(keepAliveInterval);
    keepAliveInterval = setInterval(async () => {
        if (!isConnected || !sock) return;
        try {
            await sock.query({ 
                tag: 'iq', 
                attrs: { type: 'get', to: '@s.whatsapp.net', xmlns: 'w:p' } 
            });
        } catch (e) {
            addLog("🔄 Koneksi zombie terdeteksi, memulai reconnect...");
            isConnected = false;
            try { sock.end(new Error("zombie detected")); } catch (_) {}
        }
    }, 30000);
};

// ─────────────────────────────────────────────────────────────
// AUTO-REJECT PANGGILAN (VOICE & VIDEO CALL)
// ─────────────────────────────────────────────────────────────
async function handleIncomingCall(callEvents) {
    if (!botConfig.autoRejectCall) return;

    for (const call of callEvents) {
        // Hanya proses panggilan yang statusnya 'offer' (baru masuk)
        if (call.status !== 'offer') continue;

        try {
            // Tolak panggilan menggunakan rejectCall bawaan Baileys
            await sock.rejectCall(call.id, call.from);

            const callType = call.isVideo ? '📹 Video Call' : '📞 Voice Call';
            const callerNumber = call.from.replace('@s.whatsapp.net', '');
            
            stats.teleponDitolak++;
            addLog(`🚫 ${callType} DITOLAK otomatis dari: ${callerNumber}`);

            // Kirim pesan balasan ke pemanggil setelah ditolak
            await safeSend(call.from, { 
                text: `⛔ *Panggilan Ditolak Otomatis*\n\nMaaf, bot ini tidak dapat menerima panggilan telepon.\nSilakan kirim pesan teks jika ada yang perlu ditanyakan. 🙏` 
            });

        } catch (err) {
            addLog(`❌ Gagal menolak panggilan: ${err.message}`);
        }
    }
}

// ─────────────────────────────────────────────────────────────
// LOGGING SYSTEM
// ─────────────────────────────────────────────────────────────
const addLog = (msg) => {
    const time = new Date().toLocaleTimeString('id-ID');
    logs.unshift(`<span style="color: #00ff73;">[${time}]</span> <span style="color: #ffffff !important;">${msg}</span>`);
    stats.totalLog++;
    if (logs.length > 50) logs.pop();
};

// ─────────────────────────────────────────────────────────────
// EXPRESS ROUTES
// ─────────────────────────────────────────────────────────────
app.get("/toggle/:feature", (req, res) => {
    const feat = req.params.feature;
    if (Object.prototype.hasOwnProperty.call(botConfig, feat)) {
        botConfig[feat] = !botConfig[feat];
        saveConfig();
        addLog(`Sistem ${feat} diubah -> ${botConfig[feat] ? 'ON' : 'OFF'}`);
    }
    res.redirect("/");
});

app.get("/", (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(renderDashboard(isConnected, qrCodeData, botConfig, stats, logs, port));
});

app.use('/files', express.static(PUBLIC_FILES_PATH));

app.get("/tugas/:filenames", (req, res) => {
    const filenames = req.params.filenames.split(','); 
    const isValid = filenames.every(name => {
        return (
            path.basename(name) === name && 
            !name.includes('..') && 
            /^[\w\-. ]+$/.test(name)
        );
    });
    if (!isValid) return res.status(400).send("Nama file tidak valid.");
    const protocol = req.protocol;
    const host = req.get('host');
    const fileUrls = filenames.map(name => `${protocol}://${host}/files/${name}`); 
    res.setHeader('Content-Type', 'text/html');
    res.send(renderMediaView(fileUrls));
});

app.listen(port, "0.0.0.0", () => {
    console.log(`✅ Web Dashboard aktif di port ${port}`);
});

// ─────────────────────────────────────────────────────────────
// FUNGSI RECONNECT TERPUSAT (BUG FIX: cegah reconnect double)
// ─────────────────────────────────────────────────────────────
function scheduleReconnect(delayMs = 5000) {
    if (isReconnecting) {
        addLog("⚠️ Reconnect sudah dijadwalkan, skip duplikat.");
        return;
    }
    isReconnecting = true;
    addLog(`🔄 Reconnect dijadwalkan dalam ${delayMs / 1000} detik...`);
    setTimeout(async () => {
        isReconnecting = false;
        await start();
    }, delayMs);
}

// ─────────────────────────────────────────────────────────────
// CORE BOT FUNCTION
// ─────────────────────────────────────────────────────────────
async function start() {
    try {
        const { version } = await fetchLatestBaileysVersion();
        const { state, saveCreds } = await useMultiFileAuthState(VOLUME_PATH);

        sock = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" }))
            },
            printQRInTerminal: false,
            logger: pino({ level: "silent" }),
            browser: ["Ubuntu", "Firefox", "20.0.0"],
            syncFullHistory: false,
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 30000,
            keepAliveIntervalMs: 15000,
            retryRequestDelayMs: 2000,
            maxMsgRetryCount: 5,
            getMessage: async () => undefined 
        });

        sock.ev.on("creds.update", saveCreds);

        // ── EVENT: CONNECTION UPDATE ──────────────────────────────
        sock.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) qrCodeData = await QRCode.toDataURL(qr);
            
            if (connection === "close") {
                isConnected = false;
                if (keepAliveInterval) clearInterval(keepAliveInterval);

                const statusCode = lastDisconnect?.error?.output?.statusCode;
                addLog(`🔴 Koneksi terputus. Status code: ${statusCode ?? 'tidak diketahui'}`);

                if (statusCode === 428 || statusCode === 515) {
                    // Sesi berat / desync — bersihkan lalu reconnect
                    addLog("🔄 Sesi berat terdeteksi, membersihkan sampah kunci...");
                    cleanSessionTrash();
                    scheduleReconnect(5000);

                } else if (statusCode === DisconnectReason.loggedOut) {
                    // Bot di-logout — hapus creds agar bisa scan ulang
                    addLog("⚠️ Bot Logout. Menghapus file login agar bisa scan ulang.");
                    const credsPath = path.join(VOLUME_PATH, 'creds.json');
                    if (fs.existsSync(credsPath)) {
                        fs.unlinkSync(credsPath);
                    }
                    schedulerInitialized = false;
                    adminNotified = false;
                    // [BUG FIX] Tetap reconnect agar QR baru muncul di dashboard
                    scheduleReconnect(3000);

                } else if (statusCode === 429) {
                    // Rate limit — tunggu lebih lama
                    scheduleReconnect(30000);

                } else if (statusCode === DisconnectReason.restartRequired) {
                    // Restart diminta oleh server WA
                    scheduleReconnect(3000);

                } else {
                    scheduleReconnect(5000);
                }

            } else if (connection === "open") {
                isConnected = true; 
                isReconnecting = false; // [BUG FIX] Reset flag reconnect
                qrCodeData = "";
                addLog("🟢 Bot Berhasil Terhubung ke WhatsApp!");
                
                // Reset cache pesan agar reconnect tidak bawa duplikat lama
                processedMsgIds.clear();

                startKeepAlive();

                const adminJid = process.env.ADMIN_JID || "6289531549103@s.whatsapp.net";

                // Notifikasi Admin HANYA saat pertama kali terhubung / setelah logout
                if (!adminNotified) {
                    await safeSend(adminJid, { 
                        text: "✅ *SYTEAM-BOT v1.4.0 Aktif!*\nSesi berhasil dimuat dan sistem siap digunakan.\n\n📋 Fitur aktif:\n• Auto-Reject Panggilan ✅\n• Self-Healing Session ✅\n• Scheduler Otomatis ✅" 
                    });
                    adminNotified = true;
                }

                if (!schedulerInitialized) {
                    initQuizScheduler(sock, botConfig, () => isConnected);
                    initJadwalBesokScheduler(sock, botConfig, safeSend);
                    initSmartFeedbackScheduler(sock, botConfig, safeSend);
                    initListPrMingguanScheduler(sock, botConfig, safeSend);
                    initSahurScheduler(sock, botConfig, safeSend);
                    schedulerInitialized = true;
                    addLog("✅ Semua scheduler berhasil diinisialisasi");
                }
            }
        });

        // ── EVENT: AUTO-REJECT PANGGILAN ─────────────────────────
        sock.ev.on("call", async (callEvents) => {
            await handleIncomingCall(callEvents);
        });

        // ── EVENT: PESAN MASUK ────────────────────────────────────
        sock.ev.on("messages.upsert", async (m) => {
            if (m.type !== 'notify') return;

            for (const msg of m.messages) {
                // ── GUARD: validasi dasar ─────────────────────────────
                if (!msg || !msg.message || msg.key.fromMe || !msg.key.remoteJid) continue;

                const msgId       = msg.key.id;
                const msgTimestamp = Number(msg.messageTimestamp); // Unix detik

                // ── FILTER #1: Buang pesan lama (dikirim saat bot offline) ──
                // Toleransi 10 detik untuk menghindari race condition waktu startup
                if (msgTimestamp < (BOT_START_TIME - 10)) {
                    // Hanya log sekali per sesi supaya tidak banjir log
                    if (processedMsgIds.size === 0) {
                        addLog(`⏩ Pesan lama di-skip (offline backlog). Hanya memproses pesan baru.`);
                    }
                    processedMsgIds.add(msgId); // Tandai sudah diketahui
                    continue;
                }

                // ── FILTER #2: Buang pesan duplikat (dari reconnect) ──
                if (isAlreadyProcessed(msgId)) continue;

                // ── PROSES PESAN VALID ────────────────────────────────
                stats.pesanMasuk++;
                const senderName = msg.pushName || 'User';
                const body = 
                    msg.message?.conversation || 
                    msg.message?.extendedTextMessage?.text || 
                    msg.message?.imageMessage?.caption || 
                    "";

                // Cek emergency terlebih dahulu
                let isEmergency = false;
                try {
                    isEmergency = await handleEmergency(sock, msg, body);
                } catch (err) {
                    addLog(`❌ handleEmergency error: ${err.message}`);
                }

                if (isEmergency) {
                    addLog(`🚨 KODE DARURAT DIPICU OLEH: ${senderName}`);
                    continue; 
                }

                addLog(`📩 Pesan masuk dari: ${senderName}`);

                // Handle pesan normal — bungkus m agar kompatibel dengan handler lama
                try {
                    await handleMessages(sock, { type: m.type, messages: [msg] }, botConfig, botUtils, safeSend);
                } catch (err) {
                    addLog(`❌ handleMessages error: ${err.message}`);
                }
            }
        });

    } catch (err) {
        console.error("❌ Gagal memulai bot:", err.message);
        addLog("❌ Gagal memulai bot, mencoba lagi dalam 10 detik...");
        scheduleReconnect(10000);
    }
}

// ─────────────────────────────────────────────────────────────
// GRACEFUL SHUTDOWN (CEGAH FILE KORUP)
// ─────────────────────────────────────────────────────────────
let isShuttingDown = false; // [BUG FIX] Cegah double shutdown

const shutdown = async (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\n⚠️ Sinyal ${signal} diterima. Mematikan bot dengan aman...`);
    addLog(`⚠️ Sistem mematikan bot (${signal}). Menutup koneksi...`);

    if (keepAliveInterval) clearInterval(keepAliveInterval);

    if (sock) {
        try {
            // Gunakan .end() bukan .logout() agar sesi tidak terhapus
            sock.end(new Error(`System ${signal}`));
        } catch (e) {
            console.error("Error saat menutup socket:", e.message);
        }
    }

    // Simpan config terakhir sebelum mati
    saveConfig();

    setTimeout(() => {
        console.log("✅ Bot mati dengan aman.");
        process.exit(0);
    }, 2000);
};

// [BUG FIX] Tangani uncaught exception agar bot tidak mati diam-diam
process.on('uncaughtException', (err) => {
    console.error("🔥 uncaughtException:", err.message);
    addLog(`🔥 Error tidak tertangkap: ${err.message}`);
});

process.on('unhandledRejection', (reason) => {
    console.error("🔥 unhandledRejection:", reason);
    addLog(`🔥 Promise rejection: ${reason}`);
});

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ─────────────────────────────────────────────────────────────
// START BOT
// ─────────────────────────────────────────────────────────────
start();
