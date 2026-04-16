// views/dashboard.js
const os = require("os");

const renderDashboard = (isConnected, qrCodeData, botConfig, stats, logs, port, profilePic) => {
    const usedRAM = ((os.totalmem() - os.freemem()) / (1024 ** 3)).toFixed(1);
    const uptime = (os.uptime() / 3600).toFixed(1);

    const moodEmojis = ["😅", "🤣", "😁", "😕", "🤫", "😆", "😗", "😂"];
    const randomMood = moodEmojis[Math.floor(Math.random() * moodEmojis.length)];

    const quotes = [
        "Tetap fokus, hasil tidak akan mengkhianati proses.",
        "Coding adalah seni, dan kamu adalah senimannya.",
        "Jangan berhenti saat lelah, berhentilah saat selesai.",
        "Error adalah cara kode berkata: ajari aku lebih baik.",
        "Jadikan hari ini lebih baik dari kemarin.",
        "Satu baris kode hari ini, satu langkah menuju sukses.",
        "Bekerja keras dalam diam, biarkan botmu yang berisik."
    ];
    const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];

    // Generate toggle buttons dari botConfig secara otomatis
    const configButtons = Object.keys(botConfig).map(key => {
        const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
        const isOn = botConfig[key];
        return `
            <div class="config-item">
                <span class="config-label">${label}</span>
                <a href="/toggle/${key}" class="pill ${isOn ? 'pill-on' : 'pill-off'}">${isOn ? 'ON' : 'OFF'}</a>
            </div>
        `;
    }).join('');

    const logLines = logs.map(l => `<div>&gt; ${l}</div>`).join('');

    const commonHead = `
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
        <style>
            *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

            :root {
                --bg: #0f172a;
                --surface: #1e293b;
                --surface2: #263244;
                --border: rgba(255,255,255,0.08);
                --green: #22c55e;
                --green-dim: rgba(34,197,94,0.12);
                --green-border: rgba(34,197,94,0.3);
                --text: #f1f5f9;
                --muted: #94a3b8;
                --danger: #ef4444;
                --danger-dim: rgba(239,68,68,0.12);
            }

            body {
                background: var(--bg);
                color: var(--text);
                font-family: 'Segoe UI', system-ui, sans-serif;
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 1.5rem;
            }

            /* ── CARD ── */
            .card {
                background: var(--surface);
                border: 0.5px solid var(--border);
                border-radius: 20px;
                padding: 2rem 1.5rem;
                width: 100%;
                max-width: 440px;
            }

            /* ── AVATAR ── */
            .avatar-ring {
                width: 80px; height: 80px; border-radius: 50%;
                background: var(--green-dim);
                border: 1px solid var(--green-border);
                display: flex; align-items: center; justify-content: center;
                font-size: 38px; margin: 0 auto 1rem;
                animation: swing 4s infinite ease-in-out;
            }
            @keyframes swing {
                0%, 100% { transform: rotate(-5deg); }
                50% { transform: rotate(5deg); }
            }

            /* ── BRAND ── */
            .brand { text-align: center; margin-bottom: 1.5rem; }
            .brand h1 { font-size: 20px; font-weight: 600; letter-spacing: 1px; }
            .brand h1 span { color: var(--green); }
            .badge-status {
                display: inline-block;
                background: var(--green-dim);
                color: var(--green);
                font-size: 11px; padding: 3px 10px;
                border-radius: 20px; font-weight: 500; margin-top: 6px;
            }

            /* ── FORM ── */
            .field-group { margin-bottom: 1rem; position: relative; }
            .field-group label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 5px; font-weight: 500; }
            .field-group input {
                width: 100%; padding: 10px 14px;
                font-size: 14px; border-radius: 10px;
                border: 0.5px solid var(--border);
                background: var(--surface2);
                color: var(--text); outline: none;
                transition: border-color 0.2s;
            }
            .field-group input:focus { border-color: var(--green-border); }
            .eye-btn {
                position: absolute; right: 12px; top: 33px;
                background: none; border: none; cursor: pointer;
                color: var(--muted); font-size: 14px; line-height: 1;
            }

            /* ── BUTTONS ── */
            .btn-primary {
                width: 100%; padding: 10px; border-radius: 10px;
                border: none; background: var(--green);
                color: #052e16; font-size: 13px; font-weight: 600;
                cursor: pointer; transition: opacity 0.2s; letter-spacing: 0.5px;
            }
            .btn-primary:hover { opacity: 0.85; }
            .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
            .btn-danger {
                background: none; border: 0.5px solid var(--danger);
                color: var(--danger); padding: 5px 14px;
                border-radius: 20px; font-size: 12px; cursor: pointer; transition: 0.2s;
            }
            .btn-danger:hover { background: var(--danger-dim); }
            .btn-ghost {
                background: none; border: 0.5px solid var(--border);
                color: var(--muted); padding: 8px 16px;
                border-radius: 10px; font-size: 13px; cursor: pointer;
                width: 100%; text-align: left; display: flex;
                justify-content: space-between; align-items: center;
                transition: border-color 0.2s;
            }
            .btn-ghost:hover { border-color: rgba(255,255,255,0.2); }

            /* ── ALERTS ── */
            .alert {
                padding: 8px 12px; border-radius: 8px;
                font-size: 12px; margin-bottom: 1rem; display: none;
            }
            .alert-error { background: var(--danger-dim); color: var(--danger); }
            .alert-success { background: var(--green-dim); color: var(--green); }

            /* ── STATS ── */
            .stats-grid { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 8px; margin-bottom: 1rem; }
            .stat-card { background: var(--surface2); border-radius: 10px; padding: 10px 8px; text-align: center; }
            .stat-card .val { font-size: 15px; font-weight: 600; }
            .stat-card .lbl { font-size: 11px; color: var(--muted); margin-top: 2px; }

            /* ── CONFIG ── */
            .config-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; margin-bottom: 1rem; }
            .config-item {
                background: var(--surface2); border-radius: 10px;
                padding: 10px 12px; display: flex;
                align-items: center; justify-content: space-between;
            }
            .config-label { font-size: 12px; color: var(--muted); }
            .pill {
                font-size: 11px; padding: 2px 10px; border-radius: 20px;
                font-weight: 600; cursor: pointer; border: none;
                text-decoration: none; display: inline-block;
            }
            .pill-on { background: var(--green-dim); color: var(--green); }
            .pill-off { background: var(--surface); color: var(--muted); border: 0.5px solid var(--border); }

            /* ── QUOTE ── */
            .quote-box {
                background: var(--surface2);
                border-left: 2px solid var(--green-border);
                padding: 10px 14px;
                border-radius: 0 10px 10px 0;
                margin-bottom: 1.25rem;
                font-size: 13px; color: var(--muted);
                font-style: italic; line-height: 1.5;
            }

            /* ── LOG ── */
            .log-box {
                background: var(--surface2);
                border: 0.5px solid var(--border);
                border-radius: 10px; height: 140px;
                overflow-y: auto; padding: 10px 14px;
                font-family: 'Courier New', monospace;
                font-size: 12px; color: var(--green);
                line-height: 1.6; margin-bottom: 1rem;
            }

            /* ── QR ── */
            .qr-box { background: white; padding: 16px; border-radius: 16px; display: inline-block; }

            /* ── FOOTER ── */
            .footer { text-align: center; padding-top: 1rem; border-top: 0.5px solid var(--border); }
            .footer small { color: var(--muted); font-size: 11px; }
            .footer .author { color: var(--green); font-weight: 600; }

            .divider { height: 0.5px; background: var(--border); margin: 1rem 0; }
            #configPanel { display: none; }
        </style>
    `;

    // ──────────────────────────────────────────────
    // HALAMAN UTAMA (setelah WhatsApp terhubung)
    // ──────────────────────────────────────────────
    if (isConnected) {
        return `
<!DOCTYPE html>
<html lang="id">
<head>
    <title>Y.B.M Asisten</title>
    ${commonHead}
</head>
<body>

    <!-- ═══ LOGIN SCREEN ═══ -->
    <div id="loginScreen">
        <div class="card" id="loginCard">
            <div class="avatar-ring" id="loginAvatar">${randomMood}</div>
            <div class="brand">
                <h1>Y.B.M <span>Asisten</span></h1>
            </div>

            <div class="alert alert-error" id="alertBox"></div>

            <div id="loginFields">
                <div class="field-group">
                    <label>Username</label>
                    <input type="text" id="username" placeholder="Masukkan username" autocomplete="off">
                </div>
                <div class="field-group">
                    <label>Password</label>
                    <input type="password" id="password" placeholder="Masukkan password">
                    <button class="eye-btn" id="eyeBtn" onclick="togglePass()">👁</button>
                </div>
                <button class="btn-primary" id="loginBtn" onclick="attemptLogin()">Masuk</button>
            </div>

            <div id="loginLoading" style="display:none; text-align:center; padding:1rem 0;">
                <div style="font-size:13px; color:var(--muted);">Memverifikasi...</div>
            </div>
        </div>
    </div>

    <!-- ═══ DASHBOARD SCREEN ═══ -->
    <div id="dashScreen" style="display:none; width:100%; max-width:440px;">
        <div class="card">

            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:1rem;">
                <div>
                    <h1 style="font-size:18px; font-weight:600;">Y.B.M <span style="color:var(--green);">Asisten</span></h1>
                    <div class="badge-status">● Aktif</div>
                </div>
                <button class="btn-danger" onclick="doLogout()">Keluar</button>
            </div>

            <div class="quote-box">${randomQuote}</div>

            <div class="stats-grid">
                <div class="stat-card"><div class="val">${usedRAM}G</div><div class="lbl">RAM</div></div>
                <div class="stat-card"><div class="val">${uptime}J</div><div class="lbl">Uptime</div></div>
                <div class="stat-card"><div class="val">${stats.pesanMasuk}</div><div class="lbl">Chat</div></div>
                <div class="stat-card"><div class="val">${stats.totalLog}</div><div class="lbl">Log</div></div>
            </div>

            <button class="btn-ghost" onclick="toggleConfig()">
                <span>⚙ Konfigurasi sistem</span>
                <span id="configArrow" style="font-size:11px; color:var(--muted);">tampilkan ▾</span>
            </button>

            <div id="configPanel">
                <div class="config-grid">
                    ${configButtons}
                </div>
            </div>

            <div class="divider"></div>

            <div class="log-box">${logLines}</div>

            <div class="footer">
                <small>Dioperasikan oleh <span class="author">Zaki</span></small>
            </div>
        </div>
    </div>

    <script>
        let failCount = 0;
        let isCooldown = false;

        // Auto-login jika sesi masih aktif
        window.onload = () => {
            if (sessionStorage.getItem('zaki_auth') === '1') {
                showDash(true);
            }
            // Scroll log ke bawah
            const lb = document.getElementById('logBox');
            if (lb) lb.scrollTop = lb.scrollHeight;
        };

        function togglePass() {
            const p = document.getElementById('password');
            const btn = document.getElementById('eyeBtn');
            if (p.type === 'password') {
                p.type = 'text';
                btn.textContent = '🙈';
            } else {
                p.type = 'password';
                btn.textContent = '👁';
            }
        }

        function showAlert(msg, type) {
            const el = document.getElementById('alertBox');
            el.textContent = msg;
            el.className = 'alert alert-' + type;
            el.style.display = 'block';
        }

        function attemptLogin() {
            if (isCooldown) return;

            const u = document.getElementById('username').value.trim();
            const p = document.getElementById('password').value;

            // Catatan: validasi sebaiknya dilakukan di server, bukan client-side
            if (u === 'ZAKI' && p === 'ZAKI_DEVELOPER_BOT') {
                sessionStorage.setItem('zaki_auth', '1');
                document.getElementById('loginFields').style.display = 'none';
                document.getElementById('loginLoading').style.display = 'block';
                document.getElementById('loginAvatar').textContent = '😄';
                document.getElementById('alertBox').style.display = 'none';

                setTimeout(() => showDash(false), 1200);

            } else {
                failCount++;
                document.getElementById('loginAvatar').textContent = '😤';
                setTimeout(() => {
                    if (!isCooldown) document.getElementById('loginAvatar').textContent = '${randomMood}';
                }, 600);

                if (failCount >= 5) {
                    startCooldown();
                } else {
                    showAlert('Username atau password salah. (' + failCount + '/5)', 'error');
                }
            }
        }

        function showDash(isAuto) {
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('dashScreen').style.display = 'block';
        }

        function doLogout() {
            sessionStorage.removeItem('zaki_auth');
            location.reload();
        }

        function startCooldown() {
            isCooldown = true;
            let t = 20;
            const btn = document.getElementById('loginBtn');
            btn.disabled = true;
            document.getElementById('loginAvatar').textContent = '🫠';

            const iv = setInterval(() => {
                showAlert('Sistem terkunci selama ' + t + ' detik...', 'error');
                t--;
                if (t < 0) {
                    clearInterval(iv);
                    isCooldown = false;
                    failCount = 0;
                    btn.disabled = false;
                    document.getElementById('alertBox').style.display = 'none';
                    document.getElementById('loginAvatar').textContent = '${randomMood}';
                }
            }, 1000);
        }

        function toggleConfig() {
            const panel = document.getElementById('configPanel');
            const arrow = document.getElementById('configArrow');
            const open = panel.style.display === 'block';
            panel.style.display = open ? 'none' : 'block';
            arrow.textContent = open ? 'tampilkan ▾' : 'sembunyikan ▴';
        }
    </script>
</body>
</html>
        `;
    }

    // ──────────────────────────────────────────────
    // HALAMAN QR CODE (WhatsApp belum terhubung)
    // ──────────────────────────────────────────────
    return `
<!DOCTYPE html>
<html lang="id">
<head>
    <title>Scan QR - Y.B.M Asisten</title>
    ${commonHead}
</head>
<body>
    <div class="card" style="text-align:center; max-width:380px;">
        <div class="avatar-ring" style="margin-bottom:1.25rem;">${randomMood}</div>
        <div class="brand">
            <h1>Scan <span>QR Code</span></h1>
        </div>
        <p style="font-size:13px; color:var(--muted); margin-bottom:1.5rem;">Hubungkan WhatsApp ke sistem</p>

        <div style="margin-bottom:1.5rem;">
            ${qrCodeData
                ? `<div class="qr-box"><img src="${qrCodeData}" width="240" alt="QR Code WhatsApp"></div>`
                : `<div style="padding:2rem; color:var(--muted); font-size:13px;">
                        <div class="spinner-border text-success mb-2" role="status"></div>
                        <div>Membuat QR code...</div>
                   </div>`
            }
        </div>

        <p style="font-size:12px; color:var(--muted); margin-bottom:1rem;">
            Buka WhatsApp → Perangkat tertaut → Tautkan perangkat
        </p>

        <button class="btn-primary" onclick="location.reload()">Refresh halaman</button>

        <div class="footer" style="margin-top:1.5rem;">
            <small>Port: <strong>${port}</strong> &nbsp;|&nbsp; Dioperasikan oleh <span class="author">Zaki</span></small>
        </div>
    </div>
</body>
</html>
    `;
};

module.exports = { renderDashboard };
