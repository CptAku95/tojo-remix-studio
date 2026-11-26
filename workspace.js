
const $=id=>document.getElementById(id);
const tabs=[...document.querySelectorAll("[data-tab]")];
const panels=[...document.querySelectorAll("[data-workspace]")];
let active="separation";
function activateTab(name){
 if(!panels.some(p=>p.dataset.workspace===name))return;
 active=name;
 for(const t of tabs){const on=t.dataset.tab===name;t.setAttribute("aria-selected",String(on));t.tabIndex=on?0:-1;}
 for(const p of panels)p.hidden=p.dataset.workspace!==name;
}
function activatePage(group,name){
 const panel=panels.find(p=>p.dataset.workspace===group);if(!panel)return;
 const buttons=[...panel.querySelectorAll("[data-page]")],pages=[...panel.querySelectorAll("[data-subpanel]")];
 if(!pages.some(p=>p.dataset.subpanel===name))return;
 for(const b of buttons){const on=b.dataset.page===name;b.setAttribute("aria-selected",String(on));b.tabIndex=on?0:-1;}
 for(const p of pages)p.hidden=p.dataset.subpanel!==name;
}
for(const t of tabs)t.addEventListener("click",()=>activateTab(t.dataset.tab));
for(const p of panels)for(const b of p.querySelectorAll("[data-page]"))b.addEventListener("click",()=>activatePage(p.dataset.workspace,b.dataset.page));
for(const b of document.querySelectorAll("[data-go]"))b.addEventListener("click",()=>{const [group,page]=b.dataset.go.split(":");activateTab(group);activatePage(group,page);});
for(const list of document.querySelectorAll('[role="tablist"]'))list.addEventListener("keydown",e=>{
 if(!["ArrowLeft","ArrowRight","Home","End"].includes(e.key))return;
 const buttons=[...list.querySelectorAll('[role="tab"]')],i=buttons.indexOf(document.activeElement);if(i<0)return;
 e.preventDefault();const next=e.key==="Home"?0:e.key==="End"?buttons.length-1:(i+(e.key==="ArrowRight"?1:-1)+buttons.length)%buttons.length;buttons[next].click();buttons[next].focus();
});
function watchResult(id,placeholder,group){
 const node=$(id),empty=$(placeholder);
 let wasHidden=node.hidden;
 function update(){empty.hidden=!node.hidden;if(wasHidden&&!node.hidden&&active===group)activatePage(group,"output");wasHidden=node.hidden;}
 new MutationObserver(update).observe(node,{attributes:true,attributeFilter:["hidden"]});update();
}
watchResult("results","sepEmpty","separation");
watchResult("ebOutput","ebEmpty","eurobeat");
window.addEventListener("tojo-vocal",()=>{activateTab("eurobeat");activatePage("eurobeat","source");});
activateTab("separation");activatePage("separation","source");activatePage("eurobeat","source");
