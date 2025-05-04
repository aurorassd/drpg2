/* -----------------------------------------------------------
 * Mini Rogue – Attack Edition
 *   – 攻撃ボタン／Space キーで攻撃（1ターン消費）
 *   – プレイヤー HP 20 / 敵 HP 5-12
 *   – 敵ダメージ 1-6 / プレイヤーダメージ 3-6
 *   – 画像不要・スマホ対応
 * --------------------------------------------------------- */

/* ======== 定数 ======== */
const TILE = 16;
const W = 20, H = 20;
const FLOOR = 0, WALL = 1;

/* ======== 色 ======== */
const C = { floor:"#444", wall:"#888", player:"#00e676", enemy:"#ff5252" };

/* ======== 乱数 ======== */
const R = n => Math.floor(Math.random()*n);
const RRange = (min,max) => min + R(max-min+1);   // [min,max] 整数

/* ======== ドットパターン生成 ======== */
function makePattern(color, noise=0){
  const cv=document.createElement("canvas");cv.width=cv.height=TILE;
  const g=cv.getContext("2d");g.fillStyle=color;g.fillRect(0,0,TILE,TILE);
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

/* ======== マップ生成 ======== */
function genMap(){
  const m=Array.from({length:H},()=>Array(W).fill(WALL));
  let x=R(W),y=R(H);m[y][x]=FLOOR;
  for(let i=0;i<W*H*4;i++){
    const d=R(4);
    if(d===0 && y>1) y--;if(d===1 && y<H-2) y++;
    if(d===2 && x>1) x--;if(d===3 && x<W-2) x++;
    m[y][x]=FLOOR;
  }
  return m;
}

/* ======== エンティティ ======== */
class Entity{
  constructor(x,y,col,hp){this.x=x;this.y=y;this.col=col;this.hp=hp;}
  draw(g){g.fillStyle=this.col;g.fillRect(this.x*TILE,this.y*TILE,TILE,TILE);}
}
class Player extends Entity{
  constructor(x,y){super(x,y,C.player,20);}               // ★ HP20
}
class Enemy extends Entity{
  constructor(x,y){super(x,y,C.enemy,RRange(5,12));}      // ★ HP5-12
  act(game){
    const dx=Math.sign(game.p.x-this.x),dy=Math.sign(game.p.y-this.y);
    const cand=[[dx,dy],[R(3)-1,R(3)-1]];
    for(const[ mx,my]of cand){
      if(game.canMove(this.x+mx,this.y+my)){this.x+=mx;this.y+=my;break;}
    }
  }
}

/* ======== メインゲーム ======== */
class Game{
  constructor(cvs){
    this.cvs=cvs;this.ctx=cvs.getContext("2d");
    this.patFloor=makePattern(C.floor,16);
    this.patWall =makePattern(C.wall ,24);

    this.map=genMap();
    this.p=new Player(...this.randFloor());
    this.en=Array.from({length:5},()=>new Enemy(...this.randFloor()));

    this.msg="冒険開始！";
    this.ui();this.draw();
    this.bindInput();
  }

  /* --- 便利 --- */
  randFloor(){let x,y;do{x=R(W);y=R(H);}while(this.map[y][x]!==FLOOR);return[x,y];}
  canMove(x,y){return x>=0&&x<W&&y>=0&&y<H&&this.map[y][x]===FLOOR;}
  enemyAt(x,y){return this.en.find(e=>e.x===x&&e.y===y);}
  ui(){
    document.getElementById("msg").textContent=this.msg;
    document.getElementById("hp").textContent=`HP ${this.p.hp}`;
  }

  /* --- 入力 --- */
  bindInput(){
    const dir={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0]};
    addEventListener("keydown",e=>{
      if(dir[e.key]){this.turn(...dir[e.key]);e.preventDefault();return;}
      if(e.code==="Space"){this.attack();e.preventDefault();}
    });
    /* スワイプ */
    let sx,sy;
    this.cvs.addEventListener("touchstart",e=>{const t=e.touches[0];sx=t.clientX;sy=t.clientY;});
    this.cvs.addEventListener("touchend",e=>{
      const t=e.changedTouches[0],dx=t.clientX-sx,dy=t.clientY-sy;
      if(Math.abs(dx)>Math.abs(dy)) this.turn(dx>0?1:-1,0);
      else this.turn(0,dy>0?1:-1);
    });
    /* 攻撃ボタン */
    document.getElementById("atkBtn").addEventListener("click",()=>this.attack());
  }

  /* --- プレイヤー移動ターン --- */
  turn(mx,my){
    if(!this.p.hp) return;                             // 既にゲームオーバー
    const nx=this.p.x+mx,ny=this.p.y+my;
    if(!this.canMove(nx,ny)) return;

    const foe=this.enemyAt(nx,ny);
    if(foe){
      const dmg=RRange(3,6);                           // ★ プレイヤー攻撃 3-6
      foe.hp-=dmg;this.msg=`攻撃！-${dmg}`;
      if(foe.hp<=0){this.en=this.en.filter(e=>e!==foe);this.msg="敵を倒した！";}
    }else{
      this.p.x=nx;this.p.y=ny;this.msg="移動";
    }
    this.enemyTurn();
    this.endTurn();
  }

  /* --- プレイヤー攻撃ターン（ボタン or Space） --- */
  attack(){
    if(!this.p.hp) return;
    const dirs=[[0,-1],[0,1],[-1,0],[1,0]];
    const tgt=dirs.map(([dx,dy])=>this.enemyAt(this.p.x+dx,this.p.y+dy)).find(e=>e);
    if(tgt){
      const dmg=RRange(3,6);                           // ★ プレイヤー攻撃 3-6
      tgt.hp-=dmg;this.msg=`攻撃！-${dmg}`;
      if(tgt.hp<=0){this.en=this.en.filter(e=>e!==tgt);this.msg="敵を倒した！";}
    }else{
      this.msg="空振り！";
    }
    this.enemyTurn();                                  // 1ターン消費
    this.endTurn();
  }

  /* --- 敵行動 & 攻撃 --- */
  enemyTurn(){
    this.en.forEach(e=>e.act(this));
    this.en.forEach(e=>{
      if(e.x===this.p.x&&e.y===this.p.y){
        const dmg=RRange(1,6);                         // ★ 敵攻撃 1-6
        this.p.hp-=dmg;this.msg=`敵の攻撃！-${dmg}`;
      }
    });
  }

  /* --- ターン終了共通処理 --- */
  endTurn(){
    if(this.p.hp<=0){this.msg="Game Over";this.cvs.style.filter="grayscale(1)";}
    this.ui();this.draw();
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

/* ======== ブート ======== */
window.addEventListener("load",()=>{
  const cvs=document.getElementById("gameCanvas");
  const dpr=window.devicePixelRatio||1;
  cvs.width=W*TILE*dpr;cvs.height=H*TILE*dpr;
  cvs.getContext("2d").scale(dpr,dpr);
  new Game(cvs);
});
