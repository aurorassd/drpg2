/* -----------------------------------------------------------
 * Mini Rogue – v0.7.1
 * - v0.7 の構文ミス修正 (stats 表示式)
 * - グローバルエラーハンドリング: 画面 & コンソールに詳細表示
 * --------------------------------------------------------- */

/* ========= エラーハンドリング ========= */
function showFatal(err){
  console.error(err);
  const div=document.getElementById("fatal");
  div.textContent=`⚠️  FATAL ERROR  ⚠️\n\n${err.message || err}\n\n詳細はコンソール (F12) をご確認ください。`;
  div.style.display="block";
}
window.addEventListener("error", e=>showFatal(e.error||e.message));
window.addEventListener("unhandledrejection", e=>showFatal(e.reason));

/* ========= 以降は v0.7 本体 ＋ バグ修正 ========= */
const TILE=16, W=20, H=20, FLOOR=0, WALL=1;
const COLOR={
  floor:"#444", wall:"#666",
  player:"#00e676", enemy:"#ff5252",
  heal:"#00bcd4", power:"#ffc107"
};
const MISS_RATE=0.15;
const R=n=>Math.floor(Math.random()*n);
const RNG=(a,b)=>a+R(b-a+1);
const ADJ=(ax,ay,bx,by)=>Math.abs(ax-bx)+Math.abs(ay-by)===1;

/* ドットパターン */
function pat(color,noise=0){
  const cv=document.createElement("canvas");cv.width=cv.height=TILE;
  const g=cv.getContext("2d");g.fillStyle=color;g.fillRect(0,0,TILE,TILE);
  if(noise){
    const d=g.getImageData(0,0,TILE,TILE);
    for(let i=0;i<d.data.length;i+=4){
      const v=(Math.random()*noise)|0;
      d.data[i]+=v;d.data[i+1]+=v;d.data[i+2]+=v;
    }g.putImageData(d,0,0);
  }return g.createPattern(cv,"repeat");
}

/* マップ生成（壁多め） */
function genMap(){
  const m=Array.from({length:H},()=>Array(W).fill(WALL));
  let x=R(W),y=R(H);m[y][x]=FLOOR;
  for(let i=0;i<W*H*3;i++){
    const d=R(4);
    if(d===0&&y>1)   y--;
    if(d===1&&y<H-2) y++;
    if(d===2&&x>1)   x--;
    if(d===3&&x<W-2) x++;
    m[y][x]=FLOOR;
  }
  return m;
}

/* --- エンティティ --- */
let ENEMY_SEQ=1;
class Entity{constructor(x,y,c,h){this.x=x;this.y=y;this.col=c;this.hp=h;}
  draw(g){g.fillStyle=this.col;g.fillRect(this.x*TILE,this.y*TILE,TILE,TILE);} }
class Player extends Entity{constructor(x,y){super(x,y,COLOR.player,20);this.atkBonus=0;}}
class Enemy  extends Entity{
  constructor(x,y){super(x,y,COLOR.enemy,RNG(5,12));this.id=ENEMY_SEQ++;}
  act(gm){
    if(ADJ(this.x,this.y,gm.p.x,gm.p.y)){
      if(Math.random()<MISS_RATE){gm.elog(`敵${this.id} の攻撃は外れた`);return;}
      const dmg=RNG(1,6);gm.p.hp-=dmg;gm.elog(`敵${this.id} の攻撃！ -${dmg}`);return;
    }
    const dx=Math.sign(gm.p.x-this.x),dy=Math.sign(gm.p.y-this.y);
    const cand=[[dx,dy],[R(3)-1,R(3)-1]];
    for(const[ mx,my]of cand){
      const tx=this.x+mx,ty=this.y+my;
      if(gm.walk(tx,ty)&&!gm.enemyAt(tx,ty)&&(tx!==gm.p.x||ty!==gm.p.y)){
        this.x=tx;this.y=ty;gm.elog(`敵${this.id} が移動`);return;
      }
    }
    gm.elog(`敵${this.id} は足踏みした`);
  }
}

/* --- アイテム --- */
class Item{constructor(x,y,t){this.x=x;this.y=y;this.type=t;this.col=COLOR[t];}
  draw(g){g.fillStyle=this.col;g.fillRect(this.x*TILE,this.y*TILE,TILE,TILE);} }

/* --- メインゲーム --- */
class Game{
  constructor(cv){
    this.cvs=cv;this.ctx=cv.getContext("2d");
    this.patFloor=pat(COLOR.floor,16);this.patWall=pat(COLOR.wall,24);
    this.map=genMap();this.turn=1;

    this.p=new Player(...this.randFloor());
    this.en=Array.from({length:5},()=>new Enemy(...this.randFloor()));
    this.items=[];this.addItems("heal",3);this.addItems("power",2);

    this.msg="冒険開始！";
    this.render();this.bindInput();
  }

  randFloor(){let x,y;do{ x=R(W);y=R(H);}while(this.map[y][x]!==FLOOR);return[x,y];}
  walk(x,y){return x>=0&&x<W&&y>=0&&y<H&&this.map[y][x]===FLOOR;}
  enemyAt(x,y){return this.en.find(e=>e.x===x&&e.y===y);}
  itemIdx(x,y){return this.items.findIndex(i=>i.x===x&&i.y===y);}

  elog(t){const d=document.getElementById("elog");d.innerHTML+=t+"<br>";d.scrollTop=d.scrollHeight;}
  plog(t){const d=document.getElementById("plog");d.innerHTML+=t+"<br>";d.scrollTop=d.scrollHeight;}

  ui(){
    const atkMin=this.p.atkBonus+3, atkMax=this.p.atkBonus+6;
    document.getElementById("msg").textContent=this.msg;
    document.getElementById("stats").textContent=`HP ${this.p.hp}  ATK ${atkMin}-${atkMax}  Turn ${this.turn}`;
    const list=document.getElementById("enemyList");
    list.innerHTML=this.en.length?this.en.map(e=>`<span>敵${e.id}: HP ${e.hp}</span>`).join(""):"敵は残っていません";
  }

  addItems(type,n){
    while(n--){
      let x,y;do{[x,y]=this.randFloor();}while(
        this.enemyAt(x,y)||(x===this.p.x&&y===this.p.y)||this.itemIdx(x,y)!==-1
      );this.items.push(new Item(x,y,type));
    }
  }

  bindInput(){
    const dir={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0]};
    addEventListener("keydown",e=>{
      try{
        if(dir[e.key]){this.moveTurn(...dir[e.key]);e.preventDefault();return;}
        if(e.code==="Space"){this.attackTurn();e.preventDefault();}
      }catch(err){showFatal(err);}
    });
    let sx,sy;
    this.cvs.addEventListener("touchstart",e=>{const t=e.touches[0];sx=t.clientX;sy=t.clientY;});
    this.cvs.addEventListener("touchend",e=>{
      try{
        const t=e.changedTouches[0],dx=t.clientX-sx,dy=t.clientY-sy;
        Math.abs(dx)>Math.abs(dy)?this.moveTurn(dx>0?1:-1,0):this.moveTurn(0,dy>0?1:-1);
      }catch(err){showFatal(err);}
    });
    document.getElementById("atkBtn").addEventListener("click",()=>{try{this.attackTurn();}catch(err){showFatal(err);}});
  }

  moveTurn(mx,my){
    if(!this.p.hp)return;
    const nx=this.p.x+mx,ny=this.p.y+my,foe=this.enemyAt(nx,ny);
    if(foe)this.hit(foe);
    else if(this.walk(nx,ny)&&!foe){
      this.p.x=nx;this.p.y=ny;this.msg="移動";this.plog("移動");this.pickItem();
    }else return;
    this.enemyPhase();
  }

  attackTurn(){
    if(!this.p.hp)return;
    const tgt=this.en.find(e=>ADJ(e.x,e.y,this.p.x,this.p.y));
    tgt?this.hit(tgt):(this.msg="空振り！",this.plog("空振り"));
    this.enemyPhase();
  }

  hit(e){
    if(Math.random()<MISS_RATE){this.msg="攻撃ミス！";this.plog("攻撃ミス");return;}
    const dmg=RNG(3,6)+this.p.atkBonus;
    e.hp-=dmg;this.msg=`攻撃！ -${dmg}`;this.plog(`敵${e.id} に ${dmg} DMG`);
    if(e.hp<=0){this.en=this.en.filter(v=>v!==e);this.msg="敵撃破！";this.plog(`敵${e.id} 撃破`);}
  }

  pickItem(){
    const i=this.itemIdx(this.p.x,this.p.y);if(i===-1)return;
    const it=this.items[i];
    if(it.type==="heal"){
      const bef=this.p.hp;this.p.hp=Math.min(this.p.hp+10,20);
      this.msg=`回復 +${this.p.hp-bef}`;this.plog(`回復 +${this.p.hp-bef}`);
    }else{
      this.p.atkBonus+=3;this.msg="攻撃力 +3";this.plog("攻撃+3");
    }
    this.items.splice(i,1);
  }

  enemyPhase(){this.en=this.en.filter(e=>e.hp>0);this.en.forEach(e=>e.act(this));this.endTurn();}
  endTurn(){
    if(this.p.hp<=0){this.msg="Game Over";this.plog("倒れた");this.cvs.style.filter="grayscale(1)";}
    this.turn++;this.render();
  }

  /* --- 描画 & UI --- */
  render(){this.ui();this.draw();}
  draw(){
    const g=this.ctx;
    g.clearRect(0,0,this.cvs.width,this.cvs.height);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      g.fillStyle=this.map[y][x]===FLOOR?this.patFloor:this.patWall;
      g.fillRect(x*TILE,y*TILE,TILE,TILE);
    }
    this.items.forEach(i=>i.draw(g));this.en.forEach(e=>e.draw(g));this.p.draw(g);
  }
}

/* --- 起動（try/catch で安全に） --- */
window.addEventListener("load",()=>{
  try{
    const cvs=document.getElementById("gameCanvas");
    const dpr=window.devicePixelRatio||1;
    cvs.width=W*TILE*dpr;cvs.height=H*TILE*dpr;cvs.getContext("2d").scale(dpr,dpr);
    new Game(cvs);
  }catch(err){showFatal(err);}
});
