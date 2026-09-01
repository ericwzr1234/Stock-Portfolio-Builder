const { test, expect } = require("@playwright/test");

const STATES = {
  "brand-new account": () => {
    state.themes=[]; state.themeTickers={}; state.watchlist=[];
    state.portfolio={holdings:{},versions:[],head:-1};
  },
  "portfolios with names, NOT yet funded": () => {
    state.themes=[{key:"a",name:"AI",color:"#2f9e8f"}];
    state.themeTickers={a:["NVDA"]};
    state.quotes={NVDA:{price:100,prevClose:99,marketCap:1e12,marketState:"REGULAR"}};
    state.fundamentals={NVDA:{peg:1,ev:10,dfcf:5,pe:20,marketCap:1e12}};
    state.watchlist=[];
    state.portfolio={holdings:{},versions:[],head:-1};
  },
  "portfolios but no names": () => {
    state.themes=[{key:"a",name:"AI",color:"#2f9e8f"}];
    state.themeTickers={a:[]}; state.watchlist=[];
    state.portfolio={holdings:{},versions:[],head:-1};
  },
};

for (const [name, mutate] of Object.entries(STATES)) {
  test(`no duplicate element id: ${name}`, async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => typeof window.renderAll === "function");
    const r = await page.evaluate((src) => {
      localStorage.setItem(SB_SESSION_KEY, JSON.stringify({access_token:"T",refresh_token:"r",user:{id:"u1",email:"x@y.z"}}));
      sbLoadSession(); appLocked=false; showGate(false);
      window.savePortfolio = async () => true;
      (0,eval)("("+src+")")();
      rebuildThemeOf(); renderAll();
      const seen={}, dup=[];
      document.querySelectorAll("[id]").forEach(e=>{ seen[e.id]=(seen[e.id]||0)+1; });
      Object.entries(seen).forEach(([k,v])=>{ if(v>1) dup.push(k+" x"+v); });
      return { dup };
    }, mutate.toString());
    /* Two elements sharing an id is not cosmetic: $("#x") returns the FIRST, so a handler can be
       wired to one control while the user clicks the other. */
    expect(r.dup).toEqual([]);
  });
}
