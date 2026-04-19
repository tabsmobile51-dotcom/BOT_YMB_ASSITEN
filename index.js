/**
 * SYTEAM-BOT MAIN SERVER
 * Versi: 1.3.1
 * Perbaikan: Fix SessionError & Docker Persistency
 * - Menggunakan auth state langsung untuk stabilitas keys
 * - Optimasi handling connection closure
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
const url = require("url"); // Tambahan untuk parsing URL web

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

// --- IMPORT KISI-KISI PLUGINS ---
const { initUjianScheduler } = require('./kisi-kisi/ujian_scheduler');
const { buatTeksKisi, buatTeksPraktek } = require('./kisi-kisi/ujian_logic');
// Tambahan Import untuk Handler Website Kisi-Kisi
const { handleKisiKisiWeb, handleKisiKisiApi } = require('./kisi-kisi/kisi_web_handler');

// --- IMPORT UI VIEWS ---
const { renderDashboard } = require('./views/dashboard'); 
const { renderMediaView } = require('./views/mediaView'); 

// --- KONFIGURASI PATH DINAMIS ---
const VOLUME_PATH = '/app/auth_info';
const CONFIG_PATH = path.join(VOLUME_PATH, 'config.ridfot'); 
const PUBLIC_FILES_PATH = path.join(VOLUME_PATH, 'public_files');
const KISI_FILES_PATH = path.join(VOLUME_PATH, 'kisi_ujian'); // Folder baru untuk kisi-kisi

if (!fs.existsSync(VOLUME_PATH)) fs.mkdirSync(VOLUME_PATH, { recursive: true });
if (!fs.existsSync(PUBLIC_FILES_PATH)) fs.mkdirSync(PUBLIC_FILES_PATH, { recursive: true });
if (!fs.existsSync(KISI_FILES_PATH)) fs.mkdirSync(KISI_FILES_PATH, { recursive: true });

// --- KONFIGURASI DEFAULT BOT ---
let botConfig = { 
    quiz: true, 
    jadwalBesok: true, 
    smartFeedback: true, 
    prMingguan: true, 
    sahur: true,
    kisiUjian: true, 
    praktekUjian: true, // Tambahan fitur Praktek untuk Dashboard (Bisa di ON/OFF terpisah)
};

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
            Object.assign(botConfig, JSON.parse(data));
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
        console.error("❌ Gagal menyimpan config ke volume penyimpanan"); 
    }
};

// --- INISIALISASI EXPRESS SERVER ---
const app = express();
const port = process.env.PORT || 8080;
let qrCodeData = "";
let isConnected = false;
let sock;
let logs = [];
let stats = { pesanMasuk: 0, totalLog: 0 };
let schedulerInitialized = false;

// ─────────────────────────────────────────────────────────────
// FIX #1: SAFE SEND MESSAGE WRAPPER
// ─────────────────────────────────────────────────────────────
const safeSend = async (jid, content, options = {}, retries = 2) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const result = await Promise.race([
                sock.sendMessage(jid, content, options),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error("sendMessage timeout")), 20000)
                )
            ]);

            try {
                await sock.sendPresenceUpdate('paused', jid);
            } catch (_) { /* abaikan error presence */ }

            return result;

        } catch (err) {
            addLog(`⚠️ Gagal kirim pesan (percobaan ${attempt}/${retries}): ${err.message}`);
            if (attempt < retries) {
                await new Promise(r => setTimeout(r, 3000));
            }
        }
    }
    addLog(`❌ Pesan gagal terkirim setelah ${retries}x percobaan.`);
    return null;
};

const botUtils = {
    safeSend,
    getWeekDates,
    sendJadwalBesokManual,
    buatTeksKisi,
    buatTeksPraktek // Tambahkan praktek ke utils
};

// ─────────────────────────────────────────────────────────────
// FIX #3: KEEPALIVE PING
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
            addLog("🔄 Koneksi zombie terdeteksi, reconnect...");
            isConnected = false;
            try { sock.end(); } catch (_) {}
        }
    }, 30000);
};

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
    if (botConfig.hasOwnProperty(feat)) {
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

// --- ROUTE WEBSITE KISI-KISI & API ---
app.get("/kisi-kisi", (req, res) => handleKisiKisiWeb(req, res));
app.get("/kisi-api/*", (req, res) => {
    const pathname = url.parse(req.url).pathname;
    return handleKisiKisiApi(req, res, pathname);
});

app.use('/files', express.static(PUBLIC_FILES_PATH));
app.use('/kisi_ujian', express.static(KISI_FILES_PATH)); // Route static untuk file kisi-kisi

app.get("/tugas/:filenames", (req, res) => {
    const filenames = req.params.filenames.split(','); 
    const isValid = filenames.every(name => {
        return path.basename(name) === name && !name.includes('..') && /^[\w\-. ]+$/.test(name);
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
        sock.ev.on('messages.update', () => {});

        sock.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) qrCodeData = await QRCode.toDataURL(qr);
            
            if (connection === "close") {
                isConnected = false;
                if (keepAliveInterval) clearInterval(keepAliveInterval);

                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                if (shouldReconnect) {
                    const delay = statusCode === 429 ? 30000 : 5000;
                    addLog(`🔴 Koneksi terputus (kode: ${statusCode}), reconnect dalam ${delay/1000}s...`);
                    setTimeout(start, delay);
                } else {
                    addLog("⚠️ Bot Logout. Silakan scan ulang QR Code.");
                    schedulerInitialized = false;
                }
            } else if (connection === "open") {
                isConnected = true; 
                qrCodeData = "";
                addLog("🟢 Bot Berhasil Terhubung ke WhatsApp!");
                
                startKeepAlive();

                if (!schedulerInitialized) {
                    initQuizScheduler(sock, botConfig, () => isConnected);
                    initJadwalBesokScheduler(sock, botConfig, safeSend);
                    initSmartFeedbackScheduler(sock, botConfig, safeSend);
                    initListPrMingguanScheduler(sock, botConfig, safeSend);
                    initSahurScheduler(sock, botConfig, safeSend);
                    
                    // Inisialisasi Scheduler Kisi-Kisi & Praktek
                    initUjianScheduler(sock, "6289531549103@s.whatsapp.net", botConfig); 
                    
                    schedulerInitialized = true;
                }
            }
        });

        sock.ev.on("messages.upsert", async (m) => {
            if (m.type === 'notify') {
                const msg = m.messages[0];
                if (!msg.message || msg.key.fromMe) return;
                
                stats.pesanMasuk++;
                const senderName = msg.pushName || 'User';

                const body = msg.message?.conversation || 
                             msg.message?.extendedTextMessage?.text || 
                             msg.message?.imageMessage?.caption || "";

                const isEmergency = await handleEmergency(sock, msg, body);
                if (isEmergency) {
                    addLog(`🚨 KODE DARURAT DIPICU OLEH: ${senderName}`);
                    return; 
                }

                addLog(`📩 Pesan masuk dari: ${senderName}`);
                await handleMessages(sock, m, botConfig, botUtils, safeSend);
            }
        });

    } catch (err) {
        console.error("❌ Gagal memulai bot:", err.message);
        addLog("❌ Gagal memulai bot, mencoba lagi dalam 10 detik...");
        setTimeout(start, 10000);
    }
}

start();
