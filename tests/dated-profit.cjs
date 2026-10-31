const vm=require('vm'),fs=require('fs'),assert=require('assert'),path=require('path');
const root=path.resolve(__dirname,'..');
const script=fs.readFileSync(path.join(root,'index.html'),'utf8').match(/<script src="([^"]+)"/)[1];
const c=vm.createContext({localStorage:{getItem:()=>null},window:{location:{hash:''}},document:{querySelector:()=>({}),querySelectorAll:()=>[]},crypto:{randomUUID:()=> 'test'},Date,Intl});
vm.runInContext(fs.readFileSync(path.join(root,script),'utf8').split('els.form.addEventListener("submit"')[0],c);
const run=s=>vm.runInContext(s,c);
const near=(actual,expected)=>assert(Math.abs(actual-expected)<1e-6,`${actual} != ${expected}`);
run(`const yearStart=new Date(2026,0,1), today=new Date(2026,2,15);owners.push({id:'family',name:'家族'});selectedOwnerId='self';
state.deposits=[
normalizeDeposit({ownerId:'self',currency:'USD',principal:1000,annualRate:3.65,taxRate:0,startDate:'2026-01-31',maturityDate:'2026-02-10',initialFxRate:140,conversionFxRate:145}),
normalizeDeposit({ownerId:'self',currency:'USD',principal:1000,annualRate:0,startDate:'2025-12-01',maturityDate:'2025-12-31',initialFxRate:140,conversionFxRate:146}),
normalizeDeposit({ownerId:'self',currency:'USD',principal:1000,annualRate:0,startDate:'2026-03-01',maturityDate:'2026-12-31',initialFxRate:140,fxRate:138}),
normalizeDeposit({ownerId:'self',currency:'USD',principal:1000,annualRate:0,startDate:'2026-12-01',maturityDate:'2026-12-20',initialFxRate:140,conversionFxRate:150}),
normalizeDeposit({ownerId:'family',currency:'USD',principal:1000,annualRate:0,startDate:'2026-02-01',maturityDate:'2026-02-15',initialFxRate:140,conversionFxRate:142})];
fxLedger.companies=[{id:'a',name:'会社A'},{id:'b',name:'会社B'}];fxLedger.byOwner={self:{realized:{'2025-12':{a:999},'2026-01':{a:100,b:-20},'2026-02':{a:200},'2026-03':{a:300},'2026-12':{a:400},'2027-01':{a:999}},legacyRealized:7,unrealized:-10},family:{realized:{'2026-01':{a:50}},legacyRealized:3,unrealized:5}};`);
const currency=date=>run(`datedCurrencyGainLoss('${date}',yearStart,today)`);
near(currency('2025-12-31'),0);
near(currency('2026-01-30'),0);near(currency('2026-01-31'),80);
near(currency('2026-02-09'),80);near(currency('2026-02-10'),5085);
near(currency('2026-02-27'),5085);near(currency('2026-02-28'),5285);
near(currency('2026-03-14'),5285);near(currency('2026-03-15'),3282);
near(currency('2026-03-30'),3282);near(currency('2026-03-31'),3582);
near(currency('2026-12-31'),3982);
const points=run('profitChartPoints(yearStart,new Date(2026,11,31),today)');
assert.equal(points.length,365);assert(points.some(p=>p.date.getMonth()===1&&p.date.getDate()===10));
for(const index of [0,30,39,58,73,89,364])near(points[index].value,run(`cumulativeProfitOn(new Date(2026,0,${index+1}),yearStart,true,today)`));
run("selectedOwnerId='family'");near(currency('2026-03-15'),2058);
run("selectedOwnerId='all'");near(currency('2026-03-15'),5340);
run(`state.deposits=[];selectedOwnerId='self';fxLedger.byOwner={self:{realized:{'2028-02':{a:123}},legacyRealized:0,unrealized:0}};`);
near(run("datedCurrencyGainLoss('2028-02-28',new Date(2028,0,1),new Date(2028,2,1))"),0);
near(run("datedCurrencyGainLoss('2028-02-29',new Date(2028,0,1),new Date(2028,2,1))"),123);
assert.equal(run('profitChartPoints(new Date(2028,0,1),new Date(2028,11,31),new Date(2028,2,1)).length'),366);
console.log('PASS: maturity-date realized principal+interest, company/month-end FX including losses, year boundaries, today-only valuations/legacy, future month forecasts, owner scopes, daily series reconciliation, leap-year month end');
