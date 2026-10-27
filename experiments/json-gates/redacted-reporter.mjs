// Node's default failure reporter can print entire actual/expected documents.
// Keep fixture IDs and failure categories, never their values or error stacks.
export default async function* report(events) {
  let pass=0,fail=0;
  for await(const event of events) {
    if(!['test:pass','test:fail'].includes(event.type))continue;
    const id=/^(?:G\d+|SW|PR|AD|IC)-[A-Z0-9]+/.exec(event.data.name)?.[0]??'setup';
    if(event.type==='test:pass'){pass++;yield `PASS ${id}\n`;}
    else {fail++;yield `FAIL ${id} ${event.data.details?.error?.code??'assertion'}\n`;}
  }
  yield `fixtures=${pass+fail} pass=${pass} fail=${fail}\n`;
}
