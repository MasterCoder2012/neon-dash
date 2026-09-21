const GRID=32;

export class LevelEditor{
  constructor(canvas,opts={}){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.palette=opts.palette||[];this.onChange=opts.onChange;this.tool='block';this.pan=0;this.dpr=Math.min(devicePixelRatio||1,2);this.level=this.blank();this.dragging=false;this.resize();this.bind();}
  blank(){return{version:1,title:'Untitled Level',mode:'dash',speed:7,length:220,bg:'neon',objects:[]}}
  mount(show){this.enabled=show;this.resize();this.draw();}
  resize(){const w=this.canvas.clientWidth||800;const h=this.canvas.clientHeight||600;this.canvas.width=Math.floor(w*this.dpr);this.canvas.height=Math.floor(h*this.dpr);this.scale=Math.min(w/960,h/540);this.ox=(w-960*this.scale)/2;this.oy=(h-540*this.scale)/2;this.canvas.style.cursor=this.enabled?'crosshair':'default';}
  setTool(t){this.tool=t;}
  setLevel(level){this.level=structuredClone(level);this.level.title=this.level.title||'Untitled Level';this.draw();}
  clear(){this.level=this.blank();this.draw();this.onChange?.();}
  export(){return structuredClone(this.level)}
  saveLocal(){localStorage.setItem('neon-dash-draft',JSON.stringify(this.export()));}
  loadLocal(){try{const x=JSON.parse(localStorage.getItem('neon-dash-draft')||'null');return x&&x.objects?x:null}catch{return null}}
  worldPoint(e){const r=this.canvas.getBoundingClientRect();const sx=(e.clientX-r.left-this.ox)/this.scale+this.pan;const sy=(e.clientY-r.top-this.oy)/this.scale;return{x:Math.round(sx/GRID)*GRID,y:Math.round(sy/GRID)*GRID}}
  bind(){
    addEventListener('resize',()=>{this.resize();this.draw()});
    this.canvas.addEventListener('contextmenu',e=>e.preventDefault());
    this.canvas.addEventListener('pointerdown',e=>{if(!this.enabled)return;this.dragging=true;this.paint(e);this.canvas.setPointerCapture?.(e.pointerId)});
    this.canvas.addEventListener('pointermove',e=>{if(this.dragging)this.paint(e)});
    this.canvas.addEventListener('pointerup',e=>{this.dragging=false;this.canvas.releasePointerCapture?.(e.pointerId);});
    this.canvas.addEventListener('pointercancel',()=>this.dragging=false);
    this.canvas.addEventListener('wheel',e=>{e.preventDefault();this.pan+=Math.round(e.deltaX/2+e.deltaY/2);this.pan=Math.max(0,Math.min(this.level.length*GRID-640,this.pan));this.draw()},{passive:false});
    document.querySelectorAll('[data-pan]').forEach(b=>b.addEventListener('click',()=>{this.pan=Math.max(0,Math.min(this.level.length*GRID-640,this.pan+(Number(b.dataset.pan)||0)*8*GRID));this.draw();}));
  }
  paint(e){const p=this.worldPoint(e); if(e.button===2||this.tool==='erase'){this.level.objects=this.level.objects.filter(o=>!(p.x>=o.x&&p.x<o.x+o.w&&p.y>=o.y&&p.y<o.y+o.h));this.draw();this.onChange?.();return;}
    const size=['spike','spike_down','saw','pad','orb','coin','finish','gravity_flip','speed_up','speed_down','portal_ship','portal_cube','portal_platformer'].includes(this.tool)?32:64;
    const obj={type:this.tool,x:Math.max(0,Math.min(this.level.length*GRID-size,p.x)),y:p.y,w:size,h:size,rot:0};
    const duplicate=this.level.objects.some(o=>o.type===obj.type&&Math.abs(o.x-obj.x)<GRID&&Math.abs(o.y-obj.y)<GRID); if(!duplicate)this.level.objects.push(obj);this.draw();this.onChange?.();
  }
  draw(){const ctx=this.ctx,w=this.canvas.clientWidth||800,h=this.canvas.clientHeight||600;ctx.setTransform(this.dpr,0,0,this.dpr,0,0);ctx.clearRect(0,0,w,h);ctx.save();ctx.translate(this.ox,this.oy);ctx.scale(this.scale,this.scale);ctx.fillStyle='#050914';ctx.fillRect(0,0,960,540);ctx.save();ctx.translate(-this.pan,0);
    for(let x=0;x<=this.level.length*GRID;x+=GRID){ctx.strokeStyle=x%256===0?'rgba(0,240,255,.13)':'rgba(0,240,255,.055)';ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,540);ctx.stroke()}
    for(let y=0;y<=540;y+=GRID){ctx.strokeStyle='rgba(255,255,255,.045)';ctx.beginPath();ctx.moveTo(this.pan,y);ctx.lineTo(this.pan+960,y);ctx.stroke()}
    ctx.strokeStyle='#ff3fcf';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,456);ctx.lineTo(this.level.length*GRID,456);ctx.stroke();
    for(const o of this.level.objects){ctx.save();ctx.translate(o.x+o.w/2,o.y+o.h/2);ctx.rotate((o.rot||0)*Math.PI/180);drawEditorObject(ctx,o);ctx.restore();}
    ctx.fillStyle='rgba(255,255,255,.85)';ctx.font='700 14px system-ui';ctx.fillText(`${this.level.title} · ${this.level.mode.toUpperCase()} · ${this.level.objects.length} objects`,16,24);ctx.restore();ctx.restore();
  }
}
function drawEditorObject(ctx,o){const x=-o.w/2,y=-o.h/2;
  if(o.type==='block'){ctx.fillStyle='#15294b';ctx.fillRect(x,y,o.w,o.h);ctx.strokeStyle='#00f0ff';ctx.strokeRect(x+2,y+2,o.w-4,o.h-4)}
  else if(o.type==='spike'||o.type==='spike_down'){ctx.fillStyle='#ff3fcf';ctx.beginPath();if(o.type==='spike'){ctx.moveTo(x,y+o.h);ctx.lineTo(0,y);ctx.lineTo(o.w+x,y+o.h)}else{ctx.moveTo(x,y);ctx.lineTo(0,y+o.h);ctx.lineTo(o.w+x,y)}ctx.closePath();ctx.fill()}
  else if(o.type==='saw'){ctx.strokeStyle='#ffd84e';ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,12,0,Math.PI*2);ctx.stroke()}
  else if(o.type==='pad'){ctx.strokeStyle='#b9ff52';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(x+4,y+o.h);ctx.lineTo(0,y+4);ctx.lineTo(x+o.w-4,y+o.h);ctx.stroke()}
  else if(o.type==='orb'){ctx.strokeStyle='#00f0ff';ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,12,0,Math.PI*2);ctx.stroke()}
  else if(o.type==='coin'){ctx.strokeStyle='#ffd84e';ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,10,0,Math.PI*2);ctx.stroke()}
  else if(o.type.startsWith('portal')){ctx.strokeStyle=o.type==='portal_ship'?'#b9ff52':'#ff3fcf';ctx.lineWidth=5;ctx.beginPath();ctx.ellipse(0,0,10,16,0,0,Math.PI*2);ctx.stroke()}
  else if(o.type==='finish'){ctx.strokeStyle='#b9ff52';ctx.lineWidth=5;ctx.strokeRect(x,y,o.w,o.h)}
  else {ctx.fillStyle='#7e93b0';ctx.font='900 18px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(o.type==='gravity_flip'?'↕':o.type==='speed_up'?'>':o.type==='speed_down'?'<':o.type==='jump_through'?'▤':'·',0,0)}
}
