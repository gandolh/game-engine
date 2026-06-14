import {PNG} from "pngjs"; import {readFileSync,writeFileSync} from "node:fs";
const src=PNG.sync.read(readFileSync("../../world-preview.png"));
const f=8, dw=Math.floor(src.width/f), dh=Math.floor(src.height/f);
const dst=new PNG({width:dw,height:dh});
for(let y=0;y<dh;y++)for(let x=0;x<dw;x++){const s=((y*f)*src.width+(x*f))*4,d=(y*dw+x)*4;dst.data[d]=src.data[s];dst.data[d+1]=src.data[s+1];dst.data[d+2]=src.data[s+2];dst.data[d+3]=255;}
writeFileSync("/tmp/wp-small.png",PNG.sync.write(dst));
console.log(`${dw}x${dh}`);
