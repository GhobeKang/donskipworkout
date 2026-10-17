/* Store artwork exporter. Uses the actual static app with isolated example API responses. */
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { createRequire } = require('node:module');

const runtime_require = createRequire(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json'));
const { chromium } = runtime_require('playwright');
const sharp = runtime_require('sharp');
const project_root = path.resolve(__dirname, '../../..');
const output_root = path.resolve(__dirname, '..');
const screenshot_root = path.join(__dirname, 'screens');
const example_date = '2026-10-16';
const example_user = { user_uuid: 'store-example-user', display_name: 'Alex', email: 'alex@example.com' };
const completed_days = [1, 3, 5, 7, 9, 12, 14];
const rest_days = [2, 4, 6, 8, 10, 11, 13, 15];
const exercise_groups = [
  { exercise_source: 'shared', exercise_id: 1, exercise_name: '벤치프레스', sets: [{weight_kg: 60, reps: 10}, {weight_kg: 60, reps: 10}, {weight_kg: 65, reps: 8}] },
];
const exercise_catalog = [
  ...exercise_groups.map(group => ({ ...group, name: group.exercise_name, target_area: 'upper', last_sets: [{weight_kg: 55, reps: 10}] })),
  { exercise_source: 'shared', exercise_id: 2, name: '랫 풀다운', target_area: 'upper', last_sets: [{weight_kg:40,reps:12}] },
];
const settings = { timezone: 'Asia/Seoul', country_code: 'KR', schedule_days: [1, 3, 5], workout_time: '18:30', roast_level: 'spicy', reuse_enabled: true, notification_workout_enabled: true, notification_missed_enabled: true, notification_snooze_enabled: true, notification_free_workout_enabled: false };

function example_response(request_path, language) {
  if (request_path === '/auth/session') return { user: example_user };
  if (request_path === '/today') return {
    workout_date: example_date, timezone: 'Asia/Seoul', is_scheduled_day: true, workout_time: '18:30',
    session: { session_uuid: 'today-example', workout_date: example_date, session_status: 'scheduled', scheduled_time: '18:30', snooze_count: 0 },
    weekly_attendance: { target_count: 3, completed_count: 2, remaining_count: 1 },
    hero_quote: language === 'ko' ? '오늘의 약속부터 지켜보자.' : 'Keep the promise you made to yourself.',
    progress_message: language === 'ko' ? '이번 주 마지막 약속. 오늘도 가자.' : 'One more workout. Keep your week going.',
    memory: null,
  };
  if (request_path === '/settings') return settings;
  if (request_path === '/settings/options') return { day_names: ['일','월','화','수','목','금','토'], roast_labels: {off:'순한맛',hot:'중간맛',spicy:'매운맛'}, roast_quotes:{off:'오늘도 한 걸음.',hot:'오늘의 약속을 지켜.',spicy:'핑계 댈 시간에 일단 가자.'} };
  if (request_path === '/records') return {
    calendar: { year: 2026, month: 10, first_day_of_week: 4, days: Array.from({length:31},(_,index)=>index+1), completed_days, rest_days, missed_days: [], day_statuses: Object.fromEntries([...completed_days.map(day=>[day,'completed']),...rest_days.map(day=>[day,'rest']),[16,'scheduled']]) },
    records: [...completed_days].reverse().map(day=>({ session_uuid: `record-${day}`, workout_date: `2026-10-${String(day).padStart(2,'0')}`, session_status:'completed', status:'운동 완료', date:`10.${String(day).padStart(2,'0')}`, title:language==='ko'?'오늘도 출석 완료':'Workout complete', verification_type:'photo', workout_time:{measured_seconds:3300} })),
    pagination:{total:completed_days.length,limit:100,offset:0},
  };
  if (request_path === '/stats') return {completed_count:7,rest_count:8,missed_count:0,pending_count:1,total_count:16};
  if (request_path === '/workout-timers/current') return { timer:null, server_now:'2026-10-16T06:00:00Z' };
  if (/\/sessions\/by-date\/[^/]+\/sets$/.test(request_path)) return {workout_date:example_date,exercise_groups};
  if (request_path === '/exercises') return exercise_catalog;
  if (request_path === '/safety/status') return {accepted_policy_version:'example-v1',community_policy_version:'example-v1'};
  if (request_path === '/challenge-rooms') return { rooms: [
    {room_uuid:'after-work',round_uuid:'round-1',name:language==='ko'?'퇴근 후 운동 모임':'After-work crew',round_number:2,member_count:4,status:'active',is_host:true},
    {room_uuid:'three-days',round_uuid:'round-2',name:language==='ko'?'주 3회, 같이 가자':'Three days. Together.',round_number:1,member_count:3,status:'active',is_host:false},
    {room_uuid:'weekend',round_uuid:'round-3',name:language==='ko'?'주말에도 출석':'Weekend workouts',round_number:1,member_count:2,status:'scheduled',is_host:false},
  ] };
  return null;
}

const mime_types = {'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf'};
function static_server() {
  return http.createServer(async (request, response) => {
    try {
      const request_path = decodeURIComponent(new URL(request.url,'http://localhost').pathname);
      const root = request_path.startsWith('/__assets/') ? output_root : path.join(project_root,'out');
      const relative_path = request_path.startsWith('/__assets/') ? request_path.slice(10) : request_path.slice(1) || 'index.html';
      const file_path = path.resolve(root, relative_path);
      if (!file_path.startsWith(root+path.sep)) {response.writeHead(403).end();return;}
      response.writeHead(200, {'Content-Type':mime_types[path.extname(file_path)]||'application/octet-stream','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'});
      response.end(await fs.readFile(file_path));
    } catch { response.writeHead(404).end(); }
  });
}

async function capture_screens(browser, base_url, language) {
  const app_url = process.env.APP_PREVIEW_URL || base_url;
  const context = await browser.newContext({viewport:{width:430,height:780},deviceScaleFactor:3,colorScheme:'dark',locale:language==='ko'?'ko-KR':'en-US',timezoneId:'Asia/Seoul',reducedMotion:'reduce'});
  await context.addInitScript(language => { localStorage.setItem('donskipworkout.language',language); }, language);
  const missing_endpoints = new Set();
  await context.route('**/api/v1/**', async route => {
    const request_url = new URL(route.request().url());
    const request_path = request_url.pathname.split('/api/v1')[1];
    const result = example_response(request_path,language);
    if (result===null) missing_endpoints.add(request_path);
    await route.fulfill({status:route.request().method()==='OPTIONS'?204:200,headers:{'Access-Control-Allow-Origin':app_url,'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS'},contentType:'application/json',body:JSON.stringify(result??{})});
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  await page.clock.setFixedTime(new Date('2026-10-16T06:00:00Z'));
  const page_errors=[];
  page.on('pageerror',error=>page_errors.push(error.message));
  await page.goto(app_url,{waitUntil:'domcontentloaded'});
  await page.addStyleTag({content:`@font-face{font-family:StoreMaterialSymbols;src:url('${base_url}/__assets/source/material_symbols.ttf') format('truetype');font-weight:500;font-style:normal}.material-symbols-rounded{font-family:StoreMaterialSymbols!important}nextjs-portal{display:none}`});
  await page.locator('.todayScreen .todayActionCard').waitFor();
  await page.evaluate(()=>document.fonts.load('500 22px StoreMaterialSymbols'));
  await Promise.race([page.evaluate(()=>document.fonts.ready),new Promise(resolve=>setTimeout(resolve,7000))]);
  await page.locator('.weeklyAttendance .weekDayMark.iscompleted').first().waitFor();
  await page.screenshot({path:path.join(screenshot_root,`${language}_01_today.png`)});
  await page.locator('.bottomNav .navItem').nth(1).click();
  await page.locator('.workoutLogPanel.isVisible .workoutSetRow:visible').first().waitFor();
  await page.evaluate(()=>window.scrollTo({top:document.querySelector('.workoutLogPanel .workoutBuilder').getBoundingClientRect().top+window.scrollY-24,behavior:'instant'}));
  await page.screenshot({path:path.join(screenshot_root,`${language}_02_workout.png`)});
  await page.locator('.bottomNav .navItem').nth(2).click();
  await page.locator('.calendarCard .calendarStatus').first().waitFor();
  await page.evaluate(()=>window.scrollTo({top:document.querySelector('.calendarHeader').getBoundingClientRect().top+window.scrollY-24,behavior:'instant'}));
  await page.screenshot({path:path.join(screenshot_root,`${language}_03_records.png`)});
  await page.locator('.bottomNav .navItem').nth(3).click();
  await page.locator('.challengeRoomList .challengeRoomRow').first().waitFor();
  await page.screenshot({path:path.join(screenshot_root,`${language}_04_challenges.png`)});
  if (page_errors.length) throw new Error(`Capture errors: ${page_errors.join('; ')}`);
  await context.close();
  return {language,page_errors,missing_endpoints:[...missing_endpoints]};
}

const localized_copy = {
  en:{feature_title:'Less tomorrow.<br><em>More today.</em>',feature_subtitle:'Reminders. Check-ins. Workout logs.',screens:[
    ['SHOW UP','Your workout.<br><em>Your promise.</em>','Set a time. Keep your week going.','today'],
    ['LOG YOUR EFFORT','Every set<br><em>counts.</em>','Weights, reps, and your last session.','workout'],
    ['SEE YOUR CONSISTENCY','A habit you<br><em>can see.</em>','Your attendance, one day at a time.','records'],
    ['KEEP GOING TOGETHER','Your crew.<br><em>One goal.</em>','Shared goals. A reason to show up.','challenges'],
  ]},
  ko:{feature_title:'내일부터 말고,<br><em>오늘부터.</em>',feature_subtitle:'운동 알림 · 출석 인증 · 세트 기록',screens:[
    ['오늘의 운동 약속','핑계 댈 시간에,<br><em>일단 가자.</em>','운동할 시간을 정하고, 오늘도 출석.','today'],
    ['나의 세트 기록','들었으면,<br><em>기록으로.</em>','중량과 횟수, 지난번의 나까지 한눈에.','workout'],
    ['쌓이는 출석 기록','꾸준함에도<br><em>증거가 있다.</em>','하루씩 쌓이는 나의 운동 습관.','records'],
    ['친구와 함께 챌린지','같이 정하고,<br><em>같이 지키자.</em>','친구와 만드는 운동 약속.','challenges'],
  ]},
};

const poster_styles = `*{box-sizing:border-box}html,body{margin:0;width:1080px;height:1920px;overflow:hidden}body{background:#f5f5f2;color:#1b1e20;font-family:Arial,'Malgun Gothic',sans-serif}.poster{position:relative;width:1080px;height:1920px;padding:46px 68px;background:radial-gradient(ellipse at 90% 0%,#ff894a25,transparent 44%),#f5f5f2}.topline{display:flex;justify-content:space-between;align-items:center;font-size:23px;font-weight:800;letter-spacing:1px}.topline span{font-weight:500;font-size:19px;color:#6b7175;letter-spacing:2px}.kicker{margin:30px 0 12px;font-size:22px;letter-spacing:3px;font-weight:700;color:#823805}.headline{margin:0;font-size:87px;line-height:1.025;letter-spacing:-5px;font-weight:900}.headline em{font-style:normal;color:#aa4618}.subtitle{margin:20px 0 0;font-size:27px;line-height:1.4;color:#62686b;letter-spacing:-.3px}.screen{position:absolute;left:110px;top:360px;width:860px;height:1560px;overflow:hidden;border:8px solid #202326;border-bottom:0;border-radius:36px 36px 0 0;background:#121416;box-shadow:0 18px 52px #10182026}.screen img{display:block;width:844px;height:auto}.poster:lang(ko) .headline{font-size:79px;line-height:1.13;letter-spacing:-5px}.poster:lang(ko) .kicker{letter-spacing:1px}.poster:lang(ko) .subtitle{font-size:25px}.feature{width:1024px;height:500px;position:relative;overflow:hidden;color:#f5f5f2;background:#121416}.feature>img{position:absolute;inset:0;width:1024px;height:500px;object-fit:cover}.feature .copy{position:absolute;left:54px;top:57px;width:535px}.feature .brand{font-size:16px;letter-spacing:3px;font-weight:800}.feature h1{font-size:64px;line-height:1.04;letter-spacing:-3.4px;margin:50px 0 21px;font-weight:900}.feature h1 em{color:#ff894a;font-style:normal}.feature p{font-size:17px;line-height:1.5;color:#d8d9d4;margin:0}.feature:lang(ko) h1{font-family:'Malgun Gothic',Arial,sans-serif;font-size:57px;line-height:1.17;letter-spacing:-3px;margin-top:45px}`;

async function export_artwork(browser,base_url,language) {
  const copy=localized_copy[language];
  const page=await browser.newPage({viewport:{width:1080,height:1920},deviceScaleFactor:1});
  const export_html=async(html,file,width,height)=>{
    await page.setViewportSize({width,height});
    await page.setContent(`<html lang="${language}"><head><style>${poster_styles}.kicker{margin-top:22px}.headline{font-size:81px}.subtitle{margin-top:16px;font-size:25px}.screen{top:380px;height:1540px}.poster:lang(ko) .headline{font-size:76px}</style></head><body>${html}</body></html>`);
    await page.evaluate(()=>Promise.all([...document.images].map(image=>image.decode())));
    const buffer=await page.screenshot();
    await sharp(buffer).removeAlpha().png().toFile(path.join(output_root,language,file));
  };
  await export_html(`<main class="feature" lang="${language}"><img src="${base_url}/__assets/source/feature_artwork.png"><div class="copy"><div class="brand">DON'T SKIP</div><h1>${copy.feature_title}</h1><p>${copy.feature_subtitle}</p></div></main>`,'feature_graphic.png',1024,500);
  for(let index=0;index<copy.screens.length;index++) {
    const [kicker,title,subtitle,screen_name]=copy.screens[index];
    const screen_file=`${language}_${String(index+1).padStart(2,'0')}_${screen_name}.png`;
    await export_html(`<main class="poster" lang="${language}"><div class="topline">DON'T SKIP<span>0${index+1} / 04</span></div><div class="kicker">${kicker}</div><h1 class="headline">${title}</h1><p class="subtitle">${subtitle}</p><div class="screen"><img src="${base_url}/__assets/source/screens/${screen_file}"></div></main>`,`phone_${String(index+1).padStart(2,'0')}_${screen_name}.png`,1080,1920);
  }
  await page.close();
}

async function main() {
  for(const folder of ['en','ko','source/screens']) await fs.mkdir(path.join(output_root,folder),{recursive:true});
  const server=static_server();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base_url=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  try {
    const capture_log=[];
    for(const language of ['en','ko']) {
      capture_log.push(await capture_screens(browser,base_url,language));
      await export_artwork(browser,base_url,language);
      console.log(`${language}: feature graphic and four phone PNGs exported`);
    }
    const preview_page=await browser.newPage({viewport:{width:1520,height:1040},deviceScaleFactor:1});
    const preview_rows=['en','ko'].map(language=>`<section><div class="feature"><h2>${language==='en'?'ENGLISH':'한국어'}</h2><img src="${base_url}/__assets/${language}/feature_graphic.png"><p>FEATURE GRAPHIC · 1024 × 500</p></div>${localized_copy[language].screens.map((screen,index)=>`<div class="phone"><img src="${base_url}/__assets/${language}/phone_${String(index+1).padStart(2,'0')}_${screen[3]}.png"><p>0${index+1} · ${screen[0]}</p></div>`).join('')}</section>`).join('');
    await preview_page.setContent(`<html><head><style>*{box-sizing:border-box}body{margin:0;padding:32px 36px;background:#e7e8e2;color:#202326;font-family:Arial,'Malgun Gothic',sans-serif}h1{margin:0 0 22px;font-size:25px;letter-spacing:-.5px}section{display:flex;gap:18px;align-items:flex-start;margin-bottom:30px}.feature{width:420px;padding-top:7px}.feature img{width:420px;border-radius:10px}.phone{width:236px}.phone img{width:236px;border-radius:9px}.phone p,.feature p{font-size:12px;margin:9px 0}h2{font-size:15px;letter-spacing:2px;margin:0 0 15px}</style></head><body><h1>DON'T SKIP — GOOGLE PLAY ASSETS</h1>${preview_rows}</body></html>`);
    await preview_page.evaluate(()=>Promise.all([...document.images].map(image=>image.decode())));
    await sharp(await preview_page.screenshot()).removeAlpha().png().toFile(path.join(output_root,'preview.png'));
    await preview_page.close();
    await fs.writeFile(path.join(output_root,'source/capture_log.json'),JSON.stringify(capture_log,null,2));
    const asset_manifest=[];
    for(const language of ['en','ko']) for(const file of await fs.readdir(path.join(output_root,language))) {
      const file_path=path.join(output_root,language,file);
      const metadata=await sharp(file_path).metadata();
      asset_manifest.push({file:`${language}/${file}`,width:metadata.width,height:metadata.height,channels:metadata.channels,format:metadata.format,bytes:(await fs.stat(file_path)).size});
    }
    await fs.writeFile(path.join(output_root,'source/asset_manifest.json'),JSON.stringify(asset_manifest,null,2));
    console.log(JSON.stringify(asset_manifest));
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
}
module.exports = { example_response };
if (require.main === module) main().catch(error=>{console.error(error);process.exitCode=1});
