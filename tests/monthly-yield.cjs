const vm=require('vm'),fs=require('fs'),assert=require('assert'),path=require('path');
const root=path.resolve(__dirname,'..');
const script=fs.readFileSync(path.join(root,'index.html'),'utf8').match(/<script src="([^"]+)"/)[1];
const c=vm.createContext({localStorage:{getItem:()=>null},window:{location:{hash:''}},document:{querySelector:()=>({}),querySelectorAll:()=>[]},crypto:{randomUUID:()=> 'test'},Date,Intl});
vm.runInContext(fs.readFileSync(path.join(root,script),'utf8').split('els.form.addEventListener("submit"')[0],c);
const run=s=>vm.runInContext(s,c);
const near=(actual,expected)=>assert(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);
run(`selectedOwnerId='self';owners.push({id:'family',name:'家族'});state.deposits=[
normalizeDeposit({ownerId:'self',currency:'JPY',principal:365000,annualRate:1,taxRate:0,startDate:'2026-01-01',maturityDate:'2026-02-01'}),
normalizeDeposit({ownerId:'self',currency:'USD',principal:1000,annualRate:3.65,taxRate:0,startDate:'2026-01-16',maturityDate:'2026-01-26',initialFxRate:100,fxRate:200,conversionFxRate:110}),
normalizeDeposit({ownerId:'family',currency:'JPY',principal:365000,annualRate:2,taxRate:0,startDate:'2026-01-01',maturityDate:'2026-02-01'})];
fxLedger.byOwner={self:{realized:{'2026-01':{a:500},'2026-02':{a:-100}},legacyRealized:9999,unrealized:999999},family:{realized:{},legacyRealized:0,unrealized:0}};
state.surplusFunds={amount:9999999,annualRate:99};`);
const jan=run('monthlyOperatingYieldRows(new Date(2026,1,10),2026)[0]');
assert.equal(jan.elapsedDays,31);near(jan.averageBalance,365000+100000*10/31);near(jan.interest,410);near(jan.depositFx,10010);assert.equal(jan.hedgeRealized,500);near(jan.profit,10920);near(jan.rate,10920/(365000+100000*10/31)*365/31*100);
const partial=run('monthlyOperatingYieldRows(new Date(2026,0,20),2026)[0]');
assert.equal(partial.elapsedDays,20);assert.equal(partial.partial,true);near(partial.averageBalance,390000);near(partial.interest,250);assert.equal(partial.depositFx,0);assert.equal(partial.hedgeRealized,0);near(partial.rate,250/390000*365/20*100);
const feb=run('monthlyOperatingYieldRows(new Date(2026,2,1),2026)[1]');assert.equal(feb.averageBalance,0);assert.equal(feb.hedgeRealized,-100);assert.equal(feb.rate,null);
const future=run('monthlyOperatingYieldRows(new Date(2026,0,20),2026)[1]');assert.equal(future.future,true);assert.equal(future.rate,null);assert.equal(future.averageBalance,null);
run("state.deposits[1].fxRate=300;selectedProfitKeys.clear()");near(run('monthlyOperatingYieldRows(new Date(2026,1,10),2026)[0].rate'),jan.rate);
run("selectedOwnerId='all'");const combined=run('monthlyOperatingYieldRows(new Date(2026,1,10),2026)[0]');near(combined.averageBalance,jan.averageBalance+365000);near(combined.profit,jan.profit+620);near(combined.rate,(jan.profit+620)/(jan.averageBalance+365000)*365/31*100);
run(`selectedOwnerId='self';fxLedger.byOwner={self:{realized:{},legacyRealized:0,unrealized:0}};state.deposits=[normalizeDeposit({currency:'JPY',principal:365000,annualRate:1,taxRate:20.315,startDate:'2028-02-01',maturityDate:'2028-03-01'})];`);
const leap=run('monthlyOperatingYieldRows(new Date(2028,2,1),2028)[1]');assert.equal(leap.elapsedDays,29);near(leap.averageBalance,365000);near(leap.interest,290*(1-20.315/100));near(leap.rate,1*(1-20.315/100));
const firstDay=run('monthlyOperatingYieldRows(new Date(2028,1,1),2028)[1]');assert.equal(firstDay.elapsedDays,1);near(firstDay.rate,leap.rate);
run(`state.deposits=[normalizeDeposit({currency:'USD',principal:1000,annualRate:0,startDate:'2026-01-01',maturityDate:'2026-02-01',initialFxRate:100,conversionFxRate:90})];`);
const monthStartMaturity=run('monthlyOperatingYieldRows(new Date(2026,2,1),2026)[1]');assert.equal(monthStartMaturity.depositFx,-10000);assert.equal(monthStartMaturity.averageBalance,0);assert.equal(monthStartMaturity.rate,null);
console.log('PASS: weighted daily balance, initial FX basis, interest/realized FX/hedge numerator, partial month cutoff, month-end recognition, exclusion of unrealized/undated/surplus, zero balance, future months, owner aggregation, tax and leap year, 365-day annualization for full/partial/one-day months');
