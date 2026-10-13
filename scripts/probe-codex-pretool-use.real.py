import base64, json, os, re, select, shutil, subprocess, tempfile, threading, time
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import sys
if os.environ.get('AGENT_PICKET_CODEX_PRETOOL_NATIVE')!='1':
 print('SKIP: opt in explicitly with AGENT_PICKET_CODEX_PRETOOL_NATIVE=1')
 sys.exit(0)
MODE=os.environ.get('AP_TOOL_MODE','deny')
assert MODE in ('deny','allow','fail','host-disabled')
CODEX=os.environ.get('AGENT_PICKET_CODEX_BIN')
if not CODEX or not os.path.isabs(CODEX):
 raise RuntimeError('Set AGENT_PICKET_CODEX_BIN to the ABSOLUTE official Codex binary')
version=subprocess.check_output([CODEX,'--version'],text=True).strip()
if version!='codex-cli 0.146.1':
 raise RuntimeError('This native contract is pinned to Codex CLI 0.146.1, not '+version)
root=Path(os.path.realpath(tempfile.mkdtemp(prefix='ap-codex-pretool-native-')))
home=root/'home';home.mkdir()
side_effect=root/'synthetic-tool-marker.txt'
requests=[]
class MockAPI(BaseHTTPRequestHandler):
 def do_GET(self):
  b=json.dumps({'object':'list','data':[{'id':'synthetic-model','object':'model','created':0,'owned_by':'test'}]}).encode()
  self.send_response(200);self.send_header('content-type','application/json');self.send_header('content-length',str(len(b)));self.end_headers();self.wfile.write(b)
 def do_POST(self):
  n=int(self.headers.get('content-length','0'));body=json.loads(self.rfile.read(n));requests.append(body)
  if len(requests)==1:
   funcs=[x for x in body.get('tools',[]) if x.get('type')=='function']
   print('FUNCTION_NAMES',[(x.get('name'),x.get('type')) for x in funcs],flush=True)
   target=next((x for x in funcs if x.get('name') in ('exec_command','shell_command')),None)
   if target is None:
    print('ALL_TOOLS',[(x.get('name'),x.get('type')) for x in body.get('tools',[])],flush=True)
    raise RuntimeError('No official shell tool available')
   tool_name=target['name']
   args=({'cmd':"printf 'SYNTHETIC_TOOL_EXECUTED' > "+str(side_effect)} if tool_name=='exec_command'
      else {'command':"printf 'SYNTHETIC_TOOL_EXECUTED' > "+str(side_effect)})
   events=[{'type':'response.output_item.done','item':{'type':'function_call','call_id':'call_ap_official_veto_01','name':tool_name,'arguments':json.dumps(args)}}]
  else:events=[]
  events.append({'type':'response.completed','response':{'id':'resp_'+str(len(requests)),'usage':{'input_tokens':0,'input_tokens_details':None,'output_tokens':0,'output_tokens_details':None,'total_tokens':0}}})
  b=''.join('data: '+json.dumps(ev,separators=(',',':'))+'\n\n' for ev in events).encode()
  self.send_response(200);self.send_header('content-type','text/event-stream');self.send_header('content-length',str(len(b)));self.end_headers();self.wfile.write(b)
 def log_message(self,*a):pass
srv=ThreadingHTTPServer(('127.0.0.1',0),MockAPI)
threading.Thread(target=srv.serve_forever,daemon=True).start()
(home/'config.toml').write_text('\n'.join(['model = "synthetic-model"','approval_policy = "never"','model_provider = "offline"','sandbox_mode = "workspace-write"','[features]','hooks = true','[model_providers.offline]','name = "Synthetic research sink"',f'base_url = "http://127.0.0.1:{srv.server_address[1]}/v1"','wire_api = "responses"','request_max_retries = 0','stream_max_retries = 0'])+'\n')
hook=root/'pretool.mjs'
script="import{readFileSync,writeFileSync}from'node:fs'; const b=JSON.parse(readFileSync(0,'utf8')); writeFileSync("+json.dumps(str(root/'hook-fields.json'))+",JSON.stringify(Object.keys(b).sort().map(k=>[k,typeof b[k]])));"
if MODE=='deny':script+="process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'deny',permissionDecisionReason:'Agent Picket synthetic union tool strike'}}));"
elif MODE=='allow':script+="process.stdout.write('{}');"
else:script+="process.exit(1);"
# Execute the ACTUAL Agent Picket adapter for the deny/allow native proof.
# Simulate command-hook failure only for the separate documented fail-open case.
state=root/'synthetic-union-campaign.json'
now=int(time.time()*1000)
policy={'version':1,'host':'codex','scope':'pending-Bash-tools-only',
 'realStrikeConsent':True,'enabled':MODE!='allow','campaign':{
  'active':True,'startedAtMs':now-1000,'expiresAtMs':now+60000,
  'cause':'collective-vote'}}
state.write_text(json.dumps(policy))
actual_script=(Path(__file__).resolve().parent/'codex-union-pre-tool-hook.mjs').as_uri()
if MODE!='fail':
 script=("import{readFileSync,writeFileSync}from'node:fs';"
  "const b=JSON.parse(readFileSync(0,'utf8'));"
  "writeFileSync("+json.dumps(str(root/'hook-fields.json'))
  +",JSON.stringify(Object.keys(b).sort().map(k=>[k,typeof b[k]])));"
  "await import("+json.dumps(actual_script)+");")
hook.write_text(script)
(home/'hooks.json').write_text(json.dumps({'hooks':{'PreToolUse':[{'matcher':'^Bash$','hooks':[{'type':'command','command':'node '+json.dumps(str(hook))}]}]}}))
env={**os.environ,'AGENT_PICKET_CODEX_UNION_TOOL_STATE_FILE':str(state),'CODEX_HOME':str(home),'CODEX_DISABLE_TELEMETRY':'1','HTTP_PROXY':'','HTTPS_PROXY':'','ALL_PROXY':'','NO_PROXY':'127.0.0.1,localhost'}
proc=None
try:
 proc=subprocess.Popen([CODEX,'app-server'],cwd=root,env=env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
 nextid=0;notice=[]
 def rpc(method,params):
  global nextid
  nextid+=1;id=nextid
  proc.stdin.write(json.dumps({'id':id,'method':method,'params':params})+'\n');proc.stdin.flush()
  until=time.monotonic()+9
  while time.monotonic()<until:
   rr,_,_=select.select([proc.stdout],[],[],max(.01,until-time.monotonic()))
   if not rr:break
   msg=json.loads(proc.stdout.readline())
   if msg.get('id')==id:
    if 'error' in msg:raise RuntimeError(str(msg))
    return msg['result']
   if 'method' in msg:notice.append(msg)
  raise RuntimeError('RPC timeout '+method)
 rpc('initialize',{'clientInfo':{'name':'ap-official-tool-veto','title':'Synthetic test','version':'0.0.0'},'capabilities':{'experimentalApi':True}})
 proc.stdin.write(json.dumps({'method':'initialized','params':{}})+'\n');proc.stdin.flush()
 state=rpc('hooks/list',{'cwds':[str(root)]})
 print('TEST_ONLY_HOOK_SEEN',len(state.get('data',[{}])[0].get('hooks',[])),flush=True)
 selected=state['data'][0]['hooks'][0]
 assert selected['eventName']=='preToolUse' and selected['trustStatus']=='untrusted'
 assert selected['sourcePath']==str(home/'hooks.json')
 rpc('config/batchWrite',{'edits':[{'keyPath':'hooks.state','value':{selected['key']:{'trusted_hash':selected['currentHash']}},'mergeStrategy':'upsert'}],'filePath':None,'expectedVersion':None,'reloadUserConfig':True})
 assert rpc('hooks/list',{'cwds':[str(root)]})['data'][0]['hooks'][0]['trustStatus']=='trusted'
 if MODE=='host-disabled':
  # Host-owned emergency opt-out in test home, while union action remains ON.
  assert policy['enabled'] and policy['realStrikeConsent']
  rpc('config/batchWrite',{'edits':[{'keyPath':'hooks.state',
   'value':{selected['key']:{'trusted_hash':selected['currentHash'],'enabled':False}},
   'mergeStrategy':'upsert'}],'filePath':None,'expectedVersion':None,
   'reloadUserConfig':True})
  after=rpc('hooks/list',{'cwds':[str(root)]})['data'][0]['hooks'][0]
  assert after['enabled'] is False and after['trustStatus']=='trusted'
 t=rpc('thread/start',{'cwd':str(root),'ephemeral':True})
 # No user prompts or real account info logged.
 rpc('turn/start',{'threadId':t['thread']['id'],'input':[{'type':'text','text':'SYNTHETIC_AGENT_PICKET_TEST_TOOL_ONLY'}]})
 until=time.monotonic()+13
 while time.monotonic()<until:
  time.sleep(.2)
  if (root/'hook-fields.json').exists() or len(requests)>1:break
 print('REQUEST_COUNT',len(requests),'HOOK_EXECUTED',(root/'hook-fields.json').exists(),'TOOL_EFFECT_EXISTS',side_effect.exists(),flush=True)
 if (root/'hook-fields.json').exists():print('EVENT_FIELDS',(root/'hook-fields.json').read_text(),flush=True)
 time.sleep(2)
 print('FINAL_REQUESTS',len(requests),'FINAL_SIDE_EFFECT',side_effect.exists(),flush=True)
 if MODE=='host-disabled':
  assert not (root/'hook-fields.json').exists(), 'Officially disabled Hook must NOT fire'
 else:
  assert (root/'hook-fields.json').exists(),'Expected exact Host PreToolUse event'
 assert len(requests)>=2,'Model mock should see tool result in a subsequent Responses request'
 assert side_effect.exists()==(MODE!='deny'),'OFF/FAILED state outcome differs from expected Host behavior'
 if side_effect.exists():assert side_effect.read_text()=='SYNTHETIC_TOOL_EXECUTED'
 print('SYNTHETIC_NATIVE_RESULT',json.dumps({'mode':MODE,
  'official_host':version,'official_hook_name':'Bash',
  'actual_picket_adapter_executed':MODE not in ('fail','host-disabled'),
  'hook_fired':MODE!='host-disabled','tool_executed':side_effect.exists(),
  'model_requests':len(requests),'temporary_workspace_only':True,
  'production_fail_closed_guarantee':False,
  'host_disabled_independent_of_active_union':MODE=='host-disabled'}),flush=True)
 if len(requests)>1:print('SECOND_INPUT_KINDS',[(v.get('type'),v.get('call_id')) for v in requests[1].get('input',[])][-5:],flush=True)
finally:
 if proc and proc.poll() is None:proc.terminate();proc.wait(timeout=3)
 srv.shutdown();srv.server_close()
 shutil.rmtree(root,ignore_errors=True)
