import { GEIST_MONO_BASE64, GEIST_SANS_BASE64 } from "./fonts.ts";
/** One local document for work, delivery evidence, policy and installed methods. */
const STYLE = String.raw`
@font-face { font-family: "Geist"; src: url(data:font/woff2;base64,__SANS__) format("woff2"); font-weight: 100 900; font-display: block; }
@font-face { font-family: "Geist Mono"; src: url(data:font/woff2;base64,__MONO__) format("woff2"); font-weight: 100 900; font-display: block; }
@font-face { font-family: "GeistFB"; src: local("Helvetica Neue"), local("Arial"), local("Segoe UI"), local("Roboto"); font-weight: 100 900; size-adjust: 96%; ascent-override: 92%; descent-override: 24%; line-gap-override: 0%; }
:root {
  color-scheme: light;
  --bg: #e9efe7; --s1: #fdfefc; --s2: #f2f6f0;
  --ink-1: #131f18; --ink-2: #2a382f; --ink-3: #4c5c52; --ink-4: #5d6d64;
  --line: #c9d3c5; --line-2: #78877d;
  --accent: #0f7a43; --accent-deep: #0a3d24; --accent-press: #0b6236; --accent-tint: rgba(15,122,67,0.09);
  --danger: #a3231c; --danger-tint: rgba(163,35,28,0.09); --amber: #83540e; --amber-tint: rgba(176,122,32,0.12);
  --fern-deep: #06301c; --fern-tip: #0f7a43; --fern-op-dim: 0.16;
  --e1: 0 1px 2px rgba(22,42,30,0.08);
  --del-mark: rgba(163,35,28,0.18); --add-mark: rgba(15,122,67,0.2);
  --font-sans: "Geist", "GeistFB", "Helvetica Neue", Arial, sans-serif;
  --font-mono: "Geist Mono", ui-monospace, "SF Mono", Menlo, monospace;
  --e-enter: cubic-bezier(0.2, 0.7, 0.3, 1); --e-move: cubic-bezier(0.645, 0.045, 0.355, 1); --e-pop: cubic-bezier(0.175, 0.885, 0.32, 1.1);
  --t-0: 80ms; --t-1: 120ms; --t-2: 180ms; --t-3: 300ms;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  color-scheme: dark;
  --bg: #0a0f0c; --s1: #101711; --s2: #151d16;
  --ink-1: #f2f6f2; --ink-2: #ccd7ce; --ink-3: #a6b8ab; --ink-4: #a0b2a5;
  --line: rgba(255,255,255,0.11); --line-2: rgba(255,255,255,0.34);
  --accent: #46d389; --accent-deep: #0f7a43; --accent-press: #5fe39b; --accent-tint: rgba(70,211,137,0.12);
  --danger: #f0857b; --danger-tint: rgba(240,133,123,0.13); --amber: #e0a94f; --amber-tint: rgba(224,169,79,0.14);
  --fern-deep: #0d3a23; --fern-tip: #46d389; --fern-op-dim: 0.3;
  --e1: 0 1px 2px rgba(0,0,0,0.55);
  --del-mark: rgba(240,133,123,0.28); --add-mark: rgba(70,211,137,0.28);
} }
:root[data-theme="dark"] {
  color-scheme: dark;
  --bg: #0a0f0c; --s1: #101711; --s2: #151d16;
  --ink-1: #f2f6f2; --ink-2: #ccd7ce; --ink-3: #a6b8ab; --ink-4: #a0b2a5;
  --line: rgba(255,255,255,0.11); --line-2: rgba(255,255,255,0.34);
  --accent: #46d389; --accent-deep: #0f7a43; --accent-press: #5fe39b; --accent-tint: rgba(70,211,137,0.12);
  --danger: #f0857b; --danger-tint: rgba(240,133,123,0.13); --amber: #e0a94f; --amber-tint: rgba(224,169,79,0.14);
  --fern-deep: #0d3a23; --fern-tip: #46d389; --fern-op-dim: 0.3;
  --e1: 0 1px 2px rgba(0,0,0,0.55);
  --del-mark: rgba(240,133,123,0.28); --add-mark: rgba(70,211,137,0.28);
}
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body { background: var(--bg); color: var(--ink-1); font-family: var(--font-sans); font-size: 15px; line-height: 1.55; }
a { color: var(--accent); text-decoration: none; }
.gl { min-height: 100vh; display: grid; grid-template-columns: 200px minmax(0, 1fr); }
.mono { font-family: var(--font-mono); }
.tnum { font-variant-numeric: tabular-nums; }
.rail { padding: 48px 16px 24px 24px; display: flex; flex-direction: column; gap: 32px; min-width: 0; position: sticky; top: 0; height: 100vh; }
.brand { display: flex; align-items: center; gap: 8px; color: var(--ink-1); }
.brand svg { width: 12px; height: 24px; color: var(--accent); flex: none; }
.brand .name { font-family: var(--font-mono); font-size: 13px; color: var(--ink-2); white-space: nowrap; }
.nav { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.nav a { display: flex; align-items: center; justify-content: space-between; gap: 8px; height: 32px; padding: 0 8px 0 12px; border-radius: 6px; color: var(--ink-2); font-size: 13px; transition: background-color var(--t-1) var(--e-move), color var(--t-1) var(--e-move); }
@media (hover: hover) { .nav a:hover { background: var(--s2); } }
.nav a[aria-current="page"] { color: var(--accent); font-weight: 500; box-shadow: inset 2px 0 0 var(--accent); }
.rail .foot { margin-top: auto; display: flex; flex-direction: column; gap: 8px; font-size: 12px; color: var(--ink-4); line-height: 1.5; }
kbd { display: inline-flex; align-items: center; justify-content: center; min-width: 20px; height: 20px; padding: 0 4px; border: 1px solid var(--line-2); border-radius: 6px; font-family: var(--font-mono); font-size: 12px; line-height: 1; color: var(--ink-3); background: var(--s1); white-space: nowrap; }
.main { padding: 48px 64px 48px 48px; display: flex; flex-direction: column; gap: 32px; min-width: 0; position: relative; }
.head { display: flex; flex-direction: column; gap: 8px; max-width: 72ch; }
.head.wide { max-width: none; display: grid; grid-template-columns: minmax(0, 1fr) fit-content(40%); gap: 32px; align-items: end; }
.subject { font-size: 28px; line-height: 1.2; font-weight: 600; letter-spacing: -0.01em; margin: 0; text-wrap: balance; overflow-wrap: anywhere; }
.subject.mono { font-weight: 500; letter-spacing: 0; text-wrap: initial; }
.lede { font-size: 15px; color: var(--ink-3); margin: 0; }
.sec { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.sec > h2 { font-size: 17px; line-height: 1.2; font-weight: 500; margin: 0; }
.sec > h2 small { font-family: var(--font-mono); font-size: 12px; font-weight: 400; color: var(--ink-4); margin-left: 12px; }
.sheet { background: var(--s1); border: 1px solid var(--line); border-radius: 14px; box-shadow: var(--e1); padding: 24px; min-width: 0; }
.grid { display: grid; gap: 32px; min-width: 0; }
.fact { font-family: var(--font-mono); font-size: 12px; color: var(--ink-4); }
.state { display: inline-flex; align-items: baseline; gap: 8px; font-size: 13px; white-space: nowrap; }
.state.ok { color: var(--accent); } .state.warn { color: var(--amber); } .state.off { color: var(--ink-4); } .state.bad { color: var(--danger); }
.state b { font-weight: 500; }
.term { text-decoration: underline dotted; text-decoration-color: var(--line-2); text-underline-offset: 3px; cursor: help; }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; align-items: baseline; padding: 8px 12px; border-radius: 6px; color: inherit; }
.row .t { font-size: 15px; color: var(--ink-1); min-width: 0; overflow-wrap: anywhere; }
.row .s { font-family: var(--font-mono); font-size: 12px; color: var(--ink-4); display: block; margin-top: 2px; overflow-wrap: anywhere; }
.row.sel, .row:focus-visible { box-shadow: inset 2px 0 0 var(--accent); outline: none; }
.row.pressable { cursor: pointer; }
@media (hover: hover) { .row.pressable:hover { background: var(--s2); } }
.hair { border-top: 1px solid var(--line); }
.btn { display: inline-flex; align-items: center; gap: 8px; height: 36px; padding: 0 16px; border-radius: 10px; border: 1px solid var(--line-2); background: var(--s1); color: var(--ink-1); font-family: var(--font-sans); font-size: 13px; font-weight: 500; line-height: 1; white-space: nowrap; cursor: pointer; transition: transform var(--t-0) var(--e-move), background-color var(--t-1) var(--e-move); }
.btn.primary { background: var(--accent); border-color: var(--accent); color: #fdfefc; }
.btn kbd { border-color: transparent; background: transparent; color: inherit; opacity: 0.8; }
.btn:active { transform: translateY(1px); }
:where(a, button, input, textarea, [tabindex]):focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.seg { display: inline-flex; border: 1px solid var(--line-2); border-radius: 10px; overflow: hidden; background: var(--s1); }
.seg button { height: 32px; padding: 0 12px; font-size: 13px; color: var(--ink-2); background: transparent; border: 0; font-family: inherit; cursor: pointer; }
.seg button + button { border-left: 1px solid var(--line); }
.seg button[aria-pressed="true"] { background: var(--accent-tint); color: var(--accent); font-weight: 500; }
.field { display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 12px; border: 1px solid var(--line-2); border-radius: 10px; background: var(--s1); font-family: var(--font-mono); font-size: 13px; color: var(--ink-1); min-width: 0; }
.field input { border: 0; background: transparent; font: inherit; color: inherit; flex: 1; min-width: 0; outline: none; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip { display: inline-flex; align-items: center; gap: 8px; height: 28px; padding: 0 12px; border-radius: 6px; border: 1px solid var(--line); font-family: var(--font-mono); font-size: 13px; color: var(--ink-1); background: var(--s1); }
.chip.on { border-color: var(--accent); color: var(--accent); background: var(--accent-tint); }
.doc { max-width: 68ch; font-size: 15px; color: var(--ink-1); }
.doc h1 { font-size: 21px; line-height: 1.2; font-weight: 500; margin: 0 0 16px; }
.doc h2 { font-size: 17px; line-height: 1.2; font-weight: 500; margin: 24px 0 8px; }
.doc h3 { font-size: 15px; line-height: 1.2; font-weight: 500; margin: 16px 0 8px; }
.doc p { margin: 0 0 12px; overflow-wrap: anywhere; }
.doc .meta { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 4px 16px; font-family: var(--font-mono); font-size: 12px; color: var(--ink-4); margin: 0 0 24px; padding: 12px 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.doc .meta dt { color: var(--ink-3); }
.doc .meta dd { margin: 0; overflow-wrap: anywhere; }
.doc ul, .doc ol { margin: 0 0 12px; padding-left: 20px; }
.doc li { margin: 0 0 4px; }
.doc code { font-family: var(--font-mono); font-size: 0.92em; background: var(--s2); border-radius: 6px; padding: 1px 5px; }
.doc pre { font-family: var(--font-mono); font-size: 13px; background: var(--s2); border-radius: 10px; padding: 12px 16px; overflow-x: auto; }
.doc .anchor { font-family: var(--font-mono); font-size: 12px; color: var(--ink-4); margin-left: 8px; white-space: nowrap; }
.legend { display: flex; gap: 24px; font-size: 12px; color: var(--ink-4); justify-content: space-between; flex-wrap: wrap; }
.diff { font-family: var(--font-mono); font-size: 13px; line-height: 1.55; display: grid; grid-template-columns: 1fr 1fr; border: 1px solid var(--line); border-radius: 14px; overflow: hidden; background: var(--s1); box-shadow: var(--e1); }
.diff.stacked { grid-template-columns: 1fr; }
.diff .side { min-width: 0; padding: 8px 0; }
.diff .side + .side { border-left: 1px solid var(--line); }
.diff .cap { font-family: var(--font-sans); font-size: 12px; color: var(--ink-4); padding: 4px 12px 8px 52px; }
.dl { display: grid; grid-template-columns: 40px minmax(0, 1fr); padding-right: 12px; }
.dl .n { color: var(--ink-4); font-size: 12px; text-align: right; padding-right: 12px; font-variant-numeric: tabular-nums; }
.dl .c { white-space: pre-wrap; overflow-wrap: anywhere; }
.dl.del { background: var(--danger-tint); } .dl.add { background: var(--accent-tint); }
.dl.del .n::before { content: "−"; margin-right: 4px; } .dl.add .n::before { content: "+"; margin-right: 4px; }
.dl.ctx .c { color: var(--ink-3); }
.dl-list { display: grid; grid-template-columns: 180px minmax(0, 1fr); column-gap: 24px; row-gap: 12px; margin: 0; }
.dl-list dt { font-size: 13px; color: var(--ink-3); } .dl-list dd { margin: 0; font-size: 15px; min-width: 0; overflow-wrap: anywhere; }
.editor { font-family: var(--font-mono); font-size: 13px; line-height: 1.7; color: var(--ink-1); padding: 16px; border: 1px solid var(--line-2); border-radius: 10px; background: var(--s1); min-height: 240px; width: 100%; resize: vertical; }
.status { display: flex; align-items: center; gap: 16px; font-size: 13px; color: var(--ink-2); padding: 12px 16px; border-radius: 10px; background: var(--s2); }
.fern { position: fixed; right: 32px; bottom: -12px; width: 64px; height: 126px; color: var(--fern-deep); opacity: var(--fern-op-dim); filter: blur(0.6px); pointer-events: none; }
:root[data-theme="dark"] .fern { color: var(--fern-tip); }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .fern { color: var(--fern-tip); } }
.sprite { position: absolute; width: 0; height: 0; overflow: hidden; }
.dim { position: fixed; inset: 0; background: var(--bg); opacity: 0.72; }
.overlay { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(880px, calc(100vw - 48px)); max-height: calc(100vh - 48px); overflow: auto; }
.scrolls { overflow-y: auto; scrollbar-gutter: stable; }
.two { display: grid; grid-template-columns: minmax(0, 1fr) 400px; gap: 32px; align-items: start; }
.reader { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 24px 32px; align-items: start; }
.reader .files { position: sticky; top: 24px; max-height: calc(100vh - 48px); overflow-y: auto; display: flex; flex-direction: column; gap: 24px; min-width: 0; }
.table { display: grid; grid-template-columns: 240px minmax(0, 1fr) auto; gap: 8px 24px; align-items: baseline; padding: 12px 0; }
.table .k { color: var(--ink-3); font-size: 13px; }
[hidden] { display: none !important; }
@media (prefers-reduced-motion: reduce) { * { transition-duration: 1ms !important; } .btn:active { transform: none; } }
@media (max-width: 1320px) { .reader { grid-template-columns: 1fr; }
.reader .files { position: static; max-height: none; } .two { grid-template-columns: 1fr; } }
@media (max-width: 860px) { .gl { grid-template-columns: 56px minmax(0, 1fr); } .rail { padding: 24px 8px; } .brand .name, .nav a span, .rail .foot { display: none; } .main { padding: 24px; } }
@media (max-width: 640px) { .desktop-only { display: block; } .gl { display: none; } }
`;

const FERN = String.raw`<symbol id="fw-fern" viewBox="0 0 50.7 100" fill="currentColor"><circle cx="8" cy="7.2" r="3.7"/><circle cx="4.2" cy="67.3" r="3.1" fill-opacity="0.78"/><circle cx="7" cy="57.4" r="3.1" fill-opacity="0.78"/><circle cx="8.2" cy="48.1" r="3" fill-opacity="0.78"/><circle cx="10.5" cy="39.3" r="2.9" fill-opacity="0.78"/><circle cx="12.8" cy="30.6" r="2.8" fill-opacity="0.78"/><circle cx="14.6" cy="22.1" r="2.7" fill-opacity="0.78"/><circle cx="16" cy="14" r="2.6" fill-opacity="0.78"/><circle cx="6.5" cy="76.6" r="3.2" fill-opacity="0.78"/><circle cx="9.5" cy="86" r="3.3" fill-opacity="0.78"/><circle cx="13" cy="95" r="3.2" fill-opacity="0.78"/><circle cx="19.6" cy="8.2" r="2.2" fill-opacity="0.6"/><circle cx="22.4" cy="17.1" r="2.3" fill-opacity="0.6"/><circle cx="24.1" cy="26.5" r="2.4" fill-opacity="0.6"/><circle cx="24.9" cy="36.2" r="2.4" fill-opacity="0.6"/><circle cx="24.4" cy="45.9" r="2.4" fill-opacity="0.6"/><circle cx="22.7" cy="55.4" r="2.3" fill-opacity="0.6"/><circle cx="20.2" cy="64.6" r="2.3" fill-opacity="0.6"/><circle cx="17.7" cy="73.9" r="2.3" fill-opacity="0.6"/><circle cx="16.4" cy="83.5" r="2.3" fill-opacity="0.6"/><circle cx="17.2" cy="93" r="2.3" fill-opacity="0.6"/><circle cx="30.8" cy="12.4" r="1.7" fill-opacity="0.44"/><circle cx="33.2" cy="21.9" r="1.8" fill-opacity="0.44"/><circle cx="34.3" cy="31.8" r="1.9" fill-opacity="0.44"/><circle cx="33.9" cy="41.8" r="1.9" fill-opacity="0.44"/><circle cx="32.1" cy="51.5" r="1.9" fill-opacity="0.44"/><circle cx="29.4" cy="60.9" r="1.8" fill-opacity="0.44"/><circle cx="26.9" cy="70.3" r="1.8" fill-opacity="0.44"/><circle cx="25.6" cy="79.9" r="1.8" fill-opacity="0.44"/><circle cx="26" cy="89.6" r="1.8" fill-opacity="0.44"/><circle cx="40.6" cy="18.1" r="1.3" fill-opacity="0.3"/><circle cx="42.5" cy="28" r="1.4" fill-opacity="0.3"/><circle cx="42.9" cy="38.1" r="1.4" fill-opacity="0.3"/><circle cx="41.7" cy="48" r="1.4" fill-opacity="0.3"/><circle cx="39.3" cy="57.5" r="1.4" fill-opacity="0.3"/><circle cx="36.5" cy="66.8" r="1.4" fill-opacity="0.3"/><circle cx="34.6" cy="76.3" r="1.4" fill-opacity="0.3"/><circle cx="34.4" cy="86.1" r="1.4" fill-opacity="0.3"/><circle cx="47.7" cy="24.6" r="1" fill-opacity="0.2"/><circle cx="48.9" cy="34.8" r="1" fill-opacity="0.2"/><circle cx="48.6" cy="45" r="1" fill-opacity="0.2"/><circle cx="46.8" cy="54.9" r="1" fill-opacity="0.2"/><circle cx="44.2" cy="64.5" r="1" fill-opacity="0.2"/><circle cx="42.1" cy="74.1" r="1" fill-opacity="0.2"/></symbol>`;

const SCRIPT = String.raw`
let state;
const $=id=>document.getElementById(id);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function show(id){document.querySelectorAll('[data-view]').forEach(el=>el.hidden=el.dataset.view!==id);document.querySelectorAll('.nav a').forEach(el=>el.setAttribute('aria-current',el.hash==='#'+id?'page':'false'));}
async function request(path,body){const response=await fetch(path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await response.json();if(!response.ok||result.error)throw new Error(result.error||'Request failed');return result;}
function render(){
 $('version').textContent='CLI '+state.cliVersion;
 $('summary').textContent=state.manifest.guidance.state==='configured'?'Guidance configured · '+state.manifest.guidance.provider:'Skills and repository evidence · guidance unconfigured';
 $('work').textContent=JSON.stringify(state.work,null,2);
 $('checks').innerHTML=state.checks.length?state.checks.map(check=>'<p><strong>'+escape(check.code)+'</strong> '+escape(check.message)+'</p>').join(''):'No diagnostic findings.';
 $('receipts').textContent=JSON.stringify(state.ledger?.receipts??[],null,2);
 $('accounts').textContent=JSON.stringify(state.ledger?.records??[],null,2);
 $('decisions').value=state.decisions;
 $('policy-changes').textContent=JSON.stringify(state.policyChanges,null,2);
 $('rulings').value=state.houseRulings.stanza;
 $('guided').checked=state.manifest.guidance.state==='configured';
 $('provider').value=state.manifest.guidance.provider??'';
 $('codex').checked=state.manifest.targets.includes('codex');$('claude').checked=state.manifest.targets.includes('claude-code');
 $('skills').innerHTML=state.skills.map(skill=>'<label class="check"><input type="checkbox" data-skill="'+escape(skill.name)+'" data-opt="'+skill.optIn+'" '+(skill.installed?'checked':'')+'> '+escape(skill.name)+(skill.optIn?' (optional)':'')+'</label>').join('');
 $('files').innerHTML=state.files.map(file=>'<details><summary>'+escape(file.path)+'</summary><pre>'+escape(file.error??file.content)+'</pre></details>').join('');
 $('changes').textContent=JSON.stringify(state.changes,null,2);
}
async function load(){try{state=await request('/api/state');render();$('notice').textContent='';}catch(error){$('notice').textContent=error.message;}}
async function save(path,body){try{const result=await request(path,{expectedRevision:state.editRevision,...body});if(result.outcome&&!result.outcome.ok)throw new Error(result.outcome.diagnostics.map(x=>x.message).join('\n'));await load();$('notice').textContent='Saved. Installation sync is a separate action.';}catch(error){$('notice').textContent=error.message;}}
$('save-policy').onclick=()=>save('/api/policy',{body:$('decisions').value});
$('save-rulings').onclick=()=>save('/api/rulings',{body:$('rulings').value});
$('save-settings').onclick=()=>{const targets=[];if($('codex').checked)targets.push('codex');if($('claude').checked)targets.push('claude-code');const include=[],exclude=[];document.querySelectorAll('[data-skill]').forEach(el=>{if(el.dataset.opt==='true'&&el.checked)include.push(el.dataset.skill);if(el.dataset.opt==='false'&&!el.checked)exclude.push(el.dataset.skill);});save('/api/manifest',{targets,skills:{include,exclude},guidance:$('guided').checked?{state:'configured',provider:$('provider').value}:{state:'unconfigured'}});};
$('sync').onclick=async()=>{try{const result=await request('/api/sync',{});await load();$('notice').textContent=result.outcome.ok?'Installation synchronized.':result.outcome.diagnostics.map(x=>x.message).join('\n');}catch(error){$('notice').textContent=error.message;}};
$('reload').onclick=load;$('theme').onclick=()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';};
window.onhashchange=()=>show(location.hash.slice(1)||'overview');show(location.hash.slice(1)||'overview');load();
`;
/** Render without remote fonts, scripts or guidance retrieval. */
export function renderInspectorPage(): string {
  const style = STYLE.replace("__SANS__", GEIST_SANS_BASE64).replace("__MONO__", GEIST_MONO_BASE64);
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>greenline · workspace</title><style>${style}
pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px}textarea{width:100%;min-height:240px;padding:16px;background:var(--s1);color:var(--ink-1);border:1px solid var(--line);font:13px var(--font-mono)}.check{display:block;padding:6px}button,input{font:inherit}button{padding:8px 14px;cursor:pointer}input[type=url]{width:100%;padding:8px}details{padding:12px;border-bottom:1px solid var(--line)}[hidden]{display:none!important}.actions{display:flex;gap:8px;flex-wrap:wrap}#notice{white-space:pre-wrap;color:var(--amber)}section{max-width:1040px}
</style><div class="gl"><aside class="rail"><div class="brand"><svg viewBox="0 0 50.7 100" aria-hidden="true"><defs>${FERN}</defs><use href="#fw-fern"/></svg>greenline</div><nav><ul class="nav"><li><a href="#overview">Work and checks</a></li><li><a href="#evidence">Receipts and accounts</a></li><li><a href="#policy">Repository policy</a></li><li><a href="#installation">Installation</a></li></ul></nav><div class="foot"><span id="version"></span><button id="theme">Change theme</button><span>Local workspace · no remote requests</span></div></aside><main class="main"><header><h1>Your workspace</h1><p id="summary"></p><div class="actions"><button id="reload">Reload</button><button id="sync">Sync installation</button></div><p id="notice" role="status"></p></header>
<section data-view="overview"><h2>Work</h2><pre id="work"></pre><h2>Diagnostics</h2><div id="checks"></div></section>
<section data-view="evidence"><h2>Generated delivery receipts</h2><p>Service results are evidence of retrieval. They do not prove model capture or application.</p><pre id="receipts"></pre><h2>Contributor accounts</h2><pre id="accounts"></pre></section>
<section data-view="policy"><h2>Decisions and root statements</h2><p>Settled choices and their reasons live in DECISIONS.md. Root statements use its greenline-roots JSON block.</p><textarea id="decisions" aria-label="Decisions"></textarea><button id="save-policy">Save decisions</button><h2>Latest manual saves</h2><pre id="policy-changes"></pre><h2>House rulings</h2><textarea id="rulings" aria-label="House rulings"></textarea><button id="save-rulings">Save House rulings</button></section>
<section data-view="installation"><h2>Installation settings</h2><label class="check"><input id="codex" type="checkbox">Codex</label><label class="check"><input id="claude" type="checkbox">Claude Code</label><label class="check"><input id="guided" type="checkbox">Use a guidance provider</label><label>Provider URL<input id="provider" type="url"></label><p>Credentials come from the process environment and are never saved here.</p><h3>Available skills</h3><div id="skills"></div><button id="save-settings">Save settings</button><h2>Installed files</h2><div id="files"></div><h2>Changes since Git HEAD</h2><pre id="changes"></pre></section>
</main></div><script>${SCRIPT}</script></html>`;
}
