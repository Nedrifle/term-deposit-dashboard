const vm=require('vm'),fs=require('fs'),assert=require('assert');
const c=vm.createContext({localStorage:{getItem:()=>null},window:{location:{hash:''}},document:{querySelector:()=>({}),querySelectorAll:()=>[]},crypto:{randomUUID:()=> 'test'},Date,Intl});
const path=require('path');
const root=path.resolve(__dirname,'..');
const script=fs.readFileSync(path.join(root,'index.html'),'utf8').match(/<script src="([^"]+)"/)[1];
vm.runInContext(fs.readFileSync(path.join(root,script),'utf8').split('els.form.addEventListener("submit"')[0],c);
const run=s=>vm.runInContext(s,c);
run(`const deposit=normalizeDeposit({currency:'JPY',principal:365000,annualRate:1,taxRate:0,dayBasis:365,startDate:'2026-10-01',maturityDate:'2026-11-01'});state.deposits=[deposit];`);
for(const [date,active,matured,days] of [['2026-09-30',false,false,0],['2026-10-01',true,false,1],['2026-10-31',true,false,31],['2026-11-01',false,true,31],['2026-11-02',false,true,31]]){
 assert.equal(run(`isActiveOn(deposit,'${date}')`),active,date);
 assert.equal(run(`isHeldOn(deposit,'${date}')`),active,date);
 assert.equal(run(`isMaturedOn(deposit,'${date}')`),matured,date);
 assert.equal(run(`accruedInterestDays(deposit,'${date}')`),days,date);
 assert.equal(run(`dailyInterestFor(deposit,'${date}')`),active?10:0,date);
}
assert.equal(run("cumulativeInterest('2026-10-01','2026-10-31')"),310);
assert.equal(run("cumulativeInterest('2026-11-01','2026-11-30')"),0);
assert.equal(run('maturityNetInterest(deposit)'),310);
assert.equal(run("monthlyProfitRows(new Date(2026,9,28))[9].total"),310);
assert.equal(run("monthlyProfitRows(new Date(2026,9,28))[10].total"),0);
run("deposit.currency='USD';deposit.initialFxRate=140;deposit.fxRate=150;deposit.interestReceiptFxRate=145;deposit.conversionFxRate=146;");
assert.equal(run("interestConversionRate(deposit,'2026-11-01')"),145);
assert.equal(run("principalValuationRate(deposit,'2026-11-01')"),146);
run("deposit.currency='JPY';deposit.startDate='2024-02-28';deposit.maturityDate='2024-03-01'");
assert.equal(run("accruedInterestDays(deposit,'2024-02-29')"),2);
assert.equal(run("isActiveOn(deposit,'2024-03-01')"),false);
console.log('PASS: deposit day included; maturity excluded and classified matured; cumulative/monthly totals; maturity FX rates; leap day');
