import { SECTIONS, ITEMS } from './data.js?v=3';
import { createScene } from './scene.js?v=3';

const $ = (s) => document.querySelector(s);
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const atlas = createScene($('#c'));
const thumbs = atlas.thumbnails(ITEMS);
let current = null;

function renderNav() {
  $('#nav').innerHTML = SECTIONS.map((s) => {
    const items = ITEMS.filter((i) => i.section === s.id);
    return `<div class="nav-sec" data-sec="${s.id}">
      <button class="nav-head" data-go="${items[0].id}"><span>${s.title}</span><em>${items.length}</em></button>
      <ul>${items.map((i) => `<li><button data-go="${i.id}">${i.title}</button></li>`).join('')}</ul>
    </div>`;
  }).join('');
}

function renderStrip(item) {
  const list = ITEMS.filter((i) => i.section === item.section);
  $('#strip').innerHTML = list.map((i) => `<button class="card${i.id === item.id ? ' on' : ''}" data-go="${i.id}">
      <img src="${thumbs[i.id]}" alt="" width="148" height="99"><span>${i.title}</span><small>${i.sub}</small></button>`).join('');
}

function renderPanel(item) {
  const sec = SECTIONS.find((s) => s.id === item.section);
  const list = ITEMS.filter((i) => i.section === item.section);
  const n = list.indexOf(item) + 1;
  $('#panel').innerHTML = `
    <p class="kicker">${sec.title} · ${String(n).padStart(2, '0')}/${String(list.length).padStart(2, '0')}</p>
    <h1>${item.title}</h1>
    <p class="sub">${item.sub}</p>
    <div class="tags">${item.tags.map((t) => `<span>${t}</span>`).join('')}</div>
    <p class="desc">${esc(item.desc)}</p>
    <h2>Ключевые характеристики</h2>
    <dl class="traits">${item.traits.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
    <div class="suits"><h2>Кому подходит</h2><p>${item.suits}</p></div>
    <button class="cta" data-demo>Записаться на консультацию</button>
    <p class="fine">Информация ознакомительная. Подходящий метод и план лечения определяет врач после диагностики.</p>`;
}

function go(id, animate = true) {
  const item = ITEMS.find((i) => i.id === id) || ITEMS[0];
  if (current === item) return;
  current = item;
  atlas.select(item, animate);
  renderStrip(item); renderPanel(item);
  $('#caption').textContent = item.caption;
  document.querySelectorAll('#nav [data-go]').forEach((b) => b.classList.toggle('on', b.dataset.go === item.id && !b.classList.contains('nav-head')));
  document.querySelectorAll('.nav-sec').forEach((s) => s.classList.toggle('open', s.dataset.sec === item.section));
  $('#mouth').classList.remove('on');
  try { if (location.hash.slice(1) !== item.id) history.replaceState(null, '', '#' + item.id); } catch {} // в песочнице просмотрщика может быть запрещено
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-go]');
  if (b) return go(b.dataset.go);
  if (e.target.closest('[data-demo]')) toast('Это демо-страница: клиника вымышленная, запись не ведётся.');
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  const i = ITEMS.indexOf(current) + (e.key === 'ArrowRight' ? 1 : -1);
  go(ITEMS[(i + ITEMS.length) % ITEMS.length].id);
});
window.addEventListener('hashchange', () => go(location.hash.slice(1)));

$('#zin').onclick = () => atlas.zoom(1);
$('#zout').onclick = () => atlas.zoom(-1);
$('#spin').onclick = (e) => e.currentTarget.classList.toggle('on', atlas.toggleRotate());
$('#mouth').onclick = (e) => e.currentTarget.classList.toggle('on', atlas.toggleMouth());
$('#replay').onclick = () => atlas.replay();
$('#more').onclick = () => $('#panel').scrollIntoView();

let tt;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 3200);
}

renderNav();
go(location.hash.slice(1));
document.body.classList.add('ready');
