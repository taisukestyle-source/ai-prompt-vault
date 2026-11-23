const DB_NAME='ai-prompt-vault', DB_VERSION=1, STORE='prompts';
const CATEGORIES=[
  {id:'person',label:'人物'},
  {id:'outfit',label:'衣装'},
  {id:'landscape',label:'風景・背景'},
  {id:'gothic',label:'ゴシック'},
  {id:'fantasy',label:'ファンタジー'},
  {id:'anime',label:'アニメ'},
  {id:'other',label:'その他'}
];
let db, records=[], currentId=null, editingId=null, activeFilter='all', activeCategory='all', newestFirst=true;
let coverFile=null, extraFiles=[], existingCover=null, existingExtras=[];
let galleryImages=[], galleryIndex=0, galleryScale=1, galleryStartDistance=0, galleryStartScale=1, galleryStartX=0, galleryStartY=0, galleryTranslateX=0, galleryTranslateY=0, galleryPointers=new Map(), lastTap=0;
const $=id=>document.getElementById(id);
function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,DB_VERSION);req.onupgradeneeded=()=>{const d=req.result;if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE,{keyPath:'id'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function tx(mode='readonly'){return db.transaction(STORE,mode).objectStore(STORE);}
function all(){return new Promise((res,rej)=>{const r=tx().getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
function save(item){return new Promise((res,rej)=>{const r=tx('readwrite').put(item);r.onsuccess=()=>res();r.onerror=()=>rej(r.error);});}
function remove(id){return new Promise((res,rej)=>{const r=tx('readwrite').delete(id);r.onsuccess=()=>res();r.onerror=()=>rej(r.error);});}
function imgURL(blob){return blob?URL.createObjectURL(blob):'';}
function escapeHTML(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function categoryLabel(id){return CATEGORIES.find(c=>c.id===id)?.label||'';}
function categoryBadges(ids=[]){return (Array.isArray(ids)?ids:[]).map(id=>categoryLabel(id)).filter(Boolean).map(label=>`<span class="category-badge">${escapeHTML(label)}</span>`).join('');}
function show(view){['listView','detailView','formView'].forEach(id=>$(id).classList.toggle('active',id===view));$('addFab').classList.toggle('hidden',view!=='listView');$('storageNote').classList.toggle('hidden',view!=='listView');window.scrollTo(0,0);}
function renderCategoryFilters(){
 const host=$('categoryFilters');
 host.innerHTML=`<button class="chip ${activeCategory==='all'?'active':''}" data-category-filter="all">全カテゴリー</button>`+
 CATEGORIES.map(c=>`<button class="chip ${activeCategory===c.id?'active':''}" data-category-filter="${c.id}">${escapeHTML(c.label)}</button>`).join('');
 host.querySelectorAll('[data-category-filter]').forEach(b=>b.onclick=()=>{activeCategory=b.dataset.categoryFilter;renderCategoryFilters();renderList();});
}
function renderList(){
 const q=$('search').value.trim().toLowerCase();
 let data=records.filter(x=>(activeFilter!=='fav'||x.favorite)&&
   (activeCategory==='all'||(Array.isArray(x.categories)&&x.categories.includes(activeCategory)))&&
   (!q||[x.title,x.prompt,x.negative,(x.categories||[]).map(categoryLabel).join(' ')].join(' ').toLowerCase().includes(q)));
 data.sort((a,b)=>(newestFirst?b.updatedAt-a.updatedAt:a.updatedAt-b.updatedAt));
 $('count').textContent=`${data.length}件`;
 $('cards').innerHTML=data.length?'':`<div class="empty"><div style="font-size:34px">✦</div><b>${q||activeCategory!=='all'?'見つかりませんでした':'まだ登録がありません'}</b>${q||activeCategory!=='all'?'検索・カテゴリー条件を変えてみてください':'＋ボタンから最初のプロンプトを登録しましょう。'}</div>`;
 data.forEach(item=>{
  const card=document.createElement('article');card.className='card';
  card.innerHTML=`${item.cover?`<img class="thumb" alt="" src="${imgURL(item.cover)}">`:`<div class="placeholder">✦</div>`}<div class="cardbody"><div class="cardtitle">${escapeHTML(item.title)}</div><div class="cardcategories">${categoryBadges(item.categories||[])}</div><div class="cardmeta"><span>${new Date(item.updatedAt).toLocaleDateString('ja-JP')}</span><span>${item.favorite?'♥':''} ${item.extras?.length||0}枚</span></div></div>`;
  card.addEventListener('click',()=>openDetail(item.id));$('cards').appendChild(card);
 });
}
function openDetail(id){
 currentId=id;const x=records.find(r=>r.id===id);if(!x)return;
 const el=$('detailContent');
 const imageCount=(x.cover?1:0)+(x.extras?.length||0);
 el.innerHTML=`${x.cover?`<img class="detailhero zoomable" data-gallery-index="0" src="${imgURL(x.cover)}" alt="メイン画像を拡大">`:`<div class="placeholder">✦</div>`}
 <h2 class="detailtitle">${escapeHTML(x.title)}</h2><div class="muted">更新：${new Date(x.updatedAt).toLocaleString('ja-JP')}</div>
 ${x.categories?.length?`<div class="detailcategories">${categoryBadges(x.categories)}</div>`:''}
 <section class="block"><div class="blockhead"><strong>メインプロンプト</strong><button class="copy" data-copy="prompt">コピー</button></div><div class="prompttext">${escapeHTML(x.prompt||'（未入力）')}</div></section>
 <section class="block"><div class="blockhead"><strong>ネガティブプロンプト</strong><button class="copy" data-copy="negative">コピー</button></div><div class="prompttext">${escapeHTML(x.negative||'（未入力）')}</div></section>
 <section class="block"><div class="blockhead"><strong>追加画像</strong><span class="muted">${x.extras?.length||0}枚</span></div><div class="attachments">${(x.extras||[]).map((b,i)=>`<img class="zoomable" data-gallery-index="${x.cover?i+1:i}" src="${imgURL(b)}" alt="参考画像 ${i+1}を拡大">`).join('')||'<span class="muted">追加画像はありません</span>'}</div></section>
 <div class="actions"><button class="secondary" id="favDetail">${x.favorite?'♥ お気に入り解除':'♡ お気に入り'}</button><button class="primary" id="editDetail">編集</button><button class="danger" id="deleteDetail">削除</button></div>`;
 el.querySelectorAll('.zoomable').forEach(img=>img.addEventListener('click',()=>openGallery(x,Number(img.dataset.galleryIndex))));
 el.querySelectorAll('[data-copy]').forEach(btn=>btn.addEventListener('click',async()=>{const value=x[btn.dataset.copy]||'';try{await navigator.clipboard.writeText(value);btn.textContent='コピーしました';setTimeout(()=>btn.textContent='コピー',1400);}catch(e){alert('コピーできませんでした。テキストを選択してコピーしてください。');}}));
 $('favDetail').onclick=async()=>{x.favorite=!x.favorite;x.updatedAt=Date.now();await save(x);await refresh();openDetail(id);};
 $('editDetail').onclick=()=>openForm(id);
 $('deleteDetail').onclick=async()=>{if(confirm('このプロンプトを削除しますか？')){await remove(id);await refresh();show('listView');}};
 show('detailView');
}
function renderCategoryChoices(selected=[]){
 $('categoryChoices').innerHTML=CATEGORIES.map(c=>`<label class="category-option"><input type="checkbox" name="category" value="${c.id}" ${selected.includes(c.id)?'checked':''}><span>${escapeHTML(c.label)}</span></label>`).join('');
}
function selectedCategories(){return [...$('categoryChoices').querySelectorAll('input[name="category"]:checked')].map(x=>x.value);}
function resetForm(){ $('promptForm').reset();coverFile=null;extraFiles=[];existingCover=null;existingExtras=[];$('coverPreview').innerHTML='';$('extraPreview').innerHTML='';renderCategoryChoices([]);}
function preview(file,container,removeFn){const url=URL.createObjectURL(file);const d=document.createElement('div');d.className='preview';d.innerHTML=`<img src="${url}"><button type="button">×</button>`;d.querySelector('button').onclick=()=>{URL.revokeObjectURL(url);removeFn();d.remove();};container.appendChild(d);}
function openForm(id=null){
 resetForm();editingId=id;
 $('formHeading').textContent=id?'EDIT PROMPT':'NEW PROMPT';
 if(id){const x=records.find(r=>r.id===id);$('title').value=x.title;$('prompt').value=x.prompt||'';$('negative').value=x.negative||'';existingCover=x.cover;existingExtras=[...(x.extras||[])];renderCategoryChoices(x.categories||[]);if(existingCover)preview(existingCover,$('coverPreview'),()=>existingCover=null);existingExtras.forEach((b,i)=>preview(b,$('extraPreview'),()=>existingExtras[i]=null));}
 show('formView');
}
$('cover').addEventListener('change',e=>{coverFile=e.target.files[0]||null;$('coverPreview').innerHTML='';if(coverFile)preview(coverFile,$('coverPreview'),()=>{coverFile=null;$('cover').value='';});});
$('extras').addEventListener('change',e=>{const selected=[...e.target.files];selected.forEach(file=>{const idx=extraFiles.length;extraFiles.push(file);preview(file,$('extraPreview'),()=>extraFiles[idx]=null);});e.target.value='';});
$('promptForm').addEventListener('submit',async e=>{
 e.preventDefault();const title=$('title').value.trim();if(!title){alert('タイトルを入力してください');return;}
 const old=editingId?records.find(r=>r.id===editingId):null;const cover=coverFile||existingCover;if(!cover){alert('サムネイル画像を選択してください');return;}
 const extras=[...existingExtras.filter(Boolean),...extraFiles.filter(Boolean)];
 const item={id:old?.id||crypto.randomUUID(),title,cover,prompt:$('prompt').value,negative:$('negative').value,categories:selectedCategories(),extras,favorite:old?.favorite||false,createdAt:old?.createdAt||Date.now(),updatedAt:Date.now()};
 try{await save(item);await refresh();show('listView');}catch(err){alert('保存できませんでした。端末の空き容量を確認してください。');}
});
async function refresh(){records=await all();renderCategoryFilters();renderList();}
$('addFab').onclick=()=>openForm();$('detailBack').onclick=()=>{show('listView');renderList();};$('formBack').onclick=()=>show(editingId?'detailView':'listView');$('cancelForm').onclick=()=>$('formBack').click();
$('search').oninput=renderList;
document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{activeFilter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));renderList();});
$('sortBtn').onclick=()=>{newestFirst=!newestFirst;$('sortBtn').textContent=newestFirst?'新しい順 ↓':'古い順 ↑';renderList();};
function blobToData(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob);});}
function dataToBlob(data){const [head,b64]=data.split(',');const mime=head.match(/:(.*?);/)[1];const bytes=atob(b64);const arr=new Uint8Array(bytes.length);for(let i=0;i<bytes.length;i++)arr[i]=bytes.charCodeAt(i);return new Blob([arr],{type:mime});}
$('backupBtn').onclick=async()=>{try{const payload=[];for(const x of records)payload.push({...x,cover:await blobToData(x.cover),extras:await Promise.all((x.extras||[]).map(blobToData))});const blob=new Blob([JSON.stringify({app:'AI Prompt Vault',version:1,exportedAt:new Date().toISOString(),records:payload})],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`ai-prompt-vault-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href);}catch(e){alert('バックアップを作成できませんでした。');}};
$('backupBtn').title='バックアップを書き出す';
$('backupBtn').addEventListener('contextmenu',e=>e.preventDefault());
$('backupBtn').addEventListener('dblclick',()=>$('restoreFile').click());
$('backupBtn').insertAdjacentHTML('afterend','<button class="iconbtn" id="restoreBtn" title="バックアップを復元">↧</button>');
$('restoreBtn').onclick=()=>$('restoreFile').click();
$('restoreFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{const data=JSON.parse(await file.text());if(data.app!=='AI Prompt Vault'||!Array.isArray(data.records))throw Error('invalid');if(!confirm(`${data.records.length}件のデータを復元します。既存データと統合します。よろしいですか？`))return;for(const x of data.records)await save({...x,cover:dataToBlob(x.cover),extras:(x.extras||[]).map(dataToBlob),categories:Array.isArray(x.categories)?x.categories:[]});await refresh();alert('復元しました。');}catch(err){alert('バックアップファイルを読み込めませんでした。');}finally{e.target.value='';}};

/* 画像ライトボックス */
function openGallery(record,index){
 galleryImages=[];
 if(record.cover)galleryImages.push(record.cover);
 (record.extras||[]).forEach(b=>galleryImages.push(b));
 if(!galleryImages.length)return;
 galleryIndex=Math.max(0,Math.min(index,galleryImages.length-1));
 $('imageViewer').classList.remove('hidden');
 $('imageViewer').setAttribute('aria-hidden','false');
 document.body.classList.add('viewer-open');
 renderGalleryImage();
}
function renderGalleryImage(){
 const image=$('viewerImage');
 image.src=imgURL(galleryImages[galleryIndex]);
 resetGalleryZoom();
 $('viewerCounter').textContent=`${galleryIndex+1} / ${galleryImages.length}`;
 $('viewerPrev').disabled=galleryIndex===0;
 $('viewerNext').disabled=galleryIndex===galleryImages.length-1;
}
function closeGallery(){
 $('imageViewer').classList.add('hidden');
 $('imageViewer').setAttribute('aria-hidden','true');
 document.body.classList.remove('viewer-open');
 $('viewerImage').removeAttribute('src');
 galleryImages=[];
}
function moveGallery(delta){
 const next=galleryIndex+delta;
 if(next<0||next>=galleryImages.length)return;
 galleryIndex=next;renderGalleryImage();
}
function resetGalleryZoom(){galleryScale=1;galleryTranslateX=0;galleryTranslateY=0;applyGalleryTransform();}
function applyGalleryTransform(){$('viewerImage').style.transform=`translate(${galleryTranslateX}px,${galleryTranslateY}px) scale(${galleryScale})`;}
function touchDistance(a,b){return Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);}
const viewerImage=$('viewerImage');
viewerImage.addEventListener('pointerdown',e=>{
 viewerImage.setPointerCapture(e.pointerId);
 galleryPointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(galleryPointers.size===1){galleryStartX=e.clientX;galleryStartY=e.clientY;galleryStartDistance=0;}
 if(galleryPointers.size===2){const p=[...galleryPointers.values()];galleryStartDistance=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);galleryStartScale=galleryScale;}
});
viewerImage.addEventListener('pointermove',e=>{
 if(!galleryPointers.has(e.pointerId))return;
 galleryPointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(galleryPointers.size===2){const p=[...galleryPointers.values()];const d=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);if(galleryStartDistance)galleryScale=Math.max(1,Math.min(4,galleryStartScale*d/galleryStartDistance));applyGalleryTransform();}
 else if(galleryPointers.size===1&&galleryScale>1){galleryTranslateX+=e.movementX;galleryTranslateY+=e.movementY;applyGalleryTransform();}
});
viewerImage.addEventListener('pointerup',e=>{
 const p=galleryPointers.get(e.pointerId);
 if(p&&galleryPointers.size===1&&galleryScale===1){
   const dx=e.clientX-galleryStartX,dy=e.clientY-galleryStartY;
   if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy))moveGallery(dx<0?1:-1);
 }
 galleryPointers.delete(e.pointerId);
});
viewerImage.addEventListener('pointercancel',e=>galleryPointers.delete(e.pointerId));
viewerImage.addEventListener('dblclick',()=>{galleryScale=galleryScale>1?1:2;galleryTranslateX=0;galleryTranslateY=0;applyGalleryTransform();});
$('viewerClose').onclick=closeGallery;
$('viewerPrev').onclick=()=>moveGallery(-1);
$('viewerNext').onclick=()=>moveGallery(1);
$('imageViewer').addEventListener('click',e=>{if(e.target===$('imageViewer'))closeGallery();});
document.addEventListener('keydown',e=>{if($('imageViewer').classList.contains('hidden'))return;if(e.key==='Escape')closeGallery();if(e.key==='ArrowLeft')moveGallery(-1);if(e.key==='ArrowRight')moveGallery(1);});
(async()=>{try{db=await openDB();await refresh();if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});}catch(e){alert('このブラウザではデータベースを開けませんでした。Safariで開いてください。');}})();
