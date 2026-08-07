const entry = document.querySelector("#entry");
const entryForm = document.querySelector("#entry-form");
const prototype = document.querySelector("#prototype");
const viewport = document.querySelector("#viewport");
const world = document.querySelector("#world");
const objectsLayer = document.querySelector("#objects");
const player = document.querySelector("#player");
const playerCarry = document.querySelector("#player-carry");
const contextName = document.querySelector("#context-name");
const contextAction = document.querySelector("#context-action");
const viewer = document.querySelector("#viewer");
const viewerTitle = document.querySelector("#viewer-title");
const viewerState = document.querySelector("#viewer-state");
const viewerPlaceholder = document.querySelector("#viewer-placeholder");
const viewerClose = document.querySelector("#viewer-close");
const auctionPanel = document.querySelector("#auction-panel");
const auctionPrice = document.querySelector("#auction-price");
const auctionMessage = document.querySelector("#auction-message");
const bidButton = document.querySelector("#bid-button");
const locationLabel = document.querySelector("#location-label");
const visitorName = document.querySelector("#visitor-name");
const inventoryLabel = document.querySelector("#inventory");
const toast = document.querySelector("#toast");

const storageKey = "zhere-afterimage-yard";
const saved = JSON.parse(localStorage.getItem(storageKey) || "{}") || {};

const scenes = {
  public: {
    label: "公共影像院",
    spawn: { x: 920, y: 770 },
    objects: [
      { id: "rain-chair", title: "雨后的塑料椅", x: 560, y: 420 },
      { id: "slow-train", title: "慢车经过空站", x: 900, y: 330 },
      { id: "cat-office", title: "猫看完了会议", x: 1290, y: 530 },
      { id: "blue-roof", title: "蓝屋顶没有下雨", x: 1650, y: 390 },
      { id: "night-shop", title: "凌晨三点的商店", x: 1840, y: 830 },
      { id: "paper-wind", title: "一张纸在练习转弯", x: 1380, y: 1040 },
      { id: "warm-machine", title: "机器学会了晒太阳", x: 650, y: 1110 }
    ]
  },
  home: {
    label: "迟野的院子",
    spawn: { x: 1050, y: 750 },
    objects: saved.homeObjects || [
      { id: "home-1", title: "留给傍晚的墙", x: 780, y: 520, home: true },
      { id: "home-2", title: "不急着解释的窗", x: 1420, y: 850, home: true }
    ]
  },
  auction: {
    label: "无声竞价棚",
    spawn: { x: 1160, y: 860 },
    objects: [
      { id: "auction-film", title: "一段没有主角的庆典", x: 1160, y: 590, auction: true }
    ]
  }
};

const state = {
  scene: "public",
  x: scenes.public.spawn.x,
  y: scenes.public.spawn.y,
  keys: new Set(),
  nearest: null,
  carried: null,
  inventory: Number(saved.inventory || 0),
  viewing: null,
  playing: false,
  auctionValue: 18,
  auctionOpen: false,
  target: null,
  lastTime: performance.now()
};

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify({
    inventory: state.inventory,
    homeObjects: scenes.home.objects
  }));
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("is-visible"), 1800);
}

function objectMarkup(object) {
  const classes = ["video-object"];
  if (object.home) classes.push("is-home");
  if (object.auction) classes.push("is-auction");
  return `
    <article class="${classes.join(" ")}" data-id="${object.id}" style="left:${object.x}px;top:${object.y}px" aria-label="${object.title}">
      <div class="screen"></div>
      <div class="stand"></div>
      <div class="title">${object.title}</div>
    </article>`;
}

function renderScene() {
  objectsLayer.innerHTML = scenes[state.scene].objects.map(objectMarkup).join("");
  if (state.scene === "auction") {
    objectsLayer.insertAdjacentHTML("beforeend", `
      <div class="price-balloon" id="price-balloon">${state.auctionValue}</div>
      <div class="bidder" data-label="阿灯 NPC" style="left:760px;top:650px"></div>
      <div class="bidder" data-label="旧尺 NPC" style="left:1520px;top:680px"></div>
      <div class="bidder" data-label="访客" style="left:1370px;top:990px;background:#788b81"></div>
    `);
  }
  locationLabel.textContent = scenes[state.scene].label;
  document.querySelectorAll(".scene-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.scene === state.scene);
  });
  updateInventory();
}

function updateInventory() {
  inventoryLabel.textContent = state.carried ? "手上有一束投影" : `投影 ${state.inventory}`;
  player.classList.toggle("has-carry", Boolean(state.carried));
  playerCarry.title = state.carried?.title || "";
}

function switchScene(sceneName) {
  if (!scenes[sceneName]) return;
  state.scene = sceneName;
  state.x = scenes[sceneName].spawn.x;
  state.y = scenes[sceneName].spawn.y;
  state.nearest = null;
  state.target = null;
  state.auctionOpen = false;
  auctionPanel.classList.remove("is-open");
  renderScene();
  updateContext();
  viewport.focus();
}

function nearestObject() {
  let result = null;
  let bestDistance = Infinity;
  scenes[state.scene].objects.forEach((object) => {
    const distance = Math.hypot(state.x - object.x, state.y - object.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      result = object;
    }
  });
  return bestDistance < (state.scene === "auction" ? 280 : 190) ? result : null;
}

function updateContext() {
  const nearest = nearestObject();
  state.nearest = nearest;
  document.querySelectorAll(".video-object").forEach((node) => {
    node.classList.toggle("is-near", node.dataset.id === nearest?.id);
  });

  if (state.scene === "auction") {
    if (nearest) {
      contextName.textContent = nearest.title;
      contextAction.textContent = "按 E 靠近竞价，或继续绕开";
    } else {
      contextName.textContent = "这里没有倒计时";
      contextAction.textContent = "你可以围观、出价，也可以直接离开";
    }
    return;
  }

  if (state.carried) {
    contextName.textContent = state.carried.title;
    contextAction.textContent = state.scene === "home" ? "按 F 把投影放在这里" : "去我的院子，那里允许改变位置";
    return;
  }

  if (nearest) {
    contextName.textContent = nearest.title;
    contextAction.textContent = state.scene === "public" ? "按 E 观看，按 F 带走一个投影副本" : "按 E 观看，按 F 拿起并重新摆放";
  } else if (state.scene === "home" && state.inventory > 0) {
    contextName.textContent = "这片空地属于你";
    contextAction.textContent = "按 F 从收藏里拿出一束投影";
  } else {
    contextName.textContent = state.scene === "public" ? "先随便走走" : "慢慢布置，不需要完成什么";
    contextAction.textContent = "靠近一块影像，它会先认出你";
  }
}

function openViewer(object) {
  if (!object) return;
  state.viewing = object;
  state.playing = false;
  viewerTitle.textContent = object.title;
  viewerState.textContent = "空格键播放";
  viewerPlaceholder.classList.remove("is-playing");
  viewer.classList.add("is-open");
  viewer.setAttribute("aria-hidden", "false");
  viewerClose.focus();
}

function closeViewer() {
  state.viewing = null;
  state.playing = false;
  viewer.classList.remove("is-open");
  viewer.setAttribute("aria-hidden", "true");
  viewport.focus();
}

function togglePlayback() {
  if (!state.viewing) return;
  state.playing = !state.playing;
  viewerPlaceholder.classList.toggle("is-playing", state.playing);
  viewerState.textContent = state.playing ? "正在播放占位影像，空格键暂停" : "已暂停，空格键继续";
}

function handleCarry() {
  if (state.scene === "auction") return;

  if (state.carried) {
    if (state.scene !== "home") {
      showToast("公共院不改变原物，请带回自己的院子");
      return;
    }
    const placed = {
      id: `placed-${Date.now()}`,
      title: state.carried.title,
      x: Math.round(state.x + 90),
      y: Math.round(state.y),
      home: true
    };
    scenes.home.objects.push(placed);
    state.carried = null;
    state.inventory = Math.max(0, state.inventory - 1);
    renderScene();
    saveState();
    showToast("这里记住了新的位置");
    return;
  }

  if (state.nearest && state.scene === "public") {
    state.carried = { title: state.nearest.title };
    state.inventory += 1;
    updateInventory();
    saveState();
    showToast("原物没有移动，你带走了一束投影");
    return;
  }

  if (state.nearest && state.scene === "home") {
    const index = scenes.home.objects.findIndex((object) => object.id === state.nearest.id);
    const [picked] = scenes.home.objects.splice(index, 1);
    state.carried = { title: picked.title };
    state.inventory += 1;
    renderScene();
    saveState();
    showToast("拿起来了，位置暂时空着");
    return;
  }

  if (!state.nearest && state.scene === "home" && state.inventory > 0) {
    state.carried = { title: "未命名的投影" };
    updateInventory();
    showToast("从收藏里取出一束投影");
  }
}

function openAuction() {
  if (!state.nearest || state.scene !== "auction") return;
  state.auctionOpen = true;
  auctionPanel.classList.add("is-open");
  auctionPanel.setAttribute("aria-hidden", "false");
}

function placeBid() {
  state.auctionValue += 5;
  auctionPrice.textContent = state.auctionValue;
  auctionMessage.textContent = "你的出价已经留下。这里没有真实支付。";
  const balloon = document.querySelector("#price-balloon");
  if (balloon) {
    balloon.textContent = state.auctionValue;
    balloon.style.setProperty("--price-rise", `${Math.min(80, state.auctionValue - 18)}px`);
  }
  showToast("虚拟预算减少 5 枚");

  clearTimeout(placeBid.npcTimer);
  placeBid.npcTimer = setTimeout(() => {
    state.auctionValue += 3;
    auctionPrice.textContent = state.auctionValue;
    auctionMessage.textContent = "阿灯 NPC 加了 3 枚。它不是现实用户。";
    if (balloon) {
      balloon.textContent = state.auctionValue;
      balloon.style.setProperty("--price-rise", `${Math.min(80, state.auctionValue - 18)}px`);
    }
  }, 900);
}

function moveFrame(time) {
  const elapsed = Math.min(32, time - state.lastTime);
  state.lastTime = time;
  if (!state.viewing && !state.auctionOpen) {
    const speed = 0.25 * elapsed;
    let dx = 0;
    let dy = 0;
    if (state.keys.has("w") || state.keys.has("arrowup")) dy -= 1;
    if (state.keys.has("s") || state.keys.has("arrowdown")) dy += 1;
    if (state.keys.has("a") || state.keys.has("arrowleft")) dx -= 1;
    if (state.keys.has("d") || state.keys.has("arrowright")) dx += 1;
    if (dx || dy) state.target = null;
    if (dx && dy) {
      dx *= 0.707;
      dy *= 0.707;
    }
    if (!dx && !dy && state.target) {
      const targetDx = state.target.x - state.x;
      const targetDy = state.target.y - state.y;
      const targetDistance = Math.hypot(targetDx, targetDy);
      if (targetDistance < 5) {
        state.target = null;
      } else {
        dx = targetDx / targetDistance;
        dy = targetDy / targetDistance;
      }
    }
    state.x = Math.max(120, Math.min(2280, state.x + dx * speed));
    state.y = Math.max(120, Math.min(1380, state.y + dy * speed));
  }

  player.style.left = `${state.x}px`;
  player.style.top = `${state.y}px`;
  const cameraX = viewport.clientWidth / 2 - state.x;
  const cameraY = viewport.clientHeight / 2 - state.y;
  world.style.transform = `translate3d(${cameraX}px, ${cameraY}px, 0)`;
  updateContext();
  requestAnimationFrame(moveFrame);
}

entryForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = document.querySelector("#player-name").value.trim() || "无名访客";
  visitorName.textContent = name;
  scenes.home.label = `${name}的院子`;
  entry.classList.add("is-hidden");
  prototype.setAttribute("aria-hidden", "false");
  viewport.focus();
});

document.querySelectorAll(".scene-button").forEach((button) => {
  button.addEventListener("click", () => switchScene(button.dataset.scene));
});

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
    state.keys.add(key);
    event.preventDefault();
  }
  if (event.repeat) return;
  if (key === "escape" && state.viewing) closeViewer();
  if (key === "escape" && state.auctionOpen) {
    state.auctionOpen = false;
    auctionPanel.classList.remove("is-open");
  }
  if (key === "e") state.scene === "auction" ? openAuction() : openViewer(state.nearest);
  if (key === "f") handleCarry();
  if (key === " " && state.viewing) {
    event.preventDefault();
    togglePlayback();
  }
});

window.addEventListener("keyup", (event) => state.keys.delete(event.key.toLowerCase()));
window.addEventListener("blur", () => state.keys.clear());
viewerClose.addEventListener("click", closeViewer);
bidButton.addEventListener("click", placeBid);

viewport.addEventListener("click", (event) => {
  if (event.target.closest("button, .viewer, .auction-panel, .video-object")) return;
  const rect = viewport.getBoundingClientRect();
  state.target = {
    x: Math.max(120, Math.min(2280, state.x + event.clientX - rect.left - rect.width / 2)),
    y: Math.max(120, Math.min(1380, state.y + event.clientY - rect.top - rect.height / 2))
  };
  viewport.focus();
});

objectsLayer.addEventListener("click", (event) => {
  const node = event.target.closest(".video-object");
  if (!node) return;
  const object = scenes[state.scene].objects.find((item) => item.id === node.dataset.id);
  if (!object) return;
  if (Math.hypot(state.x - object.x, state.y - object.y) < 220) {
    state.scene === "auction" ? openAuction() : openViewer(object);
  } else {
    showToast("再靠近一点");
  }
});

renderScene();
requestAnimationFrame(moveFrame);
