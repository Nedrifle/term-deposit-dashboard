const vm=require('vm'),fs=require('fs'),assert=require('assert'),path=require('path');
const root=path.resolve(__dirname,'..');
const script=fs.readFileSync(path.join(root,'index.html'),'utf8').match(/<script src="([^"]+)"/)[1];
const c=vm.createContext({localStorage:{getItem:()=>null},window:{location:{hash:''}},document:{querySelector:()=>({}),querySelectorAll:()=>[]},crypto:{randomUUID:()=> 'test'},Date,Intl});
vm.runInContext(fs.readFileSync(path.join(root,script),'utf8').split('els.form.addEventListener("submit"')[0],c);
const run=s=>vm.runInContext(s,c);
run(`owners.push({id:'family',name:'家族'});state.deposits=[
normalizeDeposit({ownerId:'self',currency:'USD',principal:10000,annualRate:3.65,taxRate:0,startDate:'2026-01-01',maturityDate:'2026-01-11',initialFxRate:140,fxRate:150,interestReceiptFxRate:143,conversionFxRate:145}),
normalizeDeposit({ownerId:'family',currency:'USD',principal:1000,startDate:'2026-10-01',maturityDate:'2026-11-01',initialFxRate:140,fxRate:130}),
normalizeDeposit({currency:'USD',principal:1000,startDate:'2026-01-01',maturityDate:'2026-02-01',initialFxRate:140,fxRate:155}),
normalizeDeposit({currency:'USD',principal:1000,startDate:'2027-01-01',maturityDate:'2027-02-01',initialFxRate:140,fxRate:155}),
normalizeDeposit({currency:'JPY',principal:1000,startDate:'2026-10-01',maturityDate:'2026-11-01'})];`);
assert.equal(run("depositFxBreakdown(state.deposits,'2026-10-30').realized"),50050);
assert.equal(run("depositFxBreakdown(state.deposits,'2026-10-30').unrealized"),-10000);
assert.equal(run("fxGainLoss(state.deposits,'2026-10-30')"),40050);
run("selectedOwnerId='self'");assert.equal(run("depositFxBreakdown(visibleDeposits(),'2026-10-30').unrealized"),0);
run("selectedOwnerId='family'");assert.equal(run("depositFxBreakdown(visibleDeposits(),'2026-10-30').realized"),0);
assert.equal(run("depositFxBreakdown(visibleDeposits(),'2026-10-30').unrealized"),-10000);
console.log('PASS: realized principal/interest, unrealized loss, pending/future/JPY exclusions, total reconciliation, owner isolation');
