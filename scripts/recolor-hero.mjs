/** Derivative asset under Lottie Simple License; original file is never rewritten. */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const directory=new URL('../frontend/public/animations/',import.meta.url);
const original=readFileSync(new URL('video-explainer.json',directory));
const animation=JSON.parse(original);
const rgb=hex=>hex.match(/[a-f0-9]{2}/gi).map(c=>parseInt(c,16)/255).concat(1);
const matches=(color,target)=>color.length===4&&color.every((v,i)=>Math.abs(v-target[i])<.006);
const swaps=[
 {from:[.2863,.5882,.1843,1],to:'#818CF8',purpose:'shirt/hand shadow accents'},
 {from:[.502,.8275,.3882,1],to:'#67E8F9',purpose:'shirt and pot accents'},
 {from:[.981,.181,.181,1],to:'#818CF8',purpose:'call controls'},
];
let changed=0;
function recolor(node,layer=''){
 if(Array.isArray(node)){node.forEach(value=>recolor(value,layer));return;}
 if(!node||typeof node!=='object')return;
 if(node.ty===4&&node.nm)layer=node.nm;
 if(['fl','st'].includes(node.ty)&&node.c?.a===0&&Array.isArray(node.c.k)){
  const replacement=swaps.find(s=>matches(node.c.k,s.from));
  if(replacement){node.c.k=rgb(replacement.to);changed++;}
  // Environment lines must remain visible against the existing dark hero canvas.
  else if(['Plants Outlines','Table Outlines'].includes(layer)&&matches(node.c.k,[.149,.196,.22,1])){node.c.k=rgb('#A5F3FC');changed++;}
  else if(layer==='Background Complete Outlines'){
   const gray=node.c.k[0];node.c.k=rgb(gray>.95?'#141416':gray>.9?'#2A2A2E':'#52525B');changed++;
  }
 }
 Object.values(node).forEach(value=>recolor(value,layer));
}
recolor(animation);
const adapted=JSON.stringify(animation);
writeFileSync(new URL('video-explainer-aptlyra.json',directory),adapted+'\n');
console.log(JSON.stringify({sourceSHA256:createHash('sha256').update(original).digest('hex'),adaptedSHA256:createHash('sha256').update(adapted+'\n').digest('hex'),paintPropertiesChanged:changed,bytes:Buffer.byteLength(adapted+'\n')}));
