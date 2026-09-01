// Shared allocator core. Used by index.html (planner) and callsheet.html (photo call sheet).
const q=d=>d.slice(0,4)+"-Q"+(Math.floor((+d.slice(5,7)-1)/3)+1);
const mo=d=>d.slice(0,7);

// Allocator, per quarter. Each report names >= minFund funders from >= 2 depts;
// session cost splits across them, waterfall-capped by each funder's headroom.
function allocate({dept,ses},cap,maxAct,minFund,mode){
  const st={}; // name -> quarter -> {spent, reports:[months]}
  const cur=(n,Q)=>{st[n]=st[n]||{}; return st[n][Q]=st[n][Q]||{spent:0,reports:[]}};
  const out=[];
  for(const x of [...ses].sort((a,b)=>a.date<b.date?-1:1)){
    const Q=q(x.date), M=mo(x.date), flags=[];
    if(x.who.length<minFund) flags.push(`only ${x.who.length} attendees (need ${minFund})`);
    if(new Set(x.who.map(w=>dept[w])).size<2) flags.push("attendees from only 1 department (need 2)");
    if(flags.length){out.push({...x,Q,M,valid:false,flags,payers:[],covered:0,short:x.cost});continue}

    // eligible funders for this session
    const cands=x.who.map(n=>{const s0=cur(n,Q);
        return {n,rem:cap-s0.spent,slots:maxAct-s0.reports.length,usedMonth:s0.reports.includes(M)};})
      .filter(c=>c.rem>0.5 && c.slots>0 && !(mode==="month" && c.usedMonth))
      .sort((a,b)=>b.rem-a.rem || a.n.localeCompare(b.n));

    if(cands.length<minFund){
      out.push({...x,Q,M,valid:false,payers:[],covered:0,short:x.cost,
        flags:[`only ${cands.length} funder(s) with quota left (report needs ${minFund})`]});
      continue;
    }
    // seed set = top minFund, forced to span >= 2 departments
    let set=cands.slice(0,minFund);
    if(new Set(set.map(c=>dept[c.n])).size<2){
      const alt=cands.slice(minFund).find(c=>dept[c.n]!==dept[set[0].n]);
      if(!alt){out.push({...x,Q,M,valid:false,payers:[],covered:0,short:x.cost,
        flags:["eligible funders all from 1 department (need 2)"]});continue}
      set=[...set.slice(0,minFund-1),alt];
    }
    // waterfall split; widen the set while cost is uncovered and candidates remain
    let split=[],next=cands.filter(c=>!set.includes(c));
    for(;;){
      split=waterfall(set,x.cost);
      const got=split.reduce((a,p)=>a+p.pay,0);
      if(x.cost-got<=0.5 || !next.length) break;
      set=[...set,next.shift()];
    }
    const payers=split.filter(p=>p.pay>0.5);
    // a report must still name minFund people: keep zero-pay names out, re-check
    if(payers.length<minFund){
      out.push({...x,Q,M,valid:false,payers:[],covered:0,short:x.cost,
        flags:[`quota only stretches to ${payers.length} paying funder(s) (report needs ${minFund})`]});
      continue;
    }
    for(const p of payers){const s0=cur(p.n,Q); s0.spent+=p.pay; s0.reports.push(M);}
    const covered=payers.reduce((a,p)=>a+p.pay,0);
    out.push({...x,Q,M,valid:true,flags:[],payers,covered,short:x.cost-covered});
  }
  return {out,st};
}

// Even split capped by each funder's remaining quota; surplus re-spread over the rest.
function waterfall(set,cost){
  let pool=[...set].map(c=>({n:c.n,cap:c.rem,pay:0})),left=cost;
  for(;;){
    const open=pool.filter(p=>p.pay<p.cap-1e-6);
    if(!open.length || left<=0.5) break;
    const share=left/open.length;
    let moved=0;
    for(const p of open){const add=Math.min(share,p.cap-p.pay); p.pay+=add; moved+=add;}
    left-=moved;
    if(moved<=1e-6) break;
  }
  return pool;
}


const STORE="quotaquest.v1";
function saveInput(o){try{localStorage.setItem(STORE,JSON.stringify(o))}catch(e){}}
function loadInput(){try{return JSON.parse(localStorage.getItem(STORE))||null}catch(e){return null}}
