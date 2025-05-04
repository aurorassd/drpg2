/* -----------------------------------------------------------
 * Mini Rogue – v0.6
 * 追加機能
 *   ◇ 回復アイテム (3 個)  … 踏むと HP +10 (上限 20)
 *   ◇ 攻撃力 UP   (2 個)  … 踏むと攻撃力 +3 (累積)
 * 仕様変更
 *   ◇ プレイヤー・敵とも攻撃時 15 % でミス（ダメージ 0）
 *   ◇ すべての行動をログへ
 * --------------------------------------------------------- */

/* ========= 基本定数・ユーティリティ ========= */
const TILE = 16;
const W = 20, H = 20;
const FLOOR = 0, WALL  = 1;

const COLOR = {
  floor  : "#444",
  wall   : "#888",
  player : "#00e676",
  enemy  : "#ff5252",
  heal   : "#00bcd4",    // 回復アイテム
  power  : "#ffc107"     // 攻撃力+3
};

const MISS_RATE = 0.15;               // 15 %
const R   = n         => Math.floor(Math.random()*n);
const RNG = (a,b)     => a + R(b-a+1);               // [a,b]
const ADJ = (ax,ay,bx,by)=>Math.abs(ax-bx)+Math.abs(ay-by)===1;

/* ========= ドットパターン生成 ========= */
function pattern(color,noise=0){
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

/* ========= マップ生成 ========= */
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

/* ========= エンティティ ========= */
let ENEMY_SEQ=1;
class Entity{
  constructor(x,y,col,hp){this.x=x;this.y=y;this.col=col;this.hp=hp;}
  draw(g){g.fillStyle=this.col;g.fillRect(this.x*TILE,this.y*TILE,TILE,TILE);}
}
class Player extends Entity{
  constructor(x,y){super(x,y,COLOR.player,20);this.atkBonus=0;}
}
class Enemy extends Entity{
  constructor(x,y){super(x,y,COLOR.enemy,RNG(5,12));this.id=ENEMY_SEQ++;}
  /** 1ターン行動 */
  act(game){
    // 1) 隣接していれば攻撃だけ
    if(ADJ(this.x,this.y,game.p.x,game.p.y)){
      const miss=Math.random()<MISS_RATE;
      if(miss){
        game.log(`敵${this.id} の攻撃は外れた`);
        game.msg="敵の攻撃はミス！";
      }else{
        const dmg=RNG(1,6);
        game.p.hp-=dmg;
        game.log(`敵${this.id} の攻撃！ -${dmg}`);
        game.msg=`敵の攻撃！ -${dmg}`;
      }
      return;
    }
    // 2) 移動だけ
    const dx=Math.sign(game.p.x-this.x), dy=Math.sign(game.p.y-this.y);
    const plans=[[dx,dy],[R(3)-1,R(3)-1]];
    for(const [mx,my] of plans){
      const tx=this.x+mx, ty=this.y+my;
      if(game.walkable(tx,ty) && !game.enemyAt(tx,ty) && !(tx===game.p.x&&ty===game.p.y)){
        this.x=tx; this.y=ty;
        game.log(`敵${this.id} が移動`);
        return;
      }
    }
    // 動けず何もしない
    game.log(`敵${this.id} は足踏みした`);
  }
}

/* ========= アイテム ========= */
class Item{
  constructor(x,y,type){
    this.x=x;this.y=y;this.type=type;               // type: "heal" | "power"
    this.col=COLOR[type];
  }
  draw(g){g.fillStyle=this.col;g.fillRect(this.x*TILE,this.y*TILE,TILE,TILE);}
}

/* ========= メインゲーム ========= */
class Game{
  constructor(cvs){
    this.cvs=cvs; this.ctx=cvs.getContext("2d");
    this.patFloor=pattern(COLOR.floor,16);
    this.patWall =pattern(COLOR.wall ,24);

    this.map=genMap();
    this.p=new Player(...this.randFloor());
    this.en=Array.from({length:5},()=>new Enemy(...this.randFloor()));
    this.items=[];
    this.placeItems("heal",3);
    this.placeItems("power",2);

    this.logs=[];
    this.msg="冒険開始！";
    this.updateUI(); this.draw();
    this.bindInput();
  }

  /* ---- 補助 ---- */
  randFloor(){let x,y;do{x=R(W);y=R(H);}while(this.map[y][x]!==FLOOR);return[x,y];}
  walkable(x,y){return x>=0&&x<W&&y>=0&&y<H&&this.map[y][x]===FLOOR;}
  enemyAt(x,y){return this.en.find(e=>e.x===x&&e.y===y);}
  itemIndexAt(x,y){return this.items.findIndex(it=>it.x===x&&it.y===y);}
  log(t){
    this.logs.push(t);
    const logDiv=document.getElementById("log");
    logDiv.innerHTML=this.logs.slice(-60).join("<br>");
    logDiv.scrollTop=logDiv.scrollHeight;
  }
  updateUI(){
    document.getElementById("msg").textContent=this.msg;
    document.getElementById("hp").textContent=`HP ${this.p.hp}  (攻撃+${this.p.atkBonus})`;
    const list=document.getElementById("enemyList");
    list.innerHTML=this.en.length
      ? this.en.map(e=>`<span>敵${e.id}: HP ${e.hp}</span>`).join("")
      : "敵は残っていません";
  }

  /* ---- アイテム配置 ---- */
  placeItems(type,count){
    while(count--){
      let x,y;
      do{
        [x,y]=this.randFloor();
      }while(this.enemyAt(x,y) || (x===this.p.x&&y===this.p.y) || this.itemIndexAt(x,y)!==-1);
      this.items.push(new Item(x,y,type));
    }
  }

  /* ---- 入力 ---- */
  bindInput(){
    const dir={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0]};
    addEventListener("keydown",e=>{
      if(dir[e.key]){this.turnMove(...dir[e.key]);e.preventDefault();return;}
      if(e.code==="Space"){this.turnAttack();e.preventDefault();}
    });
    let sx,sy;
    this.cvs.addEventListener("touchstart",e=>{const t=e.touches[0];sx=t.clientX;sy=t.clientY;});
    this.cvs.addEventListener("touchend",e=>{
      const t=e.changedTouches[0],dx=t.clientX-sx,dy=t.clientY-sy;
      if(Math.abs(dx)>Math.abs(dy)) this.turnMove(dx>0?1:-1,0);
      else this.turnMove(0,dy>0?1:-1);
    });
    document.getElementById("atkBtn").addEventListener("click",()=>this.turnAttack());
  }

  /* ========= ターン処理 ========= */
  turnMove(mx,my){
    if(!this.p.hp) return;
    const nx=this.p.x+mx, ny=this.p.y+my;
    const foe=this.enemyAt(nx,ny);

    if(foe){
      this.hitEnemy(foe);                            // 攻撃で行動消費
    }else if(this.walkable(nx,ny) && !foe){
      this.p.x=nx; this.p.y=ny;
      this.msg="移動";
      this.log("プレイヤーが移動");
      this.checkItem();
    }else{
      return;                                       // 行動無効
    }
    this.enemyTurn();
  }

  turnAttack(){
    if(!this.p.hp) return;
    const tgt=this.en.find(e=>ADJ(e.x,e.y,this.p.x,this.p.y));
    if(tgt) this.hitEnemy(tgt);
    else {this.msg="空振り！"; this.log("プレイヤーの空振り");}
    this.enemyTurn();
  }

  hitEnemy(enemy){
    const miss=Math.random()<MISS_RATE;
    if(miss){
      this.msg="攻撃ミス！";
      this.log("プレイヤーの攻撃は外れた");
      return;
    }
    const dmg=RNG(3,6)+this.p.atkBonus;
    enemy.hp-=dmg;
    this.msg=`攻撃！ -${dmg}`;
    this.log(`プレイヤーが敵${enemy.id} に ${dmg} ダメージ`);
    if(enemy.hp<=0){
      this.en=this.en.filter(e=>e!==enemy);
      this.msg="敵を倒した！";
      this.log(`敵${enemy.id} を撃破`);
    }
  }

  /* ---- アイテム取得 ---- */
  checkItem(){
    const idx=this.itemIndexAt(this.p.x,this.p.y);
    if(idx===-1) return;
    const it=this.items[idx];
    if(it.type==="heal"){
      const before=this.p.hp;
      this.p.hp=Math.min(this.p.hp+10,20);
      const diff=this.p.hp-before;
      this.msg=`回復 +${diff}`;
      this.log(`回復アイテムを取得 (+${diff})`);
    }else if(it.type==="power"){
      this.p.atkBonus+=3;
      this.msg="攻撃力 +3";
      this.log("攻撃力UPアイテムを取得 (+3)");
    }
    this.items.splice(idx,1);
  }

  /* ---- 敵ターン ---- */
  enemyTurn(){
    this.en=this.en.filter(e=>e.hp>0);
    for(const e of this.en) e.act(this);
    this.endTurn();
  }

  endTurn(){
    if(this.p.hp<=0){
      this.msg="Game Over";
      this.log("プレイヤーは倒れた");
      this.cvs.style.filter="grayscale(1)";
    }
    this.updateUI(); this.draw();
  }

  /* ========= 描画 ========= */
  draw(){
    const g=this.ctx;
    g.clearRect(0,0,this.cvs.width,this.cvs.height);
    // マップ
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      g.fillStyle=this.map[y][x]===FLOOR?this.patFloor:this.patWall;
      g.fillRect(x*TILE,y*TILE,TILE,TILE);
    }
    // アイテム
    this.items.forEach(it=>it.draw(g));
    // エンティティ
    this.en.forEach(e=>e.draw(g));
    this.p.draw(g);
  }
}

/* ========= 起動 ========= */
window.addEventListener("load",()=>{
  const cvs=document.getElementById("gameCanvas");
  const dpr=window.devicePixelRatio||1;
  cvs.width=W*TILE*dpr; cvs.height=H*TILE*dpr;
  cvs.getContext("2d").scale(dpr,dpr);
  new Game(cvs);
});
