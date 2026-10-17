"""Research ONLY: native interactive Codex TUI Bash PreToolUse proof.

Run with AGENT_PICKET_CODEX_PRETOOL_TUI_NATIVE=1,
AGENT_PICKET_CODEX_BIN=<absolute official pinned binary>, AP_TOOL_MODE=deny|allow|fail.
Creates and destroys disposable CODEX_HOME, workspace, simulated union and localhost
fake model. No real user data, no automatic Host trust, no cloud inference.
"""
import json, os, select, shutil, subprocess, tempfile, threading, time, sys
try:
 import pexpect
except ImportError:
 print('SKIP: requires pexpect for an actual terminal')
 sys.exit(0)
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import sys
if os.environ.get('AGENT_PICKET_CODEX_PRETOOL_TUI_NATIVE')!='1':
 print('SKIP: opt in explicitly with AGENT_PICKET_CODEX_PRETOOL_TUI_NATIVE=1')
 sys.exit(0)
MODE=os.environ.get('AP_TOOL_MODE','deny')
assert MODE in ('deny','allow','fail')
CODEX=os.environ.get('AGENT_PICKET_CODEX_BIN')
if not CODEX or not os.path.isabs(CODEX):
 raise RuntimeError('Set AGENT_PICKET_CODEX_BIN to the ABSOLUTE official Codex binary')
version=subprocess.check_output([CODEX,'--version'],text=True).strip()
if version!='codex-cli 0.146.1':
 raise RuntimeError('This native contract is pinned to Codex CLI 0.146.1, not '+version)
def screen(text):
 import unicodedata
 g=[[' ']*110 for _ in range(38)]; r=0;c=0;i=0
 def put(ch):
  nonlocal r,c
  if ch=='\n':r=min(37,r+1);c=0;return
  if ch=='\r':c=0;return
  if ch=='\b':c=max(c-1,0);return
  if ch in ('\t',):c=min(109,c+4);return
  if ord(ch)<32:return
  if 0<=r<38 and 0<=c<110:g[r][c]=ch
  c=min(109,c+2 if unicodedata.east_asian_width(ch) in ('W','F') else c+1)
 while i<len(text):
  x=text[i]
  if x=='\x1b':
   if i+1<len(text) and text[i+1]=='[':
    j=i+2
    while j<len(text) and not ('@'<=text[j]<='~'):j+=1
    if j>=len(text):break
    param=text[i+2:j];cmd=text[j]
    args=[int(t or 0) for t in param.split(';') if t.isdigit() or t=='']
    if cmd in ('H','f'):
     r=max(0,min(37,(args[0] if args and args[0] else 1)-1));c=max(0,min(109,(args[1] if len(args)>1 and args[1] else 1)-1))
    if cmd=='J':
     if not args or args[0] in (0,2):g=[[' ']*110 for _ in range(38)]
    if cmd=='K':
     for k in range(c,110):g[r][k]=' '
    i=j+1;continue
   if i+1<len(text) and text[i+1]==']':
    j=text.find('\x07',i+2); k=text.find('\x1b\\',i+2)
    if j==-1:j=10**9
    if k==-1:k=10**9
    i=min(j+1,k+2);continue
   i+=2;continue
  put(x);i+=1
 return '\n'.join(str(j+1).rjust(2)+' '+''.join(row).rstrip() for j,row in enumerate(g) if ''.join(row).strip())


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
   # Do not print model/provider request bodies or user prompts.
   target=next((x for x in funcs if x.get('name') in ('exec_command','shell_command')),None)
   if target is None:
    # Test will fail if there is no official shell tool.
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
# Explicitly synthetic Hook; records event KEY/TYPES only, not command input.
script=("import{readFileSync,writeFileSync}from'node:fs';"
 "const b=JSON.parse(readFileSync(0,'utf8'));writeFileSync("
 +json.dumps(str(root/'hook-fields.json'))
 +",JSON.stringify(Object.keys(b).sort().map(k=>[k,typeof b[k]])));"
 +"process.exit(1);")
# Execute the ACTUAL Agent Picket adapter for the deny/allow native proof.
# Simulate command-hook failure only for the separate documented fail-open case.
state=root/'synthetic-union-campaign.json'
now=int(time.time()*1000)
policy={'version':1,'host':'codex','scope':'pending-Bash-tools-only',
 'realStrikeConsent':True,'enabled':MODE=='deny','campaign':{
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
env={**os.environ,'AGENT_PICKET_CODEX_UNION_TOOL_STATE_FILE':str(state),'CODEX_HOME':str(home),'CODEX_DISABLE_TELEMETRY':'1','CODEX_APP_SERVER_DISABLE_MANAGED_CONFIG':'1','TERM':'xterm-256color','HTTP_PROXY':'','HTTPS_PROXY':'','ALL_PROXY':'','NO_PROXY':'127.0.0.1,localhost'}
proc=None;tui=None
try:
 proc=subprocess.Popen([CODEX,'app-server'],cwd=root,env=env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
 nextid=0
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
   # No user-owned process or account notifications to persist.
  raise RuntimeError('RPC timeout '+method)
 rpc('initialize',{'clientInfo':{'name':'ap-official-tool-veto','title':'Synthetic test','version':'0.0.0'},'capabilities':{'experimentalApi':True}})
 proc.stdin.write(json.dumps({'method':'initialized','params':{}})+'\n');proc.stdin.flush()
 state=rpc('hooks/list',{'cwds':[str(root)]})
 assert len(state.get('data',[{}])[0].get('hooks',[]))==1
 selected=state['data'][0]['hooks'][0]
 assert selected['eventName']=='preToolUse' and selected['trustStatus']=='untrusted'
 assert selected['sourcePath']==str(home/'hooks.json')
 rpc('config/batchWrite',{'edits':[{'keyPath':'hooks.state','value':{selected['key']:{'trusted_hash':selected['currentHash']}},'mergeStrategy':'upsert'}],'filePath':None,'expectedVersion':None,'reloadUserConfig':True})
 assert rpc('hooks/list',{'cwds':[str(root)]})['data'][0]['hooks'][0]['trustStatus']=='trusted'
 proc.terminate();proc.wait(timeout=3);proc=None
 tui=pexpect.spawn(CODEX,['-C',str(root)],cwd=str(root),env=env,
  encoding='utf-8',timeout=8,dimensions=(38,110))
 raw=[]
 def grab(seconds):
  end=time.time()+seconds
  while time.time()<end:
   try:raw.append(tui.read_nonblocking(5000,timeout=.15))
   except pexpect.TIMEOUT:pass
   except pexpect.EOF:break
 grab(2)
 plain=screen(''.join(raw))
 if 'Do you trust the contents of this directory?' not in plain:
  raise RuntimeError('Cannot safely approve non-test directory')
 tui.send('\r');grab(1.5)
 tui.send('SYNTHETIC_AGENT_PICKET_PRETOOL_CLI_TEST');grab(.4)
 tui.send('\r');grab(6)
 deadline=time.time()+9
 while time.time()<deadline and (len(requests)<2):grab(.25)
 # The genuine TUI, not App-Server RPC, must visibly report the denial.
 if MODE=='deny':
  assert 'PreToolUse hook (blocked)' in ''.join(raw)
  assert 'Agent Picket AI union:' in ''.join(raw)
 assert len(requests)>=2,'TUI did not reach the offline model feedback loop'
 assert (root/'hook-fields.json').exists(),'Official Bash PreToolUse not observed'
 assert side_effect.exists()==(MODE!='deny'), 'Native interactive TUI shell outcome unexpected'
 if side_effect.exists():
  assert side_effect.read_text()=='SYNTHETIC_TOOL_EXECUTED'
 print('NATIVE_INTERACTIVE_RESULT',json.dumps({'mode':MODE,'host':version,
  'tool_executed':side_effect.exists(),'official_hook_fired':True,
  'visible_union_denial':MODE=='deny',
  'failed_hook_fails_open':MODE=='fail',
  'model_requests':len(requests),
  'official_workspace_trust':'disposable-test-only',
  'release_eligible':False}),flush=True)
 tui.terminate(force=True);tui=None

finally:
 if tui and tui.isalive():tui.terminate(force=True)
 if proc and proc.poll() is None:proc.terminate();proc.wait(timeout=3)
 srv.shutdown();srv.server_close()
 shutil.rmtree(root,ignore_errors=True)
