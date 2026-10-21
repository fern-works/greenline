import { GEIST_MONO_BASE64, GEIST_SANS_BASE64 } from "./fonts.ts";
import { STYLE } from "./page-style.ts";

/*
 * One local document for the repository's records and its workspace: the
 * changes, the plans and the knowledge homes, each rendered from its shape,
 * then the checks, the receipts, the repository policy and the
 * installation. Every view sits in one row of navigation, one level deep: a
 * list opens a record's page, and its crumb leads back.
 */

const FERN = String.raw`<symbol id="fw-fern" viewBox="0 0 50.7 100" fill="currentColor"><circle cx="8" cy="7.2" r="3.7"/><circle cx="4.2" cy="67.3" r="3.1" fill-opacity="0.78"/><circle cx="7" cy="57.4" r="3.1" fill-opacity="0.78"/><circle cx="8.2" cy="48.1" r="3" fill-opacity="0.78"/><circle cx="10.5" cy="39.3" r="2.9" fill-opacity="0.78"/><circle cx="12.8" cy="30.6" r="2.8" fill-opacity="0.78"/><circle cx="14.6" cy="22.1" r="2.7" fill-opacity="0.78"/><circle cx="16" cy="14" r="2.6" fill-opacity="0.78"/><circle cx="6.5" cy="76.6" r="3.2" fill-opacity="0.78"/><circle cx="9.5" cy="86" r="3.3" fill-opacity="0.78"/><circle cx="13" cy="95" r="3.2" fill-opacity="0.78"/><circle cx="19.6" cy="8.2" r="2.2" fill-opacity="0.6"/><circle cx="22.4" cy="17.1" r="2.3" fill-opacity="0.6"/><circle cx="24.1" cy="26.5" r="2.4" fill-opacity="0.6"/><circle cx="24.9" cy="36.2" r="2.4" fill-opacity="0.6"/><circle cx="24.4" cy="45.9" r="2.4" fill-opacity="0.6"/><circle cx="22.7" cy="55.4" r="2.3" fill-opacity="0.6"/><circle cx="20.2" cy="64.6" r="2.3" fill-opacity="0.6"/><circle cx="17.7" cy="73.9" r="2.3" fill-opacity="0.6"/><circle cx="16.4" cy="83.5" r="2.3" fill-opacity="0.6"/><circle cx="17.2" cy="93" r="2.3" fill-opacity="0.6"/><circle cx="30.8" cy="12.4" r="1.7" fill-opacity="0.44"/><circle cx="33.2" cy="21.9" r="1.8" fill-opacity="0.44"/><circle cx="34.3" cy="31.8" r="1.9" fill-opacity="0.44"/><circle cx="33.9" cy="41.8" r="1.9" fill-opacity="0.44"/><circle cx="32.1" cy="51.5" r="1.9" fill-opacity="0.44"/><circle cx="29.4" cy="60.9" r="1.8" fill-opacity="0.44"/><circle cx="26.9" cy="70.3" r="1.8" fill-opacity="0.44"/><circle cx="25.6" cy="79.9" r="1.8" fill-opacity="0.44"/><circle cx="26" cy="89.6" r="1.8" fill-opacity="0.44"/><circle cx="40.6" cy="18.1" r="1.3" fill-opacity="0.3"/><circle cx="42.5" cy="28" r="1.4" fill-opacity="0.3"/><circle cx="42.9" cy="38.1" r="1.4" fill-opacity="0.3"/><circle cx="41.7" cy="48" r="1.4" fill-opacity="0.3"/><circle cx="39.3" cy="57.5" r="1.4" fill-opacity="0.3"/><circle cx="36.5" cy="66.8" r="1.4" fill-opacity="0.3"/><circle cx="34.6" cy="76.3" r="1.4" fill-opacity="0.3"/><circle cx="34.4" cy="86.1" r="1.4" fill-opacity="0.3"/><circle cx="47.7" cy="24.6" r="1" fill-opacity="0.2"/><circle cx="48.9" cy="34.8" r="1" fill-opacity="0.2"/><circle cx="48.6" cy="45" r="1" fill-opacity="0.2"/><circle cx="46.8" cy="54.9" r="1" fill-opacity="0.2"/><circle cx="44.2" cy="64.5" r="1" fill-opacity="0.2"/><circle cx="42.1" cy="74.1" r="1" fill-opacity="0.2"/></symbol>`;

/** The views in the navigation's one row, in its order: the records first, then the workspace. */
const VIEWS = [
  ["changes", "Changes"],
  ["plans", "Plans"],
  ["knowledge", "Knowledge"],
  ["overview", "Checks"],
  ["evidence", "Receipts"],
  ["policy", "Repository policy"],
  ["installation", "Installation"],
] as const;

const TOP =
  `<header class="top"><div class="top-inner">` +
  `<a class="brand" href="#changes"><svg viewBox="0 0 50.7 100" aria-hidden="true"><defs>${FERN}</defs><use href="#fw-fern"/></svg>greenline</a>` +
  `<nav class="views" aria-label="Views"><ul>${VIEWS.map(([id, label]) => `<li><a href="#${id}">${label}</a></li>`).join("")}</ul></nav>` +
  `<div class="tools"><span id="version" class="version"></span><button id="reload" type="button">Reload</button><button id="theme" type="button">Theme</button></div>` +
  `</div></header>`;

const RECORDS = [
  `<section data-view="changes"><header class="view-head"><h1>Changes</h1><p class="lede">Every change the practice made in this repository, read from its record in <span class="mono">.greenline/ledger/</span>. Open one to read its record, its reports and its checks.</p></header><div id="changes-list" aria-live="polite"><p class="secondary">Reading the ledger.</p></div></section>`,
  `<section data-view="change"><div id="change-page"></div></section>`,
  `<section data-view="plans"><header class="view-head"><h1>Plans</h1><p class="lede">Work a change's plan step split into tickets, one directory each under <span class="mono">.greenline/plans/</span>. Each ticket's progress and the tickets ready to start are derived as <span class="mono">greenline status</span> derives them, never written.</p></header><div id="plans-list" aria-live="polite"><p class="secondary">Reading the plans.</p></div></section>`,
  `<section data-view="plan"><div id="plan-page"></div></section>`,
  `<section data-view="knowledge"><header class="view-head"><h1>Knowledge</h1><p class="lede">What outlives a change: the work guide, the decisions book, the decision records and the glossary, read as they stand in the repository.</p></header><div id="knowledge-list" aria-live="polite"><p class="secondary">Reading the homes.</p></div></section>`,
  `<section data-view="home"><div id="home-page"></div></section>`,
].join("\n");

const WORKSPACE = [
  `<section data-view="overview"><header class="view-head"><h1>Checks</h1><p class="lede">The diagnostics <span class="mono">greenline status</span> reports for this repository: its installation, its changes and its connectors, read-only.</p><p id="checks-summary" class="secondary"></p></header><div id="checks"></div></section>`,
  `<section data-view="evidence"><header class="view-head"><h1>Receipts</h1><p class="lede">Each request under <span class="mono">.greenline/ledger/receipts/</span> records what garden returned to a consultation: the publication it read, and each call's operation, outcome and units, never a unit's body.</p><p class="secondary">A receipt shows what a request received. It does not prove that a model read, understood or applied it.</p></header><div id="receipts"></div></section>`,
  `<section data-view="policy"><header class="view-head"><h1>Repository policy</h1><p class="lede">The settled choices the practice reads before it works. A save checks the revision this page opened and records its evidence; it never syncs.</p></header>` +
    `<div class="panel"><h2>Decisions book</h2><p class="panel-note">Settled choices and their reasons live in <span class="mono">.greenline/DECISIONS.md</span>; root statements live in its greenline-roots JSON block. The knowledge view reads it rendered.</p><textarea id="decisions" aria-label="Decisions"></textarea><div class="actions"><button id="save-policy" class="primary" type="button">Save decisions</button></div></div>` +
    `<div class="panel"><h2>House rulings</h2><p class="panel-note">The dash bullets under <span class="mono">## House rulings</span>, outside the managed markers of AGENTS.md.</p><textarea id="rulings" aria-label="House rulings"></textarea><div class="actions"><button id="save-rulings" class="primary" type="button">Save House rulings</button></div></div>` +
    `<div class="panel"><h2>Latest manual saves</h2><p class="panel-note">The latest save of each file through this page, from <span class="mono">.greenline/policy-changes.json</span>: edit evidence, not an approval.</p><div id="policy-changes"></div></div></section>`,
  `<section data-view="installation"><header class="view-head"><h1>Installation</h1><p class="lede">What greenline installs here and the settings that shape the loop, as <span class="mono">.greenline/manifest.json</span> holds them. Save and sync are separate actions.</p><div class="actions"><button id="sync" type="button">Sync installation</button></div></header>` +
    `<div class="panel"><h2>Installation settings</h2><h3>Harnesses</h3><div class="settings-grid"><label class="check"><input id="codex" type="checkbox">Codex</label><label class="check"><input id="claude" type="checkbox">Claude Code</label></div>` +
    `<h3>Proceed without waiting</h3><p class="panel-note">At a mode, the agent proceeds without waiting for that mode and every faster one, and waits for the slower. At none it waits for every mode.</p><select id="proceed" aria-label="Proceed without waiting"></select>` +
    `<h3>Trials</h3><p class="panel-note">A trial skill installs only where it is enabled here.</p><div id="trials" class="settings-grid"></div>` +
    `<h3>Available skills</h3><div id="skills" class="settings-grid"></div><div class="actions"><button id="save-settings" class="primary" type="button">Save settings</button></div></div>` +
    `<div class="panel"><h2>Declared checks</h2><p class="panel-note">The project's checks as the manifest's <span class="mono">checks</span> declares them: what a recorded command is matched against.</p><div id="declared"></div></div>` +
    `<div class="panel"><h2>Hooks</h2><p class="panel-note">The git hooks and the harness adapters, as the manifest's <span class="mono">hooks</span> turns them on and this clone registers them.</p><div id="hooks"></div></div>` +
    `<div class="panel"><h2>Connectors</h2><p id="connectors" class="panel-note"></p><p class="panel-note">Connectors are enabled and disabled with <code>greenline connectors</code>; credentials stay in the process environment and are never saved here.</p></div>` +
    `<div class="panel"><h2>Installed files</h2><div id="files"></div></div>` +
    `<div class="panel"><h2>Changes since Git HEAD</h2><div id="head-changes"></div></div></section>`,
].join("\n");

/**
 * The page's script, in this module because it is the one place a request
 * leaves the page, to its own server's `/api/` addresses. The record views
 * (changes, plans, knowledge) place the HTML the server renders from each
 * shape; the workspace views (checks, receipts, repository policy,
 * installation) render the one state read and hold its editors. The
 * address after the hash mark picks what shows: a view's name, or a
 * record's address (`#change/<id>`, `#plan/<name>`, `#knowledge/<home>`)
 * with an optional part to open in place. Every value that reaches the
 * page's HTML is escaped here or by the server. The script holds no
 * template literal, so the server's string carries it verbatim.
 */
const SCRIPT = String.raw`
history.scrollRestoration='manual';
let state;
let filter='all';
let shown={};
const $=id=>document.getElementById(id);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const VIEWS={changes:'Changes',plans:'Plans',knowledge:'Knowledge',overview:'Checks',evidence:'Receipts',policy:'Repository policy',installation:'Installation'};
const plural=(count,word)=>count+' '+word+(count===1?'':'s');
function when(iso){const date=new Date(iso);return Number.isNaN(date.getTime())?String(iso):date.toISOString().slice(0,16).replace('T',' ')+' UTC';}
function show(view,nav){document.querySelectorAll('[data-view]').forEach(el=>el.hidden=!el.dataset.view.split(' ').includes(view));document.querySelectorAll('.views a').forEach(el=>el.setAttribute('aria-current',el.hash==='#'+nav?'page':'false'));}
async function request(path,body){const response=await fetch(path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await response.json();if(!response.ok||result.error)throw new Error(result.error||'Request failed');return result;}
function unitsHtml(units){return units.length?units.join('<br>'):'none';}
function receiptHtml(request){
 const calls=request.calls.length?request.calls.map(call=>'<tr><td>'+call.sequence+'</td><td>'+escape(call.operation)+'</td><td>'+escape(call.outcome)+'</td><td>'+unitsHtml(call.full.map(unit=>escape(unit.id)+' <span class="mono">'+escape(unit.revision.slice(0,12))+'</span>'))+'</td><td>'+unitsHtml(call.metadata.map(escape))+'</td><td>'+escape(call.error??'')+'</td></tr>').join(''):'<tr><td colspan="6">No call recorded yet.</td></tr>';
 const advisories=request.advisories?' · '+plural(request.advisories,'read-only consultation')+' dispatched under it':'';
 return '<details class="file" open><summary><span class="file-title">'+escape(request.source)+'</span><span class="file-name">'+escape(request.binding)+'</span></summary><p class="receipt-meta">Request <span class="mono">'+escape(request.id)+'</span> · created '+escape(when(request.createdAt))+' · for '+escape(request.owner)+advisories+'</p><div class="table-wrap"><table class="receipt"><thead><tr><th>Call</th><th>Operation</th><th>Outcome</th><th>Received whole</th><th>Listed</th><th>Failure</th></tr></thead><tbody>'+calls+'</tbody></table></div></details>';
}
function checksHtml(checks){
 const sorted=[...checks].sort((a,b)=>(a.severity==='error'?0:1)-(b.severity==='error'?0:1));
 if(!sorted.length)return '<div class="empty"><p>No diagnostic findings.</p><p class="secondary">greenline status reports nothing to correct in this repository.</p></div>';
 return '<ul class="diagnostics">'+sorted.map(check=>'<li class="diagnostic"><span class="severity" data-severity="'+escape(check.severity)+'">'+escape(check.severity)+'</span><span class="diagnostic-message">'+escape(check.message)+'</span><span class="diagnostic-meta"><span class="mono">'+escape(check.code)+'</span>'+(check.path?'<span class="mono">'+escape(check.path)+'</span>':'')+'</span></li>').join('')+'</ul>';
}
function policyChangesHtml(changes){
 if(!changes.length)return '<p class="secondary">No save made through this page yet.</p>';
 return '<div class="table-wrap"><table class="grid"><thead><tr><th>File</th><th>Saved</th><th>Before</th><th>After</th></tr></thead><tbody>'+changes.map(change=>'<tr><td class="mono">'+escape(change.path)+'</td><td>'+escape(when(change.at))+'</td><td class="mono" title="'+escape(change.before)+'">'+escape(change.before.slice(0,12))+'</td><td class="mono" title="'+escape(change.after)+'">'+escape(change.after.slice(0,12))+'</td></tr>').join('')+'</tbody></table></div>';
}
function declaredHtml(hooks){
 if(!hooks)return '<p class="secondary">The manifest cannot be read, so its checks are not shown.</p>';
 if(!hooks.checks.length)return '<p class="secondary">No checks declared. Declare each in a change\'s plan with <code>greenline check --declare -- &lt;command&gt;</code>.</p>';
 return '<div class="table-wrap"><table class="grid"><thead><tr><th>Name</th><th>Command</th><th>Directory</th></tr></thead><tbody>'+hooks.checks.map(check=>'<tr><td class="mono">'+escape(check.name)+'</td><td class="mono">'+escape(check.command)+'</td><td class="mono">'+escape(check.dir)+'</td></tr>').join('')+'</tbody></table></div>';
}
function hooksHtml(hooks){
 if(!hooks)return '<p class="secondary">The manifest cannot be read, so the hooks are not reported.</p>';
 const git=hooks.git;
 const registration=git.state==='config'?'<span class="good">registered</span> as config-based hooks':git.state==='hooks-path'?'<span class="good">registered</span> through core.hooksPath':git.state==='off'?'off: the manifest turns them off':'<span class="warn">absent</span>: '+escape(git.reason)+'<span class="field-note">'+escape(git.line)+'</span>';
 const field=(name,value)=>'<div class="field"><dt>'+name+'</dt><dd>'+value+'</dd></div>';
 return '<dl class="facts">'+field('Git hooks',registration)+field('<span class="mono">hooks.git</span>','<span class="mono">'+escape(hooks.settings.git)+'</span>')+field('<span class="mono">hooks.adapters</span>','<span class="mono">'+escape(hooks.settings.adapters)+'</span>')+field('Harness adapters',hooks.adapters.length?hooks.adapters.map(name=>'<span class="tag">'+escape(name)+'</span>').join(' '):'none written')+'</dl>';
}
function filesHtml(files){return files.map(file=>'<details class="file"><summary><span class="mono file-name">'+escape(file.path)+'</span>'+(file.error?'<span class="tag warn">not read</span>':'')+'</summary><pre>'+escape(file.error??file.content)+'</pre></details>').join('');}
function headChangesHtml(changes){
 if(changes.baseline===null)return '<p class="secondary">No readable Git commit to compare with.</p>';
 const unavailable=changes.unavailable.length?'<p class="callout warn">Unavailable: '+changes.unavailable.map(path=>'<span class="mono">'+escape(path)+'</span>').join(', ')+'</p>':'';
 const files=changes.files.length?changes.files.map(file=>{const added=file.diff.filter(line=>line.kind==='add').length,removed=file.diff.filter(line=>line.kind==='del').length;return '<details class="file"><summary><span class="mono file-name">'+escape(file.path)+'</span><span class="file-name">'+added+' added, '+removed+' removed</span></summary><pre class="diff">'+file.diff.map(line=>'<span class="'+(line.kind==='add'?'add':line.kind==='del'?'del':'same')+'">'+(line.kind==='add'?'+ ':line.kind==='del'?'- ':'  ')+escape(line.line)+'</span>').join('')+'</pre></details>';}).join(''):'<p class="secondary">No installed file differs from the commit.</p>';
 return '<p class="panel-note">Compared with commit <span class="mono">'+escape(changes.baseline.slice(0,12))+'</span>.</p>'+unavailable+files;
}
function render(){
 $('version').textContent='CLI '+state.cliVersion;
 const garden=state.manifest.connectors.garden;
 $('connectors').innerHTML=garden?'garden is enabled, at <span class="mono">'+escape(garden.endpoint)+'</span>.':'No connector is enabled: the practice consults no service.';
 const errors=state.checks.filter(check=>check.severity==='error').length;
 $('checks-summary').textContent=state.checks.length?plural(errors,'error')+' and '+plural(state.checks.length-errors,'warning')+'.':'';
 $('checks').innerHTML=checksHtml(state.checks);
 const problems=state.receiptProblems.map(problem=>'<p class="callout bad"><strong>Not read:</strong> <span class="mono">'+escape(problem.file)+'</span>: '+escape(problem.message)+'.</p>').join('');
 $('receipts').innerHTML=problems+(state.receipts.length?state.receipts.map(receiptHtml).join(''):problems?'':'<div class="empty"><p>No consultation recorded.</p><p class="secondary">'+(garden?'None has been made yet.':'With no connector enabled, none is made.')+'</p></div>');
 $('decisions').value=state.decisions;
 $('policy-changes').innerHTML=policyChangesHtml(state.policyChanges);
 $('rulings').value=state.houseRulings.stanza;
 $('codex').checked=state.manifest.targets.includes('codex');$('claude').checked=state.manifest.targets.includes('claude-code');
 $('proceed').innerHTML=state.settings.proceed.map(value=>'<option value="'+escape(value)+'"'+(value===state.manifest.proceed?' selected':'')+'>'+escape(value)+'</option>').join('');
 $('trials').innerHTML=state.settings.trials.length?state.settings.trials.map(step=>'<label class="check"><input type="checkbox" data-trial="'+escape(step)+'" '+(state.manifest.trials.includes(step)?'checked':'')+'> '+escape(step)+'</label>').join(''):'<p class="secondary">The installation holds no trial.</p>';
 $('skills').innerHTML=state.skills.map(skill=>'<label class="check"><input type="checkbox" data-skill="'+escape(skill.name)+'" data-opt="'+skill.extra+'" '+(skill.installed?'checked':'')+'> '+escape(skill.name)+(skill.extra?' <span class="secondary">extra</span>':'')+'</label>').join('');
 $('declared').innerHTML=declaredHtml(state.hooks);
 $('hooks').innerHTML=hooksHtml(state.hooks);
 $('files').innerHTML=filesHtml(state.files);
 $('head-changes').innerHTML=headChangesHtml(state.changes);
}
async function load(){try{state=await request('/api/state');render();$('notice').textContent='';}catch(error){$('notice').textContent=error.message;}}
async function save(path,body){try{const result=await request(path,{expectedRevision:state.editRevision,...body});if(result.outcome&&!result.outcome.ok)throw new Error(result.outcome.diagnostics.map(x=>x.message).join('\n'));await load();$('notice').textContent='Saved. Installation sync is a separate action.';}catch(error){$('notice').textContent=error.message;}}
$('save-policy').onclick=()=>save('/api/policy',{body:$('decisions').value});
$('save-rulings').onclick=()=>save('/api/rulings',{body:$('rulings').value});
$('save-settings').onclick=()=>{const targets=[];if($('codex').checked)targets.push('codex');if($('claude').checked)targets.push('claude-code');const include=[],exclude=[];document.querySelectorAll('[data-skill]').forEach(el=>{if(el.dataset.opt==='true'&&el.checked)include.push(el.dataset.skill);if(el.dataset.opt==='false'&&!el.checked)exclude.push(el.dataset.skill);});const trials=[];document.querySelectorAll('[data-trial]').forEach(el=>{if(el.checked)trials.push(el.dataset.trial);});save('/api/manifest',{targets,skills:{include,exclude},proceed:$('proceed').value,trials});};
$('sync').onclick=async()=>{try{const result=await request('/api/sync',{});await load();$('notice').textContent=result.outcome.ok?'Installation synchronized.':result.outcome.diagnostics.map(x=>x.message).join('\n');}catch(error){$('notice').textContent=error.message;}};
$('theme').onclick=()=>{const root=document.documentElement;const dark=root.dataset.theme?root.dataset.theme==='dark':matchMedia('(prefers-color-scheme: dark)').matches;root.dataset.theme=dark?'light':'dark';};
function applyFilter(){document.querySelectorAll('.filters [data-filter]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.filter===filter)));document.querySelectorAll('.change-row').forEach(el=>el.hidden=filter!=='all'&&el.dataset.state!==filter);document.querySelectorAll('.change-group').forEach(el=>el.hidden=!el.querySelector('.change-row:not([hidden])'));}
async function list(box,path){try{const result=await request(path);box.innerHTML=result.html;return true;}catch(error){box.innerHTML='<p class="callout bad">'+escape(error.message)+'</p>';return false;}}
async function loadChanges(){const box=$('changes-list');if(!await list(box,'/api/changes'))return;box.querySelectorAll('.filters [data-filter]').forEach(el=>el.onclick=()=>{filter=el.dataset.filter;applyFilter();});if(!box.querySelector('[data-filter="'+filter+'"]'))filter='all';applyFilter();}
function within(scope,part){return part?[...scope.querySelectorAll('[data-anchor]')].find(el=>el.dataset.anchor===part)||[...scope.querySelectorAll('details.file')].find(el=>el.dataset.file===part):undefined;}
function reveal(box,parts){let target=within(box,parts[0]);if(!target)return false;if(target.tagName==='DETAILS')target.open=true;const inner=within(target,parts[1]);if(inner)target=inner;target.scrollIntoView({behavior:'instant'});target.classList.remove('flash');void target.offsetWidth;target.classList.add('flash');return true;}
async function place(box,path,key,parts,back,label){if(shown[box.id]===key&&box.firstElementChild){if(!reveal(box,parts))window.scrollTo(0,0);return;}shown[box.id]=null;box.innerHTML='<p class="secondary">Reading.</p>';try{const result=await request(path);box.innerHTML=result.html;shown[box.id]=key;const title=box.querySelector('h1');if(title)document.title=title.textContent+' · greenline';if(!reveal(box,parts))window.scrollTo(0,0);}catch(error){box.innerHTML='<nav class="crumb"><a href="'+back+'">&larr; '+label+'</a></nav><p class="callout bad">'+escape(error.message)+'</p>';}}
const decoded=part=>{try{return decodeURIComponent(part);}catch{return part;}};
let current=null;
// A record page is read again whenever it is opened from elsewhere; moving within it keeps it.
function enter(view){if(current!==view){const box=$(view+'-page');if(box)shown[box.id]=null;}current=view;}
function showHash(){
 const parts=location.hash.slice(1).split('/').map(decoded);const head=parts[0]||'changes';const name=parts[1];const rest=parts.slice(2);
 if(name&&head==='change'){enter('change');show('change','changes');document.title=name+' · greenline';place($('change-page'),'/api/changes/'+encodeURIComponent(name),name,rest,'#changes','All changes');return;}
 if(name&&head==='plan'){enter('plan');show('plan','plans');document.title=name+' · greenline';place($('plan-page'),'/api/plans/'+encodeURIComponent(name),name,rest,'#plans','All plans');return;}
 if(name&&head==='knowledge'){enter('home');show('home','knowledge');document.title=name+' · greenline';place($('home-page'),'/api/knowledge/'+encodeURIComponent(name),name,rest,'#knowledge','Knowledge');return;}
 const view=Object.hasOwn(VIEWS,head)?head:'changes';enter(view);show(view,view);document.title=VIEWS[view]+' · greenline';window.scrollTo(0,0);
 if(view==='changes')loadChanges();
 if(view==='plans')list($('plans-list'),'/api/plans');
 if(view==='knowledge')list($('knowledge-list'),'/api/knowledge');
}
$('reload').onclick=()=>{shown={};load();showHash();};
document.addEventListener('click',event=>{const link=event.target.closest&&event.target.closest('a[href^="#section-"]');if(!link)return;event.preventDefault();const target=document.getElementById(link.getAttribute('href').slice(1));if(target)target.scrollIntoView();});
window.onhashchange=showHash;showHash();load();
`;

/** Render without remote fonts, scripts or guidance retrieval. */
export function renderInspectorPage(): string {
  const style = STYLE.replace("__SANS__", GEIST_SANS_BASE64).replace("__MONO__", GEIST_MONO_BASE64);
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>greenline</title><style>${style}</style>
${TOP}<main class="main"><p id="notice" class="notice" role="status"></p>
${RECORDS}
${WORKSPACE}
</main><footer class="foot">A local page: it reads this repository and contacts no service. It writes only the saves you make here.</footer><script>${SCRIPT}</script></html>`;
}
