/**
 * seed-wordlist.js
 * Run once: npm run seed-wordlist
 *
 * Fetches definitions for ~500 common English words from the free Dictionary API
 * and writes the result to src/data/wordlist.json for offline fallback in the app.
 */

'use strict';

const https  = require('https');
const fs     = require('fs');
const path   = require('path');

const OUT_FILE = path.join(__dirname, '..', 'src', 'data', 'wordlist.json');

// ─── Word list ────────────────────────────────────────────────────────────────
// Common English words worth having offline: academic, literary, everyday vocab.
const WORDS = [
  'abstract','absurd','accommodate','accumulate','accurate','acknowledge',
  'acquire','adapt','adequate','adjacent','advocate','aesthetic','allocate',
  'allude','altruistic','ambiguous','ambivalent','ameliorate','analogy',
  'analyze','anomaly','anticipate','apparent','arbitrary','archaic','arduous',
  'articulate','ascertain','assess','assume','attribute','augment','aura',
  'austere','autonomy','banal','benevolent','bias','brevity','bureaucracy',
  'callous','candid','capacity','catalyst','caustic','chaos','chronic',
  'circumvent','cite','coerce','coherent','collaborate','colloquial',
  'compassion','compelling','complacent','comprehensive','concise','concept',
  'connotation','consequence','consistent','constitute','constraint','context',
  'contrite','controversial','convoluted','correlate','credibility','criteria',
  'criterion','critique','crucial','cryptic','culminate','cunning','cynical',
  'debilitating','denotation','depict','derive','deplete','diligent','discern',
  'discord','discrepancy','disdain','disparate','dissent','distinct','distort',
  'diverse','dogmatic','dynamic','eccentric','efficient','elaborate','eloquent',
  'emulate','encompass','emphasize','empirical','ensure','ephemeral','equivocal',
  'establish','evaluate','exacerbate','exemplify','exhaustive','explicit',
  'extraneous','facilitate','fallacy','fervent','fickle','fleeting','flourish',
  'foreboding','formidable','frugal','fundamental','futile','generate',
  'grandiose','gratuitous','gregarious','hamper','haughty','hierarchy',
  'hostile','humility','hypothesis','identify','ideology','impede','implement',
  'implicit','implicate','implication','impose','inconsistent','indicate',
  'indifferent','inevitable','inference','ingenuity','innate','innovative',
  'integrate','integrity','intricate','intrinsic','invoke','irony','justify',
  'juxtapose','lament','lethargic','leverage','lucid','malevolent','manifest',
  'meticulous','mitigate','modify','monitor','monotonous','narrative','negate',
  'negligent','neutral','nuance','objective','obsolete','obstinate','obtain',
  'omniscient','optimal','ostracize','paradox','paramount','passive','perceive',
  'persevere','persistent','phenomenon','plausible','polarize','pompous',
  'potential','pragmatic','precarious','predict','predominant','prejudice',
  'premise','prevalent','primary','profound','proliferate','prominent',
  'propagate','prudent','rationale','reconcile','redundant','reinforce',
  'relevant','reluctant','resilient','resolve','rhetoric','rigorous',
  'rudimentary','scrutinize','serendipity','significant','skeptical','somber',
  'spontaneous','stagnant','stoic','subjective','substantial','subtle',
  'succinct','superfluous','suppress','sustain','tacit','tangible','tedious',
  'tenacious','theory','thesis','thorough','transform','transparent','trivial',
  'ubiquitous','undermine','unique','validate','vague','verbose','viable',
  'virtue','volatile','vulnerable','wary','whimsical','zeal','zealous',
  'abhor','abridge','acumen','admonish','affable','aggravate','alleviate',
  'altercation','amend','anguish','apprehensive','astute','audacious',
  'aversion','blatant','boisterous','brazen','capricious','catastrophe',
  'caveat','censure','coalesce','cognizant','comply','concede','confront',
  'conjecture','contentious','contradict','convey','corroborate','covet',
  'credulous','curtail','cynicism','deceptive','deduce','defiance','delusion',
  'derogatory','despondent','deterrent','devious','dilemma','diplomacy',
  'discredit','discriminate','dismantle','disregard','dominance','dubious',
  'earnest','elusive','empathy','empower','endeavour','enigma','equitable',
  'eradicate','essential','ethical','evade','evolve','exert','exonerate',
  'expedient','exploit','extravagant','facade','feasible','flaw','forthright',
  'fragile','frantic','genuine','gratitude','grievance','guilt','herald',
  'hesitant','hypocrite','idealistic','illuminate','imminent','impulsive',
  'inadvertent','incessant','indulge','infuriate','inherent','instigate',
  'intangible','intimidate','irrefutable','jeopardize','judicious','keen',
  'languid','legible','lenient','lofty','loathe','malicious','mandatory',
  'manipulate','mediocre','melancholy','menacing','momentous','morose','naive',
  'notorious','novel','obscure','obstruct','ominous','outrage','overt',
  'overwhelm','partisan','pensive','perpetuate','pervasive','piety','pinnacle',
  'placate','poignant','portray','pretentious','pristine','prodigious','provoke',
  'prudence','rebuke','reckless','refute','relentless','remedy','remorse',
  'repudiate','resentment','reticent','revert','revoke','ruthless',
  'sanctimonious','sarcasm','scrutiny','speculation','steadfast','stereotype',
  'stigma','stringent','stubborn','sublime','superficial','sympathy',
  'temperate','tenacity','timid','tolerance','torment','transcend',
  'treacherous','turbulent','tyranny','ultimate','unambiguous','unethical',
  'unprecedented','vehement','venerate','vindicate','wistful',
  'brevity','candour','clarity','coherence','concession','conviction',
  'credence','deliberate','demeanor','denounce','dignity','discontent',
  'diverge','eloquence','emphatically','endure','ethical','exemplary',
  'fervor','fragrant','frailty','grandeur','gratitude',
  'grudge','hallmark','hinder','idealize','ignorance','immense','impartial',
  'impersonal','implement','imply','infer','influence','inherit','initiative',
  'innovation','inspire','instinct','intent','intervene','intuition',
  'irresponsible','isolate','judgment','justify','linger','literal',
  'logical','loyal','manipulate','merit','methodical','minimal','mislead',
  'moderate','momentum','moral','motivate','mutual','objective','obscure',
  'orderly','organize','originality','overcome','persist','persuade',
  'priority','rational','reasonable','refine','resolve','respect',
  'restrain','reveal','revise','rigid','sensitive','simplify','sincerity',
  'skeptic','solidarity','stimulate','strategic','subjective','suppress',
  'sustain','systematic','tactful','tenacious','truthful','undermine',
  'uphold','validate','versatile','vigilant','willful','wisdom',
];

// ─── Deduplicate ─────────────────────────────────────────────────────────────
const unique = [...new Set(WORDS.map(w => w.toLowerCase()))];
console.log(`Fetching ${unique.length} words…\n`);

// ─── Fetch helper (no external deps) ─────────────────────────────────────────
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { reject(new Error(`Bad JSON for ${url}`)); }
      });
    }).on('error', reject);
  });
}

// ─── Rate-limited batch fetch ─────────────────────────────────────────────────
async function run() {
  const result  = {};
  let ok = 0, miss = 0;
  const BATCH = 5;       // parallel requests per tick
  const DELAY = 300;     // ms between batches (free API is lenient)

  for (let i = 0; i < unique.length; i += BATCH) {
    const batch = unique.slice(i, i + BATCH);
    await Promise.all(batch.map(async (word) => {
      try {
        const data = await fetchJSON(
          `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
        );
        if (Array.isArray(data) && data.length) {
          // Trim to save space: keep max 2 meanings, 2 definitions each
          result[word] = [{
            word: data[0].word,
            phonetics: (data[0].phonetics || []).filter(p => p.text).slice(0, 1),
            meanings: (data[0].meanings || []).slice(0, 2).map(m => ({
              partOfSpeech: m.partOfSpeech,
              definitions: (m.definitions || []).slice(0, 2).map(d => ({
                definition: d.definition,
                ...(d.example ? { example: d.example } : {}),
              })),
              synonyms: (m.synonyms || []).slice(0, 4),
            })),
          }];
          ok++;
          process.stdout.write(`  ✓ ${word}\n`);
        } else {
          miss++;
          process.stdout.write(`  ✗ ${word} (not found)\n`);
        }
      } catch (e) {
        miss++;
        process.stdout.write(`  ! ${word} (error: ${e.message})\n`);
      }
    }));

    const pct = Math.round(((i + BATCH) / unique.length) * 100);
    process.stdout.write(`\n[${Math.min(i + BATCH, unique.length)}/${unique.length}] ${pct}%\n\n`);

    if (i + BATCH < unique.length) {
      await new Promise(r => setTimeout(r, DELAY));
    }
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(result, null, 0));
  const kb = (fs.statSync(OUT_FILE).size / 1024).toFixed(1);
  console.log(`\nDone! ${ok} fetched, ${miss} missed. Saved to ${OUT_FILE} (${kb} KB)`);
}

run().catch(err => { console.error(err); process.exit(1); });
