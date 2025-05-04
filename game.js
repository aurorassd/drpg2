/* ------------------------------------------------------------
 * Mini Rogue  v0.8
 *  新機能
 *   • 敵タイプ追加
 *       - 双撃兵 (2 回攻撃)
 *       - 疾走兵 (1 ターン 2 マス移動)
 *   • クリティカル 15 %（ダメージ 2 倍）
 *   • ダッシュアイテム 2 個：取得次ターンのみ 2 マス移動
 *   • 丁寧な日本語ログ + 色分け
 *  既存
 *   • ミス 15 %／回復・攻撃アップ・壁密度↑／二分ログ／ターン表示
 * ----------------------------------------------------------- */

/* ── フェイルセーフ ── */
function fatal(err){
  console.error(err);
  const d=document.getElementById('fatal');
  d.textContent=`⚠️  致命的エラー\n\n${err.message||err}\n\n詳細はコンソールをご覧ください。`;
  d.style.display='block';
}
window.addEventListener('error',e=>fatal(e.error||e.message));
window.addEventListener('unhandledrejection',e=>fatal(e.reason));

/* ── 定数 & ユーティリティ ── */
const TILE=16,W=20,H=20,FLOOR=0,WALL=1;
const COLOR={
  floor:'#444',wall:'#666',player:'#00e676',enemy:'#ff5252',
  heal:'#00bcd4',power:'#ffc107',dash:'#ff80ff'
};
const MISS=0.15,CRIT=0.15;

const R=n=>Math.floor(Math.random()*n);
const RNG=(a,b)=>a+R(b-a+1);
const ADJ=(ax,ay,bx,by)=>Math.abs(ax-bx)+Math.abs(ay-by)===1;

function pattern(col,noise=0){
  const c=document.createElement('canvas');c.width=c.height=TILE;
  const g=c.getContext('2d');g.fillStyle=col;g.fillRect(0,0,TILE,TILE);
  if(noise){
    const d=g.getImageData(0,0,TILE,TILE);
    for(let i=0;i<d.data.length;i+=4){
      const v=(Math.random()*noise)|0;
      d.data[i]+=v;d.data[i+1]+=v;d.data[i+2]+=v;
    }g.putImageData(d,0,0);
  }
  return g.createPattern(c,'repeat');
}

/* ── マップ（壁多め） ── */
function makeMap(){
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

/* ── 基底エンティティ ── */
let ENEMY_ID=1;
class Entity{constructor(x,y,col,hp){this.x=x;this.y=y;this.col=col;this.hp=hp;}
  draw(g){g.fillStyle=this.col;g.fillRect(this.x*TILE,this.y*TILE,TILE,TILE);}}

/* ── プレイヤー ── */
class Player extends Entity{
  constructor(x,y){super(x,y,COLOR.player,20);this.atkBonus=0;this.dash=0;}
}

/* ── 敵 ── */
class Enemy extends Entity{
  constructor(x,y,hp=RNG(5,12)){super(x,y,COLOR.enemy,hp);this.id=ENEMY_ID++;}
  /* 1 行動（移動 or 攻撃） */
  act(game){                                         // デフォルト敵
    if(this.tryAttack(game)) return;
    this.stepToward(game,1);
  }
  dirToPlayer(game){
    return [Math.sign(game.p.x-this.x),Math.sign(game.p.y-this.y)];
  }
  tryAttack(game,repeats=1){
    if(!ADJ(this.x,this.y,game.p.x,game.p.y))return false;
    for(let i=0;i<repeats;i++){
      if(Math.random()<MISS){
        game.elog(`敵${this.id}の攻撃は外れました。`,'n');
      }else{
        let dmg=RNG(1,6);
        const crit=Math.random()<CRIT;
        if(crit) dmg*=2;
        game.p.hp-=dmg;
        game.elog(`敵${this.id}は${dmg}のダメージを与えました。${crit?'(クリティカル)': ''}`,'pd');
      }
    }
    return true;
  }
  stepToward(game,steps){
    for(let s=0;s<steps;s++){
      const [dx,dy]=this.dirToPlayer(game);
      const plans=[[dx,dy],[R(3)-1,R(3)-1]];
      let moved=false;
      for(const[ mx,my]of plans){
        const tx=this.x+mx,ty=this.y+my;
        if(game.walk(tx,ty)&&!game.enemyAt(tx,ty)&&(tx!==game.p.x||ty!==game.p.y)){
          this.x=tx;this.y=ty;
          moved=true;
          break;
        }
      }
      if(!moved) break;
    }
    game.elog(`敵${this.id}は移動しました。`,'n');
  }
}

/* ── 双撃兵：2 回攻撃 ── */
class DoubleAttackEnemy extends Enemy{
  constructor(x,y){super(x,y);this.col='#ff8c52';}
  act(game){
    if(this.tryAttack(game,2)) return;
    this.stepToward(game,1);
  }
}

/* ── 疾走兵：2 マス移動 ── */
class FastEnemy extends Enemy{
  constructor(x,y){super(x,y);this.col='#52a0ff';}
  act(game){
    if(this.tryAttack(game)) return;      // 隣接してたら通常攻撃 1 回
    this.stepToward(game,2);              // 2 ステップ移動
  }
}

/* ── アイテム ── */
class Item extends Entity{
  constructor(x,y,type){
    const col=COLOR[type];super(x,y,col,1);this.type=type;
  }
}

/* ── ゲーム本体 ── */
class Game{
  constructor(cv){
    this.cv=cv;this.ctx=cv.getContext('2d');
    this.patFloor=pattern(COLOR.floor,16);this.patWall=pattern(COLOR.wall,24);
    this.map=makeMap();this.turn=1;

    this.p=new Player(...this.randFloor());
    this.en=this.spawnEnemies(5);
    this.items=[];
    this.placeItems('heal',3);
    this.placeItems('power',2);
    this.placeItems('dash',2);

    this.msg='冒険開始！';
    this.draw();this.ui();
    this.bindInput();
  }

  /* ─── 便利 ─── */
  randFloor(){let x,y;do{x=R(W);y=R(H);}while(this.map[y][x]!==FLOOR);return[x,y];}
  walk(x,y){return x>=0&&x<W&&y>=0&&y<H&&this.map[y][x]===FLOOR;}
  enemyAt(x,y){return this.en.find(e=>e.x===x&&e.y===y);}
  itemIdx(x,y){return this.items.findIndex(i=>i.x===x&&i.y===y);}
  /* ─── ログ ─── */
  addLog(divId,text,cls='n'){
    const d=document.getElementById(divId);
    d.innerHTML+=`<span class="${cls}">${text}</span><br>`;
    d.scrollTop=d.scrollHeight;
  }
  elog(txt,cls){this.addLog('elog',txt,cls);}
  plog(txt,cls){this.addLog('plog',txt,cls);}

  /* ─── UI ─── */
  ui(){
    const atkMin=this.p.atkBonus+3,atkMax=this.p.atkBonus+6;
    const dashTxt=this.p.dash?'(ダッシュ準備)':'';
    document.getElementById('msg').textContent=this.msg;
    document.getElementById('stats').textContent=
      `HP ${this.p.hp}  ATK ${atkMin}-${atkMax}  Turn ${this.turn} ${dashTxt}`;
    const list=document.getElementById('enemyList');
    list.innerHTML=this.en.length
      ? this.en.map(e=>`<span>敵${e.id}: HP ${e.hp}</span>`).join('')
      : '敵は残っていません';
  }

  /* ─── 敵生成 ─── */
  spawnEnemies(n){
    const arr=[];
    while(arr.length<n){
      const [x,y]=this.randFloor();
      const r=Math.random();
      let e;
      if(r<0.33) e=new DoubleAttackEnemy(x,y);
      else if(r<0.66) e=new FastEnemy(x,y);
      else e=new Enemy(x,y);
      if(!((x===this.p.x&&y===this.p.y)||arr.some(o=>o.x===x&&o.y===y)))
        arr.push(e);
    }
    return arr;
  }

  /* ─── アイテム配置 ─── */
  placeItems(type,n){
    while(n--){
      let x,y;
      do{ [x,y]=this.randFloor(); }
      while(this.enemyAt(x,y)||(x===this.p.x&&y===this.p.y)||this.itemIdx(x,y)!==-1);
      this.items.push(new Item(x,y,type));
    }
  }

  /* ─── 入力 ─── */
  bindInput(){
    const dir={ArrowUp:[0,-1,'北'],ArrowDown:[0,1,'南'],ArrowLeft:[-1,0,'西'],ArrowRight:[1,0,'東']};
    window.addEventListener('keydown',e=>{
      try{
        if(dir[e.key]){const [dx,dy,dirName]=dir[e.key];this.moveTurn(dx,dy,dirName);e.preventDefault();}
        else if(e.code==='Space'){this.attackTurn();e.preventDefault();}
      }catch(err){fatal(err);}
    });
    let sx,sy;
    this.cv.addEventListener('touchstart',e=>{const t=e.touches[0];sx=t.clientX;sy=t.clientY;});
    this.cv.addEventListener('touchend',e=>{
      const t=e.changedTouches[0],dx=t.clientX-sx,dy=t.clientY-sy;
      const hori=Math.abs(dx)>Math.abs(dy);
      const [mx,my,dirName]=hori
        ?[dx>0?1:-1,0,dx>0?'東':'西']
        :[0,dy>0?1:-1,dy>0?'南':'北'];
      try{this.moveTurn(mx,my,dirName);}catch(err){fatal(err);}
    });
    document.getElementById('atkBtn').addEventListener('click',()=>{try{this.attackTurn();}catch(err){fatal(err);}});
  }

  /* ─── ターン：移動 ─── */
  moveTurn(mx,my,dirName){
    if(!this.p.hp) return;

    const maxStep=this.p.dash?2:1;
    let steps=0, moved=false;

    while(steps<maxStep){
      const nx=this.p.x+mx,ny=this.p.y+my;
      const foe=this.enemyAt(nx,ny);
      if(foe){
        this.hitEnemy(foe);
        moved=true;
        break;
      }else if(this.walk(nx,ny)){
        this.p.x=nx;this.p.y=ny;moved=true;steps++;
        this.checkItem();
      }else break;
    }

    if(moved){
      this.msg=`プレイヤーは${dirName}に移動しました。`;
      this.plog(this.msg,'n');
      if(this.p.dash) this.p.dash=0;       // ダッシュ消費
      this.enemyPhase();
    }
  }

  /* ─── ターン：攻撃 ─── */
  attackTurn(){
    if(!this.p.hp) return;
    const tgt=this.en.find(e=>ADJ(e.x,e.y,this.p.x,this.p.y));
    if(!tgt){
      this.msg='プレイヤーは空振りしました。';
      this.plog(this.msg,'n');
    }else{
      this.hitEnemy(tgt);
    }
    this.enemyPhase();
  }

  /* ─── 与ダメ ─── */
  hitEnemy(e){
    if(Math.random()<MISS){
      this.msg='プレイヤーの攻撃は外れました。';
      this.plog(this.msg,'n');
      return;
    }
    let dmg=RNG(3,6)+this.p.atkBonus;
    const crit=Math.random()<CRIT;
    if(crit) dmg*=2;
    e.hp-=dmg;
    this.msg=`プレイヤーは敵${e.id}に${dmg}のダメージを与えました。${crit?'(クリティカル)':''}`;
    this.plog(this.msg,'ed');
    if(e.hp<=0){
      this.msg=`敵${e.id}を倒しました。`;
      this.plog(this.msg,'ed');
      this.en=this.en.filter(v=>v!==e);
    }
  }

  /* ─── アイテム取得 ─── */
  checkItem(){
    const idx=this.itemIdx(this.p.x,this.p.y);if(idx===-1)return;
    const it=this.items[idx];
    if(it.type==='heal'){
      const before=this.p.hp;this.p.hp=Math.min(this.p.hp+10,20);
      const diff=this.p.hp-before;
      this.msg=`プレイヤーは${diff}回復しました。`;
      this.plog(this.msg,'heal');
    }else if(it.type==='power'){
      this.p.atkBonus+=3;
      this.msg='プレイヤーの攻撃力が 3 上がりました。';
      this.plog(this.msg,'stat');
    }else if(it.type==='dash'){
      this.p.dash=1;
      this.msg='プレイヤーはダッシュ準備を整えました。次の移動で 2 マス進めます。';
      this.plog(this.msg,'stat');
    }
    this.items.splice(idx,1);
  }

  /* ─── 敵フェーズ ─── */
  enemyPhase(){
    this.en=this.en.filter(e=>e.hp>0);
    for(const e of this.en) e.act(this);
    this.endTurn();
  }

  /* ─── ターン終了 ─── */
  endTurn(){
    if(this.p.hp<=0){
      this.msg='プレイヤーは倒れました…。';
      this.plog(this.msg,'pd');
      this.cv.style.filter='grayscale(1)';
    }
    this.turn++;
    this.draw();this.ui();
  }

  /* ─── 描画 ─── */
  draw(){
    const g=this.ctx;
    g.clearRect(0,0,this.cv.width,this.cv.height);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      g.fillStyle=this.map[y][x]===FLOOR?this.patFloor:this.patWall;
      g.fillRect(x*TILE,y*TILE,TILE,TILE);
    }
    this.items.forEach(i=>i.draw(g));
    this.en.forEach(e=>e.draw(g));
    this.p.draw(g);
  }
}

/* ─── 起動 ─── */
window.addEventListener('load',()=>{
  try{
    const cv=document.getElementById('gameCanvas');
    const dpr=window.devicePixelRatio||1;
    cv.width=W*TILE*dpr;cv.height=H*TILE*dpr;cv.getContext('2d').scale(dpr,dpr);
    new Game(cv);
  }catch(err){fatal(err);}
});
