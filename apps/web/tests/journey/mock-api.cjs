const http = require('node:http');
const user = {id:'journey-test', name:'Teste Local', email:'teste@example.invalid', accountType:'INDIVIDUAL',role:'USER',status:'ACTIVE',onboardingCompleted:true,hasPassword:true,verified:false};
http.createServer(async(req,res)=>{
 res.setHeader('Access-Control-Allow-Origin','http://localhost:3100');res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');res.setHeader('Content-Type','application/json');
 if(req.method==='OPTIONS'){res.end();return;}
 let raw='';for await(const chunk of req)raw+=chunk;
 if(req.url==='/auth/register'||req.url==='/auth/login'){res.end(JSON.stringify({token:'local-test-token',user}));return;}
 if(req.url==='/auth/me'){res.end(JSON.stringify(user));return;}
 if(req.url==='/organizations/me'){res.statusCode=404;res.end('{}');return;}
 if(req.url==='/listings'&&req.method==='POST'){res.statusCode=400;res.end(JSON.stringify({error:'Publicação desativada no teste local.'}));return;}
 if(req.url?.includes('unread')){res.end(JSON.stringify({count:0}));return;}
 res.end('[]');
}).listen(4333,'127.0.0.1',()=>console.log('Mock API local em 4333. Publicação desativada.'));
