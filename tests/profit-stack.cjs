const vm=require('vm'),fs=require('fs'),assert=require('assert'),path=require('path');
const root=path.resolve(__dirname,'..');
const script=fs.readFileSync(path.join(root,'index.html'),'utf8').match(/<script src="([^"]+)"/)[1];
const c=vm.createContext({localStorage:{getItem:()=>null},window:{location:{hash:''}},document:{querySelector:()=>({}),querySelectorAll:()=>[]},crypto:{randomUUID:()=> 'test'},Date,Intl});
vm.runInContext(fs.readFileSync(path.join(root,script),'utf8').split('els.form.addEventListener("submit"')[0],c);
const run=s=>vm.runInContext(s,c);
const stack=run('stackProfitValues({interest:100,depositRealized:-30,depositUnrealized:20,fxRealized:-50,fxUnrealized:-10})');
assert.equal(stack.positive,120);assert.equal(stack.negative,-90);assert.equal(stack.total,30);
assert.equal(stack.bands.depositUnrealized.positive.bottom,100);assert.equal(stack.bands.depositUnrealized.positive.top,120);
assert.equal(stack.bands.fxRealized.negative.bottom,-30);assert.equal(stack.bands.fxRealized.negative.top,-80);
assert.equal(stack.bands.fxUnrealized.negative.top,-90);
run(`selectedOwnerId='self';profitYear=2026;const today=new Date(2026,9,31);
state.deposits=[
normalizeDeposit({currency:'JPY',principal:365000,annualRate:1,taxRate:0,startDate:'2025-01-01',maturityDate:'2026-01-01'}),
normalizeDeposit({currency:'JPY',principal:365000,annualRate:1,taxRate:0,startDate:'2027-01-01',maturityDate:'2028-01-01'}),
normalizeDeposit({currency:'USD',principal:1000,annualRate:0,startDate:'2025-01-01',maturityDate:'2025-06-01',initialFxRate:140,conversionFxRate:145}),
normalizeDeposit({currency:'USD',principal:1000,annualRate:0,startDate:'2026-01-01',maturityDate:'2027-01-01',initialFxRate:140,fxRate:130})];
fxLedger.byOwner={self:{realized:{'2026-02':{a:100},'2027-01':{a:200}},legacyRealized:7,unrealized:-20}};`);
const past=run('profitChartPoints(new Date(2025,0,1),new Date(2025,11,31),today).at(-1)');
assert.equal(past.values.interest,3650);assert.equal(past.values.depositRealized,5000);
assert.equal(past.values.depositUnrealized,0);assert.equal(past.values.fxUnrealized,0);assert.equal(past.values.fxRealized,0);assert.equal(past.value,8650);
const current=run('profitChartPoints(new Date(2026,0,1),new Date(2026,11,31),today).at(-1)');
assert.equal(current.values.depositRealized,0);assert.equal(current.values.depositUnrealized,-10000);assert.equal(current.values.fxUnrealized,-20);assert.equal(current.values.fxRealized,107);assert.equal(current.value,-9913);
const future=run('profitChartPoints(new Date(2027,0,1),new Date(2027,11,31),today).at(-1)');
assert.equal(future.values.interest,3650);assert.equal(future.values.depositUnrealized,0);assert.equal(future.values.fxUnrealized,0);assert.equal(future.values.fxRealized,200);assert.equal(future.value,3850);
for(const year of [2025,2026,2027]){
 const points=run(`profitChartPoints(new Date(${year},0,1),new Date(${year},11,31),today)`);
 for(const point of points){const sum=Object.values(point.values).reduce((a,b)=>a+b,0);assert(Math.abs(sum-point.value)<1e-8);}
}
assert.equal(run('monthlyProfitRows(today,2025).reduce((s,row)=>s+row.actual,0)'),3650);
assert.equal(run('monthlyProfitRows(today,2025).reduce((s,row)=>s+row.forecast,0)'),0);
assert.equal(run('monthlyProfitRows(today,2027).reduce((s,row)=>s+row.actual,0)'),0);
assert.equal(run('monthlyProfitRows(today,2027).reduce((s,row)=>s+row.forecast,0)'),3650);
assert.equal(run('availableProfitYears(today)[0]'),2025);assert.equal(run('availableProfitYears(today).at(-1)'),2028);
console.log('PASS: positive/negative stacks, net-line reconciliation, selected past/current/future year components, no snapshot leakage across years, monthly table year linkage, available years');
