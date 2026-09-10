const vscode = require('vscode');
const https = require('https');

function fetchLiveWeather() {
  return new Promise((resolve) => {
    const req = https.get('https://wttr.in/?format=j1', {
      headers: { 'User-Agent': 'curl/8.0' },
      timeout: 6000
    }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return resolve(null);
      }
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          const current = json.current_condition && json.current_condition[0];
          const area = json.nearest_area && json.nearest_area[0];
          if (!current) return resolve(null);

          const city = (area && area.areaName && area.areaName[0] && area.areaName[0].value) || 'Local';
          const tempC = current.temp_C || '';
          const tempF = current.temp_F || '';
          const desc = (current.weatherDesc && current.weatherDesc[0] && current.weatherDesc[0].value) || 'Clear';
          const descLower = desc.toLowerCase();

          let weatherType = 'clear';
          if (descLower.includes('rain') || descLower.includes('drizzle') || descLower.includes('shower')) {
            weatherType = 'rain';
          } else if (descLower.includes('thunder') || descLower.includes('storm')) {
            weatherType = 'thunder';
          } else if (descLower.includes('snow') || descLower.includes('blizzard') || descLower.includes('ice') || descLower.includes('sleet')) {
            weatherType = 'snow';
          } else if (descLower.includes('cloud') || descLower.includes('overcast') || descLower.includes('fog') || descLower.includes('mist')) {
            weatherType = 'cloudy';
          }

          resolve({
            city,
            tempC,
            tempF,
            desc,
            weatherType
          });
        } catch (e) {
          resolve(null);
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });

    req.on('error', () => {
      resolve(null);
    });
  });
}

function getHeaderTitleForHour(h) {
  if (h >= 6 && h < 11) return 'Good Morning';
  if (h >= 11 && h < 16) return 'Good Afternoon';
  if (h >= 16 && h < 19) return 'Good Evening';
  return 'Good Night';
}

function getHeaderTitleForPhase(phase) {
  switch (phase) {
    case 'morning': return 'Good Morning';
    case 'afternoon': return 'Good Afternoon';
    case 'evening': return 'Good Evening';
    case 'night':
    default: return 'Good Night';
  }
}

class SpiderCompanionViewProvider {
  static viewType = 'antigravity.spiderCompanionView';

  constructor(extensionUri, onTitleChange) {
    this._extensionUri = extensionUri;
    this._view = null;
    this._titleTimer = null;
    this._weatherTimer = null;
    this._cachedWeather = null;
    this._lastWeatherFetch = 0;
    this._onTitleChange = onTitleChange || null;
  }

  resolveWebviewView(webviewView, context, token) {
    this._view = webviewView;

    // 1. Instantly set dynamic header label matching current local time
    this._updateTitle();

    // 2. Refresh header title every minute to catch hour boundary crossings
    if (this._titleTimer) {
      clearInterval(this._titleTimer);
    }
    this._titleTimer = setInterval(() => {
      this._updateTitle();
    }, 60000);

    // 3. Initialize real-time weather polling (every 20 minutes)
    this._initWeather();

    webviewView.onDidDispose(() => {
      if (this._titleTimer) {
        clearInterval(this._titleTimer);
        this._titleTimer = null;
      }
      if (this._weatherTimer) {
        clearInterval(this._weatherTimer);
        this._weatherTimer = null;
      }
      this._view = null;
    });

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    // 4. Listen for preview phase switches or requests from webview
    webviewView.webview.onDidReceiveMessage(message => {
      if (message.command === 'updateTitle' && message.title) {
        webviewView.title = message.title;
        if (typeof this._onTitleChange === 'function') {
          this._onTitleChange(message.title, message.phase);
        }
      } else if (message.command === 'requestWeather') {
        this._sendWeather();
      }
    });

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
  }

  async _initWeather() {
    const now = Date.now();
    if (this._cachedWeather && (now - this._lastWeatherFetch < 1200000)) {
      this._sendWeather();
    } else {
      await this._refreshWeather();
    }

    if (this._weatherTimer) {
      clearInterval(this._weatherTimer);
    }
    this._weatherTimer = setInterval(() => {
      this._refreshWeather();
    }, 1200000); // Refresh every 20 minutes
  }

  async _refreshWeather() {
    const data = await fetchLiveWeather();
    if (data) {
      this._cachedWeather = data;
      this._lastWeatherFetch = Date.now();
      this._sendWeather();
    }
  }

  _sendWeather() {
    if (this._view && this._cachedWeather) {
      this._view.webview.postMessage({
        command: 'weatherUpdate',
        data: this._cachedWeather
      });
    }
  }

  _updateTitle(forcedPhase) {
    if (this._view) {
      const title = forcedPhase ? getHeaderTitleForPhase(forcedPhase) : getHeaderTitleForHour(new Date().getHours());
      this._view.title = title;
      if (typeof this._onTitleChange === 'function') {
        const phase = forcedPhase || this._getSystemPhase();
        this._onTitleChange(title, phase);
      }
    }
  }

  _getSystemPhase() {
    const h = new Date().getHours();
    if (h >= 6 && h < 11) return 'morning';
    if (h >= 11 && h < 16) return 'afternoon';
    if (h >= 16 && h < 19) return 'evening';
    return 'night';
  }

  _getHtmlForWebview(webview) {
    const initialTitle = getHeaderTitleForHour(new Date().getHours());
    const fontUri = webview ? webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'assets', 'fonts', 'ComicMono.ttf')) : '';
    const fontBoldUri = webview ? webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'assets', 'fonts', 'ComicMono-Bold.ttf')) : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${initialTitle}</title>
  <style>
    @font-face {
      font-family: 'Comic Mono';
      src: url('${fontUri}') format('truetype');
      font-weight: normal;
      font-style: normal;
    }
    @font-face {
      font-family: 'Comic Mono';
      src: url('${fontBoldUri}') format('truetype');
      font-weight: bold;
      font-style: normal;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%;
      height: 100%;
      background-color: #16191f;
      overflow: hidden;
      user-select: none;
      font-family: 'Comic Mono', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    #ambientCanvas {
      display: block;
      width: 100%;
      height: 100%;
      image-rendering: pixelated;
      image-rendering: crisp-edges;
    }

    /* FORCED 100% VISIBLE BY DEFAULT - NO HOVER REQUIRED */
    #timeBadge {
      position: absolute;
      top: 7px;
      right: 9px;
      padding: 3px 9px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.5px;
      border-radius: 5px;
      background: rgba(18, 20, 27, 0.90);
      backdrop-filter: blur(8px);
      color: #ffffff;
      opacity: 0.96;
      border: 1px solid rgba(255, 255, 255, 0.24);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
      pointer-events: auto;
      cursor: pointer;
      text-transform: uppercase;
      font-family: 'Comic Mono', monospace;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: transform 0.15s ease, background 0.15s ease;
    }
    #timeBadge:hover {
      transform: scale(1.03);
      background: rgba(24, 28, 38, 0.95);
      border-color: rgba(255, 255, 255, 0.4);
    }
  </style>
</head>
<body>
  <canvas id="ambientCanvas"></canvas>
  <div id="timeBadge" title="Click to cycle time & weather preview">LIVE</div>

  <script>
    const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
    const canvas = document.getElementById('ambientCanvas');
    const ctx = canvas.getContext('2d');
    const timeBadge = document.getElementById('timeBadge');

    let width = 0;
    let height = 0;
    let streetY = 0;
    let liveWeather = null;

    // --- TIME & WEATHER ENGINE ---
    // Morning:   6 AM - 11 AM -> "Good Morning"
    // Afternoon: 11 AM - 4 PM -> "Good Afternoon"
    // Evening:   4 PM - 7 PM  -> "Good Evening"
    // Night:     7 PM - 6 AM  -> "Good Night"
    function calculateSystemTimePhase() {
      const h = new Date().getHours();
      if (h >= 6 && h < 11) return 'morning';
      if (h >= 11 && h < 16) return 'afternoon';
      if (h >= 16 && h < 19) return 'evening';
      return 'night';
    }

    function calculateSystemWeather() {
      if (liveWeather && liveWeather.weatherType) {
        return liveWeather.weatherType;
      }
      // Natural clock-linked fallback: gentle rain occurs in cozy 4-minute intervals
      const m = new Date().getMinutes();
      return (m % 20 < 4) ? 'rain' : 'clear';
    }

    function getTitleForPhase(phase) {
      if (phase === 'morning') return 'Good Morning';
      if (phase === 'afternoon') return 'Good Afternoon';
      if (phase === 'evening') return 'Good Evening';
      return 'Good Night';
    }

    let activePhase = calculateSystemTimePhase();
    let activeWeather = calculateSystemWeather();
    let manualOverride = false;

    // --- RAIN PARTICLES ENGINE ---
    const raindrops = [];
    function initRain() {
      raindrops.length = 0;
      const count = Math.max(30, Math.floor(width / 15));
      for (let i = 0; i < count; i++) {
        raindrops.push({
          x: Math.random() * (width + 40) - 20,
          y: Math.random() * streetY,
          speed: 4.8 + Math.random() * 3.2,
          len: 8 + Math.random() * 6,
          alpha: 0.35 + Math.random() * 0.35
        });
      }
    }

    // --- SNOW PARTICLES ENGINE ---
    const snowflakes = [];
    function initSnow() {
      snowflakes.length = 0;
      const count = Math.max(25, Math.floor(width / 18));
      for (let i = 0; i < count; i++) {
        snowflakes.push({
          x: Math.random() * (width + 20) - 10,
          y: Math.random() * streetY,
          speed: 0.6 + Math.random() * 0.7,
          size: Math.random() > 0.7 ? 2 : 1,
          sway: Math.random() * Math.PI * 2
        });
      }
    }

    function syncHeaderAndBadge() {
      const now = new Date();
      const h = now.getHours();
      const m = String(now.getMinutes()).padStart(2, '0');
      const ampm = h >= 12 ? 'PM' : 'AM';
      const displayH = h % 12 === 0 ? 12 : h % 12;

      const dynamicTitle = getTitleForPhase(activePhase);
      document.title = dynamicTitle;

      let weatherIcon = '☀️';
      if (activeWeather === 'rain') {
        weatherIcon = '🌧️';
      } else if (activeWeather === 'thunder') {
        weatherIcon = '⛈️';
      } else if (activeWeather === 'snow') {
        weatherIcon = '❄️';
      } else if (activeWeather === 'cloudy') {
        weatherIcon = '☁️';
      } else if (activePhase === 'night') {
        weatherIcon = '🌙';
      } else if (activePhase === 'evening') {
        weatherIcon = '🌇';
      }

      let badgeText = dynamicTitle + ' • ' + displayH + ':' + m + ' ' + ampm;
      if (liveWeather && liveWeather.city) {
        badgeText += ' • 📍 ' + liveWeather.city + ' ' + (liveWeather.tempC ? liveWeather.tempC + '°C ' : '') + weatherIcon;
      } else {
        badgeText += ' ' + weatherIcon;
      }

      timeBadge.textContent = badgeText;

      // Notify VS Code host to update panel view container title
      if (vscode) {
        vscode.postMessage({
          command: 'updateTitle',
          title: dynamicTitle,
          phase: activePhase
        });
      }
    }

    // Check system clock & weather every minute
    setInterval(() => {
      if (!manualOverride) {
        const detectedPhase = calculateSystemTimePhase();
        const detectedWeather = calculateSystemWeather();
        if (detectedPhase !== activePhase) activePhase = detectedPhase;
        if (detectedWeather !== activeWeather) activeWeather = detectedWeather;
      }
      syncHeaderAndBadge();
    }, 60000);

    // Interactive Preview Cycle: cycles across all environments and weather states on click
    const previewStates = [
      { phase: 'morning', weather: 'clear' },
      { phase: 'afternoon', weather: 'clear' },
      { phase: 'afternoon', weather: 'cloudy' },
      { phase: 'evening', weather: 'clear' },
      { phase: 'evening', weather: 'rain' },
      { phase: 'night', weather: 'clear' },
      { phase: 'night', weather: 'rain' },
      { phase: 'night', weather: 'snow' },
      { phase: 'night', weather: 'thunder' }
    ];
    let previewIndex = 0;

    timeBadge.addEventListener('click', () => {
      manualOverride = true;
      previewIndex = (previewIndex + 1) % previewStates.length;
      activePhase = previewStates[previewIndex].phase;
      activeWeather = previewStates[previewIndex].weather;
      syncHeaderAndBadge();
    });

    // Listen for live weather updates from VS Code extension host
    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg && msg.command === 'weatherUpdate' && msg.data) {
        liveWeather = msg.data;
        if (!manualOverride && liveWeather.weatherType) {
          activeWeather = liveWeather.weatherType;
        }
        syncHeaderAndBadge();
      }
    });

    if (vscode) {
      vscode.postMessage({ command: 'requestWeather' });
    }

    syncHeaderAndBadge();

    // --- STARS FOR NIGHT & EVENING ---
    const stars = [];
    function initStars() {
      stars.length = 0;
      const count = Math.max(24, Math.floor(width / 22));
      for (let i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * width,
          y: Math.random() * Math.max(30, streetY * 0.72),
          size: Math.random() > 0.82 ? 2 : 1,
          speed: 0.02 + Math.random() * 0.035,
          phase: Math.random() * Math.PI * 2
        });
      }
    }

    // --- MORNING / AFTERNOON CLOUDS ---
    const clouds = [
      { x: 30, y: 16, w: 58, h: 14, speed: 0.18 },
      { x: 210, y: 28, w: 76, h: 16, speed: 0.14 },
      { x: 420, y: 10, w: 62, h: 13, speed: 0.22 },
      { x: 620, y: 22, w: 70, h: 15, speed: 0.16 }
    ];

    // --- AUTOMATED NYC VEHICLES ---
    const vehicles = [
      { x: 40, lane: 0, speed: 1.1, type: 'taxi', dir: 1 },
      { x: 220, lane: 0, speed: 1.4, type: 'dark', dir: 1 },
      { x: 480, lane: 1, speed: 0.9, type: 'red', dir: -1 },
      { x: 140, lane: 1, speed: 1.2, type: 'taxi', dir: -1 }
    ];

    function respawnVehicle(v) {
      const types = ['taxi', 'dark', 'red', 'taxi', 'van'];
      v.type = types[Math.floor(Math.random() * types.length)];
      v.dir = Math.random() > 0.5 ? 1 : -1;
      v.lane = v.dir === 1 ? 0 : 1;
      v.speed = 0.8 + Math.random() * 0.7;
      v.x = v.dir === 1 ? -40 - Math.random() * 60 : width + 40 + Math.random() * 60;
    }

    function resize() {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      streetY = Math.max(40, height - 36);
      initStars();
      initRain();
      initSnow();
    }
    window.addEventListener('resize', resize);
    resize();

    // --- SCENE DRAWING WITH COMPLETE ENVIRONMENT STYLES ---
    function drawScene(t) {
      // 1. SKY GRADIENTS
      const skyGrad = ctx.createLinearGradient(0, 0, 0, streetY);

      if (activePhase === 'morning') {
        // MORNING: Bright, clear blue pixel sky with warm sunrise peach
        skyGrad.addColorStop(0.0, '#3b82f6');
        skyGrad.addColorStop(0.38, '#60a5fa');
        skyGrad.addColorStop(0.72, '#93c5fd');
        skyGrad.addColorStop(1.0, '#fed7aa');
      } else if (activePhase === 'afternoon') {
        // AFTERNOON: Crisp, saturated daytime corporate-skyline look
        skyGrad.addColorStop(0.0, '#1d4ed8');
        skyGrad.addColorStop(0.35, '#3b82f6');
        skyGrad.addColorStop(0.72, '#60a5fa');
        skyGrad.addColorStop(1.0, '#bfdbfe');
      } else if (activePhase === 'evening') {
        // EVENING: Deep romantic sunset with glowing orange, hot pink, and magenta gradients
        skyGrad.addColorStop(0.0, '#2e0854');
        skyGrad.addColorStop(0.25, '#701a75');
        skyGrad.addColorStop(0.50, '#be185d');
        skyGrad.addColorStop(0.75, '#ea580c');
        skyGrad.addColorStop(1.0, '#f59e0b');
      } else {
        // NIGHT: Dark midnight navy-charcoal skies
        skyGrad.addColorStop(0.0, '#060810');
        skyGrad.addColorStop(0.35, '#0c1022');
        skyGrad.addColorStop(0.70, '#161936');
        skyGrad.addColorStop(1.0, '#261b38');
      }
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, width, streetY);

      // Horizon Haze Bloom
      if (activePhase === 'evening') {
        const haze = ctx.createLinearGradient(0, streetY - 48, 0, streetY);
        haze.addColorStop(0, 'rgba(245, 158, 11, 0)');
        haze.addColorStop(1, 'rgba(245, 158, 11, 0.38)');
        ctx.fillStyle = haze;
        ctx.fillRect(0, streetY - 48, width, 48);
      } else if (activePhase === 'morning') {
        const haze = ctx.createLinearGradient(0, streetY - 36, 0, streetY);
        haze.addColorStop(0, 'rgba(254, 215, 170, 0)');
        haze.addColorStop(1, 'rgba(254, 215, 170, 0.28)');
        ctx.fillStyle = haze;
        ctx.fillRect(0, streetY - 36, width, 36);
      } else if (activePhase === 'night') {
        const haze = ctx.createLinearGradient(0, streetY - 40, 0, streetY);
        haze.addColorStop(0, 'rgba(217, 119, 6, 0)');
        haze.addColorStop(1, 'rgba(217, 119, 6, 0.16)');
        ctx.fillStyle = haze;
        ctx.fillRect(0, streetY - 40, width, 40);
      }

      // 2. CELESTIAL BODIES (SUN / MOON) & STARS (when clear or raining softly)
      if (activePhase === 'night') {
        // Twinkling Night Stars
        if (activeWeather !== 'rain') {
          for (const s of stars) {
            const a = 0.35 + Math.sin(t * s.speed + s.phase) * 0.3;
            ctx.fillStyle = 'rgba(255, 255, 255, ' + a + ')';
            ctx.fillRect(Math.floor(s.x), Math.floor(s.y), s.size, s.size);
          }
        }

        // BEAUTIFUL FULL WHITE MOON
        const moonR = Math.max(20, Math.min(38, Math.floor(streetY * 0.28)));
        const moonX = Math.floor(width * 0.74);
        const moonY = Math.max(moonR + 8, Math.floor(streetY * 0.36));

        // Soft Lunar Aura
        const moonGlow = ctx.createRadialGradient(moonX, moonY, moonR * 0.4, moonX, moonY, moonR * 2.6);
        moonGlow.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
        moonGlow.addColorStop(0.45, 'rgba(230, 240, 255, 0.18)');
        moonGlow.addColorStop(1, 'rgba(230, 240, 255, 0)');
        ctx.fillStyle = moonGlow;
        ctx.beginPath();
        ctx.arc(moonX, moonY, moonR * 2.6, 0, Math.PI * 2);
        ctx.fill();

        // Moon Disc (Crisp Full White)
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
        ctx.fill();

        // Lunar Maria Craters
        ctx.fillStyle = 'rgba(200, 215, 230, 0.32)';
        ctx.beginPath(); ctx.arc(moonX - moonR * 0.3, moonY - moonR * 0.2, moonR * 0.22, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(moonX + moonR * 0.25, moonY + moonR * 0.2, moonR * 0.30, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(moonX - moonR * 0.1, moonY + moonR * 0.38, moonR * 0.16, 0, Math.PI * 2); ctx.fill();

      } else if (activePhase === 'evening') {
        // Evening Sunset Sun (Glowing Hot Orange & Pink)
        const sunR = Math.max(16, Math.min(30, Math.floor(streetY * 0.24)));
        const sunX = Math.floor(width * 0.72);
        const sunY = Math.floor(streetY * 0.58);

        const sunsetGlow = ctx.createRadialGradient(sunX, sunY, sunR * 0.3, sunX, sunY, sunR * 3.4);
        sunsetGlow.addColorStop(0, 'rgba(255, 179, 0, 0.65)');
        sunsetGlow.addColorStop(0.35, 'rgba(233, 30, 99, 0.35)');
        sunsetGlow.addColorStop(1, 'rgba(112, 26, 117, 0)');
        ctx.fillStyle = sunsetGlow;
        ctx.beginPath();
        ctx.arc(sunX, sunY, sunR * 3.4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffecb3';
        ctx.beginPath();
        ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
        ctx.fill();

      } else if (activePhase === 'morning') {
        // RADIANT YELLOW SUN
        const sunR = Math.max(18, Math.min(32, Math.floor(streetY * 0.26)));
        const sunX = Math.floor(width * 0.22);
        const sunY = Math.floor(streetY * 0.44);

        const morningGlow = ctx.createRadialGradient(sunX, sunY, sunR * 0.3, sunX, sunY, sunR * 3.2);
        morningGlow.addColorStop(0, 'rgba(250, 204, 21, 0.60)');
        morningGlow.addColorStop(0.45, 'rgba(253, 224, 71, 0.24)');
        morningGlow.addColorStop(1, 'rgba(250, 204, 21, 0)');
        ctx.fillStyle = morningGlow;
        ctx.beginPath();
        ctx.arc(sunX, sunY, sunR * 3.2, 0, Math.PI * 2);
        ctx.fill();

        // Radiant Sun Disc
        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
        ctx.fill();

        // Light pixel-art clouds drifting past
        ctx.fillStyle = 'rgba(255, 255, 255, 0.42)';
        for (const c of clouds) {
          c.x += c.speed;
          if (c.x > width + 80) c.x = -80;
          ctx.fillRect(Math.floor(c.x), c.y, c.w, c.h);
          ctx.fillRect(Math.floor(c.x + 8), c.y - 4, c.w - 16, 4);
        }

      } else if (activePhase === 'afternoon') {
        // HIGH SATURATED CORPORATE SUN
        const sunR = Math.max(16, Math.min(28, Math.floor(streetY * 0.22)));
        const sunX = Math.floor(width * 0.50);
        const sunY = Math.floor(streetY * 0.24);

        const noonGlow = ctx.createRadialGradient(sunX, sunY, sunR * 0.3, sunX, sunY, sunR * 2.8);
        noonGlow.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
        noonGlow.addColorStop(0.5, 'rgba(191, 219, 254, 0.28)');
        noonGlow.addColorStop(1, 'rgba(191, 219, 254, 0)');
        ctx.fillStyle = noonGlow;
        ctx.beginPath();
        ctx.arc(sunX, sunY, sunR * 2.8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
        ctx.fill();

        // Crisp daytime clouds
        ctx.fillStyle = 'rgba(255, 255, 255, 0.48)';
        for (const c of clouds) {
          c.x += c.speed;
          if (c.x > width + 80) c.x = -80;
          ctx.fillRect(Math.floor(c.x), c.y, c.w, c.h);
          ctx.fillRect(Math.floor(c.x + 8), c.y - 4, c.w - 16, 4);
        }
      }

      // 3. DISTANT SKYLINE SILHOUETTES
      if (activePhase === 'morning') {
        ctx.fillStyle = '#475569';
      } else if (activePhase === 'afternoon') {
        ctx.fillStyle = '#1e3a5f';
      } else if (activePhase === 'evening') {
        ctx.fillStyle = '#1a0826';
      } else {
        ctx.fillStyle = '#0f1422';
      }

      const bldgsBack = [
        { r: 0.03, w: 28, h: 0.45 },
        { r: 0.13, w: 22, h: 0.65 },
        { r: 0.22, w: 32, h: 0.38 },
        { r: 0.34, w: 26, h: 0.75 },
        { r: 0.44, w: 30, h: 0.52 },
        { r: 0.56, w: 24, h: 0.85 },
        { r: 0.66, w: 30, h: 0.42 },
        { r: 0.81, w: 36, h: 0.70 },
        { r: 0.94, w: 24, h: 0.55 }
      ];
      for (const b of bldgsBack) {
        const bx = Math.floor(width * b.r);
        const bh = Math.floor(streetY * b.h);
        ctx.fillRect(bx, streetY - bh, b.w, bh);
      }

      // 4. MIDGROUND SKYLINE SILHOUETTES & GLOWING WINDOW BOXES
      let frontBldgColor = '#0b0e17';
      let windowColor = '#fbbf24';
      let hasBeacon = true;

      if (activePhase === 'morning') {
        frontBldgColor = '#334155';
        windowColor = 'rgba(254, 240, 138, 0.48)';
      } else if (activePhase === 'afternoon') {
        frontBldgColor = '#0f172a'; // Deep Corporate Navy
        windowColor = 'rgba(186, 230, 253, 0.45)'; // Saturated glass bands
        hasBeacon = false;
      } else if (activePhase === 'evening') {
        frontBldgColor = '#130324'; // Romantic Twilight Plum
        windowColor = '#f59e0b'; // Warm Sunset Gold
      } else {
        frontBldgColor = '#090d18'; // Midnight Navy Charcoal
        windowColor = '#fbbf24'; // Glowing Amber Window Boxes
      }

      ctx.fillStyle = frontBldgColor;
      const bldgsFront = [
        { x: 0.00, w: 0.12, h: 0.60 },
        { x: 0.11, w: 0.10, h: 0.88 },
        { x: 0.23, w: 0.11, h: 0.52 },
        { x: 0.33, w: 0.12, h: 0.96 },
        { x: 0.45, w: 0.11, h: 0.65 },
        { x: 0.55, w: 0.13, h: 1.05 },
        { x: 0.67, w: 0.11, h: 0.55 },
        { x: 0.78, w: 0.12, h: 0.92 },
        { x: 0.89, w: 0.12, h: 0.68 }
      ];
      for (const b of bldgsFront) {
        const bx = Math.floor(width * b.x);
        const bw = Math.ceil(width * b.w) + 2;
        const bh = Math.min(Math.floor(streetY * 0.96), Math.floor(streetY * b.h));
        ctx.fillRect(bx, streetY - bh, bw, bh);

        // Rooftop Spires with Aircraft Beacons
        if (b.h > 0.85) {
          const spireX = bx + Math.floor(bw / 2) - 1;
          ctx.fillRect(spireX, streetY - bh - 14, 2, 14);
          if (hasBeacon || activePhase === 'evening' || activePhase === 'night') {
            ctx.fillStyle = '#ef4444';
            ctx.fillRect(spireX, streetY - bh - 15, 2, 2);
            ctx.fillStyle = frontBldgColor;
          }
        }

        // Window Matrix (Lit Window Boxes)
        ctx.fillStyle = windowColor;
        for (let wy = streetY - bh + 10; wy < streetY - 6; wy += 9) {
          for (let wx = bx + 4; wx < bx + bw - 4; wx += 6) {
            if ((wx * 7 + wy * 13) % 5 !== 0) {
              ctx.fillRect(wx, wy, 2, 3);
            }
          }
        }
        ctx.fillStyle = frontBldgColor;
      }

      // 5. SIDEWALK, CURB & ASPHALT ROAD
      if (activePhase === 'morning') {
        ctx.fillStyle = '#475569'; ctx.fillRect(0, streetY - 5, width, 4);
        ctx.fillStyle = '#334155'; ctx.fillRect(0, streetY - 1, width, 2);
        ctx.fillStyle = '#1e293b'; ctx.fillRect(0, streetY, width, height - streetY);
      } else if (activePhase === 'afternoon') {
        ctx.fillStyle = '#334155'; ctx.fillRect(0, streetY - 5, width, 4);
        ctx.fillStyle = '#1e293b'; ctx.fillRect(0, streetY - 1, width, 2);
        ctx.fillStyle = '#0f172a'; ctx.fillRect(0, streetY, width, height - streetY);
      } else if (activePhase === 'evening') {
        ctx.fillStyle = '#261233'; ctx.fillRect(0, streetY - 5, width, 4);
        ctx.fillStyle = '#1b0a26'; ctx.fillRect(0, streetY - 1, width, 2);
        ctx.fillStyle = '#12051c'; ctx.fillRect(0, streetY, width, height - streetY);
      } else {
        ctx.fillStyle = '#1e2536'; ctx.fillRect(0, streetY - 5, width, 4);
        ctx.fillStyle = '#141a27'; ctx.fillRect(0, streetY - 1, width, 2);
        ctx.fillStyle = '#0a0d14'; ctx.fillRect(0, streetY, width, height - streetY);
      }

      // Wet Glossy Sheen when Raining
      if (activeWeather === 'rain') {
        ctx.fillStyle = 'rgba(147, 197, 253, 0.12)';
        ctx.fillRect(0, streetY, width, height - streetY);
      }

      // Broken Lane Divider
      ctx.fillStyle = activePhase === 'afternoon' ? 'rgba(255, 255, 255, 0.40)' : 'rgba(255, 255, 255, 0.20)';
      const laneMidY = streetY + 16;
      for (let rx = 0; rx < width; rx += 22) {
        ctx.fillRect(rx, laneMidY, 11, 1.5);
      }

      // 6. STREETLIGHTS & AMBIENT GLOW CONES
      const lampSpacing = 110;
      const numLamps = Math.ceil(width / lampSpacing) + 1;
      const lightsOn = activePhase === 'night' || activePhase === 'evening' || activeWeather === 'rain';

      for (let i = 0; i < numLamps; i++) {
        const lx = i * lampSpacing + 35;
        const ly = streetY - 5;

        // Glowing Light Cones (Evening, Night, or Rain)
        if (lightsOn) {
          const coneGrad = ctx.createLinearGradient(0, ly - 14, 0, ly + 36);
          if (activePhase === 'evening') {
            coneGrad.addColorStop(0, 'rgba(251, 191, 36, 0.38)');
            coneGrad.addColorStop(0.35, 'rgba(245, 158, 11, 0.18)');
            coneGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
          } else {
            coneGrad.addColorStop(0, 'rgba(254, 240, 138, 0.45)');
            coneGrad.addColorStop(0.35, 'rgba(250, 204, 21, 0.22)');
            coneGrad.addColorStop(1, 'rgba(250, 204, 21, 0)');
          }
          ctx.fillStyle = coneGrad;
          ctx.beginPath();
          ctx.moveTo(lx, ly - 14);
          ctx.lineTo(lx - 22, ly + 36);
          ctx.lineTo(lx + 22, ly + 36);
          ctx.closePath();
          ctx.fill();
        }

        // Lamppost
        ctx.fillStyle = activePhase === 'afternoon' ? '#475569' : '#334155';
        ctx.fillRect(lx - 1, ly - 14, 2, 14);
        // Bracket
        ctx.fillStyle = '#475569';
        ctx.fillRect(lx - 3, ly - 16, 6, 2);
        // Bulb
        ctx.fillStyle = lightsOn ? '#fef9c3' : (activePhase === 'morning' ? '#e2e8f0' : '#cbd5e1');
        ctx.fillRect(lx - 2, ly - 15, 4, 2.5);
      }
    }

    // --- 7. DYNAMIC WEATHER EFFECTS CANVAS LAYER (COZY RAIN, THUNDER, SNOW, CLOUDS) ---
    function drawWeatherEffects() {
      if (activeWeather === 'rain' || activeWeather === 'thunder') {
        ctx.save();
        // Gentle Rain Mist across the skyline
        ctx.fillStyle = 'rgba(15, 23, 42, 0.18)';
        ctx.fillRect(0, 0, width, streetY);

        // Thunder subtle lighting flash
        if (activeWeather === 'thunder' && Math.random() < 0.009) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
          ctx.fillRect(0, 0, width, streetY);
        }

        // Translucent vertical pixel lines falling downward
        ctx.lineWidth = 1;
        for (const d of raindrops) {
          ctx.strokeStyle = 'rgba(186, 230, 253, ' + d.alpha + ')';
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x - 1, d.y + d.len);
          ctx.stroke();

          d.y += d.speed;
          d.x -= 0.35;

          // Street Splash Ripple
          if (d.y > streetY) {
            ctx.fillStyle = 'rgba(186, 230, 253, ' + (d.alpha * 0.5) + ')';
            ctx.fillRect(d.x, streetY - 1, 2, 1);
            d.y = -d.len - Math.random() * 20;
            d.x = Math.random() * (width + 40) - 10;
          }
        }
        ctx.restore();
      } else if (activeWeather === 'snow') {
        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        for (const s of snowflakes) {
          s.sway += 0.02;
          s.x += Math.sin(s.sway) * 0.35;
          s.y += s.speed;
          ctx.fillRect(Math.floor(s.x), Math.floor(s.y), s.size, s.size);
          if (s.y > streetY) {
            s.y = -5;
            s.x = Math.random() * (width + 20) - 10;
          }
        }
        ctx.restore();
      } else if (activeWeather === 'cloudy') {
        ctx.save();
        ctx.fillStyle = 'rgba(148, 163, 184, 0.08)';
        ctx.fillRect(0, 0, width, streetY);
        ctx.restore();
      }
    }

    // --- DRAW PIXEL VEHICLES ---
    function drawVehicle(v) {
      ctx.save();
      const vy = v.lane === 0 ? streetY + 5 : streetY + 19;
      const vw = 18;
      ctx.translate(Math.round(v.x), vy);

      // Boundary Alpha Fade
      const fadeDist = 45;
      let alpha = 1.0;
      if (v.x < fadeDist) alpha = Math.max(0, v.x / fadeDist);
      else if (v.x > width - fadeDist) alpha = Math.max(0, (width - v.x) / fadeDist);
      ctx.globalAlpha = alpha;

      const lightsOn = activePhase === 'night' || activePhase === 'evening' || activeWeather === 'rain' || activeWeather === 'thunder';

      // Headlight Beam Cone (Active during evening, night, or rain)
      if (lightsOn) {
        const headX = v.dir === 1 ? vw : -12;
        const beamGrad = ctx.createLinearGradient(v.dir === 1 ? vw : 0, 0, headX + (v.dir === 1 ? 14 : -14), 0);
        beamGrad.addColorStop(0, 'rgba(255, 250, 200, 0.45)');
        beamGrad.addColorStop(1, 'rgba(255, 240, 150, 0)');
        ctx.fillStyle = beamGrad;
        ctx.beginPath();
        if (v.dir === 1) {
          ctx.moveTo(vw, 3);
          ctx.lineTo(vw + 14, 0);
          ctx.lineTo(vw + 14, 8);
        } else {
          ctx.moveTo(0, 3);
          ctx.lineTo(-14, 0);
          ctx.lineTo(-14, 8);
        }
        ctx.closePath();
        ctx.fill();
      }

      if (v.type === 'taxi') {
        // --- NYC YELLOW TAXI ---
        ctx.fillStyle = '#facc15';
        ctx.fillRect(0, 3, vw, 5);
        ctx.fillRect(4, 0, 10, 4);

        // Checker Stripe
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(2, 5, 14, 1);

        // Windows
        ctx.fillStyle = activePhase === 'afternoon' ? '#0284c7' : '#1e293b';
        ctx.fillRect(5, 1, 4, 2);
        ctx.fillRect(10, 1, 3, 2);

        // Roof Taxi Sign
        ctx.fillStyle = '#ea580c';
        ctx.fillRect(7, -2, 4, 2);

      } else if (v.type === 'dark') {
        // --- SLEEK MIDNIGHT SEDAN ---
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 3, vw + 2, 5);
        ctx.fillRect(3, 1, 12, 3);
        ctx.fillStyle = '#64748b';
        ctx.fillRect(5, 1, 4, 2);
        ctx.fillRect(10, 1, 4, 2);

      } else if (v.type === 'red') {
        // --- COZY RED COUPE ---
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(0, 3, vw, 5);
        ctx.fillRect(4, 1, 9, 3);
        ctx.fillStyle = '#f1f5f9';
        ctx.fillRect(6, 1, 5, 2);

      } else {
        // --- SLATE COMMUTER VAN ---
        ctx.fillStyle = '#334155';
        ctx.fillRect(0, 1, vw + 4, 7);
        ctx.fillRect(4, -1, 12, 3);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(12, 0, 4, 2);
      }

      // Wheels
      ctx.fillStyle = '#020617';
      ctx.fillRect(3, 7, 3, 2);
      ctx.fillRect(vw - 5, 7, 3, 2);

      // Headlight Lamp
      ctx.fillStyle = lightsOn ? '#fef08a' : '#f1f5f9';
      const hlX = v.dir === 1 ? vw - 1 : 0;
      ctx.fillRect(hlX, 4, 1, 2);

      // Red Taillight
      ctx.fillStyle = '#ef4444';
      const tlX = v.dir === 1 ? 0 : vw - 1;
      ctx.fillRect(tlX, 4, 1, 2);

      ctx.restore();
    }

    // --- 8. MINIMAL CORNER SPIDER & WEB COMPANION ---
    function drawCornerSpiderCompanion(t) {
      ctx.save();

      // Delicate Pixel Spider Web in Top-Left Corner
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.32)';
      ctx.lineWidth = 1;

      // Radial Strands from (0, 0)
      const radials = [
        [44, 0],
        [38, 16],
        [28, 28],
        [16, 38],
        [0, 44]
      ];

      for (const r of radials) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(r[0], r[1]);
        ctx.stroke();
      }

      // Concentric Web Arcs
      const rings = [0.35, 0.65, 0.95];
      for (const f of rings) {
        ctx.beginPath();
        ctx.moveTo(radials[0][0] * f, radials[0][1] * f);
        for (let i = 1; i < radials.length; i++) {
          ctx.lineTo(radials[i][0] * f, radials[i][1] * f);
        }
        ctx.stroke();
      }

      // Miniature Cute Hanging Pixel Spider Companion
      const bob = Math.sin(t * 0.038) * 4.5;
      const sway = Math.sin(t * 0.022) * 1.5;
      const hangY = Math.max(14, Math.min(streetY - 14, Math.floor(25 + bob)));
      const hangX = Math.floor(24 + sway);

      // Single Web Thread Dropping from Corner
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.beginPath();
      ctx.moveTo(24, 0);
      ctx.lineTo(hangX, hangY);
      ctx.stroke();

      // Pixel Spider Body
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(hangX - 3, hangY - 2, 6, 5);

      // Crimson Spider Back Emblem
      ctx.fillStyle = '#e05a5a';
      ctx.fillRect(hangX - 1, hangY - 1, 2, 3);

      // Head
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(hangX - 2, hangY + 3, 4, 3);

      // Cute White Spider Eyes
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(hangX - 2, hangY + 4, 1.5, 1.5);
      ctx.fillRect(hangX + 0.5, hangY + 4, 1.5, 1.5);

      // 8 Cute Pixel Legs with gentle breathing twitch
      const legTwitch = Math.round(Math.sin(t * 0.08));
      ctx.fillStyle = '#1e293b';

      // Left Legs
      ctx.fillRect(hangX - 5, hangY - 2 + legTwitch, 2, 1);
      ctx.fillRect(hangX - 6, hangY - 0, 3, 1);
      ctx.fillRect(hangX - 6, hangY + 2, 3, 1);
      ctx.fillRect(hangX - 5, hangY + 4 - legTwitch, 2, 1);

      // Right Legs
      ctx.fillRect(hangX + 3, hangY - 2 - legTwitch, 2, 1);
      ctx.fillRect(hangX + 3, hangY - 0, 3, 1);
      ctx.fillRect(hangX + 3, hangY + 2, 3, 1);
      ctx.fillRect(hangX + 3, hangY + 4 + legTwitch, 2, 1);

      ctx.restore();
    }

    // --- MAIN ANIMATION CLOCK LOOP ---
    let t = 0;
    function loop() {
      t++;
      ctx.clearRect(0, 0, width, height);

      // 1. Draw Cityscape & Sky based on time of day
      drawScene(t);

      // 2. Animate and Draw Pixel Vehicles
      for (const v of vehicles) {
        v.x += v.speed * v.dir;

        if (v.dir === 1 && v.x > width + 40) {
          respawnVehicle(v);
        } else if (v.dir === -1 && v.x < -40) {
          respawnVehicle(v);
        }

        drawVehicle(v);
      }

      // 3. Draw Weather Effects Canvas Layer (Translucent rain, thunder, snow, or overcast)
      drawWeatherEffects();

      // 4. Draw Corner Spider & Web Companion
      drawCornerSpiderCompanion(t);

      requestAnimationFrame(loop);
    }
    loop();
  </script>
</body>
</html>`;
  }
}

module.exports = { SpiderCompanionViewProvider, getHeaderTitleForHour, getHeaderTitleForPhase };
