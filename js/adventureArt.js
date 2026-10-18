// ゲームのローポリ調に合わせた、軽量なSVGの村と地図。
let serial = 0;
const themes = {
  grassland: ['#96bec0', '#e5d8ac', '#6c8e67', '#395e4d'],
  marsh: ['#4d8b99', '#c2dfd1', '#699c92', '#326c77'],
  forest: ['#547d79', '#b0caa6', '#426b4e', '#234838'],
  desert: ['#b79282', '#f0d7a4', '#c89b65', '#936f50'],
  snowland: ['#658aaf', '#dce9e7', '#b6cfdb', '#748ea4'],
  summit: ['#607aaa', '#cad8e0', '#879bb0', '#4e627f'],
  volcano: ['#624b59', '#d4a17b', '#856659', '#473b42'],
};

export function regionArt(id, label = '') {
  const c = themes[id] || themes.grassland, uid = `land-${serial++}`;
  const trees = Array.from({ length: 11 }, (_, i) => {
    const x = 28 + i * 61, y = 170 + (i % 3) * 19, h = 46 + (i % 4) * 14;
    if (id === 'marsh') return `<path d="M${x-20} ${y}q20-10 40 0t40 0" stroke="#aedbd1" stroke-width="3" fill="none"/>`;
    if (id === 'forest') return `<path d="M${x} ${y}v-${h}" stroke="#354c39" stroke-width="9"/><path d="M${x-27} ${y-h+18}l27 -45 29 45z" fill="${i % 2 ? '#537958' : '#3b624a'}"/>`;
    if (id === 'grassland') return `<path d="M${x} ${y}l3 -12 4 12" fill="#d4c681"/>`;
    if (id === 'desert') return `<path d="M${x-2} ${y}v-27m-8 12h8m0-6h9" stroke="#686f53" stroke-width="5" fill="none"/>`;
    if (id === 'snowland') return `<path d="M${x-13} ${y}l13 -38 14 38" fill="#7897aa"/><path d="M${x-7} ${y-19}l7 -19 7 19" fill="#e7f1ee"/>`;
    if (id === 'summit') return `<path d="M${x-14} ${y}l14 -${h} 18 ${h}z" fill="${c[3]}"/>`;
    return `<path d="M${x-17} ${y}l17 -${h*0.7} 21 ${h*0.7}z" fill="${c[3]}"/><path d="M${x-3} ${y-8}l7 -14 2 20" fill="#ecaa6c"/>`;
  }).join('');
  return `<svg class="land-art" viewBox="0 0 720 260" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${label || id}"><defs><linearGradient id="${uid}" x2="0" y2="1"><stop stop-color="${c[0]}"/><stop offset="1" stop-color="${c[1]}"/></linearGradient></defs><path fill="url(#${uid})" d="M0 0h720v260H0z"/><circle cx="566" cy="57" r="25" fill="#fff1c8" opacity=".65"/><path d="M0 162L91 66l83 81 89-103 115 124 79-75 97 69 71-86 95 88v96H0z" fill="${c[3]}" opacity=".33"/><path d="M0 181q100-73 209-8T429 162T720 172v88H0z" fill="${c[2]}"/><path d="M0 211q136-45 243 8T477 207T720 208v52H0z" fill="${c[3]}" opacity=".6"/>${trees}<path d="M272 260q37-34 88-45t31-29" stroke="${c[1]}" stroke-width="19" fill="none" opacity=".5"/><path d="M0 258h720" stroke="#fff" opacity=".12"/></svg>`;
}

export function villageArt(adventure) {
  const uid = `village-${serial++}`;
  const house = (id, x, y, color, scale = 1) => {
    const active = adventure.facility(id);
    if (!active) return `<g transform="translate(${x} ${y}) scale(${scale})" opacity=".53"><path d="M-37 18l41 12 42-16-40-11z" fill="#53675a"/><path d="M-31 13v-25l19 6v11m30 13v-34l15-5v28" stroke="#a5a38c" stroke-width="8" fill="none"/><path d="M-45 25l18-9m51 15l25-10" stroke="#5f6255" stroke-width="5"/></g>`;
    return `<g transform="translate(${x} ${y}) scale(${scale})"><ellipse cy="25" rx="55" ry="17" fill="#213f36" opacity=".22"/><path d="M-38-24l39-16 40 16v47L0 39l-38-14z" fill="#c9bb8f"/><path d="M1-40l40 16v47L0 39z" fill="#9b9e7b"/><path d="M-52-24L-8-65 52-25 7-4z" fill="${color}"/><path d="M-52-24L-8-65 7-4z" fill="#fff" opacity=".13"/><path d="M-13 33v-28l13-5 12 5v29" fill="#3d5147"/><path d="M-29-1l10-3v12l-10 3zm48-3l11 5v12l-11-5z" fill="#f3d590"/><path d="M-8-65v-22l24 9-24 7" fill="#e1bf74" stroke="#d8c99d" stroke-width="2"/>${id === 'forge' ? '<path d="M25-32v-39h12v46" fill="#7a7061"/><path d="M31-82q-17-12-1-24t-3-24" fill="none" stroke="#d8d9bf" opacity=".6" stroke-width="9" stroke-linecap="round"/>' : ''}${id === 'observatory' ? '<path d="M-20-40v-35q19-28 39 0v35" fill="#9fae99"/><path d="M-24-72q22-39 47 0z" fill="#91b5b2"/>' : ''}</g>`;
  };
  const lit = adventure.chaptersDone;
  return `<svg class="village-art" viewBox="0 0 1000 470" preserveAspectRatio="none" role="img" aria-label="再建が進むリュミエ村。完成した施設に灯がともる"><defs><linearGradient id="${uid}" x2="0" y2="1"><stop stop-color="#7caeac"/><stop offset=".66" stop-color="#d6d9ac"/><stop offset="1" stop-color="#c7c697"/></linearGradient></defs><path fill="url(#${uid})" d="M0 0h1000v470H0z"/><circle cx="800" cy="87" r="39" fill="#f6e6b0" opacity=".75"/><path d="M0 207L117 63l115 130L382 42l155 156L665 90l162 125 99-128 74 114v269H0z" fill="#547c70" opacity=".35"/><path d="M0 246q170-129 350-22t365-13 285 16v243H0z" fill="#658d70"/><path d="M0 329q250-161 462-76t538-17v234H0z" fill="#77966b"/><path d="M515 470q-29-59-1-113t-11-91" stroke="#c1b88c" stroke-width="51" fill="none"/><path d="M214 370q161 6 308-42t240 36M510 328l-2-121M188 230q98 12 323 98l280-159" fill="none" stroke="#c1b88c" stroke-width="24"/>
  ${Array.from({ length: 18 }, (_, i) => { const x = (i * 137 + 41) % 1000, y = 219 + (i * 47) % 218; return `<g opacity=".75"><path d="M${x} ${y}v-32" stroke="#425f4a" stroke-width="5"/><path d="M${x-18} ${y-14}l18-43 19 43z" fill="${i % 2 ? '#456f50' : '#527a51'}"/></g>`; }).join('')}
  ${house('clinic', 180, 215, '#738f9a', .8)}${house('observatory', 815, 154, '#7789a7', .82)}${house('market', 701, 247, '#bd8d62', .82)}
  <g transform="translate(490 298)"><ellipse cy="43" rx="90" ry="22" fill="#345c46" opacity=".2"/><path d="M-81 22l70-104L88 18 3 47z" fill="#e3c38b"/><path d="M-11-82L3 47 88 18z" fill="#b69c70"/><path d="M-18 41l13-58 22 58" fill="#3e5145"/><path d="M-11-82v-38l40 15-40 11" fill="#426b67" stroke="#dfce9d" stroke-width="3"/></g>
  ${house('forge', 245, 349, '#8e7260', 1.08)}
  <g transform="translate(747 379)"><path d="M-64-15l68-20 67 22-68 26z" fill="${adventure.facility('garden') ? '#4b7452' : '#8c8a67'}"/>${[0,1,2].map(i=>`<path d="M${-45+i*22} -15l55 19" stroke="${adventure.facility('garden') ? '#b7c76f' : '#a49b72'}" stroke-width="8"/>`).join('')}</g>
  <g transform="translate(500 188)"><ellipse cy="26" rx="51" ry="13" fill="#385b4c" opacity=".3"/><path d="M-23 13l23-13 24 14-24 15z" fill="#a5ad90"/><path d="M0-43l15 25L0 9-15-18z" fill="${lit ? '#9edbcc' : '#818e83'}"/><path d="M0-43v52l-15-27z" fill="${lit ? '#65aaa6' : '#677c71'}"/>${Array.from({length:6},(_,i)=>`<circle cx="${Math.cos(i*Math.PI/3)*34}" cy="${Math.sin(i*Math.PI/3)*12+12}" r="4" fill="${i<lit?'#f6d88d':'#7c8b74'}"/>`).join('')}</g>
  <path d="M0 448q230-44 405 10t595-24v36H0" fill="#426b50" opacity=".65"/></svg>`;
}

export function portrait(id) {
  const colors = { mira: ['#78b9aa', '#394b49', '#d9bea0'], gan: ['#bb8c63', '#51493d', '#c8a381'], nagi: ['#80bfd0', '#4c5970', '#e0c5a4'], toma: ['#a4a0c5', '#55545a', '#d4c3a6'] };
  const c = colors[id] || colors.mira;
  return `<svg viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="39" fill="${c[0]}" opacity=".18"/><path d="M9 80q1-29 31-29t31 29" fill="${c[0]}"/><path d="M21 31q0-24 20-23t20 25l-7 20H27z" fill="${c[1]}"/><path d="M28 26q14 8 26-3v18q-1 19-13 19T28 41z" fill="${c[2]}"/><path d="M25 28l10-14 24 14-6-17-17-4-13 12z" fill="${c[1]}"/>${id === 'gan' ? '<path d="M27 43l14 10 15-10-5 18-11 4-11-7z" fill="#6d6252"/>' : ''}<path d="M33 38h2m12 0h2" stroke="#3b463f" stroke-width="3" stroke-linecap="round"/><path d="M37 48q4 3 8 0" fill="none" stroke="#9e7965" stroke-width="2"/></svg>`;
}
