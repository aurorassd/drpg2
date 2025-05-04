/* -----------------------------------------------------------
 * Mini Rogue – No-Assets Edition
 *   – 画像ファイル不要：コード内でドット絵を生成
 *   – 迷路生成 / ターン制移動 / 敵AI / スワイプ&キー入力
 * --------------------------------------------------------- */

/* ======== 定数 ======== */
const TILE = 16;            // 1タイルのピクセル
const W = 20, H = 20;       // マップ幅・高さ（タイル数）
const FLOOR = 0, WALL = 1;

/* ======== 色 ======== */
const C = {
  floor: "#444",     // 真っ暗に見えないよう明るめ
  wall : "#888",
  player: "#00e676", // ネオングリーン
  enemy : "#ff5252"
};

/* ======== 乱数 ======== */
const R = n => Math.floor(Math.random()*n);

/* ======== タイルパターン生成（画像不要） ======== */
function makePattern(color, noise=0) {
  const cvs = document.createElement("canvas");
  cvs.width = cvs.height = TILE;
  const ctx = cvs.getContext("2d");
  ctx.fillStyle = color;
  ctx.fillRect(0,0,TILE,TILE);

  /* 軽くノイズを入れて質感を付与 */
  if (noise){
    const img = ctx.getImageData(0,0,TILE,TILE);
    for(let i=0;i<img.data.length;i+=4){
      const v = (Math.random()*noise)|0;          // -noise … +noise
      img.data[i  ] += v;
      img.data[i+1] += v;
      img.data[i+2] += v;
    }
    ctx.putImageData(img,0,0);
  }
  return ctx.createPattern(cvs,"repeat");
}

/* ======== マップ生成（ランダムウォーク） ======== */
function genMap(){
  const m = Array.from({length:H},()=>Array(W).fill(WALL));
  let x = R(W), y = R(H);
  m[y][x] = FLOOR;
  for (let i=0;i<W*H*4;i++){
    const d = R(4);
    if (d===0 && y>1) y--;
    if (d===1 && y<H-2) y++;
    if (d===2 && x>1) x--;
    if (d===3 && x<W-2) x++;
    m[y][x] = FLOOR;
  }
  return m;
}

/* ======== エンティティ ======== */
class Entity {
  constructor(x,y,col){ this.x=x;this.y=y;this.hp=3;this.col=col; }
  draw(g){ g.fillStyle=this.col; g.fillRect(this.x*TILE,this.y*TILE,TILE,TILE); }
}
class Player extends Entity { constructor(x,y){super(x,y,C.player);} }
class Enemy  extends Entity {
  constructor(x,y){super(x,y,C.enemy);}
  act(game){
    const dx=Math.sign(game.p.x-this.x), dy=Math.sign(game.p.y-this.y);
    const cand=[[dx,dy],[R(3)-1,R(3)-1]];
    for(const [mx,my] of cand){
      if(game.canMove(this.x+mx,this.y+my)){ this.x+=mx; this.y+=my; break;}
    }
  }
}

/* ======== メインゲーム ======== */
class Game{
  constructor(cvs){
    this.cvs=cvs; this.ctx=cvs.getContext("2d");
    this.patFloor = makePattern(C.floor,16);
    this.patWall  = makePattern(C.wall ,24);

    this.map = genMap();
    this.p = new Player(...this.randFloor());
    this.en = Array.from({length:5},()=>new Enemy(...this.randFloor()));

    this.msg="冒険開始！";
    this.ui(); this.draw();
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
    addEventListener("keydown",e=>{if(dir[e.key]){this.turn(...dir[e.key]);e.preventDefault();}});
    /* スワイプ */
    let sx,sy;
    this.cvs.addEventListener("touchstart",e=>{const t=e.touches[0];sx=t.clientX;sy=t.clientY;});
    this.cvs.addEventListener("touchend",e=>{
      const t=e.changedTouches[0],dx=t.clientX-sx,dy=t.clientY-sy;
      if(Math.abs(dx)>Math.abs(dy)) this.turn(dx>0?1:-1,0); else this.turn(0,dy>0?1:-1);
    });
  }

  /* --- 1ターン --- */
  turn(mx,my){
    const nx=this.p.x+mx, ny=this.p.y+my;
    if(!this.canMove(nx,ny)) return;

    const foe=this.enemyAt(nx,ny);
    if(foe){ foe.hp--; this.msg="攻撃！"; if(!foe.hp) this.en=this.en.filter(e=>e!==foe);}
    else { this.p.x=nx; this.p.y=ny; this.msg="移動"; }

    /* 敵ターン */
    this.en.forEach(e=>e.act(this));
    this.en.forEach(e=>{if(e.x===this.p.x&&e.y===this.p.y){this.p.hp--; this.msg="ダメージ！";}});

    if(!this.p.hp){ this.msg="Game Over"; this.cvs.style.filter="grayscale(1)"; }
    this.ui(); this.draw();
  }

  /* --- 描画 --- */
  draw(){
    const g=this.ctx;
    g.clearRect(0,0,this.cvs.width,this.cvs.height);
    /* マップ */
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

  /* ★ HiDPI 対応：内部解像度を物理ピクセルに合わせて拡大 */
  const dpr = window.devicePixelRatio || 1;
  cvs.width  = W*TILE*dpr;
  cvs.height = H*TILE*dpr;
  const ctx = cvs.getContext("2d");
  ctx.scale(dpr,dpr);

  new Game(cvs);
});
