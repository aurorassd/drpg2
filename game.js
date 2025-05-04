/* -----------------------------------------------------------
 * Mini Rogue – Enemy List Edition
 *   – 隣接攻撃＆毎ターン HP 減少バグ修正
 *   – 倒した敵は即座に消滅（配列から完全除去）
 *   – 画面下に敵ごとの残り HP を表示
 * --------------------------------------------------------- */

/* ======== 基本定数 / ユーティリティ ======== */
const TILE = 16;
const W = 20, H = 20;
const FLOOR = 0, WALL = 1;
const COLOR = { floor:"#444", wall:"#888", player:"#00e676", enemy:"#ff5252" };

const R   = n => Math.floor(Math.random()*n);
const RNG = (min,max) => min + R(max-min+1);                          // 整数 [min,max]
const ADJ = (ax,ay,bx,by) => Math.abs(ax-bx)+Math.abs(ay-by) === 1;   // 上下左右隣接

/* ======== タイル用ドットパターン ======== */
function makePattern(color,noise=0){
  const cv=document.createElement("canvas");cv.width=cv.height=TILE;
  const g=cv.getContext("2d");
  g.fillStyle=color;g.fillRect(0,0,TILE,TILE);
  if(noise){
    const img=g.getImageData(0,0,TILE,TILE);
    for(let i=0;i<img.data.length;i+=4){
      const v=(Math.random()*noise)|0;
      img.data[i]+=v;img.data[i+1]+=v;img.data[i+2]+=v;
    }
    g.putImageData(img,0,0);
  }
  return g.createPattern(cv,"repeat");
}

/* ======== マップ生成（ランダムウォーク） ======== */
function genMap(){
  const m=Array.from({length:H},()=>Array(W).fill(WALL));
  let x=R(W),y=R(H);m[y][x]=FLOOR;
  for(let i=0;i<W*H*4;i++){
    const d=R(4);
    if(d===0&&y>1)   y--;
    if(d===1&&y<H-2) y++;
    if(d===2&&x>1)   x--;
    if(d===3&&x<W-2) x++;
    m[y][x]=FLOOR;
  }
  return m;
}

/* ======== エンティティ ======== */
let ENEMY_SEQ = 1;   // 敵の一意 ID 発行
class Entity{
  constructor(x,y,col,hp){this.x=x;this.y=y;this.col=col;this.hp=hp;}
  draw(g){g.fillStyle=this.col;g.fillRect(this.x*TILE,this.y*TILE,TILE,TILE);}
}
class Player extends Entity{
  constructor(x,y){super(x,y,COLOR.player,20);}                 // HP 20
}
class Enemy extends Entity{
  constructor(x,y){
    super(x,y,COLOR.enemy,RNG(5,12));                           // HP 5–12
    this.id = ENEMY_SEQ++;
  }
  act(game){
    const dx=Math.sign(game.p.x-this.x), dy=Math.sign(game.p.y-this.y);
    const plans=[[dx,dy],[R(3)-1,R(3)-1]];
    for(const [mx,my] of plans){
      const tx=this.x+mx, ty=this.y+my;
      if(game.isWalkable(tx,ty) && !game.enemyAt(tx,ty) && !(tx===game.p.x&&ty===game.p.y)){
        this.x=tx; this.y=ty; break;
      }
    }
  }
}

/* ======== メインゲーム ======== */
class Game{
  constructor(cvs){
    this.cvs=cvs; this.ctx=cvs.getContext("2d");
    this.patFloor=makePattern(COLOR.floor,16);
    this.patWall =makePattern(COLOR.wall ,24);

    this.map=genMap();
    this.p=new Player(...this.randFloor());
    this.en=Array.from({length:5},()=>new Enemy(...this.randFloor()));

    this.msg="冒険開始！";
    this.updateUI(); this.draw();
    this.bindInput();
  }

  /* --- 補助 --- */
  randFloor(){let x,y;do{x=R(W);y=R(H);}while(this.map[y][x]!==FLOOR);return[x,y];}
  isWalkable(x,y){return x>=0&&x<W&&y>=0&&y<H&&this.map[y][x]===FLOOR;}
  enemyAt(x,y){return this.en.find(e=>e.x===x&&e.y===y);}

  updateUI(){
    document.getElementById("msg").textContent=this.msg;
    document.getElementById("hp").textContent=`HP ${this.p.hp}`;
    const list=document.getElementById("enemyList");
    if(this.en.length){
      list.innerHTML=this.en.map(e=>`<span>敵${e.id}: HP ${e.hp}</span>`).join("");
    }else{
      list.textContent="敵は残っていません";
    }
  }

  /* --- 入力 --- */
  bindInput(){
    const dir={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0]};
    addEventListener("keydown",e=>{
      if(dir[e.key]){this.turn(...dir[e.key]);e.preventDefault();return;}
      if(e.code==="Space"){this.attack();e.preventDefault();}
    });
    let sx,sy;
    this.cvs.addEventListener("touchstart",e=>{const t=e.touches[0];sx=t.clientX;sy=t.clientY;});
    this.cvs.addEventListener("touchend",e=>{
      const t=e.changedTouches[0],dx=t.clientX-sx,dy=t.clientY-sy;
      if(Math.abs(dx)>Math.abs(dy)) this.turn(dx>0?1:-1,0);
      else this.turn(0,dy>0?1:-1);
    });
    document.getElementById("atkBtn").addEventListener("click",()=>this.attack());
  }

  /* --- プレイヤー移動ターン --- */
  turn(mx,my){
    if(!this.p.hp) return;
    const nx=this.p.x+mx, ny=this.p.y+my;
    const foe=this.enemyAt(nx,ny);

    if(foe){                               // 隣接敵へ攻撃
      this.hitEnemy(foe);
    }else if(this.isWalkable(nx,ny) && !this.enemyAt(nx,ny)){
      this.p.x=nx; this.p.y=ny; this.msg="移動";
    }else return;                          // 移動不能→ターン無効

    this.enemyPhase();
    this.endTurn();
  }

  /* --- 攻撃ボタン / Space --- */
  attack(){
    if(!this.p.hp) return;
    const tgt=this.en.find(e=>ADJ(e.x,e.y,this.p.x,this.p.y));
    if(tgt) this.hitEnemy(tgt); else this.msg="空振り！";
    this.enemyPhase();
    this.endTurn();
  }

  hitEnemy(enemy){
    const dmg=RNG(3,6);
    enemy.hp-=dmg;
    this.msg=`攻撃！ -${dmg}`;
    if(enemy.hp<=0){
      this.en=this.en.filter(e=>e!==enemy);          // ★ 完全消滅
      this.msg="敵を倒した！";
    }
  }

  /* --- 敵行動 & 攻撃 --- */
  enemyPhase(){
    /* ★ まず死体を一掃（念のため） */
    this.en=this.en.filter(e=>e.hp>0);

    this.en.forEach(e=>e.act(this));
    this.en.forEach(e=>{
      if(ADJ(e.x,e.y,this.p.x,this.p.y)){
        const dmg=RNG(1,6);
        this.p.hp-=dmg;
        this.msg=`敵の攻撃！ -${dmg}`;
      }
    });
  }

  /* --- ターン終了 --- */
  endTurn(){
    if(this.p.hp<=0){
      this.msg="Game Over";
      this.cvs.style.filter="grayscale(1)";
    }
    this.updateUI();
    this.draw();
  }

  /* --- 描画 --- */
  draw(){
    const g=this.ctx;
    g.clearRect(0,0,this.cvs.width,this.cvs.height);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      g.fillStyle=this.map[y][x]===FLOOR?this.patFloor:this.patWall;
      g.fillRect(x*TILE,y*TILE,TILE,TILE);
    }
    this.en.forEach(e=>e.draw(g));
    this.p.draw(g);
  }
}

/* ======== 起動 ======== */
window.addEventListener("load",()=>{
  const cvs=document.getElementById("gameCanvas");
  const dpr=window.devicePixelRatio||1;
  cvs.width=W*TILE*dpr; cvs.height=H*TILE*dpr;
  cvs.getContext("2d").scale(dpr,dpr);
  new Game(cvs);
});
