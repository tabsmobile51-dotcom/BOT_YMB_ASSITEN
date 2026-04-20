// views/dashboard.js
const os = require("os");

const renderDashboard = (isConnected, qrCodeData, botConfig, stats, logs, port, profilePic) => {
    const usedRAM = ((os.totalmem() - os.freemem()) / (1024 ** 3)).toFixed(1);
    const uptime = (os.uptime() / 3600).toFixed(1);

    const moodStates = ["calm", "happy", "focused", "chill", "sharp", "ready"];
    const randomMoodClass = moodStates[Math.floor(Math.random() * moodStates.length)];

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

    const logLines = logs.map(l => `<div class="log-line"><span class="log-prompt">&gt;</span> ${l}</div>`).join('');

    const commonHead = `
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
        <style>
            *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

            :root {
                --bg:            #080d14;
                --surface:       #0f1923;
                --surface2:      #151f2e;
                --surface3:      #1a2639;
                --border:        rgba(255,255,255,0.07);
                --border-bright: rgba(255,255,255,0.14);

                --green:         #00e676;
                --green-dim:     rgba(0,230,118,0.08);
                --green-border:  rgba(0,230,118,0.25);
                --green-glow:    rgba(0,230,118,0.12);

                --text:          #e8edf5;
                --text-secondary:#a8b8cc;
                --text-muted:    #5a7080;

                --danger:        #ff4d6a;
                --danger-dim:    rgba(255,77,106,0.10);
                --danger-border: rgba(255,77,106,0.30);

                --accent:        #38bdf8;
                --accent-dim:    rgba(56,189,248,0.08);

                --radius-sm:     8px;
                --radius-md:     12px;
                --radius-lg:     18px;
                --radius-xl:     24px;
            }

            html, body {
                background: var(--bg);
                color: var(--text);
                font-family: 'IBM Plex Sans', system-ui, sans-serif;
                font-size: 14px;
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 1.5rem;
            }

            /* ──────────── NOISE OVERLAY ──────────── */
            body::before {
                content: '';
                position: fixed; inset: 0;
                background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E");
                pointer-events: none;
                z-index: 0;
            }

            /* ──────────── CARD ──────────── */
            .card {
                position: relative;
                background: var(--surface);
                border: 1px solid var(--border);
                border-radius: var(--radius-xl);
                padding: 2rem 1.75rem;
                width: 100%;
                max-width: 460px;
                z-index: 1;
                box-shadow:
                    0 0 0 1px rgba(0,230,118,0.04),
                    0 24px 60px rgba(0,0,0,0.5),
                    0 1px 0 var(--border-bright) inset;
            }
            .card::before {
                content: '';
                position: absolute;
                top: -1px; left: 50%;
                transform: translateX(-50%);
                width: 60%; height: 1px;
                background: linear-gradient(90deg, transparent, var(--green), transparent);
                border-radius: 1px;
            }

            /* ──────────── CSS AVATAR (no emoji) ──────────── */
            .avatar-ring {
                width: 80px; height: 80px;
                border-radius: 50%;
                background: var(--green-dim);
                border: 1px solid var(--green-border);
                display: flex; align-items: center; justify-content: center;
                margin: 0 auto 1.25rem;
                position: relative;
                animation: float 5s ease-in-out infinite;
                box-shadow: 0 0 24px var(--green-glow);
            }
            @keyframes float {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-6px); }
            }

            /* CSS face inside avatar */
            .css-face {
                width: 44px; height: 44px;
                background: var(--surface2);
                border-radius: 50%;
                border: 1px solid var(--green-border);
                position: relative;
                overflow: hidden;
            }
            .css-face::before,
            .css-face::after {
                content: '';
                position: absolute;
                background: var(--green);
                border-radius: 50%;
                width: 7px; height: 7px;
                top: 14px;
            }
            .css-face::before { left: 10px; }
            .css-face::after  { right: 10px; }
            .css-face .mouth {
                position: absolute;
                bottom: 10px; left: 50%;
                transform: translateX(-50%);
                width: 16px; height: 7px;
                border: 2px solid var(--green);
                border-top: none;
                border-radius: 0 0 10px 10px;
            }

            /* ──────────── BRAND ──────────── */
            .brand { text-align: center; margin-bottom: 1.75rem; }
            .brand h1 {
                font-family: 'IBM Plex Mono', monospace;
                font-size: 20px; font-weight: 600;
                letter-spacing: 2px; color: var(--text);
            }
            .brand h1 span { color: var(--green); }
            .badge-status {
                display: inline-flex; align-items: center; gap: 6px;
                background: var(--green-dim);
                color: var(--green);
                font-size: 11px; padding: 4px 12px;
                border-radius: 20px; font-weight: 500;
                border: 1px solid var(--green-border);
                margin-top: 8px;
                letter-spacing: 0.5px;
            }
            .badge-status::before {
                content: '';
                width: 6px; height: 6px;
                background: var(--green);
                border-radius: 50%;
                animation: pulse 2s infinite;
            }
            @keyframes pulse {
                0%, 100% { opacity: 1; transform: scale(1); }
                50%       { opacity: 0.4; transform: scale(0.8); }
            }

            /* ──────────── FORM FIELDS ──────────── */
            .field-group { margin-bottom: 1rem; position: relative; }
            .field-group label {
                display: block; font-size: 11px;
                color: var(--text-secondary);
                margin-bottom: 6px; font-weight: 500;
                letter-spacing: 0.8px; text-transform: uppercase;
            }
            .field-group input {
                width: 100%; padding: 11px 16px;
                font-size: 14px; border-radius: var(--radius-md);
                border: 1px solid var(--border);
                background: var(--surface2);
                color: var(--text);
                outline: none;
                font-family: 'IBM Plex Sans', sans-serif;
                transition: border-color 0.2s, box-shadow 0.2s;
            }
            .field-group input::placeholder { color: var(--text-muted); }
            .field-group input:focus {
                border-color: var(--green-border);
                box-shadow: 0 0 0 3px var(--green-glow);
            }
            .eye-btn {
                position: absolute; right: 13px; top: 34px;
                background: none; border: none; cursor: pointer;
                color: var(--text-muted); font-size: 13px;
                line-height: 1; padding: 2px;
                transition: color 0.2s;
            }
            .eye-btn:hover { color: var(--text-secondary); }

            /* eye icon via CSS */
            .eye-icon {
                display: inline-block;
                width: 16px; height: 10px;
                border: 1.5px solid currentColor;
                border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
                position: relative;
            }
            .eye-icon::after {
                content: '';
                position: absolute;
                width: 5px; height: 5px;
                background: currentColor;
                border-radius: 50%;
                top: 50%; left: 50%;
                transform: translate(-50%, -50%);
            }
            .eye-hide .eye-icon::before {
                content: '';
                position: absolute;
                width: 18px; height: 1.5px;
                background: var(--surface2);
                top: 50%; left: -1px;
                transform: translateY(-50%) rotate(-30deg);
                border-top: 1.5px solid currentColor;
            }

            /* ──────────── BUTTONS ──────────── */
            .btn-primary {
                width: 100%; padding: 11px;
                border-radius: var(--radius-md);
                border: none; background: var(--green);
                color: #031a0a;
                font-family: 'IBM Plex Mono', monospace;
                font-size: 13px; font-weight: 600;
                cursor: pointer; transition: opacity 0.2s, box-shadow 0.2s;
                letter-spacing: 1px;
            }
            .btn-primary:hover {
                opacity: 0.88;
                box-shadow: 0 0 20px var(--green-glow);
            }
            .btn-primary:disabled { opacity: 0.35; cursor: not-allowed; }

            .btn-danger {
                background: none;
                border: 1px solid var(--danger-border);
                color: var(--danger);
                padding: 6px 14px;
                border-radius: 20px;
                font-size: 12px; font-weight: 500;
                cursor: pointer;
                font-family: 'IBM Plex Mono', monospace;
                letter-spacing: 0.5px;
                transition: background 0.2s, box-shadow 0.2s;
            }
            .btn-danger:hover {
                background: var(--danger-dim);
                box-shadow: 0 0 12px rgba(255,77,106,0.15);
            }

            .btn-ghost {
                background: var(--surface2);
                border: 1px solid var(--border);
                color: var(--text-secondary);
                padding: 10px 16px;
                border-radius: var(--radius-md);
                font-size: 13px; cursor: pointer;
                width: 100%; text-align: left;
                display: flex; justify-content: space-between; align-items: center;
                transition: border-color 0.2s, color 0.2s;
                font-family: 'IBM Plex Sans', sans-serif;
            }
            .btn-ghost:hover {
                border-color: var(--border-bright);
                color: var(--text);
            }
            .btn-ghost .ghost-icon {
                display: flex; align-items: center; gap: 8px;
            }

            /* gear icon CSS */
            .icon-gear {
                width: 14px; height: 14px;
                border: 2px solid currentColor;
                border-radius: 50%;
                position: relative; flex-shrink: 0;
            }
            .icon-gear::before {
                content: '';
                position: absolute;
                inset: -4px;
                background:
                    conic-gradient(currentColor 0deg 30deg, transparent 30deg 60deg,
                    currentColor 60deg 90deg, transparent 90deg 120deg,
                    currentColor 120deg 150deg, transparent 150deg 180deg,
                    currentColor 180deg 210deg, transparent 210deg 240deg,
                    currentColor 240deg 270deg, transparent 270deg 300deg,
                    currentColor 300deg 330deg, transparent 330deg 360deg);
                border-radius: 50%;
                -webkit-mask: radial-gradient(circle 4px at center, transparent 100%, black 100%);
                mask: radial-gradient(circle 4px at center, transparent 100%, black 100%);
            }

            /* chevron CSS */
            .icon-chevron {
                width: 8px; height: 8px;
                border-right: 1.5px solid currentColor;
                border-bottom: 1.5px solid currentColor;
                transform: rotate(45deg);
                transition: transform 0.25s;
            }
            .icon-chevron.open { transform: rotate(-135deg); }

            /* ──────────── ALERTS ──────────── */
            .alert {
                padding: 10px 14px; border-radius: var(--radius-sm);
                font-size: 12px; margin-bottom: 1rem; display: none;
                font-family: 'IBM Plex Mono', monospace;
                border-left: 3px solid;
                line-height: 1.5;
            }
            .alert-error  { background: var(--danger-dim);  color: var(--danger);  border-color: var(--danger);  }
            .alert-success { background: var(--green-dim);   color: var(--green);   border-color: var(--green);   }

            /* ──────────── STATS GRID ──────────── */
            .stats-grid {
                display: grid;
                grid-template-columns: repeat(4, minmax(0,1fr));
                gap: 8px; margin-bottom: 1rem;
            }
            .stat-card {
                background: var(--surface2);
                border: 1px solid var(--border);
                border-radius: var(--radius-md);
                padding: 12px 8px; text-align: center;
                transition: border-color 0.2s;
            }
            .stat-card:hover { border-color: var(--green-border); }
            .stat-card .val {
                font-family: 'IBM Plex Mono', monospace;
                font-size: 16px; font-weight: 600;
                color: var(--text);
                line-height: 1;
            }
            .stat-card .lbl {
                font-size: 10px; color: var(--text-muted);
                margin-top: 4px; letter-spacing: 0.8px;
                text-transform: uppercase;
            }

            /* ──────────── CONFIG GRID ──────────── */
            .config-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 6px; margin-top: 10px; margin-bottom: 1rem;
            }
            .config-item {
                background: var(--surface3);
                border: 1px solid var(--border);
                border-radius: var(--radius-sm);
                padding: 10px 12px;
                display: flex; align-items: center;
                justify-content: space-between; gap: 8px;
            }
            .config-label {
                font-size: 12px;
                color: var(--text-secondary);
                line-height: 1.3;
            }
            .pill {
                font-family: 'IBM Plex Mono', monospace;
                font-size: 10px; padding: 3px 9px;
                border-radius: 20px; font-weight: 600;
                cursor: pointer; border: 1px solid;
                text-decoration: none; display: inline-block;
                flex-shrink: 0; letter-spacing: 0.5px;
                transition: opacity 0.15s;
            }
            .pill:hover { opacity: 0.75; }
            .pill-on  { background: var(--green-dim);  color: var(--green);  border-color: var(--green-border); }
            .pill-off { background: transparent;        color: var(--text-muted); border-color: var(--border); }

            /* ──────────── QUOTE BOX ──────────── */
            .quote-box {
                background: var(--surface2);
                border-left: 2px solid var(--green);
                padding: 12px 16px;
                border-radius: 0 var(--radius-md) var(--radius-md) 0;
                margin-bottom: 1.25rem;
                font-size: 13px;
                color: var(--text-secondary);
                font-style: italic; line-height: 1.6;
            }

            /* ──────────── LOG BOX ──────────── */
            .log-box {
                background: var(--surface2);
                border: 1px solid var(--border);
                border-radius: var(--radius-md);
                height: 150px; overflow-y: auto;
                padding: 12px 14px;
                font-family: 'IBM Plex Mono', monospace;
                font-size: 12px; line-height: 1.7;
                margin-bottom: 1rem;
            }
            .log-box::-webkit-scrollbar { width: 4px; }
            .log-box::-webkit-scrollbar-track { background: transparent; }
            .log-box::-webkit-scrollbar-thumb { background: var(--border-bright); border-radius: 2px; }
            .log-line { color: var(--text-secondary); }
            .log-line .log-prompt { color: var(--green); margin-right: 4px; }

            /* ──────────── QR BOX ──────────── */
            .qr-box {
                background: white; padding: 16px;
                border-radius: var(--radius-lg);
                display: inline-block;
                box-shadow: 0 0 40px rgba(0,230,118,0.15);
            }

            /* ──────────── HEADER ROW ──────────── */
            .dash-header {
                display: flex; align-items: center;
                justify-content: space-between;
                margin-bottom: 1.25rem;
            }
            .dash-title {
                font-family: 'IBM Plex Mono', monospace;
                font-size: 17px; font-weight: 600;
                color: var(--text);
            }
            .dash-title span { color: var(--green); }

            /* ──────────── FOOTER ──────────── */
            .divider { height: 1px; background: var(--border); margin: 1rem 0; }
            .footer { text-align: center; }
            .footer small { color: var(--text-muted); font-size: 11px; letter-spacing: 0.3px; }
            .footer .author {
                color: var(--green);
                font-weight: 600;
                font-family: 'IBM Plex Mono', monospace;
            }

            /* ──────────── SPINNER (CSS) ──────────── */
            .css-spinner {
                width: 28px; height: 28px;
                border: 2px solid var(--border);
                border-top-color: var(--green);
                border-radius: 50%;
                animation: spin 0.8s linear infinite;
                margin: 0 auto 12px;
            }
            @keyframes spin { to { transform: rotate(360deg); } }

            #configPanel { display: none; }

            /* ──────────── LOADING OVERLAY ──────────── */
            #loginLoading { display: none; text-align: center; padding: 1.5rem 0; }
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
            <div class="avatar-ring" id="loginAvatar">
                <div class="css-face">
                    <div class="mouth"></div>
                </div>
            </div>
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
                    <button class="eye-btn" id="eyeBtn" onclick="togglePass()" title="Tampilkan/sembunyikan">
                        <span class="eye-icon" id="eyeIcon"></span>
                    </button>
                </div>
                <button class="btn-primary" id="loginBtn" onclick="attemptLogin()">MASUK</button>
            </div>

            <div id="loginLoading">
                <div class="css-spinner"></div>
                <div style="font-size:13px; color:var(--text-muted); font-family:'IBM Plex Mono',monospace;">Memverifikasi...</div>
            </div>
        </div>
    </div>

    <!-- ═══ DASHBOARD SCREEN ═══ -->
    <div id="dashScreen" style="display:none; width:100%; max-width:460px;">
        <div class="card">

            <div class="dash-header">
                <div>
                    <div class="dash-title">Y.B.M <span>Asisten</span></div>
                    <div class="badge-status">Aktif</div>
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
                <span class="ghost-icon">
                    <span class="icon-gear"></span>
                    Konfigurasi sistem
                </span>
                <span class="icon-chevron" id="configArrow"></span>
            </button>

            <div id="configPanel">
                <div class="config-grid">
                    ${configButtons}
                </div>
            </div>

            <div class="divider"></div>

            <div class="log-box" id="logBox">${logLines}</div>

            <div class="footer">
                <small>Dioperasikan oleh <span class="author">Zaki</span></small>
            </div>
        </div>
    </div>

    <script>
        let failCount = 0;
        let isCooldown = false;

        window.onload = () => {
            if (sessionStorage.getItem('zaki_auth') === '1') {
                showDash(true);
            }
            const lb = document.getElementById('logBox');
            if (lb) lb.scrollTop = lb.scrollHeight;
        };

        function togglePass() {
            const p = document.getElementById('password');
            const icon = document.getElementById('eyeIcon');
            if (p.type === 'password') {
                p.type = 'text';
                icon.classList.add('eye-hide');
            } else {
                p.type = 'password';
                icon.classList.remove('eye-hide');
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

            if (u === 'ZAKI' && p === 'ZAKI_DEVELOPER_BOT') {
                sessionStorage.setItem('zaki_auth', '1');
                document.getElementById('loginFields').style.display = 'none';
                document.getElementById('loginLoading').style.display = 'block';
                document.getElementById('alertBox').style.display = 'none';
                setTimeout(() => showDash(false), 1200);
            } else {
                failCount++;
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

            const iv = setInterval(() => {
                showAlert('Sistem terkunci selama ' + t + ' detik...', 'error');
                t--;
                if (t < 0) {
                    clearInterval(iv);
                    isCooldown = false;
                    failCount = 0;
                    btn.disabled = false;
                    document.getElementById('alertBox').style.display = 'none';
                }
            }, 1000);
        }

        function toggleConfig() {
            const panel = document.getElementById('configPanel');
            const arrow = document.getElementById('configArrow');
            const open = panel.style.display === 'block';
            panel.style.display = open ? 'none' : 'block';
            arrow.classList.toggle('open', !open);
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
        <div class="avatar-ring" style="margin-bottom:1.5rem;">
            <div class="css-face">
                <div class="mouth"></div>
            </div>
        </div>
        <div class="brand">
            <h1>Scan <span>QR Code</span></h1>
        </div>
        <p style="font-size:13px; color:var(--text-secondary); margin-bottom:1.75rem; line-height:1.5;">
            Hubungkan WhatsApp ke sistem
        </p>

        <div style="margin-bottom:1.75rem;">
            ${qrCodeData
                ? `<div class="qr-box"><img src="${qrCodeData}" width="240" alt="QR Code WhatsApp"></div>`
                : `<div style="padding:2rem; color:var(--text-muted); font-size:13px;">
                        <div class="css-spinner"></div>
                        <div style="font-family:'IBM Plex Mono',monospace;">Membuat QR code...</div>
                   </div>`
            }
        </div>

        <p style="font-size:12px; color:var(--text-muted); margin-bottom:1.25rem; line-height:1.6;">
            Buka WhatsApp &rarr; Perangkat tertaut &rarr; Tautkan perangkat
        </p>

        <button class="btn-primary" onclick="location.reload()">REFRESH HALAMAN</button>

        <div class="footer" style="margin-top:1.5rem;">
            <small>Port: <strong style="color:var(--text-secondary); font-family:'IBM Plex Mono',monospace;">${port}</strong> &nbsp;&middot;&nbsp; Dioperasikan oleh <span class="author">Zaki</span></small>
        </div>
    </div>
</body>
</html>
    `;
};

module.exports = { renderDashboard };
