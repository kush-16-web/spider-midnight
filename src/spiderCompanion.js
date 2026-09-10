const vscode = require('vscode');
const https = require('https');

function fetchJson(url, headers = {}, timeout = 5000) {
  return new Promise((resolve) => {
    const req = https.get(url, { headers, timeout }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return resolve(null);
      }
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw));
        } catch (e) {
          resolve(null);
        }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}

function parseWmoWeatherCode(code) {
  const wmoCode = typeof code === 'number' ? code : 0;
  if (wmoCode === 0) return { weatherType: 'clear', desc: 'Clear Sky', wmoCode: 0 };
  if (wmoCode === 1) return { weatherType: 'partlycloudy', desc: 'Mainly Clear', wmoCode: 1 };
  if (wmoCode === 2) return { weatherType: 'partlycloudy', desc: 'Partly Cloudy', wmoCode: 2 };
  if (wmoCode === 3) return { weatherType: 'cloudy', desc: 'Overcast', wmoCode: 3 };
  if (wmoCode === 45 || wmoCode === 48) return { weatherType: 'cloudy', desc: 'Fog', wmoCode: 45 };
  if ((wmoCode >= 51 && wmoCode <= 67) || (wmoCode >= 80 && wmoCode <= 82)) return { weatherType: 'rain', desc: 'Rain', wmoCode: 61 };
  if ((wmoCode >= 71 && wmoCode <= 77) || wmoCode === 85 || wmoCode === 86) return { weatherType: 'snow', desc: 'Snow', wmoCode: 71 };
  if (wmoCode >= 95) return { weatherType: 'thunder', desc: 'Thunderstorm', wmoCode: 95 };
  return { weatherType: 'clear', desc: 'Clear Sky', wmoCode: 0 };
}

// Astronomical lunar shape calculation (Synodic Moon Cycle: 29.53058867 days)
function calculateMoonAstronomy(date = new Date()) {
  const knownNewMoon = new Date(Date.UTC(2000, 0, 6, 18, 14, 0));
  const diffDays = (date.getTime() - knownNewMoon.getTime()) / (1000 * 60 * 60 * 24);
  const synodicMonth = 29.53058867;
  const cycleFraction = ((diffDays % synodicMonth) + synodicMonth) % synodicMonth / synodicMonth;

  let isCrescent = false;
  let crescentType = 'waning';
  let phaseName = 'Full Moon';

  if (cycleFraction >= 0.76 && cycleFraction <= 0.98) {
    isCrescent = true;
    crescentType = 'waning';
    phaseName = 'Waning Crescent';
  } else if (cycleFraction >= 0.02 && cycleFraction <= 0.24) {
    isCrescent = true;
    crescentType = 'waxing';
    phaseName = 'Waxing Crescent';
  } else if (cycleFraction < 0.02 || cycleFraction > 0.98) {
    phaseName = 'New Moon';
  } else if (cycleFraction >= 0.44 && cycleFraction <= 0.56) {
    phaseName = 'Full Moon';
  } else if (cycleFraction > 0.24 && cycleFraction < 0.44) {
    phaseName = 'First Quarter';
  } else {
    phaseName = 'Waning Gibbous';
  }

  const illumination = Math.max(1, Math.round((1 - Math.cos(cycleFraction * 2 * Math.PI)) / 2 * 100));

  return {
    isCrescent,
    crescentType,
    phaseName,
    cycleFraction,
    illumination
  };
}

async function fetchLiveWeather() {
  const moonAstro = calculateMoonAstronomy();

  try {
    const geo = await fetchJson('https://ipapi.co/json/', { 'User-Agent': 'curl/8.0' }, 4000);
    if (geo && typeof geo.latitude === 'number' && typeof geo.longitude === 'number') {
      const lat = geo.latitude.toFixed(2);
      const lon = geo.longitude.toFixed(2);
      const city = geo.city || geo.region || 'Local';

      const meteo = await fetchJson(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m&temperature_unit=celsius`,
        { 'User-Agent': 'AntigravitySpiderCompanion/1.0' },
        4500
      );

      if (meteo && meteo.current && typeof meteo.current.temperature_2m === 'number') {
        const cur = meteo.current;
        const tempC = Math.round(cur.temperature_2m);
        const tempF = Math.round(cur.temperature_2m * 9 / 5 + 32);
        const { weatherType, desc, wmoCode } = parseWmoWeatherCode(cur.weather_code);
        const windSpeed = typeof cur.wind_speed_10m === 'number' ? Math.round(cur.wind_speed_10m) : 12;

        return {
          city,
          tempC: String(tempC),
          tempF: String(tempF),
          desc,
          weatherType,
          wmoCode,
          windSpeed,
          moonAstro
        };
      }
    }
  } catch (e) {}

  try {
    const json = await fetchJson('https://wttr.in/?format=j1', { 'User-Agent': 'curl/8.0' }, 5000);
    if (json && json.current_condition && json.current_condition[0]) {
      const current = json.current_condition[0];
      const area = json.nearest_area && json.nearest_area[0];
      const city = (area && area.areaName && area.areaName[0] && area.areaName[0].value) || 'Local';
      const tempC = current.temp_C || '';
      const tempF = current.temp_F || '';
      const desc = (current.weatherDesc && current.weatherDesc[0] && current.weatherDesc[0].value) || 'Clear';
      const descLower = desc.toLowerCase();
      const windSpeed = current.windspeedKmph ? parseInt(current.windspeedKmph, 10) : 12;

      let weatherType = 'clear';
      let wmoCode = 0;
      if (descLower.includes('thunder') || descLower.includes('storm')) {
        weatherType = 'thunder';
        wmoCode = 95;
      } else if (descLower.includes('rain') || descLower.includes('drizzle') || descLower.includes('shower')) {
        weatherType = 'rain';
        wmoCode = 61;
      } else if (descLower.includes('snow') || descLower.includes('blizzard') || descLower.includes('ice') || descLower.includes('sleet')) {
        weatherType = 'snow';
        wmoCode = 71;
      } else if (descLower.includes('overcast')) {
        weatherType = 'cloudy';
        wmoCode = 3;
      } else if (descLower.includes('partly') || descLower.includes('cloud')) {
        weatherType = 'partlycloudy';
        wmoCode = 2;
      } else {
        weatherType = 'clear';
        wmoCode = 0;
      }

      return {
        city,
        tempC,
        tempF,
        desc,
        weatherType,
        wmoCode,
        windSpeed,
        moonAstro
      };
    }
  } catch (e) {
    return {
      city: 'Surat',
      tempC: '32',
      tempF: '90',
      desc: 'Sunny',
      weatherType: 'clear',
      wmoCode: 0,
      windSpeed: 12,
      moonAstro
    };
  }

  return {
    city: 'Surat',
    tempC: '32',
    tempF: '90',
    desc: 'Sunny',
    weatherType: 'clear',
    wmoCode: 0,
    windSpeed: 12,
    moonAstro
  };
}

class SpiderCompanionViewProvider {
  static viewType = 'antigravity.spiderCompanionView';

  constructor(extensionUri) {
    this._extensionUri = extensionUri;
    this._view = null;
    this._weatherTimer = null;
    this._cachedWeather = null;
    this._lastWeatherFetch = 0;
  }

  resolveWebviewView(webviewView, context, token) {
    this._view = webviewView;
    webviewView.title = 'Spider-Man Companion';

    this._initWeather();

    webviewView.onDidDispose(() => {
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

    webviewView.webview.onDidReceiveMessage(message => {
      if (message.command === 'requestWeather') {
        this._sendWeather();
      }
    });

    webviewView.webview.html = this.getWebviewContent(webviewView.webview);
  }

  getWebviewContent(webview) {
    return this._getHtmlForWebview(webview);
  }

  async _initWeather() {
    const now = Date.now();
    if (this._cachedWeather && (now - this._lastWeatherFetch < 600000)) {
      this._sendWeather();
    } else {
      await this._refreshWeather();
    }

    if (this._weatherTimer) {
      clearInterval(this._weatherTimer);
    }
    this._weatherTimer = setInterval(() => {
      this._refreshWeather();
    }, 600000);
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

  _getHtmlForWebview(webview) {
    const fontUri = webview ? webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'assets', 'fonts', 'ComicMono.ttf')) : '';
    const fontBoldUri = webview ? webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'assets', 'fonts', 'ComicMono-Bold.ttf')) : '';
    const moonCrescentUri = webview ? webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'assets', 'weather', 'moon-crescent.png')) : '';
    const taxiUri = webview ? webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'assets', 'traffic', 'taxi.png')) : '';
    const sedanUri = webview ? webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'assets', 'traffic', 'sedan.png')) : '';
    const truckUri = webview ? webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'assets', 'traffic', 'truck.png')) : '';
    const gantryUri = webview ? webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'assets', 'traffic', 'gantry.png')) : '';
    const stationUri = webview ? webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'assets', 'traffic', 'gas_station.png')) : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Spider Midnight Companion</title>
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
      width: 100vw;
      height: 100vh;
      background-color: #16191f;
      overflow: hidden;
      user-select: none;
      font-family: 'Comic Mono', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }

    #appRoot {
      position: relative;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      background: #1b152b;
    }

    /* FULL-BLEED AMBIENT HORIZON CANVAS (100% VIEWPORT) */
    #ambientCanvas {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: block;
      z-index: 1;
    }

    /* TOP-RIGHT CORNER: FLOATING FROSTED-GLASS WEATHER WIDGET */
    #hudWeather {
      position: absolute;
      top: 10px;
      right: 10px;
      z-index: 20;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 9px;
      border-radius: 9999px;
      background: rgba(14, 18, 28, 0.65);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.14);
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45);
      font-size: 9.5px;
      font-weight: 700;
      color: #f8fafc;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.2s ease;
    }
    #hudWeather:hover {
      background: rgba(224, 90, 90, 0.32);
      border-color: rgba(239, 68, 68, 0.65);
      transform: scale(1.03);
    }
    .weather-live-dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: #22c55e;
      box-shadow: 0 0 5px #22c55e;
      animation: livePulse 2s infinite;
      flex-shrink: 0;
    }
    @keyframes livePulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.45; transform: scale(0.8); }
    }
    #locCity {
      color: #ffffff;
      font-weight: 700;
      text-transform: uppercase;
      font-size: 9px;
    }
    #locTemp {
      color: #93c5fd;
      font-weight: 700;
      font-size: 9.5px;
    }

    /* BOTTOM-LEFT REGION: RIGID POSITIONED MUSIC PLAYBACK CARD */
    #mediaHud {
      position: absolute;
      bottom: 10px;
      left: 10px;
      width: 140px;
      z-index: 20;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 3px;
    }

    /* RECONSTRAINED TRACK TITLE BOX:
       Precisely aligns with compact Prev/Play/Next buttons row beneath it */
    .spidey-music-title.song-ticker-box {
      width: 78px;
      max-width: 78px;
      min-width: 78px;
      height: 13px;
      overflow: hidden;
      background: rgba(10, 13, 20, 0.75);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 3px;
      display: flex;
      align-items: center;
      padding: 0 4px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
    }
    .song-ticker-text {
      white-space: nowrap;
      display: inline-block;
      font-size: 8px;
      color: #93c5fd;
      font-weight: 600;
      animation: tickerAnim 16s linear infinite;
    }
    @keyframes tickerAnim {
      0% { transform: translateX(100%); }
      100% { transform: translateX(-100%); }
    }

    /* Baseline Media Action Controls Deck */
    .transport-deck {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .media-buttons-block {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      width: 78px;
      flex-shrink: 0;
    }
    .retro-btn {
      background: rgba(22, 27, 38, 0.88);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      color: #f8fafc;
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 3px;
      padding: 0;
      width: 22px;
      height: 17px;
      font-size: 9px;
      font-family: inherit;
      cursor: pointer;
      transition: all 0.15s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      outline: none;
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.4);
    }
    .retro-btn:hover {
      background: #2a3142;
      border-color: #e05a5a;
      color: #ffffff;
      transform: translateY(-1px);
    }
    /* Distinct Red Play/Pause Button */
    .play-btn {
      background: #e05a5a;
      color: #ffffff;
      border-color: #ef4444;
      font-weight: bold;
      width: 26px;
      height: 17px;
      font-size: 8.5px;
    }
    .play-btn:hover {
      background: #ef4444;
    }
    .play-btn.is-playing {
      background: #ef4444;
      box-shadow: 0 0 8px rgba(239, 68, 68, 0.8);
    }

    /* HOVER-ACTIVE VOLUME SLIDER:
       Expands on hover, collapses on mouse-leave to keep corner uncluttered */
    .vol-control {
      display: inline-flex;
      align-items: center;
      background: rgba(10, 13, 20, 0.70);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 3px;
      height: 17px;
      padding: 0 4px;
      cursor: pointer;
      overflow: hidden;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .vol-icon {
      font-size: 8.5px;
      color: #94a3b8;
      cursor: pointer;
      user-select: none;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: color 0.15s ease;
    }
    .vol-control:hover .vol-icon {
      color: #f8fafc;
    }
    #volSlider {
      width: 0;
      opacity: 0;
      margin-left: 0;
      height: 2.5px;
      appearance: none;
      -webkit-appearance: none;
      background: rgba(255, 255, 255, 0.25);
      border-radius: 2px;
      outline: none;
      cursor: pointer;
      pointer-events: none;
      transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease, margin-left 0.25s ease;
    }
    .vol-control:hover #volSlider,
    .vol-control:focus-within #volSlider {
      width: 36px;
      opacity: 1;
      margin-left: 4px;
      pointer-events: auto;
    }
    #volSlider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #e05a5a;
      box-shadow: 0 0 3px #e05a5a;
      cursor: pointer;
    }

    /* BOTTOM-RIGHT CORNER: REAL-TIME SYSTEM CLOCK READOUT */
    #hudClock {
      position: absolute;
      bottom: 10px;
      right: 10px;
      z-index: 20;
      display: inline-flex;
      align-items: center;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(10, 13, 20, 0.70);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #cbd5e1;
      font-size: 9px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
    }
  </style>
</head>
<body>
  <div id="appRoot">
    <!-- FULL-BLEED AMBIENT HORIZON CANVAS (100% VIEWPORT) -->
    <canvas id="ambientCanvas"></canvas>

    <!-- TOP-RIGHT CORNER: FLOATING FROSTED-GLASS WEATHER WIDGET -->
    <div id="hudWeather" title="Live Local Weather • Click to cycle test preview">
      <span class="weather-live-dot"></span>
      <span id="locCity">SURAT</span>
      <span id="locEmoji">☀️</span>
      <span id="locTemp">32°C</span>
    </div>

    <!-- BOTTOM-LEFT REGION: RIGID POSITIONED MUSIC PLAYBACK CARD (140px pinned) -->
    <div id="mediaHud">
      <!-- Reconstrained Song Title Banner (Matches outer span of Prev/Play/Next buttons) -->
      <div class="spidey-music-title song-ticker-box" title="Lo-Fi Ambient Stream">
        <div class="song-ticker-text" id="trackTitleText">
          ♪ Track 1: Lo-Fi Chill Beats
        </div>
      </div>

      <!-- Playback Controls Deck -->
      <div class="transport-deck">
        <div class="media-buttons-block" id="mediaButtonsBlock">
          <button id="btnPrev" class="retro-btn" title="Previous Track">⏮</button>
          <button id="btnPlay" class="retro-btn play-btn" title="Play / Pause Lo-Fi Music">▶</button>
          <button id="btnNext" class="retro-btn" title="Next Track">⏭</button>
        </div>
        <div class="vol-control" id="volControl" title="Volume • Hover to expand">
          <span class="vol-icon" id="volIcon">🔊</span>
          <input type="range" id="volSlider" min="0" max="1" step="0.05" value="0.7">
        </div>
      </div>
    </div>

    <!-- BOTTOM-RIGHT CORNER: REAL-TIME SYSTEM CLOCK & FUEL READOUT -->
    <div id="hudClock" title="System Clock & Fuel Tracker • Click to test Pit Stop">
      <span id="clockDigits">12:00:00 PM</span>
      <span id="fuelBadge" style="margin-left: 6px; color: #38bdf8; font-weight: 700; cursor: pointer;">⛽ 100%</span>
    </div>
  </div>

  <!-- HTML5 AUDIO ENGINE -->
  <audio id="lofiAudio" preload="none"></audio>

  <script>
    const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
    const canvas = document.getElementById('ambientCanvas');

    // Explicitly bind HTML5 canvas internal resolution to client layout bounds upon loading
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    if (!canvas.width || canvas.width <= 0) canvas.width = window.innerWidth || 400;
    if (!canvas.height || canvas.height <= 0) canvas.height = window.innerHeight || 200;

    const ctx = canvas.getContext('2d');

    const hudWeather = document.getElementById('hudWeather');
    const locCity = document.getElementById('locCity');
    const locTemp = document.getElementById('locTemp');
    const locEmoji = document.getElementById('locEmoji');
    const hudClock = document.getElementById('hudClock');
    const clockDigits = document.getElementById('clockDigits');
    const fuelBadge = document.getElementById('fuelBadge');

    const btnPlay = document.getElementById('btnPlay');
    const btnPrev = document.getElementById('btnPrev');
    const btnNext = document.getElementById('btnNext');
    const trackTitleText = document.getElementById('trackTitleText');
    const volSlider = document.getElementById('volSlider');
    const volIcon = document.getElementById('volIcon');
    const lofiAudio = document.getElementById('lofiAudio');

    // Load moon crescent asset
    const moonCrescentImg = new Image();
    moonCrescentImg.src = '${moonCrescentUri}';
    let moonImgLoaded = false;
    moonCrescentImg.onload = () => { moonImgLoaded = true; };

    let width = canvas.width;
    let height = canvas.height;
    let streetY = Math.max(35, Math.floor(height * 0.74));
    let liveWeather = {
      city: 'Surat',
      tempC: '32',
      desc: 'Sunny',
      weatherType: 'clear',
      wmoCode: 0,
      windSpeed: 14,
      moonAstro: { isCrescent: true, crescentType: 'waning', illumination: 1 }
    };
    let activeWmoCode = 0;

    // --- TIME & WEATHER PHASE ENGINE ---
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
      return 'clear';
    }

    let activePhase = calculateSystemTimePhase();
    let activeWeather = calculateSystemWeather();
    let manualOverride = false;

    // --- PROCEDURAL TRAFFIC & SIGNAL ENGINE VARIABLES ('assets/traffic/') ---
    const imgTaxi = new Image(); imgTaxi.src = '${taxiUri}';
    const imgSedan = new Image(); imgSedan.src = '${sedanUri}';
    const imgTruck = new Image(); imgTruck.src = '${truckUri}';
    const imgGantry = new Image(); imgGantry.src = '${gantryUri}';
    const imgStation = new Image(); imgStation.src = '${stationUri}';

    let currentRoadSpeed = 1.0;
    let targetRoadSpeed = 1.0;
    let roadDistance = 0;

    let signalState = 'IDLE'; // 'IDLE', 'APPROACH', 'STOPPED_RED', 'DEPART_GREEN'
    let signalTimer = 0;
    let gantryX = -200;
    let gantrySignal = 'GREEN'; // 'GREEN', 'YELLOW', 'RED'
    let nextSignalCooldown = 650;

    const trafficVehicles = [];
    let trafficSpawnCooldown = 120;

    // --- VIRTUAL FUEL LEVEL & NEON PIT STOP VARIABLES ---
    let fuelLevel = 100;
    let fuelStationState = 'IDLE'; // 'IDLE', 'APPROACHING', 'DOCKING', 'REFUELING', 'DEPARTING'
    let stationX = -300;
    let refuelTimer = 0;
    let heroSteerOffsetY = 0;

    // Real-time tracking of moving background tree horizontal coordinates
    const visibleTreeCrowns = [];

    // Fuel level tracker: drops by 1% every 30 seconds of active coding session
    setInterval(() => {
      if (fuelLevel > 0 && fuelStationState === 'IDLE') {
        fuelLevel = Math.max(0, fuelLevel - 1);
        updateFuelBadge();
        if (fuelLevel <= 15) {
          triggerFuelStationPitStop();
        }
      }
    }, 30000);

    function updateFuelBadge() {
      if (!fuelBadge) return;
      fuelBadge.textContent = '⛽ ' + Math.round(fuelLevel) + '%';
      if (fuelLevel <= 20) {
        fuelBadge.style.color = '#ef4444';
      } else if (fuelLevel <= 40) {
        fuelBadge.style.color = '#f59e0b';
      } else {
        fuelBadge.style.color = '#38bdf8';
      }
    }

    function triggerFuelStationPitStop() {
      if (fuelStationState !== 'IDLE') return;
      fuelStationState = 'APPROACHING';
      stationX = width + 80;
    }

    if (fuelBadge) {
      fuelBadge.addEventListener('click', (e) => {
        e.stopPropagation();
        triggerFuelStationPitStop();
      });
    }

    // --- SYSTEM CLOCK TICKER ---
    function updateClockTicker() {
      const now = new Date();
      let h = now.getHours();
      const m = String(now.getMinutes()).padStart(2, '0');
      const s = String(now.getSeconds()).padStart(2, '0');
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12;
      h = h ? h : 12;
      if (clockDigits) {
        clockDigits.textContent = h + ':' + m + ':' + s + ' ' + ampm;
      }
    }
    updateClockTicker();
    setInterval(updateClockTicker, 1000);

    // --- WEATHER HUD SYNC ---
    function updateWeatherHud() {
      let icon = '☀️';
      if (activeWeather === 'rain') icon = '🌧️';
      else if (activeWeather === 'thunder') icon = '⛈️';
      else if (activeWeather === 'snow') icon = '❄️';
      else if (activeWeather === 'cloudy' || activeWeather === 'partlycloudy') {
        icon = activeWmoCode === 3 ? '☁️' : '⛅';
      } else if (activePhase === 'night') {
        icon = (liveWeather && liveWeather.moonAstro && liveWeather.moonAstro.isCrescent) ? '🌙' : '🌕';
      }

      const city = (liveWeather && liveWeather.city) ? liveWeather.city.toUpperCase() : 'SURAT';
      const temp = (liveWeather && liveWeather.tempC) ? liveWeather.tempC + '°C' : '32°C';
      locCity.textContent = city;
      locTemp.textContent = temp;
      locEmoji.textContent = icon;
    }
    updateWeatherHud();

    // Interactive Preview Cycle across all particle states and environments
    const previewStates = [
      { phase: 'night', weather: 'clear', wmoCode: 0, desc: 'Midnight Crescent & Leaves' },
      { phase: 'afternoon', weather: 'rain', wmoCode: 61, desc: 'Drifting Rain Droplets' },
      { phase: 'night', weather: 'snow', wmoCode: 71, desc: 'Cozy Gentle Snowfall' },
      { phase: 'morning', weather: 'clear', wmoCode: 0, desc: 'Green Hills Sunrise' },
      { phase: 'afternoon', weather: 'partlycloudy', wmoCode: 2, desc: 'Metropolis & Palms' },
      { phase: 'evening', weather: 'clear', wmoCode: 0, desc: 'Purple Sunset Bridge' },
      { phase: 'afternoon', weather: 'cloudy', wmoCode: 3, desc: 'Dense Overcast Clouds' },
      { phase: 'night', weather: 'thunder', wmoCode: 95, desc: 'Arcade Lightning Storm' }
    ];
    let previewIndex = 0;

    hudWeather.addEventListener('click', () => {
      manualOverride = true;
      previewIndex = (previewIndex + 1) % previewStates.length;
      activePhase = previewStates[previewIndex].phase;
      activeWeather = previewStates[previewIndex].weather;
      activeWmoCode = previewStates[previewIndex].wmoCode;
      if (activePhase === 'afternoon') {
        nextSignalCooldown = 50; // trigger intersection light cycle shortly after selecting city
      }
      injectCloudLayer(activeWmoCode);
      updateWeatherHud();
    });

    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg && msg.command === 'weatherUpdate' && msg.data) {
        liveWeather = msg.data;
        if (!manualOverride) {
          if (liveWeather.weatherType) activeWeather = liveWeather.weatherType;
          if (typeof liveWeather.wmoCode === 'number') activeWmoCode = liveWeather.wmoCode;
          injectCloudLayer(activeWmoCode);
        }
        updateWeatherHud();
      }
    });

    if (vscode) {
      vscode.postMessage({ command: 'requestWeather' });
    }

    setInterval(() => {
      if (!manualOverride) {
        const detectedPhase = calculateSystemTimePhase();
        const detectedWeather = calculateSystemWeather();
        if (detectedPhase !== activePhase) activePhase = detectedPhase;
        if (detectedWeather !== activeWeather) activeWeather = detectedWeather;
        if (liveWeather && typeof liveWeather.wmoCode === 'number') {
          activeWmoCode = liveWeather.wmoCode;
        }
        injectCloudLayer(activeWmoCode);
        updateWeatherHud();
      }
    }, 60000);

    // =========================================================================
    // DYNAMIC REAL-TIME CLOUD LAYER INJECTION (API SYNCHRONIZED)
    // =========================================================================
    const clouds = [];
    function injectCloudLayer(code) {
      clouds.length = 0;
      const wCode = typeof code === 'number' ? code : activeWmoCode;

      if (wCode !== 1 && wCode !== 2 && wCode !== 3 && activeWeather !== 'cloudy' && activeWeather !== 'partlycloudy') {
        return;
      }

      const count = (wCode === 3) ? 4 : 3;
      for (let i = 0; i < count; i++) {
        const baseWidth = (wCode === 3) ? 68 : (wCode === 2 ? 56 : 48);
        const baseHeight = (wCode === 3) ? 17 : (wCode === 2 ? 14 : 11);
        clouds.push({
          x: Math.floor((width / count) * i + (Math.random() * 30)),
          y: Math.max(14, Math.floor(streetY * (0.16 + (i * 0.13)))),
          speed: 0.12 + (i * 0.05),
          w: baseWidth + Math.floor(Math.random() * 12),
          h: baseHeight + Math.floor(Math.random() * 4),
          wmoCode: wCode,
          id: i
        });
      }
    }
    injectCloudLayer(activeWmoCode);

    function drawPixelArtCloudSilhouettes(t) {
      if (clouds.length === 0) return;
      ctx.save();

      for (const c of clouds) {
        c.x -= c.speed;
        if (c.x + c.w < -30) {
          c.x = width + 20 + Math.random() * 30;
          c.y = Math.max(14, Math.floor(streetY * (0.14 + Math.random() * 0.36)));
        }

        const cx = Math.floor(c.x);
        const cy = Math.floor(c.y);
        const cw = c.w;
        const ch = c.h;
        const wCode = c.wmoCode;

        let bodyColor, shadeColor;
        if (wCode === 3) {
          bodyColor = activePhase === 'night' ? 'rgba(51, 65, 85, 0.82)' : 'rgba(71, 85, 105, 0.85)';
          shadeColor = activePhase === 'night' ? 'rgba(30, 41, 59, 0.88)' : 'rgba(51, 65, 85, 0.90)';
        } else if (wCode === 2) {
          bodyColor = (activePhase === 'night' || activePhase === 'evening') 
            ? 'rgba(216, 180, 254, 0.42)' 
            : 'rgba(255, 255, 255, 0.55)';
          shadeColor = (activePhase === 'night' || activePhase === 'evening') 
            ? 'rgba(147, 112, 219, 0.38)' 
            : 'rgba(203, 213, 225, 0.48)';
        } else {
          bodyColor = (activePhase === 'night' || activePhase === 'evening') 
            ? 'rgba(233, 213, 255, 0.26)' 
            : 'rgba(255, 255, 255, 0.35)';
          shadeColor = (activePhase === 'night' || activePhase === 'evening') 
            ? 'rgba(168, 85, 247, 0.22)' 
            : 'rgba(226, 232, 240, 0.28)';
        }

        ctx.fillStyle = bodyColor;
        const rY = cy + Math.floor(ch * 0.35);
        const rH = Math.floor(ch * 0.65);
        ctx.fillRect(cx + 4, rY, cw - 8, rH);

        const puff1W = Math.floor(cw * 0.32);
        const puff1X = cx + Math.floor(cw * 0.16);
        ctx.fillRect(puff1X, cy + 2, puff1W, Math.floor(ch * 0.55));

        const puff2W = Math.floor(cw * 0.38);
        const puff2X = cx + Math.floor(cw * 0.42);
        ctx.fillRect(puff2X, cy, puff2W, Math.floor(ch * 0.65));

        const puff3W = Math.floor(cw * 0.24);
        const puff3X = cx + Math.floor(cw * 0.68);
        ctx.fillRect(puff3X, cy + 3, puff3W, Math.floor(ch * 0.45));

        ctx.fillStyle = shadeColor;
        ctx.fillRect(cx + 6, cy + ch - 2, cw - 12, 2);
      }

      ctx.restore();
    }

    // =========================================================================
    // DIAGONAL CELESTIAL ORBIT TRACKER
    // =========================================================================
    function getCelestialOrbitPosition() {
      const now = new Date();
      const h = now.getHours();
      const m = now.getMinutes();
      const isDay = h >= 6 && h < 19;

      let progress = 0;
      if (isDay) {
        const mins = (h - 6) * 60 + m;
        progress = Math.max(0, Math.min(1, mins / (13 * 60)));
      } else {
        const past = h >= 19 ? (h - 19) + m / 60 : (h + 5) + m / 60;
        progress = Math.max(0, Math.min(1, past / 11));
      }

      if (manualOverride) {
        if (activePhase === 'morning') progress = 0.22;
        else if (activePhase === 'afternoon') progress = 0.52;
        else if (activePhase === 'evening') progress = 0.88;
        else progress = 0.48;
      }

      const startX = width * 0.10;
      const startY = streetY - 14;
      const endX = width * 0.84;
      const endY = streetY - 12;
      const peakY = Math.max(22, Math.floor(streetY * 0.22));

      const cx = Math.floor(startX + (endX - startX) * progress);
      const baseY = startY + (endY - startY) * progress;
      const cy = Math.floor(baseY - (4 * progress * (1 - progress) * (baseY - peakY)));

      return { cx, cy, isDay, progress };
    }

    // =========================================================================
    // DYNAMIC LUNAR SHAPE CALCULATOR (CRESCENT VS FULL MOON)
    // =========================================================================
    function drawDynamicMoon(cx, cy, moonR) {
      const astro = (liveWeather && liveWeather.moonAstro) ? liveWeather.moonAstro : { isCrescent: true, crescentType: 'waning' };
      ctx.save();

      const glow = ctx.createRadialGradient(cx, cy, moonR * 0.3, cx, cy, moonR * 2.5);
      glow.addColorStop(0, 'rgba(230, 240, 255, 0.60)');
      glow.addColorStop(0.5, 'rgba(180, 210, 255, 0.18)');
      glow.addColorStop(1, 'rgba(180, 210, 255, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, moonR * 2.5, 0, Math.PI * 2);
      ctx.fill();

      if (astro.isCrescent) {
        if (moonImgLoaded && moonCrescentImg.complete) {
          const drawSize = Math.floor(moonR * 2.2);
          ctx.drawImage(moonCrescentImg, cx - drawSize / 2, cy - drawSize / 2, drawSize, drawSize);
        } else {
          ctx.fillStyle = '#f8fafc';
          ctx.beginPath();
          if (astro.crescentType === 'waning') {
            ctx.arc(cx, cy, moonR, -Math.PI * 0.5, Math.PI * 0.5, true);
            ctx.arc(cx - moonR * 0.55, cy, moonR * 0.95, Math.PI * 0.5, -Math.PI * 0.5, false);
          } else {
            ctx.arc(cx, cy, moonR, -Math.PI * 0.5, Math.PI * 0.5, false);
            ctx.arc(cx + moonR * 0.55, cy, moonR * 0.95, Math.PI * 0.5, -Math.PI * 0.5, true);
          }
          ctx.closePath();
          ctx.fill();
        }
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cx, cy, moonR, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(203, 213, 225, 0.4)';
        ctx.beginPath();
        ctx.arc(cx - moonR * 0.3, cy - moonR * 0.2, moonR * 0.25, 0, Math.PI * 2);
        ctx.arc(cx + moonR * 0.2, cy + moonR * 0.3, moonR * 0.2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    // =========================================================================
    // TIME-LOCKED LANDSCAPES
    // =========================================================================
    function drawMorningGreenHills(t) {
      try {
        const hillW = Math.max(width, 600);
        const shift = (roadDistance * 0.22) % hillW;

        ctx.save();
        for (const offset of [0, hillW]) {
          ctx.fillStyle = '#15803d';
          ctx.beginPath();
          ctx.moveTo(-shift + offset, streetY);
          ctx.bezierCurveTo(
            -shift + offset + hillW * 0.25, streetY - 55,
            -shift + offset + hillW * 0.45, streetY - 65,
            -shift + offset + hillW * 0.65, streetY - 42
          );
          ctx.bezierCurveTo(
            -shift + offset + hillW * 0.85, streetY - 24,
            -shift + offset + hillW * 0.95, streetY - 48,
            hillW - shift + offset, streetY
          );
          ctx.closePath();
          ctx.fill();

          ctx.strokeStyle = 'rgba(187, 247, 208, 0.45)';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          ctx.fillStyle = '#166534';
          ctx.beginPath();
          ctx.moveTo(-shift + offset, streetY);
          for (let hx = 0; hx <= hillW; hx += 35) {
            const hy = streetY - 16 - Math.sin((hx / hillW) * Math.PI * 3.5) * 10;
            ctx.lineTo(hx - shift + offset, hy);
          }
          ctx.lineTo(hillW - shift + offset, streetY);
          ctx.closePath();
          ctx.fill();

          for (let tx = 20; tx < hillW; tx += 48) {
            const treeX = Math.floor(tx - shift + offset);
            const treeY = streetY - 14;
            if (treeX > -25 && treeX < width + 25) {
              visibleTreeCrowns.push({ x: treeX + 1, y: treeY - 8, radius: 8 });
            }
            ctx.fillStyle = '#14532d';
            ctx.fillRect(treeX, treeY - 8, 3, 8);
            ctx.fillStyle = '#22c55e';
            ctx.fillRect(treeX - 2, treeY - 6, 7, 3);
            ctx.fillRect(treeX - 1, treeY - 9, 5, 3);
          }
        }
        ctx.restore();
      } catch (e) {}
    }

    function drawAfternoonMetropolis(t) {
      try {
        const cityW = Math.max(width, 650);
        const shift = (roadDistance * 0.28) % cityW;

        ctx.save();
        for (const offset of [0, cityW]) {
          const startX = -shift + offset;
          const buildings = [
            { x: 0, w: 42, h: 58 },
            { x: 44, w: 32, h: 74, spire: true },
            { x: 78, w: 52, h: 48 },
            { x: 132, w: 38, h: 86, spire: true },
            { x: 172, w: 46, h: 62 },
            { x: 220, w: 54, h: 78 },
            { x: 276, w: 36, h: 54 },
            { x: 314, w: 60, h: 92, spire: true },
            { x: 376, w: 48, h: 66 },
            { x: 426, w: 56, h: 80 },
            { x: 484, w: 40, h: 60 },
            { x: 526, w: 52, h: 72 },
            { x: 580, w: 70, h: 50 }
          ];

          for (const b of buildings) {
            const bx = Math.floor(startX + b.x);
            const by = streetY - b.h;

            ctx.fillStyle = '#1e293b';
            ctx.fillRect(bx, by, b.w, b.h);

            ctx.fillStyle = '#334155';
            ctx.fillRect(bx, by, 2, b.h);

            if (b.spire) {
              ctx.fillStyle = '#475569';
              ctx.fillRect(bx + Math.floor(b.w / 2), by - 12, 2, 12);
              ctx.fillStyle = '#ef4444';
              ctx.fillRect(bx + Math.floor(b.w / 2) - 1, by - 13, 4, 2);
            }

            ctx.fillStyle = 'rgba(186, 230, 253, 0.45)';
            for (let wx = bx + 5; wx < bx + b.w - 5; wx += 8) {
              for (let wy = by + 6; wy < streetY - 6; wy += 9) {
                if (((wx + wy) % 5) !== 0) {
                  ctx.fillRect(wx, wy, 4, 4);
                }
              }
            }
          }
        }
        ctx.restore();

        const palmSpacing = 160;
        const palmShift = (roadDistance * 0.45) % palmSpacing;
        for (let px = -palmSpacing; px < width + palmSpacing * 2; px += palmSpacing) {
          const posX = Math.floor(px - palmShift);
          const posY = streetY - 2;
          const scale = 0.8 + ((Math.abs(posX) % 3) * 0.2);

          const crownX = posX + 3 * scale;
          const crownY = posY - 22 * scale;
          if (crownX > -25 && crownX < width + 25) {
            visibleTreeCrowns.push({ x: crownX, y: crownY, radius: 12 * scale });
          }

          ctx.save();
          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.moveTo(posX, posY);
          ctx.quadraticCurveTo(posX + 4 * scale, posY - 8 * scale, posX + 2 * scale, posY - 22 * scale);
          ctx.lineTo(posX + 5 * scale, posY - 22 * scale);
          ctx.quadraticCurveTo(posX + 7 * scale, posY - 8 * scale, posX + 3 * scale, posY);
          ctx.closePath();
          ctx.fill();

          ctx.lineWidth = 1.5;
          ctx.strokeStyle = '#0f172a';
          const fronds = [[-12, -4], [-9, -9], [-1, -11], [8, -10], [12, -3]];
          for (const [fx, fy] of fronds) {
            ctx.beginPath();
            ctx.moveTo(crownX, crownY);
            ctx.quadraticCurveTo(crownX + fx * 0.5 * scale, crownY + fy * scale - 2, crownX + fx * scale, crownY + fy * scale);
            ctx.stroke();
          }
          ctx.restore();
        }
      } catch (e) {}
    }

    function drawEveningRiverfrontBridge(t) {
      try {
        const bridgeW = Math.max(width, 700);
        const bridgeShift = (roadDistance * 0.30) % bridgeW;

        ctx.save();
        for (const offset of [0, bridgeW]) {
          const bx = Math.floor(width * 0.55) - bridgeShift + offset;
          if (bx > -200 && bx < width + 200) {
            const pylonTop = streetY - 56;
            const pylonBase = streetY - 2;

            ctx.fillStyle = '#3b0764';
            ctx.beginPath();
            ctx.moveTo(bx - 3, pylonTop);
            ctx.lineTo(bx + 4, pylonTop);
            ctx.lineTo(bx - 12, pylonBase);
            ctx.lineTo(bx - 16, pylonBase);
            ctx.closePath();
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(bx + 3, pylonTop);
            ctx.lineTo(bx + 7, pylonTop);
            ctx.lineTo(bx + 16, pylonBase);
            ctx.lineTo(bx + 12, pylonBase);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = '#ef4444';
            ctx.fillRect(bx + 1, pylonTop - 6, 3, 3);

            ctx.strokeStyle = 'rgba(251, 191, 36, 0.45)';
            ctx.lineWidth = 1;
            const cableDeltas = [-90, -70, -50, -32, -15, 15, 32, 50, 70, 90];
            for (let i = 0; i < cableDeltas.length; i++) {
              ctx.beginPath();
              ctx.moveTo(bx + 2, pylonTop + 6 + (Math.abs(cableDeltas[i]) * 0.15));
              ctx.lineTo(bx + cableDeltas[i], streetY - 2);
              ctx.stroke();
            }

            ctx.fillStyle = '#fef08a';
            for (let lx = bx - 85; lx <= bx + 85; lx += 18) {
              ctx.fillRect(lx, streetY - 4, 2.5, 2.5);
            }
          }
        }

        const riverH = Math.max(10, Math.floor((height - streetY) * 0.35));
        const waterGrad = ctx.createLinearGradient(0, streetY, 0, streetY + riverH);
        waterGrad.addColorStop(0, 'rgba(234, 88, 12, 0.30)');
        waterGrad.addColorStop(1, 'rgba(112, 26, 117, 0.15)');
        ctx.fillStyle = waterGrad;
        ctx.fillRect(0, streetY, width, riverH);

        ctx.fillStyle = 'rgba(254, 240, 138, 0.35)';
        for (let rx = 10; rx < width; rx += 35) {
          const ripShift = Math.sin(t * 0.08 + rx * 0.05) * 8;
          ctx.fillRect(rx + ripShift, streetY + 3 + (rx % 5), 18, 1);
        }

        ctx.restore();
      } catch (e) {}
    }

    function drawNightMidnightHighway(t) {
      try {
        const mountainW = Math.max(width, 680);
        const mountainShift = (roadDistance * 0.18) % mountainW;

        const peaks = [
          { x: 0.00, h: 0.42 },
          { x: 0.10, h: 0.68 },
          { x: 0.22, h: 0.38 },
          { x: 0.36, h: 0.88 },
          { x: 0.48, h: 0.52 },
          { x: 0.62, h: 0.74 },
          { x: 0.75, h: 0.44 },
          { x: 0.88, h: 0.70 },
          { x: 1.00, h: 0.42 }
        ];

        ctx.save();
        for (const offset of [0, mountainW]) {
          ctx.fillStyle = '#2e1065';
          ctx.beginPath();
          ctx.moveTo(-mountainShift + offset, streetY);
          for (let i = 0; i < peaks.length; i++) {
            const px = Math.floor(peaks[i].x * mountainW) - mountainShift + offset;
            const py = Math.floor(streetY - (streetY * peaks[i].h * 0.75));
            ctx.lineTo(px, py);
          }
          ctx.lineTo(mountainW - mountainShift + offset, streetY);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = '#4c1d95';
          for (let i = 1; i < peaks.length; i++) {
            const prevX = Math.floor(peaks[i - 1].x * mountainW) - mountainShift + offset;
            const prevY = Math.floor(streetY - (streetY * peaks[i - 1].h * 0.75));
            const peakX = Math.floor(peaks[i].x * mountainW) - mountainShift + offset;
            const peakY = Math.floor(streetY - (streetY * peaks[i].h * 0.75));

            ctx.beginPath();
            ctx.moveTo(peakX, peakY);
            ctx.lineTo(prevX, prevY);
            ctx.lineTo(peakX, streetY);
            ctx.closePath();
            ctx.fill();
          }

          ctx.strokeStyle = 'rgba(233, 213, 255, 0.40)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          for (let i = 0; i < peaks.length; i++) {
            const px = Math.floor(peaks[i].x * mountainW) - mountainShift + offset;
            const py = Math.floor(streetY - (streetY * peaks[i].h * 0.75));
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.stroke();
        }

        const hillW = Math.max(width, 540);
        const hillShift = (roadDistance * 0.45) % hillW;
        ctx.fillStyle = '#120d24';
        for (const offset of [0, hillW]) {
          ctx.beginPath();
          ctx.moveTo(-hillShift + offset, streetY);
          for (let hx = 0; hx <= hillW; hx += 30) {
            const hy = streetY - 14 - Math.sin((hx / hillW) * Math.PI * 4) * 8;
            ctx.lineTo(hx - hillShift + offset, hy);
          }
          ctx.lineTo(hillW - hillShift + offset, streetY);
          ctx.closePath();
          ctx.fill();
        }

        if (isAutumnShedActive()) {
          const treeSpacing = 200;
          const treeShift = (roadDistance * 0.40) % treeSpacing;
          for (let tx = -treeSpacing; tx < width + treeSpacing; tx += treeSpacing) {
            const posX = Math.floor(tx - treeShift);
            const posY = streetY - 2;
            if (posX > -30 && posX < width + 30) {
              visibleTreeCrowns.push({ x: posX + 2, y: posY - 18, radius: 10 });
              ctx.fillStyle = '#170f2a';
              ctx.fillRect(posX, posY - 14, 4, 14);
              ctx.fillStyle = '#4a154b';
              ctx.beginPath();
              ctx.arc(posX + 2, posY - 18, 10, 0, Math.PI * 2);
              ctx.fill();
              ctx.fillStyle = '#701a75';
              ctx.beginPath();
              ctx.arc(posX + 2, posY - 20, 7, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }

        ctx.restore();
      } catch (e) {}
    }

    // =========================================================================
    // HERO VEHICLE: RED SPIDER SUPERCAR (PERMANENT SCREEN-CENTER ANCHORING)
    // =========================================================================
    function drawRetroCruiserCar(t) {
      try {
        const cw = 30;
        // 1. Permanently anchor hero vehicle at horizontal screen center
        const carX = Math.floor(width * 0.5 - cw * 0.5);
        // Chassis floating when cruising, subtle engine idle vibration when stopped
        const carBob = currentRoadSpeed > 0.12 ? (Math.sin(t * 0.22) * 0.6) : (Math.sin(t * 0.08) * 0.2);
        const roadHeight = height - streetY;
        const carY = streetY + Math.max(6, Math.floor(roadHeight * 0.28)) + carBob + heroSteerOffsetY;

        ctx.save();
        ctx.translate(carX, Math.round(carY));

        const lightsOn = activePhase === 'night' || activePhase === 'evening' || activeWeather === 'rain' || activeWeather === 'thunder';

        // Headlight beams illuminating the highway
        if (lightsOn) {
          const beamGrad = ctx.createLinearGradient(cw - 2, 0, cw + 38, 0);
          beamGrad.addColorStop(0, 'rgba(254, 240, 138, 0.70)');
          beamGrad.addColorStop(0.4, 'rgba(254, 240, 138, 0.25)');
          beamGrad.addColorStop(1, 'rgba(254, 240, 138, 0)');

          ctx.fillStyle = beamGrad;
          ctx.beginPath();
          ctx.moveTo(cw - 1, 3);
          ctx.lineTo(cw + 38, -2);
          ctx.lineTo(cw + 38, 12);
          ctx.lineTo(cw - 1, 6);
          ctx.closePath();
          ctx.fill();
        }

        // Drop shadow beneath vehicle
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(-2, 9, cw + 4, 3);

        // Lower chassis & rocker panels
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 5, cw, 4);

        // Crimson Spider bodywork
        ctx.fillStyle = '#991b1b';
        ctx.fillRect(2, 3, cw - 4, 4);
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(4, 2, cw - 12, 2);

        // Aerodynamic canopy & tinted windshield
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(8, -1, 14, 4);
        ctx.fillStyle = activePhase === 'afternoon' ? '#38bdf8' : '#64748b';
        ctx.fillRect(10, 0, 10, 2);

        // Spider supercar rear spoiler & hood accents
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(1, 0, 4, 2);
        ctx.fillStyle = '#991b1b';
        ctx.fillRect(2, 2, 2, 2);

        // Headlight cluster
        ctx.fillStyle = lightsOn ? '#fef08a' : '#cbd5e1';
        ctx.fillRect(cw - 3, 4, 2, 2);

        // Taillights & Active Braking Glow
        const isHeroBraking = currentRoadSpeed < 0.6 && (targetRoadSpeed === 0 || gantrySignal === 'RED');
        if (isHeroBraking) {
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(0, 3, 2, 4);
          ctx.fillStyle = 'rgba(239, 68, 68, 0.65)';
          ctx.fillRect(-7, 1, 7, 6); // active braking glow aura
        } else {
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(0, 4, 2, 2);
          if (lightsOn) {
            ctx.fillStyle = 'rgba(239, 68, 68, 0.35)';
            ctx.fillRect(-5, 3, 5, 3);
          }
        }

        // Flashing Hazard Lights (Active during pit stop refueling cycle)
        const isHazardOn = (fuelStationState === 'REFUELING' || fuelStationState === 'DOCKING') && (Math.floor(t / 15) % 2 === 0);
        if (isHazardOn) {
          ctx.fillStyle = '#f59e0b';
          ctx.fillRect(cw - 2, 4, 2, 2);
          ctx.fillRect(0, 4, 2, 2);
          const hazGlow = ctx.createRadialGradient(cw, 5, 1, cw, 5, 8);
          hazGlow.addColorStop(0, 'rgba(245, 158, 11, 0.9)');
          hazGlow.addColorStop(1, 'rgba(245, 158, 11, 0)');
          ctx.fillStyle = hazGlow;
          ctx.beginPath();
          ctx.arc(cw, 5, 8, 0, Math.PI * 2);
          ctx.arc(0, 5, 8, 0, Math.PI * 2);
          ctx.fill();
        }

        // Wheels & spin physics tied directly to roadDistance
        const wheelRot = roadDistance * 0.42;
        const wheels = [6, cw - 8];
        for (const wx of wheels) {
          ctx.fillStyle = '#020617';
          ctx.fillRect(wx - 3, 6, 6, 5);
          ctx.fillStyle = '#94a3b8';
          ctx.fillRect(wx - 1, 7, 2, 3);
          const spoke = Math.sin(wheelRot) > 0;
          ctx.fillStyle = spoke ? '#e2e8f0' : '#475569';
          ctx.fillRect(wx - 1, 8, 2, 1);
        }

        ctx.restore();
      } catch (e) {}
    }

    // =========================================================================
    // PROCEDURAL TRAFFIC & SIGNAL SIMULATION ENGINE ('assets/traffic/')
    // =========================================================================

    // 1. Intersection Traffic Signal Phasing & Parallax Speed Physics
    function updateTrafficSignalCycle() {
      const isCityPhase = activePhase === 'afternoon' || activePhase === 'evening';

      if (signalState === 'IDLE') {
        if (isCityPhase) {
          nextSignalCooldown--;
          if (nextSignalCooldown <= 0) {
            signalState = 'APPROACH';
            gantryX = width + 50;
            gantrySignal = 'GREEN';
            signalTimer = 0;
          }
        }
      } else if (signalState === 'APPROACH') {
        gantryX -= currentRoadSpeed * 3.4;

        // Switch to amber as gantry approaches the intersection line
        if (gantryX <= width * 0.74 && gantrySignal === 'GREEN') {
          gantrySignal = 'YELLOW';
          signalTimer = 75; // ~1.2s amber light
        }

        if (gantrySignal === 'YELLOW') {
          signalTimer--;
          if (signalTimer <= 0) {
            // Signal cycles to RED: trigger active braking routine
            gantrySignal = 'RED';
            signalState = 'STOPPED_RED';
            signalTimer = 340; // ~5.6s red light duration
            targetRoadSpeed = 0.0;
          }
        }
      } else if (signalState === 'STOPPED_RED') {
        targetRoadSpeed = 0.0;
        signalTimer--;
        if (signalTimer <= 0) {
          // Signal cycles to GREEN: release brakes, activate standard acceleration curves
          gantrySignal = 'GREEN';
          signalState = 'DEPART_GREEN';
          targetRoadSpeed = 1.0;
        }
      } else if (signalState === 'DEPART_GREEN') {
        targetRoadSpeed = 1.0;
        gantryX -= currentRoadSpeed * 3.4;

        if (gantryX < -80) {
          signalState = 'IDLE';
          nextSignalCooldown = 700 + Math.floor(Math.random() * 500); // 12-20s until next intersection
        }
      }

      // Smooth exponential deceleration / acceleration curve
      currentRoadSpeed += (targetRoadSpeed - currentRoadSpeed) * 0.04;
      if (Math.abs(currentRoadSpeed - targetRoadSpeed) < 0.005) {
        currentRoadSpeed = targetRoadSpeed;
      }
      roadDistance += currentRoadSpeed;
    }

    // 2. Context-Aware Vehicle Spawner (Midnight vs Metropolis)
    function updateTrafficSpawner() {
      trafficSpawnCooldown--;
      if (trafficSpawnCooldown > 0) return;

      const isMidnightOrMountain = activePhase === 'night' || activePhase === 'morning';

      if (isMidnightOrMountain) {
        // MOUNTAIN HILLS / MIDNIGHT:
        // Reduce traffic density variables. Spawn rare individual background cars or cargo truck profiles
        trafficSpawnCooldown = 650 + Math.floor(Math.random() * 550);
        if (trafficVehicles.length >= 2) return;

        const type = Math.random() < 0.70 ? 'truck' : 'sedan';
        const lane = Math.random() < 0.65 ? 0 : 1;
        const fromBehind = Math.random() < 0.40;
        const speed = fromBehind ? 1.18 : 0.78;
        const spawnX = fromBehind ? -70 : width + 70;

        spawnVehicle(type, lane, spawnX, speed);
      } else {
        // METROPOLIS CITY STAGE:
        // Increase spawn frequency sliders. Populate background lanes with active yellow taxis and sleek sedans
        trafficSpawnCooldown = 150 + Math.floor(Math.random() * 130);
        if (trafficVehicles.length >= 4) return;

        const types = ['taxi', 'taxi', 'sedan', 'sedan', 'truck'];
        const type = types[Math.floor(Math.random() * types.length)];
        const lane = Math.random() < 0.55 ? 0 : 1;
        const fromBehind = Math.random() < 0.55;
        const speed = fromBehind ? (1.15 + Math.random() * 0.30) : (0.72 + Math.random() * 0.18);
        const spawnX = fromBehind ? -60 : width + 60;

        // Verify distance before spawning in same lane
        const tooClose = trafficVehicles.some(v => v.lane === lane && Math.abs(v.x - spawnX) < 75);
        if (!tooClose) {
          spawnVehicle(type, lane, spawnX, speed);
        }
      }
    }

    function spawnVehicle(type, lane, spawnX, speed) {
      let w = 30;
      let h = 13;
      let col = '#2563eb';
      if (type === 'taxi') {
        w = 30;
        h = 14;
        col = '#facc15';
      } else if (type === 'truck') {
        w = 46;
        h = 18;
        col = '#e2e8f0';
      } else {
        col = ['#3b82f6', '#0ea5e9', '#64748b', '#e2e8f0'][Math.floor(Math.random() * 4)];
      }

      trafficVehicles.push({
        id: Math.random(),
        type,
        lane,
        x: spawnX,
        w,
        h,
        targetSpeed: speed,
        currentSpeed: speed,
        color: col,
        isBraking: false,
        brakeAlpha: 0
      });
    }

    // 3. Collision Avoidance & Deceleration Physics
    function updateTrafficSimulation() {
      const stopLineX = gantryX - 16;
      const isRed = (signalState === 'STOPPED_RED');

      for (let l = 0; l <= 1; l++) {
        const laneCars = trafficVehicles.filter(v => v.lane === l).sort((a, b) => a.x - b.x);

        for (let i = 0; i < laneCars.length; i++) {
          const v = laneCars[i];
          const carInFront = laneCars[i + 1];

          let distToStop = 9999;
          if (isRed && stopLineX > v.x) {
            distToStop = stopLineX - (v.x + v.w);
          }

          let distToFrontCar = 9999;
          if (carInFront) {
            distToFrontCar = carInFront.x - (v.x + v.w) - 18;
          }

          let distToHero = 9999;
          const heroX = Math.floor(width * 0.5 - 15);
          if (l === 1 && v.x < heroX) {
            distToHero = heroX - (v.x + v.w) - 18;
          }

          const closestObstacleDist = Math.min(distToStop, distToFrontCar, distToHero);

          if (isRed && closestObstacleDist < 160 && closestObstacleDist > 0) {
            // Active braking routine: exponential deceleration downshifting to stop behind stop line
            v.isBraking = true;
            v.brakeAlpha = Math.min(1, v.brakeAlpha + 0.15);
            const decelFactor = Math.max(0, closestObstacleDist / 160);
            v.currentSpeed *= 0.90 * decelFactor;
            if (closestObstacleDist <= 4) {
              v.currentSpeed = 0;
            }
          } else if (distToFrontCar < 35 || distToHero < 35) {
            // Collision avoidance buffer
            v.isBraking = true;
            v.currentSpeed *= 0.88;
          } else {
            // Standard acceleration / cruising recovery curve
            v.isBraking = false;
            v.brakeAlpha = Math.max(0, v.brakeAlpha - 0.08);
            v.currentSpeed += (v.targetSpeed - v.currentSpeed) * 0.04;
          }

          // Relative screen velocity: (v.currentSpeed - currentRoadSpeed) * 3.2
          v.x += (v.currentSpeed - currentRoadSpeed) * 3.2;
        }
      }

      // Despawn off-screen vehicles
      for (let i = trafficVehicles.length - 1; i >= 0; i--) {
        const v = trafficVehicles[i];
        if (v.x < -120 || v.x > width + 140) {
          trafficVehicles.splice(i, 1);
        }
      }
    }

    // 4. Vehicle Renderer with 'assets/traffic/' and Procedural Pixel-Art Vector Fallbacks
    function drawBackgroundVehicle(v, t) {
      try {
        const roadHeight = height - streetY;
        const isFar = v.lane === 0;
        const baseY = isFar
          ? streetY + Math.max(3, Math.floor(roadHeight * 0.12))
          : streetY + Math.max(9, Math.floor(roadHeight * 0.48));
        const scale = isFar ? 0.88 : 1.0;

        ctx.save();
        ctx.translate(Math.round(v.x), Math.round(baseY));
        ctx.scale(scale, scale);

        const lightsOn = activePhase === 'night' || activePhase === 'evening' || activeWeather === 'rain' || activeWeather === 'thunder';

        // Drop shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.fillRect(-2, v.h - 3, v.w + 4, 3);

        // Headlight beam if lights active
        if (lightsOn) {
          const bGrad = ctx.createLinearGradient(v.w - 2, 0, v.w + 26, 0);
          bGrad.addColorStop(0, 'rgba(254, 240, 138, 0.55)');
          bGrad.addColorStop(1, 'rgba(254, 240, 138, 0)');
          ctx.fillStyle = bGrad;
          ctx.beginPath();
          ctx.moveTo(v.w - 1, 3);
          ctx.lineTo(v.w + 26, 0);
          ctx.lineTo(v.w + 26, 10);
          ctx.lineTo(v.w - 1, 6);
          ctx.closePath();
          ctx.fill();
        }

        // Primary Sprite Render from 'assets/traffic/'
        let drawnSprite = false;
        if (v.type === 'taxi' && imgTaxi.complete && imgTaxi.naturalWidth > 0) {
          ctx.drawImage(imgTaxi, 0, 0, v.w, v.h);
          drawnSprite = true;
        } else if (v.type === 'sedan' && imgSedan.complete && imgSedan.naturalWidth > 0) {
          ctx.drawImage(imgSedan, 0, 0, v.w, v.h);
          drawnSprite = true;
        } else if (v.type === 'truck' && imgTruck.complete && imgTruck.naturalWidth > 0) {
          ctx.drawImage(imgTruck, 0, 0, v.w, v.h);
          drawnSprite = true;
        }

        if (!drawnSprite) {
          // Zero-Crash Vector Fallback
          if (v.type === 'taxi') {
            ctx.fillStyle = '#facc15';
            ctx.fillRect(0, 4, v.w, 7);
            ctx.fillRect(8, 1, 14, 4);
            ctx.fillStyle = '#fef08a';
            ctx.fillRect(12, 0, 6, 2); // Taxi roof sign
            ctx.fillStyle = '#bae6fd';
            ctx.fillRect(10, 2, 10, 2); // Windows
            ctx.fillStyle = '#0f172a';
            for (let k = 6; k < v.w - 6; k += 4) {
              ctx.fillRect(k, 6, 2, 1.5); // Checkered stripe
            }
          } else if (v.type === 'truck') {
            ctx.fillStyle = '#e2e8f0';
            ctx.fillRect(0, 0, v.w - 14, v.h - 3); // Cargo trailer
            ctx.fillStyle = '#94a3b8';
            ctx.fillRect(0, v.h - 5, v.w - 14, 2);
            ctx.fillStyle = '#dc2626';
            ctx.fillRect(v.w - 12, 3, 12, v.h - 6); // Cab
            ctx.fillStyle = '#7dd3fc';
            ctx.fillRect(v.w - 6, 4, 5, 4);
          } else {
            ctx.fillStyle = v.color || '#2563eb';
            ctx.fillRect(0, 4, v.w, 6);
            ctx.fillRect(7, 1, 14, 4);
            ctx.fillStyle = '#93c5fd';
            ctx.fillRect(9, 2, 10, 2);
          }

          const wheels = v.type === 'truck' ? [6, 14, v.w - 8] : [6, v.w - 8];
          for (const wx of wheels) {
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(wx - 2, v.h - 4, 5, 4);
            ctx.fillStyle = '#94a3b8';
            ctx.fillRect(wx, v.h - 3, 1, 2);
          }
        }

        // Taillight / Braking Glow
        if (v.isBraking || v.brakeAlpha > 0.05) {
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(0, 3, 2, 4);
          const bGlow = ctx.createRadialGradient(0, 5, 1, 0, 5, 8);
          bGlow.addColorStop(0, 'rgba(239, 68, 68, 0.7)');
          bGlow.addColorStop(1, 'rgba(239, 68, 68, 0)');
          ctx.fillStyle = bGlow;
          ctx.beginPath();
          ctx.arc(0, 5, 8, 0, Math.PI * 2);
          ctx.fill();
        } else if (lightsOn) {
          ctx.fillStyle = '#dc2626';
          ctx.fillRect(0, 4, 2, 2);
        }

        ctx.restore();
      } catch (e) {}
    }

    function drawBackgroundTrafficLane(targetLane, t) {
      for (const v of trafficVehicles) {
        if (v.lane === targetLane) {
          drawBackgroundVehicle(v, t);
        }
      }
    }

    // 5. Overhead Traffic Light Gantry & Intersection Line Renderer
    function drawTrafficLightGantry() {
      if (gantryX < -80 || gantryX > width + 70) return;

      const roadHeight = height - streetY;
      const stopLineX = Math.floor(gantryX - 16);

      ctx.save();

      // Intersection Stop Line on pavement
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.fillRect(stopLineX, streetY, 3, roadHeight);

      // Crosswalk zebra dashes
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      for (let zy = streetY + 3; zy < height - 4; zy += 8) {
        ctx.fillRect(stopLineX + 6, zy, 6, 3);
      }

      // Overhead Cantilever Truss Structure
      const poleX = Math.floor(gantryX + 22);
      const trussY = streetY - 36;

      ctx.fillStyle = '#334155';
      ctx.fillRect(poleX, trussY, 3, 36);
      ctx.fillStyle = '#475569';
      ctx.fillRect(poleX - 1, streetY - 3, 5, 2);

      ctx.fillStyle = '#1e293b';
      ctx.fillRect(gantryX - 12, trussY, 36, 4);
      ctx.fillStyle = '#475569';
      ctx.fillRect(gantryX - 12, trussY + 1, 36, 1);

      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1;
      for (let tx = gantryX - 8; tx < poleX; tx += 8) {
        ctx.beginPath();
        ctx.moveTo(tx, trussY);
        ctx.lineTo(tx + 6, trussY + 4);
        ctx.stroke();
      }

      // Suspended Signal Box
      const boxX = Math.floor(gantryX - 2);
      const boxY = trussY + 4;
      const boxW = 10;
      const boxH = 22;

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.strokeRect(boxX, boxY, boxW, boxH);

      const cx = boxX + Math.floor(boxW / 2);
      const rY = boxY + 4;
      const yY = boxY + 11;
      const gY = boxY + 18;

      // RED SIGNAL
      if (gantrySignal === 'RED') {
        const glow = ctx.createRadialGradient(cx, rY, 1, cx, rY, 13);
        glow.addColorStop(0, 'rgba(239, 68, 68, 0.95)');
        glow.addColorStop(0.4, 'rgba(239, 68, 68, 0.45)');
        glow.addColorStop(1, 'rgba(239, 68, 68, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cx, rY, 13, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(cx, rY, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fca5a5';
        ctx.fillRect(cx - 0.5, rY - 0.5, 1, 1);
      } else {
        ctx.fillStyle = '#450a0a';
        ctx.beginPath();
        ctx.arc(cx, rY, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // YELLOW SIGNAL
      if (gantrySignal === 'YELLOW') {
        const glow = ctx.createRadialGradient(cx, yY, 1, cx, yY, 11);
        glow.addColorStop(0, 'rgba(245, 158, 11, 0.85)');
        glow.addColorStop(0.4, 'rgba(245, 158, 11, 0.4)');
        glow.addColorStop(1, 'rgba(245, 158, 11, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cx, yY, 11, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(cx, yY, 2.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = '#451a03';
        ctx.beginPath();
        ctx.arc(cx, yY, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // GREEN SIGNAL
      if (gantrySignal === 'GREEN') {
        const glow = ctx.createRadialGradient(cx, gY, 1, cx, gY, 13);
        glow.addColorStop(0, 'rgba(34, 197, 94, 0.90)');
        glow.addColorStop(0.4, 'rgba(34, 197, 94, 0.4)');
        glow.addColorStop(1, 'rgba(34, 197, 94, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cx, gY, 13, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.arc(cx, gY, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#86efac';
        ctx.fillRect(cx - 0.5, gY - 0.5, 1, 1);
      } else {
        ctx.fillStyle = '#052e16';
        ctx.beginPath();
        ctx.arc(cx, gY, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    // 6. Virtual Fuel Station Pit Stop Acceleration Mechanics & Docking
    function updateFuelStationCycle(t) {
      if (fuelStationState === 'APPROACHING') {
        stationX -= currentRoadSpeed * 3.4;
        if (stationX <= width * 0.54) {
          fuelStationState = 'DOCKING';
        }
      } else if (fuelStationState === 'DOCKING') {
        targetRoadSpeed = 0.0;
        // Steer hero car smoothly into terminal bay toward the pump
        heroSteerOffsetY += (6 - heroSteerOffsetY) * 0.05;
        if (currentRoadSpeed <= 0.03 && Math.abs(6 - heroSteerOffsetY) < 0.9) {
          currentRoadSpeed = 0.0;
          fuelStationState = 'REFUELING';
          refuelTimer = 360; // 6-second refueling frame cycle at 60fps
        }
      } else if (fuelStationState === 'REFUELING') {
        targetRoadSpeed = 0.0;
        refuelTimer--;
        fuelLevel = Math.min(100, Math.round(15 + ((360 - refuelTimer) / 360) * 85));
        updateFuelBadge();
        if (refuelTimer <= 0) {
          fuelLevel = 100;
          updateFuelBadge();
          fuelStationState = 'DEPARTING';
          targetRoadSpeed = 1.0; // Resume normal speed profiles onto open highway
        }
      } else if (fuelStationState === 'DEPARTING') {
        targetRoadSpeed = 1.0;
        // Steer hero car smoothly back into main cruising lane
        heroSteerOffsetY += (0 - heroSteerOffsetY) * 0.05;
        stationX -= currentRoadSpeed * 3.4;
        if (stationX < -140) {
          fuelStationState = 'IDLE';
        }
      }
    }

    function drawFuelStationGantry(t) {
      if (stationX < -140 || stationX > width + 100) return;

      const roadHeight = height - streetY;
      const stationW = 74;
      const canopyY = streetY - 34;

      ctx.save();

      // Service Island Concrete Curb with yellow/black hazard stripes
      const islandX = Math.floor(stationX + 16);
      const islandW = 42;
      const islandY = streetY - 2;
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(islandX, islandY, islandW, 4);

      for (let sx = islandX; sx < islandX + islandW; sx += 6) {
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(sx, islandY, 3, 2);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(sx + 3, islandY, 3, 2);
      }

      // Canopy Steel Columns
      ctx.fillStyle = '#475569';
      ctx.fillRect(stationX + 6, canopyY + 10, 3, 24);
      ctx.fillRect(stationX + stationW - 9, canopyY + 10, 3, 24);
      ctx.fillStyle = '#64748b';
      ctx.fillRect(stationX + 5, canopyY + 10, 1, 24);
      ctx.fillRect(stationX + stationW - 10, canopyY + 10, 1, 24);

      // Overhead Neon Canopy Fascia with Cyan/Blue glow onto pavement
      const neonGlow = ctx.createLinearGradient(0, canopyY, 0, streetY + 14);
      neonGlow.addColorStop(0, 'rgba(6, 182, 212, 0.28)');
      neonGlow.addColorStop(0.5, 'rgba(59, 130, 246, 0.12)');
      neonGlow.addColorStop(1, 'rgba(6, 182, 212, 0)');
      ctx.fillStyle = neonGlow;
      ctx.fillRect(stationX - 8, canopyY, stationW + 16, streetY - canopyY + 14);

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(stationX, canopyY, stationW, 10);
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 1;
      ctx.strokeRect(stationX, canopyY, stationW, 10);

      // Glowing Neon Text Sign
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 7px "Comic Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('⚡ SPIDER FUEL', stationX + stationW / 2, canopyY + 7.5);

      // Pixel Gas Pump Structure
      const pumpX = Math.floor(stationX + 32);
      const pumpY = streetY - 18;
      const pumpW = 12;
      const pumpH = 16;

      ctx.fillStyle = '#ef4444';
      ctx.fillRect(pumpX, pumpY, pumpW, pumpH);
      ctx.fillStyle = '#991b1b';
      ctx.fillRect(pumpX, pumpY + pumpH - 3, pumpW, 3);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1;
      ctx.strokeRect(pumpX, pumpY, pumpW, pumpH);

      // Digital fuel readout display
      ctx.fillStyle = '#020617';
      ctx.fillRect(pumpX + 2, pumpY + 2, pumpW - 4, 5);
      ctx.fillStyle = (fuelStationState === 'REFUELING') ? '#22c55e' : '#38bdf8';
      ctx.fillRect(pumpX + 3, pumpY + 3, pumpW - 6, 3);

      // Fuel hose & nozzle
      ctx.fillStyle = '#334155';
      ctx.fillRect(pumpX - 2, pumpY + 4, 2, 4);
      ctx.beginPath();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.2;
      ctx.moveTo(pumpX - 1, pumpY + 8);
      if (fuelStationState === 'REFUELING') {
        const heroFuelPortX = Math.floor(width * 0.5 - 10);
        const heroFuelPortY = streetY + 10 + heroSteerOffsetY;
        ctx.quadraticCurveTo(pumpX - 10, pumpY + 14, heroFuelPortX, heroFuelPortY);
      } else {
        ctx.quadraticCurveTo(pumpX - 4, pumpY + 14, pumpX - 2, pumpY + 12);
      }
      ctx.stroke();

      // Render image asset if ready
      if (imgStation.complete && imgStation.naturalWidth > 0) {
        ctx.drawImage(imgStation, stationX + 4, canopyY, 64, 40);
      }

      ctx.restore();
    }

    // =========================================================================
    // DYNAMIC CANVAS PARTICLE ENGINE (RAIN, SNOW, AUTUMN LEAVES)
    // =========================================================================

    // 1. Drifting Rain Droplets (WMO 51-67, 80-82)
    const raindrops = [];
    function initRain() {
      raindrops.length = 0;
      const count = Math.max(30, Math.floor(width / 12));
      for (let i = 0; i < count; i++) {
        raindrops.push({
          x: Math.random() * (width + 60) - 20,
          y: Math.random() * height,
          speed: 7.5 + Math.random() * 4.0, // high velocity
          vx: -1.8 - Math.random() * 1.0,   // cascading diagonal streak
          len: 9 + Math.random() * 6
        });
      }
    }

    // 2. Cozy Gentle Snowfall (WMO 71-77, 85-86)
    const snowflakes = [];
    function initSnow() {
      snowflakes.length = 0;
      const count = Math.max(25, Math.floor(width / 15));
      for (let i = 0; i < count; i++) {
        snowflakes.push({
          x: Math.random() * (width + 20) - 10,
          y: Math.random() * height,
          speed: 0.55 + Math.random() * 0.65, // slow, floating
          size: Math.random() > 0.65 ? 2 : 1,
          sway: Math.random() * Math.PI * 2,
          swaySpeed: 0.02 + Math.random() * 0.025,
          swayRadius: 0.45 + Math.random() * 0.45,
          alpha: 0.75 + Math.random() * 0.25
        });
      }
    }

    // 3. Retro Autumn Leaf Shed (Wind & Season Verified)
    const leaves = [];
    const leafColors = [
      { fill: '#f59e0b', stem: '#d97706' }, // warm amber
      { fill: '#ea580c', stem: '#c2410c' }, // rust orange
      { fill: '#b91c1c', stem: '#991b1b' }, // deep red
      { fill: '#dc2626', stem: '#991b1b' }, // crimson red
      { fill: '#d97706', stem: '#b45309' }  // golden ochre
    ];
    function initLeaves() {
      leaves.length = 0;
    }

    function isAutumnShedActive() {
      // Month: Sep (8), Oct (9), Nov (10) are autumn months
      const month = new Date().getMonth();
      const isAutumnMonth = month >= 8 && month <= 10;
      const wind = (liveWeather && typeof liveWeather.windSpeed === 'number') ? liveWeather.windSpeed : 12;
      return isAutumnMonth || wind >= 10;
    }

    // Stars
    const stars = [];
    function initStars() {
      stars.length = 0;
      const count = Math.max(24, Math.floor(width / 18));
      for (let i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * width,
          y: Math.random() * Math.max(20, streetY * 0.65),
          size: Math.random() > 0.8 ? 2 : 1,
          speed: 0.02 + Math.random() * 0.03,
          phase: Math.random() * Math.PI * 2
        });
      }
    }

    // Lightning
    let lightningFrames = [];
    let lightningBolt = null;
    let currentFlashAlpha = 0;
    function triggerArcadeLightning() {
      lightningFrames = [0.90, 0.42, 0.98, 0.65, 0.28, 0.10, 0.0];
      const startX = Math.floor(width * (0.25 + Math.random() * 0.5));
      const pts = [[startX, 0]];
      let curX = startX, curY = 0;
      while (curY < streetY * 0.85) {
        curY += 8 + Math.random() * 10;
        curX += (Math.random() - 0.48) * 20;
        pts.push([curX, curY]);
      }
      lightningBolt = pts;
    }

    // Radiant Sunbeams / Moonbeams
    function drawRadiantBeams(sourceX, sourceY, isMoon) {
      try {
        ctx.save();
        const numBeams = isMoon ? 4 : 5;
        const baseSpread = width * 0.22;
        for (let i = 0; i < numBeams; i++) {
          const shimmer = Math.sin(t * 0.028 + i * 1.4) * 0.04;
          const alpha = isMoon ? (0.06 + shimmer) : (0.11 + shimmer);
          const targetX = (width * 0.48) + (i - (numBeams - 1) / 2) * baseSpread;
          const beamWidth = 28 + i * 4;

          const beamGrad = ctx.createLinearGradient(sourceX, sourceY, targetX, streetY);
          if (isMoon) {
            beamGrad.addColorStop(0, 'rgba(219, 234, 254, ' + (alpha * 1.5) + ')');
            beamGrad.addColorStop(1, 'rgba(219, 234, 254, 0)');
          } else {
            beamGrad.addColorStop(0, 'rgba(254, 240, 138, ' + (alpha * 1.6) + ')');
            beamGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
          }

          ctx.fillStyle = beamGrad;
          ctx.beginPath();
          ctx.moveTo(sourceX - 2, sourceY);
          ctx.lineTo(sourceX + 2, sourceY);
          ctx.lineTo(targetX + beamWidth, streetY);
          ctx.lineTo(targetX - beamWidth, streetY);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      } catch (e) {}
    }

    // MAIN PARTICLE ENGINE RENDER
    function drawParticleEngineLayers() {
      const isRain = (activeWmoCode >= 51 && activeWmoCode <= 67) || (activeWmoCode >= 80 && activeWmoCode <= 82) || activeWeather === 'rain' || activeWeather === 'thunder';
      const isSnow = (activeWmoCode >= 71 && activeWmoCode <= 77) || activeWmoCode === 85 || activeWmoCode === 86 || activeWeather === 'snow';
      const isAutumn = isAutumnShedActive() && !isSnow;

      // 1. Drifting Rain Droplets (WMO 51-67, 80-82)
      if (isRain) {
        ctx.save();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.30)'; // thin, high-velocity translucent streaks (#ffffff, opacity: 0.3)
        const heroX1 = Math.floor(width * 0.5 - 18);
        const heroX2 = Math.floor(width * 0.5 + 18);
        const isUnderCanopy = (fuelStationState === 'REFUELING' || fuelStationState === 'DOCKING') && (stationX > heroX1 - 32 && stationX < heroX2 + 32);
        const isUnderBridge = (activePhase === 'evening'); // Surat Cable-Stayed Bridge superstructure shields hero vehicle

        for (const d of raindrops) {
          // Weather particle collision block: shield hero vehicle under bridge or station canopy
          if ((isUnderCanopy || isUnderBridge) && (d.x >= heroX1 - 6 && d.x <= heroX2 + 6) && (d.y >= streetY - 14 && d.y <= streetY + 12)) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.40)';
            ctx.fillRect(Math.floor(d.x - 1), Math.floor(d.y), 3, 1);
            d.y = -d.len - Math.random() * 12;
            d.x = Math.random() * (width + 50) - 10;
            continue;
          }

          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x + d.vx * 2.4, d.y + d.len);
          ctx.stroke();

          d.y += d.speed;
          d.x += d.vx;
          if (d.y > height) {
            d.y = -d.len - Math.random() * 12;
            d.x = Math.random() * (width + 50) - 10;
          }
        }

        // Thunderstorm flashes
        if (activeWeather === 'thunder' || activeWmoCode >= 95) {
          if (lightningFrames.length === 0 && Math.random() < 0.012) {
            triggerArcadeLightning();
          }
          if (lightningFrames.length > 0) {
            currentFlashAlpha = lightningFrames.shift();
          } else {
            currentFlashAlpha = 0;
          }

          if (currentFlashAlpha > 0.04) {
            ctx.fillStyle = 'rgba(219, 234, 254, ' + (currentFlashAlpha * 0.85) + ')';
            ctx.fillRect(0, 0, width, height);

            if (currentFlashAlpha > 0.5 && lightningBolt) {
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(lightningBolt[0][0], lightningBolt[0][1]);
              for (let i = 1; i < lightningBolt.length; i++) {
                ctx.lineTo(lightningBolt[i][0], lightningBolt[i][1]);
              }
              ctx.stroke();
            }
          }
        }
        ctx.restore();
      }

      // 2. Cozy Gentle Snowfall (WMO 71-77, 85-86)
      if (isSnow) {
        ctx.save();
        const heroX1 = Math.floor(width * 0.5 - 18);
        const heroX2 = Math.floor(width * 0.5 + 18);
        const isUnderCanopy = (fuelStationState === 'REFUELING' || fuelStationState === 'DOCKING') && (stationX > heroX1 - 32 && stationX < heroX2 + 32);
        const isUnderBridge = (activePhase === 'evening');

        for (const s of snowflakes) {
          // Weather particle collision block: shield hero vehicle under bridge or station canopy
          if ((isUnderCanopy || isUnderBridge) && (s.x >= heroX1 - 6 && s.x <= heroX2 + 6) && (s.y >= streetY - 14 && s.y <= streetY + 12)) {
            s.y = -4;
            s.x = Math.random() * (width + 20) - 10;
            continue;
          }

          s.sway += s.swaySpeed;
          s.x += Math.sin(s.sway) * s.swayRadius;
          s.y += s.speed;

          ctx.fillStyle = 'rgba(255, 255, 255, ' + s.alpha + ')';
          ctx.fillRect(Math.floor(s.x), Math.floor(s.y), s.size, s.size);

          if (s.y > height) {
            s.y = -4;
            s.x = Math.random() * (width + 20) - 10;
          }
        }
        ctx.restore();
      }

      // 3. Retro Autumn Leaf Shed (Localized Tree-Relative Leaf Debris Flows)
      if (isAutumn) {
        ctx.save();
        const canSpawnLeaves = visibleTreeCrowns.length > 0;
        const targetCount = canSpawnLeaves ? Math.max(8, Math.floor(width / 36)) : 0;

        // Spawn leaves exclusively within the foliage boundaries of passing trees
        while (leaves.length < targetCount && canSpawnLeaves) {
          const tree = visibleTreeCrowns[Math.floor(Math.random() * visibleTreeCrowns.length)];
          const col = leafColors[Math.floor(Math.random() * leafColors.length)];
          leaves.push({
            x: tree.x + (Math.random() - 0.5) * tree.radius * 1.5,
            y: tree.y + (Math.random() - 0.5) * tree.radius * 1.2,
            swirlAngle: Math.random() * Math.PI * 2,
            swirlRadius: 3 + Math.random() * 8,
            swirlSpeed: 0.04 + Math.random() * 0.05,
            vy: 0.35 + Math.random() * 0.45,
            size: 3.2 + Math.random() * 2.2,
            rotation: Math.random() * Math.PI * 2,
            rotSpeed: (Math.random() - 0.5) * 0.06,
            flutterPhase: Math.random() * Math.PI * 2,
            color: col.fill,
            stemColor: col.stem,
            onRoad: false
          });
        }

        for (let i = leaves.length - 1; i >= 0; i--) {
          const l = leaves[i];

          // Check if leaf reached road bed
          if (l.y >= streetY) {
            l.onRoad = true;
          }

          if (!l.onRoad) {
            // Swirl dynamically around branches and foliage as they travel
            l.swirlAngle += l.swirlSpeed;
            l.flutterPhase += 0.05;
            l.x += Math.cos(l.swirlAngle) * 0.7 - (currentRoadSpeed * 1.3);
            l.y += l.vy + Math.sin(l.flutterPhase) * 0.35;
            l.rotation += l.rotSpeed;
          } else {
            // Tumble safely onto the road bed only while traveling across
            l.x -= (currentRoadSpeed * 2.8) + 0.5;
            l.y = Math.min(height - 2, l.y + 0.15);
            l.rotation += l.rotSpeed * 1.8;
          }

          ctx.save();
          ctx.translate(Math.floor(l.x), Math.floor(l.y));
          ctx.rotate(l.rotation);

          // Organic oval leaf silhouette
          ctx.fillStyle = l.color;
          ctx.beginPath();
          ctx.ellipse(0, 0, l.size, l.size * 0.52, 0, 0, Math.PI * 2);
          ctx.fill();

          // Delicate vein / stem
          ctx.strokeStyle = l.stemColor;
          ctx.lineWidth = 0.75;
          ctx.beginPath();
          ctx.moveTo(-l.size * 0.85, 0);
          ctx.lineTo(l.size * 0.85, 0);
          ctx.stroke();

          ctx.restore();

          // Respawn or remove (shut off completely when trees absent on bridges/highway sweeps)
          if (l.x < -18 || l.y > height + 8) {
            if (canSpawnLeaves) {
              const tree = visibleTreeCrowns[Math.floor(Math.random() * visibleTreeCrowns.length)];
              l.x = tree.x + (Math.random() - 0.5) * tree.radius * 1.5;
              l.y = tree.y + (Math.random() - 0.5) * tree.radius * 1.2;
              l.onRoad = false;
              l.swirlAngle = Math.random() * Math.PI * 2;
            } else {
              leaves.splice(i, 1);
            }
          }
        }
        ctx.restore();
      }
    }

    // =========================================================================
    // MAIN DRAW SCENE 2D (ORBIT + TIME-LOCKED LANDSCAPES + FULL-BLEED)
    // =========================================================================
    function drawScene2D(t) {
      // 0. Reset visible tree tracking for exact foliage-relative leaf flows
      visibleTreeCrowns.length = 0;

      // 1. SKY GRADIENT
      const skyGrad = ctx.createLinearGradient(0, 0, 0, streetY);
      if (activePhase === 'evening') {
        skyGrad.addColorStop(0.0, '#3b0764');
        skyGrad.addColorStop(0.25, '#701a75');
        skyGrad.addColorStop(0.50, '#be185d');
        skyGrad.addColorStop(0.75, '#ea580c');
        skyGrad.addColorStop(1.0, '#f59e0b');
      } else if (activePhase === 'night') {
        skyGrad.addColorStop(0.0, '#0b0f19');
        skyGrad.addColorStop(0.35, '#16132e');
        skyGrad.addColorStop(0.70, '#251842');
        skyGrad.addColorStop(1.0, '#351d52');
      } else if (activePhase === 'morning') {
        skyGrad.addColorStop(0.0, '#38bdf8');
        skyGrad.addColorStop(0.40, '#7dd3fc');
        skyGrad.addColorStop(0.75, '#bae6fd');
        skyGrad.addColorStop(1.0, '#fed7aa');
      } else {
        skyGrad.addColorStop(0.0, '#0284c7');
        skyGrad.addColorStop(0.35, '#38bdf8');
        skyGrad.addColorStop(0.70, '#7dd3fc');
        skyGrad.addColorStop(1.0, '#e0f2fe');
      }
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, width, streetY);

      // Horizon Atmosphere Haze
      if (activePhase === 'evening') {
        const haze = ctx.createLinearGradient(0, streetY - 36, 0, streetY);
        haze.addColorStop(0, 'rgba(245, 158, 11, 0)');
        haze.addColorStop(1, 'rgba(245, 158, 11, 0.40)');
        ctx.fillStyle = haze;
        ctx.fillRect(0, streetY - 36, width, 36);
      } else if (activePhase === 'morning') {
        const haze = ctx.createLinearGradient(0, streetY - 28, 0, streetY);
        haze.addColorStop(0, 'rgba(254, 215, 170, 0)');
        haze.addColorStop(1, 'rgba(254, 215, 170, 0.30)');
        ctx.fillStyle = haze;
        ctx.fillRect(0, streetY - 28, width, 28);
      }

      // 2. DIAGONAL CELESTIAL ORBIT TRACKER
      const { cx, cy, isDay } = getCelestialOrbitPosition();

      if (!isDay || activePhase === 'night') {
        if (activeWeather !== 'rain') {
          for (const s of stars) {
            const a = 0.35 + Math.sin(t * s.speed + s.phase) * 0.3;
            ctx.fillStyle = 'rgba(255, 255, 255, ' + a + ')';
            ctx.fillRect(Math.floor(s.x), Math.floor(s.y), s.size, s.size);
          }
        }

        const moonR = Math.max(13, Math.min(24, Math.floor(streetY * 0.20)));
        drawDynamicMoon(cx, cy, moonR);
      } else {
        const sunR = Math.max(14, Math.min(26, Math.floor(streetY * 0.22)));
        const sunGlow = ctx.createRadialGradient(cx, cy, sunR * 0.3, cx, cy, sunR * 3.0);
        if (activePhase === 'evening') {
          sunGlow.addColorStop(0, 'rgba(255, 179, 0, 0.75)');
          sunGlow.addColorStop(0.35, 'rgba(233, 30, 99, 0.40)');
          sunGlow.addColorStop(1, 'rgba(112, 26, 117, 0)');
        } else if (activePhase === 'morning') {
          sunGlow.addColorStop(0, 'rgba(250, 204, 21, 0.65)');
          sunGlow.addColorStop(0.45, 'rgba(253, 224, 71, 0.24)');
          sunGlow.addColorStop(1, 'rgba(250, 204, 21, 0)');
        } else {
          sunGlow.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
          sunGlow.addColorStop(0.5, 'rgba(191, 219, 254, 0.30)');
          sunGlow.addColorStop(1, 'rgba(191, 219, 254, 0)');
        }

        ctx.fillStyle = sunGlow;
        ctx.beginPath();
        ctx.arc(cx, cy, sunR * 3.0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = activePhase === 'evening' ? '#ffecb3' : '#ffffff';
        ctx.beginPath();
        ctx.arc(cx, cy, sunR, 0, Math.PI * 2);
        ctx.fill();

        if (activeWeather === 'clear') {
          drawRadiantBeams(cx, cy, false);
        }
      }

      // 3. TIME-LOCKED LANDSCAPE ENVIRONMENTS
      if (activePhase === 'morning') {
        drawMorningGreenHills(t);
      } else if (activePhase === 'afternoon') {
        drawAfternoonMetropolis(t);
      } else if (activePhase === 'evening') {
        drawEveningRiverfrontBridge(t);
      } else {
        drawNightMidnightHighway(t);
      }

      // 4. DYNAMIC REAL-TIME CLOUDS
      drawPixelArtCloudSilhouettes(t);

      // 5. FOREGROUND HIGHWAY & PARALLAX MOTORWAY (FULL-BLEED BEHIND HUD)
      const roadHeight = height - streetY;
      if (activePhase === 'morning') {
        ctx.fillStyle = '#475569'; ctx.fillRect(0, streetY - 3, width, 2);
        ctx.fillStyle = '#334155'; ctx.fillRect(0, streetY - 1, width, 1);
        ctx.fillStyle = '#1e293b'; ctx.fillRect(0, streetY, width, roadHeight);
      } else if (activePhase === 'afternoon') {
        ctx.fillStyle = '#334155'; ctx.fillRect(0, streetY - 3, width, 2);
        ctx.fillStyle = '#1e293b'; ctx.fillRect(0, streetY - 1, width, 1);
        ctx.fillStyle = '#0f172a'; ctx.fillRect(0, streetY, width, roadHeight);
      } else if (activePhase === 'evening') {
        ctx.fillStyle = '#261233'; ctx.fillRect(0, streetY - 3, width, 2);
        ctx.fillStyle = '#1b0a26'; ctx.fillRect(0, streetY - 1, width, 1);
        ctx.fillStyle = '#150921'; ctx.fillRect(0, streetY, width, roadHeight);
      } else {
        ctx.fillStyle = '#221935'; ctx.fillRect(0, streetY - 3, width, 2);
        ctx.fillStyle = '#171224'; ctx.fillRect(0, streetY - 1, width, 1);
        ctx.fillStyle = '#100e1a'; ctx.fillRect(0, streetY, width, roadHeight);
      }

      if (activeWeather === 'rain' || activeWeather === 'thunder') {
        ctx.fillStyle = 'rgba(147, 197, 253, 0.14)';
        ctx.fillRect(0, streetY, width, roadHeight);
      }

      // Sidewalk curb seam lines
      const curbSpacing = 24;
      const curbShift = (roadDistance * 2.8) % curbSpacing;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      for (let cx = -curbSpacing; cx < width + curbSpacing * 2; cx += curbSpacing) {
        ctx.fillRect(Math.floor(cx - curbShift), streetY - 3, 1, 2);
      }

      // Broken Lane Divider dashes
      ctx.fillStyle = activePhase === 'afternoon' ? 'rgba(255, 255, 255, 0.45)' : 'rgba(255, 255, 255, 0.28)';
      const laneMidY = streetY + Math.max(9, Math.floor(roadHeight * 0.45));
      const dashSpacing = 26;
      const dashWidth = 12;
      const roadShift = (roadDistance * 3.4) % dashSpacing;
      for (let rx = -dashSpacing; rx < width + dashSpacing * 2; rx += dashSpacing) {
        ctx.fillRect(Math.floor(rx - roadShift), laneMidY, dashWidth, 1.5);
      }

      // Highway Streetlights
      const lampSpacing = 110;
      const lampShift = (roadDistance * 2.4) % lampSpacing;
      const lightsOn = activePhase === 'night' || activePhase === 'evening' || activeWeather === 'rain' || activeWeather === 'thunder';

      for (let rx = -lampSpacing; rx < width + lampSpacing * 2; rx += lampSpacing) {
        const lx = Math.floor(rx - lampShift);
        const ly = streetY - 3;

        if (lightsOn) {
          const coneGrad = ctx.createLinearGradient(0, ly - 12, 0, ly + 28);
          if (activePhase === 'evening') {
            coneGrad.addColorStop(0, 'rgba(251, 191, 36, 0.35)');
            coneGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
          } else {
            coneGrad.addColorStop(0, 'rgba(254, 240, 138, 0.40)');
            coneGrad.addColorStop(1, 'rgba(250, 204, 21, 0)');
          }
          ctx.fillStyle = coneGrad;
          ctx.beginPath();
          ctx.moveTo(lx, ly - 12);
          ctx.lineTo(lx - 18, ly + 28);
          ctx.lineTo(lx + 18, ly + 28);
          ctx.closePath();
          ctx.fill();
        }

        ctx.fillStyle = activePhase === 'afternoon' ? '#475569' : '#334155';
        ctx.fillRect(lx - 1, ly - 12, 2, 12);
        ctx.fillStyle = '#475569';
        ctx.fillRect(lx - 3, ly - 14, 6, 2);
        ctx.fillStyle = lightsOn ? '#fef9c3' : '#cbd5e1';
        ctx.fillRect(lx - 2, ly - 13, 4, 2);
      }

      // 6. TRAFFIC INTERSECTION STOP LINE & OVERHEAD GANTRY
      drawTrafficLightGantry();

      // 6.5 VIRTUAL FUEL STATION PIT STOP NEON LAYER
      drawFuelStationGantry(t);

      // 7. BACKGROUND TRAFFIC (Far Lane 0: renders behind hero car)
      drawBackgroundTrafficLane(0, t);

      // 8. THE RETRO CRUISER HERO VEHICLE (Permanently Anchored at Center)
      drawRetroCruiserCar(t);

      // 9. BACKGROUND TRAFFIC (Near Lane 1: renders beside/ahead of hero car)
      drawBackgroundTrafficLane(1, t);

      // 10. DYNAMIC CANVAS PARTICLE ENGINE (RAIN STREAKS, SOFT SNOW, TREE-RELATIVE LEAF DEBRIS)
      drawParticleEngineLayers();
    }

    // =========================================================================
    // CORNER SPIDER COMPANION
    // =========================================================================
    const webNodes = [
      { x: 26, y: 14 },
      { x: 40, y: 24 },
      { x: 22, y: 34 },
      { x: 14, y: 18 },
      { x: 32, y: 38 },
      { x: 44, y: 12 }
    ];

    const spider = {
      x: 24,
      y: 24,
      targetX: 24,
      targetY: 24,
      angle: Math.PI * 0.25,
      targetAngle: Math.PI * 0.25,
      state: 'REST',
      stateTimer: 100,
      legPhase: 0,
      swingAngle: 0,
      hangOriginX: 24,
      hangDist: 24,
      targetHangDist: 24,
      frontLegTap: 0,
      blinkTime: 0
    };

    function updateSpiderCompanion() {
      spider.stateTimer--;
      if (spider.blinkTime > 0) spider.blinkTime--;
      else if (Math.random() < 0.015) spider.blinkTime = 8;

      if (spider.state === 'REST') {
        spider.legPhase += 0.03;
        if (spider.stateTimer <= 0) {
          const next = Math.random();
          if (next < 0.40) {
            const node = webNodes[Math.floor(Math.random() * webNodes.length)];
            spider.state = 'CRAWL_WEB';
            spider.targetX = node.x;
            spider.targetY = node.y;
            spider.targetAngle = Math.atan2(node.y - spider.y, node.x - spider.x) + Math.PI / 2;
            spider.stateTimer = 150;
          } else if (next < 0.75) {
            spider.state = 'RAPPEL_DOWN';
            spider.hangOriginX = Math.round(spider.x);
            spider.hangDist = Math.max(12, spider.y);
            spider.targetHangDist = Math.min(Math.floor(streetY * 0.65), 32 + Math.floor(Math.random() * 20));
            spider.targetAngle = Math.PI;
            spider.stateTimer = 110;
          } else {
            spider.state = 'LOOK_AROUND';
            spider.stateTimer = 80 + Math.floor(Math.random() * 50);
          }
        }
      } else if (spider.state === 'CRAWL_WEB') {
        const dx = spider.targetX - spider.x;
        const dy = spider.targetY - spider.y;
        const dist = Math.hypot(dx, dy);

        let diff = spider.targetAngle - spider.angle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        spider.angle += diff * 0.15;

        if (dist > 1.2) {
          spider.x += (dx / dist) * 0.55;
          spider.y += (dy / dist) * 0.55;
          spider.legPhase += 0.25;
        } else {
          spider.x = spider.targetX;
          spider.y = spider.targetY;
          spider.state = 'REST';
          spider.stateTimer = 90 + Math.floor(Math.random() * 70);
        }
        if (spider.stateTimer <= 0) {
          spider.state = 'REST';
          spider.stateTimer = 90;
        }
      } else if (spider.state === 'RAPPEL_DOWN') {
        spider.angle += (spider.targetAngle - spider.angle) * 0.15;
        spider.legPhase += 0.08;
        spider.hangDist += (spider.targetHangDist - spider.hangDist) * 0.06;
        spider.x = spider.hangOriginX + Math.sin(t * 0.06) * 1.5;
        spider.y = spider.hangDist;

        if (Math.abs(spider.targetHangDist - spider.hangDist) < 1.5 || spider.stateTimer <= 0) {
          spider.state = 'SWING';
          spider.stateTimer = 140 + Math.floor(Math.random() * 70);
        }
      } else if (spider.state === 'SWING') {
        spider.swingAngle = Math.sin(t * 0.055) * 0.38;
        spider.x = spider.hangOriginX + Math.sin(spider.swingAngle) * spider.hangDist;
        spider.y = Math.cos(spider.swingAngle) * spider.hangDist;
        spider.angle = Math.PI + spider.swingAngle * 0.75;
        spider.legPhase += 0.06;

        if (spider.stateTimer <= 0) {
          spider.state = 'CLIMB_UP';
          spider.targetAngle = 0;
          spider.stateTimer = 130;
        }
      } else if (spider.state === 'CLIMB_UP') {
        spider.angle += (spider.targetAngle - spider.angle) * 0.2;
        spider.hangDist -= 0.8;
        spider.x = spider.hangOriginX + Math.sin(t * 0.1) * 1.0;
        spider.y = spider.hangDist;
        spider.legPhase += 0.35;

        if (spider.hangDist <= 20 || spider.stateTimer <= 0) {
          spider.x = spider.hangOriginX;
          spider.y = 20;
          spider.angle = Math.PI * 0.25;
          spider.state = 'REST';
          spider.stateTimer = 110;
        }
      } else if (spider.state === 'LOOK_AROUND') {
        spider.frontLegTap = Math.abs(Math.sin(t * 0.22)) * 2.2;
        spider.legPhase += 0.04;
        if (spider.stateTimer <= 0) {
          spider.state = 'REST';
          spider.stateTimer = 70 + Math.floor(Math.random() * 50);
        }
      }
    }

    function drawCornerSpiderCompanion(t) {
      updateSpiderCompanion();
      ctx.save();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.30)';
      ctx.lineWidth = 1;
      const radials = [[44, 0], [38, 14], [28, 28], [14, 38], [0, 44]];
      for (const r of radials) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(r[0], r[1]);
        ctx.stroke();
      }
      const rings = [0.35, 0.65, 0.95];
      for (const f of rings) {
        ctx.beginPath();
        ctx.moveTo(radials[0][0] * f, radials[0][1] * f);
        for (let i = 1; i < radials.length; i++) {
          ctx.lineTo(radials[i][0] * f, radials[i][1] * f);
        }
        ctx.stroke();
      }

      if (spider.state === 'RAPPEL_DOWN' || spider.state === 'SWING' || spider.state === 'CLIMB_UP') {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.70)';
        ctx.beginPath();
        ctx.moveTo(spider.hangOriginX, 0);
        ctx.lineTo(spider.x, spider.y);
        ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.beginPath();
        ctx.moveTo(20, 0);
        ctx.lineTo(spider.x, spider.y);
        ctx.stroke();
      }

      ctx.translate(Math.round(spider.x), Math.round(spider.y));
      ctx.rotate(spider.angle);

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-3, -2, 6, 5);
      ctx.fillStyle = '#e05a5a';
      ctx.fillRect(-1, -1, 2, 3);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(-2, 0, 4, 1);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-2, 3, 4, 3);

      if (spider.blinkTime === 0) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-2, 4, 1.5, 1.5);
        ctx.fillRect(0.5, 4, 1.5, 1.5);
      } else {
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(-2, 5, 1.5, 1);
        ctx.fillRect(0.5, 5, 1.5, 1);
      }

      const p = spider.legPhase;
      const leg1L = Math.sin(p) * 2;
      const leg2L = Math.sin(p + Math.PI * 0.5) * 2;
      const leg3L = Math.sin(p + Math.PI) * 2;
      const leg4L = Math.sin(p + Math.PI * 1.5) * 2;
      const leg1R = Math.sin(p + Math.PI) * 2;
      const leg2R = Math.sin(p + Math.PI * 1.5) * 2;
      const leg3R = Math.sin(p) * 2;
      const leg4R = Math.sin(p + Math.PI * 0.5) * 2;
      const tap = (spider.state === 'LOOK_AROUND') ? spider.frontLegTap : 0;

      ctx.fillStyle = '#1e293b';
      ctx.fillRect(-5, 4 + leg1L + tap, 2, 1); ctx.fillRect(-6, 3 + leg1L + tap, 1, 2);
      ctx.fillRect(-6, 2 + leg2L, 3, 1); ctx.fillRect(-7, 1 + leg2L, 1, 2);
      ctx.fillRect(-6, 0 + leg3L, 3, 1); ctx.fillRect(-7, -1 + leg3L, 1, 2);
      ctx.fillRect(-5, -2 + leg4L, 2, 1); ctx.fillRect(-6, -4 + leg4L, 1, 2);

      ctx.fillRect(3, 4 + leg1R + tap, 2, 1); ctx.fillRect(5, 3 + leg1R + tap, 1, 2);
      ctx.fillRect(3, 2 + leg2R, 3, 1); ctx.fillRect(6, 1 + leg2R, 1, 2);
      ctx.fillRect(3, 0 + leg3R, 3, 1); ctx.fillRect(6, -1 + leg3R, 1, 2);
      ctx.fillRect(3, -2 + leg4R, 2, 1); ctx.fillRect(5, -4 + leg4R, 1, 2);

      ctx.restore();
    }

    // =========================================================================
    // RETRO LO-FI MUSIC CONTROLLER ENGINE (HTML5 AUDIO & CHILL STREAMS)
    // =========================================================================
    const TRACK_PLAYLIST = [
      {
        title: "♪ Track 1: Lo-Fi Chill Beats • Mountain Horizon",
        url: "https://stream.zeno.fm/f3wvbbqmdg8uv"
      },
      {
        title: "♪ Rain Beats • Midnight Coding Session",
        url: "https://play.streamafrica.net/lofiradio"
      },
      {
        title: "♪ Track 3: Retro Chillhop Café • Spider Arcade",
        url: "https://streams.ilovemusic.de/iloveradio17.mp3"
      },
      {
        title: "♪ Track 4: Ambient Synthwave • Zero-Gravity Sunset",
        url: "https://ice1.somafm.com/groovesalad-128-mp3"
      },
      {
        title: "♪ Track 5: Cyberpunk Focus • Late Night Terminal",
        url: "https://ice2.somafm.com/defcon-128-mp3"
      }
    ];

    let currentTrackIdx = 0;
    let isPlaying = false;
    let synthAudioCtx = null;
    let synthTimer = null;
    let isSynthActive = false;

    function startProceduralLofiSynth() {
      try {
        if (!synthAudioCtx) {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          if (AudioContext) synthAudioCtx = new AudioContext();
        }
        if (!synthAudioCtx) return;
        if (synthAudioCtx.state === 'suspended') {
          synthAudioCtx.resume();
        }

        isSynthActive = true;
        const chords = [
          [261.63, 329.63, 392.00, 523.25], // Cmaj7
          [220.00, 261.63, 329.63, 440.00], // Am7
          [174.61, 220.00, 261.63, 349.23], // Fmaj7
          [196.00, 246.94, 293.66, 392.00]  // G7
        ];
        let chordStep = 0;

        function playNextChord() {
          if (!isSynthActive || !synthAudioCtx) return;
          try {
            const chord = chords[chordStep % chords.length];
            chordStep++;
            const now = synthAudioCtx.currentTime;
            const dur = 4.2;

            chord.forEach((freq, i) => {
              const osc = synthAudioCtx.createOscillator();
              const gain = synthAudioCtx.createGain();
              const filter = synthAudioCtx.createBiquadFilter();

              osc.type = i % 2 === 0 ? 'sine' : 'triangle';
              osc.frequency.setValueAtTime(freq, now);

              filter.type = 'lowpass';
              filter.frequency.setValueAtTime(550, now);
              filter.frequency.exponentialRampToValueAtTime(280, now + dur);

              const baseVol = (parseFloat(volSlider.value) || 0.7) * 0.05;
              gain.gain.setValueAtTime(0.0001, now);
              gain.gain.exponentialRampToValueAtTime(baseVol, now + 0.8);
              gain.gain.exponentialRampToValueAtTime(0.0001, now + dur - 0.1);

              osc.connect(filter);
              filter.connect(gain);
              gain.connect(synthAudioCtx.destination);

              osc.start(now);
              osc.stop(now + dur);
            });
          } catch (e) {}

          synthTimer = setTimeout(playNextChord, 3800);
        }
        playNextChord();
      } catch (e) {}
    }

    function stopProceduralLofiSynth() {
      isSynthActive = false;
      if (synthTimer) {
        clearTimeout(synthTimer);
        synthTimer = null;
      }
    }

    function loadAndPlayTrack(idx) {
      currentTrackIdx = (idx + TRACK_PLAYLIST.length) % TRACK_PLAYLIST.length;
      const track = TRACK_PLAYLIST[currentTrackIdx];
      trackTitleText.textContent = track.title;
      stopProceduralLofiSynth();

      lofiAudio.src = track.url;
      lofiAudio.volume = parseFloat(volSlider.value) || 0.7;
      const playPromise = lofiAudio.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          isPlaying = true;
          btnPlay.textContent = '⏸';
          btnPlay.classList.add('is-playing');
        }).catch(() => {
          startProceduralLofiSynth();
          isPlaying = true;
          btnPlay.textContent = '⏸';
          btnPlay.classList.add('is-playing');
        });
      }
    }

    lofiAudio.addEventListener('error', () => {
      if (isPlaying) {
        startProceduralLofiSynth();
      }
    });

    btnPlay.addEventListener('click', () => {
      if (isPlaying) {
        lofiAudio.pause();
        stopProceduralLofiSynth();
        isPlaying = false;
        btnPlay.textContent = '▶';
        btnPlay.classList.remove('is-playing');
      } else {
        if (!lofiAudio.src) {
          loadAndPlayTrack(currentTrackIdx);
        } else {
          const p = lofiAudio.play();
          if (p !== undefined) {
            p.then(() => {
              isPlaying = true;
              btnPlay.textContent = '⏸';
              btnPlay.classList.add('is-playing');
            }).catch(() => {
              startProceduralLofiSynth();
              isPlaying = true;
              btnPlay.textContent = '⏸';
              btnPlay.classList.add('is-playing');
            });
          }
        }
      }
    });

    btnPrev.addEventListener('click', () => {
      loadAndPlayTrack(currentTrackIdx - 1);
    });

    btnNext.addEventListener('click', () => {
      loadAndPlayTrack(currentTrackIdx + 1);
    });

    volSlider.addEventListener('input', () => {
      const vol = parseFloat(volSlider.value) || 0;
      lofiAudio.volume = vol;
      volIcon.textContent = vol === 0 ? '🔇' : (vol < 0.5 ? '🔉' : '🔊');
    });

    volIcon.addEventListener('click', () => {
      if (lofiAudio.volume > 0) {
        lofiAudio.volume = 0;
        volSlider.value = 0;
        volIcon.textContent = '🔇';
      } else {
        lofiAudio.volume = 0.7;
        volSlider.value = 0.7;
        volIcon.textContent = '🔊';
      }
    });

    // =========================================================================
    // FULL-BLEED CANVAS SIZING ENGINE & DYNAMIC RESIZE REPAINT OBSERVER
    // =========================================================================
    function syncCanvasSize() {
      try {
        const clientW = canvas.clientWidth || window.innerWidth || 400;
        const clientH = canvas.clientHeight || window.innerHeight || 200;
        const targetW = Math.max(120, Math.floor(clientW));
        const targetH = Math.max(50, Math.floor(clientH));

        if (canvas.width !== targetW || canvas.height !== targetH || width !== targetW || height !== targetH) {
          canvas.width = width = targetW;
          canvas.height = height = targetH;
          streetY = Math.max(35, Math.floor(height * 0.74));
          initStars();
          initRain();
          initSnow();
          initLeaves();
          injectCloudLayer(activeWmoCode);
        }
      } catch (e) {}
    }

    // Force canvas resolution alignment & dynamic repainting
    window.addEventListener("resize", () => {
      syncCanvasSize();
    });

    if (typeof ResizeObserver !== 'undefined') {
      const canvasObserver = new ResizeObserver(() => {
        syncCanvasSize();
      });
      canvasObserver.observe(canvas);
      if (canvas.parentElement) {
        canvasObserver.observe(canvas.parentElement);
      }
    }
    syncCanvasSize();
    initStars();
    initRain();
    initSnow();
    initLeaves();

    // =========================================================================
    // MAIN RENDERING LOOP (WRAPPED IN ZERO-CRASH TRY/CATCH)
    // =========================================================================
    let t = 0;
    function loop() {
      t++;
      try {
        syncCanvasSize();

        // 1. Advance Traffic Signal Cycle, Fuel Station Pit Stop & Collision Physics
        updateTrafficSignalCycle();
        updateFuelStationCycle(t);
        updateTrafficSpawner();
        updateTrafficSimulation();

        ctx.clearRect(0, 0, width, height);

        // 2. Time-Locked Celestial Orbit + Landscapes + Highway + Traffic + Particles
        drawScene2D(t);

        // 3. Spider Companion
        drawCornerSpiderCompanion(t);
      } catch (err) {
        try {
          ctx.fillStyle = '#1b152b';
          ctx.fillRect(0, 0, width, height);
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(0, streetY, width, Math.max(20, height - streetY));
        } catch (e2) {}
      }

      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  </script>
</body>
</html>`;
  }
}

module.exports = { SpiderCompanionViewProvider };
