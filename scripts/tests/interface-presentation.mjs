// Verify a UI delivery against its pre-change commit. Override PULSE_UI_BASE for future restyles.
// Ignores presentation attributes and utility-class constants; retains handlers, props,
// conditional rendering, routes, data access, validation and state transitions.
import ts from "typescript";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const base=process.env.PULSE_UI_BASE??"12c61a3";
const git=(...args)=>execFileSync("git",args,{encoding:"utf8"});
const files=git("diff",base,"--name-only","--","src").trim().split(/\r?\n/).filter(Boolean);
const forbidden=files.filter(f=>/^src\/(lib|context|data|types)\//.test(f)||f.startsWith("src/app/api/"));
assert.deepEqual(forbidden,[],"UI delivery must not change business/data modules");
const presentation=new Set(["className","style","fill","stroke","stopColor","fontFamily"]);
function normalize(source,file){
 const sf=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const transformed=ts.transform(sf,[context=>{
  const visit=node=>{
   if(ts.isJsxAttribute(node)&&presentation.has(node.name.getText(sf)))return undefined;
   if(ts.isStringLiteral(node)&&/(?:^|\s)(?:bg-|text-|border-|rounded-|h-\d|px-\d|mt-\d|flex\b)/.test(node.text)&&node.text.includes(" ")){
    return ts.factory.createStringLiteral("PRESENTATION_CLASSES");
   }
   if(ts.isJsxText(node)&&/Settings now follow the Harvesters|A clear, consistent workspace with navy/.test(node.text)){
    return ts.factory.createJsxText("Appearance description");
   }
   return ts.visitEachChild(node,visit,context);
  };return n=>ts.visitNode(n,visit);
 }]);
 const output=ts.createPrinter({removeComments:true}).printFile(transformed.transformed[0]);
 transformed.dispose();return output.replaceAll("\r\n","\n");
}
for(const file of files.filter(f=>f.endsWith(".tsx"))){
 const before=git("show",base+":"+file),after=readFileSync(file,"utf8");
 const a=normalize(after,file),b=normalize(before,file);if(a!==b){let i=0;while(a[i]===b[i])i++;throw new Error(file+" differs at "+i+" AFTER "+JSON.stringify(a.slice(i-80,i+180))+" BEFORE "+JSON.stringify(b.slice(i-80,i+180)));}
}
console.log("PASS: "+files.filter(f=>f.endsWith(".tsx")).length+" TSX files preserve non-presentation syntax; no API, data or business modules changed.");
