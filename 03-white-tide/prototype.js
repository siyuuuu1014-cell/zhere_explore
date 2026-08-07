const $ = s => document.querySelector(s);
const entry=$("#entry"),viewport=$("#viewport"),world=$("#world"),objectsLayer=$("#objects"),player=$("#player"),contextTitle=$("#context-title"),contextCopy=$("#context-copy"),viewer=$("#viewer"),viewerImage=$("#viewer-image"),viewerTitle=$("#viewer-title"),viewerStatus=$("#viewer-status"),auction=$("#auction"),price=$("#price"),bidNote=$("#bid-note"),inventory=$("#inventory"),toast=$("#toast");
const key="zhere-white-tide";
const saved=JSON.parse(localStorage.getItem(key)||"{}")||{};
const scenes={
  public:{spawn:{x:1120,y:800},objects:[
    {id:"room-wind",title:"风穿过没有人的房间",x:640,y:410},
    {id:"late-light",title:"一盏灯比街道醒得更晚",x:1030,y:300},
    {id:"quiet-crowd",title:"安静的人群正在离开",x:1500,y:480},
    {id:"blue-second",title:"蓝色多停留了一秒",x:1900,y:350},
    {id:"empty-answer",title:"没有回答的采访",x:1770,y:1050},
    {id:"slow-door",title:"门把黄昏分成两半",x:990,y:1190}
  ]},
  home:{spawn:{x:1200,y:820},objects:saved.home||[
    {id:"home-one",title:"留在左边的余像",x:800,y:500,home:true},
    {id:"home-two",title:"还没有名字的距离",x:1570,y:920,home:true}
  ]},
  auction:{spawn:{x:1320,y:930},objects:[{id:"tide-bid",title:"一段慢慢远去的庆祝",x:1320,y:620,auction:true}]}
};
const state={scene:"public",x:1120,y:800,keys:new Set(),target:null,nearest:null,carried:null,count:Number(saved.count||0),viewing:null,playing:false,auctionOpen:false,price:9,last:performance.now()};
function save(){localStorage.setItem(key,JSON.stringify({count:state.count,home:scenes.home.objects}));}
function say(m){toast.textContent=m;toast.classList.add("is-visible");clearTimeout(say.t);say.t=setTimeout(()=>toast.classList.remove("is-visible"),1900);}
function markup(o){return `<article class="asset${o.home?" is-home":""}${o.auction?" is-auction":""}" data-id="${o.id}" style="left:${o.x}px;top:${o.y}px"><div class="asset-frame"></div><span class="asset-name">${o.title}</span></article>`;}
function render(){objectsLayer.innerHTML=scenes[state.scene].objects.map(markup).join("");if(state.scene==="auction")objectsLayer.insertAdjacentHTML("beforeend",`<div class="tide-circle" id="tide-circle"></div><div class="npc-mark" data-name="回声 NPC" style="left:920px;top:750px"></div><div class="npc-mark" data-name="旧浪 NPC" style="left:1700px;top:770px"></div>`);document.querySelectorAll(".scene-button").forEach(b=>b.classList.toggle("is-active",b.dataset.scene===state.scene));updateInventory();}
function updateInventory(){inventory.textContent=state.carried?"手中有一枚余像":`余像 ${state.count}`;player.classList.toggle("has-carry",Boolean(state.carried));}
function switchScene(name){state.scene=name;state.x=scenes[name].spawn.x;state.y=scenes[name].spawn.y;state.target=null;state.nearest=null;state.auctionOpen=false;auction.classList.remove("is-open");render();updateContext();viewport.focus();}
function near(){let best=null,distance=Infinity;scenes[state.scene].objects.forEach(o=>{const d=Math.hypot(state.x-o.x,state.y-o.y);if(d<distance){distance=d;best=o;}});return distance<(state.scene==="auction"?330:210)?best:null;}
function updateContext(){state.nearest=near();document.querySelectorAll(".asset").forEach(n=>n.classList.toggle("is-near",n.dataset.id===state.nearest?.id));if(state.scene==="auction"){contextTitle.textContent=state.nearest?state.nearest.title:"潮汐还没有名字";contextCopy.textContent=state.nearest?"按 E 靠近，也可以继续往远处走":"走近圆心，或者完全忽略它";return;}if(state.carried){contextTitle.textContent=state.carried.title;contextCopy.textContent=state.scene==="home"?"按 F 把余像留在这里":"公共世界保持原样，请带回自己的空地";return;}if(state.nearest){contextTitle.textContent=state.nearest.title;contextCopy.textContent=state.scene==="public"?"按 E 观看，按 F 带走一枚余像":"按 E 观看，按 F 重新放置";return;}contextTitle.textContent=state.scene==="public"?"向任意方向走":"空地不要求被填满";contextCopy.textContent=state.scene==="home"&&state.count>0?"按 F 从收藏中取出余像":"点击空地或使用 WASD";}
function openViewer(o){if(!o)return;state.viewing=o;state.playing=false;viewerTitle.textContent=o.title;viewerStatus.textContent="空格键播放";viewerImage.classList.remove("is-playing");viewer.classList.add("is-open");viewer.setAttribute("aria-hidden","false");$("#close-viewer").focus();}
function closeViewer(){state.viewing=null;state.playing=false;viewer.classList.remove("is-open");viewer.setAttribute("aria-hidden","true");viewport.focus();}
function play(){if(!state.viewing)return;state.playing=!state.playing;viewerImage.classList.toggle("is-playing",state.playing);viewerStatus.textContent=state.playing?"正在播放占位影像，空格键暂停":"影像停在刚才的位置";}
function carry(){if(state.scene==="auction")return;if(state.carried){if(state.scene!=="home"){say("公共世界保持原样");return;}scenes.home.objects.push({id:`placed-${Date.now()}`,title:state.carried.title,x:Math.round(state.x+70),y:Math.round(state.y),home:true});state.carried=null;state.count=Math.max(0,state.count-1);render();save();say("这片空地记住了新的距离");return;}if(state.nearest&&state.scene==="public"){state.carried={title:state.nearest.title};state.count++;updateInventory();save();say("原物没有移动，你带走了一枚余像");return;}if(state.nearest&&state.scene==="home"){const i=scenes.home.objects.findIndex(o=>o.id===state.nearest.id);const[o]=scenes.home.objects.splice(i,1);state.carried={title:o.title};state.count++;render();save();say("余像离开了原来的位置");return;}if(state.scene==="home"&&state.count>0){state.carried={title:"未命名的余像"};updateInventory();say("从收藏中取出一枚余像");}}
function openAuction(){if(!state.nearest||state.scene!=="auction")return;state.auctionOpen=true;auction.classList.add("is-open");auction.setAttribute("aria-hidden","false");}
function bid(){state.price+=3;price.textContent=state.price;bidNote.textContent="你的虚拟潮汐向外扩散。";expand();clearTimeout(bid.t);bid.t=setTimeout(()=>{state.price+=2;price.textContent=state.price;bidNote.textContent="回声 NPC 投入 2 枚。它不是现实用户。";expand();},1000);}
function expand(){const circle=$("#tide-circle");if(circle)circle.style.setProperty("--tide",String(1+Math.min(.34,(state.price-9)/45)));}
function frame(time){const dt=Math.min(32,time-state.last);state.last=time;if(!state.viewing&&!state.auctionOpen){let dx=0,dy=0,speed=.23*dt;if(state.keys.has("w")||state.keys.has("arrowup"))dy--;if(state.keys.has("s")||state.keys.has("arrowdown"))dy++;if(state.keys.has("a")||state.keys.has("arrowleft"))dx--;if(state.keys.has("d")||state.keys.has("arrowright"))dx++;if(dx||dy)state.target=null;if(dx&&dy){dx*=.707;dy*=.707;}if(!dx&&!dy&&state.target){const tx=state.target.x-state.x,ty=state.target.y-state.y,d=Math.hypot(tx,ty);if(d<4)state.target=null;else{dx=tx/d;dy=ty/d;}}state.x=Math.max(120,Math.min(2480,state.x+dx*speed));state.y=Math.max(120,Math.min(1480,state.y+dy*speed));}player.style.left=`${state.x}px`;player.style.top=`${state.y}px`;world.style.transform=`translate3d(${viewport.clientWidth/2-state.x}px,${viewport.clientHeight/2-state.y}px,0)`;updateContext();requestAnimationFrame(frame);}
$("#entry-form").addEventListener("submit",e=>{e.preventDefault();const name=$("#name").value.trim()||"无名访客";$("#visitor").textContent=name;entry.classList.add("is-hidden");$("#app").setAttribute("aria-hidden","false");viewport.focus();});
document.querySelectorAll(".scene-button").forEach(b=>b.addEventListener("click",()=>switchScene(b.dataset.scene)));
window.addEventListener("keydown",e=>{const k=e.key.toLowerCase();if(["w","a","s","d","arrowup","arrowdown","arrowleft","arrowright"].includes(k)){state.keys.add(k);e.preventDefault();}if(e.repeat)return;if(k==="escape"&&state.viewing)closeViewer();if(k==="escape"&&state.auctionOpen){state.auctionOpen=false;auction.classList.remove("is-open");}if(k==="e")state.scene==="auction"?openAuction():openViewer(state.nearest);if(k==="f")carry();if(k===" "&&state.viewing){e.preventDefault();play();}});
window.addEventListener("keyup",e=>state.keys.delete(e.key.toLowerCase()));window.addEventListener("blur",()=>state.keys.clear());
viewport.addEventListener("click",e=>{if(e.target.closest("button,.viewer,.auction,.asset"))return;const r=viewport.getBoundingClientRect();state.target={x:Math.max(120,Math.min(2480,state.x+e.clientX-r.left-r.width/2)),y:Math.max(120,Math.min(1480,state.y+e.clientY-r.top-r.height/2))};viewport.focus();});
objectsLayer.addEventListener("click",e=>{const n=e.target.closest(".asset");if(!n)return;const o=scenes[state.scene].objects.find(x=>x.id===n.dataset.id);if(o&&Math.hypot(state.x-o.x,state.y-o.y)<245)state.scene==="auction"?openAuction():openViewer(o);else say("再靠近一些，它还没有显出名字");});
$("#close-viewer").addEventListener("click",closeViewer);$("#bid").addEventListener("click",bid);render();requestAnimationFrame(frame);
