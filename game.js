/* ------------------------------------------------------------
 * Mini Rogue  v0.8.1
 *   ▸ ダッシュアイテム修正：取得後 5 ターンの間、毎ターン 2 マス移動
 *   ▸ UI に残りダッシュターン表示
 *   ▸ それ以外は v0.8 と同等
 * ----------------------------------------------------------- */

/* ── グローバルエラーハンドラ ── */
function fatal(e){
  console.error(e);
  const d=document.getElementById('fatal');
  d.textContent=`⚠️ 致命的エラー\n\n${e.message||e}\n\n詳細はコンソールを確認してください。`;
  d.style.display='block';
}
window.addEventListener('error',ev=>fatal(ev.error||ev.message));
window.addEventListener('unhandledrejection',ev=>fatal(ev.reason));

/* ── 基本定数・ユーティリティ ── */
const TILE=16,W=20,H=20,FLOOR=0,WALL=1;
const COLOR={
  floor:'#444',wall:'#666',player:'#00e676',enemy:'#ff5252',
  heal:'#00bcd4',power:'#ffc107',dash:'#ff80ff'
};
const MISS=0.15,CRIT=0.15;
const R=n=>Math.floor(Math.random()*n);
const RNG=(a,b)=>a+R(b-a+1);
const ADJ=(ax,ay,bx,by)=>Math.abs(ax-bx)+Math.abs(ay-by)===1;

/* ── 簡易ドットパターン ── */
function pattern(col,noise=0){
  const c=document.createElement('canvas');c.width=c.height=TILE;
  const g=c.getContext('2d');g.fillStyle=col;g.fillRect(0,0,TILE,TILE);
  if(noise){
    const d=g.getImageData(0,0,TILE,TILE);
    for(let i=0;i<d.data.length;i+=4){
      const v=(Math.random()*noise)|0;
      d.data[i]+=v;d.data[i+1]+=v;d.data[i+2]+=v;
    }g.putImageData(d,0,0);
  }return g.createPattern(c,'repeat');
}

/* ── マップ生成（壁密度↑） ── */
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

/* ── エンティティ基底 ── */
let ENEMY_ID=1;
class Entity{constructor(x,y,col,hp){this.x=x;this.y=y;this.col=col;this.hp=hp;}
  draw(g){g.fillStyle=this.col;g.fillRect(this.x*TILE,this.y*TILE,TILE,TILE);}}

/* ── プレイヤー ── */
class Player extends Entity{
  constructor(x,y){
    super(x,y,COLOR.player,20);
    this.atkBonus=0;
    this.dashTurns=0;       // ← 残りダッシュターン
  }
}

/* ── 敵タイプ ── */
class Enemy extends Entity{
  constructor(x,y,hp=RNG(5,12)){super(x,y,COLOR.enemy,hp);this.id=ENEMY_ID++;}
  act(gm){ if(this.tryAttack(gm)) return; this.moveToward(gm,1);}
  dirToP(gm){return [Math.sign(gm.p.x-this.x),Math.sign(gm.p.y-this.y)];}
  tryAttack(gm,repeat=1){
    if(!ADJ(this.x,this.y,gm.p.x,gm.p.y))return false;
    for(let i=0;i<repeat;i++){
      if(Math.random()<MISS){gm.elog(`敵${this.id}の攻撃は外れました。`,'n');}
      else{
        let dmg=RNG(1,6);if(Math.random()<CRIT)dmg*=2;
        gm.p.hp-=dmg;gm.elog(`敵${this.id}は${dmg}のダメージを与えました。`,'pd');
      }
    }return true;
  }
  moveToward(gm,steps){
    for(let s=0;s<steps;s++){
      const [dx,dy]=this.dirToP(gm);
      const plans=[[dx,dy],[R(3)-1,R(3)-1]];
      let moved=false;
      for(const[ mx,my]of plans){
        const tx=this.x+mx,ty=this.y+my;
        if(gm.walk(tx,ty)&&!gm.enemyAt(tx,ty)&&(tx!==gm.p.x||ty!==gm.p.y)){
          this.x=tx;this.y=ty;moved=true;break;
        }
      }
      if(!moved) break;
    }
    gm.elog(`敵${this.id}は移動しました。`,'n');
  }
}

class DoubleAttackEnemy extends Enemy{constructor(x,y){super(x,y);this.col='#ff8c52';}
  act(gm){if(this.tryAttack(gm,2))return;this.moveToward(gm,1);} }

class FastEnemy extends Enemy{constructor(x,y){super(x,y);this.col='#52a0ff';}
  act(gm){if(this.tryAttack(gm))return;this.moveToward(gm,2);} }

/* ── アイテム ── */
class Item extends Entity{
  constructor(x,y,type){super(x,y,COLOR[type],1);this.type=type;}
}

/* ── メインゲーム ── */
class Game{
  constructor(cv){
    this.cv=cv;this.ctx=cv.getContext('2d');
    this.patFloor=pattern(COLOR.floor,16);this.patWall=pattern(COLOR.wall,24);
    this.map=makeMap();this.turn=1;

    this.p=new Player(...this.randFloor());
    this.en=this.spawnEnemies(5);

    this.items=[];
    this.spawnItem('heal',3);
    this.spawnItem('power',2);
    this.spawnItem('dash',2);

    this.msg='冒険開始！';
    this.render();this.bindInput();
  }

  /* ---- 補助 ---- */
  randFloor(){let x,y;do{x=R(W);y=R(H);}while(this.map[y][x]!==FLOOR);return[x,y];}
  walk(x,y){return x>=0&&x<W&&y>=0&&y<H&&this.map[y][x]===FLOOR;}
  enemyAt(x,y){return this.en.find(e=>e.x===x&&e.y===y);}
  itemIdx(x,y){return this.items.findIndex(i=>i.x===x&&i.y===y);}

  /* ---- ログ ---- */
  log(div,text,cls='n'){const d=document.getElementById(div);d.innerHTML+=`<span class="${cls}">${text}</span><br>`;d.scrollTop=d.scrollHeight;}
  elog(t,c){this.log('elog',t,c);}
  plog(t,c){this.log('plog',t,c);}

  /* ---- UI ---- */
  ui(){
    const atkMin=this.p.atkBonus+3,atkMax=this.p.atkBonus+6;
    const dash=`${this.p.dashTurns?` ダッシュ残り${this.p.dashTurns}T`:''}`;
    document.getElementById('msg').textContent=this.msg;
    document.getElementById('stats').textContent=`HP ${this.p.hp}  ATK ${atkMin}-${atkMax}  Turn ${this.turn}${dash}`;
    const list=document.getElementById('enemyList');
    list.innerHTML=this.en.length?this.en.map(e=>`<span>敵${e.id}: HP ${e.hp}</span>`).join(''):'敵は残っていません';
  }

  /* ---- 敵 & アイテム ---- */
  spawnEnemies(n){
    const arr=[];
    while(arr.length<n){
      const [x,y]=this.randFloor();
      if(x===this.p.x&&y===this.p.y)continue;
      if(arr.some(e=>e.x===x&&e.y===y))continue;
      const r=Math.random();
      arr.push(r<.33?new DoubleAttackEnemy(x,y):r<.66?new FastEnemy(x,y):new Enemy(x,y));
    }
    return arr;
  }
  spawnItem(type,n){
    while(n--){
      let x,y;
      do{[x,y]=this.randFloor();}
      while(this.enemyAt(x,y)||(x===this.p.x&&y===this.p.y)||this.itemIdx(x,y)!==-1);
      this.items.push(new Item(x,y,type));
    }
  }

  /* ---- 入力 ---- */
  bindInput(){
    const dir={ArrowUp:[0,-1,'北'],ArrowDown:[0,1,'南'],ArrowLeft:[-1,0,'西'],ArrowRight:[1,0,'東']};
    addEventListener('keydown',e=>{
      try{
        if(dir[e.key]){const [dx,dy,txt]=dir[e.key];this.moveTurn(dx,dy,txt);e.preventDefault();}
        else if(e.code==='Space'){this.attackTurn();e.preventDefault();}
      }catch(err){fatal(err);}
    });
    let sx,sy;
    this.cv.addEventListener('touchstart',e=>{const t=e.touches[0];sx=t.clientX;sy=t.clientY;});
    this.cv.addEventListener('touchend',e=>{
      const t=e.changedTouches[0],dx=t.clientX-sx,dy=t.clientY-sy;
      const [mx,my,txt]=Math.abs(dx)>Math.abs(dy)
        ?[dx>0?1:-1,0,dx>0?'東':'西']
        :[0,dy>0?1:-1,dy>0?'南':'北'];
      try{this.moveTurn(mx,my,txt);}catch(err){fatal(err);}
    });
    document.getElementById('atkBtn').addEventListener('click',()=>{try{this.attackTurn();}catch(err){fatal(err);}});
  }

  /* ---- プレイヤーターン：移動 ---- */
  moveTurn(mx,my,dirName){
    if(!this.p.hp)return;
    const maxStep=this.p.dashTurns?2:1;
    let step=0,acted=false;

    while(step<maxStep){
      const nx=this.p.x+mx,ny=this.p.y+my,foe=this.enemyAt(nx,ny);
      if(foe){this.hitEnemy(foe);acted=true;break;}
      if(this.walk(nx,ny)){
        this.p.x=nx;this.p.y=ny;this.checkItem();acted=true;step++;
      }else break;
    }

    if(acted){
      this.msg=`プレイヤーは${dirName}に移動しました。`;
      this.plog(this.msg,'n');
      this.afterPlayerAction();
    }
  }

  /* ---- プレイヤーターン：攻撃 ---- */
  attackTurn(){
    if(!this.p.hp)return;
    const tgt=this.en.find(e=>ADJ(e.x,e.y,this.p.x,this.p.y));
    if(!tgt){
      this.msg='プレイヤーは空振りしました。';this.plog(this.msg,'n');
    }else{this.hitEnemy(tgt);}
    this.afterPlayerAction();
  }

  /* ---- プレイヤー → 敵ダメ ---- */
  hitEnemy(e){
    if(Math.random()<MISS){this.msg='プレイヤーの攻撃は外れました。';this.plog(this.msg,'n');return;}
    let dmg=RNG(3,6)+this.p.atkBonus;
    const crit=Math.random()<CRIT;if(crit)dmg*=2;
    e.hp-=dmg;
    this.msg=`プレイヤーは敵${e.id}に${dmg}のダメージを与えました。${crit?'(クリティカル)':''}`;
    this.plog(this.msg,'ed');
    if(e.hp<=0){this.en=this.en.filter(v=>v!==e);this.msg=`敵${e.id}を倒しました。`;this.plog(this.msg,'ed');}
  }

  /* ---- アイテム取得 ---- */
  checkItem(){
    const idx=this.itemIdx(this.p.x,this.p.y);if(idx===-1)return;
    const it=this.items[idx];
    if(it.type==='heal'){
      const before=this.p.hp;this.p.hp=Math.min(this.p.hp+10,20);
      const diff=this.p.hp-before;
      this.msg=`プレイヤーは ${diff} 回復しました。`;this.plog(this.msg,'heal');
    }else if(it.type==='power'){
      this.p.atkBonus+=3;this.msg='攻撃力が 3 上がりました。';this.plog(this.msg,'stat');
    }else if(it.type==='dash'){
      this.p.dashTurns=5;this.msg='ダッシュ状態になりました。(5 ターン)';this.plog(this.msg,'stat');
    }
    this.items.splice(idx,1);
  }

  /* ---- プレイヤー行動後共通 ---- */
  afterPlayerAction(){
    this.enemyPhase();
  }

  /* ---- 敵フェーズ ---- */
  enemyPhase(){
    this.en=this.en.filter(e=>e.hp>0);
    for(const e of this.en)e.act(this);
    this.endTurn();
  }

  /* ---- ターン終了 ---- */
  endTurn(){
    if(this.p.dashTurns>0)this.p.dashTurns--;        // 残ターン減
    if(this.p.hp<=0){
      this.msg='プレイヤーは倒れました…。';this.plog(this.msg,'pd');
      this.cv.style.filter='grayscale(1)';
    }
    this.turn++;this.render();
  }

  /* ---- 描画 + UI ---- */
  render(){this.ui();this.draw();}
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

/* ---- 起動 ---- */
window.addEventListener('load',()=>{
  try{
    const cv=document.getElementById('gameCanvas');
    const dpr=window.devicePixelRatio||1;
    cv.width=W*TILE*dpr;cv.height=H*TILE*dpr;cv.getContext('2d').scale(dpr,dpr);
    new Game(cv);
  }catch(e){fatal(e);}
});
