const weapons = {
  cannon: { label: "Cannon", bulletSpeed: 9, damage: 20, cooldown: 280, spread: 0, pellets: 1, bulletSize: 5, color: "#f7f8ff" },
  gatling: { label: "Gatling", bulletSpeed: 11, damage: 8, cooldown: 95, spread: 0.09, pellets: 1, bulletSize: 3, color: "#d8f6ff" },
  shotgun: { label: "Shotgun", bulletSpeed: 8, damage: 9, cooldown: 460, spread: 0.55, pellets: 6, bulletSize: 3, color: "#ffdca0" },
  rocket: { label: "Rocket", bulletSpeed: 6.7, damage: 30, cooldown: 600, spread: 0, pellets: 1, bulletSize: 6, color: "#ff9379" },
};

const upgradeDefs = {
  health: { label: "Armor", max: 5, pointsCost: 1, apply: (player, level) => (player.maxHealth = 100 + level * 18) },
  damage: { label: "Damage", max: 5, pointsCost: 1, apply: (player, level) => (player.damageMult = 1 + level * 0.12) },
  speed: { label: "Engine", max: 5, pointsCost: 1, apply: (player, level) => (player.moveSpeed = 2.5 + level * 0.3) },
  reload: { label: "Reload", max: 5, pointsCost: 1, apply: (player, level) => (player.reloadMult = Math.max(0.58, 1 - level * 0.08)) },
};

const setupState = {
  p1: { weapon: "cannon", points: 8, upgrades: { health: 0, damage: 0, speed: 0, reload: 0 } },
  p2: { weapon: "cannon", points: 8, upgrades: { health: 0, damage: 0, speed: 0, reload: 0 } },
};

const controls = {
  p1: { up: "KeyW", down: "KeyS", left: "KeyA", right: "KeyD", shoot: "KeyE" },
  p2: { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight", shoot: "KeyP" },
};

const keys = new Set();
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
let bullets = [];
let players = [];
let gameLoopId = null;
let lastFrame = performance.now();
let roundOver = false;
let winner = null;

const setupPanel = document.getElementById("setupPanel");
const gamePanel = document.getElementById("gamePanel");
const p1Hud = document.getElementById("p1Hud");
const p2Hud = document.getElementById("p2Hud");
const status = document.getElementById("status");

function initSetupUI() {
  ["p1", "p2"].forEach((id) => {
    const select = document.getElementById(`${id}Weapon`);
    Object.entries(weapons).forEach(([key, w]) => {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = w.label;
      select.append(option);
    });

    select.value = setupState[id].weapon;
    select.addEventListener("change", () => {
      setupState[id].weapon = select.value;
    });

    const upgradesContainer = document.getElementById(`${id}Upgrades`);
    Object.entries(upgradeDefs).forEach(([key, def]) => {
      const row = document.createElement("div");
      row.className = "upgrade-row";
      row.innerHTML = `
        <span>${def.label}</span>
        <div class="upgrade-controls">
          <button data-player="${id}" data-upgrade="${key}" data-delta="-1" type="button">-</button>
          <strong id="${id}-${key}-level">0</strong>
          <button data-player="${id}" data-upgrade="${key}" data-delta="1" type="button">+</button>
        </div>
      `;
      upgradesContainer.append(row);
    });
  });

  document.querySelectorAll(".upgrade-controls button").forEach((button) => {
    button.addEventListener("click", () => {
      const { player, upgrade, delta } = button.dataset;
      const intDelta = Number(delta);
      const profile = setupState[player];
      const current = profile.upgrades[upgrade];
      const next = current + intDelta;
      if (next < 0 || next > upgradeDefs[upgrade].max) return;
      if (intDelta > 0 && profile.points < upgradeDefs[upgrade].pointsCost) return;
      profile.upgrades[upgrade] = next;
      profile.points -= intDelta * upgradeDefs[upgrade].pointsCost;
      refreshSetupLabels();
    });
  });

  refreshSetupLabels();
}

function refreshSetupLabels() {
  ["p1", "p2"].forEach((id) => {
    const profile = setupState[id];
    document.getElementById(`${id}Points`).textContent = `Upgrade points left: ${profile.points}`;
    Object.keys(upgradeDefs).forEach((key) => {
      document.getElementById(`${id}-${key}-level`).textContent = profile.upgrades[key];
    });
  });
}

function createPlayer(id, x, y, color, ctrl) {
  const profile = setupState[id];
  const player = {
    id,
    x,
    y,
    radius: 18,
    color,
    controls: ctrl,
    weaponKey: profile.weapon,
    weapon: weapons[profile.weapon],
    health: 100,
    maxHealth: 100,
    moveSpeed: 2.5,
    damageMult: 1,
    reloadMult: 1,
    score: 0,
    lastShotAt: 0,
    facing: { x: id === "p1" ? 1 : -1, y: 0 },
  };

  Object.entries(profile.upgrades).forEach(([key, level]) => {
    upgradeDefs[key].apply(player, level);
  });
  player.health = player.maxHealth;
  return player;
}

function startMatch() {
  setupPanel.classList.add("hidden");
  gamePanel.classList.remove("hidden");
  roundOver = false;
  winner = null;

  players = [
    createPlayer("p1", 120, canvas.height / 2, "#63e7cd", controls.p1),
    createPlayer("p2", canvas.width - 120, canvas.height / 2, "#ffcb6d", controls.p2),
  ];
  bullets = [];
  updateHud();
  status.textContent = "Fight!";
  lastFrame = performance.now();
  if (gameLoopId) cancelAnimationFrame(gameLoopId);
  gameLoopId = requestAnimationFrame(tick);
}

function updateHud() {
  const [p1, p2] = players;
  p1Hud.innerHTML = `P1 HP: ${Math.ceil(p1.health)}/${p1.maxHealth} | Weapon: ${p1.weapon.label} | KOs: ${p1.score}`;
  p2Hud.innerHTML = `P2 HP: ${Math.ceil(p2.health)}/${p2.maxHealth} | Weapon: ${p2.weapon.label} | KOs: ${p2.score}`;
}

function handleMovement(player, dt) {
  let dx = 0;
  let dy = 0;
  if (keys.has(player.controls.up)) dy -= 1;
  if (keys.has(player.controls.down)) dy += 1;
  if (keys.has(player.controls.left)) dx -= 1;
  if (keys.has(player.controls.right)) dx += 1;

  if (dx !== 0 || dy !== 0) {
    const length = Math.hypot(dx, dy);
    dx /= length;
    dy /= length;
    player.facing = { x: dx, y: dy };
    player.x += dx * player.moveSpeed * dt;
    player.y += dy * player.moveSpeed * dt;
    player.x = Math.max(player.radius, Math.min(canvas.width - player.radius, player.x));
    player.y = Math.max(player.radius, Math.min(canvas.height - player.radius, player.y));
  }
}

function shootIfNeeded(player, now) {
  if (!keys.has(player.controls.shoot)) return;
  const cooldown = player.weapon.cooldown * player.reloadMult;
  if (now - player.lastShotAt < cooldown) return;
  player.lastShotAt = now;

  const baseAngle = Math.atan2(player.facing.y, player.facing.x);
  for (let i = 0; i < player.weapon.pellets; i += 1) {
    const spread = player.weapon.spread;
    const offset = spread === 0 ? 0 : (Math.random() - 0.5) * spread;
    const angle = baseAngle + offset;
    bullets.push({
      x: player.x + Math.cos(angle) * (player.radius + 7),
      y: player.y + Math.sin(angle) * (player.radius + 7),
      vx: Math.cos(angle) * player.weapon.bulletSpeed,
      vy: Math.sin(angle) * player.weapon.bulletSpeed,
      size: player.weapon.bulletSize,
      life: 130,
      owner: player.id,
      damage: player.weapon.damage * player.damageMult,
      color: player.weapon.color,
    });
  }
}

function advanceBullets(dt) {
  bullets.forEach((b) => {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
  });
  bullets = bullets.filter((b) => b.life > 0 && b.x > -20 && b.x < canvas.width + 20 && b.y > -20 && b.y < canvas.height + 20);
}

function checkHits() {
  bullets = bullets.filter((b) => {
    const target = players.find((p) => p.id !== b.owner);
    if (!target) return false;
    if (Math.hypot(target.x - b.x, target.y - b.y) <= target.radius + b.size) {
      target.health -= b.damage;
      return false;
    }
    return true;
  });
}

function checkRoundEnd() {
  const [p1, p2] = players;
  if (p1.health > 0 && p2.health > 0) return;

  roundOver = true;
  const roundWinner = p1.health > 0 ? p1 : p2;
  roundWinner.score += 1;

  if (roundWinner.score >= 5) {
    winner = roundWinner.id;
    status.textContent = `${roundWinner.id.toUpperCase()} wins the match! Refresh page to reconfigure loadouts.`;
    return;
  }

  status.textContent = `${roundWinner.id.toUpperCase()} scores! Next round in 1.2s`;
  setTimeout(() => {
    bullets = [];
    players = [
      createPlayer("p1", 120, canvas.height / 2, "#63e7cd", controls.p1),
      createPlayer("p2", canvas.width - 120, canvas.height / 2, "#ffcb6d", controls.p2),
    ];
    players[0].score = p1.score;
    players[1].score = p2.score;
    roundOver = false;
    status.textContent = "Fight!";
    updateHud();
  }, 1200);
}

function drawArena() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#0d1320";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "#25314d";
  for (let i = 80; i < canvas.width; i += 80) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, canvas.height);
    ctx.stroke();
  }
  for (let i = 80; i < canvas.height; i += 80) {
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(canvas.width, i);
    ctx.stroke();
  }
}

function drawPlayersAndBullets() {
  players.forEach((p) => {
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#09111e";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + p.facing.x * 24, p.y + p.facing.y * 24);
    ctx.stroke();

    const healthRatio = Math.max(0, p.health / p.maxHealth);
    ctx.fillStyle = "#12203b";
    ctx.fillRect(p.x - 24, p.y - 30, 48, 6);
    ctx.fillStyle = "#6effb3";
    ctx.fillRect(p.x - 24, p.y - 30, 48 * healthRatio, 6);
  });

  bullets.forEach((b) => {
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
    ctx.fill();
  });
}

function tick(now) {
  const dt = Math.min(2.2, (now - lastFrame) / 16.67);
  lastFrame = now;

  drawArena();
  if (!roundOver && !winner) {
    players.forEach((p) => {
      handleMovement(p, dt);
      shootIfNeeded(p, now);
    });
    advanceBullets(dt);
    checkHits();
    checkRoundEnd();
    updateHud();
  }
  drawPlayersAndBullets();

  gameLoopId = requestAnimationFrame(tick);
}

document.addEventListener("keydown", (event) => {
  const lockList = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"];
  if (lockList.includes(event.code)) event.preventDefault();
  keys.add(event.code);
});

document.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

document.getElementById("startBtn").addEventListener("click", startMatch);

initSetupUI();
