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
  if (code <= 3) return { weatherType: 'clear', desc: 'Sunny' };
  if (code === 45 || code === 48) return { weatherType: 'cloudy', desc: 'Fog' };
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return { weatherType: 'rain', desc: 'Rain' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { weatherType: 'snow', desc: 'Snow' };
  if (code >= 95) return { weatherType: 'thunder', desc: 'Thunderstorm' };
  return { weatherType: 'clear', desc: 'Sunny' };
}

async function fetchLiveWeather() {
  try {
    const geo = await fetchJson('https://ipapi.co/json/', { 'User-Agent': 'curl/8.0' }, 4000);
    if (geo && typeof geo.latitude === 'number' && typeof geo.longitude === 'number') {
      const lat = geo.latitude.toFixed(2);
      const lon = geo.longitude.toFixed(2);
      const city = geo.city || geo.region || 'Local';

      const meteo = await fetchJson(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&temperature_unit=celsius`,
        { 'User-Agent': 'AntigravitySpiderCompanion/1.0' },
        4500
      );

      if (meteo && meteo.current && typeof meteo.current.temperature_2m === 'number') {
        const cur = meteo.current;
        const tempC = Math.round(cur.temperature_2m);
        const tempF = Math.round(cur.temperature_2m * 9 / 5 + 32);
        const { weatherType, desc } = parseWmoWeatherCode(cur.weather_code);

        return {
          city,
          tempC: String(tempC),
          tempF: String(tempF),
          desc,
          weatherType
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

      let weatherType = 'clear';
      if (descLower.includes('thunder') || descLower.includes('storm')) {
        weatherType = 'thunder';
      } else if (descLower.includes('rain') || descLower.includes('drizzle') || descLower.includes('shower')) {
        weatherType = 'rain';
      } else if (descLower.includes('snow') || descLower.includes('blizzard') || descLower.includes('ice') || descLower.includes('sleet')) {
        weatherType = 'snow';
      } else if (descLower.includes('overcast') || descLower.includes('fog') || descLower.includes('dense cloud')) {
        weatherType = 'cloudy';
      } else {
        weatherType = 'clear';
      }

      return {
        city,
        tempC,
        tempF,
        desc,
        weatherType
      };
    }
  } catch (e) {
    return null;
  }

  return null;
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

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
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
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      position: relative;
      background: #16191f;
    }

    /* TOP HALF: HORIZON DRIVING CANVAS CONTAINER (ATMOSPHERIC TWILIGHT FALLBACK) */
    #horizonContainer {
      position: relative;
      flex: 1;
      min-height: 60px;
      width: 100%;
      overflow: hidden;
      background: #1b152b;
    }
    #ambientCanvas {
      display: block;
      width: 100%;
      height: 100%;
    }

    /* BOTTOM HALF: CLEAN TWO-ROW RETRO FOOTER BAR */
    #lofiDeck {
      height: 84px;
      min-height: 84px;
      max-height: 84px;
      width: 100%;
      background: #11141c;
      border-top: 1px solid rgba(224, 90, 90, 0.35);
      box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.7);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 6px 10px;
      position: relative;
      z-index: 30;
      flex-shrink: 0;
      overflow: hidden;
    }

    /* ROW 1: CENTERED MEDIA DECK (Ticker above, Controls below) */
    #footerRow1 {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 100%;
      gap: 3px;
    }

    /* Slowly Scrolling Song Title Ticker */
    .song-ticker-box {
      width: 100%;
      max-width: 290px;
      height: 16px;
      overflow: hidden;
      background: rgba(0, 0, 0, 0.65);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 4px;
      display: flex;
      align-items: center;
      padding: 0 4px;
      position: relative;
    }
    .song-ticker-text {
      white-space: nowrap;
      display: inline-block;
      font-size: 10px;
      color: #93c5fd;
      font-weight: 600;
      animation: tickerAnim 18s linear infinite;
    }
    @keyframes tickerAnim {
      0% { transform: translateX(100%); }
      100% { transform: translateX(-100%); }
    }

    /* Media Controls: Center the media deck perfectly */
    .transport-deck {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    .retro-btn {
      background: #1e222d;
      color: #f8fafc;
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 4px;
      padding: 0 8px;
      font-size: 11px;
      font-family: inherit;
      cursor: pointer;
      transition: all 0.15s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 22px;
      outline: none;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
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
      width: 32px;
    }
    .play-btn:hover {
      background: #ef4444;
    }
    .play-btn.is-playing {
      background: #ef4444;
      box-shadow: 0 0 10px rgba(239, 68, 68, 0.7);
    }

    .vol-control {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      margin-left: 4px;
    }
    .vol-icon {
      font-size: 10px;
      color: #94a3b8;
      cursor: pointer;
      user-select: none;
    }
    #volSlider {
      width: 42px;
      height: 3px;
      appearance: none;
      -webkit-appearance: none;
      background: rgba(255, 255, 255, 0.22);
      border-radius: 2px;
      outline: none;
      cursor: pointer;
    }
    #volSlider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #e05a5a;
      box-shadow: 0 0 4px #e05a5a;
      cursor: pointer;
    }

    /* ROW 2: BOTTOM CORNERS (Weather firmly left, Clock firmly right) */
    #footerRow2 {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      padding: 0 2px;
    }

    /* Anchor Bottom-Left: Live Weather Badge */
    #hudWeather {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 7px;
      border-radius: 9999px;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.16);
      font-size: 10px;
      font-weight: 700;
      color: #f8fafc;
      cursor: pointer;
      white-space: nowrap;
      flex-shrink: 0;
      transition: all 0.2s ease;
    }
    #hudWeather:hover {
      background: rgba(224, 90, 90, 0.25);
      border-color: #e05a5a;
      transform: scale(1.02);
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
    }
    #locTemp {
      color: #93c5fd;
      font-weight: 700;
    }

    /* Anchor Bottom-Right: System Clock Ticker */
    #hudClock {
      display: inline-flex;
      align-items: center;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.16);
      color: #cbd5e1;
      font-size: 10px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      flex-shrink: 0;
    }

    @media (max-width: 320px) {
      .vol-control { display: none; }
      .song-ticker-box { max-width: 180px; }
    }
  </style>
</head>
<body>
  <div id="appRoot">
    <!-- TOP HALF: HORIZON PARALLAX HIGHWAY CANVAS -->
    <div id="horizonContainer">
      <canvas id="ambientCanvas"></canvas>
    </div>

    <!-- BOTTOM HALF: TWO-ROW FOOTER HUD -->
    <div id="lofiDeck">
      <!-- ROW 1: CENTERED MEDIA DECK (Ticker above, Controls below) -->
      <div id="footerRow1">
        <div class="song-ticker-box" title="Lo-Fi Ambient Stream">
          <div class="song-ticker-text" id="trackTitleText">
            ♪ Track 1: Lo-Fi Chill Beats • Mountain Horizon Coding Session
          </div>
        </div>

        <div class="transport-deck">
          <button id="btnPrev" class="retro-btn" title="Previous Track">⏮</button>
          <button id="btnPlay" class="retro-btn play-btn" title="Play / Pause Lo-Fi Music">▶</button>
          <button id="btnNext" class="retro-btn" title="Next Track">⏭</button>
          <div class="vol-control" title="Volume">
            <span class="vol-icon" id="volIcon">🔊</span>
            <input type="range" id="volSlider" min="0" max="1" step="0.05" value="0.7">
          </div>
        </div>
      </div>

      <!-- ROW 2: BOTTOM CORNERS (Weather firmly left, Clock firmly right) -->
      <div id="footerRow2">
        <!-- Anchor Bottom-Left: Live Weather -->
        <div id="hudWeather" title="Live Local Weather • Click to cycle test preview">
          <span class="weather-live-dot"></span>
          <span id="locCity">SURAT</span>
          <span id="locEmoji">☀️</span>
          <span id="locTemp">32°C</span>
        </div>

        <!-- Anchor Bottom-Right: System Clock -->
        <div id="hudClock">12:00:00 PM</div>
      </div>
    </div>
  </div>

  <!-- HTML5 AUDIO ENGINE -->
  <audio id="lofiAudio" preload="none"></audio>

  <script>
    const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
    const horizonContainer = document.getElementById('horizonContainer');
    const canvas = document.getElementById('ambientCanvas');
    const ctx = canvas.getContext('2d');

    const hudWeather = document.getElementById('hudWeather');
    const locCity = document.getElementById('locCity');
    const locTemp = document.getElementById('locTemp');
    const locEmoji = document.getElementById('locEmoji');
    const hudClock = document.getElementById('hudClock');

    const btnPlay = document.getElementById('btnPlay');
    const btnPrev = document.getElementById('btnPrev');
    const btnNext = document.getElementById('btnNext');
    const trackTitleText = document.getElementById('trackTitleText');
    const volSlider = document.getElementById('volSlider');
    const volIcon = document.getElementById('volIcon');
    const lofiAudio = document.getElementById('lofiAudio');

    let width = 400;
    let height = 150;
    let streetY = 110;
    let liveWeather = { city: 'Surat', tempC: '32', desc: 'Sunny', weatherType: 'clear' };

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

    // --- SYSTEM CLOCK TICKER ---
    function updateClockTicker() {
      const now = new Date();
      let h = now.getHours();
      const m = String(now.getMinutes()).padStart(2, '0');
      const s = String(now.getSeconds()).padStart(2, '0');
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12;
      h = h ? h : 12;
      hudClock.textContent = h + ':' + m + ':' + s + ' ' + ampm;
    }
    updateClockTicker();
    setInterval(updateClockTicker, 1000);

    // --- WEATHER HUD SYNC ---
    function updateWeatherHud() {
      let icon = '☀️';
      if (activeWeather === 'rain') icon = '🌧️';
      else if (activeWeather === 'thunder') icon = '⛈️';
      else if (activeWeather === 'snow') icon = '❄️';
      else if (activeWeather === 'cloudy') icon = '☁️';
      else if (activePhase === 'night') icon = '🌙';

      const city = (liveWeather && liveWeather.city) ? liveWeather.city.toUpperCase() : 'SURAT';
      const temp = (liveWeather && liveWeather.tempC) ? liveWeather.tempC + '°C' : '32°C';
      locCity.textContent = city;
      locTemp.textContent = temp;
      locEmoji.textContent = icon;
    }
    updateWeatherHud();

    // Interactive Preview Cycle on Clicking Weather HUD
    const previewStates = [
      { phase: 'evening', weather: 'clear' },
      { phase: 'night', weather: 'clear' },
      { phase: 'morning', weather: 'clear' },
      { phase: 'afternoon', weather: 'clear' },
      { phase: 'evening', weather: 'rain' },
      { phase: 'night', weather: 'thunder' },
      { phase: 'afternoon', weather: 'cloudy' },
      { phase: 'night', weather: 'snow' }
    ];
    let previewIndex = 0;

    hudWeather.addEventListener('click', () => {
      manualOverride = true;
      previewIndex = (previewIndex + 1) % previewStates.length;
      activePhase = previewStates[previewIndex].phase;
      activeWeather = previewStates[previewIndex].weather;
      updateWeatherHud();
    });

    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg && msg.command === 'weatherUpdate' && msg.data) {
        liveWeather = msg.data;
        if (!manualOverride && liveWeather.weatherType) {
          activeWeather = liveWeather.weatherType;
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
        updateWeatherHud();
      }
    }, 60000);

    // =========================================================================
    // RETRO LO-FI MUSIC CONTROLLER ENGINE (HTML5 AUDIO & CHILL STREAMS)
    // =========================================================================
    const TRACK_PLAYLIST = [
      {
        title: "♪ Track 1: Lo-Fi Chill Beats • Mountain Horizon Cruise",
        url: "https://stream.zeno.fm/f3wvbbqmdg8uv"
      },
      {
        title: "♪ Track 2: Midnight Coding Session • Surat Rain Beats",
        url: "https://play.streamafrica.net/lofiradio"
      },
      {
        title: "♪ Track 3: Retro Chillhop Café • Spider-Man Arcade",
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

    // Zero-Failure Procedural Ambient Lo-Fi Synth (Only starts on user click fallback)
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
    // ROBUST CANVAS SIZING ENGINE (ZERO BLACK SCREEN BUG)
    // =========================================================================
    function syncCanvasSize() {
      try {
        const rect = horizonContainer.getBoundingClientRect();
        const rw = rect && rect.width ? Math.floor(rect.width) : 0;
        const rh = rect && rect.height ? Math.floor(rect.height) : 0;
        const targetW = Math.max(120, rw || window.innerWidth || 400);
        const targetH = Math.max(50, rh || (window.innerHeight - 84) || 120);

        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = width = targetW;
          canvas.height = height = targetH;
          streetY = Math.max(35, Math.floor(height * 0.72));
          initStars();
          initRain();
          initSnow();
        }
      } catch (e) {}
    }
    window.addEventListener('resize', syncCanvasSize);
    syncCanvasSize();

    // Rain particles
    const raindrops = [];
    function initRain() {
      raindrops.length = 0;
      const count = Math.max(20, Math.floor(width / 16));
      for (let i = 0; i < count; i++) {
        raindrops.push({
          x: Math.random() * (width + 40) - 20,
          y: Math.random() * height,
          speed: 5.5 + Math.random() * 3.5,
          len: 8 + Math.random() * 6,
          alpha: 0.35 + Math.random() * 0.35
        });
      }
    }

    // Snow particles
    const snowflakes = [];
    function initSnow() {
      snowflakes.length = 0;
      const count = Math.max(18, Math.floor(width / 20));
      for (let i = 0; i < count; i++) {
        snowflakes.push({
          x: Math.random() * (width + 20) - 10,
          y: Math.random() * height,
          speed: 0.5 + Math.random() * 0.6,
          size: Math.random() > 0.7 ? 2 : 1,
          sway: Math.random() * Math.PI * 2
        });
      }
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

    // =========================================================================
    // PERMANENT DEFAULT BACKGROUND: GORGEOUS 2D PURPLE MOUNTAIN PARALLAX HIGHWAY
    // =========================================================================
    function drawDistantPurpleMountains(t) {
      try {
        const mountainW = Math.max(width, 680);
        const mountainShift = (t * 0.18) % mountainW;

        // Jagged Mountain Peak Height Profiles (Normalized relative to streetY)
        const peaks = [
          { x: 0.00, h: 0.42 },
          { x: 0.10, h: 0.68 },
          { x: 0.22, h: 0.38 },
          { x: 0.36, h: 0.88 }, // Dramatic high peak
          { x: 0.48, h: 0.52 },
          { x: 0.62, h: 0.74 },
          { x: 0.75, h: 0.44 },
          { x: 0.88, h: 0.70 },
          { x: 1.00, h: 0.42 }
        ];

        // Atmospheric Violet / Purple Palette (Crisp mountain styling)
        let mtnColorDark = '#2e1065';
        let mtnColorLight = '#581c87';
        let ridgeHighlight = 'rgba(233, 213, 255, 0.40)';

        if (activePhase === 'evening') {
          mtnColorDark = '#3b0764';
          mtnColorLight = '#701a75';
          ridgeHighlight = 'rgba(251, 191, 36, 0.45)';
        } else if (activePhase === 'morning') {
          mtnColorDark = '#1e1b4b';
          mtnColorLight = '#3730a3';
          ridgeHighlight = 'rgba(254, 215, 170, 0.45)';
        } else if (activePhase === 'afternoon') {
          mtnColorDark = '#1e293b';
          mtnColorLight = '#334155';
          ridgeHighlight = 'rgba(186, 230, 253, 0.35)';
        }

        ctx.save();
        for (const offset of [0, mountainW]) {
          // Draw Mountain Silhouette Body
          ctx.fillStyle = mtnColorDark;
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

          // Draw Lit Facets on Mountain Ridges (Sun/Moon facing ridge)
          ctx.fillStyle = mtnColorLight;
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

          // Ridge Edge Highlights
          ctx.strokeStyle = ridgeHighlight;
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
        ctx.restore();

        // Midground Foothills & Tree Line (Parallax Layer 2)
        const hillW = Math.max(width, 540);
        const hillShift = (t * 0.45) % hillW;
        const hillColor = (activePhase === 'evening') ? '#1e0836' : ((activePhase === 'night') ? '#120d24' : '#141c2e');

        ctx.save();
        ctx.fillStyle = hillColor;
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

          // Stylized Pine Trees along hill ridge
          for (let tx = 15; tx < hillW; tx += 45) {
            const treeX = Math.floor(tx - hillShift + offset);
            const treeY = streetY - 12;
            ctx.fillRect(treeX, treeY - 7, 3, 7);
            ctx.fillRect(treeX - 2, treeY - 5, 7, 3);
          }
        }
        ctx.restore();
      } catch (e) {}
    }

    // =========================================================================
    // SURAT LOCAL LANDMARKS (OVERLAY ONLY IF DETECTED)
    // =========================================================================
    function drawSuratLandmarksOverlay(t) {
      try {
        const city = (liveWeather && liveWeather.city) ? liveWeather.city.toLowerCase() : '';
        const isSurat = city.includes('surat') || city.includes('gujarat') || city.includes('india');
        if (!isSurat) return;

        // Overlay Surat's Cable-Stayed Bridge Silhouette
        const bridgeW = Math.max(width, 700);
        const bridgeShift = (t * 0.32) % bridgeW;

        for (const offset of [0, bridgeW]) {
          const bx = Math.floor(width * 0.60) - bridgeShift + offset;
          if (bx > -160 && bx < width + 160) {
            ctx.save();
            const pylonTop = streetY - 48;
            const pylonBase = streetY - 2;

            // Inverted Diamond / A-Frame Central Pylon Legs
            ctx.fillStyle = activePhase === 'night' ? '#0b0e1a' : '#141c2e';
            ctx.beginPath();
            ctx.moveTo(bx - 2, pylonTop);
            ctx.lineTo(bx + 4, pylonTop);
            ctx.lineTo(bx - 10, pylonBase);
            ctx.lineTo(bx - 14, pylonBase);
            ctx.closePath();
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(bx + 2, pylonTop);
            ctx.lineTo(bx + 6, pylonTop);
            ctx.lineTo(bx + 14, pylonBase);
            ctx.lineTo(bx + 10, pylonBase);
            ctx.closePath();
            ctx.fill();

            // Pylon Beacon
            ctx.fillStyle = '#ef4444';
            ctx.fillRect(bx + 1, pylonTop - 5, 2, 2);

            // Radiating Stay Cables
            ctx.strokeStyle = (activePhase === 'evening' || activePhase === 'night') ? 'rgba(254, 240, 138, 0.40)' : 'rgba(255, 255, 255, 0.35)';
            ctx.lineWidth = 1;
            const cableDeltas = [-80, -60, -42, -26, -12, 12, 26, 42, 60, 80];
            for (let i = 0; i < cableDeltas.length; i++) {
              ctx.beginPath();
              ctx.moveTo(bx + 2, pylonTop + 6 + (Math.abs(cableDeltas[i]) * 0.16));
              ctx.lineTo(bx + cableDeltas[i], streetY - 2);
              ctx.stroke();
            }

            // Bridge Deck Amber Highway Lamps
            ctx.fillStyle = '#fef08a';
            for (let lx = bx - 75; lx <= bx + 75; lx += 18) {
              ctx.fillRect(lx, streetY - 4, 2, 2);
            }
            ctx.restore();
          }
        }

        // Roadside Palm Tree Silhouettes
        const palmSpacing = 180;
        const palmShift = (t * 0.45) % palmSpacing;
        for (let px = -palmSpacing; px < width + palmSpacing * 2; px += palmSpacing) {
          const posX = Math.floor(px - palmShift);
          const posY = streetY - 2;

          ctx.save();
          ctx.fillStyle = activePhase === 'night' ? '#0b0e1a' : '#141c2e';

          // Curved trunk
          ctx.beginPath();
          ctx.moveTo(posX, posY);
          ctx.quadraticCurveTo(posX + 4, posY - 8, posX + 2, posY - 18);
          ctx.lineTo(posX + 4, posY - 18);
          ctx.quadraticCurveTo(posX + 6, posY - 8, posX + 2, posY);
          ctx.closePath();
          ctx.fill();

          // Fronds
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = ctx.fillStyle;
          const crownX = posX + 3;
          const crownY = posY - 18;
          const fronds = [[-10, -3], [-8, -7], [-1, -8], [7, -7], [10, -2]];
          for (const [fx, fy] of fronds) {
            ctx.beginPath();
            ctx.moveTo(crownX, crownY);
            ctx.quadraticCurveTo(crownX + fx * 0.5, crownY + fy - 2, crownX + fx, crownY + fy);
            ctx.stroke();
          }
          ctx.restore();
        }
      } catch (e) {}
    }

    // =========================================================================
    // THE RETRO CRUISER SPORTS COUPE WITH VOLUMETRIC HEADLIGHTS
    // =========================================================================
    function drawRetroCruiserCar(t) {
      try {
        const carX = Math.floor(Math.max(40, width * 0.28));
        const carBob = Math.sin(t * 0.22) * 0.6;
        const roadHeight = height - streetY;
        const carY = streetY + Math.max(7, Math.floor(roadHeight * 0.28)) + carBob;
        const cw = 32;

        ctx.save();
        ctx.translate(carX, Math.round(carY));

        const lightsOn = activePhase === 'night' || activePhase === 'evening' || activeWeather === 'rain' || activeWeather === 'thunder';

        // 1. Volumetric Headlight Cone Shining Forward Onto Road Ahead
        if (lightsOn) {
          const beamGrad = ctx.createLinearGradient(cw - 2, 0, cw + 36, 0);
          beamGrad.addColorStop(0, 'rgba(254, 240, 138, 0.65)');
          beamGrad.addColorStop(0.4, 'rgba(254, 240, 138, 0.25)');
          beamGrad.addColorStop(1, 'rgba(254, 240, 138, 0)');

          ctx.fillStyle = beamGrad;
          ctx.beginPath();
          ctx.moveTo(cw - 1, 3);
          ctx.lineTo(cw + 36, -2);
          ctx.lineTo(cw + 36, 11);
          ctx.lineTo(cw - 1, 6);
          ctx.closePath();
          ctx.fill();
        }

        // 2. Chassis Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(-2, 9, cw + 4, 3);

        // Lower Bumper & Undercarriage
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 5, cw, 4);

        // Crimson Coupe Body (Midnight Spider)
        ctx.fillStyle = '#991b1b';
        ctx.fillRect(2, 3, cw - 4, 4);
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(4, 2, cw - 12, 2);

        // Aerodynamic Cockpit Glass Canopy
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(8, -1, 14, 4);
        ctx.fillStyle = activePhase === 'afternoon' ? '#38bdf8' : '#64748b';
        ctx.fillRect(10, 0, 10, 2);

        // Rear Spoiler Wing
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(1, 0, 4, 2);
        ctx.fillStyle = '#991b1b';
        ctx.fillRect(2, 2, 2, 2);

        // Front Headlight Lamp
        ctx.fillStyle = lightsOn ? '#fef08a' : '#cbd5e1';
        ctx.fillRect(cw - 3, 4, 2, 2);

        // Rear Neon Red Taillight
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(0, 4, 2, 2);
        if (lightsOn) {
          ctx.fillStyle = 'rgba(239, 68, 68, 0.35)';
          ctx.fillRect(-5, 3, 5, 3);
        }

        // 3. Animated Spinning Wheels with Rotating Spokes
        const wheelRot = t * 0.38;
        const wheels = [6, cw - 8];
        for (const wx of wheels) {
          ctx.fillStyle = '#020617';
          ctx.fillRect(wx - 3, 6, 6, 5); // tire rubber
          ctx.fillStyle = '#94a3b8';
          ctx.fillRect(wx - 1, 7, 2, 3); // rim

          const spoke = Math.sin(wheelRot) > 0;
          ctx.fillStyle = spoke ? '#e2e8f0' : '#475569';
          ctx.fillRect(wx - 1, 8, 2, 1);
        }

        ctx.restore();
      } catch (e) {}
    }

    // =========================================================================
    // MAIN DRAW SCENE 2D (THE COMPLETE CRUISE LOOP)
    // =========================================================================
    function drawScene2D(t) {
      // 1. SKY GRADIENT (NEVER PITCH BLACK)
      const skyGrad = ctx.createLinearGradient(0, 0, 0, streetY);
      if (activePhase === 'evening') {
        // Gorgeous Sunset Sky
        skyGrad.addColorStop(0.0, '#2e0854');
        skyGrad.addColorStop(0.25, '#701a75');
        skyGrad.addColorStop(0.50, '#be185d');
        skyGrad.addColorStop(0.75, '#ea580c');
        skyGrad.addColorStop(1.0, '#f59e0b');
      } else if (activePhase === 'night') {
        // Deep Midnight Sky with Violet Glow
        skyGrad.addColorStop(0.0, '#0b0f19');
        skyGrad.addColorStop(0.35, '#16132e');
        skyGrad.addColorStop(0.70, '#251842');
        skyGrad.addColorStop(1.0, '#351d52');
      } else if (activePhase === 'morning') {
        skyGrad.addColorStop(0.0, '#3b82f6');
        skyGrad.addColorStop(0.40, '#60a5fa');
        skyGrad.addColorStop(0.75, '#93c5fd');
        skyGrad.addColorStop(1.0, '#fed7aa');
      } else {
        // Afternoon
        skyGrad.addColorStop(0.0, '#1d4ed8');
        skyGrad.addColorStop(0.35, '#3b82f6');
        skyGrad.addColorStop(0.70, '#60a5fa');
        skyGrad.addColorStop(1.0, '#bfdbfe');
      }
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, width, streetY);

      // Sunset / Sunrise Horizon Glow
      if (activePhase === 'evening') {
        const haze = ctx.createLinearGradient(0, streetY - 36, 0, streetY);
        haze.addColorStop(0, 'rgba(245, 158, 11, 0)');
        haze.addColorStop(1, 'rgba(245, 158, 11, 0.40)');
        ctx.fillStyle = haze;
        ctx.fillRect(0, streetY - 36, width, 36);
      } else if (activePhase === 'morning') {
        const haze = ctx.createLinearGradient(0, streetY - 28, 0, streetY);
        haze.addColorStop(0, 'rgba(254, 215, 170, 0)');
        haze.addColorStop(1, 'rgba(254, 215, 170, 0.28)');
        ctx.fillStyle = haze;
        ctx.fillRect(0, streetY - 28, width, 28);
      }

      // 2. MASSIVE GLOWING SUNSET / MOON SKY
      if (activePhase === 'night') {
        if (activeWeather !== 'rain') {
          for (const s of stars) {
            const a = 0.35 + Math.sin(t * s.speed + s.phase) * 0.3;
            ctx.fillStyle = 'rgba(255, 255, 255, ' + a + ')';
            ctx.fillRect(Math.floor(s.x), Math.floor(s.y), s.size, s.size);
          }
        }

        const moonR = Math.max(14, Math.min(26, Math.floor(streetY * 0.22)));
        const moonX = Math.floor(width * 0.74);
        const moonY = Math.max(moonR + 6, Math.floor(streetY * 0.32));

        const moonGlow = ctx.createRadialGradient(moonX, moonY, moonR * 0.3, moonX, moonY, moonR * 2.5);
        moonGlow.addColorStop(0, 'rgba(255, 255, 255, 0.60)');
        moonGlow.addColorStop(0.45, 'rgba(230, 240, 255, 0.20)');
        moonGlow.addColorStop(1, 'rgba(230, 240, 255, 0)');
        ctx.fillStyle = moonGlow;
        ctx.beginPath();
        ctx.arc(moonX, moonY, moonR * 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
        ctx.fill();

        if (activeWeather === 'clear') {
          drawRadiantBeams(moonX, moonY, true);
        }
      } else if (activePhase === 'evening') {
        // Massive Glowing Sunset Sun
        const sunR = Math.max(16, Math.min(28, Math.floor(streetY * 0.24)));
        const sunX = Math.floor(width * 0.72);
        const sunY = Math.floor(streetY * 0.52);

        const sunsetGlow = ctx.createRadialGradient(sunX, sunY, sunR * 0.3, sunX, sunY, sunR * 3.4);
        sunsetGlow.addColorStop(0, 'rgba(255, 179, 0, 0.75)');
        sunsetGlow.addColorStop(0.35, 'rgba(233, 30, 99, 0.40)');
        sunsetGlow.addColorStop(1, 'rgba(112, 26, 117, 0)');
        ctx.fillStyle = sunsetGlow;
        ctx.beginPath();
        ctx.arc(sunX, sunY, sunR * 3.4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffecb3';
        ctx.beginPath();
        ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
        ctx.fill();

        if (activeWeather === 'clear') {
          drawRadiantBeams(sunX, sunY, false);
        }
      } else if (activePhase === 'morning') {
        const sunR = Math.max(14, Math.min(26, Math.floor(streetY * 0.22)));
        const sunX = Math.floor(width * 0.22);
        const sunY = Math.floor(streetY * 0.40);

        const morningGlow = ctx.createRadialGradient(sunX, sunY, sunR * 0.3, sunX, sunY, sunR * 3.0);
        morningGlow.addColorStop(0, 'rgba(250, 204, 21, 0.65)');
        morningGlow.addColorStop(0.45, 'rgba(253, 224, 71, 0.24)');
        morningGlow.addColorStop(1, 'rgba(250, 204, 21, 0)');
        ctx.fillStyle = morningGlow;
        ctx.beginPath();
        ctx.arc(sunX, sunY, sunR * 3.0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
        ctx.fill();

        if (activeWeather === 'clear') {
          drawRadiantBeams(sunX, sunY, false);
        }
      } else {
        // Afternoon Sun
        const sunR = Math.max(14, Math.min(25, Math.floor(streetY * 0.20)));
        const sunX = Math.floor(width * 0.50);
        const sunY = Math.floor(streetY * 0.24);

        const noonGlow = ctx.createRadialGradient(sunX, sunY, sunR * 0.3, sunX, sunY, sunR * 2.6);
        noonGlow.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
        noonGlow.addColorStop(0.5, 'rgba(191, 219, 254, 0.30)');
        noonGlow.addColorStop(1, 'rgba(191, 219, 254, 0)');
        ctx.fillStyle = noonGlow;
        ctx.beginPath();
        ctx.arc(sunX, sunY, sunR * 2.6, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
        ctx.fill();

        if (activeWeather === 'clear') {
          drawRadiantBeams(sunX, sunY, false);
        }
      }

      // 3. GORGEOUS DISTANT PURPLE MOUNTAINS (PERMANENT DEFAULT PARALLAX LOOP)
      drawDistantPurpleMountains(t);

      // 4. SURAT LANDMARK OVERLAY (CABLE BRIDGE & PALMS ONLY IF GEOLOCATION DETECTS SURAT)
      drawSuratLandmarksOverlay(t);

      // 5. FOREGROUND HIGHWAY & PARALLAX MOTORWAY
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

      // Sidewalk curb seam lines scrolling right to left
      const curbSpacing = 24;
      const curbShift = (t * 2.8) % curbSpacing;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      for (let cx = -curbSpacing; cx < width + curbSpacing * 2; cx += curbSpacing) {
        ctx.fillRect(Math.floor(cx - curbShift), streetY - 3, 1, 2);
      }

      // Broken Lane Divider dashes scrolling smoothly right to left
      ctx.fillStyle = activePhase === 'afternoon' ? 'rgba(255, 255, 255, 0.45)' : 'rgba(255, 255, 255, 0.28)';
      const laneMidY = streetY + Math.max(9, Math.floor(roadHeight * 0.45));
      const dashSpacing = 26;
      const dashWidth = 12;
      const roadShift = (t * 3.4) % dashSpacing;
      for (let rx = -dashSpacing; rx < width + dashSpacing * 2; rx += dashSpacing) {
        ctx.fillRect(Math.floor(rx - roadShift), laneMidY, dashWidth, 1.5);
      }

      // Highway Streetlights scrolling smoothly right to left
      const lampSpacing = 110;
      const lampShift = (t * 2.4) % lampSpacing;
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

      // 6. THE RETRO CRUISER SPORTS COUPE
      drawRetroCruiserCar(t);
    }

    // =========================================================================
    // DYNAMIC WEATHER EFFECTS OVERLAY (RAIN, THUNDER, SNOW)
    // =========================================================================
    function drawWeatherEffects() {
      if (activeWeather === 'rain' || activeWeather === 'thunder') {
        ctx.save();
        ctx.fillStyle = activeWeather === 'thunder' ? 'rgba(10, 15, 30, 0.22)' : 'rgba(15, 23, 42, 0.16)';
        ctx.fillRect(0, 0, width, height);

        ctx.lineWidth = 1;
        for (const d of raindrops) {
          ctx.strokeStyle = 'rgba(186, 230, 253, ' + d.alpha + ')';
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x - 1, d.y + d.len);
          ctx.stroke();

          d.y += d.speed;
          d.x -= 0.4;
          if (d.y > height) {
            d.y = -d.len - Math.random() * 16;
            d.x = Math.random() * (width + 30) - 10;
          }
        }

        if (activeWeather === 'thunder') {
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
        } else {
          currentFlashAlpha = 0;
        }

        ctx.restore();
      } else if (activeWeather === 'snow') {
        currentFlashAlpha = 0;
        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        for (const s of snowflakes) {
          s.sway += 0.02;
          s.x += Math.sin(s.sway) * 0.35;
          s.y += s.speed;
          ctx.fillRect(Math.floor(s.x), Math.floor(s.y), s.size, s.size);
          if (s.y > height) {
            s.y = -4;
            s.x = Math.random() * (width + 20) - 10;
          }
        }
        ctx.restore();
      } else {
        currentFlashAlpha = 0;
      }
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
    // MAIN RENDERING LOOP (WRAPPED IN ZERO-CRASH TRY/CATCH)
    // =========================================================================
    let t = 0;
    function loop() {
      t++;
      try {
        syncCanvasSize();

        ctx.clearRect(0, 0, width, height);

        // 1. Permanent Default 2D Parallax Mountain Highway Loop
        drawScene2D(t);

        // 2. Dynamic Weather Overlays
        drawWeatherEffects();

        // 3. Spider Companion
        drawCornerSpiderCompanion(t);
      } catch (err) {
        // Ultimate Fallback: Never leave screen black
        try {
          ctx.fillStyle = '#2e0854';
          ctx.fillRect(0, 0, width, height);
          ctx.fillStyle = '#581c87';
          ctx.beginPath();
          ctx.moveTo(0, streetY);
          ctx.lineTo(width * 0.35, streetY * 0.4);
          ctx.lineTo(width * 0.7, streetY * 0.25);
          ctx.lineTo(width, streetY);
          ctx.fill();
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
