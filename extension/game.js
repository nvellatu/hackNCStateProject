const firebaseConfig = {
  apiKey: "AIzaSyAVQY8pAGBaAUs9ESb3mVrOGtYPvVsSq9o",
  authDomain: "streetlight-ledger-game.firebaseapp.com",
  projectId: "streetlight-ledger-game",
  storageBucket: "streetlight-ledger-game.firebasestorage.app",
  messagingSenderId: "979397990884",
  appId: "1:979397990884:web:fa2f2207fdb13ecfc98ff1",
  measurementId: "G-T7G0JJ8LCK"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const scoresRef = db.collection("leaderboard");

const holes = 9;
const gameTime = 60;
let score = 0;
let timeLeft = gameTime;
let gameActive = false;
let timer;
let combo = 0; //streak multiplier

const cookieData = {
  safe: { 
    names: ["PHPSESSID", "sessionid", "csrftoken", "auth_token", "preferences", "lang", "theme", "cart_id", "xsrf-token", "__Host-session", "cookieconsent_status", "device_token"], 
    tips: ["PHP session cookie—keeps you logged in safely!", "Standard session ID—essential for site functionality.", "CSRF protection—prevents fake requests.", "Authentication token—securely remembers your login.", "Stores your site preferences (e.g., dark mode).", "Language preference—helps show the right language.", "Theme setting—remembers light/dark mode.", "Shopping cart ID—functional, not tracking you.", "XSRF protection token—keeps forms secure.", "Secure prefixed session—modern safe standard.", "Records your consent choice—helps compliance.", "Device identifier for login—first-party only."], 
    points: -50 
  },
  tracking: { 
    names: ["_ga", "_gid", "_gat", "_fbp", "_fbc", "fr", "datr", "utm_source", "utm_medium", "_gcl_au", "NID", "SID"], 
    tips: ["Google Analytics—tracks visits and behavior.", "Google Analytics ID—registers unique users.", "Google Analytics throttle—limits request rate.", "Facebook Pixel—tracks you for ads.", "Facebook click ID—links ads to conversions.", "Encrypted Facebook tracker—cross-site ads.", "Facebook device tracker—identifies your browser.", "Campaign source—tracks where you came from.", "Campaign medium—e.g., email or CPC ads.", "Google Ads conversion—tests ad effectiveness.", "Google preferences—remembers settings but tracks.", "Google session—used across Google services."], 
    points: 30 
  },
  highrisk: { 
    names: ["IDE", "id", "ANID", "__cfduid", "sb", "wd", "c_user", "xs", "ads_id", "fingerprint_id", "evercookie_storage", "test_cookie"], 
    tips: ["DoubleClick (Google Ads)—cross-site ad tracking!", "Generic ad ID—often persistent across sites.", "Google advertising ID—highly invasive profiling.", "Cloudflare ID—sometimes abused for tracking.", "Facebook session backup—hard to delete.", "Facebook window size—used in fingerprinting.", "Facebook user ID—directly identifies you.", "Facebook cross-site request—super persistent.", "Generic ads identifier—high privacy risk.", "Browser fingerprinting—uniquely IDs your device!", "Evercookie attempt—zombie-like persistence.", "DoubleClick test—checks if cookies work for ads."], 
    points: 50 
  }
};

const holesElements = [];
const gameContainer = document.getElementById("gameContainer");

// Create holes
for (let i = 0; i < holes; i++) {
  const hole = document.createElement("div");
  hole.className = "hole";
  hole.style.left = `${90 + (i % 3) * 160}px`;
  hole.style.bottom = `${90 + Math.floor(i / 3) * 160}px`;
  const cookie = document.createElement("div");
  cookie.className = "cookie";
  hole.appendChild(cookie);
  gameContainer.appendChild(hole);
  holesElements.push({ hole, cookie });
}

function popCookie() {
  if (!gameActive) return;
  const idx = Math.floor(Math.random() * holes);
  const { cookie } = holesElements[idx];
  if (cookie.classList.contains("up")) return;

  const types = ["safe", "tracking", "highrisk"];
  const type = types[Math.floor(Math.random() * types.length)];
  const data = cookieData[type];
  const nameIdx = Math.floor(Math.random() * data.names.length);

  cookie.textContent = data.names[nameIdx];
  cookie.className = `cookie ${type} up`;

  // Progressive: shorter up time as game progresses
  const elapsed = gameTime - timeLeft;
  let upTime = 2800 - elapsed * 25; // Starts ~2800ms, down to ~1300ms by end
  upTime = Math.max(1000, upTime); // Min 1000ms (prevent impossible)
  upTime += Math.random() * 600; // Some randomness for fairness

  const timeout = setTimeout(() => {
    if (cookie.classList.contains("up")) {
      cookie.classList.remove("up");
      if (type === "safe") combo = Math.max(0, combo - 1);
    }
  }, upTime);

  cookie.onclick = () => {
    clearTimeout(timeout);
    cookie.classList.remove("up");

    let points = data.points;
    if (type !== "safe") {
      combo++;
      points += combo * 10;
    } else {
      combo = 0;
    }

    score += points;
    document.getElementById("score").textContent = `Score: ${score} ${combo > 1 ? `(Combo x${combo})` : ''}`;

    const tip = document.getElementById("tip");
    const sign = points > 0 ? "+" : "";
    tip.textContent = `${sign}${points}! ${data.tips[nameIdx]}`;
    tip.style.display = "block";
    setTimeout(() => tip.style.display = "none", 2000);
  };
}

function startGame() {
  score = 0;
  timeLeft = gameTime;
  combo = 0;
  gameActive = true;
  document.getElementById("score").textContent = "Score: 0";
  document.getElementById("timer").textContent = `Time: ${timeLeft}`;
  document.getElementById("startBtn").disabled = true;
  holesElements.forEach(h => h.cookie.classList.remove("up"));

  timer = setInterval(() => {
    timeLeft--;
    document.getElementById("timer").textContent = `Time: ${timeLeft}`;
    if (timeLeft <= 0) endGame();
  }, 1000);

  // Progressive difficulty: more pops per tick + shorter up time (handled in popCookie)
  const popInterval = setInterval(() => {
    if (!gameActive) return;

    const elapsed = gameTime - timeLeft;
    const difficultyLevel = Math.floor(elapsed / 15); // 0-4 over 60s (ramps every 15s)
    const popsThisTick = Math.min(4, 1 + difficultyLevel); // 1 → 2 → 3 → 4 pops per tick

    for (let i = 0; i < popsThisTick; i++) {
      popCookie();
    }
  }, 800); // Base tick rate (feels good—tune if needed)

  // Stop popping after game ends
  setTimeout(() => clearInterval(popInterval), gameTime * 1000);
}

function endGame() {
  gameActive = false;
  clearInterval(timer);
  document.getElementById("startBtn").disabled = false;
  holesElements.forEach(h => h.cookie.classList.remove("up"));

  const name = prompt(`Game Over! Final score: ${score}\nEnter name for leaderboard:`);
  if (name && score > 0) {
    scoresRef.add({
      name: name.trim() || "Anonymous",
      score: score,
      date: Date.now()
    }).then(() => loadLeaderboard()).catch(err => alert("Save error: " + err.message));
  } else {
    loadLeaderboard();
  }
}

function loadLeaderboard() {
  scoresRef.orderBy("score", "desc").limit(10).get().then((querySnapshot) => {
    const leaders = [];
    querySnapshot.forEach((doc) => leaders.push(doc.data()));
    const ol = document.getElementById("leaders");
    ol.innerHTML = leaders.map((l, i) => `<li>${i+1}. ${l.name} — ${l.score}</li>`).join("");
  }).catch(err => console.error("Load error:", err));
}

document.getElementById("startBtn").onclick = startGame;
loadLeaderboard();
setInterval(popCookie, 1500); // Teaser pops before start