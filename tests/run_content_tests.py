import json, argparse
from pathlib import Path
parser=argparse.ArgumentParser()
parser.add_argument("--browser")
parser.add_argument("--url",default="http://127.0.0.1:8765")
parser.add_argument("--output",default="/tmp/game1-content-qa")
args=parser.parse_args()
output=Path(args.output);output.mkdir(parents=True,exist_ok=True)
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=args.browser,headless=True,args=['--no-sandbox','--headless=new'])
 page=b.new_page(viewport={'width':390,'height':844});errors=[];failed=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('response',lambda r:failed.append(r.url) if r.status>=400 else None)
 page.goto(args.url+'/tests/')
 domain=page.evaluate('async()=>{const m=await import("/tests/content.test.js");return m.runContentTests()}')
 page.evaluate('''async()=>{localStorage.clear();const {default:G}=await import('/src/domain/GameStore.js');const {ALL_HEROES}=await import('/src/domain/heroCatalog.js');const g=new G();for(const h of ALL_HEROES)g.state.heroes[h.name]={level:80,star:5,ownShards:0,bond:5,bondExp:0,bondGiftsToday:0,weaponLevel:0,weaponStar:1};g.state.party=['버블','애쉬','더스크','미스트','클로버'].map((name,i)=>({name,row:i<2?'front':'back'}));g.state.tierProgress.easy.maxStageCleared=50;g.battle.maxStageCleared=50;Object.keys(g.state.unlocked).forEach(k=>g.state.unlocked[k]=true);g.state.account.level=80;g.recomputePartyStats();g.saveGame();}''')
 page.goto(args.url);page.wait_for_timeout(400)
 page.locator('.nav-btn[data-target=adventure]').click();page.locator('#adventureSegment [data-segment=content]').click()
 page.screenshot(path=str(output/'game1-content-mobile.png'),full_page=True)
 page.locator('[data-cx=lesson]').click();page.wait_for_timeout(500);assert page.locator('#cxArena .cx-battle').count()==1
 page.screenshot(path=str(output/'game1-content-battle.png'))
 page.locator('[data-cx=abandon]').click();assert page.locator('#cxArena').inner_text().find('중단')>=0
 page.locator('.nav-btn[data-target=spirits]').click();page.locator('#spiritsSegment [data-segment=stories]').click();page.locator('[data-cx=story]').first.click()
 page.locator('[data-cx=reader-next]').click();assert '2 / 6' in page.locator('#cxStoryReader').inner_text();page.locator('[data-cx=reader-skip]').click()
 page.locator('.nav-btn[data-target=menu]').click();page.locator('[data-cx=badge]').nth(1).click();assert page.locator('#cxHeaderBadge').inner_text()
 page.locator('.nav-btn[data-target=village]').click();page.locator('#cxTheme').select_option('dawn');page.locator('#cxRepresentative').select_option('애쉬');page.locator('#cxDecor0').select_option('book');page.locator('[data-cx=decorate]').click();assert page.locator('.cx-village').get_attribute('data-theme')=='dawn'
 page.screenshot(path=str(output/'game1-village-mobile.png'))
 page.reload();page.locator('.nav-btn[data-target=village]').click();assert page.locator('.cx-village').get_attribute('data-theme')=='dawn'
 widths=[]
 for width in [390,1280]:
  page.set_viewport_size({'width':width,'height':844})
  for tab in ['village','spirits','adventure','menu']:
   page.locator('.nav-btn[data-target='+tab+']').click()
   widths.append([width,tab,page.evaluate('document.documentElement.scrollWidth<=innerWidth')])
 page.locator('.nav-btn[data-target=adventure]').click();page.locator('#adventureSegment [data-segment=content]').click();page.screenshot(path=str(output/'game1-content-desktop.png'))
 result={'domain':domain,'ui':{'errors':errors,'failedRequests':failed,'containment':widths}}
 (output/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps(result,ensure_ascii=False,indent=2));assert not errors;assert not failed;assert all(x[2] for x in widths)
 b.close()
