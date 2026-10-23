import {execFileSync} from 'node:child_process';
console.log('Node',process.version);
if(Number(process.versions.node.split('.')[0])<22)throw new Error('Node 22.19+ required');
try{console.log('Docker Engine',execFileSync('docker',['info','--format','{{.ServerVersion}}'],{encoding:'utf8'}).trim());}catch{console.error('Docker Engine unavailable; start Docker Desktop and check access.');process.exitCode=1;}
