const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(v,d=2)=>v==null||v===''?'—':Number.isFinite(Number(v))?Number(v).toFixed(d):esc(v);
const money=v=>Number(v||0).toLocaleString('ja-JP')+'円';
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const day=()=>$('date').value.replaceAll('-','');
const lane=n=>`<span class="lane lane-${Number(n)}">${esc(n)}</span>`;
const combo=s=>`<span class="combination">${String(s||'').split('-').map(lane).join(' − ')}</span>`;
const names={hit:'🎯 的中特化',high:'💥 一撃重視',scenario:'🧭 展開予想'};
function read(key,fallback){try{return JSON.parse(localStorage.getItem(key)||JSON.stringify(fallback))}catch{return fallback}}
let activeView='races',selection=null,venues=[],predictions=[],performance=null,sequence=0,raceRequest=0,resultRequest=0,mode='hit',displayed=null;
let comparisonRequest=0;
function token(){try{return sessionStorage.getItem('usa_rebuild_token')||localStorage.getItem('usa_lab_d1_token')||''}catch{return ''}}
async function api(path,{method='GET',body,privateAccess=false}={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
  try{const headers={};if(privateAccess){if(!token())throw Error('設定でD1認証キーを保存してください');headers.Authorization='Bearer '+token()}
    if(body)headers['content-type']='application/json';
    const response=await fetch(path,{method,body:body?JSON.stringify(body):undefined,headers,signal:controller.signal,cache:'no-store'});
    const data=await response.json();if(!response.ok||!data.ok)throw Error(data.error||`HTTP ${response.status}`);return data;
  }catch(error){if(error.name==='AbortError')throw Error('取得に時間がかかっています。再取得してください');throw error}finally{clearTimeout(timer)}
}
function status(message){$('status').textContent=message}
const resultLabels={main6:'本線6点',main10:'本線10点',main15:'本線15点',hole:'穴候補',hit:'的中特化',high:'一撃重視',scenario:'展開予想'};
let savedResultRows=[];
const resultModes=row=>row.outcome?.modes||{main6:row.outcome?.baseline,scenario:row.outcome?.scenario};
const resultRatingLabels={'':'全評価',S:'S評価（すべて）',S_BET:'S勝負',S_PASS:'S見送り',A:'A評価',B:'B評価',unknown:'評価不明'};
const matchesResultRating=(row,rating)=>!rating||rating==='S_BET'&&row.confidence==='S'&&row.decision==='BET'||rating==='S_PASS'&&row.confidence==='S'&&row.decision==='PASS'||rating==='unknown'&&!['S','A','B'].includes(row.confidence)||row.confidence===rating;
const resultRatingText=row=>row.confidence==='S'?(row.decision==='BET'?'S評価・S勝負':row.decision==='PASS'?'S評価・S見送り':'S評価'):['A','B'].includes(row.confidence)?row.confidence+'評価':'評価不明';
const resultState=v=>['hit','miss','pending'].includes(v?.status)?v.status:'unavailable';
const resultStatus={hit:'🎯 的中',miss:'不的中',pending:'結果待ち',unavailable:'買い目なし'};
const resultCash=v=>v==null||!Number.isFinite(Number(v))?'未取得':money(v);
const resultProfit=v=>v==null||!Number.isFinite(Number(v))?'—':(Number(v)>0?'+':'')+money(v);

function showView(view){if(!['races','predictions','results','settings'].includes(view))return;activeView=view;document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!==view);document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));if(view==='results'){loadPerformance();loadScenarioPerformance()};if(view==='settings')renderDrafts()}
function resetRace(){selection=null;displayed=null;++raceRequest;$('raceDetail').hidden=true;$('raceList').replaceChildren()}
async function loadDay(){const id=++sequence,hd=day();if(!/^\d{8}$/.test(hd))return;resetRace();status('開催場と保存済み予想を取得中…');$('venues').innerHTML='';$('predictionList').innerHTML='';$('officialResults').innerHTML='';++resultRequest;$('loadOfficialResults').disabled=false;
  const [v,p]=await Promise.allSettled([api('/api/venues?hd='+hd),api('/api/today-predictions?date='+hd)]);if(id!==sequence)return;
  venues=v.status==='fulfilled'?v.value.venues||[]:[];predictions=p.status==='fulfilled'?p.value.predictions||[]:[];
  $('venueCount').textContent=venues.length+'会場';renderVenues();loadVenueDeadlines(hd,id);
  $('resultVenue').innerHTML='<option value="">開催場を選択</option>'+venues.map(v=>`<option value="${esc(v.jcd)}">${esc(v.name)}</option>`).join('');renderPredictions();status([v.status==='rejected'?'開催場：'+v.reason.message:venues.length+'会場',p.status==='rejected'?'予想：'+p.reason.message:predictions.length+'Rの保存済み予想'].join(' ／ '));
  if(activeView==='results'){loadPerformance();loadScenarioPerformance()};
}
async function openVenue(jcd,rno){const id=++raceRequest,hd=day();selection={hd,jcd,rno:null};displayed=null;$('raceList').replaceChildren();$('raceDetail').hidden=true;showView('races');status('レース一覧を取得中…');
  try{const data=await api(`/api/venue?hd=${hd}&jcd=${jcd}`);if(id!==raceRequest||hd!==day())return;
    document.querySelectorAll('[data-venue]').forEach(b=>b.classList.toggle('selected',b.dataset.venue===jcd));selection.venue=data.venue;
    $('raceList').innerHTML=`<h2>${esc(data.venue)}のレース</h2><div class="race-list">${(data.races||[]).map(r=>`<button data-rno="${Number(r.rno)}">${Number(r.rno)}R<small>締切 ${esc(r.deadline||'—')}</small></button>`).join('')}</div>`;status('レースを選択してください');if(rno)openRace(rno);return true;
  }catch(e){if(id===raceRequest)status(e.message)}
}
function openRace(rno){if(!selection)return;selection.rno=Number(rno);$('raceTitle').textContent=`${selection.venue||selection.jcd} ${rno}R`;$('raceDetail').hidden=false;mode='hit';showTab('entry');$('raceDetail').scrollIntoView({behavior:'smooth',block:'start'})}
function table(headers,rows){return `<div class="table-wrap"><table><thead><tr>${headers.map(h=>'<th>'+esc(h)+'</th>').join('')}</tr></thead><tbody>${rows.map(r=>'<tr>'+r.map(v=>'<td>'+v+'</td>').join('')+'</tr>').join('')}</tbody></table></div>`}
function empty(s){return `<p class="empty">${esc(s)}</p>`}
async function showTab(tab){if(!selection?.rno)return;const id=++raceRequest,selected={...selection};displayed=null;document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tab===tab)));$('raceContent').innerHTML=empty('取得中…');
  try{const endpoint={entry:'race',ai:'prediction',before:'before',odds:'odds',result:'result'}[tab];const data=await api(`/api/${endpoint}?hd=${selected.hd}&jcd=${selected.jcd}&rno=${selected.rno}`);if(id!==raceRequest)return;
    if(tab==='ai'){displayed=data;renderAI();return}
    if(tab==='entry')$('raceContent').innerHTML=table(['艇','選手','級別','全国勝率','当地勝率','平均ST','モーター2連率'],(data.racers||[]).map(r=>[lane(r.lane),esc(r.name),esc(r.class),num(r.national?.winRate),num(r.local?.winRate),num(r.avgST),num(r.motor?.secondRate,1)+'%']));
    if(tab==='before')$('raceContent').innerHTML=table(['艇','展示進入','展示タイム','展示ST','チルト','体重'],(data.racers||[]).map(r=>[lane(r.lane),num(r.course,0),num(r.exhibitionTime),num(r.exhibitionST),num(r.tilt,1),num(r.weight,1)]))+`<p class="muted">風速 ${num(data.weather?.windSpeed,1)}m/s ／ 波高 ${num(data.weather?.waveHeight,1)}cm</p>`;
    if(tab==='odds')$('raceContent').innerHTML=(data.odds||[]).length?table(['3連単','オッズ'],data.odds.map(b=>[combo(b.combination),num(b.odds,1)+'倍'])):empty('オッズはまだありません');
    if(tab==='result')$('raceContent').innerHTML=data.finished?`<h3>${combo(data.combination)}　${money(data.payout)}</h3><p class="muted">100円あたりの払戻 ／ 決まり手 ${esc(data.method||'—')}</p>`:empty('結果はまだ確定していません');
  }catch(e){if(id===raceRequest)$('raceContent').innerHTML=empty(e.message)+`<button data-retry-tab="${esc(tab)}">再取得</button>`}
}
function renderAI(){const data=displayed,p=data?.snapshot;if(!p){$('raceContent').innerHTML=empty('予想データがありません');return}if(mode==='scenario'){renderScenario();return}const bets=p.purposePicks?.[mode]||data.purposeModes?.[mode]?.bets||[],preliminary=Boolean(p.preliminary)||!data.saved;
  const decision=p.sDecision||{},badge=decision.status==='BET'?'bet':decision.status==='PASS'?'pass':'';
  $('raceContent').innerHTML=`<div class="badges"><span class="badge ${badge}">${esc(decision.label||p.confidence+'評価')}</span><span class="badge ${preliminary?'preview':''}">${preliminary?'暫定予想':p.finalized?'確定予想':'保存済み予想'}</span><span class="badge">AI V${esc(p.version)}</span></div><p class="muted">締切 ${esc(data.deadline||p.deadline||'—')} ／ 分析 ${esc(p.createdAt||'—')}</p><div class="stats"><div class="stat"><small>万舟推定</small><b>${p.manshu?.probability==null?'—':num(p.manshu.probability*100,1)+'%'}</b></div><div class="stat"><small>S安定スコア</small><b>${num(decision.score,1)}</b></div><div class="stat"><small>学習データ</small><b>${Number(p.learningRaces||0)}R</b></div><div class="stat"><small>評価した買い目</small><b>${Number(p.evaluatedCount||0)}通り</b></div></div>${preliminary?empty('展示・オッズの更新で予想が変わることがあります。暫定予想として確認してください。'):''}${mainSixMetricsHtml(data.main6Metrics)}<nav class="mode-tabs">${Object.entries(names).map(([k,n])=>`<button data-mode="${k}" aria-pressed="${mode===k}">${n}</button>`).join('')}</nav>${bets.length?betTable(bets):empty('このタイプの条件を満たす候補はありません')}<p class="muted">共通のAI V6.7.6から目的別に選んだ買い目です。推定確率・EVは予測値です。</p><details><summary>本線上位15点・穴候補</summary><h3>本線</h3>${betTable(p.bets||[])}<h3>穴候補</h3>${(p.holeBets||[]).length?betTable(p.holeBets):empty('穴候補なし')}</details><details><summary>総合艇ランキング・判定理由</summary>${table(['艇','選手','総合','1着','2着','3着'],(p.racersDetailed||[]).slice().sort((a,b)=>b.overallScore-a.overallScore).map(r=>[lane(r.lane),esc(r.name),num(r.overallScore,1),num(r.firstScore,1),num(r.secondScore,1),num(r.thirdScore,1)]))}<p class="muted">${esc((decision.reasons||[]).join(' ／ '))}</p></details><div class="actions"><button data-note>note用文章を作成</button>${!data.saved?'<button data-save>この予想をD1に保存</button>':''}<button data-retry-tab="ai" class="soft">保存状況を再取得</button></div><div id="noteEditor" class="note-editor" hidden><label>note用文章<textarea id="noteText"></textarea></label><div class="actions"><button data-note-copy>コピー</button><button data-note-save class="soft">下書きを端末に保存</button></div><p id="noteStatus" role="status"></p></div>`;
}
function betTable(bets){return table(['3連単','オッズ','推定確率','EV'],bets.map(b=>[combo(b.combination),num(b.odds,1)+'倍',num(Number(b.probability)*100,2)+'%',num(b.ev)]))}
function notificationBadges(row){
 const n=row.notifications;
 const sent=[n?.line?'LINE通知済み':'',n?.push?'Web Push通知済み':''].filter(Boolean);
 return '<div class="notification-badges">'+(sent.length?sent.map(t=>'<span class="notification-sent">🔔 '+t+'</span>').join(''):'<span class="muted">'+(n?.line===false&&n?.push===false?'通知送信記録なし':'通知履歴未取得')+'</span>')+'</div>';
}
function renderPredictions(){const f=$('predictionFilter').value;const filtered=predictions.filter(p=>f==='all'||f==='s'&&p.confidence==='S'||f==='bet'&&p.confidence==='S'&&p.decision==='BET'||f==='pass'&&p.confidence==='S'&&p.decision==='PASS');$('predictionList').innerHTML=filtered.map(p=>`<article class="prediction-card"><div><h3>${esc(p.venue)} ${Number(p.rno)}R</h3>${notificationBadges(p)}<span class="muted">締切 ${esc(p.deadline||'—')} ／ ${esc(p.confidence)}評価 ${p.preliminary?'・暫定':''} ／ ${esc(p.decision==='BET'?'S勝負':p.decision==='PASS'?'S見送り':'')}</span></div><button data-open-venue="${esc(p.jcd)}" data-open-rno="${Number(p.rno)}">予想を見る</button></article>`).join('')||empty('この条件の保存済み予想はありません')}
async function loadPerformance(){const hd=day(),id=sequence;$('performance').innerHTML=empty('取得中…');$('savedResults').innerHTML='';savedResultRows=[];$('resultOverview').innerHTML='';$('savedResultCount').textContent='';const results=await Promise.allSettled([api('/api/performance-stats',{privateAccess:true}),api('/api/results?date='+hd,{privateAccess:true})]);if(id!==sequence||activeView!=='results')return;
  performance=results[0].status==='fulfilled'?results[0].value.performance:null;
  if(performance)renderPerformance();else $('performance').innerHTML=empty(results[0].reason.message);
  if(results[1].status==='fulfilled'){savedResultRows=results[1].value.results||[];const selected=$('savedVenue').value;$('savedVenue').innerHTML='<option value="">すべての開催場</option>'+[...new Set(savedResultRows.map(r=>r.venue))].map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');if([...$('savedVenue').options].some(o=>o.value===selected))$('savedVenue').value=selected;renderSavedResults()}else $('savedResults').innerHTML=empty(results[1].reason.message);
}
function renderPerformance(){const b=performance?.[$('performancePeriod').value]||{};$('performance').innerHTML=`<div class="stats"><div class="stat"><small>S勝負</small><b>${Number(b.sBetRaces||0)}R</b></div><div class="stat"><small>本線6点の購入総額</small><b>${resultCash(b.sBetMain6Stake)}</b></div><div class="stat"><small>本線6点の払戻</small><b>${money(b.sBetMain6Return)}</b></div><div class="stat"><small>本線6点の収支</small><b>${money(b.sBetMain6Profit)}</b></div><div class="stat"><small>本線6点の回収率</small><b>${num(b.sBetMain6RecoveryRate,1)}%</b></div></div><p class="muted">S勝負の本線は1点1,000円（6点なら6,000円）の試算です。穴候補は別途1点1,000円。過去分も同条件で再計算します。払戻未取得 ${Number(b.sBetMissingPayoutRaces||0)}R。下の現行AI・展開比較も各6点×1,000円です。</p>`}
async function officialResults(){const jcd=$('resultVenue').value,hd=day(),id=++resultRequest;if(!jcd){$('officialResults').innerHTML=empty('開催場を選択してください');return}$('loadOfficialResults').disabled=true;$('officialResults').innerHTML=empty('結果を取得中…');
  try{const venue=await api(`/api/venue?hd=${hd}&jcd=${jcd}`);const races=venue.races||[];let cursor=0,completed=0;const rows=new Array(races.length);
    async function runner(){while(cursor<races.length&&id===resultRequest){const n=cursor++,r=races[n];try{rows[n]={rno:r.rno,data:await api(`/api/result?hd=${hd}&jcd=${jcd}&rno=${r.rno}`)}}catch(e){rows[n]={rno:r.rno,error:e.message}}completed++;if(id===resultRequest)$('officialResults').innerHTML=empty(`取得中 ${completed}/${races.length}R`)}}
    await Promise.all([runner(),runner(),runner()]);if(id!==resultRequest)return;$('officialResults').innerHTML=table(['レース','3連単','払戻（100円）'],rows.filter(Boolean).map(r=>[Number(r.rno)+'R',r.error?esc(r.error):r.data.finished?combo(r.data.combination):'未確定',r.data?.finished?money(r.data.payout):'—']));
  }catch(e){if(id===resultRequest)$('officialResults').innerHTML=empty(e.message)}finally{if(id===resultRequest)$('loadOfficialResults').disabled=false}
}
function noteText(){const p=displayed.snapshot;if(mode==='scenario')return scenarioNoteText(p,displayed);const bets=p.purposePicks?.[mode]||displayed.purposeModes?.[mode]?.bets||[];return [`🐰 うさLAB｜${p.date} ${p.venue} ${p.rno}R`,`予想タイプ：${names[mode]}`,`締切：${displayed.deadline||p.deadline||'—'}`,`評価：${p.confidence} / ${p.sDecision?.label||'—'}`,`AI信頼度：${displayed.stars||'—'}`,`状態：${p.preliminary||!displayed.saved?'暫定予想':'保存済み予想'}`,`AI V${p.version}`,dataMetricsNote(displayed.main6Metrics),'', '■ 目的別の買い目（1点1,000円の試算）',...bets.map((b,i)=>`${i+1}. ${b.combination} / ${num(b.odds,1)}倍 / 推定 ${num(b.probability*100)}%`),'','■ 本線上位6点（1点1,000円の試算）',...(p.bets||[]).slice(0,6).map(b=>`${b.combination} / ${num(b.odds,1)}倍`),'','■ 穴候補（1点1,000円の試算）',...(p.holeBets||[]).map(b=>`${b.combination} / ${num(b.odds,1)}倍`),'','■ 判定理由',...(p.sDecision?.reasons||[]),'',`分析時刻：${p.createdAt}`,'※AIによる参考予想です。的中や利益を保証しません。舟券の購入はご自身の判断でお願いします。'].join('\n')}
function renderDrafts(){const drafts=read('usaLAB_note_drafts_v1',{});$('drafts').replaceChildren();Object.entries(drafts).sort((a,b)=>String(b[1].savedAt).localeCompare(String(a[1].savedAt))).slice(0,50).forEach(([key,d])=>{const details=document.createElement('details'),summary=document.createElement('summary'),area=document.createElement('textarea');summary.textContent=d.title||key;area.value=d.text||'';area.readOnly=true;area.style.width='100%';details.append(summary,area);$('drafts').append(details)})}
async function loadJobs(){try{const data=await api('/api/jobs',{privateAccess:true});$('jobs').innerHTML=table(['処理','状態','最終完了'],data.jobs.map(j=>[esc(j.job),esc(j.status||'未実行'),esc(j.finished_at||'—')]))+data.jobs.filter(j=>j.status==='PARTIAL'||j.status==='ERROR').map(j=>`<details><summary>${esc(j.job)}の詳細</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(j.summary_json)}</pre></details>`).join('')}catch(e){$('jobs').innerHTML=empty(e.message)}}
$('date').value=today();$('predictionFilter').value=new URLSearchParams(location.search).get('filter')==='s'?'s':'all';
$('token').value=token();try{$('rememberToken').checked=Boolean(localStorage.getItem('usa_lab_d1_token'))}catch{}
$('authStatus').textContent=token()?'認証キー設定済み':'認証キー未設定';
$('date').addEventListener('change',()=>{$('loadOfficialResults').disabled=false;loadDay()});$('refresh').onclick=loadDay;
function shift(n){const d=new Date($('date').value+'T12:00:00');d.setDate(d.getDate()+n);$('date').value=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');$('date').dispatchEvent(new Event('change'))}
$('previousDay').onclick=()=>shift(-1);$('nextDay').onclick=()=>shift(1);$('closeDetail').onclick=()=>{++raceRequest;displayed=null;$('raceDetail').hidden=true};
['savedMode','savedStatus','savedVenue','savedRating'].forEach(id=>$(id).onchange=renderSavedResults);$('predictionFilter').onchange=renderPredictions;$('performancePeriod').onchange=()=>{renderPerformance();loadScenarioPerformance()};$('loadOfficialResults').onclick=officialResults;$('loadJobs').onclick=loadJobs;
$('saveToken').onclick=async()=>{const value=$('token').value.trim();if(!value){$('authStatus').textContent='キーを入力してください';return}try{const response=await fetch('/api/jobs',{headers:{Authorization:'Bearer '+value},cache:'no-store'}),data=await response.json();if(!response.ok||!data.ok)throw Error(data.error||'認証に失敗しました');sessionStorage.setItem('usa_rebuild_token',value);if($('rememberToken').checked)localStorage.setItem('usa_lab_d1_token',value);else localStorage.removeItem('usa_lab_d1_token');$('authStatus').textContent='認証成功。キーを保存しました'}catch(e){$('authStatus').textContent=e.message}};
$('removeToken').onclick=()=>{sessionStorage.removeItem('usa_rebuild_token');localStorage.removeItem('usa_lab_d1_token');$('token').value='';$('authStatus').textContent='キーを削除しました'};
$('exportHistory').onclick=()=>{const data={history:read('boat_ai_predictions',[]),drafts:read('usaLAB_note_drafts_v1',{})},url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='usaLAB-backup-'+day()+'.json';a.click();URL.revokeObjectURL(url)};
$('enablePush').onclick=async()=>{try{if(!token())throw Error('先にD1認証キーを保存してください');if(!('serviceWorker' in navigator)||!('PushManager' in window))throw Error('このブラウザはWeb Pushに対応していません');if(await Notification.requestPermission()!=='granted')throw Error('通知が許可されていません');const registration=await navigator.serviceWorker.register('/api/push-sw.js',{scope:'/'});await navigator.serviceWorker.ready;const key=(await api('/api/push/public-key')).publicKey;const padded=key.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-key.length%4)%4);const applicationServerKey=Uint8Array.from(atob(padded),c=>c.charCodeAt(0));const subscription=await registration.pushManager.getSubscription()||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey});await api('/api/push/subscribe',{method:'POST',body:subscription.toJSON(),privateAccess:true});$('pushStatus').textContent='通知を有効にしました'}catch(e){$('pushStatus').textContent=e.message}};
$('disablePush').onclick=async()=>{try{const registration=await navigator.serviceWorker.getRegistration('/'),sub=await registration?.pushManager.getSubscription();if(sub){await api('/api/push/unsubscribe',{method:'POST',body:{endpoint:sub.endpoint},privateAccess:true});await sub.unsubscribe()}$('pushStatus').textContent='通知を解除しました'}catch(e){$('pushStatus').textContent=e.message}};
document.addEventListener('click',async event=>{const button=event.target.closest('button');if(!button)return;
 if(button.dataset.view)showView(button.dataset.view);
 else if(button.dataset.venue)openVenue(button.dataset.venue);
 else if(button.dataset.rno)openRace(button.dataset.rno);
 else if(button.dataset.tab)showTab(button.dataset.tab);
 else if(button.dataset.retryTab)showTab(button.dataset.retryTab);
 else if(button.dataset.openVenue){const opened=await openVenue(button.dataset.openVenue,button.dataset.openRno);if(opened&&selection?.rno)showTab('ai')}
 else if(button.dataset.mode){mode=button.dataset.mode;renderAI()}
 else if(button.hasAttribute('data-note')){$('noteEditor').hidden=false;$('noteText').value=noteText()}
 else if(button.hasAttribute('data-note-copy')){try{await navigator.clipboard.writeText($('noteText').value);$('noteStatus').textContent='コピーしました'}catch{$('noteText').select();$('noteStatus').textContent='選択された文章をコピーしてください'}}
 else if(button.hasAttribute('data-note-save')){try{const p=displayed.snapshot,drafts=read('usaLAB_note_drafts_v1',{}),key=`${p.date}-${p.jcd}-${p.rno}-${mode}`;drafts[key]={title:`${p.date} ${p.venue} ${p.rno}R ${names[mode]}`,text:$('noteText').value,savedAt:new Date().toISOString()};localStorage.setItem('usaLAB_note_drafts_v1',JSON.stringify(drafts));$('noteStatus').textContent='下書きを保存しました'}catch{$('noteStatus').textContent='保存できませんでした'}}
 else if(button.hasAttribute('data-save')){button.disabled=true;const selected={...selection},id=raceRequest;try{const data=await api(`/api/prediction?hd=${selected.hd}&jcd=${selected.jcd}&rno=${selected.rno}`,{method:'POST',privateAccess:true});if(id!==raceRequest)return;displayed=data;renderAI();status('D1に保存しました')}catch(e){if(id===raceRequest){status(e.message);button.disabled=false}}}
 else if(button.dataset.job){button.disabled=true;$('jobStatus').textContent='処理中…';try{const data=await api('/api/jobs/run',{method:'POST',body:{job:button.dataset.job},privateAccess:true});$('jobStatus').textContent=data.status==='RUNNING'?'既に実行中です':data.status==='PARTIAL'?'一部の取得・通知に失敗しました。自動再試行の対象です。':'処理が完了しました';loadJobs()}catch(e){$('jobStatus').textContent=e.message}finally{button.disabled=false}}
});
showView(new URLSearchParams(location.search).get('view')||'races');loadDay();
setInterval(async()=>{if(document.hidden||activeView!=='predictions')return;const hd=day(),id=sequence;try{const data=await api('/api/today-predictions?date='+hd);if(id!==sequence)return;predictions=data.predictions||[];renderPredictions()}catch{}},60000);

function renderScenario(){
 const p=displayed.snapshot,a=p.scenarioAnalysis;
 const nav=`<nav class="mode-tabs" aria-label="予想方法">${Object.entries(names).map(([k,n])=>`<button data-mode="${k}" aria-pressed="${mode===k}">${n}</button>`).join('')}</nav>`;
 if(!a){$('raceContent').innerHTML=nav+empty('この保存済み予想には展開予想がありません。更新後に新しく作成・保存する予想から表示されます。過去の予想を後付けで作成して実績には加えません。');return}
 const preliminary=p.preliminary||!displayed.saved;
 $('raceContent').innerHTML=nav+`<div class="scenario-intro"><span class="badge">展開ルール v${esc(a.version)}</span> <span class="badge ${preliminary?'preview':''}">${preliminary?'暫定・参考':'保存済み・参考'}</span><h3>スタートから1マークの展開を考える</h3><p>${esc(a.method)}</p><p class="muted">${esc(a.scoreMeaning)} 現行AIの予想・S判定とは別枠です。</p><p class="muted">締切 ${esc(displayed.deadline||p.deadline||'—')} ／ 作成 ${esc(a.generatedAt)}</p></div>`+
 `<details open><summary>使ったデータとST参考隊形</summary><p class="muted">${a.courseSource==='exhibition'?'取得した展示進入を使用。':'枠なり進入を仮定。'} ST参考値は平均ST70%＋展示ST30%。展示STの6艇分の対応が未確認なら平均STだけを使用します。本番のスタートを予測した確率ではありません。</p>${table(['艇','想定コース','級別','全国勝率','モーター2連率','平均ST','展示ST','ST参考順','展示タイム','F数'],(a.inputs||[]).map(r=>[lane(r.lane),r.course,esc(r.class||'—'),num(r.national),num(r.motor,1)+'%',num(r.avgST),num(r.exhibitionST),r.startRank==null?'—':r.startRank+'位',num(r.exhibitionTime),r.fCount==null?'未取得':esc(r.fCount)]))}</details>`+
 (a.scenarios||[]).map((s,i)=>`<section class="scenario-card"><div class="section-head"><h3>${i===0?'本命候補':i===1?'対抗候補':'別展開候補'}：${lane(s.head)} ${esc(s.label)}</h3><span class="badge">展開評価 ${num(s.score,1)}</span></div><ul>${s.reasons.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><p class="muted">${s.cautions.map(esc).join(' ／ ')}</p>${table(['3連単','オッズ','候補評価'],s.bets.map(b=>[combo(b.combination),num(b.odds,1)+'倍',num(b.score,1)]))}</section>`).join('')+
 scenarioManshuHtml(a.manshuCandidates)+
 (!a.bets.length?empty('必要なデータが不足しているため、展開買い目を作成していません。'):`<p>展開予想：<b>${a.bets.length}点</b>。1点1,000円なら${money(a.bets.length*1000)}の試算です。</p>`)+
 `<details open><summary>未取得・判断できない項目</summary><ul>${[...(a.warnings||[]),...(a.missing||[])].map(x=>`<li>${esc(x)}</li>`).join('')}</ul><p class="muted">記事の考え方を参考にした簡易ルールです。記事にない数値の重みは独自設定で、精度は未検証です。逃げ率・旋回力・心理を取得済みとして判断しません。</p></details>`+
 `<div class="actions"><button data-note>展開予想のnote文章を作成</button>${!displayed.saved?'<button data-save>この予想をD1に保存</button>':''}<button data-retry-tab="ai" class="soft">保存状況を再取得</button></div><div id="noteEditor" class="note-editor" hidden><label>note用文章<textarea id="noteText"></textarea></label><div class="actions"><button data-note-copy>コピー</button><button data-note-save class="soft">下書きを端末に保存</button></div><p id="noteStatus" role="status"></p></div>`;
}
function scenarioNoteText(p,data){const a=p.scenarioAnalysis;return [`🐰 うさLAB｜${p.date} ${p.venue} ${p.rno}R`,'■ 展開予想（現行AIとは別枠）',`締切：${data.deadline||p.deadline||'—'}`,`状態：${p.preliminary||!data.saved?'暫定・参考':'保存済み・参考'}`,
 a?`ルール v${a.version} ／ 作成 ${a.generatedAt}`:'展開予想の保存データなし',a?.scoreMeaning||'',
 ...(a?.scenarios||[]).flatMap((s,i)=>['',`${i+1}. ${s.head}号艇 ${s.label} ／ 展開評価 ${num(s.score,1)}`,...s.reasons,...s.cautions,'買い目：'+s.bets.map(b=>`${b.combination}（${num(b.odds,1)}倍）`).join(' / ')]),
 '',...scenarioManshuText(a?.manshuCandidates),...(a?.warnings||[]),'未取得：'+(a?.missing||[]).join('、'),'','※独自ルールによる参考予想です。展開評価は的中確率ではありません。的中や利益を保証しません。'].join('\n')}
async function loadScenarioPerformance(){const id=++comparisonRequest,period=$('performancePeriod').value;$('scenarioPerformance').innerHTML=empty('同条件の実績を取得中…');
 try{const data=await api('/api/scenario-performance?period='+period,{privateAccess:true});if(id!==comparisonRequest||activeView!=='results')return;const c=data.comparison;
 $('scenarioPerformance').innerHTML=`<p class="muted">展開ルール v${esc(c.version)} ／ ${esc(c.cohort)}</p>`+table(['予想方法','対象','的中','的中率','試算購入','払戻','収支','回収率'],[['現行AI 本線6点',c.baseline],['展開予想6点',c.scenario]].map(([name,b])=>[name,b.races+'R',b.hits+'R',num(b.hitRate,1)+'%',money(b.stake),money(b.returns),money(b.profit),num(b.roi,1)+'%']))+
 (!c.baseline.races?empty('比較できる確定結果はまだありません。更新後に保存したレースの結果が揃うと集計されます。'):'')+
 `<p class="muted">結果待ち ${Number(c.excluded.pending||0)}R ／ 展開未保存 ${Number(c.excluded.noScenario||0)}R ／ その他の除外 ${Object.entries(c.excluded).filter(([k])=>!['pending','noScenario'].includes(k)).reduce((s,[,v])=>s+Number(v||0),0)}R</p>`+
 (c.races.length?`<details><summary>比較対象のレース（最新100件まで）</summary>${table(['日付','会場・R','結果','現行AI','展開予想'],c.races.map(r=>[esc(r.date),esc(r.venue)+' '+Number(r.rno)+'R',combo(r.combination),r.baseline?'的中':'不的中',r.scenario?'的中':'不的中']))}</details>`:'');
 }catch(e){if(id===comparisonRequest)$('scenarioPerformance').innerHTML=empty(e.message)}
}

function renderSavedResults(){
 const key=$('savedMode').value,status=$('savedStatus').value,venue=$('savedVenue').value,rating=$('savedRating').value;
 const base=savedResultRows.filter(r=>(!venue||r.venue===venue)&&matchesResultRating(r,rating));
 const rows=base.filter(r=>!status||resultState(resultModes(r)[key])===status);
 const judged=base.filter(r=>['hit','miss'].includes(resultState(resultModes(r)[key])));
 const hits=judged.filter(r=>resultState(resultModes(r)[key])==='hit').length;
 const settled=judged.filter(r=>resultModes(r)[key]?.profit!=null&&resultModes(r)[key]?.returns!=null);
 const profit=settled.reduce((sum,r)=>sum+Number(resultModes(r)[key].profit),0);
 const purchased=base.filter(r=>resultModes(r)[key]?.count>0&&Number.isFinite(Number(resultModes(r)[key]?.stake)));
 const totalStake=purchased.reduce((sum,r)=>sum+Number(resultModes(r)[key].stake),0);
 const settledStake=settled.reduce((sum,r)=>sum+Number(resultModes(r)[key].stake),0);
 const totalReturns=settled.reduce((sum,r)=>sum+Number(resultModes(r)[key].returns),0);
 $('resultOverview').innerHTML=`<p class="muted">${esc($('date').value)} ・ ${esc(resultLabels[key])} ・ ${venue?esc(venue):'全開催場'} ・ ${esc(resultRatingLabels[rating])}</p><div class="stats result-overview"><div class="stat"><small>的中 / 判定済み</small><b>${hits} / ${judged.length}R</b></div><div class="stat"><small>保存買い目の的中率</small><b>${judged.length?num(hits/judged.length*100,1)+'%':'—'}</b></div><div class="stat"><small>購入総額・試算（${purchased.length}R）</small><b>${money(totalStake)}</b></div><div class="stat"><small>払戻総額・取得済み（${settled.length}R）</small><b>${settled.length?money(totalReturns):'—'}</b></div><div class="stat"><small>収支の試算（${settled.length}R）</small><b class="${profit>0?'profit-plus':profit<0?'profit-minus':''}">${settled.length?resultProfit(profit):'—'}</b></div><div class="stat"><small>結果待ち</small><b>${base.filter(r=>resultState(resultModes(r)[key])==='pending').length}R</b></div></div><p class="muted result-note">選択日・開催場・予想種類・評価の集計です。評価は保存されたレース全体の評価です。暫定予想の参考照合を含みます。購入総額は結果待ち・払戻未取得分も含みます。収支は払戻取得済み分の購入額 ${money(settledStake)} を差し引いた試算です。払戻未取得 ${judged.length-settled.length}R は収支に含めません。上記集計は的中状況の絞り込み前です。</p>`;
 $('savedResultCount').textContent=`表示 ${rows.length} / ${base.length}R`;
 $('savedResults').innerHTML=rows.length?rows.map(savedResultHtml).join(''):empty(savedResultRows.length?'条件に一致するレースはありません。':'この日の保存済みレースはありません。');
}
function savedResultHtml(row){
 const o=row.outcome||{},modes=resultModes(row),key=$('savedMode').value,v=modes[key],state=resultState(v);
 const detail=(k,val)=>{
  const st=resultState(val);
  return `<section class="result-detail"><div class="result-heading"><b>${esc(resultLabels[k])} ・ ${Number(val?.count||0)}点</b><span class="verdict-tag ${st}">${resultStatus[st]}</span></div><dl class="result-money"><div><dt>購入試算</dt><dd>${val?.count?resultCash(val.stake):'—'}</dd></div><div><dt>払戻試算</dt><dd>${st==='pending'?'結果待ち':resultCash(val?.returns)}</dd></div><div><dt>収支試算</dt><dd>${resultProfit(val?.profit)}</dd></div></dl><p class="muted">1点 ${resultCash(val?.unit)}</p><div class="result-pick-list">${(val?.selections||[]).map(c=>`<span class="result-pick ${st==='hit'&&c===val.winningCombination?'matched':''}">${st==='hit'&&c===val.winningCombination?'🎯 ':''}${combo(c)}</span>`).join('')||'<span class="muted">保存された買い目はありません。</span>'}</div></section>`;
 };
 return `<article class="saved-result compact-result"><div class="result-heading"><h4>${esc(row.venue)} ${Number(row.rno)}R</h4><span class="verdict-tag ${state}">${resultStatus[state]}</span></div>${notificationBadges(row)}<span class="result-rating">${esc(resultRatingText(row))}</span>${o.preliminary?'<span class="preliminary-label">暫定予想・参考照合</span>':''}<div class="official-result-line"><span class="muted">確定着順</span>${o.finished?combo(o.combination):'<b>結果待ち</b>'}<span class="official-payout">100円払戻 <b>${o.finished?resultCash(o.payout):'—'}</b></span></div><div class="selected-result"><div><small>${esc(resultLabels[key])} ・ ${Number(v?.count||0)}点</small><strong class="${Number(v?.profit)>0?'profit-plus':Number(v?.profit)<0?'profit-minus':''}">${resultProfit(v?.profit)}</strong><small>収支の試算</small></div><dl><div><dt>購入試算</dt><dd>${v?.count?resultCash(v.stake):'—'}</dd></div><div><dt>払戻試算</dt><dd>${state==='pending'?'結果待ち':v?.count?resultCash(v.returns):'—'}</dd></div></dl></div><div class="mode-verdicts">${['hit','high','scenario','main6','hole'].map(k=>`<span class="mode-verdict ${resultState(modes[k])}">${esc(resultLabels[k])}<b>${resultStatus[resultState(modes[k])]}</b></span>`).join('')}</div><details><summary>買い目・種類別の収支を見る</summary>${Object.entries(resultLabels).map(([k])=>detail(k,modes[k])).join('')}${o.budget?.stake?`<section class="result-detail"><b>通知条件対象の合計試算</b><p>購入 ${resultCash(o.budget.stake)} ／ 払戻 ${resultCash(o.budget.returns)} ／ 収支 ${resultProfit(o.budget.profit)}</p></section>`:''}<details><summary>保存時の本線6点の推定値</summary>${mainSixMetricsHtml(o.main6Metrics)||empty('推定値は保存されていません。')}</details></details></article>`;
}

function scenarioManshuText(m){
 if(!m)return ['展開予想の万舟候補：この予想には保存されていません。'];
 return ['■ 展開予想の万舟候補・AI推定的中確率',`候補全体のAI推定的中確率：${m.probability==null?'算出待ち':num(m.probability*100,2)+'%'}`,
 ...(m.bets||[]).map(b=>`${b.combination}／${num(b.odds,1)}倍／現行AI推定 ${b.probability==null?'未取得':num(b.probability*100,2)+'%'}`),
 m.status==='READY'&&!m.bets.length?'100倍以上の展開候補はありません。':'',
 '展開予想で選ばれた100倍以上の買い目だけを合計。確率は現行AI由来です。展開評価点の確率化ではありません。',
 'レース全体の万舟確率・利益が出る確率とは異なります。実際の的中率との一致は未検証です。'];
}
function scenarioManshuHtml(m){
 if(!m)return empty('この保存済み予想には展開予想の万舟候補データがありません。新しい予想から表示します。');
 return `<section class="scenario-card"><h3>💥 展開予想の万舟候補・AI推定的中確率</h3><p>候補全体：<strong>${m.probability==null?'算出待ち':num(m.probability*100,2)+'%'}</strong> ／ ${(m.bets||[]).length}点</p>${(m.bets||[]).length?table(['3連単','取得時オッズ','現行AI推定'],m.bets.map(b=>[combo(b.combination),num(b.odds,1)+'倍',b.probability==null?'未取得':num(b.probability*100,2)+'%'])):empty(m.status==='READY'?'100倍以上の展開候補はありません。':'必要なデータが不足しています。')}<p class="muted">展開予想で選ばれた100倍以上の買い目だけの確率合計です。確率は現行AI由来で、展開評価点の確率化ではありません。レース全体の万舟確率・利益が出る確率とは異なります。実際の的中率との一致は未検証です。</p></section>`;
}

function mainSixMetricsHtml(m){
 if(!m)return '';
 return `<section class="panel"><h3>本線6点・各1,000円の試算</h3><p>購入額 ${money(m.stake)}（穴候補は別枠）</p><div class="stats"><div class="stat"><small>推定的中確率</small><b>${m.hitProbability==null?'算出待ち':num(m.hitProbability*100,1)+'%'}</b></div><div class="stat"><small>推定回収率</small><b>${m.estimatedRecoveryRate==null?'算出待ち':num(m.estimatedRecoveryRate,1)+'%'}</b></div><div class="stat"><small>6,000円以上を回収する確率</small><b>${m.breakEvenProbability==null?'算出待ち':num(m.breakEvenProbability*100,1)+'%'}</b></div></div><p class="muted">的中確率＝本線6点のAI確率合計。推定回収率＝期待払戻÷6,000円。回収確率＝払戻が6,000円以上になる買い目のAI確率合計。保存時のオッズに基づく予測値で、実際の的中・回収を保証しません。6点が揃わない場合やデータ欠損時は算出待ちです。</p></section>`;
}

function dataMetricsNote(m){return m?`本線6点・6,000円の試算：推定的中 ${m.hitProbability==null?'算出待ち':num(m.hitProbability*100,1)+'%'} ／ 推定回収率 ${m.estimatedRecoveryRate==null?'算出待ち':num(m.estimatedRecoveryRate,1)+'%'} ／ 6,000円以上回収の推定確率 ${m.breakEvenProbability==null?'算出待ち':num(m.breakEvenProbability*100,1)+'%'}（穴を含まないAI推定）`:''}

const venueDeadlines=new Map();
let deadlineRefreshRunning=false;
function venueDeadlineLabel(hd,record,now=Date.now()){
 if(!record)return '締切を確認中…';
 if(record.error)return '締切を取得できません';
 const rows=(record.races||[]).map(r=>{const time=String(r.deadline||'');const iso=r.deadlineJST||(/^\d{1,2}:\d{2}$/.test(time)?`${hd.slice(0,4)}-${hd.slice(4,6)}-${hd.slice(6,8)}T${time.padStart(5,'0')}:00+09:00`:null);return {...r,ms:iso?Date.parse(iso):NaN}});
 const valid=rows.filter(r=>Number.isFinite(r.ms)).sort((a,b)=>a.ms-b.ms);
 if(!valid.length)return '締切時刻未取得';
 const todayKey=today().replaceAll('-','');
 const target=hd>todayKey?valid[0]:hd<todayKey?valid[valid.length-1]:valid.find(r=>r.ms>now);
 if(!target)return valid.length===rows.length?'本日の締切終了':'締切時刻未取得あり';
 const time=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit'}).format(new Date(target.ms));
 const prefix=hd>todayKey?'最初':hd<todayKey?'最終':'次の締切';
 return `${prefix} ${Number(target.rno)}R ${time}`;
}
function renderVenues(){
 const hd=day();
 $('venues').innerHTML=venues.map(v=>`<button data-venue="${esc(v.jcd)}" class="${selection?.hd===hd&&selection?.jcd===v.jcd?'selected':''}">${esc(v.name)}<small class="venue-deadline">${esc(venueDeadlineLabel(hd,venueDeadlines.get(hd+'-'+v.jcd)))}</small><small>レースを見る →</small></button>`).join('')||'<div class="empty">開催場を取得できないか、開催がありません。</div>';
}
async function loadVenueDeadlines(hd,id){
 const targets=venues.slice();let cursor=0;
 async function runner(){while(cursor<targets.length){if(id!==sequence||hd!==day())return;const v=targets[cursor++],key=hd+'-'+v.jcd,old=venueDeadlines.get(key);if(old&&!old.error&&Date.now()-old.fetchedAt<300000)continue;
  try{const data=await api(`/api/venue?hd=${hd}&jcd=${v.jcd}`);if(id!==sequence||hd!==day())return;venueDeadlines.set(key,{races:data.races||[],fetchedAt:Date.now()})}
  catch{if(id!==sequence||hd!==day())return;venueDeadlines.set(key,{error:true,fetchedAt:Date.now()})}
  renderVenues();
 }}
 await Promise.all([runner(),runner()]);
}
setInterval(async()=>{if(document.hidden||activeView!=='races')return;renderVenues();if(deadlineRefreshRunning)return;deadlineRefreshRunning=true;try{await loadVenueDeadlines(day(),sequence)}finally{deadlineRefreshRunning=false}},30000);
