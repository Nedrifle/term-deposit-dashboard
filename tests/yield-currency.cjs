const vm=require('vm'),fs=require('fs'),assert=require('assert'),path=require('path');
const root=path.resolve(__dirname,'..');
const script=fs.readFileSync(path.join(root,'index.html'),'utf8').match(/<script src="([^"]+)"/)[1];
const source=fs.readFileSync(path.join(root,script),'utf8').split('els.form.addEventListener("submit"')[0];
const storage=new Map();
function create(){const c=vm.createContext({localStorage:{getItem:key=>storage.get(key)||null},window:{location:{hash:''}},document:{querySelector:()=>({}),querySelectorAll:()=>[]},crypto:{randomUUID:()=> 'test'},Date,Intl});vm.runInContext(source,c);return c;}
const c=create(),run=s=>vm.runInContext(s,c),near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
assert.equal(run('yieldCurrency'),'all');
run(`selectedOwnerId='self';owners.push({id:'family',name:'家族'});state.deposits=[
normalizeDeposit({ownerId:'self',currency:'JPY',principal:365000,annualRate:1,taxRate:0,startDate:'2026-01-01',maturityDate:'2026-02-01'}),
normalizeDeposit({ownerId:'self',currency:'USD',principal:1000,annualRate:3.65,taxRate:0,startDate:'2026-01-16',maturityDate:'2026-01-26',initialFxRate:100,fxRate:200,conversionFxRate:110}),
normalizeDeposit({ownerId:'family',currency:'JPY',principal:365000,annualRate:2,taxRate:0,startDate:'2026-01-01',maturityDate:'2026-02-01'})];
fxLedger.byOwner={self:{realized:{'2026-01':{a:500}},legacyRealized:9999,unrealized:999999},family:{realized:{},legacyRealized:0,unrealized:0}};`);
const row=currency=>run(`monthlyOperatingYieldRows(new Date(2026,1,10),2026,'${currency}')[0]`);
const jpy=row('JPY'),usd=row('USD'),all=row('all');
near(jpy.averageBalance,365000);near(jpy.interest,310);assert.equal(jpy.depositFx,0);assert.equal(jpy.hedgeRealized,0);near(jpy.rate,1);
near(usd.averageBalance,100000*10/31);near(usd.interest,100);near(usd.depositFx,10010);assert.equal(usd.hedgeRealized,500);near(usd.profit,10610);
near(all.profit,jpy.profit+usd.profit);near(all.averageBalance,jpy.averageBalance+usd.averageBalance);near(all.rate,(jpy.rate*jpy.averageBalance+usd.rate*usd.averageBalance)/all.averageBalance);
near(row('invalid').rate,all.rate);
run("selectedOwnerId='family'");near(row('JPY').rate,2);assert.equal(row('USD').rate,null);
run("fxOwnerData('family',true).realized['2026-01']={a:100}");assert.equal(row('JPY').hedgeRealized,0);assert.equal(row('USD').hedgeRealized,100);assert.equal(row('USD').rate,null);
run("selectedOwnerId='all'");near(row('JPY').rate,1.5);assert.equal(row('USD').hedgeRealized,600);
storage.set('term-deposit-yield-currency-v1','USD');assert.equal(vm.runInContext('yieldCurrency',create()),'USD');storage.set('term-deposit-yield-currency-v1','invalid');assert.equal(vm.runInContext('yieldCurrency',create()),'all');
console.log('PASS: currency-specific numerator and average balance, hedge in USD/total only, weighted total yield, owner scopes, zero USD balance, persisted currency and invalid setting fallback');
