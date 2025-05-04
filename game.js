/* -----------------------------------------------------------
 * Mini Rogue – v0.7
 * 追加機能
 *   ▸ プレイヤー攻撃力表示   ▸ ターン数表示
 *   ▸ マップ壁密度↑（戦略的 1vs1 誘導しやすい）
 *   ▸ プレイヤー & 敵の行動ログ分離 (#plog / #elog)
 *
 * 既存仕様
 *   ▸ 回復 / 攻撃UP アイテム
 *   ▸ 15% ミス判定
 * --------------------------------------------------------- */

/* ========= 基本定数・ユーティリティ ========= */
const TILE=16, W=20, H=20, FLOOR=0, WALL=1;
const COLOR={
  floor:"#444", wall:"#666",
  player:"#00e676", enemy:"#ff5252",
  heal:"#00bcd4", power:"#ffc107"
};
const MISS_RATE=0.15;

/* 乱数 */
const R=n=>Math.floor(Math.random()*n);
const RNG=(a,b)=>a+R(b-a+1);
const ADJ=(ax,ay,bx,by)=>Math.abs(ax-bx)+Math.abs(ay-by)===1;

/* ========= タイルパターン ========= */
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

/* ========= マップ生成（壁多め） ========= */
function genMap(){
  const m=Array.from({length:H},()=>Array(W).fill(WALL));
  let [x,y]=[R(W),R(H)];
  m[y][x]=FLOOR;
  /* carve 少なめにして壁密度↑ */
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
  act(game){
    /* 攻撃 or 移動 1 行動 */
    if(ADJ(this.x,this.y,game.p.x,game.p.y)){
      if(Math.random()<MISS_RATE){game.elog(`敵${this.id} の攻撃は外れた`);return;}
      const dmg=RNG(1,6);game.p.hp-=dmg;
      game.elog(`敵${this.id} の攻撃！ -${dmg}`);
      return;
    }
    const dx=Math.sign(game.p.x-this.x),dy=Math.sign(game.p.y-this.y);
    const plans=[[dx,dy],[R(3)-1,R(3)-1]];
    for(const[ mx,my]of plans){
      const tx=this.x+mx,ty=this.y+my;
      if(game.walk(tx,ty)&&!game.enemyAt(tx,ty)&&(tx!==game.p.x||ty!==game.p.y)){
        this.x=tx;this.y=ty;game.elog(`敵${this.id} が移動`);return;
      }
    }
    game.elog(`敵${this.id} は足踏みした`);
  }
}

/* ========= アイテム ========= */
class Item{
  constructor(x,y,type){this.x=x;this.y=y;this.type=type;this.col=COLOR[type];}
  draw(g){g.fillStyle=this.col;g.fillRect(this.x*TILE,this.y*TILE,TILE,TILE);}
}

/* ========= ゲーム ========= */
class Game{
  constructor(cvs){
    this.cvs=cvs;this.ctx=cvs.getContext("2d");
    this.patFloor=pat(COLOR.floor,16);this.patWall=pat(COLOR.wall,24);
    this.map=genMap();
    this.turn=1;

    this.p=new Player(...this.randFloor());
    this.en=Array.from({length:5},()=>new Enemy(...this.randFloor()));
    this.items=[];
    this.placeItems("heal",3);this.placeItems("power",2);

    this.msg="冒険開始！";
    this.render();this.bindInput();
  }

  /* ---- 便利 ---- */
  randFloor(){let x,y;do{x=R(W);y=R(H);}while(this.map[y][x]!==FLOOR);return[x,y];}
  walk(x,y){return x>=0&&x<W&&y>=0&&y<H&&this.map[y][x]===FLOOR;}
  enemyAt(x,y){return this.en.find(e=>e.x===x&&e.y===y);}
  itemIndexAt(x,y){return this.items.findIndex(i=>i.x===x&&i.y===y);}

  /* ---- ログ ---- */
  elog(txt){const d=document.getElementById("elog");d.innerHTML+=txt+"<br>";d.scrollTop=d.scrollHeight;}
  plog(txt){const d=document.getElementById("plog");d.innerHTML+=txt+"<br>";d.scrollTop=d.scrollHeight;}

  /* ---- UI ---- */
  ui(){
    document.getElementById("msg").textContent=this.msg;
    document.getElementById("stats").textContent=
      `HP ${this.p.hp}  ATK ${this.p.atkBonus+3~}-${this.p.atkBonus+6}  Turn ${this.turn}`;
    const list=document.getElementById("enemyList");
    list.innerHTML=this.en.length?this.en.map(e=>`<span>敵${e.id}: HP ${e.hp}</span>`).join(""):"敵は残っていません";
  }

  /* ---- アイテム配置 ---- */
  placeItems(type,n){
    while(n--){
      let x,y;
      do{[x,y]=this.randFloor();}while(
        this.enemyAt(x,y)||(x===this.p.x&&y===this.p.y)||this.itemIndexAt(x,y)!==-1
      );
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
      Math.abs(dx)>Math.abs(dy)?this.turnMove(dx>0?1:-1,0):this.turnMove(0,dy>0?1:-1);
    });
    document.getElementById("atkBtn").addEventListener("click",()=>this.turnAttack());
  }

  /* ========= ターン処理 ========= */
  turnMove(mx,my){
    if(!this.p.hp)return;
    const nx=this.p.x+mx,ny=this.p.y+my,foe=this.enemyAt(nx,ny);
    if(foe)this.attackEnemy(foe);
    else if(this.walk(nx,ny)&&!foe){
      this.p.x=nx;this.p.y=ny;this.msg="移動";this.plog("移動");
      this.checkItem();
    }else return;
    this.enemyTurn();
  }

  turnAttack(){
    if(!this.p.hp)return;
    const tgt=this.en.find(e=>ADJ(e.x,e.y,this.p.x,this.p.y));
    tgt?this.attackEnemy(tgt):(this.msg="空振り！",this.plog("空振り"));
    this.enemyTurn();
  }

  attackEnemy(e){
    if(Math.random()<MISS_RATE){this.msg="攻撃ミス！";this.plog("攻撃ミス");return;}
    const dmg=RNG(3,6)+this.p.atkBonus;
    e.hp-=dmg;this.msg=`攻撃！ -${dmg}`;this.plog(`敵${e.id} に ${dmg} DMG`);
    if(e.hp<=0){this.en=this.en.filter(v=>v!==e);this.msg="敵撃破！";this.plog(`敵${e.id} 撃破`);}
  }

  checkItem(){
    const idx=this.itemIndexAt(this.p.x,this.p.y);if(idx===-1)return;
    const it=this.items[idx];
    if(it.type==="heal"){
      const before=this.p.hp;this.p.hp=Math.min(this.p.hp+10,20);
      this.msg=`回復 +${this.p.hp-before}`;this.plog(`回復 +${this.p.hp-before}`);
    }else{
      this.p.atkBonus+=3;this.msg="攻撃力 +3";this.plog("攻撃+3");
    }
    this.items.splice(idx,1);
  }

  enemyTurn(){
    this.en=this.en.filter(e=>e.hp>0);
    for(const e of this.en)e.act(this);
    this.endTurn();
  }

  endTurn(){
    if(this.p.hp<=0){this.msg="Game Over";this.plog("倒れた");this.cvs.style.filter="grayscale(1)";}
    this.turn++;this.render();
  }

  /* ---- 描画＋UI ---- */
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

/* ========= 起動 ========= */
window.addEventListener("load",()=>{
  const cvs=document.getElementById("gameCanvas");
  const dpr=window.devicePixelRatio||1;
  cvs.width=W*TILE*dpr;cvs.height=H*TILE*dpr;cvs.getContext("2d").scale(dpr,dpr);
  new Game(cvs);
});
