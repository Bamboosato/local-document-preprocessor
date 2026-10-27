import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifySRI,sha256,lockCandidates,attestationClaims} from './distribution-research.mjs';
test('DS-01: archive integrity mismatch cannot be accepted as matching source',()=>{
  const sri='sha512-'+createHash('sha512').update('fixture').digest('base64');
  assert.equal(verifySRI(Buffer.from('fixture'),sri),true);
  assert.throws(()=>verifySRI(Buffer.from('different'),sri),/archive-integrity-mismatch/);
  assert.throws(()=>verifySRI(Buffer.from('fixture'),'sha256-x'),/unsupported-integrity/);
});
test('DS-02: file digest compares exact bytes including line endings',()=>{
  assert.equal(sha256(Buffer.from('fixture')),createHash('sha256').update('fixture').digest('hex'));
  assert.notEqual(sha256(Buffer.from('line\n')),sha256(Buffer.from('line\r\n')));
});
test('DS-03: workspace and multiple registry versions remain separate candidates; malformed source fails',()=>{
  const pkg=version=>`[[package]]\nname = "fixture"\nversion = "${version}"\nsource = "registry+https://github.com/rust-lang/crates.io-index"\nchecksum = "${'a'.repeat(64)}"\n`;
  const text='version = 4\n[[package]]\nname = "workspace"\nversion = "1"\n'+pkg('1')+pkg('2');
  const result=lockCandidates(text);assert.equal(result.workspaceLockPackages,3);assert.equal(result.candidates.length,2);
  assert.throws(()=>lockCandidates(pkg('1')+pkg('1')),/duplicate-lock-candidate/);
  assert.throws(()=>lockCandidates(pkg('1').replace('registry+https://github.com/rust-lang/crates.io-index','git+https://example.invalid')),/unsupported-crate-source/);
  assert.throws(()=>lockCandidates(pkg('1').replace('a'.repeat(64),'bad')),/invalid-lock-candidate/);
  assert.throws(()=>lockCandidates('version = 4\n'),/empty-lock-candidates/);
});
test('DS-04: decoded provenance is explicitly unverified even when it claims an expected source',()=>{
  const payload=Buffer.from(JSON.stringify({predicateType:'fixture',subject:[],predicate:{buildDefinition:{resolvedDependencies:[{digest:{gitCommit:'fixture'}}]}}})).toString('base64');
  const [claim]=attestationClaims({attestations:[{bundle:{dsseEnvelope:{payload}}}]});
  assert.equal(claim.cryptographicVerification,'not-performed');assert.equal(claim.source[0].digest.gitCommit,'fixture');
  assert.deepEqual(attestationClaims({attestations:[]}),[]);
});
