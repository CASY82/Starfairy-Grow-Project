import GameStore from '../src/domain/GameStore.js';
import { LOAN_HEROES, LESSONS, RELICS, EPISODES, DISCOVERIES, relicEffects, normalizeContentState } from '../src/domain/contentCatalog.js';
import { ALL_HEROES } from '../src/domain/heroCatalog.js';
export async function runContentTests() {
  let assertions = 0; const checks = [], simulations = [];
  const assert = (value, message) => { assertions++; if (!value) throw new Error(message); };
  const fresh = () => { localStorage.clear(); return new GameStore(); };
  const hero = (level = 60, star = 4) => ({ level, star, ownShards: 0, bond: 5, bondExp: 0, bondGiftsToday: 0, locked: false, favorite: false, weaponLevel: 0, weaponStar: 1 });
  const unlock = g => { g.state.tierProgress.easy.maxStageCleared = 50; g.state.unlocked.ultimate = true; g.state.unlocked.labyrinth = true; g.state.unlocked.tower = true; };
  const fill = (g, names = LOAN_HEROES, level = 60, star = 4, account = 60) => { unlock(g); names.forEach(n => g.state.heroes[n] = hero(level, star)); g.state.party = names.slice(0, 5).map((name, i) => ({ name, row: i < 2 ? 'front' : 'back' })); g.state.account.level = account; g.recomputePartyStats(); };
  const drain = g => { let ticks = 0; while (g.contentBattle && ticks++ < 6100) g.tickContentBattle(); assert(!g.contentBattle, 'content battle must terminate'); return g.contentResult; };
  const originalRandom = Math.random; let seed = 42;
  Math.random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  try {
    let g = fresh(); assert(!g.startContentBattle('lesson', 'front', { party: [] }).ok, 'locked lesson');
    assert(!g.finishEpisode(EPISODES[0].id).ok, 'unowned story locked');
    const bad = normalizeContentState({ completed: [null, '<script>', 'relay', 'relay'], weeklyRecords: {bad: -1}, decorationSlots: ['bogus'], sideProgress: -10 });
    assert(bad.completed.length === 1 && bad.sideProgress === 0 && bad.decorationSlots[0] === null, 'normalize malformed extension');
    const v5 = JSON.parse(g.exportSaveText()); v5.version = 5; delete v5.state.content;
    g.importSaveText(JSON.stringify(v5)); assert(g.state.content.completed.length === 0, 'v5 migrated'); checks.push('v5 migration / malformed fields / unlock gates');
    for (const lesson of LESSONS) {
      const choose = (xs, count) => count === 0 ? [[]] : xs.flatMap((x, i) => choose(xs.slice(i + 1), count - 1).map(rest => [x, ...rest]));
      const combinations = choose(LOAN_HEROES, lesson.members);
      let solutions = 0;
      for (const names of combinations) {
        g = fresh(); unlock(g);
        const party = Array.from({length:5}, (_,i) => names[i] ? {name:names[i],row:['버블','애쉬'].includes(names[i])?'front':'back'} : null);
        const before = JSON.stringify(g.state.heroes), main = g.battle, gold = g.state.gold;
        assert(g.startContentBattle('lesson', lesson.id, {party}).ok, 'start lesson');
        assert(g.performAutoAttack() === null, 'main pauses'); assert(!g.startTowerBattle().ok, 'exclusive battle');
        const r = drain(g); if (r.success) solutions++;
        assert(JSON.stringify(g.state.heroes) === before && g.battle === main && g.state.gold === gold, 'loan never mutates actual progress');
      }
      assert(solutions >= 2, `lesson ${lesson.id} needs two solutions, got ${solutions}`);
      simulations.push({ lesson: lesson.id, solutions });
    }
    checks.push('six loan lessons / two solutions each / no ownership required / main-state isolation');
    g = fresh(); fill(g); assert(g.finishEpisode(EPISODES[0].id).first, 'first story reward'); assert(!g.finishEpisode(EPISODES[0].id).first, 'story idempotent');
    assert(g.equipContentBadge(EPISODES[0].id).ok, 'equip earned badge'); assert(!g.equipContentBadge('fake').ok, 'cannot equip unearned');
    for (const d of DISCOVERIES) { assert(g.claimDiscovery(d.id).first, 'retroactive journal'); assert(!g.claimDiscovery(d.id).first, 'journal idempotent'); }
    assert(g.availableDecorations().includes('telescope'), 'chapter decoration');
    assert(!g.decorateVillage({theme:'night',slots:['seed','seed',null],representative:null}).ok, 'duplicate decor rejected');
    assert(g.decorateVillage({theme:'dawn',slots:['book','telescope','seed'],representative:'애쉬'}).ok, 'decor save');
    g.saveGame(); const restored = new GameStore(); assert(restored.state.content.theme === 'dawn' && restored.state.content.equippedBadge === EPISODES[0].id, 'cosmetics restore'); checks.push('stories / 15 journal entries / cosmetic ownership / save restore');
    g = fresh(); fill(g); const main = JSON.stringify(g.battle, (_,v)=>typeof v==='bigint'?v.toString():v);
    assert(g.startContentBattle('boss','10').ok, 'boss start'); const atk = g.contentBattle.combat.attack; g.state.heroes['애쉬'].level = 1; g.state.party = [null,null,null,null,null];
    assert(g.contentBattle.combat.attack === atk && g.contentBattle.combat.heroes['애쉬'].level === 60, 'snapshot immutable'); drain(g);
    assert(g.state.content.completed.includes('boss-10-roles'), 'boss role reward'); assert(JSON.stringify(g.battle,(_,v)=>typeof v==='bigint'?v.toString():v) === main,'main unchanged');
    fill(g); assert(g.startContentBattle('weekly').ok, 'weekly start'); const week = g.contentBattle.weekly.week; drain(g); assert(g.state.content.weeklyRecords[week]>0,'weekly record'); const first = g.state.content.completed.length;
    g.startContentBattle('weekly'); drain(g); assert(g.state.content.completed.length===first,'weekly reward idempotent');
    g.state.content.latestWeek='2099-01-05'; assert(g.weeklyContentInfo().week==='2099-01-05','clock rewind held'); checks.push('combat snapshot / boss tasks / weekly records / rewind guard');
    for (const path of [{level:60,star:6,account:60},{level:160,star:5,account:160}]) {
      g = fresh(); fill(g,LOAN_HEROES,path.level,path.star,path.account);
      for(let i=0;i<5;i++){assert(g.startContentBattle('side',String(i)).ok,'side progression'); const r=drain(g); assert(r.success,'free path completes side '+JSON.stringify(path));}
      assert(g.state.content.completed.includes('side'),'side cosmetic');
      simulations.push({ freePath:path, sideCompleted:true });
    }
    g=fresh(); fill(g,ALL_HEROES.filter(h=>['common','magic'].includes(h.rarity)).map(h=>h.name),160,5,160);
    const names=Object.keys(g.state.heroes).slice(0,10),teams=[names.slice(0,5),names.slice(5)].map(t=>t.map((name,i)=>({name,row:i<2?'front':'back'})));
    assert(!g.startContentBattle('relay','',{teams:[teams[0],teams[0]]}).ok,'duplicate relay');
    assert(g.startContentBattle('relay','',{teams}).ok,'relay start');assert(drain(g).success,'free relay wins');assert(g.availableDecorations().includes('flag'),'relay reward');
    g.startContentBattle('boss','10'); g.saveGame(); const resumed=new GameStore();assert(!resumed.contentBattle,'inflight battle not restored');g.importSaveText(g.exportSaveText());assert(!g.contentBattle,'import cancels battle'); checks.push('five-stage side story / two free growth paths / ten-hero relay / interruption');
    g=fresh();fill(g,LOAN_HEROES,160,6,160); const gold=g.state.gold, bond=g.state.starBond;
    assert(g.startLabyrinth().ok,'reward labyrinth start'); assert(!g.startLabyrinth().ok,'cannot restart active run');
    const choices=g.labyrinthBuffChoices().map(r=>r.id);assert(JSON.stringify(choices)===JSON.stringify(g.labyrinthBuffChoices().map(r=>r.id)),'choices stable');
    assert(!g.startLabyrinthBattle('invalid').ok,'forged relic rejected');
    for(let room=0;room<5;room++){
      const relic=g.labyrinthBuffChoices()[0].id;assert(g.startLabyrinthBattle(relic).ok,'room begins');assert(g.subBattle.relics[RELICS.find(r=>r.id===relic).kind]>0,'relic effective');
      let n=0;while(g.subBattle&&n++<5000)g.tickSubBattle();assert(!g.subBattle,'labyrinth terminates');
    }
    assert(g.state.starBond===bond+75,'one weekly reward'); assert(!g.startLabyrinth().ok,'weekly capped');
    assert(g.startLabyrinth({practice:true}).ok,'practice after cap');g.startLabyrinthBattle(g.labyrinthBuffChoices()[0].id);while(g.subBattle)g.tickSubBattle();const powder=g.state.materials.starPowder;g.bankLabyrinthProgress();assert(g.state.materials.starPowder===powder&&g.state.starBond===bond+75&&g.state.gold===gold,'practice has no economy rewards');
    assert(relicEffects(['frontAtk','frontAtk']).front===150,'relic cap');
    g.resetGame();assert(!g.contentBattle&&!g.subBattle&&g.state.content.completed.length===0,'reset extension');checks.push('relic effects / stable choices / duplicate cap / weekly reward once / practice no currency / reset');
    // 고정 난수로 유물의 실제 피해/피격/예산 차이를 비교한다.
    const sampleRelic = id => {
      const x=fresh();fill(x,LOAN_HEROES,60,4,60);x.startLabyrinth({practice:true});
      if(id)x.state.labyrinth.choices=[id];x.startLabyrinthBattle(id);const b=x.subBattle;
      const before={heal:b.healBudget,shield:b.shield,hp:b.partyHp};
      b.ultimateCooldowns=[0,0,0,0,0];seed=17;const result=x.tickSubBattle();
      return {before,result,b};
    };
    const baseline=sampleRelic(null);
    assert(sampleRelic('frontAtk').result.damage>baseline.result.damage,'front relic changes damage');
    assert(sampleRelic('elementBonus').result.damage>baseline.result.damage,'attack relic changes damage');
    assert(sampleRelic('moonShell').result.incoming<baseline.result.incoming,'guard relic changes incoming');
    assert(sampleRelic('starWell').before.heal>baseline.before.heal,'well finite budget');
    assert(sampleRelic('firstShield').before.shield>0n,'shield starts present');
    assert(sampleRelic('ultimateCharge').b.ultimateCooldowns[0]===60,'recast reduction');
    g=fresh();fill(g);g.startLabyrinth();g.startLabyrinthBattle(g.labyrinthBuffChoices()[0].id);g.state.weeklyResetKey='2000-01-03';const weekBond=g.state.starBond;g.tickSubBattle();assert(!g.subBattle&&!g.state.labyrinth.active&&g.state.starBond===weekBond,'week rollover cancels stale battle without rewards');
    const speedResults=[];
    for(const speed of [1,2,3]) {g=fresh();fill(g);g.state.unlocked.speed2x=true;g.state.unlocked.speed3x=true;g.setBattleSpeed(speed);seed=90;g.startContentBattle('boss','10');speedResults.push(drain(g).elapsedMs);}
    assert(new Set(speedResults).size===1,'battle-speed independent logical ticks');
    g=fresh();fill(g);g.state.party=[{name:'클로버',row:'back'},null,null,null,null];g.startContentBattle('boss','20');const beforeRewards=g.state.content.completed.length;assert(!drain(g).success,'all support eventually loses');assert(g.state.content.completed.length===beforeRewards,'defeat grants no reward');
    g=fresh();fill(g);g.state.party=g.state.party.filter(s=>s.name!=='클로버');while(g.state.party.length<5)g.state.party.push(null);g.startContentBattle('boss','10');drain(g);assert(g.state.content.completed.includes('boss-10-solo'),'support-free task');
    const invalidDate=normalizeContentState({latestWeek:'9999-99-99',weeklyRecords:{'2026-02-30':5}});assert(invalidDate.latestWeek===''&&Object.keys(invalidDate.weeklyRecords).length===0,'invalid dates removed');
    checks.push('all six relic effects / week-boundary interruption / 1-2-3x identical ticks / finite healing defeat / support-free boss');
    g=fresh();assert(!g.hasFormedParty()&&g.performAutoAttack()===null,'fresh empty party gate');
    const gems=g.state.gems;assert(g.pullNormal(10).length===10&&g.state.gems<gems,'summon existing flow');assert(g.autoFormGrowth().ok&&g.battle.partyHp>1n,'first formation heals');assert(g.performAutoAttack()!==null,'main combat still ticks');
    g.state.account.level=2;g.state.materials.starPowder=100;const name=g.state.party[0].name;assert(g.levelUpHero(name).ok,'existing growth');
    g.battle.maxStageCleared=10;g.state.clearedStages=[1,10];g.state.idle.startedAt=Date.now()-3600000;g.state.idle.maxSeenAt=g.state.idle.startedAt;
    assert(g.prepareIdleReward()?.acceptedMinutes>=59,'idle return calculates');assert(g.claimIdleReward().ok&&!g.claimIdleReward().ok,'idle claim once');
    checks.push('existing fresh-account summon / formation / main battle / growth / idle return');
    return {assertions,checks,simulations};
  } finally { Math.random=originalRandom; localStorage.clear(); }
}
