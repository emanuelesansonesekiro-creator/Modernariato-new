// Modernariato Visual Search — Pro (client-side)
const qs = (s, el=document) => el.querySelector(s);
const qsa = (s, el=document) => [...el.querySelectorAll(s)];

const state = {
  designers: [],   // minimal list (id, name, image, birth, death, decades, tags)
  imageHashes: new Map(), // url -> aHash (Promise cached)
  favorites: new Set(JSON.parse(localStorage.getItem('favorites')||'[]')),
  theme: localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
};

document.documentElement.classList.toggle('dark', state.theme==='dark');
qs('#btnToggleTheme').addEventListener('click', () => {
  state.theme = state.theme==='dark' ? 'light' : 'dark';
  localStorage.setItem('theme', state.theme);
  document.documentElement.classList.toggle('dark', state.theme==='dark');
});

// Favorites UI
qs('#btnFavorites').addEventListener('click', () => {
  qs('#favorites').classList.remove('hidden');
  qs('#results').classList.add('hidden');
  qs('#btnHome').classList.remove('hidden');
  renderFavorites();
});
qs('#btnHome').addEventListener('click', () => {
  qs('#favorites').classList.add('hidden');
  qs('#results').classList.remove('hidden');
  qs('#btnHome').classList.add('hidden');
});

qs('#btnClearFav').addEventListener('click', () => {
  if (!confirm('Sicuro di voler svuotare i preferiti?')) return;
  state.favorites.clear();
  localStorage.setItem('favorites', JSON.stringify([...state.favorites]));
  renderFavorites();
});

// Search controls
qs('#btnSearch').addEventListener('click', () => render());
qs('#btnClear').addEventListener('click', () => { qs('#q').value=''; qs('#decade').value=''; render(); });
qs('#q').addEventListener('keydown', e => { if (e.key==='Enter') render(); });

// Modal
const dialog = qs('#designerModal');
qs('#modalClose').addEventListener('click', () => dialog.close());

// --- Wikidata queries ---
const WD_ENDPOINT = 'https://query.wikidata.org/sparql';
const WD_HEADERS = { 'Accept': 'application/sparql-results+json' };

// Fetch Italian designers (industrial/product/furniture) with image when available
async function fetchDesigners() {
  const query = `
  SELECT ?person ?personLabel ?image ?birth ?death ?movementLabel ?occupationLabel WHERE {
    ?person wdt:P31 wd:Q5.
    VALUES ?occupation { wd:Q1329623 wd:Q2424752 wd:Q1471477 }  # industrial designer, product designer, furniture designer
    ?person wdt:P106 ?occupation.
    # Nationality or country of citizenship Italy (Q38)
    ?person wdt:P27 wd:Q38.
    OPTIONAL { ?person wdt:P18 ?image. }
    OPTIONAL { ?person wdt:P569 ?birth. }
    OPTIONAL { ?person wdt:P570 ?death. }
    OPTIONAL { ?person wdt:P135 ?movement. }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "it,en". }
  }`;
  const url = WD_ENDPOINT + '?query=' + encodeURIComponent(query);
  const res = await fetch(url, { headers: WD_HEADERS });
  const data = await res.json();
  return data.results.bindings.map(b => {
    const id = b.person.value.split('/').pop();
    const name = b.personLabel?.value || id;
    const img = b.image?.value || null;
    const birth = b.birth?.value || null;
    const death = b.death?.value || null;
    const movement = b.movementLabel?.value || null;
    const occupation = b.occupationLabel?.value || null;
    return {
      id, name, img,
      birth, death,
      movement,
      occupation,
      decades: birth ? [String(new Date(birth).getFullYear()).slice(0,3)+'0'] : [],
      tags: [movement, occupation].filter(Boolean)
    };
  });
}

// Fetch notable works for a designer with image if possible
async function fetchWorksByDesigner(qid) {
  const query = `
  SELECT ?work ?workLabel ?image ?inception WHERE {
    ?work wdt:P170 wd:${qid}.
    OPTIONAL { ?work wdt:P18 ?image. }
    OPTIONAL { ?work wdt:P571 ?inception. }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "it,en". }
  } LIMIT 50`;
  const url = WD_ENDPOINT + '?query=' + encodeURIComponent(query);
  const res = await fetch(url, { headers: WD_HEADERS });
  const data = await res.json();
  return data.results.bindings.map(b => ({
    id: b.work.value.split('/').pop(),
    label: b.workLabel?.value || 'Opera senza titolo',
    img: b.image?.value || null,
    year: b.inception?.value ? new Date(b.inception.value).getFullYear() : null
  }));
}

// Fetch Wikipedia summary (bio) for a designer by Wikidata QID
async function fetchBio(qid, name) {
  try {
    // Get Wikipedia title via Wikidata
    const wd = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`).then(r=>r.json());
    const sitelinks = wd.entities[qid].sitelinks || {};
    const pageTitle = (sitelinks.itwiki || sitelinks.enwiki || Object.values(sitelinks)[0])?.title;
    if (!pageTitle) throw new Error('no sitelink');
    const site = sitelinks.itwiki ? 'it' : (sitelinks.enwiki ? 'en' : pageTitle.site?.split('wiki')[0] || 'it');
    const summary = await fetch(`https://${site}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle)}`).then(r=>r.json());
    return summary.extract || `Biografia non trovata per ${name}.`;
  } catch (e) {
    return `Biografia non disponibile per ${name}.`;
  }
}

// Simple aHash (8x8 average hash) returning 64-bit string of 0/1
function imageToAHash(imgEl) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const size = 8;
  canvas.width = size; canvas.height = size;
  ctx.drawImage(imgEl, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;
  let gray = [];
  for (let i=0; i<data.length; i+=4) {
    const r=data[i], g=data[i+1], b=data[i+2];
    gray.push(Math.round(0.299*r+0.587*g+0.114*b));
  }
  const avg = gray.reduce((a,b)=>a+b,0) / gray.length;
  return gray.map(v => v>avg ? '1':'0').join('');
}

function hamming(a,b) {
  let d=0;
  for (let i=0;i<Math.min(a.length,b.length);i++) if (a[i]!==b[i]) d++;
  return d + Math.abs(a.length-b.length);
}

async function hashFromUrl(url) {
  if (state.imageHashes.has(url)) return state.imageHashes.get(url);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  const p = new Promise((resolve,reject)=>{
    img.onload = () => {
      try { resolve(imageToAHash(img)); } catch(e){ reject(e); }
    };
    img.onerror = reject;
  });
  img.src = url;
  const hash = await p;
  state.imageHashes.set(url, hash);
  return hash;
}

// Render functions
function card(des) {
  const fav = state.favorites.has(des.id) ? 'text-yellow-500' : 'text-zinc-400';
  const birth = des.birth ? new Date(des.birth).getFullYear() : '—';
  const death = des.death ? new Date(des.death).getFullYear() : '';
  const life = death ? `${birth}–${death}` : birth;
  const img = des.img ? des.img : 'https://upload.wikimedia.org/wikipedia/commons/6/65/No-Image-Placeholder.svg';
  const tags = des.tags.map(t=>`<span class="pill">${t}</span>`).join('');
  return `
    <article class="card flex flex-col">
      <img src="${img}" alt="${des.name}" class="w-full h-48 object-cover rounded-xl border border-zinc-200 dark:border-zinc-800"/>
      <div class="mt-3 flex-1">
        <div class="flex items-center gap-2">
          <h3 class="font-semibold text-lg flex-1">${des.name}</h3>
          <button class="favBtn ${fav}" data-id="${des.id}" title="Aggiungi ai preferiti"><i data-lucide="star"></i></button>
        </div>
        <div class="text-sm text-zinc-500">${life}</div>
        <div class="mt-2 flex flex-wrap gap-2">${tags}</div>
        <div class="mt-3 flex gap-2">
          <button class="btn moreBtn" data-id="${des.id}">Dettagli</button>
          <a class="btn" href="https://www.wikidata.org/wiki/${des.id}" target="_blank" rel="noopener">Wikidata</a>
        </div>
      </div>
    </article>
  `;
}

function renderFavorites() {
  const cont = qs('#favList');
  const selected = state.designers.filter(d => state.favorites.has(d.id));
  cont.innerHTML = selected.map(card).join('') || '<p class="text-sm text-zinc-500">Nessun preferito ancora.</p>';
  lucide.createIcons();
  wireCards();
}

function render() {
  const q = qs('#q').value.trim().toLowerCase();
  const dec = qs('#decade').value;
  let list = state.designers;
  if (q) {
    list = list.filter(d => 
      d.name.toLowerCase().includes(q) ||
      (d.tags.join(' ').toLowerCase().includes(q))
    );
  }
  if (dec) {
    list = list.filter(d => d.decades.includes(dec));
  }
  const cont = qs('#results');
  cont.innerHTML = list.map(card).join('');
  lucide.createIcons();
  wireCards();
}

// Wire up buttons in cards
function wireCards() {
  qsa('.favBtn').forEach(b => b.addEventListener('click', (e) => {
    const id = e.currentTarget.dataset.id;
    if (state.favorites.has(id)) state.favorites.delete(id);
    else state.favorites.add(id);
    localStorage.setItem('favorites', JSON.stringify([...state.favorites]));
    render(); // refresh stars
    if (!qs('#favorites').classList.contains('hidden')) renderFavorites();
  }));
  qsa('.moreBtn').forEach(b => b.addEventListener('click', (e) => showDesigner(e.currentTarget.dataset.id)));
}

// Show modal with bio and works
async function showDesigner(id) {
  const des = state.designers.find(d => d.id===id);
  if (!des) return;
  qs('#modalName').textContent = des.name;
  qs('#modalMeta').textContent = [des.occupation, des.movement].filter(Boolean).join(' • ');
  qs('#modalImg').src = des.img || 'https://upload.wikimedia.org/wikipedia/commons/6/65/No-Image-Placeholder.svg';
  qs('#modalTags').innerHTML = des.tags.map(t=>`<span class="pill">${t}</span>`).join('');
  qs('#modalBio').textContent = 'Carico biografia...';
  qs('#modalWorks').innerHTML = 'Carico opere...';
  dialog.showModal();

  const bio = await fetchBio(des.id, des.name);
  qs('#modalBio').textContent = bio;

  const works = await fetchWorksByDesigner(des.id);
  if (!works.length) {
    qs('#modalWorks').innerHTML = '<p class="text-sm text-zinc-500">Nessuna opera trovata (o non elencata).</p>';
  } else {
    qs('#modalWorks').innerHTML = works.map(w => `
      <div class="card">
        <div class="flex gap-3 items-start">
          <img src="${w.img || 'https://upload.wikimedia.org/wikipedia/commons/6/65/No-Image-Placeholder.svg'}" class="w-20 h-20 object-cover rounded-lg border border-zinc-200 dark:border-zinc-800"/>
          <div class="flex-1">
            <div class="font-medium">${w.label}</div>
            <div class="text-xs text-zinc-500">${w.year || ''}</div>
            <div class="mt-2">
              <a class="pill inline-block" href="https://www.wikidata.org/wiki/${w.id}" target="_blank">Vedi su Wikidata</a>
            </div>
          </div>
        </div>
      </div>
    `).join('');
  }
}

// Photo search
qs('#btnPhotoSearch').addEventListener('click', async () => {
  const file = qs('#fileInput').files?.[0];
  if (!file) return alert('Seleziona una foto prima.');
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  const queryHash = imageToAHash(img);

  // Compute candidate image hashes (use designer image if available)
  const candidates = state.designers.filter(d => d.img).slice(0, 300); // limit to 300 for performance
  const scored = await Promise.all(candidates.map(async d => {
    try {
      const h = await hashFromUrl(d.img);
      return { d, score: hamming(queryHash, h) };
    } catch(e) {
      return { d, score: 1e9 };
    }
  }));

  scored.sort((a,b)=>a.score-b.score);
  const top = scored.slice(0, 12).map(s => s.d);
  const cont = qs('#results');
  cont.scrollIntoView({behavior:'smooth'});
  cont.innerHTML = top.map(card).join('');
  lucide.createIcons();
  wireCards();
});

// Bootstrap
(async function init(){
  try {
    const spinner = document.createElement('div');
    spinner.className = 'text-center text-sm text-zinc-500';
    spinner.innerText = 'Carico l\'elenco dei designer italiani da Wikidata...';
    qs('#results').append(spinner);

    let list = await fetchDesigners();
    // Deduplicate by name (some duplicates with multiple occupations)
    const dedup = new Map();
    list.forEach(d => {
      const key = d.id;
      if (!dedup.has(key)) dedup[key] = d;
      else {
        const cur = dedup[key];
        cur.tags = Array.from(new Set([...cur.tags, ...d.tags]));
        dedup[key] = cur;
      }
    });
    state.designers = Object.values(dedup).sort((a,b)=>a.name.localeCompare(b.name));
    render();
  } catch (e) {
    qs('#results').innerHTML = '<p class="text-sm text-red-600">Errore nel caricare i dati da Wikidata. Prova a ricaricare più tardi.</p>';
    console.error(e);
  }
})();
