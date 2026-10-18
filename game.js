const THREE = window.THREE;

const ROOT = 'https://raw.githubusercontent.com/TT-sensei/navi-character-/main/assets/web/characters/';
const guides = [
  {id:'riku',pose:'waving',label:'ナビキャラ'},
  {id:'sora',pose:'running',label:'ナビキャラ'},
  {id:'kai',pose:'waving',label:'ナビキャラ'},
  {id:'saku',pose:'waving',label:'ナビキャラ'},
  {id:'tsuki',pose:'running',label:'ナビキャラ'},
  {id:'nami',pose:'waving',label:'ナビキャラ'}
];
const game = document.querySelector('#game');
const loading = document.querySelector('#loading');
const message = document.querySelector('#message');
const errorBox = document.querySelector('#error');
const discoverButton = document.querySelector('#discoverButton');
const journalButton = document.querySelector('#journalButton');
const journalPanel = document.querySelector('#journalPanel');
const journalList = document.querySelector('#journalList');
const foundCount = document.querySelector('#foundCount');
const DISCOVERABLE = [
  ['place-はじまりの広場','はじまりの広場'],['place-みずべ','みずべ'],['place-おうちエリア','おうちエリア'],
  ['place-まちの広場','まちの広場'],['place-おはなガーデン','おはなガーデン'],
  ['person-sora','ソラ'],['person-saku','サク'],['person-kai','カイ'],['person-nami','ナミ'],['person-tsuki','ツキ']
];
let discovered = new Set();
try { discovered = new Set(JSON.parse(localStorage.getItem('tt3d-discovered') || '[]')); } catch (_) { discovered = new Set(); }
let scene, camera, renderer, player, playerSprite, guideIndex = Math.floor(Math.random()*guides.length);
let yaw = 0, walkTime = 0, lookMode = false, nearbyTarget = null, lastNearbyMessage = '';
const landmarks = [];
const townsfolk = [];
const keys = new Set();
const held = new Set();
const clock = new THREE.Clock();
const worldLimit = 28;
const mats = {};
// Use simple, stable colors for the toy-like town. Keep lighting gentle so
// bright ambient light does not wash the colored surfaces toward white.
const color = (hex) => new THREE.MeshLambertMaterial({color:hex});
function box(parent, w,h,d, hex, x,y,z, material=null) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), material || color(hex));
  mesh.position.set(x,y,z); mesh.castShadow=true; mesh.receiveShadow=true; parent.add(mesh); return mesh;
}
function ball(parent, r, hex, x,y,z, sx=1,sy=1,sz=1) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r,14,10), color(hex));
  mesh.position.set(x,y,z); mesh.scale.set(sx,sy,sz); mesh.castShadow=true; parent.add(mesh); return mesh;
}
function makeTree(x,z,scale=1) {
  const g=new THREE.Group(); g.position.set(x,0,z); g.scale.setScalar(scale); scene.add(g);
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.16,.22,1.15,7),color('#9b6b4b')); trunk.position.y=.56; trunk.castShadow=true;g.add(trunk);
  ball(g,.72,'#3d9957',0,1.55,0,1,1.12,1);
  ball(g,.48,'#65b96c',-.32,1.86,.05,.95,.95,.95);
  ball(g,.48,'#2f874c',.36,1.83,-.08,1,1,1);
}
function makeHouse(x,z,wall,roof) {
  const g=new THREE.Group();g.position.set(x,0,z);scene.add(g);
  box(g,2.8,1.9,2.5,wall,0,.95,0);
  const roofMesh=new THREE.Mesh(new THREE.ConeGeometry(2.15,1.45,4),color(roof));
  roofMesh.position.set(0,2.62,0);roofMesh.rotation.y=Math.PI/4;roofMesh.castShadow=true;g.add(roofMesh);
  box(g,.58,1.05, .09,'#815d49',0,.53,1.28);
  for(const wx of [-.78,.78]){box(g,.5,.55,.08,'#bce8f3',wx,1.15,1.29);box(g,.07,.6,.1,'#fff5d8',wx,1.15,1.34);box(g,.52,.07,.1,'#fff5d8',wx,1.15,1.34);}
}
function makeBench(x,z,rot=0) {
  const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=rot;scene.add(g);
  box(g,1.65,.16,.48,'#b98155',0,.62,0);
  for(const px of [-.62,.62])box(g,.13,.62,.14,'#87664e',px,.31,0);
  for(let i=0;i<3;i++)box(g,1.65,.08,.12,['#d7a16c','#c98c5d','#e0b17b'][i],0,.76,-.16+i*.16);
}
function makeLamp(x,z) {
  const g=new THREE.Group();g.position.set(x,0,z);scene.add(g);
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.07,.1,2.25,8),color('#617c7a'));pole.position.y=1.1;g.add(pole);
  ball(g,.24,'#ffe9a8',0,2.35,0,1,1.15,1);
}
function makeFlowerbed(x,z) {
  const g=new THREE.Group();g.position.set(x,0,z);scene.add(g);
  const soil=new THREE.Mesh(new THREE.CylinderGeometry(.85,.95,.16,20),color('#9a7959'));soil.position.y=.08;g.add(soil);
  for(let i=0;i<16;i++){const a=i*Math.PI*2/16,r=.25+Math.random()*.42;ball(g,.13,['#ff9fba','#fff0a0','#c5b7ff','#f8f8ed'][i%4],Math.cos(a)*r,.28,Math.sin(a)*r,.85,1.1,.85);}
}
function loadCharacterTexture(id, poses, onLoad, onFail) {
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');
  const tryPose = (index) => {
    if (index >= poses.length) { if (onFail) onFail(); return; }
    loader.load(
      ROOT + id + '/fullbody/' + poses[index] + '.webp',
      texture => { texture.encoding=THREE.sRGBEncoding; onLoad(texture, poses[index]); },
      undefined,
      () => tryPose(index + 1)
    );
  };
  tryPose(0);
}
function makeTownsperson(id,x,z,pose) {
  const fallbacks = {
    kai:['waving','adjusting-glasses','looking-over-glasses','thinking'],
    riku:['waving','hands-in-pockets','leaning'],
    sora:['waving','greeting','running'],
    saku:['waving','soft-wave','hands-clasped'],
    tsuki:['running','waving','dynamic-pose'],
    nami:['waving','reaching-out','hands-behind-back']
  };
  const poses = [pose, ...(fallbacks[id] || ['waving'])].filter((p,i,a)=>a.indexOf(p)===i);
  loadCharacterTexture(id,poses,texture=>{
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false}));
    sprite.scale.set(1.65,2.2,1);sprite.position.set(x,1.1,z);
    sprite.userData.townsperson=id;sprite.userData.id='person-'+id;sprite.userData.title=({sora:'ソラ',saku:'サク',kai:'カイ',nami:'ナミ',tsuki:'ツキ',riku:'リク'})[id]||id;sprite.userData.message=sprite.userData.title+'を見つけたよ！ あいさつしてみよう。';
    scene.add(sprite);townsfolk.push(sprite);
  },()=>console.warn('ナビキャラ画像を読み込めませんでした:',id,poses));
}
function makeSign(x,z,title,subtitle) {
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=180;
  const c=canvas.getContext('2d');c.fillStyle='#fff9e8';c.strokeStyle='#c8a875';c.lineWidth=8;
  c.beginPath();c.roundRect(8,8,496,164,28);c.fill();c.stroke();
  c.fillStyle='#35515a';c.textAlign='center';c.font='bold 48px sans-serif';c.fillText(title,256,75);
  c.font='bold 25px sans-serif';c.fillStyle='#7b8f75';c.fillText(subtitle,256,122);
  const tex=new THREE.CanvasTexture(canvas);tex.encoding=THREE.sRGBEncoding;
  const board=new THREE.Mesh(new THREE.PlaneGeometry(3.0,1.05),new THREE.MeshBasicMaterial({map:tex,transparent:true,side:THREE.DoubleSide}));
  board.position.set(x,2.2,z);scene.add(board);
  const post=box(scene,.12,1.6,.12,'#9d7b56',x,1,z);
  board.userData.id='place-'+title;board.userData.title=title;
  board.userData.message=title+'を見つけたよ！ まわりをよく見てみよう。';
  landmarks.push(board);
}
function setupWorld() {
  scene=new THREE.Scene();scene.background=new THREE.Color('#86d2f2');scene.fog=new THREE.Fog('#a8dff3',38,82);
  camera=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,.1,120);
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.8));renderer.setSize(innerWidth,innerHeight);
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputEncoding=THREE.sRGBEncoding;renderer.toneMapping=THREE.NoToneMapping;renderer.toneMappingExposure=1.0;
  game.insertBefore(renderer.domElement,game.firstChild);
  scene.add(new THREE.HemisphereLight('#d0e5f2','#4c6842',0.58));
  const sun=new THREE.DirectionalLight('#f6e8cf',0.68);sun.position.set(-8,16,8);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-32;sun.shadow.camera.right=32;sun.shadow.camera.top=32;sun.shadow.camera.bottom=-32;scene.add(sun);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(100,100),color('#78bd70'));ground.rotation.x=-Math.PI/2;ground.position.y=-.06;ground.receiveShadow=true;scene.add(ground);
  // Curving-looking path made from friendly rounded blocks.
  box(scene,5,.05,54,'#d8b97f',0,.01,0);
  box(scene,42,.05,4.2,'#d8b97f',0,.015,5);
  // stepping stones along the road
  for(let z=-20;z<22;z+=3){const s=new THREE.Mesh(new THREE.CylinderGeometry(.34,.34,.07,12),color('#ead6a6'));s.position.set(.1,.06,z);scene.add(s);}
  // Pond and stepping stones
  const pond=new THREE.Mesh(new THREE.CircleGeometry(3.2,40),new THREE.MeshLambertMaterial({color:'#27b4d2'}));pond.rotation.x=-Math.PI/2;pond.position.set(8,.02,-7);scene.add(pond);
  for(let i=0;i<5;i++){const stone=new THREE.Mesh(new THREE.CylinderGeometry(.38,.42,.15,10),color('#b8aa8b'));stone.position.set(6.4+i*.7,.12,-7+Math.sin(i*.8)*.6);scene.add(stone);}
  makeHouse(-7,-7,'#f7c96b','#d95f4b');makeHouse(7,12,'#70c9df','#397eb5');makeHouse(-9,14,'#f08fb0','#8d5bb4');
  makeHouse(10,-15,'#f3cf79','#bd7d31');makeHouse(-19,-10,'#9bd27f','#398a66');makeHouse(19,13,'#f2b18c','#bf5e57');
  makeBench(-3,-15,.15);makeBench(3,-15,-.15);makeBench(5,1,Math.PI/2);makeBench(-5,7,-Math.PI/2);
  makeLamp(-4,-17);makeLamp(4,-17);makeLamp(-4,3);makeLamp(4,3);makeLamp(13,-3);makeLamp(13,2);
  makeFlowerbed(-3,-11);makeFlowerbed(3,-11);makeFlowerbed(13,5);makeFlowerbed(-16,7);
  [[-14,-16,1.2],[-12,-4,.9],[-14,8,1.1],[-4,20,.9],[11,20,1.1],[15,10,.9],[15,-13,1.2],[4,-19,.8],[-19,1,1.1],[20,0,1]].forEach(p=>makeTree(...p));
  makeSign(0,-18,'はじまりの広場','あるいて たんけん');
  makeSign(11,-3,'みずべ','池のまわりを歩こう');
  makeSign(-13,4,'おうちエリア','かわいい家を見つけよう');
  makeSign(0,7,'まちの広場','ベンチでひとやすみ');
  makeSign(17,3,'おはなガーデン','お気に入りの花を探そう');
  makeTownsperson('sora',-2,-13,'waving.webp');makeTownsperson('saku',3,-12,'waving.webp');
  makeTownsperson('kai',-11,1,'waving.webp');makeTownsperson('nami',13,7,'waving.webp');makeTownsperson('tsuki',17,-10,'running.webp');
  // A few flowers as color dots
  for(let i=0;i<36;i++){const x=(Math.random()-.5)*42,z=(Math.random()-.5)*46;if(Math.abs(x)<3.2||Math.abs(z-5)<2.6)continue;ball(scene,.09,['#ffcfda','#fff0a5','#d6c7f5'][i%3],x,.12,z,1,.7,1);}
  player=new THREE.Group();scene.add(player);player.position.set(0,0,2);
  loadGuide(guideIndex);
}
function loadGuide(index) {
  guideIndex=index;
  if(playerSprite) {player.remove(playerSprite);playerSprite.material.map?.dispose();playerSprite.material.dispose();playerSprite=null;}
  const g=guides[index];
  const fallbacks = {
    kai:['waving','adjusting-glasses','looking-over-glasses','thinking'],
    riku:['waving','hands-in-pockets','leaning'],
    sora:['running','waving','greeting'],
    saku:['waving','soft-wave','hands-clasped'],
    tsuki:['running','waving','dynamic-pose'],
    nami:['waving','reaching-out','hands-behind-back']
  };
  const poses=[g.pose,...(fallbacks[g.id]||['waving'])].filter((p,i,a)=>a.indexOf(p)===i);
  message.textContent='ナビキャラを よんでいるよ…';
  loadCharacterTexture(g.id,poses,texture=>{
    const mat=new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false});
    playerSprite=new THREE.Sprite(mat);playerSprite.scale.set(2.25,3.0,1);playerSprite.position.y=1.48;player.add(playerSprite);
    errorBox.hidden=true;
    message.textContent='ナビキャラと まちを たんけんしよう！';
  },()=>{
    errorBox.hidden=false;errorBox.textContent='ナビキャラの画像を読みこめなかったよ。ネットにつながっているか確認してね。';
    message.textContent='画像を読みこめなかったよ。';
  });
}
function renderJournal() {
  const count = discovered.size;
  foundCount.textContent = count + '/' + DISCOVERABLE.length;
  journalList.innerHTML = '';
  for (const [id,label] of DISCOVERABLE) {
    const li=document.createElement('li');
    li.className=discovered.has(id)?'found':'missing';
    li.textContent=(discovered.has(id)?'✓ ':'○ ')+label;
    journalList.appendChild(li);
  }
}
function recordDiscovery(item) {
  const id=item?.userData?.id;
  if(!id || discovered.has(id)) return;
  discovered.add(id);
  try { localStorage.setItem('tt3d-discovered',JSON.stringify([...discovered])); } catch (_) {}
  renderJournal();
  discoverButton.hidden=true;
  message.textContent=(item.userData.title||'ここ')+'をノートに記録したよ！';
}
function getMoveVector() {
  let forward=0,side=0;
  if(keys.has('ArrowUp')||keys.has('w')||keys.has('W')||held.has('up'))forward+=1;
  if(keys.has('ArrowDown')||keys.has('s')||keys.has('S')||held.has('down'))forward-=1;
  if(keys.has('ArrowLeft')||keys.has('a')||keys.has('A')||held.has('left'))side-=1;
  if(keys.has('ArrowRight')||keys.has('d')||keys.has('D')||held.has('right'))side+=1;
  return {forward,side};
}
function animate() {
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),.04), m=getMoveVector();
  const moving=m.forward!==0||m.side!==0;
  if(moving) {
    const len=Math.hypot(m.forward,m.side)||1;const speed=5.3;
    const dx=(Math.sin(yaw)*m.forward+Math.cos(yaw)*m.side)*speed*dt/len;
    const dz=(-Math.cos(yaw)*m.forward+Math.sin(yaw)*m.side)*speed*dt/len;
    player.position.x=THREE.MathUtils.clamp(player.position.x+dx,-worldLimit,worldLimit);
    player.position.z=THREE.MathUtils.clamp(player.position.z+dz,-worldLimit,worldLimit);
    walkTime+=dt*9;
    if(playerSprite){playerSprite.position.y=1.48+Math.abs(Math.sin(walkTime))*.08;playerSprite.material.rotation=Math.sin(walkTime)*.025;}
  }
  // Keep the character sprite facing the camera.
  if(playerSprite)playerSprite.material.rotation=moving?Math.sin(walkTime)*.025:0;
  let nearest=null,nearestD=3.2;
  for(const item of [...landmarks,...townsfolk]){const p=item.position;const d=Math.hypot(player.position.x-p.x,player.position.z-p.z);if(d<nearestD){nearest=item;nearestD=d;}}
  if(nearest!==nearbyTarget){nearbyTarget=nearest;if(nearest){const msg=nearest.userData.message||'ナビキャラがいるよ！ あいさつしてみよう。';message.textContent=msg;lastNearbyMessage=msg;}else{lastNearbyMessage='';}}
  discoverButton.hidden=!(nearbyTarget && nearbyTarget.userData.id && !discovered.has(nearbyTarget.userData.id));
  const target=new THREE.Vector3(player.position.x,1.2,player.position.z);
  const behind=new THREE.Vector3(Math.sin(yaw)*7,5.4,Math.cos(yaw)*7);
  camera.position.lerp(target.clone().add(behind),1-Math.pow(.001,dt));
  camera.lookAt(target);
  renderer.render(scene,camera);
}
document.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();keys.add(e.key);});
document.addEventListener('keyup',e=>keys.delete(e.key));
document.querySelectorAll('[data-dir]').forEach(btn=>{
  const dir=btn.dataset.dir;
  const on=e=>{e.preventDefault();held.add(dir);btn.classList.add('pressed');};
  const off=e=>{e.preventDefault();held.delete(dir);btn.classList.remove('pressed');};
  btn.addEventListener('pointerdown',on);btn.addEventListener('pointerup',off);btn.addEventListener('pointercancel',off);btn.addEventListener('pointerleave',off);
});
discoverButton.addEventListener('click',()=>recordDiscovery(nearbyTarget));
journalButton.addEventListener('click',()=>{const opening=journalPanel.hidden;journalPanel.hidden=!opening;journalButton.setAttribute('aria-expanded',String(opening));});
document.querySelector('#closeJournal').addEventListener('click',()=>{journalPanel.hidden=true;journalButton.setAttribute('aria-expanded','false');});
renderJournal();
document.querySelector('#changeGuide').addEventListener('click',()=>{loadGuide((guideIndex+1+Math.floor(Math.random()*(guides.length-1)))%guides.length);message.textContent='ちがうナビキャラと たんけん！';});
document.querySelector('#lookAround').addEventListener('click',()=>{yaw+=Math.PI/3;message.textContent='向きをかえたよ。気になる場所へ行ってみよう！';});
addEventListener('resize',()=>{if(!camera||!renderer)return;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
try { setupWorld(); loading.classList.add('done'); animate(); }
catch(err) { loading.textContent='3Dのまちを始められなかったよ';errorBox.hidden=false;errorBox.textContent=String(err); }
