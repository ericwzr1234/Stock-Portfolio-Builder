const { chromium } = require("@playwright/test");
const F = require("./fixture.js");
(async()=>{
 const b=await chromium.launch();
 const p=await b.newPage({viewport:{width:402,height:874},isMobile:true,hasTouch:true,colorScheme:"dark"});
 await p.addInitScript(()=>{window.Capacitor={isNativePlatform:()=>true,getPlatform:()=>"ios"};});
 await p.goto("http://127.0.0.1:8768");
 await p.waitForFunction(()=>typeof window.renderAll==="function");
 await F.seed(p);
 await p.waitForTimeout(300);
 const r = await p.evaluate(()=>{
   const svg=document.getElementById("ovChart");
   const hero=()=>document.getElementById("ovValue").textContent.trim();
   const sub =()=>document.getElementById("ovSub").textContent.trim().slice(0,60);
   if(!svg) return {err:"no chart"};
   const box=svg.getBoundingClientRect();
   const ev=(type,x)=>{ const e=new PointerEvent(type,{pointerType:"touch",pointerId:1,
     clientX:x, clientY:box.top+box.height/2, buttons:1, pressure:0.5, bubbles:true, cancelable:true});
     svg.dispatchEvent(e); };
   const out={ before:{v:hero(), s:sub()} };
   ev("pointerdown", box.left+6);
   ev("pointermove", box.left+box.width*0.28);        // drag to an early checkpoint
   out.during={v:hero(), s:sub()};
   ev("pointerup", box.left+box.width*0.28);
   out.after={v:hero(), s:sub()};
   out.handlersWired = !!svg.onpointerdown && !!svg.onpointermove;
   return out;
 });
 console.log(JSON.stringify(r,null,1));
 console.log("VERDICT:", r.during && r.during.v!==r.before.v ? "touch scrub WORKS" : "touch scrub DID NOT change the hero");
 console.log("RELEASE:", r.after && r.after.v===r.before.v ? "returns to default OK" : "did not reset");
 await b.close();
})();
