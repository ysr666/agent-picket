"""Native Claude Code 2.1.295 PreToolUse/Bash labor-action contract.

RESEARCH ONLY. Explicit opt-in AGENT_PICKET_CLAUDE_PRETOOL_NATIVE=1 and an
absolute, pinned official CLAUDE_CODE_BIN; NO cloud models, real auth, user
profiles, actual prompts, Host writes or file access outside disposable dirs.
Modes: deny, off, crash, crash-block, host-disabled.
"""
import os,json,subprocess,threading,tempfile,shutil,time,sys
from importlib.util import find_spec
from pathlib import Path
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler

if os.environ.get('AGENT_PICKET_CLAUDE_PRETOOL_NATIVE')!='1':
 print('SKIP: set AGENT_PICKET_CLAUDE_PRETOOL_NATIVE=1 for a native opt-in test')
 sys.exit(0)
MODE=os.environ.get('AP_CLAUDE_MODE','deny')
assert MODE in ('deny','off','crash','crash-block','host-disabled')
CODEX='unused'
CLAUDE=os.environ.get('CLAUDE_CODE_BIN','')
if not CLAUDE or not os.path.isabs(CLAUDE):
 raise RuntimeError('CLAUDE_CODE_BIN must be the absolute path to verified official Claude Code')
version=subprocess.check_output([CLAUDE,'--version'],text=True).strip()
if version!='2.1.295 (Claude Code)':
 raise RuntimeError('Pinned research test requires Claude Code 2.1.295; got '+version)
root=Path(tempfile.mkdtemp(prefix='ap-claude-host-native-')).resolve()
marker=root/'synthetic-shell-marker'
settings=root/'settings.json'
state=root/'union-test-only.json'
config=root/'claude-home';config.mkdir()
wrapper=root/'hook.mjs';fired=root/'hook-fired.json'
call_log=[]
class Offline(BaseHTTPRequestHandler):
 def do_POST(self):
  n=int(self.headers.get('content-length',0)); data=json.loads(self.rfile.read(n))
  call_log.append({'path':self.path,'message_count':len(data.get('messages',[])),'stream':data.get('stream')})
  # Only synthetic model input processed; no request body is logged.
  index=len(call_log)
  model=data.get('model','claude-sonnet-4-5-20250929')
  if index==1:
   ev=[('message_start',{'type':'message_start','message':{'id':'msg_ap_01','type':'message','role':'assistant','content':[],'model':model,'stop_reason':None,'stop_sequence':None,'usage':{'input_tokens':4,'output_tokens':0}}}),('content_block_start',{'type':'content_block_start','index':0,'content_block':{'type':'tool_use','id':'toolu_ap_01','name':'Bash','input':{}}}),('content_block_delta',{'type':'content_block_delta','index':0,'delta':{'type':'input_json_delta','partial_json':json.dumps({'command':"printf 'CLAUDE_SYNTHETIC_TOOL_RAN' > "+str(marker)})}}),('content_block_stop',{'type':'content_block_stop','index':0}),('message_delta',{'type':'message_delta','delta':{'stop_reason':'tool_use','stop_sequence':None},'usage':{'output_tokens':8}}),('message_stop',{'type':'message_stop'})]
  else:
   ev=[('message_start',{'type':'message_start','message':{'id':'msg_ap_final','type':'message','role':'assistant','content':[],'model':model,'stop_reason':None,'stop_sequence':None,'usage':{'input_tokens':7,'output_tokens':0}}}),('content_block_start',{'type':'content_block_start','index':0,'content_block':{'type':'text','text':''}}),('content_block_delta',{'type':'content_block_delta','index':0,'delta':{'type':'text_delta','text':'SYNTHETIC_END'}}),('content_block_stop',{'type':'content_block_stop','index':0}),('message_delta',{'type':'message_delta','delta':{'stop_reason':'end_turn','stop_sequence':None},'usage':{'output_tokens':2}}),('message_stop',{'type':'message_stop'})]
  payload=''.join('event: '+name+'\ndata: '+json.dumps(obj,separators=(',',':'))+'\n\n' for name,obj in ev).encode()
  self.send_response(200);self.send_header('content-type','text/event-stream');self.send_header('content-length',str(len(payload)));self.end_headers();self.wfile.write(payload);self.wfile.flush()
 def do_GET(self):
  self.send_response(404);self.end_headers()
 def log_message(self,*a):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Offline)
threading.Thread(target=server.serve_forever,daemon=True).start()
# A generated campaign is merely a synthetic test fixture, NOT real consent.
now=int(time.time()*1000)
policy={'version':1,'host':'claude-code',
 'scope':'pending-Claude-Bash-tools-only','realStrikeConsent':True,
 'enabled':MODE!='off','campaign':{'active':True,
 'startedAtMs':now-1000,'expiresAtMs':now+60000,
 'cause':'collective-vote'}}
state.write_text(json.dumps(policy));state.chmod(0o600)
actual_hook=(Path(__file__).resolve().parent/'claude-union-pre-tool-hook.mjs').as_uri()
if MODE in ('crash','crash-block'):
 script="import{writeFileSync}from'node:fs';writeFileSync("+json.dumps(str(fired))+",'called');process.exit(17);"
else:
 script="import{writeFileSync}from'node:fs';writeFileSync("+json.dumps(str(fired))+",'called');await import("+json.dumps(actual_hook)+");"
wrapper.write_text(script)
node=os.environ.get('CLAUDE_NODE_BIN','')
if not os.path.isabs(node):raise RuntimeError('CLAUDE_NODE_BIN required as absolute node binary')
settings.write_text(json.dumps({'disableAllHooks':MODE=='host-disabled',
 'permissions':{'allow':['Bash(*)']},'hooks':{'PreToolUse':[
  {'matcher':'Bash','hooks':[{'type':'command',
    'command':node+' --experimental-strip-types '+str(wrapper),
    'timeout':10,**({'onFailure':'block'} if MODE=='crash-block' else {})}]}]}}))
env={**os.environ,'AGENT_PICKET_CLAUDE_TOOL_STATE_FILE':str(state),'CLAUDE_CONFIG_DIR':str(config),'ANTHROPIC_API_KEY':'synthetic-no-cloud-key','ANTHROPIC_BASE_URL':'http://127.0.0.1:'+str(server.server_address[1]),'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC':'1','CLAUDE_CODE_SKIP_UPDATE_CHECK':'1','HTTP_PROXY':'http://127.0.0.1:9','HTTPS_PROXY':'http://127.0.0.1:9','ALL_PROXY':'http://127.0.0.1:9','NO_PROXY':'127.0.0.1,localhost'}
try:
 p=subprocess.run([CLAUDE,'-p','--settings',str(settings),'--no-session-persistence','--output-format','json','--model','claude-sonnet-4-5','--allowedTools=Bash','SYNTHETIC_REQUEST_TOOL_ONLY_NO_REAL_MODEL'],cwd=root,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,stdin=subprocess.DEVNULL,timeout=23)
 assert p.returncode==0, 'Synthetic Claude run failed with exit '+str(p.returncode)
 assert len(call_log)==2,'Mock model expected one Bash request plus one result'
 assert fired.exists()==(MODE!='host-disabled'), 'Native Hook callback coverage mismatch'
 blocked=MODE in ('deny','crash-block')
 assert marker.exists()==(not blocked), 'Actual shell effect inconsistent with Hook mode'
 if marker.exists():
  assert marker.read_text()=='CLAUDE_SYNTHETIC_TOOL_RAN'
 result=json.loads(p.stdout)
 assert result.get('type')=='result' and result.get('is_error') is False
 assert result.get('num_turns')==2
 print('CLAUDE_OFFICIAL_TOOL_RESULT',json.dumps({'mode':MODE,'version':version,
  'native_hook_called':fired.exists(),'shell_tool_executed':marker.exists(),
  'model_calls':len(call_log),'failure_is_blocking':MODE=='crash-block',
  'independent_host_disable':MODE=='host-disabled',
  'local_provider_only':True,'real_user_consent':False,
  'production_eligible':False}),flush=True)
finally:
 server.shutdown();server.server_close();shutil.rmtree(root,ignore_errors=True)
