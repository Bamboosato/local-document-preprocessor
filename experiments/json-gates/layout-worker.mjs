// JSON trees only. No DOM, eval, network, storage or Mermaid interpretation.
self.postMessage({kind:'ready'});
self.onmessage=({data})=>{
  const {generation,graph,blockMilliseconds=0}=data;
  try {
    if(!graph||graph.labels.length<1||graph.labels.length>200||graph.parents.length!==graph.labels.length)throw 0;
    const nodes=[],edges=[];
    for(let i=0;i<graph.labels.length;i++){
      const label=graph.labels[i],parent=graph.parents[i];
      if(typeof label!=='string'||Array.from(label).length>200||!Number.isInteger(parent)||(i===0?parent!==-1:parent<0||parent>=i))throw 0;
      const depth=parent<0?0:nodes[parent].depth+1;
      // Fixed 20-codepoint lines bound dimensions even with emoji or CJK.
      const chars=Array.from(label),lines=[];
      for(let offset=0;offset<chars.length;offset+=20)lines.push(chars.slice(offset,offset+20).join(''));
      nodes.push({id:i,parent,depth,x:depth*370,y:i*270,lines,label});
      if(parent>=0)edges.push([parent,i]);
    }
    // Fault injection: uncooperative synchronous work must really be terminated.
    const end=performance.now()+Math.min(10000,Math.max(0,blockMilliseconds));
    while(performance.now()<end){}
    self.postMessage({kind:'layout',generation,nodes,edges,width:Math.max(...nodes.map(n=>n.x))+350,height:nodes.length*270});
  }catch {self.postMessage({kind:'failed',generation});}
};
