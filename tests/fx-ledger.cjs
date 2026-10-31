const vm=require('vm'),fs=require('fs'),assert=require('assert'),path=require('path');
const root=path.resolve(__dirname,'..');
const script=fs.readFileSync(path.join(root,'index.html'),'utf8').match(/<script src="([^"]+)"/)[1];
const source=fs.readFileSync(path.join(root,script),'utf8').split('els.form.addEventListener("submit"')[0];
const storage=new Map([
 ['term-deposit-owners-v1',JSON.stringify([{id:'self',name:'本人'},{id:'family',name:'家族'}])],
 ['term-deposit-owner-settings-v1',JSON.stringify({self:{fxHedge:{settledProfit:500,unsettledProfit:-200}},family:{fxHedge:{settledProfit:100,unsettledProfit:20}}})],
]);
function context(){return vm.createContext({localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},window:{location:{hash:''}},document:{querySelector:()=>({}),querySelectorAll:()=>[]},crypto:{randomUUID:()=> 'test'},Date,Intl});}
const c=context();vm.runInContext(source,c);const run=s=>vm.runInContext(s,c);
assert.equal(run('fxLedgerSummary().settledProfit'),600);assert.equal(run('fxLedgerSummary().unsettledProfit'),-180);
run("selectedOwnerId='self';fxLedger.companies=[{id:'a',name:'会社A'},{id:'b',name:'会社B'}]");
assert.equal(run("storeFxCell('2025-12','a',100)"),false);
assert.equal(run("storeFxCell('2026-13','a',100)"),false);
assert.equal(run("storeFxCell('2026-01','missing',100)"),false);
assert.equal(run("storeFxCell('2026-01','a',Infinity)"),false);
assert.equal(run("storeFxCell('2026-01','a',1000)"),true);
assert.equal(run("storeFxCell('2026-01','b',-300)"),true);
assert.equal(run("storeFxCell('2027-01','a',200)"),true);
assert.equal(run('fxLedgerSummary().settledProfit'),1400);
run("selectedOwnerId='family'");assert.equal(run('fxLedgerSummary().settledProfit'),100);
run("storeFxCell('2026-01','a',50)");assert.equal(run('fxLedgerSummary().settledProfit'),150);
run("selectedOwnerId='all'");assert.equal(run("fxCellValue('2026-01','a')"),1050);
assert.equal(run('fxLedgerSummary().settledProfit'),1550);assert.equal(run('fxHedgeGainLoss()'),1370);
assert.equal(run("storeFxCell('2026-01','a',99999)"),false);
assert.equal(run("parseFxAmount('-10,000')"),-10000);
assert.equal(run("parseFxAmount('－１２３４．５')"),-1234.5);
assert.equal(run("parseFxAmount('−123')"),-123);
assert.equal(run("parseFxAmount('')"),0);
assert.equal(run("parseFxAmount('-')"),null);
assert.equal(run("parseFxAmount('abc')"),null);
assert.equal(run("parseFxAmount('1e309')"),null);
run('saveFxLedger()');
const reloaded=context();vm.runInContext(source,reloaded);
assert.equal(vm.runInContext('fxLedgerSummary().settledProfit',reloaded),1550,'reload must not re-add migration values');
console.log('PASS: legacy migration, per-owner isolation/aggregation, monthly/company totals across years, pre-2026 rejection, invalid number handling, read-only aggregate guard, persistence without duplicate migration');
