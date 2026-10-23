import test from 'node:test';
import assert from 'node:assert/strict';
import {startDeadline} from './deadline.mjs';

test('G04-D01 late response is rejected even before delayed timer callback runs',async()=>{
  let fired=0;
  const deadline=startDeadline(20,()=>fired++);
  const end=performance.now()+40;
  while(performance.now()<end){}
  assert.equal(fired,0); // The same task has prevented timer delivery.
  assert.equal(deadline.check(),true);
  assert.equal(deadline.check(),true);
  await new Promise(r=>setTimeout(r,50));
  assert.equal(fired,1); // Explicit check and scheduled pulse cannot double-fire.
});
test('G04-D02 cancellation prevents later expiry',async()=>{
  let fired=0;
  const deadline=startDeadline(20,()=>fired++);
  assert.equal(deadline.check(),false);deadline.cancel();
  await new Promise(r=>setTimeout(r,60));
  assert.equal(fired,0);assert.equal(deadline.check(),false);
});
