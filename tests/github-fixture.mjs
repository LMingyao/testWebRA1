import { createHash } from 'node:crypto';
export function gitFixture() {
  const files=new Map(), blobs=new Map(), trees=new Map(), commits=new Map([['initial',{tree:{sha:'initial-tree'},parents:[]}]]);
  trees.set('initial-tree',new Map());
  let head='initial', number=0, failure;
  const sha=bytes=>createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
  const json=(data,status=200)=>Response.json(data,{status});
  return {files,commits,get head(){return head;}, failNext(status){failure=status;},async fetcher(url,options={}) {
    if(failure){const status=failure;failure=undefined;return json({},status);}
    const endpoint=new URL(url).pathname.replace('/repos/LMingyao/testWebRA1/','');
    const body=options.body?JSON.parse(options.body):undefined;
    if(endpoint.startsWith('contents/')) {const item=files.get(endpoint.slice(9));return item?json({sha:item.sha}):json({},404);}
    if(endpoint.startsWith('git/ref/heads/'))return json({object:{sha:head}});
    if(endpoint.startsWith('git/commits/'))return json(commits.get(endpoint.slice(12))||{},200);
    if(endpoint.startsWith('git/trees/'))return json({truncated:false,tree:[...files].map(([path,file])=>({path,type:'blob',sha:file.sha,size:file.bytes.length}))});
    if(endpoint==='git/blobs') {
      const bytes=Buffer.from(body.content,body.encoding==='base64'?'base64':'utf8'), id=sha(bytes);blobs.set(id,bytes);return json({sha:id});
    }
    if(endpoint==='git/trees') {
      const tree=new Map(trees.get(body.base_tree));
      for(const item of body.tree) {
        const bytes=item.sha?blobs.get(item.sha):Buffer.from(item.content);
        tree.set(item.path,{sha:item.sha||sha(bytes),bytes});
      }
      const id=`tree-${++number}`;trees.set(id,tree);return json({sha:id});
    }
    if(endpoint==='git/commits') {const id=`commit-${++number}`;commits.set(id,{...body,tree:{sha:body.tree}});return json({sha:id});}
    if(endpoint.startsWith('git/refs/heads/')) {
      const commit=commits.get(body.sha);
      if(body.force||commit.parents[0]!==head)return json({},409);
      head=body.sha;files.clear();for(const [key,value]of trees.get(commit.tree.sha))files.set(key,value);return json({object:{sha:head}});
    }
    throw new Error(`Unexpected fixture endpoint: ${endpoint}`);
  }};
}
