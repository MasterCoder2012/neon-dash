import { NeonGame } from './game.js';
import { LevelEditor } from './editor.js';

const state = { user:null, levels:[], currentLevel:null, levelIndex:0, game:null, editor:null, attempts:1 };
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const OBJECTS = [
  ['block','■ Block'],['spike','▲ Spike'],['spike_down','▼ Spike Down'],['saw','⚙ Saw'],['pad','🟢 Pad'],['orb','○ Orb'],['coin','◆ Coin'],['portal_ship','◉ Ship'],['portal_cube','◇ Cube'],['portal_platformer','▣ Runner'],['gravity_flip','↕ Gravity'],['speed_up','» Speed+'],['speed_down','« Speed-'],['finish','🏁 Finish'],['jump_through','▤ Platform'],['deco','· Deco']
];

boot();

async function boot(){
  bindNav();
  bindHome();
  state.user = (await api('/api/auth/me')).user || null;
  updateAccountButton();
  setupGame();
  setupEditor();
  await loadLevels();
  showView('home');
}

function bindNav(){
  $$('[data-nav]').forEach(btn=>btn.addEventListener('click',()=>showView(btn.dataset.nav)));
  $('#accountButton').addEventListener('click',()=>showView('account'));
}

function showView(view){
  if(state.game?.running){state.game.stop();$('#gameView').classList.add('hidden');}
  if(view==='editor') { $('#editorView').classList.add('active'); state.editor?.mount(true); }
  if(view==='levels') renderLevels();
  if(view==='leaderboard') prepareLeaderboard();
  if(view==='account') renderAccount();
  if(view==='home') renderHome();
  $$('.view').forEach(el=>el.classList.toggle('active', el.id === `${view}View`));
}

function bindHome(){
  $('#levelSearch').addEventListener('input',renderLevels);
  $('#levelMode').addEventListener('change',renderLevels);
  $('#levelSort').addEventListener('change',renderLevels);
  $('#lbLoad').addEventListener('click',loadLeaderboard);
  $('#editorTest').addEventListener('click',testEditorLevel);
  $('#editorSave').addEventListener('click',()=>{state.editor.saveLocal();toast('Draft saved locally');});
  $('#editorClear').addEventListener('click',()=>state.editor.clear());
  $('#editorPublish').addEventListener('click',publishEditorLevel);
  $('#resumeBtn').addEventListener('click',()=>{ $('#gameMenu').classList.add('hidden'); state.game.togglePause(); });
  $('#restartBtn').addEventListener('click',()=>{ $('#gameMenu').classList.add('hidden'); state.game.restart(); });
  $('#leaveGameBtn').addEventListener('click',leaveGame);
  $('#replayBtn').addEventListener('click',()=>{ $('#completeCard').classList.add('hidden'); state.game.load(state.currentLevel,state.attempts+1); });
  $('#completeMenuBtn').addEventListener('click',leaveGame);
  $('#nextLevelBtn').addEventListener('click',nextLevel);
  bindMobileControl('#leftControl','left'); bindMobileControl('#rightControl','right'); bindMobileControl('#jumpControl','jump');
}

function bindMobileControl(selector,key){
  const el=$(selector); ['pointerdown','touchstart'].forEach(e=>el.addEventListener(e,ev=>{ev.preventDefault();state.game?.setInput(key,true);}));
  ['pointerup','pointercancel','pointerleave','touchend'].forEach(e=>el.addEventListener(e,ev=>{ev.preventDefault();state.game?.setInput(key,false);}));
}

function setupGame(){
  const canvas=$('#gameCanvas');
  state.game=new NeonGame(canvas,{
    onRestart:()=>{state.attempts++;updateAttemptHud();},
    onPause:paused=>$('#gameMenu').classList.toggle('hidden',!paused),
    onDeath:()=>{toast('CRASH — R to restart'); setTimeout(()=>{if(state.currentLevel && !state.game.running) state.game.load(state.currentLevel,state.attempts);},450);},
    onProgress:p=>{ $('#progressBar').style.width=`${p}%`; },
    onComplete:handleComplete
  });
}

function setupEditor(){
  state.editor=new LevelEditor($('#editorCanvas'),{palette:OBJECTS,onChange:()=>updateEditorTitle()});
  state.editor.mount(false);
  $('#objectPalette').innerHTML=OBJECTS.map(([type,label],i)=>`<button class="tool-btn ${i===0?'active':''}" data-type="${type}">${label}</button>`).join('');
  $$('#objectPalette .tool-btn').forEach(btn=>btn.addEventListener('click',()=>{$$('#objectPalette .tool-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');state.editor.setTool(btn.dataset.type);}));
  $('#editorName').addEventListener('input',updateEditorTitle);$('#editorMode').addEventListener('change',()=>state.editor.level.mode=$('#editorMode').value);$('#editorSpeed').addEventListener('input',()=>state.editor.level.speed=Number($('#editorSpeed').value)||7);
  const local=state.editor.loadLocal(); if(local){state.editor.setLevel(local); syncEditorForm();}
}

function updateEditorTitle(){$('#editorTitle').textContent=$('#editorName').value||'Untitled Level';}
function syncEditorForm(){const l=state.editor.level;$('#editorName').value=l.title||'Untitled Level';$('#editorMode').value=l.mode;$('#editorSpeed').value=l.speed;updateEditorTitle();}

async function loadLevels(){
  const res=await api('/api/levels?sort=featured&limit=100'); state.levels=res.levels||[]; renderHome(); renderLevels(); prepareLeaderboard();
}

function renderHome(){
  const main=state.levels.filter(l=>l.isMain).slice(0,6);
  $('#homeMainLevels').innerHTML=main.length?main.map(levelMini).join(''):`<div class="meta">Run the DB seed to load the main campaign.</div>`;
  const community=state.levels.filter(l=>!l.isMain).slice(0,4);
  $('#homeCommunity').innerHTML=community.length?community.map(l=>`<div class="pulse"><strong>${escapeHTML(l.title)}</strong><span class="meta">${escapeHTML(l.author)} · ${l.mode} · ${l.plays} plays</span></div>`).join(''):`<div class="meta">No community levels yet.</div>`;
  $$('#homeMainLevels [data-level-id]').forEach(b=>b.addEventListener('click',()=>playLevel(Number(b.dataset.levelId))));
}
function levelMini(l){return `<button class="mini-level" data-level-id="${l.id}"><strong>${escapeHTML(l.title)}</strong><div class="meta">${escapeHTML(l.author)} · ${l.mode}</div><div class="chips"><span class="chip ok">✓ Verified</span>${l.isMain?'<span class="chip">Main</span>':''}</div></button>`}

function renderLevels(){
  let items=[...state.levels]; const q=$('#levelSearch').value.toLowerCase().trim(); const mode=$('#levelMode').value; const sort=$('#levelSort').value;
  if(q)items=items.filter(l=>`${l.title} ${l.author} ${l.description}`.toLowerCase().includes(q)); if(mode!=='all')items=items.filter(l=>l.mode===mode);
  if(sort==='new')items.sort((a,b)=>b.createdAt-a.createdAt);if(sort==='plays')items.sort((a,b)=>b.plays-a.plays); if(sort==='featured')items.sort((a,b)=>(b.isMain-a.isMain)||(b.featured-a.featured)||(a.mainOrder-b.mainOrder));
  $('#levelGrid').innerHTML=items.length?items.map(levelCard).join(''):`<div class="panel" style="grid-column:1/-1"><div class="meta">No levels matched that filter.</div></div>`;
  $$('#levelGrid [data-level-id]').forEach(b=>b.addEventListener('click',()=>playLevel(Number(b.dataset.levelId))));
}
function levelCard(l){return `<button class="level-card" data-level-id="${l.id}"><div><div class="eyebrow">${l.isMain?'MAIN':'COMMUNITY'} · ${l.mode.toUpperCase()}</div><div class="title">${escapeHTML(l.title)}</div><p class="meta">${escapeHTML(l.description||'No description')}</p></div><div><div class="meta">by ${escapeHTML(l.author)} · ${l.plays} plays</div><div class="chips"><span class="chip ${l.verified?'ok':''}">${l.verified?'✓ Verified':'Unverified'}</span>${l.featured?'<span class="chip">Featured</span>':''}</div></div></button>`}

function playLevel(id){
  const idx=state.levels.findIndex(l=>l.id===id); if(idx<0)return; state.levelIndex=idx; state.currentLevel=state.levels[idx]; state.attempts=1; $('#gameView').classList.remove('hidden'); $('#gameLevelName').textContent=state.currentLevel.title; $('#gameMode').textContent=state.currentLevel.mode.toUpperCase(); $('#progressBar').style.width='0%'; updateAttemptHud(); $('#gameMenu').classList.add('hidden'); $('#completeCard').classList.add('hidden'); state.game.load(state.currentLevel.data,state.attempts);
}
function updateAttemptHud(){ $('#attemptText').textContent=`Attempt ${state.attempts}`; }

async function handleComplete(stats){
  $('#completeCard').classList.remove('hidden'); $('#completeTitle').textContent=state.currentLevel.title; $('#completeStats').innerHTML=`<div class="meta">100% · ${(stats.runMs/1000).toFixed(2)}s · ${stats.coins} coins · Attempt ${stats.attempts}</div>`;
  if(state.user){
    const res=await api(`/api/levels/${state.currentLevel.id}/score`,'POST',{replay:stats.replay,runMs:stats.runMs,attempts:stats.attempts});
    toast(res.ok?'Score verified and submitted!':(res.error||'Score not submitted'));
  } else toast('Guest clear — login to save a verified high score');
}
function nextLevel(){
  $('#completeCard').classList.add('hidden'); let next=state.levelIndex+1; const mains=state.levels.filter(l=>l.isMain); const currentIsMain=state.currentLevel?.isMain; if(currentIsMain){const p=mains.findIndex(l=>l.id===state.currentLevel.id); if(p>=0&&mains[p+1]){state.levelIndex=state.levels.findIndex(l=>l.id===mains[p+1].id);state.currentLevel=mains[p+1];state.attempts=1;state.game.load(state.currentLevel.data,1);$('#gameLevelName').textContent=state.currentLevel.title;return;}} if(next>=state.levels.length)next=0;playLevel(state.levels[next].id);
}
function leaveGame(){state.game.stop();$('#gameView').classList.add('hidden');$('#completeCard').classList.add('hidden');showView('levels');}

function prepareLeaderboard(){
  $('#lbLevel').innerHTML=state.levels.filter(l=>l.verified).map(l=>`<option value="${l.id}">${escapeHTML(l.title)} · ${l.mode}</option>`).join(''); loadLeaderboard();
}
async function loadLeaderboard(){const id=$('#lbLevel').value;if(!id)return;const res=await api(`/api/leaderboard?level=${id}`);$('#lbRows').innerHTML=(res.rows||[]).map((r,i)=>`<tr><td>${i+1}</td><td>${escapeHTML(r.username)}</td><td>${r.percent.toFixed?.(0)||r.percent}%</td><td>${(r.run_ms/1000).toFixed(2)}s</td><td>${r.attempts}</td></tr>`).join('')||'<tr><td colspan="5" class="meta">No verified scores yet.</td></tr>';}

function renderAccount(){
  const p=$('#accountPanel');
  if(!state.user){p.innerHTML=`<div class="panel account-card"><div class="eyebrow">WELCOME, PLAYER</div><h2>Sign in to publish</h2><p class="account-note">Accounts unlock verified online scores, level publishing and creator tools.</p><button id="loginOpen" class="big-btn accent">Login / Register</button></div><div class="panel account-card"><div class="eyebrow">GUEST MODE</div><p class="account-note">You can play locally without an account. Published levels and online leaderboards require a logged-in player.</p></div>`;$('#loginOpen').onclick=showAuthModal;return;}
  p.innerHTML=`<div class="panel account-card"><div class="eyebrow">PLAYER PROFILE</div><h2>${escapeHTML(state.user.username)}</h2><p class="account-note">Role: <strong>${state.user.role}</strong><br/>Online score submission: enabled</p><button id="logoutBtn" class="big-btn">Logout</button></div>${['moderator','admin'].includes(state.user.role)?`<div class="panel account-card"><div class="eyebrow">STAFF</div><h2>Community Control</h2><p class="account-note">Manage featured/main levels, reports, bans and roles.</p><button id="modOpen" class="big-btn accent">Open Moderator Panel</button></div>`:''}`;
  $('#logoutBtn').onclick=async()=>{await api('/api/auth/logout','POST',{});state.user=null;updateAccountButton();renderAccount();toast('Logged out');};
  $('#modOpen')?.addEventListener('click',openModerator);
}
function updateAccountButton(){ $('#accountButton').textContent=state.user?`👤 ${state.user.username}`:'Account'; }
function showAuthModal(){
  openModal(`<div class="eyebrow">ACCOUNT</div><h2>Login / Register</h2><input id="authUser" class="field" placeholder="username"/><input id="authPass" class="field" placeholder="password (6+ chars)" type="password"/><div class="hero-buttons"><button id="loginAction" class="big-btn accent">Login</button><button id="registerAction" class="big-btn">Register</button></div>`);
  $('#loginAction').onclick=()=>auth('login');$('#registerAction').onclick=()=>auth('register');
}
async function auth(mode){const username=$('#authUser').value.trim(),password=$('#authPass').value; const r=await api(`/api/auth/${mode}`,'POST',{username,password});if(!r.ok){toast(r.error||'Auth failed');return;}state.user=r.user;closeModal();updateAccountButton();renderAccount();toast(mode==='login'?'Logged in':'Account created');}

async function publishEditorLevel(){
  if(!state.user){showAuthModal();return;}
  const level=state.editor.export();
  const title=$('#editorName').value.trim()||'Untitled Level';
  if(level.objects.length<3){toast('Add a few obstacles first');return;}
  const moderation=await api('/api/ai/moderate','POST',{title,description:'Community arcade level'});
  if(moderation.available && moderation.allowed===false){toast('The content filter flagged this title/description for moderator review');return;}
  const res=await api('/api/levels','POST',{title,description:'Built in the Neon Dash editor',level});
  if(!res.ok){toast(res.error||'Publish failed');return;}
  state.levels.unshift(res.level);state.editor.clear();toast('Published! Verifier passed.');showView('levels');renderLevels();
}
async function testEditorLevel(){const level=state.editor.export();const res=await api('/api/verify','POST',{level});toast(res.verification?.verified?`Bot verified: variant ${res.verification.attempts.find(a=>a.completed)?.variant+1}`:'Bot could not confirm a route');}

async function openModerator(){
  const res=await api('/api/mod'); if(!res.ok){toast(res.error||'No access');return;}
  const levelRows=(res.levels||[]).map(l=>`<tr><td>${l.id}</td><td>${escapeHTML(l.title)}</td><td>${l.author}</td><td>${l.verified?'✓':'—'}</td><td><button data-mod="main" data-id="${l.id}" data-value="${l.is_main?0:1}" class="tiny-btn">${l.is_main?'Remove main':'Make main'}</button> <button data-mod="feature" data-id="${l.id}" data-value="${l.featured?0:1}" class="tiny-btn">${l.featured?'Unfeature':'Feature'}</button> <button data-mod="unpublish" data-id="${l.id}" class="tiny-btn">Hide</button></td></tr>`).join('');
  const userRows=(res.users||[]).map(u=>`<tr><td>${u.id}</td><td>${escapeHTML(u.username)}</td><td><select class="field mod-role" data-user="${u.id}"><option ${u.role==='player'?'selected':''}>player</option><option ${u.role==='moderator'?'selected':''}>moderator</option><option ${u.role==='admin'?'selected':''}>admin</option></select></td><td>${u.banned?'Banned':'Active'}</td><td><button data-mod="ban" data-id="${u.id}" data-value="${u.banned?0:1}" class="tiny-btn">${u.banned?'Unban':'Ban'}</button></td></tr>`).join('');
  openModal(`<div class="eyebrow">STAFF CONSOLE</div><h2>Moderation</h2><div class="table-wrap"><table><thead><tr><th>ID</th><th>LEVEL</th><th>AUTHOR</th><th>VERIFY</th><th>ACTIONS</th></tr></thead><tbody>${levelRows}</tbody></table></div><hr style="width:100%;border-color:#1a2741"><div class="table-wrap"><table><thead><tr><th>ID</th><th>USER</th><th>ROLE</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>${userRows}</tbody></table></div><button id="modClose" class="big-btn">Close</button>`);
  $$('[data-mod]').forEach(btn=>btn.addEventListener('click',async()=>{const action=btn.dataset.mod;let payload={action,levelId:Number(btn.dataset.id),value:Boolean(Number(btn.dataset.value))};if(action==='ban')payload={action,userId:Number(btn.dataset.id),value:Boolean(Number(btn.dataset.value))};const r=await api('/api/mod','POST',payload);toast(r.ok?'Done':r.error||'Failed');if(r.ok)openModerator();}));
  $$('.mod-role').forEach(sel=>sel.addEventListener('change',async()=>{const r=await api('/api/mod','POST',{action:'role',userId:Number(sel.dataset.user),role:sel.value});toast(r.ok?'Role updated':r.error||'Failed');}));
  $('#modClose').onclick=closeModal;
}

async function api(url,method='GET',data){
  const opts={method,headers:{'content-type':'application/json'}}; if(method!=='GET')opts.body=JSON.stringify(data||{});
  try{const r=await fetch(url,opts);return await r.json();}catch(e){return{ok:false,error:e.message||'Network error'}}
}
function openModal(html){$('#modalContent').innerHTML=html;$('#modal').classList.remove('hidden');}function closeModal(){$('#modal').classList.add('hidden');}
$('#modal').addEventListener('click',e=>{if(e.target.classList.contains('modal-backdrop'))closeModal();});
function toast(text){const el=$('#toast');el.textContent=text;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),2400)}
function escapeHTML(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
