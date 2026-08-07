const $ = (selector) => document.querySelector(selector);
const gate = $("#gate");
const viewport = $("#viewport");
const world = $("#world");
const objectsLayer = $("#objects");
const player = $("#player");
const contextTitle = $("#context-title");
const contextCopy = $("#context-copy");
const viewer = $("#viewer");
const viewerStage = $("#viewer-stage");
const viewerTitle = $("#viewer-title");
const viewerStatus = $("#viewer-status");
const auction = $("#auction");
const price = $("#price");
const bidNote = $("#bid-note");
const inventory = $("#inventory");
const toast = $("#toast");
const storageKey = "zhere-content-creatures";
const saved = JSON.parse(localStorage.getItem(storageKey) || "{}") || {};

const publicObjects = [
  { id:"cat-work", title:"一只认真上班的猫", tag:"像会议", x:510, y:390, vx:.16, vy:.08 },
  { id:"chair-run", title:"塑料椅逃离了团建", tag:"不合群", x:870, y:310, vx:-.12, vy:.11 },
  { id:"cheap-rich", title:"看起来很贵的空盒子", tag:"可能很贵", x:1260, y:500, vx:.1, vy:-.13 },
  { id:"tiny-ad", title:"努力不像广告的广告", tag:"不是广告", x:1660, y:330, vx:-.15, vy:-.07 },
  { id:"late-noise", title:"凌晨三点的小声喧哗", tag:"太早了", x:1830, y:820, vx:-.1, vy:.12 },
  { id:"wrong-soup", title:"被错认成汤的夕阳", tag:"食物", x:1380, y:1040, vx:.13, vy:-.09 },
  { id:"square-wind", title:"方形的风正在排队", tag:"很圆", x:650, y:1030, vx:.11, vy:.1 }
];

const scenes = {
  public:{ label:"公共园", spawn:{x:1150,y:650}, objects:publicObjects },
  home:{ label:"我的内容屋", spawn:{x:1080,y:730}, objects:saved.home || [
    {id:"home-a",title:"窗边那只安静的",tag:"留下",x:760,y:480,home:true},
    {id:"home-b",title:"还没想好放哪里",tag:"待命",x:1420,y:850,home:true}
  ]},
  auction:{ label:"膨胀竞价场", spawn:{x:1120,y:820}, objects:[
    {id:"auction-a",title:"一段过分体面的笑声",tag:"有多重",x:1120,y:570,auction:true}
  ]}
};

const state = { scene:"public", x:1150, y:650, keys:new Set(), target:null, nearest:null, carried:null, count:Number(saved.count||0), viewing:null, playing:false, auctionOpen:false, price:12, last:performance.now() };

function save(){ localStorage.setItem(storageKey,JSON.stringify({count:state.count,home:scenes.home.objects})); }
function say(message){ toast.textContent=message; toast.classList.add("is-visible"); clearTimeout(say.t); say.t=setTimeout(()=>toast.classList.remove("is-visible"),1700); }
function assetMarkup(o){ return `<article class="asset is-walking${o.home?" is-home":""}${o.auction?" is-auction":""}" data-id="${o.id}" style="left:${o.x}px;top:${o.y}px"><div class="asset-screen"></div><i class="asset-leg left"></i><i class="asset-leg right"></i><span class="asset-name">${o.title}</span><span class="asset-tag">${o.tag}</span></article>`; }
function render(){
  objectsLayer.innerHTML=scenes[state.scene].objects.map(assetMarkup).join("");
  if(state.scene==="public") objectsLayer.insertAdjacentHTML("beforeend",`<div class="comment" style="left:350px;top:780px">它刚才瞪我</div><div class="comment" style="left:1540px;top:690px">标签贴反了</div><div class="comment" style="left:1030px;top:1160px">先别解释</div>`);
  if(state.scene==="auction") objectsLayer.insertAdjacentHTML("beforeend",`<div class="price-body" id="price-body">${state.price}</div><div class="npc" data-name="抬秤 NPC" style="left:760px;top:650px"></div><div class="npc" data-name="歪尺 NPC" style="left:1510px;top:680px"></div>`);
  document.querySelectorAll(".scene-button").forEach(b=>b.classList.toggle("is-active",b.dataset.scene===state.scene));
  updateInventory();
}
function updateInventory(){ inventory.textContent=state.carried?"手上有一只影子":`影子 ${state.count}`; player.classList.toggle("has-carry",Boolean(state.carried)); }
function switchScene(name){ state.scene=name; state.x=scenes[name].spawn.x; state.y=scenes[name].spawn.y; state.target=null; state.nearest=null; state.auctionOpen=false; auction.classList.remove("is-open"); render(); updateContext(); viewport.focus(); }
function nearest(){ let best=null,dist=Infinity; scenes[state.scene].objects.forEach(o=>{const d=Math.hypot(state.x-o.x,state.y-o.y);if(d<dist){dist=d;best=o;}});return dist<(state.scene==="auction"?300:220)?best:null; }
function updateContext(){
  state.nearest=nearest();
  document.querySelectorAll(".asset").forEach(n=>n.classList.toggle("is-near",n.dataset.id===state.nearest?.id));
  if(state.scene==="auction"){ contextTitle.textContent=state.nearest?state.nearest.title:"这只价格正在发胖"; contextCopy.textContent=state.nearest?"按 E 靠近秤，也可以转身离开":"走近一点，看它到底有多重"; return; }
  if(state.carried){ contextTitle.textContent=state.carried.title; contextCopy.textContent=state.scene==="home"?"按 F 放下，它会记住这里":"去我的内容屋，这里不改变公共原物"; return; }
  if(state.nearest){ contextTitle.textContent=state.nearest.title; contextCopy.textContent=state.scene==="public"?"按 E 看，按 F 带走它的影子":"按 E 看，按 F 换个位置"; return; }
  contextTitle.textContent=state.scene==="public"?"先追一只看看":"不必摆整齐"; contextCopy.textContent=state.scene==="home"&&state.count>0?"按 F 从收藏里取出影子":"点击地面或用 WASD 移动";
}
function openViewer(o){ if(!o)return; state.viewing=o;state.playing=false;viewerTitle.textContent=o.title;viewerStatus.textContent="空格键播放。播放时它会试着逃跑。";viewerStage.classList.remove("is-playing");viewer.classList.add("is-open");viewer.setAttribute("aria-hidden","false");$("#close-viewer").focus(); }
function closeViewer(){ state.viewing=null;state.playing=false;viewer.classList.remove("is-open");viewer.setAttribute("aria-hidden","true");viewport.focus(); }
function play(){ if(!state.viewing)return;state.playing=!state.playing;viewerStage.classList.toggle("is-playing",state.playing);viewerStatus.textContent=state.playing?"它开始乱跑了。空格键暂停。":"它停下来装作什么都没发生。"; }
function carry(){
  if(state.scene==="auction")return;
  if(state.carried){ if(state.scene!=="home"){say("公共园不改变原物");return;} scenes.home.objects.push({id:`placed-${Date.now()}`,title:state.carried.title,tag:"新邻居",x:Math.round(state.x+85),y:Math.round(state.y),home:true});state.carried=null;state.count=Math.max(0,state.count-1);render();save();say("这只影子在这里安顿下来");return; }
  if(state.nearest&&state.scene==="public"){state.carried={title:state.nearest.title};state.count++;updateInventory();save();say("原物还在散步，你带走了它的影子");return;}
  if(state.nearest&&state.scene==="home"){const i=scenes.home.objects.findIndex(o=>o.id===state.nearest.id);const [o]=scenes.home.objects.splice(i,1);state.carried={title:o.title};state.count++;render();save();say("拿起来了，它还在蹬腿");return;}
  if(state.scene==="home"&&state.count>0){state.carried={title:"没起名字的影子"};updateInventory();say("从收藏里抓出一只影子");}
}
function openAuction(){ if(!state.nearest||state.scene!=="auction")return;state.auctionOpen=true;auction.classList.add("is-open");auction.setAttribute("aria-hidden","false"); }
function placeBid(){state.price+=4;price.textContent=state.price;bidNote.textContent="你增加了 4 枚虚拟重量。";inflate();clearTimeout(placeBid.t);placeBid.t=setTimeout(()=>{state.price+=2;price.textContent=state.price;bidNote.textContent="歪尺 NPC 加了 2 枚。它不是真人。";inflate();},850);}
function inflate(){const body=$("#price-body");if(body){body.textContent=state.price;body.style.setProperty("--inflate",`${Math.min(70,state.price-12)}px`);}}
function roam(dt){if(state.scene!=="public")return;publicObjects.forEach((o,i)=>{o.x+=o.vx*dt*.25;o.y+=o.vy*dt*.25;if(o.x<260||o.x>2040)o.vx*=-1;if(o.y<220||o.y>1200)o.vy*=-1;const n=document.querySelector(`[data-id="${o.id}"]`);if(n){n.style.left=`${o.x}px`;n.style.top=`${o.y}px`;n.style.transform=`translate(-50%,-50%) rotate(${Math.sin(performance.now()/700+i)*2}deg)`;}});}
function frame(time){const dt=Math.min(32,time-state.last);state.last=time;if(!state.viewing)roam(dt);if(!state.viewing&&!state.auctionOpen){let dx=0,dy=0,speed=.26*dt;if(state.keys.has("w")||state.keys.has("arrowup"))dy--;if(state.keys.has("s")||state.keys.has("arrowdown"))dy++;if(state.keys.has("a")||state.keys.has("arrowleft"))dx--;if(state.keys.has("d")||state.keys.has("arrowright"))dx++;if(dx||dy)state.target=null;if(dx&&dy){dx*=.707;dy*=.707;}if(!dx&&!dy&&state.target){const tx=state.target.x-state.x,ty=state.target.y-state.y,d=Math.hypot(tx,ty);if(d<5)state.target=null;else{dx=tx/d;dy=ty/d;}}state.x=Math.max(120,Math.min(2180,state.x+dx*speed));state.y=Math.max(120,Math.min(1330,state.y+dy*speed));}player.style.left=`${state.x}px`;player.style.top=`${state.y}px`;world.style.transform=`translate3d(${viewport.clientWidth/2-state.x}px,${viewport.clientHeight/2-state.y}px,0)`;updateContext();requestAnimationFrame(frame);}

$("#gate-form").addEventListener("submit",e=>{e.preventDefault();const name=$("#visitor-name").value.trim()||"无名访客";$("#visitor-mark").textContent=name.slice(0,1);gate.classList.add("is-hidden");$("#app").setAttribute("aria-hidden","false");viewport.focus();});
document.querySelectorAll(".scene-button").forEach(b=>b.addEventListener("click",()=>switchScene(b.dataset.scene)));
window.addEventListener("keydown",e=>{const k=e.key.toLowerCase();if(["w","a","s","d","arrowup","arrowdown","arrowleft","arrowright"].includes(k)){state.keys.add(k);e.preventDefault();}if(e.repeat)return;if(k==="escape"&&state.viewing)closeViewer();if(k==="escape"&&state.auctionOpen){state.auctionOpen=false;auction.classList.remove("is-open");}if(k==="e")state.scene==="auction"?openAuction():openViewer(state.nearest);if(k==="f")carry();if(k===" "&&state.viewing){e.preventDefault();play();}});
window.addEventListener("keyup",e=>state.keys.delete(e.key.toLowerCase()));window.addEventListener("blur",()=>state.keys.clear());
viewport.addEventListener("click",e=>{if(e.target.closest("button,.viewer,.auction,.asset"))return;const r=viewport.getBoundingClientRect();state.target={x:Math.max(120,Math.min(2180,state.x+e.clientX-r.left-r.width/2)),y:Math.max(120,Math.min(1330,state.y+e.clientY-r.top-r.height/2))};viewport.focus();});
objectsLayer.addEventListener("click",e=>{const n=e.target.closest(".asset");if(!n)return;const o=scenes[state.scene].objects.find(x=>x.id===n.dataset.id);if(o&&Math.hypot(state.x-o.x,state.y-o.y)<230)state.scene==="auction"?openAuction():openViewer(o);else say("它跑得有点远，再靠近一点");});
$("#close-viewer").addEventListener("click",closeViewer);$("#bid").addEventListener("click",placeBid);
render();requestAnimationFrame(frame);
