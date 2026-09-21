const PLAYER = 24;
const FLOOR_Y = 456;
const GRAVITY = 0.55;
const JUMP = -10.4;
const GRID = 32;

export class NeonGame {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.options = options;
    this.level = null;
    this.running = false;
    this.paused = false;
    this.attempt = 1;
    this.runStart = 0;
    this.replay = [];
    this.input = { jump: false, left: false, right: false };
    this.prevInput = { ...this.input };
    this.cameraX = 0;
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.resize();
    addEventListener('resize', () => this.resize());
    this.bindKeys();
  }

  resize() {
    const w = this.canvas.clientWidth || innerWidth;
    const h = this.canvas.clientHeight || innerHeight;
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.scale = Math.min(w / 960, h / 540);
    this.offsetX = (w - 960 * this.scale) / 2;
    this.offsetY = (h - 540 * this.scale) / 2;
  }

  bindKeys() {
    addEventListener('keydown', e => {
      if (['Space','ArrowUp'].includes(e.code)) { e.preventDefault(); this.setInput('jump', true); }
      if (['ArrowLeft','KeyA'].includes(e.code)) { e.preventDefault(); this.setInput('left', true); }
      if (['ArrowRight','KeyD'].includes(e.code)) { e.preventDefault(); this.setInput('right', true); }
      if (e.code === 'KeyR' && this.running) this.restart();
      if (e.code === 'Escape' && this.running) this.togglePause();
    });
    addEventListener('keyup', e => {
      if (['Space','ArrowUp'].includes(e.code)) this.setInput('jump', false);
      if (['ArrowLeft','KeyA'].includes(e.code)) this.setInput('left', false);
      if (['ArrowRight','KeyD'].includes(e.code)) this.setInput('right', false);
    });
    this.canvas.addEventListener('pointerdown', e => {
      if (!this.level || !this.running) return;
      if (e.pointerType === 'touch') this.setInput('jump', true);
    });
    this.canvas.addEventListener('pointerup', e => {
      if (e.pointerType === 'touch') this.setInput('jump', false);
    });
  }

  setInput(key, value) {
    if (this.input[key] === value) return;
    this.input[key] = value;
    if (this.running) this.replay.push({ t: performance.now() - this.runStart, key, down: value });
  }

  load(level, attempt = 1) {
    this.level = structuredClone(level);
    this.attempt = attempt;
    this.running = true;
    this.paused = false;
    this.finished = false;
    this.dead = false;
    this.cameraX = 0;
    this.replay = [];
    this.runStart = performance.now();
    this.state = {
      x: 64, y: FLOOR_Y - PLAYER, vx: level.mode === 'platformer' ? 0 : level.speed,
      vy: 0, gravity: 1, mode: level.mode, grounded: true, coins: 0,
      jump: false, _jumpPrev: false
    };
    for (const obj of this.level.objects) delete obj._collected;
    this.loopId = requestAnimationFrame(this.frame.bind(this));
  }

  restart() {
    if (!this.level) return;
    this.options.onRestart?.();
    this.load(this.level, this.attempt + 1);
  }

  togglePause() {
    this.paused = !this.paused;
    this.options.onPause?.(this.paused);
    if (!this.paused) this.loopId = requestAnimationFrame(this.frame.bind(this));
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.loopId);
  }

  frame(now) {
    if (!this.running) return;
    if (!this.paused) {
      this.update();
      this.render();
      this.options.onProgress?.(Math.max(0, Math.min(100, (this.state.x / (this.level.length * GRID)) * 100)));
    }
    this.loopId = requestAnimationFrame(this.frame.bind(this));
  }

  update() {
    const s = this.state;
    const jumpPressed = this.input.jump && !this.prevInput.jump;
    this.prevInput = { ...this.input };

    if (s.mode === 'dash') {
      s.x += s.vx;
      s.vy += GRAVITY * s.gravity;
      s.y += s.vy;
      if (s.y + PLAYER >= FLOOR_Y) { s.y = FLOOR_Y - PLAYER; s.vy = 0; s.grounded = true; }
      else s.grounded = false;
      if (jumpPressed && s.grounded) s.vy = JUMP * s.gravity;
      if (jumpPressed && this.nearTrigger('orb', 86)) s.vy = JUMP * 1.1 * s.gravity;
      if (s.mode === 'dash') s.vx = Math.max(4, Math.min(12, s.vx));
    } else if (s.mode === 'ship') {
      s.x += s.vx;
      s.vy += this.input.jump ? -0.55 : 0.28;
      s.vy = Math.max(-5.5, Math.min(5.5, s.vy));
      s.y += s.vy;
      s.grounded = false;
    } else {
      const move = (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0);
      s.vx += move * .55;
      s.vx *= .82;
      s.vx = Math.max(-6, Math.min(6, s.vx));
      s.x += s.vx;
      s.vy += GRAVITY * s.gravity;
      s.y += s.vy;
      if (s.y + PLAYER >= FLOOR_Y) { s.y = FLOOR_Y - PLAYER; s.vy = 0; s.grounded = true; }
      else s.grounded = false;
      if (jumpPressed && s.grounded) s.vy = JUMP * s.gravity;
    }

    this.applyInteractions();
    const hit = this.findCollision();
    if (hit) this.handleHit(hit);
    const endX = this.level.length * GRID;
    this.state.x = Math.max(0, Math.min(endX + 96, s.x));
    if (s.y > 650 || s.y < -220) this.die();
    if (s.x >= endX && !this.finished) this.complete();
  }

  applyInteractions() {
    const s = this.state;
    for (const obj of this.level.objects) {
      if (obj.x > s.x + 90 || obj.x + obj.w < s.x - 64 || obj._used) continue;
      if (['speed_up','speed_down'].includes(obj.type) && this.nearTrigger(obj.type, 24)) {
        s.vx = obj.type === 'speed_up' ? Math.min(11, Math.max(4, s.vx * 1.12)) : Math.max(4, s.vx * .88);
        obj._used = true;
      }
      if (obj.type === 'gravity_flip' && this.nearTrigger(obj.type, 22)) { s.gravity *= -1; obj._used = true; }
      if (obj.type === 'portal_platformer' && this.nearTrigger(obj.type, 26)) { s.mode = 'platformer'; obj._used = true; }
      if (obj.type === 'portal_cube' && this.nearTrigger(obj.type, 26)) { s.mode = 'dash'; s.vx = Math.max(6, s.vx); obj._used = true; }
      if (obj.type === 'portal_ship' && this.nearTrigger(obj.type, 26)) { s.mode = 'ship'; s.vx = Math.max(6, s.vx); obj._used = true; }
      if (obj.type === 'portal_cube' && s.mode === 'ship' && this.nearTrigger(obj.type, 26)) { s.mode = 'dash'; obj._used = true; }
    }
  }

  nearTrigger(typeOrObj, distance) {
    const s = this.state;
    for (const obj of this.level.objects) {
      if ((typeof typeOrObj === 'string' && obj.type !== typeOrObj) || obj._used) continue;
      if (Math.abs((s.x + PLAYER/2) - (obj.x + obj.w/2)) < distance + PLAYER/2 && Math.abs((s.y + PLAYER/2) - (obj.y + obj.h/2)) < obj.h/2 + PLAYER/2) return true;
    }
    return false;
  }

  findCollision() {
    const p = {x:this.state.x,y:this.state.y,w:PLAYER,h:PLAYER};
    for (const obj of this.level.objects) {
      if (obj._collected) continue;
      if (obj.type === 'coin' && this.overlap(p,obj)) return obj;
      if (['spike','spike_down','saw'].includes(obj.type) && this.overlap(p,obj)) return obj;
      if (['pad','orb','finish'].includes(obj.type) && this.overlap(p,obj)) return obj;
      if (obj.type === 'block' && this.overlap(p,obj)) {
        const bottom = p.y + p.h - obj.y;
        const top = obj.y + obj.h - p.y;
        if (bottom > 0 && bottom < 18 && this.state.vy >= 0) { this.state.y = obj.y - PLAYER; this.state.vy = 0; this.state.grounded = true; }
        else if (top > 0 && top < 18 && this.state.vy < 0) { this.state.y = obj.y + obj.h; this.state.vy = 0; }
        else return obj;
      }
    }
    return null;
  }

  handleHit(obj) {
    if (obj.type === 'coin') { obj._collected = true; this.state.coins++; return; }
    if (obj.type === 'pad') { this.state.vy = JUMP * 1.16 * this.state.gravity; return; }
    if (obj.type === 'orb' && this.input.jump) { this.state.vy = JUMP * 1.12 * this.state.gravity; return; }
    if (obj.type === 'finish') { this.complete(); return; }
    if (obj.type === 'deco' || obj.type === 'jump_through') return;
    this.die();
  }

  overlap(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y}

  die() {
    if (this.dead || this.finished) return;
    this.dead = true;
    this.options.onDeath?.({ attempt: this.attempt, replay: this.replay.slice() });
    this.stop();
  }

  complete() {
    if (this.finished || this.dead) return;
    this.finished = true;
    this.running = false;
    const runMs = Math.round(performance.now() - this.runStart);
    this.options.onComplete?.({
      percent: 100,
      runMs,
      attempts: this.attempt,
      coins: this.state.coins,
      replay: this.replay.slice()
    });
  }

  render() {
    const ctx = this.ctx;
    const w = this.canvas.clientWidth || innerWidth;
    const h = this.canvas.clientHeight || innerHeight;
    ctx.setTransform(this.dpr,0,0,this.dpr,0,0);
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle='#03050c'; ctx.fillRect(0,0,w,h);
    ctx.save(); ctx.translate(this.offsetX, this.offsetY); ctx.scale(this.scale,this.scale);
    this.drawBackground(ctx);
    this.cameraX = Math.max(0, this.state.x - 280);
    ctx.save(); ctx.translate(-this.cameraX,0);
    this.drawObjects(ctx);
    this.drawPlayer(ctx);
    ctx.restore();
    ctx.restore();
  }

  drawBackground(ctx) {
    const grad=ctx.createLinearGradient(0,0,0,540);grad.addColorStop(0,'#081028');grad.addColorStop(1,'#04050c');ctx.fillStyle=grad;ctx.fillRect(0,0,960,540);
    ctx.strokeStyle='rgba(0,240,255,.08)';ctx.lineWidth=1;for(let x=0;x<Math.max(960,this.level.length*GRID);x+=GRID){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,540);ctx.stroke()}for(let y=36;y<540;y+=GRID){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(Math.max(960,this.level.length*GRID),y);ctx.stroke()}
    ctx.fillStyle='rgba(0,240,255,.11)';ctx.fillRect(this.cameraX, FLOOR_Y, 960, 84);ctx.fillStyle='rgba(255,63,207,.13)';ctx.fillRect(this.cameraX, 0, 960, 3);
  }

  drawObjects(ctx) {
    for (const o of this.level.objects) {
      if (o.x < this.cameraX - 80 || o.x > this.cameraX + 1040) continue;
      ctx.save(); ctx.translate(o.x + o.w/2,o.y + o.h/2); ctx.rotate((o.rot||0)*Math.PI/180);
      const x=-o.w/2,y=-o.h/2;
      if(o.type==='block'){ctx.fillStyle='#172b52';ctx.fillRect(x,y,o.w,o.h);ctx.strokeStyle='#00f0ff';ctx.lineWidth=2;ctx.strokeRect(x+2,y+2,o.w-4,o.h-4);}
      else if(o.type==='spike'||o.type==='spike_down'){ctx.fillStyle='#ff3fcf';ctx.shadowColor='#ff3fcf';ctx.shadowBlur=16;ctx.beginPath();if(o.type==='spike'){ctx.moveTo(x,y+o.h);ctx.lineTo(x+o.w/2,y);ctx.lineTo(x+o.w,y+o.h)}else{ctx.moveTo(x,y);ctx.lineTo(x+o.w/2,y+o.h);ctx.lineTo(x+o.w,y)}ctx.closePath();ctx.fill();}
      else if(o.type==='saw'){ctx.strokeStyle='#ffd84e';ctx.lineWidth=5;ctx.shadowColor='#ffd84e';ctx.shadowBlur=13;ctx.beginPath();ctx.arc(0,0,Math.min(o.w,o.h)/2-5,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(0,0,5,0,Math.PI*2);ctx.fillStyle='#ffd84e';ctx.fill();}
      else if(o.type==='pad'){ctx.fillStyle='#b9ff52';ctx.shadowColor='#b9ff52';ctx.shadowBlur=16;ctx.fillRect(x,y+o.h*.55,o.w,o.h*.45);ctx.beginPath();ctx.moveTo(x+4,y+o.h*.57);ctx.lineTo(0,y+4);ctx.lineTo(o.w/2-2,y+o.h*.57);ctx.strokeStyle='#06100a';ctx.lineWidth=4;ctx.stroke();}
      else if(o.type==='orb'){ctx.strokeStyle='#00f0ff';ctx.lineWidth=5;ctx.shadowColor='#00f0ff';ctx.shadowBlur=14;ctx.beginPath();ctx.arc(0,0,Math.min(o.w,o.h)/2-5,0,Math.PI*2);ctx.stroke();ctx.fillStyle='rgba(0,240,255,.18)';ctx.beginPath();ctx.arc(0,0,8,0,Math.PI*2);ctx.fill();}
      else if(o.type==='coin'){ctx.strokeStyle='#ffd84e';ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,10,0,Math.PI*2);ctx.stroke();ctx.fillStyle='rgba(255,216,78,.18)';ctx.fill();}
      else if(o.type.startsWith('portal')){ctx.strokeStyle=o.type==='portal_ship'?'#b9ff52':'#ff3fcf';ctx.lineWidth=5;ctx.shadowColor=ctx.strokeStyle;ctx.shadowBlur=18;ctx.beginPath();ctx.ellipse(0,0,o.w*.32,o.h*.48,0,0,Math.PI*2);ctx.stroke();}
      else if(o.type==='finish'){ctx.strokeStyle='#b9ff52';ctx.lineWidth=5;ctx.setLineDash([8,6]);ctx.strokeRect(x,y,o.w,o.h);ctx.setLineDash([]);}
      else if(o.type==='gravity_flip'||o.type==='speed_up'||o.type==='speed_down'){ctx.fillStyle=o.type==='gravity_flip'?'#ff8c3c':o.type==='speed_up'?'#00f0ff':'#6e84ff';ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=12;ctx.beginPath();ctx.arc(0,0,9,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.font='900 14px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(o.type==='gravity_flip'?'↕':o.type==='speed_up'?'>':'<',0,1);}
      else if(o.type==='deco'){ctx.fillStyle='rgba(255,255,255,.14)';ctx.fillRect(x,y,o.w,o.h)}
      ctx.restore();
    }
  }

  drawPlayer(ctx) {
    const s=this.state;ctx.save();ctx.translate(s.x+PLAYER/2,s.y+PLAYER/2);ctx.rotate((s.x/7)% (Math.PI*2));
    ctx.fillStyle='#071019';ctx.strokeStyle='#00f0ff';ctx.lineWidth=4;ctx.shadowColor='#00f0ff';ctx.shadowBlur=20;ctx.fillRect(-PLAYER/2,-PLAYER/2,PLAYER,PLAYER);ctx.strokeRect(-PLAYER/2+2,-PLAYER/2+2,PLAYER-4,PLAYER-4);ctx.fillStyle='#ff3fcf';ctx.fillRect(-5,-5,10,10);ctx.restore();
  }
}
